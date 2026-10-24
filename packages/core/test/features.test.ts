import { describe, expect, it } from 'vite-plus/test'
import { browserParts, checkoutKeys, DEFAULT_FEATURES, FEATURES, LIGHT_FEATURES, pathCounted, pathRules, searchParams, searchTermFromUrl, siteFeatures, storeFeatures, storePathRules, storeSearchParams } from '../src'

describe('site features', () => {
	it('reads the stored list, with the defaults for a site that never chose', () => {
		expect(siteFeatures(null)).toEqual(DEFAULT_FEATURES)
		expect(DEFAULT_FEATURES).toEqual([...FEATURES])
		expect(siteFeatures('')).toEqual([])
		expect(siteFeatures('media,clicks,bogus')).toEqual(['clicks', 'media'])
	})

	it('stores a list from the API in a fixed order, and refuses unknown names', () => {
		expect(storeFeatures(['search', 'clicks', 'outbound', 'clicks'])).toBe('outbound,clicks,search')
		expect(storeFeatures([])).toBe('')
		expect(storeFeatures(['heatmaps'])).toEqual({ error: 'unknown feature: heatmaps; use outbound, downloads, forms, events, payments, vitals, clicks, errors, fields, media, content, search' })
		expect(storeFeatures('clicks')).toEqual({ error: 'features must be a list of names' })
	})

	it('sends only the tracker parts the site uses, with shared state when a part needs it', () => {
		expect(browserParts(['search'])).toEqual([])
		expect(browserParts(['vitals', 'clicks'])).toEqual(['vitals', 'clicks'])
		expect(browserParts(['content', 'errors'])).toEqual(['errors', 'items', 'content'])
		// a tagged click goes first, then a download, so neither is also an outbound link
		expect(browserParts(['outbound', 'payments', 'downloads', 'events'])).toEqual(['events', 'downloads', 'outbound', 'payments'])
		expect(browserParts(DEFAULT_FEATURES)).toEqual(['vitals', 'clicks', 'errors', 'items', 'fields', 'media', 'content', 'events', 'downloads', 'outbound', 'forms', 'payments'])
		expect(browserParts(LIGHT_FEATURES)).toEqual(['events', 'downloads', 'outbound', 'forms'])
	})
})

describe('site search', () => {
	it('reads the term from the first parameter that has one', () => {
		expect(searchTermFromUrl('https://shop.com/search?q=+Red+shoes+', searchParams(null))).toBe('Red shoes')
		expect(searchTermFromUrl('https://shop.com/find?page=2&term=boots', searchParams('term'))).toBe('boots')
		expect(searchTermFromUrl('https://shop.com/find?q=', searchParams(null))).toBeUndefined()
		expect(searchTermFromUrl('not a url', searchParams(null))).toBeUndefined()
	})

	it('stores up to 10 plain parameter names', () => {
		expect(storeSearchParams([' term ', 'k', 'term'])).toBe('term,k')
		expect(storeSearchParams([])).toBeNull()
		expect(storeSearchParams(['a b'])).toEqual({ error: 'search_params takes up to 10 URL parameter names' })
	})
})

describe('path rules', () => {
	it('counts a page that matches an include glob, when there are any, and no exclude glob', () => {
		const include = pathRules('/blog/**,/docs/*')
		const exclude = pathRules('/blog/drafts/*')
		expect(['/blog/a/b', '/blog/', '/docs/x', '/docs/x/y', '/blog/drafts/1', '/pricing'].map((p) => pathCounted(p, include, exclude))).toEqual([true, true, true, false, false, false])
		expect(pathCounted('/anything', [], [])).toBe(true)
		expect(pathCounted('/#/admin', [], pathRules('/#/admin'))).toBe(false)
		// glob characters only: a dot is a dot
		expect(pathCounted('/aXb', pathRules('/a.b'), [])).toBe(false)
	})

	it('stores up to 20 globs that start with /', () => {
		expect(storePathRules([' /a ', '/b/**', '/a'], 'include_paths')).toBe('/a,/b/**')
		expect(storePathRules([], 'include_paths')).toBeNull()
		expect(storePathRules(['admin'], 'exclude_paths')).toEqual({ error: 'exclude_paths takes up to 20 paths that start with /' })
		expect(storePathRules('/a', 'exclude_paths')).toEqual({ error: 'exclude_paths must be a list of paths' })
	})
})

describe('checkout ids', () => {
	it("reads the id a payment provider put on a success page's URL", () => {
		expect(checkoutKeys('https://shop.com/thanks?session_id=cs_live_a1b2c3')).toEqual(['cs_live_a1b2c3'])
		expect(checkoutKeys('https://shop.com/thanks?checkout_id=6c1f-4e2a-9b')).toEqual(['6c1f-4e2a-9b'])
		expect(checkoutKeys('https://shop.com/thanks?payment_id=pay_123456&status=succeeded')).toEqual(['pay_123456'])
		// a session_id that is not a Stripe Checkout id is someone else's parameter
		expect(checkoutKeys('https://shop.com/?session_id=abcdef123')).toEqual([])
		expect(checkoutKeys('not a url')).toEqual([])
	})
})
