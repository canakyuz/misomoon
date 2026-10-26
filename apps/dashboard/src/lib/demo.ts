import { demoKey, demoRoute, type DemoPeriod, type DemoSite } from './demo-key'
import { parseFilters, serializeFilters, type Filter } from './url'

// The demo dashboard (/demo) answers from recordings of the sample site (src/demo, made by
// scripts/demo-data.ts) instead of the API, so it opens without waiting on a query. api.ts
// loads this module only on /demo, and each period's file only when that period is shown.
// Dates move to today. Filters the recording lacks scale its numbers by the filtered
// value's share of visitors, which is close enough for made-up traffic.

const files = import.meta.glob<{ default: unknown }>('../demo/*.json')
const loaded = new Map<string, Promise<unknown>>()
function load<T>(name: string): Promise<T> {
	const path = `../demo/${name}.json`
	if (!files[path]) return Promise.reject(new DemoError(404, 'the demo has no data for this period'))
	if (!loaded.has(path)) loaded.set(path, files[path]().then((m) => m.default))
	return loaded.get(path) as Promise<T>
}

export class DemoError extends Error {
	constructor(
		public status: number,
		message: string,
	) {
		super(message)
	}
}

const DAY = 86_400_000
const HOUR = 3_600_000
// day-based periods by length, for a custom range
const SPANS: [string, number][] = [
	['7d', 7],
	['28d', 28],
	['30d', 30],
	['90d', 90],
	['6mo', 182],
	['12mo', 365],
]

/** The recording a request's period reads: its own, or for a custom range the preset closest in length. */
export function periodFile(q: URLSearchParams): string {
	const p = q.get('period') ?? '30d'
	if (p !== 'custom') return p
	const days = (Date.parse(q.get('to') ?? '') - Date.parse(q.get('from') ?? '')) / DAY + 1
	if (!(days > 0)) return '30d'
	return SPANS.reduce((a, b) => (Math.abs(b[1] - days) < Math.abs(a[1] - days) ? b : a))[0]
}

/** The site's calendar day of `t`, as ms at midnight UTC. */
function dayOf(t: number, timezone: string): number {
	return Date.parse(new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(t))
}

/**
 * How far to move a recording's dates so it ends now: whole days in the site's time zone,
 * so days and hours still line up, whole hours for the rolling 24 hours, and exactly for Live.
 */
export function shiftFor(kind: 'day' | 'hour' | 'exact', at: number, now: number, timezone: string): number {
	if (kind === 'exact') return now - at
	if (kind === 'hour') return Math.round((now - at) / HOUR) * HOUR
	return dayOf(now, timezone) - dayOf(at, timezone)
}

const TIMES = new Set(['t', 'ts', 'from', 'to', 'last_seen'])
// counts that a filter scales; rates, averages and shares stay as they are
const COUNTS = new Set([
	'visitors',
	'visits',
	'pageviews',
	'events',
	'revenue',
	'previous_visitors',
	'total_visitors',
	'clicks',
	'rage',
	'dead',
	'searches',
	'count',
	'starts',
	'submissions',
	'interactions',
	'dropoffs',
	'plays',
	'impressions',
	'samples',
	'good',
	'needs_improvement',
	'poor',
	'entered',
	'completed',
	'dropoff',
])

/** A copy of `v` with its timestamps moved by `shift` and its counts multiplied by `scale`. */
export function adjust<T>(v: T, shift: number, scale = 1): T {
	const walk = (x: unknown, key?: string): unknown => {
		if (Array.isArray(x)) return x.map((y) => walk(y))
		if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, y]) => [k, walk(y, k)]))
		if (typeof x !== 'number' || key === undefined) return x
		if (TIMES.has(key) && x > 1e12) return x + shift
		if (scale !== 1 && COUNTS.has(key)) return key === 'revenue' ? Math.round(x * scale * 100) / 100 : Math.round(x * scale)
		return x
	}
	return walk(v) as T
}

interface Row {
	key: string
	visitors: number
}
interface Breakdown {
	property: string
	rows: Row[]
	total_visitors: number
	has_more: boolean
}

function matches(f: Filter, key: string): boolean {
	const k = f.dim.startsWith('prop:') ? key.slice(f.dim.length - 5 + 2) : key
	if (f.dim.startsWith('prop:') && !key.startsWith(`${f.dim.slice(5)}: `)) return f.op.startsWith('!')
	const hit = f.op === '==' || f.op === '!=' ? f.values.includes(k) : f.values.some((v) => k.toLowerCase().includes(v.toLowerCase()))
	return f.op.startsWith('!') ? !hit : hit
}

/** The share of the period's visitors that a filter keeps, from the recorded breakdown of its dimension; 1 when there is none. */
export function share(rec: DemoPeriod, f: Filter): number {
	const b = rec.entries[demoKey('stats/breakdown', { property: f.dim.startsWith('prop:') ? 'props' : f.dim })] as Breakdown | undefined
	if (!b?.rows?.length) return 1
	const total = b.total_visitors || b.rows.reduce((n, r) => n + r.visitors, 0)
	if (!total) return 1
	// a negative filter keeps everyone the positive one doesn't, rows past the limit too
	const positive = { ...f, op: f.op === '!=' ? '==' : f.op === '!~' ? '~' : f.op } as Filter
	const kept = b.rows.filter((r) => matches(positive, r.key)).reduce((n, r) => n + r.visitors, 0) / total
	return Math.min(1, Math.max(0, positive.op === f.op ? kept : 1 - kept))
}

/**
 * The recording for a request: the one with the most of its filters, and the filters it
 * still lacks, which the caller applies by scaling.
 */
function find(rec: DemoPeriod, route: string, q: URLSearchParams, filters: Filter[]): { value: unknown; rest: Filter[] } | null {
	// largest subsets first; there are at most a handful of filters
	const subsets = Array.from({ length: 1 << filters.length }, (_, m) => filters.filter((_, i) => m & (1 << i))).sort((a, b) => b.length - a.length)
	for (const sub of subsets) {
		const p = new URLSearchParams(q)
		if (sub.length) p.set('filters', serializeFilters(sub))
		else p.delete('filters')
		const value = rec.entries[demoKey(route, p)]
		if (value !== undefined) return { value, rest: filters.filter((f) => !sub.includes(f)) }
	}
	return null
}

const scaleOf = (rec: DemoPeriod, filters: Filter[]) => filters.reduce((s, f) => s * share(rec, f), 1)

export function breakdown(rec: DemoPeriod, q: URLSearchParams, filters: Filter[], shift: number): Breakdown {
	const property = q.get('property') ?? ''
	const hit = find(rec, 'stats/breakdown', q, filters)
	if (!hit) return { property, rows: [], total_visitors: 0, has_more: false }
	// a filter on the property itself picks rows; any other scales them
	const own = hit.rest.filter((f) => f.dim === property || (property === 'props' && f.dim.startsWith('prop:')))
	const others = hit.rest.filter((f) => !own.includes(f))
	const b = adjust(hit.value as Breakdown, shift, scaleOf(rec, others))
	if ((b as unknown as { error?: string }).error) return b
	let rows = b.rows.filter((r) => r.visitors > 0 && own.every((f) => matches(f, r.key)))
	const search = q.get('search')?.toLowerCase()
	if (search) rows = rows.filter((r) => r.key.toLowerCase().includes(search))
	const limit = Number(q.get('limit')) || 10
	const page = Math.max(1, Number(q.get('page')) || 1)
	const end = page * limit
	return { ...b, rows: rows.slice(end - limit, end), has_more: rows.length > end || (b.has_more && !search && !own.length) }
}

interface Journey {
	direction: 'forward' | 'backward'
	path: string[]
	visitors: number
	steps: { key: string; visitors: number; share: number }[]
}

/**
 * Paths past the recorded first step: what follows a page is read from that page's own
 * recording and scaled to the people who got there this way.
 */
export function journey(rec: DemoPeriod, q: URLSearchParams, filters: Filter[], shift: number): Journey {
	const direction = q.get('direction') === 'backward' ? 'backward' : 'forward'
	const path = q.get('path')?.split(',').filter(Boolean) ?? []
	const at = (p: string[]): Journey | null => {
		const k = new URLSearchParams({ direction })
		if (p.length) k.set('path', p.join(','))
		return (rec.entries[demoKey('stats/journeys', k)] as Journey | undefined) ?? null
	}
	const exact = at(path)
	const scale = scaleOf(rec, filters)
	if (exact) return adjust(exact, shift, scale)
	// the newest pick is the last page going forward and the first going backward
	const last = direction === 'forward' ? path[path.length - 1] : path[0]
	const before = direction === 'forward' ? path.slice(0, -1) : path.slice(1)
	const parent = journey(rec, new URLSearchParams(before.length ? { direction, path: before.join(',') } : { direction }), [], 0)
	const reached = parent.steps.find((s) => s.key === last)?.visitors ?? 0
	const next = at([last])
	if (!next || !next.visitors || !reached) return { direction, path, visitors: Math.round(reached * scale), steps: [] }
	const seen = new Set(path)
	const ratio = reached / next.visitors
	const steps = next.steps
		.filter((s) => !seen.has(s.key))
		.map((s) => ({ ...s, visitors: Math.round(s.visitors * ratio * scale) }))
		.filter((s) => s.visitors > 0)
	return { direction, path, visitors: Math.round(reached * scale), steps }
}

interface FunnelStep {
	kind: 'page' | 'event'
	match: string
	label?: string
}

/** A funnel the recording lacks: each step's visitors from the page and event breakdowns, never more than the step before. */
export function funnel(rec: DemoPeriod, steps: FunnelStep[], mode: string, filters: Filter[]) {
	const scale = scaleOf(rec, filters)
	const rows = (property: string) => (rec.entries[demoKey('stats/breakdown', { property })] as Breakdown | undefined)?.rows ?? []
	const glob = (m: string) => new RegExp(`^${m.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`)
	const entered = Math.round(((rec.entries[demoKey('stats/aggregate', { compare: 'previous' })] as { current?: { visitors: number } })?.current?.visitors ?? 0) * scale)
	let prev = entered
	let first = 0
	const out = steps.map((s, i) => {
		const re = glob(s.match.trim())
		const raw = rows(s.kind === 'page' ? 'page' : 'event')
			.filter((r) => re.test(r.key))
			.reduce((n, r) => n + r.visitors, 0)
		// not everyone who reached a later step went through the earlier ones first
		const visitors = Math.min(prev, Math.round(raw * scale * (i ? 0.6 : 1)))
		const dropoff = i ? prev - visitors : 0
		if (!i) first = visitors
		prev = visitors
		return { label: s.label || (s.kind === 'page' ? `Visit ${s.match}` : s.match), visitors, conversion: first ? Math.round((visitors / first) * 1000) / 10 : 0, dropoff }
	})
	return { mode, entered, completed: prev, steps: out }
}

async function site(): Promise<DemoSite> {
	return load<DemoSite>('site')
}

/** Answers a GET the dashboard sends on /demo. */
export async function demoGet(path: string): Promise<unknown> {
	const s = await site()
	const now = Date.now()
	const route = demoRoute(path)
	const q = new URLSearchParams(path.split('?')[1] ?? '')
	if (route === 'me') return s.me
	if (/^sites\/[^/]+\/funnels$/.test(route)) return s.funnels
	if (/^sites\/[^/]+\/segments$/.test(route)) return s.segments
	if (/^sites\/[^/]+\/annotations$/.test(route)) return adjust(s.annotations, shiftFor('day', s.at, now, s.timezone))
	if (route === 'stats/realtime') return adjust(s.realtime, shiftFor('exact', s.at, now, s.timezone))
	if (!route.startsWith('stats/')) throw new DemoError(403, 'The demo is read-only. Sign up to see this for your own site.')
	if (route === 'stats/aggregate' && q.get('period') === 'all' && q.get('compare') === '0') return s.ever

	const name = periodFile(q)
	const rec = await load<DemoPeriod>(name)
	const shift = shiftFor(name === '24h' ? 'hour' : 'day', rec.at, now, s.timezone)
	const filters = parseFilters(q.get('filters'))
	if (route === 'stats/breakdown') return breakdown(rec, q, filters, shift)
	if (route === 'stats/journeys') return journey(rec, q, filters, shift)
	if (route === 'stats/behavior') return behavior(rec, q, filters, shift)
	if (route === 'stats/aggregate' || route === 'stats/timeseries') return series(rec, route, q, filters, shift, now)
	const hit = find(rec, route, q, filters)
	if (!hit) throw new DemoError(404, 'The demo has no data for this report.')
	return adjust(hit.value, shift, scaleOf(rec, hit.rest))
}

function series(rec: DemoPeriod, route: string, q: URLSearchParams, filters: Filter[], shift: number, now: number): unknown {
	const compare = q.get('compare') ?? 'previous'
	const p = new URLSearchParams(q)
	// without a comparison, the recording with one, minus it; an interval it lacks falls back to the period's own
	if (compare === '0') p.set('compare', 'previous')
	let hit = find(rec, route, p, filters)
	if (!hit && p.has('interval')) {
		p.delete('interval')
		hit = find(rec, route, p, filters)
	}
	if (!hit) throw new DemoError(404, 'The demo has no data for this report.')
	const v = adjust(hit.value, shift, scaleOf(rec, hit.rest)) as { previous?: unknown; change?: unknown; points?: { t: number }[]; window?: { to: number } }
	if (compare === '0') {
		v.previous = null
		if ('change' in v) v.change = null
	}
	// a recording made later in the day than now would otherwise run into the future
	if (v.points) v.points = v.points.filter((pt) => pt.t <= now)
	if (v.window) v.window.to = Math.min(v.window.to, now)
	return v
}

const EMPTY: Record<string, unknown> = {
	clicks: { pageviews: 0, visitors: 0, clicks: 0, rage: 0, dead: 0, elements: [] },
	scroll: { visits: 0, average: 0, reached: [] },
}

function behavior(rec: DemoPeriod, q: URLSearchParams, filters: Filter[], shift: number): unknown {
	const report = q.get('report') ?? ''
	const page = q.get('page')
	// Clicks and Scroll are for one page already: a filter on that page doesn't scale them again
	const rest = page ? filters.filter((f) => !(f.dim === 'page' && f.op === '==' && f.values.length === 1 && f.values[0] === page)) : filters
	const hit = find(rec, 'stats/behavior', q, rest)
	if (!hit) {
		if (EMPTY[report]) return EMPTY[report]
		throw new DemoError(404, 'The demo has no data for this report.')
	}
	return adjust(hit.value, shift, scaleOf(rec, hit.rest))
}

/** Answers a POST, PUT or DELETE on /demo: the funnel report runs, everything else is read-only. */
export async function demoSend(method: string, path: string, body: unknown): Promise<unknown> {
	if (method !== 'POST' || demoRoute(path) !== 'stats/funnel') throw new DemoError(403, 'The demo is read-only. Sign up to make your own.')
	const b = body as Record<string, unknown> & { steps: FunnelStep[]; mode?: string }
	const q = new URLSearchParams(Object.entries(b).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v]] : [])))
	const mode = b.mode ?? 'sequential'
	const steps = b.steps.map((s) => ({ kind: s.kind, match: s.match, ...(s.label ? { label: s.label } : {}) }))
	q.set('mode', mode)
	q.set('steps', JSON.stringify(steps))
	const rec = await load<DemoPeriod>(periodFile(q))
	const filters = parseFilters(q.get('filters'))
	const hit = find(rec, 'stats/funnel', q, filters)
	return hit ? adjust(hit.value, 0, scaleOf(rec, hit.rest)) : funnel(rec, steps, mode, filters)
}
