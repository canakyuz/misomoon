import { describe, expect, it } from 'vite-plus/test'
import { addGoogleRows, addCsvExport, GOOGLE_PULLS, IMPORTED_DIMS, aggregate, breakdown, channelForSource, importedInsertStmts, ImportedSet, timeseries, unzipTexts, zipFiles, type Scope } from '../src'
import { runner, shardDb } from './helpers'

const scope: Scope = { siteId: 'demo', filters: [], tz: 0, imported: true }
const w = { from: Date.UTC(2024, 0, 1), to: Date.UTC(2024, 0, 3) }

const FILES = {
	'imported_visitors_20240101_20240102.csv': 'date,visitors,pageviews,bounces,visits,visit_duration\n2024-01-01,10,30,4,12,600\n2024-01-02,5,10,1,6,300\n',
	'imported_sources_20240101_20240102.csv':
		'date,source,referrer,utm_source,utm_medium,utm_campaign,utm_content,utm_term,pageviews,visitors,visits,visit_duration,bounces\n' +
		'2024-01-01,Google,,,,,,,20,7,8,400,2\n2024-01-01,Direct,,,,,,,10,3,4,200,2\n2024-01-02,Hacker News,news.ycombinator.com,,,,,,10,5,6,300,1\n',
	'imported_pages_20240101_20240102.csv':
		'date,hostname,page,visits,visitors,pageviews,total_scroll_depth,total_scroll_depth_visits,total_time_on_page,total_time_on_page_visits\n2024-01-01,a.com,/,12,10,25,600,10,300,10\n',
	'imported_custom_events_20240101_20240102.csv': 'date,name,link_url,path,visitors,events\n2024-01-02,Signup,,,2,3\n',
}

async function load() {
	const db = shardDb()
	const set = new ImportedSet()
	const files = await unzipTexts(zipFiles(Object.entries(FILES).map(([name, text]) => ({ name, text }))))
	for (const f of files) addCsvExport(set, f.name, f.text)
	for (const s of importedInsertStmts('demo', 'imp1', set.list(), 0)) db.prepare(s.sql).run(...(s.params as never[]))
	return [{ run: runner(db), window: w }]
}

const pull = (name: string) => GOOGLE_PULLS.find((p) => p.name === name)!

describe('imported history', () => {
	it('pulls from Google only what the reports read', () => {
		const stored = new Set<string>()
		for (const p of GOOGLE_PULLS) {
			const set = new ImportedSet()
			addGoogleRows(set, p, [{ dimensionValues: [{ value: '20240101' }, ...p.dims.map(() => ({ value: 'x' }))], metricValues: p.metrics.map(() => ({ value: '1' })) }])
			for (const r of set.list()) stored.add(r.dim)
		}
		expect([...stored].filter((d) => d && !(IMPORTED_DIMS as readonly string[]).includes(d))).toEqual([])
	})

	it('reads a CSV export into the totals', async () => {
		const t = await load()
		const agg = await aggregate(t, scope)
		expect(agg).toMatchObject({ visitors: 15, visits: 18, pageviews: 40, bounce_rate: 27.8, visit_duration: 50, events: 3 })
		expect(await aggregate(t, { ...scope, imported: false })).toMatchObject({ visitors: 0 })
		// imports are per-dimension totals, so a filtered report leaves them out
		expect(await aggregate(t, { ...scope, filters: [{ dim: 'country', op: '==', values: ['US'] }] })).toMatchObject({ visitors: 0 })
		const pts = await timeseries(t, scope, w, 'day')
		expect(pts.map((p) => p.visitors)).toEqual([10, 5])
	})

	it('breaks imported sources, channels, pages and events down', async () => {
		const t = await load()
		const src = await breakdown(t, scope, 'source')
		expect(src.rows.map((r) => [r.key, r.visitors])).toEqual([['Google', 7], ['Hacker News', 5], ['Direct', 3]])
		const ch = await breakdown(t, scope, 'channel')
		expect(Object.fromEntries(ch.rows.map((r) => [r.key, r.visitors]))).toEqual({ 'Organic Search': 7, 'Organic Social': 5, Direct: 3 })
		const pages = await breakdown(t, scope, 'page')
		expect(pages.rows[0]).toMatchObject({ key: '/', visitors: 10, pageviews: 25, time_on_page: 30, scroll_depth: 60 })
		const ev = await breakdown(t, scope, 'event', { totalVisitors: 15 })
		expect(ev.rows[0]).toMatchObject({ key: 'Signup', visitors: 2, events: 3 })
	})

	it('maps Google report rows', () => {
		const set = new ImportedSet()
		const row = (d: string[], m: number[]) => ({ dimensionValues: d.map((value) => ({ value })), metricValues: m.map((x) => ({ value: String(x) })) })
		addGoogleRows(set, pull('totals'), [row(['20240101'], [10, 12, 30, 8, 600])])
		addGoogleRows(set, pull('device'), [row(['20240101', 'mobile'], [4, 5, 9, 3, 100])])
		addGoogleRows(set, pull('event'), [row(['20240101', 'page_view'], [10, 30]), row(['20240101', 'sign_up'], [2, 2])])
		const rows = set.list()
		expect(rows.find((r) => r.dim === '')).toMatchObject({ day: '2024-01-01', visitors: 10, pageviews: 30, visits: 12, bounces: 4, duration: 600 })
		expect(rows.find((r) => r.dim === 'device')).toMatchObject({ key: 'Mobile', bounces: 2 })
		expect(rows.filter((r) => r.dim === 'event').map((r) => r.key)).toEqual(['sign_up'])
	})

	it("files Google's outbound clicks, downloads, and form submissions under misomoon's names", () => {
		const set = new ImportedSet()
		const row = (d: string[], m: number[]) => ({ dimensionValues: d.map((value) => ({ value })), metricValues: m.map((x) => ({ value: String(x) })) })
		addGoogleRows(set, pull('event'), ['click', 'file_download', 'form_submit', 'form_start'].map((name) => row(['20240101', name], [1, 2])))
		expect(set.list().map((r) => r.key)).toEqual(['Outbound link', 'Download', 'Form sent', 'form_start'])
	})

	it('classifies imported source names', () => {
		expect(channelForSource('Google', null, null)).toBe('Organic Search')
		expect(channelForSource('Google', 'cpc', null)).toBe('Paid Search')
		expect(channelForSource('Direct', null, null)).toBe('Direct')
		expect(channelForSource('newsletter-weekly', 'email', null)).toBe('Email')
		expect(channelForSource('example.org', null, null)).toBe('Referral')
	})
})
