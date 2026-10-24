import { readdirSync, readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

const tracker = readFileSync(new URL('../../tracker/src/m.js', import.meta.url), 'utf8')
const payments = readFileSync(new URL('../../tracker/src/x/payments.js', import.meta.url), 'utf8')

interface FakeScript {
	tagName: 'SCRIPT'
	src: string
	defer: boolean
	attrs: Map<string, string>
	listeners: Record<string, () => void>
	setAttribute(n: string, v: string): void
	getAttribute(n: string): string | null
	hasAttribute(n: string): boolean
	readonly attributes: { name: string; value: string }[]
	readonly dataset: Record<string, string>
	addEventListener(type: string, fn: () => void): void
}

/** Just enough browser for init() to add a script, and for m.js to run from it. */
function fakeBrowser(href = 'https://shop.com/pricing') {
	const head: FakeScript[] = []
	const sent: Record<string, unknown>[] = []
	const location = new URL(href)
	const window: Record<string, unknown> = {
		location,
		history: { pushState: (_s: unknown, _t: string, u: string) => Object.assign(location, { href: new URL(u, location.href).href }) },
		addEventListener() {},
		navigator: { language: 'en', sendBeacon: (_url: string, body: string) => sent.push(JSON.parse(body)) > 0 },
		screen: { width: 1440, height: 900 },
		innerWidth: 1440,
		innerHeight: 900,
		scrollY: 0,
		localStorage: { getItem: () => null },
	}
	const document = {
		visibilityState: 'visible',
		hasFocus: () => true,
		referrer: '',
		title: 'Pricing',
		documentElement: { scrollHeight: 900, offsetHeight: 900, scrollTop: 0 },
		body: {},
		currentScript: null as FakeScript | null,
		addEventListener() {},
		head: { appendChild: (s: FakeScript) => head.push(s) },
		createElement(): FakeScript {
			const attrs = new Map<string, string>()
			const listeners: Record<string, () => void> = {}
			return {
				tagName: 'SCRIPT',
				src: '',
				defer: false,
				attrs,
				listeners,
				setAttribute: (n, v) => void attrs.set(n, v),
				getAttribute: (n) => attrs.get(n) ?? null,
				hasAttribute: (n) => attrs.has(n),
				get attributes() {
					return [...attrs].map(([name, value]) => ({ name, value }))
				},
				get dataset() {
					const camel = (n: string) => n.slice(5).replace(/-(\w)/g, (_, c: string) => c.toUpperCase())
					return Object.fromEntries([...attrs].filter(([n]) => n.startsWith('data-')).map(([n, v]) => [camel(n), v]))
				},
				addEventListener: (t, fn) => void (listeners[t] = fn),
			}
		},
		querySelector: (sel: string) => (sel === 'script[data-misomoon-sdk]' ? (head.find((s) => s.hasAttribute('data-misomoon-sdk')) ?? null) : null),
	}
	/** Runs m.js as the browser would once the added script arrives; `parts` are the site's ticked features. */
	const load = (...parts: string[]) => {
		const script = head[0]
		document.currentScript = script
		runInNewContext([tracker, ...parts].join('\n'), { window, document, URL, Date, JSON, console, Object })
	}
	/** m.js names custom events only; a pageview is the beacon without `e` */
	const names = () => sent.map((p) => p.n ?? (p.e != null ? 'engagement' : 'pageview'))
	return { window, document, head, sent, load, names }
}

let b: ReturnType<typeof fakeBrowser>
let web: typeof import('../src/web')

beforeEach(async () => {
	vi.resetModules()
	b = fakeBrowser()
	vi.stubGlobal('window', b.window)
	vi.stubGlobal('document', b.document)
	web = await import('../src/web')
})
afterEach(() => {
	vi.unstubAllGlobals()
	vi.useRealTimers()
	vi.restoreAllMocks()
})

describe('init', () => {
	it('adds the tracker once, with every option as the attribute m.js reads', () => {
		web.init({
			site: 'shop-com',
			host: 'https://shop.com/relay/',
			manual: true,
			hash: true,
			disable: ['vitals', 'clicks'],
			props: { Plan: 'pro' },
			downloadExtensions: ['sketch'],
		})
		web.init({ site: 'other', host: 'https://elsewhere.test' })
		expect(b.head).toHaveLength(1)
		const s = b.head[0]
		expect([s.src, s.defer]).toEqual(['https://shop.com/relay/m.js?s=shop-com', true])
		expect(Object.fromEntries(s.attrs)).toEqual({
			'data-misomoon-sdk': '',
			'data-manual': '',
			'data-hash': '',
			'data-disable': 'vitals,clicks',
			'data-download-ext': 'sketch',
			'data-prop-plan': 'pro',
		})
	})

	it('sends events to host when the tracker comes from src', () => {
		web.init({ site: 'shop-com', host: 'https://analytics.example.com/', src: '/static/m.js' })
		expect([b.head[0].src, b.head[0].getAttribute('data-api')]).toEqual(['/static/m.js?s=shop-com', 'https://analytics.example.com/api/event'])
	})

	it('takes an explicit src, and refuses to start without a site or host', () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {})
		web.init({ site: 'shop-com' })
		expect(b.head).toHaveLength(0)
		web.init({ site: 'shop-com', src: '/t.js', api: 'https://a.test/api/event' })
		expect([b.head[0].src, b.head[0].getAttribute('data-api')]).toEqual(['/t.js?s=shop-com', 'https://a.test/api/event'])
	})

	it('warns when the script is blocked', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
		web.init({ site: 'shop-com', host: 'https://a.test' })
		b.head[0].listeners.error()
		expect(warn.mock.calls[0][0]).toMatch(/could not load https:\/\/a.test\/m.js/)
	})
})

describe('calls before and after m.js loads', () => {
	it('m.js replays calls queued before it loaded, in order, after the first pageview', () => {
		web.init({ site: 'shop-com', host: 'https://shop.com/relay' })
		web.track('Signup', { props: { plan: 'pro' }, revenue: { amount: 19, currency: 'EUR' } })
		web.track('Autoplay', { interactive: false })
		b.load()
		web.track('After load')
		// the pageview opens the visit with its referrer; an event first would make it Direct
		expect(b.names()).toEqual(['pageview', 'Signup', 'Autoplay', 'After load'])
		b.sent.shift()
		// m.js passes the revenue on as given; the server reads both shapes
		expect(b.sent[0]).toMatchObject({ s: 'shop-com', u: 'https://shop.com/pricing', p: { plan: 'pro' }, $: { amount: 19, currency: 'EUR' } })
		expect(b.sent[1].i).toBe(false)
	})

	it("leaves the currency out when none is given, so the site's own currency counts it", () => {
		web.init({ site: 'shop-com', host: 'https://shop.com' })
		b.load()
		web.track('Purchase', { revenue: { amount: 19 } })
		expect(b.sent.find((p) => p.n === 'Purchase')!.$).toEqual({ amount: 19 })
	})

	it('sends a manual pageview with its own url', () => {
		web.init({ site: 'shop-com', host: 'https://shop.com', manual: true })
		b.load()
		web.pageview({ url: 'https://shop.com/pricing/step-2', props: { step: 2 } })
		web.pageview()
		expect(b.sent.filter((p) => p.w != null).map((p) => [p.u, p.p])).toEqual([
			['https://shop.com/pricing/step-2', { step: 2 }],
			['https://shop.com/pricing', {}],
		])
	})

	it('runs a callback once: after sending, or after a second when m.js never loads', () => {
		vi.useFakeTimers()
		web.init({ site: 'shop-com', host: 'https://shop.com' })
		const blocked = vi.fn()
		web.track('Download', { callback: blocked })
		vi.advanceTimersByTime(999)
		expect(blocked).not.toHaveBeenCalled()
		vi.advanceTimersByTime(1)
		b.load()
		expect(blocked).toHaveBeenCalledTimes(1)
		const loaded = vi.fn()
		web.track('Download', { callback: loaded })
		vi.advanceTimersByTime(5000)
		expect(loaded).toHaveBeenCalledTimes(1)
	})

	it('works with a script tag added by hand, without init', () => {
		web.track('Signup')
		expect((b.window.misomoon as { q: unknown[] }).q).toHaveLength(1)
	})
})

describe('on the server', () => {
	it('does nothing, and still runs callbacks', async () => {
		vi.unstubAllGlobals()
		vi.resetModules()
		const server = await import('../src/web')
		const cb = vi.fn()
		expect(() => {
			server.init({ site: 'shop-com', host: 'https://a.test' })
			server.track('Signup', { callback: cb })
			server.pageview()
		}).not.toThrow()
		expect(cb).toHaveBeenCalledTimes(1)
	})
})

describe('enabled: false', () => {
	it('adds no tracker, queues nothing, and still runs callbacks', async () => {
		web.init({ site: 'shop-com', host: 'https://shop.com', enabled: false })
		const cb = vi.fn()
		web.track('Signup', { callback: cb })
		web.pageview()
		expect(b.head).toHaveLength(0)
		expect(b.window.misomoon).toBeUndefined()
		expect(cb).toHaveBeenCalledTimes(1)
		await expect(web.ref()).resolves.toBeUndefined()
	})
})

describe('ref', () => {
	it("waits for m.js and hands out the page view's ref, which m.js reports once", async () => {
		vi.useFakeTimers()
		web.init({ site: 'shop-com', host: 'https://shop.com' })
		const pending = web.ref()
		await vi.advanceTimersByTimeAsync(200)
		b.load(payments)
		await vi.advanceTimersByTimeAsync(50)
		const ref = await pending
		expect(ref).toMatch(/^mm_[0-9a-f]{24}$/)
		expect(await web.ref()).toBe(ref)
		expect(b.sent.filter((p) => p.k)).toEqual([expect.objectContaining({ s: 'shop-com', e: 0, k: ref })])
	})

	it('resolves to undefined when m.js never loads, or the site has Payments off', async () => {
		vi.useFakeTimers()
		web.init({ site: 'shop-com', host: 'https://shop.com' })
		const blocked = web.ref(500)
		await vi.advanceTimersByTimeAsync(500)
		await expect(blocked).resolves.toBeUndefined()
		b.load()
		await expect(web.ref()).resolves.toBeUndefined()
	})
})

describe('ignore', () => {
	it('sets and clears the key m.js reads, and m.js then sends nothing', () => {
		const store = new Map<string, string>()
		const localStorage = {
			setItem: (k: string, v: string) => void store.set(k, v),
			removeItem: (k: string) => void store.delete(k),
			get misomoon_ignore() {
				return store.get('misomoon_ignore')
			},
		}
		vi.stubGlobal('localStorage', localStorage)
		b.window.localStorage = localStorage
		vi.spyOn(console, 'info').mockImplementation(() => {})
		web.ignore()
		expect(store.get('misomoon_ignore')).toBe('true')
		web.init({ site: 'shop-com', host: 'https://shop.com' })
		b.load()
		web.track('Signup')
		expect(b.sent).toEqual([])
		web.ignore(false)
		expect(store.has('misomoon_ignore')).toBe(false)
	})

	it('reads the choice back for an opt-out toggle, false when storage is blocked or on the server', () => {
		const store = new Map<string, string>()
		vi.stubGlobal('localStorage', {
			setItem: (k: string, v: string) => void store.set(k, v),
			removeItem: (k: string) => void store.delete(k),
			get misomoon_ignore() {
				return store.get('misomoon_ignore')
			},
		})
		expect(web.ignored()).toBe(false)
		web.ignore()
		expect(web.ignored()).toBe(true)
		web.ignore(false)
		expect(web.ignored()).toBe(false)
		vi.stubGlobal('localStorage', {
			get misomoon_ignore(): string {
				throw new DOMException('denied', 'SecurityError')
			},
		})
		expect(web.ignored()).toBe(false)
		vi.stubGlobal('window', undefined)
		expect(web.ignored()).toBe(false)
	})

	it('does not throw when storage is blocked', () => {
		vi.stubGlobal('localStorage', {
			setItem() {
				throw new DOMException('denied', 'SecurityError')
			},
		})
		expect(() => web.ignore()).not.toThrow()
	})
})

describe('typed', () => {
	it('checks event names and props at compile time, and sends as track() does', () => {
		type Events = { Signup: { plan: 'pro' | 'team' }; Logout: undefined }
		const m = web.typed<Events>()
		web.init({ site: 'shop-com', host: 'https://shop.com' })
		b.load()
		m.track('Signup', { props: { plan: 'pro' } })
		m.track('Logout')
		// @ts-expect-error not one of the events
		m.track('Sigup')
		// @ts-expect-error not one of the plans
		m.track('Signup', { props: { plan: 'free' } })
		expect(b.names()).toEqual(['pageview', 'Signup', 'Logout', 'Sigup', 'Signup'])
	})
})

describe('review fixes', () => {
	it('ref() gives up at once when the tracker fails to load', async () => {
		vi.useFakeTimers()
		vi.spyOn(console, 'warn').mockImplementation(() => {})
		web.init({ site: 'shop-com', host: 'https://shop.com' })
		const pending = web.ref()
		b.head[0].listeners.error()
		let result: string | undefined | null = null
		void pending.then((r) => (result = r))
		await vi.advanceTimersByTimeAsync(100)
		expect(result).toBeUndefined()
	})

	it('track() takes null options', () => {
		expect(() => web.track('Signup', null as never)).not.toThrow()
		expect(() => web.pageview(null as never)).not.toThrow()
	})

	it('drops an event the server would drop, saying why, and still runs its callback', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
		web.init({ site: 'shop-com', host: 'https://shop.com' })
		b.load()
		const cb = vi.fn()
		web.track('Plan; pro', { callback: cb })
		web.track('Purchase', { revenue: { amount: 5, currency: 'euro' } })
		web.track('Purchase', { revenue: { amount: -1, currency: 'EUR' } })
		expect(b.names()).toEqual(['pageview'])
		expect(cb).toHaveBeenCalledTimes(1)
		expect(warn.mock.calls.map((c) => c[0])).toEqual([expect.stringMatching(/; or \|/), expect.stringMatching(/ISO 4217/), expect.stringMatching(/amount/)])
	})
})

describe('parity with the script tag', () => {
	const dir = new URL('../../tracker/src/x/', import.meta.url)
	const parts = readdirSync(dir).map((f) => readFileSync(new URL(f, dir), 'utf8'))
	const source = [tracker, ...parts].join('\n')
	const kebab = (n: string) => 'data-' + n.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())

	it('sets every attribute m.js and its feature parts read', () => {
		const read = new Set([...[...source.matchAll(/\bdata\.([a-zA-Z]+)/g)].map((m) => kebab(m[1])), ...[...source.matchAll(/'([a-z]+)' in data\b/g)].map((m) => kebab(m[1]))])
		expect(source).toContain("'data-prop-'")
		web.init({ site: 'shop-com', host: 'https://a.test', src: 'https://cdn.test/m.js', api: 'https://a.test/api/event', manual: true, hash: true, disable: ['forms'], props: { plan: 'pro' }, downloadExtensions: ['dmg'] })
		const set = [...b.head[0].attrs.keys()]
		expect([...read].filter((a) => !set.includes(a))).toEqual([])
		expect(set).toContain('data-prop-plan')
	})

	it('can turn off every feature part that reads data-disable, and nothing else', () => {
		const parts = [...source.matchAll(/disable \|\| ''\)\.includes\('([a-z]+)'\)/g)].map((m) => m[1]).sort()
		const typed = readFileSync(new URL('../src/web.ts', import.meta.url), 'utf8').match(/disable\?: \(([^)]+)\)\[\]/)![1].match(/'([a-z]+)'/g)!.map((s) => s.slice(1, -1)).sort()
		expect(parts.length).toBeGreaterThan(9)
		expect(typed).toEqual(parts)
	})
})
