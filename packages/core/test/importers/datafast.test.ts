import { describe, expect, it } from 'vite-plus/test'
import { ImportedSet, type ImportedRow } from '../../src/imported'
import { countryCode, datafast, referrerSource } from '../../src/importers/datafast'
import { ImportError, type CallInit } from '../../src/importers/types'
import real from './fixtures/datafast-dashboard.json'
import docs from './fixtures/datafast-docs.json'

/** the day of the time series' example row */
const DAY = '2026-05-01'
const ZONE = 'America/New_York'
const INPUT = { key: 'df_xxx' }
const BASE = 'https://datafa.st/api/v1/analytics/'

type Answer = { status: string; data: Record<string, unknown>[]; pagination?: { limit: number; offset: number; total: number } }
const example = (route: keyof typeof docs.routes) => structuredClone(docs.routes[route].answer) as Answer

/**
 * DataFast as its API reference shows it: each route answers with the example in its docs.
 * No real site was read. The month series in `open` reuses the day series' example row.
 */
function api(change: (route: string, q: URLSearchParams, answer: Answer) => unknown = (_, __, a) => a) {
	const asked: { url: string; init?: CallInit }[] = []
	const call = async (url: string, init?: CallInit) => {
		asked.push({ url, init })
		if (!url.startsWith(BASE)) throw new Error(`not DataFast: ${url}`)
		const u = new URL(url)
		const route = u.pathname.slice('/api/v1/analytics/'.length)
		if (!(route in docs.routes)) throw new Error(`no example for ${route}`)
		const answer = example(route as keyof typeof docs.routes)
		if (route === 'timeseries' && u.searchParams.get('interval') === 'month') answer.data = [{ ...answer.data[0], visitors: 0, timestamp: '2026-04-01T00:00:00Z' }, answer.data[0]]
		return change(route, u.searchParams, answer)
	}
	return { call, asked }
}

async function read(call = api().call) {
	const { state, label, first } = await datafast.open(INPUT, call, ZONE)
	const set = new ImportedSet()
	await datafast.day(state, DAY, ZONE, call, set)
	return { list: set.list(), label, first }
}
const dim = (list: ImportedRow[], d: string) => Object.fromEntries(list.filter((r) => r.dim === d).map((r) => [r.key, r]))
const visitors = (list: ImportedRow[], d: string) => Object.fromEntries(list.filter((r) => r.dim === d).map((r) => [r.key, r.visitors]))
const routes = (asked: { url: string }[]) => asked.map((a) => new URL(a.url).pathname.slice('/api/v1/analytics/'.length))

describe("the DataFast importer, on the example answers of DataFast's API reference", () => {
	it('sends the website key, names the site, and starts in the first month with visitors', async () => {
		const { call, asked } = api()
		const { label, first } = await read(call)
		expect(asked.every((a) => a.init?.headers?.Authorization === 'Bearer df_xxx')).toBe(true)
		expect([label, first]).toEqual(['DataFast: example.com', '2026-05-01'])
		expect(new URL(asked[1].url).searchParams.get('interval')).toBe('month')
		expect(routes(asked)).toEqual(['metadata', 'timeseries', 'timeseries', 'overview', 'pages', 'referrers', 'campaigns', 'countries', 'regions', 'cities', 'devices', 'browsers', 'operating-systems', 'goals'])
	})

	it('asks for one day in the site time zone, and the most rows a request allows', async () => {
		const { call, asked } = api()
		await read(call)
		for (const a of asked.slice(3)) {
			const q = new URL(a.url).searchParams
			expect([q.get('startAt'), q.get('endAt'), q.get('timezone')]).toEqual([DAY, DAY, ZONE])
		}
		expect(asked.slice(4).every((a) => new URL(a.url).searchParams.get('limit') === '1000')).toBe(true)
		// the day series covers 90 days up to the day
		const days = new URL(asked[2].url).searchParams
		expect([days.get('interval'), days.get('startAt'), days.get('endAt')]).toEqual(['day', '2026-02-01', DAY])
	})

	it("stores the day's totals, with bounces and time from the rate and the average", async () => {
		const { list } = await read()
		// 42.1% of 16,890 visits bounced, and each lasted 68 seconds on average
		expect(dim(list, '')['']).toMatchObject({ visitors: 12450, visits: 16890, pageviews: 16890, bounces: Math.round(16890 * 0.421), duration: 16890 * 68 })
	})

	it('names pages, sources, channels, UTM tags, places, devices, browsers, systems and goals', async () => {
		const { list } = await read()
		expect(visitors(list, 'page')).toEqual({ '/pricing': 2150 })
		expect(visitors(list, 'source')).toEqual({ Google: 1840 })
		expect(visitors(list, 'channel')).toEqual({ 'Organic Search': 1840 })
		// a name is no referrer host
		expect(visitors(list, 'referrer')).toEqual({})
		expect([visitors(list, 'utm_source'), visitors(list, 'utm_medium'), visitors(list, 'utm_campaign'), visitors(list, 'utm_term')]).toEqual([{ google: 430 }, { cpc: 430 }, { launch: 430 }, {}])
		expect(visitors(list, 'country')).toEqual({ US: 1240 })
		expect([visitors(list, 'region'), visitors(list, 'city')]).toEqual([{ California: 540 }, { 'San Francisco': 320 }])
		expect(visitors(list, 'device')).toEqual({ Desktop: 980 })
		expect(visitors(list, 'browser')).toEqual({ Chrome: 760 })
		expect(visitors(list, 'os')).toEqual({ macOS: 640 })
		expect(dim(list, 'event').signup).toMatchObject({ visitors: 391, events: 482 })
	})

	it('files a referrer domain under its source and host, and Direct / None as Direct', async () => {
		const more = [
			{ referrer: 'Direct / None', visitors: 700 },
			{ referrer: 'news.ycombinator.com', visitors: 90 },
			{ referrer: 'www.example.org', visitors: 12 },
		]
		const { list } = await read(api((route, _, a) => (route === 'referrers' ? { ...a, data: [...a.data, ...more] } : a)).call)
		const sources = visitors(list, 'source')
		expect(sources).toMatchObject({ Google: 1840, Direct: 700, 'example.org': 12 })
		expect(Object.keys(sources)).toHaveLength(4)
		expect(visitors(list, 'referrer')).toEqual({ 'news.ycombinator.com': 90, 'example.org': 12 })
		// misomoon files Hacker News under social, as its tracker does
		expect(visitors(list, 'channel')).toEqual({ 'Organic Search': 1840, Direct: 700, 'Organic Social': 90, Referral: 12 })
	})

	it('reads every page of a long breakdown', async () => {
		const page = (offset: number, n: number) => Array.from({ length: n }, (_, i) => ({ hostname: 'example.com', path: `/p${offset + i}/`, visitors: 1 }))
		const { call, asked } = api((route, q, a) => {
			if (route !== 'pages') return a
			const offset = Number(q.get('offset'))
			return { ...a, data: page(offset, offset ? 5 : 1000), pagination: { limit: 1000, offset, total: 1005 } }
		})
		const { list } = await read(call)
		expect(asked.filter((a) => a.url.includes('/pages?')).map((a) => new URL(a.url).searchParams.get('offset'))).toEqual(['0', '1000'])
		expect(Object.keys(dim(list, 'page'))).toHaveLength(1005)
		// paths without a trailing slash, as misomoon stores them
		expect(dim(list, 'page')['/p7']).toBeDefined()
	})

	it('asks only for the time series on a day DataFast has no visitors for', async () => {
		const { call, asked } = api((route, q, a) => (route === 'timeseries' && q.get('interval') === 'day' ? { ...a, data: [{ ...a.data[0], visitors: 0 }] } : a))
		const { list } = await read(call)
		expect(routes(asked)).toEqual(['metadata', 'timeseries', 'timeseries'])
		expect(list).toEqual([])
		// and the next day back is already known to be empty
		const { state } = await datafast.open(INPUT, call, ZONE)
		const before = asked.length
		await datafast.day(state, DAY, ZONE, call, new ImportedSet())
		await datafast.day(state, '2026-04-30', ZONE, call, new ImportedSet())
		expect(asked.length - before).toBe(1)
	})

	it('reads a bucket written as an instant as the day it falls on in the zone', async () => {
		// midnight in Berlin, written as UTC
		const { call } = api((route, q, a) => (route === 'timeseries' && q.get('interval') === 'day' ? { ...a, data: [{ timestamp: '2026-04-30T22:00:00.000Z', visitors: 3 }] } : a))
		const { state } = await datafast.open(INPUT, call, 'Europe/Berlin')
		const set = new ImportedSet()
		await datafast.day(state, DAY, 'Europe/Berlin', call, set)
		expect(dim(set.list(), '')['']).toMatchObject({ visitors: 12450 })
	})

	it('refuses an account token, a missing key, a site without visitors, and an error answer', async () => {
		await expect(datafast.open({ key: 'dft_123' }, api().call, ZONE)).rejects.toThrow(/account token\. Use the site's API key, which starts with df_/)
		await expect(datafast.open({ key: ' ' }, api().call, ZONE)).rejects.toThrow(new ImportError('API key is required'))
		const empty = api((route, _, a) => (route === 'timeseries' ? { ...a, data: a.data.map((r) => ({ ...r, visitors: 0 })) } : a))
		await expect(datafast.open(INPUT, empty.call, ZONE)).rejects.toThrow('DataFast has counted no visitors for this site')
		const error = api(() => ({ status: 'error', error: { code: 400, message: 'Invalid date range' } }))
		await expect(datafast.open(INPUT, error.call, ZONE)).rejects.toThrow(new ImportError('DataFast answered: Invalid date range'))
	})
})

describe('countryCode', () => {
	it('reads the flag DataFast sends, then the English name', () => {
		expect(countryCode('United States', '🇺🇸')).toBe('US')
		expect(countryCode('Somewhere', '🇩🇪')).toBe('DE')
		expect([countryCode('United Kingdom'), countryCode('Germany', null), countryCode('Türkiye'), countryCode('Turkey')]).toEqual(['GB', 'DE', 'TR', 'TR'])
		expect([countryCode('Czech Republic'), countryCode('Czechia'), countryCode("Côte d'Ivoire"), countryCode('Ivory Coast')]).toEqual(['CZ', 'CZ', 'CI', 'CI'])
		expect([countryCode('Hong Kong'), countryCode('South Korea'), countryCode('Bosnia and Herzegovina'), countryCode('Saint Lucia')]).toEqual(['HK', 'KR', 'BA', 'LC'])
		expect([countryCode('FR'), countryCode('Atlantis'), countryCode('')]).toEqual(['FR', undefined, undefined])
	})
})

/**
 * CodeFast's public DataFast dashboard. Its share page reads the same data as the API
 * under other names; the API's answers here are its rows under the API's v1 names, and its
 * 30 days' breakdowns stand for one day's. A visit's average time is in seconds, as the API
 * reference's example gives it; the dashboard's own routes give milliseconds.
 */
describe("the DataFast importer, on a real public DataFast dashboard", () => {
	const REAL_DAY = '2026-09-28'
	const PARIS = 'Europe/Paris'
	const day = real.days.find((d) => d.timestamp.startsWith(REAL_DAY))!
	const referrers = real.channels.flatMap((c) => c.referrers.map((r) => ({ ...r, channel: c.name })))
	const ok = (data: unknown[]) => ({ status: 'success', data, pagination: { limit: 1000, offset: 0, total: data.length } })
	const rows = (list: { name: string; uv: number }[], field: string, extra: (r: never) => Record<string, unknown> = () => ({})) => ok(list.map((r) => ({ [field]: r.name, visitors: r.uv, ...extra(r as never) })))
	const answers: Record<string, unknown> = {
		metadata: ok([{ domain: real.domain, name: 'CodeFast', timezone: real.timezone }]),
		overview: ok([{ visitors: day.visitors, pageviews: day.pageviews, sessions: day.sessions, bounce_rate: (100 * day.bounces) / day.sessions, avg_session_duration: day.duration / day.sessions / 1000 }]),
		pages: rows(real.pages, 'path'),
		referrers: rows(referrers, 'referrer'),
		campaigns: ok([]),
		countries: rows(real.countries, 'country', (r: { flag: string }) => ({ image: r.flag })),
		regions: rows(real.regions, 'region'),
		cities: rows(real.cities, 'city'),
		devices: rows(real.devices, 'device'),
		browsers: rows(real.browsers, 'browser'),
		'operating-systems': rows(real.operating_systems, 'operating_system'),
		goals: ok([]),
	}
	const api = (days = real.days) => async (url: string) => {
		const u = new URL(url)
		const route = u.pathname.slice('/api/v1/analytics/'.length)
		if (route === 'timeseries') return ok(u.searchParams.get('interval') === 'month' ? [{ timestamp: '2026-09-01T00:00:00+02:00', visitors: 1 }] : days.map((d) => ({ timestamp: d.timestamp, visitors: d.visitors })))
		if (route in answers) return structuredClone(answers[route])
		throw new Error(`no answer for ${url}`)
	}
	async function readReal(zone = PARIS, call = api()) {
		const { state, first } = await datafast.open(INPUT, call, zone)
		const set = new ImportedSet()
		await datafast.day(state, REAL_DAY, zone, call, set)
		return { list: set.list(), first }
	}
	const sum = (list: ImportedRow[], d: string) => list.filter((r) => r.dim === d).reduce((n, r) => n + r.visitors, 0)
	const uv = (list: { uv: number }[]) => list.reduce((n, r) => n + r.uv, 0)

	it("reads a day's bucket by its date, written with the zone's offset", async () => {
		const { list, first } = await readReal()
		expect(first).toBe('2026-09-01')
		expect(dim(list, '')['']).toMatchObject({ visitors: 331, visits: 348, pageviews: 456, bounces: 313, duration: 31_370 })
		// the bucket is the day DataFast says, even in a zone with another offset
		expect(dim((await readReal('UTC', api([day]))).list, '')['']).toMatchObject({ visitors: 331 })
	})

	it('names every country of the dashboard by its flag, and by its name alone', async () => {
		const code = (image: string) => image.match(/\/([A-Z]{2})\.svg$/)![1]
		const misses = real.countries.filter((c) => countryCode(c.name, c.flag) !== code(c.image) || countryCode(c.name) !== code(c.image) || countryCode('', c.image) !== code(c.image))
		expect(misses.map((c) => c.name)).toEqual([])
		expect(real.countries).toHaveLength(133)
		const { list } = await readReal()
		expect(sum(list, 'country')).toBe(uv(real.countries))
		expect(dim(list, 'country').US.visitors).toBe(1217)
	})

	it("uses misomoon's names for its browsers, systems and devices", async () => {
		const { list } = await readReal()
		const n = (field: 'browsers' | 'operating_systems', ...names: string[]) => uv(real[field].filter((r) => names.includes(r.name)))
		expect(visitors(list, 'os')).toEqual({ macOS: n('operating_systems', 'Mac OS'), iOS: n('operating_systems', 'iOS'), Windows: n('operating_systems', 'Windows'), Android: n('operating_systems', 'Android'), Linux: n('operating_systems', 'Linux', 'Ubuntu'), ChromeOS: n('operating_systems', 'Chromium OS'), Unknown: n('operating_systems', 'unknown') })
		const browsers = visitors(list, 'browser')
		expect(['Mobile Safari', 'WebKit', 'Chrome WebView', 'unknown'].filter((b) => b in browsers)).toEqual([])
		expect([browsers.Safari, browsers.Chrome, browsers.Unknown]).toEqual([n('browsers', 'Safari', 'Mobile Safari', 'WebKit'), n('browsers', 'Chrome', 'Chrome WebView'), n('browsers', 'unknown')])
		expect(sum(list, 'browser')).toBe(uv(real.browsers))
		expect(visitors(list, 'device')).toEqual({ Desktop: 3658, Mobile: 2291, Tablet: 11 })
	})

	it('files each referrer under the channel DataFast gave it', async () => {
		// DataFast's newsletter and affiliate channels come from the landing URL's tags, which a referrer row lacks
		const CHANNELS: Record<string, string> = { Referral: 'Referral', 'Organic social': 'Organic Social', 'Organic search': 'Organic Search', Direct: 'Direct', 'A.I.': 'AI Assistants' }
		const { list } = await readReal()
		const sources = visitors(list, 'source')
		expect(sources.Direct).toBe(1156)
		expect([sources.X, sources.Google, sources.ChatGPT]).toEqual([1739, 445, referrers.find((r) => r.name === 'ChatGPT')!.uv])
		const misses = referrers
			.filter((r) => r.channel in CHANNELS)
			.map((r) => [r.name, r.channel, referrerSource(r.name).channel] as const)
			.filter(([, theirs, ours]) => CHANNELS[theirs] !== ours)
		// misomoon has a channel for video, and its tracker counts medium.com as a referral too
		expect(misses).toEqual([
			['YouTube', 'Organic social', 'Video'],
			['Medium', 'Organic social', 'Referral'],
		])
		expect(referrerSource('Brave').source).toBe('Brave Search')
	})
})
