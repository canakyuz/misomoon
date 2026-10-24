import { describe, expect, it } from 'vite-plus/test'
import { codePages, docPages, llms, llmsFull, robots, rss, sitemap } from './feeds.ts'
import type { Entry } from './content.ts'

const O = 'https://misomoon.com'

describe('sitemap', () => {
	it('prints loc and lastmod only, escaped', () => {
		const xml = sitemap(O, [{ path: '/a?b=1&c=2', lastmod: '2026-10-01T00:00:00.000Z' }, { path: '/' }])
		expect(xml).toContain('<loc>https://misomoon.com/a?b=1&amp;c=2</loc>\n\t\t<lastmod>2026-10-01T00:00:00.000Z</lastmod>')
		expect(xml).toContain('<loc>https://misomoon.com/</loc>\n\t</url>')
		expect(xml).not.toMatch(/priority|changefreq/)
	})

	it('prints a docs page at its own host', () => {
		const xml = sitemap(O, docPages('https://docs.misomoon.com', [{ title: 'Get started', pages: [{ file: 'PROXY.md', slug: 'proxy', title: 'Proxy', description: 'd', md: '' }] }]))
		expect(xml).toContain('<loc>https://docs.misomoon.com/</loc>')
		expect(xml).toContain('<loc>https://docs.misomoon.com/proxy</loc>')
		expect(xml).not.toContain('https://misomoon.comhttps')
	})

	it('lists every comparison page with the day its facts were checked', () => {
		const pages = codePages()
		expect(pages.slice(0, 4).map((p) => p.path)).toEqual(['/', '/features', '/pricing', '/demo'])
		const alts = pages.filter((p) => p.path.startsWith('/alternatives/'))
		expect(alts.length).toBeGreaterThan(5)
		for (const p of alts) expect(p.lastmod).toMatch(/^\d{4}-\d{2}-\d{2}$/)
	})

	it('lists the feature pages right after the demo, with no lastmod', () => {
		expect(codePages().slice(4, 6)).toStrictEqual([{ path: '/features/heatmaps' }, { path: '/features/scroll-maps' }])
	})
})

describe('rss', () => {
	const post = {
		path: '/blog/x',
		title: 'Ben & Jerry <3',
		description: 'D',
		html: '<p>a ]]> b</p>',
		tags: ['privacy'],
		author: { id: 'j', name: 'Jane', bio: '', avatar: null, sameAs: [], updatedAt: '' },
		publishedAt: '2026-10-01T09:00:00.000Z',
		updatedAt: '2026-10-02T09:00:00.000Z',
	} as unknown as Entry

	it('escapes titles, keeps the full HTML in CDATA, and dates the channel by its newest change', () => {
		const xml = rss(O, [post])
		expect(xml).toContain('<title>Ben &amp; Jerry &lt;3</title>')
		expect(xml).toContain('<content:encoded><![CDATA[<p>a ]]]]><![CDATA[> b</p>]]></content:encoded>')
		expect(xml).toContain('<pubDate>Thu, 01 Oct 2026 09:00:00 GMT</pubDate>')
		expect(xml).toContain('<lastBuildDate>Fri, 02 Oct 2026 09:00:00 GMT</lastBuildDate>')
		expect(xml).toContain('<atom:link href="https://misomoon.com/feed.xml" rel="self"')
	})
})

describe('robots.txt and llms.txt', () => {
	it('lets every crawler in for search, AI answers and training, keeps /api/ out, and points at the sitemap', () => {
		expect(robots(O)).toBe(
			'User-agent: *\n# Search, AI answers and AI training are all allowed (https://contentsignals.org).\nContent-Signal: search=yes, ai-input=yes, ai-train=yes\nAllow: /\nDisallow: /api/\n\n# docs.misomoon.com names its own sitemap, /sitemap-docs.xml, in its robots.txt.\nSitemap: https://misomoon.com/sitemap.xml\n',
		)
	})

	const docs = [{ title: 'Get started', pages: [{ file: 'tracking.md', slug: 'tracking', title: 'Track your site', description: 'the script tag', md: '# Track your site\n\nSee [the API](api.md#filters) and [the DPA](dpa.md#9-breaches).\n' }] }]
	const post = { title: 'Hello', path: '/blog/hello', description: 'First post' }

	it('maps the product, every docs page as Markdown, the comparisons, the posts, and the legal pages as optional', () => {
		const txt = llms(O, 'https://docs.misomoon.com', [post], docs)
		expect(txt.startsWith('# misomoon\n\n> ')).toBe(true)
		expect(txt).toContain('- [Features](https://misomoon.com/features): ')
		expect(txt).toContain('Starter is $')
		expect(txt).toContain('## Docs: Get started\n\n- [Track your site](https://docs.misomoon.com/tracking.md): the script tag')
		expect(txt).toContain('## Comparisons')
		expect(txt).toContain('- [Hello](https://misomoon.com/blog/hello): First post')
		expect(txt).toContain('## Optional\n\n- [Everything above in full](https://misomoon.com/llms-full.txt)')
		expect(txt).toContain('- [Data processing agreement](https://misomoon.com/dpa)')
		expect(txt).not.toMatch(/free up to|Free plan/i)
	})

	it('lists each feature page under Product, with its description and no final period', () => {
		expect(llms(O, 'https://docs.misomoon.com', [post], docs)).toContain(
			'- [Heatmaps](https://misomoon.com/features/heatmaps): See what people click on each page, with rage and dead clicks marked, drawn over your own site. No cookies and no session recording, on every plan\n',
		)
	})

	it('links docs to GitHub when there is no docs site', () => {
		expect(llms(O, null, [], [{ title: 'Run', pages: [{ file: 'PROXY.md', slug: 'proxy', title: 'Proxy', description: 'd', md: '' }] }])).toContain(
			'- [Proxy](https://github.com/jackzard/misomoon/blob/main/docs/PROXY.md): d',
		)
	})

	it('prints every docs page, the legal pages and the posts in full, with absolute links', () => {
		const txt = llmsFull(O, 'https://docs.misomoon.com', [{ ...post, body: 'Read [the API](api.md).' }], docs)
		expect(txt.startsWith(llms(O, 'https://docs.misomoon.com', [post], docs).trimEnd())).toBe(true)
		expect(txt).toContain('Source: https://docs.misomoon.com/tracking\n\n# Track your site\n\nSee [the API](https://docs.misomoon.com/api#filters) and [the DPA](https://misomoon.com/dpa#9-breaches).')
		expect(txt).toContain('Source: https://misomoon.com/dpa\n\n# Data processing agreement')
		expect(txt).toContain('# Hello\n\nSource: https://misomoon.com/blog/hello\n\nFirst post\n\nRead [the API](https://docs.misomoon.com/api).')
		expect(txt).not.toMatch(/\]\((?!https?:|mailto:|#)/)
	})

	it('prints each feature page in full after the features, with its answer', () => {
		const txt = llmsFull(O, 'https://docs.misomoon.com', [{ ...post, body: 'Read [the API](api.md).' }], docs)
		expect(txt).toContain(
			'Source: https://misomoon.com/features/scroll-maps\n\nmisomoon’s scroll map shows the share of visits that scrolled past each tenth of a page, and draws those bands over the page itself. It is always on, sets no cookies, and records no sessions. The map keeps only the deepest point each visit reached, so you see which part of the page most visits never get to.',
		)
	})
})
