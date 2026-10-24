import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vite-plus/test'
import {
	aggregate,
	assignSessions,
	breakdown,
	buildEvent,
	DAY,
	funnel,
	insertEventStmt,
	parsePayments,
	PaymentError,
	paymentRow,
	toMajor,
	verifyWebhook,
	visitOf,
	type EdgeContext,
	type EventRow,
	type OpenSession,
	type Payment,
	type Scope,
	type TrackerPayload,
} from '../src'
import { runner, shardDb } from './helpers'

const NOW = Date.UTC(2026, 9, 22, 12)
const SEC = Math.floor(NOW / 1000)

describe('amounts in minor units', () => {
	it.each([
		['stripe', 1999, 'USD', 19.99],
		['stripe', 500, 'JPY', 500],
		['stripe', 500, 'ISK', 5],
		['stripe', 1500, 'KWD', 1.5],
		['polar', 1000, 'USD', 10],
		['dodo', 150000, 'IDR', 1500],
		['lemonsqueezy', 1000, 'JPY', 1000],
	] as const)('%s %s %s is %s', (provider, amount, currency, major) => {
		expect(toMajor(amount, currency, provider)).toBe(major)
	})
})

describe('Stripe events', () => {
	const ev = (type: string, object: Record<string, unknown>, livemode = true) => ({ type, livemode, data: { object } })

	it('counts a paid one-time Checkout Session, keyed by ref, client reference and session id', () => {
		const out = parsePayments(
			'stripe',
			ev('checkout.session.completed', {
				id: 'cs_live_a1',
				mode: 'payment',
				payment_status: 'paid',
				amount_total: 4900,
				currency: 'usd',
				metadata: { misomoon_ref: 'ref_abc123' },
				client_reference_id: 'link_ref_9',
				payment_intent: 'pi_1',
				customer: 'cus_1',
				created: SEC,
			}),
		)
		expect(out).toEqual({
			test: false,
			payments: [
				{
					provider: 'stripe',
					kind: 'payment',
					id: 'cs_live_a1',
					amount: 49,
					currency: 'USD',
					ts: SEC * 1000,
					keys: ['ref_abc123', 'link_ref_9', 'cs_live_a1'],
					links: ['stripe:pi:pi_1', 'stripe:customer:cus_1'],
					billing: 'one_time',
				},
			],
		})
	})

	it('waits for an unpaid session and turns a subscription session into a link', () => {
		expect(parsePayments('stripe', ev('checkout.session.completed', { id: 'cs_2', mode: 'payment', payment_status: 'unpaid', amount_total: 100, currency: 'usd' })).payments).toEqual([])
		const [link] = parsePayments('stripe', ev('checkout.session.completed', { id: 'cs_3', mode: 'subscription', subscription: 'sub_1', customer: 'cus_1', invoice: 'in_1', client_reference_id: 'link_ref_9', created: SEC })).payments
		expect(link).toEqual({ provider: 'stripe', kind: 'link', id: 'cs_3', amount: 0, currency: '', ts: SEC * 1000, keys: ['link_ref_9', 'cs_3'], links: ['stripe:sub:sub_1', 'stripe:invoice:in_1', 'stripe:customer:cus_1'] })
	})

	it('counts subscription invoices, first and renewal, and skips invoices outside a subscription', () => {
		const invoice = (billing_reason: string, extra: Record<string, unknown> = {}) =>
			ev('invoice.paid', {
				id: 'in_1',
				amount_paid: 1200,
				currency: 'eur',
				customer: 'cus_1',
				billing_reason,
				status_transitions: { paid_at: SEC + 5 },
				parent: { subscription_details: { subscription: 'sub_1', metadata: { misomoon_ref: 'ref_sub_1' } } },
				...extra,
			})
		const [first] = parsePayments('stripe', invoice('subscription_create')).payments
		expect(first).toMatchObject({
			kind: 'payment',
			id: 'in_1',
			amount: 12,
			currency: 'EUR',
			ts: (SEC + 5) * 1000,
			keys: ['ref_sub_1', 'stripe:invoice:in_1', 'stripe:sub:sub_1', 'stripe:customer:cus_1'],
			links: ['stripe:sub:sub_1', 'stripe:customer:cus_1'],
			billing: 'new',
		})
		expect(parsePayments('stripe', invoice('subscription_cycle')).payments[0].billing).toBe('renewal')
		expect(parsePayments('stripe', invoice('manual', { parent: null })).payments).toEqual([])
		expect(parsePayments('stripe', invoice('subscription_cycle', { amount_paid: 0 })).payments).toEqual([])
	})

	it('reads each refund once, keyed by its payment intent and charge', () => {
		const [r] = parsePayments('stripe', ev('refund.created', { id: 're_1', amount: 500, currency: 'usd', status: 'succeeded', payment_intent: 'pi_1', charge: 'ch_1', created: SEC })).payments
		expect(r).toEqual({ provider: 'stripe', kind: 'refund', id: 're_1', amount: 5, currency: 'USD', ts: SEC * 1000, keys: ['stripe:pi:pi_1', 'stripe:charge:ch_1'], links: [] })
		expect(parsePayments('stripe', ev('refund.created', { id: 're_2', amount: 500, currency: 'usd', status: 'failed' })).payments).toEqual([])
	})

	it('flags test-mode events and ignores other types', () => {
		expect(parsePayments('stripe', ev('checkout.session.completed', { id: 'cs_t', mode: 'payment', payment_status: 'paid', amount_total: 100, currency: 'usd' }, false)).test).toBe(true)
		expect(parsePayments('stripe', ev('customer.created', { id: 'cus_1' }))).toEqual({ test: false, payments: [] })
	})
})

describe('Polar events', () => {
	it('counts order.paid with its checkout id, reference and subscription', () => {
		const [p] = parsePayments('polar', {
			type: 'order.paid',
			data: { id: 'ord-uuid-1', total_amount: 2000, currency: 'usd', billing_reason: 'subscription_cycle', checkout_id: 'chk-uuid-1', subscription_id: 'sub-uuid-1', customer_id: 'cus-uuid-1', metadata: { reference_id: 'link_ref_9' }, created_at: '2026-10-22T12:00:00Z' },
		}).payments
		expect(p).toEqual({
			provider: 'polar',
			kind: 'payment',
			id: 'ord-uuid-1',
			amount: 20,
			currency: 'USD',
			ts: NOW,
			keys: ['link_ref_9', 'chk-uuid-1', 'polar:sub:sub-uuid-1', 'polar:customer:cus-uuid-1'],
			links: ['polar:order:ord-uuid-1', 'polar:sub:sub-uuid-1', 'polar:customer:cus-uuid-1'],
			billing: 'renewal',
		})
	})

	it('counts a succeeded refund with its tax, and skips a pending one', () => {
		const refund = (status: string) => ({ type: 'refund.updated', data: { id: 'rf-1', status, amount: 1000, tax_amount: 200, currency: 'usd', order_id: 'ord-uuid-1', modified_at: '2026-10-22T12:00:00Z' } })
		expect(parsePayments('polar', refund('succeeded')).payments).toEqual([{ provider: 'polar', kind: 'refund', id: 'rf-1', amount: 12, currency: 'USD', ts: NOW, keys: ['polar:order:ord-uuid-1'], links: [] }])
		expect(parsePayments('polar', refund('pending')).payments).toEqual([])
	})
})

describe('Lemon Squeezy events', () => {
	const ev = (event_name: string, id: string, attributes: Record<string, unknown>, custom_data?: Record<string, unknown>) => ({ meta: { event_name, custom_data }, data: { id, attributes: { created_at: '2026-10-22T12:00:00Z', ...attributes } } })

	it('counts a paid order and keys it by the custom ref', () => {
		const out = parsePayments('lemonsqueezy', ev('order_created', '123', { status: 'paid', total: 1199, currency: 'usd', customer_id: 9 }, { misomoon_ref: 'ref_abc123' }))
		expect(out.payments).toEqual([
			{ provider: 'lemonsqueezy', kind: 'payment', id: 'order:123', amount: 11.99, currency: 'USD', ts: NOW, keys: ['ref_abc123', 'lemonsqueezy:customer:9'], links: ['lemonsqueezy:order:123', 'lemonsqueezy:customer:9'] },
		])
	})

	it('links a new subscription to its order, counts renewals only, and reads test mode', () => {
		expect(parsePayments('lemonsqueezy', ev('subscription_created', '77', { order_id: 123, customer_id: 9 })).payments[0]).toMatchObject({ kind: 'link', keys: ['lemonsqueezy:order:123', 'lemonsqueezy:customer:9'], links: ['lemonsqueezy:sub:77', 'lemonsqueezy:customer:9'] })
		const invoice = (billing_reason: string) => ev('subscription_payment_success', '501', { billing_reason, status: 'paid', total: 900, currency: 'USD', subscription_id: 77, customer_id: 9 })
		expect(parsePayments('lemonsqueezy', invoice('initial')).payments).toEqual([])
		expect(parsePayments('lemonsqueezy', invoice('renewal')).payments[0]).toMatchObject({ id: 'invoice:501', amount: 9, keys: ['lemonsqueezy:sub:77', 'lemonsqueezy:customer:9'], billing: 'renewal' })
		expect(parsePayments('lemonsqueezy', ev('order_created', '1', { status: 'paid', total: 100, currency: 'USD', test_mode: true })).test).toBe(true)
	})

	it('names a refund by the refunded total, which Lemon Squeezy sends instead of the refund', () => {
		const [r] = parsePayments('lemonsqueezy', ev('order_refunded', '123', { refunded_amount: 500, currency: 'USD', customer_id: 9, refunded_at: '2026-10-22T12:00:00Z' })).payments
		expect(r).toEqual({ provider: 'lemonsqueezy', kind: 'refund', id: 'refund:order:123:500', amount: 5, currency: 'USD', ts: NOW, keys: ['lemonsqueezy:order:123', 'lemonsqueezy:customer:9'], links: [], refundedTotalOf: 'order:123' })
	})
})

describe('Dodo Payments events', () => {
	it('counts payment.succeeded, keyed by metadata and the ids the return URL carries', () => {
		const [p] = parsePayments('dodo', {
			type: 'payment.succeeded',
			timestamp: '2026-10-22T12:00:00Z',
			data: { payload_type: 'Payment', payment_id: 'pay_123456', total_amount: 2999, currency: 'USD', subscription_id: 'sub_123456', charge_type: 'renewal', customer: { customer_id: 'cus_1' }, metadata: { misomoon_ref: 'ref_abc123' }, created_at: '2026-10-22T12:00:00Z' },
		}).payments
		expect(p).toEqual({
			provider: 'dodo',
			kind: 'payment',
			id: 'pay_123456',
			amount: 29.99,
			currency: 'USD',
			ts: NOW,
			keys: ['ref_abc123', 'pay_123456', 'sub_123456', 'dodo:sub:sub_123456', 'dodo:customer:cus_1'],
			links: ['dodo:payment:pay_123456', 'dodo:sub:sub_123456', 'dodo:customer:cus_1'],
			billing: 'renewal',
		})
	})

	it('skips zero-amount payments and keys refunds by their payment', () => {
		expect(parsePayments('dodo', { type: 'payment.succeeded', data: { payment_id: 'pay_2', total_amount: 0, currency: 'USD' } }).payments).toEqual([])
		expect(parsePayments('dodo', { type: 'refund.succeeded', data: { refund_id: 'ref_1', payment_id: 'pay_1', amount: 1000, currency: 'USD', created_at: '2026-10-22T12:00:00Z' } }).payments).toEqual([
			{ provider: 'dodo', kind: 'refund', id: 'ref_1', amount: 10, currency: 'USD', ts: NOW, keys: ['dodo:payment:pay_1'], links: [] },
		])
	})
})

describe('custom payments', () => {
	it('takes major units and a ref', () => {
		expect(parsePayments('custom', { id: 'ord_1', amount: 49.9, currency: 'eur', ref: 'ref_abc123', customer: 'c_9', ts: NOW }).payments).toEqual([
			{ provider: 'custom', kind: 'payment', id: 'ord_1', amount: 49.9, currency: 'EUR', ts: NOW, keys: ['ref_abc123', 'custom:customer:c_9'], links: ['custom:payment:ord_1', 'custom:customer:c_9'], billing: 'one_time' },
		])
		expect(parsePayments('custom', { type: 'refund', id: 'rf_1', amount: 10, currency: 'EUR', refund_of: 'ord_1', ts: NOW }).payments[0]).toMatchObject({ kind: 'refund', keys: ['custom:payment:ord_1'] })
	})

	it.each([
		[{ amount: 1, currency: 'EUR' }, 'id is required, up to 200 characters'],
		[{ id: 'a', amount: -1, currency: 'EUR' }, 'amount must be a positive number in major units (49.9 for 49.90)'],
		[{ id: 'a', amount: 1, currency: 'euro' }, 'currency must be a 3-letter ISO 4217 code'],
		[{ type: 'refund', id: 'a', amount: 1, currency: 'EUR' }, 'a refund needs refund_of: the id of the payment it returns'],
		[{ type: 'charge', id: 'a', amount: 1, currency: 'EUR' }, 'type must be "payment" or "refund"'],
	])('refuses %j', (body, message) => {
		expect(() => parsePayments('custom', body)).toThrow(new PaymentError(message))
	})
})

describe('webhook signatures', () => {
	const body = '{"type":"x"}'
	const hmac = (key: string | Buffer, data: string, enc: 'hex' | 'base64') => createHmac('sha256', key).update(data).digest(enc)

	it('checks Stripe-Signature, any v1, within five minutes', async () => {
		const secret = 'whsec_stripe_test'
		const good = hmac(secret, `${SEC}.${body}`, 'hex')
		const h = (v: string) => new Headers({ 'stripe-signature': v })
		expect(await verifyWebhook('stripe', secret, h(`t=${SEC},v1=${'0'.repeat(64)},v1=${good}`), body, NOW)).toBe(true)
		expect(await verifyWebhook('stripe', secret, h(`t=${SEC},v1=${good}`), body + ' ', NOW)).toBe(false)
		expect(await verifyWebhook('stripe', secret, h(`t=${SEC},v0=${good}`), body, NOW)).toBe(false)
		expect(await verifyWebhook('stripe', secret, h(`t=${SEC},v1=${good}`), body, NOW + 6 * 60_000)).toBe(false)
	})

	it('checks Standard Webhooks for Dodo, and the older raw-secret key for Polar', async () => {
		const key = Buffer.from('a 32 byte key for standard hooks')
		const secret = `whsec_${key.toString('base64')}`
		const signed = `msg_1.${SEC}.${body}`
		const h = (sig: string) => new Headers({ 'webhook-id': 'msg_1', 'webhook-timestamp': String(SEC), 'webhook-signature': sig })
		expect(await verifyWebhook('dodo', secret, h(`v1,bm90IGl0 v1,${hmac(key, signed, 'base64')}`), body, NOW)).toBe(true)
		expect(await verifyWebhook('dodo', secret, h(`v1,${hmac(key, signed, 'base64')}`), body, NOW + 10 * 60_000)).toBe(false)
		const legacy = 'whsec_polar-made-before-september'
		expect(await verifyWebhook('polar', legacy, h(`v1,${hmac(legacy, signed, 'base64')}`), body, NOW)).toBe(true)
		expect(await verifyWebhook('dodo', legacy, h(`v1,${hmac(legacy, signed, 'base64')}`), body, NOW)).toBe(false)
	})

	it('checks Lemon Squeezy X-Signature and the custom bearer or HMAC', async () => {
		const secret = 'a-secret-you-chose'
		expect(await verifyWebhook('lemonsqueezy', secret, new Headers({ 'x-signature': hmac(secret, body, 'hex') }), body)).toBe(true)
		expect(await verifyWebhook('lemonsqueezy', secret, new Headers({ 'x-signature': hmac('other', body, 'hex') }), body)).toBe(false)
		expect(await verifyWebhook('custom', secret, new Headers({ authorization: `Bearer ${secret}` }), body)).toBe(true)
		expect(await verifyWebhook('custom', secret, new Headers({ authorization: `Bearer ${secret}x` }), body)).toBe(false)
		expect(await verifyWebhook('custom', secret, new Headers({ 'x-misomoon-signature': `sha256=${hmac(secret, body, 'hex')}` }), body)).toBe(true)
		expect(await verifyWebhook('custom', secret, new Headers(), body)).toBe(false)
	})
})

const edge: EdgeContext = { ua: 'Mozilla/5.0 (Macintosh) Chrome/141.0.0.0 Safari/537.36', ip: '10.0.0.1', country: 'ID' }
function build(p: Partial<TrackerPayload>, ts = NOW): EventRow {
	const row = buildEvent({ s: 'a', n: 'pageview', u: 'https://a.com/', ...p } as TrackerPayload, edge, ts)
	if (typeof row === 'string') throw new Error(row)
	return { ...row, visitor_id: 'v1' }
}

describe('beacons that hand out payment keys', () => {
	it('keeps up to four valid keys and never a provider link key', () => {
		expect(build({ k: ['ref_abc123', 'cs_live_1', 'stripe:customer:cus_1', 'x', 'chk-uuid-1', 'pay_123456', 'sub_123456'] }).refs).toEqual(['ref_abc123', 'cs_live_1', 'chk-uuid-1', 'pay_123456'])
		expect(build({ k: 'ref_abc123' }).refs).toEqual(['ref_abc123'])
		expect(build({}).refs).toBeUndefined()
	})

	it.each([
		['abc12', undefined],
		['abc123', ['abc123']],
		['a'.repeat(128), ['a'.repeat(128)]],
		['a'.repeat(129), undefined],
	])('takes a key of 6 to 128 characters (%s)', (k, refs) => {
		expect(build({ k }).refs).toEqual(refs)
	})

	it('keeps a key sent twice once', () => {
		expect(build({ k: ['ref_abc123', 'ref_abc123', 'cs_live_1'] }).refs).toEqual(['ref_abc123', 'cs_live_1'])
	})

	it('records a ref-only beacon under its open visit, and writes nothing', () => {
		const open: OpenSession = { session_id: 's1', visitor_id: 'v1', next_visitor_id: null, last_at: NOW - 60_000, referrer: 'https://news.ycombinator.com/', referrer_host: 'news.ycombinator.com', source: 'Hacker News', channel: 'Social', utm_source: null, utm_medium: null, utm_campaign: 'launch', utm_term: null, utm_content: null }
		const ping = build({ n: 'engagement', u: 'https://a.com/pricing', k: 'ref_abc123' })
		const { rows, stmts, refs } = assignSessions([ping], [open])
		expect([rows, stmts]).toEqual([[], []])
		expect(refs).toHaveLength(1)
		expect([refs[0].session_id, refs[0].source, refs[0].utm_campaign, refs[0].pathname, refs[0].country]).toEqual(['s1', 'Hacker News', 'launch', '/pricing', 'ID'])
	})

	it('keeps the beacon own page and device when its visit has timed out', () => {
		const { refs } = assignSessions([build({ n: 'engagement', k: 'ref_abc123' })], [])
		expect([refs[0].session_id, refs[0].source, refs[0].country]).toEqual(['', 'Direct', 'ID'])
	})

	it('records a success page view as a visit event that also hands out its checkout id', () => {
		const { rows, refs } = assignSessions([build({ k: 'cs_live_1' })], [])
		expect(rows).toHaveLength(1)
		expect(refs).toEqual(rows)
	})
})

describe('payment rows', () => {
	const pay: Payment = { provider: 'stripe', kind: 'payment', id: 'cs_1', amount: 49, currency: 'USD', ts: NOW, keys: [], links: [], billing: 'one_time' }
	const visit = visitOf({ ...build({ r: 'https://news.ycombinator.com/item' }), session_id: 's1' })

	it('joins the visitor on the day of the visit, and only keeps the source after that', () => {
		const same = paymentRow(pay, 'a', visit)
		expect([same.event_id, same.name, same.visitor_id, same.session_id, same.source, same.country, same.revenue, same.props]).toEqual(['$stripe:a:cs_1', 'Payment', 'v1', 's1', 'Hacker News', 'ID', 49, '{"provider":"stripe","billing":"one_time"}'])
		const later = paymentRow({ ...pay, ts: NOW + DAY }, 'a', visit)
		expect([later.visitor_id, later.session_id, later.source]).toEqual(['', '', 'Hacker News'])
		const none = paymentRow(pay, 'a', null)
		expect([none.visitor_id, none.source, none.country, none.pathname]).toEqual(['', null, null, null])
	})

	it('writes a refund as negative revenue', () => {
		const r = paymentRow({ ...pay, kind: 'refund', id: 're_1', billing: undefined }, 'a', null)
		expect([r.name, r.revenue, r.props]).toEqual(['Refund', -49, '{"provider":"stripe"}'])
	})
})

describe('revenue reports with payments', () => {
	const scope: Scope = { siteId: 'a', filters: [], tz: 0, currency: 'USD' }
	const window = { from: NOW - DAY, to: NOW + DAY }

	async function shard() {
		const db = shardDb()
		const hn = { ...build({ r: 'https://news.ycombinator.com/item' }), session_id: '' }
		const google = { ...build({ r: 'https://www.google.com/' }), visitor_id: 'v2' }
		const { stmts, rows } = assignSessions([hn, google], [])
		for (const s of stmts) db.prepare(s.sql).run(...(s.params as never[]))
		const pay = (p: Partial<Payment>, v: EventRow | null) => {
			const s = insertEventStmt(paymentRow({ provider: 'stripe', kind: 'payment', id: 'x', amount: 0, currency: 'USD', ts: NOW + 1000, keys: [], links: [], ...p }, 'a', v && visitOf(v)))
			db.prepare(s.sql).run(...(s.params as never[]))
		}
		pay({ id: 'p1', amount: 50 }, rows[0])
		// a renewal from a visit weeks ago: its source, no visitor
		pay({ id: 'p2', amount: 20 }, { ...rows[1], ts: NOW - 40 * DAY })
		pay({ id: 'p3', amount: 30 }, null)
		pay({ id: 'r1', amount: 10, kind: 'refund' }, rows[0])
		return [{ run: runner(db), window }]
	}

	it('counts revenue net of refunds without adding visitors', async () => {
		const agg = await aggregate(await shard(), scope)
		expect([agg.visitors, agg.revenue, agg.average_revenue]).toEqual([2, 90, 30])
	})

	it('breaks revenue down by source, renewals and unattributed payments included', async () => {
		const b = await breakdown(await shard(), scope, 'source')
		expect(b.rows.map((r) => [r.key, r.visitors, r.revenue])).toEqual([
			['Google', 1, 20],
			['Hacker News', 1, 40],
			['(none)', 0, 30],
		])
	})

	it('counts a same-day payer as converting, in event breakdowns and funnels', async () => {
		const targets = await shard()
		const ev = await breakdown(targets, scope, 'event', { totalVisitors: 2 })
		expect(ev.rows.map((r) => [r.key, r.visitors, r.revenue])).toEqual([
			['Payment', 1, 100],
			['Refund', 1, -10],
		])
		const f = await funnel(targets, scope, [{ kind: 'page', match: '/' }, { kind: 'event', match: 'Payment' }])
		expect(f.steps.map((s) => s.visitors)).toEqual([2, 1])
	})
})
