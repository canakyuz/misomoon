import { beforeAll, describe, expect, it } from 'vite-plus/test'
import { aggregate, breakdown, DAY, funnel, HOUR, SAMPLE, sampleDay, sampleTraffic, type Scope, type Target } from '../src'
import { ingest, runner, shardDb } from './helpers'

const NOW = Date.UTC(2026, 9, 22, 18, 0)
const TODAY = Math.floor(NOW / DAY)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('the sample site', () => {
	it('gives the same day the same hits and ids every time', () => {
		const a = sampleDay('acme', SAMPLE.domain, TODAY)
		const b = sampleDay('acme', SAMPLE.domain, TODAY)
		expect(b).toEqual(a)
		expect(a.length).toBeGreaterThan(1000)
		expect(a.every((h) => UUID.test(h.payload.id ?? ''))).toBe(true)
		expect(new Set(a.map((h) => h.payload.id)).size).toBe(a.length)
		expect(sampleDay('acme', SAMPLE.domain, TODAY - 1)[0].payload.id).not.toBe(a[0].payload.id)
	})

	it('has clicks on the shop page, which is the most viewed and the one Behavior opens on', () => {
		const pings = sampleDay('acme', SAMPLE.domain, TODAY).filter((h) => h.payload.n === 'engagement' && new URL(h.payload.u).pathname === '/shop')
		const clicked = pings.filter((h) => h.payload.c?.length)
		expect(pings.length).toBeGreaterThan(100)
		expect(clicked.length / pings.length).toBeGreaterThan(0.3)
		expect(new Set(clicked.flatMap((h) => (h.payload.c as unknown[][]).map((c) => c[1])))).toContain('Product card')
	})

	it('gives every form it starts a field, as the tracker does', () => {
		const pings = sampleDay('acme', SAMPLE.domain, TODAY).filter((h) => h.payload.f?.length)
		expect(new Set(pings.flatMap((h) => (h.payload.f as unknown[][]).map((f) => f[0])))).toEqual(new Set(['checkout', 'newsletter']))
		for (const h of pings) for (const [form] of h.payload.f as unknown[][]) expect((h.payload.g as unknown[][] | undefined)?.some((g) => g[0] === form)).toBe(true)
	})

	it('cuts a window out of the days without changing them', () => {
		// a visit that starts before midnight carries on into the next day, so start the window on such a day
		let day = TODAY - 1
		while (!sampleDay('acme', SAMPLE.domain, day - 1).some((h) => h.ts >= day * DAY)) day--
		const from = day * DAY + 60_000
		const to = from + 2 * DAY
		const hits = sampleTraffic('acme', SAMPLE.domain, from, to)
		expect(hits.every((h) => h.ts >= from && h.ts < to)).toBe(true)
		const days = [-1, 0, 1, 2].flatMap((d) => sampleDay('acme', SAMPLE.domain, day + d))
		expect(hits.map((h) => h.payload.id).sort()).toEqual(days.filter((h) => h.ts >= from && h.ts < to).map((h) => h.payload.id).sort())
		// topping up in two steps gives the same hits as one step
		const mid = from + 7 * HOUR
		expect([...sampleTraffic('acme', SAMPLE.domain, from, mid), ...sampleTraffic('acme', SAMPLE.domain, mid, to)]).toEqual(hits)
	})

	it('includes the visits that keep the first minutes of a day alive in a window that ends before its midnight', () => {
		let day = TODAY
		while (!sampleDay('acme', SAMPLE.domain, day).some((h) => h.ts < day * DAY)) day--
		const early = sampleDay('acme', SAMPLE.domain, day).filter((h) => h.ts < day * DAY)
		const hits = sampleTraffic('acme', SAMPLE.domain, day * DAY - 5 * 60_000, day * DAY)
		for (const h of early) expect(hits.map((x) => x.payload.id)).toContain(h.payload.id)
	})

	it('always has people online: every minute, at least SAMPLE.online visitors were active in the last five', () => {
		expect(SAMPLE.online).toBe(3)
		for (const day of [TODAY - 30, TODAY - 7, TODAY - 1, TODAY, TODAY + 1]) {
			const hits = sampleTraffic('acme', SAMPLE.domain, day * DAY - HOUR, (day + 1) * DAY)
			for (let t = day * DAY; t < (day + 1) * DAY; t += 60_000) {
				const online = new Set(hits.filter((h) => h.ts > t - 5 * 60_000 && h.ts <= t).map((h) => h.edge.ip + h.edge.ua))
				if (online.size < SAMPLE.online) throw new Error(`${online.size} online at ${new Date(t).toISOString()}`)
			}
		}
	})

	it('keeps the hits and ids a day had before the visitors who keep it alive were added', () => {
		const hits = sampleDay('acme', SAMPLE.domain, 20750)
		const known: [number, string][] = [
			[1792800022151, 'aa338975-1cb4-451d-a0ee-4a8863fb65cd'],
			[1792800051626, '9609ea71-9639-41ba-a94c-11024abde292'],
			[1792854501217, '21749500-785e-453d-bedc-ef69431376a3'],
			[1792886389475, '6f4d1929-128a-4e05-9f73-352cd9d1a6f0'],
			[1792886421563, 'bc0a291c-95c0-4b91-9dd0-7d7b02d9877a'],
		]
		for (const [ts, id] of known) expect(hits.find((h) => h.payload.id === id)?.ts).toBe(ts)
		expect(hits.every((h, i) => i === 0 || h.ts >= hits[i - 1].ts)).toBe(true)
		expect(new Set(hits.map((h) => h.payload.id)).size).toBe(hits.length)
	})

	describe('as stored', () => {
		const db = shardDb()
		const scope: Scope = { siteId: 'acme', filters: [], tz: 0 }
		let targets: Target[]

		beforeAll(async () => {
			await ingest(db, sampleTraffic('acme', SAMPLE.domain, NOW - 3 * DAY, NOW, { perDay: 120 }))
			targets = [{ run: runner(db), window: { from: NOW - 4 * DAY, to: NOW + DAY } }]
		})

		it('fills the totals, the shop funnel events, and the shop pages', async () => {
			const agg = await aggregate(targets, scope)
			expect(agg.visitors).toBeGreaterThan(200)
			expect(agg.bounce_rate).toBeGreaterThan(15)
			expect(agg.bounce_rate).toBeLessThan(70)
			expect(agg.revenue).toBeGreaterThan(0)
			const goals = (await breakdown(targets, scope, 'event', { limit: 20 })).rows.map((r) => r.key)
			expect(goals).toEqual(expect.arrayContaining(['Add to cart', 'Begin checkout', 'Purchase']))
			const pages = (await breakdown(targets, scope, 'page', { limit: 50 })).rows.map((r) => r.key)
			expect(pages).toEqual(expect.arrayContaining(['/', '/shop', '/shop/trail-pack', '/cart', '/checkout']))
		})

		it('has a funnel that narrows at every step', async () => {
			const f = await funnel(targets, scope, SAMPLE.funnels[0].steps)
			const counts = f.steps.map((s) => s.visitors)
			expect(counts[0]).toBeGreaterThan(0)
			expect(counts[3]).toBeGreaterThan(0)
			for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeLessThanOrEqual(counts[i - 1])
		})
	})
})
