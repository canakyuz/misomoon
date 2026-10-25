import { describe, expect, it } from 'vite-plus/test'
import { ImportedSet } from '../../src/imported'
import { ImportError, type CallInit } from '../../src/importers/types'
import { umami } from '../../src/importers/umami'
import real from './fixtures/umami-day.json'

const SITE = '94db1cb1-74f4-4a40-ad6c-962362670409'
const row = (name: string, visitors: number, extra: Partial<Record<'pageviews' | 'visits' | 'bounces' | 'totaltime', number>> = {}) => ({
	name,
	visitors,
	visits: extra.visits ?? visitors,
	pageviews: extra.pageviews ?? visitors * 2,
	bounces: extra.bounces ?? 0,
	totaltime: extra.totaltime ?? 0,
})

/** Umami's API for one day with traffic, answering by path and `type`. */
function fakeUmami(breakdowns: Record<string, unknown[]> = {}) {
	const calls: { url: string; init?: CallInit }[] = []
	const call = async (url: string, init?: CallInit) => {
		calls.push({ url, init })
		const u = new URL(url)
		if (u.pathname.endsWith('/auth/login')) return { token: 'tok', user: {} }
		if (u.pathname.endsWith(`/websites/${SITE}`)) return { id: SITE, name: 'Shop', domain: 'www.shop.com', createdAt: '2023-05-02T22:30:00.000Z' }
		if (u.pathname.endsWith('/stats')) return { pageviews: 50, visitors: 12, visits: 15, bounces: 6, totaltime: 900, comparison: {} }
		if (u.pathname.endsWith('/metrics/expanded')) return breakdowns[u.searchParams.get('type')!] ?? []
		throw new Error(`unexpected ${url}`)
	}
	return { call, calls }
}

describe('the Umami importer', () => {
	it('reads Umami Cloud with the API key, and names the import and its first day', async () => {
		const { call, calls } = fakeUmami()
		const { state, label, first } = await umami.open({ website: SITE, key: 'api_123' }, call, 'Europe/Berlin')
		expect(calls[0]).toEqual({ url: `https://api.umami.is/v1/websites/${SITE}`, init: { headers: { Authorization: 'Bearer api_123' } } })
		// created late on 2 May in UTC, which is 3 May in Berlin
		expect([label, first, state.domain]).toEqual(['Umami: Shop', '2023-05-03', 'shop.com'])
	})

	it('signs in to a self-hosted server and sends its token', async () => {
		const { call, calls } = fakeUmami()
		await umami.open({ url: 'umami.example.com/', website: SITE, username: 'me', password: 'pw' }, call, 'UTC')
		expect(calls.map((c) => [c.url, c.init])).toEqual([
			['https://umami.example.com/api/auth/login', { method: 'POST', json: { username: 'me', password: 'pw' } }],
			[`https://umami.example.com/api/websites/${SITE}`, { headers: { Authorization: 'Bearer tok' } }],
		])
	})

	it('refuses missing fields, a private address, and a user with two-factor sign-in', async () => {
		const { call } = fakeUmami()
		await expect(umami.open({ website: SITE }, call, 'UTC')).rejects.toThrow(new ImportError('API key is required'))
		await expect(umami.open({ website: 'shop', key: 'k' }, call, 'UTC')).rejects.toThrow(/Website ID is a UUID/)
		await expect(umami.open({ url: 'http://umami.example.com', website: SITE, username: 'a', password: 'b' }, call, 'UTC')).rejects.toThrow('Server address must start with https://')
		for (const url of ['https://10.0.0.1', 'https://localhost', 'https://umami.internal', 'https://umami.example.com:8443'])
			await expect(umami.open({ url, website: SITE, username: 'a', password: 'b' }, call, 'UTC')).rejects.toThrow(ImportError)
		const twoFactor = async () => ({ requiresTwoFactor: true, partialToken: 'x' })
		await expect(umami.open({ url: 'https://umami.example.com', website: SITE, username: 'a', password: 'b' }, twoFactor, 'UTC')).rejects.toThrow(/two-factor/)
	})

	it("asks for the day's bounds in the site's time zone, and stores the totals", async () => {
		const { call, calls } = fakeUmami()
		const { state } = await umami.open({ website: SITE, key: 'k' }, call, 'UTC')
		const set = new ImportedSet()
		await umami.day(state, '2024-03-31', 'Europe/Berlin', call, set)
		// Berlin moves to summer time on 31 March, so that day is 23 hours long
		const start = Date.UTC(2024, 2, 30, 23)
		const end = Date.UTC(2024, 2, 31, 22)
		expect(calls[1].url).toBe(`https://api.umami.is/v1/websites/${SITE}/stats?startAt=${start}&endAt=${end - 1}`)
		expect(new URL(calls[2].url).searchParams.get('endAt')).toBe(String(end - 1))
		expect(set.list().find((r) => r.dim === '')).toMatchObject({ day: '2024-03-31', visitors: 12, visits: 15, pageviews: 50, bounces: 6, duration: 900 })
	})

	it("names pages, browsers, systems, devices and sources as misomoon does, and counts the rest as Direct", async () => {
		const { call } = fakeUmami({
			referrer: [row('www.google.com', 5, { visits: 6 }), row('shop.com', 2), row('news.ycombinator.com', 3)],
			browser: [row('crios', 4), row('chrome', 2), row('edge-chromium', 1)],
			os: [row('Mac OS', 3), row('Windows 10', 2), row('Windows 7', 1)],
			device: [row('laptop', 1), row('desktop', 2), row('mobile', 3)],
			country: [row('de', 4), row('', 1)],
			event: [row('Signup', 3, { pageviews: 7 })],
			entry: [row('/pricing/', 4, { visits: 5, bounces: 2 })],
			path: [row('/blog/?ref=x', 2)],
			utmSource: [row('newsletter', 2)],
		})
		const { state } = await umami.open({ website: SITE, key: 'k' }, call, 'UTC')
		const set = new ImportedSet()
		await umami.day(state, '2024-05-01', 'UTC', call, set)
		const keys = (dim: string) => Object.fromEntries(set.list().filter((r) => r.dim === dim).map((r) => [r.key, dim === 'event' ? [r.visitors, r.events] : r.visits]))
		expect(keys('source')).toEqual({ Google: 6, 'Hacker News': 3, Direct: 6 })
		expect(keys('channel')).toEqual({ 'Organic Search': 6, 'Organic Social': 3, Direct: 6 })
		expect(keys('referrer')).toEqual({ 'google.com': 6, 'news.ycombinator.com': 3 })
		expect(keys('browser')).toEqual({ Chrome: 6, Edge: 1 })
		expect(keys('os')).toEqual({ macOS: 3, Windows: 3 })
		expect(keys('os_version')).toEqual({ 'Windows 10/11': 2, 'Windows 7': 1 })
		expect(keys('device')).toEqual({ Desktop: 3, Mobile: 3 })
		expect(keys('country')).toEqual({ DE: 4 })
		expect(keys('event')).toEqual({ Signup: [3, 7] })
		expect(keys('utm_source')).toEqual({ newsletter: 2 })
		// paths as the tracker stores them, without a trailing slash or a query
		expect(set.list().find((r) => r.dim === 'entry_page')).toMatchObject({ key: '/pricing', visits: 5, bounces: 2 })
		expect(set.list().find((r) => r.dim === 'page')).toMatchObject({ key: '/blog' })
	})

	it('pages through a breakdown longer than 500 rows', async () => {
		const pages = Array.from({ length: 501 }, (_, i) => row(`/p${i}`, 1))
		const asked: string[] = []
		const call = async (url: string) => {
			const u = new URL(url)
			if (u.pathname.endsWith('/stats')) return { pageviews: 5, visitors: 1, visits: 1, bounces: 0, totaltime: 0 }
			if (u.searchParams.get('type') !== 'path') return []
			asked.push(u.searchParams.get('offset')!)
			const offset = Number(u.searchParams.get('offset'))
			return pages.slice(offset, offset + 500)
		}
		const set = new ImportedSet()
		await umami.day({ base: 'https://api.umami.is/v1', headers: {}, website: SITE, domain: '' }, '2024-05-01', 'UTC', call, set)
		expect(asked).toEqual(['0', '500'])
		expect(set.list().filter((r) => r.dim === 'page')).toHaveLength(501)
	})

	it('asks for nothing more on a day without visits', async () => {
		const asked: string[] = []
		const call = async (url: string) => (asked.push(new URL(url).pathname), { pageviews: { value: 0, prev: 3 }, visitors: { value: 0 }, visits: 0 })
		const set = new ImportedSet()
		await umami.day({ base: 'https://api.umami.is/v1', headers: {}, website: SITE, domain: '' }, '2024-05-01', 'UTC', call, set)
		expect([asked, set.list()]).toEqual([[`/v1/websites/${SITE}/stats`], []])
	})

	describe("a real day from Umami Cloud's public demo", () => {
		const call = async (url: string) => {
			const u = new URL(url)
			if (u.pathname.endsWith('/stats')) return real.stats
			if (u.pathname.endsWith(`/websites/${real.website.id}`)) return real.website
			return u.searchParams.get('offset') === '0' ? real.metrics[u.searchParams.get('type') as keyof typeof real.metrics] : []
		}
		const read = async () => {
			const { state } = await umami.open({ website: real.website.id, key: 'k' }, call, 'UTC')
			const set = new ImportedSet()
			await umami.day(state, '2026-10-20', 'UTC', call, set)
			return set.list()
		}
		const rows = (list: Awaited<ReturnType<typeof read>>, dim: string) => Object.fromEntries(list.filter((r) => r.dim === dim).map((r) => [r.key, r]))
		const visits = (list: Awaited<ReturnType<typeof read>>, dim: string) => Object.fromEntries(list.filter((r) => r.dim === dim).map((r) => [r.key, r.visits]))

		it('stores the day as Umami counted it', async () => {
			const list = await read()
			expect(rows(list, '')['']).toMatchObject({ visitors: 4374, visits: 5089, pageviews: 7221, bounces: 1900, duration: 364445 })
			expect(rows(list, 'page')['/']).toMatchObject({ visitors: 3824, visits: 4471, pageviews: 5178 })
			expect(rows(list, 'country').US).toMatchObject({ visitors: 738, visits: 840, bounces: 386, duration: 52678 })
			expect(rows(list, 'event')['login-button-header']).toMatchObject({ visitors: 1355, events: 1847 })
		})

		it('gives Direct the visits no referrer row has, and none of the bounces Umami leaves off referrers', async () => {
			const list = await read()
			const refs = real.metrics.referrer
			const sum = (k: 'visits' | 'visitors' | 'pageviews') => refs.reduce((n, r) => n + r[k], 0)
			// Umami reports no bounces or time for referrers, so Direct can't take the day's
			expect(refs.every((r) => !r.bounces && !r.totaltime)).toBe(true)
			expect(rows(list, 'source').Direct).toMatchObject({ visits: 5089 - sum('visits'), visitors: 4374 - sum('visitors'), pageviews: 7221 - sum('pageviews'), bounces: 0, duration: 0 })
			expect(Object.values(visits(list, 'source')).reduce((a, b) => a + b, 0)).toBe(5089)
			expect(Object.values(visits(list, 'channel')).reduce((a, b) => a + b, 0)).toBe(5089)
		})

		it("names each browser, system and device as misomoon's tracker does", async () => {
			const list = await read()
			// chrome + crios + chromium-webview, safari + ios + ios-webview, edge-chromium + edge + edge-ios, firefox + fxios
			expect(visits(list, 'browser')).toEqual({ Chrome: 3572, Safari: 690, Edge: 270, Firefox: 498, Opera: 25, Unknown: 17, Yandex: 8, 'Samsung Internet': 6, Facebook: 1 })
			expect(visits(list, 'os')).toEqual({ macOS: 2090, Windows: 1691, Linux: 517, iOS: 453, Android: 330, ChromeOS: 5 })
			expect(visits(list, 'os_version')).toEqual({ 'Windows 10/11': 1687, 'Windows 7': 4 })
			// laptop + desktop
			expect(visits(list, 'device')).toEqual({ Desktop: 4306, Mobile: 769, Tablet: 19 })
		})
	})
})
