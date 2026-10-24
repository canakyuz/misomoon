import { assignSessions, renderNotice, utcDay, type EventRow, type OpenSession } from '@misomoon/core'
import { cached, getSite, invalidate, type Site } from './control'
import { takesPayments } from './revenue'
import { sendEmail } from './reports'

/**
 * The daily ingest cap. Usage is counted per site and UTC day in CONTROL `usage_daily`
 * from the rows a shard actually inserted, and the cap is applied where the cost is:
 * in writeEvents (Budget), before anything reaches a shard. The edge also drops beacons once a
 * day is full, through the isolate cache, so a flood stops costing queue operations
 * within a minute. Room under the cap is taken in one statement, so consumers running at
 * once never store more than the cap between them. A failure can leave `stored` above what
 * the shard has, so the day stores a little less; never more, except the ref-only beacons
 * of a full day (see Budget.plan).
 */

/** Most events `site` may store per UTC day: its own ingest_cap, else INGEST_DAILY_CAP. null: no cap. */
export function dailyCap(env: Env, site: Pick<Site, 'ingest_cap'>): number | null {
	if (site.ingest_cap != null) return site.ingest_cap
	const n = Number(env.INGEST_DAILY_CAP)
	return env.INGEST_DAILY_CAP && Number.isInteger(n) && n > 0 ? n : null
}

const storedOn = (env: Env, siteId: string, day: number) =>
	cached(`usage:${siteId}:${day}`, async () => (await env.CONTROL.prepare('SELECT stored FROM usage_daily WHERE site_id = ? AND day = ?').bind(siteId, day).first<number>('stored')) ?? 0)

/** Whether the edge drops a beacon for `site` at `ts`: the site is blocked, or that day is full. */
export async function overCap(env: Env, site: Site, ts: number): Promise<boolean> {
	const cap = dailyCap(env, site)
	if (cap === null) return false
	return cap === 0 || (await storedOn(env, site.id, utcDay(ts))) >= cap
}

const key = (siteId: string, day: number) => `${siteId}\u0000${day}`
const unkey = (k: string) => {
	const [siteId, day] = k.split('\u0000')
	return { siteId, day: Number(day) }
}

export interface Drops {
	/** events dropped per site and day */
	counts: Map<string, number>
	/** the cap each capped site had */
	caps: Map<string, number>
}

/**
 * The cap, applied for one queue batch. It applies to what a shard would actually store:
 * the rows assignSessions keeps (an engagement beacon adds to its pageview's row and keeps
 * none), less the events the shard has already (a retried batch). Those take no room and
 * are not counted as dropped. Room is taken by adding it to the day's `stored` in one statement
 * per site and day, so two consumers running at once can't both take the last of it, and
 * the part a write didn't use is given back after it. A consumer that can't give it back
 * leaves `stored` too high, never too low: the day stores less, never more than its cap.
 */
export class Budget {
	readonly drops: Drops = { counts: new Map(), caps: new Map() }

	/** Reads the cap of every site in `rows`. */
	static async load(env: Env, rows: EventRow[]): Promise<Budget> {
		const budget = new Budget()
		for (const siteId of new Set(rows.map((r) => r.site_id))) {
			const site = await getSite(env, siteId)
			const cap = site ? dailyCap(env, site) : null
			if (cap !== null) budget.drops.caps.set(siteId, cap)
		}
		return budget
	}

	/**
	 * assignSessions for one shard group, within the cap. A trial run on copies finds the
	 * rows the shard would store, room is taken for them, the latest past the room are
	 * dropped, and the rest run again for real, so no visit is built on a dropped event.
	 * `taken` is the room taken per day, counted in `stored` already; Tally.flush gives back
	 * what the write didn't use. `paidRefs` are the ids of the ref-only beacons that got room.
	 */
	async plan(env: Env, db: D1Database, siteId: string, events: EventRow[], open: OpenSession[]): Promise<ReturnType<typeof assignSessions> & { taken: Map<number, number>; paidRefs: Set<string> }> {
		const cap = this.drops.caps.get(siteId)
		if (cap === undefined) return { ...assignSessions(events, open), taken: new Map(), paidRefs: new Set() }
		const copies = new Map(events.map((e) => [{ ...e }, e] as const))
		const trial = assignSessions([...copies.keys()], open.map((s) => ({ ...s })))
		const onShard = await storedIds(db, trial.rows.map((r) => r.event_id))
		// A ref-only beacon stores no event, but the refs it keeps are a row too, unless a
		// try of this batch counted it already. It takes room when there is some, and is
		// kept either way, so the payment keeps its visit.
		const refRows = trial.refs.filter((r) => r.ref_only)
		const counted = refRows.length && (await takesPayments(env, siteId)) ? await countedRefs(env, refRows.map((r) => r.event_id)) : null
		const refIds = new Set(counted ? refRows.filter((r) => !counted.has(r.event_id)).map((r) => r.event_id) : [])
		const candidates = [...trial.rows.filter((r) => !onShard.has(r.event_id)), ...refRows.filter((r) => refIds.has(r.event_id))].sort((a, b) => a.ts - b.ts)
		const perDay = new Map<number, number>()
		const unique = new Set<string>()
		for (const r of candidates) {
			if (unique.has(r.event_id)) continue
			unique.add(r.event_id)
			perDay.set(utcDay(r.ts), (perDay.get(utcDay(r.ts)) ?? 0) + 1)
		}
		const room = await takeRoom(env, siteId, cap, perDay)
		const taken = new Map(room)
		// event id → kept; a second row with the id is the same event and follows the first
		const kept = new Map<string, boolean>()
		const over = new Set<EventRow>()
		const paidRefs = new Set<string>()
		for (const r of candidates) {
			const first = kept.get(r.event_id)
			if (first !== undefined) {
				if (!first) over.add(copies.get(r)!)
				continue
			}
			const day = utcDay(r.ts)
			const left = room.get(day) ?? 0
			kept.set(r.event_id, left > 0)
			if (left > 0) {
				room.set(day, left - 1)
				if (r.ref_only) {
					// used up now: the shard inserts no event for it, so the settle mustn't give it back
					paidRefs.add(r.event_id)
					taken.set(day, taken.get(day)! - 1)
				}
			} else if (!r.ref_only) {
				over.add(copies.get(r)!)
				const k = key(siteId, day)
				this.drops.counts.set(k, (this.drops.counts.get(k) ?? 0) + 1)
			}
		}
		return { ...(over.size ? assignSessions(events.filter((e) => !over.has(e)), open) : trial), taken, paidRefs }
	}
}

/**
 * Takes up to `perDay` rows of room under `cap` for each day, adding them to `stored` in
 * one statement per day, so the room two consumers get never adds up to more than there
 * is. Every SET reads the row as it was, so `last_grant` is the room this one took.
 */
async function takeRoom(env: Env, siteId: string, cap: number, perDay: Map<number, number>): Promise<Map<number, number>> {
	const days = [...perDay]
	if (!days.length) return new Map()
	const stmt = env.CONTROL.prepare(
		`INSERT INTO usage_daily (site_id, day, stored, last_grant) SELECT ?, ?, MIN(?, ?), MIN(?, ?) WHERE EXISTS (SELECT 1 FROM sites WHERE id = ?)
		ON CONFLICT (site_id, day) DO UPDATE SET last_grant = MIN(excluded.last_grant, MAX(0, ? - stored)), stored = stored + MIN(excluded.last_grant, MAX(0, ? - stored))
		RETURNING last_grant`,
	)
	const res = await env.CONTROL.batch<{ last_grant: number }>(days.map(([day, n]) => stmt.bind(siteId, day, n, cap, n, cap, siteId, cap, cap)))
	return new Map(days.map(([day], i) => [day, res[i].results[0]?.last_grant ?? 0]))
}

/** The ref-only beacons in `ids` that were counted already. */
async function countedRefs(env: Env, ids: string[]): Promise<Set<string>> {
	const found = new Set<string>()
	for (let i = 0; i < ids.length; i += 90) {
		const chunk = ids.slice(i, i + 90)
		const { results } = await env.CONTROL.prepare(`SELECT event_id FROM usage_refs WHERE event_id IN (${chunk.map(() => '?').join(', ')})`).bind(...chunk).all<{ event_id: string }>()
		for (const r of results) found.add(r.event_id)
	}
	return found
}

/** The ids in `ids` that the shard has stored already. */
async function storedIds(db: D1Database, ids: string[]): Promise<Set<string>> {
	const found = new Set<string>()
	// D1 binds at most 100 values per statement
	for (let i = 0; i < ids.length; i += 90) {
		const chunk = ids.slice(i, i + 90)
		const { results } = await db.prepare(`SELECT event_id FROM events WHERE event_id IN (${chunk.map(() => '?').join(', ')})`).bind(...chunk).all<{ event_id: string }>()
		for (const r of results) found.add(r.event_id)
	}
	return found
}

/** Counts of what a shard inserted, per site and day, the room taken for it, and the ref-only beacons recorded. */
export class Tally {
	private counts = new Map<string, { events: number; stored: number; taken: number }>()
	private refs: { row: EventRow; paid: boolean }[] = []
	private entry(siteId: string, day: number) {
		const k = key(siteId, day)
		const c = this.counts.get(k) ?? { events: 0, stored: 0, taken: 0 }
		this.counts.set(k, c)
		return c
	}
	/** A pageview or custom event the shard inserted. Engagement beacons store no row and never come here. */
	add(row: EventRow) {
		const c = this.entry(row.site_id, utcDay(row.ts))
		c.stored++
		c.events++
	}
	/** Room taken under the cap, counted in `stored` already; the next flush gives back what went unused. */
	take(siteId: string, taken: Map<number, number>) {
		for (const [day, n] of taken) if (n > 0) this.entry(siteId, day).taken += n
	}
	/** A ref-only beacon whose payment refs were kept: one stored row, counted once by its id. `paid`: room was taken for it. */
	addRef(row: EventRow, paid: boolean) {
		this.refs.push({ row, paid })
	}
	/**
	 * Adds the counts to usage_daily, less the room taken for them, and starts over. The
	 * events are on the shard by now, and a retried batch would find them there and count
	 * nothing, so a failed write is tried once more here and then logged, never thrown.
	 */
	async flush(env: Env) {
		if (!this.counts.size && !this.refs.length) return
		const entries = [...this.counts].map(([k, c]) => ({ ...unkey(k), ...c }))
		const refs = this.refs
		this.counts = new Map()
		this.refs = []
		// A site deleted while its events were queued has no row to count against; the
		// foreign key would fail the batch and hold up the other sites in it.
		const count = env.CONTROL.prepare(
			'INSERT INTO usage_daily (site_id, day, events, stored) SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM sites WHERE id = ?) ON CONFLICT (site_id, day) DO UPDATE SET events = events + excluded.events, stored = stored + excluded.stored',
		)
		const mark = env.CONTROL.prepare('INSERT OR IGNORE INTO usage_refs (event_id, at) VALUES (?, ?)')
		// runs right after `mark`, and counts only when it marked the beacon as new
		const countRef = env.CONTROL.prepare(
			'INSERT INTO usage_daily (site_id, day, events, stored) SELECT ?, ?, 0, 1 WHERE changes() > 0 AND EXISTS (SELECT 1 FROM sites WHERE id = ?) ON CONFLICT (site_id, day) DO UPDATE SET stored = stored + 1',
		)
		const now = Date.now()
		const stmts = [
			...entries.map((e) => count.bind(e.siteId, e.day, e.events, e.stored - e.taken, e.siteId)),
			...refs.flatMap(({ row, paid }) => (paid ? [mark.bind(row.event_id, now)] : [mark.bind(row.event_id, now), countRef.bind(row.site_id, utcDay(row.ts), row.site_id)])),
		]
		const write = () => env.CONTROL.batch(stmts)
		try {
			await write().catch(() => write())
		} catch (err) {
			const counts = entries.map((e) => ({ site: e.siteId, day: e.day, events: e.events, stored: e.stored }))
			console.error(JSON.stringify({ msg: 'usage count failed', counts, error: String(err) }))
		}
		for (const site of new Set([...entries.map((e) => e.siteId), ...refs.map((r) => r.row.site_id)])) invalidate(`usage:${site}:`)
	}
}

/**
 * Records what the cap dropped, once the batch is written. The first drop of a site's
 * day under a cap (not a block) marks `capped_at` and emails the team's owners and admins.
 */
export async function recordDrops(env: Env, drops: Drops) {
	if (!drops.counts.size) return
	const now = Date.now()
	const entries = [...drops.counts].map(([k, n]) => ({ ...unkey(k), n }))
	const add = env.CONTROL.prepare(
		'INSERT INTO usage_daily (site_id, day, dropped) SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM sites WHERE id = ?) ON CONFLICT (site_id, day) DO UPDATE SET dropped = dropped + excluded.dropped',
	)
	const mark = env.CONTROL.prepare('UPDATE usage_daily SET capped_at = ? WHERE site_id = ? AND day = ? AND capped_at IS NULL')
	const capped = entries.filter((e) => drops.caps.get(e.siteId)! > 0)
	const res = await env.CONTROL.batch([...entries.map((e) => add.bind(e.siteId, e.day, e.n, e.siteId)), ...capped.map((e) => mark.bind(now, e.siteId, e.day))])
	for (const e of entries) invalidate(`usage:${e.siteId}:`)
	const first = capped.filter((_, i) => (res[entries.length + i].meta.changes ?? 0) > 0)
	for (const e of first) {
		console.log(JSON.stringify({ msg: 'ingest capped', site: e.siteId, day: e.day, cap: drops.caps.get(e.siteId) }))
		try {
			await notifyCapped(env, e.siteId, drops.caps.get(e.siteId)!)
		} catch (err) {
			// the events are written; a lost email must not replay the batch
			console.error(JSON.stringify({ msg: 'cap email failed', site: e.siteId, error: String(err) }))
		}
	}
}

async function notifyCapped(env: Env, siteId: string, cap: number) {
	const site = await getSite(env, siteId)
	if (!site) return
	const { results } = await env.CONTROL.prepare("SELECT u.email FROM team_members m JOIN users u ON u.id = m.user_id WHERE m.team_id = ? AND m.role IN ('owner', 'admin')")
		.bind(site.team_id)
		.all<{ email: string }>()
	const msg = renderNotice({
		label: 'tracking',
		subject: `Tracking for ${site.domain} is paused until 00:00 UTC`,
		detail: `${site.domain} stored ${cap.toLocaleString('en')} events today, its daily limit. Events after that are not recorded until 00:00 UTC. If this is real traffic, ask for a higher limit; if it is not, it may be a bot or a broken script.`,
		cta: 'Open the dashboard',
		link: `${env.PUBLIC_URL || 'https://misomoon.com'}/?site=${encodeURIComponent(site.id)}`,
	})
	for (const { email } of results) await sendEmail(env, email, msg)
}
