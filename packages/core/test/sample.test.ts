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

	describe('as stored', () => {
		const db = shardDb()
		const scope: Scope = { siteId: 'acme', filters: [], tz: 0 }
		let targets: Target[]

		beforeAll(async () => {
			await ingest(db, sampleTraffic('acme', SAMPLE.domain, NOW - 3 * DAY, NOW, { perDay: 120 }))
			targets = [{ run: runner(db), window: { from: NOW - 4 * DAY, to: NOW + DAY } }]
		})

		it('fills every report the dashboard shows', async () => {
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
