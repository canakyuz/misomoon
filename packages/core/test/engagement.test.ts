import { describe, expect, it } from 'vite-plus/test'
import { assignSessions, buildEvent, DAY, MAX_DETAIL, MAX_PINGS, MINUTE, openSessionsStmt, viewEventId, type EdgeContext, type EventRow, type OpenSession, type TrackerPayload } from '../src'
import { runner, shardDb } from './helpers'

// An engagement beacon is never a row: it adds its time, scroll depth, Web Vitals and
// interactions to the row of the pageview its view key names (pingStmts in src/ingest.ts).

const NOON = Date.UTC(2026, 9, 22, 12)
const edge: EdgeContext = { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36', ip: '10.0.0.1' }
const KEY = 0.3141592653589793

type Db = ReturnType<typeof shardDb>

/** A beacon as the queue consumer gets it: built at the edge, with the visitor's id. */
function beacon(ts: number, p: Partial<TrackerPayload>, visitor = 'v1'): EventRow {
	const row = buildEvent({ s: 'shop', u: 'https://shop.com/pricing', ...p } as TrackerPayload, edge, ts)
	if (typeof row === 'string') throw new Error(`rejected: ${row}`)
	return { ...row, visitor_id: visitor }
}
const view = (ts: number, p: Partial<TrackerPayload> = {}, visitor?: string) => beacon(ts, { n: 'pageview', y: KEY, ...p }, visitor)
const ping = (ts: number, p: Partial<TrackerPayload> = {}, visitor?: string) => beacon(ts, { n: 'engagement', y: KEY, e: 5000, ...p }, visitor)

/**
 * One queue batch through assignSessions, written in chunks of `chunk` statements the way
 * writeEvents writes them, each chunk a transaction. `fail` stops after that many chunks,
 * like a consumer that dies part way; the queue then delivers the whole batch again.
 */
async function write(db: Db, rows: EventRow[], opts: { chunk?: number; fail?: number } = {}) {
	const ids = [...new Set(rows.flatMap((r) => (r.prev_visitor_id ? [r.visitor_id, r.prev_visitor_id] : [r.visitor_id])))]
	const [open] = await runner(db)([openSessionsStmt('shop', ids, Math.min(...rows.map((r) => r.ts)))])
	const { stmts } = assignSessions(structuredClone(rows), open as unknown as OpenSession[])
	const chunk = opts.chunk ?? 200
	for (let i = 0, n = 0; i < stmts.length; i += chunk, n++) {
		if (opts.fail !== undefined && n >= opts.fail) throw new Error('consumer died')
		db.exec('BEGIN')
		for (const s of stmts.slice(i, i + chunk)) db.prepare(s.sql).run(...(s.params as never[]))
		db.exec('COMMIT')
	}
	return stmts.length
}

const events = (db: Db) => db.prepare('SELECT name, engaged_ms, scroll_depth, lcp, cls, detail, pings FROM events ORDER BY ts').all()
const visits = (db: Db) => db.prepare('SELECT visitor_id, next_visitor_id, last_at, pageviews, engaged_ms, duration_ms FROM sessions ORDER BY started_at').all()
const detail = (db: Db) => JSON.parse((db.prepare("SELECT detail FROM events WHERE name = 'pageview'").get() as { detail: string }).detail)

describe('the view key', () => {
	it('names the event id a pageview is stored under, per site', () => {
		expect(view(NOON).event_id).toBe(viewEventId('shop', KEY))
		expect(viewEventId('shop', KEY)).toBe(`shop:${Math.round(KEY * 2 ** 53).toString(36)}`)
		expect(viewEventId('shop', KEY)).not.toBe(viewEventId('shoe', KEY))
		// the SDKs send a string, kept as it is
		expect(viewEventId('shop', '0F8E6A52-3C1D-4B2A-9E7F-5D4C3B2A1908')).toBe('shop:0f8e6a52-3c1d-4b2a-9e7f-5d4c3b2a1908')
		// a pageview without a usable key gets a random id, as before
		for (const y of [undefined, 0, 1, -0.5, 1.5, Number.NaN, 'short-key', 'has a space in it, sixteen+', 'x'.repeat(65)]) {
			expect(viewEventId('shop', y)).toBeNull()
			expect(view(NOON, { y } as Partial<TrackerPayload>).event_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/)
		}
	})

	it('keeps the id of a resent SDK pageview, since the key comes again', () => {
		const y = '3f2b8c1e-9d4a-4f6e-8b7c-1a2b3c4d5e6f'
		expect(view(NOON, { y, id: '0f8e6a52-3c1d-4b2a-9e7f-5d4c3b2a1908' }).event_id).toBe(view(NOON + 5000, { y, id: 'a1b2c3d4-0000-4000-8000-00000000000f' }).event_id)
	})

	it('drops an engagement beacon that names no page view, so no custom event can be called engagement', () => {
		const built = (p: Partial<TrackerPayload>) => {
			const r = buildEvent({ s: 'shop', u: 'https://shop.com/', ...p } as TrackerPayload, edge, NOON)
			return typeof r === 'string' ? r : r.ref_only ? 'refs' : r.view ? 'adds to its view' : r.name
		}
		expect([
			built({ e: 4000, y: KEY }),
			built({ n: 'engagement', e: 4000, y: KEY }),
			// m.js sends misomoon('engagement') with the view key but no time
			built({ n: 'engagement', y: KEY, p: {} }),
			built({ e: 4000 }),
			built({ n: 'engagement', e: 4000, y: 'short' }),
			// a beacon that only hands out a payment ref needs no view (the server SDKs send these)
			built({ n: 'engagement', e: 0, k: 'ref_abcdef' }),
			built({ n: 'engagement', e: 0, k: 'ref_abcdef', y: KEY }),
		]).toEqual(['adds to its view', 'adds to its view', 'invalid', 'invalid', 'invalid', 'refs', 'refs'])
	})
})

describe('engagement beacons', () => {
	it('add their time, scroll, Web Vitals and interactions to the pageview row', async () => {
		const db = shardDb()
		await write(db, [view(NOON, { q: 'Tents' })])
		await write(db, [ping(NOON + 10_000, { e: 4000, d: 30, v: { lcp: 1200, cls: 0.02 }, c: [['#buy', 'Buy', 1, 0, 0]] })])
		await write(db, [ping(NOON + 60_000, { e: 6000, d: 80.4, c: [['#buy', 'Buy', 2, 1, 0]], x: [['TypeError: x', 'https://shop.com/a.js:1:2', 1]] })])
		const [row] = events(db) as Record<string, unknown>[]
		expect(events(db)).toHaveLength(1)
		expect({ ...row, detail: undefined, pings: undefined }).toEqual({ name: 'pageview', engaged_ms: 10_000, scroll_depth: 80, lcp: 1200, cls: 0.02, detail: undefined, pings: undefined })
		// the pageview's own search term stays; each list is the beacons' lists, in arrival order
		expect(detail(db)).toEqual({ q: 'tents', c: [['#buy', 'Buy', 1, 0, 0], ['#buy', 'Buy', 2, 1, 0]], x: [['TypeError: x', 'https://shop.com/a.js:1:2', 1]] })
		expect(String(row.pings)).toMatch(/^([0-9a-z]{7} ){2}$/)
		// the visit gets the time, and stays open until the last beacon, which doesn't stretch its duration
		expect(visits(db)).toEqual([{ visitor_id: 'v1', next_visitor_id: null, last_at: NOON + 60_000, pageviews: 1, engaged_ms: 10_000, duration_ms: 0 }])
	})

	it('each count once, though their ids share a prefix', async () => {
		const db = shardDb()
		await write(db, [view(NOON)])
		// UUIDv7 ids sent within a minute start with the same timestamp
		const ids = ['019a0b1c-2d3e-7f40-8a1b-2c3d4e5f6071', '019a0b1c-2d3e-7f40-8a1b-2c3d4e5f6072', '019a0b1c-2d3f-7000-9000-000000000000']
		for (const [i, id] of ids.entries()) await write(db, [ping(NOON + (i + 1) * 1000, { id, e: 1000 })])
		await write(db, [ping(NOON + 1000, { id: ids[0], e: 1000 })])
		expect(events(db)).toMatchObject([{ engaged_ms: 3000 }])
	})

	it('keep the deepest scroll and Web Vitals a later beacon leaves out', async () => {
		const db = shardDb()
		await write(db, [view(NOON), ping(NOON + 1000, { d: 70, v: { lcp: 900 } }), ping(NOON + 2000, { d: 40 }), ping(NOON + 3000, {})])
		expect(events(db)).toMatchObject([{ engaged_ms: 15_000, scroll_depth: 70, lcp: 900 }])
	})

	it('add nothing twice when a batch is delivered again after a partial commit', async () => {
		const batch = [view(NOON, { q: 'tents' }), ping(NOON + 1000, { d: 30, c: [['#a', 'A', 1, 0, 0]] }), ping(NOON + 2000, { d: 60, c: [['#b', 'B', 1, 0, 0]] })]
		const once = shardDb()
		await write(once, batch)
		// every cut a consumer can die at: after the pageview's pair, after the first beacon's pair
		for (const fail of [1, 2]) {
			const db = shardDb()
			await expect(write(db, batch, { chunk: 2, fail })).rejects.toThrow('consumer died')
			await write(db, batch, { chunk: 2 })
			await write(db, batch)
			expect(events(db)).toEqual(events(once))
			expect(visits(db)).toEqual(visits(once))
		}
		expect(events(once)).toMatchObject([{ engaged_ms: 10_000, scroll_depth: 60 }])
		expect(visits(once)).toMatchObject([{ engaged_ms: 10_000, last_at: NOON + 2000 }])
	})

	it('add up the same in any order, so a batch retried after a later one loses nothing', async () => {
		const pings = [
			ping(NOON + 1000, { e: 3000, d: 20, v: { lcp: 1500 }, c: [['#a', 'A', 1, 0, 0]], g: [['signup', 'email', 0, 1, 1]] }),
			ping(NOON + 2000, { e: 4000, d: 90, c: [['#a', 'A', 2, 0, 0]], g: [['signup', 'email', 0, 0, -1]] }),
			ping(NOON + 3000, { e: 5000, d: 50, x: [['Boom', '', 1]] }),
		]
		const sorted = (db: Db) => {
			const d = detail(db)
			return { ...(events(db)[0] as object), detail: undefined, pings: undefined, lists: Object.fromEntries(Object.entries(d).map(([k, v]) => [k, (v as unknown[]).map((e) => JSON.stringify(e)).sort()])) }
		}
		const inOrder = shardDb()
		await write(inOrder, [view(NOON)])
		for (const p of pings) await write(inOrder, [p])
		const reversed = shardDb()
		await write(reversed, [view(NOON)])
		for (const p of [...pings].reverse()) await write(reversed, [p])
		expect(sorted(reversed)).toEqual(sorted(inOrder))
		expect(sorted(inOrder)).toMatchObject({ engaged_ms: 12_000, scroll_depth: 90, lcp: 1500 })
		expect(visits(reversed)).toEqual(visits(inOrder))
	})

	it('find their pageview written in the same batch, even one stamped a moment later', async () => {
		const db = shardDb()
		await write(db, [view(NOON, { y: 0.5 })])
		// a second view of the visit, and its first beacon reaching another isolate a few ms "earlier"
		await write(db, [ping(NOON + 59_995, { e: 2000 }), view(NOON + 60_000)])
		expect(db.prepare('SELECT engaged_ms FROM events ORDER BY ts').all()).toEqual([{ engaged_ms: null }, { engaged_ms: 2000 }])
	})

	it('are dropped when their pageview is not on the shard, without touching the visit', async () => {
		const db = shardDb()
		// the visit is open, but this view's pageview was dropped by the cap, or is on another shard
		await write(db, [view(NOON, { y: 0.5 })])
		await write(db, [ping(NOON + 10_000, { e: 9000, d: 50 })])
		expect(events(db)).toMatchObject([{ name: 'pageview', engaged_ms: null, pings: null }])
		expect(visits(db)).toMatchObject([{ last_at: NOON, engaged_ms: 0 }])
	})

	it('are dropped once their visit has timed out, as any late event would open a new one', async () => {
		const db = shardDb()
		await write(db, [view(NOON)])
		await write(db, [ping(NOON + 31 * MINUTE, { e: 60_000 })])
		expect(events(db)).toMatchObject([{ engaged_ms: null, pings: null }])
		expect(visits(db)).toMatchObject([{ last_at: NOON, engaged_ms: 0 }])
	})

	it('keep a visit open across 00:00 UTC and teach it the visitor’s new id', async () => {
		const db = shardDb()
		const midnight = Math.floor(NOON / DAY) * DAY + DAY
		await write(db, [view(midnight - 10 * MINUTE, {}, 'old')])
		// after 00:00 UTC the beacon carries today's id, and yesterday's for the first half hour
		await write(db, [{ ...ping(midnight + 10 * MINUTE, { e: 7000 }, 'new'), prev_visitor_id: 'old' }])
		// past the half hour, the visit is only found under its new id
		await write(db, [view(midnight + 35 * MINUTE, { y: 0.75, u: 'https://shop.com/docs' }, 'new')])
		expect(events(db)).toMatchObject([{ engaged_ms: 7000 }, { engaged_ms: null }])
		expect(visits(db)).toEqual([{ visitor_id: 'old', next_visitor_id: 'new', last_at: midnight + 35 * MINUTE, pageviews: 2, engaged_ms: 7000, duration_ms: 45 * MINUTE }])
	})

	it('stop adding interactions past MAX_DETAIL, and stop counting past MAX_PINGS', async () => {
		const db = shardDb()
		await write(db, [view(NOON)])
		const clicks = Array.from({ length: 30 }, (_, i) => [`#b${i}${'x'.repeat(250)}`, 'Button', 1, 0, 0])
		const big = Array.from({ length: 30 }, (_, i) => ping(NOON + i, { e: 1, c: clicks }))
		await write(db, big)
		const row = db.prepare('SELECT length(detail) AS size, engaged_ms FROM events').get() as { size: number; engaged_ms: number }
		expect(row.size).toBeLessThanOrEqual(MAX_DETAIL)
		expect(row.size).toBeGreaterThan(MAX_DETAIL / 2)
		expect(row.engaged_ms).toBe(30)
		const many = Array.from({ length: MAX_PINGS }, (_, i) => ping(NOON + 1000 + i, { e: 1 }))
		await write(db, many)
		expect(db.prepare('SELECT engaged_ms, length(pings) / 8 AS pings FROM events').get()).toEqual({ engaged_ms: MAX_PINGS, pings: MAX_PINGS })
		expect(db.prepare('SELECT engaged_ms FROM sessions').get()).toEqual({ engaged_ms: MAX_PINGS })
	})

	it('cost two row updates each, and find the pageview through its event id', async () => {
		const db = shardDb()
		await write(db, [view(NOON)])
		const changes = () => (db.prepare('SELECT total_changes() AS n').get() as { n: number }).n
		const before = changes()
		await write(db, [ping(NOON + 1000, { d: 40, v: { lcp: 800 }, c: [['#a', 'A', 1, 0, 0]] })])
		expect(changes() - before).toBe(2)
		const plan = (db.prepare(`EXPLAIN QUERY PLAN UPDATE events SET engaged_ms = 1 WHERE event_id = ? AND site_id = 'shop'`).all('x') as { detail: string }[]).map((r) => r.detail)
		expect(plan).toEqual(['SEARCH events USING INDEX events_event_id (event_id=?)'])
	})
})
