import { DAY, pickShard, utcDay, writeRange } from '@misomoon/core'
import { getRanges, getShards, invalidate, leaveShard, purge, shardDb, shardLimit, siteShards, TTL } from './control'

/**
 * Empties shards marked `retiring` so they can be unbound (scripts/deploy.ts does that
 * once a shard holds no ranges). Each site's open range is closed off the shard first;
 * then every closed range is copied whole to another shard, the routing table is
 * switched, and the old copy is deleted. A range moves as a unit, so unique counts
 * stay additive, and the work resumes across cron runs from `shard_moves`. Writes into a
 * range wait while it moves (checkNotMoving in control.ts), and a move copies nothing
 * on the run that creates it, so every isolate knows of it before the copy starts.
 */

// D1 queries per cron run. A scheduled run may send 1,000 in all, and the alerts,
// imports, sample site and hourly maintenance share them. A 250-row chunk costs three
// (read, write, cursor).
const BUDGET = 400
const CHUNK = 250
// rows one purge statement deletes (control.ts purge)
const PURGE_CHUNK = 5000
// Ranges closed this recently may still get late events; leave them a little longer.
const SETTLE_DAYS = 2

const TABLES = {
	events: { time: 'ts', key: ['ts', 'event_id'], id: 'rowid' },
	// in started_at order, so sessions_site_started finds each chunk
	sessions: { time: 'started_at', key: ['started_at', 'session_id'], id: 'site_id, session_id' },
	imported: { time: 'ts', key: ['dim', 'ts', 'key', 'import_id'], id: 'site_id, dim, ts, key, import_id' },
} as const
type Table = keyof typeof TABLES
const STAGES = ['events', 'sessions', 'imported', 'switch', 'purge'] as const
type Stage = (typeof STAGES)[number]

interface Move {
	site_id: string
	from_day: number
	to_day: number
	from_shard: string
	to_shard: string
	stage: Stage
	cursor: string | null
	switched_at: number | null
}

export async function retireShards(env: Env) {
	const retiring = (await getShards(env)).filter((s) => s.status === 'retiring').map((s) => s.name)
	// a shard brought back to active (scripts/deploy.ts) still finishes the moves it started
	const { results } = await env.CONTROL.prepare('SELECT DISTINCT from_shard FROM shard_moves').all<{ from_shard: string }>()
	const started = results.map((r) => r.from_shard).filter((s) => !retiring.includes(s))
	let budget = BUDGET - 2
	for (const name of [...retiring, ...started]) {
		// one shard that can't move (no shard left in its region) must not stop the others
		try {
			budget = await retireShard(env, name, budget, retiring.includes(name))
		} catch (e) {
			console.error(JSON.stringify({ msg: 'shard retire failed', shard: name, error: String(e) }))
		}
		if (budget <= 0) return
	}
}

/**
 * One shard's turn: a retiring shard closes its open ranges and moves its closed ones;
 * another only finishes the moves under way. Returns the query budget left.
 */
async function retireShard(env: Env, name: string, budget: number, retiring: boolean): Promise<number> {
	if (retiring) {
		const { results: open } = await env.CONTROL.prepare('SELECT site_id, from_day FROM shard_map WHERE shard = ? AND to_day IS NULL').bind(name).all<{ site_id: string; from_day: number }>()
		budget--
		for (const r of open) {
			await leaveShard(env, r.site_id, name, r.from_day)
			budget -= 2
			if (budget <= 0) return budget
		}
	}

	// Moves already under way first (a switched one no longer shows in shard_map), then
	// closed ranges that have settled.
	const settled = utcDay(Date.now()) - SETTLE_DAYS
	const query = retiring
		? env.CONTROL.prepare(
				`SELECT site_id, from_day, to_day FROM shard_moves WHERE from_shard = ?1
				UNION SELECT site_id, from_day, to_day FROM shard_map WHERE shard = ?1 AND to_day IS NOT NULL AND to_day < ?2
				ORDER BY site_id, from_day`,
			).bind(name, settled)
		: env.CONTROL.prepare('SELECT site_id, from_day, to_day FROM shard_moves WHERE from_shard = ? ORDER BY site_id, from_day').bind(name)
	const { results: ranges } = await query.all<{ site_id: string; from_day: number; to_day: number }>()
	budget--
	for (const r of ranges) {
		// a range that can't move is logged and skipped, so the ranges after it still move
		try {
			budget = await moveRange(env, r, name, budget)
		} catch (e) {
			console.error(JSON.stringify({ msg: 'range move failed', shard: name, site: r.site_id, from_day: r.from_day, error: String(e) }))
		}
		if (budget <= 0) return budget
	}
	if (!retiring) return budget
	const left = await env.CONTROL.prepare('SELECT (SELECT COUNT(*) FROM shard_map WHERE shard = ?1) + (SELECT COUNT(*) FROM shard_moves WHERE from_shard = ?1) AS n')
		.bind(name)
		.first<number>('n')
	if (!left) console.log(JSON.stringify({ msg: 'shard retired, safe to unbind', shard: name }))
	return budget - 1
}

async function moveRange(env: Env, r: { site_id: string; from_day: number; to_day: number }, from: string, budget: number): Promise<number> {
	let move: Move | null = await env.CONTROL.prepare('SELECT * FROM shard_moves WHERE site_id = ? AND from_day = ?').bind(r.site_id, r.from_day).first<Move>()
	budget--
	if (!move) {
		// Prefer the shard the site writes to now, so its data ends up together.
		const shards = (await siteShards(env, r.site_id)).filter((s) => s.placeable)
		const now = writeRange(await getRanges(env, r.site_id), utcDay(Date.now()))?.shard
		const to = now && shards.find((s) => s.name === now)?.status === 'active' ? now : pickShard(r.site_id, shards, shardLimit(env))
		// Another run may have started this move since the read above; then its row wins.
		// Copying starts on the next run, once every isolate refuses writes into the range.
		await env.CONTROL.prepare("INSERT OR IGNORE INTO shard_moves (site_id, from_day, to_day, from_shard, to_shard, stage) VALUES (?, ?, ?, ?, ?, 'events')")
			.bind(r.site_id, r.from_day, r.to_day, from, to)
			.run()
		invalidate(`moves:${r.site_id}`)
		return budget - 3
	}
	const src = await shardDb(env, move.from_shard)
	const dst = await shardDb(env, move.to_shard)
	const span = [r.site_id, r.from_day * DAY, (r.to_day + 1) * DAY]
	const save = (stage: Stage, cursor: unknown[] | null, extra = '') =>
		env.CONTROL.prepare(`UPDATE shard_moves SET stage = ?, cursor = ?${extra} WHERE site_id = ? AND from_day = ?`)
			.bind(stage, cursor && JSON.stringify(cursor), r.site_id, r.from_day)
			.run()

	while (budget > 0) {
		const stage: Stage = move.stage
		if (stage === 'switch') {
			// Only this range's row, and only while it still points at the old shard.
			await env.CONTROL.batch([
				env.CONTROL.prepare('UPDATE shard_map SET shard = ? WHERE site_id = ? AND from_day = ? AND shard = ?').bind(move.to_shard, r.site_id, r.from_day, move.from_shard),
				env.CONTROL.prepare("UPDATE shard_moves SET stage = 'purge', cursor = NULL, switched_at = ? WHERE site_id = ? AND from_day = ?").bind(Date.now(), r.site_id, r.from_day),
			])
			invalidate(`ranges:${r.site_id}`)
			return budget - 1
		}
		if (stage === 'purge') {
			// Isolates may route by the old map for one cache lifetime; keep the old copy until then.
			if (Date.now() - (move.switched_at ?? 0) < TTL * 2) return budget
			for (const t of Object.keys(TABLES) as Table[]) {
				const { time, id } = TABLES[t]
				const res = await purge(src, t, id, `site_id = ? AND ${time} >= ? AND ${time} < ?`, span, budget * PURGE_CHUNK, PURGE_CHUNK)
				budget -= Math.floor(res.deleted / PURGE_CHUNK) + 1
				if (!res.done || budget <= 0) return budget
			}
			await env.CONTROL.prepare('DELETE FROM shard_moves WHERE site_id = ? AND from_day = ?').bind(r.site_id, r.from_day).run()
			invalidate(`moves:${r.site_id}`)
			budget--
			console.log(JSON.stringify({ msg: 'range moved', site: r.site_id, from_day: r.from_day, to_day: r.to_day, from: move.from_shard, to: move.to_shard }))
			return budget
		}
		const { time, key }: { time: string; key: readonly string[] } = TABLES[stage]
		const cursor: unknown[] | null = move.cursor ? (JSON.parse(move.cursor) as unknown[]) : null
		const keys = key.join(', ')
		const after: string = cursor ? ` AND (${keys}) > (${key.map(() => '?').join(', ')})` : ''
		const { results: rows }: { results: Record<string, unknown>[] } = await src
			.prepare(`SELECT * FROM ${stage} WHERE site_id = ? AND ${time} >= ? AND ${time} < ?${after} ORDER BY ${keys} LIMIT ${CHUNK}`)
			.bind(...span, ...(cursor ?? []))
			.all<Record<string, unknown>>()
		if (rows.length) {
			const cols = Object.keys(rows[0])
			const insert = `INSERT OR IGNORE INTO ${stage} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
			await dst.batch(rows.map((row) => dst.prepare(insert).bind(...cols.map((c) => row[c]))))
		}
		budget -= 3
		const last = rows.at(-1)
		const next: Stage = rows.length < CHUNK ? STAGES[STAGES.indexOf(stage) + 1] : stage
		const nextCursor: unknown[] | null = next === stage && last ? key.map((k) => last[k]) : null
		await save(next, nextCursor)
		move = { ...move, stage: next, cursor: nextCursor && JSON.stringify(nextCursor) }
	}
	return budget
}

/** Both shards of each move under way: either can hold a copy of the site's data, for deleting a site. */
export async function moveTargets(env: Env, siteId: string): Promise<string[]> {
	const { results } = await env.CONTROL.prepare('SELECT from_shard, to_shard FROM shard_moves WHERE site_id = ?').bind(siteId).all<{ from_shard: string; to_shard: string }>()
	return [...new Set(results.flatMap((r) => [r.from_shard, r.to_shard]))]
}

/** True while some of the site's history is being moved between shards. */
export async function moving(env: Env, siteId: string): Promise<boolean> {
	return !!(await env.CONTROL.prepare('SELECT 1 FROM shard_moves WHERE site_id = ? LIMIT 1').bind(siteId).first())
}
