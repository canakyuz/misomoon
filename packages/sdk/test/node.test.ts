import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { createMisomoon, visitorFromRequest, visitorHeaders, type Visitor } from '../src/node'
import { fakeFetch } from './helpers'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
const visitor: Visitor = { ip: '198.51.100.7', userAgent: UA }

beforeEach(() => void vi.spyOn(console, 'warn').mockImplementation(() => {}))
afterEach(() => vi.restoreAllMocks())

describe('visitorFromRequest', () => {
	it('reads a Fetch Request on Cloudflare', () => {
		const req = new Request('https://shop.com/api/signup', {
			headers: { 'cf-connecting-ip': '198.51.100.7', 'x-forwarded-for': '10.0.0.1', 'user-agent': UA, 'accept-language': 'de-DE,de;q=0.9', 'cf-ipcountry': 'de', 'cf-ipcity': 'Berlin' },
		})
		expect(visitorFromRequest(req)).toEqual({ ip: '198.51.100.7', userAgent: UA, language: 'de-DE,de;q=0.9', country: 'DE', region: undefined, city: 'Berlin', continent: undefined, timezone: undefined })
	})

	it("reads Node's IncomingMessage behind Vercel, decoding its geo headers", () => {
		const req = {
			headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.2', 'user-agent': UA, 'x-vercel-ip-country': 'BR', 'x-vercel-ip-city': 'S%C3%A3o%20Paulo', 'x-vercel-ip-timezone': 'America/Sao_Paulo' },
			socket: { remoteAddress: '10.0.0.2' },
		}
		expect(visitorFromRequest(req)).toMatchObject({ ip: '203.0.113.9', country: 'BR', city: 'São Paulo', timezone: 'America/Sao_Paulo' })
	})

	it('falls back to the socket address, and to the first value of a repeated header', () => {
		expect(visitorFromRequest({ headers: { 'user-agent': [UA, 'other'] }, socket: { remoteAddress: '::ffff:192.0.2.4' } })).toMatchObject({ ip: '::ffff:192.0.2.4', userAgent: UA })
	})

	it.each([
		['203.0.113.9:5678', '203.0.113.9'],
		['[2001:db8::1]:443', '2001:db8::1'],
		['[2001:db8::1]', '2001:db8::1'],
		['2001:db8::1', '2001:db8::1'],
	])('reads the address in X-Forwarded-For %s, not the load balancer', (xff, ip) => {
		expect(visitorFromRequest({ headers: { 'x-forwarded-for': `${xff}, 10.0.0.2`, 'user-agent': UA }, socket: { remoteAddress: '10.0.0.2' } })?.ip).toBe(ip)
	})

	it("ignores Cloudflare's unknown and Tor country markers", () => {
		for (const c of ['XX', 'T1']) expect(visitorFromRequest({ headers: { 'cf-connecting-ip': '192.0.2.1', 'user-agent': UA, 'cf-ipcountry': c } })?.country).toBeUndefined()
	})

	it('returns null without an address or a user agent', () => {
		expect(visitorFromRequest({ headers: { 'user-agent': UA } })).toBeNull()
		expect(visitorFromRequest({ headers: { 'x-real-ip': '192.0.2.1' } })).toBeNull()
		expect(visitorFromRequest({ headers: { 'x-real-ip': 'not an ip', 'user-agent': UA } })).toBeNull()
	})
})

describe('visitorHeaders', () => {
	it("sets the proxy headers misomoon trusts, encoding each geo value once", () => {
		expect(visitorHeaders({ ...visitor, country: 'BR', city: 'São Paulo' })).toEqual({
			'user-agent': UA,
			'x-misomoon-ip': '198.51.100.7',
			'x-misomoon-country': 'BR',
			'x-misomoon-city': 'S%C3%A3o%20Paulo',
		})
	})
})

describe('createMisomoon', () => {
	it('sends a server-side event as the visitor', async () => {
		const f = fakeFetch()
		const m = createMisomoon({ site: 'shop-com', host: 'https://analytics.test', fetch: f.fetch })
		const ok = await m.track('Purchase', {
			url: 'https://shop.com/checkout',
			visitor: { ...visitor, language: 'en-GB,en;q=0.8' },
			props: { plan: 'yearly' },
			revenue: { amount: 49.9, currency: 'eur' },
		})
		expect(ok).toBe(true)
		const [req] = f.sent
		expect(req.headers).toMatchObject({ 'user-agent': UA, 'x-misomoon-ip': '198.51.100.7' })
		expect(req.body).toMatchObject({ s: 'shop-com', n: 'Purchase', u: 'https://shop.com/checkout', l: 'en-GB', p: { plan: 'yearly' }, $: { a: 49.9, c: 'EUR' } })
	})

	it('adds the client-wide props to every event, under the event its own', async () => {
		const f = fakeFetch()
		const m = createMisomoon({ site: 'shop-com', host: 'https://analytics.test', fetch: f.fetch, props: { server: 'eu-1', plan: 'free' } })
		await m.track('Upgrade', { url: 'https://shop.com/billing', visitor, props: { plan: 'pro' } })
		expect(f.sent[0].body.p).toEqual({ server: 'eu-1', plan: 'pro' })
	})

	it('refuses an event without the visitor, which would count the server as the visitor', async () => {
		const f = fakeFetch()
		const m = createMisomoon({ site: 'shop-com', host: 'https://analytics.test', fetch: f.fetch })
		expect(await m.track('Signup', { url: 'https://shop.com/', visitor: { ip: '', userAgent: UA } })).toBe(false)
		expect(await m.pageview({ url: 'https://shop.com/', visitor: { ip: '198.51.100.7', userAgent: '' } })).toBe(false)
		expect(await m.track('Signup', { url: 'https://shop.com/' } as never)).toBe(false)
		expect(f.attempts).toHaveLength(0)
	})

	it('never throws on odd input', async () => {
		const f = fakeFetch()
		const m = createMisomoon({ site: 'shop-com', host: 'https://analytics.test', fetch: f.fetch })
		await expect(m.track('Signup', { url: 'https://shop.com/', visitor: { ...visitor, language: 5 as unknown as string } })).resolves.toBe(true)
		expect(f.sent[0].body.l).toBeUndefined()
		await expect(m.track('Signup', null as never)).resolves.toBe(false)
	})

	it('sends interactive: false only when asked', async () => {
		const f = fakeFetch()
		const m = createMisomoon({ site: 'shop-com', host: 'https://analytics.test', fetch: f.fetch })
		await m.track('Renewal', { url: 'https://shop.com/', visitor, interactive: false })
		await m.track('Signup', { url: 'https://shop.com/', visitor })
		expect(f.sent.map((s) => s.body.i)).toEqual([false, undefined])
	})
})

describe('ref', () => {
	it("hands out a ref and reports it from the visitor's address", async () => {
		const f = fakeFetch()
		const m = createMisomoon({ site: 'shop-com', host: 'https://analytics.test', fetch: f.fetch })
		const ref = m.ref({ url: 'https://shop.com/pricing', visitor })
		expect(ref).toMatch(/^mm_[0-9a-f]{24}$/)
		await m.flush()
		expect(f.sent[0].headers).toMatchObject({ 'user-agent': UA, 'x-misomoon-ip': '198.51.100.7' })
		expect(f.sent[0].body).toMatchObject({ s: 'shop-com', n: 'engagement', u: 'https://shop.com/pricing', e: 0, k: ref })
		expect(m.ref({ url: 'https://shop.com/pricing', visitor })).not.toBe(ref)
	})

	it('returns undefined and sends nothing without the visitor or an absolute url', async () => {
		const f = fakeFetch()
		const m = createMisomoon({ site: 'shop-com', host: 'https://analytics.test', fetch: f.fetch })
		expect(m.ref({ url: 'https://shop.com/', visitor: { ip: '', userAgent: UA } })).toBeUndefined()
		expect(m.ref({ url: '/pricing', visitor })).toBeUndefined()
		expect(m.ref(null as never)).toBeUndefined()
		await m.flush()
		expect(f.attempts).toHaveLength(0)
	})
})

describe('payment', () => {
	const order = { id: 'order_1042', amount: 49.9, currency: 'EUR', ref: 'mm_3f9c0a3f9c0a3f9c0a3f9c0a', customer: 'cus_77' }

	it('posts to the custom webhook, signed the way the server checks', async () => {
		const { verifyWebhook } = await import('@misomoon/core')
		const f = fakeFetch()
		const m = createMisomoon({ site: 'shop com', host: 'https://analytics.test/', secret: 'whsec_test', fetch: f.fetch })
		expect(await m.payment({ ...order, ts: new Date(Date.UTC(2026, 9, 24)) })).toBe(true)
		const [req] = f.sent
		expect(req.url).toBe('https://analytics.test/api/webhooks/custom/shop%20com')
		const raw = JSON.stringify(req.body)
		expect(await verifyWebhook('custom', 'whsec_test', new Headers(req.headers), raw)).toBe(true)
		expect(await verifyWebhook('custom', 'other', new Headers(req.headers), raw)).toBe(false)
		expect(req.body).toEqual({ ...order, ts: '2026-10-24T00:00:00.000Z' })
	})

	it('sends a refund with refund_of', async () => {
		const f = fakeFetch()
		const m = createMisomoon({ site: 'shop-com', host: 'https://analytics.test', secret: 's', fetch: f.fetch })
		await m.payment({ id: 'rf_1', type: 'refund', refundOf: 'order_1042', amount: 10, currency: 'EUR' })
		expect(f.sent[0].body).toEqual({ id: 'rf_1', type: 'refund', refund_of: 'order_1042', amount: 10, currency: 'EUR' })
	})

	it('retries a lost request and a 5xx, then stops', async () => {
		// setImmediate stays real: the signature comes from Web Crypto, outside the fake clock
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
		try {
			const f = fakeFetch(['network', 503])
			const m = createMisomoon({ site: 'shop-com', host: 'https://analytics.test', secret: 's', fetch: f.fetch })
			let result: boolean | undefined
			void m.payment(order).then((ok) => (result = ok))
			for (let i = 0; i < 50 && result === undefined; i++) {
				await new Promise((r) => setImmediate(r))
				await vi.advanceTimersByTimeAsync(1000)
			}
			expect(result).toBe(true)
			expect(f.attempts).toHaveLength(3)
		} finally {
			vi.useRealTimers()
		}
	})

	it("gives up on a refusal with the server's reason, and on a missing secret", async () => {
		const warn = vi.mocked(console.warn)
		const refuse = (async () => new Response('bad signature', { status: 401 })) as unknown as typeof fetch
		const m = createMisomoon({ site: 'shop-com', host: 'https://analytics.test', secret: 'wrong', fetch: refuse })
		expect(await m.payment(order)).toBe(false)
		expect(warn.mock.calls.at(-1)?.[0]).toMatch(/refused \(401\): bad signature/)
		const f = fakeFetch()
		expect(await createMisomoon({ site: 'shop-com', host: 'https://analytics.test', fetch: f.fetch }).payment(order)).toBe(false)
		expect(f.attempts).toHaveLength(0)
	})
})

describe('review fixes', () => {
	it('reads the webhook answer to the end', async () => {
		let answer: Response | undefined
		const fetchFn = (async () => (answer = new Response('{"ok":true,"counted":1}', { status: 200 }))) as unknown as typeof fetch
		const m = createMisomoon({ site: 'shop-com', host: 'https://analytics.test', secret: 's', fetch: fetchFn })
		expect(await m.payment({ id: 'o1', amount: 1, currency: 'EUR' })).toBe(true)
		expect(answer!.bodyUsed).toBe(true)
	})

	it.each([
		[{ id: '', amount: 1, currency: 'EUR' }, /id/],
		[{ id: 'o1', amount: -5, currency: 'EUR' }, /amount/],
		[{ id: 'o1', amount: Number.NaN, currency: 'EUR' }, /amount/],
		[{ id: 'o1', amount: 1, currency: 'euro' }, /currency/],
		[{ id: 'r1', type: 'refund' as const, amount: 1, currency: 'EUR' }, /refundOf/],
	])('refuses %j without a request, saying why', async (p, why) => {
		const f = fakeFetch()
		const m = createMisomoon({ site: 'shop-com', host: 'https://analytics.test', secret: 's', fetch: f.fetch })
		expect(await m.payment(p)).toBe(false)
		expect(f.attempts).toHaveLength(0)
		expect(vi.mocked(console.warn).mock.calls.at(-1)?.[0]).toMatch(why)
	})

	it('hands out no ref while disabled', () => {
		const m = createMisomoon({ site: 'shop-com', host: 'https://analytics.test', enabled: false })
		expect(m.ref({ url: 'https://shop.com/', visitor })).toBeUndefined()
	})
})
