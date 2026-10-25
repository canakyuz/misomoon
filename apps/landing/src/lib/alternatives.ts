// The alternatives pages: misomoon next to other analytics tools. AGENTS.md allows other
// products' names here, in docs/comparison.md and in the README's comparison table only.
// Every claim about another product carries the page it came from and the day it was
// checked. The facts match docs/comparison.md: change both together.
import { LONGEST_KEPT, PLANS, TRIAL_DAYS, keepSentence, keptByPlan, short as pv, sites, words, years } from './pricing.ts'

/** A claim, with the page that backs it and the day someone read that page. */
export interface Sourced {
	text: string
	src: string
	checked: string
}

export interface Fact {
	label: string
	us: string
	them: string
	/** who does better on this row; leave it out when it depends on the reader */
	edge?: 'us' | 'them'
	src: string
	checked: string
}

export interface Alternative {
	slug: string
	name: string
	/** the short name for tight spots: table heads, buttons */
	short: string
	/** the hub's group: tools you run, hosted web analytics, or product analytics and replay */
	kind: 'self-hosted' | 'hosted' | 'product'
	/** the one-line answer at the top of the page */
	answer: string
	/** the meta description, 70 to 160 characters */
	description: string
	/** gzipped tracker size in KB, as we measured it */
	trackerKb: number
	pickUs: Sourced[]
	pickThem: Sourced[]
	facts: Fact[]
	switching: string[]
	faq: [question: string, answer: string][]
}

export const CHECKED = '2026-10-25'
const C = CHECKED

/** misomoon's own tracker, gzipped, as measured for docs/comparison.md */
export const OURS = { coreKb: 1.0, lightKb: 1.9, fullKb: 4.8 }
/** Tracker sizes are our own measurement: the method is on this page. */
export const MEASURED = 'https://github.com/jackzard/misomoon/blob/main/docs/comparison.md#tracker-size-feature-for-feature'
const OUR_TRACKER = '1.0 KB core, 1.9 KB Light, 4.8 KB with every feature'
// misomoon's own side comes from pricing.ts, which reads @misomoon/core/plans. A misomoon
// event is a pageview or a custom event, so a claim that puts our events next to another
// tool's pageviews says so.
const START = PLANS[0]
/** the plan for more than one site, the one the pricing cards recommend */
const GROWTH = PLANS.find((p) => p.popular)!
/** misomoon's price, for the Price rows */
const OUR_PRICE = `Cloud from $${START.price} a month for ${pv(START.events)} events on ${sites(START.sites)}, or $${GROWTH.price} for ${pv(GROWTH.events)} on ${sites(GROWTH.sites)}. ${TRIAL_DAYS} days free. Free to self-host`
const OUR_WHERE = 'Your Cloudflare account, or misomoon Cloud in the EU, the US or Asia-Pacific'
/** misomoon's retention: each plan's retentionDays */
const OUR_RETENTION = `Cloud: ${keptByPlan()}. Self-hosted: no limit`
const OUR_REVENUE = 'Stripe, Polar, Lemon Squeezy, Dodo Payments, or your own server'

const plausible: Alternative = {
	slug: 'plausible',
	name: 'Plausible',
	short: 'Plausible',
	kind: 'self-hosted',
	answer:
		'Both count visits without cookies. Plausible Community Edition needs a server with Docker, Postgres and ClickHouse, and it leaves funnels and revenue to the cloud Business plan. misomoon runs in your Cloudflare account with every feature in one free version.',
	description: 'misomoon and Plausible compared: hosting needs, funnels, revenue, MCP, tracker size, and privacy tools, with sources checked in October 2026.',
	trackerKb: 2.5,
	pickUs: [
		{ text: 'You want funnels, journeys and revenue without a paid plan.', src: 'https://plausible.io/self-hosted-web-analytics', checked: C },
		{ text: 'You would rather not run Docker, Postgres and ClickHouse yourself.', src: 'https://github.com/plausible/community-edition', checked: C },
		{ text: 'You want an official MCP server for Claude, Cursor and other AI tools.', src: 'https://plausible.io/docs', checked: C },
	],
	pickThem: [
		{ text: 'You want two-factor sign-in today. misomoon has none yet.', src: 'https://plausible.io/docs', checked: C },
		{ text: 'You want a hosted plan from the same team, with funnels and revenue on its Business plan.', src: 'https://plausible.io/#pricing', checked: C },
		{ text: 'You can’t use Cloudflare, or you want the data on your own hardware.', src: 'https://plausible.io/self-hosted-web-analytics', checked: C },
	],
	facts: [
		{ label: 'License', us: 'MIT', them: 'AGPL-3.0', src: 'https://github.com/plausible/analytics', checked: C },
		{ label: 'What self-hosting needs', us: 'A Cloudflare account', them: 'Docker, Postgres, ClickHouse, 2 GB RAM', edge: 'us', src: 'https://github.com/plausible/community-edition', checked: C },
		{ label: 'Self-hosted edition limits', us: 'None', them: 'No funnels, journeys or revenue goals', edge: 'us', src: 'https://plausible.io/self-hosted-web-analytics', checked: C },
		{ label: 'Cookieless by default', us: 'Yes', them: 'Yes (their claim)', src: 'https://plausible.io/data-policy', checked: C },
		{ label: 'Funnels', us: 'Yes, 3 modes', them: 'Cloud Business plan', edge: 'us', src: 'https://plausible.io/#pricing', checked: C },
		{ label: 'Official MCP server', us: 'Built in', them: 'Not in its docs', edge: 'us', src: 'https://plausible.io/docs', checked: C },
		{ label: 'Import from Google', us: 'Yes', them: 'Yes', src: 'https://plausible.io/docs/google-analytics-import', checked: C },
		{ label: 'First-party proxy', us: 'Managed subdomain or self-run', them: 'Self-run, managed on Enterprise', edge: 'us', src: 'https://plausible.io/docs/proxy/introduction', checked: C },
		{ label: 'Tracker, gzipped', us: OUR_TRACKER, them: '1.3 KB pageviews only, 2.5 KB per-site script', src: MEASURED, checked: C },
		{ label: 'Two-factor sign-in', us: 'No', them: 'Yes', edge: 'them', src: 'https://plausible.io/docs', checked: C },
		{ label: 'Data processing agreement', us: 'Part of the terms', them: 'Part of the terms', src: 'https://plausible.io/dpa', checked: C },
	],
	switching: [
		'Add the misomoon script next to the Plausible one and run both for two weeks.',
		'Recreate your goals in misomoon. Custom events with the same names keep working.',
		'Bring your history: upload the CSV export from Plausible’s site settings. misomoon skips the days it already counted.',
	],
	faq: [
		['Is misomoon a drop-in Plausible replacement?', 'For counting, yes: one script tag, no cookies, and the same kinds of reports. Your goals and dashboards need setting up again in misomoon.'],
		['Which one is lighter on the page?', 'The misomoon core is 1.0 KB gzipped and the Light preset is 1.9 KB. Plausible’s per-site script is 2.5 KB. With every feature on, misomoon is 4.8 KB.'],
		['Can I self-host both?', 'Yes. Plausible Community Edition runs on your server with Docker. misomoon runs in your Cloudflare account, with no server.'],
	],
}

const umami: Alternative = {
	slug: 'umami',
	name: 'Umami',
	short: 'Umami',
	kind: 'self-hosted',
	answer:
		'Both are MIT-licensed and cookieless. Umami runs on your server with Node.js and Postgres. misomoon runs in your Cloudflare account, adds email reports and Google import, and needs no server to patch.',
	description: 'misomoon and Umami compared: what self-hosting needs, email reports, Google import, MCP, and tracker size, with sources checked in October 2026.',
	trackerKb: 2.3,
	pickUs: [
		{ text: 'You want email reports. Self-hosted Umami has none.', src: 'https://umami.is/pricing', checked: C },
		{ text: 'You want to import your Google Analytics history.', src: 'https://docs.umami.is/docs/cloud/import-data', checked: C },
		{ text: 'You don’t want a Node.js server and a Postgres database to keep running.', src: 'https://docs.umami.is/docs/install', checked: C },
	],
	pickThem: [
		{ text: 'You already run Postgres and want analytics next to it.', src: 'https://docs.umami.is/docs/install', checked: C },
		{ text: 'You want two-factor sign-in today. misomoon has none yet.', src: 'https://docs.umami.is/docs/two-factor-authentication', checked: C },
		{ text: 'You can’t use Cloudflare.', src: 'https://docs.umami.is/docs/install', checked: C },
	],
	facts: [
		{ label: 'License', us: 'MIT', them: 'MIT', src: 'https://github.com/umami-software/umami', checked: C },
		{ label: 'What self-hosting needs', us: 'A Cloudflare account', them: 'Node.js and Postgres', edge: 'us', src: 'https://docs.umami.is/docs/install', checked: C },
		{ label: 'Self-hosted edition limits', us: 'None', them: 'No email reports', edge: 'us', src: 'https://umami.is/pricing', checked: C },
		{ label: 'Funnels', us: 'Yes, 3 modes', them: 'Yes', src: 'https://docs.umami.is/docs', checked: C },
		{ label: 'Core Web Vitals', us: 'Yes', them: 'Yes', src: 'https://docs.umami.is/docs/performance', checked: C },
		{ label: 'Official MCP server', us: 'Built in', them: 'Yes', src: 'https://docs.umami.is/docs/mcp', checked: C },
		{ label: 'Import from Google', us: 'Yes', them: 'No', edge: 'us', src: 'https://docs.umami.is/docs/cloud/import-data', checked: C },
		{ label: 'Tracker, gzipped', us: OUR_TRACKER, them: '2.3 KB', src: MEASURED, checked: C },
		{ label: 'Two-factor sign-in', us: 'No', them: 'Yes', edge: 'them', src: 'https://docs.umami.is/docs/two-factor-authentication', checked: C },
	],
	switching: [
		'Add the misomoon script next to Umami’s and compare the numbers for a few weeks.',
		'Import your Umami history under Settings > Integrations, with the website ID and an API key or a sign-in.',
		'Recreate your events as goals. The `data-misomoon-event` attribute works like a tagged button.',
		'Turn on email reports under Settings so the weekly numbers come to you.',
	],
	faq: [
		['Is misomoon open source like Umami?', 'Yes. Both are MIT-licensed, so you can read, change and run the code.'],
		['Do I lose anything by moving off my own server?', 'You trade your server for your Cloudflare account. If you need the data on hardware you own, Umami fits better.'],
		['Does misomoon have an MCP server like Umami?', 'Yes, built in at `/mcp`, read-only, with site-scoped keys.'],
	],
}

const matomo: Alternative = {
	slug: 'matomo',
	name: 'Matomo',
	short: 'Matomo',
	kind: 'self-hosted',
	answer:
		'Matomo is the long-standing open-source suite on PHP and MySQL, with cookies on until you turn them off and funnels as a paid plugin. misomoon is cookieless from the first request, runs in your Cloudflare account, and has funnels and Web Vitals in the free version.',
	description: 'misomoon and Matomo compared: cookies, hosting needs, paid plugins, MCP, ISO 27001, and tracker size, with sources checked in October 2026.',
	trackerKb: 28,
	pickUs: [
		{ text: 'You want no cookies without changing a setting. Matomo sets them until you turn them off.', src: 'https://matomo.org/faq/general/faq_157/', checked: C },
		{ text: 'You want funnels and Web Vitals without buying plugins.', src: 'https://plugins.matomo.org/Funnels', checked: C },
		{ text: 'You want a tracker that weighs a few KB, not 28 KB.', src: MEASURED, checked: C },
	],
	pickThem: [
		{ text: 'You need an ISO 27001 certified vendor. misomoon has no certification.', src: 'https://matomo.org/blog/2025/09/matomo-iso-27001-certification-2025/', checked: C },
		{ text: 'You need an audit log and two-factor sign-in. misomoon has neither yet.', src: 'https://matomo.org/faq/cloud/configure-matomo-cloud-for-security/', checked: C },
		{ text: 'You want to host on your own PHP server.', src: 'https://matomo.org/faq/on-premise/matomo-requirements/', checked: C },
	],
	facts: [
		{ label: 'License', us: 'MIT', them: 'GPL-3.0', src: 'https://github.com/matomo-org/matomo', checked: C },
		{ label: 'What self-hosting needs', us: 'A Cloudflare account', them: 'PHP 8.1+, MySQL or MariaDB, a web server', edge: 'us', src: 'https://matomo.org/faq/on-premise/matomo-requirements/', checked: C },
		{ label: 'Cookieless by default', us: 'Yes', them: 'No, cookies are on until you turn them off', edge: 'us', src: 'https://matomo.org/faq/general/faq_157/', checked: C },
		{ label: 'Funnels', us: 'Yes, 3 modes', them: 'Paid plugin', edge: 'us', src: 'https://plugins.matomo.org/Funnels', checked: C },
		{ label: 'Core Web Vitals', us: 'Yes', them: 'Paid plugin, not on Matomo Cloud', edge: 'us', src: 'https://plugins.matomo.org/SEOWebVitals', checked: C },
		{ label: 'Official MCP server', us: 'Built in', them: 'Yes, a plugin', src: 'https://plugins.matomo.org/McpServer', checked: C },
		{ label: 'Import from Google', us: 'Yes', them: 'Yes, a plugin', src: 'https://plugins.matomo.org/GoogleAnalyticsImporter', checked: C },
		{ label: 'Tracker, gzipped', us: OUR_TRACKER, them: '28 KB', edge: 'us', src: MEASURED, checked: C },
		{ label: 'Audit log', us: 'No', them: 'Yes', edge: 'them', src: 'https://matomo.org/faq/cloud/configure-matomo-cloud-for-security/', checked: C },
		{ label: 'SOC 2 or ISO 27001', us: 'No (Cloudflare has both)', them: 'ISO 27001', edge: 'them', src: 'https://matomo.org/blog/2025/09/matomo-iso-27001-certification-2025/', checked: C },
	],
	switching: [
		'Import your Matomo history under Settings > Integrations, with Matomo’s address, the site ID and an auth token.',
		'Add the misomoon script and remove the Matomo tag once the numbers line up.',
		'If you only kept a consent banner for Matomo’s cookies, check whether you still need one. This is not legal advice.',
	],
	faq: [
		['Does misomoon need a consent banner like Matomo with cookies?', 'misomoon sets no cookies, the usual reason for a banner, and stores nothing on the device unless a visitor opts out of being counted. Whether you need one depends on your country and the rest of your site.'],
		['Is misomoon as complete as Matomo?', 'No. Matomo has years of plugins, an audit log and ISO 27001. misomoon covers the reports most sites read, with funnels, revenue and Web Vitals in the free version.'],
		['Can I move my Matomo history?', 'Yes. misomoon reads it from Matomo’s Reporting API, a day at a time, on Matomo Cloud and On-Premise. Goals, ecommerce revenue and custom dimensions stay behind.'],
	],
}

const posthog: Alternative = {
	slug: 'posthog',
	name: 'PostHog',
	short: 'PostHog',
	kind: 'product',
	answer:
		'PostHog is a product analytics suite with session replay and feature flags, and self-hosting it is officially unsupported. misomoon does web analytics only: cookieless, a 1 KB core tracker, and nothing to run but a Cloudflare deploy.',
	description: 'misomoon and PostHog compared for web analytics: self-hosting, cookies, tracker size, MCP, and certifications, with sources checked in October 2026.',
	trackerKb: 106,
	pickUs: [
		{ text: 'You want web analytics without cookies by default. PostHog’s cookieless mode is opt-in.', src: 'https://posthog.com/tutorials/cookieless-tracking', checked: C },
		{ text: 'You want to self-host without ClickHouse, Kafka, Redis and 16 GB of RAM.', src: 'https://posthog.com/docs/self-host', checked: C },
		{ text: 'You care about page weight: PostHog’s full bundle is 106 KB gzipped.', src: MEASURED, checked: C },
	],
	pickThem: [
		{ text: 'You need session replay, feature flags or experiments. misomoon has none of these.', src: 'https://posthog.com/pricing', checked: C },
		{ text: 'You need a SOC 2 Type 2 vendor, an audit log and two-factor sign-in.', src: 'https://trust.posthog.com', checked: C },
	],
	facts: [
		{ label: 'License', us: 'MIT', them: 'MIT, except the proprietary `ee/` folder', src: 'https://github.com/PostHog/posthog', checked: C },
		{ label: 'What self-hosting needs', us: 'A Cloudflare account', them: 'Docker with ClickHouse, Postgres, Kafka, Redis, MinIO; 4 vCPU and 16 GB RAM', edge: 'us', src: 'https://posthog.com/docs/self-host', checked: C },
		{ label: 'Self-hosting support', us: 'Supported', them: '“Officially unsupported”', edge: 'us', src: 'https://posthog.com/docs/self-host', checked: C },
		{ label: 'Cookieless by default', us: 'Yes', them: 'No, cookieless mode is opt-in', edge: 'us', src: 'https://posthog.com/tutorials/cookieless-tracking', checked: C },
		{ label: 'Core Web Vitals', us: 'Yes', them: 'Yes', src: 'https://posthog.com/docs/web-analytics/web-vitals', checked: C },
		{ label: 'Official MCP server', us: 'Built in', them: 'Yes', src: 'https://posthog.com/docs/model-context-protocol', checked: C },
		{ label: 'Import from Google', us: 'Yes', them: 'Manual, through BigQuery', edge: 'us', src: 'https://posthog.com/docs/migrate/google-analytics', checked: C },
		{ label: 'Tracker, gzipped', us: OUR_TRACKER, them: '106 KB, full bundle', edge: 'us', src: MEASURED, checked: C },
		{ label: 'SOC 2 or ISO 27001', us: 'No (Cloudflare has both)', them: 'SOC 2 Type 2', edge: 'them', src: 'https://trust.posthog.com', checked: C },
	],
	switching: [
		'Keep PostHog for replay and flags if you use them, and move page analytics to misomoon.',
		'Send your custom events to misomoon with the same names through the SDK.',
		'Import your Google Analytics history, if you have one, in Settings.',
	],
	faq: [
		['Can misomoon replace PostHog entirely?', 'Only if you use PostHog for web analytics. misomoon has no session replay, feature flags or experiments.'],
		['Is misomoon lighter?', 'Yes. The misomoon tracker is 1.0 KB gzipped at its core and 4.8 KB with every feature. PostHog’s full bundle measured 106 KB.'],
		['Do I need a consent banner?', 'misomoon sets no cookies by default. Whether you need a banner depends on your country and the rest of your site. This is not legal advice.'],
	],
}

const rybbit: Alternative = {
	slug: 'rybbit',
	name: 'Rybbit',
	short: 'Rybbit',
	kind: 'self-hosted',
	answer:
		'Both are cookieless and have an MCP server. Rybbit self-hosts with Docker and ClickHouse, and leaves email reports and the Pages view to its cloud. misomoon runs in your Cloudflare account with every feature included.',
	description: 'misomoon and Rybbit compared: what self-hosting needs, edition limits, Google import, MCP, and tracker size, with sources checked in October 2026.',
	trackerKb: 11,
	pickUs: [
		{ text: 'You want email reports and the Pages view on your own instance.', src: 'https://rybbit.com/docs/self-host-vs-cloud', checked: C },
		{ text: 'You want to import your Google Analytics history.', src: 'https://rybbit.com/docs/data-import', checked: C },
		{ text: 'You want a lighter tracker: 1.0 KB core against 11 KB.', src: MEASURED, checked: C },
	],
	pickThem: [
		{ text: 'You want to run analytics on your own server with Docker.', src: 'https://rybbit.com/docs/self-hosting', checked: C },
		{ text: 'You can’t use Cloudflare.', src: 'https://rybbit.com/docs/self-hosting', checked: C },
	],
	facts: [
		{ label: 'License', us: 'MIT', them: 'AGPL-3.0', src: 'https://github.com/rybbit-io/rybbit', checked: C },
		{ label: 'What self-hosting needs', us: 'A Cloudflare account', them: 'Docker with ClickHouse, Postgres and Redis', edge: 'us', src: 'https://github.com/rybbit-io/rybbit/blob/master/docker-compose.yml', checked: C },
		{ label: 'Self-hosted edition limits', us: 'None', them: 'No email reports or Pages view', edge: 'us', src: 'https://rybbit.com/docs/self-host-vs-cloud', checked: C },
		{ label: 'Cookieless by default', us: 'Yes', them: 'Yes (their claim)', src: 'https://rybbit.com/docs/self-hosting', checked: C },
		{ label: 'Official MCP server', us: 'Built in', them: 'Yes', src: 'https://rybbit.com/docs/mcp', checked: C },
		{ label: 'Import from Google', us: 'Yes', them: 'No', edge: 'us', src: 'https://rybbit.com/docs/data-import', checked: C },
		{ label: 'Tracker, gzipped', us: OUR_TRACKER, them: '11 KB', edge: 'us', src: MEASURED, checked: C },
	],
	switching: [
		'Run the misomoon script next to Rybbit’s for a few weeks and compare.',
		'Recreate your goals and funnels in misomoon.',
		'Turn on weekly email reports under Settings.',
	],
	faq: [
		['How is misomoon different from Rybbit?', 'The main difference is where it runs: misomoon in your Cloudflare account, Rybbit on a server with ClickHouse. misomoon also includes email reports and Google import.'],
		['Do both work with AI tools?', 'Yes. Both have an MCP server. misomoon’s is built in and read-only.'],
		['Which is lighter?', 'misomoon’s core tracker is 1.0 KB gzipped, 4.8 KB with every feature. Rybbit’s measured 11 KB.'],
	],
}

const ga: Alternative = {
	slug: 'google-analytics',
	name: 'Google Analytics 4',
	short: 'GA4',
	kind: 'hosted',
	answer:
		'Google Analytics 4 is free and deep, and it sets `_ga` cookies for two years, which brings consent banners where the law requires them. misomoon sets no cookies, keeps your data in your Cloudflare account, and imports your GA4 history.',
	description: 'misomoon and Google Analytics 4 compared: cookies and consent, data ownership, retention, Web Vitals, MCP, and tracker size. Sources checked October 2026.',
	trackerKb: 157,
	pickUs: [
		{ text: 'You want analytics without cookies. GA4 sets `_ga` cookies that last two years.', src: 'https://support.google.com/analytics/answer/11397207', checked: C },
		{ text: `You want a longer history. GA4 keeps explorations data for 2 or 14 months; misomoon Cloud keeps ${keptByPlan()}.`, src: 'https://support.google.com/analytics/answer/7667196', checked: C },
		{ text: 'You want a tracker of a few KB. `gtag.js` measured 157 KB.', src: MEASURED, checked: C },
	],
	pickThem: [
				{ text: 'You want it free with no infrastructure of your own at all.', src: 'https://marketingplatform.google.com/about/analytics/', checked: C },
	],
	facts: [
		{ label: 'Where your data lives', us: OUR_WHERE, them: 'Google', edge: 'us', src: 'https://marketingplatform.google.com/about/analytics/', checked: C },
		{ label: 'Open source', us: 'Yes (MIT)', them: 'No', edge: 'us', src: 'https://support.google.com/analytics/answer/11397207', checked: C },
		{ label: 'Price', us: OUR_PRICE, them: 'Free', edge: 'them', src: 'https://marketingplatform.google.com/about/analytics/', checked: C },
		{ label: 'Cookies', us: 'None', them: '`_ga` cookies for 2 years', edge: 'us', src: 'https://support.google.com/analytics/answer/11397207', checked: C },
		{ label: 'Funnels', us: 'Yes', them: 'Yes', src: 'https://support.google.com/analytics/answer/9327974', checked: C },
		{ label: 'Revenue', us: 'Yes', them: 'Yes, from ecommerce events', src: 'https://developers.google.com/analytics/devguides/collection/ga4/ecommerce', checked: C },
		{ label: 'Core Web Vitals', us: 'Yes', them: 'No built-in report', edge: 'us', src: 'https://support.google.com/analytics/answer/11397207', checked: C },
		{ label: 'Official MCP server', us: 'Built in', them: 'Yes, “Experimental”', src: 'https://github.com/googleanalytics/google-analytics-mcp', checked: C },
		{ label: 'Data retention', us: OUR_RETENTION, them: '2 or 14 months for explorations', edge: 'us', src: 'https://support.google.com/analytics/answer/7667196', checked: C },
		{ label: 'Tracker, gzipped', us: OUR_TRACKER, them: '157 KB (`gtag.js`)', edge: 'us', src: MEASURED, checked: C },
	],
	switching: [
		'Under Settings > Integrations, connect Google and import your GA4 property’s history.',
		'Add the misomoon script and run it next to GA4 for a few weeks. Expect lower numbers: misomoon drops bots and models nothing.',
		'Connect Search Console to keep your Google search terms.',
	],
	faq: [
		['Can I keep my Google Analytics history?', 'Yes. misomoon imports a GA4 property’s history, and the imported numbers show next to the ones misomoon collects.'],
		['Why are misomoon’s numbers lower than GA4’s?', 'misomoon drops known bots and counts only real requests, with no modeled data.'],
		['Do I still need a cookie banner?', 'misomoon sets no cookies and stores nothing on the device unless a visitor opts out of being counted. Whether you need a banner depends on your country and the rest of your site. This is not legal advice.'],
	],
}

const fathom: Alternative = {
	slug: 'fathom',
	name: 'Fathom Analytics',
	short: 'Fathom',
	kind: 'hosted',
	answer:
		'Fathom is a paid, closed-source hosted service from $15 a month for 100k pageviews. misomoon is open source and runs in your Cloudflare account, with funnels and Web Vitals that Fathom’s docs don’t list.',
	description: 'misomoon and Fathom Analytics compared: price, open source, data location, funnels, Web Vitals, MCP, and tracker size. Sources checked October 2026.',
	trackerKb: 2.1,
	pickUs: [
		{ text: 'You want to own the code and the data. Only Fathom Lite, an older version, is open source.', src: 'https://github.com/usefathom/fathom', checked: C },
		{ text: 'You want funnels and Core Web Vitals. We found neither in Fathom’s docs.', src: 'https://usefathom.com/pricing', checked: C },
		{ text: `You want a lower price. misomoon ${START.name} is $${START.price} a month for ${pv(START.events)} events, pageviews and custom events together, on ${sites(START.sites)}. Fathom charges $15 for 100k pageviews.`, src: 'https://usefathom.com/pricing', checked: C },
	],
	pickThem: [
		{ text: 'You want two-factor sign-in today. misomoon has none yet.', src: 'https://usefathom.com/docs', checked: C },
	],
	facts: [
		{ label: 'Where your data lives', us: OUR_WHERE, them: 'Fathom (EU collection, then US)', src: 'https://usefathom.com/data', checked: C },
		{ label: 'Open source', us: 'Yes (MIT)', them: 'No. Fathom Lite, an older version, is MIT and gets no new features', edge: 'us', src: 'https://github.com/usefathom/fathom', checked: C },
		{ label: 'Price', us: OUR_PRICE, them: 'From $15 a month for 100k pageviews', src: 'https://usefathom.com/pricing', checked: C },
		{ label: 'Cookies', us: 'None', them: 'None (their claim)', src: 'https://usefathom.com/compliance', checked: C },
		{ label: 'Funnels', us: 'Yes', them: 'Not found', edge: 'us', src: 'https://usefathom.com/pricing', checked: C },
		{ label: 'Core Web Vitals', us: 'Yes', them: 'Not found', edge: 'us', src: 'https://usefathom.com/pricing', checked: C },
		{ label: 'Official MCP server', us: 'Built in', them: 'Not found', edge: 'us', src: 'https://usefathom.com/docs', checked: C },
		{ label: 'Tracker, gzipped', us: OUR_TRACKER, them: '2.1 KB', src: MEASURED, checked: C },
		{ label: 'Two-factor sign-in', us: 'No', them: 'Yes', edge: 'them', src: 'https://usefathom.com/docs', checked: C },
	],
	switching: [
		'Add the misomoon script next to Fathom’s and compare for a billing cycle.',
		'Recreate your events as goals in misomoon.',
		'Cancel the plan once the numbers line up.',
	],
	faq: [
		[
			'Is misomoon cheaper than Fathom?',
			`Yes, at the entry price. misomoon ${START.name} is $${START.price} a month for ${pv(START.events)} events on ${sites(START.sites)}, and Fathom starts at $15 for 100k pageviews. misomoon’s events count custom events as well as pageviews, so a site whose pageviews and custom events pass ${pv(START.events)} a month, or a second site, needs ${GROWTH.name}: $${GROWTH.price} for ${words(GROWTH.events)} events on ${sites(GROWTH.sites)}. Self-hosted misomoon costs what Cloudflare charges for the Workers, D1 and Queues it uses: nothing on the Workers Free plan, which handles about 3,000 events a day, and from $5 a month for the whole account on Workers Paid.`,
		],
		['Is my data in the EU?', 'On misomoon Cloud you pick the EU, the US or Asia-Pacific for each site. Self-hosted, the data stays in D1 databases in your Cloudflare account.'],
		['Does misomoon set cookies?', 'No. It sets no cookies and stores nothing on the visitor’s device unless they opt out of being counted.'],
	],
}

const simple: Alternative = {
	slug: 'simple-analytics',
	name: 'Simple Analytics',
	short: 'Simple Analytics',
	kind: 'hosted',
	answer:
		`Simple Analytics is a hosted, cookieless service from the Netherlands, free for 5 sites with one month of history. misomoon is open source, keeps up to ${years(LONGEST_KEPT)} of history on Cloud and as long as you choose when you self-host, and adds revenue, Web Vitals and an MCP server.`,
	description: 'misomoon and Simple Analytics compared: price, history, revenue, funnels, Web Vitals, MCP, and tracker size. Sources checked October 2026.',
	trackerKb: 3.9,
	pickUs: [
		{ text: `You want more than one month of history. misomoon Cloud keeps ${years(START.retentionDays)} from $${START.price} a month, and self-hosted misomoon keeps it as long as you choose.`, src: 'https://www.simpleanalytics.com/pricing', checked: C },
		{ text: 'You want revenue credited to the visit that brought the buyer.', src: 'https://www.simpleanalytics.com/pricing', checked: C },
		{ text: 'You want the code: Simple Analytics opens only its tracker scripts.', src: 'https://github.com/simpleanalytics/scripts', checked: C },
	],
	pickThem: [
		{ text: 'You want a company and servers in the Netherlands.', src: 'https://docs.simpleanalytics.com/compliance', checked: C },
		{ text: 'You want Do Not Track respected by default.', src: 'https://docs.simpleanalytics.com/dnt', checked: C },
	],
	facts: [
		{ label: 'Where your data lives', us: OUR_WHERE, them: 'The Netherlands', src: 'https://docs.simpleanalytics.com/compliance', checked: C },
		{ label: 'Open source', us: 'Yes (MIT)', them: 'No, only the tracker scripts', edge: 'us', src: 'https://github.com/simpleanalytics/scripts', checked: C },
		{ label: 'Price', us: OUR_PRICE, them: 'Free for 5 sites with a 1-month history; from $20 a month', src: 'https://www.simpleanalytics.com/pricing', checked: C },
		{ label: 'Cookies', us: 'None', them: 'None (their claim)', src: 'https://docs.simpleanalytics.com/compliance', checked: C },
		{ label: 'Funnels', us: 'Yes', them: 'No; goals on some plans', edge: 'us', src: 'https://docs.simpleanalytics.com/goals', checked: C },
		{ label: 'Revenue', us: 'Yes', them: 'Not found', edge: 'us', src: 'https://www.simpleanalytics.com/pricing', checked: C },
		{ label: 'Official MCP server', us: 'Built in', them: 'No', edge: 'us', src: 'https://docs.simpleanalytics.com', checked: C },
		{ label: 'Do Not Track', us: 'Optional, per site', them: 'On by default', src: 'https://docs.simpleanalytics.com/dnt', checked: C },
		{ label: 'Tracker, gzipped', us: OUR_TRACKER, them: '3.9 KB', src: MEASURED, checked: C },
	],
	switching: [
		'Add the misomoon script next to the Simple Analytics one and compare for a few weeks.',
		'Connect your payment provider under Settings > Revenue.',
		'Set how long to keep events per site under Settings.',
	],
	faq: [
		['Does misomoon keep my history longer?', `Yes. On misomoon Cloud, ${keepSentence()} You can choose a shorter period for a site under Settings. Self-hosted, there is no limit.`],
		['Is misomoon cookieless too?', 'Yes. It sets no cookies and stores nothing on the visitor’s device unless they opt out of being counted.'],
		['Can misomoon honor Do Not Track?', 'Yes, as an option per site. Global Privacy Control is an option too.'],
	],
}

const cloudflare: Alternative = {
	slug: 'cloudflare-web-analytics',
	name: 'Cloudflare Web Analytics',
	short: 'Cloudflare',
	kind: 'hosted',
	answer:
		'Cloudflare Web Analytics is free and cookieless, with no custom events, UTM campaigns or funnels, and data sampled after 7 days. misomoon runs on the same Cloudflare network, in your own account, with all of those.',
	description: 'misomoon and Cloudflare Web Analytics compared: custom events, UTM, funnels, revenue, retention, sampling, and tracker size. Sources checked October 2026.',
	trackerKb: 10,
	pickUs: [
		{ text: 'You want custom events and UTM campaigns. Cloudflare Web Analytics has neither.', src: 'https://developers.cloudflare.com/web-analytics/faq/', checked: C },
		{ text: 'You want unsampled data kept for years, not 6 months sampled after 7 days.', src: 'https://developers.cloudflare.com/web-analytics/faq/', checked: C },
		{ text: 'You want funnels and revenue.', src: 'https://www.cloudflare.com/web-analytics/', checked: C },
	],
	pickThem: [
		{ text: 'You only need pageviews and Web Vitals, for free, with nothing to deploy.', src: 'https://www.cloudflare.com/web-analytics/', checked: C },
		{ text: 'Your site is already proxied by Cloudflare and you want analytics with no script at all.', src: 'https://developers.cloudflare.com/web-analytics/faq/', checked: C },
	],
	facts: [
		{ label: 'Where your data lives', us: OUR_WHERE, them: 'Cloudflare', src: 'https://www.cloudflare.com/web-analytics/', checked: C },
		{ label: 'Price', us: OUR_PRICE, them: 'Free', edge: 'them', src: 'https://www.cloudflare.com/web-analytics/', checked: C },
		{ label: 'Cookies', us: 'None', them: 'None', src: 'https://www.cloudflare.com/web-analytics/', checked: C },
		{ label: 'Custom events and UTM', us: 'Yes', them: 'No', edge: 'us', src: 'https://developers.cloudflare.com/web-analytics/faq/', checked: C },
		{ label: 'Funnels and revenue', us: 'Yes', them: 'No', edge: 'us', src: 'https://www.cloudflare.com/web-analytics/', checked: C },
		{ label: 'Core Web Vitals', us: 'Yes', them: 'Yes', src: 'https://developers.cloudflare.com/web-analytics/data-metrics/core-web-vitals/', checked: C },
		{ label: 'Data retention', us: OUR_RETENTION, them: '6 months, sampled after 7 days', edge: 'us', src: 'https://developers.cloudflare.com/web-analytics/faq/', checked: C },
		{ label: 'Official MCP server', us: 'Built in', them: 'A general Cloudflare GraphQL server', edge: 'us', src: 'https://github.com/cloudflare/mcp-server-cloudflare', checked: C },
		{ label: 'Tracker, gzipped', us: OUR_TRACKER, them: '10 KB', src: MEASURED, checked: C },
	],
	switching: [
		'Deploy misomoon to the Cloudflare account you already have, with the Deploy to Cloudflare button.',
		'Add the misomoon script, or serve it from your own domain with the first-party proxy.',
		'Turn on goals and revenue for the events Web Analytics couldn’t count.',
	],
	faq: [
		['Isn’t this the same as Cloudflare’s own analytics?', 'No. misomoon is a separate open-source app that you deploy to your Cloudflare account. It adds custom events, UTM, funnels, revenue and unsampled data.'],
		['What does it cost on Cloudflare?', 'The Workers Free plan handles about 3,000 events a day. Busier sites need the Workers Paid plan, from $5 a month for the whole account.'],
		['Can I keep using Cloudflare Web Analytics too?', 'Yes. They don’t conflict, so you can run both.'],
	],
}

const datafast: Alternative = {
	slug: 'datafast',
	name: 'DataFast',
	short: 'DataFast',
	kind: 'hosted',
	answer:
		`DataFast is hosted, revenue-first analytics. Its Starter plan is $9 a month for 10k events on 1 site, and its default script sets a visitor cookie for a year. misomoon credits revenue to the visit with no cookie at all, counts ${pv(START.events)} events on ${sites(START.sites)} for $${START.price}, and is open source.`,
	description: 'misomoon and DataFast compared: revenue attribution, cookies, price per event, sites and seats, Web Vitals, Google import, and tracker size.',
	trackerKb: 5.3,
	pickUs: [
		{ text: 'You want revenue attribution without a cookie. DataFast’s default script keeps `datafast_visitor_id` for a year.', src: 'https://datafa.st/js/script.js', checked: C },
		{ text: 'More than one person reads the numbers. DataFast Starter has 1 team member, and every misomoon plan has teams.', src: 'https://datafa.st/', checked: C },
		{ text: 'You want to bring your Google Analytics history. DataFast imports from Plausible only, with Google “next”.', src: 'https://datafa.st/', checked: C },
	],
	pickThem: [
		{ text: 'You sell on Shopify and want revenue tracked with no script to install.', src: 'https://datafa.st/docs/connect-payment-provider', checked: C },
		{ text: 'You want attribution for X links and social mentions.', src: 'https://datafa.st/', checked: C },
		{ text: 'You want a 14-day trial rather than 7.', src: 'https://datafa.st/', checked: C },
	],
	facts: [
		{ label: 'Price', us: OUR_PRICE, them: 'Starter $9 a month for 10k events, 1 site, 1 team member', edge: 'us', src: 'https://datafa.st/', checked: C },
		{ label: 'Free trial', us: `${TRIAL_DAYS} days, no card`, them: '14 days, no card', edge: 'them', src: 'https://datafa.st/', checked: C },
		{ label: 'Cookies', us: 'None', them: '`datafast_visitor_id` for 1 year by default. A cookieless script is optional', edge: 'us', src: 'https://datafa.st/js/script.js', checked: C },
		{ label: 'Revenue from payments', us: OUR_REVENUE, them: 'Stripe, Lemon Squeezy, Polar, Shopify, WooCommerce and more', src: 'https://datafa.st/docs/connect-payment-provider', checked: C },
		{ label: 'Funnels', us: 'Yes, 3 modes', them: 'Yes', src: 'https://datafa.st/llms.txt', checked: C },
		{ label: 'Core Web Vitals', us: 'Yes', them: 'Not found in its docs', edge: 'us', src: 'https://datafa.st/llms.txt', checked: C },
		{ label: 'Import from Google', us: 'Yes', them: 'No. Plausible only, Google “next”', edge: 'us', src: 'https://datafa.st/', checked: C },
		{ label: 'Official MCP server', us: 'Built in', them: 'Yes', src: 'https://datafa.st/docs/mcp-introduction', checked: C },
		{ label: 'Where your data lives', us: OUR_WHERE, them: 'Mostly outside the EU, including the US', edge: 'us', src: 'https://datafa.st/dpa', checked: C },
		{ label: 'Open source and self-hosting', us: 'MIT, free to self-host on Cloudflare', them: 'Not found: hosted only', edge: 'us', src: 'https://datafa.st/llms.txt', checked: C },
		{ label: 'Tracker, gzipped', us: OUR_TRACKER, them: '5.3 KB', edge: 'us', src: MEASURED, checked: C },
	],
	switching: [
		'Start a misomoon trial and add its script next to DataFast’s. Running both keeps your numbers unbroken.',
		'Connect Stripe, Polar, Lemon Squeezy or Dodo Payments under Settings > Revenue, so each new sale is credited to the visit that brought it.',
		'Recreate your goals, then remove the DataFast script once the numbers line up.',
	],
	faq: [
		['Does misomoon attribute revenue like DataFast?', 'Yes. Connect your payment provider or your own server, and each sale is credited to the visit and the source that brought the buyer. misomoon does it without a cookie.'],
		[
			'Which costs less?',
			`misomoon, at the entry price. DataFast Starter is $9 a month for 10k events on 1 site with 1 team member. misomoon ${START.name} is $${START.price} for ${pv(START.events)} events on ${sites(START.sites)}, with teams. For more sites, misomoon ${GROWTH.name} is $${GROWTH.price} for ${pv(GROWTH.events)} events on ${sites(GROWTH.sites)}. Self-hosted misomoon costs what Cloudflare charges.`,
		],
		['Can I keep my history?', 'misomoon imports a Google Analytics property, or CSV files in the format on the import page. Keep DataFast until the new numbers cover the period you need.'],
	],
}

const pirsch: Alternative = {
	slug: 'pirsch',
	name: 'Pirsch',
	short: 'Pirsch',
	kind: 'hosted',
	answer:
		'Pirsch is cookieless and hosted in Germany, from $6 a month for 10k pageviews, with funnels on the $12 Plus plan. misomoon has funnels, revenue from your payment provider and Core Web Vitals on every plan, imports Google Analytics 4, and is free to self-host.',
	description: 'misomoon and Pirsch compared: funnels, revenue, Web Vitals, Google import, MCP, price, and tracker size, with sources checked in October 2026.',
	trackerKb: 3.5,
	pickUs: [
		{ text: 'You want funnels without the Plus plan. Pirsch’s $6 Standard plan has none.', src: 'https://pirsch.io/pricing', checked: C },
		{ text: 'You want your Google Analytics 4 history. Pirsch imports Universal Analytics (GA3) only.', src: 'https://docs.pirsch.io/get-started/ga-import', checked: C },
		{ text: 'You want an official MCP server. Pirsch’s is a community project it doesn’t support.', src: 'https://docs.pirsch.io/integrations/mcp', checked: C },
	],
	pickThem: [
		{ text: 'You want a company and servers in Germany.', src: 'https://pirsch.io/pricing', checked: C },
		{ text: 'You want a 30-day trial, or hosted data kept with no time limit.', src: 'https://pirsch.io/pricing', checked: C },
	],
	facts: [
		{ label: 'Price', us: OUR_PRICE, them: 'From $6 a month for 10k pageviews; funnels from $12', src: 'https://pirsch.io/pricing', checked: C },
		{ label: 'Free trial', us: `${TRIAL_DAYS} days, no card`, them: '30 days, no card', edge: 'them', src: 'https://pirsch.io/pricing', checked: C },
		{ label: 'Where your data lives', us: OUR_WHERE, them: 'Germany', src: 'https://pirsch.io/pricing', checked: C },
		{ label: 'Cookies', us: 'None', them: 'None (their claim)', src: 'https://docs.pirsch.io/privacy', checked: C },
		{ label: 'Funnels', us: 'Yes, every plan', them: 'Plus plan and up', edge: 'us', src: 'https://pirsch.io/pricing', checked: C },
		{ label: 'Revenue from payments', us: OUR_REVENUE, them: 'Revenue from your own events; no payment connections found', edge: 'us', src: 'https://pirsch.io/pricing', checked: C },
		{ label: 'Core Web Vitals', us: 'Yes', them: 'Not on its feature list', edge: 'us', src: 'https://pirsch.io/pricing', checked: C },
		{ label: 'Import from Google', us: 'GA4', them: 'Universal Analytics (GA3) only', edge: 'us', src: 'https://docs.pirsch.io/get-started/ga-import', checked: C },
		{ label: 'Official MCP server', us: 'Built in', them: 'No, an unsupported community project', edge: 'us', src: 'https://docs.pirsch.io/integrations/mcp', checked: C },
		{ label: 'Open source and self-hosting', us: 'MIT, free to self-host on Cloudflare', them: 'AGPL-3.0 core library; on-premise on Enterprise', edge: 'us', src: 'https://github.com/pirsch-analytics/pirsch', checked: C },
		{ label: 'Data retention', us: OUR_RETENTION, them: 'Unlimited', edge: 'them', src: 'https://pirsch.io/pricing', checked: C },
		{ label: 'Tracker, gzipped', us: OUR_TRACKER, them: '3.5 KB', edge: 'us', src: MEASURED, checked: C },
	],
	switching: [
		'Start a misomoon trial and add its script next to Pirsch’s for a billing cycle.',
		'Recreate your conversion goals and funnels in misomoon.',
		'Connect your payment provider under Settings > Revenue to see the money behind each source.',
	],
	faq: [
		['Is misomoon cookieless like Pirsch?', 'Yes. Neither sets cookies. misomoon stores nothing on the visitor’s device unless they opt out of being counted.'],
		[
			'Which one is cheaper?',
			`For one site, misomoon. ${START.name} is $${START.price} a month for ${pv(START.events)} events, which count pageviews and custom events together. Pirsch starts at $6 for 10k pageviews. misomoon includes funnels and revenue, which Pirsch puts on its $12 Plus plan or doesn’t have. For more than one site, misomoon ${GROWTH.name} is $${GROWTH.price} for ${pv(GROWTH.events)} events on ${sites(GROWTH.sites)}.`,
		],
		['Can I keep my data in Europe?', 'Yes. On misomoon Cloud, pick the EU region when you add a site. Self-hosted, the data stays in your Cloudflare account.'],
	],
}

const goatcounter: Alternative = {
	slug: 'goatcounter',
	name: 'GoatCounter',
	short: 'GoatCounter',
	kind: 'self-hosted',
	answer:
		'GoatCounter is a small open-source counter, free on its donation-supported service or as one Go binary on your server. It counts pages and events and stops there: we found no funnels, goals, revenue or dated Google history. misomoon has all four and needs no server.',
	description: 'misomoon and GoatCounter compared: funnels, goals, revenue, Google import, self-hosting, price, and tracker size, with sources checked in October 2026.',
	trackerKb: 3.3,
	pickUs: [
		{ text: 'You want funnels, goals and revenue, not only page counts.', src: 'https://www.goatcounter.com/help/faq', checked: C },
		{ text: 'You want your Google Analytics history by day. GoatCounter adds Google’s totals to its visitor counter only.', src: 'https://github.com/arp242/goatcounter/blob/master/tpl/settings_export.gohtml', checked: C },
		{ text: 'You don’t want a server to run, back up and patch.', src: 'https://github.com/arp242/goatcounter', checked: C },
	],
	pickThem: [
		{ text: 'You want hosted analytics for free, and can donate instead of paying.', src: 'https://www.goatcounter.com/', checked: C },
		{ text: 'You want one binary on your own server, with SQLite, and no Cloudflare account.', src: 'https://github.com/arp242/goatcounter', checked: C },
		{ text: 'You want a tracking pixel that works without JavaScript.', src: 'https://www.goatcounter.com/', checked: C },
	],
	facts: [
		{ label: 'License', us: 'MIT', them: 'A modified EUPL 1.2', src: 'https://github.com/arp242/goatcounter/blob/master/LICENSE', checked: C },
		{ label: 'What self-hosting needs', us: 'A Cloudflare account', them: 'A server for its Go binary, with SQLite or PostgreSQL', edge: 'us', src: 'https://github.com/arp242/goatcounter', checked: C },
		{ label: 'Hosted price', us: OUR_PRICE, them: 'Free, supported by donations', edge: 'them', src: 'https://www.goatcounter.com/', checked: C },
		{ label: 'Cookies', us: 'None', them: 'None (their claim)', src: 'https://www.goatcounter.com/privacy', checked: C },
		{ label: 'Funnels and goals', us: 'Yes', them: 'Not found', edge: 'us', src: 'https://www.goatcounter.com/help/faq', checked: C },
		{ label: 'Revenue from payments', us: OUR_REVENUE, them: 'Not found', edge: 'us', src: 'https://www.goatcounter.com/help/faq', checked: C },
		{ label: 'Import from Google', us: 'Yes', them: 'Totals for its visitor counter, no daily history', edge: 'us', src: 'https://github.com/arp242/goatcounter/blob/master/tpl/settings_export.gohtml', checked: C },
		{ label: 'Official MCP server', us: 'Built in', them: 'Not found', edge: 'us', src: 'https://www.goatcounter.com/api', checked: C },
		{ label: 'Tracker, gzipped', us: OUR_TRACKER, them: '3.3 KB', edge: 'us', src: MEASURED, checked: C },
	],
	switching: [
		'Add the misomoon script next to GoatCounter’s count.js and compare for a few weeks.',
		'Turn the events you send to GoatCounter into goals, then build a funnel from them.',
		'Connect your payment provider under Settings > Revenue.',
	],
	faq: [
		['Is misomoon as simple as GoatCounter?', 'The install is the same: one script tag. The dashboard has more in it, such as funnels and revenue. The Light preset keeps the tracker at 1.9 KB.'],
		['Can I keep my GoatCounter history?', 'Not directly. misomoon imports a Google Analytics property, or CSV files in the format on the import page.'],
		['Is misomoon open source too?', 'Yes, under the MIT license.'],
	],
}

const swetrix: Alternative = {
	slug: 'swetrix',
	name: 'Swetrix',
	short: 'Swetrix',
	kind: 'self-hosted',
	answer:
		`Swetrix is open source under AGPL-3.0, with a cloud from $19 a month and a self-hosted edition on Docker, MySQL, ClickHouse and Redis that leaves revenue and alerts to the cloud. misomoon has funnels, revenue, errors and Web Vitals in one MIT version, from $${START.price} a month or free on Cloudflare.`,
	description: 'misomoon and Swetrix compared: price, self-hosting needs, revenue, Web Vitals, session replay, MCP, 2FA, and tracker size, checked October 2026.',
	trackerKb: 6.7,
	pickUs: [
		{ text: 'You want revenue and alerts when you self-host. Swetrix keeps them in its cloud.', src: 'https://github.com/Swetrix/swetrix', checked: C },
		{ text: 'You don’t want to run Docker, MySQL, ClickHouse and Redis.', src: 'https://github.com/Swetrix/swetrix', checked: C },
		{ text: `You want a hosted plan for less: $${START.price} a month for ${sites(START.sites)}, or $${GROWTH.price} for ${sites(GROWTH.sites)}. Swetrix starts at $19, and its trial needs a card.`, src: 'https://swetrix.com/pricing', checked: C },
	],
	pickThem: [
		{ text: 'You need session replay. Swetrix has it on the $39 Plus plan, and misomoon has none.', src: 'https://swetrix.com/pricing', checked: C },
		{ text: 'You want two-factor sign-in today. misomoon has none yet.', src: 'https://swetrix.com/security', checked: C },
	],
	facts: [
		{ label: 'License', us: 'MIT', them: 'AGPL-3.0', src: 'https://github.com/Swetrix/swetrix', checked: C },
		{ label: 'What self-hosting needs', us: 'A Cloudflare account', them: 'Docker, MySQL, ClickHouse and Redis', edge: 'us', src: 'https://github.com/Swetrix/swetrix', checked: C },
		{ label: 'Self-hosted edition limits', us: 'None', them: 'No revenue, alerts or experiments', edge: 'us', src: 'https://github.com/Swetrix/swetrix', checked: C },
		{ label: 'Price', us: OUR_PRICE, them: 'From $19 a month; 14-day trial with a card', edge: 'us', src: 'https://swetrix.com/pricing', checked: C },
		{ label: 'Funnels', us: 'Yes, 3 modes', them: 'Yes', src: 'https://swetrix.com/pricing', checked: C },
		{ label: 'Core Web Vitals', us: 'Yes', them: 'Load timings such as TTFB, no Web Vitals named', edge: 'us', src: 'https://swetrix.com/performance', checked: C },
		{ label: 'Session replay', us: 'No', them: 'Plus plan, $39 a month', edge: 'them', src: 'https://swetrix.com/pricing', checked: C },
		{ label: 'Import from Google', us: 'Yes', them: 'Yes, GA4', src: 'https://swetrix.com/docs/data-import', checked: C },
		{ label: 'Two-factor sign-in', us: 'No', them: 'Yes', edge: 'them', src: 'https://swetrix.com/security', checked: C },
		{ label: 'Tracker, gzipped', us: OUR_TRACKER, them: '6.7 KB', edge: 'us', src: MEASURED, checked: C },
	],
	switching: [
		'Start a misomoon trial, or deploy it to your Cloudflare account, and add its script next to Swetrix’s.',
		'Recreate your goals and funnels. Custom events with the same names keep working.',
		'Connect your payment provider under Settings > Revenue.',
	],
	faq: [
		['Is misomoon open source like Swetrix?', 'Yes. misomoon is MIT-licensed, and the self-hosted version has every feature.'],
		['Does misomoon track JavaScript errors?', 'Yes, as a feature you can turn on per site.'],
		['Does misomoon have session replay?', 'No. misomoon has click maps, scroll depth and form drop-off, and no recordings of visits.'],
	],
}

const vercel: Alternative = {
	slug: 'vercel-web-analytics',
	name: 'Vercel Web Analytics',
	short: 'Vercel Analytics',
	kind: 'hosted',
	answer:
		'Vercel Web Analytics is cookieless and built into Vercel projects. The free Hobby plan pauses counting at 50,000 events a month, custom events need Pro, and UTM campaigns need the Plus add-on. misomoon has events, UTM, funnels and revenue on every plan, for a site on any host.',
	description: 'misomoon and Vercel Web Analytics compared: free limits, custom events, UTM, funnels, revenue, reporting window, Web Vitals, and tracker size.',
	trackerKb: 2.0,
	pickUs: [
		{ text: 'You want custom events and UTM campaigns without a Pro plan and a Plus add-on.', src: 'https://vercel.com/docs/analytics/limits-and-pricing', checked: C },
		{ text: 'You want more than 12 months of reports. Vercel shows 1 month on Hobby and 12 on Pro.', src: 'https://vercel.com/docs/analytics/limits-and-pricing', checked: C },
		{ text: 'You want funnels and revenue, or analytics for a site that isn’t on Vercel.', src: 'https://vercel.com/docs/analytics/quickstart', checked: C },
	],
	pickThem: [
		{ text: 'Your site is on Vercel and you want analytics you turn on in the project and add with one package.', src: 'https://vercel.com/docs/analytics/quickstart', checked: C },
		{ text: 'You need a vendor with SOC 2 Type 2 and ISO 27001.', src: 'https://vercel.com/docs/security/compliance', checked: C },
	],
	facts: [
		{ label: 'Free plan', us: `${TRIAL_DAYS}-day trial, or free to self-host`, them: '50,000 events a month, then counting pauses', src: 'https://vercel.com/docs/analytics/limits-and-pricing', checked: C },
		{ label: 'Price', us: OUR_PRICE, them: 'Pro: $0.03 per 1k events, plus Vercel Pro', src: 'https://vercel.com/docs/analytics/limits-and-pricing', checked: C },
		{ label: 'Custom events', us: 'Every plan', them: 'Pro and Enterprise', edge: 'us', src: 'https://vercel.com/docs/analytics/limits-and-pricing', checked: C },
		{ label: 'UTM campaigns', us: 'Every plan', them: 'Web Analytics Plus or Enterprise', edge: 'us', src: 'https://vercel.com/docs/analytics/using-web-analytics', checked: C },
		{ label: 'Reporting window', us: OUR_RETENTION, them: '1 month on Hobby, 12 on Pro, 24 with Plus', edge: 'us', src: 'https://vercel.com/docs/analytics/limits-and-pricing', checked: C },
		{ label: 'Funnels and revenue', us: 'Yes', them: 'Not found', edge: 'us', src: 'https://vercel.com/docs/analytics', checked: C },
		{ label: 'Core Web Vitals', us: 'Yes, in the same dashboard', them: 'Speed Insights, all vitals at $10 per project a month', edge: 'us', src: 'https://vercel.com/docs/speed-insights/limits-and-pricing', checked: C },
		{ label: 'Cookies', us: 'None', them: 'None (their claim)', src: 'https://vercel.com/docs/analytics', checked: C },
		{ label: 'Official MCP server', us: 'Built in', them: 'Vercel MCP can query Web Analytics', src: 'https://vercel.com/docs/agent-resources/vercel-mcp', checked: C },
		{ label: 'SOC 2 or ISO 27001', us: 'No (Cloudflare has both)', them: 'SOC 2 Type 2, ISO 27001:2022', edge: 'them', src: 'https://vercel.com/docs/security/compliance', checked: C },
		{ label: 'Tracker, gzipped', us: OUR_TRACKER, them: '2.0 KB', src: MEASURED, checked: C },
	],
	switching: [
		'Add the misomoon script to your layout next to the Vercel Analytics component.',
		'Call `misomoon(\'Signup\')` where you call Vercel’s `track()`, and mark the events that matter as goals.',
		'Remove the Analytics component once the numbers line up, and turn Web Analytics off in the project.',
	],
	faq: [
		['Does misomoon work on Vercel?', 'Yes. Add the script tag or the SDK to any framework on Vercel, or on any other host.'],
		['What happens at 50,000 events?', `On Vercel’s Hobby plan, counting pauses until the next cycle. misomoon plans count events too, pageviews and custom events together, from ${pv(START.events)} a month on ${START.name}. Every plan has custom events and UTM campaigns.`],
		['Does misomoon have Web Vitals like Speed Insights?', 'Yes. LCP, INP and CLS from real visitors sit in the same dashboard as your traffic.'],
	],
}

const clarity: Alternative = {
	slug: 'microsoft-clarity',
	name: 'Microsoft Clarity',
	short: 'Clarity',
	kind: 'product',
	answer:
		'Microsoft Clarity is free session replay and heatmaps. It sets cookies, including Microsoft’s `MUID` advertising cookie, and since 31 October 2025 it needs a consent signal for visits from the EEA, the UK and Switzerland. misomoon sets no cookies and has click maps, funnels, revenue and Web Vitals in data you own.',
	description: 'misomoon and Microsoft Clarity compared: cookies and consent, replay, click maps, funnels, revenue, retention, MCP, and tracker size.',
	trackerKb: 26,
	pickUs: [
		{ text: 'You want behavior data without cookies or a consent signal. Clarity needs one for visits from the EEA, the UK and Switzerland.', src: 'https://learn.microsoft.com/en-us/clarity/setup-and-installation/consent-mode', checked: C },
		{ text: 'You want a longer history. Clarity deletes recordings after 30 days and heatmaps after 9 months.', src: 'https://learn.microsoft.com/en-us/clarity/setup-and-installation/data-retention', checked: C },
		{ text: 'You want traffic and revenue in the same place as your click maps.', src: 'https://learn.microsoft.com/en-us/clarity/faq', checked: C },
	],
	pickThem: [
		{ text: 'You want session recordings. Clarity has them for free, and misomoon has none.', src: 'https://learn.microsoft.com/en-us/clarity/faq', checked: C },
		{ text: 'You want free scroll and area heatmaps at any traffic.', src: 'https://learn.microsoft.com/en-us/clarity/heatmaps/heatmaps-overview', checked: C },
	],
	facts: [
		{ label: 'Price', us: OUR_PRICE, them: 'Free', edge: 'them', src: 'https://learn.microsoft.com/en-us/clarity/faq', checked: C },
		{ label: 'Cookies', us: 'None', them: 'First-party `_clck` and `_clsk`, and third-party `CLID`, `ANONCHK`, `MR`, `MUID` and `SM`', edge: 'us', src: 'https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-cookies', checked: C },
		{ label: 'Consent in Europe', us: 'No cookies, nothing stored on the device', them: 'A consent signal, required since 31 October 2025', edge: 'us', src: 'https://learn.microsoft.com/en-us/clarity/setup-and-installation/consent-mode', checked: C },
		{ label: 'Session replay', us: 'No', them: 'Yes', edge: 'them', src: 'https://learn.microsoft.com/en-us/clarity/faq', checked: C },
		{ label: 'Heatmaps', us: 'Click maps and scroll depth', them: 'Click, scroll, area, conversion and attention maps', edge: 'them', src: 'https://learn.microsoft.com/en-us/clarity/heatmaps/heatmaps-overview', checked: C },
		{ label: 'Funnels', us: 'Yes', them: 'Yes', src: 'https://learn.microsoft.com/en-us/clarity/setup-and-installation/funnels', checked: C },
		{ label: 'Data retention', us: OUR_RETENTION, them: 'Recordings 30 days, heatmaps 9 months', edge: 'us', src: 'https://learn.microsoft.com/en-us/clarity/setup-and-installation/data-retention', checked: C },
		{ label: 'Where your data lives', us: OUR_WHERE, them: 'Microsoft Azure', src: 'https://learn.microsoft.com/en-us/clarity/faq', checked: C },
		{ label: 'Official MCP server', us: 'Built in', them: 'Yes, 10 requests a day over the last 3 days', edge: 'us', src: 'https://learn.microsoft.com/en-us/clarity/third-party-integrations/clarity-mcp-server', checked: C },
		{ label: 'Tracker, gzipped', us: OUR_TRACKER, them: '26 KB (clarity.js 0.8.73)', edge: 'us', src: MEASURED, checked: C },
	],
	switching: [
		'Turn on click maps and form analytics for the site in misomoon, next to Clarity.',
		'Compare the click maps of your key pages for a week.',
		'If you kept a consent banner only for Clarity, check whether you still need one. This is not legal advice.',
	],
	faq: [
		['Can misomoon replace Clarity?', 'For click maps, scroll depth and form drop-off, yes. For recordings of each visit, no: misomoon doesn’t record sessions.'],
		['Does misomoon need a consent banner?', 'misomoon sets no cookies, the usual reason for a banner, and stores nothing on the device unless a visitor opts out of being counted. Whether you need one depends on your country and the rest of your site.'],
		['Can I run both?', 'Yes. Many sites keep a recorder for design reviews and use misomoon for traffic, goals and revenue.'],
	],
}

const mixpanel: Alternative = {
	slug: 'mixpanel',
	name: 'Mixpanel',
	short: 'Mixpanel',
	kind: 'product',
	answer:
		'Mixpanel is product analytics with session replay, experiments and feature flags, free up to 1M events a month. Its JavaScript SDK keeps a cookie for 365 days by default and weighs 34 KB gzipped. misomoon is web analytics with no cookies, a 1.9 KB Light tracker, and revenue from your payment provider.',
	description: 'misomoon and Mixpanel compared for web analytics: cookies, tracker size, price, replay, experiments, certifications, MCP, and data location.',
	trackerKb: 34,
	pickUs: [
		{ text: 'You want no cookies. Mixpanel’s SDK keeps one for 365 days by default.', src: 'https://docs.mixpanel.com/docs/tracking-methods/sdks/javascript', checked: C },
		{ text: 'You care about page weight: the Mixpanel SDK measured 34 KB gzipped, misomoon’s Light preset 1.9 KB.', src: MEASURED, checked: C },
		{ text: 'You want the code, or to run it in your own Cloudflare account.', src: 'https://mixpanel.com/pricing', checked: C },
	],
	pickThem: [
		{ text: 'You need session replay, experiments or feature flags. Mixpanel has all three, and misomoon has none.', src: 'https://mixpanel.com/pricing', checked: C },
		{ text: 'You need SOC 2 Type II and ISO 27001.', src: 'https://mixpanel.com/legal/security-overview/', checked: C },
		{ text: 'You analyze signed-in users across devices, not visits to a site.', src: 'https://docs.mixpanel.com/docs/tracking-methods/id-management/identifying-users', checked: C },
	],
	facts: [
		{ label: 'Price', us: OUR_PRICE, them: 'Free up to 1M events a month; Growth by usage', edge: 'them', src: 'https://mixpanel.com/pricing', checked: C },
		{ label: 'Cookies', us: 'None', them: 'A cookie for 365 days by default', edge: 'us', src: 'https://docs.mixpanel.com/docs/tracking-methods/sdks/javascript', checked: C },
		{ label: 'Session replay', us: 'No', them: '10k replays a month free', edge: 'them', src: 'https://mixpanel.com/pricing', checked: C },
		{ label: 'Experiments and feature flags', us: 'No', them: 'Yes', edge: 'them', src: 'https://mixpanel.com/pricing', checked: C },
		{ label: 'Funnels', us: 'Yes', them: 'Yes', src: 'https://docs.mixpanel.com/docs/reports/funnels', checked: C },
		{ label: 'Where your data lives', us: OUR_WHERE, them: 'US, or EU residency per project', src: 'https://docs.mixpanel.com/docs/privacy/eu-residency', checked: C },
		{ label: 'Official MCP server', us: 'Built in', them: 'Yes', src: 'https://docs.mixpanel.com/docs/mcp', checked: C },
		{ label: 'Open source and self-hosting', us: 'MIT, free to self-host on Cloudflare', them: 'Only the SDKs (Apache 2.0); the platform is hosted only', edge: 'us', src: 'https://docs.mixpanel.com/docs/tracking-methods/sdks/javascript', checked: C },
		{ label: 'SOC 2 or ISO 27001', us: 'No (Cloudflare has both)', them: 'SOC 2 Type II, ISO 27001 and 27701', edge: 'them', src: 'https://mixpanel.com/legal/security-overview/', checked: C },
		{ label: 'Tracker, gzipped', us: OUR_TRACKER, them: '34 KB (mixpanel-2-latest.min.js)', edge: 'us', src: MEASURED, checked: C },
	],
	switching: [
		'Add the misomoon script for your marketing site and keep Mixpanel in the product, or replace it on both.',
		'Send the events that mark a conversion, such as `misomoon(\'Signup\')`, and turn them into goals.',
		'Connect your payment provider under Settings > Revenue to see which sources bring paying customers.',
	],
	faq: [
		['Is misomoon a product analytics tool like Mixpanel?', 'No. misomoon is web analytics: visits, sources, goals, funnels and revenue. It doesn’t track signed-in users across devices, run experiments or record sessions.'],
		['Can I use both?', 'Yes. A common setup is misomoon on the marketing site, with no cookies, and Mixpanel inside the signed-in product.'],
		['Why is misomoon’s tracker so much smaller?', 'It sends visits and the events you turn on, and nothing else. The core is 1.0 KB gzipped and the Light preset 1.9 KB.'],
	],
}

/** In the order the hub page lists them: the most searched first. */
export const ALTERNATIVES: Alternative[] = [ga, plausible, datafast, umami, mixpanel, clarity, matomo, posthog, fathom, vercel, simple, pirsch, cloudflare, swetrix, goatcounter, rybbit]

export const alternative = (slug: string) => ALTERNATIVES.find((a) => a.slug === slug) ?? null
