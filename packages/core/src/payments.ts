import { REF_PATTERN, SESSION_ATTRS } from './ingest'
import { utcDay } from './time'
import type { EventRow } from './types'

/**
 * Payments from Stripe, Polar, Lemon Squeezy, Dodo Payments or your own server, in one
 * shape, so revenue can be credited to the visit that brought the buyer.
 *
 * Nothing is stored on the visitor's device. A payment finds its visit through a key the
 * tracker recorded during the visit: a misomoon ref handed to the checkout (metadata,
 * `client_reference_id`, Lemon Squeezy custom data), or the checkout or payment id that
 * the provider puts in the success page's URL. Once a payment has a visit, its
 * subscription and customer lead there too, so renewals and refunds follow.
 */
export const PROVIDERS = ['stripe', 'polar', 'lemonsqueezy', 'dodo', 'custom'] as const
export type Provider = (typeof PROVIDERS)[number]

export const isProvider = (p: string): p is Provider => (PROVIDERS as readonly string[]).includes(p)

/** Metadata key for a misomoon ref (`metadata[misomoon_ref]`, `checkout[custom][misomoon_ref]`). */
export const REF_KEY = 'misomoon_ref'

export interface Payment {
	provider: Provider
	/** link: no money moves, it only ties a subscription or customer to the visit */
	kind: 'payment' | 'refund' | 'link'
	/** the provider's id for this payment, refund or link, unique per provider */
	id: string
	/** major units, never negative: a refund is made negative when it is written */
	amount: number
	currency: string
	ts: number
	/** keys that may lead to the visit, strongest first */
	keys: string[]
	/** keys that lead to this payment's visit from now on (its payment, subscription and customer) */
	links: string[]
	billing?: 'one_time' | 'new' | 'renewal'
	/** set when `amount` is the payment's refunded total so far, not this refund alone */
	refundedTotalOf?: string
	/** a refund that failed or was canceled: it takes back nothing, even one counted before */
	failed?: true
}

export interface Parsed {
	/** a test-mode event: verified, but its money is not counted */
	test: boolean
	payments: Payment[]
}

type Json = Record<string, unknown>
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {})
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : null)
const int = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : null)
const keys = (...ks: (string | null | undefined | false)[]) => [...new Set(ks.filter((k): k is string => !!k))]
const link = (provider: Provider, kind: string, id: unknown) => {
	const s = str(id)
	return s ? `${provider}:${kind}:${s}` : null
}
const ref = (v: unknown) => {
	const s = str(v)
	return s && REF_PATTERN.test(s) ? s : null
}
const time = (v: unknown, fallback: number): number => {
	if (typeof v === 'number' && Number.isFinite(v)) return v < 1e11 ? v * 1000 : v
	if (typeof v === 'string') {
		const t = Date.parse(v)
		if (Number.isFinite(t)) return t
	}
	return fallback
}
const currencyOf = (v: unknown) => {
	const s = str(v)
	return s && /^[A-Za-z]{3}$/.test(s) ? s.toUpperCase() : null
}

// ---------------------------------------------------------------- amounts

// https://docs.stripe.com/currencies (2026-10): Stripe's own list, where ISK and UGX keep two decimals
const STRIPE_ZERO = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'])
const STRIPE_THREE = new Set(['BHD', 'JOD', 'KWD', 'OMR', 'TND'])
// ISO 4217 minor units, which the other providers follow. Not Intl: its CLDR data gives IDR no decimals.
const ISO_ZERO = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'PYG', 'RWF', 'UGX', 'UYI', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'])
const ISO_THREE = new Set(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND'])

/** Minor units (cents) to major units. */
export function toMajor(amount: number, currency: string, provider: Provider): number {
	const [zero, three] = provider === 'stripe' ? [STRIPE_ZERO, STRIPE_THREE] : [ISO_ZERO, ISO_THREE]
	const digits = zero.has(currency) ? 0 : three.has(currency) ? 3 : 2
	return Math.round((amount / 10 ** digits) * 1e6) / 1e6
}

// ---------------------------------------------------------------- providers

function money(provider: Provider, amount: unknown, currency: unknown): { amount: number; currency: string } | null {
	const a = int(amount)
	const c = currencyOf(currency)
	if (a == null || !c || a <= 0) return null
	return { amount: toMajor(a, c, provider), currency: c }
}

function stripe(e: Json, now: number): Parsed {
	const o = obj(obj(e.data).object)
	const test = e.livemode === false
	const at = time(o.created, now)
	const meta = obj(o.metadata)
	const cus = link('stripe', 'customer', o.customer)
	switch (e.type) {
		case 'checkout.session.completed':
		case 'checkout.session.async_payment_succeeded': {
			const id = str(o.id)
			if (!id) return { test, payments: [] }
			const found = keys(ref(meta[REF_KEY]), ref(o.client_reference_id), id)
			if (o.mode === 'subscription') {
				// the subscription's invoices carry the money; the session only says whose visit it was
				const sub = link('stripe', 'sub', o.subscription)
				return { test, payments: [{ provider: 'stripe', kind: 'link', id, amount: 0, currency: '', ts: at, keys: found, links: keys(sub, link('stripe', 'invoice', o.invoice), cus) }] }
			}
			if (o.mode !== 'payment' || o.payment_status !== 'paid') return { test, payments: [] }
			const m = money('stripe', o.amount_total, o.currency)
			if (!m) return { test, payments: [] }
			return { test, payments: [{ provider: 'stripe', kind: 'payment', id, ...m, ts: at, keys: found, links: keys(link('stripe', 'pi', o.payment_intent), cus), billing: 'one_time' }] }
		}
		case 'invoice.paid': {
			const id = str(o.id)
			const details = obj(obj(o.parent).subscription_details)
			const subId = str(details.subscription) ?? str(o.subscription)
			// Invoices outside a subscription are left alone: a Checkout payment that also
			// makes an invoice is counted from its session already.
			if (!id || !subId) return { test, payments: [] }
			const m = money('stripe', o.amount_paid, o.currency)
			if (!m) return { test, payments: [] }
			const subMeta = { ...obj(obj(o.subscription_details).metadata), ...obj(details.metadata) }
			const sub = link('stripe', 'sub', subId)
			const paid = time(obj(o.status_transitions).paid_at, at)
			return {
				test,
				payments: [
					{
						provider: 'stripe',
						kind: 'payment',
						id,
						...m,
						ts: paid,
						keys: keys(ref(subMeta[REF_KEY]), ref(meta[REF_KEY]), link('stripe', 'invoice', id), sub, cus),
						links: keys(link('stripe', 'pi', o.payment_intent), link('stripe', 'charge', o.charge), sub, cus),
						billing: o.billing_reason === 'subscription_create' ? 'new' : 'renewal',
					},
				],
			}
		}
		// a refund counts from refund.created; it can still fail up to 30 days later
		case 'refund.created':
		case 'refund.updated':
		case 'refund.failed': {
			const id = str(o.id)
			const failed = o.status === 'failed' || o.status === 'canceled'
			if (!id || (!failed && e.type !== 'refund.created')) return { test, payments: [] }
			const m = money('stripe', o.amount, o.currency)
			if (!m) return { test, payments: [] }
			const refund: Payment = { provider: 'stripe', kind: 'refund', id, ...m, ts: at, keys: keys(link('stripe', 'pi', o.payment_intent), link('stripe', 'charge', o.charge)), links: [] }
			return { test, payments: [failed ? { ...refund, failed: true } : refund] }
		}
	}
	return { test, payments: [] }
}

const POLAR_BILLING: Record<string, Payment['billing']> = { purchase: 'one_time', subscription_create: 'new', subscription_cycle: 'renewal', subscription_update: 'renewal', subscription_meter_cycle: 'renewal' }

function polar(e: Json, now: number): Parsed {
	const o = obj(e.data)
	const meta = obj(o.metadata)
	const sub = link('polar', 'sub', o.subscription_id)
	const cus = link('polar', 'customer', o.customer_id)
	const at = time(o.created_at, now)
	const id = str(o.id)
	if (!id) return { test: false, payments: [] }
	if (e.type === 'order.paid') {
		const m = money('polar', o.total_amount, o.currency)
		if (!m) return { test: false, payments: [] }
		return {
			test: false,
			payments: [
				{
					provider: 'polar',
					kind: 'payment',
					id,
					...m,
					ts: at,
					// a checkout link's ?reference_id= lands in the order's metadata
					keys: keys(ref(meta[REF_KEY]), ref(meta.reference_id), ref(o.checkout_id), sub, cus),
					links: keys(link('polar', 'order', id), sub, cus),
					billing: POLAR_BILLING[String(o.billing_reason)] ?? 'one_time',
				},
			],
		}
	}
	const failed = o.status === 'failed' || o.status === 'canceled'
	if ((e.type === 'refund.created' || e.type === 'refund.updated') && (o.status === 'succeeded' || failed)) {
		const m = money('polar', (int(o.amount) ?? 0) + (int(o.tax_amount) ?? 0), o.currency)
		if (!m) return { test: false, payments: [] }
		const refund: Payment = { provider: 'polar', kind: 'refund', id, ...m, ts: time(o.modified_at, at), keys: keys(link('polar', 'order', o.order_id), sub, cus), links: [] }
		return { test: false, payments: [failed ? { ...refund, failed: true } : refund] }
	}
	return { test: false, payments: [] }
}

function lemonsqueezy(e: Json, now: number): Parsed {
	const meta = obj(e.meta)
	const data = obj(e.data)
	const a = obj(data.attributes)
	const test = a.test_mode === true
	const custom = obj(meta.custom_data)
	const id = str(data.id)
	if (!id) return { test, payments: [] }
	const cus = link('lemonsqueezy', 'customer', a.customer_id)
	const at = time(a.created_at, now)
	switch (meta.event_name) {
		case 'order_created': {
			if (a.status !== 'paid') return { test, payments: [] }
			const m = money('lemonsqueezy', a.total, a.currency)
			if (!m) return { test, payments: [] }
			return { test, payments: [{ provider: 'lemonsqueezy', kind: 'payment', id: `order:${id}`, ...m, ts: at, keys: keys(ref(custom[REF_KEY]), cus), links: keys(link('lemonsqueezy', 'order', id), cus) }] }
		}
		case 'subscription_created':
			return {
				test,
				payments: [{ provider: 'lemonsqueezy', kind: 'link', id: `sub:${id}`, amount: 0, currency: '', ts: at, keys: keys(ref(custom[REF_KEY]), link('lemonsqueezy', 'order', a.order_id), cus), links: keys(link('lemonsqueezy', 'sub', id), cus) }],
			}
		case 'subscription_payment_success': {
			// the first payment is the order_created that started the subscription
			if (a.billing_reason === 'initial' || a.status !== 'paid') return { test, payments: [] }
			const m = money('lemonsqueezy', a.total, a.currency)
			if (!m) return { test, payments: [] }
			const sub = link('lemonsqueezy', 'sub', a.subscription_id)
			return { test, payments: [{ provider: 'lemonsqueezy', kind: 'payment', id: `invoice:${id}`, ...m, ts: at, keys: keys(ref(custom[REF_KEY]), sub, cus), links: keys(link('lemonsqueezy', 'invoice', id), sub, cus), billing: 'renewal' }] }
		}
		case 'order_refunded':
		case 'subscription_payment_refunded': {
			// Lemon Squeezy sends the refunded total so far, so one refund is the change since the last one.
			const of = meta.event_name === 'order_refunded' ? `order:${id}` : `invoice:${id}`
			const m = money('lemonsqueezy', a.refunded_amount, a.currency)
			if (!m) return { test, payments: [] }
			const via = meta.event_name === 'order_refunded' ? link('lemonsqueezy', 'order', id) : link('lemonsqueezy', 'invoice', id)
			return { test, payments: [{ provider: 'lemonsqueezy', kind: 'refund', id: `refund:${of}:${int(a.refunded_amount)}`, ...m, ts: time(a.refunded_at, now), keys: keys(via, cus), links: [], refundedTotalOf: of }] }
		}
	}
	return { test, payments: [] }
}

const DODO_BILLING: Record<string, Payment['billing']> = { new: 'new', renewal: 'renewal', plan_change: 'renewal', on_demand: 'renewal' }

function dodo(e: Json, now: number): Parsed {
	const o = obj(e.data)
	const at = time(o.created_at, time(e.timestamp, now))
	if (e.type === 'payment.succeeded') {
		const id = str(o.payment_id)
		const m = money('dodo', o.total_amount, o.currency)
		if (!id || !m) return { test: false, payments: [] }
		const meta = obj(o.metadata)
		const subId = str(o.subscription_id)
		const sub = link('dodo', 'sub', subId)
		const cus = link('dodo', 'customer', obj(o.customer).customer_id)
		return {
			test: false,
			payments: [
				{
					provider: 'dodo',
					kind: 'payment',
					id,
					...m,
					ts: at,
					// the return URL carries payment_id or subscription_id; a link's ?metadata_misomoon_ref= may keep its prefix
					keys: keys(ref(meta[REF_KEY]), ref(meta[`metadata_${REF_KEY}`]), ref(id), ref(subId), ref(o.checkout_session_id), sub, cus),
					links: keys(link('dodo', 'payment', id), sub, cus),
					billing: o.charge_type == null ? (subId ? 'new' : 'one_time') : (DODO_BILLING[String(o.charge_type)] ?? 'renewal'),
				},
			],
		}
	}
	if (e.type === 'refund.succeeded') {
		const id = str(o.refund_id)
		const m = money('dodo', o.amount, o.currency)
		if (!id || !m) return { test: false, payments: [] }
		return { test: false, payments: [{ provider: 'dodo', kind: 'refund', id, ...m, ts: at, keys: keys(link('dodo', 'payment', o.payment_id)), links: [] }] }
	}
	return { test: false, payments: [] }
}

export class PaymentError extends Error {
	status = 400
}

/**
 * Your own server's payments:
 * `{"type": "payment", "id": "ord_1", "amount": 49.9, "currency": "EUR", "ref": "…", "customer": "c_9", "subscription": "s_3"}`
 * or `{"type": "refund", "id": "rf_1", "amount": 10, "currency": "EUR", "refund_of": "ord_1"}`.
 * Amounts are in major units (49.9 is €49.90).
 */
function custom(e: Json, now: number): Parsed {
	const type = e.type ?? 'payment'
	const id = str(e.id)
	if (type !== 'payment' && type !== 'refund') throw new PaymentError('type must be "payment" or "refund"')
	if (!id || id.length > 200) throw new PaymentError('id is required, up to 200 characters')
	const amount = int(e.amount)
	if (amount == null || amount <= 0 || amount > 1e9) throw new PaymentError('amount must be a positive number in major units (49.9 for 49.90)')
	const currency = currencyOf(e.currency)
	if (!currency) throw new PaymentError('currency must be a 3-letter ISO 4217 code')
	const cus = link('custom', 'customer', e.customer)
	const sub = link('custom', 'sub', e.subscription)
	const ts = time(e.ts, now)
	if (type === 'refund') {
		const of = str(e.refund_of)
		if (!of) throw new PaymentError('a refund needs refund_of: the id of the payment it returns')
		return { test: e.test === true, payments: [{ provider: 'custom', kind: 'refund', id, amount, currency, ts, keys: keys(link('custom', 'payment', of), sub, cus), links: [] }] }
	}
	const billing = e.billing === 'new' || e.billing === 'renewal' || e.billing === 'one_time' ? e.billing : sub ? 'renewal' : 'one_time'
	return { test: e.test === true, payments: [{ provider: 'custom', kind: 'payment', id, amount, currency, ts, keys: keys(ref(e.ref), sub, cus), links: keys(link('custom', 'payment', id), sub, cus), billing }] }
}

/** Reads a verified webhook body. Unknown event types give no payments. */
export function parsePayments(provider: Provider, body: unknown, now = Date.now()): Parsed {
	const e = obj(body)
	switch (provider) {
		case 'stripe':
			return stripe(e, now)
		case 'polar':
			return polar(e, now)
		case 'lemonsqueezy':
			return lemonsqueezy(e, now)
		case 'dodo':
			return dodo(e, now)
		case 'custom':
			return custom(e, now)
	}
}

// ---------------------------------------------------------------- signatures

const enc = new TextEncoder()
const TOLERANCE = 5 * 60 * 1000

function fromHex(hex: string): Uint8Array | null {
	if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) return null
	return new Uint8Array(hex.match(/../g)!.map((b) => parseInt(b, 16)))
}
function fromBase64(b64: string): Uint8Array | null {
	try {
		return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
	} catch {
		return null
	}
}
/** crypto.subtle.verify compares in constant time. */
async function hmacVerify(key: Uint8Array, signature: Uint8Array, data: string): Promise<boolean> {
	const k = await crypto.subtle.importKey('raw', key as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
	return crypto.subtle.verify('HMAC', k, signature as BufferSource, enc.encode(data))
}
async function anyValid(key: Uint8Array, signatures: (Uint8Array | null)[], data: string) {
	for (const s of signatures) if (s && (await hmacVerify(key, s, data))) return true
	return false
}

/** `Stripe-Signature: t=…,v1=…[,v1=…]` over `${t}.${body}`, hex. */
async function verifyStripe(secret: string, headers: Headers, body: string, now: number) {
	const parts = (headers.get('stripe-signature') ?? '').split(',').map((p) => p.trim().split('='))
	const t = Number(parts.find(([k]) => k === 't')?.[1])
	if (!Number.isFinite(t) || Math.abs(now - t * 1000) > TOLERANCE) return false
	const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => fromHex(v ?? ''))
	return anyValid(enc.encode(secret), sigs, `${t}.${body}`)
}

/** Standard Webhooks (Polar, Dodo): `v1,<base64>` entries over `${id}.${timestamp}.${body}`. */
async function verifyStandard(secret: string, headers: Headers, body: string, now: number, rawKeyToo: boolean) {
	const id = headers.get('webhook-id')
	const ts = Number(headers.get('webhook-timestamp'))
	if (!id || !Number.isFinite(ts) || Math.abs(now - ts * 1000) > TOLERANCE) return false
	const sigs = (headers.get('webhook-signature') ?? '').split(' ').map((s) => (s.startsWith('v1,') ? fromBase64(s.slice(3)) : null))
	const data = `${id}.${ts}.${body}`
	const decoded = fromBase64(secret.replace(/^whsec_/, ''))
	if (decoded && (await anyValid(decoded, sigs, data))) return true
	// Polar secrets made before 2026-09-08 sign with the secret's own bytes, prefix included.
	return rawKeyToo && anyValid(enc.encode(secret), sigs, data)
}

/** Lemon Squeezy: `X-Signature`, hex HMAC of the body. */
async function verifyLemon(secret: string, headers: Headers, body: string) {
	return anyValid(enc.encode(secret), [fromHex(headers.get('x-signature') ?? '')], body)
}

/** Your server: `X-Misomoon-Signature: sha256=<hex HMAC of the body>`, or the secret as a bearer token. */
async function verifyCustom(secret: string, headers: Headers, body: string) {
	const sig = headers.get('x-misomoon-signature')
	if (sig) return anyValid(enc.encode(secret), [fromHex(sig.replace(/^sha256=/, ''))], body)
	const bearer = (headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
	if (!bearer) return false
	// verifying an HMAC of the secret against the token compares in constant time, whatever the lengths
	const k = await crypto.subtle.importKey('raw', crypto.getRandomValues(new Uint8Array(32)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
	const expected = await crypto.subtle.sign('HMAC', k, enc.encode(secret))
	return crypto.subtle.verify('HMAC', k, expected, enc.encode(bearer))
}

/** Checks that a webhook came from the provider holding `secret`. */
export function verifyWebhook(provider: Provider, secret: string, headers: Headers, body: string, now = Date.now()): Promise<boolean> {
	switch (provider) {
		case 'stripe':
			return verifyStripe(secret, headers, body, now)
		case 'polar':
			return verifyStandard(secret, headers, body, now, true)
		case 'dodo':
			return verifyStandard(secret, headers, body, now, false)
		case 'lemonsqueezy':
			return verifyLemon(secret, headers, body)
		case 'custom':
			return verifyCustom(secret, headers, body)
	}
}

// ---------------------------------------------------------------- visits

/** What a key remembers about the visit it came from: the visit's columns, as on its events. */
export type Visit = Pick<EventRow, 'visitor_id' | 'session_id' | 'ts' | 'pathname' | (typeof SESSION_ATTRS)[number]>

export function visitOf(row: EventRow): Visit {
	const v = { visitor_id: row.visitor_id, session_id: row.session_id, ts: row.ts, pathname: row.pathname } as Visit
	for (const k of SESSION_ATTRS) (v as Record<string, unknown>)[k] = row[k] ?? null
	return v
}

/** Event names for money that moved through a payment provider. */
export const PAYMENT_EVENTS = { payment: 'Payment', refund: 'Refund' } as const

/**
 * The event row for a payment or refund. With a visit, it carries the visit's source,
 * place and device; it joins the visitor only on the UTC day of the visit, because
 * visitor ids change every day. Without one, every visit column is empty.
 */
export function paymentRow(p: Payment, siteId: string, visit: Visit | null, refundAmount = p.amount): EventRow {
	const sameDay = visit != null && utcDay(visit.ts) === utcDay(p.ts)
	const row = {
		// provider ids are unique per provider, not per site: one Stripe account can feed two sites
		event_id: `$${p.provider}:${siteId}:${p.id}`,
		site_id: siteId,
		ts: p.ts,
		name: p.kind === 'refund' ? PAYMENT_EVENTS.refund : PAYMENT_EVENTS.payment,
		visitor_id: sameDay ? visit.visitor_id : '',
		session_id: sameDay ? visit.session_id : '',
		pathname: visit?.pathname ?? null,
		title: null,
		viewport: null,
		engaged_ms: null,
		scroll_depth: null,
		lcp: null,
		inp: null,
		cls: null,
		fcp: null,
		ttfb: null,
		revenue: p.kind === 'refund' ? -refundAmount : p.amount,
		currency: p.currency,
		props: JSON.stringify(p.billing ? { provider: p.provider, billing: p.billing } : { provider: p.provider }),
	} as EventRow
	for (const k of SESSION_ATTRS) (row as unknown as Record<string, unknown>)[k] = visit ? (visit[k] ?? null) : null
	return row
}
