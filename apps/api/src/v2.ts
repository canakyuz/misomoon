import { HttpError } from './control'
import type { Principal } from './auth'
import { aggregateStats, breakdownStats, timeseriesStats, type StatsInput } from './stats'

/**
 * A Stats API v2 endpoint (`POST /api/v2/query`) for dashboards,
 * scripts and integrations. Supports no dimension, one time dimension, or one property dimension.
 */

interface V2Query {
	site_id: string
	metrics: string[]
	date_range: string | [string, string]
	dimensions?: string[]
	filters?: unknown[]
	order_by?: [string, 'asc' | 'desc'][]
	include?: { imports?: boolean; total_rows?: boolean; time_labels?: boolean }
	pagination?: { limit?: number; offset?: number }
}

const DIMS: Record<string, string> = {
	'event:page': 'page',
	'event:hostname': 'hostname',
	'event:name': 'event',
	'event:goal': 'goal',
	'visit:entry_page': 'entry_page',
	'visit:exit_page': 'exit_page',
	'visit:source': 'source',
	'visit:referrer': 'referrer',
	'visit:channel': 'channel',
	'visit:utm_source': 'utm_source',
	'visit:utm_medium': 'utm_medium',
	'visit:utm_campaign': 'utm_campaign',
	'visit:utm_content': 'utm_content',
	'visit:utm_term': 'utm_term',
	'visit:device': 'device',
	'visit:browser': 'browser',
	'visit:browser_version': 'browser_version',
	'visit:os': 'os',
	'visit:os_version': 'os_version',
	'visit:country': 'country',
	'visit:country_name': 'country',
	'visit:region': 'region',
	'visit:region_name': 'region',
	'visit:city': 'city',
	'visit:city_name': 'city',
	'visit:screen': 'screen',
}

function dim(d: string): string {
	if (d.startsWith('event:props:')) return `prop:${d.slice(12)}`
	const m = DIMS[d]
	if (!m) throw new HttpError(400, `unsupported dimension: ${d}`)
	return m
}

const OPS: Record<string, string> = { is: '==', is_not: '!=', contains: '~', contains_not: '!~', matches_wildcard: '==', matches_wildcard_not: '!=' }

function filters(list: unknown[] | undefined): string {
	const out: string[] = []
	const walk = (f: unknown) => {
		if (!Array.isArray(f)) throw new HttpError(400, 'filters must be arrays')
		if (f[0] === 'and') return (f[1] as unknown[]).forEach(walk)
		const [op, d, values] = f as [string, string, (string | number)[]]
		if (!(op in OPS)) throw new HttpError(400, `unsupported filter operator: ${op}`)
		if (!Array.isArray(values) || !values.length) throw new HttpError(400, `filter ${d} needs values`)
		out.push(`${dim(d)}${OPS[op]}${values.map(String).join('|')}`)
	}
	;(list ?? []).forEach(walk)
	return out.join(';')
}

function period(r: V2Query['date_range']): Pick<StatsInput, 'period' | 'from' | 'to'> {
	if (Array.isArray(r)) return { period: 'custom', from: r[0].slice(0, 10), to: r[1].slice(0, 10) }
	const map: Record<string, string> = { day: 'today', '24h': '24h', '7d': '7d', '28d': '28d', '30d': '30d', '91d': '90d', month: 'mtd', '6mo': '6mo', '12mo': '12mo', year: 'ytd', all: 'all' }
	if (!map[r]) throw new HttpError(400, `unsupported date_range: ${r}`)
	return { period: map[r] }
}

type Row = Record<string, unknown>

function metric(m: string, row: Row): unknown {
	switch (m) {
		case 'total_revenue':
			return row.revenue ?? 0
		case 'percentage':
		case 'group_conversion_rate':
			return row.conversion_rate ?? null
		default:
			return row[m] ?? null
	}
}

export async function v2Query(env: Env, who: Principal, q: V2Query) {
	if (!q?.site_id || !Array.isArray(q.metrics) || !q.metrics.length || !q.date_range) throw new HttpError(400, 'site_id, metrics and date_range are required')
	const site = await env.CONTROL.prepare('SELECT id FROM sites WHERE id = ? OR domain = ?').bind(q.site_id, q.site_id).first<{ id: string }>()
	if (!site) throw new HttpError(404, `site ${q.site_id} not found`)
	const input: StatsInput = { site: site.id, ...period(q.date_range), filters: filters(q.filters) || undefined, imported: q.include?.imports === false ? '0' : '1' }
	const dims = q.dimensions ?? []
	if (dims.length > 1) throw new HttpError(400, 'misomoon supports one dimension per query')
	let rows: { dimensions: string[]; metrics: unknown[] }[]
	if (!dims.length) {
		const agg = await aggregateStats(env, who, input)
		rows = [{ dimensions: [], metrics: q.metrics.map((m) => metric(m, agg.current as unknown as Row)) }]
	} else if (dims[0].startsWith('time')) {
		const interval = { time: undefined, 'time:minute': 'minute', 'time:hour': 'hour', 'time:day': 'day', 'time:week': 'week', 'time:month': 'month' }[dims[0]]
		if (dims[0] !== 'time' && !interval) throw new HttpError(400, `unsupported dimension: ${dims[0]}`)
		const ts = await timeseriesStats(env, who, { ...input, interval })
		const label = (t: number) => (ts.interval === 'minute' || ts.interval === 'hour' ? new Date(t).toISOString().slice(0, 19).replace('T', ' ') : new Date(t).toISOString().slice(0, 10))
		rows = ts.points.map((p) => ({ dimensions: [label(p.t)], metrics: q.metrics.map((m) => metric(m, p as unknown as Row)) }))
	} else {
		const b = await breakdownStats(env, who, { ...input, property: dim(dims[0]), limit: 1000 })
		rows = b.rows.map((r) => ({ dimensions: [r.key], metrics: q.metrics.map((m) => metric(m, r as unknown as Row)) }))
	}
	for (const [key, dir] of [...(q.order_by ?? [])].reverse()) {
		const mi = q.metrics.indexOf(key)
		const di = dims.indexOf(key)
		const val = (r: (typeof rows)[number]) => (mi >= 0 ? r.metrics[mi] : di >= 0 ? r.dimensions[di] : null) as number | string
		rows.sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * (dir === 'asc' ? 1 : -1))
	}
	const offset = Math.max(0, q.pagination?.offset ?? 0)
	const limit = Math.min(Math.max(1, q.pagination?.limit ?? 10_000), 10_000)
	const page = rows.slice(offset, offset + limit)
	const meta: Record<string, unknown> = {}
	if (q.include?.total_rows) meta.total_rows = rows.length
	if (q.include?.time_labels && dims[0]?.startsWith('time')) meta.time_labels = rows.map((r) => r.dimensions[0])
	return { results: page, meta, query: { ...q, site_id: q.site_id } }
}
