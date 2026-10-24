// The browser SDK loads m.js, the same tracker as the script tag, so pageviews, engaged
// time, Web Vitals and automatic events behave the same either way. Calls made before the
// script arrives wait in `misomoon.q`, which m.js replays on load. On the server every
// function does nothing, so it is safe to import from server-rendered code.

import { eventProblem, type EventOptions, type Props } from './client.js'

export { VERSION, type EventOptions, type Props, type Revenue } from './client.js'

export interface WebOptions {
	/** site id, as in m.js?s= */
	site: string
	/** where misomoon answers, or your proxy: `https://analytics.example.com` or `/relay` */
	host?: string
	/** the tracker's URL, when it isn't `<host>/m.js` */
	src?: string
	/** where events go, when it isn't next to the tracker (data-api) */
	api?: string
	/** send pageviews yourself with `pageview()` (data-manual) */
	manual?: boolean
	/** count `#/route` changes as pageviews (data-hash) */
	hash?: boolean
	/** log what the SDK does; the tracker itself always says in the console why it counts nothing */
	debug?: boolean
	/** features ticked in the site settings to turn off on these pages (data-disable) */
	disable?: ('outbound' | 'downloads' | 'forms' | 'events' | 'payments' | 'vitals' | 'clicks' | 'errors' | 'fields' | 'media' | 'content')[]
	/** props on every event (data-prop-*) */
	props?: Record<string, string>
	/** more file extensions that count as downloads (data-download-ext) */
	downloadExtensions?: string[]
	/** false adds no tracker and sends nothing, for example in development. Default true. */
	enabled?: boolean
}

export interface TrackOptions extends EventOptions {
	/** Runs after the event is sent, or after a second when the tracker never loads (an ad blocker). */
	callback?: () => void
}

/**
 * Your events and their props, to type `track()`:
 * `type Events = { Signup: { plan: 'pro' | 'team' }; Logout: undefined }`.
 */
export type EventMap = Record<string, Props | undefined>

export type TypedTrackOptions<P> = Omit<TrackOptions, 'props'> & { props?: P }

export interface MisomoonApi<E extends EventMap = EventMap> {
	track<N extends keyof E & string>(name: N, options?: TypedTrackOptions<E[N]>): void
	pageview(options?: PageviewOptions): void
	ref(wait?: number): Promise<string | undefined>
}

export interface PageviewOptions {
	url?: string
	props?: Props
}

type Tracker = ((name: string, opts?: Record<string, unknown>) => void) & {
	q?: unknown[]
	/** set by m.js once it runs; the queue stub has neither */
	x?: unknown
	ref?: () => string | undefined
}

const MARK = 'data-misomoon-sdk'
const CALLBACK_FALLBACK = 1000
const IGNORE = 'misomoon_ignore'
// init({ enabled: false }): nothing is queued, callbacks run at once
let disabled = false
// the script failed to load (an ad blocker): ref() stops waiting for it
let blocked = false

const browser = () => typeof window !== 'undefined' && typeof document !== 'undefined'

/** The queue m.js replays on load (docs/tracking.md, "Calls made before m.js loads"). */
function tracker(): Tracker {
	const w = window as unknown as { misomoon?: Tracker }
	if (!w.misomoon) {
		const stub: Tracker = function () {
			;(stub.q = stub.q || []).push(arguments)
		}
		w.misomoon = stub
	}
	return w.misomoon
}

/** The tracker's URL, carrying the site id: m.js reads it there, and the server adds the site's features. */
function scriptSrc(o: WebOptions): string | null {
	const src = o.src || (o.host && o.host.replace(/\/+$/, '') + '/m.js')
	if (!src) return null
	return `${src}${src.includes('?') ? '&' : '?'}s=${encodeURIComponent(o.site)}`
}

/** Adds the tracker to the page once. Later calls do nothing. */
export function init(options: WebOptions): void {
	if (!browser()) return
	if (options.enabled === false) {
		disabled = true
		if (options.debug) console.info('[misomoon] init: enabled is false, sending nothing')
		return
	}
	if (document.querySelector(`script[${MARK}]`)) {
		if (options.debug) console.info('[misomoon] init: the tracker is already on the page')
		return
	}
	const src = scriptSrc(options)
	if (!options.site || !src) {
		console.warn('[misomoon] init needs a site and a host (or src)')
		return
	}
	tracker()
	const s = document.createElement('script')
	s.defer = true
	s.src = src
	const attrs: Record<string, string | undefined> = {
		[MARK]: '',
		// m.js posts next to its own URL, so a tracker served from src needs host's endpoint spelled out
		'data-api': options.api ?? (options.src && options.host ? options.host.replace(/\/+$/, '') + '/api/event' : undefined),
		'data-manual': options.manual ? '' : undefined,
		'data-hash': options.hash ? '' : undefined,
		'data-disable': options.disable?.join(','),
		'data-download-ext': options.downloadExtensions?.join(','),
	}
	for (const [k, v] of Object.entries(options.props ?? {})) attrs['data-prop-' + k.toLowerCase()] = String(v)
	for (const [k, v] of Object.entries(attrs)) if (v !== undefined) s.setAttribute(k, v)
	s.addEventListener('error', () => {
		blocked = true
		console.warn(`[misomoon] could not load ${src}; an ad blocker may block it, see docs/PROXY.md`)
	})
	;(document.head || document.documentElement).appendChild(s)
}

/** Sends a custom event. `track('Signup', { props: { plan: 'pro' } })` */
export function track(name: string, options?: TrackOptions | null): void {
	const { callback, ...rest } = options || {}
	let done = false
	const once = () => {
		if (done) return
		done = true
		callback?.()
	}
	if (!browser() || disabled) return void once()
	// m.js sends whatever it gets, and the server drops a bad event without a word
	const why = eventProblem(name, rest.revenue)
	if (why) {
		console.warn(`[misomoon] event dropped: ${why}`)
		return void once()
	}
	const opts: Record<string, unknown> = { ...rest }
	if (callback) {
		opts.callback = once
		setTimeout(once, CALLBACK_FALLBACK)
	}
	tracker()(name, opts)
}

/** Sends a pageview yourself, for `manual: true` or a view the URL doesn't show. */
export function pageview(options?: PageviewOptions | null): void {
	if (!browser() || disabled) return
	tracker()('pageview', { u: options?.url, props: options?.props })
}

/**
 * The payment ref of this page view, for a checkout your server creates
 * (docs/revenue.md). Waits up to `wait` ms for m.js to load, and resolves to undefined
 * when it doesn't (an ad blocker), or when the site's Payments feature is off. A
 * checkout without a ref still works; its payment just can't find the visit.
 */
export function ref(wait = 3000): Promise<string | undefined> {
	if (!browser() || disabled) return Promise.resolve(undefined)
	const until = Date.now() + wait
	return new Promise((resolve) => {
		const check = () => {
			const m = (window as unknown as { misomoon?: Tracker }).misomoon
			// m.js replaces the queue stub with itself, and its payments part adds ref()
			if (m && m.x) return resolve(m.ref?.() || undefined)
			if (blocked || Date.now() >= until) return resolve(undefined)
			setTimeout(check, 50)
		}
		check()
	})
}

/**
 * Leaves this browser out of the counts from the next page load, for your own visits.
 * `ignore(false)` counts it again.
 */
export function ignore(on = true): void {
	if (!browser()) return
	try {
		if (on) localStorage.setItem(IGNORE, 'true')
		else localStorage.removeItem(IGNORE)
	} catch {
		// storage blocked: there is nowhere to remember the choice
	}
}

/** Whether this browser is left out of the counts, by `ignore()` or an opt-out button. Reads the key as m.js does. */
export function ignored(): boolean {
	if (!browser()) return false
	try {
		return !!(localStorage as unknown as Record<string, string | undefined>)[IGNORE]
	} catch {
		return false
	}
}

/** The functions typed with your own events: `const misomoon = typed<Events>()`. */
export function typed<E extends EventMap>(): MisomoonApi<E> {
	return { track, pageview, ref } as MisomoonApi<E>
}
