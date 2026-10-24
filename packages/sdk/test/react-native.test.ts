import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { appUserAgent, campaignQuery, createNativeClient, type Native, type NativeOptions } from '../src/react-native'
import * as rn from './fake-react-native'
import { fakeFetch } from './helpers'

const { native, Platform } = rn
const RN = rn as unknown as Native

function client(extra: Partial<NativeOptions> = {}, script?: Parameters<typeof fakeFetch>[0]) {
	const f = fakeFetch(script)
	const c = createNativeClient({ site: 'recipes-app', host: 'https://analytics.test', domain: 'recipes.app', app: { name: 'Recipes', version: '2.3.0' }, fetch: f.fetch, ...extra }, RN)
	const stop = c.start()
	const names = () => f.sent.map((s) => s.body.n)
	return { c, f, stop, names }
}

beforeEach(() => {
	native.reset()
	vi.useFakeTimers()
	vi.setSystemTime(Date.UTC(2026, 9, 24, 12))
})
afterEach(() => vi.useRealTimers())

describe('appUserAgent', () => {
	it.each([
		[{ OS: 'ios', Version: '17.4', isPad: false }, 'MisomoonApp/0.1.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Recipes/2.3.0'],
		[{ OS: 'ios', Version: '18.0', isPad: true }, 'MisomoonApp/0.1.0 (iPad; CPU OS 18_0 like Mac OS X) Recipes/2.3.0'],
		[{ OS: 'android', Version: 34, constants: { Release: '14' } }, 'MisomoonApp/0.1.0 (Linux; Android 14; Mobile) Recipes/2.3.0'],
	])('builds %j', (platform, want) => {
		Object.assign(Platform, platform)
		expect(appUserAgent(RN, { name: 'Recipes', version: '2.3.0' })).toBe(want)
	})

	it('gives macOS and Windows apps a version the server reads', () => {
		Object.assign(Platform, { OS: 'macos', Version: '14.4' })
		expect(appUserAgent(RN, {})).toBe('MisomoonApp/0.1.0 (Macintosh; Intel Mac OS X 14_4) App/0')
		Object.assign(Platform, { OS: 'macos', Version: undefined })
		expect(appUserAgent(RN, {})).toBe('MisomoonApp/0.1.0 (Macintosh; Intel Mac OS X 10_15) App/0')
		Object.assign(Platform, { OS: 'windows', Version: 10 })
		expect(appUserAgent(RN, {})).toBe('MisomoonApp/0.1.0 (Windows NT 10.0; Win64; x64) App/0')
	})

	it('calls an Android device with a 600dp short side a tablet', () => {
		Object.assign(Platform, { OS: 'android', constants: { Release: '15' } })
		native.screen = { width: 1280, height: 800 }
		expect(appUserAgent(RN, {})).toBe('MisomoonApp/0.1.0 (Linux; Android 15) App/0')
	})

	it('cleans the app name and version, and leaves Expo web to the browser', () => {
		expect(appUserAgent(RN, { name: 'My Recipes (beta)', version: 'v2.3.0-rc1' })).toBe('MisomoonApp/0.1.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) MyRecipesbeta/2.3.0')
		Object.assign(Platform, { OS: 'web' })
		expect(appUserAgent(RN, {})).toBeNull()
	})
})

describe('createNativeClient', () => {
	it('sends a screen as a pageview with the app user agent and the device size', async () => {
		const { c, f } = client()
		c.screen('Home')
		await vi.runAllTimersAsync()
		const [req] = f.sent
		expect(req.headers['user-agent']).toBe('MisomoonApp/0.1.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Recipes/2.3.0')
		expect(req.body).toMatchObject({ s: 'recipes-app', n: 'pageview', u: 'https://recipes.app/Home', t: 'Home', w: 393, vw: 393 })
		expect(req.body).not.toHaveProperty('h')
	})

	it('puts app-wide props on screens and events, not on engaged time', async () => {
		const { c, f } = client({ props: { build: '412' } })
		c.screen('Home')
		await vi.advanceTimersByTimeAsync(5000)
		c.track('Saved', { props: { recipe: '42' } })
		c.screen('Saved')
		await vi.runAllTimersAsync()
		expect(f.sent.map((s) => [s.body.n, s.body.p])).toEqual([
			['pageview', { build: '412' }],
			['Saved', { build: '412', recipe: '42' }],
			['engagement', undefined],
			['pageview', { build: '412' }],
		])
	})

	it('turns sending off and on at runtime, for an opt-out in the app, and stays off without a domain', async () => {
		const { c, f, names } = client()
		c.setEnabled(false)
		c.screen('Home')
		c.track('Hidden')
		await vi.runAllTimersAsync()
		expect(f.sent).toEqual([])
		c.setEnabled(true)
		c.track('Shown')
		await vi.runAllTimersAsync()
		expect(names()).toEqual(['Shown'])

		vi.spyOn(console, 'warn').mockImplementation(() => {})
		const none = client({ domain: '' })
		none.c.setEnabled(true)
		none.c.screen('Home')
		await vi.runAllTimersAsync()
		expect(none.f.sent).toEqual([])
	})

	it('turns routes and names into paths, and ignores a repeat of the current screen', async () => {
		const { c, f } = client({ domain: 'https://recipes.app/' })
		c.screen('/recipes/[id]')
		c.screen('/recipes/[id]')
		c.screen('Saved Recipes')
		c.screen('')
		await vi.runAllTimersAsync()
		expect(f.sent.map((s) => s.body.u)).toEqual(['https://recipes.app/recipes/[id]', 'https://recipes.app/Saved-Recipes'])
	})

	it('sends the time spent on a screen when the next one opens', async () => {
		const { c, f, names } = client()
		c.screen('Home')
		await vi.advanceTimersByTimeAsync(12_000)
		c.screen('Recipe')
		await vi.runAllTimersAsync()
		expect(names()).toEqual(['pageview', 'engagement', 'pageview'])
		expect(f.sent[1].body).toMatchObject({ u: 'https://recipes.app/Home', e: 12_000 })
	})

	it("gives each screen view a key, and sends it with the view's engaged time", async () => {
		const { c, f } = client()
		c.screen('Home')
		await vi.advanceTimersByTimeAsync(3000)
		native.setState('background')
		native.setState('active')
		await vi.advanceTimersByTimeAsync(2000)
		c.screen('Recipe')
		// back after the visit ended: the screen counts again, as a new view
		native.setState('background')
		await vi.advanceTimersByTimeAsync(31 * 60_000)
		native.setState('active')
		await vi.runAllTimersAsync()
		const sent = f.sent.map((s) => [s.body.n, s.body.y])
		const [home, recipe, again] = sent.filter(([n]) => n === 'pageview').map(([, y]) => y)
		expect(sent).toEqual([
			['pageview', home],
			['engagement', home],
			['engagement', home],
			['pageview', recipe],
			['pageview', again],
		])
		expect(new Set([home, recipe, again]).size).toBe(3)
		expect(String(home)).toMatch(/^[0-9a-f-]{36}$/)
	})

	it("doesn't count time in the background, or a screen passed through in under a second", async () => {
		const { c, f, names } = client()
		c.screen('Home')
		await vi.advanceTimersByTimeAsync(5000)
		native.setState('inactive')
		await vi.advanceTimersByTimeAsync(60_000)
		native.setState('active')
		await vi.advanceTimersByTimeAsync(2000)
		c.screen('Loading')
		await vi.advanceTimersByTimeAsync(300)
		c.screen('Recipe')
		await vi.runAllTimersAsync()
		expect(names()).toEqual(['pageview', 'engagement', 'pageview', 'pageview'])
		expect(f.sent[1].body.e).toBe(7000)
	})

	it('sends engaged time and flushes when the app goes to the background', async () => {
		const { c, f, names } = client({}, ['network'])
		c.screen('Home')
		await vi.advanceTimersByTimeAsync(4000)
		native.setState('background')
		await vi.advanceTimersByTimeAsync(0)
		expect(names()).toEqual(['pageview', 'engagement'])
		expect(f.sent[1].body.e).toBe(4000)
	})

	it('counts the screen again when the app returns after the visit ended', async () => {
		const { c, names } = client()
		c.screen('Home')
		native.setState('background')
		await vi.advanceTimersByTimeAsync(10 * 60_000)
		native.setState('active')
		native.setState('background')
		await vi.advanceTimersByTimeAsync(31 * 60_000)
		native.setState('active')
		await vi.runAllTimersAsync()
		expect(names()).toEqual(['pageview', 'pageview'])
	})

	it('never throws on odd input', async () => {
		const { c, names } = client()
		expect(() => {
			c.screen(42 as unknown as string)
			c.screen('Home', null as never)
			c.track('Saved', null as never)
			c.openedFrom(null as unknown as string)
		}).not.toThrow()
		await vi.runAllTimersAsync()
		expect(names()).toEqual(['pageview', 'Saved'])
	})

	it('sends nothing, and says why, without a domain', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
		const { c, f } = client({ domain: undefined as unknown as string })
		c.screen('Home')
		await vi.runAllTimersAsync()
		expect(f.attempts).toHaveLength(0)
		expect(warn.mock.calls[0][0]).toMatch(/domain/)
		warn.mockRestore()
	})

	it("gives custom events the current screen's url", async () => {
		const { c, f } = client()
		c.track('Saved', { props: { id: 'r1' } })
		c.screen('Recipe')
		c.track('Purchase', { revenue: { amount: 4.99, currency: 'USD' }, interactive: false })
		await vi.runAllTimersAsync()
		expect(f.sent.map((s) => [s.body.n, s.body.u])).toEqual([
			['Saved', 'https://recipes.app/'],
			['pageview', 'https://recipes.app/Recipe'],
			['Purchase', 'https://recipes.app/Recipe'],
		])
		expect(f.sent[2].body).toMatchObject({ $: { a: 4.99, c: 'USD' }, i: false })
	})

	it("puts a deep link's campaign on the next screen only", async () => {
		const { c, f } = client()
		c.screen('Home')
		c.openedFrom('recipes://recipe/42?utm_source=newsletter&utm_medium=email&token=secret')
		c.screen('Home')
		c.screen('Recipe')
		await vi.runAllTimersAsync()
		expect(f.sent.filter((s) => s.body.n === 'pageview').map((s) => s.body.u)).toEqual([
			'https://recipes.app/Home',
			'https://recipes.app/Home?utm_source=newsletter&utm_medium=email',
			'https://recipes.app/Recipe',
		])
	})

	it('stops following the app state when stopped, sending what is left', async () => {
		const { c, f, stop, names } = client()
		c.screen('Home')
		await vi.advanceTimersByTimeAsync(3000)
		stop()
		await vi.runAllTimersAsync()
		expect(native.listeners.size).toBe(0)
		expect(names()).toEqual(['pageview', 'engagement'])
		expect(f.sent[1].body.e).toBe(3000)
	})
})

describe("React Native's partial URL polyfill", () => {
	// Like RN's Libraries/Blob/URL.js in many versions: the constructor works, most getters throw.
	class PartialURL {
		constructor(readonly href: string) {}
		get protocol(): string {
			throw new Error('URL.protocol is not implemented')
		}
		get searchParams(): never {
			throw new Error('URL.searchParams is not implemented')
		}
	}
	class PartialSearchParams {
		set(): never {
			throw new Error('URLSearchParams.set is not implemented')
		}
	}

	afterEach(() => vi.unstubAllGlobals())

	it('sends screens, events, engagement and campaigns without touching URL', async () => {
		vi.stubGlobal('URL', PartialURL)
		vi.stubGlobal('URLSearchParams', PartialSearchParams)
		const { c, f, names } = client()
		c.openedFrom('recipes://open?utm_source=newsletter')
		c.screen('Home')
		c.track('Saved')
		await vi.advanceTimersByTimeAsync(2000)
		c.screen('Recipe')
		await vi.runAllTimersAsync()
		expect(names()).toEqual(['pageview', 'Saved', 'engagement', 'pageview'])
		expect(f.sent[0].url).toBe('https://analytics.test/api/event')
		expect(f.sent[0].body.u).toBe('https://recipes.app/Home?utm_source=newsletter')
	})
})

describe('campaignQuery', () => {
	it.each([
		['recipes://open?utm_source=news%20letter&utm_medium=email&token=secret#top', '?utm_source=news%20letter&utm_medium=email'],
		['https://recipes.app/r/1?utm_campaign=spring+sale&gclid=abc', '?utm_campaign=spring%20sale&gclid=abc'],
		['recipes://open?utm_source=a&utm_source=b', '?utm_source=b'],
		['recipes://open?utm_source=%E0%A4%A&utm_medium=email', '?utm_medium=email'],
		['recipes://open?ref', '?ref='],
		['recipes://open', ''],
		['recipes://open?token=secret', ''],
	])('%s gives %s', (url, want) => {
		expect(campaignQuery(url)).toBe(want)
	})
})

describe('ref', () => {
	it('hands out one ref per screen view, reported from that screen', async () => {
		const { c, f } = client()
		c.screen('Paywall')
		const ref = c.ref()
		expect(ref).toMatch(/^mm_[0-9a-f]{24}$/)
		expect(c.ref()).toBe(ref)
		c.screen('Checkout')
		const next = c.ref()
		expect(next).not.toBe(ref)
		await vi.runAllTimersAsync()
		expect(f.sent.filter((s) => s.body.k).map((s) => [s.body.u, s.body.e, s.body.k])).toEqual([
			['https://recipes.app/Paywall', 0, ref],
			['https://recipes.app/Checkout', 0, next],
		])
	})
})

describe('the link that opened the app', () => {
	it('credits the first screen with the campaign of the link that started the app', async () => {
		native.initialURL = Promise.resolve('recipes://recipe/42?utm_source=newsletter&utm_medium=email&token=secret')
		const { c, f } = client()
		c.screen('Home')
		c.track('Saved')
		await vi.runAllTimersAsync()
		expect(f.sent.map((s) => [s.body.n, s.body.u])).toEqual([
			['pageview', 'https://recipes.app/Home?utm_source=newsletter&utm_medium=email'],
			['Saved', 'https://recipes.app/Home?utm_source=newsletter&utm_medium=email'],
		])
	})

	it('waits at most a second for a platform that never answers', async () => {
		native.initialURL = new Promise(() => {})
		const { c, f } = client()
		c.screen('Home')
		await vi.advanceTimersByTimeAsync(999)
		expect(f.attempts).toHaveLength(0)
		await vi.advanceTimersByTimeAsync(1)
		await vi.runAllTimersAsync()
		expect(f.sent.map((s) => s.body.u)).toEqual(['https://recipes.app/Home'])
	})

	it('credits a link that brings the app back after the visit ended', async () => {
		const { c, f } = client()
		c.screen('Home')
		await vi.runAllTimersAsync()
		native.setState('background')
		await vi.advanceTimersByTimeAsync(31 * 60_000)
		native.setState('active')
		native.openURL('recipes://open?utm_source=push&utm_campaign=winback')
		await vi.runAllTimersAsync()
		const views = f.sent.filter((s) => s.body.n === 'pageview').map((s) => s.body.u)
		expect(views).toEqual(['https://recipes.app/Home', 'https://recipes.app/Home?utm_source=push&utm_campaign=winback'])
	})

	it('counts as pending while it waits, and flushes what it held', async () => {
		native.initialURL = new Promise(() => {})
		const { c, f } = client()
		c.screen('Home')
		expect(c.pending).toBe(1)
		native.setState('background')
		await vi.runAllTimersAsync()
		expect(f.sent.map((s) => s.body.n)).toEqual(['pageview'])
	})
})
