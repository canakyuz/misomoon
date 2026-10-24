// React Native and Expo. A screen is a pageview at https://<domain>/<screen>, and the time
// the app is in the foreground on a screen is its engaged time. Like the browser tracker it
// stores nothing on the device: the server derives the daily visitor id from the address
// and the user agent, so the SDK needs no AsyncStorage and no consent for an identifier.

import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from 'react'
import { AppState, Dimensions, Linking, Platform } from 'react-native'
import { createClient, newRef, uuid, VERSION, type Client, type ClientOptions, type EventOptions, type Payload, type Props } from './client.js'

export { VERSION, type ClientOptions, type EventOptions, type Payload, type Props, type Revenue } from './client.js'

export interface NativeOptions extends ClientOptions {
	/** the site's domain in misomoon; screens become https://<domain>/<screen> */
	domain: string
	/** shown in place of a browser in reports, such as { name: 'Recipes', version: '2.3.0' } */
	app?: { name?: string; version?: string }
}

export interface ScreenOptions {
	props?: Props
	/** defaults to the screen name */
	title?: string
}

export interface NativeClient {
	/** Counts a screen view. A repeat of the current screen is ignored. */
	screen(name: string, options?: ScreenOptions): void
	track(name: string, options?: EventOptions): void
	/**
	 * Keeps a link's utm_* parameters for the next screen view. The client reads the link
	 * that opens the app by itself; call this only for links it can't see.
	 */
	openedFrom(url: string): void
	/**
	 * The payment ref of the current screen view: send it to the server that creates the
	 * checkout, which puts it in the metadata as `misomoon_ref` (docs/revenue.md). A new
	 * screen view gets a new ref.
	 */
	ref(): string
	/**
	 * Turns sending off or on, for an opt-out the user sets in the app. Off drops what is
	 * queued. The app keeps the choice and passes it as `enabled` on the next launch.
	 */
	setEnabled(on: boolean): void
	/** Starts following the app's foreground and background. Returns the function that stops it. */
	start(): () => void
	flush(timeout?: number): Promise<void>
	readonly pending: number
}

/** The parts of react-native the client uses; tests pass their own. */
export interface Native {
	AppState: {
		currentState: string | null | undefined
		addEventListener(type: 'change', listener: (state: string) => void): { remove(): void }
	}
	Dimensions: { get(dim: 'window' | 'screen'): { width: number; height: number } }
	/** constants differ by OS; Android's has Release, the OS version such as "14" */
	Platform: { OS: string; Version: string | number; isPad?: boolean; constants?: object }
	/** the link that opened the app, whose campaign the visit gets */
	Linking?: {
		getInitialURL(): Promise<string | null | undefined>
		addEventListener(type: 'url', listener: (event: { url: string }) => void): { remove(): void }
	}
}

/** A gap longer than a visit's inactivity limit (SESSION_GAP on the server) starts a new visit. */
const VISIT_GAP = 30 * 60_000
/** How long a visit's first screen view waits for the link that opened the app. */
const LINK_WAIT = 1000
const CAMPAIGN = /^(utm_(source|medium|campaign|term|content)|gclid|msclkid|ref|source)$/

/** The leading dotted number: `v2.3.0-rc1` gives `2.3.0`, `17.4` stays `17.4`. */
const numeric = (v: unknown) => String(v ?? '').match(/\d+(?:\.\d+)*/)?.[0] ?? ''

const token = (s: string | undefined, fallback: string) => (s ?? '').replace(/[^\w.-]/g, '').slice(0, 32) || fallback

/**
 * A user agent the server parses (`APP` in core/src/ua.ts): the platform part is shaped
 * like a browser's, so OS, version and phone or tablet come out right; the app takes
 * the browser's place. Expo web keeps the browser's own user agent.
 */
export function appUserAgent(rn: Native, app: NativeOptions['app'] = {}): string | null {
	const name = token(app.name, 'App')
	const version = numeric(app.version) || '0'
	const { OS, Version, isPad, constants } = rn.Platform
	let platform: string
	if (OS === 'ios') {
		const v = numeric(Version).replace(/\./g, '_')
		platform = isPad ? `iPad; CPU OS ${v} like Mac OS X` : `iPhone; CPU iPhone OS ${v} like Mac OS X`
	} else if (OS === 'android') {
		const { width, height } = rn.Dimensions.get('screen')
		// Android has no tablet flag; 600dp on the short side is its own tablet breakpoint
		const tablet = Math.min(width, height) >= 600
		const release = (constants as { Release?: string } | undefined)?.Release ?? ''
		platform = `Linux; Android ${release}${tablet ? '' : '; Mobile'}`
	} else if (OS === 'macos') {
		// the server's macOS rule needs a version; 10_15 is what Safari itself reports on every macOS since 11
		platform = `Macintosh; Intel Mac OS X ${numeric(Version).replace(/\./g, '_') || '10_15'}`
	} else if (OS === 'windows') platform = 'Windows NT 10.0; Win64; x64'
	else return null
	return `MisomoonApp/${VERSION} (${platform}) ${name}/${version}`
}

function language(): string | undefined {
	try {
		return Intl.DateTimeFormat().resolvedOptions().locale
	} catch {
		return undefined
	}
}

const decode = (s: string) => {
	try {
		return decodeURIComponent(s.replace(/\+/g, ' '))
	} catch {
		return null
	}
}

/** The campaign parameters of a link as `?utm_source=...`, or ''. Parsed by hand: see client.ts on URL. */
export function campaignQuery(url: string): string {
	const query = String(url).split('#')[0].split('?')[1]
	if (!query) return ''
	const kept = new Map<string, string>()
	for (const pair of query.split('&')) {
		const i = pair.indexOf('=')
		const k = decode(i < 0 ? pair : pair.slice(0, i))
		const v = decode(i < 0 ? '' : pair.slice(i + 1))
		if (k && v !== null && CAMPAIGN.test(k)) kept.set(k, v)
	}
	const s = [...kept].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
	return s ? '?' + s : ''
}

function screenPath(name: string): string {
	const path = name.startsWith('/') ? name : '/' + name
	return path.replace(/\s+/g, '-')
}

// No cast: this fails to compile if react-native's types stop matching `Native`.
const realNative: Native = { AppState, Dimensions, Platform, Linking }

export function createNativeClient(options: NativeOptions, rn: Native = realNative): NativeClient {
	const ua = appUserAgent(rn, options.app)
	const domain = typeof options.domain === 'string' ? options.domain.trim().replace(/^https?:\/\//, '').replace(/[/?#].*$/, '') : ''
	if (!domain) console.warn('[misomoon] MisomoonProvider needs the domain of your site in misomoon; sending nothing')
	const lang = language()
	const client: Client = createClient({
		maxQueue: 200,
		...options,
		enabled: Boolean(domain) && options.enabled !== false,
		headers: { ...options.headers, ...(ua ? { 'user-agent': ua } : {}) },
	})

	// key: the screen view's key, which its engagement carries so the server adds it to the view
	let current: { name: string; url: string; title: string; props?: Props; key: string } | null = null
	let campaign = ''
	// iOS can report 'unknown' before the first change; only 'background' means not in use
	let activeSince = rn.AppState.currentState === 'background' ? 0 : Date.now()
	let engaged = 0
	let backgroundAt = 0
	let currentRef = ''

	// Events wait here, in order, while a new visit waits for the link that opened the app:
	// the server keeps the source of a visit's first event, so the campaign must be on it.
	let held: Payload[] | null = null
	let release: (() => void) | null = null

	function send(p: Payload) {
		if (held) held.push(p)
		else void client.send(p)
	}

	function hold(link?: Promise<unknown>) {
		if (held) return
		held = []
		const timer = setTimeout(() => finish(), LINK_WAIT)
		const finish = () => {
			// a later hold has its own finish
			if (release !== finish) return
			clearTimeout(timer)
			const items = held ?? []
			held = release = null
			const view = items.find((p) => p.n === 'pageview')
			if (view) {
				// the view went in before the link arrived: give it, and what followed on its screen, the campaign
				const base = view.u
				if (campaign && !base.includes('?')) {
					for (const p of items) if (p.u === base) p.u = base + campaign
					if (current?.url === base) current.url = base + campaign
				}
				campaign = ''
			}
			for (const p of items) void client.send(p)
		}
		release = finish
		link?.then(finish, finish)
	}

	// a cold start: the app may have been opened by a link
	try {
		const initial = rn.Linking?.getInitialURL()
		if (initial) {
			hold(
				initial.then((url) => {
					if (typeof url === 'string') campaign = campaignQuery(url) || campaign
				}),
			)
		}
	} catch {
		// no Linking on this platform: screens go out at once
	}

	function pause() {
		if (activeSince) engaged += Date.now() - activeSince
		activeSince = 0
	}

	function sendEngagement() {
		if (!current) return
		const running = activeSince
		pause()
		// sub-second blips (a screen passed through on the way to another) aren't engagement
		if (engaged >= 1000) send({ s: options.site, n: 'engagement', u: current.url, e: engaged, y: current.key })
		engaged = 0
		if (running) activeSince = Date.now()
	}

	function view(name: string, title: string, props?: Props) {
		const url = `https://${domain}${screenPath(name)}${campaign}`
		campaign = ''
		current = { name, url, title, props, key: uuid() }
		currentRef = ''
		engaged = 0
		activeSince = rn.AppState.currentState === 'background' ? 0 : Date.now()
		const screen = rn.Dimensions.get('screen')
		const win = rn.Dimensions.get('window')
		send({ s: options.site, n: 'pageview', u: url, t: title, w: Math.round(screen.width), vw: Math.round(win.width), l: lang, p: props, y: current.key })
	}

	function onChange(state: string) {
		if (state === 'active') {
			// back after the visit ended: the next event would open a visit with no page, so count the
			// screen again, after a moment for the link that may have brought the app back
			if (backgroundAt && Date.now() - backgroundAt >= VISIT_GAP && current) {
				hold()
				view(current.name, current.title, current.props)
			} else activeSince = activeSince || Date.now()
			backgroundAt = 0
			return
		}
		// iOS goes 'inactive' for Control Center and the app switcher: pause, send on 'background'
		pause()
		if (state === 'background') {
			backgroundAt = Date.now()
			sendEngagement()
			release?.()
			void client.flush()
		}
	}

	return {
		get pending() {
			return client.pending + (held?.length ?? 0)
		},
		screen(name, opts) {
			if (typeof name !== 'string' || !name) return
			opts = opts || {}
			const url = `https://${domain}${screenPath(name)}`
			if (current && !campaign && current.url.split('?')[0] === url) return
			sendEngagement()
			view(name, opts.title ?? name, opts.props)
		},
		track(name, opts) {
			opts = opts || {}
			send({
				s: options.site,
				n: name,
				u: current?.url ?? `https://${domain}/`,
				p: opts.props,
				$: opts.revenue && { a: opts.revenue.amount, c: opts.revenue.currency },
				i: opts.interactive === false ? false : undefined,
			})
		},
		openedFrom(url) {
			campaign = campaignQuery(url)
		},
		ref() {
			if (currentRef) return currentRef
			currentRef = newRef()
			// an engagement with no time and a ref stores nothing but the ref, with this visit
			send({ s: options.site, n: 'engagement', u: current?.url ?? `https://${domain}/`, e: 0, k: currentRef })
			return currentRef
		},
		start() {
			const sub = rn.AppState.addEventListener('change', onChange)
			// a link that opens the running app: its campaign goes on the next screen view
			let links: { remove(): void } | undefined
			try {
				links = rn.Linking?.addEventListener('url', (e) => {
					campaign = campaignQuery(e?.url ?? '') || campaign
					release?.()
				})
			} catch {
				// no Linking on this platform
			}
			return () => {
				sub.remove()
				links?.remove()
				sendEngagement()
				release?.()
				void client.flush()
			}
		},
		flush(t) {
			release?.()
			return client.flush(t)
		},
		// without a domain there is no page to count, so it stays off
		setEnabled: (on) => client.setEnabled(on && Boolean(domain)),
	}
}

const Context = /* @__PURE__ */ createContext<NativeClient | null>(null)

/** Wrap your app once. Options are read on the first render. */
export function MisomoonProvider({ children, ...options }: NativeOptions & { children?: ReactNode }) {
	const [client] = useState(() => createNativeClient(options))
	useEffect(() => client.start(), [client])
	return createElement(Context.Provider, { value: client }, children)
}

export function useMisomoon(): NativeClient {
	const client = useContext(Context)
	if (!client) throw new Error('useMisomoon must be used inside <MisomoonProvider>')
	return client
}

/** Counts a screen view whenever `name` changes. With Expo Router, pass `usePathname()`. */
export function useScreen(name: string | null | undefined, options?: ScreenOptions): void {
	const client = useMisomoon()
	useEffect(() => {
		if (name) client.screen(name, options)
		// props and title belong to the view that name starts, so they don't restart it
	}, [client, name])
}

/** The part of a React Navigation container ref used here. */
export interface NavigationRefLike {
	getCurrentRoute(): { name: string } | undefined
}

/**
 * Counts each React Navigation route as a screen. Spread the result on the container:
 * `<NavigationContainer ref={ref} {...useNavigationTracking(ref)}>`. These are the two
 * callbacks React Navigation's screen tracking guide uses, so the first screen counts too.
 */
export function useNavigationTracking(ref: NavigationRefLike): { onReady: () => void; onStateChange: () => void } {
	const client = useMisomoon()
	const [handlers] = useState(() => {
		const onChange = () => {
			const route = ref.getCurrentRoute()
			if (route) client.screen(route.name)
		}
		return { onReady: onChange, onStateChange: onChange }
	})
	return handlers
}
