// The demo dashboard (/demo) reads recorded responses instead of the API. A request and
// its recording meet on this key: the route, plus the query values that change the answer.
// The period picks the recording file, and paging, limits and search are applied to the
// recorded rows, so neither is part of the key.

/** Query values that change a route's answer; everything else is left out of the key. */
const KEPT: Record<string, string[]> = {
	'stats/aggregate': ['compare', 'filters'],
	'stats/timeseries': ['compare', 'interval', 'filters'],
	'stats/breakdown': ['property', 'filters'],
	'stats/behavior': ['report', 'page', 'filters'],
	'stats/journeys': ['direction', 'path', 'filters'],
	'stats/vitals': ['filters'],
	'stats/funnel': ['mode', 'steps', 'filters'],
}

/** The route of an API path, without `/api/v1/` and the query: `stats/breakdown`. */
export function demoRoute(path: string): string {
	return path.replace(/^\/api\/v1\//, '').split('?')[0]
}

/** The key for a route and its query values. Filters are sorted, so their order doesn't matter. */
export function demoKey(route: string, params: URLSearchParams | Record<string, string | undefined>): string {
	const get = (k: string) => (params instanceof URLSearchParams ? params.get(k) : params[k]) ?? null
	const parts: string[] = []
	for (const k of KEPT[route] ?? []) {
		let v = get(k)
		if (k === 'filters' && v) v = v.split(';').sort().join(';')
		if (v) parts.push(`${k}=${v}`)
	}
	return parts.length ? `${route}?${parts.join('&')}` : route
}

/** The recording of one period: when it was made and each response by key. */
export interface DemoPeriod {
	at: number
	entries: Record<string, unknown>
}

/** The recording that doesn't depend on the period. */
export interface DemoSite {
	at: number
	/** the site's time zone, which decides where its days start */
	timezone: string
	me: unknown
	funnels: unknown
	segments: unknown
	annotations: unknown
	realtime: unknown
	/** all-time totals, which Overview asks for to tell a new site from one with data */
	ever: unknown
}
