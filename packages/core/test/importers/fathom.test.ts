import { describe, expect, it } from 'vite-plus/test'
import { ImportedSet, type ImportedRow } from '../../src/imported'
import { fathom } from '../../src/importers/fathom'
import { ImportError, type CallInit } from '../../src/importers/types'
import published from './fixtures/fathom-published.json'

const DAY = '2023-02-21'
const ZONE = 'Europe/Berlin'
const INPUT = { site: 'cdbugs', token: 'token_1' }
const BASE = 'https://api.usefathom.com/v1/'

type Row = Record<string, unknown>
/** the published 2023 totals, as one day's row */
const TOTAL = { ...published.published.answer.yearly[0], date: DAY }
const TECH = published.aggregation.answer.map((r) => ({ ...r, operating_system: r.device_type === 'Desktop' ? 'Mac OS' : 'iOS', visits: r.pageviews }))

/**
 * Fathom as published: the site and its events are the API reference's examples, and the
 * totals are the answer a site owner printed. Breakdown rows take the shape of the
 * reference's example, with counts as strings; their values are made up.
 */
const BREAKDOWNS: Record<string, Row[]> = {
	pathname: [{ pathname: '/about/', uniques: '16', pageviews: '192' }, { pathname: '/', uniques: '90', pageviews: '300' }],
	entry_page: [{ entry_page: '/', visits: '80', uniques: '80', bounce_rate: 0.25, avg_duration: '40.5' }],
	exit_page: [{ exit_page: '/about', visits: '12', uniques: '12' }],
	referrer_hostname: [{ referrer_hostname: '', visits: '70' }, { referrer_hostname: 'https://www.google.com', visits: '20' }, { referrer_hostname: 'https://news.ycombinator.com', visits: '9' }],
	'utm_source,utm_medium,utm_campaign,utm_content,utm_term': [
		{ utm_source: '', utm_medium: '', utm_campaign: '', utm_content: '', utm_term: '', visits: '90' },
		{ utm_source: 'newsletter', utm_medium: 'email', utm_campaign: 'feb', utm_content: '', utm_term: '', visits: '6' },
		{ utm_source: 'newsletter', utm_medium: 'email', utm_campaign: 'jan', utm_content: '', utm_term: '', visits: '3' },
	],
	country_code: [{ country_code: 'GB', visits: '50' }, { country_code: 'us', visits: '40' }, { country_code: '', visits: '9' }],
	city: [{ city: 'London', visits: '30' }, { city: '', visits: '69' }],
	'browser,operating_system,device_type': TECH,
}

/** each event's days in the span: the day before, the day, and a day with none */
const EVENTS: Record<string, Row[]> = {
	'Signed up to newsletter': [{ conversions: '3', unique_conversions: '3', date: '2023-02-20' }, { conversions: '7', unique_conversions: '5', date: DAY }],
	'Purchased product': [{ conversions: '0', unique_conversions: '0', date: DAY }],
}

function api(change: (q: URLSearchParams, answer: unknown, path: string) => unknown = (_, a) => a) {
	const asked: { url: string; init?: CallInit }[] = []
	const call = async (url: string, init?: CallInit) => {
		asked.push({ url, init })
		if (!url.startsWith(BASE)) throw new Error(`not Fathom: ${url}`)
		const u = new URL(url)
		const path = u.pathname.slice('/v1/'.length)
		const q = u.searchParams
		let answer: unknown
		if (path === 'sites/CDBUGS') answer = structuredClone(published.site.answer)
		else if (path === 'sites/CDBUGS/events') answer = structuredClone(published.events.answer)
		else if (path === 'aggregations' && q.get('entity') === 'event') answer = EVENTS[q.get('entity_name')!]
		else if (path === 'aggregations' && !q.get('field_grouping')) answer = [structuredClone(TOTAL)]
		else if (path === 'aggregations') answer = structuredClone(BREAKDOWNS[q.get('field_grouping')!])
		if (answer === undefined) throw new Error(`no answer for ${url}`)
		return change(q, answer, path)
	}
	return { call, asked }
}

async function read(call = api().call) {
	const { state, label, first } = await fathom.open(INPUT, call, ZONE)
	const set = new ImportedSet()
	await fathom.day(state, DAY, ZONE, call, set)
	return { list: set.list(), label, first }
}
const dim = (list: ImportedRow[], d: string) => Object.fromEntries(list.filter((r) => r.dim === d).map((r) => [r.key, r]))
const visits = (list: ImportedRow[], d: string) => Object.fromEntries(list.filter((r) => r.dim === d).map((r) => [r.key, r.visits]))
const params = (url: string) => Object.fromEntries(new URL(url).searchParams)

describe("the Fathom importer, on the answers Fathom's API reference and its users published", () => {
	it('sends the token, names the site, and starts on the day it was added', async () => {
		const { call, asked } = api()
		const { label, first } = await read(call)
		expect(asked.every((a) => a.init?.headers?.Authorization === 'Bearer token_1')).toBe(true)
		expect([label, first]).toEqual(['Fathom: Bugs Bunny Portfolio', '2020-07-27'])
		expect(asked.slice(0, 2).map((a) => a.url)).toEqual([`${BASE}sites/CDBUGS`, `${BASE}sites/CDBUGS/events?limit=100`])
	})

	it('reads totals and each event 90 days at a time, in the site time zone', async () => {
		const { call, asked } = api()
		await read(call)
		const [totals, ...events] = asked.slice(2, 5).map((a) => params(a.url))
		expect(totals).toEqual({ entity: 'pageview', entity_id: 'CDBUGS', aggregates: 'visits,uniques,pageviews,avg_duration,bounce_rate', date_grouping: 'day', date_from: '2022-11-24 00:00:00', date_to: `${DAY} 23:59:59`, timezone: ZONE })
		expect(events.map((e) => [e.entity, e.site_id, e.entity_name, e.date_grouping])).toEqual([
			['event', 'CDBUGS', 'Purchased product', 'day'],
			['event', 'CDBUGS', 'Signed up to newsletter', 'day'],
		])
		// then one request per breakdown, for the day, the busiest rows first
		const rest = asked.slice(5).map((a) => params(a.url))
		expect(rest.map((q) => q.field_grouping)).toEqual(Object.keys(BREAKDOWNS))
		for (const q of rest) expect([q.date_from, q.date_to, q.limit, q.sort_by.endsWith(':desc')]).toEqual([`${DAY} 00:00:00`, `${DAY} 23:59:59`, '1000', true])
	})

	it("stores the day's totals, with bounces and time from the rate and the average", async () => {
		const { list } = await read()
		expect(dim(list, '')['']).toMatchObject({ visitors: 99, visits: 99, pageviews: 681, bounces: Math.round(99 * 0.2828282828282828), duration: Math.round(99 * 55.5731) })
	})

	it('stores pages, entry and exit pages with paths as misomoon writes them', async () => {
		const { list } = await read()
		expect(dim(list, 'page')['/about']).toMatchObject({ visitors: 16, visits: 16, pageviews: 192 })
		expect(dim(list, 'entry_page')['/']).toMatchObject({ visitors: 80, visits: 80, bounces: 20, duration: Math.round(80 * 40.5) })
		expect(dim(list, 'exit_page')['/about']).toMatchObject({ visits: 12 })
	})

	it('names sources from referrer hosts, and sums each UTM tag over its rows', async () => {
		const { list } = await read()
		expect(visits(list, 'source')).toEqual({ Direct: 70, Google: 20, 'Hacker News': 9 })
		expect(visits(list, 'referrer')).toEqual({ 'google.com': 20, 'news.ycombinator.com': 9 })
		expect(visits(list, 'channel')).toEqual({ Direct: 70, 'Organic Search': 20, 'Organic Social': 9 })
		expect([visits(list, 'utm_source'), visits(list, 'utm_medium'), visits(list, 'utm_campaign'), visits(list, 'utm_term')]).toEqual([{ newsletter: 9 }, { email: 9 }, { feb: 6, jan: 3 }, {}])
	})

	it('names countries, cities, browsers, systems, devices and events', async () => {
		const { list } = await read()
		expect(visits(list, 'country')).toEqual({ GB: 50, US: 40 })
		expect(visits(list, 'city')).toEqual({ London: 30 })
		expect(visits(list, 'browser')).toEqual({ Chrome: 82000, Firefox: 17300 })
		expect(visits(list, 'os')).toEqual({ macOS: 42000, iOS: 57300 })
		expect(visits(list, 'device')).toEqual({ Desktop: 42000, Mobile: 28300, Tablet: 29000 })
		expect(dim(list, 'event')).toEqual({ 'Signed up to newsletter': expect.objectContaining({ visitors: 5, events: 7 }) })
	})

	it('reads a bounce rate given as a percent', async () => {
		const { list } = await read(api((q, a) => (q.get('date_grouping') === 'day' && q.get('entity') === 'pageview' ? [{ ...TOTAL, bounce_rate: '28' }] : a)).call)
		expect(dim(list, '')[''].bounces).toBe(Math.round(99 * 0.28))
	})

	it('makes no more requests for a day without visits, nor for events in a span without any', async () => {
		const { call, asked } = api((q, a) => (q.get('date_grouping') === 'day' && q.get('entity') === 'pageview' ? [] : a))
		const { list } = await read(call)
		expect(list).toEqual([])
		expect(asked.map((a) => new URL(a.url).pathname)).toEqual(['/v1/sites/CDBUGS', '/v1/sites/CDBUGS/events', '/v1/aggregations'])
	})

	it('pages through the events list', async () => {
		const { call, asked } = api((q, a, path) => {
			if (path !== 'sites/CDBUGS/events') return a
			const list = a as { data: Row[]; has_more: boolean }
			return q.get('starting_after') ? { ...list, data: [{ id: 'QRSTUVWX', name: 'Downloaded' }] } : { ...list, has_more: true }
		})
		const { state } = await fathom.open(INPUT, call, ZONE)
		expect(asked.map((a) => a.url)).toEqual([`${BASE}sites/CDBUGS`, `${BASE}sites/CDBUGS/events?limit=100`, `${BASE}sites/CDBUGS/events?limit=100&starting_after=ABCDEFGH`])
		expect(state.events).toEqual(['Purchased product', 'Signed up to newsletter', 'Downloaded'])
	})

	it('refuses a missing token or site, and a site ID that is no code', async () => {
		await expect(fathom.open({ site: 'CDBUGS', token: '' }, api().call, ZONE)).rejects.toThrow(new ImportError('API token is required'))
		await expect(fathom.open({ site: '', token: 't' }, api().call, ZONE)).rejects.toThrow(new ImportError('Site ID is required'))
		await expect(fathom.open({ site: 'https://app.usefathom.com', token: 't' }, api().call, ZONE)).rejects.toThrow(/the code in your Fathom embed script/)
	})
})
