// Two queue consumers at once: when the queue backs up, Cloudflare runs more than one
// batch at a time, and two of them can hold beacons from the same browser.
import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { invalidate } from '../src/control'
import { fakeCtx, fakeEnv, OWNER, type FakeEnv } from './fake'

vi.mock('@misomoon/tracker/m.min.js', () => ({ default: '/* m.js */' }))
const { default: worker } = await import('../src/index')

const UA = 'Mozilla/5.0 (Macintosh) Chrome/141.0.0.0 Safari/537.36'
const NOON = Date.UTC(2026, 9, 10, 12)
const STRIPE_SECRET = 'whsec_stripeTestSecret123'

async function call(env: FakeEnv, method: string, path: string, body?: unknown, headers: Record<string, string> = OWNER) {
	const ctx = fakeCtx()
	const init: RequestInit = { method, headers: { 'content-type': 'application/json', ...headers } }
	if (body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body)
	const res = await worker.fetch(new Request(`https://app.test${path}`, init), env as unknown as Env, ctx as unknown as ExecutionContext)
	await ctx.settle()
	return res
}

/** A site with a queue: beacons land in `sent` until `deliver` hands them to a consumer. */
async function setup() {
	const env = fakeEnv()
	expect((await call(env, 'POST', '/api/v1/sites', { domain: 'shop.com' })).status).toBe(201)
	const sent: unknown[] = []
	env.EVENTS = { send: async (body) => void sent.push(body) }
	return { env, sent }
}

async function beacon(env: FakeEnv, at: number, body: Record<string, unknown>) {
	vi.setSystemTime(at)
	const res = await call(env, 'POST', '/api/event', { s: 'shop-com', n: 'pageview', u: 'https://shop.com/', ...body }, { 'user-agent': UA, 'cf-connecting-ip': '198.51.100.7' })
	expect(res.status).toBe(202)
}

/** One consumer's batch. */
async function deliver(env: FakeEnv, bodies: unknown[]) {
	const messages = bodies.map((body) => ({ body, ack: () => {}, retry: () => {} }))
	const batch = { messages, ackAll: () => {}, retryAll: () => {} }
	await worker.queue!(batch as unknown as MessageBatch<never>, env as unknown as Env, fakeCtx() as unknown as ExecutionContext)
}

const rows = (env: FakeEnv, sql: string) => [...env.SHARD_0.rows(sql), ...env.SHARD_1.rows(sql)] as Record<string, unknown>[]

beforeEach(() => {
	invalidate('')
	vi.useFakeTimers({ toFake: ['Date'] })
	vi.setSystemTime(NOON)
})
afterEach(() => vi.useRealTimers())

describe('two queue batches with the same browser, written at once', () => {
	it('make one visit', async () => {
		const { env, sent } = await setup()
		await beacon(env, NOON, { r: 'https://www.google.com/' })
		await beacon(env, NOON + 60_000, { u: 'https://shop.com/pricing' })
		await Promise.all([deliver(env, [sent[0]]), deliver(env, [sent[1]])])
		expect(rows(env, 'SELECT entry_path, exit_path, pageviews, source FROM sessions')).toEqual([{ entry_path: '/', exit_path: '/pricing', pageviews: 2, source: 'Google' }])
		expect(new Set(rows(env, 'SELECT session_id FROM events').map((r) => r.session_id)).size).toBe(1)
	})

	it('credit a payment to the visit its success page joined', async () => {
		const { env, sent } = await setup()
		expect((await call(env, 'PUT', '/api/v1/sites/shop-com/revenue/stripe', { secret: STRIPE_SECRET })).status).toBe(200)
		await beacon(env, NOON, { r: 'https://www.google.com/' })
		await beacon(env, NOON + 60_000, { u: 'https://shop.com/thanks?session_id=cs_live_1' })
		await Promise.all([deliver(env, [sent[0]]), deliver(env, [sent[1]])])
		const body = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed', livemode: true, data: { object: { id: 'cs_live_1', mode: 'payment', payment_status: 'paid', amount_total: 4900, currency: 'usd', payment_intent: 'pi_1', created: Math.floor(Date.now() / 1000) } } })
		const t = Math.floor(Date.now() / 1000)
		const sig = createHmac('sha256', STRIPE_SECRET).update(`${t}.${body}`).digest('hex')
		expect((await call(env, 'POST', '/api/webhooks/stripe/shop-com', body, { 'stripe-signature': `t=${t},v1=${sig}` })).status).toBe(200)
		const [visit] = rows(env, 'SELECT session_id FROM sessions')
		expect(rows(env, "SELECT session_id, source FROM events WHERE name = 'Payment'")).toEqual([{ session_id: visit.session_id, source: 'Google' }])
	})
})
