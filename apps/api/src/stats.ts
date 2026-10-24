import {
	aggregate,
	aggregateMany,
	ALL_PROPS,
	breakdown,
	clickMap,
	contentReport,
	DIMENSIONS,
	errorReport,
	formReport,
	funnel,
	isDimension,
	isTimeZone,
	normalizePath,
	offsetAt,
	parseFilters,
	planWindow,
	previousWindow,
	yearAgoWindow,
	QueryError,
	journeys,
	mediaReport,
	realtime,
	resolvePeriod,
	SEARCH_TERMS,
	scrollMap,
	siteSearch,
	timeseries,
	toCsv,
	zipFiles,
	vitals,
	type Filter,
	type FunnelMode,
	type FunnelStep,
	type Interval,
	type Scope,
	type Target,
	type Window,
} from '@misomoon/core'
import { authorize, SYSTEM, type Principal } from './auth'
import { d1Runner, getRanges, HttpError, shardReader, type Site } from './control'
import { searchTerms } from './searchconsole'

export interface StatsInput {
	site?: string
	period?: string
	from?: string
	to?: string
	filters?: string
	compare?: boolean | string
	interval?: string
	property?: string
	limit?: number | string
	page?: number | string
	search?: string
	/** '0' leaves imported history out */
	imported?: string | boolean
}

export interface Goal {
	id: string
	site_id: string
	name: string
	kind: 'event' | 'page'
	match: string
}

interface Prepared {
	site: Site
	scope: Scope
	/** the scope conversion rates divide by: no goal, event or property filters */
	totalScope: Scope
	window: Window
	interval: Interval
	compare: boolean
	/** the comparison window for a window: the previous period, or a year earlier */
	before: (w: Window) => Window
	targets: (w: Window) => Promise<Target[]>
}

const INTERVALS: Interval[] = ['minute', 'hour', 'day', 'week', 'month']
const FUNNEL_MODES: FunnelMode[] = ['sequential', 'strict', 'flexible']

export async function listGoals(env: Env, siteId: string): Promise<Goal[]> {
	const { results } = await env.CONTROL.prepare('SELECT id, site_id, name, kind, match FROM goals WHERE site_id = ? ORDER BY created_at').bind(siteId).all<Goal>()
	return results
}

/** `goal==Signup` becomes an event or page filter using the goal's definition. */
async function resolveGoalFilters(env: Env, siteId: string, filters: Filter[]): Promise<Filter[]> {
	if (!filters.some((f) => f.dim === 'goal')) return filters
	const goals = await listGoals(env, siteId)
	return filters.map((f) => {
		if (f.dim !== 'goal') return f
		const matched = f.values.map((v) => goals.find((g) => g.name === v) ?? null)
		if (matched.some((g) => !g)) throw new QueryError(`unknown goal in filter: ${f.values.join(', ')}`)
		const kinds = new Set(matched.map((g) => g!.kind))
		if (kinds.size > 1) throw new QueryError('one goal filter cannot mix page and event goals')
		return { dim: matched[0]!.kind === 'page' ? 'page' : 'event', op: f.op, values: matched.map((g) => g!.match) }
	})
}

export async function prepare(env: Env, who: Principal, input: StatsInput): Promise<Prepared> {
	const site = await authorize(env, who, input.site)
	if (input.filters != null && typeof input.filters !== 'string') throw new HttpError(400, 'filters must be a string')
	if (input.period != null && typeof input.period !== 'string') throw new HttpError(400, 'period must be a string')
	// Each instant uses the zone's own offset, so days stay local across DST changes.
	const zone = isTimeZone(site.timezone) ? site.timezone : 'UTC'
	const ranges = await getRanges(env, site.id)
	const since = input.period === 'all' ? await firstSeen(env, site, ranges) : site.created_at
	const period = resolvePeriod(input.period || '30d', zone, Date.now(), { from: input.from, to: input.to, since })
	const interval = (INTERVALS as string[]).includes(input.interval ?? '') ? (input.interval as Interval) : period.interval
	let parsed = parseFilters(input.filters)
	// A shared link limited to a segment always applies the segment's filters.
	if (who.share?.filters) {
		const forced = parseFilters(who.share.filters)
		parsed = [...forced, ...parsed.filter((f) => !forced.some((g) => g.dim === f.dim))]
	}
	const filters = await resolveGoalFilters(env, site.id, parsed)
	const scope = { siteId: site.id, filters, tz: zone, currency: site.currency, imported: input.imported !== '0' && input.imported !== false }
	return {
		site,
		scope,
		totalScope: { ...scope, filters: parsed.filter((f) => f.dim !== 'goal' && f.dim !== 'event' && !f.dim.startsWith('prop:')) },
		window: { from: period.from, to: period.to },
		interval,
		compare: input.compare === true || input.compare === 'true' || input.compare === '1' || input.compare === 'previous' || input.compare === 'year',
		before: input.compare === 'year' ? yearAgoWindow : previousWindow,
		targets: async (w) =>
			Promise.all(planWindow(ranges, w).map(async (p) => ({ run: d1Runner(await shardReader(env, p.shard)), window: p.window }))),
	}
}

/** When a site's stats start, for "all time": its first visit (history can be backfilled), else its creation. */
async function firstSeen(env: Env, site: Site, ranges: { shard: string }[]): Promise<number> {
	if (!ranges.length) return site.created_at
	const row = await (await shardReader(env, ranges[0].shard)).prepare('SELECT MIN(started_at) AS t FROM sessions WHERE site_id = ?').bind(site.id).first<{ t: number | null }>()
	return Math.min(row?.t ?? site.created_at, site.created_at)
}

function change(cur: number, prev: number): number | null {
	if (!prev) return cur ? null : 0
	return Math.round(((cur - prev) / prev) * 1000) / 10
}

/** One decimal, rounding halves away from zero after float noise (45.26 - 40.11 is 5.149999…). */
function points(d: number): number {
	const tenths = Number((Math.abs(d) * 10).toFixed(6))
	return (Math.sign(d) * Math.round(tenths)) / 10 || 0
}

/** Change per metric vs the previous period: percent, except bounce rate in percentage points. */
export function changes<T extends object>(current: T, previous: T): Record<keyof T, number | null> {
	const prev = previous as Record<string, number>
	return Object.fromEntries(
		Object.entries(current as Record<string, number>).map(([k, v]) => [k, k === 'bounce_rate' ? points(v - prev[k]) : change(v, prev[k])]),
	) as Record<keyof T, number | null>
}

export async function aggregateStats(env: Env, who: Principal, input: StatsInput) {
	const p = await prepare(env, who, input)
	const [current, previous] = await Promise.all([
		aggregate(await p.targets(p.window), p.scope),
		p.compare ? aggregate(await p.targets(p.before(p.window)), p.scope) : null,
	])
	return {
		site: p.site.id,
		window: p.window,
		current,
		previous,
		change: previous ? changes(current, previous) : null,
	}
}

export async function timeseriesStats(env: Env, who: Principal, input: StatsInput) {
	const p = await prepare(env, who, input)
	const prevWindow = p.before(p.window)
	const [points, previous] = await Promise.all([
		timeseries(await p.targets(p.window), p.scope, p.window, p.interval),
		p.compare ? timeseries(await p.targets(prevWindow), p.scope, prevWindow, p.interval) : null,
	])
	return { site: p.site.id, interval: p.interval, window: p.window, points, previous }
}

export async function breakdownStats(env: Env, who: Principal, input: StatsInput) {
	const property = input.property ?? 'page'
	if (property === 'goal') return goalConversions(env, who, input)
	if (property === SEARCH_TERMS) return searchTermStats(env, who, input)
	if (!isDimension(property) && property !== ALL_PROPS) throw new HttpError(400, `unknown property: ${property}`)
	const p = await prepare(env, who, input)
	const targets = await p.targets(p.window)
	const totals = await aggregate(targets, p.totalScope)
	const opts = { limit: Number(input.limit) || 10, page: Number(input.page) || 1, search: input.search }
	const result = await breakdown(targets, p.scope, property, { ...opts, totalVisitors: totals.visitors })
	if (!p.compare || property === ALL_PROPS) return result
	// The comparison window's top rows, as many as a page allows, matched by key. A key
	// missing from them had no visitors then, unless that list was cut short.
	const before = await breakdown(await p.targets(p.before(p.window)), p.scope, property, { limit: 200, search: input.search })
	const then = new Map(before.rows.map((r) => [r.key, r.visitors]))
	const complete = !before.has_more && !before.truncated
	return { ...result, rows: result.rows.map((r) => ({ ...r, previous_visitors: then.get(r.key) ?? (complete ? 0 : null) })) }
}

/** Google search terms for the period, from Search Console (clicks stand in for visitors). */
export async function searchTermStats(env: Env, who: Principal, input: StatsInput) {
	const p = await prepare(env, who, input)
	const limit = Math.min(Number(input.limit) || 10, 1000)
	const { rows, has_more } = await searchTerms(env, p.site, { window: p.window, tzOffset: offsetAt(p.scope.tz, p.window.from), filters: p.scope.filters, limit, page: Number(input.page) || 1, search: input.search })
	return { property: SEARCH_TERMS, rows, total_visitors: rows.reduce((n, r) => n + r.clicks, 0), has_more }
}

/** Conversions for every goal on the site, sorted by visitors, paged like a breakdown. */
export async function goalConversions(env: Env, who: Principal, input: StatsInput) {
	const p = await prepare(env, who, input)
	const needle = typeof input.search === 'string' ? input.search.toLowerCase() : ''
	const goals = (await listGoals(env, p.site.id)).filter((g) => g.name.toLowerCase().includes(needle))
	const targets = await p.targets(p.window)
	const filterFor = (g: Goal): Filter => ({ dim: g.kind === 'page' ? 'page' : 'event', op: '==', values: [g.match] })
	// one batch per shard for the total and every goal
	const [all, ...each] = await aggregateMany(targets, [p.totalScope, ...goals.map((g) => ({ ...p.scope, filters: [...p.scope.filters, filterFor(g)] }))])
	const total = all.visitors
	const rows = goals.map((g, i) => {
			const agg = each[i]
			return {
				key: g.name,
				kind: g.kind,
				match: g.match,
				visitors: agg.visitors,
				events: g.kind === 'page' ? agg.pageviews : agg.events,
				// A page goal's visitors may also buy elsewhere; only event goals own revenue.
				revenue: g.kind === 'event' ? agg.revenue : 0,
				average_revenue: g.kind === 'event' ? agg.average_revenue : 0,
				conversion_rate: total ? Math.round((agg.visitors / total) * 1000) / 10 : 0,
				pageviews: agg.pageviews,
				visits: agg.visits,
				bounce_rate: agg.bounce_rate,
				visit_duration: agg.visit_duration,
			}
		})
	rows.sort((a, b) => b.visitors - a.visitors)
	const limit = Math.min(Math.max(Number(input.limit) || 10, 1), 200)
	const start = (Math.max(Number(input.page) || 1, 1) - 1) * limit
	return { property: 'goal', rows: rows.slice(start, start + limit), total_visitors: total, has_more: rows.length > start + limit }
}

export async function realtimeStats(env: Env, who: Principal, input: StatsInput) {
	const p = await prepare(env, who, { ...input, period: 'realtime' })
	return realtime(await p.targets(p.window), p.scope)
}

export async function vitalsStats(env: Env, who: Principal, input: StatsInput) {
	const p = await prepare(env, who, input)
	return { site: p.site.id, window: p.window, vitals: await vitals(await p.targets(p.window), p.scope) }
}

export async function funnelStats(env: Env, who: Principal, input: StatsInput & { steps?: FunnelStep[]; funnel?: string; mode?: string }) {
	const p = await prepare(env, who, input)
	let steps = input.steps
	let saved: string | undefined
	if (!steps && input.funnel) {
		const row = await env.CONTROL.prepare('SELECT steps, mode FROM funnels WHERE id = ? AND site_id = ?').bind(input.funnel, p.site.id).first<{ steps: string; mode: string }>()
		if (!row) throw new HttpError(404, 'funnel not found')
		steps = JSON.parse(row.steps)
		saved = row.mode
	}
	if (!Array.isArray(steps)) throw new HttpError(400, 'steps are required')
	const want = input.mode ?? saved ?? ''
	const mode = (FUNNEL_MODES as string[]).includes(want) ? (want as FunnelMode) : 'sequential'
	return funnel(await p.targets(p.window), p.scope, cleanSteps(steps), mode)
}

/** Checks funnel steps from a request or a saved funnel. */
export function cleanSteps(steps: unknown[]): FunnelStep[] {
	return steps.map((x) => {
		const s = x as Partial<FunnelStep> | null
		if (!s || (s.kind !== 'page' && s.kind !== 'event') || typeof s.match !== 'string' || !s.match) throw new HttpError(400, 'each step needs kind page|event and match')
		if (s.label != null && typeof s.label !== 'string') throw new HttpError(400, 'step label must be text')
		return s.label == null ? { kind: s.kind, match: s.match.slice(0, 200) } : { kind: s.kind, match: s.match.slice(0, 200), label: s.label.slice(0, 80) }
	})
}

export function dimensions() {
	return Object.entries(DIMENSIONS).map(([key, d]) => ({ key, label: d.label }))
}

const EXPORTS: [file: string, property: string][] = [
	['channels', 'channel'], ['sources', 'source'], ['referrers', 'referrer'],
	['utm_sources', 'utm_source'], ['utm_mediums', 'utm_medium'], ['utm_campaigns', 'utm_campaign'], ['utm_contents', 'utm_content'], ['utm_terms', 'utm_term'],
	['pages', 'page'], ['entry_pages', 'entry_page'], ['exit_pages', 'exit_page'],
	['countries', 'country'], ['regions', 'region'], ['cities', 'city'],
	['browsers', 'browser'], ['browser_versions', 'browser_version'], ['operating_systems', 'os'], ['operating_system_versions', 'os_version'],
	['devices', 'device'], ['screens', 'screen'], ['languages', 'language'], ['custom_events', 'event'],
]
const BREAKDOWN_COLUMNS = ['visitors', 'visits', 'pageviews', 'bounce_rate', 'visit_duration']
const COLUMNS: Record<string, string[]> = {
	page: ['visitors', 'pageviews', 'bounce_rate', 'time_on_page', 'scroll_depth'],
	entry_page: ['visitors', 'visits', 'bounce_rate', 'visit_duration'],
	exit_page: ['visitors', 'visits', 'exit_rate'],
	event: ['visitors', 'events', 'conversion_rate', 'revenue', 'average_revenue'],
}

/** A zip of CSVs for the period and filters, one per report. */
export async function exportStats(env: Env, who: Principal, input: StatsInput): Promise<{ name: string; zip: Uint8Array }> {
	const p = await prepare(env, who, input)
	const targets = await p.targets(p.window)
	const day = (t: number) => new Date(t + offsetAt(p.scope.tz, t) * 60_000).toISOString().slice(0, 10)
	const total = (await aggregate(targets, p.totalScope)).visitors
	const [points, goals, ...tables] = await Promise.all([
		timeseries(targets, p.scope, p.window, p.interval === 'minute' || p.interval === 'hour' ? 'day' : p.interval),
		goalConversions(env, who, input),
		...EXPORTS.map(([, property]) => breakdown(targets, p.scope, property, { limit: 1000, maxLimit: 1000, totalVisitors: total })),
	])
	const files = [
		{
			name: 'visitors.csv',
			text: toCsv(
				['date', 'visitors', 'visits', 'pageviews', 'views_per_visit', 'bounce_rate', 'visit_duration', 'events', 'revenue'],
				points.map((pt) => ({ ...pt, date: day(pt.t) })),
			),
		},
		...EXPORTS.map(([file, property], i) => ({
			name: `${file}.csv`,
			text: toCsv(['name', ...(COLUMNS[property] ?? BREAKDOWN_COLUMNS)], tables[i].rows.map((r) => ({ ...r, name: r.key }))),
		})),
		{ name: 'conversions.csv', text: toCsv(['name', 'visitors', 'events', 'conversion_rate', 'revenue', 'average_revenue'], goals.rows.map((r) => ({ ...r, name: r.key }))) },
	]
	return { name: `misomoon_${p.site.id}_${day(p.window.from)}_${day(p.window.to - 1)}.zip`, zip: zipFiles(files) }
}

export async function journeyStats(env: Env, who: Principal, input: StatsInput & { path?: string | string[]; direction?: string }) {
	const p = await prepare(env, who, input)
	const path = Array.isArray(input.path) ? input.path : (input.path ?? '').split(',').map((s) => s.trim()).filter(Boolean)
	return journeys(await p.targets(p.window), p.scope, {
		path: path.map((s) => s.slice(0, 500)),
		direction: input.direction === 'backward' ? 'backward' : 'forward',
		limit: Number(input.limit) || 12,
	})
}

/** Pageviews in an exact window, unfiltered and without imports (for alerts). */
export async function pageviewsBetween(env: Env, siteId: string, from: number, to: number): Promise<number> {
	const p = await prepare(env, SYSTEM, { site: siteId, period: '24h', imported: '0' })
	return (await aggregate(await p.targets({ from, to }), p.scope)).pageviews
}

/** The page interaction reports, by the name the API and MCP use. */
export const BEHAVIOR_REPORTS = ['clicks', 'scroll', 'search', 'errors', 'forms', 'media', 'content'] as const
export type BehaviorReport = (typeof BEHAVIOR_REPORTS)[number]

/**
 * One page interaction report. `page` narrows it to one path (`*` wildcards allowed),
 * replacing any page filter, which is what the click and scroll maps need.
 */
export async function behaviorStats(env: Env, who: Principal, report: string, input: StatsInput & { page?: string }) {
	if (!(BEHAVIOR_REPORTS as readonly string[]).includes(report)) throw new HttpError(400, `unknown report: ${report}; use one of ${BEHAVIOR_REPORTS.join(', ')}`)
	if (input.page != null && (typeof input.page !== 'string' || /[;|]/.test(input.page))) throw new HttpError(400, 'page must be one path')
	const p = await prepare(env, who, input)
	const scope = input.page ? { ...p.scope, filters: [...p.scope.filters.filter((f) => f.dim !== 'page'), { dim: 'page', op: '==' as const, values: [normalizePath(input.page)] }] } : p.scope
	const targets = await p.targets(p.window)
	const limit = Number(input.limit) || undefined
	const head = { site: p.site.id, window: p.window, report, ...(input.page ? { page: input.page } : {}) }
	switch (report as BehaviorReport) {
		case 'clicks':
			return { ...head, ...(await clickMap(targets, scope, { limit })) }
		case 'scroll':
			return { ...head, ...(await scrollMap(targets, scope)) }
		case 'search':
			return { ...head, ...(await siteSearch(targets, scope, { limit })) }
		case 'errors':
			return { ...head, ...(await errorReport(targets, scope, { limit })) }
		case 'forms':
			return { ...head, ...(await formReport(targets, scope, { limit })) }
		case 'media':
			return { ...head, ...(await mediaReport(targets, scope, { limit })) }
		case 'content':
			return { ...head, ...(await contentReport(targets, scope, { limit })) }
	}
}
