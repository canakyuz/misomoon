// @misomoon/sdk against this Worker: events go through the real route, ingest and
// session code into the fake shards, so a change on either side that breaks the SDKs
// fails here.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { createClient } from '../../../packages/sdk/src/client.js'
import { createMisomoon } from '../../../packages/sdk/src/node.js'
import { invalidate } from '../src/control'
import { fakeCtx, fakeEnv, OWNER, type FakeEnv } from './fake'

vi.mock('@misomoon/tracker/m.min.js', () => ({ default: '/* m.js */' }))
const { default: worker } = await import('../src/index')

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
const APP = 'MisomoonApp/0.1.0 (Linux; Android 14; Mobile) Recipes/2.3.0'

/** A fetch that hands each request to the Worker, as if it came from `connectingIp`. */
function workerFetch(env: FakeEnv, connectingIp: string) {
	const ctxs: ReturnType<typeof fakeCtx>[] = []
	const fn = async (url: string | URL | Request, init?: RequestInit) => {
		const ctx = fakeCtx()
		ctxs.push(ctx)
		const req = new Request(url, init)
		req.headers.set('cf-connecting-ip', connectingIp)
		return worker.fetch(req, env as unknown as Env, ctx as unknown as ExecutionContext)
	}
	return { fetch: fn as unknown as typeof fetch, settle: () => Promise.all(ctxs.map((c) => c.settle())) }
}

async function setup() {
	const env = fakeEnv()
	const ctx = fakeCtx()
	const req = new Request('https://app.test/api/v1/sites', { method: 'POST', headers: { 'content-type': 'application/json', ...OWNER }, body: JSON.stringify({ domain: 'shop.com' }) })
	await worker.fetch(req, env as unknown as Env, ctx as unknown as ExecutionContext)
	return env
}

const rows = (env: FakeEnv, sql: string) => [...env.SHARD_0.rows(sql), ...env.SHARD_1.rows(sql)]

beforeEach(() => {
	invalidate('')
	vi.useFakeTimers({ toFake: ['Date'] })
	vi.setSystemTime(Date.UTC(2026, 9, 24, 12))
})
afterEach(() => vi.useRealTimers())

describe('@misomoon/sdk/node through the Worker', () => {
	it("puts a server-side purchase in the visitor's browser visit", async () => {
		const env = await setup()
		const browser = workerFetch(env, '198.51.100.7')
		await browser.fetch('https://app.test/api/event', { method: 'POST', headers: { 'user-agent': CHROME }, body: JSON.stringify({ s: 'shop-com', n: 'pageview', u: 'https://shop.com/pricing?utm_source=newsletter' }) })
		await browser.settle()

		const server = workerFetch(env, '10.1.2.3')
		const m = createMisomoon({ site: 'shop-com', host: 'https://app.test', fetch: server.fetch })
		vi.setSystemTime(Date.UTC(2026, 9, 24, 12, 3))
		const ok = await m.track('Purchase', { url: 'https://shop.com/checkout', visitor: { ip: '198.51.100.7', userAgent: CHROME, country: 'BR' }, revenue: { amount: 49, currency: 'USD' } })
		await server.settle()

		expect(ok).toBe(true)
		const events = rows(env, 'SELECT name, session_id, visitor_id, utm_source, revenue FROM events ORDER BY ts')
		expect(events.map((e) => e.name)).toEqual(['pageview', 'Purchase'])
		expect(new Set(events.map((e) => e.session_id)).size).toBe(1)
		expect(new Set(events.map((e) => e.visitor_id)).size).toBe(1)
		// the purchase takes the visit's campaign, so revenue is credited to the newsletter
		expect(events[1]).toMatchObject({ utm_source: 'newsletter', revenue: 49 })
		expect(rows(env, 'SELECT pageviews, events FROM sessions')).toEqual([{ pageviews: 1, events: 1 }])
	})

	it('stores an event once when the SDK resends it after a lost response', async () => {
		// the retry waits about a second of real time; a frozen Date would never reach it
		vi.useRealTimers()
		const env = await setup()
		const w = workerFetch(env, '203.0.113.5')
		let first = true
		// the Worker stores the event, then the response is lost on the way back
		const lossy = (async (url: string, init?: RequestInit) => {
			const res = await w.fetch(url, init)
			if (first) {
				first = false
				throw new TypeError('Network request failed')
			}
			return res
		}) as unknown as typeof fetch
		const c = createClient({ site: 'shop-com', host: 'https://app.test', fetch: lossy, headers: { 'user-agent': CHROME } })
		const done = c.send({ s: 'shop-com', n: 'pageview', u: 'https://shop.com/' })
		// one flush keeps retrying until the event is in
		await c.flush()
		await w.settle()
		expect(await done).toBe(true)
		expect(rows(env, 'SELECT COUNT(*) AS n FROM events').reduce((a, r) => a + (r.n as number), 0)).toBe(1)
		expect(rows(env, 'SELECT pageviews FROM sessions')).toEqual([{ pageviews: 1 }])
	})
})

describe('the React Native user agent through the Worker', () => {
	it('is kept, not dropped as a bot, and reported as the app', async () => {
		const env = await setup()
		const w = workerFetch(env, '203.0.113.50')
		const c = createClient({ site: 'shop-com', host: 'https://app.test', fetch: w.fetch, headers: { 'user-agent': APP } })
		await c.send({ s: 'shop-com', n: 'pageview', u: 'https://shop.com/Home', w: 393 })
		await w.settle()
		expect(rows(env, 'SELECT browser, os, os_version, device, screen, pathname FROM events')).toEqual([
			{ browser: 'Recipes', os: 'Android', os_version: '14', device: 'Mobile', screen: 'Mobile', pathname: '/Home' },
		])
	})
})
