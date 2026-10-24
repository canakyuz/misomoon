import { buildEvent, checkoutKeys, DAY, edgeFromRequest, eventDetail, ipExcluded, ipRules, OPEN_SESSIONS_CHUNK, openSessionsStmt, pathCounted, pathRules, privacySignal, searchParams, searchTermFromUrl, SESSION_GAP, siteFeatures, utcDay, visitorId, writeRange, type EdgeContext, type EventRow, type OpenSession, type TrackerPayload } from '@misomoon/core'
import { d1Runner, dailySalt, getRanges, getSite, purge, shardDb, writeShard } from './control'
import { checkMonths, planStops } from './plans'
import { recordRefs, takesPayments } from './revenue'
import { Budget, overCap, recordDrops, Tally } from './usage'

const MAX_BODY = 16 * 1024

/** Edge context for a beacon, direct or through a first-party proxy (see core/proxy.ts). */
export function edgeContext(req: Request): EdgeContext {
	const cf = (req.cf ?? {}) as IncomingRequestCfProperties & { botManagement?: { verifiedBot?: boolean; score?: number } }
	return edgeFromRequest(req.headers, {
		country: (cf.country as string) ?? null,
		region: (cf.region as string) ?? null,
		city: (cf.city as string) ?? null,
		continent: (cf.continent as string) ?? null,
		timezone: (cf.timezone as string) ?? null,
		asOrganization: (cf.asOrganization as string) ?? null,
		verifiedBot: cf.botManagement?.verifiedBot ?? false,
		botScore: cf.botManagement?.score ?? null,
	})
}

function hostAllowed(siteDomain: string, host: string): boolean {
	const d = siteDomain.replace(/:\d+$/, '')
	return host === d || host.endsWith('.' + d)
}

/**
 * Validates and enriches one beacon. Returns the row to persist, or null when the
 * event is dropped (bots, unknown sites, foreign hostnames). Callers answer 202
 * either way so the tracker never retries and probing reveals nothing.
 */
export async function acceptBeacon(env: Env, req: Request): Promise<EventRow | null> {
	// refuse an oversized body before reading it
	if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY) return null
	const text = await req.text()
	if (text.length > MAX_BODY) return null
	let payload: TrackerPayload
	try {
		payload = JSON.parse(text)
	} catch {
		return null
	}
	const edge = edgeContext(req)
	const row = buildEvent(payload, edge)
	if (typeof row === 'string') return null
	const site = await getSite(env, row.site_id)
	if (!site || !hostAllowed(site.domain, row.hostname)) return null
	// The site's privacy settings: its own visitors' addresses, and browsers that ask not to be counted.
	if (ipExcluded(edge.ip, ipRules(site.exclude_ips)) || (site.privacy_signals && privacySignal(req.headers))) return null
	// The site search term and a success page's checkout id come from the page URL, so the
	// tracker carries no code for them.
	if (row.name === 'pageview') {
		const features = siteFeatures(site.features)
		const q = features.includes('search') ? (payload.q ?? searchTermFromUrl(payload.u, searchParams(site.search_params))) : undefined
		row.detail = q ? eventDetail({ ...payload, q }, false) : null
		const keys = features.includes('payments') ? checkoutKeys(payload.u) : []
		if (keys.length) row.refs = [...new Set([...(row.refs ?? []), ...keys])].slice(0, 4)
	}
	// The site's path rules: a page they leave out counts neither its view nor its time. Its
	// payment keys still count, or a checkout started there would lose its visit.
	if ((row.name === 'pageview' || row.name === 'engagement') && !pathCounted(row.pathname, pathRules(site.include_paths), pathRules(site.exclude_paths))) {
		if (!row.refs?.length) return null
		row.ref_only = true
	}
	// A ref-only beacon only carries payment refs, and a site without payments keeps none.
	if (row.ref_only && !(await takesPayments(env, site.id))) return null
	// With plans on: the team lapsed (no plan, no trial running), or its month reached
	// OVERAGE of its plan's events. Both read through the isolate cache. Payments come in
	// through webhooks (revenue.ts), never here, so they are never dropped.
	if (await planStops(env, site.team_id, row.ts)) return null
	if (await overCap(env, site, row.ts)) return null
	row.visitor_id = await visitorId(await dailySalt(env, row.ts), row.site_id, edge.ip, edge.ua)
	// A visit open at 00:00 UTC carries on under yesterday's id (see assignSessions).
	if (row.ts - utcDay(row.ts) * DAY < SESSION_GAP) row.prev_visitor_id = await visitorId(await dailySalt(env, row.ts - DAY), row.site_id, edge.ip, edge.ua)
	return row
}

/** The ids in `ids` whose site is still there, read from CONTROL rather than the isolate cache. */
async function liveSites(env: Env, ids: string[]): Promise<Set<string>> {
	const live = new Set<string>()
	for (let i = 0; i < ids.length; i += 90) {
		const chunk = ids.slice(i, i + 90)
		const { results } = await env.CONTROL.prepare(`SELECT id FROM sites WHERE id IN (${chunk.map(() => '?').join(', ')})`).bind(...chunk).all<{ id: string }>()
		for (const r of results) live.add(r.id)
	}
	return live
}

/**
 * Persists events, grouping by shard and site so each group is one D1 batch. Events
 * past a site's daily cap are dropped as each group is planned (Budget in usage.ts), and
 * what each group inserted is added to the day's usage once the group is written.
 */
export async function writeEvents(env: Env, all: EventRow[]): Promise<number> {
	// A site deleted while its events were queued keeps none of them. Other isolates can
	// hold the site in their cache for a minute after the delete, and accept its beacons.
	const live = await liveSites(env, [...new Set(all.map((r) => r.site_id))])
	const rows = all.filter((r) => live.has(r.site_id))
	const budget = await Budget.load(env, rows)
	const tally = new Tally()
	const groups = new Map<string, EventRow[]>()
	for (const row of rows) {
		const shard = await writeShard(env, row.site_id, row.ts)
		const key = `${shard}\u0000${row.site_id}`
		const list = groups.get(key)
		if (list) list.push(row)
		else groups.set(key, [row])
	}
	let written = 0
	for (const [key, events] of groups) {
		const [shard, siteId] = key.split('\u0000')
		const db = await shardDb(env, shard)
		const run = d1Runner(db)
		// Yesterday's visit can only continue when yesterday wrote to this shard too.
		const ranges = await getRanges(env, siteId)
		for (const e of events) if (e.prev_visitor_id && writeRange(ranges, utcDay(e.ts) - 1)?.shard !== shard) delete e.prev_visitor_id
		const visitors = [...new Set(events.flatMap((e) => (e.prev_visitor_id ? [e.visitor_id, e.prev_visitor_id] : [e.visitor_id])))]
		// no spread: a large backfill would overflow the argument list
		const before = events.reduce((m, e) => Math.min(m, e.ts), Infinity)
		const open: OpenSession[] = []
		for (let i = 0; i < visitors.length; i += OPEN_SESSIONS_CHUNK) {
			const [rows] = await run([openSessionsStmt(siteId, visitors.slice(i, i + OPEN_SESSIONS_CHUNK), before)])
			open.push(...(rows as unknown as OpenSession[]))
		}
		const { rows: kept, stmts, refs, taken, paidRefs } = await budget.plan(env, db, siteId, events, open)
		tally.take(siteId, taken)
		// Every event is a pair of statements, and chunks hold whole pairs: a visit upsert
		// checks its insert's changes(), and an engagement beacon's visit update must read the
		// pageview before the beacon is marked on it, so each pair runs in one batch, in order.
		// The insert of kept[n] is statement 2n, and it changed a row only when the event was
		// new; the engagement beacons' pairs come after the inserts and store no row.
		try {
			for (let i = 0; i < stmts.length; i += 200) {
				const res = await db.batch(stmts.slice(i, i + 200).map((s) => db.prepare(s.sql).bind(...s.params)))
				for (let j = 0; j < res.length; j += 2) if ((i + j) / 2 < kept.length && (res[j].meta.changes ?? 0) > 0) tally.add(kept[(i + j) / 2])
			}
		} finally {
			// what was written counts, and the room taken for the rest goes back for the retry
			await tally.flush(env)
		}
		// Deleted while this group was written: the rows may have landed after the delete's
		// purges, so they go here. Rows that landed before its last purge, that purge took.
		if (!(await liveSites(env, [siteId])).has(siteId)) {
			await purge(db, 'events', 'rowid', 'site_id = ?', [siteId])
			await purge(db, 'sessions', 'site_id, session_id', 'site_id = ?', [siteId])
			continue
		}
		// keys for payments (refs, success-page checkout ids) go to CONTROL once the events are safe
		if (refs.length) {
			await recordRefs(env, refs)
			// a ref-only beacon stores no event, but the refs it keeps are rows too
			if (await takesPayments(env, siteId)) for (const r of refs) if (r.ref_only) tally.addRef(r, paidRefs.has(r.event_id))
			await tally.flush(env)
		}
		written += kept.length
	}
	await recordDrops(env, budget.drops)
	// With plans on, the 80%, 100% and stop emails of the teams whose events this batch
	// counted. The events are written, so a failure is logged and never replays the batch.
	if (written) {
		await checkMonths(env, [...groups.keys()].map((k) => k.split('\u0000')[1])).catch((err) => console.error(JSON.stringify({ msg: 'plan month check failed', error: String(err) })))
	}
	return written
}
