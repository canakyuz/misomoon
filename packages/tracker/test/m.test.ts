import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { gzipSync } from 'node:zlib'
import { transform } from 'esbuild'
import { describe, expect, it } from 'vite-plus/test'

const code = readFileSync(new URL('../src/m.js', import.meta.url), 'utf8')

type Body = Record<string, unknown>
/** A feature part: it pushes its hook, which gets the engagement beacon, or nothing for a new page view. */
type Part = (api: ((p?: Body) => unknown)[] & { data: Record<string, string>; send: (p: Body) => void }) => void

/** data-prop-plan -> propPlan, as the browser's dataset names it */
const camel = (attr: string) => attr.slice(5).replace(/-(\w)/g, (_, c: string) => c.toUpperCase())

/** Runs m.js against a minimal browser and records every beacon it sends. */
function load(
	href = 'https://shop.com/pricing',
	src = 'https://shop.com/relay/m.js?s=shop',
	attrs: Record<string, string> = {},
	opts: { nav?: Record<string, unknown>; queued?: unknown[][]; storage?: Record<string, string>; prerendering?: boolean } = {},
) {
	const sent: { url: string; body: Body }[] = []
	const logs: unknown[][] = []
	const scripts: string[] = []
	const listeners: { type: string; fn: () => void }[] = []
	const clock = { now: 1_000_000 }
	const location = new URL(href)
	const listen = (type: string, fn: () => void) => listeners.push({ type, fn })
	const window: Record<string, unknown> = {
		location,
		history: { pushState: (_s: unknown, _t: string, u: string) => Object.assign(location, { href: new URL(u, location.href).href }) },
		addEventListener: listen,
		navigator: { sendBeacon: (url: string, body: string) => sent.push({ url: String(url), body: JSON.parse(body) }) > 0, ...opts.nav },
		screen: { width: 1440 },
		innerHeight: 900,
		scrollY: 0,
		localStorage: { ...opts.storage },
		misomoon: opts.queued ? { q: opts.queued } : undefined,
	}
	const document = {
		currentScript: {
			src,
			dataset: Object.fromEntries(Object.entries(attrs).map(([k, v]) => [camel(k), v])),
			attributes: Object.entries(attrs).map(([name, value]) => ({ name, value })),
		},
		hidden: false,
		focused: true,
		// a hidden tab never has focus
		hasFocus() {
			return this.focused && !this.hidden
		},
		prerendering: !!opts.prerendering,
		referrer: '',
		documentElement: { scrollHeight: 1800 },
		head: { appendChild: (el: unknown) => el },
		createElement: () => ({
			set src(v: unknown) {
				scripts.push(String(v))
			},
		}),
		addEventListener: listen,
	}
	runInNewContext(code, { window, document, URL, JSON, Date: { now: () => clock.now }, console: { info: (...a: unknown[]) => logs.push(a) } })
	const misomoon = window.misomoon as ((name: string, opts?: Record<string, unknown>) => void) & { ref: () => unknown; x: (fn: Part) => void }
	const views = () => sent.filter((s) => s.body.w != null)
	const engagements = () => sent.filter((s) => s.body.e != null)
	const fire = (type: string, ev: unknown = {}) => listeners.filter((l) => l.type === type).forEach((l) => (l.fn as (e: unknown) => void)(ev))
	return { sent, views, engagements, misomoon, scripts, logs, clock, fire, document, window, history: window.history as { pushState: (s: unknown, t: string, u: string) => void } }
}

describe('m.js', () => {
	it('stays under 1 KB gzipped', async () => {
		const { code: min } = await transform(code, { minify: true, target: 'es2019' })
		expect(gzipSync(min).length).toBeLessThan(1000)
	})

	it('reads the site from its own URL and posts next to itself, so a proxy prefix just works', () => {
		const t = load()
		expect([t.sent[0].url, t.sent[0].body.s]).toEqual(['https://shop.com/relay/api/event', 'shop'])
		expect(load('https://shop.com/', 'https://app.misomoon.com/m.js?s=shop').sent[0].url).toBe('https://app.misomoon.com/api/event')
		expect(load('https://shop.com/', 'https://shop.com/m.js?s=shop', { 'data-api': 'https://shop.com/e' }).sent[0].url).toBe('https://shop.com/e')
	})

	it('sends a pageview with the referrer, screen width and a new view key, and no name', () => {
		const { body } = load().sent[0]
		expect(body).toEqual({ r: '', w: 1440, p: {}, s: 'shop', u: 'https://shop.com/pricing', y: expect.any(Number) })
		expect(body.y).toBeGreaterThan(0)
		expect(body.y).toBeLessThan(1)
		expect(load().sent[0].body.y).not.toBe(body.y)
	})

	it("sends each page view's key with its engagement beacons and events", () => {
		const t = load()
		t.clock.now += 2000
		t.misomoon('Signup')
		t.history.pushState(null, '', '/docs')
		t.clock.now += 2000
		t.document.hidden = true
		t.fire('visibilitychange')
		const [pricing, docs] = t.views().map((v) => v.body.y)
		expect(pricing).not.toBe(docs)
		// the beacon that ends /pricing goes before /docs' pageview, with /pricing's key
		expect(t.sent.map((s) => [s.body.n ?? (s.body.e != null ? 'engagement' : 'pageview'), s.body.y])).toEqual([
			['pageview', pricing],
			['Signup', pricing],
			['engagement', pricing],
			['pageview', docs],
			['engagement', docs],
		])
	})

	it('says once why it counts nothing', () => {
		const cases: [ReturnType<typeof load>, string][] = [
			[load('https://shop.com/', 'https://shop.com/m.js'), 'site'],
			[load('https://shop.com/#misomoon-overlay'), 'overlay'],
			[load('https://shop.com/', undefined, {}, { nav: { webdriver: true } }), 'bot'],
			[load('https://shop.com/', undefined, {}, { storage: { misomoon_ignore: 'true' } }), 'ignored'],
		]
		for (const [t, why] of cases) {
			t.misomoon('Signup')
			expect([t.sent, t.logs]).toEqual([[], [['misomoon skipped:', why]]])
		}
		expect(load().logs).toEqual([])
	})

	it('loads the overlay from next to itself on a page opened for it', () => {
		expect(load('https://shop.com/pricing#misomoon-overlay').scripts).toEqual(['https://shop.com/relay/overlay.js'])
		expect(load().scripts).toEqual([])
	})

	it('skips automatic repeats of the same URL and leaves the hash off', () => {
		const t = load()
		t.history.pushState(null, '', '/pricing#faq')
		expect(t.views()).toHaveLength(1)
		t.history.pushState(null, '', '/docs')
		t.fire('popstate')
		expect(t.views().map((v) => v.body.u)).toEqual(['https://shop.com/pricing', 'https://shop.com/docs'])
	})

	it('counts hash routes with data-hash', () => {
		const t = load('https://shop.com/#/pricing', undefined, { 'data-hash': '' })
		// a link to #/docs: the browser fires popstate, then hashchange
		Object.assign(t.window.location, { href: 'https://shop.com/#/docs' })
		t.fire('popstate')
		expect(t.views().map((v) => v.body.u)).toEqual(['https://shop.com/#/pricing', 'https://shop.com/#/docs'])
	})

	it('counts every manual pageview', () => {
		const t = load('https://shop.com/pricing', undefined, { 'data-manual': '' })
		expect(t.views()).toHaveLength(0)
		t.misomoon('pageview')
		t.misomoon('pageview')
		t.misomoon('pageview', { u: 'https://shop.com/pricing/step-2', props: { plan: 'pro' } })
		expect(t.views().map((v) => v.body.u)).toEqual(['https://shop.com/pricing', 'https://shop.com/pricing', 'https://shop.com/pricing/step-2'])
		expect(t.views()[2].body.p).toEqual({ plan: 'pro' })
	})

	it('sends interactive: false and script-wide props, and calls back', () => {
		const t = load('https://shop.com/pricing', undefined, { 'data-prop-plan': 'pro' })
		let called = 0
		t.misomoon('Video: Autoplay', { interactive: false, props: { id: 'v1' }, callback: () => called++ })
		const ev = t.sent.find((s) => s.body.n === 'Video: Autoplay')!
		expect([ev.body.i, ev.body.p, called]).toEqual([false, { plan: 'pro', id: 'v1' }, 1])
		expect(t.views()[0].body.p).toEqual({ plan: 'pro' })
	})

	it('passes revenue as given, for the server to read', () => {
		const t = load()
		t.misomoon('Purchase', { revenue: { amount: 19 } })
		t.misomoon('Purchase', { revenue: { amount: '5', currency: 'eur' } })
		expect(t.sent.filter((s) => s.body.n === 'Purchase').map((s) => s.body.$)).toEqual([{ amount: 19 }, { amount: '5', currency: 'eur' }])
	})

	it('sends calls queued before it loaded after the first pageview', () => {
		const t = load('https://shop.com/pricing', undefined, {}, { queued: [['Signup', { props: { plan: 'pro' } }]] })
		expect(t.sent.map((s) => s.body.n ?? 'pageview')).toEqual(['pageview', 'Signup'])
	})

	it('waits for a prerendered page to be shown', () => {
		const t = load('https://shop.com/pricing', undefined, {}, { prerendering: true })
		expect(t.sent).toEqual([])
		t.fire('prerenderingchange')
		expect(t.views()).toHaveLength(1)
	})

	it('sends engaged time and the share of the page seen when the page is hidden', () => {
		const t = load()
		t.clock.now += 400
		t.document.hidden = true
		t.fire('visibilitychange')
		// a sub-second blip is kept for later
		expect(t.engagements()).toEqual([])
		t.document.hidden = false
		t.fire('visibilitychange')
		t.clock.now += 5000
		t.document.hidden = true
		t.fire('visibilitychange')
		expect(t.engagements().map((s) => s.body)).toEqual([{ e: 5400, d: 50, s: 'shop', u: 'https://shop.com/pricing', y: t.views()[0].body.y, p: {} }])
		// hidden time doesn't count
		t.clock.now += 60_000
		t.fire('visibilitychange')
		expect(t.engagements()).toHaveLength(1)
	})

	it('stops the clock while another window has focus, without sending anything', () => {
		const t = load()
		t.clock.now += 2000
		t.document.focused = false
		t.fire('blur')
		t.clock.now += 60_000
		t.document.focused = true
		t.fire('focus')
		t.clock.now += 1000
		expect(t.engagements()).toEqual([])
		t.document.hidden = true
		t.fire('visibilitychange')
		expect(t.engagements().map((s) => s.body.e)).toEqual([3000])
	})

	it('starts the clock when a page that loaded without focus gets it', () => {
		const late = load()
		late.document.focused = false
		late.fire('blur')
		late.clock.now += 5000
		late.document.focused = true
		late.fire('focus')
		late.clock.now += 2000
		late.document.hidden = true
		late.fire('visibilitychange')
		expect(late.engagements().map((s) => s.body.e)).toEqual([2000])
	})

	it('measures scroll depth against the page height when it sends, and starts each page view at the top', () => {
		const t = load()
		const win = t.window as { scrollY: number }
		win.scrollY = 900
		t.fire('scroll')
		// the page grew after the visitor scrolled to its end: they saw 1800 of 3600 px
		t.document.documentElement.scrollHeight = 3600
		t.clock.now += 2000
		t.document.hidden = true
		t.fire('visibilitychange')
		t.document.hidden = false
		t.fire('visibilitychange')
		// then scrolled down and followed a link
		win.scrollY = 2700
		t.clock.now += 2000
		t.history.pushState(null, '', '/docs')
		// a router scrolls to the top after changing the URL
		win.scrollY = 0
		t.fire('scroll')
		t.document.hidden = true
		t.clock.now += 2000
		t.fire('visibilitychange')
		expect(t.engagements().map((s) => [s.body.u, Math.round(s.body.d as number)])).toEqual([
			['https://shop.com/pricing', 50],
			['https://shop.com/pricing', 100],
			['https://shop.com/docs', 25],
		])
	})

	it('counts a page the back button shows from the browser cache', () => {
		const t = load()
		t.fire('pageshow', { persisted: false })
		expect(t.views()).toHaveLength(1)
		t.fire('pageshow', { persisted: true })
		expect(t.views().map((v) => v.body.u)).toEqual(['https://shop.com/pricing', 'https://shop.com/pricing'])
	})

	it('runs feature parts with one shared api, and lets them add to the engagement beacon', () => {
		const t = load()
		const seen: string[] = []
		t.misomoon.x((api) => {
			;(api as unknown as { shared: number }).shared = 1
			api.push((p) => {
				seen.push(p ? 'beacon' : 'new view')
				if (p) return (p.c = [['button', 'Buy', 1, 0, 0]])
			})
		})
		t.misomoon.x((api) => void seen.push(`shared ${(api as unknown as { shared: number }).shared}`))
		t.history.pushState(null, '', '/docs')
		// the part's data goes out even under a second of engagement
		expect(t.engagements().map((s) => s.body.c)).toEqual([[['button', 'Buy', 1, 0, 0]]])
		expect(seen).toEqual(['shared 1', 'beacon', 'new view'])
	})

	it('runs no parts in a browser it does not count, and leaves misomoon.ref() safe to call', () => {
		const t = load('https://shop.com/', undefined, {}, { nav: { webdriver: true } })
		let ran = 0
		t.misomoon.x(() => ran++)
		expect([ran, t.misomoon.ref()]).toEqual([0, undefined])
	})
})
