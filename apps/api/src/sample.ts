import { buildEvent, DAY, MINUTE, SAMPLE, sampleTraffic, visitorId, type EventRow } from '@misomoon/core'
import { createSite, getRanges, getSite, invalidate, shardDb, type Site } from './control'
import { writeEvents } from './ingest'

/**
 * The sample site (SAMPLE_SITE): Acme, a made-up store that the demo dashboard at /demo
 * shows. It belongs to the `sample` team, which has no members, and is public, so anyone
 * can read it and nobody can change it. Every five minutes the cron writes its generated
 * traffic up to now through the real write path, so every report has data, Live included.
 */
export const SAMPLE_TEAM = 'sample'

/** At most this much of the past is written in one run: a new site's history fills over a few hours, not one huge run. */
const MAX_SPAN = DAY

/** `perDay` is for tests, which need less traffic to check the same thing. */
export async function fillSample(env: Env, now = Date.now(), opts: { perDay?: number } = {}): Promise<number> {
	const id = env.SAMPLE_SITE
	if (!id) return 0
	const site = (await getSite(env, id)) ?? (await createSampleSite(env, id, now))
	// never invent visits on a site somebody else owns
	if (site.team_id !== SAMPLE_TEAM) {
		console.error(JSON.stringify({ msg: 'sample site skipped: the id belongs to another team', site: id }))
		return 0
	}
	const from = Math.max((await lastEvent(env, id)) ?? 0, now - SAMPLE.days * DAY)
	const to = Math.min(now, from + MAX_SPAN)
	if (to <= from) return 0
	const rows: EventRow[] = []
	for (const h of sampleTraffic(id, site.domain, from, to, opts)) {
		const row = buildEvent(h.payload, h.edge, h.ts)
		if (typeof row === 'string') continue
		row.visitor_id = await visitorId(`sample-${SAMPLE.seed}-${Math.floor(row.ts / DAY)}`, id, h.edge.ip, h.edge.ua)
		rows.push(row)
	}
	// each hit keeps its event id, so the hits at `from` that are stored already insert nothing
	return writeEvents(env, rows)
}

/** When this isolate last topped the sample site up for Live, which polls every few seconds. */
let toppedUp = 0
const TOP_UP_EVERY = 20_000

/**
 * The cron writes the sample's traffic every five minutes, so Live, which counts the last
 * five, would show almost nobody just before a run. A Live read of the sample site writes
 * the minutes since, at most every 20 seconds per isolate. A site still filling its history
 * leaves that to the cron. A hit written twice is stored once.
 */
export async function topUpSample(env: Env, siteId: string | undefined, now = Date.now()): Promise<void> {
	if (!siteId || siteId !== env.SAMPLE_SITE || now - toppedUp < TOP_UP_EVERY) return
	toppedUp = now
	const last = await lastEvent(env, siteId)
	if (last == null || now - last > 15 * MINUTE) return
	await fillSample(env, now)
}

/** The newest stored event of the site, or null when it has none. */
async function lastEvent(env: Env, siteId: string): Promise<number | null> {
	let last: number | null = null
	for (const shard of new Set((await getRanges(env, siteId)).map((r) => r.shard))) {
		const t = await (await shardDb(env, shard)).prepare('SELECT MAX(ts) AS t FROM events WHERE site_id = ?').bind(siteId).first<number | null>('t')
		if (t != null && (last == null || t > last)) last = t
	}
	return last
}

async function createSampleSite(env: Env, id: string, now: number): Promise<Site> {
	await env.CONTROL.prepare('INSERT OR IGNORE INTO teams (id, name, created_at) VALUES (?, ?, ?)').bind(SAMPLE_TEAM, 'Sample sites', now).run()
	const site = await createSite(env, SAMPLE_TEAM, { id, domain: SAMPLE.domain, name: SAMPLE.name, timezone: SAMPLE.timezone, currency: SAMPLE.currency, public: true })
	// later runs find the site and skip this, so a site without its goals goes, and the next run starts over
	await env.CONTROL.batch([
		env.CONTROL.prepare('UPDATE sites SET retention_days = ? WHERE id = ?').bind(SAMPLE.retention, id),
		...SAMPLE.goals.map(([name, kind, match]) =>
			env.CONTROL.prepare('INSERT OR IGNORE INTO goals (id, site_id, name, kind, match, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), id, name, kind, match, now),
		),
		...SAMPLE.funnels.map((f) =>
			env.CONTROL.prepare('INSERT INTO funnels (id, site_id, name, steps, mode, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), id, f.name, JSON.stringify(f.steps), 'sequential', now),
		),
	]).catch(async (e) => {
		await env.CONTROL.prepare('DELETE FROM sites WHERE id = ?').bind(id).run()
		invalidate(`site:${id}`)
		throw e
	})
	invalidate(`site:${id}`)
	console.log(JSON.stringify({ msg: 'sample site created', site: id }))
	return { ...site, retention_days: SAMPLE.retention }
}
