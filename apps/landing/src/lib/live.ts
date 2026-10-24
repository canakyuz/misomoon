// The demo site's numbers the landing prints, fetched from the API and kept at the edge.

export interface Live {
	visitors: number
	pageviews: number
	bounce_rate: number
	visit_duration: number
	/** change vs the previous 30 days (bounce rate in points); null without a comparison */
	change: { visitors: number | null; pageviews: number | null; bounce_rate: number | null; visit_duration: number | null } | null
	ai_share: number | null
	/** top five channels with their share of visitors, in percent */
	channels: [string, number][]
	now: number
	yesterday: number
	yesterday_change: number | null
	top_source: string | null
	top_page: string | null
	/** visitors per day, oldest first, for the hero's reflection and chart */
	days: { t: number; visitors: number }[]
	/** the previous 30 days, same length as `days` where known */
	previous: number[]
	vitals: { lcp: number | null; inp: number | null; cls: number | null; ttfb: number | null }
}

type Row = { key: string; visitors: number }
type Point = { t: number; visitors: number }
export interface Answers {
	agg: { current: { visitors: number; pageviews: number; bounce_rate: number; visit_duration: number }; change?: Live['change'] | null }
	channels: { total_visitors: number; rows: Row[] }
	realtime: { visitors: number }
	yesterday: { current: { visitors: number }; change?: { visitors?: number | null } | null }
	sources: { rows: { key: string }[] }
	pages: { rows: { key: string }[] }
	series: { points: Point[]; previous?: Point[] | null }
	vitals: { vitals: { name: string; p75: number | null }[] }
}

/** The API calls behind `Live`, as paths on the app. */
export const LIVE_PATHS: Record<keyof Answers, string> = {
	agg: '/api/v1/stats/aggregate?site=demo&period=30d&compare=true',
	channels: '/api/v1/stats/breakdown?site=demo&period=30d&property=channel&limit=20',
	realtime: '/api/v1/stats/realtime?site=demo',
	yesterday: '/api/v1/stats/aggregate?site=demo&period=yesterday&compare=true',
	sources: '/api/v1/stats/breakdown?site=demo&period=yesterday&property=source&limit=1',
	pages: '/api/v1/stats/breakdown?site=demo&period=yesterday&property=page&limit=1',
	series: '/api/v1/stats/timeseries?site=demo&period=30d&compare=true',
	vitals: '/api/v1/stats/vitals?site=demo&period=30d',
}

const share = (n: number, total: number) => Math.round((n / total) * 1000) / 10

export function toLive(a: Answers): Live {
	const total = a.channels.total_visitors
	const ai = a.channels.rows.find((r) => r.key === 'AI Assistants')?.visitors ?? 0
	const p75 = (name: string) => a.vitals.vitals.find((v) => v.name === name)?.p75 ?? null
	const c = a.agg.change
	return {
		visitors: a.agg.current.visitors,
		pageviews: a.agg.current.pageviews,
		bounce_rate: a.agg.current.bounce_rate,
		visit_duration: a.agg.current.visit_duration,
		change: c ? { visitors: c.visitors, pageviews: c.pageviews, bounce_rate: c.bounce_rate, visit_duration: c.visit_duration } : null,
		ai_share: total ? share(ai, total) : null,
		channels: total ? a.channels.rows.slice(0, 5).map((r) => [r.key, share(r.visitors, total)] as [string, number]) : [],
		now: a.realtime.visitors,
		yesterday: a.yesterday.current.visitors,
		yesterday_change: typeof a.yesterday.change?.visitors === 'number' ? a.yesterday.change.visitors : null,
		top_source: a.sources.rows[0]?.key ?? null,
		top_page: a.pages.rows[0]?.key ?? null,
		days: a.series.points.map((p) => ({ t: p.t, visitors: p.visitors })),
		previous: (a.series.previous ?? []).map((p) => p.visitors),
		vitals: { lcp: p75('lcp'), inp: p75('inp'), cls: p75('cls'), ttfb: p75('ttfb') },
	}
}

interface CacheLike {
	match(key: string): Promise<Response | undefined>
	put(key: string, res: Response): Promise<void>
}

const TTL = 60
/** how long a failed fetch is remembered, so a down API is not asked on every view */
const DOWN_TTL = 15

/**
 * The live numbers from the edge cache, or fetched and cached. A failure is cached
 * briefly as `{ down: true }`, and a cache that errors counts as a miss: the page
 * must render with or without numbers, never fail because of them.
 */
export async function cachedLive(o: {
	cache: CacheLike | undefined
	key: string
	fresh: () => Promise<Live | null>
	waitUntil: (p: Promise<unknown>) => void
}): Promise<Live | null> {
	const hit = await o.cache?.match(o.key).catch(() => undefined)
	if (hit) {
		const v = (await hit.json().catch(() => null)) as (Live & { down?: true }) | null
		if (v?.down) return null
		if (v) return v
	}
	const v = await o.fresh()
	if (o.cache) {
		const res = new Response(JSON.stringify(v ?? { down: true }), { headers: { 'cache-control': `max-age=${v ? TTL : DOWN_TTL}` } })
		o.waitUntil(o.cache.put(o.key, res).catch(() => {}))
	}
	return v
}
