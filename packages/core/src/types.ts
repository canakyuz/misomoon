/** What `m.js` posts to `/api/event`. Short keys keep beacons small. */
export interface TrackerPayload {
	/** site id (?s= on the script URL) */
	s: string
	/**
	 * event name: pageview, engagement, or a custom name. m.js leaves it off its own pageviews
	 * and engagements. `engagement` is taken: an engagement beacon adds to its page view's row
	 * (it needs `e` and `y`), or only hands out payment refs (`k`), and is never stored itself.
	 */
	n?: string
	/** full page url */
	u: string
	/** document.referrer */
	r?: string
	/** document.title */
	t?: string
	/** screen width */
	w?: number
	/** viewport width */
	vw?: number
	/** navigator.language */
	l?: string
	/** engaged milliseconds since the page view's last engagement beacon (engagement only) */
	e?: number
	/** max scroll depth percent (engagement only) */
	d?: number
	/** web vitals (engagement only) */
	v?: { lcp?: number; inp?: number; cls?: number; fcp?: number; ttfb?: number }
	/** custom properties */
	p?: Record<string, string | number | boolean>
	/** revenue: { a, c } from the SDKs, or { amount, currency } as given to misomoon() */
	$?: { a?: number; c?: string; amount?: number | string; currency?: string }
	/** client timestamp, ms; clamped server side */
	ts?: number
	/** false marks a custom event that doesn't count as engagement for bounce rate */
	i?: boolean
	/** client event id (a UUID), so an SDK that resends after a lost response stores the event once */
	id?: string
	/** keys a payment can later name to find this visit: a misomoon ref, or the checkout id on a success page */
	k?: string | string[]
	/**
	 * The page view's key, picked by the tracker for each page view and sent on the pageview
	 * and on each of its engagement beacons: a number between 0 and 1 (m.js, from
	 * Math.random()) or 16 to 64 letters, digits, `_` or `-` (the SDKs). The server stores the
	 * pageview under an event id made from the site and this key (`viewEventId`), and adds
	 * each engagement beacon to that row.
	 */
	y?: number | string
	/** site search term read from the page URL (pageview only) */
	q?: string
	/**
	 * What happened on the page since the last engagement beacon (engagement only). Every
	 * number is a delta, so beacons from one page view add up:
	 * c clicks [selector, label, clicks, rage, dead], x errors [message, source, count],
	 * f forms [form, started, submitted], g form fields [form, field, position, touched, dropped],
	 * m media [name, type, played, 25%, 50%, 75%, 95%], o content [name, seen, clicked].
	 * `dropped` is +1 while the field is where the visit would leave the form, -1 once it isn't.
	 */
	c?: unknown[]
	x?: unknown[]
	f?: unknown[]
	g?: unknown[]
	m?: unknown[]
	o?: unknown[]
}

/** The page interactions an event row keeps in `detail`, as JSON. Arrays as in TrackerPayload. */
export interface EventDetail {
	q?: string
	c?: [selector: string, label: string, clicks: number, rage: number, dead: number][]
	x?: [message: string, source: string, count: number][]
	f?: [form: string, started: number, submitted: number][]
	g?: [form: string, field: string, position: number, touched: number, dropped: number][]
	m?: [name: string, type: 'video' | 'audio', played: number, q1: number, q2: number, q3: number, end: number][]
	o?: [name: string, seen: number, clicked: number][]
}

/** One row of the `events` table in a shard. */
export interface EventRow {
	/** random id given at the edge; a queue retry carries it, so a replay inserts nothing */
	event_id: string
	/** not stored: false when a custom event shouldn't end a bounce (`interactive: false`) */
	interactive?: boolean
	/** not stored: the visitor id under yesterday's salt, set in the first half hour of a UTC day so a visit open at midnight carries on */
	prev_visitor_id?: string
	/** not stored here: keys that lead a later payment to this visit (see payments.ts) */
	refs?: string[]
	/** not stored: the beacon only hands out keys, it is not an event of the visit */
	ref_only?: boolean
	/** not stored: for an engagement beacon, the event id of the pageview row it adds to */
	view?: string
	site_id: string
	ts: number
	name: string
	visitor_id: string
	session_id: string
	hostname: string
	pathname: string
	title: string | null
	referrer: string | null
	referrer_host: string | null
	source: string
	channel: string
	utm_source: string | null
	utm_medium: string | null
	utm_campaign: string | null
	utm_term: string | null
	utm_content: string | null
	country: string | null
	region: string | null
	city: string | null
	continent: string | null
	timezone: string | null
	asn_org: string | null
	browser: string
	browser_version: string | null
	os: string
	os_version: string | null
	device: string
	screen: string | null
	viewport: number | null
	language: string | null
	engaged_ms: number | null
	scroll_depth: number | null
	lcp: number | null
	inp: number | null
	cls: number | null
	fcp: number | null
	ttfb: number | null
	revenue: number | null
	currency: string | null
	props: string | null
	/**
	 * EventDetail as JSON: a pageview's search term, and the clicks, errors, forms, media and
	 * content its engagement beacons carried, their lists appended in arrival order
	 */
	detail: string | null
	/**
	 * Set on a pageview once an engagement beacon has added to it: each such beacon's mark
	 * (`pingMark`, a hash of its event id) and a space, so a replayed beacon adds nothing.
	 * Never written by an insert, so EVENT_COLUMNS leaves it out.
	 */
	pings?: string | null
}

export type Interval = 'minute' | 'hour' | 'day' | 'week' | 'month'

export type FilterOp = '==' | '!=' | '~' | '!~'

export interface Filter {
	dim: string
	op: FilterOp
	/** `|` separated values are OR-ed for == and != */
	values: string[]
}

export interface Window {
	/** inclusive, ms */
	from: number
	/** exclusive, ms */
	to: number
}

export const METRICS = [
	'visitors',
	'visits',
	'pageviews',
	'views_per_visit',
	'bounce_rate',
	'visit_duration',
	'events',
	'revenue',
	'average_revenue',
] as const
export type Metric = (typeof METRICS)[number]


export interface Aggregate {
	visitors: number
	visits: number
	pageviews: number
	views_per_visit: number
	bounce_rate: number
	visit_duration: number
	events: number
	revenue: number
	/** revenue per event that carried an amount */
	average_revenue: number
}

export interface TimeseriesPoint extends Aggregate {
	/** bucket start, ms UTC */
	t: number
}

export interface BreakdownRow {
	key: string
	visitors: number
	pageviews: number
	events: number
	visits: number
	bounce_rate: number
	visit_duration: number
	/** page breakdowns only */
	time_on_page?: number
	scroll_depth?: number
	/** event and goal breakdowns only */
	conversion_rate?: number
	revenue?: number
	average_revenue?: number
	/** exit page breakdowns only: exits as a share of the page's pageviews */
	exit_rate?: number | null
}

export interface Breakdown {
	property: string
	rows: BreakdownRow[]
	total_visitors: number
	has_more: boolean
	/** some shard had more keys than the row cap, so rare keys may be missing */
	truncated?: boolean
}

export type VitalName = 'lcp' | 'inp' | 'cls' | 'fcp' | 'ttfb'

export interface VitalSummary {
	name: VitalName
	p75: number | null
	samples: number
	good: number
	needs_improvement: number
	poor: number
}

export interface FunnelStep {
	kind: 'page' | 'event'
	/** page: path, `*` wildcards allowed. event: event name. */
	match: string
	label?: string
}

export type FunnelMode = 'sequential' | 'strict' | 'flexible'

export interface FunnelResult {
	mode: FunnelMode
	steps: { label: string; visitors: number; conversion: number; dropoff: number }[]
	entered: number
	completed: number
}

export interface Realtime {
	visitors: number
	pageviews: number
	minutes: { t: number; pageviews: number; visitors: number }[]
	pages: { key: string; visitors: number }[]
	sources: { key: string; visitors: number }[]
	countries: { key: string; visitors: number }[]
	feed: {
		ts: number
		name: string
		pathname: string
		country: string | null
		city: string | null
		browser: string
		device: string
		source: string
	}[]
}
