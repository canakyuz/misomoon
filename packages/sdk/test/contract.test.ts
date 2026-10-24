// Every SDK's request, run through the server's own edgeFromRequest and buildEvent: the
// SDKs and the ingest code can't drift apart without this file failing.
import { assignSessions, buildEvent, edgeFromRequest, parsePayments, visitorId, type EdgeContext, type EventRow, type TrackerPayload } from '@misomoon/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { createMisomoon } from '../src/node'
import { createNativeClient, type Native } from '../src/react-native'
import * as rn from './fake-react-native'
import { fakeFetch, type Sent } from './helpers'

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
const NOW = Date.UTC(2026, 9, 24, 12)

/** What the Worker does with a request: the edge context from headers and request.cf, then the row. */
function ingest(req: Sent, connectingIp: string, cf: Record<string, string> = {}): { row: EventRow; edge: EdgeContext } {
	const headers = new Headers({ ...req.headers, 'cf-connecting-ip': connectingIp })
	const edge = edgeFromRequest(headers, cf)
	const row = buildEvent(JSON.parse(JSON.stringify(req.body)) as TrackerPayload, edge, NOW)
	if (typeof row === 'string') throw new Error(`the server would drop this event: ${row}`)
	return { row, edge }
}

beforeEach(() => {
	rn.native.reset()
	vi.useFakeTimers()
	vi.setSystemTime(NOW)
})
afterEach(() => vi.useRealTimers())

describe('React Native requests', () => {
	async function sendScreens(platform: object) {
		Object.assign(rn.Platform, platform)
		const f = fakeFetch()
		const c = createNativeClient({ site: 'recipes-app', host: 'https://a.test', domain: 'recipes.app', app: { name: 'Recipes', version: '2.3.0' }, fetch: f.fetch }, rn as unknown as Native)
		c.openedFrom('recipes://open?utm_source=newsletter&utm_medium=email')
		c.screen('/recipes/42')
		await vi.advanceTimersByTimeAsync(8000)
		c.track('Purchase', { revenue: { amount: 4.99, currency: 'usd' }, props: { tier: 'plus' } })
		c.screen('Home')
		await vi.runAllTimersAsync()
		return f.sent.map((s) => ingest(s, '203.0.113.50', { country: 'NL', city: 'Amsterdam' }).row)
	}

	it('come out as an iPhone app visit with its campaign, revenue and engaged time', async () => {
		const [view, purchase, engagement] = await sendScreens({ OS: 'ios', Version: '17.4' })
		expect(view).toMatchObject({
			site_id: 'recipes-app',
			name: 'pageview',
			hostname: 'recipes.app',
			pathname: '/recipes/42',
			title: '/recipes/42',
			browser: 'Recipes',
			browser_version: '2',
			os: 'iOS',
			os_version: '17.4',
			device: 'Mobile',
			screen: 'Mobile',
			utm_source: 'newsletter',
			channel: 'Email',
			country: 'NL',
			city: 'Amsterdam',
		})
		expect(purchase).toMatchObject({ name: 'Purchase', pathname: '/recipes/42', revenue: 4.99, currency: 'USD', props: '{"tier":"plus"}' })
		// the engagement adds to the screen view's row, which the view key names
		expect(engagement).toMatchObject({ name: 'engagement', pathname: '/recipes/42', engaged_ms: 8000, view: view.event_id })
	})

	it('come out as a macOS app visit on a desktop', async () => {
		const [view] = await sendScreens({ OS: 'macos', Version: '14.4' })
		expect(view).toMatchObject({ browser: 'Recipes', os: 'macOS', os_version: '14.4', device: 'Desktop' })
	})

	it('come out as an Android app visit, and the ids the SDK sent are kept', async () => {
		const rows = await sendScreens({ OS: 'android', Version: 34, constants: { Release: '14' } })
		expect(rows[0]).toMatchObject({ browser: 'Recipes', os: 'Android', os_version: '14', device: 'Mobile' })
		// a screen view is stored under its key, so a resent one is stored once; the rest keep the SDK's id
		const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
		expect(rows.map((r) => [r.name, new RegExp(`^${r.name === 'pageview' ? 'recipes-app:' : ''}${UUID}$`).test(r.event_id)])).toEqual([
			['pageview', true],
			['Purchase', true],
			['engagement', true],
			['pageview', true],
		])
		expect(new Set(rows.map((r) => r.event_id)).size).toBe(rows.length)
	})
})

describe('Node requests', () => {
	it("join the visitor's own visit: same address, user agent and therefore visitor id", async () => {
		const f = fakeFetch()
		const m = createMisomoon({ site: 'shop-com', host: 'https://a.test', fetch: f.fetch })
		await m.track('Purchase', {
			url: 'https://shop.com/checkout/done',
			visitor: { ip: '198.51.100.7', userAgent: CHROME, country: 'BR', city: 'São Paulo', language: 'pt-BR,pt;q=0.9' },
			revenue: { amount: 120, currency: 'BRL' },
		})
		// the app server connects from its own address; the visitor's arrives in headers
		const server = ingest(f.sent[0], '10.1.2.3', { country: 'US' })
		expect(server.row).toMatchObject({ name: 'Purchase', hostname: 'shop.com', pathname: '/checkout/done', browser: 'Chrome', os: 'Windows', country: 'BR', city: 'São Paulo', language: 'pt-BR', revenue: 120, currency: 'BRL' })

		const browser = ingest({ url: '', headers: { 'user-agent': CHROME }, body: { s: 'shop-com', n: 'pageview', u: 'https://shop.com/checkout' } }, '198.51.100.7', { country: 'BR' })
		const salt = 'today'
		expect(await visitorId(salt, 'shop-com', server.edge.ip, server.edge.ua)).toBe(await visitorId(salt, 'shop-com', browser.edge.ip, browser.edge.ua))
	})
})

describe('payment refs', () => {
	it('from the server: a ref-only beacon from the visitor, as m.js sends', async () => {
		const f = fakeFetch()
		const m = createMisomoon({ site: 'shop-com', host: 'https://a.test', fetch: f.fetch })
		const ref = m.ref({ url: 'https://shop.com/pricing', visitor: { ip: '198.51.100.7', userAgent: CHROME } })
		await m.flush()
		const { row } = ingest(f.sent[0], '10.1.2.3')
		expect(row).toMatchObject({ name: 'engagement', ref_only: true, refs: [ref], pathname: '/pricing', browser: 'Chrome' })
	})

	it('from an app: a ref-only beacon from the current screen', async () => {
		const f = fakeFetch()
		const c = createNativeClient({ site: 'recipes-app', host: 'https://a.test', domain: 'recipes.app', fetch: f.fetch }, rn as unknown as Native)
		c.screen('Paywall')
		const ref = c.ref()
		await vi.runAllTimersAsync()
		const { row } = ingest(f.sent.find((s) => s.body.k)!, '203.0.113.50')
		expect(row).toMatchObject({ ref_only: true, refs: [ref], pathname: '/Paywall' })
	})

	it("from payment(): a body the custom webhook reads, keyed to the buyer's ref", async () => {
		const f = fakeFetch()
		const m = createMisomoon({ site: 'shop-com', host: 'https://a.test', secret: 's', fetch: f.fetch })
		await m.payment({ id: 'order_1', amount: 49.9, currency: 'eur', ref: 'mm_3f9c0a3f9c0a3f9c0a3f9c0a', subscription: 'sub_9', billing: 'new' })
		await m.payment({ id: 'rf_1', type: 'refund', refundOf: 'order_1', amount: 10, currency: 'EUR' })
		const [pay, refund] = f.sent.map((s) => parsePayments('custom', s.body, NOW).payments[0])
		expect(pay).toMatchObject({ provider: 'custom', kind: 'payment', id: 'order_1', currency: 'EUR', billing: 'new' })
		expect(JSON.stringify(pay.keys)).toContain('mm_3f9c0a3f9c0a3f9c0a3f9c0a')
		expect(refund).toMatchObject({ kind: 'refund', id: 'rf_1' })
	})
})

describe('campaigns in apps', () => {
	it("give the visit the source of the link that opened the app, which the server keeps from the visit's first event", async () => {
		rn.native.initialURL = Promise.resolve('recipes://open?utm_source=newsletter&utm_medium=email')
		const f = fakeFetch()
		const c = createNativeClient({ site: 'recipes-app', host: 'https://a.test', domain: 'recipes.app', app: { name: 'Recipes' }, fetch: f.fetch }, rn as unknown as Native)
		c.screen('Home')
		await vi.advanceTimersByTimeAsync(5000)
		c.screen('Recipe')
		await vi.runAllTimersAsync()
		// ingest fills in the daily visitor id before it assigns visits; one device, one id
		const rows = f.sent.map((s) => ({ ...ingest(s, '203.0.113.50').row, visitor_id: 'v1' }))
		const { rows: stored } = assignSessions(rows, [])
		expect(stored.filter((r) => r.name === 'pageview').map((r) => [r.pathname, r.utm_source, r.channel])).toEqual([
			['/Home', 'newsletter', 'Email'],
			['/Recipe', 'newsletter', 'Email'],
		])
	})
})
