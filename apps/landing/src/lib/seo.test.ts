import { describe, expect, it } from 'vite-plus/test'
import { PLANS as CLOUD_PLANS } from '@misomoon/core/plans'
import { PLANS, summary } from './pricing.ts'
import { authorDescription, breadcrumbs, jsonLd, listTitle, minutes, posting, software, title } from './seo.ts'

const O = 'https://misomoon.com'

describe('seo', () => {
	it('adds the site name to a title once', () => {
		expect(title('Blog')).toBe('Blog · misomoon')
		expect(title('misomoon: cookieless analytics')).toBe('misomoon: cookieless analytics')
	})

	it('gives each older page of a list a title of its own, from its newest post', () => {
		const posts = [{ publishedAt: '2026-03-04T09:00:00Z' }, { publishedAt: '2026-02-01T09:00:00Z' }]
		expect(listTitle('Blog: notes on privacy-first analytics', 'Blog', null, posts)).toBe('Blog: notes on privacy-first analytics')
		expect(listTitle('Blog: notes on privacy-first analytics', 'Blog', 'abc', posts)).toBe('Blog: posts from 4 March 2026 and before')
		expect(listTitle('Blog', 'Blog', 'abc', [])).toBe('Blog')
	})

	it('keeps an author description between 70 and 160 characters', () => {
		const short = authorDescription('Jane Doe', '')
		expect(short).toBe('Posts by Jane Doe on the misomoon blog, about cookieless analytics, privacy and Cloudflare.')
		expect(authorDescription('Jane Doe', 'Builds misomoon.')).toBe('Jane Doe: Builds misomoon. Posts on the misomoon blog about cookieless analytics, privacy and Cloudflare.')
		const long = authorDescription('Jane Doe', 'word '.repeat(100).trim())
		expect(long.length).toBeLessThanOrEqual(160)
		expect(long).toMatch(/^Jane Doe: word .* word…$/)
		for (const d of [short, long]) expect(d.length).toBeGreaterThanOrEqual(70)
	})

	it('escapes "<" so a title can’t close the JSON-LD script', () => {
		const out = jsonLd([{ name: '</script><script>alert(1)</script>' }])
		expect(out).not.toContain('</script>')
		expect(JSON.parse(out)['@graph'][0].name).toBe('</script><script>alert(1)</script>')
	})

	it('numbers breadcrumbs from the home page', () => {
		expect(breadcrumbs(O, [['Blog', '/blog']])).toEqual({
			'@type': 'BreadcrumbList',
			itemListElement: [
				{ '@type': 'ListItem', position: 1, name: 'Home', item: 'https://misomoon.com/' },
				{ '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://misomoon.com/blog' },
			],
		})
	})

	it('describes a post with both dates, an author URL, and the default image when it has none', () => {
		const p = posting(O, {
			path: '/blog/x',
			title: 'X',
			description: 'D',
			image: null,
			tags: ['a', 'b'],
			words: 900,
			publishedAt: '2026-10-01T00:00:00.000Z',
			updatedAt: '2026-10-02T00:00:00.000Z',
			author: { id: 'jane', name: 'Jane' },
		})
		expect(p).toMatchObject({
			'@type': 'BlogPosting',
			headline: 'X',
			datePublished: '2026-10-01T00:00:00.000Z',
			dateModified: '2026-10-02T00:00:00.000Z',
			image: ['https://misomoon.com/og.png'],
			author: [{ '@type': 'Person', name: 'Jane', url: 'https://misomoon.com/authors/jane' }],
			keywords: 'a, b',
		})
	})

	it('offers each Cloud plan at its monthly price, with its limits', () => {
		const offers = software(O).offers as Record<string, unknown>[]
		expect(offers.map((o) => [o.name, o.price])).toEqual(CLOUD_PLANS.map((p) => [`misomoon Cloud ${p.name}`, String(p.price)]))
		expect(offers.map((o) => o.description)).toEqual(PLANS.map(summary))
		expect(offers.every((o) => (o.priceSpecification as Record<string, unknown>).billingDuration === 'P1M')).toBe(true)
	})

	it('reads at 230 words a minute, at least one', () => {
		expect(minutes(0)).toBe(1)
		expect(minutes(1150)).toBe(5)
	})
})
