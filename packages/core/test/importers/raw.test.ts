import { describe, expect, it } from 'vite-plus/test'
import { ImportedSet, type ImportedRow } from '../../src/imported'
import { addRawHits, browserVersion, osVersion, type RawHit } from '../../src/importers/raw'

const ZONE = 'Europe/Berlin'
/** 2026-03-10 09:00 in Berlin */
const T0 = Date.parse('2026-03-10T08:00:00Z')
const MIN = 60_000

const hit = (minutes: number, h: Partial<RawHit> = {}): RawHit => ({ t: T0 + minutes * MIN, visitor: 'a', path: '/', host: 'example.com', ...h })

function count(hits: RawHit[], zone = ZONE) {
	const set = new ImportedSet()
	const read = addRawHits(set, hits, zone)
	return { list: set.list(), read }
}
const row = (list: ImportedRow[], dim: string, key = '', day = '2026-03-10') => list.find((r) => r.day === day && r.dim === dim && r.key === key)
const keys = (list: ImportedRow[], dim: string) => Object.fromEntries(list.filter((r) => r.dim === dim).map((r) => [r.key, r.visits]))

describe('addRawHits', () => {
	it('starts a new visit after 30 minutes without a hit, and counts the visitor once a day', () => {
		const { list } = count([hit(0), hit(30, { path: '/b' }), hit(61, { path: '/c' })])
		// 0 and 30 are one visit; 61 is 31 minutes after the last hit
		expect(row(list, '')).toMatchObject({ visitors: 1, visits: 2, pageviews: 3, bounces: 1, duration: 30 * 60 })
		expect(keys(list, 'entry_page')).toEqual({ '/': 1, '/c': 1 })
		expect(keys(list, 'exit_page')).toEqual({ '/b': 1, '/c': 1 })
	})

	it("keeps a tool's own visit ids, without the 30 minutes", () => {
		const { list } = count([hit(0, { visit: 'x' }), hit(1, { visit: 'y' }), hit(50, { visit: 'x', path: '/b' })])
		expect(row(list, '')).toMatchObject({ visitors: 1, visits: 2, pageviews: 3, bounces: 1 })
		expect(row(list, 'entry_page', '/')).toMatchObject({ visits: 2, bounces: 1, duration: 50 * 60 })
	})

	it('counts a visit with a custom event as no bounce, and the event on its own', () => {
		const { list } = count([hit(0), hit(2, { event: 'Signup' }), hit(0, { visitor: 'b' }), hit(5, { visitor: 'b', event: 'Signup' }), hit(6, { visitor: 'b', event: 'Signup' })])
		expect(row(list, '')).toMatchObject({ visitors: 2, visits: 2, bounces: 0, duration: 2 * 60 + 6 * 60 })
		expect(row(list, 'event', 'Signup')).toMatchObject({ visitors: 2, events: 3 })
	})

	it('adds the seconds on the last page to the visit, and keeps time and scroll per page', () => {
		const { list } = count([hit(0, { seconds: 20, scroll: 50 }), hit(1, { path: '/b', seconds: 40, scroll: 100 }), hit(3, { seconds: 10 })])
		expect(row(list, '')).toMatchObject({ visits: 1, pageviews: 3, duration: 3 * 60 + 10 })
		expect(row(list, 'page', '/')).toMatchObject({ visitors: 1, visits: 1, pageviews: 2, time_s: 30, time_n: 2, scroll: 50, scroll_n: 1 })
		expect(row(list, 'page', '/b')).toMatchObject({ visits: 1, pageviews: 1, time_s: 40, time_n: 1, scroll: 100, scroll_n: 1 })
	})

	it("files the visit under its first hit's referrer and tags, as the tracker would", () => {
		const { list } = count([
			hit(0, { visitor: 'a', referrer: 'https://www.google.com/search?q=x' }),
			hit(5, { visitor: 'a', referrer: 'https://news.ycombinator.com/' }),
			hit(0, { visitor: 'b', referrer: 'https://example.com/pricing' }),
			hit(0, { visitor: 'c', referrer: 'google' }),
			hit(0, { visitor: 'd', referrer: 'bing.com', utm: { utm_source: 'bing', utm_medium: 'cpc', utm_campaign: 'spring' } }),
			hit(0, { visitor: 'e' }),
		])
		// a referrer on the site is none, and a name with no dot is a source's name
		expect(keys(list, 'source')).toEqual({ Google: 2, Direct: 2, Bing: 1 })
		expect(keys(list, 'channel')).toEqual({ 'Organic Search': 2, Direct: 2, 'Paid Search': 1 })
		expect(keys(list, 'referrer')).toEqual({ 'google.com': 1, 'bing.com': 1 })
		expect([keys(list, 'utm_medium'), keys(list, 'utm_campaign')]).toEqual([{ cpc: 1 }, { spring: 1 }])
	})

	it('names places, browsers, systems and devices from the first hit, with misomoon version keys', () => {
		const { list } = count([
			hit(0, { country: 'de', region: 'Berlin', city: 'Berlin', browser: 'Chrome', browser_version: '141.0.7390', os: 'Windows', os_version: '19.0.0', device: 'Desktop' }),
			hit(1, { country: 'FR', browser: 'Firefox', os: 'Linux', device: 'Mobile' }),
		])
		expect([keys(list, 'country'), keys(list, 'region'), keys(list, 'city')]).toEqual([{ DE: 1 }, { Berlin: 1 }, { Berlin: 1 }])
		expect([keys(list, 'browser'), keys(list, 'browser_version')]).toEqual([{ Chrome: 1 }, { 'Chrome 141': 1 }])
		expect([keys(list, 'os'), keys(list, 'os_version'), keys(list, 'device')]).toEqual([{ Windows: 1 }, { 'Windows 10/11': 1 }, { Desktop: 1 }])
	})

	it('counts a visit on the local day it starts, and an event on the day it was sent', () => {
		// 23:50 and 00:10 in Berlin
		const late = Date.parse('2026-03-10T22:50:00Z')
		const { list } = count([{ t: late, visitor: 'a', path: '/' }, { t: late + 20 * MIN, visitor: 'a', path: '/b' }, { t: late + 21 * MIN, visitor: 'a', path: '/b', event: 'Signup' }])
		expect(row(list, '')).toMatchObject({ visits: 1, pageviews: 2 })
		expect(row(list, '', '', '2026-03-11')).toBeUndefined()
		expect(row(list, 'event', 'Signup', '2026-03-11')).toMatchObject({ visitors: 1, events: 1 })
		// in UTC both page views fall on the 10th
		expect(row(count([{ t: late + 20 * MIN, visitor: 'a', path: '/' }], 'UTC').list, '')).toBeDefined()
	})

	it('counts a visit the tool marked as no new visitor among visits only', () => {
		const { list } = count([hit(0, { visit: 'x', counted: true }), hit(1, { visit: 'y', visitor: 'b', counted: false }), hit(2, { visit: 'z', visitor: 'c', counted: false }), hit(3, { visit: 'z', visitor: 'c', path: '/b', counted: true })])
		expect(row(list, '')).toMatchObject({ visitors: 2, visits: 3 })
		expect(row(list, 'page', '/')).toMatchObject({ visitors: 2, visits: 3 })
	})

	it('sorts the hits, leaves out ones without a time or visitor, and counts no visit of events alone', () => {
		const { list, read } = count([hit(10, { path: '/b' }), hit(0), { t: NaN, visitor: 'a', path: '/x' }, hit(0, { visitor: '' }), hit(0, { visitor: 'z', event: 'Ping' })])
		expect(read).toBe(3)
		expect(row(list, 'entry_page', '/')).toMatchObject({ visits: 1 })
		expect(row(list, '')).toMatchObject({ visitors: 1, visits: 1, pageviews: 2 })
		expect(row(list, 'event', 'Ping')).toMatchObject({ visitors: 1, events: 1 })
	})
})

describe('version keys', () => {
	it('writes the major browser version, and two parts of the system version', () => {
		expect([browserVersion('Chrome', '141.0.7390.54'), browserVersion('Safari', '18'), browserVersion('Chrome', ''), browserVersion('Chrome', 'beta')]).toEqual(['Chrome 141', 'Safari 18', null, null])
		expect([osVersion('macOS', '10.15.7'), osVersion('iOS', '18.7'), osVersion('Android', '16'), osVersion('Linux', '')]).toEqual(['macOS 10.15', 'iOS 18.7', 'Android 16', null])
	})

	it("files Windows 10, 11 and the client hints' 13 and up as 10/11", () => {
		expect(['10', '10.0.0', '11', '15.0.0', '19.0.0'].map((v) => osVersion('Windows', v))).toEqual(Array(5).fill('Windows 10/11'))
		expect([osVersion('Windows', '8.1'), osVersion('Windows', '8.0.0'), osVersion('Windows', '7')]).toEqual(['Windows 8.1', 'Windows 8', 'Windows 7'])
	})
})
