import { describe, expect, it } from 'vite-plus/test'
import { PLANS as CLOUD_PLANS } from '@misomoon/core/plans'
import { PLANS, summary } from './pricing.ts'
import { breadcrumbs, jsonLd, minutes, posting, software, title } from './seo.ts'

const O = 'https://misomoon.com'

describe('seo', () => {
	it('adds the site name to a title once', () => {
		expect(title('Blog')).toBe('Blog · misomoon')
		expect(title('misomoon: cookieless analytics')).toBe('misomoon: cookieless analytics')
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
