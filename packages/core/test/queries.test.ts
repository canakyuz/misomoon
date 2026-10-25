import { beforeAll, describe, expect, it } from 'vite-plus/test'
import { aggregate, aggregateMany, assignSessions, breakdown, buildEvent, DAY, demoTraffic, funnel, HOUR, MINUTE, openSessionsStmt, realtime, timeseries, vitals, type DemoHit, type EventRow, type OpenSession, type Runner, type Scope, type Target, type TrackerPayload } from '../src'
import { ingest, runner, shardDb } from './helpers'

const NOW = Date.UTC(2026, 9, 22, 18, 0)
const scope: Scope = { siteId: 'demo', filters: [], tz: 0 }
const whole = { from: NOW - 40 * DAY, to: NOW + DAY }

describe('queries over demo traffic', () => {
	const one = shardDb()
	const a = shardDb()
	const b = shardDb()
	let single: Target[]
	let split: Target[]

	beforeAll(async () => {
		const hits = demoTraffic('demo', 'misomoon.com', { days: 20, now: NOW, perDay: 40 })
		await ingest(one, hits)
		// The same traffic split across two shards at a day boundary.
		const cut = Math.floor((NOW - 10 * DAY) / DAY) * DAY
		await ingest(a, hits.filter((h) => h.ts < cut))
		await ingest(b, hits.filter((h) => h.ts >= cut))
		single = [{ run: runner(one), window: whole }]
		split = [
			{ run: runner(a), window: { from: whole.from, to: cut } },
			{ run: runner(b), window: { from: cut, to: whole.to } },
		]
	})

	it('computes several scopes in one round trip per shard, matching aggregate', async () => {
		const scopes = [scope, { ...scope, filters: [{ dim: 'event', op: '==' as const, values: ['Signup'] }] }, { ...scope, filters: [{ dim: 'page', op: '==' as const, values: ['/pricing'] }] }]
		let calls = 0
		const counted = split.map((t) => ({ ...t, run: (async (stmts) => (calls++, t.run(stmts))) as Runner }))
		const many = await aggregateMany(counted, scopes)
		expect(calls).toBe(2)
		expect(many).toEqual(await Promise.all(scopes.map((s) => aggregate(split, s))))
	})

	it('gives the same answer from two shards as from one', async () => {
		expect(await aggregate(split, scope)).toEqual(await aggregate(single, scope))
		const s1 = await breakdown(single, scope, 'source', { limit: 50 })
		const s2 = await breakdown(split, scope, 'source', { limit: 50 })
		expect(s2.rows).toEqual(s1.rows)
	})

	it('filters by session and event dimensions', async () => {
		const all = await aggregate(single, scope)
		const us = await aggregate(single, { ...scope, filters: [{ dim: 'country', op: '==', values: ['US'] }] })
		const notUs = await aggregate(single, { ...scope, filters: [{ dim: 'country', op: '!=', values: ['US'] }] })
		expect(us.visits + notUs.visits).toBe(all.visits)
		const blog = await aggregate(single, { ...scope, filters: [{ dim: 'page', op: '==', values: ['/blog/*'] }] })
		expect(blog.visits).toBeGreaterThan(0)
		expect(blog.visits).toBeLessThan(all.visits)
		const entry = await breakdown(single, { ...scope, filters: [{ dim: 'entry_page', op: '==', values: ['/'] }] }, 'entry_page')
		expect(entry.rows.map((r) => r.key)).toEqual(['/'])
	})

	it('breaks down custom events and properties', async () => {
		const total = (await aggregate(single, scope)).visitors
		const ev = await breakdown(single, scope, 'event', { totalVisitors: total })
		expect(ev.rows.map((r) => r.key)).toContain('Signup')
		expect(ev.rows.find((r) => r.key === 'Purchase')?.revenue).toBeGreaterThan(0)
		const plans = await breakdown(single, { ...scope, filters: [{ dim: 'event', op: '==', values: ['Signup'] }] }, 'prop:plan')
		expect(plans.rows.map((r) => r.key).sort()).toEqual(['free', 'pro', 'team'])
	})

	it('summarises web vitals', async () => {
		const v = await vitals(single, scope)
		const lcp = v.find((x) => x.name === 'lcp')!
		expect(lcp.samples).toBeGreaterThan(100)
		expect(lcp.p75).toBeGreaterThan(900)
		expect(lcp.good + lcp.needs_improvement + lcp.poor).toBe(lcp.samples)
	})

	it('counts funnels in order and merges across shards', async () => {
		const steps = [
			{ kind: 'page' as const, match: '/pricing' },
			{ kind: 'page' as const, match: '/signup' },
			{ kind: 'event' as const, match: 'Signup' },
		]
		const f1 = await funnel(single, scope, steps)
		const f2 = await funnel(split, scope, steps)
		expect(f1.steps[0].visitors).toBeGreaterThan(f1.steps[1].visitors)
		expect(f1.steps[1].visitors).toBeGreaterThan(f1.steps[2].visitors)
		expect(f2.steps.map((s) => s.visitors)).toEqual(f1.steps.map((s) => s.visitors))
	})

	it('reports realtime activity', async () => {
		const rt = await realtime(single, scope, NOW)
		expect(rt.minutes).toHaveLength(31)
		expect(rt.feed.length).toBeLessThanOrEqual(40)
	})
})

describe('shard and session edge cases', () => {
	it('merges page breakdowns the same whichever shard answers first', async () => {
		// shard A holds only the engagement for /x (time on page), shard B its pageview
		const fake = (data: Record<string, unknown>[][], delay: number): Target['run'] => async (stmts) => {
			await new Promise((r) => setTimeout(r, delay))
			return stmts.map((_, i) => data[i] ?? [])
		}
		const A = [[], [{ key: '/x', page_ms: 12_000, page_n: 1 }]]
		const B = [[{ key: '/x', visitors: 1, pageviews: 1 }]]
		const w = { from: whole.from, to: whole.to }
		const aFirst = await breakdown([{ run: fake(A, 0), window: w }, { run: fake(B, 20), window: w }], scope, 'page')
		const bFirst = await breakdown([{ run: fake(A, 20), window: w }, { run: fake(B, 0), window: w }], scope, 'page')
		expect(aFirst.rows).toEqual(bFirst.rows)
		expect(aFirst.rows[0].time_on_page).toBe(12)
	})
})

describe('queue retries', () => {
	it('ignores a replayed batch', async () => {
		const db = shardDb()
		const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
		const rows = [0, 1, 2].map((i) => {
			const r = buildEvent({ s: 'demo', n: 'pageview', u: `https://misomoon.com/${i}` }, { ua, ip: '203.0.113.9' }, NOW + i * 60_000) as EventRow
			r.visitor_id = 'v1'
			return r
		})
		const write = async () => {
			const [open] = await runner(db)([openSessionsStmt('demo', ['v1'], NOW)])
			const { stmts } = assignSessions(structuredClone(rows), open as unknown as OpenSession[])
			for (const s of stmts) db.prepare(s.sql).run(...(s.params as never[]))
		}
		await write()
		await write()
		const w = { from: NOW - DAY, to: NOW + DAY }
		const agg = await aggregate([{ run: runner(db), window: w }], scope)
		expect(agg).toMatchObject({ visits: 1, pageviews: 3 })
		expect(db.prepare('SELECT pageviews FROM sessions').get()).toEqual({ pageviews: 3 })
	})
})

// ---------------------------------------------------------------- small fixtures

const UA = 'Mozilla/5.0 (Macintosh) Chrome/141.0.0.0 Safari/537.36'
function hit(ts: number, payload: Partial<TrackerPayload> & { path?: string } = {}, edge: Partial<DemoHit['edge']> = {}): DemoHit {
	const { path = '/', ...rest } = payload
	return { ts, edge: { ua: UA, ip: '10.0.0.1', ...edge }, payload: { s: 'x', n: 'pageview', u: `https://x.com${path}`, ...rest } }
}
const xs: Scope = { siteId: 'x', filters: [], tz: 0 }
const W = Date.UTC(2026, 9, 22, 12)

describe('filter edge cases', () => {
	it('"is not (none)" keeps only rows with a value (F5)', async () => {
		const db = shardDb()
		await ingest(db, [hit(W, {}, { ip: '10.0.0.1', country: 'US' }), hit(W, {}, { ip: '10.0.0.2' }), hit(W, {}, { ip: '10.0.0.3' })])
		const t = [{ run: runner(db), window: { from: W - HOUR, to: W + HOUR } }]
		const not = await aggregate(t, { ...xs, filters: [{ dim: 'country', op: '!=', values: ['(none)'] }] })
		const is = await aggregate(t, { ...xs, filters: [{ dim: 'country', op: '==', values: ['(none)'] }] })
		const notBoth = await aggregate(t, { ...xs, filters: [{ dim: 'country', op: '!=', values: ['US', '(none)'] }] })
		expect([not.visits, is.visits, notBoth.visits]).toEqual([1, 2, 0])
	})

	it('an entry page filter keeps a long visit that started hours before the window (F15)', async () => {
		const db = shardDb()
		// one visit with a pageview every 20 minutes from W-2h to W+20m
		const start = W - 2 * HOUR
		await ingest(db, Array.from({ length: 8 }, (_, k) => hit(start + k * 20 * MINUTE, { path: k === 0 ? '/' : `/p${k}` })))
		const t = [{ run: runner(db), window: { from: W, to: W + HOUR } }]
		const agg = await aggregate(t, { ...xs, filters: [{ dim: 'entry_page', op: '==', values: ['/'] }] })
		expect(agg.pageviews).toBe(2)
	})

	it('an entry page filter keeps a visit that started before 00:00 UTC', async () => {
		const db = shardDb()
		const midnight = Date.UTC(2026, 9, 23)
		// lands on / at 23:40 and reads on past midnight, when the visitor id changes
		for (let k = 0; k < 4; k++) {
			const h = hit(midnight - 20 * MINUTE + k * 20 * MINUTE, { path: k === 0 ? '/' : `/p${k}` })
			const row = { ...(buildEvent(h.payload, h.edge, h.ts) as EventRow), visitor_id: k === 0 ? 'old' : 'new', ...(k === 0 ? {} : { prev_visitor_id: 'old' }) }
			const [open] = await runner(db)([openSessionsStmt('x', ['old', 'new'], row.ts)])
			for (const st of assignSessions([row], open as unknown as OpenSession[]).stmts) db.prepare(st.sql).run(...(st.params as never[]))
		}
		expect(db.prepare('SELECT COUNT(*) AS n FROM sessions').get()).toEqual({ n: 1 })
		const t = [{ run: runner(db), window: { from: midnight, to: midnight + DAY } }]
		const agg = await aggregate(t, { ...xs, filters: [{ dim: 'entry_page', op: '==', values: ['/'] }] })
		expect(agg.pageviews).toBe(3)
	})

	it('an event filter sees events more than 30 minutes after the window (F15)', async () => {
		const db = shardDb()
		// a visit starts at W, stays alive, and signs up at W+100m
		await ingest(db, [...Array.from({ length: 6 }, (_, k) => hit(W + k * 20 * MINUTE)), hit(W + 100 * MINUTE + 1000, { n: 'Signup' })])
		const t = [{ run: runner(db), window: { from: W, to: W + HOUR } }]
		const agg = await aggregate(t, { ...xs, filters: [{ dim: 'event', op: '==', values: ['Signup'] }] })
		expect(agg.visits).toBe(1)
	})
})

describe('breakdown merging and paging', () => {
	const fake = (results: Record<string, unknown>[][], delay = 0): Runner => async () => {
		if (delay) await new Promise((r) => setTimeout(r, delay))
		return results
	}

	it('merges page engagement from every shard whichever answers first (F16)', async () => {
		const w = { from: 0, to: DAY }
		const targets = [
			// shard A answers first and has engagement for /x but no pageviews in its range
			{ run: fake([[], [{ key: '/x', page_ms: 4000, page_n: 1, scroll: 50, scroll_n: 1 }], []]), window: w },
			{ run: fake([[{ key: '/x', visitors: 1, pageviews: 2 }], [{ key: '/x', page_ms: 2000, page_n: 1, scroll: 30, scroll_n: 1 }], []], 5), window: w },
		]
		const b = await breakdown(targets, xs, 'page')
		// (4000 + 2000) ms over 2 visits = 3 s; scroll (50 + 30) / 2 = 40
		expect(b.rows.map((r) => [r.key, r.time_on_page, r.scroll_depth])).toEqual([['/x', 3, 40]])
	})

	it('says has_more only while rows remain, even at the row cap', async () => {
		const rows = Array.from({ length: 500 }, (_, i) => ({ key: `k${String(i).padStart(3, '0')}`, visitors: 1000 - i, visits: 1000 - i }))
		const t = [{ run: fake([rows]), window: { from: 0, to: DAY } }]
		const p2 = await breakdown(t, xs, 'source', { limit: 200, page: 2 })
		const p3 = await breakdown(t, xs, 'source', { limit: 200, page: 3 })
		expect([p2.rows.length, p2.has_more, p3.rows.length, p3.has_more]).toEqual([200, true, 100, false])
	})

	it('searches every key, not only the top 500', async () => {
		const db = shardDb()
		const hits: DemoHit[] = []
		for (let i = 0; i < 505; i++) for (const ip of ['10.1.0.1', '10.1.0.2']) hits.push(hit(W + i, { path: `/p${i}` }, { ip }))
		hits.push(hit(W + 600, { path: '/special' }, { ip: '10.2.0.1' }))
		await ingest(db, hits)
		const t = [{ run: runner(db), window: { from: W - HOUR, to: W + HOUR } }]
		const b = await breakdown(t, xs, 'page', { search: 'SPECIAL' })
		expect(b.rows.map((r) => [r.key, r.visitors, r.pageviews])).toEqual([['/special', 1, 1]])
		expect(b.has_more).toBe(false)
	})
})

describe('vitals, realtime and revenue', () => {
	it('reports a CLS p75 above 1.0 (F20)', async () => {
		const db = shardDb()
		await ingest(db, [hit(W, { y: 0.25 }), hit(W + 1000, { n: 'engagement', y: 0.25, e: 1000, v: { cls: 1.5 } })])
		const v = await vitals([{ run: runner(db), window: { from: W - HOUR, to: W + HOUR } }], xs)
		const cls = v.find((x) => x.name === 'cls')!
		expect(cls.p75).toBeGreaterThan(1.4)
		expect(cls.p75).toBeLessThan(1.6)
	})

	it('ends the realtime minutes at the current minute, not the next one', async () => {
		const db = shardDb()
		const now = W + 30 * 1000
		await ingest(db, [hit(W)])
		const rt = await realtime([{ run: runner(db), window: { from: now - DAY, to: now + DAY } }], xs, now)
		expect(rt.minutes).toHaveLength(31)
		expect(rt.minutes.at(-1)).toEqual({ t: W, pageviews: 1, visitors: 1 })
	})

	it("sums revenue in the site's currency only, counting events without one (F10)", async () => {
		const db = shardDb()
		await ingest(db, [
			hit(W, { n: 'Purchase', $: { a: 19, c: 'USD' } }, { ip: '10.0.0.1' }),
			hit(W, { n: 'Purchase', $: { a: 50, c: 'EUR' } }, { ip: '10.0.0.2' }),
			hit(W, { n: 'Purchase', $: { a: 5 } }, { ip: '10.0.0.3' }),
		])
		const t = [{ run: runner(db), window: { from: W - HOUR, to: W + HOUR } }]
		const usd = { ...xs, currency: 'USD' }
		expect((await aggregate(t, usd)).revenue).toBe(24)
		expect((await breakdown(t, usd, 'event')).rows.map((r) => [r.key, r.revenue])).toEqual([['Purchase', 24]])
		expect((await timeseries(t, usd, { from: W - HOUR, to: W + HOUR }, 'hour')).reduce((s, p) => s + p.revenue, 0)).toBe(24)
	})
})
