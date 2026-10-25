import { QueryError } from './filters'
import type { Filter } from './types'

/**
 * Google Search Console search terms: the queries people typed into
 * Google before landing on the site, with clicks, impressions, CTR and position. The
 * numbers come from Google live, so they cover what Google reports (usually up to two
 * or three days ago) and only filters Google can apply.
 */
export const SEARCH_TERMS = 'search_term'

export interface SearchTermRow {
	key: string
	/** clicks from Google search, shown where other reports show visitors */
	visitors: number
	clicks: number
	impressions: number
	/** percent */
	ctr: number
	/** average position in the results, 1 is the top */
	position: number
}

interface GscFilter {
	dimension: 'page' | 'device' | 'query'
	operator: 'equals' | 'notEquals' | 'contains' | 'notContains' | 'includingRegex' | 'excludingRegex'
	expression: string
}

const DEVICES: Record<string, string> = { desktop: 'DESKTOP', mobile: 'MOBILE', tablet: 'TABLET' }
const escape = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
/** `/docs*` → a regex on the full URL Google reports, whatever the host. */
const pathRegex = (values: string[]) => `^https?://[^/]+(${values.map((v) => escape(v).replace(/\*/g, '.*')).join('|')})$`

/** Filters that only narrow to Google search traffic don't change the answer. */
function isGoogleOnly(f: Filter): boolean {
	if (f.op !== '==') return false
	if (f.dim === 'source') return f.values.every((v) => v.toLowerCase() === 'google')
	if (f.dim === 'channel') return f.values.every((v) => v === 'Organic Search')
	return false
}

function toGsc(f: Filter): GscFilter[] {
	if (isGoogleOnly(f)) return []
	if (f.dim === 'page' || f.dim === 'entry_page') {
		if (f.op === '==') return [{ dimension: 'page', operator: 'includingRegex', expression: pathRegex(f.values) }]
		if (f.op === '!=') return [{ dimension: 'page', operator: 'excludingRegex', expression: pathRegex(f.values) }]
		if (f.values.length === 1) return [{ dimension: 'page', operator: f.op === '~' ? 'contains' : 'notContains', expression: f.values[0] }]
	}
	if (f.dim === 'device' && (f.op === '==' || f.op === '!=') && f.values.length === 1 && DEVICES[f.values[0].toLowerCase()]) {
		return [{ dimension: 'device', operator: f.op === '==' ? 'equals' : 'notEquals', expression: DEVICES[f.values[0].toLowerCase()] }]
	}
	throw new QueryError(`search terms come from Google Search Console, which can't filter by ${f.dim === 'page' ? 'several partial pages' : f.dim}; remove that filter to see them`)
}

/** Local calendar date of a timestamp, given the site's UTC offset in minutes. */
const localDay = (ts: number, offset: number) => new Date(ts + offset * 60_000).toISOString().slice(0, 10)

/** The searchAnalytics.query body for a window, filters and page of results. */
export function searchConsoleQuery(window: { from: number; to: number }, offset: number, filters: Filter[], opts: { limit: number; page?: number; search?: string }) {
	const gsc = filters.flatMap(toGsc)
	if (opts.search) gsc.push({ dimension: 'query', operator: 'contains', expression: opts.search })
	return {
		startDate: localDay(window.from, offset),
		endDate: localDay(Math.max(window.from, window.to - 1), offset),
		dimensions: ['query'],
		type: 'web',
		dataState: 'all',
		// Google's limit; a caller asks for one row past the page to know there are more
		rowLimit: Math.min(Math.max(opts.limit, 1), 25_000),
		startRow: (Math.max(opts.page ?? 1, 1) - 1) * opts.limit,
		...(gsc.length ? { dimensionFilterGroups: [{ groupType: 'and', filters: gsc }] } : {}),
	}
}

export function searchTermRows(res: { rows?: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }[] }): SearchTermRow[] {
	return (res.rows ?? []).map((r) => ({
		key: r.keys[0],
		visitors: r.clicks,
		clicks: r.clicks,
		impressions: r.impressions,
		ctr: Math.round(r.ctr * 1000) / 10,
		position: Math.round(r.position * 10) / 10,
	}))
}
