// Server-side events: a signup your API handles, a payment your webhook confirms. The
// server forwards the visitor's address and user agent the way a first-party proxy does
// (core/src/proxy.ts), so the event gets the same daily visitor id as the visitor's
// browser and joins their open visit.

import { createClient, discard, newRef, type Client, type ClientOptions, type EventOptions } from './client.js'

export { newRef, VERSION, type ClientOptions, type EventOptions, type Payload, type Props, type Revenue } from './client.js'

/** Who caused the event. `visitorFromRequest` reads it from an incoming request. */
export interface Visitor {
	/** the visitor's IP address; stored by nobody, hashed with the user agent and a daily salt */
	ip: string
	/** the visitor's own User-Agent header */
	userAgent: string
	/** Accept-Language, or a language tag such as en-US */
	language?: string
	/** ISO 3166-1 alpha-2 */
	country?: string
	region?: string
	city?: string
	continent?: string
	timezone?: string
}

export interface ServerEvent extends EventOptions {
	/** the page the event belongs to, on the site's own domain */
	url: string
	visitor: Visitor
	referrer?: string
	title?: string
}

export interface ServerOptions extends ClientOptions {
	/** the signing secret of the site's custom webhook (Settings > Revenue > Your server), for `payment()` */
	secret?: string
}

/** A payment or refund for `payment()`, the fields of the custom webhook (docs/revenue.md). */
export interface ServerPayment {
	/** your payment id, unique per site; a resend with the same id counts once */
	id: string
	/** positive, in major units: 49.9 for 49.90 */
	amount: number
	/** ISO 4217 code */
	currency: string
	/** default 'payment' */
	type?: 'payment' | 'refund'
	/** for a refund, the id of the payment it returns */
	refundOf?: string
	/** the ref from the buyer's visit: `misomoon.ref()` in their browser or app, or `ref()` here */
	ref?: string
	/** your ids: a later payment with the same customer or subscription counts toward the first one's visit */
	customer?: string
	subscription?: string
	billing?: 'new' | 'renewal' | 'one_time'
	/** when it happened; default now */
	ts?: Date | number | string
	/** checks the connection without counting the payment */
	test?: boolean
}

export interface ServerClient {
	/** Resolves true once misomoon has the event, false when it was dropped. Never rejects. */
	track(name: string, event: ServerEvent): Promise<boolean>
	pageview(event: ServerEvent): Promise<boolean>
	/**
	 * Hands out a payment ref from the visitor's visit, for a checkout your server creates:
	 * put it in the checkout's metadata as `misomoon_ref`. Returns undefined, and sends
	 * nothing, without the visitor's address and user agent.
	 */
	ref(event: { url: string; visitor: Visitor | null | undefined }): string | undefined
	/**
	 * Sends a payment or a refund to the site's custom webhook, signed with `secret`. For
	 * providers misomoon has no webhook for. Retries network errors, 429 and 5xx; resolves
	 * true once misomoon has it, false otherwise. Never rejects.
	 */
	payment(payment: ServerPayment): Promise<boolean>
	/** Await before a serverless function returns, or pass to `waitUntil`. */
	flush(timeout?: number): Promise<void>
	shutdown(timeout?: number): Promise<void>
	readonly pending: number
}

type HeaderValue = string | string[] | undefined
/** A Fetch API Request, or Node's IncomingMessage (Express, Fastify's `req.raw`, Next.js pages API). */
export type RequestLike =
	| { headers: { get(name: string): string | null } }
	| { headers: Record<string, HeaderValue>; socket?: { remoteAddress?: string }; ip?: string }

const IP = /^[0-9a-f.:]{3,45}$/i

/**
 * An address without the port some load balancers add (Azure: `1.2.3.4:5678`) or the
 * brackets around IPv6 (`[2001:db8::1]:443`), or null when it isn't an address.
 */
export function cleanIp(raw: unknown): string | null {
	if (typeof raw !== 'string') return null
	let ip = raw.trim()
	const bracketed = ip.match(/^\[([0-9a-f:.]+)\](?::\d+)?$/i)
	if (bracketed) ip = bracketed[1]
	const v4 = ip.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/)
	if (v4) ip = v4[1]
	return IP.test(ip) ? ip : null
}

function header(req: RequestLike, name: string): string | undefined {
	const h = req.headers as { get?: unknown }
	const raw: HeaderValue | null = typeof h.get === 'function' ? (req.headers as { get(n: string): string | null }).get(name) : (req.headers as Record<string, HeaderValue>)[name]
	const v = Array.isArray(raw) ? raw[0] : raw
	return v?.trim() || undefined
}

// Vercel URL-encodes its geo headers; values are decoded here and encoded once on the way out.
function decoded(v: string | undefined): string | undefined {
	if (!v) return undefined
	try {
		return decodeURIComponent(v)
	} catch {
		return v
	}
}

/**
 * Reads the visitor from an incoming request: the address your platform reports
 * (Cloudflare, Vercel, Fly, Nginx `X-Real-IP`, then the first `X-Forwarded-For`), the
 * user agent, the language, and any geo headers the platform adds.
 * Returns null when the request has no usable address or user agent.
 */
export function visitorFromRequest(req: RequestLike): Visitor | null {
	const forwarded = header(req, 'x-forwarded-for')?.split(',')[0]?.trim()
	const node = req as { socket?: { remoteAddress?: string }; ip?: string }
	const candidates = [
		header(req, 'cf-connecting-ip'),
		header(req, 'true-client-ip'),
		header(req, 'fly-client-ip'),
		header(req, 'x-real-ip'),
		forwarded,
		node.ip,
		node.socket?.remoteAddress,
	]
	let ip: string | null = null
	for (const c of candidates) if (!ip) ip = cleanIp(c)
	const userAgent = header(req, 'user-agent')
	if (!ip || !userAgent) return null
	const country = header(req, 'cf-ipcountry') ?? header(req, 'x-vercel-ip-country')
	return {
		ip,
		userAgent,
		language: header(req, 'accept-language'),
		// "XX" and "T1" are Cloudflare's unknown and Tor markers
		country: country && /^[A-Z]{2}$/i.test(country) && !/^(XX|T1)$/i.test(country) ? country.toUpperCase() : undefined,
		region: decoded(header(req, 'cf-region') ?? header(req, 'x-vercel-ip-country-region')),
		city: decoded(header(req, 'cf-ipcity') ?? header(req, 'x-vercel-ip-city')),
		continent: decoded(header(req, 'cf-ipcontinent') ?? header(req, 'x-vercel-ip-continent')),
		timezone: decoded(header(req, 'cf-timezone') ?? header(req, 'x-vercel-ip-timezone')),
	}
}

/** The headers misomoon reads behind a first-party proxy (`PROXY_HEADERS` in core/src/proxy.ts). */
export function visitorHeaders(v: Visitor): Record<string, string> {
	const out: Record<string, string> = { 'user-agent': v.userAgent, 'x-misomoon-ip': v.ip }
	const geo: [string, string | undefined][] = [
		['x-misomoon-country', v.country],
		['x-misomoon-region', v.region],
		['x-misomoon-city', v.city],
		['x-misomoon-continent', v.continent],
		['x-misomoon-timezone', v.timezone],
	]
	for (const [k, val] of geo) if (val) out[k] = encodeURIComponent(val)
	return out
}

const enc = /* @__PURE__ */ new TextEncoder()
const CURRENCY = /^[A-Za-z]{3}$/

/** Signs bodies with `sha256=<hex HMAC-SHA256>`, as `verifyCustom` in core/src/payments.ts checks; null without Web Crypto. */
function signer(secret: string): (body: string) => Promise<string | null> {
	let key: Promise<CryptoKey> | null = null
	return async (body) => {
		const subtle = (globalThis as { crypto?: Crypto }).crypto?.subtle
		if (!subtle) return null
		// imported once per client, not per payment
		key ??= subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
		const sig = new Uint8Array(await subtle.sign('HMAC', await key, enc.encode(body)))
		return 'sha256=' + Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('')
	}
}

/** Why the custom webhook would refuse this payment (`custom` in core/src/payments.ts), or null. */
function paymentProblem(p: ServerPayment): string | null {
	if (typeof p.id !== 'string' || !p.id || p.id.length > 200) return 'id is required, up to 200 characters'
	if (typeof p.amount !== 'number' || !Number.isFinite(p.amount) || p.amount <= 0) return `amount ${String(p.amount)} must be a positive number in major units (49.9 for 49.90)`
	if (typeof p.currency !== 'string' || !CURRENCY.test(p.currency)) return `currency "${String(p.currency)}" is not an ISO 4217 code`
	if (p.type !== undefined && p.type !== 'payment' && p.type !== 'refund') return `type "${String(p.type)}" must be "payment" or "refund"`
	if (p.type === 'refund' && !p.refundOf) return 'a refund needs refundOf: the id of the payment it returns'
	return null
}

// not unref'd: the caller awaits payment(), so the process must stay up for the retry
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function createMisomoon(options: ServerOptions): ServerClient {
	// requests are independent here: each carries its own visitor, so several may run at once
	const client: Client = createClient({ concurrency: 4, ...options })

	const sign = signer(options.secret ?? '')
	const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)

	/** The visitor with only usable values, or null without an address and a user agent, which would count the server itself as the visitor. */
	function visitorOf(v: Visitor | null | undefined): Visitor | null {
		const ip = cleanIp(v?.ip)
		const userAgent = str(v?.userAgent)
		if (!v || !ip || !userAgent) return null
		return { ip, userAgent, language: str(v.language), country: str(v.country), region: str(v.region), city: str(v.city), continent: str(v.continent), timezone: str(v.timezone) }
	}

	function send(name: string, ev: ServerEvent): Promise<boolean> {
		// analytics must never break the request that sends it: odd input drops the event
		try {
			const visitor = visitorOf(ev?.visitor)
			if (!visitor) {
				console.warn(`[misomoon] ${name} dropped: visitor.ip and visitor.userAgent are required`)
				return Promise.resolve(false)
			}
			return client.send(
				{
					s: options.site,
					n: name,
					u: ev.url,
					r: str(ev.referrer),
					t: str(ev.title),
					l: visitor.language?.split(',')[0]?.split(';')[0]?.trim() || undefined,
					p: ev.props,
					$: ev.revenue && { a: ev.revenue.amount, c: ev.revenue.currency },
					i: ev.interactive === false ? false : undefined,
				},
				visitorHeaders(visitor),
			)
		} catch (e) {
			console.warn(`[misomoon] ${name} dropped: ${String(e)}`)
			return Promise.resolve(false)
		}
	}

	function ref(ev: { url: string; visitor: Visitor | null | undefined }): string | undefined {
		try {
			if (options.enabled === false) return undefined
			const visitor = visitorOf(ev?.visitor)
			if (!visitor) {
				console.warn('[misomoon] ref: visitor.ip and visitor.userAgent are required to find the visit')
				return undefined
			}
			if (typeof ev.url !== 'string' || !/^https?:\/\/[^\s/?#]+/i.test(ev.url)) {
				console.warn(`[misomoon] ref: url "${ev.url}" is not an absolute http(s) URL`)
				return undefined
			}
			const k = newRef()
			// an engagement with no time and a ref stores nothing but the ref, with the visit it finds
			void client.send({ s: options.site, n: 'engagement', u: ev.url, e: 0, k }, visitorHeaders(visitor))
			return k
		} catch (e) {
			console.warn(`[misomoon] ref: ${String(e)}`)
			return undefined
		}
	}

	async function payment(p: ServerPayment): Promise<boolean> {
		const fetchFn = options.fetch ?? globalThis.fetch
		const timeout = options.timeout ?? 10_000
		try {
			if (options.enabled === false) return false
			if (!options.secret) {
				console.warn('[misomoon] payment dropped: createMisomoon needs the custom webhook secret as `secret`')
				return false
			}
			const why = paymentProblem(p)
			if (why) {
				console.warn(`[misomoon] payment ${String(p.id)} refused: ${why}`)
				return false
			}
			const ts = p.ts instanceof Date ? p.ts.toISOString() : p.ts
			const body = JSON.stringify({
				id: p.id,
				amount: p.amount,
				currency: p.currency.toUpperCase(),
				type: p.type,
				refund_of: p.refundOf,
				ref: p.ref,
				customer: p.customer,
				subscription: p.subscription,
				billing: p.billing,
				ts,
				test: p.test,
			})
			const sig = await sign(body)
			const auth: Record<string, string> = sig ? { 'x-misomoon-signature': sig } : { authorization: `Bearer ${options.secret}` }
			const url = `${options.host.replace(/\/+$/, '')}/api/webhooks/custom/${encodeURIComponent(options.site)}`
			const deadline = Date.now() + (options.maxAge ?? 5 * 60_000)
			for (let attempt = 1; ; attempt++) {
				let why: string
				const ctrl = new AbortController()
				const abort = setTimeout(() => ctrl.abort(), timeout)
				try {
					const res = await fetchFn(url, { method: 'POST', headers: { 'content-type': 'application/json', ...options.headers, ...auth }, body, signal: ctrl.signal })
					if (res.ok) {
						await discard(res)
						if (options.debug) console.info(`[misomoon] sent payment ${p.id}`)
						return true
					}
					if (res.status !== 429 && res.status < 500) {
						// the server says why: a malformed field (400) or a wrong secret (401)
						console.warn(`[misomoon] payment ${p.id} refused (${res.status}): ${(await res.text().catch(() => '')).slice(0, 300)}`)
						return false
					}
					await discard(res)
					why = `status ${res.status}`
				} catch (e) {
					why = ctrl.signal.aborted ? `no answer in ${timeout} ms` : String(e)
				} finally {
					clearTimeout(abort)
				}
				// the id makes a resend safe, so keep trying until maxAge
				const wait = Math.min(30_000, 1000 * 2 ** (attempt - 1))
				if (Date.now() + wait > deadline) {
					console.warn(`[misomoon] payment ${p.id} dropped after ${attempt} tries (${why})`)
					return false
				}
				if (options.debug) console.info(`[misomoon] retrying payment ${p.id} (${why})`)
				await sleep(wait / 2 + (Math.random() * wait) / 2)
			}
		} catch (e) {
			console.warn(`[misomoon] payment dropped: ${String(e)}`)
			return false
		}
	}

	return {
		get pending() {
			return client.pending
		},
		track: (name, ev) => send(name, ev),
		pageview: (ev) => send('pageview', ev),
		ref,
		payment,
		flush: (t) => client.flush(t),
		shutdown: (t) => client.shutdown(t),
	}
}
