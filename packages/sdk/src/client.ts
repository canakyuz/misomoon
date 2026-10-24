// The transport every non-browser SDK shares: an ordered queue that sends one event per
// request to /api/event, retries what the network lost, and gives up on what the server
// would no longer date correctly. The browser SDK uses m.js instead.
// No URL or URLSearchParams here: React Native's polyfill throws "not implemented" for
// most of their getters in many versions.

export const VERSION = '0.1.0'

export type Props = Record<string, string | number | boolean>

/** What `/api/event` accepts (`TrackerPayload` in `@misomoon/core`). Short keys keep requests small. */
export interface Payload {
	/** site id */
	s: string
	/** event name: pageview, engagement, or a custom name */
	n: string
	/** page or screen url */
	u: string
	/** referrer */
	r?: string
	/** title */
	t?: string
	/** screen width */
	w?: number
	/** viewport width */
	vw?: number
	/** language, such as en-US */
	l?: string
	/** engaged milliseconds (engagement only) */
	e?: number
	/** deepest scroll percent (engagement only) */
	d?: number
	/**
	 * the page or screen view's key, 16 to 64 letters, digits, _ or -. The server stores a
	 * pageview under it, and adds an engagement with the same key to that pageview's row
	 * instead of storing it; an engagement without one is dropped, unless it only hands out refs.
	 */
	y?: string
	p?: Props
	$?: { a: number; c?: string }
	/** client timestamp, ms */
	ts?: number
	/** false: the event doesn't end a bounce */
	i?: boolean
	/** client event id, so a resend is stored once */
	id?: string
	/** payment refs this event hands out (docs/revenue.md); on an engagement with `e: 0`, nothing else is stored */
	k?: string | string[]
}

export interface Revenue {
	amount: number
	/** ISO 4217 code, such as USD */
	currency?: string
}

export interface EventOptions {
	props?: Props
	revenue?: Revenue
	/** false keeps the event from ending a bounce, for events the visitor didn't cause */
	interactive?: boolean
}

export interface ClientOptions {
	/** site id, as in m.js?s= */
	site: string
	/** where misomoon answers, or your proxy: `https://analytics.example.com` or `https://example.com/relay` */
	host: string
	/** defaults to the global fetch */
	fetch?: typeof fetch
	/** headers on every request */
	headers?: Record<string, string>
	/** ms before a request is abandoned and retried. Default 10000. */
	timeout?: number
	/** requests in flight at once. Default 1, which keeps events in order. */
	concurrency?: number
	/** events kept while the network is down; the oldest go first. Default 500. */
	maxQueue?: number
	/**
	 * ms an event may wait to be sent. Default 5 minutes: the server dates an older
	 * event by its arrival, which would put it in the wrong visit.
	 */
	maxAge?: number
	/** false sends nothing. Default true. `setEnabled()` changes it later. */
	enabled?: boolean
	/** props on every pageview and event, like data-prop-* on the script tag. An event's own props win. */
	props?: Props
	/** logs every event and every failure to the console */
	debug?: boolean
	/** change an event before it is queued, or return null to drop it */
	beforeSend?: (payload: Payload) => Payload | null
}

export interface Client {
	/** Queues an event. Resolves true once the server has it, false when it is dropped. Never rejects. */
	send(payload: Payload, headers?: Record<string, string>): Promise<boolean>
	/**
	 * Sends everything queued now, skipping the current retry delays, and keeps retrying.
	 * Resolves when the queue is empty, or after `timeout` ms (default: the request timeout plus 1 s).
	 */
	flush(timeout?: number): Promise<void>
	/** Flushes, then stops sending. */
	shutdown(timeout?: number): Promise<void>
	/** Starts or stops sending, for an opt-out the user sets. Stopping drops what is queued and not yet sent. */
	setEnabled(on: boolean): void
	/** events waiting to be sent */
	readonly pending: number
}

interface Item {
	payload: Payload
	headers?: Record<string, string>
	queuedAt: number
	attempts: number
	notBefore: number
	sending: boolean
	settle: (ok: boolean) => void
}

// as the server: any text but control characters, ; and |
const NAME = /^[^\u0000-\u001f\u007f;|]{1,120}$/
const PROP_KEY = /^[\w.-]{1,64}$/
const CURRENCY = /^[A-Za-z]{3}$/
const ABSOLUTE = /^[a-z][a-z\d+.-]*:/i
const HTTP = /^https?:\/\/[^\s/?#]+/i
const MAX_PROPS = 30
const MAX_PROP_LENGTH = 300
/** apps/api/src/ingest.ts drops a larger body and still answers 202 */
const MAX_BODY = 16 * 1024

function byteLength(s: string): number {
	if (typeof TextEncoder === 'function') return new TextEncoder().encode(s).length
	return encodeURIComponent(s).replace(/%[0-9A-F]{2}/g, '_').length
}

/**
 * Reads an answer to the end and ignores what it says. Node's fetch keeps a connection
 * out of its pool until the body is read, so an unread answer costs a socket per event.
 */
export async function discard(res: Response): Promise<void> {
	try {
		await res.text()
	} catch {
		// a body that fails to arrive changes nothing: the status already decided
	}
}

/** `<host>/api/event`, keeping a proxy prefix: `https://example.com/relay` posts to `/relay/api/event`. */
export function endpointFor(host: string): string {
	return host.replace(/\/+$/, '') + '/api/event'
}

/**
 * A payment ref like m.js makes: `mm_` and 24 hex digits. Pass it to a checkout, and the
 * payment the provider reports later counts toward the visit that handed it out.
 */
export function newRef(): string {
	const b = new Uint8Array(12)
	const c = (globalThis as { crypto?: Crypto }).crypto
	if (c && typeof c.getRandomValues === 'function') c.getRandomValues(b)
	else for (let i = 0; i < 12; i++) b[i] = Math.floor(Math.random() * 256)
	return 'mm_' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
}

/** A v4 UUID. Falls back to Math.random where the runtime has no crypto (older Hermes). */
export function uuid(): string {
	const c = (globalThis as { crypto?: Crypto }).crypto
	if (c && typeof c.randomUUID === 'function') return c.randomUUID()
	const b = new Uint8Array(16)
	if (c && typeof c.getRandomValues === 'function') c.getRandomValues(b)
	else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256)
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/**
 * Why the server would drop an event with this name or revenue, or null. The browser SDK
 * checks this before handing an event to m.js; `problem` checks it for the other SDKs.
 */
export function eventProblem(name: unknown, revenue?: { amount?: unknown; currency?: unknown } | null): string | null {
	if (typeof name !== 'string' || !NAME.test(name.trim())) return `event name "${String(name)}" must be 1 to 120 characters, without ; or |`
	if (revenue) {
		const { amount, currency } = revenue
		if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) return `revenue amount ${String(amount)} is not a number of 0 or more`
		// without a valid code the server would count the amount in the site's own currency
		if (currency !== undefined && !(typeof currency === 'string' && CURRENCY.test(currency))) return `currency "${String(currency)}" is not an ISO 4217 code`
	}
	return null
}

/**
 * Checks an event against the rules the server applies, so a mistake shows up in the
 * console instead of as a missing event. Returns the reason it would be dropped, or null.
 * Props the server would drop are removed here with a warning.
 */
export function problem(p: Payload, warn: (msg: string) => void): string | null {
	if (!p.s) return 'no site id'
	const why = eventProblem(p.n, p.$ && { amount: p.$.a, currency: p.$.c })
	if (why) return why
	p.n = p.n.trim()
	if (typeof p.u !== 'string' || !ABSOLUTE.test(p.u)) return `url "${p.u}" is not absolute`
	if (!HTTP.test(p.u)) return `url "${p.u}" is not http or https`
	if (p.$?.c) p.$.c = p.$.c.toUpperCase()
	if (p.p) {
		const kept: Props = {}
		let n = 0
		for (const [k, v] of Object.entries(p.p)) {
			if (!PROP_KEY.test(k) || !['string', 'number', 'boolean'].includes(typeof v)) {
				warn(`prop "${k}" dropped: keys are 1 to 64 letters, digits or _ . -, values are strings, numbers or booleans`)
				continue
			}
			if (++n > MAX_PROPS) {
				warn(`prop "${k}" dropped: at most ${MAX_PROPS} props`)
				continue
			}
			// the server keeps the first 300 characters; cut here so the body stays small
			kept[k] = typeof v === 'string' ? v.slice(0, MAX_PROP_LENGTH) : v
		}
		p.p = n ? kept : undefined
	}
	const size = byteLength(JSON.stringify(p))
	if (size > MAX_BODY) return `event is ${size} bytes; the server takes at most 16 KB (${MAX_BODY} bytes)`
	return null
}

export function createClient(options: ClientOptions): Client {
	const endpoint = endpointFor(options.host)
	const timeout = options.timeout ?? 10_000
	const concurrency = Math.max(1, options.concurrency ?? 1)
	const maxQueue = Math.max(1, options.maxQueue ?? 500)
	const maxAge = options.maxAge ?? 5 * 60_000
	const debug = options.debug ?? false
	let enabled = options.enabled ?? true
	const queue: Item[] = []
	let inFlight = 0
	let timer: ReturnType<typeof setTimeout> | null = null
	let idle: (() => void)[] = []

	const log = (msg: string, extra?: unknown) => {
		if (debug) console.info(`[misomoon] ${msg}`, ...(extra === undefined ? [] : [extra]))
	}
	const warn = (msg: string) => console.warn(`[misomoon] ${msg}`)

	function drop(item: Item, why: string) {
		const i = queue.indexOf(item)
		if (i >= 0) queue.splice(i, 1)
		log(`dropped ${item.payload.n} (${why})`, item.payload)
		item.settle(false)
	}

	function backoff(attempts: number): number {
		const base = Math.min(30_000, 1000 * 2 ** (attempts - 1))
		return Math.round(base / 2 + (Math.random() * base) / 2)
	}

	function schedule(at: number) {
		if (timer) clearTimeout(timer)
		timer = setTimeout(() => {
			timer = null
			pump()
		}, Math.max(0, at - Date.now()))
		// a pending retry must not keep a Node process alive; shutdown() is the way to wait
		;(timer as { unref?: () => void }).unref?.()
	}

	function pump() {
		const now = Date.now()
		for (const item of [...queue]) if (!item.sending && now - item.queuedAt > maxAge) drop(item, 'too old to date correctly')
		while (enabled && inFlight < concurrency) {
			const next = queue.find((i) => !i.sending)
			if (!next) break
			// with one request at a time a waiting event holds back the ones behind it, so order holds
			if (next.notBefore > now) {
				schedule(next.notBefore)
				break
			}
			void attempt(next)
		}
		if (queue.length === 0) {
			const waiting = idle
			idle = []
			for (const done of waiting) done()
		}
	}

	async function attempt(item: Item) {
		item.sending = true
		item.attempts++
		inFlight++
		const fetchFn = options.fetch ?? globalThis.fetch
		const ctrl = typeof AbortController === 'function' ? new AbortController() : null
		const abort = setTimeout(() => ctrl?.abort(), timeout)
		let retry: string | null = null
		try {
			// text/plain keeps a browser from sending a CORS preflight, like m.js
			const res = await fetchFn(endpoint, {
				method: 'POST',
				headers: { 'content-type': 'text/plain', ...options.headers, ...item.headers },
				body: JSON.stringify(item.payload),
				signal: ctrl?.signal,
			})
			await discard(res)
			if (res.status === 429 || res.status >= 500) retry = `status ${res.status}`
			else if (!res.ok) {
				item.sending = false
				drop(item, `status ${res.status}`)
			} else {
				const i = queue.indexOf(item)
				if (i >= 0) queue.splice(i, 1)
				log(`sent ${item.payload.n}`, item.payload)
				item.settle(true)
			}
		} catch (e) {
			retry = ctrl?.signal.aborted ? `no answer in ${timeout} ms` : String(e)
		} finally {
			clearTimeout(abort)
			inFlight--
		}
		if (retry) {
			item.sending = false
			// shutdown() gave up waiting while this was in flight: settle it rather than keep it
			if (!enabled) drop(item, `${retry} after shutdown`)
			else {
				item.notBefore = Date.now() + backoff(item.attempts)
				log(`retrying ${item.payload.n} (${retry})`)
			}
		}
		pump()
	}

	function enqueue(payload: Payload, headers: Record<string, string> | undefined, settle: (ok: boolean) => void) {
		if (!enabled) return settle(false)
		let p: Payload | null = { ...payload, $: payload.$ && { ...payload.$ }, ts: payload.ts ?? Date.now(), id: payload.id ?? uuid() }
		if (!p.$) delete p.$
		// as m.js does with data-prop-*: an engagement beacon carries no props
		if (options.props && p.e === undefined) p.p = { ...options.props, ...p.p }
		if (options.beforeSend) {
			try {
				p = options.beforeSend(p)
			} catch (e) {
				warn(`beforeSend threw, event dropped: ${String(e)}`)
				return settle(false)
			}
			if (!p) return settle(false)
		}
		const why = problem(p, warn)
		if (why) {
			warn(`event dropped: ${why}`)
			return settle(false)
		}
		const item: Item = { payload: p, headers, queuedAt: Date.now(), attempts: 0, notBefore: 0, sending: false, settle }
		queue.push(item)
		// keep the newest events: an outage drops the oldest first
		while (queue.length > maxQueue) {
			const oldest = queue.find((i) => !i.sending)
			if (!oldest) break
			drop(oldest, 'queue full')
		}
		pump()
	}

	/** Resolves once every queued event is sent or dropped, or after `limit` ms. Retries go on meanwhile. */
	function flush(limit = timeout + 1000) {
		for (const item of queue) if (!item.sending) item.notBefore = 0
		return new Promise<void>((resolve) => {
			const done = () => {
				clearTimeout(t)
				idle = idle.filter((d) => d !== done)
				resolve()
			}
			const t = setTimeout(done, limit)
			idle.push(done)
			pump()
		})
	}

	return {
		get pending() {
			return queue.length
		},
		send(payload, headers) {
			return new Promise<boolean>((settle) => {
				// analytics must never break the app: anything unexpected drops the event instead
				try {
					enqueue(payload, headers, settle)
				} catch (e) {
					warn(`event dropped: ${String(e)}`)
					settle(false)
				}
			})
		},
		flush,
		setEnabled(on) {
			enabled = on
			if (on) return pump()
			if (timer) clearTimeout(timer)
			timer = null
			for (const item of [...queue]) if (!item.sending) drop(item, 'turned off')
		},
		async shutdown(limit) {
			await flush(limit)
			enabled = false
			if (timer) clearTimeout(timer)
			timer = null
			for (const item of [...queue]) if (!item.sending) drop(item, 'shut down')
		},
	}
}
