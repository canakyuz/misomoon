// Paying for misomoon Cloud through Polar: the checkout and plan switch, the customer
// portal, and the subscription webhooks that set a team's plan. Polar itself is a mocked
// fetch; nothing here reaches polar.sh.
import { createHash, createHmac, randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { invalidate } from '../src/control'
import { fakeCtx, fakeEnv, OWNER, type FakeEnv } from './fake'

vi.mock('@misomoon/tracker/m.min.js', () => ({ default: '/* m.js */' }))
const { default: worker } = await import('../src/index')

const SECRET = `whsec_${randomBytes(24).toString('base64')}`
const PRODUCTS = { starter: 'prod-starter', growth: 'prod-growth', scale: 'prod-scale' }
const POLAR = {
	POLAR_ACCESS_TOKEN: 'polar_oat_test',
	POLAR_WEBHOOK_SECRET: SECRET,
	POLAR_PRODUCT_STARTER: PRODUCTS.starter,
	POLAR_PRODUCT_GROWTH: PRODUCTS.growth,
	POLAR_PRODUCT_SCALE: PRODUCTS.scale,
}
const CLOUD = { PLANS: 'on', RETENTION_DAYS: '1825', RETENTION_DEFAULT_DAYS: '761' }
type Env2 = FakeEnv & Record<string, unknown>
const billingEnv = (over: Record<string, unknown> = {}): Env2 => ({ ...fakeEnv(CLOUD), ...POLAR, ...over })

async function call(env: Env2, method: string, path: string, body?: unknown, headers: Record<string, string> = OWNER) {
	const ctx = fakeCtx()
	const init: RequestInit = { method, headers: { 'content-type': 'application/json', ...headers } }
	if (body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body)
	const res = await worker.fetch(new Request(`https://app.test${path}`, init), env as unknown as Env, ctx as unknown as ExecutionContext)
	await ctx.settle()
	return { status: res.status, body: (res.status === 204 ? null : await res.json()) as any }
}

const team = (env: Env2, id = 't1') =>
	env.CONTROL.rows('SELECT plan, plan_status, plan_period_end, polar_customer_id, polar_subscription_id FROM teams WHERE id = ?', id)[0] as {
		plan: string | null
		plan_status: string | null
		plan_period_end: number | null
		polar_customer_id: string | null
		polar_subscription_id: string | null
	}
const setPlan = (env: Env2, id: string, plan: string | null) => env.CONTROL.db.prepare('UPDATE teams SET plan = ? WHERE id = ?').run(plan, id)

/** Someone signed in with `role` on team t1, or on no team. */
function person(env: Env2, id: string, role: string | null) {
	const token = `ms_${id}-session`
	env.CONTROL.db.prepare("INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, 'x', 0)").run(id, `${id}@test`, id)
	env.CONTROL.db.prepare('INSERT INTO sessions (hash, user_id, expires_at, created_at) VALUES (?, ?, 9e15, 0)').run(createHash('sha256').update(token).digest('hex'), id)
	if (role) env.CONTROL.db.prepare("INSERT INTO team_members (team_id, user_id, role, created_at) VALUES ('t1', ?, ?, 0)").run(id, role)
	return { authorization: `Bearer ${token}` }
}

// ---------------------------------------------------------------- Polar's side

const T0 = '2026-10-01T00:00:00.000000Z'
const PERIOD_END = '2026-11-01T00:00:00.000000Z'

/** A Polar Subscription as the 2026-10 API sends it, trimmed to what matters here. */
function subscription(over: Record<string, unknown> = {}) {
	return {
		id: 'sub-1',
		created_at: T0,
		modified_at: '2026-10-01T00:00:01.000000Z',
		status: 'active',
		amount: 500,
		currency: 'usd',
		recurring_interval: 'month',
		current_period_start: T0,
		current_period_end: PERIOD_END,
		cancel_at_period_end: false,
		canceled_at: null,
		started_at: T0,
		ends_at: null,
		ended_at: null,
		customer_id: 'cus-1',
		product_id: PRODUCTS.starter,
		metadata: { team_id: 't1' },
		customer: { id: 'cus-1', email: 'owner@test', external_id: null },
		pending_update: null,
		...over,
	}
}

let delivery = 0
/** Signs like Polar (Standard Webhooks: HMAC-SHA256 over `id.timestamp.body` with the base64 key). */
function sign(secret: string, id: string, ts: number, body: string) {
	return createHmac('sha256', Buffer.from(secret.replace(/^whsec_/, ''), 'base64')).update(`${id}.${ts}.${body}`).digest('base64')
}

async function deliver(env: Env2, type: string, data: unknown, opts: { id?: string; secret?: string; ts?: number; signature?: string } = {}) {
	const body = JSON.stringify({ type, timestamp: new Date().toISOString(), api_version: '2026-10', data })
	const id = opts.id ?? `msg-${++delivery}`
	const ts = opts.ts ?? Math.floor(Date.now() / 1000)
	const signature = opts.signature ?? `v1,${sign(opts.secret ?? SECRET, id, ts, body)}`
	return call(env, 'POST', '/api/billing/polar/webhook', body, { 'webhook-id': id, 'webhook-timestamp': String(ts), 'webhook-signature': signature })
}

interface Sent {
	method: string
	url: string
	headers: Headers
	body: any
}

/** Polar's API as a mocked fetch: `answer` gets each request and returns [status, body]. */
function polar(answer: (req: Sent) => [number, unknown]) {
	const sent: Sent[] = []
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const req: Sent = { method: init?.method ?? 'GET', url: String(input), headers: new Headers(init?.headers), body: init?.body ? JSON.parse(String(init.body)) : undefined }
		sent.push(req)
		const [status, body] = answer(req)
		return Response.json(body, { status })
	})
	return sent
}

beforeEach(() => {
	invalidate('')
	delivery = 0
	vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

// ---------------------------------------------------------------- the webhook

describe('the Polar webhook: signatures', () => {
	it('takes a webhook signed with the endpoint secret', async () => {
		const env = billingEnv()
		expect(await deliver(env, 'subscription.created', subscription())).toEqual({ status: 200, body: { ok: true } })
		expect(team(env).plan).toBe('starter')
	})

	it('also takes the key of a Polar secret made before 8 September 2026: the secret string itself', async () => {
		const env = billingEnv()
		const body = JSON.stringify({ type: 'subscription.created', timestamp: T0, data: subscription() })
		const ts = Math.floor(Date.now() / 1000)
		const signature = createHmac('sha256', SECRET).update(`msg-old.${ts}.${body}`).digest('base64')
		const res = await call(env, 'POST', '/api/billing/polar/webhook', body, { 'webhook-id': 'msg-old', 'webhook-timestamp': String(ts), 'webhook-signature': `v1,${signature}` })
		expect(res.status).toBe(200)
		expect(team(env).plan).toBe('starter')
	})

	it('refuses a webhook signed with another secret, and changes nothing', async () => {
		const env = billingEnv()
		const res = await deliver(env, 'subscription.created', subscription(), { secret: `whsec_${randomBytes(24).toString('base64')}` })
		expect(res).toEqual({ status: 401, body: { error: 'the signature does not match' } })
		expect(team(env)).toMatchObject({ plan: null, plan_status: null, polar_subscription_id: null })
		expect((await deliver(env, 'subscription.created', subscription(), { signature: 'v1,bm9wZQ==' })).status).toBe(401)
	})

	it('refuses a timestamp more than 5 minutes old, even with a valid signature', async () => {
		const env = billingEnv()
		const res = await deliver(env, 'subscription.created', subscription(), { ts: Math.floor(Date.now() / 1000) - 6 * 60 })
		expect(res.status).toBe(401)
		expect(team(env).plan).toBeNull()
	})

	it('handles a webhook-id once: a second delivery answers duplicate and changes nothing', async () => {
		const env = billingEnv()
		expect((await deliver(env, 'subscription.created', subscription(), { id: 'msg-same' })).body).toEqual({ ok: true })
		const replay = await deliver(env, 'subscription.updated', subscription({ product_id: PRODUCTS.scale, modified_at: '2026-10-02T00:00:00.000000Z' }), { id: 'msg-same' })
		expect(replay).toEqual({ status: 200, body: { ok: true, duplicate: true } })
		expect(team(env).plan).toBe('starter')
		expect(env.CONTROL.rows('SELECT id FROM polar_webhooks')).toEqual([{ id: 'msg-same' }])
	})

	it('forgets webhook ids after 30 days', async () => {
		const env = billingEnv()
		env.CONTROL.db.prepare('INSERT INTO polar_webhooks (id, received_at) VALUES (?, ?)').run('msg-ancient', Date.now() - 31 * 86_400_000)
		await deliver(env, 'subscription.created', subscription())
		expect(env.CONTROL.rows('SELECT id FROM polar_webhooks')).toEqual([{ id: 'msg-1' }])
	})

	it('answers 400 for a signed body that is not JSON, and 413 for one over 256 KB', async () => {
		const env = billingEnv()
		const ts = Math.floor(Date.now() / 1000)
		const bad = await call(env, 'POST', '/api/billing/polar/webhook', 'not json', { 'webhook-id': 'm', 'webhook-timestamp': String(ts), 'webhook-signature': `v1,${sign(SECRET, 'm', ts, 'not json')}` })
		expect(bad).toEqual({ status: 400, body: { error: 'the body is not JSON' } })
		const big = 'x'.repeat(257 * 1024)
		expect((await call(env, 'POST', '/api/billing/polar/webhook', big, { 'webhook-id': 'm2', 'webhook-timestamp': String(ts), 'webhook-signature': 'v1,x' })).status).toBe(413)
	})
})

describe('the Polar webhook: what each event does to the team', () => {
	it('subscription.created and subscription.active set the plan from the product, with the period, the customer and the subscription', async () => {
		const env = billingEnv()
		await deliver(env, 'subscription.created', subscription({ status: 'incomplete' }))
		expect(team(env)).toMatchObject({ plan: null, plan_status: null, polar_subscription_id: null, polar_customer_id: 'cus-1' })
		await deliver(env, 'subscription.active', subscription({ modified_at: '2026-10-01T00:00:02.000000Z' }))
		expect(team(env)).toEqual({ plan: 'starter', plan_status: 'active', plan_period_end: Date.parse(PERIOD_END), polar_customer_id: 'cus-1', polar_subscription_id: 'sub-1' })
	})

	it('subscription.updated moves the team to the new product, and a renewal to the new period', async () => {
		const env = billingEnv()
		await deliver(env, 'subscription.created', subscription())
		await deliver(env, 'subscription.updated', subscription({ product_id: PRODUCTS.growth, modified_at: '2026-10-05T00:00:00.000000Z' }))
		expect(team(env)).toMatchObject({ plan: 'growth', plan_status: 'active' })
		await deliver(env, 'subscription.updated', subscription({ product_id: PRODUCTS.growth, current_period_end: '2026-12-01T00:00:00.000000Z', modified_at: '2026-11-01T00:00:00.000000Z' }))
		expect(team(env).plan_period_end).toBe(Date.parse('2026-12-01T00:00:00.000000Z'))
	})

	it('subscription.canceled keeps the plan until the period ends, and subscription.uncanceled makes it active again', async () => {
		const env = billingEnv()
		await deliver(env, 'subscription.created', subscription({ product_id: PRODUCTS.growth }))
		await deliver(env, 'subscription.canceled', subscription({ product_id: PRODUCTS.growth, cancel_at_period_end: true, canceled_at: '2026-10-10T00:00:00.000000Z', ends_at: PERIOD_END, modified_at: '2026-10-10T00:00:00.000000Z' }))
		expect(team(env)).toMatchObject({ plan: 'growth', plan_status: 'canceled', plan_period_end: Date.parse(PERIOD_END), polar_subscription_id: 'sub-1' })
		await deliver(env, 'subscription.uncanceled', subscription({ product_id: PRODUCTS.growth, modified_at: '2026-10-11T00:00:00.000000Z' }))
		expect(team(env)).toMatchObject({ plan: 'growth', plan_status: 'active' })
	})

	it('subscription.past_due keeps the plan while Polar retries the card', async () => {
		const env = billingEnv()
		await deliver(env, 'subscription.created', subscription())
		await deliver(env, 'subscription.past_due', subscription({ status: 'past_due', past_due_at: '2026-11-01T00:00:00.000000Z', modified_at: '2026-11-01T00:00:00.000000Z' }))
		expect(team(env)).toMatchObject({ plan: 'starter', plan_status: 'past_due', polar_subscription_id: 'sub-1' })
		// the card is updated and the retry pays
		await deliver(env, 'subscription.updated', subscription({ modified_at: '2026-11-02T00:00:00.000000Z' }))
		expect(team(env).plan_status).toBe('active')
	})

	it('subscription.revoked ends the plan, and keeps the customer for invoices', async () => {
		const env = billingEnv()
		await deliver(env, 'subscription.created', subscription())
		await deliver(env, 'subscription.revoked', subscription({ status: 'canceled', ended_at: PERIOD_END, ends_at: PERIOD_END, modified_at: '2026-11-01T00:00:00.000000Z' }))
		expect(team(env)).toEqual({ plan: null, plan_status: null, plan_period_end: null, polar_customer_id: 'cus-1', polar_subscription_id: null })
	})

	it('ends the plan when Polar gives up on a failed payment (status unpaid)', async () => {
		const env = billingEnv()
		await deliver(env, 'subscription.created', subscription())
		await deliver(env, 'subscription.revoked', subscription({ status: 'unpaid', modified_at: '2026-11-22T00:00:00.000000Z' }))
		expect(team(env)).toMatchObject({ plan: null, plan_status: null, polar_subscription_id: null })
	})

	it('logs and ignores an unknown product, a subscription without a team, a deleted team, and other events', async () => {
		const env = billingEnv()
		const log = vi.mocked(console.error)
		expect(await deliver(env, 'subscription.created', subscription({ product_id: 'prod-other' }))).toEqual({ status: 202, body: { ok: true, ignored: true } })
		expect(log.mock.calls.flat().join('\n')).toContain('unknown Polar product')
		expect((await deliver(env, 'subscription.created', subscription({ metadata: {} }))).status).toBe(202)
		expect(log.mock.calls.flat().join('\n')).toContain('polar subscription without a team')
		expect((await deliver(env, 'subscription.created', subscription({ metadata: { team_id: 'gone' } }))).status).toBe(202)
		expect(log.mock.calls.flat().join('\n')).toContain('polar subscription of a deleted team')
		expect(await deliver(env, 'order.paid', { id: 'order-1' })).toEqual({ status: 202, body: { ok: true, ignored: true } })
		expect(team(env)).toMatchObject({ plan: null, polar_customer_id: null, polar_subscription_id: null })
		expect(env.CONTROL.rows('SELECT id FROM polar_subscriptions')).toEqual([])
	})

	it('leaves the plan support set on a team without a subscription, until a subscription pays', async () => {
		const env = billingEnv()
		setPlan(env, 't1', 'scale')
		await deliver(env, 'subscription.created', subscription({ status: 'incomplete' }))
		expect(team(env).plan).toBe('scale')
		await deliver(env, 'subscription.active', subscription({ modified_at: '2026-10-01T00:00:02.000000Z' }))
		expect(team(env).plan).toBe('starter')
	})

	it('keeps a subscription with the team it came with, whatever its metadata says later', async () => {
		const env = billingEnv()
		env.CONTROL.db.exec("INSERT INTO teams (id, name, created_at) VALUES ('t2', 'Other', 1)")
		await deliver(env, 'subscription.created', subscription())
		await deliver(env, 'subscription.updated', subscription({ product_id: PRODUCTS.growth, metadata: { team_id: 't2' }, modified_at: '2026-10-03T00:00:00.000000Z' }))
		expect(team(env).plan).toBe('growth')
		expect(team(env, 't2').plan).toBeNull()
	})
})

describe('the Polar webhook: events out of order', () => {
	it('ignores an older state that arrives after a newer one', async () => {
		const env = billingEnv()
		await deliver(env, 'subscription.updated', subscription({ product_id: PRODUCTS.growth, modified_at: '2026-10-05T00:00:00.000000Z' }))
		await deliver(env, 'subscription.created', subscription())
		expect(team(env).plan).toBe('growth')
	})

	it('does not bring back a revoked subscription when an older event arrives late', async () => {
		const env = billingEnv()
		await deliver(env, 'subscription.created', subscription())
		await deliver(env, 'subscription.revoked', subscription({ status: 'canceled', ended_at: PERIOD_END, modified_at: '2026-11-01T00:00:00.000000Z' }))
		await deliver(env, 'subscription.past_due', subscription({ status: 'past_due', modified_at: '2026-10-20T00:00:00.000000Z' }))
		expect(team(env)).toMatchObject({ plan: null, plan_status: null, polar_subscription_id: null })
	})

	it('orders two changes within one millisecond by their microseconds', async () => {
		const env = billingEnv()
		await deliver(env, 'subscription.updated', subscription({ product_id: PRODUCTS.scale, modified_at: '2026-10-05T00:00:00.123457Z' }))
		await deliver(env, 'subscription.updated', subscription({ product_id: PRODUCTS.growth, modified_at: '2026-10-05T00:00:00.123456Z' }))
		expect(team(env).plan).toBe('scale')
	})

	it("keeps the team on its new subscription when the old one's revocation arrives late", async () => {
		const env = billingEnv()
		await deliver(env, 'subscription.created', subscription())
		const second = { id: 'sub-2', product_id: PRODUCTS.growth, started_at: '2026-11-05T00:00:00.000000Z', created_at: '2026-11-05T00:00:00.000000Z', modified_at: '2026-11-05T00:00:00.000000Z', current_period_end: '2026-12-05T00:00:00.000000Z' }
		await deliver(env, 'subscription.active', subscription(second))
		// a later change to the older one, still live, doesn't take the team back to it
		await deliver(env, 'subscription.updated', subscription({ modified_at: '2026-10-20T00:00:00.000000Z' }))
		expect(team(env)).toMatchObject({ plan: 'growth', polar_subscription_id: 'sub-2' })
		await deliver(env, 'subscription.revoked', subscription({ status: 'canceled', ended_at: PERIOD_END, modified_at: '2026-11-01T00:00:00.000000Z' }))
		expect(team(env)).toMatchObject({ plan: 'growth', plan_status: 'active', polar_subscription_id: 'sub-2' })
		// two live subscriptions at once is a team paying twice: the newest sets the plan, and the log says so
		expect(vi.mocked(console.error).mock.calls.flat().join('\n')).toContain('team pays for more than one subscription')
	})
})

// ---------------------------------------------------------------- checkout and switch

const CHECKOUT_URL = 'https://polar.sh/checkout/polar_c_test'

describe('POST /api/v1/teams/:team/checkout', () => {
	it('creates a Polar checkout for a team without a subscription: the product, the team in metadata, the email, back to team settings', async () => {
		const env = billingEnv()
		env.CONTROL.db.exec("INSERT INTO sites (id, domain, name, team_id, created_at) VALUES ('shop-com', 'shop.com', 'Shop', 't1', 0)")
		const sent = polar(() => [201, { id: 'co-1', url: CHECKOUT_URL }])
		expect(await call(env, 'POST', '/api/v1/teams/t1/checkout', { plan: 'growth' })).toEqual({ status: 200, body: { url: CHECKOUT_URL } })
		expect(sent).toHaveLength(1)
		expect(sent[0]).toMatchObject({ method: 'POST', url: 'https://api.polar.sh/v1/checkouts/' })
		expect(sent[0].headers.get('authorization')).toBe('Bearer polar_oat_test')
		expect(sent[0].headers.get('polar-version')).toBe('2026-10')
		const back = 'https://app.test/?site=shop-com&view=settings&tab=team'
		expect(sent[0].body).toEqual({ products: [PRODUCTS.growth], success_url: `${back}&checkout_id={CHECKOUT_ID}`, return_url: back, metadata: { team_id: 't1' }, customer_email: 'owner@test' })
		// nothing changes until Polar's webhook says the subscription pays
		expect(team(env).plan).toBeNull()
	})

	it('uses the sandbox with POLAR_SERVER=sandbox, PUBLIC_URL for the way back, and the customer a team already has', async () => {
		const env = billingEnv({ POLAR_SERVER: 'sandbox', PUBLIC_URL: 'https://app.misomoon.com' })
		env.CONTROL.db.exec("UPDATE teams SET polar_customer_id = 'cus-9' WHERE id = 't1'")
		const sent = polar(() => [201, { url: CHECKOUT_URL }])
		await call(env, 'POST', '/api/v1/teams/t1/checkout', { plan: 'starter' })
		expect(sent[0].url).toBe('https://sandbox-api.polar.sh/v1/checkouts/')
		expect(sent[0].body).toMatchObject({ customer_id: 'cus-9', return_url: 'https://app.misomoon.com/?view=settings&tab=team' })
		expect(sent[0].body.customer_email).toBeUndefined()
	})

	it('switches the subscription a team pays for instead of making a second one, and answers the new state', async () => {
		const env = billingEnv()
		await deliver(env, 'subscription.created', subscription())
		const switched = subscription({ product_id: PRODUCTS.scale, modified_at: '2026-10-08T00:00:00.000000Z' })
		const sent = polar((req) => [200, req.method === 'PATCH' ? switched : subscription()])
		const res = await call(env, 'POST', '/api/v1/teams/t1/checkout', { plan: 'scale' })
		expect(sent.map((r) => `${r.method} ${r.url}`)).toEqual(['GET https://api.polar.sh/v1/subscriptions/sub-1', 'PATCH https://api.polar.sh/v1/subscriptions/sub-1'])
		// no proration_behavior: the organization's proration setting applies
		expect(sent[1].body).toEqual({ product_id: PRODUCTS.scale })
		expect(res).toEqual({ status: 200, body: { url: null, plan: 'scale', plan_status: 'active', plan_period_end: Date.parse(PERIOD_END), pending: null } })
		expect(team(env).plan).toBe('scale')
		// Polar's webhook for the same change is then a no-op
		await deliver(env, 'subscription.updated', switched)
		expect(team(env).plan).toBe('scale')
	})

	it('answers a switch Polar applies at the next period as pending, and keeps the plan until then', async () => {
		const env = billingEnv()
		await deliver(env, 'subscription.created', subscription({ product_id: PRODUCTS.growth }))
		const later = subscription({ product_id: PRODUCTS.growth, modified_at: '2026-10-08T00:00:00.000000Z', pending_update: { id: 'pu-1', product_id: PRODUCTS.starter, applies_at: PERIOD_END, created_at: T0, modified_at: null, seats: null, units: null } })
		polar((req) => [200, req.method === 'PATCH' ? later : subscription({ product_id: PRODUCTS.growth })])
		const res = await call(env, 'POST', '/api/v1/teams/t1/checkout', { plan: 'starter' })
		expect(res.body).toMatchObject({ url: null, plan: 'growth', pending: { plan: 'starter', applies_at: Date.parse(PERIOD_END) } })
	})

	it('resumes a canceled subscription, then switches it', async () => {
		const env = billingEnv()
		const canceled = { cancel_at_period_end: true, ends_at: PERIOD_END, modified_at: '2026-10-05T00:00:00.000000Z' }
		await deliver(env, 'subscription.canceled', subscription(canceled))
		expect(team(env).plan_status).toBe('canceled')
		const sent = polar((req) =>
			req.method === 'GET' ? [200, subscription(canceled)] : req.body.cancel_at_period_end === false ? [200, subscription({ modified_at: '2026-10-06T00:00:00.000000Z' })] : [200, subscription({ product_id: PRODUCTS.growth, modified_at: '2026-10-06T00:00:01.000000Z' })],
		)
		const res = await call(env, 'POST', '/api/v1/teams/t1/checkout', { plan: 'growth' })
		expect(sent.map((r) => r.body ?? null)).toEqual([null, { cancel_at_period_end: false }, { product_id: PRODUCTS.growth }])
		expect(res.body).toMatchObject({ plan: 'growth', plan_status: 'active' })
	})

	it('resumes a canceled subscription on the same plan without switching it', async () => {
		const env = billingEnv()
		const canceled = { cancel_at_period_end: true, ends_at: PERIOD_END, modified_at: '2026-10-05T00:00:00.000000Z' }
		await deliver(env, 'subscription.canceled', subscription(canceled))
		const sent = polar((req) => [200, req.method === 'GET' ? subscription(canceled) : subscription({ modified_at: '2026-10-06T00:00:00.000000Z' })])
		const res = await call(env, 'POST', '/api/v1/teams/t1/checkout', { plan: 'starter' })
		expect(sent.map((r) => r.method)).toEqual(['GET', 'PATCH'])
		expect(res.body).toMatchObject({ plan: 'starter', plan_status: 'active' })
	})

	it('checks out anew when the subscription ended without a webhook reaching misomoon', async () => {
		const env = billingEnv()
		await deliver(env, 'subscription.created', subscription())
		const sent = polar((req) => (req.method === 'GET' ? [200, subscription({ status: 'canceled', ended_at: PERIOD_END, modified_at: '2026-11-01T00:00:00.000000Z' })] : [201, { url: CHECKOUT_URL }]))
		expect((await call(env, 'POST', '/api/v1/teams/t1/checkout', { plan: 'starter' })).body).toEqual({ url: CHECKOUT_URL })
		expect(sent.map((r) => `${r.method} ${r.url}`)).toEqual(['GET https://api.polar.sh/v1/subscriptions/sub-1', 'POST https://api.polar.sh/v1/checkouts/'])
		expect(sent[1].body.customer_id).toBe('cus-1')
		expect(team(env)).toMatchObject({ plan: null, polar_subscription_id: null })
	})

	it('answers 402 when Polar cannot charge the card for the switch, and changes nothing', async () => {
		const env = billingEnv()
		await deliver(env, 'subscription.created', subscription())
		polar((req) => (req.method === 'GET' ? [200, subscription()] : [402, { error: 'PaymentFailed', detail: 'card declined' }]))
		const res = await call(env, 'POST', '/api/v1/teams/t1/checkout', { plan: 'scale' })
		expect(res.status).toBe(402)
		expect(res.body.code).toBe('payment_failed')
		expect(team(env).plan).toBe('starter')
	})

	it('answers 502 when Polar is down or refuses the request', async () => {
		const env = billingEnv()
		vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'))
		expect(await call(env, 'POST', '/api/v1/teams/t1/checkout', { plan: 'starter' })).toEqual({ status: 502, body: { error: 'Polar did not answer; try again in a minute' } })
		vi.restoreAllMocks()
		polar(() => [401, { error: 'Unauthorized', detail: 'invalid token' }])
		expect(await call(env, 'POST', '/api/v1/teams/t1/checkout', { plan: 'starter' })).toEqual({ status: 502, body: { error: 'Polar refused the request: invalid token' } })
	})

	it('refuses a plan that does not exist', async () => {
		const env = billingEnv()
		const sent = polar(() => [201, { url: CHECKOUT_URL }])
		expect(await call(env, 'POST', '/api/v1/teams/t1/checkout', { plan: 'enterprise' })).toEqual({ status: 400, body: { error: 'plan is starter, growth, scale' } })
		expect((await call(env, 'POST', '/api/v1/teams/t1/checkout')).status).toBe(400)
		expect(sent).toEqual([])
	})
})

describe('POST /api/v1/teams/:team/portal', () => {
	it("opens a Polar customer portal session for the team's customer", async () => {
		const env = billingEnv()
		await deliver(env, 'subscription.created', subscription())
		const sent = polar(() => [201, { id: 'cs-1', token: 'polar_cst_x', customer_portal_url: 'https://polar.sh/acme/portal?customer_session_token=polar_cst_x' }])
		expect(await call(env, 'POST', '/api/v1/teams/t1/portal')).toEqual({ status: 200, body: { url: 'https://polar.sh/acme/portal?customer_session_token=polar_cst_x' } })
		expect(sent[0]).toMatchObject({ method: 'POST', url: 'https://api.polar.sh/v1/customer-sessions/', body: { customer_id: 'cus-1', return_url: 'https://app.test/?view=settings&tab=team' } })
	})

	it('answers 409 for a team that never paid', async () => {
		const env = billingEnv()
		const sent = polar(() => [201, {}])
		expect(await call(env, 'POST', '/api/v1/teams/t1/portal')).toEqual({ status: 409, body: { error: 'this team has not paid for a plan yet; choose one first' } })
		expect(sent).toEqual([])
	})
})

describe('who may pay', () => {
	it('lets owners and billing members, and refuses admins, editors, viewers, outsiders, API keys and signed-out callers', async () => {
		const env = billingEnv()
		const sent = polar(() => [201, { url: CHECKOUT_URL, customer_portal_url: 'https://polar.sh/portal' }])
		const roles = { admin: person(env, 'u-admin', 'admin'), editor: person(env, 'u-editor', 'editor'), viewer: person(env, 'u-viewer', 'viewer'), billing: person(env, 'u-billing', 'billing') }
		for (const role of ['admin', 'editor', 'viewer'] as const) {
			expect(await call(env, 'POST', '/api/v1/teams/t1/checkout', { plan: 'starter' }, roles[role])).toEqual({ status: 403, body: { error: `a team ${role} cannot manage billing; ask an owner or a billing member` } })
			expect((await call(env, 'POST', '/api/v1/teams/t1/portal', undefined, roles[role])).status).toBe(403)
		}
		expect(sent).toEqual([])
		const billing = await call(env, 'POST', '/api/v1/teams/t1/checkout', { plan: 'starter' }, roles.billing)
		expect(billing).toEqual({ status: 200, body: { url: CHECKOUT_URL } })
		expect(sent[0].body.customer_email).toBe('u-billing@test')
		expect((await call(env, 'POST', '/api/v1/teams/t1/checkout', { plan: 'starter' }, person(env, 'u-out', null))).status).toBe(404)
		expect((await call(env, 'POST', '/api/v1/teams/t1/checkout', { plan: 'starter' }, {})).status).toBe(401)
		const key = await call(env, 'POST', '/api/v1/keys', { name: 'ci' })
		expect((await call(env, 'POST', '/api/v1/teams/t1/checkout', { plan: 'starter' }, { authorization: `Bearer ${key.body.key}` })).status).toBe(403)
	})
})

// ---------------------------------------------------------------- not set up, and /me

describe('a server without billing', () => {
	it('answers 404 on a server without plans, as the self-hosted bundle is, and /me says billing is off', async () => {
		const env = { ...fakeEnv(), ...POLAR } as Env2
		const sent = polar(() => [201, { url: CHECKOUT_URL }])
		for (const [method, path] of [
			['POST', '/api/v1/teams/t1/checkout'],
			['POST', '/api/v1/teams/t1/portal'],
		]) {
			expect(await call(env, method, path, { plan: 'starter' })).toEqual({ status: 404, body: { error: 'this server has no paid plans' } })
		}
		expect((await deliver(env, 'subscription.created', subscription())).status).toBe(404)
		expect(sent).toEqual([])
		const me = (await call(env, 'GET', '/api/v1/me')).body
		expect(me.billing).toBe(false)
		expect(me.teams[0]).toMatchObject({ plan_status: null, plan_period_end: null, billing_portal: false })
	})

	it('answers 501 naming what is missing with PLANS=on but no Polar settings, and /me says billing is off', async () => {
		const env = billingEnv({ POLAR_ACCESS_TOKEN: undefined, POLAR_PRODUCT_SCALE: '' })
		const res = await call(env, 'POST', '/api/v1/teams/t1/checkout', { plan: 'starter' })
		expect(res).toEqual({ status: 501, body: { error: 'billing needs POLAR_ACCESS_TOKEN, POLAR_PRODUCT_SCALE (docs/billing.md)' } })
		expect((await call(env, 'POST', '/api/v1/teams/t1/portal')).status).toBe(501)
		expect((await deliver(env, 'subscription.created', subscription())).status).toBe(501)
		expect((await call(env, 'GET', '/api/v1/me')).body.billing).toBe(false)
		expect((await call(billingEnv({ POLAR_SERVER: 'staging' }), 'POST', '/api/v1/teams/t1/portal')).body.error).toBe('billing needs POLAR_SERVER (sandbox or production) (docs/billing.md)')
	})
})

describe('GET /api/v1/me with billing', () => {
	it("says billing is on, and gives each team its plan_status, plan_period_end, and whether the portal opens", async () => {
		const env = billingEnv()
		let me = (await call(env, 'GET', '/api/v1/me')).body
		expect(me.billing).toBe(true)
		expect(me.teams[0]).toMatchObject({ id: 't1', plan_status: null, plan_period_end: null, billing_portal: false })
		await deliver(env, 'subscription.canceled', subscription({ cancel_at_period_end: true, ends_at: PERIOD_END }))
		me = (await call(env, 'GET', '/api/v1/me')).body
		expect(me.teams[0]).toMatchObject({ plan_status: 'canceled', plan_period_end: Date.parse(PERIOD_END), billing_portal: true })
		expect(me.teams[0].plan.id).toBe('starter')
	})
})
