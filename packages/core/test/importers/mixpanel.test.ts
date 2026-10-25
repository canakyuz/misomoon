import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vite-plus/test'
import { ImportedSet, type ImportedRow } from '../../src/imported'
import { addExportFiles } from '../../src/importers/files'
import { isMixpanelJsonl, mixpanelHits } from '../../src/importers/mixpanel'

/**
 * Mixpanel's Raw Event Export as published: its first two lines are the example answer in
 * Mixpanel's API reference (https://docs.mixpanel.com/reference/raw-event-export), and the
 * third is a page view from a real export that OpenPanel keeps in its Mixpanel importer's
 * tests (packages/core/src/modules/import/src/providers/mixpanel.test.ts in
 * github.com/Openpanel-dev/openpanel), with its site's domain written as domain.com.
 */
const PUBLISHED = readFileSync(new URL('./fixtures/mixpanel-published.jsonl', import.meta.url), 'utf8')
/**
 * Ten lines of a real Raw Event Export of a web app, published in github.com/GWolf10/bi
 * (bi_projects/third_party_project/workspace/temp/bi/third_party_project/json_files/mp_api_raw_20241007.json):
 * the app's own events, sent without a visitor, and the page views of its web app. Its
 * users' ids are replaced by numbers, its domain by app.example.com, and its name in page
 * titles taken out.
 */
const APP = readFileSync(new URL('./fixtures/mixpanel-app.jsonl', import.meta.url), 'utf8')
const ZONE = 'Asia/Kolkata'

/** A line in the shape of the real one, for a visitor's own events */
const line = (event: string, time: number, props: Record<string, unknown> = {}) =>
	JSON.stringify({ event, properties: { time, distinct_id: '$device:abc', $device_id: 'abc', $current_url: 'https://domain.com/', current_domain: 'domain.com', $browser: 'Mobile Safari', $browser_version: 18.4, $os: 'iOS', $screen_width: 390, mp_country_code: 'IN', $referrer: '$direct', ...props } })

function read(text: string) {
	const set = new ImportedSet()
	const n = addExportFiles(set, [{ name: 'export.jsonl', text }], ZONE)
	return { list: set.list(), n }
}
const keys = (list: ImportedRow[], dim: string) => Object.fromEntries(list.filter((r) => r.dim === dim).map((r) => [r.key, r.visits]))
const row = (list: ImportedRow[], dim: string, key = '') => list.find((r) => r.dim === dim && r.key === key)

describe("Mixpanel's Raw Event Export, on the lines Mixpanel and its users published", () => {
	it('tells the export from other files', () => {
		expect(isMixpanelJsonl(PUBLISHED)).toBe(true)
		expect(isMixpanelJsonl('{"event":"x"}\n')).toBe(false)
		expect(isMixpanelJsonl('date,visitors\n2026-01-01,3\n')).toBe(false)
	})

	it('reads the real page view: its page, campaign, place, browser and device', () => {
		const hits = mixpanelHits(PUBLISHED)
		// the reference's two lines have no visitor, as events a server sends
		expect(hits).toHaveLength(1)
		expect(hits[0]).toMatchObject({
			t: 1_746_097_970_000,
			visitor: '123',
			path: '/state/maharashtra',
			host: 'domain.com',
			referrer: 'https://google.com/',
			utm: { utm_source: 'google', utm_medium: 'cpc' },
			country: 'IN',
			region: 'Maharashtra',
			city: 'Mumbai',
			browser: 'Chrome',
			browser_version: '135',
			os: 'Android',
			device: 'Mobile',
		})
		expect(hits[0].event).toBeUndefined()

		const { list, n } = read(PUBLISHED)
		expect(n).toBe(1)
		// 2025-05-01 16:42 in Kolkata; a paid Google click
		expect(row(list, '')).toMatchObject({ day: '2025-05-01', visitors: 1, visits: 1, pageviews: 1, bounces: 1 })
		expect([keys(list, 'source'), keys(list, 'channel'), keys(list, 'browser_version')]).toEqual([{ Google: 1 }, { 'Paid Search': 1 }, { 'Chrome 135': 1 }])
	})

	it("groups a visitor's events into visits, and leaves out Mixpanel's own events", () => {
		const t = 1_746_097_970
		const text = [
			line('$mp_web_page_view', t),
			line('$identify', t + 5),
			line('$mp_click', t + 6),
			line('Signed up', t + 60, { plan: 'pro' }),
			line('$mp_web_page_view', t + 120, { $current_url: 'https://domain.com/pricing?utm_campaign=may', current_url_path: undefined }),
			// 40 minutes later, a new visit from a search
			line('$mp_web_page_view', t + 120 + 40 * 60, { $referrer: 'https://www.bing.com/' }),
		].join('\n')
		const { list, n } = read(text)
		expect(n).toBe(4)
		expect(row(list, '')).toMatchObject({ visitors: 1, visits: 2, pageviews: 3, bounces: 1, duration: 120 })
		expect(keys(list, 'source')).toEqual({ Direct: 1, Bing: 1 })
		expect(row(list, 'event', 'Signed up')).toMatchObject({ visitors: 1, events: 1 })
		expect(row(list, 'event', '$identify')).toBeUndefined()
		// the tag in the second page's URL isn't the visit's: its first page had none
		expect(keys(list, 'utm_campaign')).toEqual({})
		expect([keys(list, 'browser'), keys(list, 'os_version'), keys(list, 'device')]).toEqual([{ Safari: 2 }, {}, { Mobile: 2 }])
		expect(keys(list, 'page')).toEqual({ '/': 2, '/pricing': 1 })
	})

	it("takes the visitor from distinct_id without $device:, or else $device_id, and the visit's tags from its first page's URL", () => {
		const t = 1_746_097_970
		const { list } = read([line('$mp_web_page_view', t, { $current_url: 'https://domain.com/?utm_campaign=may&utm_source=news' }), line('$mp_web_page_view', t + 60, { distinct_id: undefined })].join('\n'))
		expect(row(list, '')).toMatchObject({ visitors: 1, visits: 1, pageviews: 2 })
		expect([keys(list, 'utm_campaign'), keys(list, 'utm_source')]).toEqual([{ may: 1 }, { news: 1 }])
		// $direct is Mixpanel's word for no referrer
		expect(keys(list, 'referrer')).toEqual({})
		expect(keys(list, 'channel')).toEqual({ Referral: 1 })
	})

	it('reads times in milliseconds, and the device from $device or $os without a screen width', () => {
		const t = 1_746_097_970_123
		const hits = mixpanelHits([line('$mp_web_page_view', t, { $screen_width: undefined, $device: 'iPad' }), line('$mp_web_page_view', t, { $screen_width: undefined, $os: 'Mac OS X', $device_id: 'mac' })].join('\n'))
		expect(hits.map((h) => [h.t, h.device, h.os])).toEqual([
			[t, 'Tablet', 'iOS'],
			[t, 'Desktop', 'macOS'],
		])
	})

	it('names the line that is not JSON, and skips one that is no event', () => {
		expect(() => mixpanelHits(`${line('$mp_web_page_view', 1)}\n{oops\n`)).toThrow("line 2 of this Mixpanel export isn't JSON")
		expect(mixpanelHits(`null\n[]\n${line('$mp_web_page_view', 1)}\n`)).toHaveLength(1)
	})

	it("reads an ad click id and the ref and source tags in the page's URL, as the tracker does", () => {
		const t = 1_746_097_970
		const { list } = read(
			[
				line('$mp_web_page_view', t, { $current_url: 'https://domain.com/?gclid=abc', $referrer: 'https://www.google.com/' }),
				line('$mp_web_page_view', t, { $device_id: 'b', distinct_id: 'b', $current_url: 'https://domain.com/?ref=newsletter' }),
			].join('\n'),
		)
		expect(keys(list, 'channel')).toEqual({ 'Paid Search': 1, Referral: 1 })
		expect(keys(list, 'utm_source')).toEqual({ newsletter: 1 })
	})

	it("counts a signed-in user once, though each page view has a new device id, and the app's events not at all", () => {
		const hits = mixpanelHits(APP)
		// six app events have no distinct_id; four page views do
		expect(hits.map((h) => h.visitor)).toEqual(['device-1', 'device-2', 'user-1', 'user-1'])
		const { list, n } = read(APP)
		expect(n).toBe(4)
		// 2024-10-06 10:49 and 10:50 in Kolkata, ten seconds apart
		expect(row(list, '')).toMatchObject({ day: '2024-10-02', visitors: 2, visits: 2, pageviews: 2, bounces: 2 })
		const day = list.filter((r) => r.day === '2024-10-06')
		expect(row(day, '')).toMatchObject({ visitors: 1, visits: 1, pageviews: 2, bounces: 0, duration: 10 })
		// the app's own pages are no referrer
		expect([keys(day, 'source'), keys(day, 'referrer')]).toEqual([{ Direct: 1 }, {}])
		expect([keys(day, 'browser_version'), keys(day, 'city')]).toEqual([{ 'Samsung Internet 18': 1 }, { 'Tel Aviv': 1 }])
	})

	it('names a browser without a version, and a referrer from another site', () => {
		const list = read(APP).list.filter((r) => r.day === '2024-10-02')
		expect([keys(list, 'browser'), keys(list, 'browser_version')]).toEqual([{ Chrome: 1, Safari: 1 }, { 'Chrome 129': 1 }])
		expect(keys(list, 'referrer')).toEqual({ 'gstatic.com': 1 })
		expect(keys(list, 'device')).toEqual({ Desktop: 1, Mobile: 1 })
	})
})
