import { createHmac } from 'node:crypto'
import { parsePayments } from '@misomoon/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { invalidate } from '../src/control'
import { acceptBeacon } from '../src/ingest'
import { applyPayment } from '../src/revenue'
import { fakeCtx, fakeEnv, type FakeEnv } from './fake'

vi.mock('@misomoon/tracker/m.min.js', () => ({ default: '/* m.js */' }))
const { default: worker } = await import('../src/index')

const ADMIN = { authorization: 'Bearer ms_owner-session' }
const UA = 'Mozilla/5.0 (Macintosh) Chrome/141.0.0.0 Safari/537.36'
const STRIPE_SECRET = 'whsec_stripeTestSecret123'

async function call(env: FakeEnv, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
	const ctx = fakeCtx()
	const init: RequestInit = { method, headers: { 'content-type': 'application/json', ...headers } }
	if (body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body)
	const res = await worker.fetch(new Request(`https://app.test${path}`, init), env as unknown as Env, ctx as unknown as ExecutionContext)
	await ctx.settle()
	return { res, json: async () => res.json() as Promise<any> }
}

/** A beacon from one browser on shop.com. */
const beacon = (env: FakeEnv, body: Record<string, unknown>, ip = '198.51.100.7') =>
	call(env, 'POST', '/api/event', { s: 'shop-com', u: 'https://shop.com/', ...body }, { 'user-agent': UA, 'cf-connecting-ip': ip })

function stripe(env: FakeEnv, type: string, object: Record<string, unknown>, livemode = true) {
	const body = JSON.stringify({ id: `evt_${Math.random()}`, type, livemode, data: { object: { created: Math.floor(Date.now() / 1000), ...object } } })
	const t = Math.floor(Date.now() / 1000)
	const sig = createHmac('sha256', STRIPE_SECRET).update(`${t}.${body}`).digest('hex')
	return call(env, 'POST', '/api/webhooks/stripe/shop-com', body, { 'stripe-signature': `t=${t},v1=${sig}` })
}

const paid = (id: string, extra: Record<string, unknown> = {}) => ({ id, mode: 'payment', payment_status: 'paid', amount_total: 4900, currency: 'usd', payment_intent: `pi_${id}`, ...extra })
/** rows from both shards: a new site lands on either */
const rows = (env: FakeEnv, sql: string) => [...env.SHARD_0.rows(sql), ...env.SHARD_1.rows(sql)]
const payments = (env: FakeEnv) => rows(env, "SELECT name, visitor_id <> '' AS visitor, source, revenue FROM events WHERE name IN ('Payment', 'Refund') ORDER BY ts, event_id")
const bySource = async (env: FakeEnv) => {
	const body = await (await call(env, 'GET', '/api/v1/stats/breakdown?site=shop-com&period=24h&property=source', undefined, ADMIN)).json()
	if (!body.rows) throw new Error(JSON.stringify(body))
	const { rows } = body
	return Object.fromEntries(rows.filter((r: any) => r.revenue).map((r: any) => [r.key, r.revenue]))
}

async function shop() {
	const env = fakeEnv()
	expect((await call(env, 'POST', '/api/v1/sites', { domain: 'shop.com' }, ADMIN)).res.status).toBe(201)
	expect((await call(env, 'PUT', '/api/v1/sites/shop-com/revenue/stripe', { secret: STRIPE_SECRET }, ADMIN)).res.status).toBe(200)
	return env
}

beforeEach(() => invalidate(''))
afterEach(() => vi.useRealTimers())

describe('revenue settings', () => {
	it('saves a Stripe secret and lists the webhook to paste into Stripe', async () => {
		const env = await shop()
		const list = await (await call(env, 'GET', '/api/v1/sites/shop-com/revenue', undefined, ADMIN)).json()
		expect(list).toEqual({
			sources: [{ provider: 'stripe', webhook_url: 'https://app.test/api/webhooks/stripe/shop-com', created_at: expect.any(Number), last_event_at: null, last_test_at: null, last_error: null }],
			last_30_days: { payments: 0, attributed: 0 },
		})
		expect(JSON.stringify(list)).not.toContain(STRIPE_SECRET)
	})

	it('refuses a Stripe secret that is not one, and makes a Lemon Squeezy secret to show once', async () => {
		const env = await shop()
		const bad = await call(env, 'PUT', '/api/v1/sites/shop-com/revenue/stripe', { secret: 'sk_live_123' }, ADMIN)
		expect([bad.res.status, await bad.json()]).toEqual([400, { error: 'paste the Stripe signing secret, which starts with whsec_' }])
		const lemon = await (await call(env, 'PUT', '/api/v1/sites/shop-com/revenue/lemonsqueezy', {}, ADMIN)).json()
		expect(lemon).toEqual({ provider: 'lemonsqueezy', webhook_url: 'https://app.test/api/webhooks/lemonsqueezy/shop-com', secret: expect.stringMatching(/^[0-9a-f]{48}$/) })
		expect((await call(env, 'PUT', '/api/v1/sites/shop-com/revenue/paypal', {}, ADMIN)).res.status).toBe(404)
	})

	it('takes the secret `polar webhook listen` prints, so a local server can count Polar orders', async () => {
		const env = await shop()
		const secret = '6t3c8ce2247c493a3ade20uea4484d64'
		expect((await call(env, 'PUT', '/api/v1/sites/shop-com/revenue/polar', { secret }, ADMIN)).res.status).toBe(200)
		const body = JSON.stringify({ type: 'order.paid', data: { id: 'ord-local-1', total_amount: 1900, currency: 'usd', billing_reason: 'purchase', customer_id: 'cus-local', metadata: {}, created_at: new Date().toISOString() } })
		const ts = Math.floor(Date.now() / 1000)
		const sig = createHmac('sha256', secret).update(`msg_local.${ts}.${body}`).digest('base64')
		const res = await call(env, 'POST', '/api/webhooks/polar/shop-com', body, { 'webhook-id': 'msg_local', 'webhook-timestamp': String(ts), 'webhook-signature': `v1,${sig}` })
		expect(res.res.status).toBe(200)
		expect(payments(env)).toEqual([{ name: 'Payment', visitor: 0, source: null, revenue: 19 }])
		const bad = await call(env, 'PUT', '/api/v1/sites/shop-com/revenue/polar', { secret: 'polar_oat_123' }, ADMIN)
		expect([bad.res.status, await bad.json()]).toEqual([400, { error: 'paste the Polar signing secret, which starts with whsec_, or the secret polar webhook listen prints' }])
	})

	it('keeps signed-out callers out', async () => {
		const env = await shop()
		expect((await call(env, 'GET', '/api/v1/sites/shop-com/revenue')).res.status).toBe(401)
	})
})

describe('webhooks', () => {
	it('refuses a bad signature and remembers why', async () => {
		const env = await shop()
		const res = await call(env, 'POST', '/api/webhooks/stripe/shop-com', '{}', { 'stripe-signature': 't=1,v1=00' })
		expect(res.res.status).toBe(401)
		const { sources } = await (await call(env, 'GET', '/api/v1/sites/shop-com/revenue', undefined, ADMIN)).json()
		expect(sources[0].last_error).toBe('A webhook arrived with a signature that does not match the saved secret.')
		expect((await call(env, 'POST', '/api/webhooks/polar/shop-com', '{}')).res.status).toBe(404)
	})

	it('counts a payment once, however often Stripe retries it', async () => {
		const env = await shop()
		const first = await (await stripe(env, 'checkout.session.completed', paid('cs_live_1'))).json()
		const again = await (await stripe(env, 'checkout.session.completed', paid('cs_live_1'))).json()
		expect([first, again]).toEqual([
			{ ok: true, counted: 1 },
			{ ok: true, counted: 0 },
		])
		expect(payments(env)).toEqual([{ name: 'Payment', visitor: 0, source: null, revenue: 49 }])
	})

	it('verifies test-mode events but leaves their money out', async () => {
		const env = await shop()
		expect(await (await stripe(env, 'checkout.session.completed', paid('cs_test_1'), false)).json()).toEqual({ ok: true, test: true, counted: 0 })
		expect(payments(env)).toEqual([])
		const { sources } = await (await call(env, 'GET', '/api/v1/sites/shop-com/revenue', undefined, ADMIN)).json()
		expect([sources[0].last_test_at > 0, sources[0].last_event_at]).toEqual([true, null])
	})
})

describe('crediting payments to visits, without cookies', () => {
	it('credits a checkout to the visit that handed out its ref', async () => {
		const env = await shop()
		await beacon(env, { n: 'pageview', r: 'https://news.ycombinator.com/item?id=1' })
		await beacon(env, { n: 'engagement', u: 'https://shop.com/pricing', e: 0, k: 'ref_abc123xyz' })
		await stripe(env, 'checkout.session.completed', paid('cs_live_1', { metadata: { misomoon_ref: 'ref_abc123xyz' } }))
		expect(payments(env)).toEqual([{ name: 'Payment', visitor: 1, source: 'Hacker News', revenue: 49 }])
		expect(await bySource(env)).toEqual({ 'Hacker News': 49 })
		// the ref-only beacon is not an event of the visit
		expect(rows(env, "SELECT 1 FROM events WHERE name = 'engagement'")).toEqual([])
	})

	it('credits a payment that arrived before the success page named its checkout', async () => {
		const env = await shop()
		await beacon(env, { n: 'pageview', r: 'https://www.google.com/' })
		await stripe(env, 'checkout.session.completed', paid('cs_live_2'))
		expect(payments(env)).toEqual([{ name: 'Payment', visitor: 0, source: null, revenue: 49 }])
		await beacon(env, { n: 'pageview', u: 'https://shop.com/thanks?session_id=cs_live_2', k: 'cs_live_2' })
		expect(payments(env)).toEqual([{ name: 'Payment', visitor: 1, source: 'Google', revenue: 49 }])
	})

	it("reads the checkout id from the success page's URL, which m.js sends as is", async () => {
		// payments is on by default
		const env = await shop()
		await beacon(env, { n: 'pageview', r: 'https://www.google.com/' })
		await stripe(env, 'checkout.session.completed', paid('cs_live_9'))
		await beacon(env, { w: 1440, u: 'https://shop.com/thanks?session_id=cs_live_9' })
		expect(payments(env)).toEqual([{ name: 'Payment', visitor: 1, source: 'Google', revenue: 49 }])
	})

	it('ticks payments when a site that turned it off connects a provider', async () => {
		const env = fakeEnv()
		await call(env, 'POST', '/api/v1/sites', { domain: 'shop.com' }, ADMIN)
		await call(env, 'PATCH', '/api/v1/sites/shop-com', { features: ['outbound', 'search'] }, ADMIN)
		await call(env, 'PUT', '/api/v1/sites/shop-com/revenue/stripe', { secret: STRIPE_SECRET }, ADMIN)
		expect((await (await call(env, 'GET', '/api/v1/sites/shop-com', undefined, ADMIN)).json()).features).toBe('outbound,payments,search')
	})

	it('follows a subscription: invoices before the session, the ref last, then a renewal months later', async () => {
		const env = await shop()
		const sub = { parent: { subscription_details: { subscription: 'sub_1' } }, customer: 'cus_1', currency: 'usd', amount_paid: 1500 }
		await beacon(env, { n: 'pageview', r: 'https://twitter.com/' })
		await stripe(env, 'invoice.paid', { id: 'in_1', billing_reason: 'subscription_create', ...sub })
		await stripe(env, 'checkout.session.completed', { id: 'cs_live_3', mode: 'subscription', subscription: 'sub_1', customer: 'cus_1', client_reference_id: 'link_ref_123' })
		expect(payments(env)).toEqual([{ name: 'Payment', visitor: 0, source: null, revenue: 15 }])
		// the tracker tagged the payment link with this ref when it was clicked
		await beacon(env, { n: 'engagement', e: 0, k: 'link_ref_123' })
		expect(payments(env)).toEqual([{ name: 'Payment', visitor: 1, source: 'X', revenue: 15 }])
		vi.useFakeTimers({ now: Date.now() + 35 * 86400000, toFake: ['Date'] })
		await stripe(env, 'invoice.paid', { id: 'in_2', billing_reason: 'subscription_cycle', ...sub })
		const renewal = rows(env, "SELECT visitor_id, source, revenue, props FROM events WHERE event_id = '$stripe:shop-com:in_2'")
		expect(renewal).toEqual([{ visitor_id: '', source: 'X', revenue: 15, props: '{"provider":"stripe","billing":"renewal"}' }])
	})

	it('takes a refund off the source that earned the payment', async () => {
		const env = await shop()
		await beacon(env, { n: 'pageview', r: 'https://news.ycombinator.com/' })
		await beacon(env, { n: 'engagement', e: 0, k: 'ref_abc123xyz' })
		await stripe(env, 'checkout.session.completed', paid('cs_live_4', { metadata: { misomoon_ref: 'ref_abc123xyz' } }))
		await stripe(env, 'refund.created', { id: 're_1', amount: 900, currency: 'usd', status: 'succeeded', payment_intent: 'pi_cs_live_4' })
		expect(payments(env)).toEqual([
			{ name: 'Payment', visitor: 1, source: 'Hacker News', revenue: 49 },
			{ name: 'Refund', visitor: 1, source: 'Hacker News', revenue: -9 },
		])
		expect(await bySource(env)).toEqual({ 'Hacker News': 40 })
	})

	it('reads Lemon Squeezy refunds as the change in the refunded total', async () => {
		const env = await shop()
		const { secret } = await (await call(env, 'PUT', '/api/v1/sites/shop-com/revenue/lemonsqueezy', {}, ADMIN)).json()
		const lemon = (event_name: string, attributes: Record<string, unknown>) => {
			const body = JSON.stringify({ meta: { event_name }, data: { id: '123', attributes: { currency: 'USD', customer_id: 9, created_at: new Date().toISOString(), refunded_at: new Date().toISOString(), ...attributes } } })
			return call(env, 'POST', '/api/webhooks/lemonsqueezy/shop-com', body, { 'x-signature': createHmac('sha256', secret).update(body).digest('hex') })
		}
		await lemon('order_created', { status: 'paid', total: 2000 })
		await lemon('order_refunded', { refunded_amount: 500 })
		await lemon('order_refunded', { refunded_amount: 500 })
		await lemon('order_refunded', { refunded_amount: 800 })
		expect(payments(env).map((p: any) => p.revenue)).toEqual([20, -5, -3])
	})

	it('stores no keys for a site that takes no payments', async () => {
		const env = fakeEnv()
		await call(env, 'POST', '/api/v1/sites', { domain: 'shop.com' }, ADMIN)
		await beacon(env, { n: 'pageview' })
		await beacon(env, { n: 'engagement', e: 0, k: 'ref_abc123xyz' })
		expect(env.CONTROL.rows('SELECT COUNT(*) AS n FROM attribution')).toEqual([{ n: 0 }])
	})

	it('forgets payments and keys with the site', async () => {
		const env = await shop()
		await beacon(env, { n: 'engagement', e: 0, k: 'ref_abc123xyz' })
		await stripe(env, 'checkout.session.completed', paid('cs_live_5'))
		expect((await call(env, 'DELETE', '/api/v1/sites/shop-com', undefined, ADMIN)).res.status).toBe(204)
		const left = env.CONTROL.rows('SELECT (SELECT COUNT(*) FROM payments) + (SELECT COUNT(*) FROM payment_keys) + (SELECT COUNT(*) FROM attribution) + (SELECT COUNT(*) FROM revenue_sources) AS n')
		expect(left).toEqual([{ n: 0 }])
	})

	it('keeps the payment keys of pages the path rules leave out, and nothing else of them', async () => {
		const env = await shop()
		await call(env, 'PATCH', '/api/v1/sites/shop-com', { exclude_paths: ['/pricing', '/thanks'] }, ADMIN)
		await beacon(env, { n: 'pageview', u: 'https://shop.com/', r: 'https://news.ycombinator.com/item?id=1' })
		await beacon(env, { e: 0, u: 'https://shop.com/pricing', k: 'ref_abc123xyz' })
		await stripe(env, 'checkout.session.completed', paid('cs_live_1', { metadata: { misomoon_ref: 'ref_abc123xyz' } }))
		await stripe(env, 'checkout.session.completed', paid('cs_live_2'))
		await beacon(env, { w: 1440, u: 'https://shop.com/thanks?session_id=cs_live_2' })
		expect(payments(env).map((p) => p.source)).toEqual(['Hacker News', 'Hacker News'])
		expect(rows(env, "SELECT pathname FROM events WHERE name IN ('pageview', 'engagement')")).toEqual([{ pathname: '/' }])
	})
})

// ---------------------------------------------------------------- order, retries and load

const HN_IP = '198.51.100.7'
const GOOGLE_IP = '203.0.113.9'
const visit = (env: FakeEnv, referrer: string, ip: string) => beacon(env, { n: 'pageview', r: referrer }, ip)
/** what m.js sends when it hands out a ref: on a payment-link click, or misomoon.ref() */
const ref = (env: FakeEnv, key: string, ip: string) => beacon(env, { n: 'engagement', u: 'https://shop.com/pricing', e: 0, k: key }, ip)
/** the Stripe success page, which names its Checkout Session */
const success = (env: FakeEnv, cs: string, ip: string) => beacon(env, { n: 'pageview', u: `https://shop.com/thanks?session_id=${cs}`, k: cs }, ip)

async function ownServer(env: FakeEnv) {
	const { secret } = await (await call(env, 'PUT', '/api/v1/sites/shop-com/revenue/custom', {}, ADMIN)).json()
	return async (body: Record<string, unknown>) => (await call(env, 'POST', '/api/webhooks/custom/shop-com', body, { authorization: `Bearer ${secret}` })).json()
}

const ISO = new Date().toISOString()
const lemonBody = (event_name: string, attributes: Record<string, unknown>) =>
	JSON.stringify({ meta: { event_name }, data: { id: '123', attributes: { currency: 'USD', customer_id: 9, created_at: ISO, refunded_at: ISO, ...attributes } } })

describe('a payment ends up with its strongest key, whatever order things arrive in', () => {
	it('credits a returning buyer to the ref of this purchase, even when the webhook beats the ref beacon', async () => {
		const env = await shop()
		const post = await ownServer(env)
		await visit(env, 'https://news.ycombinator.com/', HN_IP)
		await ref(env, 'ref_first_visit', HN_IP)
		expect(await post({ id: 'order_1', amount: 49, currency: 'USD', ref: 'ref_first_visit', customer: 'cus_9' })).toEqual({ ok: true, counted: 1 })
		await visit(env, 'https://www.google.com/', GOOGLE_IP)
		// the second checkout's webhook lands before the queue delivers its ref
		expect(await post({ id: 'order_2', amount: 19, currency: 'USD', ref: 'ref_second_visit', customer: 'cus_9' })).toEqual({ ok: true, counted: 1 })
		await ref(env, 'ref_second_visit', GOOGLE_IP)
		expect(payments(env)).toEqual([
			{ name: 'Payment', visitor: 1, source: 'Hacker News', revenue: 49 },
			{ name: 'Payment', visitor: 1, source: 'Google', revenue: 19 },
		])
		expect(await bySource(env)).toEqual({ 'Hacker News': 49, Google: 19 })
	})

	it('keeps the ref when its beacon is handled while the webhook is still crediting the customer', async () => {
		const env = await shop()
		const post = await ownServer(env)
		await visit(env, 'https://news.ycombinator.com/', HN_IP)
		await ref(env, 'ref_first_visit', HN_IP)
		await post({ id: 'order_1', amount: 49, currency: 'USD', ref: 'ref_first_visit', customer: 'cus_9' })
		await visit(env, 'https://www.google.com/', GOOGLE_IP)
		// the webhook finds only the customer's old visit; before it writes that, the ref beacon is handled
		const batch = env.CONTROL.batch.bind(env.CONTROL)
		let raced = false
		env.CONTROL.batch = async (stmts) => {
			if (!raced && stmts.some((s) => s.sql.startsWith('UPDATE payments SET attributed_by'))) {
				raced = true
				await ref(env, 'ref_second_visit', GOOGLE_IP)
			}
			return batch(stmts)
		}
		await post({ id: 'order_2', amount: 19, currency: 'USD', ref: 'ref_second_visit', customer: 'cus_9' })
		expect(raced).toBe(true)
		expect(env.CONTROL.rows("SELECT id, attributed_by FROM payments WHERE id = 'order_2'")).toEqual([{ id: 'order_2', attributed_by: 'ref_second_visit' }])
		expect(payments(env)).toEqual([
			{ name: 'Payment', visitor: 1, source: 'Hacker News', revenue: 49 },
			{ name: 'Payment', visitor: 1, source: 'Google', revenue: 19 },
		])
	})

	it('keeps crediting a customer to their first visit when a later payment carries nothing else', async () => {
		const env = await shop()
		const post = await ownServer(env)
		await visit(env, 'https://news.ycombinator.com/', HN_IP)
		await ref(env, 'ref_first_visit', HN_IP)
		await post({ id: 'order_1', amount: 49, currency: 'USD', ref: 'ref_first_visit', customer: 'cus_9' })
		await visit(env, 'https://www.google.com/', GOOGLE_IP)
		await post({ id: 'order_2', amount: 19, currency: 'USD', ref: 'ref_second_visit', customer: 'cus_9' })
		await ref(env, 'ref_second_visit', GOOGLE_IP)
		// no ref: the customer is all it has, and the customer came from Hacker News
		await post({ id: 'order_3', amount: 5, currency: 'USD', customer: 'cus_9' })
		expect(await bySource(env)).toEqual({ 'Hacker News': 54, Google: 19 })
	})

	it('moves a refund with its payment when the payment moves to a stronger key', async () => {
		const env = await shop()
		const post = await ownServer(env)
		await visit(env, 'https://news.ycombinator.com/', HN_IP)
		await ref(env, 'ref_first_visit', HN_IP)
		await post({ id: 'order_1', amount: 70, currency: 'USD', ref: 'ref_first_visit', customer: 'cus_5' })
		await visit(env, 'https://www.google.com/', GOOGLE_IP)
		await post({ id: 'order_2', amount: 30, currency: 'USD', ref: 'ref_second_visit', customer: 'cus_5' })
		// refunded before the ref arrives: credited through order_2, which is still on the old visit
		await post({ type: 'refund', id: 'refund_2', amount: 12.5, currency: 'USD', refund_of: 'order_2' })
		await ref(env, 'ref_second_visit', GOOGLE_IP)
		// 30 - 12.50
		expect(await bySource(env)).toEqual({ 'Hacker News': 70, Google: 17.5 })
	})

	it("gives the customer to their earliest visit even when a later purchase was credited first", async () => {
		const start = Date.now()
		const at = (minutes: number) => vi.setSystemTime(start + minutes * 60_000)
		vi.useFakeTimers({ now: start, toFake: ['Date'] })
		const env = await shop()
		const post = await ownServer(env)
		await visit(env, 'https://news.ycombinator.com/', HN_IP)
		// the edge stamps a beacon when it takes it, so a ref stuck in the queue keeps its click time
		const clicked = start + 60_000
		at(2)
		await post({ id: 'order_1', amount: 49, currency: 'USD', ref: 'ref_first_visit', customer: 'cus_9' })
		at(3)
		await visit(env, 'https://www.google.com/', GOOGLE_IP)
		await ref(env, 'ref_second_visit', GOOGLE_IP)
		at(4)
		await post({ id: 'order_2', amount: 19, currency: 'USD', ref: 'ref_second_visit', customer: 'cus_9' })
		await post({ id: 'order_3', amount: 5, currency: 'USD', customer: 'cus_9' })
		// the first visit's ref turns up last: the customer, and order_3 with it, go back to Hacker News
		at(4.5)
		await beacon(env, { n: 'engagement', u: 'https://shop.com/pricing', e: 0, k: 'ref_first_visit', ts: clicked }, HN_IP)
		// 49 + 5, and 19
		expect(await bySource(env)).toEqual({ 'Hacker News': 54, Google: 19 })
	})

	it("moves a returning customer's subscription off their old visit when its checkout turns up, renewals included", async () => {
		const env = await shop()
		await visit(env, 'https://news.ycombinator.com/', HN_IP)
		await ref(env, 'ref_first_visit', HN_IP)
		await stripe(env, 'checkout.session.completed', paid('cs_live_a', { customer: 'cus_9', metadata: { misomoon_ref: 'ref_first_visit' } }))
		await visit(env, 'https://twitter.com/', GOOGLE_IP)
		// m.js tagged the subscription's payment link with this ref when it was clicked
		await ref(env, 'ref_sub_link', GOOGLE_IP)
		const sub = { parent: { subscription_details: { subscription: 'sub_9' } }, customer: 'cus_9', currency: 'usd', amount_paid: 1500 }
		// Stripe sends the first invoice before the session that created the subscription
		await stripe(env, 'invoice.paid', { id: 'in_1', billing_reason: 'subscription_create', ...sub })
		await stripe(env, 'checkout.session.completed', { id: 'cs_live_s', mode: 'subscription', subscription: 'sub_9', invoice: 'in_1', customer: 'cus_9', client_reference_id: 'ref_sub_link' })
		expect(payments(env)).toEqual([
			{ name: 'Payment', visitor: 1, source: 'Hacker News', revenue: 49 },
			{ name: 'Payment', visitor: 1, source: 'X', revenue: 15 },
		])
		vi.useFakeTimers({ now: Date.now() + 35 * 86400000, toFake: ['Date'] })
		await stripe(env, 'invoice.paid', { id: 'in_2', billing_reason: 'subscription_cycle', ...sub })
		expect(rows(env, "SELECT visitor_id, source, revenue FROM events WHERE event_id = '$stripe:shop-com:in_2'")).toEqual([{ visitor_id: '', source: 'X', revenue: 15 }])
	})

	// visit A (Hacker News) hands out the ref; visit B (Google, another browser) opens the success page
	const steps = {
		ref: (env: FakeEnv) => ref(env, 'ref_visit_a', HN_IP),
		success: (env: FakeEnv) => success(env, 'cs_live_p', GOOGLE_IP),
		webhook: (env: FakeEnv) => stripe(env, 'checkout.session.completed', paid('cs_live_p', { metadata: { misomoon_ref: 'ref_visit_a' } })),
	}
	it.each([
		['ref', 'success', 'webhook'],
		['ref', 'webhook', 'success'],
		['success', 'ref', 'webhook'],
		['success', 'webhook', 'ref'],
		['webhook', 'ref', 'success'],
		['webhook', 'success', 'ref'],
	] as const)('credits the ref over the success page when they arrive as %s, %s, %s', async (...order) => {
		const env = await shop()
		await visit(env, 'https://news.ycombinator.com/', HN_IP)
		await visit(env, 'https://www.google.com/', GOOGLE_IP)
		for (const step of order) await steps[step](env)
		expect(payments(env)).toEqual([{ name: 'Payment', visitor: 1, source: 'Hacker News', revenue: 49 }])
		expect(env.CONTROL.rows('SELECT attributed_by FROM payments')).toEqual([{ attributed_by: 'ref_visit_a' }])
	})

	it('gives a checkout id to the first visit that names it', async () => {
		const env = await shop()
		await visit(env, 'https://news.ycombinator.com/', HN_IP)
		await success(env, 'cs_live_7', HN_IP)
		await visit(env, 'https://www.google.com/', GOOGLE_IP)
		await success(env, 'cs_live_7', GOOGLE_IP)
		await stripe(env, 'checkout.session.completed', paid('cs_live_7'))
		expect(payments(env)).toEqual([{ name: 'Payment', visitor: 1, source: 'Hacker News', revenue: 49 }])
	})

	it('credits a payment and its refund that both arrived before the ref', async () => {
		const env = await shop()
		await visit(env, 'https://news.ycombinator.com/', HN_IP)
		await stripe(env, 'checkout.session.completed', paid('cs_live_8', { metadata: { misomoon_ref: 'ref_late_one' } }))
		await stripe(env, 'refund.created', { id: 're_8', amount: 900, currency: 'usd', status: 'succeeded', payment_intent: 'pi_cs_live_8' })
		await ref(env, 'ref_late_one', HN_IP)
		expect(payments(env)).toEqual([
			{ name: 'Payment', visitor: 1, source: 'Hacker News', revenue: 49 },
			{ name: 'Refund', visitor: 1, source: 'Hacker News', revenue: -9 },
		])
	})

	it("never credits a payment to another site's visit with the same ref", async () => {
		const env = await shop()
		expect((await call(env, 'POST', '/api/v1/sites', { domain: 'other.com' }, ADMIN)).res.status).toBe(201)
		await call(env, 'PUT', '/api/v1/sites/other-com/revenue/stripe', { secret: STRIPE_SECRET }, ADMIN)
		const other = (body: Record<string, unknown>) => call(env, 'POST', '/api/event', { s: 'other-com', u: 'https://other.com/', ...body }, { 'user-agent': UA, 'cf-connecting-ip': HN_IP })
		await other({ n: 'pageview', r: 'https://news.ycombinator.com/' })
		await other({ n: 'engagement', e: 0, k: 'ref_shared_one' })
		await stripe(env, 'checkout.session.completed', paid('cs_live_x', { metadata: { misomoon_ref: 'ref_shared_one' } }))
		expect(payments(env)).toEqual([{ name: 'Payment', visitor: 0, source: null, revenue: 49 }])
	})

	it.each([
		['credits', 30 * 86400000 - 60_000, { visitor: 0, source: 'Hacker News' }],
		['does not credit', 30 * 86400000 + 60_000, { visitor: 0, source: null }],
	])('%s a payment that comes 30 days and a minute either side of its ref', async (_, later, expected) => {
		const start = Date.now()
		vi.useFakeTimers({ now: start, toFake: ['Date'] })
		const env = await shop()
		await visit(env, 'https://news.ycombinator.com/', HN_IP)
		await ref(env, 'ref_month_old', HN_IP)
		vi.setSystemTime(start + later)
		await stripe(env, 'checkout.session.completed', paid('cs_live_m', { metadata: { misomoon_ref: 'ref_month_old' } }))
		// a payment on a later day keeps the source but not the visitor
		expect(payments(env)).toEqual([{ name: 'Payment', ...expected, revenue: 49 }])
	})
})

describe('attribution under load and failure', () => {
	it('records every ref in a full queue batch and credits the payment waiting for the last one', async () => {
		const env = await shop()
		await visit(env, 'https://news.ycombinator.com/', HN_IP)
		await stripe(env, 'checkout.session.completed', paid('cs_live_q', { metadata: { misomoon_ref: 'ref_bulk_099' } }))
		const messages = []
		for (let i = 0; i < 100; i++) {
			const ip = i === 99 ? HN_IP : `192.0.2.${i}`
			const req = new Request('https://app.test/api/event', {
				method: 'POST',
				headers: { 'content-type': 'text/plain', 'user-agent': UA, 'cf-connecting-ip': ip },
				body: JSON.stringify({ s: 'shop-com', n: 'engagement', u: 'https://shop.com/pricing', e: 0, k: `ref_bulk_${String(i).padStart(3, '0')}` }),
			})
			messages.push({ body: (await acceptBeacon(env as unknown as Env, req))! })
		}
		const batch = { messages, ackAll: vi.fn(), retryAll: vi.fn() }
		await worker.queue(batch as unknown as MessageBatch<never>, env as unknown as Env)
		expect([batch.ackAll.mock.calls.length, batch.retryAll.mock.calls.length]).toEqual([1, 0])
		expect(env.CONTROL.rows("SELECT COUNT(*) AS n FROM attribution WHERE key LIKE 'ref_bulk_%'")).toEqual([{ n: 100 }])
		expect(payments(env)).toEqual([{ name: 'Payment', visitor: 1, source: 'Hacker News', revenue: 49 }])
	})

	it("rewrites only the events whose visit changes when a returning customer's payment moves", async () => {
		const env = await shop()
		const post = await ownServer(env)
		await visit(env, 'https://news.ycombinator.com/', HN_IP)
		await ref(env, 'ref_first_visit', HN_IP)
		await post({ id: 'order_0', amount: 10, currency: 'USD', ref: 'ref_first_visit', customer: 'cus_9' })
		for (let i = 1; i <= 8; i++) await post({ id: `order_${i}`, amount: 10, currency: 'USD', customer: 'cus_9' })
		await visit(env, 'https://www.google.com/', GOOGLE_IP)
		await post({ id: 'order_new', amount: 30, currency: 'USD', ref: 'ref_new_visit', customer: 'cus_9' })
		let updates = 0
		for (const db of [env.SHARD_0, env.SHARD_1]) {
			const prepare = db.prepare.bind(db)
			db.prepare = (sql: string) => (sql.startsWith('UPDATE events') && updates++, prepare(sql))
		}
		await ref(env, 'ref_new_visit', GOOGLE_IP)
		// only order_new moves; the nine purchases credited through the customer stay put
		expect(updates).toBe(1)
		expect(await bySource(env)).toEqual({ 'Hacker News': 90, Google: 30 })
	})

	/** order_1's ref is stuck in the queue while order_2 comes from Google, then `extra` orders carry only the customer */
	async function customerMovesLate(extra: number) {
		const start = Date.now()
		const at = (minutes: number) => vi.setSystemTime(start + minutes * 60_000)
		vi.useFakeTimers({ now: start, toFake: ['Date'] })
		const env = await shop()
		const post = await ownServer(env)
		await visit(env, 'https://news.ycombinator.com/', HN_IP)
		at(2)
		await post({ id: 'order_1', amount: 49, currency: 'USD', ref: 'ref_first_visit', customer: 'cus_9' })
		at(3)
		await visit(env, 'https://www.google.com/', GOOGLE_IP)
		await ref(env, 'ref_second_visit', GOOGLE_IP)
		at(4)
		await post({ id: 'order_2', amount: 19, currency: 'USD', ref: 'ref_second_visit', customer: 'cus_9' })
		for (let i = 0; i < extra; i++) await post({ id: `order_x${i}`, amount: 1, currency: 'USD', customer: 'cus_9' })
		at(4.5)
		const req = new Request('https://app.test/api/event', {
			method: 'POST',
			headers: { 'content-type': 'text/plain', 'user-agent': UA, 'cf-connecting-ip': HN_IP },
			body: JSON.stringify({ s: 'shop-com', n: 'engagement', u: 'https://shop.com/pricing', e: 0, k: 'ref_first_visit', ts: start + 60_000 }),
		})
		return { env, messages: [{ body: (await acceptBeacon(env as unknown as Env, req))! }] }
	}
	const deliver = async (env: FakeEnv, messages: unknown[]) => {
		const batch = { messages, ackAll: vi.fn(), retryAll: vi.fn() }
		await worker.queue(batch as unknown as MessageBatch<never>, env as unknown as Env)
		return [batch.ackAll.mock.calls.length, batch.retryAll.mock.calls.length]
	}

	it('moves every order credited through a customer once when the customer moves', async () => {
		const { env, messages } = await customerMovesLate(12)
		let updates = 0
		for (const db of [env.SHARD_0, env.SHARD_1]) {
			const prepare = db.prepare.bind(db)
			db.prepare = (sql: string) => (sql.startsWith('UPDATE events') && updates++, prepare(sql))
		}
		expect(await deliver(env, messages)).toEqual([1, 0])
		// order_1 and the 12 orders, each written once
		expect(updates).toBe(13)
		// 49 + 12 x 1, and order_2's own 19
		expect(await bySource(env)).toEqual({ 'Hacker News': 61, Google: 19 })
	})

	it('writes a refund once when its customer and its payment lead to it in the same pass', async () => {
		const env = await shop()
		const post = await ownServer(env)
		await visit(env, 'https://news.ycombinator.com/', HN_IP)
		await ref(env, 'ref_first_visit', HN_IP)
		// nothing known yet: both wait on cus_4, the refund also on order_1
		await post({ id: 'order_1', amount: 40, currency: 'USD', customer: 'cus_4' })
		await post({ type: 'refund', id: 'refund_1', amount: 10, currency: 'USD', refund_of: 'order_1', customer: 'cus_4' })
		let updates = 0
		for (const db of [env.SHARD_0, env.SHARD_1]) {
			const prepare = db.prepare.bind(db)
			db.prepare = (sql: string) => (sql.startsWith('UPDATE events') && updates++, prepare(sql))
		}
		await post({ id: 'order_2', amount: 25, currency: 'USD', ref: 'ref_first_visit', customer: 'cus_4' })
		// order_2, order_1 and refund_1, each written once
		expect(updates).toBe(3)
		// 40 - 10 + 25
		expect(await bySource(env)).toEqual({ 'Hacker News': 55 })
	})

	it('moves the rest on the queue retry when one key moves more payments than a pass allows', async () => {
		// order_1 and 210 orders must move: more than the 200 one pass may move
		const { env, messages } = await customerMovesLate(210)
		expect(await deliver(env, messages)).toEqual([0, 1])
		expect(await deliver(env, messages)).toEqual([1, 0])
		// 49 + 210 x 1, and 19
		expect(await bySource(env)).toEqual({ 'Hacker News': 259, Google: 19 })
	})

	it('finishes moving a payment and its refund on the queue retry after the refund failed to move', async () => {
		const env = await shop()
		const post = await ownServer(env)
		await visit(env, 'https://news.ycombinator.com/', HN_IP)
		await ref(env, 'ref_first_visit', HN_IP)
		await post({ id: 'order_1', amount: 70, currency: 'USD', ref: 'ref_first_visit', customer: 'cus_5' })
		await visit(env, 'https://www.google.com/', GOOGLE_IP)
		await post({ id: 'order_2', amount: 30, currency: 'USD', ref: 'ref_second_visit', customer: 'cus_5' })
		await post({ type: 'refund', id: 'refund_2', amount: 12.5, currency: 'USD', refund_of: 'order_2' })
		// the ref comes through the queue; moving the refund's event fails the first time
		let failed = false
		for (const db of [env.SHARD_0, env.SHARD_1]) {
			const prepare = db.prepare.bind(db)
			db.prepare = (sql: string) => {
				if (sql.startsWith('UPDATE events') && !failed && db.rows("SELECT 1 FROM events WHERE event_id LIKE '%refund_2'").length) {
					const stmt = prepare(sql)
					return Object.assign(Object.create(Object.getPrototypeOf(stmt)), stmt, {
						bind: (...params: unknown[]) => {
							if (!String(params.at(-1)).endsWith(':refund_2')) return stmt.bind(...params)
							failed = true
							throw new Error('D1_ERROR: Network connection lost.')
						},
					})
				}
				return prepare(sql)
			}
		}
		const req = new Request('https://app.test/api/event', {
			method: 'POST',
			headers: { 'content-type': 'text/plain', 'user-agent': UA, 'cf-connecting-ip': GOOGLE_IP },
			body: JSON.stringify({ s: 'shop-com', n: 'engagement', u: 'https://shop.com/pricing', e: 0, k: 'ref_second_visit' }),
		})
		const messages = [{ body: (await acceptBeacon(env as unknown as Env, req))! }]
		const first = { messages, ackAll: vi.fn(), retryAll: vi.fn() }
		await worker.queue(first as unknown as MessageBatch<never>, env as unknown as Env)
		const retry = { messages, ackAll: vi.fn(), retryAll: vi.fn() }
		await worker.queue(retry as unknown as MessageBatch<never>, env as unknown as Env)
		expect([failed, first.retryAll.mock.calls.length, retry.ackAll.mock.calls.length]).toEqual([true, 1, 1])
		// 30 - 12.50
		expect(await bySource(env)).toEqual({ 'Hacker News': 70, Google: 17.5 })
	})

	it('keeps the same order id on two sites that share a shard', async () => {
		const env = fakeEnv()
		// one shard, so both sites write to it
		delete (env as Partial<FakeEnv>).SHARD_1
		for (const domain of ['shop.com', 'other.com']) expect((await call(env, 'POST', '/api/v1/sites', { domain }, ADMIN)).res.status).toBe(201)
		const counted = []
		for (const [site, amount] of [['shop-com', 49], ['other-com', 99]] as const) {
			const { secret } = await (await call(env, 'PUT', `/api/v1/sites/${site}/revenue/custom`, {}, ADMIN)).json()
			counted.push(await (await call(env, 'POST', `/api/webhooks/custom/${site}`, { id: '1001', amount, currency: 'USD' }, { authorization: `Bearer ${secret}` })).json())
		}
		expect(counted).toEqual([
			{ ok: true, counted: 1 },
			{ ok: true, counted: 1 },
		])
		expect(env.SHARD_0.rows("SELECT site_id, revenue FROM events WHERE name = 'Payment' ORDER BY site_id")).toEqual([
			{ site_id: 'other-com', revenue: 99 },
			{ site_id: 'shop-com', revenue: 49 },
		])
	})

	it('counts a webhook once, with its visit, when the first delivery failed on the shard and Stripe retried', async () => {
		const env = await shop()
		await visit(env, 'https://news.ycombinator.com/', HN_IP)
		await ref(env, 'ref_retried_1', HN_IP)
		const down = new Error('D1_ERROR: Network connection lost.')
		env.SHARD_0.broken = env.SHARD_1.broken = down
		const first = await stripe(env, 'checkout.session.completed', paid('cs_live_r', { metadata: { misomoon_ref: 'ref_retried_1' } }))
		expect([first.res.status, await first.json()]).toEqual([500, { error: 'internal error' }])
		env.SHARD_0.broken = env.SHARD_1.broken = null
		expect(await (await stripe(env, 'checkout.session.completed', paid('cs_live_r', { metadata: { misomoon_ref: 'ref_retried_1' } }))).json()).toEqual({ ok: true, counted: 1 })
		expect(payments(env)).toEqual([{ name: 'Payment', visitor: 1, source: 'Hacker News', revenue: 49 }])
		expect(await bySource(env)).toEqual({ 'Hacker News': 49 })
	})

	it('credits a payment on the retry when its last step failed and the ref arrived in between', async () => {
		const env = await shop()
		await visit(env, 'https://news.ycombinator.com/', HN_IP)
		// the event is written, then saving the keys it waits for fails
		const batch = env.CONTROL.batch.bind(env.CONTROL)
		let failNext = true
		env.CONTROL.batch = async (stmts) => {
			if (!failNext) return batch(stmts)
			failNext = false
			throw new Error('D1_ERROR: Network connection lost.')
		}
		const first = await stripe(env, 'checkout.session.completed', paid('cs_live_f', { metadata: { misomoon_ref: 'ref_between_1' } }))
		expect(first.res.status).toBe(500)
		await ref(env, 'ref_between_1', HN_IP)
		expect(payments(env)).toEqual([{ name: 'Payment', visitor: 0, source: null, revenue: 49 }])
		// the event was already written, so the retry counts nothing new but credits it
		expect(await (await stripe(env, 'checkout.session.completed', paid('cs_live_f', { metadata: { misomoon_ref: 'ref_between_1' } }))).json()).toEqual({ ok: true, counted: 0 })
		expect(payments(env)).toEqual([{ name: 'Payment', visitor: 1, source: 'Hacker News', revenue: 49 }])
		expect(env.CONTROL.rows('SELECT attributed_by FROM payments')).toEqual([{ attributed_by: 'ref_between_1' }])
	})

	it('takes off exactly the refunded total when two Lemon Squeezy refunds are handled at once', async () => {
		const env = await shop()
		const apply = (event: string, attributes: Record<string, unknown>) =>
			Promise.all(parsePayments('lemonsqueezy', JSON.parse(lemonBody(event, attributes))).payments.map((p) => applyPayment(env as unknown as Env, 'shop-com', p)))
		await apply('order_created', { status: 'paid', total: 2000 })
		// refunded totals of 5.00 and then 8.00: together 8.00 comes off, not 13.00
		await Promise.all([apply('order_refunded', { refunded_amount: 500 }), apply('order_refunded', { refunded_amount: 800 })])
		expect(payments(env).map((p: any) => p.revenue)).toEqual([20, -5, -3])
		expect(env.CONTROL.rows("SELECT SUM(amount) AS net FROM payments WHERE provider = 'lemonsqueezy'")).toEqual([{ net: 12 }])
	})

	it('takes off the refunded total once when Lemon Squeezy delivers the later refund first', async () => {
		const env = await shop()
		const { secret } = await (await call(env, 'PUT', '/api/v1/sites/shop-com/revenue/lemonsqueezy', {}, ADMIN)).json()
		const lemon = (event: string, attributes: Record<string, unknown>) => {
			const body = lemonBody(event, attributes)
			return call(env, 'POST', '/api/webhooks/lemonsqueezy/shop-com', body, { 'x-signature': createHmac('sha256', secret).update(body).digest('hex') })
		}
		await lemon('order_created', { status: 'paid', total: 2000 })
		await lemon('order_refunded', { refunded_amount: 800 })
		expect(await (await lemon('order_refunded', { refunded_amount: 500 })).json()).toEqual({ ok: true, counted: 0 })
		expect(payments(env).map((p: any) => p.revenue)).toEqual([20, -8])
	})
})
