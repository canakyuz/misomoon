// The daily ingest cap: usage counting per site and UTC day, the cap applied in the
// queue consumer, the edge drop once a day is full, and the owner email.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { DAY } from '@misomoon/core'
import { invalidate } from '../src/control'
import { fakeCtx, fakeEnv, OWNER, type FakeEnv } from './fake'

vi.mock('@misomoon/tracker/m.min.js', () => ({ default: '/* m.js */' }))
const { default: worker } = await import('../src/index')

const UA = 'Mozilla/5.0 (Macintosh) Chrome/141.0.0.0 Safari/537.36'
const NOON = Date.UTC(2026, 9, 23, 12)
const TODAY = Math.floor(NOON / DAY)

async function call(env: FakeEnv, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
	const ctx = fakeCtx()
	const init: RequestInit = { method, headers: { 'content-type': 'application/json', ...headers } }
	if (body !== undefined) init.body = JSON.stringify(body)
	const res = await worker.fetch(new Request(`https://app.test${path}`, init), env as unknown as Env, ctx as unknown as ExecutionContext)
	await ctx.settle()
	return res
}

/** A site with a queue: beacons land in `sent` until `deliver` hands them to the consumer. */
async function setup(over: Partial<FakeEnv> = {}, domains = ['shop.com']) {
	const env = fakeEnv(over)
	for (const domain of domains) expect((await call(env, 'POST', '/api/v1/sites', { domain }, OWNER)).status).toBe(201)
	const sent: unknown[] = []
	env.EVENTS = { send: async (body) => void sent.push(body) }
	return { env, sent }
}

/** A beacon at `at` from the browser at `ip`. */
async function beacon(env: FakeEnv, at: number, ip: string, payload: Record<string, unknown> = {}) {
	vi.setSystemTime(at)
	const res = await call(env, 'POST', '/api/event', { s: 'shop-com', n: 'pageview', u: 'https://shop.com/', ...payload }, { 'user-agent': UA, 'cf-connecting-ip': ip })
	expect(res.status).toBe(202)
}

/** `n` pageviews from `n` different visitors, one second apart from `from`. */
async function pageviews(env: FakeEnv, n: number, from = NOON, site = 'shop-com', host = 'shop.com') {
	for (let i = 0; i < n; i++) await beacon(env, from + i * 1000, `198.51.100.${i + 1}`, { s: site, u: `https://${host}/` })
}

/** Runs the queue consumer over these messages, as one batch. */
async function deliver(env: FakeEnv, bodies: unknown[]) {
	const out = { acked: false, retried: false }
	const batch = { messages: bodies.map((body) => ({ body })), ackAll: () => void (out.acked = true), retryAll: () => void (out.retried = true) }
	await worker.queue!(batch as unknown as MessageBatch<never>, env as unknown as Env, fakeCtx() as unknown as ExecutionContext)
	return out
}

/** Takes everything sent so far off the queue. */
const drain = (sent: unknown[]) => sent.splice(0, sent.length)

const stored = (env: FakeEnv, site = 'shop-com') =>
	([...env.SHARD_0.rows('SELECT name, ts FROM events WHERE site_id = ?', site), ...env.SHARD_1.rows('SELECT name, ts FROM events WHERE site_id = ?', site)] as { name: string; ts: number }[]).sort((a, b) => a.ts - b.ts)

const visits = (env: FakeEnv, site: string) =>
	[env.SHARD_0, env.SHARD_1].reduce((n, db) => n + (db.rows('SELECT COUNT(*) AS n FROM sessions WHERE site_id = ?', site)[0] as { n: number }).n, 0)

const usage = (env: FakeEnv) => env.CONTROL.rows('SELECT site_id, day, events, stored, dropped, capped_at FROM usage_daily ORDER BY site_id, day')

const setCap = (env: FakeEnv, cap: number | null, site = 'shop-com') => {
	env.CONTROL.db.prepare('UPDATE sites SET ingest_cap = ? WHERE id = ?').run(cap, site)
	invalidate(`site:${site}`)
}

/** Fails the CONTROL batches whose SQL contains `match`, `times` times. */
function failBatches(env: FakeEnv, match: string, times = Infinity) {
	const batch = env.CONTROL.batch.bind(env.CONTROL)
	let left = times
	env.CONTROL.batch = async (stmts) => {
		if (left > 0 && stmts.some((s) => s.sql.includes(match))) {
			left--
			throw new Error('D1_ERROR: control is busy')
		}
		return batch(stmts)
	}
}

/** Fails the shard batches that insert events, `times` times. */
function failShard(env: FakeEnv, times = Infinity) {
	let left = times
	for (const db of [env.SHARD_0, env.SHARD_1]) {
		const batch = db.batch.bind(db)
		db.batch = async (stmts) => {
			if (left > 0 && stmts.some((s) => s.sql.startsWith('INSERT OR IGNORE INTO events'))) {
				left--
				throw new Error('D1_ERROR: shard is busy')
			}
			return batch(stmts)
		}
	}
}

const takePayments = (env: FakeEnv) => call(env, 'PUT', '/api/v1/sites/shop-com/revenue/stripe', { secret: 'whsec_stripeTestSecret123' }, OWNER)

beforeEach(() => {
	invalidate('')
	vi.useFakeTimers({ toFake: ['Date'] })
	vi.setSystemTime(NOON)
})
afterEach(() => {
	vi.unstubAllGlobals()
	vi.useRealTimers()
})

describe('usage', () => {
	it('counts billable events and stored rows per site and UTC day', async () => {
		const { env, sent } = await setup()
		await beacon(env, NOON, '198.51.100.1', { y: 0.5 })
		// adds its time to the pageview above, and is no row of its own
		await beacon(env, NOON + 5_000, '198.51.100.1', { n: 'engagement', e: 4000, y: 0.5 })
		await beacon(env, NOON + 6_000, '198.51.100.1', { n: 'Signup' })
		await beacon(env, NOON + 7_000, '198.51.100.2')
		await beacon(env, NOON + 8_000, '198.51.100.3')
		expect(await deliver(env, drain(sent))).toEqual({ acked: true, retried: false })
		expect(stored(env).map((e) => e.name)).toEqual(['pageview', 'Signup', 'pageview', 'pageview'])
		expect(usage(env)).toEqual([{ site_id: 'shop-com', day: TODAY, events: 4, stored: 4, dropped: 0, capped_at: null }])
	})

	it('does not count a replayed batch twice', async () => {
		const { env, sent } = await setup()
		await pageviews(env, 3)
		const batch = drain(sent)
		await deliver(env, batch)
		await deliver(env, batch)
		expect([stored(env).length, usage(env)]).toEqual([3, [{ site_id: 'shop-com', day: TODAY, events: 3, stored: 3, dropped: 0, capped_at: null }]])
	})

	it('adds a replayed batch of engagement beacons to their pageview once', async () => {
		const { env, sent } = await setup()
		await beacon(env, NOON, '198.51.100.1', { y: 0.5 })
		await beacon(env, NOON + 5_000, '198.51.100.1', { n: 'engagement', e: 4000, d: 40, y: 0.5 })
		await beacon(env, NOON + 9_000, '198.51.100.1', { n: 'engagement', e: 3000, d: 70, y: 0.5 })
		const batch = drain(sent)
		await deliver(env, batch)
		await deliver(env, batch)
		const rows = [...env.SHARD_0.rows('SELECT name, engaged_ms, scroll_depth FROM events'), ...env.SHARD_1.rows('SELECT name, engaged_ms, scroll_depth FROM events')]
		expect(rows).toEqual([{ name: 'pageview', engaged_ms: 7000, scroll_depth: 70 }])
		expect(usage(env)).toEqual([{ site_id: 'shop-com', day: TODAY, events: 1, stored: 1, dropped: 0, capped_at: null }])
	})

	it('adds batches up', async () => {
		const { env, sent } = await setup()
		await pageviews(env, 2)
		await deliver(env, drain(sent))
		await pageviews(env, 3, NOON + 60_000)
		await deliver(env, drain(sent))
		expect(usage(env)).toEqual([{ site_id: 'shop-com', day: TODAY, events: 5, stored: 5, dropped: 0, capped_at: null }])
	})

	it('writes no usage row for a batch that stores nothing', async () => {
		const { env, sent } = await setup()
		// an engagement beacon with a ref and no visit hands out a key and stores no event
		await beacon(env, NOON, '198.51.100.1', { n: 'engagement', e: 0, k: 'ref_abcdef' })
		await deliver(env, drain(sent))
		expect([stored(env).length, usage(env)]).toEqual([0, []])
	})

	it('keeps counting without a cap', async () => {
		const { env, sent } = await setup()
		await pageviews(env, 40)
		await deliver(env, drain(sent))
		expect([stored(env).length, usage(env)]).toEqual([40, [{ site_id: 'shop-com', day: TODAY, events: 40, stored: 40, dropped: 0, capped_at: null }]])
	})

	it('counts the inline write path too (no queue bound)', async () => {
		const env = fakeEnv()
		await call(env, 'POST', '/api/v1/sites', { domain: 'shop.com' }, OWNER)
		await pageviews(env, 2)
		expect(usage(env)).toEqual([{ site_id: 'shop-com', day: TODAY, events: 2, stored: 2, dropped: 0, capped_at: null }])
	})
})

describe('daily cap', () => {
	it('keeps the earliest events up to INGEST_DAILY_CAP and drops the rest', async () => {
		const { env, sent } = await setup({ INGEST_DAILY_CAP: '3' })
		await pageviews(env, 5)
		expect(sent).toHaveLength(5)
		expect(await deliver(env, drain(sent))).toEqual({ acked: true, retried: false })
		expect(stored(env).map((e) => e.ts)).toEqual([NOON, NOON + 1000, NOON + 2000])
		expect(usage(env)).toEqual([{ site_id: 'shop-com', day: TODAY, events: 3, stored: 3, dropped: 2, capped_at: NOON + 4000 }])
	})

	it("doesn't count engagement beacons against the cap, since they store no row", async () => {
		const { env, sent } = await setup({ INGEST_DAILY_CAP: '3' })
		await beacon(env, NOON, '198.51.100.1', { y: 0.1 })
		await beacon(env, NOON + 1000, '198.51.100.1', { n: 'engagement', e: 900, y: 0.1 })
		await beacon(env, NOON + 2000, '198.51.100.2')
		await beacon(env, NOON + 3000, '198.51.100.3')
		// over the cap: the pageview is dropped, and its beacon then has nothing to add to
		await beacon(env, NOON + 4000, '198.51.100.4', { y: 0.4 })
		await beacon(env, NOON + 5000, '198.51.100.4', { n: 'engagement', e: 2000, y: 0.4 })
		expect(await deliver(env, drain(sent))).toEqual({ acked: true, retried: false })
		expect(stored(env).map((e) => e.name)).toEqual(['pageview', 'pageview', 'pageview'])
		expect(env.SHARD_0.rows('SELECT engaged_ms FROM events WHERE engaged_ms IS NOT NULL').concat(env.SHARD_1.rows('SELECT engaged_ms FROM events WHERE engaged_ms IS NOT NULL'))).toEqual([{ engaged_ms: 900 }])
		// capped_at is when the consumer dropped it: the clock still reads the last beacon's time
		expect(usage(env)).toEqual([{ site_id: 'shop-com', day: TODAY, events: 3, stored: 3, dropped: 1, capped_at: NOON + 5000 }])
	})

	it('carries the count across batches', async () => {
		const { env, sent } = await setup({ INGEST_DAILY_CAP: '3' })
		await pageviews(env, 2)
		await deliver(env, drain(sent))
		await pageviews(env, 2, NOON + 10_000)
		await deliver(env, drain(sent))
		expect([stored(env).length, usage(env)[0]]).toEqual([3, { site_id: 'shop-com', day: TODAY, events: 3, stored: 3, dropped: 1, capped_at: NOON + 11_000 }])
	})

	it('uses the site cap over INGEST_DAILY_CAP, lower or higher', async () => {
		const lower = await setup({ INGEST_DAILY_CAP: '100' })
		setCap(lower.env, 1)
		await pageviews(lower.env, 3)
		await deliver(lower.env, drain(lower.sent))
		invalidate('')
		const higher = await setup({ INGEST_DAILY_CAP: '1' })
		setCap(higher.env, 5)
		await pageviews(higher.env, 3)
		await deliver(higher.env, drain(higher.sent))
		expect([stored(lower.env).length, stored(higher.env).length]).toEqual([1, 3])
	})

	it('caps each site on its own', async () => {
		const { env, sent } = await setup({ INGEST_DAILY_CAP: '1' }, ['shop.com', 'blog.com'])
		await pageviews(env, 2, NOON, 'shop-com', 'shop.com')
		await pageviews(env, 2, NOON + 10_000, 'blog-com', 'blog.com')
		await deliver(env, drain(sent))
		expect([stored(env, 'shop-com').length, stored(env, 'blog-com').length]).toEqual([1, 1])
		expect(usage(env).map((u) => [u.site_id, u.stored, u.dropped])).toEqual([
			['blog-com', 1, 1],
			['shop-com', 1, 1],
		])
	})

	it('starts over on the next UTC day', async () => {
		const { env, sent } = await setup({ INGEST_DAILY_CAP: '1' })
		await pageviews(env, 2)
		await deliver(env, drain(sent))
		await pageviews(env, 2, NOON + DAY)
		await deliver(env, drain(sent))
		expect(usage(env).map((u) => [u.day, u.stored, u.dropped])).toEqual([
			[TODAY, 1, 1],
			[TODAY + 1, 1, 1],
		])
	})

	it('caps each day of a batch that spans midnight on its own', async () => {
		const { env, sent } = await setup({ INGEST_DAILY_CAP: '1' })
		const midnight = (TODAY + 1) * DAY
		await beacon(env, midnight - 10_000, '198.51.100.1')
		await beacon(env, midnight + 10_000, '198.51.100.2')
		await beacon(env, midnight + 20_000, '198.51.100.3')
		await deliver(env, drain(sent))
		expect(stored(env).map((e) => e.ts)).toEqual([midnight - 10_000, midnight + 10_000])
		expect(usage(env).map((u) => [u.day, u.stored, u.dropped])).toEqual([
			[TODAY, 1, 0],
			[TODAY + 1, 1, 1],
		])
	})

	it('treats an INGEST_DAILY_CAP that is not a positive whole number as no cap', async () => {
		for (const bad of ['abc', '0', '-5', '2.5', '']) {
			invalidate('')
			const { env, sent } = await setup({ INGEST_DAILY_CAP: bad })
			await pageviews(env, 3)
			await deliver(env, drain(sent))
			expect([bad, stored(env).length]).toEqual([bad, 3])
		}
	})

	it('keeps the stored count true when two batches race past the cap', async () => {
		const { env, sent } = await setup({ INGEST_DAILY_CAP: '2' })
		await pageviews(env, 2)
		const a = drain(sent)
		await pageviews(env, 2, NOON + 10_000)
		const b = drain(sent)
		await Promise.all([deliver(env, a), deliver(env, b)])
		expect(stored(env).length).toBe(2)
		expect(usage(env).map((u) => [u.stored, u.dropped])).toEqual([[2, 2]])
	})
})

describe('what takes room under the cap', () => {
	it('does not let an engagement ping that has no visit take room from a pageview', async () => {
		const { env, sent } = await setup({ INGEST_DAILY_CAP: '2' })
		// .1 pings with no pageview before it, so the shard keeps no row for the ping
		await beacon(env, NOON, '198.51.100.1', { n: 'engagement', e: 4000 })
		await beacon(env, NOON + 1000, '198.51.100.2')
		await beacon(env, NOON + 2000, '198.51.100.3')
		await deliver(env, drain(sent))
		expect(stored(env).map((r) => r.name)).toEqual(['pageview', 'pageview'])
		expect(usage(env).map((u) => [u.events, u.stored, u.dropped, u.capped_at])).toEqual([[2, 2, 0, null]])
	})

	it('counts drops once when a batch is retried after its events were written', async () => {
		const mails: unknown[] = []
		const { env, sent } = await setup({ INGEST_DAILY_CAP: '3', EMAIL: { send: async (m) => (mails.push(m), { messageId: 'm' }) } })
		await pageviews(env, 5)
		const batch = drain(sent)
		failBatches(env, 'SET dropped', 1)
		expect(await deliver(env, batch)).toEqual({ acked: false, retried: true })
		expect(await deliver(env, batch)).toEqual({ acked: true, retried: false })
		expect(stored(env).length).toBe(3)
		// the 3 stored the first time are already on the shard: they take no room and aren't dropped
		expect(usage(env).map((u) => [u.events, u.stored, u.dropped, u.capped_at != null])).toEqual([[3, 3, 2, true]])
		expect(mails.length).toBe(1)
	})

	it('drops none of a replayed batch that fit the first time', async () => {
		const { env, sent } = await setup({ INGEST_DAILY_CAP: '3' })
		await pageviews(env, 3)
		const batch = drain(sent)
		await deliver(env, batch)
		await deliver(env, batch)
		expect(usage(env).map((u) => [u.stored, u.dropped, u.capped_at])).toEqual([[3, 0, null]])
	})
})

describe('what takes room under the cap, more', () => {
	const X = '0b5c4a1e-6d2f-4c8a-9e3b-7f1a2d4c6e80'

	it('counts an event resent with the same id in one batch once', async () => {
		const { env, sent } = await setup({ INGEST_DAILY_CAP: '2' })
		await beacon(env, NOON, '198.51.100.1', { id: X })
		await beacon(env, NOON + 1000, '198.51.100.1', { id: X })
		await beacon(env, NOON + 2000, '198.51.100.2')
		await deliver(env, drain(sent))
		expect(stored(env).map((r) => r.ts)).toEqual([NOON, NOON + 2000])
		expect(usage(env).map((u) => [u.stored, u.dropped])).toEqual([[2, 0]])
	})

	it('drops the resent copy too when the first one was past the cap', async () => {
		const { env, sent } = await setup({ INGEST_DAILY_CAP: '1' })
		await beacon(env, NOON, '198.51.100.2')
		await beacon(env, NOON + 1000, '198.51.100.1', { id: X })
		await beacon(env, NOON + 2000, '198.51.100.1', { id: X })
		await deliver(env, drain(sent))
		expect(stored(env).map((r) => r.ts)).toEqual([NOON])
		expect(usage(env).map((u) => [u.stored, u.dropped])).toEqual([[1, 1]])
	})

	it('checks the shard for every event of a large replayed batch', async () => {
		const { env, sent } = await setup({ INGEST_DAILY_CAP: '100' })
		await pageviews(env, 100)
		const batch = drain(sent)
		await deliver(env, batch)
		await deliver(env, batch)
		expect(usage(env).map((u) => [u.stored, u.dropped, u.capped_at])).toEqual([[100, 0, null]])
	})

	it('takes room once for an event resent in one batch, leaving the rest for another consumer', async () => {
		const { env, sent } = await setup({ INGEST_DAILY_CAP: '3' })
		await beacon(env, NOON, '198.51.100.1', { id: X })
		await beacon(env, NOON + 1000, '198.51.100.1', { id: X })
		const a = drain(sent)
		await beacon(env, NOON + 2000, '198.51.100.2')
		await beacon(env, NOON + 3000, '198.51.100.3')
		const b = drain(sent)
		// a takes its room first: 1 slot for X, so b gets the other 2
		await Promise.all([deliver(env, a), deliver(env, b)])
		expect(stored(env).map((r) => r.ts)).toEqual([NOON, NOON + 2000, NOON + 3000])
		expect(usage(env).map((u) => [u.stored, u.dropped])).toEqual([[3, 0]])
	})

	it("doesn't carry a visit into the next day through events the cap dropped", async () => {
		const { env, sent } = await setup({ INGEST_DAILY_CAP: '1' })
		const day = Date.UTC(2026, 9, 23)
		const at = (h: number, m: number) => day + (h * 60 + m) * 60_000
		// one visitor: 23:00 fills the day; 23:25 and 23:50 would keep the visit going, but are dropped
		for (const t of [at(23, 0), at(23, 25), at(23, 50), at(24, 5)]) await beacon(env, t, '198.51.100.1')
		const [first, ...rest] = drain(sent)
		await deliver(env, [first])
		await deliver(env, rest)
		const rows = [...env.SHARD_0.rows("SELECT ts, session_id FROM events WHERE site_id = 'shop-com'"), ...env.SHARD_1.rows("SELECT ts, session_id FROM events WHERE site_id = 'shop-com'")] as { ts: number; session_id: string }[]
		rows.sort((a, b) => a.ts - b.ts)
		// 00:05 is 65 minutes after the last stored pageview, so it starts a visit of its own
		expect(rows.map((r) => r.ts)).toEqual([at(23, 0), at(24, 5)])
		expect(rows[0].session_id).not.toBe(rows[1].session_id)
	})
})

describe('two consumers at once', () => {
	it('stores exactly the cap when two batches are written at the same time', async () => {
		const { env, sent } = await setup({ INGEST_DAILY_CAP: '3' })
		await pageviews(env, 2)
		const a = drain(sent)
		await pageviews(env, 2, NOON + 10_000)
		const b = drain(sent)
		await Promise.all([deliver(env, a), deliver(env, b)])
		expect(stored(env).length).toBe(3)
		expect(usage(env).map((u) => [u.stored, u.dropped])).toEqual([[3, 1]])
	})

	it('gives back the room it took when the shard write fails, so the retry stores up to the cap', async () => {
		const { env, sent } = await setup({ INGEST_DAILY_CAP: '3' })
		await pageviews(env, 5)
		const batch = drain(sent)
		failShard(env, 1)
		expect(await deliver(env, batch)).toEqual({ acked: false, retried: true })
		expect(usage(env).map((u) => [u.stored, u.dropped])).toEqual([[0, 0]])
		expect(await deliver(env, batch)).toEqual({ acked: true, retried: false })
		expect(usage(env).map((u) => [u.stored, u.dropped])).toEqual([[3, 2]])
	})

	it('counts a batch delivered twice at the same time once', async () => {
		const { env, sent } = await setup({ INGEST_DAILY_CAP: '5' })
		await pageviews(env, 2)
		const batch = drain(sent)
		await Promise.all([deliver(env, batch), deliver(env, batch)])
		expect(stored(env).length).toBe(2)
		expect(usage(env).map((u) => [u.events, u.stored, u.dropped])).toEqual([[2, 2, 0]])
	})

	it('errs toward storing less, never more, when it cannot give back the room it took', async () => {
		const { env, sent } = await setup({ INGEST_DAILY_CAP: '3' })
		await pageviews(env, 5)
		const batch = drain(sent)
		// the shard write fails, and so do both tries to give the 3 slots back
		failShard(env, 1)
		failBatches(env, 'events, stored)', 2)
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
		expect(await deliver(env, batch)).toEqual({ acked: false, retried: true })
		expect(await deliver(env, batch)).toEqual({ acked: true, retried: false })
		errors.mockRestore()
		expect(stored(env).length).toBe(0)
		expect(usage(env).map((u) => [u.stored, u.dropped])).toEqual([[3, 5]])
	})
})

describe('ref-only beacons (payment refs without an event)', () => {
	it('drops one at the edge for a site that takes no payments', async () => {
		const { env, sent } = await setup()
		await beacon(env, NOON, '198.51.100.1', { n: 'engagement', e: 0, k: 'ref_nobody' })
		expect(sent).toEqual([])
	})

	it('counts one as a stored row, not an event, and keeps its ref', async () => {
		const { env, sent } = await setup()
		expect((await takePayments(env)).status).toBe(200)
		await beacon(env, NOON, '198.51.100.1')
		await beacon(env, NOON + 1000, '198.51.100.1', { n: 'engagement', e: 0, k: 'ref_one' })
		await deliver(env, drain(sent))
		expect(usage(env).map((u) => [u.events, u.stored])).toEqual([[1, 2]])
		expect(env.CONTROL.rows("SELECT COUNT(*) AS n FROM attribution WHERE key = 'ref_one'")).toEqual([{ n: 1 }])
	})

	it('counts a replayed one once', async () => {
		const { env, sent } = await setup()
		expect((await takePayments(env)).status).toBe(200)
		await beacon(env, NOON, '198.51.100.1')
		await beacon(env, NOON + 1000, '198.51.100.1', { n: 'engagement', e: 0, k: 'ref_one' })
		const batch = drain(sent)
		await deliver(env, batch)
		await deliver(env, batch)
		expect(usage(env).map((u) => [u.events, u.stored])).toEqual([[1, 2]])
	})

	it('takes room for one ahead of the pageviews after it', async () => {
		const { env, sent } = await setup({ INGEST_DAILY_CAP: '2' })
		expect((await takePayments(env)).status).toBe(200)
		await beacon(env, NOON, '198.51.100.1', { n: 'engagement', e: 0, k: 'ref_first' })
		await beacon(env, NOON + 1000, '198.51.100.2')
		await beacon(env, NOON + 2000, '198.51.100.3')
		await deliver(env, drain(sent))
		expect(stored(env).map((r) => r.ts)).toEqual([NOON + 1000])
		expect(usage(env).map((u) => [u.events, u.stored, u.dropped])).toEqual([[1, 2, 1]])
	})

	it('still counts one kept past a full day, the one way a day goes over its cap', async () => {
		const { env, sent } = await setup({ INGEST_DAILY_CAP: '1' })
		expect((await takePayments(env)).status).toBe(200)
		await beacon(env, NOON, '198.51.100.1')
		await beacon(env, NOON + 1000, '198.51.100.1', { n: 'engagement', e: 0, k: 'ref_late_one' })
		await deliver(env, drain(sent))
		expect(usage(env).map((u) => [u.events, u.stored, u.dropped])).toEqual([[1, 2, 0]])
		expect(env.CONTROL.rows("SELECT COUNT(*) AS n FROM attribution WHERE key = 'ref_late_one'")).toEqual([{ n: 1 }])
	})

	it('fills the day with them, so the edge then drops the next beacon', async () => {
		const { env, sent } = await setup({ INGEST_DAILY_CAP: '2' })
		expect((await takePayments(env)).status).toBe(200)
		await beacon(env, NOON, '198.51.100.1', { n: 'engagement', e: 0, k: 'ref_aaa' })
		await beacon(env, NOON + 1000, '198.51.100.2', { n: 'engagement', e: 0, k: 'ref_bbb' })
		await deliver(env, drain(sent))
		expect(usage(env).map((u) => [u.events, u.stored])).toEqual([[0, 2]])
		await beacon(env, NOON + 2000, '198.51.100.3')
		expect(sent).toEqual([])
	})
})

describe('ref-only beacons, more', () => {
	it('counts nothing for one queued before its site stopped taking payments', async () => {
		const { env, sent } = await setup()
		expect((await takePayments(env)).status).toBe(200)
		await beacon(env, NOON, '198.51.100.1')
		await beacon(env, NOON + 1000, '198.51.100.1', { n: 'engagement', e: 0, k: 'ref_gone' })
		expect((await call(env, 'DELETE', '/api/v1/sites/shop-com/revenue/stripe', undefined, OWNER)).status).toBe(204)
		await deliver(env, drain(sent))
		expect(usage(env).map((u) => [u.events, u.stored])).toEqual([[1, 1]])
		expect(env.CONTROL.rows('SELECT COUNT(*) AS n FROM attribution')).toEqual([{ n: 0 }])
	})

	it('counts a pageview that carries refs as its one row', async () => {
		const { env, sent } = await setup()
		expect((await takePayments(env)).status).toBe(200)
		await beacon(env, NOON, '198.51.100.1', { k: 'ref_on_page' })
		await deliver(env, drain(sent))
		expect(usage(env).map((u) => [u.events, u.stored])).toEqual([[1, 1]])
		expect(env.CONTROL.rows("SELECT COUNT(*) AS n FROM attribution WHERE key = 'ref_on_page'")).toEqual([{ n: 1 }])
	})

	it('forgets which ones it counted after 2 days, in maintenance', async () => {
		const { env } = await setup()
		const now = Date.UTC(2026, 9, 23, 12, 15)
		env.CONTROL.db.exec(`INSERT INTO usage_refs (event_id, at) VALUES ('old', ${now - 2 * DAY - 1}), ('kept', ${now - 2 * DAY})`)
		vi.setSystemTime(now)
		const ctx = fakeCtx()
		await worker.scheduled!({ cron: '*/5 * * * *', scheduledTime: now } as ScheduledController, env as unknown as Env, ctx as unknown as ExecutionContext)
		await ctx.settle()
		expect(env.CONTROL.rows('SELECT event_id FROM usage_refs')).toEqual([{ event_id: 'kept' }])
	})
})

describe('when usage cannot be written', () => {
	it('tries the usage write again at once, and acks the batch', async () => {
		const { env, sent } = await setup({}, ['blog.com', 'shop.com'])
		await pageviews(env, 2, NOON, 'blog-com', 'blog.com')
		await pageviews(env, 2, NOON + 10_000, 'shop-com', 'shop.com')
		failBatches(env, 'events, stored)', 1)
		expect(await deliver(env, drain(sent))).toEqual({ acked: true, retried: false })
		expect(usage(env).map((u) => [u.site_id, u.stored])).toEqual([
			['blog-com', 2],
			['shop-com', 2],
		])
	})

	it('still writes every site of the batch, and logs what it could not count', async () => {
		const { env, sent } = await setup({}, ['blog.com', 'shop.com'])
		await pageviews(env, 2, NOON, 'blog-com', 'blog.com')
		await pageviews(env, 2, NOON + 10_000, 'shop-com', 'shop.com')
		failBatches(env, 'events, stored)')
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
		const out = await deliver(env, drain(sent))
		const logged = errors.mock.calls.map((c) => JSON.parse(String(c[0])))
		errors.mockRestore()
		expect(out).toEqual({ acked: true, retried: false })
		expect([stored(env, 'blog-com').length, stored(env, 'shop-com').length, usage(env)]).toEqual([2, 2, []])
		expect(logged).toEqual([
			{ msg: 'usage count failed', counts: [{ site: 'blog-com', day: TODAY, events: 2, stored: 2 }], error: 'Error: D1_ERROR: control is busy' },
			{ msg: 'usage count failed', counts: [{ site: 'shop-com', day: TODAY, events: 2, stored: 2 }], error: 'Error: D1_ERROR: control is busy' },
		])
	})
})

describe('at the edge', () => {
	it('drops at once after a batch fills the day exactly, without waiting for the cache', async () => {
		const { env, sent } = await setup({ INGEST_DAILY_CAP: '3' })
		// each of these reads the day's count at the edge, so 0 is in the cache
		await pageviews(env, 3)
		await deliver(env, drain(sent))
		expect(usage(env).map((u) => [u.stored, u.dropped])).toEqual([[3, 0]])
		await pageviews(env, 1, NOON + 10_000)
		expect(sent).toEqual([])
	})

	it('drops beacons before the queue once the day is full', async () => {
		const { env, sent } = await setup({ INGEST_DAILY_CAP: '2' })
		await pageviews(env, 2)
		await deliver(env, drain(sent))
		// the edge reads the count through the isolate cache, so a minute later it knows
		await beacon(env, NOON + 61_000, '198.51.100.9')
		expect(sent).toEqual([])
	})

	it('does not read usage at the edge when no cap applies', async () => {
		const { env } = await setup()
		const seen: string[] = []
		const prepare = env.CONTROL.prepare.bind(env.CONTROL)
		env.CONTROL.prepare = (sql: string) => (seen.push(sql), prepare(sql))
		await pageviews(env, 2)
		expect(seen.filter((s) => s.includes('usage_daily'))).toEqual([])
	})
})

describe('payment refs', () => {
	it('keeps a ref-only beacon that is queued behind a full day, so the payment is attributed', async () => {
		const { env, sent } = await setup({ INGEST_DAILY_CAP: '1' })
		// refs are kept only for a site that takes payments
		expect((await call(env, 'PUT', '/api/v1/sites/shop-com/revenue/stripe', { secret: 'whsec_stripeTestSecret123' }, OWNER)).status).toBe(200)
		await beacon(env, NOON, '198.51.100.1')
		await beacon(env, NOON + 1000, '198.51.100.2')
		await beacon(env, NOON + 2000, '198.51.100.1', { n: 'engagement', e: 0, k: 'ref_after_cap' })
		await deliver(env, drain(sent))
		expect(stored(env).length).toBe(1)
		expect(env.CONTROL.rows("SELECT COUNT(*) AS n FROM attribution WHERE key = 'ref_after_cap'")).toEqual([{ n: 1 }])
	})
})

describe('blocked site (ingest_cap 0)', () => {
	it('drops beacons at the edge without queueing them', async () => {
		const { env, sent } = await setup()
		setCap(env, 0)
		await pageviews(env, 2)
		expect([sent.length, stored(env).length]).toEqual([0, 0])
	})

	it('drops events already on the queue, without an email or capped_at', async () => {
		const mails: unknown[] = []
		const { env, sent } = await setup({ EMAIL: { send: async (m) => (mails.push(m), { messageId: 'm' }) } })
		await pageviews(env, 2)
		setCap(env, 0)
		await deliver(env, drain(sent))
		expect([stored(env).length, usage(env), mails]).toEqual([0, [{ site_id: 'shop-com', day: TODAY, events: 0, stored: 0, dropped: 2, capped_at: null }], []])
	})

	it('still records payments from webhooks', async () => {
		const { env } = await setup()
		setCap(env, 0)
		const res = await call(env, 'PUT', '/api/v1/sites/shop-com/revenue/custom', {}, OWNER)
		const { secret } = (await res.json()) as { secret: string }
		const hook = await call(env, 'POST', '/api/webhooks/custom/shop-com', { id: 'pay_1', amount: 10, currency: 'USD' }, { authorization: `Bearer ${secret}` })
		expect(hook.status).toBe(200)
		expect(stored(env).map((e) => e.name)).toEqual(['Payment'])
	})
})

describe('owner email', () => {
	function team(env: FakeEnv) {
		env.CONTROL.db.exec(`INSERT INTO users (id, email, name, password_hash, created_at) VALUES ('u2', 'admin@test', 'Admin', 'x', 0), ('u3', 'viewer@test', 'Viewer', 'x', 0);
			INSERT INTO team_members (team_id, user_id, role, created_at) VALUES ('t1', 'u2', 'admin', 0), ('t1', 'u3', 'viewer', 0);`)
	}

	it('emails owners and admins once, the first time a day is capped', async () => {
		const mails: { to: string; subject: string }[] = []
		const { env, sent } = await setup({ INGEST_DAILY_CAP: '1', EMAIL: { send: async (m) => (mails.push(m as { to: string; subject: string }), { messageId: 'm' }) } })
		team(env)
		await pageviews(env, 3)
		await deliver(env, drain(sent))
		await pageviews(env, 2, NOON + 10_000)
		await deliver(env, drain(sent))
		expect(mails.map((m) => m.to).sort()).toEqual(['admin@test', 'owner@test'])
		expect([...new Set(mails.map((m) => m.subject))]).toEqual(['Tracking for shop.com is paused until 00:00 UTC'])
	})

	it('does not email again for a later batch dropped the same day', async () => {
		const mails: unknown[] = []
		const { env, sent } = await setup({ INGEST_DAILY_CAP: '1', EMAIL: { send: async (m) => (mails.push(m), { messageId: 'm' }) } })
		// both batches are on the queue before either is written, so the edge lets them by
		await pageviews(env, 2)
		const a = drain(sent)
		await pageviews(env, 2, NOON + 10_000)
		const b = drain(sent)
		await deliver(env, a)
		await deliver(env, b)
		expect([mails.length, usage(env)[0].dropped]).toEqual([1, 3])
	})

	it('acks the batch when the email fails', async () => {
		const { env, sent } = await setup({ INGEST_DAILY_CAP: '1', EMAIL: { send: async () => Promise.reject(new Error('email down')) } })
		await pageviews(env, 2)
		expect(await deliver(env, drain(sent))).toEqual({ acked: true, retried: false })
		expect([stored(env).length, usage(env)[0].dropped]).toEqual([1, 1])
	})
})

describe('GET /api/v1/sites/:id/usage', () => {
	it('returns the cap and each day with traffic', async () => {
		const { env, sent } = await setup({ INGEST_DAILY_CAP: '3' })
		await pageviews(env, 5)
		await deliver(env, drain(sent))
		const res = await call(env, 'GET', '/api/v1/sites/shop-com/usage', undefined, OWNER)
		expect([res.status, await res.json()]).toEqual([200, { cap: 3, blocked: false, days: [{ day: '2026-10-23', events: 3, stored: 3, dropped: 2, capped: true }] }])
	})

	it('reports no cap and a blocked site', async () => {
		const { env } = await setup()
		const open = await (await call(env, 'GET', '/api/v1/sites/shop-com/usage', undefined, OWNER)).json()
		setCap(env, 0)
		const blocked = await (await call(env, 'GET', '/api/v1/sites/shop-com/usage', undefined, OWNER)).json()
		expect([open, blocked]).toEqual([
			{ cap: null, blocked: false, days: [] },
			{ cap: 0, blocked: true, days: [] },
		])
	})

	it('needs access to the site', async () => {
		const { env } = await setup()
		expect((await call(env, 'GET', '/api/v1/sites/shop-com/usage')).status).toBe(401)
	})

	it('covers the last 31 days, today included', async () => {
		const { env } = await setup()
		env.CONTROL.db.exec(`INSERT INTO usage_daily (site_id, day, events, stored, dropped) VALUES ('shop-com', ${TODAY - 31}, 1, 1, 0), ('shop-com', ${TODAY - 30}, 2, 2, 0)`)
		const res = await call(env, 'GET', '/api/v1/sites/shop-com/usage', undefined, OWNER)
		// TODAY is 2026-10-23, so TODAY - 30 is 2026-09-23 and TODAY - 31 falls outside
		expect((await res.json()).days).toEqual([{ day: '2026-09-23', events: 2, stored: 2, dropped: 0, capped: false }])
	})

	it('is for the team, not for visitors of a public dashboard', async () => {
		const { env } = await setup({ INGEST_DAILY_CAP: '3' })
		expect((await call(env, 'PATCH', '/api/v1/sites/shop-com', { public: true }, OWNER)).status).toBe(200)
		// the site itself is readable signed out now
		expect((await call(env, 'GET', '/api/v1/sites/shop-com')).status).toBe(200)
		const res = await call(env, 'GET', '/api/v1/sites/shop-com/usage')
		expect([res.status, await res.json()]).toEqual([401, { error: 'sign in to see this site' }])
	})
})

describe('maintenance', () => {
	it('deletes usage rows older than 400 days', async () => {
		const { env } = await setup()
		env.CONTROL.db.exec(`INSERT INTO usage_daily (site_id, day, events, stored, dropped) VALUES ('shop-com', ${TODAY - 401}, 1, 1, 0), ('shop-com', ${TODAY - 400}, 1, 1, 0)`)
		const ctx = fakeCtx()
		// the daily cleanup
		vi.setSystemTime(Date.UTC(2026, 9, 23, 3, 15))
		await worker.scheduled!({ cron: '*/5 * * * *', scheduledTime: Date.now() } as ScheduledController, env as unknown as Env, ctx as unknown as ExecutionContext)
		await ctx.settle()
		expect(usage(env).map((u) => u.day)).toEqual([TODAY - 400])
	})

	it('deletes old usage rows on every site', async () => {
		const { env } = await setup({}, ['blog.com', 'shop.com'])
		env.CONTROL.db.exec(
			`INSERT INTO usage_daily (site_id, day, events, stored, dropped) VALUES ('blog-com', ${TODAY - 500}, 1, 1, 0), ('blog-com', ${TODAY - 1}, 1, 1, 0), ('shop-com', ${TODAY - 401}, 1, 1, 0), ('shop-com', ${TODAY - 2}, 1, 1, 0)`,
		)
		const ctx = fakeCtx()
		// the daily cleanup
		vi.setSystemTime(Date.UTC(2026, 9, 23, 3, 15))
		await worker.scheduled!({ cron: '*/5 * * * *', scheduledTime: Date.now() } as ScheduledController, env as unknown as Env, ctx as unknown as ExecutionContext)
		await ctx.settle()
		expect(usage(env).map((u) => [u.site_id, u.day])).toEqual([
			['blog-com', TODAY - 1],
			['shop-com', TODAY - 2],
		])
	})
})

describe('a site deleted while its events are on the queue', () => {
	// The deleted site's events come first, so its group is written before shop.com's.
	it('writes and counts the rest of the batch, and keeps no usage for the deleted site', async () => {
		const { env, sent } = await setup({}, ['blog.com', 'shop.com'])
		await pageviews(env, 2, NOON, 'blog-com', 'blog.com')
		await pageviews(env, 2, NOON + 10_000, 'shop-com', 'shop.com')
		expect((await call(env, 'DELETE', '/api/v1/sites/blog-com', undefined, OWNER)).status).toBe(204)
		expect(await deliver(env, drain(sent))).toEqual({ acked: true, retried: false })
		expect(stored(env, 'shop-com').length).toBe(2)
		expect(usage(env).map((u) => [u.site_id, u.events, u.stored, u.dropped])).toEqual([['shop-com', 2, 2, 0]])
	})

	it('does the same when another isolate still has the capped site cached', async () => {
		const { env, sent } = await setup({ INGEST_DAILY_CAP: '1' }, ['blog.com', 'shop.com'])
		await pageviews(env, 2, NOON, 'blog-com', 'blog.com')
		await pageviews(env, 2, NOON + 10_000, 'shop-com', 'shop.com')
		// the rows go, but the cached site stays, as in an isolate the delete didn't run in
		for (const table of ['shard_moves', 'shard_map']) env.CONTROL.db.prepare(`DELETE FROM ${table} WHERE site_id = ?`).run('blog-com')
		env.CONTROL.db.prepare('DELETE FROM sites WHERE id = ?').run('blog-com')
		expect(await deliver(env, drain(sent))).toEqual({ acked: true, retried: false })
		expect(stored(env, 'shop-com').length).toBe(1)
		expect(usage(env).map((u) => [u.site_id, u.events, u.stored, u.dropped])).toEqual([['shop-com', 1, 1, 1]])
	})

	it("writes none of the deleted site's events, and opens no shard range for it", async () => {
		const { env, sent } = await setup({}, ['blog.com', 'shop.com'])
		await pageviews(env, 2, NOON, 'blog-com', 'blog.com')
		await pageviews(env, 2, NOON + 10_000, 'shop-com', 'shop.com')
		expect((await call(env, 'DELETE', '/api/v1/sites/blog-com', undefined, OWNER)).status).toBe(204)
		expect(await deliver(env, drain(sent))).toEqual({ acked: true, retried: false })
		expect(stored(env, 'blog-com')).toEqual([])
		expect(visits(env, 'blog-com')).toBe(0)
		expect(env.CONTROL.rows("SELECT shard FROM shard_map WHERE site_id = 'blog-com'")).toEqual([])
		expect(stored(env, 'shop-com').length).toBe(2)
	})

	it('starts a site added again for the same domain with no data', async () => {
		const { env, sent } = await setup({}, ['blog.com'])
		await pageviews(env, 2, NOON, 'blog-com', 'blog.com')
		expect((await call(env, 'DELETE', '/api/v1/sites/blog-com', undefined, OWNER)).status).toBe(204)
		await deliver(env, drain(sent))
		expect((await call(env, 'POST', '/api/v1/sites', { domain: 'blog.com' }, OWNER)).status).toBe(201)
		const res = await call(env, 'GET', '/api/v1/stats/aggregate?site=blog-com&period=7d', undefined, OWNER)
		const { current } = (await res.json()) as { current: { visitors: number; pageviews: number } }
		expect([res.status, current.visitors, current.pageviews]).toEqual([200, 0, 0])
	})

	it('removes what it wrote when the delete finishes during the write', async () => {
		const { env, sent } = await setup({}, ['blog.com', 'shop.com'])
		await pageviews(env, 2, NOON, 'blog-com', 'blog.com')
		await pageviews(env, 2, NOON + 10_000, 'shop-com', 'shop.com')
		// another isolate's delete purged the shards before this write, and removes the site right after it
		for (const db of [env.SHARD_0, env.SHARD_1]) {
			const batch = db.batch.bind(db)
			db.batch = async (stmts) => {
				const res = await batch(stmts)
				if (stmts.some((s) => s.sql.startsWith('INSERT OR IGNORE INTO events') && s.params.includes('blog-com'))) {
					for (const table of ['shard_moves', 'shard_map']) env.CONTROL.db.prepare(`DELETE FROM ${table} WHERE site_id = ?`).run('blog-com')
					env.CONTROL.db.prepare('DELETE FROM sites WHERE id = ?').run('blog-com')
				}
				return res
			}
		}
		expect(await deliver(env, drain(sent))).toEqual({ acked: true, retried: false })
		expect(stored(env, 'blog-com')).toEqual([])
		expect(visits(env, 'blog-com')).toBe(0)
		expect(stored(env, 'shop-com').length).toBe(2)
	})

	it('removes events written while the delete ran', async () => {
		const { env, sent } = await setup({}, ['blog.com'])
		await pageviews(env, 1, NOON, 'blog-com', 'blog.com')
		await deliver(env, drain(sent))
		await pageviews(env, 2, NOON + 10_000, 'blog-com', 'blog.com')
		const queued = drain(sent)
		// a consumer that found the site still there writes after the delete purged the shards
		const batch = env.CONTROL.batch.bind(env.CONTROL)
		let raced = false
		env.CONTROL.batch = async (stmts) => {
			if (!raced && stmts.some((s) => s.sql.startsWith('DELETE FROM sites'))) {
				raced = true
				expect(await deliver(env, queued)).toEqual({ acked: true, retried: false })
				expect(stored(env, 'blog-com').length).toBe(2)
			}
			return batch(stmts)
		}
		expect((await call(env, 'DELETE', '/api/v1/sites/blog-com', undefined, OWNER)).status).toBe(204)
		expect(raced).toBe(true)
		expect(stored(env, 'blog-com')).toEqual([])
		expect(visits(env, 'blog-com')).toBe(0)
	})

	it('removes events written while the delete ran, on a shard the site had no data on yet', async () => {
		const { env, sent } = await setup({}, ['blog.com'])
		await pageviews(env, 2, NOON, 'blog-com', 'blog.com')
		const queued = drain(sent)
		// the site has no range when the delete starts; the racing write places it on a shard
		const batch = env.CONTROL.batch.bind(env.CONTROL)
		let raced = false
		env.CONTROL.batch = async (stmts) => {
			if (!raced && stmts.some((s) => s.sql.startsWith('DELETE FROM sites'))) {
				raced = true
				expect(await deliver(env, queued)).toEqual({ acked: true, retried: false })
				expect(stored(env, 'blog-com').length).toBe(2)
			}
			return batch(stmts)
		}
		expect((await call(env, 'DELETE', '/api/v1/sites/blog-com', undefined, OWNER)).status).toBe(204)
		expect(raced).toBe(true)
		expect(stored(env, 'blog-com')).toEqual([])
		expect(visits(env, 'blog-com')).toBe(0)
	})

	it("drops a deleted site's payment refs without failing the batch", async () => {
		const { env, sent } = await setup({}, ['shop.com', 'blog.com'])
		expect((await takePayments(env)).status).toBe(200)
		await beacon(env, NOON, '198.51.100.1')
		await beacon(env, NOON + 1000, '198.51.100.1', { n: 'engagement', e: 0, k: 'ref_gone' })
		await pageviews(env, 2, NOON + 10_000, 'blog-com', 'blog.com')
		expect((await call(env, 'DELETE', '/api/v1/sites/shop-com', undefined, OWNER)).status).toBe(204)
		expect(await deliver(env, drain(sent))).toEqual({ acked: true, retried: false })
		expect(env.CONTROL.rows("SELECT COUNT(*) AS n FROM attribution WHERE key = 'ref_gone'")).toEqual([{ n: 0 }])
		expect(stored(env, 'shop-com')).toEqual([])
		expect(stored(env, 'blog-com').length).toBe(2)
	})
})
