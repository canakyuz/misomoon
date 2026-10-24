import { beforeAll, describe, expect, it } from 'vite-plus/test'
import { aggregate, breakdown, buildEvent, clickMap, contentReport, DAY, errorReport, eventDetail, formReport, mediaReport, MINUTE, scrollMap, siteSearch, vitals, type DemoHit, type EdgeContext, type Scope, type Target, type TrackerPayload } from '../src'
import { ingest, runner, shardDb } from './helpers'

const NOW = Date.UTC(2026, 9, 22, 18, 0)
const scope: Scope = { siteId: 'shop', filters: [], tz: 0 }
const whole = { from: NOW - 10 * DAY, to: NOW + DAY }
const chrome = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
const safari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1'

const edge = (ip: string, ua = chrome): EdgeContext => ({ ua, ip, country: 'US' })

let views = 0
/** One visit: a pageview of `path`, then one engagement beacon per entry of `beacons`, all with the view's key. */
function visit(ip: string, ts: number, path: string, beacons: Partial<TrackerPayload>[], opts: { ua?: string; query?: string } = {}): DemoHit[] {
	const u = `https://shop.com${path}${opts.query ?? ''}`
	const e = edge(ip, opts.ua)
	const y = (++views + 0.5) / 1000
	const out: DemoHit[] = [{ ts, edge: e, payload: { s: 'shop', n: 'pageview', u, ts, y, ...(opts.query?.startsWith('?q=') ? { q: decodeURIComponent(opts.query.slice(3)) } : {}) } }]
	beacons.forEach((b, i) => {
		const t = ts + (i + 1) * 10_000
		out.push({ ts: t, edge: e, payload: { s: 'shop', n: 'engagement', u, e: 5000, ts: t, y, ...b } })
	})
	return out
}

const day = (d: number) => NOW - d * DAY

// Day 3: two visitors on /pricing. Day 1: one more, with a rage and a dead click.
const hits: DemoHit[] = [
	...visit('10.0.0.1', day(3), '/pricing', [
		{ d: 40, c: [['body>main>a:nth-of-type(2)', 'Start trial', 1, 0, 0]], x: [['TypeError: x is undefined', 'https://shop.com/app.js?v=3:10:5', 2]], v: { lcp: 2100, inp: 180, cls: 0.05 } },
		// the same page view, after the tab came back: more clicks, deeper scroll
		{ d: 90, c: [['body>main>a:nth-of-type(2)', 'Start trial', 1, 0, 0], ['#plans>button', 'Yearly', 2, 0, 0]] },
	]),
	...visit('10.0.0.2', day(3) + 5 * MINUTE, '/pricing', [{ d: 100, c: [['#plans>button', 'Yearly', 1, 0, 0]] }], { ua: safari }),
	...visit('10.0.0.3', day(1), '/pricing', [{ d: 20, c: [['#plans>button', 'Yearly', 4, 1, 3]], x: [['TypeError: x is undefined', 'https://shop.com/app.js?v=4:10:5', 1]], v: { lcp: 3200 } }]),
	...visit('10.0.0.4', day(1) + MINUTE, '/docs', [{ d: 55, c: [['h1', 'Docs', 1, 0, 1]] }]),
	// site search
	...visit('10.0.0.5', day(2), '/search', [], { query: '?q=Pricing' }),
	...visit('10.0.0.6', day(2), '/search', [], { query: '?q=pricing' }),
	...visit('10.0.0.6', day(2) + MINUTE, '/search', [], { query: '?q=refund' }),
	// forms: one started and gave up at email (after first leaving at name), one finished
	...visit('10.0.0.7', day(3), '/signup', [
		{ f: [['signup', 1, 0]], g: [['signup', 'name', 0, 1, 1]] },
		{ g: [['signup', 'name', 0, 0, -1], ['signup', 'email', 1, 1, 1]] },
	]),
	...visit('10.0.0.8', day(1), '/signup', [{ f: [['signup', 1, 1]], g: [['signup', 'name', 0, 1, 0], ['signup', 'email', 1, 1, 0], ['signup', 'plan', 2, 1, 0]] }]),
	// media and content
	...visit('10.0.0.9', day(3), '/', [
		{ m: [['Product tour', 'video', 1, 1, 1, 0, 0]], o: [['Hero banner', 1, 0]] },
		{ m: [['Product tour', 'video', 0, 0, 0, 1, 1]], o: [['Hero banner', 0, 1]] },
	]),
	...visit('10.0.0.10', day(1), '/', [{ m: [['Product tour', 'video', 1, 1, 0, 0, 0]], o: [['Hero banner', 1, 0], ['Footer CTA', 1, 0]] }]),
]

describe('page interactions', () => {
	const one = shardDb()
	const a = shardDb()
	const b = shardDb()
	let single: Target[]
	let split: Target[]

	beforeAll(async () => {
		await ingest(one, hits)
		const cut = Math.floor(day(2) / DAY) * DAY
		await ingest(a, hits.filter((h) => h.ts < cut))
		await ingest(b, hits.filter((h) => h.ts >= cut))
		single = [{ run: runner(one), window: whole }]
		split = [
			{ run: runner(a), window: { from: whole.from, to: cut } },
			{ run: runner(b), window: { from: cut, to: whole.to } },
		]
	})

	it('adds up clicks per element across beacons of one page view', async () => {
		const map = await clickMap(single, { ...scope, filters: [{ dim: 'page', op: '==', values: ['/pricing'] }] })
		expect(map.pageviews).toBe(3)
		expect(map.visitors).toBe(3)
		expect([map.clicks, map.rage, map.dead]).toEqual([9, 1, 3])
		expect(map.elements).toEqual([
			{ page: '/pricing', selector: '#plans>button', label: 'Yearly', clicks: 7, visitors: 3, rage: 1, dead: 3 },
			{ page: '/pricing', selector: 'body>main>a:nth-of-type(2)', label: 'Start trial', clicks: 2, visitors: 1, rage: 0, dead: 0 },
		])
	})

	it('gives the same answers from two shards as from one', async () => {
		expect(await clickMap(split, scope)).toEqual(await clickMap(single, scope))
		expect(await scrollMap(split, scope)).toEqual(await scrollMap(single, scope))
		expect(await errorReport(split, scope)).toEqual(await errorReport(single, scope))
		expect(await siteSearch(split, scope)).toEqual(await siteSearch(single, scope))
		expect(await formReport(split, scope)).toEqual(await formReport(single, scope))
		expect(await mediaReport(split, scope)).toEqual(await mediaReport(single, scope))
		expect(await contentReport(split, scope)).toEqual(await contentReport(single, scope))
	})

	it('filters clicks by the visit, like every other report', async () => {
		const map = await clickMap(single, { ...scope, filters: [{ dim: 'browser', op: '==', values: ['Safari'] }] })
		expect(map.elements.map((e) => [e.selector, e.clicks])).toEqual([['#plans>button', 1]])
	})

	it('counts how far each visit scrolled, in steps of 10%', async () => {
		const s = await scrollMap(single, { ...scope, filters: [{ dim: 'page', op: '==', values: ['/pricing'] }] })
		// deepest scroll per visit: 90, 100 and 20
		expect(s.visits).toBe(3)
		expect(s.average).toBe(70)
		expect(s.reached.map((r) => r.visits)).toEqual([3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 1])
		expect(s.reached[3]).toEqual({ depth: 30, visits: 2, share: 66.7 })
	})

	it('lists site search terms, folded to lower case', async () => {
		const s = await siteSearch(single, scope)
		expect(s.terms).toEqual([
			{ term: 'pricing', searches: 2, visitors: 2 },
			{ term: 'refund', searches: 1, visitors: 1 },
		])
		expect([s.searches, s.visitors]).toEqual([3, 2])
		expect(s.total_visitors).toBe(10)
	})

	// last_seen is when the page view that hit the error started: its beacons add to its row
	it('groups errors by message and source, without the query string', async () => {
		const r = await errorReport(single, scope)
		expect(r.count).toBe(3)
		expect(r.visitors).toBe(2)
		expect(r.errors).toEqual([
			{ message: 'TypeError: x is undefined', source: 'https://shop.com/app.js:10:5', count: 3, visitors: 2, last_seen: day(1), pages: ['/pricing'], browsers: ['Chrome'] },
		])
	})

	it('finds where people give up on a form, net of fields they came back from', async () => {
		const { forms } = await formReport(single, scope)
		expect(forms).toHaveLength(1)
		const f = forms[0]
		expect([f.form, f.starts, f.submissions, f.conversion, f.visitors]).toEqual(['signup', 2, 1, 50, 2])
		expect(f.fields).toEqual([
			{ field: 'name', interactions: 2, dropoffs: 0, position: 0 },
			{ field: 'email', interactions: 2, dropoffs: 1, position: 1 },
			{ field: 'plan', interactions: 1, dropoffs: 0, position: 2 },
		])
	})

	it('reports plays and how far into the media people got', async () => {
		const { media } = await mediaReport(single, scope)
		expect(media).toEqual([{ name: 'Product tour', type: 'video', plays: 2, visitors: 2, reached: [100, 50, 50, 50] }])
	})

	it('reports impressions, clicks and click-through for tagged content', async () => {
		const { content } = await contentReport(single, scope)
		expect(content).toEqual([
			{ name: 'Hero banner', impressions: 2, clicks: 1, ctr: 50, visitors: 2 },
			{ name: 'Footer CTA', impressions: 1, clicks: 0, ctr: 0, visitors: 1 },
		])
	})
})

describe('engagement on the pageview row', () => {
	// fixed event ids, so delivering a beacon again is the queue retrying the same message
	const sent = hits.map((h, i) => ({ ...h, payload: { ...h.payload, id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}` } }))
	const inOrder = shardDb()
	const replayed = shardDb()
	const shuffled = shardDb()
	const at = (db: ReturnType<typeof shardDb>): Target[] => [{ run: runner(db), window: whole }]

	beforeAll(async () => {
		await ingest(inOrder, sent)
		// everything twice: once as sent, then again after the rest, like a retried batch
		await ingest(replayed, sent)
		await ingest(replayed, sent)
		// each view's beacons in reverse order, as when a retried batch arrives behind a later one
		for (const h of sent) {
			if (h.payload.n === 'pageview') shuffledHits.push(h)
			else shuffledHits.splice(shuffledHits.findLastIndex((r) => r.payload.n === 'pageview') + 1, 0, h)
		}
		await ingest(shuffled, shuffledHits)
	})
	const shuffledHits: DemoHit[] = []

	it('stores one row per pageview and none for the beacons', () => {
		expect(inOrder.prepare('SELECT name, COUNT(*) AS n FROM events GROUP BY name').all()).toEqual([{ name: 'pageview', n: 11 }])
		for (const db of [replayed, shuffled]) expect(db.prepare('SELECT COUNT(*) AS n FROM events').get()).toEqual({ n: 11 })
		expect(shuffledHits.map((h) => h.ts)).not.toEqual(sent.map((h) => h.ts))
	})

	it('reports time on page, scroll depth and Web Vitals from the pageview rows', async () => {
		const pages = await breakdown(at(inOrder), scope, 'page', { limit: 10 })
		// /pricing: 10 s, 5 s and 5 s over three visits; deepest scrolls 90, 100 and 20
		expect(pages.rows.find((r) => r.key === '/pricing')).toMatchObject({ visitors: 3, pageviews: 3, time_on_page: 7, scroll_depth: 70 })
		// /search sent no beacon, so it has no time on page
		expect(pages.rows.find((r) => r.key === '/search')).toMatchObject({ pageviews: 3, time_on_page: 0, scroll_depth: 0 })
		const v = Object.fromEntries((await vitals(at(inOrder), scope)).map((x) => [x.name, [x.samples, x.p75, x.good, x.needs_improvement, x.poor]]))
		expect(v).toEqual({ lcp: [2, 3225, 1, 1, 0], inp: [1, 180, 1, 0, 0], cls: [1, 0.053, 1, 0, 0], fcp: [0, null, 0, 0, 0], ttfb: [0, null, 0, 0, 0] })
	})

	it('leaves visits, bounces and duration to pageviews and events', async () => {
		const agg = await aggregate(at(inOrder), scope)
		// ten visitors; one visit searched twice, the other nine bounced
		expect([agg.visitors, agg.visits, agg.pageviews, agg.bounce_rate, agg.visit_duration, agg.events]).toEqual([10, 10, 11, 90, 6, 0])
	})

	it('gives the same reports after replays and out-of-order beacons', async () => {
		for (const db of [replayed, shuffled]) {
			const t = at(db)
			const single = at(inOrder)
			expect(await aggregate(t, scope)).toEqual(await aggregate(single, scope))
			expect(await breakdown(t, scope, 'page', { limit: 10 })).toEqual(await breakdown(single, scope, 'page', { limit: 10 }))
			expect(await vitals(t, scope)).toEqual(await vitals(single, scope))
			expect(await clickMap(t, scope)).toEqual(await clickMap(single, scope))
			expect(await scrollMap(t, scope)).toEqual(await scrollMap(single, scope))
			expect(await errorReport(t, scope)).toEqual(await errorReport(single, scope))
			expect(await siteSearch(t, scope)).toEqual(await siteSearch(single, scope))
			expect(await formReport(t, scope)).toEqual(await formReport(single, scope))
			expect(await mediaReport(t, scope)).toEqual(await mediaReport(single, scope))
			expect(await contentReport(t, scope)).toEqual(await contentReport(single, scope))
		}
	})
})

describe('eventDetail', () => {
	const engagement = (p: Partial<TrackerPayload>) => JSON.parse(eventDetail({ s: 'shop', n: 'engagement', u: 'https://shop.com/', ...p }, true) ?? 'null')

	it('keeps a pageview search term, scrubbed and lower case', () => {
		expect(eventDetail({ s: 'shop', n: 'pageview', u: 'https://shop.com/?q=x', q: '  Red   Shoes ' }, false)).toBe('{"q":"red shoes"}')
		expect(eventDetail({ s: 'shop', n: 'pageview', u: 'https://shop.com/', q: 'me@example.com order 12345678' }, false)).toBe('{"q":"(email) order #"}')
		expect(eventDetail({ s: 'shop', n: 'pageview', u: 'https://shop.com/', q: '   ' }, false)).toBeNull()
	})

	it('masks links, ids and tokens in free text, as well as emails and long numbers', () => {
		const x = engagement({
			x: [['Failed https://api.shop.com/v1/me?token=abc&uid=9 for 3f2b8c1e-9d4a-4f6e-8b7c-1a2b3c4d5e6f with key sk_live_51HxQ2eKz9AbCdEfGhIjKl', 'https://shop.com/app.js?v=2:3:7', 1]],
		}).x
		expect(x).toEqual([['Failed https://api.shop.com/v1/me for (id) with key (token)', 'https://shop.com/app.js:3:7', 1]])
	})

	it("drops a script URL's whole query, a URL with colons in it too, and keeps the line and column", () => {
		const x = engagement({
			x: [
				['A', 'https://shop.com/app.js?next=https://a.example/?token=SECRET:1:2', 1],
				['B', 'https://shop.com/app.js#t=1:3:4', 1],
				['C', 'https://shop.com/app.js?v=2', 1],
			],
		}).x
		expect(x.map((e: unknown[]) => e[1])).toEqual(['https://shop.com/app.js:1:2', 'https://shop.com/app.js:3:4', 'https://shop.com/app.js'])
	})

	it('drops what it cannot trust and clamps numbers', () => {
		const d = engagement({
			c: [['#ok', 'Buy', 2.4, -1, 9e9], ['div{color:red}', 'x', 1, 0, 0], ['#zero', 'none', 0, 0, 0], 'junk'],
			x: [['', 'a.js', 1], ['Boom', { not: 'a string' }, 'many']],
			m: [['Tour', 'hologram', 1, 7, -3]],
			g: [['signup', 'email', 3, 1, -9], ['signup', '', 0, 1, 0]],
		})
		expect(d.c).toEqual([['#ok', 'Buy', 2, 0, 1000]])
		expect(d.x).toEqual([['Boom', '', 1]])
		expect(d.m).toEqual([['Tour', 'video', 1, 1, 0, 0, 0]])
		expect(d.g).toEqual([['signup', 'email', 3, 1, -1]])
	})

	it('caps list lengths so one beacon stays small', () => {
		const many = Array.from({ length: 50 }, (_, i) => [`#b${i}`, '', 1, 0, 0])
		expect(engagement({ c: many }).c).toHaveLength(30)
		expect(engagement({ x: Array.from({ length: 9 }, (_, i) => [`E${i}`, '', 1]) }).x).toHaveLength(5)
	})

	it('stores no detail for custom events, or when there is nothing to keep', () => {
		const row = buildEvent({ s: 'shop', n: 'Signup', u: 'https://shop.com/', c: [['#ok', '', 1, 0, 0]] }, edge('10.0.0.1'), NOW)
		expect(typeof row !== 'string' && row.detail).toBeNull()
		expect(engagement({ c: [], f: 'nope' as unknown as unknown[] })).toBeNull()
	})
})
