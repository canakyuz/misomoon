import { describe, expect, it } from 'vite-plus/test'
import { ImportedSet, type ImportedRow } from '../../src/imported'
import { countryCode, datafast } from '../../src/importers/datafast'
import { ImportError, type CallInit } from '../../src/importers/types'
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
