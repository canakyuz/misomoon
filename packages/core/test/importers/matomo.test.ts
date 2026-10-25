import { describe, expect, it } from 'vite-plus/test'
import { ImportedSet, type ImportedRow } from '../../src/imported'
import { matomo } from '../../src/importers/matomo'
import { ImportError, type CallInit } from '../../src/importers/types'
import real from './fixtures/matomo-day.json'

const INPUT = { url: 'https://demo.matomo.cloud', site: '1', token: 'anonymous' }
const DAY = '2026-10-20'

/** Matomo's demo as recorded: each request answered with what Matomo answered it. */
function demo(change: (form: Record<string, string>, answer: unknown) => unknown = (_, a) => a) {
	const asked: Record<string, string>[] = []
	const call = async (url: string, init: CallInit = {}) => {
		expect([url, init.method]).toEqual(['https://demo.matomo.cloud/index.php', 'POST'])
		const form = init.form!
		asked.push(form)
		const hit = real.calls.find((c) => c.form.method === form.method && c.form['urls[0]'] === form['urls[0]'])
		if (!hit) throw new Error(`not recorded: ${JSON.stringify(form)}`)
		return change(form, structuredClone(hit.answer))
	}
	return { call, asked }
}

async function read(call = demo().call) {
	const { state, label, first } = await matomo.open(INPUT, call, 'Europe/Paris')
	const set = new ImportedSet()
	await matomo.day(state, DAY, 'Europe/Paris', call, set)
	return { list: set.list(), label, first }
}
const dim = (list: ImportedRow[], d: string) => Object.fromEntries(list.filter((r) => r.dim === d).map((r) => [r.key, r]))
const visits = (list: ImportedRow[], d: string) => Object.fromEntries(list.filter((r) => r.dim === d).map((r) => [r.key, r.visits]))
const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0)

describe("the Matomo importer, on a real day of Matomo's public demo", () => {
	it('signs in with the token in the POST body and names the import and its first day', async () => {
		const { call, asked } = demo()
		const { label, first } = await read(call)
		// ts_created 2011-06-27 09:42:22 is UTC
		expect([label, first]).toEqual(['Matomo: Demo Site', '2011-06-27'])
		// the site, 90 days of visits, and the day's reports in bulk requests of 10 and 5
		expect(asked).toEqual(real.calls.map((c) => c.form))
		expect(asked.every((f) => f.token_auth === 'anonymous')).toBe(true)
	})

	it('stores the day as Matomo counted it, with the page views of Actions.get', async () => {
		const { list } = await read()
		expect(dim(list, '')['']).toMatchObject({ visitors: 11994, visits: 14972, pageviews: 28947, bounces: 10006, duration: 2645113 })
		// every page's views add up to the day's
		expect(list.filter((r) => r.dim === 'page').reduce((n, r) => n + r.pageviews, 0)).toBe(28947)
		// /cart/ without its slash, as the tracker stores it
		expect(dim(list, 'page')['/cart']).toMatchObject({ visitors: 975, visits: 1214, pageviews: 1606, time_s: 86547, time_n: 1606 })
		expect(dim(list, 'entry_page')['/cart']).toMatchObject({ visitors: 352, visits: 369, bounces: 179, duration: 137866 })
		expect(dim(list, 'exit_page')['/cart']).toMatchObject({ visitors: 390, visits: 426 })
	})

	it('counts every visit under one source and one channel', async () => {
		const { list } = await read()
		expect(sum(visits(list, 'source'))).toBe(14972)
		expect(visits(list, 'channel')).toEqual({ 'Organic Search': 8594, 'Organic Social': 1932, 'AI Assistants': 1724, Referral: 1362, Direct: 1360 })
		expect(dim(list, 'source').Direct).toMatchObject({ visitors: 1302, visits: 1360, bounces: expect.any(Number) })
		expect(dim(list, 'referrer')['scubadiving.com']).toMatchObject({ visitors: 357, visits: 358 })
		expect(dim(list, 'source').ChatGPT).toMatchObject({ visitors: 277, visits: 297 })
	})

	it('estimates the visitors of search engines, which Matomo gives no unique visitors', async () => {
		const { list } = await read()
		// 8,241 visitors in 8,594 search visits: Bing's 403 visits are about 386 visitors
		expect(dim(list, 'source').Bing).toMatchObject({ visits: 403, visitors: Math.round((403 * 8241) / 8594) })
		const search = list.filter((r) => r.dim === 'channel' && r.key === 'Organic Search')[0]
		expect(Math.abs(search.visitors - 8241)).toBeLessThan(10)
	})

	it("names countries, browsers, systems, devices and events as misomoon's tracker does", async () => {
		const { list } = await read()
		expect(dim(list, 'country').US).toMatchObject({ visitors: 2272, visits: 2736 })
		// Matomo's unknown country
		expect(dim(list, 'country').XX).toBeUndefined()
		const browsers = visits(list, 'browser')
		// Chrome, Chrome Mobile, Chrome Mobile iOS, Chromium, Chrome Webview
		expect(browsers.Chrome).toBe(7252 + 1595 + 251 + 43 + 33)
		expect([browsers.Safari, browsers.Firefox, browsers.Opera, browsers.Edge, browsers['Samsung Internet']]).toEqual([2594 + 866, 1117 + 28 + 15 + 9, 22 + 18 + 6, 224, 285])
		expect(sum(browsers)).toBe(14972)
		expect(visits(list, 'os')).toMatchObject({ Windows: 4194, macOS: 3782, iOS: 3053, Android: 2133, Linux: 300, ChromeOS: 41 })
		expect(visits(list, 'os_version')).toMatchObject({ 'Windows 10/11': 2496, 'macOS 10.15': 1523, 'Windows 7': expect.any(Number) })
		// Smartphone, Phablet and Feature phone are Mobile; Unknown and the rest stay out
		expect(visits(list, 'device')).toEqual({ Desktop: 8293, Mobile: 4228 + 167 + 1, Tablet: 815 })
		expect(dim(list, 'event')['Ecommerce: Cart change']).toMatchObject({ visitors: 1992, events: 2523 })
	})

	it('asks only for the visits of a day Matomo has none for', async () => {
		const { call, asked } = demo((form, answer) => (form.method === 'VisitsSummary.get' ? { ...(answer as object), [DAY]: [] } : answer))
		const { list } = await read(call)
		expect(asked.map((f) => f.method)).toEqual(['SitesManager.getSiteFromId', 'VisitsSummary.get'])
		expect(list).toEqual([])
	})

	it('leaves out a report whose plugin is off, and fails on a refused token or missing totals', async () => {
		const off = { result: 'error', message: "The method 'getAIAssistants' does not exist or is not available in the module 'Referrers'." }
		const { list } = await read(demo((form, answer) => (form['urls[7]']?.startsWith('method=Referrers.getAIAssistants') ? (answer as unknown[]).map((a, i) => (i === 7 ? off : a)) : answer)).call)
		expect(sum(visits(list, 'source'))).toBe(14972 - 1724)

		const refused = { result: 'error', message: "You can't access this resource as it requires 'view' access for the website id = 1." }
		await expect(matomo.open(INPUT, async () => refused, 'UTC')).rejects.toThrow(new ImportError(`Matomo answered: ${refused.message}`))
		const noTotals = demo((form, answer) => (form['urls[0]']?.startsWith('method=VisitsSummary.get') ? [refused, ...(answer as unknown[]).slice(1)] : answer))
		await expect(read(noTotals.call)).rejects.toThrow(ImportError)
	})

	it('refuses a missing field, a site ID that is not a number, and a private address', async () => {
		const { call } = demo()
		await expect(matomo.open({ ...INPUT, token: '' }, call, 'UTC')).rejects.toThrow('Auth token is required')
		await expect(matomo.open({ ...INPUT, site: 'shop' }, call, 'UTC')).rejects.toThrow('Site ID is a number, such as 1')
		await expect(matomo.open({ ...INPUT, url: 'https://192.168.1.4' }, call, 'UTC')).rejects.toThrow(ImportError)
		// the address of a Matomo page works too
		await expect(matomo.open({ ...INPUT, url: 'demo.matomo.cloud/index.php' }, call, 'Europe/Paris')).resolves.toMatchObject({ label: 'Matomo: Demo Site' })
	})
})
