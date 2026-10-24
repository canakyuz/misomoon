import { dimExpr, dimInfo, likeEscape, predicate, QueryError, type DimScope } from './filters'
import { IMPORTED_DIMS } from './imported'
import { bucketSql, bucketStart, bucketsIn, DAY, MINUTE, type Zone } from './time'
import type {
	Aggregate,
	Breakdown,
	BreakdownRow,
	Filter,
	FunnelMode,
	FunnelResult,
	FunnelStep,
	Interval,
	Realtime,
	TimeseriesPoint,
	VitalName,
	VitalSummary,
	Window,
} from './types'

export interface Stmt {
	sql: string
	params: unknown[]
}
type Row = Record<string, unknown>
/** Runs statements against one shard, in order, returning each statement's rows. */
export type Runner = (stmts: Stmt[]) => Promise<Row[][]>

/** One shard and the part of the query window that lives on it. */
export interface Target {
	run: Runner
	window: Window
}

export interface Scope {
	siteId: string
	filters: Filter[]
	/** the site's zone (or a fixed offset in minutes) for local day, week and month buckets */
	tz: Zone
	/** ISO 4217 code; when set, revenue counts only this currency and events without one */
	currency?: string
	/** add imported history (Google, CSV) to reports without filters */
	imported?: boolean
}

/** Imported history only joins unfiltered reports: imports are per-dimension totals. */
const withImported = (scope: Scope) => scope.imported === true && scope.filters.length === 0

const IMPORTED_SUMS = `SUM(i.visitors) AS visitors, SUM(i.visits) AS visits, SUM(i.pageviews) AS pageviews, SUM(i.pageviews) AS spv,
	SUM(i.bounces) AS bounces, SUM(i.visits) AS bvisits, SUM(i.duration) * 1000 AS dur, SUM(i.events) AS events`

function importedWhere(scope: Scope, w: Window, params: unknown[], dims: string[]): string {
	params.push(scope.siteId, ...dims, w.from, w.to)
	return `i.site_id = ? AND i.dim IN (${dims.map(() => '?').join(', ')}) AND i.ts >= ? AND i.ts < ?`
}

/** Totals from imported history: site rows for traffic, event rows for custom events. */
function importedCounterSql(scope: Scope, w: Window, params: unknown[], extraSelect = '', groupBy = ''): string {
	return `SELECT ${extraSelect}SUM(CASE WHEN i.dim = '' THEN i.visitors END) AS visitors, SUM(CASE WHEN i.dim = '' THEN i.visits END) AS visits,
		SUM(CASE WHEN i.dim = '' THEN i.pageviews END) AS pageviews, SUM(CASE WHEN i.dim = '' THEN i.pageviews END) AS spv,
		SUM(CASE WHEN i.dim = '' THEN i.bounces END) AS bounces, SUM(CASE WHEN i.dim = '' THEN i.visits END) AS bvisits,
		SUM(CASE WHEN i.dim = '' THEN i.duration END) * 1000 AS dur, SUM(CASE WHEN i.dim = 'event' THEN i.events END) AS events
		FROM imported i WHERE ${importedWhere(scope, w, params, ['', 'event'])}${groupBy}`
}

// Every stored event is a pageview or a custom one: engagement beacons add to their
// pageview's row (pingStmts in ingest.ts) and are never stored themselves.
const CUSTOM = "<> 'pageview'"
const BOUNCE = '(s.pageviews <= 1 AND s.events = 0)'
const ROW_CAP = 500

const num = (v: unknown): number => (typeof v === 'number' ? v : v == null ? 0 : Number(v) || 0)
const round = (v: number, dp = 1) => Math.round(v * 10 ** dp) / 10 ** dp
const ratio = (a: number, b: number) => (b > 0 ? a / b : 0)
const utcMidnight = (t: number) => Math.floor(t / DAY) * DAY

/**
 * Revenue net of refunds, and the count of events that brought money in (refunds are
 * negative and don't count), in the scope's currency when it has one.
 */
function revenueSql(scope: Scope, alias = 'e'): string {
	if (scope.currency != null && !/^[A-Z]{3}$/.test(scope.currency)) throw new QueryError(`invalid currency: ${scope.currency}`)
	const amount = scope.currency == null ? `${alias}.revenue` : `CASE WHEN ${alias}.currency IS NULL OR ${alias}.currency = '${scope.currency}' THEN ${alias}.revenue END`
	return `COALESCE(SUM(${amount}), 0) AS revenue, COUNT(CASE WHEN ${amount} > 0 THEN 1 END) AS rev_n`
}

// ---------------------------------------------------------------- scopes

/**
 * Bounce rate under a page filter only counts visits that entered on that page;
 * the second column is the matching denominator.
 */
function bounceSql(scope: Scope, params: unknown[]): string {
	const cond = () => {
		const conds = scope.filters.filter((f) => f.dim === 'page').map((f) => predicate({ ...f, dim: 'entry_page' }, 's', params))
		return conds.length ? conds.join(' AND ') : '1'
	}
	return `SUM(CASE WHEN ${cond()} THEN ${BOUNCE} ELSE 0 END) AS bounces, SUM(CASE WHEN ${cond()} THEN 1 ELSE 0 END) AS bvisits`
}

function flip(f: Filter): Filter {
	return { ...f, op: f.op === '!=' ? '==' : f.op === '!~' ? '~' : f.op }
}

/** WHERE clause over `events e` for a window. */
export function eventWhere(scope: Scope, w: Window, params: unknown[], alias = 'e'): string {
	params.push(scope.siteId, w.from, w.to)
	const conds = [`${alias}.site_id = ?`, `${alias}.ts >= ?`, `${alias}.ts < ?`]
	for (const f of scope.filters) {
		const { scope: ds } = dimInfo(f.dim)
		if (ds === 'entry') {
			const negate = f.op.startsWith('!')
			// any session active in the window that started on the UTC day before it or later:
			// a lower bound keeps the index from reading every visit the site ever had, and
			// only a visit active for more than a whole day starts earlier
			params.push(scope.siteId, w.from, utcMidnight(w.from) - DAY, w.to)
			conds.push(
				`${alias}.session_id ${negate ? 'NOT IN' : 'IN'} (SELECT s2.session_id FROM sessions s2 WHERE s2.site_id = ? AND s2.last_at >= ? AND s2.started_at >= ? AND s2.started_at < ? AND ${predicate(flip(f), 's2', params)})`,
			)
		} else {
			conds.push(predicate(f, alias, params))
		}
	}
	return conds.join(' AND ')
}

/** WHERE clause over `sessions s` for visits that started in a window. */
export function sessionWhere(scope: Scope, w: Window, params: unknown[], alias = 's'): string {
	params.push(scope.siteId, w.from, w.to)
	const conds = [`${alias}.site_id = ?`, `${alias}.started_at >= ?`, `${alias}.started_at < ?`]
	for (const f of scope.filters) {
		const { scope: ds } = dimInfo(f.dim)
		if (ds === 'event') {
			// A visit matches an event filter when any of its events match; a negative
			// filter keeps visits where none do.
			const negate = f.op.startsWith('!')
			// ...and its events end by the UTC midnight after it started.
			params.push(scope.siteId, w.from, Math.max(w.to + 30 * MINUTE, utcMidnight(w.to - 1) + DAY))
			conds.push(
				`${alias}.session_id ${negate ? 'NOT IN' : 'IN'} (SELECT e2.session_id FROM events e2 WHERE e2.site_id = ? AND e2.ts >= ? AND e2.ts < ? AND ${predicate(flip(f), 'e2', params)})`,
			)
		} else {
			conds.push(predicate(f, alias, params))
		}
	}
	return conds.join(' AND ')
}

// ---------------------------------------------------------------- aggregate

interface Counters {
	visitors: number
	pageviews: number
	events: number
	revenue: number
	/** events that carried a revenue amount */
	rev_n: number
	visits: number
	bounces: number
	/** visits bounce rate is measured over (all of them unless a page filter applies) */
	bvisits: number
	spv: number
	/** summed visit durations, ms */
	dur: number
}

/**
 * Pageviews an engagement beacon added to: their rows carry the page view's engaged time,
 * deepest scroll and Web Vitals. A view left within a second, with nothing to send, has none.
 */
const PINGED = `e.name = 'pageview' AND e.pings IS NOT NULL`

const zero = (): Counters => ({ visitors: 0, pageviews: 0, events: 0, revenue: 0, rev_n: 0, visits: 0, bounces: 0, bvisits: 0, spv: 0, dur: 0 })

function addCounters(a: Counters, r: Row) {
	for (const k of Object.keys(a) as (keyof Counters)[]) if (k in r) a[k] += num(r[k])
}

function finalize(c: Counters): Aggregate {
	return {
		visitors: c.visitors,
		visits: c.visits,
		pageviews: c.pageviews,
		views_per_visit: round(ratio(c.spv, c.visits), 2),
		bounce_rate: round(ratio(c.bounces, c.bvisits) * 100),
		visit_duration: Math.round(ratio(c.dur, c.visits) / 1000),
		events: c.events,
		revenue: round(c.revenue, 2),
		average_revenue: round(ratio(c.revenue, c.rev_n), 2),
	}
}

function eventCounterSql(scope: Scope, w: Window, params: unknown[], extraSelect = '', groupBy = ''): string {
	const where = eventWhere(scope, w, params)
	return `SELECT ${extraSelect}COUNT(DISTINCT NULLIF(e.visitor_id, '')) AS visitors,
		SUM(e.name = 'pageview') AS pageviews,
		SUM(e.name ${CUSTOM}) AS events,
		${revenueSql(scope)}
		FROM events e WHERE ${where}${groupBy}`
}

function sessionCounterSql(scope: Scope, w: Window, params: unknown[], extraSelect = '', groupBy = ''): string {
	const bounce = bounceSql(scope, params)
	const where = sessionWhere(scope, w, params)
	return `SELECT ${extraSelect}COUNT(*) AS visits, ${bounce}, SUM(s.pageviews) AS spv, SUM(s.duration_ms) AS dur
		FROM sessions s WHERE ${where}${groupBy}`
}

export async function aggregate(targets: Target[], scope: Scope): Promise<Aggregate> {
	return (await aggregateMany(targets, [scope]))[0]
}

/** Several aggregates (one per scope) in one batch per shard. */
export async function aggregateMany(targets: Target[], scopes: Scope[]): Promise<Aggregate[]> {
	const totals = scopes.map(zero)
	await Promise.all(
		targets.map(async ({ run, window }) => {
			const owner: number[] = []
			const stmts = scopes.flatMap((scope, i) => {
				const p1: unknown[] = []
				const p2: unknown[] = []
				const own = [
					{ sql: eventCounterSql(scope, window, p1), params: p1 },
					{ sql: sessionCounterSql(scope, window, p2), params: p2 },
				]
				if (withImported(scope)) {
					const p3: unknown[] = []
					own.push({ sql: importedCounterSql(scope, window, p3), params: p3 })
				}
				own.forEach(() => owner.push(i))
				return own
			})
			const res = await run(stmts)
			res.forEach((rows, j) => {
				if (rows?.[0]) addCounters(totals[owner[j]], rows[0])
			})
		}),
	)
	return totals.map(finalize)
}

// ---------------------------------------------------------------- timeseries

export async function timeseries(targets: Target[], scope: Scope, window: Window, interval: Interval): Promise<TimeseriesPoint[]> {
	// before any query, so an interval too fine for the window fails fast
	const buckets = bucketsIn(window, interval, scope.tz)
	const byBucket = new Map<number, Counters>()
	const slot = (t: number) => {
		let c = byBucket.get(t)
		if (!c) byBucket.set(t, (c = zero()))
		return c
	}
	await Promise.all(
		targets.map(async ({ run, window: w }) => {
			const p1: unknown[] = []
			const p2: unknown[] = []
			const stmts = [
				{ sql: eventCounterSql(scope, w, p1, `${bucketSql('e.ts', interval, scope.tz, w)} AS t, `, ' GROUP BY t'), params: p1 },
				{ sql: sessionCounterSql(scope, w, p2, `${bucketSql('s.started_at', interval, scope.tz, w)} AS t, `, ' GROUP BY t'), params: p2 },
			]
			if (withImported(scope)) {
				// imported days are whole days, so minute and hour buckets get them at midnight
				const p3: unknown[] = []
				stmts.push({ sql: importedCounterSql(scope, w, p3, `${bucketSql('i.ts', interval, scope.tz, w)} AS t, `, ' GROUP BY t'), params: p3 })
			}
			for (const res of await run(stmts)) for (const r of res) addCounters(slot(bucketStart(num(r.t), interval, scope.tz)), r)
		}),
	)
	return buckets.map((t) => ({ t, ...finalize(byBucket.get(t) ?? zero()) }))
}

// ---------------------------------------------------------------- breakdown

interface Partial extends Counters {
	page_ms: number
	/** visits that sent an engagement beacon for the page */
	page_n: number
	scroll: number
	scroll_n: number
	/** pageviews of an exit page, for exit rate */
	page_views: number
}

const KEY = (expr: string) => `COALESCE(NULLIF(CAST(${expr} AS TEXT), ''), '(none)')`

export type BreakdownKind = 'session' | 'page' | 'event' | 'event_dim'

/** `props` breaks every custom property down at once, as "key: value" rows (the Properties report). */
export const ALL_PROPS = 'props'

export function breakdownKind(property: string): BreakdownKind {
	if (property === ALL_PROPS) return 'event_dim'
	if (property === 'page') return 'page'
	if (property === 'event') return 'event'
	const { scope } = dimInfo(property)
	return scope === 'event' ? 'event_dim' : 'session'
}

/** Statements for one shard; `primary` marks the ones whose rows create keys (the rest only enrich). */
function breakdownStmts(property: string, scope: Scope, w: Window, search?: string): { stmts: Stmt[]; primary: Set<number> } {
	// The search runs in SQL, so it finds keys outside the top ROW_CAP.
	const having = (p: unknown[], key = 'key') => {
		if (!search) return ''
		p.push(`%${likeEscape(search)}%`)
		return ` HAVING ${key} LIKE ? ESCAPE '\\'`
	}
	if (property === ALL_PROPS) {
		const p: unknown[] = []
		const key = `j.key || ': ' || CAST(j.value AS TEXT)`
		return {
			primary: new Set([0]),
			stmts: [
				{
					sql: `SELECT ${key} AS key, COUNT(DISTINCT NULLIF(e.visitor_id, '')) AS visitors, SUM(e.name = 'pageview') AS pageviews,
					SUM(e.name ${CUSTOM}) AS events, ${revenueSql(scope)}
					FROM events e, json_each(e.props) j WHERE ${eventWhere(scope, w, p)} AND e.props IS NOT NULL
					GROUP BY 1${having(p, key)} ORDER BY visitors DESC, 1 LIMIT ${ROW_CAP}`,
					params: p,
				},
			],
		}
	}
	const kind = breakdownKind(property)
	const q = (a: string) => KEY(dimExpr(property, a))
	const stmts: Stmt[] = []
	/** the statement that finds revenue per key, which can name keys no visit in the window has */
	let revenueAt = -1
	if (kind === 'session') {
		const p: unknown[] = []
		const bounce = bounceSql(scope, p)
		stmts.push({
			sql: `SELECT ${q('s')} AS key, COUNT(DISTINCT s.visitor_id) AS visitors, COUNT(*) AS visits,
				${bounce}, SUM(s.pageviews) AS spv, SUM(s.duration_ms) AS dur
				FROM sessions s WHERE ${sessionWhere(scope, w, p)}
				GROUP BY key${having(p)} ORDER BY visitors DESC, key LIMIT ${ROW_CAP}`,
			params: p,
		})
		// Payments carry their visit's source, place and device, so revenue reads from
		// events. A renewal months after the visit counts here though its visit doesn't.
		if (dimInfo(property).scope === 'session') {
			const pr: unknown[] = []
			revenueAt = stmts.length
			stmts.push({
				sql: `SELECT ${q('e')} AS key, ${revenueSql(scope)} FROM events e WHERE ${eventWhere(scope, w, pr)} AND e.revenue IS NOT NULL
					GROUP BY key${having(pr)} ORDER BY revenue DESC LIMIT ${ROW_CAP}`,
				params: pr,
			})
		}
		if (property === 'exit_page') {
			// Exit rate is exits over pageviews of the page, without the exit page filter.
			const p2: unknown[] = []
			const rest = { ...scope, filters: scope.filters.filter((f) => f.dim !== 'exit_page') }
			stmts.push({
				sql: `SELECT e.pathname AS key, COUNT(*) AS page_views FROM events e WHERE ${eventWhere(rest, w, p2)} AND e.name = 'pageview'
					GROUP BY key ORDER BY page_views DESC LIMIT ${ROW_CAP * 2}`,
				params: p2,
			})
		}
	} else if (kind === 'page') {
		const p1: unknown[] = []
		stmts.push({
			sql: `SELECT e.pathname AS key, COUNT(DISTINCT NULLIF(e.visitor_id, '')) AS visitors, COUNT(*) AS pageviews
				FROM events e WHERE ${eventWhere(scope, w, p1)} AND e.name = 'pageview'
				GROUP BY key${having(p1)} ORDER BY visitors DESC, key LIMIT ${ROW_CAP}`,
			params: p1,
		})
		// Time on page is engaged time per visit that saw the page, and scroll depth is the
		// deepest scroll of each such visit, averaged, over the views an engagement beacon reached.
		const p2: unknown[] = []
		stmts.push({
			sql: `SELECT key, SUM(ms) AS page_ms, COUNT(*) AS page_n, SUM(depth) AS scroll, COUNT(depth) AS scroll_n
				FROM (SELECT e.pathname AS key, e.session_id, SUM(e.engaged_ms) AS ms, MAX(e.scroll_depth) AS depth
					FROM events e WHERE ${eventWhere(scope, w, p2)} AND ${PINGED} GROUP BY e.pathname, e.session_id)
				GROUP BY key ORDER BY page_n DESC LIMIT ${ROW_CAP * 2}`,
			params: p2,
		})
		const p3: unknown[] = []
		const bounce = bounceSql(scope, p3)
		stmts.push({
			sql: `SELECT s.entry_path AS key, COUNT(*) AS visits, ${bounce}, SUM(s.duration_ms) AS dur, SUM(s.pageviews) AS spv
				FROM sessions s WHERE ${sessionWhere(scope, w, p3)}
				GROUP BY key ORDER BY visits DESC LIMIT ${ROW_CAP * 2}`,
			params: p3,
		})
	} else if (kind === 'event') {
		const p: unknown[] = []
		stmts.push({
			sql: `SELECT e.name AS key, COUNT(DISTINCT NULLIF(e.visitor_id, '')) AS visitors, COUNT(*) AS events, ${revenueSql(scope)}
				FROM events e WHERE ${eventWhere(scope, w, p)} AND e.name ${CUSTOM}
				GROUP BY key${having(p)} ORDER BY visitors DESC, key LIMIT ${ROW_CAP}`,
			params: p,
		})
	} else {
		const p: unknown[] = []
		stmts.push({
			sql: `SELECT ${q('e')} AS key, COUNT(DISTINCT NULLIF(e.visitor_id, '')) AS visitors, SUM(e.name = 'pageview') AS pageviews,
				SUM(e.name ${CUSTOM}) AS events, ${revenueSql(scope)}
				FROM events e WHERE ${eventWhere(scope, w, p)}
				GROUP BY key${having(p)} ORDER BY visitors DESC, key LIMIT ${ROW_CAP}`,
			params: p,
		})
	}
	const primary = new Set([0])
	if (revenueAt >= 0) primary.add(revenueAt)
	if (withImported(scope) && (IMPORTED_DIMS as readonly string[]).includes(property)) {
		const imp = (dims: string[], select: string) => {
			const p: unknown[] = []
			const where = importedWhere(scope, w, p, dims)
			stmts.push({ sql: `SELECT i.key AS key, ${select} FROM imported i WHERE ${where} GROUP BY i.key${having(p, 'i.key')} ORDER BY visitors DESC LIMIT ${ROW_CAP}`, params: p })
		}
		primary.add(stmts.length)
		if (kind === 'page') {
			imp(['page'], 'SUM(i.visitors) AS visitors, SUM(i.pageviews) AS pageviews, SUM(i.time_s) * 1000 AS page_ms, SUM(i.time_n) AS page_n, SUM(i.scroll) AS scroll, SUM(i.scroll_n) AS scroll_n')
			// bounce rate of a page is that of visits entering on it
			imp(['entry_page'], 'SUM(i.visits) AS visits, SUM(i.bounces) AS bounces, SUM(i.visits) AS bvisits, SUM(i.duration) * 1000 AS dur, SUM(i.pageviews) AS spv, 0 AS visitors')
		} else if (kind === 'event') {
			imp(['event'], 'SUM(i.visitors) AS visitors, SUM(i.events) AS events')
		} else {
			imp([property], IMPORTED_SUMS)
			if (property === 'exit_page') imp(['page'], 'SUM(i.pageviews) AS page_views, 0 AS visitors')
		}
	}
	return { stmts, primary }
}

export async function breakdown(
	targets: Target[],
	scope: Scope,
	property: string,
	opts: { limit?: number; page?: number; totalVisitors?: number; search?: string; /** exports raise the 200-row page cap */ maxLimit?: number } = {},
): Promise<Breakdown> {
	const limit = Math.min(Math.max(opts.limit ?? 10, 1), opts.maxLimit ?? 200)
	const page = Math.max(opts.page ?? 1, 1)
	const kind = breakdownKind(property)
	const rows = new Map<string, Partial>()
	let capped = false
	const slot = (k: string) => {
		let r = rows.get(k)
		if (!r) {
			r = { ...zero(), page_ms: 0, page_n: 0, scroll: 0, scroll_n: 0, page_views: 0 }
			rows.set(k, r)
		}
		return r
	}
	const all = await Promise.all(
		targets.map(async ({ run, window }) => {
			const { stmts, primary } = breakdownStmts(property, scope, window, opts.search)
			const res = await run(stmts)
			return { primary: res.filter((_, i) => primary.has(i)), extra: res.filter((_, i) => !primary.has(i)) }
		}),
	)
	const add = (s: Partial, r: Record<string, unknown>) => {
		for (const k of Object.keys(s) as (keyof Partial)[]) if (k in r) s[k] += num(r[k])
	}
	// Primary rows from every shard first, so the key set doesn't depend on which shard answered first.
	for (const { primary } of all)
		for (const res of primary) {
			if (res.length >= ROW_CAP) capped = true
			for (const r of res) add(slot(String(r.key ?? '(none)')), r)
		}
	// Secondary page queries only enrich keys the primary queries found.
	for (const { extra } of all)
		for (const res of extra)
			for (const r of res) {
				const s = rows.get(String(r.key ?? '(none)'))
				if (s) add(s, r)
			}
	const list = [...rows.entries()]
	list.sort((a, b) => b[1].visitors - a[1].visitors || b[1].pageviews - a[1].pageviews || a[0].localeCompare(b[0]))
	const total = opts.totalVisitors ?? 0
	const start = (page - 1) * limit
	const out: BreakdownRow[] = list.slice(start, start + limit).map(([key, p]) => {
		const row: BreakdownRow = {
			key,
			visitors: p.visitors,
			pageviews: kind === 'session' ? p.spv : p.pageviews,
			events: p.events,
			visits: p.visits,
			bounce_rate: round(ratio(p.bounces, p.bvisits) * 100),
			visit_duration: Math.round(ratio(p.dur, p.visits) / 1000),
		}
		if (kind === 'page') {
			row.time_on_page = Math.round(ratio(p.page_ms, p.page_n) / 1000)
			row.scroll_depth = Math.round(ratio(p.scroll, p.scroll_n))
		}
		if (property === 'exit_page') row.exit_rate = p.page_views ? Math.min(100, round(ratio(p.visits, p.page_views) * 100)) : null
		if (kind === 'event' || kind === 'event_dim') {
			row.conversion_rate = round(ratio(p.visitors, total) * 100)
			row.revenue = round(p.revenue, 2)
			row.average_revenue = round(ratio(p.revenue, p.rev_n), 2)
		} else if (kind === 'session' && (p.revenue || p.rev_n)) {
			row.revenue = round(p.revenue, 2)
			row.average_revenue = round(ratio(p.revenue, p.rev_n), 2)
		}
		return row
	})
	return { property, rows: out, total_visitors: total, has_more: list.length > start + limit, ...(capped ? { truncated: true } : {}) }
}

// ---------------------------------------------------------------- web vitals

export const VITALS: Record<VitalName, { width: number; cap: number; good: number; poor: number; unit: 'ms' | '' }> = {
	lcp: { width: 50, cap: 400, good: 2500, poor: 4000, unit: 'ms' },
	inp: { width: 8, cap: 250, good: 200, poor: 500, unit: 'ms' },
	// ingest clamps CLS to 10, so the histogram reaches that far
	cls: { width: 0.005, cap: 2000, good: 0.1, poor: 0.25, unit: '' },
	fcp: { width: 50, cap: 400, good: 1800, poor: 3000, unit: 'ms' },
	ttfb: { width: 25, cap: 400, good: 800, poor: 1800, unit: 'ms' },
}

export async function vitals(targets: Target[], scope: Scope): Promise<VitalSummary[]> {
	const names = Object.keys(VITALS) as VitalName[]
	const hist = new Map<VitalName, Map<number, number>>(names.map((n) => [n, new Map()]))
	const tallies = new Map<VitalName, { n: number; good: number; poor: number }>(names.map((n) => [n, { n: 0, good: 0, poor: 0 }]))
	await Promise.all(
		targets.map(async ({ run, window }) => {
			const p: unknown[] = []
			const where = eventWhere(scope, window, p)
			// a page load's vitals arrive with its first engagement beacon, on the pageview's row
			const cte = `WITH v AS (SELECT e.lcp, e.inp, e.cls, e.fcp, e.ttfb FROM events e WHERE ${where} AND ${PINGED})`
			const histSql = names
				.map((n) => `SELECT '${n}' AS m, MIN(CAST(${n} / ${VITALS[n].width} AS INTEGER), ${VITALS[n].cap}) AS b, COUNT(*) AS c FROM v WHERE ${n} IS NOT NULL GROUP BY b`)
				.join(' UNION ALL ')
			const tallySql = names
				.map((n) => `SELECT '${n}' AS m, COUNT(${n}) AS n, SUM(${n} <= ${VITALS[n].good}) AS good, SUM(${n} > ${VITALS[n].poor}) AS poor FROM v`)
				.join(' UNION ALL ')
			const [h, t] = await run([
				{ sql: `${cte} ${histSql}`, params: p },
				{ sql: `${cte} ${tallySql}`, params: p },
			])
			for (const r of h) {
				const m = hist.get(r.m as VitalName)!
				m.set(num(r.b), (m.get(num(r.b)) ?? 0) + num(r.c))
			}
			for (const r of t) {
				const s = tallies.get(r.m as VitalName)!
				s.n += num(r.n)
				s.good += num(r.good)
				s.poor += num(r.poor)
			}
		}),
	)
	return names.map((name) => {
		const t = tallies.get(name)!
		return {
			name,
			p75: percentile(hist.get(name)!, VITALS[name].width, 0.75),
			samples: t.n,
			good: t.good,
			poor: t.poor,
			needs_improvement: t.n - t.good - t.poor,
		}
	})
}

function percentile(h: Map<number, number>, width: number, q: number): number | null {
	const total = [...h.values()].reduce((a, b) => a + b, 0)
	if (!total) return null
	const target = total * q
	let seen = 0
	for (const b of [...h.keys()].sort((a, b) => a - b)) {
		seen += h.get(b)!
		if (seen >= target) {
			const v = (b + 0.5) * width
			return width < 1 ? round(v, 3) : Math.round(v)
		}
	}
	return null
}

// ---------------------------------------------------------------- funnel

const MAX_FUNNEL_STEPS = 8

/**
 * Funnels count visitors: each day's visitor id is one person, so a
 * funnel can span visits on that day and shard results still add up.
 *
 * - `sequential`: steps in order, other events allowed in between (the default).
 * - `strict`: steps in order with nothing else in between.
 * - `flexible`: middle steps in order, but the last step counts everyone who did the
 *   first step and later the last one.
 */
export async function funnel(targets: Target[], scope: Scope, steps: FunnelStep[], mode: FunnelMode = 'sequential'): Promise<FunnelResult> {
	if (steps.length < 2 || steps.length > MAX_FUNNEL_STEPS) throw new QueryError(`a funnel has 2 to ${MAX_FUNNEL_STEPS} steps`)
	const counts = await funnelCounts(targets, scope, steps, mode === 'strict')
	if (mode === 'flexible' && steps.length > 2) {
		const short = await funnelCounts(targets, scope, [steps[0], steps[steps.length - 1]], false)
		counts.steps[steps.length - 1] = short.steps[1]
	}
	const c = counts.steps
	const first = c[0] || 0
	return {
		mode,
		entered: counts.entered,
		completed: c[c.length - 1],
		steps: steps.map((s, i) => ({
			label: s.label || (s.kind === 'page' ? `Visit ${s.match}` : s.match),
			visitors: c[i],
			conversion: round(ratio(c[i], first) * 100),
			dropoff: i === 0 ? 0 : Math.max(0, c[i - 1] - c[i]),
		})),
	}
}

async function funnelCounts(targets: Target[], scope: Scope, steps: FunnelStep[], strict: boolean): Promise<{ entered: number; steps: number[] }> {
	const counts = new Array(steps.length).fill(0)
	let entered = 0
	await Promise.all(
		targets.map(async ({ run, window }) => {
			const p: unknown[] = []
			let sql = `WITH ev AS (SELECT e.visitor_id AS v, e.name, e.pathname, e.ts${strict ? ', ROW_NUMBER() OVER (PARTITION BY e.visitor_id ORDER BY e.ts, e.rowid) AS rn' : ''}
				FROM events e WHERE ${eventWhere(scope, window, p)} AND e.visitor_id <> '')`
			steps.forEach((step, i) => {
				const a = i === 0 ? '' : 'ev.'
				let match: string
				if (step.kind === 'page') {
					match = `${a}name = 'pageview' AND ${a}pathname LIKE ? ESCAPE '\\'`
					p.push(step.match.replace(/[\\%_]/g, (c) => '\\' + c).replace(/\*/g, '%'))
				} else {
					match = `${a}name = ?`
					p.push(step.match)
				}
				if (strict) {
					// every event that matches the step right after the previous step's event
					sql +=
						i === 0
							? `, s0 AS (SELECT v, rn FROM ev WHERE ${match})`
							: `, s${i} AS (SELECT ev.v, ev.rn FROM ev JOIN s${i - 1} AS p ON p.v = ev.v AND ev.rn = p.rn + 1 WHERE ${match})`
				} else {
					// the earliest time each visitor reached the step
					sql +=
						i === 0
							? `, s0 AS (SELECT v, MIN(ts) AS t FROM ev WHERE ${match} GROUP BY v)`
							: `, s${i} AS (SELECT ev.v, MIN(ev.ts) AS t FROM ev JOIN s${i - 1} AS p ON p.v = ev.v WHERE ev.ts >= p.t AND ${match} GROUP BY ev.v)`
				}
			})
			sql += ` SELECT (SELECT COUNT(DISTINCT v) FROM ev) AS entered, ${steps.map((_, i) => `(SELECT COUNT(DISTINCT v) FROM s${i}) AS c${i}`).join(', ')}`
			const [rows] = await run([{ sql, params: p }])
			const r = rows[0] ?? {}
			entered += num(r.entered)
			steps.forEach((_, i) => (counts[i] += num(r[`c${i}`])))
		}),
	)
	return { entered, steps: counts }
}

// ---------------------------------------------------------------- realtime

export async function realtime(targets: Target[], scope: Scope, now = Date.now()): Promise<Realtime> {
	const live: Window = { from: now - 5 * MINUTE, to: now + MINUTE }
	const recent: Window = { from: now - 30 * MINUTE, to: now + MINUTE }
	const out: Realtime = { visitors: 0, pageviews: 0, minutes: [], pages: [], sources: [], countries: [], feed: [] }
	const minutes = new Map<number, { pageviews: number; visitors: number }>()
	const tops = { pages: new Map<string, number>(), sources: new Map<string, number>(), countries: new Map<string, number>() }
	const within = (w: Window, t: Window): Window | null => {
		const from = Math.max(w.from, t.from)
		const to = Math.min(w.to, t.to)
		return from < to ? { from, to } : null
	}
	await Promise.all(
		targets.map(async ({ run, window }) => {
			const lw = within(live, window)
			const rw = within(recent, window)
			if (!rw) return
			const stmts: Stmt[] = []
			const add = (build: (p: unknown[]) => string) => {
				const p: unknown[] = []
				stmts.push({ sql: build(p), params: p })
			}
			add((p) => `SELECT (e.ts / ${MINUTE}) * ${MINUTE} AS t, SUM(e.name = 'pageview') AS pageviews, COUNT(DISTINCT NULLIF(e.visitor_id, '')) AS visitors FROM events e WHERE ${eventWhere(scope, rw, p)} GROUP BY t`)
			add((p) => `SELECT e.ts, e.name, e.pathname, e.country, e.city, e.browser, e.device, e.source FROM events e WHERE ${eventWhere(scope, rw, p)} ORDER BY e.ts DESC LIMIT 40`)
			if (lw) {
				add((p) => `SELECT COUNT(DISTINCT NULLIF(e.visitor_id, '')) AS visitors, SUM(e.name = 'pageview') AS pageviews FROM events e WHERE ${eventWhere(scope, lw, p)}`)
				for (const col of ['pathname', 'source', 'country']) {
					add((p) => `SELECT ${KEY('e.' + col)} AS key, COUNT(DISTINCT NULLIF(e.visitor_id, '')) AS visitors FROM events e WHERE ${eventWhere(scope, lw, p)} GROUP BY key ORDER BY visitors DESC LIMIT 8`)
				}
			}
			const [mins, feed, totals, pages, sources, countries] = await run(stmts)
			for (const r of mins) {
				const m = minutes.get(num(r.t)) ?? { pageviews: 0, visitors: 0 }
				m.pageviews += num(r.pageviews)
				m.visitors += num(r.visitors)
				minutes.set(num(r.t), m)
			}
			for (const r of feed) out.feed.push(r as unknown as Realtime['feed'][number])
			if (totals?.[0]) {
				out.visitors += num(totals[0].visitors)
				out.pageviews += num(totals[0].pageviews)
			}
			const tally = (m: Map<string, number>, rows?: Row[]) => rows?.forEach((r) => m.set(String(r.key), (m.get(String(r.key)) ?? 0) + num(r.visitors)))
			tally(tops.pages, pages)
			tally(tops.sources, sources)
			tally(tops.countries, countries)
		}),
	)
	// up to the minute that contains now (the window runs a minute ahead for clock skew)
	out.minutes = bucketsIn({ from: recent.from, to: now + 1 }, 'minute', 0).map((t) => ({ t, ...(minutes.get(t) ?? { pageviews: 0, visitors: 0 }) }))
	const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([key, visitors]) => ({ key, visitors }))
	out.pages = top(tops.pages)
	out.sources = top(tops.sources)
	out.countries = top(tops.countries)
	out.feed = out.feed.sort((a, b) => b.ts - a.ts).slice(0, 40)
	return out
}

export type { DimScope }

// ---------------------------------------------------------------- journeys

export interface JourneyResult {
	direction: 'forward' | 'backward'
	path: string[]
	/** visitors who followed `path` */
	visitors: number
	/** where they went next (or came from), with "(exit)" / "(entrance)" for the end of the visit */
	steps: { key: string; visitors: number; share: number }[]
}

const JOURNEY_MAX = 6

/**
 * User journeys: the pages visitors go to next after following a path of pages (or,
 * backward, where they came from before it). Pages are taken in visit order with
 * reloads of the same page folded together. Counts are visitors, so shards add up.
 */
export async function journeys(
	targets: Target[],
	scope: Scope,
	opts: { path?: string[]; direction?: 'forward' | 'backward'; limit?: number } = {},
): Promise<JourneyResult> {
	const path = (opts.path ?? []).filter(Boolean).slice(0, JOURNEY_MAX)
	const back = opts.direction === 'backward'
	const limit = Math.min(Math.max(opts.limit ?? 12, 1), 50)
	const totals = new Map<string, number>()
	let visitors = 0
	await Promise.all(
		targets.map(async ({ run, window }) => {
			const p: unknown[] = []
			// where visits end: the page whose number is the visit's page count. A window, since
			// a subquery per row reads the whole visit list again for every page.
			const exits = back && !path.length
			let sql = `WITH raw AS (SELECT e.session_id AS sid, e.visitor_id AS v, e.pathname AS p, e.ts, e.rowid AS rid,
					LAG(e.pathname) OVER (PARTITION BY e.session_id ORDER BY e.ts, e.rowid) AS prev
					FROM events e WHERE ${eventWhere(scope, window, p)} AND e.name = 'pageview'),
				pv AS (SELECT sid, v, p, ROW_NUMBER() OVER (PARTITION BY sid ORDER BY ts, rid) AS rn${exits ? ', COUNT(*) OVER (PARTITION BY sid) AS pages' : ''} FROM raw WHERE prev IS NULL OR prev <> p)`
			if (!path.length) {
				// the first step: where visits start (or end)
				const edge = exits ? 'rn = pages' : 'rn = 1'
				sql += ` SELECT p AS key, COUNT(DISTINCT v) AS visitors FROM pv WHERE ${edge} GROUP BY key ORDER BY visitors DESC LIMIT ${ROW_CAP}`
			} else {
				// sessions where the path appears as consecutive pages; keep each session's first match
				const joins = path
					.slice(1)
					.map((_, i) => `JOIN pv s${i + 1} ON s${i + 1}.sid = s0.sid AND s${i + 1}.rn = s0.rn + ${i + 1} AND s${i + 1}.p = ?`)
					.join(' ')
				p.push(...path.slice(1), path[0])
				sql += `, m AS (SELECT s0.sid, s0.v, MIN(s0.rn) AS first, MIN(s0.rn) + ${path.length - 1} AS last FROM pv s0 ${joins} WHERE s0.p = ? GROUP BY s0.sid)
					SELECT COALESCE(n.p, '${back ? '(entrance)' : '(exit)'}') AS key, COUNT(DISTINCT m.v) AS visitors
					FROM m LEFT JOIN pv n ON n.sid = m.sid AND n.rn = ${back ? 'm.first - 1' : 'm.last + 1'}
					GROUP BY key ORDER BY visitors DESC LIMIT ${ROW_CAP}`
			}
			const totalSql = path.length
				? sql.replace(/SELECT COALESCE[\s\S]*$/, 'SELECT COUNT(DISTINCT v) AS visitors FROM m')
				: sql.replace(/SELECT p AS key[\s\S]*$/, 'SELECT COUNT(DISTINCT v) AS visitors FROM pv')
			const [rows, total] = await run([
				{ sql, params: p },
				{ sql: totalSql, params: p },
			])
			for (const r of rows) totals.set(String(r.key), (totals.get(String(r.key)) ?? 0) + num(r.visitors))
			visitors += num(total[0]?.visitors)
		}),
	)
	const steps = [...totals.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.slice(0, limit)
		.map(([key, v]) => ({ key, visitors: v, share: round(ratio(v, visitors) * 100) }))
	return { direction: back ? 'backward' : 'forward', path, visitors, steps }
}

// ---------------------------------------------------------------- page interactions
// Reports over `events.detail` (EventDetail): clicks, scroll, site search, errors, forms,
// media and content. Each engagement beacon appends its lists to its pageview's row, and
// every number in a beacon is a delta, so sums over the list entries are exact. Visitor
// counts stay additive across shards like everywhere else. GROUP BY is by position: names
// like `name` and `source` would otherwise mean the events columns.

const BEHAVIOR_CAP = 500
const at = (alias: string, i: number) => `json_extract(${alias}.value, '$[${i}]')`
const ENGAGED = `AND e.name = 'pageview' AND e.detail IS NOT NULL`

/** Runs one statement builder per shard and hands every shard's rows to `merge`. */
async function perShard(targets: Target[], build: (w: Window) => Stmt[]): Promise<Row[][][]> {
	return Promise.all(targets.map(({ run, window }) => run(build(window))))
}

/** Sums numeric fields of `r` into the row kept under `key`; other fields keep their first value. */
function mergeRow(into: Map<string, Row>, key: string, r: Row, sum: string[]) {
	const cur = into.get(key)
	if (!cur) {
		const fresh: Row = { ...r }
		for (const k of sum) fresh[k] = num(r[k])
		into.set(key, fresh)
		return
	}
	for (const k of sum) cur[k] = num(cur[k]) + num(r[k])
	for (const k of Object.keys(r)) if (cur[k] == null && r[k] != null) cur[k] = r[k]
}

const clampLimit = (limit: number | undefined, dflt = 50) => Math.min(Math.max(limit ?? dflt, 1), BEHAVIOR_CAP)

export interface ClickElement {
	page: string
	selector: string
	label: string
	clicks: number
	visitors: number
	rage: number
	dead: number
}

export interface ClickMap {
	/** pageviews and visitors of the pages in scope, the denominators for click rates */
	pageviews: number
	visitors: number
	clicks: number
	rage: number
	dead: number
	elements: ClickElement[]
	/** some shard had more elements than the row cap, so rare ones may be missing */
	truncated?: boolean
}

/** Clicks per element (selector) and page, with rage and dead clicks. */
export async function clickMap(targets: Target[], scope: Scope, opts: { limit?: number } = {}): Promise<ClickMap> {
	const out: ClickMap = { pageviews: 0, visitors: 0, clicks: 0, rage: 0, dead: 0, elements: [] }
	const rows = new Map<string, Row>()
	const sums = ['clicks', 'visitors', 'rage', 'dead']
	const results = await perShard(targets, (w) => {
		const p1: unknown[] = []
		const p2: unknown[] = []
		const p3: unknown[] = []
		return [
			{
				sql: `SELECT e.pathname AS page, ${at('j', 0)} AS selector, MAX(${at('j', 1)}) AS label, SUM(${at('j', 2)}) AS clicks,
					SUM(${at('j', 3)}) AS rage, SUM(${at('j', 4)}) AS dead, COUNT(DISTINCT NULLIF(e.visitor_id, '')) AS visitors
					FROM events e, json_each(e.detail, '$.c') j WHERE ${eventWhere(scope, w, p1)} ${ENGAGED}
					GROUP BY 1, 2 ORDER BY clicks DESC LIMIT ${BEHAVIOR_CAP}`,
				params: p1,
			},
			{
				sql: `SELECT SUM(${at('j', 2)}) AS clicks, SUM(${at('j', 3)}) AS rage, SUM(${at('j', 4)}) AS dead
					FROM events e, json_each(e.detail, '$.c') j WHERE ${eventWhere(scope, w, p2)} ${ENGAGED}`,
				params: p2,
			},
			{
				sql: `SELECT COUNT(*) AS pageviews, COUNT(DISTINCT NULLIF(e.visitor_id, '')) AS visitors FROM events e WHERE ${eventWhere(scope, w, p3)} AND e.name = 'pageview'`,
				params: p3,
			},
		]
	})
	for (const [elements, totals, views] of results) {
		if (elements.length >= BEHAVIOR_CAP) out.truncated = true
		for (const r of elements) mergeRow(rows, `${r.page}\u0000${r.selector}`, r, sums)
		out.clicks += num(totals[0]?.clicks)
		out.rage += num(totals[0]?.rage)
		out.dead += num(totals[0]?.dead)
		out.pageviews += num(views[0]?.pageviews)
		out.visitors += num(views[0]?.visitors)
	}
	out.elements = [...rows.values()]
		.sort((a, b) => num(b.clicks) - num(a.clicks) || String(a.selector).localeCompare(String(b.selector)))
		.slice(0, clampLimit(opts.limit))
		.map((r) => ({ page: String(r.page), selector: String(r.selector), label: String(r.label ?? ''), clicks: num(r.clicks), visitors: num(r.visitors), rage: num(r.rage), dead: num(r.dead) }))
	return out
}

export interface ScrollMap {
	/** visits that sent scroll depth for the pages in scope */
	visits: number
	/** average of each visit's deepest scroll, percent */
	average: number
	/** share of those visits that scrolled at least `depth` percent, 0 to 100 in steps of 10 */
	reached: { depth: number; visits: number; share: number }[]
}

/** How far down people scroll: each visit's deepest scroll on a page, in steps of 10%. */
export async function scrollMap(targets: Target[], scope: Scope): Promise<ScrollMap> {
	const buckets = new Array(11).fill(0)
	let total = 0
	const results = await perShard(targets, (w) => {
		const p: unknown[] = []
		return [
			{
				sql: `SELECT MIN(CAST(depth / 10 AS INTEGER), 10) AS b, COUNT(*) AS visits, SUM(depth) AS total
					FROM (SELECT MAX(e.scroll_depth) AS depth FROM events e WHERE ${eventWhere(scope, w, p)} AND e.name = 'pageview' AND e.scroll_depth IS NOT NULL
						GROUP BY e.session_id, e.pathname)
					GROUP BY b`,
				params: p,
			},
		]
	})
	for (const [rows] of results)
		for (const r of rows) {
			buckets[Math.max(0, Math.min(10, num(r.b)))] += num(r.visits)
			total += num(r.total)
		}
	const visits = buckets.reduce((a, b) => a + b, 0)
	let atLeast = visits
	const reached = buckets.map((n, i) => {
		const row = { depth: i * 10, visits: atLeast, share: round(ratio(atLeast, visits) * 100) }
		atLeast -= n
		return row
	})
	return { visits, average: Math.round(ratio(total, visits)), reached }
}

export interface SiteSearch {
	searches: number
	/** visitors who searched */
	visitors: number
	/** every visitor in scope, for the share who searched */
	total_visitors: number
	terms: { term: string; searches: number; visitors: number }[]
	truncated?: boolean
}

/** What people searched for on the site, read from the search parameter of the page URL. */
export async function siteSearch(targets: Target[], scope: Scope, opts: { limit?: number } = {}): Promise<SiteSearch> {
	const out: SiteSearch = { searches: 0, visitors: 0, total_visitors: 0, terms: [] }
	const terms = new Map<string, Row>()
	const term = `json_extract(e.detail, '$.q')`
	const results = await perShard(targets, (w) => {
		const p1: unknown[] = []
		const p2: unknown[] = []
		return [
			{
				sql: `SELECT ${term} AS term, COUNT(*) AS searches, COUNT(DISTINCT NULLIF(e.visitor_id, '')) AS visitors
					FROM events e WHERE ${eventWhere(scope, w, p1)} AND e.name = 'pageview' AND e.detail IS NOT NULL AND ${term} IS NOT NULL
					GROUP BY 1 ORDER BY searches DESC LIMIT ${BEHAVIOR_CAP}`,
				params: p1,
			},
			{
				sql: `SELECT COUNT(CASE WHEN e.name = 'pageview' AND ${term} IS NOT NULL THEN 1 END) AS searches,
					COUNT(DISTINCT CASE WHEN e.name = 'pageview' AND ${term} IS NOT NULL THEN NULLIF(e.visitor_id, '') END) AS visitors,
					COUNT(DISTINCT NULLIF(e.visitor_id, '')) AS total_visitors
					FROM events e WHERE ${eventWhere(scope, w, p2)}`,
				params: p2,
			},
		]
	})
	for (const [rows, totals] of results) {
		if (rows.length >= BEHAVIOR_CAP) out.truncated = true
		for (const r of rows) mergeRow(terms, String(r.term), r, ['searches', 'visitors'])
		out.searches += num(totals[0]?.searches)
		out.visitors += num(totals[0]?.visitors)
		out.total_visitors += num(totals[0]?.total_visitors)
	}
	out.terms = [...terms.values()]
		.sort((a, b) => num(b.searches) - num(a.searches) || String(a.term).localeCompare(String(b.term)))
		.slice(0, clampLimit(opts.limit))
		.map((r) => ({ term: String(r.term), searches: num(r.searches), visitors: num(r.visitors) }))
	return out
}

export interface ErrorRow {
	message: string
	/** script URL with line and column, without its query */
	source: string
	count: number
	visitors: number
	last_seen: number
	/** up to five pages and browsers it happened on */
	pages: string[]
	browsers: string[]
}

export interface ErrorReport {
	count: number
	/** visitors who hit at least one error */
	visitors: number
	errors: ErrorRow[]
	truncated?: boolean
}

/** JavaScript errors visitors ran into, grouped by message and source. */
export async function errorReport(targets: Target[], scope: Scope, opts: { limit?: number } = {}): Promise<ErrorReport> {
	const out: ErrorReport = { count: 0, visitors: 0, errors: [] }
	const errors = new Map<string, Row & { pageSet: Set<string>; browserSet: Set<string> }>()
	const results = await perShard(targets, (w) => {
		const p1: unknown[] = []
		const p2: unknown[] = []
		return [
			{
				sql: `SELECT ${at('j', 0)} AS message, ${at('j', 1)} AS source, SUM(${at('j', 2)}) AS count, COUNT(DISTINCT NULLIF(e.visitor_id, '')) AS visitors,
					MAX(e.ts) AS last_seen, json_group_array(DISTINCT e.pathname) AS pages, json_group_array(DISTINCT e.browser) AS browsers
					FROM events e, json_each(e.detail, '$.x') j WHERE ${eventWhere(scope, w, p1)} ${ENGAGED}
					GROUP BY 1, 2 ORDER BY count DESC LIMIT ${BEHAVIOR_CAP}`,
				params: p1,
			},
			{
				sql: `SELECT SUM(${at('j', 2)}) AS count, COUNT(DISTINCT NULLIF(e.visitor_id, '')) AS visitors
					FROM events e, json_each(e.detail, '$.x') j WHERE ${eventWhere(scope, w, p2)} ${ENGAGED}`,
				params: p2,
			},
		]
	})
	const parse = (v: unknown): string[] => {
		try {
			const a = JSON.parse(String(v ?? '[]'))
			return Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string') : []
		} catch {
			return []
		}
	}
	for (const [rows, totals] of results) {
		if (rows.length >= BEHAVIOR_CAP) out.truncated = true
		for (const r of rows) {
			const key = `${r.message}\u0000${r.source}`
			const cur = errors.get(key)
			if (!cur) {
				errors.set(key, { ...r, count: num(r.count), visitors: num(r.visitors), last_seen: num(r.last_seen), pageSet: new Set(parse(r.pages)), browserSet: new Set(parse(r.browsers)) })
				continue
			}
			cur.count = num(cur.count) + num(r.count)
			cur.visitors = num(cur.visitors) + num(r.visitors)
			cur.last_seen = Math.max(num(cur.last_seen), num(r.last_seen))
			for (const p of parse(r.pages)) cur.pageSet.add(p)
			for (const b of parse(r.browsers)) cur.browserSet.add(b)
		}
		out.count += num(totals[0]?.count)
		out.visitors += num(totals[0]?.visitors)
	}
	out.errors = [...errors.values()]
		.sort((a, b) => num(b.count) - num(a.count) || num(b.last_seen) - num(a.last_seen))
		.slice(0, clampLimit(opts.limit))
		.map((r) => ({
			message: String(r.message),
			source: String(r.source ?? ''),
			count: num(r.count),
			visitors: num(r.visitors),
			last_seen: num(r.last_seen),
			pages: [...r.pageSet].sort().slice(0, 5),
			browsers: [...r.browserSet].sort().slice(0, 5),
		}))
	return out
}

export interface FormField {
	field: string
	/** page views where someone focused the field */
	interactions: number
	/** page views that left the form at this field: the last one touched, and no submit */
	dropoffs: number
	/** where the field sits in its form, for ordering */
	position: number
}

export interface FormRow {
	form: string
	/** page views where someone started filling in the form */
	starts: number
	submissions: number
	/** submissions over starts, percent */
	conversion: number
	/** visitors who started the form */
	visitors: number
	fields: FormField[]
}

/** Form analytics: starts, submissions and, per field, how many people reached it and gave up there. */
export async function formReport(targets: Target[], scope: Scope, opts: { limit?: number } = {}): Promise<{ forms: FormRow[] }> {
	const forms = new Map<string, Row>()
	const fields = new Map<string, Row>()
	const results = await perShard(targets, (w) => {
		const p1: unknown[] = []
		const p2: unknown[] = []
		return [
			{
				sql: `SELECT ${at('f', 0)} AS form, SUM(${at('f', 1)}) AS starts, SUM(${at('f', 2)}) AS submissions,
					COUNT(DISTINCT CASE WHEN ${at('f', 1)} > 0 THEN NULLIF(e.visitor_id, '') END) AS visitors
					FROM events e, json_each(e.detail, '$.f') f WHERE ${eventWhere(scope, w, p1)} ${ENGAGED}
					GROUP BY 1 ORDER BY starts DESC LIMIT ${BEHAVIOR_CAP}`,
				params: p1,
			},
			{
				sql: `SELECT ${at('g', 0)} AS form, ${at('g', 1)} AS field, MIN(${at('g', 2)}) AS position, SUM(${at('g', 3)}) AS interactions, SUM(${at('g', 4)}) AS dropoffs
					FROM events e, json_each(e.detail, '$.g') g WHERE ${eventWhere(scope, w, p2)} ${ENGAGED}
					GROUP BY 1, 2 ORDER BY interactions DESC LIMIT ${BEHAVIOR_CAP * 4}`,
				params: p2,
			},
		]
	})
	for (const [formRows, fieldRows] of results) {
		for (const r of formRows) mergeRow(forms, String(r.form), r, ['starts', 'submissions', 'visitors'])
		for (const r of fieldRows) {
			const key = `${r.form}\u0000${r.field}`
			const cur = fields.get(key)
			mergeRow(fields, key, r, ['interactions', 'dropoffs'])
			if (cur) cur.position = Math.min(num(cur.position), num(r.position))
		}
	}
	const byForm = new Map<string, FormField[]>()
	for (const r of fields.values()) {
		const list = byForm.get(String(r.form)) ?? []
		list.push({ field: String(r.field), interactions: num(r.interactions), dropoffs: Math.max(0, num(r.dropoffs)), position: num(r.position) })
		byForm.set(String(r.form), list)
	}
	return {
		forms: [...forms.values()]
			.sort((a, b) => num(b.starts) - num(a.starts) || String(a.form).localeCompare(String(b.form)))
			.slice(0, clampLimit(opts.limit, 20))
			.map((r) => ({
				form: String(r.form),
				starts: num(r.starts),
				submissions: num(r.submissions),
				conversion: Math.min(100, round(ratio(num(r.submissions), num(r.starts)) * 100)),
				visitors: num(r.visitors),
				fields: (byForm.get(String(r.form)) ?? []).sort((a, b) => a.position - b.position || b.interactions - a.interactions),
			})),
	}
}

export interface MediaRow {
	name: string
	type: 'video' | 'audio'
	plays: number
	/** visitors who played it */
	visitors: number
	/** share of plays that reached 25%, 50%, 75% and the end (95%) */
	reached: [number, number, number, number]
}

/** Video and audio: plays, and how far into them people got. */
export async function mediaReport(targets: Target[], scope: Scope, opts: { limit?: number } = {}): Promise<{ media: MediaRow[] }> {
	const media = new Map<string, Row>()
	const results = await perShard(targets, (w) => {
		const p: unknown[] = []
		return [
			{
				sql: `SELECT ${at('j', 0)} AS name, MAX(${at('j', 1)}) AS type, SUM(${at('j', 2)}) AS plays,
					SUM(${at('j', 3)}) AS m0, SUM(${at('j', 4)}) AS m1, SUM(${at('j', 5)}) AS m2, SUM(${at('j', 6)}) AS m3,
					COUNT(DISTINCT CASE WHEN ${at('j', 2)} > 0 THEN NULLIF(e.visitor_id, '') END) AS visitors
					FROM events e, json_each(e.detail, '$.m') j WHERE ${eventWhere(scope, w, p)} ${ENGAGED}
					GROUP BY 1 ORDER BY plays DESC LIMIT ${BEHAVIOR_CAP}`,
				params: p,
			},
		]
	})
	for (const [rows] of results) for (const r of rows) mergeRow(media, String(r.name), r, ['plays', 'visitors', 'm0', 'm1', 'm2', 'm3'])
	return {
		media: [...media.values()]
			.sort((a, b) => num(b.plays) - num(a.plays) || String(a.name).localeCompare(String(b.name)))
			.slice(0, clampLimit(opts.limit))
			.map((r) => {
				const plays = num(r.plays)
				const share = (k: string) => Math.min(100, round(ratio(num(r[k]), plays) * 100))
				return { name: String(r.name), type: r.type === 'audio' ? 'audio' : 'video', plays, visitors: num(r.visitors), reached: [share('m0'), share('m1'), share('m2'), share('m3')] }
			}),
	}
}

export interface ContentRow {
	name: string
	impressions: number
	clicks: number
	/** clicks over impressions, percent */
	ctr: number
	/** visitors who saw it */
	visitors: number
}

/** Elements tagged data-misomoon-content: how often they were seen and clicked. */
export async function contentReport(targets: Target[], scope: Scope, opts: { limit?: number } = {}): Promise<{ content: ContentRow[] }> {
	const content = new Map<string, Row>()
	const results = await perShard(targets, (w) => {
		const p: unknown[] = []
		return [
			{
				sql: `SELECT ${at('j', 0)} AS name, SUM(${at('j', 1)}) AS impressions, SUM(${at('j', 2)}) AS clicks,
					COUNT(DISTINCT CASE WHEN ${at('j', 1)} > 0 THEN NULLIF(e.visitor_id, '') END) AS visitors
					FROM events e, json_each(e.detail, '$.o') j WHERE ${eventWhere(scope, w, p)} ${ENGAGED}
					GROUP BY 1 ORDER BY impressions DESC LIMIT ${BEHAVIOR_CAP}`,
				params: p,
			},
		]
	})
	for (const [rows] of results) for (const r of rows) mergeRow(content, String(r.name), r, ['impressions', 'clicks', 'visitors'])
	return {
		content: [...content.values()]
			.sort((a, b) => num(b.impressions) - num(a.impressions) || String(a.name).localeCompare(String(b.name)))
			.slice(0, clampLimit(opts.limit))
			.map((r) => ({
				name: String(r.name),
				impressions: num(r.impressions),
				clicks: num(r.clicks),
				ctr: Math.min(100, round(ratio(num(r.clicks), num(r.impressions)) * 100)),
				visitors: num(r.visitors),
			})),
	}
}
