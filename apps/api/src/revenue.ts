import { DAY, insertEventStmt, isProvider, siteFeatures, storeFeatures, parsePayments, PaymentError, paymentRow, SESSION_ATTRS, utcDay, verifyWebhook, visitOf, writeRange, type EventRow, type Payment, type Provider, type Visit } from '@misomoon/core'
import { cached, getRanges, getSite, HttpError, invalidate, shardDb, writeShard } from './control'

/**
 * Revenue from payment providers, credited to the visit that brought the buyer
 * (packages/core/src/payments.ts has the model). Every write here is keyed by an id the
 * provider or the tracker chose, so a retried webhook or queue batch changes nothing.
 */

const REF_DAYS = 30
const LINK_DAYS = 400
const MAX_BODY = 256 * 1024
/** keys per lookup: D1 binds at most 100 parameters, and the lookup binds the site and its keys twice */
const CLAIM_CHUNK = 45
/** payments one key may move in a single pass, a guard against a runaway chain */
const MAX_SETTLE = 200

interface PaymentRow {
	site_id: string
	provider: Provider
	id: string
	kind: Payment['kind']
	amount: number
	currency: string
	ts: number
	keys: string
	links: string
	billing: Payment['billing'] | null
	attributed_by: string | null
	visit: string | null
}

const toPayment = (r: PaymentRow): Payment => ({
	provider: r.provider,
	kind: r.kind,
	id: r.id,
	amount: Math.abs(r.amount),
	currency: r.currency,
	ts: r.ts,
	keys: JSON.parse(r.keys),
	links: JSON.parse(r.links),
	...(r.billing ? { billing: r.billing } : {}),
})

/** Sites without a payment provider skip all of this, so their beacons cost no control writes. */
export const takesPayments = (env: Env, siteId: string) =>
	cached(`revenue:${siteId}`, async () => !!(await env.CONTROL.prepare('SELECT 1 FROM revenue_sources WHERE site_id = ? LIMIT 1').bind(siteId).first()))

/** The visit behind the strongest of `keys` that is still known. */
async function findVisit(env: Env, siteId: string, keys: string[], now = Date.now()): Promise<{ key: string; visit: Visit } | null> {
	if (!keys.length) return null
	const { results } = await env.CONTROL.prepare(`SELECT key, visit FROM attribution WHERE site_id = ? AND key IN (${keys.map(() => '?').join(', ')}) AND expires_at > ?`)
		.bind(siteId, ...keys, now)
		.all<{ key: string; visit: string }>()
	for (const k of keys) {
		const hit = results.find((r) => r.key === k)
		if (hit) return { key: k, visit: JSON.parse(hit.visit) }
	}
	return null
}

/**
 * Statements that remember a visit under `keys`. When two visits claim a key, the earlier
 * one keeps it, so a customer stays with their first visit whatever order the payments
 * came in. A payment re-teaching its own links moves them (`source` is that payment, ''
 * for keys from the tracker).
 */
function rememberStmts(env: Env, siteId: string, keys: string[], visit: Visit, days: number, source = '', now = Date.now()) {
	const json = JSON.stringify(visit)
	const takes = `(attribution.source <> '' AND attribution.source = excluded.source) OR json_extract(excluded.visit, '$.ts') < json_extract(attribution.visit, '$.ts')`
	return keys.map((k) =>
		env.CONTROL.prepare(
			`INSERT INTO attribution (site_id, key, visit, expires_at, source) VALUES (?, ?, ?, ?, ?) ON CONFLICT (site_id, key) DO UPDATE SET
				visit = CASE WHEN ${takes} THEN excluded.visit ELSE attribution.visit END,
				source = CASE WHEN ${takes} THEN excluded.source ELSE attribution.source END,
				expires_at = MAX(attribution.expires_at, excluded.expires_at)`,
		).bind(siteId, k, json, now + days * DAY, source),
	)
}

/** Statements that leave a payment waiting for its keys stronger than `keys[upto]` (all of them while it has no visit). */
function pendingStmts(env: Env, siteId: string, p: Payment, upto: number, now = Date.now()) {
	return [
		env.CONTROL.prepare('DELETE FROM payment_keys WHERE site_id = ? AND provider = ? AND payment_id = ?').bind(siteId, p.provider, p.id),
		...p.keys
			.slice(0, upto)
			.map((k) => env.CONTROL.prepare('INSERT OR IGNORE INTO payment_keys (site_id, key, provider, payment_id, created_at) VALUES (?, ?, ?, ?, ?)').bind(siteId, k, p.provider, p.id, now)),
	]
}

/**
 * Saves the visit behind every key that beacons handed out (refs, success-page checkout
 * ids), then credits the payments that were waiting for one of those keys.
 */
export async function recordRefs(env: Env, rows: EventRow[]): Promise<void> {
	const bySite = new Map<string, EventRow[]>()
	for (const r of rows) if (r.refs?.length) bySite.set(r.site_id, [...(bySite.get(r.site_id) ?? []), r])
	for (const [siteId, list] of bySite) {
		if (!(await takesPayments(env, siteId))) continue
		const stmts = list.flatMap((r) => rememberStmts(env, siteId, r.refs!, visitOf(r), REF_DAYS))
		await env.CONTROL.batch(stmts)
		await claim(env, siteId, [...new Set(list.flatMap((r) => r.refs!))], newPass())
	}
}

/** The shard that holds a site's events for the day of `ts`. */
async function readShard(env: Env, siteId: string, ts: number): Promise<D1Database | null> {
	const range = writeRange(await getRanges(env, siteId), utcDay(ts))
	return range ? shardDb(env, range.shard) : null
}

/** Writes a payment's event; false when it is there already. */
async function writeRow(env: Env, row: EventRow): Promise<boolean> {
	const db = await shardDb(env, await writeShard(env, row.site_id, row.ts))
	const s = insertEventStmt(row)
	return !!(await db.prepare(s.sql).bind(...s.params).run()).meta.changes
}

/** Gives a payment's event the visit it was missing. */
async function updateRow(env: Env, siteId: string, p: Payment, amount: number, visit: Visit) {
	const db = await readShard(env, siteId, p.ts)
	if (!db) return
	const row = paymentRow(p, siteId, visit, Math.abs(amount))
	const cols = ['visitor_id', 'session_id', 'pathname', ...SESSION_ATTRS] as const
	await db
		.prepare(`UPDATE events SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE site_id = ? AND event_id = ?`)
		.bind(...cols.map((c) => row[c] ?? null), siteId, row.event_id)
		.run()
}

/** One key turning up, and every payment it moves. */
interface Pass {
	left: number
	/** payments being settled further up the chain */
	busy: Set<string>
	/** what each payment moved to in this pass, newer than a row read before the move */
	moved: Map<string, { key: string; visit: string }>
	/** keys already claimed for a visit: teaching one the same visit again claims nothing new */
	claimed: Map<string, string>
}
const newPass = (): Pass => ({ left: MAX_SETTLE, busy: new Set(), moved: new Map(), claimed: new Map() })

/**
 * Credits a payment to the visit behind its strongest known key. When that moves it, the
 * links it teaches lead to the new visit, and the payments credited through them follow.
 * The payment's own row is written last, so a pass that fails part way is redone on retry.
 * That write holds only if the row is still as this pass read it. When another pass (a
 * webhook and a beacon at once) moved it first, this one settles again from that row and
 * rewrites what it changed, so the stronger key wins whichever pass ends last.
 */
async function settle(env: Env, siteId: string, r: PaymentRow, pass: Pass, again = false): Promise<void> {
	const id = `${r.provider}:${r.id}`
	if (pass.busy.has(id)) return
	const now = pass.moved.get(id)
	const by = now ? now.key : r.attributed_by
	const was = now ? now.visit : r.visit
	const p = toPayment(r)
	const hit = await findVisit(env, siteId, p.keys)
	// nothing known yet, or a stronger key expired: never move to a weaker one
	if (!hit || (by && p.keys.indexOf(hit.key) > p.keys.indexOf(by))) {
		// the event may hold the visit the losing pass wrote
		if (again && r.visit && p.kind !== 'link') await updateRow(env, siteId, p, r.amount, JSON.parse(r.visit))
		return
	}
	const visit = JSON.stringify(hit.visit)
	if (!again && hit.key === by && visit === was) return
	// moves already written stay; the retry carries on from them
	if (pass.left-- <= 0) throw new Error(`payment chain too long: ${siteId} ${id}`)
	pass.busy.add(id)
	let lost = false
	try {
		if (p.kind !== 'link') await updateRow(env, siteId, p, r.amount, hit.visit)
		if (p.links.length) {
			await env.CONTROL.batch(rememberStmts(env, siteId, p.links, hit.visit, LINK_DAYS, id))
			const fresh = p.links.filter((k) => pass.claimed.get(k) !== visit)
			for (const k of fresh) pass.claimed.set(k, visit)
			await claim(env, siteId, fresh, pass)
		}
		const [moved] = await env.CONTROL.batch([
			env.CONTROL.prepare('UPDATE payments SET attributed_by = ?, visit = ? WHERE site_id = ? AND provider = ? AND id = ? AND attributed_by IS ? AND visit IS ?').bind(
				hit.key,
				visit,
				siteId,
				p.provider,
				p.id,
				by,
				was,
			),
			...pendingStmts(env, siteId, p, p.keys.indexOf(hit.key)),
		])
		lost = !moved.meta.changes
		if (!lost) pass.moved.set(id, { key: hit.key, visit })
	} finally {
		pass.busy.delete(id)
	}
	if (!lost) return
	pass.moved.delete(id)
	const fresh = await env.CONTROL.prepare('SELECT * FROM payments WHERE site_id = ? AND provider = ? AND id = ?').bind(siteId, p.provider, p.id).first<PaymentRow>()
	if (fresh) await settle(env, siteId, fresh, pass, true)
}

/**
 * Settles the payments that `keys` may move: those waiting for one of them, and those
 * credited through one of them, whose visit may have changed.
 */
async function claim(env: Env, siteId: string, keys: string[], pass: Pass) {
	for (let i = 0; i < keys.length; i += CLAIM_CHUNK) {
		const chunk = keys.slice(i, i + CLAIM_CHUNK)
		const marks = chunk.map(() => '?').join(', ')
		const { results } = await env.CONTROL.prepare(
			`SELECT p.* FROM payment_keys k JOIN payments p ON p.site_id = k.site_id AND p.provider = k.provider AND p.id = k.payment_id
				WHERE k.site_id = ? AND k.key IN (${marks})
			UNION SELECT p.* FROM payments p WHERE p.site_id = ? AND p.attributed_by IN (${marks})`,
		)
			.bind(siteId, ...chunk, siteId, ...chunk)
			.all<PaymentRow>()
		for (const r of results) await settle(env, siteId, r, pass)
	}
}

/**
 * Stores one payment, refund or link, writes its event, and credits it when a key already
 * leads to a visit. A retried delivery finishes whatever the earlier one could not.
 * Returns true when this call wrote the payment's event (for a link: stored it).
 */
export async function applyPayment(env: Env, siteId: string, p: Payment): Promise<boolean> {
	const now = Date.now()
	const cols = 'site_id, provider, id, kind, amount, currency, ts, keys, links, billing, refund_of, created_at'
	const rest = [p.currency, p.ts, JSON.stringify(p.keys), JSON.stringify(p.links), p.billing ?? null, p.refundedTotalOf ?? null, now]
	// Lemon Squeezy sends the refunded total so far, so a refund is what it adds. The same
	// statement works it out, so two refunds handled at once can't both take the same money.
	const insert = p.refundedTotalOf
		? env.CONTROL.prepare(
				`INSERT OR IGNORE INTO payments (${cols})
					SELECT ?, ?, ?, ?, -ROUND(? - prior.n, 6), ?, ?, ?, ?, ?, ?, ?
					FROM (SELECT COALESCE(-SUM(amount), 0) AS n FROM payments WHERE site_id = ? AND provider = ? AND refund_of = ?) AS prior
					WHERE ROUND(? - prior.n, 6) > 0`,
			).bind(siteId, p.provider, p.id, p.kind, p.amount, ...rest, siteId, p.provider, p.refundedTotalOf, p.amount)
		: env.CONTROL.prepare(`INSERT OR IGNORE INTO payments (${cols}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(siteId, p.provider, p.id, p.kind, p.kind === 'refund' ? -p.amount : p.amount, ...rest)
	const inserted = !!(await insert.run()).meta.changes
	const stored = await env.CONTROL.prepare('SELECT * FROM payments WHERE site_id = ? AND provider = ? AND id = ?').bind(siteId, p.provider, p.id).first<PaymentRow>()
	// a refund that adds nothing to the refunded total
	if (!stored) return false
	const written = p.kind === 'link' ? inserted : await writeRow(env, paymentRow(p, siteId, stored.visit ? JSON.parse(stored.visit) : null, Math.abs(stored.amount)))
	// it waits for every key until one leads to a visit
	if (!stored.attributed_by) await env.CONTROL.batch(pendingStmts(env, siteId, p, p.keys.length))
	await settle(env, siteId, stored, newPass())
	return written
}

/** POST /api/webhooks/:provider/:site */
export async function handleWebhook(env: Env, provider: string, siteId: string, req: Request): Promise<Response> {
	if (!isProvider(provider)) return Response.json({ error: 'unknown provider' }, { status: 404 })
	const source = await env.CONTROL.prepare('SELECT secret FROM revenue_sources WHERE site_id = ? AND provider = ?').bind(siteId, provider).first<{ secret: string }>()
	if (!source) return Response.json({ error: `this site has no ${provider} webhook` }, { status: 404 })
	if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY) return Response.json({ error: 'body too large' }, { status: 413 })
	const body = await req.text()
	if (body.length > MAX_BODY) return Response.json({ error: 'body too large' }, { status: 413 })
	const note = (sql: string, ...params: unknown[]) => env.CONTROL.prepare(`UPDATE revenue_sources SET ${sql} WHERE site_id = ? AND provider = ?`).bind(...params, siteId, provider).run()
	if (!(await verifyWebhook(provider, source.secret, req.headers, body))) {
		await note('last_error = ?', 'A webhook arrived with a signature that does not match the saved secret.')
		return Response.json({ error: 'signature does not match' }, { status: 401 })
	}
	let parsed
	try {
		parsed = parsePayments(provider, JSON.parse(body))
	} catch (e) {
		const message = e instanceof PaymentError ? e.message : 'body is not valid JSON'
		await note('last_error = ?', message)
		return Response.json({ error: message }, { status: 400 })
	}
	if (parsed.test) {
		await note('last_test_at = ?, last_error = NULL', Date.now())
		return Response.json({ ok: true, test: true, counted: 0 })
	}
	let counted = 0
	for (const p of parsed.payments) if ((await applyPayment(env, siteId, p)) && p.kind !== 'link') counted++
	await note('last_event_at = ?, last_error = NULL', Date.now())
	return Response.json({ ok: true, counted })
}

// ---------------------------------------------------------------- settings

export interface RevenueSource {
	provider: Provider
	webhook_url: string
	created_at: number
	last_event_at: number | null
	last_test_at: number | null
	last_error: string | null
}

export const webhookUrl = (origin: string, provider: Provider, siteId: string) => `${origin}/api/webhooks/${provider}/${siteId}`

export async function listSources(env: Env, siteId: string, origin: string) {
	const { results } = await env.CONTROL.prepare('SELECT provider, created_at, last_event_at, last_test_at, last_error FROM revenue_sources WHERE site_id = ? ORDER BY created_at').bind(siteId).all<Omit<RevenueSource, 'webhook_url'>>()
	const since = Date.now() - 30 * DAY
	const totals = await env.CONTROL.prepare(
		"SELECT COUNT(*) AS payments, COUNT(attributed_by) AS attributed FROM payments WHERE site_id = ? AND kind = 'payment' AND ts >= ?",
	)
		.bind(siteId, since)
		.first<{ payments: number; attributed: number }>()
	return { sources: results.map((r) => ({ ...r, webhook_url: webhookUrl(origin, r.provider, siteId) })), last_30_days: totals ?? { payments: 0, attributed: 0 } }
}

// `polar webhook listen` signs what it forwards with a 32-character secret of its own
const SECRET_FORMAT: Partial<Record<Provider, RegExp>> = { stripe: /^whsec_[A-Za-z0-9]{8,}$/, polar: /^(whsec_\S{8,}|[A-Za-z0-9]{32})$/, dodo: /^whsec_[A-Za-z0-9+/=]{8,}$/ }

/** Saves a provider's signing secret. Lemon Squeezy and custom webhooks get one made here when none is given. */
export async function saveSource(env: Env, siteId: string, provider: string, secret: unknown, userId: string | null, origin: string) {
	if (!isProvider(provider)) throw new HttpError(404, 'unknown provider')
	const given = typeof secret === 'string' ? secret.trim() : ''
	const format = SECRET_FORMAT[provider]
	if (format && !format.test(given)) throw new HttpError(400, `paste the ${provider === 'stripe' ? 'Stripe' : provider === 'polar' ? 'Polar' : 'Dodo Payments'} signing secret, which starts with whsec_${provider === 'polar' ? ', or the secret polar webhook listen prints' : ''}`)
	if (!format && given && given.length < 16) throw new HttpError(400, 'a signing secret needs at least 16 characters')
	const made = !format && !given
	const value = made ? [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('') : given
	await env.CONTROL.prepare(
		`INSERT INTO revenue_sources (site_id, provider, secret, created_by, created_at) VALUES (?, ?, ?, ?, ?)
			ON CONFLICT (site_id, provider) DO UPDATE SET secret = excluded.secret, last_error = NULL`,
	)
		.bind(siteId, provider, value, userId, Date.now())
		.run()
	invalidate(`revenue:${siteId}`)
	// Payments need the tracker's payments part (payment links, misomoon.ref()) and the
	// success-page ids, so connecting a provider ticks it.
	const site = await getSite(env, siteId)
	const features = site ? siteFeatures(site.features) : []
	if (site && !features.includes('payments')) {
		await env.CONTROL.prepare('UPDATE sites SET features = ? WHERE id = ?').bind(storeFeatures([...features, 'payments']), siteId).run()
		invalidate(`site:${siteId}`)
	}
	// a secret made here is shown once, to paste into the provider
	return { provider, webhook_url: webhookUrl(origin, provider, siteId), ...(made ? { secret: value } : {}) }
}

export async function removeSource(env: Env, siteId: string, provider: string) {
	await env.CONTROL.prepare('DELETE FROM revenue_sources WHERE site_id = ? AND provider = ?').bind(siteId, provider).run()
	invalidate(`revenue:${siteId}`)
}

/** Hourly: forget refs past 30 days and links past 400, and stop waiting for keys after 30 days. */
export async function expireAttribution(env: Env, now = Date.now()) {
	await env.CONTROL.batch([
		env.CONTROL.prepare('DELETE FROM attribution WHERE expires_at < ?').bind(now),
		env.CONTROL.prepare('DELETE FROM payment_keys WHERE created_at < ?').bind(now - REF_DAYS * DAY),
	])
}
