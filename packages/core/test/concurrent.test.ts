import { describe, expect, it } from 'vite-plus/test'
import { assignSessions, buildEvent, MINUTE, openSessionsStmt, type EdgeContext, type EventRow, type OpenSession, type Stmt, type TrackerPayload } from '../src'
import { runner, shardDb } from './helpers'

// Two queue consumers can run at once when the queue backs up. Each plans its batch from
// the visits it read, and D1 runs each batch's writes as one transaction, one after the
// other. So both can read before either writes: the writes must still find one visit.

const NOON = Date.UTC(2026, 9, 22, 12)
const edge: EdgeContext = { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36', ip: '10.0.0.1' }
const KEY = 0.3141592653589793

type Db = ReturnType<typeof shardDb>

function beacon(ts: number, p: Partial<TrackerPayload>, visitor = 'v1'): EventRow {
	const row = buildEvent({ s: 'shop', u: 'https://shop.com/', ...p } as TrackerPayload, edge, ts)
	if (typeof row === 'string') throw new Error(`rejected: ${row}`)
	return { ...row, visitor_id: visitor }
}
const view = (ts: number, p: Partial<TrackerPayload> = {}, visitor?: string) => beacon(ts, { n: 'pageview', ...p }, visitor)

/** What one consumer does before it writes: read the open visits, and plan the batch from them. */
async function plan(db: Db, rows: EventRow[]): Promise<Stmt[]> {
	const ids = [...new Set(rows.flatMap((r) => (r.prev_visitor_id ? [r.visitor_id, r.prev_visitor_id] : [r.visitor_id])))]
	const [open] = await runner(db)([openSessionsStmt('shop', ids, Math.min(...rows.map((r) => r.ts)))])
	return assignSessions(structuredClone(rows), open as unknown as OpenSession[]).stmts
}

/** One consumer's writes: one D1 batch, a transaction. */
function commit(db: Db, stmts: Stmt[]) {
	db.exec('BEGIN')
	for (const s of stmts) db.prepare(s.sql).run(...(s.params as never[]))
	db.exec('COMMIT')
}

const visits = (db: Db) => db.prepare('SELECT entry_path, exit_path, pageviews, engaged_ms, duration_ms, source FROM sessions').all()
const sessionsOfEvents = (db: Db) => new Set(db.prepare('SELECT session_id FROM events').all().map((r) => (r as { session_id: string }).session_id))

describe('one consumer, batch after batch', () => {
	it("credit a page's engagement to the visitor's open visit when another tab opened it", async () => {
		const db = shardDb()
		const A = 0.111
		const B = 0.222
		for (const batch of [
			[view(NOON, { y: A, u: 'https://shop.com/a' })],
			// tab B, 40 minutes on: the first visit has ended, so this opens a second
			[view(NOON + 40 * MINUTE, { y: B, u: 'https://shop.com/b' })],
			// back in tab A, whose page's visit has ended
			[beacon(NOON + 45 * MINUTE, { n: 'engagement', y: A, e: 120_000, d: 90, v: { lcp: 900 } })],
			[beacon(NOON + 70 * MINUTE, { n: 'engagement', y: A, e: 600_000, d: 100 })],
			[view(NOON + 95 * MINUTE, { y: 0.333, u: 'https://shop.com/c' })],
		])
			commit(db, await plan(db, batch))
		// the beacons kept the second visit open, so /c is in it
		expect(db.prepare('SELECT entry_path, exit_path, pageviews, engaged_ms FROM sessions ORDER BY started_at').all()).toEqual([
			{ entry_path: '/a', exit_path: '/a', pageviews: 1, engaged_ms: 0 },
			{ entry_path: '/b', exit_path: '/c', pageviews: 2, engaged_ms: 720_000 },
		])
		expect(db.prepare("SELECT engaged_ms, scroll_depth, lcp FROM events WHERE pathname = '/a'").get()).toEqual({ engaged_ms: 720_000, scroll_depth: 100, lcp: 900 })
	})
})

describe('two consumers writing the same visitor at once', () => {
	it('keep the landing page as the entry and source of the visit when the later batch commits first', async () => {
		const db = shardDb()
		const a = await plan(db, [view(NOON, { u: 'https://shop.com/?utm_campaign=fall', r: 'https://www.google.com/' })])
		const b = await plan(db, [view(NOON + MINUTE, { u: 'https://shop.com/pricing' })])
		commit(db, b)
		commit(db, a)
		expect(db.prepare('SELECT entry_path, exit_path, started_at, pageviews, duration_ms, source, utm_campaign FROM sessions').all()).toEqual([
			{ entry_path: '/', exit_path: '/pricing', started_at: NOON, pageviews: 2, duration_ms: MINUTE, source: 'Google', utm_campaign: 'fall' },
		])
		expect(db.prepare("SELECT source, utm_campaign FROM events WHERE pathname = '/'").get()).toEqual({ source: 'Google', utm_campaign: 'fall' })
	})

	it('keep one visit when both read before either writes', async () => {
		const db = shardDb()
		const a = await plan(db, [view(NOON, { u: 'https://shop.com/', r: 'https://www.google.com/' })])
		const b = await plan(db, [view(NOON + MINUTE, { u: 'https://shop.com/pricing' })])
		commit(db, a)
		commit(db, b)
		expect(visits(db)).toEqual([{ entry_path: '/', exit_path: '/pricing', pageviews: 2, engaged_ms: 0, duration_ms: MINUTE, source: 'Google' }])
		expect(sessionsOfEvents(db).size).toBe(1)
		// the second page view takes the visit's source, as it would one batch later
		expect(db.prepare('SELECT pathname, source, channel FROM events ORDER BY ts').all()).toEqual([
			{ pathname: '/', source: 'Google', channel: 'Organic Search' },
			{ pathname: '/pricing', source: 'Google', channel: 'Organic Search' },
		])
	})

	it('keep one visit when the later batch commits first', async () => {
		const db = shardDb()
		const a = await plan(db, [view(NOON)])
		const b = await plan(db, [view(NOON + MINUTE, { u: 'https://shop.com/pricing' })])
		commit(db, b)
		commit(db, a)
		expect(db.prepare('SELECT pageviews FROM sessions').all()).toEqual([{ pageviews: 2 }])
		expect(sessionsOfEvents(db).size).toBe(1)
	})

	it('keep one visit for every event of each batch', async () => {
		const db = shardDb()
		const a = await plan(db, [view(NOON), view(NOON + 2 * MINUTE, { u: 'https://shop.com/a' })])
		const b = await plan(db, [view(NOON + MINUTE, { u: 'https://shop.com/b' }), view(NOON + 3 * MINUTE, { u: 'https://shop.com/c' })])
		commit(db, a)
		commit(db, b)
		expect(db.prepare('SELECT pageviews, exit_path, duration_ms FROM sessions').all()).toEqual([{ pageviews: 4, exit_path: '/c', duration_ms: 3 * MINUTE }])
		expect(sessionsOfEvents(db).size).toBe(1)
	})

	it('still give two visitors a visit each', async () => {
		const db = shardDb()
		const a = await plan(db, [view(NOON, {}, 'v1')])
		const b = await plan(db, [view(NOON + MINUTE, {}, 'v2')])
		commit(db, a)
		commit(db, b)
		expect(db.prepare('SELECT pageviews FROM sessions').all()).toEqual([{ pageviews: 1 }, { pageviews: 1 }])
	})

	it('add an engagement beacon to its pageview, written by the other consumer', async () => {
		const db = shardDb()
		const a = await plan(db, [view(NOON, { y: KEY })])
		const b = await plan(db, [beacon(NOON + 10_000, { n: 'engagement', y: KEY, e: 5000, d: 40 })])
		commit(db, a)
		commit(db, b)
		expect(db.prepare('SELECT engaged_ms, scroll_depth FROM events').all()).toEqual([{ engaged_ms: 5000, scroll_depth: 40 }])
		expect(db.prepare('SELECT last_at, engaged_ms, duration_ms FROM sessions').all()).toEqual([{ last_at: NOON + 10_000, engaged_ms: 5000, duration_ms: 0 }])
	})
})
