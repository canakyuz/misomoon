import { describe, expect, it } from 'vite-plus/test'
import { aggregate, breakdown, DAY, funnel, journeys, MINUTE, resolvePeriod, type Scope, type TrackerPayload } from '../src'
import { ingest, runner, shardDb } from './helpers'


const NOW = Date.UTC(2026, 9, 22, 18, 0)
const scope: Scope = { siteId: 'demo', filters: [], tz: 0 }
const w = { from: NOW - DAY, to: NOW + DAY }
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

type Hit = [minute: number, payload: Partial<TrackerPayload>]
/** One visitor per ip; hits are [minutes after NOW - 2h, payload]. */
async function db(visitors: Record<string, Hit[]>) {
	const d = shardDb()
	// each pageview picks a view key, and the engagement beacons after it send it, as m.js does
	let views = 0
	const hits = Object.entries(visitors).flatMap(([ip, list]) => {
		let y = ''
		return list.map(([m, p]) => {
			if ((p.n ?? 'pageview') === 'pageview') y = `view-${ip}-${String(++views).padStart(12, '0')}`
			return {
				ts: NOW - 2 * 60 * MINUTE + m * MINUTE,
				payload: { s: 'demo', n: 'pageview', ...(p.n === 'pageview' || !p.n || p.n === 'engagement' ? { y } : {}), ...p, u: `https://misomoon.com${p.u ?? '/'}` },
				edge: { ua: UA, ip },
			}
		})
	})
	hits.sort((a, b) => a.ts - b.ts)
	await ingest(d, hits as never)
	return [{ run: runner(d), window: w }]
}

describe('metric parity', () => {
	it('measures visit duration from the first to the last pageview or event, not engagement pings', async () => {
		const t = await db({
			a: [[0, { u: '/' }], [2, { u: '/docs' }], [3, { n: 'Signup', u: '/docs' }], [20, { n: 'engagement', u: '/docs', e: 900_000 }]],
			b: [[0, { u: '/' }], [5, { n: 'engagement', u: '/', e: 300_000 }]],
		})
		const agg = await aggregate(t, scope)
		// (180 s + 0 s) / 2 visits; single-page visits count as zero
		expect(agg.visit_duration).toBe(90)
	})

	it('does not end a bounce with a non-interactive event', async () => {
		const t = await db({
			a: [[0, { u: '/' }], [1, { n: 'Video: Autoplay', i: false }]],
			b: [[0, { u: '/' }], [1, { n: 'Outbound link', i: false }]],
			c: [[0, { u: '/' }], [1, { n: 'Signup' }]],
		})
		const agg = await aggregate(t, scope)
		// a bounced; b's outbound click is a system event and always counts; c converted
		expect(agg.bounce_rate).toBe(33.3)
		expect(agg.events).toBe(3)
	})

	it('measures bounce rate under a page filter on visits that entered there', async () => {
		const t = await db({
			a: [[0, { u: '/' }], [1, { u: '/pricing' }]],
			b: [[0, { u: '/pricing' }]],
			c: [[0, { u: '/pricing' }], [1, { u: '/signup' }]],
		})
		const agg = await aggregate(t, { ...scope, filters: [{ dim: 'page', op: '==', values: ['/pricing'] }] })
		expect(agg.visits).toBe(3)
		expect(agg.bounce_rate).toBe(50)
	})

	it('reports time on page per visit and the deepest scroll of each visit', async () => {
		const t = await db({
			a: [[0, { u: '/' }], [1, { n: 'engagement', u: '/', e: 10_000, d: 30 }], [2, { n: 'engagement', u: '/', e: 20_000, d: 90 }]],
			b: [[0, { u: '/' }], [1, { n: 'engagement', u: '/', e: 30_000, d: 50 }]],
		})
		const row = (await breakdown(t, scope, 'page')).rows[0]
		expect(row.time_on_page).toBe(30)
		expect(row.scroll_depth).toBe(70)
	})

	it('reports exit rate as exits over pageviews of the page', async () => {
		const t = await db({
			a: [[0, { u: '/' }], [1, { u: '/docs' }]],
			b: [[0, { u: '/docs' }], [1, { u: '/' }]],
			c: [[0, { u: '/docs' }], [1, { u: '/docs/x' }]],
		})
		const rows = (await breakdown(t, scope, 'exit_page', { limit: 10 })).rows
		expect(rows.find((r) => r.key === '/docs')?.exit_rate).toBe(33.3)
		expect(rows.find((r) => r.key === '/')?.exit_rate).toBe(50)
	})

	it('averages revenue over the events that carried it', async () => {
		const t = await db({
			a: [[0, { u: '/' }], [1, { n: 'Purchase', $: { a: 30, c: 'USD' } }]],
			b: [[0, { u: '/' }], [1, { n: 'Purchase', $: { a: 10, c: 'USD' } }], [2, { n: 'Purchase' }]],
		})
		const agg = await aggregate(t, { ...scope, filters: [{ dim: 'event', op: '==', values: ['Purchase'] }] })
		expect(agg.revenue).toBe(40)
		expect(agg.average_revenue).toBe(20)
		const ev = await breakdown(t, scope, 'event', { totalVisitors: 2 })
		expect(ev.rows[0]).toMatchObject({ key: 'Purchase', events: 3, average_revenue: 20, conversion_rate: 100 })
	})

	it('runs sequential, strict and flexible funnels per visitor', async () => {
		const t = await db({
			// in order, with a detour: sequential and flexible only
			a: [[0, { u: '/' }], [1, { u: '/blog' }], [2, { u: '/pricing' }], [3, { u: '/signup' }]],
			// strictly in order
			b: [[0, { u: '/' }], [1, { u: '/pricing' }], [2, { u: '/signup' }]],
			// skips the middle step: flexible only
			c: [[0, { u: '/' }], [1, { u: '/signup' }]],
			// across two visits on the same day: still one visitor's funnel
			d: [[0, { u: '/' }], [1, { u: '/pricing' }], [60, { u: '/signup' }]],
		})
		const steps = [
			{ kind: 'page' as const, match: '/' },
			{ kind: 'page' as const, match: '/pricing' },
			{ kind: 'page' as const, match: '/signup' },
		]
		const visitors = async (mode: 'sequential' | 'strict' | 'flexible') => (await funnel(t, scope, steps, mode)).steps.map((s) => s.visitors)
		expect(await visitors('sequential')).toEqual([4, 3, 3])
		expect(await visitors('strict')).toEqual([4, 2, 2])
		expect(await visitors('flexible')).toEqual([4, 3, 4])
	})

	it('resolves the 28d, 6mo and all-time periods', () => {
		const since = NOW - 400 * DAY
		expect(resolvePeriod('28d', 0, NOW).from).toBe(Date.UTC(2026, 8, 25))
		expect(resolvePeriod('6mo', 0, NOW).from).toBe(Date.UTC(2026, 4, 1))
		const all = resolvePeriod('all', 0, NOW, { since })
		expect(all.from).toBe(Date.UTC(2025, 8, 17))
		expect(all.interval).toBe('month')
	})
})

describe('properties report', () => {
	it('lists every custom property as key: value', async () => {
		const t = await db({
			a: [[0, { u: '/', p: { plan: 'pro' } }], [1, { n: 'Signup', p: { plan: 'pro', seats: 3 } }]],
			b: [[0, { u: '/' }], [1, { n: 'Signup', p: { plan: 'free' } }]],
		})
		const rows = (await breakdown(t, scope, 'props')).rows.map((r) => [r.key, r.visitors])
		expect(rows).toEqual([['plan: pro', 1], ['plan: free', 1], ['seats: 3', 1]])
	})
})

describe('journeys', () => {
	it('follows paths forward and backward, folding reloads', async () => {
		const t = await db({
			a: [[0, { u: '/' }], [1, { u: '/' }], [2, { u: '/pricing' }], [3, { u: '/signup' }]],
			b: [[0, { u: '/' }], [1, { u: '/pricing' }]],
			c: [[0, { u: '/blog' }], [1, { u: '/pricing' }], [2, { u: '/signup' }]],
		})
		const start = await journeys(t, scope)
		expect(start.steps.map((s) => [s.key, s.visitors])).toEqual([['/', 2], ['/blog', 1]])
		const next = await journeys(t, scope, { path: ['/', '/pricing'] })
		expect(next.visitors).toBe(2)
		expect(next.steps.map((s) => [s.key, s.visitors])).toEqual([['(exit)', 1], ['/signup', 1]])
		const before = await journeys(t, scope, { path: ['/pricing', '/signup'], direction: 'backward' })
		expect(before.steps.map((s) => [s.key, s.visitors])).toEqual([['/', 1], ['/blog', 1]])
	})

	it('lists where visits end, folding a reload at the end and counting each visitor once', async () => {
		const t = await db({
			// ends on /signup
			a: [[0, { u: '/' }], [1, { u: '/pricing' }], [2, { u: '/signup' }]],
			// a reload of the last page folds into it: ends on /pricing
			b: [[0, { u: '/' }], [1, { u: '/pricing' }], [2, { u: '/pricing' }]],
			// back to where it started: ends on /
			c: [[0, { u: '/' }], [1, { u: '/blog' }], [2, { u: '/' }]],
			// one page only
			d: [[0, { u: '/blog' }]],
			// events after the last page don't move the exit
			e: [[0, { u: '/' }], [1, { u: '/pricing' }], [2, { n: 'Signup' }]],
			// two visits (an hour apart, past the 30-minute gap) that both end on /pricing: one visitor
			f: [[0, { u: '/' }], [1, { u: '/pricing' }], [61, { u: '/pricing' }]],
		})
		const end = await journeys(t, scope, { direction: 'backward' })
		// shares of 6 visitors: 3/6 = 50, 1/6 = 16.7
		expect(end).toEqual({
			direction: 'backward',
			path: [],
			visitors: 6,
			steps: [
				{ key: '/pricing', visitors: 3, share: 50 },
				{ key: '/', visitors: 1, share: 16.7 },
				{ key: '/blog', visitors: 1, share: 16.7 },
				{ key: '/signup', visitors: 1, share: 16.7 },
			],
		})
	})
})
