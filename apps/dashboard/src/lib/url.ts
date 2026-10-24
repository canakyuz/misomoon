import { MAX_FILTERS, MAX_TOTAL_VALUES, MAX_VALUES } from '@misomoon/core/filters'

export type View = 'overview' | 'realtime' | 'funnels' | 'journeys' | 'behavior' | 'vitals' | 'settings'
export type MetricKey = 'visitors' | 'visits' | 'pageviews' | 'views_per_visit' | 'bounce_rate' | 'visit_duration' | 'revenue'
export type FilterOp = '==' | '!=' | '~' | '!~'

export interface Filter {
	dim: string
	op: FilterOp
	values: string[]
}

export const PERIODS = [
	{ key: 'today', label: 'Today', short: 'Today', hotkey: 'd' },
	{ key: 'yesterday', label: 'Yesterday', short: 'Yesterday', hotkey: 'e' },
	{ key: '24h', label: 'Last 24 hours', short: '24h', hotkey: 'h' },
	{ key: '7d', label: 'Last 7 days', short: '7d', hotkey: 'w' },
	{ key: '28d', label: 'Last 28 days', short: '28d', hotkey: 'f' },
	{ key: '30d', label: 'Last 30 days', short: '30d', hotkey: 't' },
	{ key: '90d', label: 'Last 90 days', short: '90d', hotkey: 'n' },
	{ key: 'mtd', label: 'Month to date', short: 'MTD', hotkey: 'm' },
	{ key: 'lastmonth', label: 'Last month', short: 'Last month', hotkey: 'l' },
	{ key: 'ytd', label: 'Year to date', short: 'YTD', hotkey: 'y' },
	{ key: '6mo', label: 'Last 6 months', short: '6mo', hotkey: 's' },
	{ key: '12mo', label: 'Last 12 months', short: '12mo', hotkey: 'z' },
	{ key: 'all', label: 'All time', short: 'All', hotkey: 'a' },
] as const

export const VIEWS: View[] = ['overview', 'realtime', 'funnels', 'journeys', 'behavior', 'vitals', 'settings']
const METRIC_KEYS: MetricKey[] = ['visitors', 'visits', 'pageviews', 'views_per_visit', 'bounce_rate', 'visit_duration', 'revenue']
const OPS: FilterOp[] = ['!=', '==', '!~', '~']
const DAY = 86_400_000
/** The server's limit for a custom range (core resolvePeriod). */
const MAX_CUSTOM_DAYS = 400

export function serializeFilters(filters: Filter[]): string {
	return filters.map((f) => `${f.dim}${f.op}${f.values.join('|')}`).join(';')
}

/** Mirrors the server grammar: the operator is the first one in the text, so a value may contain `==`. */
export function parseFilters(s: string | null | undefined): Filter[] {
	if (!s) return []
	const out: Filter[] = []
	for (const part of s.split(';')) {
		let op: FilterOp | undefined
		let idx = -1
		for (const o of OPS) {
			const i = part.indexOf(o)
			if (i >= 0 && (idx < 0 || i < idx)) [op, idx] = [o, i]
		}
		if (!op) continue
		const values = part
			.slice(idx + op.length)
			.split('|')
			.map((v) => v.trim())
			.filter(Boolean)
		if (values.length) out.push({ dim: part.slice(0, idx).trim(), op, values })
	}
	return out
}

/** Why the server would refuse `next` added to (or replacing its dimension in) `filters`, or null. */
export function filterProblem(filters: Filter[], next: Filter): string | null {
	if (next.values.some((v) => v.includes(';') || v.includes('|'))) return 'filter values cannot contain ; or |'
	if (next.values.length > MAX_VALUES) return `at most ${MAX_VALUES} values in one filter`
	const all = [...filters.filter((f) => f.dim !== next.dim), next]
	if (all.length > MAX_FILTERS) return `at most ${MAX_FILTERS} filters`
	if (all.reduce((n, f) => n + f.values.length, 0) > MAX_TOTAL_VALUES) return `at most ${MAX_TOTAL_VALUES} filter values in total`
	return null
}

function parseDate(s: string | null): number | null {
	if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
	const t = Date.parse(`${s}T00:00:00Z`)
	return Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== s ? null : t
}

/** A custom range the server accepts: both dates, in order, at most 400 days. */
export function validRange(from: string | null, to: string | null): boolean {
	const a = parseDate(from)
	const b = parseDate(to)
	return a != null && b != null && b >= a && b + DAY - a <= MAX_CUSTOM_DAYS * DAY
}

export interface UrlState {
	site: string | null
	period: string
	from: string | null
	to: string | null
	compare: boolean
	/** what the comparison is against: the previous period or the same dates a year earlier */
	compareTo: 'previous' | 'year'
	/** include imported history in unfiltered reports */
	imported: boolean
	filters: Filter[]
	view: View
	metric: MetricKey
}

/** Reads the dashboard state from a query string, falling back to defaults for anything the server would refuse. */
export function readUrlState(search: string): UrlState {
	const q = new URLSearchParams(search)
	let period = q.get('period') ?? '30d'
	let from = q.get('from')
	let to = q.get('to')
	if (period === 'custom' ? !validRange(from, to) : !PERIODS.some((p) => p.key === period)) period = '30d'
	if (period !== 'custom') from = to = null
	const view = q.get('view') as View
	const metric = q.get('metric') as MetricKey
	return {
		site: q.get('site'),
		period,
		from,
		to,
		compare: q.get('compare') !== '0',
		compareTo: q.get('compare') === 'year' ? 'year' : 'previous',
		imported: q.get('imported') !== '0',
		filters: parseFilters(q.get('f')),
		view: VIEWS.includes(view) ? view : 'overview',
		metric: METRIC_KEYS.includes(metric) ? metric : 'visitors',
	}
}
