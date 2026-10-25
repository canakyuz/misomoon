import { can, planById, PLANS, plansOn, verifyWebhook, type Plan, type PlanId } from '@misomoon/core'
import { requireUser, teamRole, type Principal } from './auth'
import { HttpError } from './control'

/**
 * misomoon Cloud billing through Polar (polar.sh), the merchant of record: a checkout for
 * a plan, a switch of the plan a team pays for, the customer portal, and the subscription
 * webhooks that set `teams.plan`. Only with PLANS=on and the Polar settings
 * (docs/billing.md). revenue.ts is a separate feature: customers' webhooks for their own sales.
 *
 * A team's plan follows its newest live subscription. Every subscription is kept in
 * polar_subscriptions in the newest state Polar sent, ordered by Polar's modified_at, so a
 * webhook that arrives late changes nothing. A team that never had a subscription keeps the
 * plan support set by hand.
 */

/** The Polar API version of every request; the webhook endpoint in Polar uses it too. */
export const POLAR_VERSION = '2026-10'
/** POLAR_SERVER's API: unset is production. Anything but sandbox and production is a mistake, and turns billing off. */
const apiOf = (server: string | undefined) => {
	const name = server?.trim() || 'production'
	return name === 'production' ? 'https://api.polar.sh' : name === 'sandbox' ? 'https://sandbox-api.polar.sh' : null
}
const PRODUCT_VARS: Record<PlanId, 'POLAR_PRODUCT_STARTER' | 'POLAR_PRODUCT_GROWTH' | 'POLAR_PRODUCT_SCALE'> = {
	starter: 'POLAR_PRODUCT_STARTER',
	growth: 'POLAR_PRODUCT_GROWTH',
	scale: 'POLAR_PRODUCT_SCALE',
}
/** what teams.plan_status holds: the subscription pays (active), Polar retries a failed payment (past_due), or it ends at period_end (canceled) */
export type PlanStatus = 'active' | 'past_due' | 'canceled'

interface Polar {
	token: string
	secret: string
	api: string
	/** each plan's Polar product id */
	products: Record<PlanId, string>
}

/** The settings billing lacks, by name; empty when it is set up. */
function lacking(env: Env): string[] {
	const names = ['POLAR_ACCESS_TOKEN', 'POLAR_WEBHOOK_SECRET', ...Object.values(PRODUCT_VARS)] as const
	const lack: string[] = names.filter((k) => !env[k]?.trim())
	if (!apiOf(env.POLAR_SERVER)) lack.push('POLAR_SERVER (sandbox or production)')
	return lack
}

/** The Polar settings, or null when this server takes no payments: PLANS isn't on, or a setting is missing. */
function polarConfig(env: Env): Polar | null {
	if (!plansOn(env.PLANS) || lacking(env).length) return null
	const products = Object.fromEntries(PLANS.map((p) => [p.id, env[PRODUCT_VARS[p.id]]!.trim()])) as Record<PlanId, string>
	return { token: env.POLAR_ACCESS_TOKEN!.trim(), secret: env.POLAR_WEBHOOK_SECRET!.trim(), api: apiOf(env.POLAR_SERVER)!, products }
}

/** Whether teams can pay for a plan here: PLANS=on and every Polar setting. /me says it as `billing`. */
export const billingOn = (env: Env) => polarConfig(env) !== null

/** The Polar settings, or the error every billing route answers without them. */
function requirePolar(env: Env): Polar {
	if (!plansOn(env.PLANS)) throw new HttpError(404, 'this server has no paid plans')
	const polar = polarConfig(env)
	if (!polar) throw new HttpError(501, `billing needs ${lacking(env).join(', ')} (docs/billing.md)`)
	return polar
}

/** The plan a Polar product is, or null for a product that is none of the plans. */
const planOfProduct = (polar: Polar, productId: string): Plan | null => PLANS.find((p) => polar.products[p.id] === productId) ?? null

/** Who may pay for a team: a signed-in owner or billing member (the `billing` permission). */
async function billingUser(env: Env, who: Principal, teamId: string): Promise<string> {
	const userId = requireUser(who)
	const role = await teamRole(env, userId, teamId)
	if (!role) throw new HttpError(404, 'team not found')
	if (!can(role, 'billing')) throw new HttpError(403, `a team ${role} cannot manage billing; ask an owner or a billing member`)
	return userId
}

// ---------------------------------------------------------------- the Polar API

/** An error answer from Polar: its status, Polar's `error` name, and its `detail` as text (a list for a validation error). */
class PolarError extends Error {
	constructor(
		public status: number,
		public error: string | null,
		message: string,
		public detailText: string,
	) {
		super(message)
	}
}

async function call<T>(polar: Polar, method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<T> {
	let res: Response
	try {
		res = await fetch(polar.api + path, {
			method,
			headers: { authorization: `Bearer ${polar.token}`, 'content-type': 'application/json', accept: 'application/json', 'polar-version': POLAR_VERSION },
			body: body === undefined ? undefined : JSON.stringify(body),
			signal: AbortSignal.timeout(10_000),
		})
	} catch (e) {
		console.error(JSON.stringify({ msg: 'polar request failed', method, path, error: String(e) }))
		throw new HttpError(502, 'Polar did not answer; try again in a minute')
	}
	if (res.ok) return (await res.json()) as T
	const answer = (await res.json().catch(() => null)) as { error?: unknown; detail?: unknown } | null
	const detail = typeof answer?.detail === 'string' ? answer.detail : `Polar answered ${res.status}`
	console.error(JSON.stringify({ msg: 'polar error', method, path, status: res.status, error: answer?.error ?? null, detail: answer?.detail ?? null }))
	throw new PolarError(res.status, typeof answer?.error === 'string' ? answer.error : null, detail, JSON.stringify(answer?.detail ?? null))
}

/** What a route answers for a Polar error. */
function failed(e: unknown): never {
	if (!(e instanceof PolarError)) throw e
	if (e.status === 402) throw new HttpError(402, 'Polar could not charge the card for this change, so nothing changed. Update the card in Manage billing, then try again.', 'payment_failed')
	if (e.status === 403 || e.status === 404 || e.status === 409) throw new HttpError(409, `Polar refused the change: ${e.message}`)
	throw new HttpError(502, `Polar refused the request: ${e.message}`)
}

/** A GET that answers null for Polar's 404, so a missing object is no error. */
async function find<T>(polar: Polar, path: string): Promise<T | null> {
	try {
		return await call<T>(polar, 'GET', path)
	} catch (e) {
		if (e instanceof PolarError && e.status === 404) return null
		throw e
	}
}

/** The fields of a Polar Subscription that billing reads. Times are ISO strings. */
interface Subscription {
	id: string
	customer_id: string
	product_id: string
	status: string
	cancel_at_period_end: boolean
	current_period_end: string | null
	ends_at: string | null
	ended_at: string | null
	started_at: string | null
	created_at: string
	modified_at: string | null
	metadata: Record<string, unknown>
	pending_update: { product_id: string | null; applies_at: string } | null
	/** the checkout that made it */
	checkout_id: string | null
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : null)

/** A Subscription from a webhook or an answer, or null when it lacks what billing reads. */
function readSubscription(data: unknown): Subscription | null {
	const d = data as Record<string, unknown> | null
	if (!d || typeof d !== 'object') return null
	const [id, customer, product, status, created] = [str(d.id), str(d.customer_id), str(d.product_id), str(d.status), str(d.created_at)]
	if (!id || !customer || !product || !status || !created) return null
	const pending = d.pending_update as Record<string, unknown> | null | undefined
	return {
		id,
		customer_id: customer,
		product_id: product,
		status,
		cancel_at_period_end: d.cancel_at_period_end === true,
		current_period_end: str(d.current_period_end),
		ends_at: str(d.ends_at),
		ended_at: str(d.ended_at),
		started_at: str(d.started_at),
		created_at: created,
		modified_at: str(d.modified_at),
		metadata: d.metadata && typeof d.metadata === 'object' ? (d.metadata as Record<string, unknown>) : {},
		pending_update: pending && typeof pending === 'object' && str(pending.applies_at) ? { product_id: str(pending.product_id), applies_at: str(pending.applies_at)! } : null,
		checkout_id: str(d.checkout_id),
	}
}

/** A Polar time in ms, or null. */
function ms(iso: string | null): number | null {
	const t = iso ? Date.parse(iso) : NaN
	return Number.isFinite(t) ? t : null
}

/** A Polar time in microseconds, so two changes within one millisecond still come in order. */
export function micros(iso: string | null): number | null {
	const t = ms(iso)
	if (t === null) return null
	const fraction = /\.(\d+)/.exec(iso!)?.[1] ?? ''
	return t * 1000 + Number(fraction.padEnd(6, '0').slice(3, 6))
}

/**
 * Polar statuses that pay for a plan: active, trialing, and past_due while Polar retries a
 * failed payment. canceled and unpaid have ended; incomplete and paused pay for nothing.
 */
const PAYING = new Set(['active', 'trialing', 'past_due'])

/** How a subscription stands for its team: whether it pays for a plan, the team's plan_status, and the end of the paid period. */
export function standing(sub: Subscription): { live: boolean; status: PlanStatus | null; periodEnd: number | null } {
	const live = PAYING.has(sub.status) && !sub.ended_at
	const status: PlanStatus | null = !live ? null : sub.status === 'past_due' ? 'past_due' : sub.cancel_at_period_end ? 'canceled' : 'active'
	return { live, status, periodEnd: ms(sub.cancel_at_period_end ? (sub.ends_at ?? sub.current_period_end) : sub.current_period_end) }
}

// ---------------------------------------------------------------- the team's plan

const WEBHOOK_DAYS = 30

/**
 * Sets the team `?1` from its newest live subscription, or ends a plan a subscription set
 * when none is left; a plan support set by hand stays. Its customer stays too, for the
 * portal's invoices, unless `?2` brings one. `guard` limits it further.
 */
const follow = (guard = '') =>
	`WITH cur AS (SELECT id, customer_id, plan, plan_status, period_end FROM polar_subscriptions WHERE team_id = ?1 AND live = 1 ORDER BY started_at DESC, id DESC LIMIT 1)
	 UPDATE teams SET
	   plan = CASE WHEN EXISTS (SELECT 1 FROM cur) THEN (SELECT plan FROM cur) WHEN polar_subscription_id IS NULL THEN plan END,
	   plan_status = CASE WHEN EXISTS (SELECT 1 FROM cur) THEN (SELECT plan_status FROM cur) WHEN polar_subscription_id IS NULL THEN plan_status END,
	   plan_period_end = CASE WHEN EXISTS (SELECT 1 FROM cur) THEN (SELECT period_end FROM cur) WHEN polar_subscription_id IS NULL THEN plan_period_end END,
	   polar_subscription_id = (SELECT id FROM cur),
	   polar_customer_id = COALESCE((SELECT customer_id FROM cur), ?2, polar_customer_id)
	 WHERE id = ?1${guard}`

/**
 * Stores `sub` in its newest state and sets the team's plan from its newest live
 * subscription, in one batch, so two webhooks for a team can't interleave. With
 * `webhookId`, the batch also records the webhook, and fails as a duplicate when it was
 * handled before. A state older than the stored one changes nothing. When the team has no
 * live subscription left, its plan ends (NULL) if a subscription set it, and stays as
 * support set it otherwise.
 */
async function record(env: Env, teamId: string, sub: Subscription, plan: Plan, webhookId?: string): Promise<'duplicate' | 'done'> {
	const s = standing(sub)
	const modified = micros(sub.modified_at ?? sub.created_at)!
	const now = Date.now()
	const db = env.CONTROL
	const stmts = [
		db
			.prepare(
				`INSERT INTO polar_subscriptions (id, team_id, customer_id, plan, status, live, plan_status, period_end, started_at, modified_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				 ON CONFLICT (id) DO UPDATE SET customer_id = excluded.customer_id, plan = excluded.plan, status = excluded.status, live = excluded.live,
				   plan_status = excluded.plan_status, period_end = excluded.period_end, modified_at = excluded.modified_at
				 WHERE excluded.modified_at >= polar_subscriptions.modified_at`,
			)
			.bind(sub.id, teamId, sub.customer_id, plan.id, sub.status, s.live ? 1 : 0, s.status, s.periodEnd, ms(sub.started_at) ?? ms(sub.created_at) ?? now, modified),
		// only when the state above is the stored one: a late webhook leaves the team alone
		db.prepare(follow(' AND EXISTS (SELECT 1 FROM polar_subscriptions WHERE id = ?3 AND modified_at = ?4)')).bind(teamId, sub.customer_id, sub.id, modified),
		// the team's last checkout made this subscription, so it no longer holds a new checkout back
		db.prepare('UPDATE teams SET polar_checkout_id = NULL WHERE id = ? AND polar_checkout_id = ?').bind(teamId, sub.checkout_id),
	]
	if (webhookId) {
		stmts.unshift(db.prepare('INSERT INTO polar_webhooks (id, received_at) VALUES (?, ?)').bind(webhookId, now))
		stmts.push(db.prepare('DELETE FROM polar_webhooks WHERE received_at < ?').bind(now - WEBHOOK_DAYS * 86_400_000))
	}
	try {
		await db.batch(stmts)
	} catch (e) {
		// the same webhook, delivered twice at once
		if (webhookId && /UNIQUE constraint failed: polar_webhooks/.test(String(e))) return 'duplicate'
		throw e
	}
	const { results } = await db.prepare('SELECT id FROM polar_subscriptions WHERE team_id = ? AND live = 1').bind(teamId).all<{ id: string }>()
	if (results.length > 1) console.error(JSON.stringify({ msg: 'team pays for more than one subscription', team: teamId, subscriptions: results.map((r) => r.id) }))
	return 'done'
}

/** A subscription Polar no longer has: it pays for nothing, and the team follows the rest. */
async function forget(env: Env, teamId: string, subId: string) {
	await env.CONTROL.batch([
		env.CONTROL.prepare('UPDATE polar_subscriptions SET live = 0, plan_status = NULL WHERE id = ?').bind(subId),
		env.CONTROL.prepare(follow()).bind(teamId, null),
	])
	console.error(JSON.stringify({ msg: 'polar subscription gone', team: teamId, subscription: subId }))
}

/** How long a checkout that took the card holds off a second one while its subscription shows up. */
const CHECKOUT_HOLD = 3_600_000

/**
 * The subscription that pays for a team, as Polar has it now, recorded; or null. `gone` is
 * the team's subscription when Polar answered 404 for it. A new checkout is safe only after
 * this: it finds a subscription whose webhook hasn't come, by the team id it carries in its
 * metadata, and answers 409 while the team's last checkout is still taking the payment.
 */
async function paying(env: Env, polar: Polar, teamId: string, team: { polar_subscription_id: string | null; polar_checkout_id: string | null }): Promise<{ sub: Subscription | null; gone: string | null }> {
	let gone: string | null = null
	if (team.polar_subscription_id) {
		const sub = readSubscription(await find(polar, `/v1/subscriptions/${encodeURIComponent(team.polar_subscription_id)}`))
		const plan = sub && planOfProduct(polar, sub.product_id)
		if (!sub) gone = team.polar_subscription_id
		else if (plan) {
			// it may have ended without a webhook reaching us
			await record(env, teamId, sub, plan)
			if (standing(sub).live) return { sub, gone }
		}
	}
	const query = new URLSearchParams({ 'metadata[team_id]': teamId, limit: '10' })
	for (const status of PAYING) query.append('status', status)
	const list = await call<{ items?: unknown }>(polar, 'GET', `/v1/subscriptions/?${query}`)
	// newest first, Polar's default order
	for (const item of Array.isArray(list.items) ? list.items : []) {
		const sub = readSubscription(item)
		const plan = sub && sub.id !== gone && standing(sub).live && planOfProduct(polar, sub.product_id)
		if (!sub || !plan) continue
		await record(env, teamId, sub, plan)
		return { sub, gone }
	}
	if (team.polar_checkout_id) {
		const last = await find<{ status?: unknown; created_at?: unknown }>(polar, `/v1/checkouts/${encodeURIComponent(team.polar_checkout_id)}`)
		const recent = Date.now() - (ms(str(last?.created_at)) ?? 0) < CHECKOUT_HOLD
		if (recent && (last?.status === 'confirmed' || last?.status === 'succeeded')) {
			throw new HttpError(409, 'Polar is still taking the payment for this team. The plan shows here within a minute; choose again only if it does not.', 'payment_pending')
		}
	}
	return { sub: null, gone }
}

/** The team's plan after a change: what POST /checkout answers for a switch. */
interface PlanState {
	url: null
	plan: PlanId | null
	plan_status: PlanStatus | null
	plan_period_end: number | null
	/** a switch Polar applies when the paid period ends (proration `next_period`) */
	pending: { plan: PlanId | null; applies_at: number | null } | null
}

async function stateOf(env: Env, polar: Polar, teamId: string, sub: Subscription): Promise<PlanState> {
	const row = await env.CONTROL.prepare('SELECT plan, plan_status, plan_period_end FROM teams WHERE id = ?')
		.bind(teamId)
		.first<{ plan: PlanId | null; plan_status: PlanStatus | null; plan_period_end: number | null }>()
	const next = sub.pending_update?.product_id ? planOfProduct(polar, sub.pending_update.product_id) : null
	return { url: null, plan: row?.plan ?? null, plan_status: row?.plan_status ?? null, plan_period_end: row?.plan_period_end ?? null, pending: sub.pending_update ? { plan: next?.id ?? null, applies_at: ms(sub.pending_update.applies_at) } : null }
}

/** The dashboard's team settings: on a site of the team, which the Team tab needs. */
async function settingsUrl(env: Env, origin: string, teamId: string): Promise<string> {
	const site = await env.CONTROL.prepare('SELECT id FROM sites WHERE team_id = ? ORDER BY created_at LIMIT 1').bind(teamId).first<{ id: string }>()
	return `${origin}/?${new URLSearchParams({ ...(site ? { site: site.id } : {}), view: 'settings', tab: 'team' })}`
}

// ---------------------------------------------------------------- routes

/**
 * POST /api/v1/teams/:team/checkout. A team that pays for a subscription switches it to the
 * plan's product, with the proration the Polar organization sets; a canceled subscription
 * that is still running is resumed first. Any other team gets a Polar checkout for the
 * plan's product, with the team id in its metadata and the user's email filled in:
 * `{ url }`, to open. paying() looks in Polar first, so a team never pays twice.
 */
export async function checkout(env: Env, who: Principal, teamId: string, body: unknown, origin: string): Promise<{ url: string } | PlanState> {
	const polar = requirePolar(env)
	const userId = await billingUser(env, who, teamId)
	const plan = planById((body as { plan?: unknown } | null)?.plan)
	if (!plan) throw new HttpError(400, `plan is ${PLANS.map((p) => p.id).join(', ')}`)
	const row = await env.CONTROL.prepare('SELECT polar_subscription_id, polar_checkout_id FROM teams WHERE id = ?')
		.bind(teamId)
		.first<{ polar_subscription_id: string | null; polar_checkout_id: string | null }>()
	const { sub: live, gone } = await paying(env, polar, teamId, row ?? { polar_subscription_id: null, polar_checkout_id: null }).catch(failed)
	if (live) {
		const path = `/v1/subscriptions/${encodeURIComponent(live.id)}`
		const product = polar.products[plan.id]
		try {
			let sub: Subscription | null = live
			if (sub.cancel_at_period_end) sub = readSubscription(await call(polar, 'PATCH', path, { cancel_at_period_end: false }))
			// no proration_behavior: the organization's setting applies, as in the customer portal
			if (sub && sub.product_id !== product) sub = readSubscription(await call(polar, 'PATCH', path, { product_id: product }))
			else if (sub?.pending_update) sub = readSubscription(await call(polar, 'PATCH', path, { pending_update: null }))
			if (!sub) throw new HttpError(502, 'Polar answered without the subscription')
			const current = planOfProduct(polar, sub.product_id)
			if (current) await record(env, teamId, sub, current)
			return stateOf(env, polar, teamId, sub)
		} catch (e) {
			failed(e)
		}
	}
	// read after paying(), which may have recorded the team's customer
	const team = await env.CONTROL.prepare('SELECT polar_customer_id FROM teams WHERE id = ?').bind(teamId).first<{ polar_customer_id: string | null }>()
	const user = await env.CONTROL.prepare('SELECT email FROM users WHERE id = ?').bind(userId).first<{ email: string }>()
	const back = await settingsUrl(env, origin, teamId)
	const open = (who: { customer_id: string } | { customer_email?: string }) =>
		call<{ id?: unknown; url?: unknown }>(polar, 'POST', '/v1/checkouts/', {
			products: [polar.products[plan.id]],
			success_url: `${back}&checkout_id={CHECKOUT_ID}`,
			return_url: back,
			metadata: { team_id: teamId },
			...who,
		})
	const created = await (team?.polar_customer_id ? open({ customer_id: team.polar_customer_id }) : open({ customer_email: user?.email }))
		.catch((e) => {
			// Polar refuses an email whose domain has no DNS: the checkout asks for one instead
			if (e instanceof PolarError && e.status === 422 && /customer_email/.test(String(e.detailText))) return open({})
			throw e
		})
		.catch(failed)
	if (typeof created.url !== 'string') throw new HttpError(502, 'Polar answered without a checkout URL')
	await env.CONTROL.prepare('UPDATE teams SET polar_checkout_id = ? WHERE id = ?').bind(str(created.id), teamId).run()
	// Polar took this checkout, so the token and the organization are right: its 404 for the
	// old subscription means the subscription is gone, not that misomoon asked the wrong place
	if (gone) await forget(env, teamId, gone)
	return { url: created.url }
}

/**
 * Daily: the teams whose paid period ended more than a day ago, read again from Polar. A
 * renewal or an end whose webhook never came then reaches the team, so a plan can't
 * outlive its subscription. A subscription Polar answers 404 for is logged and left for
 * support: a token for the wrong organization answers 404 too.
 */
export async function reconcileBilling(env: Env, now = Date.now()) {
	const polar = polarConfig(env)
	if (!polar) return
	const { results } = await env.CONTROL.prepare('SELECT id, polar_subscription_id FROM teams WHERE polar_subscription_id IS NOT NULL AND plan_period_end < ? ORDER BY plan_period_end LIMIT 50')
		.bind(now - 86_400_000)
		.all<{ id: string; polar_subscription_id: string }>()
	for (const team of results) {
		try {
			const sub = readSubscription(await find(polar, `/v1/subscriptions/${encodeURIComponent(team.polar_subscription_id)}`))
			const plan = sub && planOfProduct(polar, sub.product_id)
			if (!sub || !plan) {
				console.error(JSON.stringify({ msg: 'polar subscription missing', team: team.id, subscription: team.polar_subscription_id, product: sub?.product_id ?? null }))
				continue
			}
			await record(env, team.id, sub, plan)
			console.log(JSON.stringify({ msg: 'polar subscription read again', team: team.id, subscription: sub.id, status: sub.status }))
		} catch (e) {
			console.error(JSON.stringify({ msg: 'polar reconcile failed', team: team.id, error: String(e) }))
		}
	}
}

/** POST /api/v1/teams/:team/portal: a Polar customer portal session for the team's customer, `{ url }`. */
export async function portal(env: Env, who: Principal, teamId: string, origin: string): Promise<{ url: string }> {
	const polar = requirePolar(env)
	await billingUser(env, who, teamId)
	const team = await env.CONTROL.prepare('SELECT polar_customer_id FROM teams WHERE id = ?').bind(teamId).first<{ polar_customer_id: string | null }>()
	if (!team?.polar_customer_id) throw new HttpError(409, 'this team has not paid for a plan yet; choose one first')
	const session = await call<{ customer_portal_url?: unknown }>(polar, 'POST', '/v1/customer-sessions/', {
		customer_id: team.polar_customer_id,
		return_url: await settingsUrl(env, origin, teamId),
	}).catch(failed)
	if (typeof session.customer_portal_url !== 'string') throw new HttpError(502, 'Polar answered without a portal URL')
	return { url: session.customer_portal_url }
}

const MAX_BODY = 256 * 1024
const answer = (body: Record<string, unknown>, status = 200) => Response.json(body, { status })

/**
 * POST /api/billing/polar/webhook. Polar signs it with Standard Webhooks (webhook-id,
 * webhook-timestamp within 5 minutes, webhook-signature). Every subscription.* event
 * carries the whole subscription, so each one sets the team's plan from that state.
 * Anything Polar shouldn't send again (another event type, an unknown product, no team)
 * is logged and answered 202.
 */
export async function polarWebhook(env: Env, req: Request): Promise<Response> {
	const polar = requirePolar(env)
	if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY) throw new HttpError(413, 'the body is over 256 KB')
	const text = await req.text()
	if (text.length > MAX_BODY) throw new HttpError(413, 'the body is over 256 KB')
	if (!(await verifyWebhook('polar', polar.secret, req.headers, text))) throw new HttpError(401, 'the signature does not match')
	const webhookId = req.headers.get('webhook-id')!
	let event: { type?: unknown; data?: unknown }
	try {
		event = JSON.parse(text)
	} catch {
		throw new HttpError(400, 'the body is not JSON')
	}
	const type = typeof event?.type === 'string' ? event.type : ''
	if (!type.startsWith('subscription.')) return answer({ ok: true, ignored: true }, 202)
	const ignore = (msg: string, extra: Record<string, unknown> = {}) => {
		console.error(JSON.stringify({ msg, type, webhook: webhookId, ...extra }))
		return answer({ ok: true, ignored: true }, 202)
	}
	const sub = readSubscription(event.data)
	if (!sub) return ignore('polar subscription unreadable')
	const plan = planOfProduct(polar, sub.product_id)
	if (!plan) return ignore('unknown Polar product', { subscription: sub.id, product: sub.product_id })
	if (await env.CONTROL.prepare('SELECT 1 FROM polar_webhooks WHERE id = ?').bind(webhookId).first()) return answer({ ok: true, duplicate: true })
	// the team a subscription first came with stays its team
	const known = await env.CONTROL.prepare('SELECT team_id FROM polar_subscriptions WHERE id = ?').bind(sub.id).first<{ team_id: string }>()
	const teamId = known?.team_id ?? str(sub.metadata.team_id)
	if (!teamId) return ignore('polar subscription without a team', { subscription: sub.id })
	if (!(await env.CONTROL.prepare('SELECT 1 FROM teams WHERE id = ?').bind(teamId).first())) return ignore('polar subscription of a deleted team', { subscription: sub.id, team: teamId })
	if ((await record(env, teamId, sub, plan, webhookId)) === 'duplicate') return answer({ ok: true, duplicate: true })
	return answer({ ok: true })
}

// ---------------------------------------------------------------- /me

/** What /api/v1/me adds to each team: how its subscription stands, and whether the portal opens. */
export interface TeamBilling {
	plan_status: PlanStatus | null
	plan_period_end: number | null
	billing_portal: boolean
}
const NO_BILLING: TeamBilling = { plan_status: null, plan_period_end: null, billing_portal: false }

/** The billing of each of the user's teams, or null when this server takes no payments. */
export async function teamBilling(env: Env, userId: string | null): Promise<Map<string, TeamBilling> | null> {
	if (!billingOn(env)) return null
	if (!userId) return new Map()
	const { results } = await env.CONTROL.prepare(
		'SELECT t.id, t.plan_status, t.plan_period_end, t.polar_customer_id IS NOT NULL AS portal FROM teams t JOIN team_members m ON m.team_id = t.id WHERE m.user_id = ?',
	)
		.bind(userId)
		.all<{ id: string; plan_status: PlanStatus | null; plan_period_end: number | null; portal: number }>()
	return new Map(results.map((r) => [r.id, { plan_status: r.plan_status, plan_period_end: r.plan_period_end, billing_portal: !!r.portal }]))
}

/** The teams of /me with their billing. */
export const withBilling = <T extends { id: string }>(teams: T[], billing: Map<string, TeamBilling> | null) => teams.map((t) => ({ ...t, ...(billing?.get(t.id) ?? NO_BILLING) }))
