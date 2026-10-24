import { CHANNELS, DIMENSIONS } from '@misomoon/core'
import type { Principal } from './auth'
import { authorize, visibleSites } from './auth'
import { HttpError } from './control'
import { aggregateStats, behaviorStats, BEHAVIOR_REPORTS, breakdownStats, dimensions, funnelStats, goalConversions, journeyStats, realtimeStats, searchTermStats, timeseriesStats, vitalsStats, type StatsInput } from './stats'

/**
 * The query tools of the MCP server. They call the same functions as the dashboard and
 * the Stats API, so they answer with the exact numbers the dashboard shows.
 */
export interface Tool {
	name: string
	title: string
	description: string
	inputSchema: Record<string, unknown>
	run: (env: Env, who: Principal, args: Record<string, unknown>) => Promise<unknown>
}

const PERIOD = {
	type: 'string',
	enum: ['today', 'yesterday', '24h', '7d', '28d', '30d', '90d', 'mtd', 'lastmonth', 'ytd', '6mo', '12mo', 'all', 'custom'],
	description: 'Time range. Use custom with from/to (YYYY-MM-DD, site timezone) for exact dates. Default 30d.',
}
const FILTERS = {
	type: 'string',
	description:
		'Optional filters joined by ";". Each is <dimension><op><value>, op one of == != ~ (contains) !~. ' +
		'Values can be OR-ed with "|", pages accept * wildcards. Examples: "country==US|CA", "page==/blog/*;channel==Organic Search", "goal==Signup", "prop:plan==pro".',
}
const COMPARE = { type: 'string', enum: ['previous', 'year'], description: 'Also return a comparison: the previous period of equal length, or the same dates a year earlier.' }
const SITE = { type: 'string', description: 'Site id. Call list_sites if unknown.' }
const DIMS = [...Object.keys(DIMENSIONS), 'goal']

const base = (extra: Record<string, unknown> = {}, required: string[] = ['site']) => ({
	type: 'object',
	properties: { site: SITE, period: PERIOD, from: { type: 'string' }, to: { type: 'string' }, filters: FILTERS, ...extra },
	required,
	additionalProperties: false,
})

const asInput = (a: Record<string, unknown>) => a as StatsInput

export const TOOLS: Tool[] = [
	{
		name: 'list_sites',
		title: 'List sites',
		description: 'Lists the sites this key can read, with their id, domain, timezone and your role.',
		inputSchema: { type: 'object', properties: {}, additionalProperties: false },
		run: async (env, who) => {
			const sites = await visibleSites(env, who)
			return sites.filter((s) => s.role !== 'billing').map((s) => ({ id: s.id, domain: s.domain, name: s.name, timezone: s.timezone, role: s.role }))
		},
	},
	{
		name: 'get_aggregate',
		title: 'Headline metrics',
		description:
			'Headline metrics for a period: visitors (unique), visits, pageviews, views_per_visit, bounce_rate (%), visit_duration (seconds from first to last pageview or event of a visit), events, revenue, average_revenue. ' +
			'Set compare=previous (or year) to also get the comparison period and the % change (bounce_rate changes in percentage points).',
		inputSchema: base({ compare: COMPARE }),
		run: (env, who, a) => aggregateStats(env, who, asInput(a)),
	},
	{
		name: 'get_timeseries',
		title: 'Metrics over time',
		description: 'All headline metrics bucketed over time. interval is chosen from the period unless given.',
		inputSchema: base({ interval: { type: 'string', enum: ['minute', 'hour', 'day', 'week', 'month'] }, compare: COMPARE }),
		run: async (env, who, a) => {
			const r = await timeseriesStats(env, who, asInput(a))
			// Keep the payload compact for models: ISO timestamps and the useful metrics only.
			const slim = (pts: typeof r.points) =>
				pts.map((p) => ({ t: new Date(p.t).toISOString(), visitors: p.visitors, visits: p.visits, pageviews: p.pageviews, bounce_rate: p.bounce_rate, visit_duration: p.visit_duration, events: p.events, revenue: p.revenue }))
			return { interval: r.interval, points: slim(r.points), previous: r.previous ? slim(r.previous) : null }
		},
	},
	{
		name: 'get_breakdown',
		title: 'Top values of a dimension',
		description:
			`Top values of one dimension with visitors and dimension-specific metrics. Dimensions: ${DIMS.join(', ')}, or prop:<key> for a custom property. ` +
			`Channels are: ${CHANNELS.join(', ')}. "page" rows include time_on_page (s per visit) and scroll_depth (%). "exit_page" rows include exit_rate (%). "event" and "goal" rows include conversion_rate, revenue and average_revenue.`,
		inputSchema: base(
			{
				property: { type: 'string', description: 'Dimension to group by.' },
				limit: { type: 'integer', minimum: 1, maximum: 100 },
				search: { type: 'string', description: 'Only rows whose value contains this text.' },
			},
			['site', 'property'],
		),
		run: (env, who, a) => breakdownStats(env, who, asInput(a)),
	},
	{
		name: 'get_goal_conversions',
		title: 'Goal conversions',
		description: 'Visitors, conversion rate and revenue for every configured goal.',
		inputSchema: base(),
		run: (env, who, a) => goalConversions(env, who, asInput(a)),
	},
	{
		name: 'get_realtime',
		title: 'Realtime',
		description: 'Visitors in the last 5 minutes, pageviews per minute for 30 minutes, top pages, sources and countries right now, and a feed of recent events.',
		inputSchema: { type: 'object', properties: { site: SITE, filters: FILTERS }, required: ['site'], additionalProperties: false },
		run: (env, who, a) => realtimeStats(env, who, asInput(a)),
	},
	{
		name: 'get_web_vitals',
		title: 'Core Web Vitals',
		description: 'p75 and good / needs improvement / poor counts for LCP (ms), INP (ms), CLS, FCP (ms) and TTFB (ms). Filter by page to inspect one page.',
		inputSchema: base(),
		run: (env, who, a) => vitalsStats(env, who, asInput(a)),
	},
	{
		name: 'run_funnel',
		title: 'Funnel',
		description:
			'How many visitors completed each step, in order, on the same day. 2 to 8 steps. mode: sequential (default, other events allowed between steps), ' +
			'strict (nothing in between), flexible (the last step counts anyone who did the first step and later the last).',
		inputSchema: base(
			{
				mode: { type: 'string', enum: ['sequential', 'strict', 'flexible'] },
				steps: {
					type: 'array',
					minItems: 2,
					maxItems: 8,
					items: {
						type: 'object',
						properties: {
							kind: { type: 'string', enum: ['page', 'event'] },
							match: { type: 'string', description: 'Page path (wildcards * allowed) or event name.' },
							label: { type: 'string' },
						},
						required: ['kind', 'match'],
					},
				},
			},
			['site', 'steps'],
		),
		run: (env, who, a) => funnelStats(env, who, a as never),
	},
	{
		name: 'get_journeys',
		title: 'User journeys',
		description:
			'Where visitors go next after following a path of pages (direction forward), or where they came from before it (backward). ' +
			'With no path: the pages visits start on (forward) or end on (backward). Pick a step from the result and call again with it appended to explore further.',
		inputSchema: base({
			path: { type: 'array', items: { type: 'string' }, maxItems: 6, description: 'Pages in visit order, e.g. ["/", "/pricing"].' },
			direction: { type: 'string', enum: ['forward', 'backward'] },
		}),
		run: (env, who, a) => journeyStats(env, who, a as never),
	},
	{
		name: 'get_search_terms',
		title: 'Google search terms',
		description:
			'What people searched on Google before clicking through to the site, from Google Search Console: clicks, impressions, ctr (%) and average position. ' +
			'Google reports with a delay of about two days. Only page and device filters apply. Fails if Search Console is not connected for the site.',
		inputSchema: base({
			limit: { type: 'integer', minimum: 1, maximum: 100 },
			search: { type: 'string', description: 'Only queries containing this text.' },
		}),
		run: (env, who, a) => searchTermStats(env, who, asInput(a)),
	},
	{
		name: 'get_page_interactions',
		title: 'Clicks, scroll, search, errors, forms, media and content',
		description:
			'What people did on the pages, collected without cookies and counted in totals only. report is one of: ' +
			'clicks (clicks per element selector and page, with rage clicks, 3 or more fast clicks on one element, and dead clicks, clicks that changed nothing; pageviews and visitors are the denominators), ' +
			'scroll (share of visits that scrolled at least 0, 10, ... 100% down, and the average deepest scroll), ' +
			'search (terms people typed into the site\'s own search box, read from ?q=, ?s=, ?search= and similar), ' +
			'errors (JavaScript errors by message and script, with affected visitors, pages and browsers), ' +
			'forms (starts, submissions, conversion %, and per field the visits that used it and dropoffs: visits that left the form at that field), ' +
			'media (video and audio plays, and % of plays reaching 25/50/75% and the end), ' +
			'content (impressions, clicks and ctr % of elements tagged data-misomoon-content). ' +
			'Pass page to look at one path; clicks and scroll are most useful per page.',
		inputSchema: base(
			{
				report: { type: 'string', enum: [...BEHAVIOR_REPORTS] },
				page: { type: 'string', description: 'One page path, e.g. /pricing. * wildcards allowed.' },
				limit: { type: 'integer', minimum: 1, maximum: 100 },
			},
			['site', 'report'],
		),
		run: (env, who, a) => behaviorStats(env, who, String(a.report), a as StatsInput & { page?: string }),
	},
	{
		name: 'add_annotation',
		title: 'Add annotation',
		description: 'Marks a moment on the site timeline (a deploy, a launch, a campaign) so it shows on the dashboard chart. Needs an editor role or above.',
		inputSchema: {
			type: 'object',
			properties: { site: SITE, text: { type: 'string', maxLength: 200 }, ts: { type: 'string', description: 'ISO time; defaults to now.' } },
			required: ['site', 'text'],
			additionalProperties: false,
		},
		run: async (env, who, a) => {
			const site = await authorize(env, who, a.site as string, 'edit')
			const ts = a.ts ? Date.parse(String(a.ts)) : Date.now()
			if (!Number.isFinite(ts) || !String(a.text ?? '').trim()) throw new HttpError(400, 'text and a valid ts are required')
			const row = { id: crypto.randomUUID(), ts, text: String(a.text).trim().slice(0, 200), source: 'mcp' }
			await env.CONTROL.prepare('INSERT INTO annotations (id, site_id, ts, text, source, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(row.id, site.id, row.ts, row.text, row.source, Date.now()).run()
			return row
		},
	},
	{
		name: 'list_dimensions',
		title: 'Dimensions',
		description: 'Every dimension that can be used in get_breakdown and in filters.',
		inputSchema: { type: 'object', properties: {}, additionalProperties: false },
		run: async () => [...dimensions(), { key: 'goal', label: 'Goal' }, { key: 'prop:<key>', label: 'Custom property' }],
	},
]

export function findTool(name: string): Tool | undefined {
	return TOOLS.find((t) => t.name === name)
}
