import { describe, expect, it } from 'vite-plus/test'
import { assignSessions, buildEvent, DAY, eventWhere, HOUR, OPEN_SESSIONS_CHUNK, openSessionsStmt, pingStmts, SAMPLE, sampleTraffic, storedVisitsStmt, type EventRow, type Stmt, type TrackerPayload } from '../src'
import { ingest, shardDb } from './helpers'

// D1 bills every index entry a write touches as one more written row, at 1,000 times the
// price of a row read. An index on `events` or `sessions` has to earn that: add it here
// with the query that needs it, and its write cost in docs/ARCHITECTURE.md (Sharding).
const INTENDED: Record<string, string[]> = {
	// unique: a replayed event inserts nothing; payments and the ingest cap find an event by id
	events_event_id: ['event_id'],
	// every report, retention purge and shard move reads a site's events by time
	events_site_ts: ['site_id', 'ts'],
	// reports, retention and shard moves read a site's visits by start time
	sessions_site_started: ['site_id', 'started_at'],
	// openSessionsStmt; no last_at, which every event moves, so a visit update writes no index entry
	sessions_site_visitor: ['site_id', 'visitor_id'],
	sessions_site_next_visitor: ['site_id', 'next_visitor_id'],
}

describe('shard indexes', () => {
	it('are only the intended ones on events and sessions', () => {
		const db = shardDb()
		const indexes = db.prepare("SELECT name FROM sqlite_schema WHERE type = 'index' AND tbl_name IN ('events', 'sessions') AND sql IS NOT NULL ORDER BY name").all() as { name: string }[]
		const found = Object.fromEntries(indexes.map(({ name }) => [name, (db.prepare(`PRAGMA index_info(${name})`).all() as { name: string }[]).map((c) => c.name)]))
		expect(found).toEqual(INTENDED)
	})
})

describe('entry and exit page filters', () => {
	it('read only the visits that can reach the window, not every visit of the site', () => {
		const db = shardDb()
		const p: unknown[] = []
		const where = eventWhere({ siteId: 'acme', filters: [{ dim: 'entry_page', op: '==', values: ['/'] }], tz: 0 }, { from: Date.UTC(2026, 9, 22), to: Date.UTC(2026, 9, 23) }, p)
		const plan = (db.prepare(`EXPLAIN QUERY PLAN SELECT COUNT(*) FROM events e WHERE ${where}`).all(...(p as never[])) as { detail: string }[]).map((r) => r.detail)
		expect(plan).toContain('SEARCH s2 USING INDEX sessions_site_started (site_id=? AND started_at>? AND started_at<?)')
	})
})

describe('the statements every tracked event runs', () => {
	const NOW = Date.UTC(2026, 9, 22, 18)
	const edge = { ua: 'Mozilla/5.0 (Macintosh) Chrome/141.0.0.0 Safari/537.36', ip: '10.0.0.1' }
	// every table it reads is a seek; the other SCANs are of the one-row results of its subqueries
	const searches = (db: ReturnType<typeof shardDb>, s: Stmt) => {
		const plan = (db.prepare(`EXPLAIN QUERY PLAN ${s.sql}`).all(...(s.params as never[])) as { detail: string }[]).map((r) => r.detail)
		expect(plan.filter((d) => /^SCAN (events|sessions|s|e)\b/.test(d))).toEqual([])
		return plan.filter((d) => d.startsWith('SEARCH '))
	}
	const row = (p: Partial<TrackerPayload>) => ({ ...(buildEvent({ s: 'acme', u: 'https://acme.example/', y: 0.25, ...p } as TrackerPayload, edge, NOW) as EventRow), visitor_id: 'v1', session_id: 's1', prev_visitor_id: 'v0' })

	it('find the open visit through the visitor indexes, and the visit by its key', () => {
		const db = shardDb()
		const [insert, upsert] = assignSessions([row({ n: 'pageview' })], []).stmts
		expect(searches(db, insert)).toEqual([
			'SEARCH sessions USING INDEX sessions_site_visitor (site_id=? AND visitor_id=?)',
			'SEARCH sessions USING INDEX sessions_site_next_visitor (site_id=? AND next_visitor_id=?)',
			'SEARCH sessions USING INDEX sessions_site_visitor (site_id=? AND visitor_id=?)',
			'SEARCH sessions USING INDEX sessions_site_next_visitor (site_id=? AND next_visitor_id=?)',
			'SEARCH s USING PRIMARY KEY (site_id=? AND session_id=?) LEFT-JOIN',
		])
		expect(searches(db, upsert)).toEqual(['SEARCH e USING INDEX events_event_id (event_id=?)'])
	})

	it('read back the visits of stored events by their ids, not by the site', () => {
		expect(searches(shardDb(), storedVisitsStmt('acme', ['a', 'b', 'c']))).toEqual(['SEARCH events USING INDEX events_event_id (event_id=?)'])
	})

	it('reach an engagement beacon’s visit by its key or the visitor indexes, and its pageview by event id', () => {
		const db = shardDb()
		const [visit, view] = pingStmts(row({ n: 'engagement', e: 1000 }))
		expect(searches(db, visit)).toEqual([
			'SEARCH sessions USING PRIMARY KEY (site_id=? AND session_id=?)',
			// the visit assignSessions found, by its key
			'SEARCH sessions USING PRIMARY KEY (site_id=? AND session_id=?)',
			'SEARCH sessions USING INDEX sessions_site_visitor (site_id=? AND visitor_id=?)',
			'SEARCH sessions USING INDEX sessions_site_next_visitor (site_id=? AND next_visitor_id=?)',
			'SEARCH sessions USING INDEX sessions_site_visitor (site_id=? AND visitor_id=?)',
			'SEARCH sessions USING INDEX sessions_site_next_visitor (site_id=? AND next_visitor_id=?)',
			'SEARCH events USING INDEX events_event_id (event_id=?)',
		])
		expect(searches(db, view)).toEqual(['SEARCH events USING INDEX events_event_id (event_id=?)'])
	})
})

describe('open visits lookup', () => {
	const NOW = Date.UTC(2026, 9, 22, 18)
	const plan = (db: ReturnType<typeof shardDb>, ids: number) =>
		(db.prepare(`EXPLAIN QUERY PLAN ${openSessionsStmt('acme', Array.from({ length: ids }, (_, i) => `v${i}`), NOW).sql}`).all() as { detail: string }[]).map((r) => r.detail)

	it('seeks the visitor indexes for one id and for a full chunk', () => {
		const db = shardDb()
		for (const ids of [1, 2, OPEN_SESSIONS_CHUNK]) {
			const searches = plan(db, ids).filter((d) => /^(SEARCH|SCAN) /.test(d))
			expect(searches).toEqual([
				'SEARCH sessions USING INDEX sessions_site_visitor (site_id=? AND visitor_id=?)',
				'SEARCH sessions USING INDEX sessions_site_next_visitor (site_id=? AND next_visitor_id=?)',
			])
		}
	})

	it('finds the same visits as the statement without index hints', async () => {
		const db = shardDb()
		await ingest(db, sampleTraffic('acme', SAMPLE.domain, NOW - 3 * HOUR, NOW))
		// visits that ran past 00:00 UTC carry a second id; give some of them one
		db.exec("UPDATE sessions SET next_visitor_id = 'n' || visitor_id WHERE substr(session_id, 1, 1) IN ('0', '1', '2', '3', '4')")
		// the latest visits, so some are still open at NOW and some have timed out
		const visits = db.prepare('SELECT visitor_id, next_visitor_id FROM sessions ORDER BY last_at DESC').all() as { visitor_id: string; next_visitor_id: string | null }[]
		const ids = [...new Set(visits.flatMap((v) => [v.visitor_id, v.next_visitor_id ?? 'none']))].slice(0, OPEN_SESSIONS_CHUNK)
		expect(visits.filter((v) => v.next_visitor_id && ids.includes(v.next_visitor_id)).length).toBeGreaterThan(0)

		const run = (sql: string, params: unknown[]) => (db.prepare(sql).all(...(params as never[])) as { session_id: string }[]).map((r) => JSON.stringify(r)).sort()
		for (const before of [NOW, NOW - HOUR, NOW + DAY]) {
			const stmt = openSessionsStmt('acme', ids, before)
			const hinted = run(stmt.sql, stmt.params)
			expect(hinted).toEqual(run(stmt.sql.replace(/ INDEXED BY \w+/g, ''), stmt.params))
			if (before === NOW) expect(hinted.length).toBeGreaterThan(5)
		}
	})
})
