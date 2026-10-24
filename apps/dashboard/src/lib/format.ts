import type { MetricKey } from './dash.svelte'

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
const full = new Intl.NumberFormat('en')

export function num(n: number | null | undefined): string {
	if (n == null || Number.isNaN(n)) return '—'
	return Math.abs(n) >= 10_000 ? compact.format(n) : full.format(Math.round(n * 100) / 100)
}

export function exact(n: number | null | undefined): string {
	return n == null ? '—' : full.format(n)
}

export function pct(n: number | null | undefined, dp = 1): string {
	if (n == null || Number.isNaN(n)) return '—'
	return `${n.toFixed(n >= 100 || Number.isInteger(n) ? 0 : dp)}%`
}

export function duration(sec: number | null | undefined): string {
	if (sec == null || Number.isNaN(sec)) return '—'
	const s = Math.round(sec)
	if (s < 60) return `${s}s`
	const m = Math.floor(s / 60)
	if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`
	return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

export function money(n: number | null | undefined, currency = 'USD'): string {
	if (n == null) return '—'
	return new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: n >= 1000 ? 0 : 2 }).format(n)
}

/** A short amount for tight rows: $167, $1.2K */
export function moneyShort(n: number, currency = 'USD'): string {
	return new Intl.NumberFormat('en', { style: 'currency', currency, notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: Math.abs(n) >= 1000 ? 1 : 0 }).format(n)
}

export interface Metric {
	key: MetricKey
	label: string
	hint: string
	/** `currency` is the site's, for revenue */
	format: (n: number, currency?: string) => string
	/** lower is better */
	inverse?: boolean
	/** a 0-100 rate: the axis stops at 100% and changes are in points */
	percent?: boolean
	/** whole numbers: the axis keeps integer ticks */
	integer?: boolean
}

export const METRICS: Metric[] = [
	{ key: 'visitors', label: 'People', hint: 'Different people, counted without cookies (unique visitors)', format: num, integer: true },
	{ key: 'visits', label: 'Visits', hint: 'Times someone came by; a visit ends after 30 quiet minutes', format: num, integer: true },
	{ key: 'pageviews', label: 'Pageviews', hint: 'Pages opened, reloads included', format: num, integer: true },
	{ key: 'views_per_visit', label: 'Pages per visit', hint: 'How many pages a visit opens on average', format: (n) => n.toFixed(2) },
	{ key: 'bounce_rate', label: 'Left at once', hint: 'Visits that saw one page and did nothing else (bounce rate)', format: (n) => pct(n), inverse: true, percent: true },
	{ key: 'visit_duration', label: 'Time per visit', hint: 'From the first page to the last action of a visit', format: duration },
	{ key: 'revenue', label: 'Revenue', hint: 'Revenue sent with events', format: (n, currency) => money(n, currency) },
]

export function bucketLabel(t: number, interval: string, timeZone: string, long = false): string {
	const d = new Date(t)
	const o: Intl.DateTimeFormatOptions = { timeZone }
	if (interval === 'minute' || interval === 'hour') {
		Object.assign(o, { hour: 'numeric', minute: interval === 'minute' ? '2-digit' : undefined })
		if (long) Object.assign(o, { weekday: 'short', month: 'short', day: 'numeric', minute: '2-digit' })
	} else if (interval === 'month') {
		Object.assign(o, { month: long ? 'long' : 'short', year: 'numeric' })
	} else {
		Object.assign(o, { month: 'short', day: 'numeric' })
		if (long) Object.assign(o, { weekday: 'short', year: 'numeric' })
	}
	let label: string
	try {
		label = new Intl.DateTimeFormat('en', o).format(d)
	} catch {
		label = new Intl.DateTimeFormat('en', { ...o, timeZone: 'UTC' }).format(d)
	}
	return interval === 'week' && long ? `Week of ${label}` : label
}

export function ago(ts: number, now = Date.now()): string {
	const s = Math.max(0, Math.round((now - ts) / 1000))
	if (s < 5) return 'just now'
	if (s < 60) return `${s}s ago`
	if (s < 3600) return `${Math.floor(s / 60)}m ago`
	if (s < 172800) return `${Math.floor(s / 3600)}h ago`
	return `${Math.floor(s / 86400)}d ago`
}
