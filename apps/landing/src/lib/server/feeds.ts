// The machine-read files: sitemap.xml, feed.xml, robots.txt, llms.txt and llms-full.txt.
// misomoon.com also serves the docs site's sitemap and llms files: its robots.txt and
// redirects point here.
import { ALTERNATIVES } from '#lib/alternatives.ts'
import { FEATURE_PAGES } from '#lib/feature-pages.ts'
import { FEATURES } from '#lib/features.ts'
import { LEGAL } from '#lib/legal.ts'
import { docLink } from '#lib/links.ts'
import { DIFFER, EVENT, EVERY_PLAN, LARGEST, PLANS, SUPPORT, TRIAL, TRIAL_LIMITS, keepSentence, priceSentence, summary, words } from '#lib/pricing.ts'
import type { Entry } from './content.ts'
import { absolute, sections, source, type DocSection } from './docs.ts'
import { legalPage, publishedLegal } from './legal.ts'

const xml = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!)

export interface SitemapUrl {
	/** a path on this site, or the full URL of a docs page */
	path: string
	/** only when it is the real date of the last change: Google ignores a lastmod that isn't */
	lastmod?: string
}

/** The pages built from code, with a lastmod only where the code knows the date. */
export function codePages(): SitemapUrl[] {
	return [
		{ path: '/' },
		{ path: '/features' },
		{ path: '/pricing' },
		{ path: '/demo' },
		...FEATURE_PAGES.map((p) => ({ path: `/features/${p.slug}` })),
		...publishedLegal().map((slug) => ({ path: `/${slug}` })),
		{ path: '/alternatives', lastmod: ALTERNATIVES.flatMap((a) => a.facts.map((f) => f.checked)).sort().at(-1) },
		...ALTERNATIVES.map((a) => ({ path: `/alternatives/${a.slug}`, lastmod: [...a.facts, ...a.pickThem, ...a.pickUs].map((f) => f.checked).sort().at(-1) })),
	]
}

/** The docs site's pages, for /sitemap-docs.xml. No lastmod: the build doesn't know when a page changed. */
export function docPages(docsUrl: string, docs: DocSection[] = sections()): SitemapUrl[] {
	return [{ path: `${docsUrl}/` }, ...docs.flatMap((s) => s.pages.map((p) => ({ path: `${docsUrl}/${p.slug}` })))]
}

/** A sitemap. Google reads `loc` and `lastmod`, and ignores `priority` and `changefreq`, so they're left out. */
export function sitemap(origin: string, urls: SitemapUrl[]): string {
	const rows = urls.map((u) => `\t<url>\n\t\t<loc>${xml(/^https?:/.test(u.path) ? u.path : origin + u.path)}</loc>${u.lastmod ? `\n\t\t<lastmod>${xml(u.lastmod)}</lastmod>` : ''}\n\t</url>`)
	return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join('\n')}\n</urlset>\n`
}

/** RSS 2.0 with the full post in content:encoded, so a reader shows the whole text. */
export function rss(origin: string, posts: Entry[]): string {
	const items = posts.map((p) => {
		const url = origin + p.path
		return [
			'\t\t<item>',
			`\t\t\t<title>${xml(p.title)}</title>`,
			`\t\t\t<link>${xml(url)}</link>`,
			`\t\t\t<guid isPermaLink="true">${xml(url)}</guid>`,
			p.publishedAt ? `\t\t\t<pubDate>${new Date(p.publishedAt).toUTCString()}</pubDate>` : '',
			p.author ? `\t\t\t<dc:creator>${xml(p.author.name)}</dc:creator>` : '',
			...p.tags.map((t) => `\t\t\t<category>${xml(t)}</category>`),
			`\t\t\t<description>${xml(p.description)}</description>`,
			`\t\t\t<content:encoded><![CDATA[${p.html.replaceAll(']]>', ']]]]><![CDATA[>')}]]></content:encoded>`,
			'\t\t</item>',
		]
			.filter(Boolean)
			.join('\n')
	})
	const built = posts[0]?.updatedAt ? new Date(posts.reduce((m, p) => (p.updatedAt > m ? p.updatedAt : m), posts[0].updatedAt)).toUTCString() : new Date(0).toUTCString()
	return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
	<channel>
		<title>misomoon blog</title>
		<link>${xml(origin)}/blog</link>
		<atom:link href="${xml(origin)}/feed.xml" rel="self" type="application/rss+xml" />
		<description>Notes from the people building misomoon, cookieless web analytics on Cloudflare.</description>
		<language>en</language>
		<lastBuildDate>${built}</lastBuildDate>
${items.join('\n')}
	</channel>
</rss>
`
}

/**
 * Every crawler may read the site, AI crawlers included: an answer engine can only cite
 * a page it can read. Content-Signal (https://contentsignals.org) says so for search, AI
 * answers and AI training alike. The API stays out.
 */
export function robots(origin: string): string {
	return [
		'User-agent: *',
		'# Search, AI answers and AI training are all allowed (https://contentsignals.org).',
		'Content-Signal: search=yes, ai-input=yes, ai-train=yes',
		'Allow: /',
		'Disallow: /api/',
		'',
		'# docs.misomoon.com names its own sitemap, /sitemap-docs.xml, in its robots.txt.',
		`Sitemap: ${origin}/sitemap.xml`,
		'',
	].join('\n')
}

export interface LlmsPost {
	title: string
	path: string
	description: string
}

const SUMMARY =
	'Cookieless web analytics with revenue by source, click maps, form drop-off, JavaScript errors, Core Web Vitals, funnels, email reports and a built-in MCP server. misomoon Cloud has every feature on every plan and starts with a 7-day free trial, no card needed. The code is open source (MIT) and also runs in your own Cloudflare account.'

/**
 * A plain-Markdown map of misomoon.com and the docs for AI tools (https://llmstxt.org).
 * Docs pages link to their Markdown. Google Search doesn't read it.
 */
export function llms(origin: string, docsUrl: string | null, posts: LlmsPost[], docs: DocSection[] = sections()): string {
	const doc = (slug: string, file: string) => (docsUrl ? `${docsUrl}/${slug}.md` : docLink(null, file.replace(/\.md$/, '')))
	return [
		'# misomoon',
		'',
		`> ${SUMMARY}`,
		'',
		'misomoon sets no cookies and never stores IP addresses. It stores nothing on the visitor\u2019s device unless they opt out of being counted. It runs on Cloudflare Workers, D1 and Queues.',
		'',
		'## Product',
		'',
		`- [Features](${origin}/features): ${FEATURES.map((g) => g.name.toLowerCase()).join(', ')}`,
		...FEATURE_PAGES.map((p) => `- [${p.feature}](${origin}/features/${p.slug}): ${p.description.replace(/\.$/, '')}`),
		`- [Pricing](${origin}/pricing): ${priceSentence()} ${keepSentence()} Every plan has every feature and starts with ${TRIAL}.`,
		`- [Demo](${origin}/demo): the real dashboard, filled with a sample store\u2019s traffic`,
		`- [Docs](${docsUrl ?? docLink(null)}): install, tracking, the API, the MCP server and self-hosting`,
		...docs.flatMap((s) => ['', `## Docs: ${s.title}`, '', ...s.pages.map((p) => `- [${p.title}](${doc(p.slug, p.file)}): ${p.description}`)]),
		'',
		'## Comparisons',
		'',
		`- [All comparisons](${origin}/alternatives)`,
		...ALTERNATIVES.map((a) => `- [misomoon vs ${a.name}](${origin}/alternatives/${a.slug}): ${a.description}`),
		...(posts.length ? ['', '## Blog', '', ...posts.map((p) => `- [${p.title}](${origin}${p.path}): ${p.description}`)] : []),
		'',
		'## Optional',
		'',
		`- [Everything above in full](${origin}/llms-full.txt): every docs page, the legal pages and the blog posts as one Markdown file`,
		...LEGAL.map((slug) => `- [${legalPage(slug, docsUrl)?.title ?? slug}](${origin}/${slug})`),
		`- [Support](mailto:${SUPPORT})`,
		'',
	].join('\n')
}

/** /llms-full.txt: llms.txt, then the plans, the features, every docs page, the legal pages and every post in full. */
export function llmsFull(origin: string, docsUrl: string | null, posts: (LlmsPost & { body: string })[], docs: DocSection[] = sections()): string {
	// each page's Markdown already opens with its own # title
	const page = (url: string, md: string) => ['', '---', '', `Source: ${url}`, '', absolute(md, origin, docsUrl).trim()]
	return [
		llms(origin, docsUrl, posts, docs).trimEnd(),
		'',
		'---',
		'',
		'# misomoon Cloud plans',
		'',
		`Source: ${origin}/pricing`,
		'',
		`Every plan has every feature and starts with ${TRIAL}, with ${TRIAL_LIMITS.name}’s limits. ${DIFFER}`,
		'',
		EVENT,
		'',
		...PLANS.map((p) => `- **${p.name}**: $${p.price} a month. ${summary(p)}. ${p.who}`),
		'',
		'Every plan includes:',
		'',
		...EVERY_PLAN.map((f) => `- ${f}`),
		'',
		`For more than ${words(LARGEST)} events a month, email ${SUPPORT}. The open-source version is free: you pay Cloudflare for what it uses.`,
		'',
		'---',
		'',
		'# Features',
		'',
		`Source: ${origin}/features`,
		...FEATURES.flatMap((g) => ['', `## ${g.name}`, '', g.lede, '', ...g.items.map((f) => `- **${f.name}**: ${f.what}`)]),
		...FEATURE_PAGES.flatMap((p) => [
			'',
			`## ${p.title}`,
			'',
			`Source: ${origin}/features/${p.slug}`,
			'',
			p.answer,
			'',
			...p.shows.map((s) => `- **${s.name}**: ${s.what}`),
			'',
			...p.steps.map((s, i) => `${i + 1}. ${s}`),
			'',
			...p.notes.map((n) => `- ${n}`),
			...p.faq.flatMap(([q, a]) => ['', `**${q}**`, '', a]),
		]),
		...docs.flatMap((s) => s.pages.flatMap((p) => page(docsUrl ? `${docsUrl}/${p.slug}` : docLink(null, p.file.replace(/\.md$/, '')), p.md))),
		...LEGAL.flatMap((slug) => {
			const md = source(`${slug}.md`)
			return md ? page(`${origin}/${slug}`, md) : []
		}),
		...posts.flatMap((p) => ['', '---', '', `# ${p.title}`, '', `Source: ${origin}${p.path}`, '', p.description, '', absolute(p.body, origin, docsUrl).trim()]),
		'',
	].join('\n')
}
