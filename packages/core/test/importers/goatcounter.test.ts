import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vite-plus/test'
import { ImportedSet, type ImportedRow } from '../../src/imported'
import { addExportFiles } from '../../src/importers/files'
import { addGoatCounterCsv, GOATCOUNTER_CSV_MAX } from '../../src/importers/goatcounter'

/** GoatCounter's own test export, cmd/goatcounter/testdata/export.csv in its repository: three real page views of arp242.net, with each Session replaced by a number */
const REAL = readFileSync(new URL('./fixtures/goatcounter-export.csv', import.meta.url), 'utf8')
const [HEAD, EVENT, CHROME, SAFARI] = REAL.trim().split('\n')

const read = (text: string, zone = 'UTC') => {
	const set = new ImportedSet()
	const n = addExportFiles(set, [{ name: 'goatcounter-export-arp242.net-20201231T000000Z-0.csv', text }], zone)
	return { n, list: set.list() }
}
const at = (list: ImportedRow[], day: string, dim: string) => Object.fromEntries(list.filter((r) => r.day === day && r.dim === dim).map((r) => [r.key, r]))
/** a real row with its session, path, date or referrer changed */
const edit = (row: string, from: string, to: string) => row.replace(from, to)

describe("GoatCounter's CSV export", () => {
	it('reads the real export: a page view and an event on 1 December, a page view from Reddit on 27 December', () => {
		const { n, list } = read(REAL)
		expect(n).toBe(3)
		expect(at(list, '2020-12-01', '')['']).toMatchObject({ visitors: 1, visits: 1, pageviews: 1, bounces: 1, duration: 0 })
		expect(at(list, '2020-12-01', 'page')['/stupid-light.html']).toMatchObject({ visitors: 1, pageviews: 1 })
		// Event is 1 in GoatCounter's SQLite exports
		expect(at(list, '2020-12-01', 'event')['click-cv-html']).toMatchObject({ visitors: 1, events: 1 })
		expect(Object.keys(at(list, '2020-12-01', 'source'))).toEqual(['Direct'])
		expect(at(list, '2020-12-01', 'browser_version')['Chrome 86']).toBeDefined()
		expect(at(list, '2020-12-01', 'os_version')['Windows 7']).toBeDefined()
		// from the user agent this old export still carries
		expect(Object.keys(at(list, '2020-12-01', 'device'))).toEqual(['Desktop'])
		expect(Object.keys(at(list, '2020-12-01', 'country'))).toEqual(['AR'])

		expect(Object.keys(at(list, '2020-12-27', 'source'))).toEqual(['Reddit'])
		expect(Object.keys(at(list, '2020-12-27', 'referrer'))).toEqual(['reddit.com'])
		expect(Object.keys(at(list, '2020-12-27', 'channel'))).toEqual(['Organic Social'])
		expect(Object.keys(at(list, '2020-12-27', 'browser_version'))).toEqual(['Safari 14'])
		expect(Object.keys(at(list, '2020-12-27', 'os_version'))).toEqual(['macOS 10.15'])
		expect(Object.keys(at(list, '2020-12-27', 'country'))).toEqual(['RO'])
	})

	it("counts each day in the site's time zone", () => {
		// 00:07 UTC on 1 December is 19:07 on 30 November in New York
		const { list } = read(REAL, 'America/New_York')
		expect([...new Set(list.map((r) => r.day))].sort()).toEqual(['2020-11-30', '2020-12-26'])
	})

	it('makes one visit of a session, with its entry, exit, bounce and length', () => {
		const later = edit(edit(CHROME, '/stupid-light.html,Stupid light software', '/static-go.html/,Static Go'), '2020-12-01T00:07:44Z', '2020-12-01T00:10:44Z')
		const { list } = read([HEAD, EVENT, CHROME, later].join('\n'))
		expect(at(list, '2020-12-01', '')['']).toMatchObject({ visitors: 1, visits: 1, pageviews: 2, bounces: 0, duration: 180 })
		expect(Object.keys(at(list, '2020-12-01', 'entry_page'))).toEqual(['/stupid-light.html'])
		// without its trailing slash
		expect(Object.keys(at(list, '2020-12-01', 'exit_page'))).toEqual(['/static-go.html'])
	})

	it('leaves out bots, reads Event as true from Postgres exports, and refuses another version', () => {
		const bot = edit(SAFARI, ',0,www.reddit.com', ',3,www.reddit.com')
		const pg = edit(EVENT, 'HTML source,1,', 'HTML source,true,')
		const { n, list } = read([HEAD, pg, CHROME, bot].join('\n'))
		expect(n).toBe(2)
		expect(list.some((r) => r.day === '2020-12-27')).toBe(false)
		expect(at(list, '2020-12-01', 'event')['click-cv-html']).toBeDefined()
		expect(() => read([edit(HEAD, '2Path', '1Path'), CHROME].join('\n'))).toThrow(/version 1; misomoon reads version 2/)
		expect(() => addGoatCounterCsv(new ImportedSet(), HEAD + 'x'.repeat(GOATCOUNTER_CSV_MAX), 'UTC')).toThrow(/upload the JSON export instead/)
	})

	it('keeps a session whole when its rows come a little out of order', () => {
		const second = edit(SAFARI, '2020-12-27T00:37:37Z', '2020-12-27T00:39:37Z')
		const { list } = read([HEAD, second, SAFARI].join('\n'))
		expect(at(list, '2020-12-27', '')['']).toMatchObject({ visits: 1, pageviews: 2, duration: 120 })
		// a row of the next day between them doesn't close the day yet
		const next = edit(edit(CHROME, '2020-12-01T00:07:44Z', '2020-12-28T09:00:00Z'), 'session-0001', 'other-session')
		const { list: mixed } = read([HEAD, second, next, SAFARI].join('\n'))
		expect(at(mixed, '2020-12-27', '')['']).toMatchObject({ visits: 1, pageviews: 2 })
		expect(at(mixed, '2020-12-28', '')['']).toMatchObject({ visits: 1, pageviews: 1 })
	})

	it('names a campaign without a referrer as a direct visit with that campaign', () => {
		const campaign = edit(SAFARI, 'www.reddit.com,h', 'spring-sale,c')
		const { list } = read([HEAD, campaign].join('\n'))
		expect(Object.keys(at(list, '2020-12-27', 'source'))).toEqual(['Direct'])
		expect(Object.keys(at(list, '2020-12-27', 'utm_campaign'))).toEqual(['spring-sale'])
	})
})

/**
 * The examples of GoatCounter's tpl/help/export-json.md, with their ids made to match one
 * another, as the files of one JSON export zip.
 */
const lines = (rows: object[]) => rows.map((r) => JSON.stringify(r)).join('\n')
const JSON_EXPORT = [
	{ name: 'info.json', text: JSON.stringify({ export_version: '1.0', goatcounter_version: '2.7', created_for: 'stats.arp242.net', created_at: '2026-03-07T16:49:27Z' }) },
	{ name: 'paths.jsonl', text: lines([{ id: 211, path: '/', title: 'Home page' }, { id: 215, path: '/api', title: 'API Documentation' }, { id: 1442298, event: true, path: 'click-banana', title: 'Yellow curvy fruit' }]) },
	{ name: 'refs.jsonl', text: lines([{ id: 1, ref: '', ref_scheme: 'o' }, { id: 69853, ref: 'Google', ref_scheme: 'g' }, { id: 2176502, ref: 'example.com/page.html', ref_scheme: 'h' }]) },
	{ name: 'browsers.jsonl', text: lines([{ id: 1, name: 'Chrome', version: '46' }, { id: 29, name: '', version: '' }, { id: 37, name: 'Firefox', version: '83' }]) },
	{ name: 'systems.jsonl', text: lines([{ id: 2, name: 'Android', version: '7.1' }, { id: 3, name: 'Linux', version: 'Ubuntu' }, { id: 18, name: 'Windows', version: '10' }, { id: 39, name: '', version: '' }]) },
	{ name: 'hit_stats.jsonl', text: lines([{ hour: '2026-03-05T19:00:00Z', path_id: 211, ref_id: 1, count: 4 }, { hour: '2026-03-07T15:00:00Z', path_id: 215, ref_id: 69853, count: 1 }, { hour: '2026-03-07T15:00:00Z', path_id: 211, ref_id: 2176502, count: 3 }, { hour: '2026-03-07T15:00:00Z', path_id: 1442298, ref_id: 1, count: 2 }]) },
	{ name: 'browser_stats.jsonl', text: lines([{ day: '2026-03-05', path_id: 211, browser_id: 1, count: 1 }, { day: '2026-03-05', path_id: 211, browser_id: 37, count: 3 }, { day: '2026-03-05', path_id: 211, browser_id: 29, count: 1 }]) },
	{ name: 'system_stats.jsonl', text: lines([{ day: '2026-03-05', path_id: 211, system_id: 18, count: 4 }, { day: '2026-03-05', path_id: 211, system_id: 3, count: 2 }]) },
	{ name: 'location_stats.jsonl', text: lines([{ day: '2026-03-05', path_id: 211, location: 'IN', count: 1 }, { day: '2026-03-05', path_id: 211, location: 'RO-B', count: 1 }, { day: '2026-03-07', path_id: 211, location: '', count: 4 }]) },
	{ name: 'size_stats.jsonl', text: lines([{ day: '2026-03-05', path_id: 211, width: 1280, count: 9 }, { day: '2026-03-05', path_id: 211, width: 0, count: 1 }]) },
]

describe("GoatCounter's JSON export", () => {
	const set = new ImportedSet()
	const n = addExportFiles(set, JSON_EXPORT, 'UTC')
	const list = set.list()

	it("adds each day's counts per path, as GoatCounter's own totals do", () => {
		expect(n).toBe(4 + 3 + 2 + 3 + 2)
		expect(at(list, '2026-03-05', '')['']).toMatchObject({ visitors: 4, visits: 4, pageviews: 4 })
		expect(at(list, '2026-03-07', '')['']).toMatchObject({ visitors: 4 })
		expect(at(list, '2026-03-07', 'page')).toMatchObject({ '/': { visitors: 3 }, '/api': { visitors: 1 } })
		expect(at(list, '2026-03-07', 'event')['click-banana']).toMatchObject({ visitors: 2, events: 2 })
	})

	it('names sources by their scheme, and the rest of the reports from the lookups', () => {
		expect(Object.fromEntries(Object.entries(at(list, '2026-03-07', 'source')).map(([k, r]) => [k, r.visitors]))).toEqual({ Google: 1, 'example.com': 3 })
		expect(Object.keys(at(list, '2026-03-07', 'referrer'))).toEqual(['example.com'])
		expect(Object.keys(at(list, '2026-03-05', 'source'))).toEqual(['Direct'])
		expect(Object.fromEntries(Object.entries(at(list, '2026-03-05', 'browser')).map(([k, r]) => [k, r.visitors]))).toEqual({ Chrome: 1, Firefox: 3 })
		expect(Object.keys(at(list, '2026-03-05', 'browser_version'))).toEqual(['Chrome 46', 'Firefox 83'])
		expect(Object.fromEntries(Object.entries(at(list, '2026-03-05', 'os')).map(([k, r]) => [k, r.visitors]))).toEqual({ Windows: 4, Linux: 2 })
		expect(Object.keys(at(list, '2026-03-05', 'os_version'))).toEqual(['Windows 10/11'])
		expect(Object.keys(at(list, '2026-03-05', 'country'))).toEqual(['IN', 'RO'])
		expect(at(list, '2026-03-05', 'device')).toMatchObject({ Desktop: { visitors: 9 } })
	})

	it('puts an hour on the local day it falls on', () => {
		const ny = new ImportedSet()
		addExportFiles(ny, JSON_EXPORT, 'Asia/Tokyo')
		// 19:00 UTC on 5 March is 04:00 on 6 March in Tokyo
		expect(at(ny.list(), '2026-03-06', '')['']).toMatchObject({ visitors: 4 })
	})

	it('refuses another major version', () => {
		const v2 = JSON_EXPORT.map((f) => (f.name === 'info.json' ? { ...f, text: '{"export_version":"2.0"}' } : f))
		expect(() => addExportFiles(new ImportedSet(), v2, 'UTC')).toThrow(/version 2.0; misomoon reads version 1/)
	})
})
