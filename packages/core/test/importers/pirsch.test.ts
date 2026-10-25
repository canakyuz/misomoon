import { describe, expect, it } from 'vite-plus/test'
import { ImportedSet, type ImportedRow } from '../../src/imported'
import { pirsch, tz } from '../../src/importers/pirsch'
import { ImportError, type CallInit } from '../../src/importers/types'
import real from './fixtures/pirsch-day.json'

const DAY = '2026-10-20'
const ZONE = 'Europe/Berlin'
const INPUT = { client: 'client_1', secret: 'secret_1' }
const DOMAINS = real.calls[0].answer

/**
 * Pirsch as recorded from its public dashboard. The token exchange needs an account, so it
 * answers in the shape of the API reference's example.
 */
function api(change: (url: string, answer: unknown) => unknown = (_, a) => a) {
	const asked: { url: string; init?: CallInit }[] = []
	const call = async (url: string, init?: CallInit) => {
		asked.push({ url, init })
		if (url === 'https://api.pirsch.io/api/v1/token') return { access_token: 'eyJhbGciOiJSUzI1NiIsInR5cCI', expires_at: '2026-10-27T00:00:00Z' }
		if (url === 'https://api.pirsch.io/api/v1/domain') return change(url, structuredClone(DOMAINS))
		const hit = real.calls.find((c) => c.url === url)
		if (!hit) throw new Error(`not recorded: ${url}`)
		return change(url, structuredClone(hit.answer))
	}
	return { call, asked }
}

async function read(call = api().call) {
	const { state, label, first } = await pirsch.open(INPUT, call, ZONE)
	const set = new ImportedSet()
	await pirsch.day(state, DAY, ZONE, call, set)
	return { list: set.list(), label, first }
}
const dim = (list: ImportedRow[], d: string) => Object.fromEntries(list.filter((r) => r.dim === d).map((r) => [r.key, r]))
const field = (list: ImportedRow[], d: string, f: 'visits' | 'visitors') => Object.fromEntries(list.filter((r) => r.dim === d).map((r) => [r.key, r[f]]))
const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0)
const recorded = (report: string) => real.calls.filter((c) => c.url.includes(`/statistics/${report}?`)).flatMap((c) => c.answer as Record<string, unknown>[])

describe("the Pirsch importer, on a real day of Pirsch's public dashboard", () => {
	it('trades the client ID and secret for a token, and finds the dashboard', async () => {
		const { call, asked } = api()
		const { label, first } = await read(call)
		expect(asked[0]).toEqual({ url: 'https://api.pirsch.io/api/v1/token', init: { method: 'POST', json: { client_id: 'client_1', client_secret: 'secret_1' } } })
		expect(asked.slice(1).every((a) => a.init?.headers?.Authorization === 'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI')).toBe(true)
		// added on 2020-12-04 at 19:15 UTC
		expect([label, first]).toEqual(['Pirsch: pirsch.io', '2020-12-04'])
		// the token, the dashboard, then every request the recording made
		expect(asked.slice(2).map((a) => a.url)).toEqual(real.calls.slice(1).map((c) => c.url))
	})

	it('stores the day as Pirsch counted it, in the site time zone', async () => {
		const { call, asked } = api()
		const { list } = await read(call)
		expect(asked.slice(2).every((a) => a.url.includes('tz=Europe%2FBerlin'))).toBe(true)
		// the average visit of 274 seconds, over the day's 1,261 visits
		expect(dim(list, '')['']).toMatchObject({ visitors: 1128, visits: 1261, pageviews: 1852, bounces: 1082, duration: 274 * 1261 })
		// `/` and one view of `//`, which the tracker stores as `/` too
		expect(dim(list, 'page')['/']).toMatchObject({ visitors: 742 + 1, visits: 784 + 1, pageviews: 860 + 1, bounces: 669, time_s: 125 * 860 + 1, time_n: 860 + 1 })
		expect(dim(list, 'entry_page')['/']).toMatchObject({ visitors: 742, visits: 772 })
		expect(dim(list, 'exit_page')['/']).toMatchObject({ visitors: 742, visits: 683 })
	})

	it('reads every page of a long report, and stores paths without a trailing slash', async () => {
		const { call, asked } = api()
		const { list } = await read(call)
		expect(asked.filter((a) => a.url.includes('/statistics/page?')).map((a) => new URL(a.url).searchParams.get('offset'))).toEqual(['0', '100', '200', '300'])
		const pages = recorded('page')
		expect(list.filter((r) => r.dim === 'page').reduce((n, r) => n + r.pageviews, 0)).toBe(pages.reduce((n, r) => n + (r.views as number), 0))
		const features = pages.filter((r) => r.path === '/features' || r.path === '/features/')
		expect(features.length).toBe(2)
		expect(dim(list, 'page')['/features'].pageviews).toBe(features.reduce((n, r) => n + (r.views as number), 0))
		expect(dim(list, 'page')['/features/']).toBeUndefined()
	})

	it("counts every visit under one source, and maps Pirsch's channels to misomoon's", async () => {
		const { list } = await read()
		const sources = field(list, 'source', 'visits')
		expect(sum(sources)).toBe(1261)
		// www.google.com and keep.google.com, as the tracker names them; gemini.google.com is Gemini
		expect([sources.Direct, sources.Google, sources.Gemini]).toEqual([1155, 32 + 1, 1])
		// https://pir.sh:443 is the host pir.sh
		expect(dim(list, 'referrer')['pir.sh']).toMatchObject({ visits: 5 })
		expect(field(list, 'channel', 'visits')).toEqual({ Direct: 1214, 'Organic Search': 37, Referral: 4, 'AI Assistants': 3, 'Organic Social': 2, 'Paid Search': 1 })
	})

	it('names countries, browsers, systems, devices, events and UTM tags', async () => {
		const { list } = await read()
		const countries = field(list, 'country', 'visitors')
		expect([countries.US, sum(countries)]).toEqual([210, 1128])
		expect(field(list, 'browser', 'visitors')).toMatchObject({ Chrome: 858, Brave: 57, Unknown: 24 })
		expect(field(list, 'os', 'visitors')).toEqual({ Windows: 416, macOS: 411, Linux: 204, iOS: 54, Android: 25, ChromeOS: 11, Unknown: 7 })
		expect(field(list, 'device', 'visitors')).toEqual({ Desktop: 1043, Mobile: 79 })
		expect(dim(list, 'event')['Logged in']).toMatchObject({ visitors: 111, events: 116 })
		// visitors without a tag are no tag value
		expect(field(list, 'utm_source', 'visitors')).toMatchObject({ 'whiskey.fm': 8, comparetiers: 2 })
		expect(dim(list, 'utm_source')['(none)']).toBeUndefined()
	})

	it("imports Pirsch's outbound link and download events under misomoon's names", async () => {
		// the recorded day had neither, so they are added to its events in Pirsch's default names
		const builtin = [{ name: 'Outbound Link Click', count: 9, visitors: 7 }, { name: 'File Download', count: 4, visitors: 3 }]
		const { list } = await read(api((url, answer) => (url.includes('/statistics/events?') ? [...(answer as object[]), ...builtin] : answer)).call)
		expect(dim(list, 'event')).toMatchObject({ 'Outbound link': { visitors: 7, events: 9 }, Download: { visitors: 3, events: 4 } })
		expect(dim(list, 'event')['Outbound Link Click']).toBeUndefined()
	})

	it('asks only for the visitors of a day Pirsch has none for', async () => {
		const { call, asked } = api((url, answer) => (url.includes('/statistics/visitor?') ? (answer as { day: string }[]).filter((r) => !r.day.startsWith(DAY)) : answer))
		const { list } = await read(call)
		expect(asked.map((a) => a.url.split('/api/v1/')[1].split('?')[0])).toEqual(['token', 'domain', 'statistics/visitor'])
		expect(list).toEqual([])
	})

	it('refuses an access key, and a client that reads several dashboards without Domain', async () => {
		await expect(pirsch.open({ client: '', secret: 'pa_123' }, api().call, ZONE)).rejects.toThrow(/access key, which can only send data/)
		await expect(pirsch.open({ client: '', secret: 'secret_1' }, api().call, ZONE)).rejects.toThrow(new ImportError('Client ID is required'))
		const two = api((url, answer) => (url.endsWith('/domain') ? [...(answer as object[]), { id: 'x', hostname: 'shop.com', def_time: '2024-01-01T00:00:00Z' }] : answer))
		await expect(pirsch.open(INPUT, two.call, ZONE)).rejects.toThrow('This Pirsch client reads 2 dashboards (pirsch.io, shop.com). Set Domain to the one to import.')
		await expect(pirsch.open({ ...INPUT, domain: 'https://www.shop.com/' }, two.call, ZONE)).resolves.toMatchObject({ label: 'Pirsch: shop.com', first: '2024-01-01' })
		await expect(pirsch.open({ ...INPUT, domain: 'blog.com' }, two.call, ZONE)).rejects.toThrow("This Pirsch client can't read blog.com, only pirsch.io, shop.com")
	})

	it('sends a fixed offset as the zone of the same hours', () => {
		expect([tz('Asia/Jakarta'), tz(420), tz(-300), tz(0), tz(330)]).toEqual(['Asia/Jakarta', 'Etc/GMT-7', 'Etc/GMT+5', 'UTC', 'UTC'])
	})
})
