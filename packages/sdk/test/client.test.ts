import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { createClient, endpointFor, problem, uuid, type Payload } from '../src/client'
import { fakeFetch } from './helpers'

const page = (extra: Partial<Payload> = {}): Payload => ({ s: 'shop-com', n: 'pageview', u: 'https://shop.com/', ...extra })

beforeEach(() => {
	vi.useFakeTimers()
	vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
	vi.useRealTimers()
	vi.restoreAllMocks()
})

describe('endpointFor', () => {
	it('puts api/event next to the host, keeping a proxy prefix', () => {
		expect(endpointFor('https://analytics.example.com')).toBe('https://analytics.example.com/api/event')
		expect(endpointFor('https://example.com/relay')).toBe('https://example.com/relay/api/event')
		expect(endpointFor('https://example.com/relay/')).toBe('https://example.com/relay/api/event')
	})
})

describe('uuid', () => {
	const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

	it('gives v4 ids, also without crypto.randomUUID or crypto at all', () => {
		expect(uuid()).toMatch(V4)
		vi.stubGlobal('crypto', { getRandomValues: (b: Uint8Array) => b.fill(255) })
		expect(uuid()).toMatch(V4)
		vi.stubGlobal('crypto', undefined)
		const ids = new Set(Array.from({ length: 200 }, uuid))
		expect([...ids].every((id) => V4.test(id)) && ids.size).toBe(200)
		vi.unstubAllGlobals()
	})
})

describe('problem', () => {
	const check = (p: Payload) => {
		const warnings: string[] = []
		return { why: problem(p, (m) => warnings.push(m)), p, warnings }
	}

	it('accepts what the server accepts', () => {
		expect(check(page({ n: '  Signup: step 2/3 ' })).why).toBeNull()
	})

	it.each([
		[{ n: '' }, /event name/],
		[{ n: 'Plan; Pro' }, /event name/],
		[{ n: 'x'.repeat(121) }, /event name/],
		[{ u: '/pricing' }, /not absolute/],
		[{ u: 'app://home' }, /not http/],
		[{ $: { a: Number.NaN } }, /revenue amount/],
		[{ $: { a: -1 } }, /revenue amount/],
		[{ $: { a: 19, c: 'dollars' } }, /ISO 4217/],
		[{ s: '' }, /site id/],
	])('drops %j', (extra, why) => {
		expect(check(page(extra as Partial<Payload>)).why).toMatch(why)
	})

	it('trims the name and upper-cases the currency', () => {
		const { p } = check(page({ n: ' Purchase ', $: { a: 19, c: 'eur' } }))
		expect([p.n, p.$]).toEqual(['Purchase', { a: 19, c: 'EUR' }])
	})

	it('cuts string props to the 300 characters the server keeps', () => {
		const { p } = check(page({ p: { note: 'x'.repeat(500) } }))
		expect((p.p!.note as string).length).toBe(300)
	})

	it('drops an event over the 16 KB the server accepts', () => {
		expect(check(page({ u: 'https://shop.com/?q=' + 'é'.repeat(9000) })).why).toMatch(/16 KB/)
		expect(check(page({ u: 'https://shop.com/?q=' + 'e'.repeat(15000) })).why).toBeNull()
	})

	it('removes props the server would drop, and keeps at most 30', () => {
		const props: Record<string, unknown> = { 'bad key': 1, nested: { a: 1 }, ok: 'yes' }
		for (let i = 0; i < 35; i++) props[`k${i}`] = i
		const { p, warnings } = check(page({ p: props as Payload['p'] }))
		expect(Object.keys(p.p!)).toHaveLength(30)
		expect(p.p!.ok).toBe('yes')
		expect(warnings.filter((w) => /bad key|nested/.test(w))).toHaveLength(2)
		expect(warnings.filter((w) => /at most 30/.test(w))).toHaveLength(6)
	})
})

describe('createClient', () => {
	it('posts text/plain JSON with a client id and a timestamp', async () => {
		vi.setSystemTime(Date.UTC(2026, 9, 24, 12))
		const f = fakeFetch()
		const c = createClient({ site: 'shop-com', host: 'https://a.test/relay', fetch: f.fetch, headers: { 'x-extra': '1' } })
		expect(await c.send(page())).toBe(true)
		const [req] = f.sent
		expect(req.url).toBe('https://a.test/relay/api/event')
		expect(req.headers).toEqual({ 'content-type': 'text/plain', 'x-extra': '1' })
		expect(req.body).toMatchObject({ s: 'shop-com', n: 'pageview', ts: Date.UTC(2026, 9, 24, 12) })
		expect(req.body.id).toMatch(/^[0-9a-f-]{36}$/)
	})

	it('resends a failed event with the same id, so the server stores it once', async () => {
		const f = fakeFetch([503, 'network', 429])
		const c = createClient({ site: 'shop-com', host: 'https://a.test', fetch: f.fetch })
		const done = c.send(page())
		await vi.runAllTimersAsync()
		expect(await done).toBe(true)
		expect(f.attempts).toHaveLength(4)
		expect(new Set(f.attempts.map((a) => a.body.id)).size).toBe(1)
	})

	it('backs off exponentially, up to 30 s', async () => {
		vi.spyOn(Math, 'random').mockReturnValue(1)
		const f = fakeFetch(['network', 'network', 'network', 'network', 'network', 'network'])
		const c = createClient({ site: 'shop-com', host: 'https://a.test', fetch: f.fetch, maxAge: 10 * 60_000 })
		void c.send(page())
		const at: number[] = []
		const start = Date.now()
		for (let i = 0; i < 7; i++) {
			await vi.advanceTimersToNextTimerAsync()
			at.push(Date.now() - start)
		}
		expect(at).toEqual([1000, 3000, 7000, 15000, 31000, 61000, 61000])
		expect(f.attempts).toHaveLength(7)
	})

	it('drops an event the server refuses (4xx other than 429) without retrying', async () => {
		const f = fakeFetch([400])
		const c = createClient({ site: 'shop-com', host: 'https://a.test', fetch: f.fetch })
		const done = c.send(page())
		await vi.runAllTimersAsync()
		expect([await done, f.attempts.length, c.pending]).toEqual([false, 1, 0])
	})

	it('abandons a request that hangs past the timeout, then retries it', async () => {
		const f = fakeFetch(['hang'])
		const c = createClient({ site: 'shop-com', host: 'https://a.test', fetch: f.fetch, timeout: 2000 })
		const done = c.send(page())
		await vi.advanceTimersByTimeAsync(1999)
		expect(f.attempts).toHaveLength(1)
		await vi.runAllTimersAsync()
		expect([await done, f.attempts.length]).toEqual([true, 2])
	})

	it('keeps events in order through an outage', async () => {
		const f = fakeFetch(['network', 'network'])
		const c = createClient({ site: 'shop-com', host: 'https://a.test', fetch: f.fetch })
		for (const n of ['pageview', 'Signup', 'Purchase']) void c.send(page({ n }))
		await vi.runAllTimersAsync()
		expect(f.sent.map((s) => s.body.n)).toEqual(['pageview', 'Signup', 'Purchase'])
	})

	it('drops the oldest events when the queue is full', async () => {
		const f = fakeFetch(['hang'])
		const c = createClient({ site: 'shop-com', host: 'https://a.test', fetch: f.fetch, maxQueue: 3 })
		const results = ['a', 'b', 'c', 'd', 'e'].map((n) => c.send(page({ n })))
		// 'a' is in flight and stays; 'b' and 'c' make room for 'd' and 'e'
		expect(await results[1]).toBe(false)
		expect(await results[2]).toBe(false)
		await vi.runAllTimersAsync()
		expect(f.sent.map((s) => s.body.n)).toEqual(['a', 'd', 'e'])
	})

	it('drops an event the server would date by its arrival', async () => {
		const f = fakeFetch(Array(20).fill('network'))
		const c = createClient({ site: 'shop-com', host: 'https://a.test', fetch: f.fetch })
		const done = c.send(page())
		await vi.advanceTimersByTimeAsync(6 * 60_000)
		expect([await done, c.pending]).toEqual([false, 0])
	})

	it('runs several requests at once when asked', async () => {
		const f = fakeFetch(['hang', 'hang', 'hang'])
		const c = createClient({ site: 'shop-com', host: 'https://a.test', fetch: f.fetch, concurrency: 3 })
		for (const n of ['a', 'b', 'c', 'd']) void c.send(page({ n }))
		await Promise.resolve()
		expect(f.attempts.map((a) => a.body.n)).toEqual(['a', 'b', 'c'])
	})

	it('flush skips the current retry delay, and keeps retrying a passing failure until sent', async () => {
		const f = fakeFetch(['network', 'network', 503])
		const c = createClient({ site: 'shop-com', host: 'https://a.test', fetch: f.fetch })
		void c.send(page())
		await vi.advanceTimersByTimeAsync(0)
		expect(f.attempts).toHaveLength(1)
		let flushed = false
		void c.flush().then(() => (flushed = true))
		await vi.advanceTimersByTimeAsync(0)
		// sent again at once instead of after the 1 s backoff
		expect([f.attempts.length, flushed]).toEqual([2, false])
		await vi.runAllTimersAsync()
		expect([flushed, f.sent.length, c.pending]).toEqual([true, 1, 0])
	})

	it('flush gives up at its limit while offline, keeping the event queued', async () => {
		const f = fakeFetch(Array(50).fill('network'))
		const c = createClient({ site: 'shop-com', host: 'https://a.test', fetch: f.fetch })
		void c.send(page())
		const start = Date.now()
		let flushed = false
		void c.flush(3000).then(() => (flushed = true))
		await vi.advanceTimersByTimeAsync(2999)
		expect(flushed).toBe(false)
		await vi.advanceTimersByTimeAsync(1)
		expect([flushed, Date.now() - start, c.pending]).toEqual([true, 3000, 1])
	})

	it('flush resolves at once when nothing is queued', async () => {
		const c = createClient({ site: 'shop-com', host: 'https://a.test', fetch: fakeFetch().fetch })
		let flushed = false
		void c.flush().then(() => (flushed = true))
		await vi.advanceTimersByTimeAsync(0)
		expect(flushed).toBe(true)
	})

	it('shutdown delivers an event whose first try failed', async () => {
		const f = fakeFetch([503])
		const c = createClient({ site: 'shop-com', host: 'https://a.test', fetch: f.fetch })
		const done = c.send(page())
		const stopped = c.shutdown()
		await vi.runAllTimersAsync()
		await stopped
		expect([await done, f.sent.length]).toEqual([true, 1])
	})

	it('settles an event still in flight when shutdown gives up on it', async () => {
		const f = fakeFetch(['hang'])
		const c = createClient({ site: 'shop-com', host: 'https://a.test', fetch: f.fetch, timeout: 2000 })
		const done = c.send(page())
		const stopped = c.shutdown(500)
		await vi.advanceTimersByTimeAsync(500)
		await stopped
		await vi.runAllTimersAsync()
		expect([await done, c.pending, f.attempts.length]).toEqual([false, 0, 1])
	})

	it('shutdown sends what it can, then sends nothing more', async () => {
		const f = fakeFetch()
		const c = createClient({ site: 'shop-com', host: 'https://a.test', fetch: f.fetch })
		void c.send(page())
		const { shutdown } = c
		await shutdown()
		expect(f.sent).toHaveLength(1)
		expect(await c.send(page())).toBe(false)
	})

	it('lets beforeSend change or drop events, and survives it throwing', async () => {
		const f = fakeFetch()
		let n = 0
		const c = createClient({
			site: 'shop-com',
			host: 'https://a.test',
			fetch: f.fetch,
			beforeSend: (p) => {
				if (++n === 3) throw new Error('boom')
				return p.n === 'secret' ? null : { ...p, p: { env: 'test' } }
			},
		})
		expect(await c.send(page())).toBe(true)
		expect(await c.send(page({ n: 'secret' }))).toBe(false)
		expect(await c.send(page())).toBe(false)
		expect(f.sent.map((s) => s.body.p)).toEqual([{ env: 'test' }])
	})

	it('resolves false instead of rejecting when something unexpected throws', async () => {
		const f = fakeFetch()
		const c = createClient({ site: 'shop-com', host: 'https://a.test', fetch: f.fetch })
		const hostile = Object.defineProperty(page(), 'p', {
			enumerable: true,
			get() {
				throw new Error('getter')
			},
		})
		await expect(c.send(hostile)).resolves.toBe(false)
		expect(await c.send(page())).toBe(true)
	})

	it('sends nothing when disabled', async () => {
		const f = fakeFetch()
		const c = createClient({ site: 'shop-com', host: 'https://a.test', fetch: f.fetch, enabled: false })
		expect(await c.send(page())).toBe(false)
		expect(f.attempts).toHaveLength(0)
	})

	it("doesn't change the caller's revenue object", async () => {
		const f = fakeFetch()
		const c = createClient({ site: 'shop-com', host: 'https://a.test', fetch: f.fetch })
		const $ = { a: 5, c: 'eur' }
		await c.send(page({ n: 'Purchase', $ }))
		expect([$.c, f.sent[0].body.$]).toEqual(['eur', { a: 5, c: 'EUR' }])
	})
})

describe('responses', () => {
	it('reads every answer to the end, so Node can reuse the connection', async () => {
		const answers: Response[] = []
		const fetchFn = (async () => {
			const res = new Response(answers.length ? 'accepted' : 'busy', { status: answers.length ? 202 : 503 })
			answers.push(res)
			return res
		}) as unknown as typeof fetch
		const c = createClient({ site: 'shop-com', host: 'https://a.test', fetch: fetchFn })
		const sent = c.send(page())
		await vi.runAllTimersAsync()
		expect(await sent).toBe(true)
		expect(answers.map((r) => r.bodyUsed)).toEqual([true, true])
	})
})

describe('props on every event', () => {
	it('adds them to pageviews and events like data-prop-*, lets an event override one, and leaves engagement alone', async () => {
		const f = fakeFetch()
		const c = createClient({ site: 'shop-com', host: 'https://a.test', fetch: f.fetch, props: { build: '412', plan: 'free' } })
		void c.send(page())
		void c.send(page({ n: 'Upgrade', p: { plan: 'pro' } }))
		void c.send(page({ n: 'engagement', e: 4000 }))
		await c.flush()
		expect(f.sent.map((s) => s.body.p)).toEqual([{ build: '412', plan: 'free' }, { build: '412', plan: 'pro' }, undefined])
	})
})

describe('setEnabled', () => {
	it('drops what is queued and sends nothing while off, then sends again when on', async () => {
		const f = fakeFetch(['network'])
		const c = createClient({ site: 'shop-com', host: 'https://a.test', fetch: f.fetch })
		const first = c.send(page({ n: 'Queued' }))
		await vi.advanceTimersByTimeAsync(0)
		c.setEnabled(false)
		expect(await first).toBe(false)
		expect(c.pending).toBe(0)
		expect(await c.send(page({ n: 'While off' }))).toBe(false)
		c.setEnabled(true)
		expect(await c.send(page({ n: 'Back on' }))).toBe(true)
		expect(f.sent.map((s) => s.body.n)).toEqual(['Back on'])
	})
})
