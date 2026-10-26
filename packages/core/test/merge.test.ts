// Reports merged from two shards must match one shard, and a beacon's clock must not put
// it on a UTC day the server hasn't reached.
import { beforeAll, describe, expect, it } from 'vite-plus/test'
import { buildEvent, clickMap, DAY, mediaReport, MINUTE, realtime, type DemoHit, type EventRow, type Scope, type Target, type TrackerPayload } from '../src'
import { ingest, runner, shardDb } from './helpers'

const NOW = Date.UTC(2026, 9, 22, 18, 0)
const scope: Scope = { siteId: 'shop', filters: [], tz: 0 }
const chrome = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'

let views = 0
function pageview(ip: string, ts: number, path: string, beacon?: Partial<TrackerPayload>): DemoHit[] {
	const u = `https://shop.com${path}`
	const edge = { ua: chrome, ip, country: 'US' }
	const y = (++views + 0.5) / 1000
	const out: DemoHit[] = [{ ts, edge, payload: { s: 'shop', n: 'pageview', u, ts, y } }]
	if (beacon) out.push({ ts: ts + 10_000, edge, payload: { s: 'shop', n: 'engagement', u, e: 5000, ts: ts + 10_000, y, ...beacon } })
	return out
}

describe('reports from two shards', () => {
	const one = shardDb()
	const a = shardDb()
	const b = shardDb()
	const cut = Math.floor((NOW - DAY) / DAY) * DAY
	const whole = { from: NOW - 3 * DAY, to: NOW + DAY }
	let single: Target[]
	let split: Target[]
	// the same button and video, named differently before and after a site update
	const hits: DemoHit[] = [
		...pageview('10.0.0.1', NOW - 2 * DAY, '/', { c: [['#buy', 'Start', 1, 0, 0]], m: [['Tour', 'audio', 1, 0, 0, 0, 0]] }),
		...pageview('10.0.0.2', NOW - DAY / 2, '/', { c: [['#buy', 'Start trial', 1, 0, 0]], m: [['Tour', 'video', 1, 0, 0, 0, 0]] }),
	]

	beforeAll(async () => {
		await ingest(one, hits)
		await ingest(a, hits.filter((h) => h.ts < cut))
		await ingest(b, hits.filter((h) => h.ts >= cut))
		single = [{ run: runner(one), window: whole }]
		split = [
			{ run: runner(a), window: { from: whole.from, to: cut } },
			{ run: runner(b), window: { from: cut, to: whole.to } },
		]
	})

	it('names an element and a video as one shard does', async () => {
		expect((await clickMap(split, scope)).elements).toEqual((await clickMap(single, scope)).elements)
		expect((await clickMap(single, scope)).elements[0].label).toBe('Start trial')
		expect(await mediaReport(split, scope)).toEqual(await mediaReport(single, scope))
	})
})

describe('realtime across a range change', () => {
	it('ranks a page by its visitors on both shards', async () => {
		const a = shardDb()
		const b = shardDb()
		const cut = NOW - 2 * MINUTE
		// on each shard, eight pages with 3 visitors each and /x with 2: /x has 4 in all
		const shard = (prefix: string, ts: number) => {
			const out: DemoHit[] = []
			let ip = 0
			for (let p = 0; p < 8; p++) for (let v = 0; v < 3; v++) out.push(...pageview(`10.${prefix}.${p}.${v}`, ts + ip++ * 1000, `/${prefix}${p}`))
			for (let v = 0; v < 2; v++) out.push(...pageview(`10.${prefix}.9.${v}`, ts + ip++ * 1000, '/x'))
			return out
		}
		await ingest(a, shard('1', NOW - 4 * MINUTE))
		await ingest(b, shard('2', NOW - MINUTE))
		const split: Target[] = [
			{ run: runner(a), window: { from: NOW - DAY, to: cut } },
			{ run: runner(b), window: { from: cut, to: NOW + DAY } },
		]
		const rt = await realtime(split, scope, NOW)
		expect(rt.pages[0]).toEqual({ key: '/x', visitors: 4 })
	})
})

describe('beacon clocks', () => {
	const edge = { ua: chrome, ip: '10.0.0.1', country: 'US' }
	const payload = (ts: number): TrackerPayload => ({ s: 'shop', n: 'pageview', u: 'https://shop.com/', ts })

	it('takes the server time for a beacon stamped on the next UTC day', () => {
		const now = Date.UTC(2026, 9, 22, 23, 58)
		const row = buildEvent(payload(Date.UTC(2026, 9, 23, 0, 1)), edge, now) as EventRow
		expect(row.ts).toBe(now)
	})

	it('keeps a beacon a few minutes ahead on the same day, and one from just before midnight', () => {
		const now = Date.UTC(2026, 9, 22, 12, 0)
		expect((buildEvent(payload(now + 3 * MINUTE), edge, now) as EventRow).ts).toBe(now + 3 * MINUTE)
		const after = Date.UTC(2026, 9, 23, 0, 1)
		expect((buildEvent(payload(after - 3 * MINUTE), edge, after) as EventRow).ts).toBe(after - 3 * MINUTE)
	})
})
