import { describe, expect, it } from 'vite-plus/test'
import { checkUrl, tagStatus, trackerSites } from '../src'

describe('trackerSites', () => {
	it('reads the site id of each tag form the dashboard and the plugins hand out', () => {
		const html = `<head>
			<script defer src="https://app.misomoon.com/m.js?s=shop-com"></script>
			<script defer src="https://stats.shop.com/m.js?s=shop-com"></script>
			<script defer src="/relay/m.js?s=blog-shop-com" data-api="/relay/api/event"></script>
			<script defer src='https://shop.com/wp-json/mm-relay/v1/m.js?v=2&amp;s=wp-shop'></script>
			<script src=https://app.misomoon.com/m.js?s=bare></script>
		</head>`
		expect(trackerSites(html)).toEqual(['shop-com', 'blog-shop-com', 'wp-shop', 'bare'])
	})

	it('ignores other scripts, tags without a site id, and tags inside comments', () => {
		const html = `<script src="/app.js?s=shop-com"></script>
			<script src="https://cdn.test/xm.js?s=nope"></script>
			<script defer src="https://app.misomoon.com/m.js"></script>
			<!-- <script defer src="https://app.misomoon.com/m.js?s=commented"></script> -->
			<script>const src = "/m.js?s=inline"</script>
			<link rel="preload" href="https://app.misomoon.com/m.js?s=link">`
		expect(trackerSites(html)).toEqual([])
	})
})

describe('tagStatus', () => {
	const tag = (s: string) => `<script defer src="https://app.misomoon.com/m.js?s=${s}"></script>`

	it('finds the site when its tag is there, also next to other sites', () => {
		expect(tagStatus(`${tag('old-site')}${tag('shop-com')}`, 'shop-com')).toEqual({ status: 'found', sites: ['old-site', 'shop-com'] })
	})

	it('names the other sites when only their tags are there', () => {
		expect(tagStatus(tag('shop-example'), 'shop-com')).toEqual({ status: 'other_site', sites: ['shop-example'] })
	})

	it('reports a page without any tag as missing', () => {
		expect(tagStatus('<html><head><title>Shop</title></head></html>', 'shop-com')).toEqual({ status: 'missing', sites: [] })
		expect(tagStatus('', 'shop-com')).toEqual({ status: 'missing', sites: [] })
	})
})

describe('checkUrl', () => {
	it('opens the home page of a public domain over HTTPS', () => {
		expect(checkUrl('shop.com')).toBe('https://shop.com/')
		expect(checkUrl(' Blog.Shop.co.uk ')).toBe('https://blog.shop.co.uk/')
	})

	it.each([['localhost'], ['localhost:5173'], ['shop.com:8080'], ['127.0.0.1'], ['10.0.0.8'], ['intranet'], ['printer.local'], ['db.internal'], ['app.localhost'], ['nas.home.arpa'], [''], ['shop..com']])(
		'refuses %s, which is not a public host',
		(domain) => expect(checkUrl(domain)).toBeNull(),
	)
})
