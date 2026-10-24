// A page of its own for the features people search for by name, at /features/<slug>.
// Every claim matches docs/tracking.md and docs/dashboard.md, which the docs links point at.
import { DIFFER } from './pricing.ts'

export interface FeaturePage {
	slug: string
	/** the item in FEATURES this page explains, by name */
	feature: string
	/** the <title>, before " · misomoon" */
	title: string
	/** 70 to 160 characters */
	description: string
	/** the h1, then its second line in italics */
	h1: [string, string]
	/** the first paragraph: the whole answer, for a reader who stops there */
	answer: string
	/** what the report shows */
	shows: { name: string; what: string }[]
	/** how to turn it on and read it, in order */
	steps: string[]
	/** privacy, controls and limits */
	notes: string[]
	faq: [q: string, a: string][]
	/** the docs page, by file name without .md, and the heading on it */
	doc: string
	hash: string
	/** the other feature page to link to */
	related: string
}

const PLANS_ANSWER = `Every misomoon Cloud plan, and the open-source version. ${DIFFER}`

export const FEATURE_PAGES: FeaturePage[] = [
	{
		slug: 'heatmaps',
		feature: 'Heatmaps',
		title: 'Cookieless heatmaps with rage and dead clicks',
		description: 'See what people click on each page, with rage and dead clicks marked, drawn over your own site. No cookies and no session recording, on every plan.',
		h1: ['Heatmaps.', 'Drawn on your own page.'],
		answer:
			'misomoon’s heatmap counts the clicks on every element of a page and draws them over the page itself, with rage clicks and dead clicks marked. It sets no cookies and records no sessions: the tracker sends which element was clicked, never what anyone typed. It is on every misomoon Cloud plan and in the open-source version.',
		shows: [
			{ name: 'Clicks per element', what: 'Each clicked element, with its clicks, the visitors who clicked it, and its share of the page’s clicks.' },
			{ name: 'Rage clicks', what: 'The third click on one element within a second, counted for each element.' },
			{ name: 'Dead clicks', what: 'A click on something that looks clickable, after which nothing on the page changed for a second.' },
			{ name: 'On your page', what: '**Show on your site** opens the page in a new tab and draws a box on each clicked element, darker the more clicks it got.' },
		],
		steps: [
			'Tick **Clicks** under **Settings** > **Install** > **What to track**. It adds 1.0 KB to the tracker.',
			'Open **Behavior** > **Clicks**, and pick a page from the **Page** menu, which lists the 50 most visited pages.',
			'Select **Show on your site** to see the clicks drawn over the page, for the period and filters the dashboard shows.',
		],
		notes: [
			'No cookies and no session recording. The report is built from counts, so there is nothing to replay.',
			'The tracker never sends a field’s value. Put `data-misomoon-mask` on an element to send no text for clicks inside it.',
			'Put `data-misomoon-id` on an element to give it a stable name, so a redesign doesn’t split its clicks.',
			'`data-disable="clicks"` on the script tag turns clicks off on the pages that carry it, such as a checkout.',
			'An element that isn’t on the page when it opens, such as a closed menu, is counted but not drawn. The overlay says how many.',
			'A site that sends a `Cross-Origin-Opener-Policy` header cuts the link between the dashboard and the overlay tab, and the overlay says so.',
		],
		faq: [
			[
				'Does a heatmap need a cookie banner?',
				'misomoon’s heatmap sets no cookies and stores nothing on the visitor’s device, so it adds no cookie of its own. Whether your site needs a banner depends on your country and on what else the site does. This is not legal advice.',
			],
			['Does the heatmap record sessions?', 'No. misomoon counts clicks for each element. It never records a session, the mouse path, or what anyone types.'],
			[
				'Does the overlay work on a single-page app?',
				'Yes. The overlay follows route changes, including hash routes such as `#/pricing`, and asks the dashboard for the new page.',
			],
			['Which plans include heatmaps?', PLANS_ANSWER],
		],
		doc: 'tracking',
		hash: 'see-what-people-do-on-a-page',
		related: 'scroll-maps',
	},
	{
		slug: 'scroll-maps',
		feature: 'Scroll maps',
		title: 'Scroll maps: see how far down each page people read',
		description: 'See the share of visits that reached each tenth of a page, drawn over the page itself. Always on, with no cookies and no session recording.',
		h1: ['Scroll maps.', 'How far they really read.'],
		answer:
			'misomoon’s scroll map shows the share of visits that scrolled past each tenth of a page, and draws those bands over the page itself. It is always on, sets no cookies, and records no sessions. The map keeps only the deepest point each visit reached, so you see which part of the page most visits never get to.',
		shows: [
			{ name: 'Reached, by tenth', what: 'The share of visits that scrolled at least 10%, 20%, and so on, down to 100% of the page.' },
			{ name: 'Average depth', what: 'The average of each visit’s deepest scroll on the page.' },
			{ name: 'On your page', what: '**Show on your site** shades the page in bands, darker where fewer visits got, with a line at each tenth that says how many did.' },
			{ name: 'Time on page', what: 'The **Pages** list shows time on page, counted only while the page has focus, and the share read.' },
		],
		steps: [
			'Install the tracker. Scroll depth is on for every site, with nothing to tick.',
			'Open **Behavior** > **Scroll**, and pick a page from the **Page** menu, or filter by one page with **is**.',
			'Select **Show on your site** to see the bands drawn over the page.',
		],
		notes: [
			'No cookies and no session recording. For each page, the map keeps one number per visit: the deepest point it reached.',
			'The depth goes out with the engagement beacon, when the page is hidden or the route changes, so it costs no extra request.',
			'A site that sends a `Cross-Origin-Opener-Policy` header cuts the link between the dashboard and the overlay tab, and the overlay says so.',
		],
		faq: [
			[
				'What is a scroll map?',
				'A scroll map shows how far down a page visitors get. misomoon’s counts, for each tenth of the page, the share of visits that scrolled at least that far.',
			],
			['Do scroll maps need any setup?', 'No. Scroll depth is on for every site from the first visit. Clicks, forms, and the other behavior reports are the ones you tick in settings.'],
			['Does the scroll map record sessions?', 'No. misomoon keeps the deepest point each visit reached on each page. It never records a session or the mouse path.'],
			['Which plans include scroll maps?', PLANS_ANSWER],
		],
		doc: 'tracking',
		hash: 'see-what-people-do-on-a-page',
		related: 'heatmaps',
	},
]

export const featurePage = (slug: string) => FEATURE_PAGES.find((p) => p.slug === slug) ?? null
