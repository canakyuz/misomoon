// Everything a site gets, grouped the way the dashboard shows it. The home page lists
// it, and /features prints each group with the docs page that explains it.

export interface Feature {
	name: string
	what: string
	/** the docs page, by file name without .md */
	doc: string
	/** the slug of its own page at /features/<slug>, when it has one */
	page?: string
}

export interface FeatureGroup {
	id: string
	name: string
	/** one sentence under the group heading on /features */
	lede: string
	items: Feature[]
}

export const FEATURES: FeatureGroup[] = [
	{
		id: 'traffic',
		name: 'Traffic',
		lede: 'Where visitors come from, where they are, and what they read.',
		items: [
			{ name: 'Sources', what: 'Channels, referrers, and UTM campaigns', doc: 'metrics' },
			{ name: 'AI assistants', what: 'ChatGPT, Perplexity, Claude, Gemini, and Copilot as their own channel', doc: 'metrics' },
			{ name: 'Live', what: 'Who is on the site right now', doc: 'dashboard' },
			{ name: 'Places and devices', what: 'Country, region, city, browser, screen, and language', doc: 'metrics' },
			{ name: 'Search terms', what: 'What people searched on your site, and on Google through Search Console', doc: 'import' },
		],
	},
	{
		id: 'conversions',
		name: 'Conversions',
		lede: 'What visitors do, in order, and what it earns you.',
		items: [
			{ name: 'Goals', what: 'Pages and custom events, with properties', doc: 'conversions' },
			{ name: 'Funnels', what: 'Steps counted in order, inside one visit', doc: 'conversions' },
			{ name: 'Paths', what: 'The routes people take through the site', doc: 'conversions' },
			{ name: 'Revenue', what: 'Stripe, Polar, Lemon Squeezy, Dodo Payments, or your server, credited to the visit that brought the buyer', doc: 'revenue' },
		],
	},
	{
		id: 'behavior',
		name: 'Behavior',
		lede: 'How a page is used once someone lands on it.',
		items: [
			{ name: 'Heatmaps', what: 'Clicks on each element, with rage and dead clicks, drawn over your own page', doc: 'dashboard', page: 'heatmaps' },
			{ name: 'Scroll maps', what: 'How far down each page people get, drawn over the page, and how long they read', doc: 'dashboard', page: 'scroll-maps' },
			{ name: 'Forms', what: 'Starts, submits, and the field where people stopped', doc: 'tracking' },
			{ name: 'Errors', what: 'JavaScript errors, grouped by message and file', doc: 'tracking' },
			{ name: 'Media and content', what: 'Video and audio plays, and how often tagged blocks were seen', doc: 'tracking' },
			{ name: 'Web Vitals', what: 'LCP, INP, CLS, FCP, and TTFB from real visits', doc: 'metrics' },
		],
	},
	{
		id: 'reports',
		name: 'Reports',
		lede: 'The numbers, sent to the people who need them.',
		items: [
			{ name: 'Email reports', what: 'Weekly and monthly, with a PDF attached', doc: 'reports' },
			{ name: 'Alerts', what: 'A traffic spike, or a site that stops sending', doc: 'reports' },
			{ name: 'Shared dashboards', what: 'Public, or a link with a password, an expiry, and a saved filter', doc: 'sharing' },
			{ name: 'Teams', what: 'Roles from owner to viewer, and guests invited to one site', doc: 'teams' },
			{ name: 'Export', what: 'A ZIP of CSV files for any period', doc: 'dashboard' },
		],
	},
	{
		id: 'build',
		name: 'Build on it',
		lede: 'Your numbers in your own code and your AI tools.',
		items: [
			{ name: 'MCP server', what: 'Claude, Cursor, and other AI tools read your stats', doc: 'mcp' },
			{ name: 'REST API', what: 'Every report, with site-scoped keys', doc: 'api' },
			{ name: 'SDK', what: 'React, Next.js, React Native, Expo, and your server', doc: 'sdk' },
			{ name: 'First-party proxy', what: 'Serve the tracker from your domain, so blockers drop fewer visits', doc: 'PROXY' },
			{ name: 'Import', what: 'Your history from a Google property or a CSV file', doc: 'import' },
		],
	},
]
