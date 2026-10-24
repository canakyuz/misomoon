import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import {
	assignSessions,
	buildEvent,
	openSessionsStmt,
	visitorId,
	type DemoHit,
	type EventRow,
	type OpenSession,
	type Runner,
} from '../src'

const dir = fileURLToPath(new URL('../../../apps/api/migrations/shard/', import.meta.url))
const schema = readdirSync(dir)
	.filter((f) => f.endsWith('.sql'))
	.sort()
	.map((f) => readFileSync(dir + f, 'utf8'))
	.join('\n')

export function shardDb() {
	const db = new DatabaseSync(':memory:')
	db.exec(schema)
	return db
}

export function runner(db: DatabaseSync): Runner {
	return async (stmts) => stmts.map((s) => db.prepare(s.sql).all(...(s.params as never[])) as Record<string, unknown>[])
}

/** The same path the queue consumer takes, against node:sqlite. */
export async function ingest(db: DatabaseSync, hits: DemoHit[], salt = 'salt') {
	const run = runner(db)
	let kept = 0
	for (const h of hits) {
		const row = buildEvent(h.payload, h.edge, h.ts)
		if (typeof row === 'string') continue
		row.visitor_id = await visitorId(salt + Math.floor(row.ts / 86400000), row.site_id, h.edge.ip, h.edge.ua)
		const [open] = await run([openSessionsStmt(row.site_id, [row.visitor_id], row.ts)])
		const { rows, stmts } = assignSessions([row as EventRow], open as unknown as OpenSession[])
		for (const s of stmts) db.prepare(s.sql).run(...(s.params as never[]))
		kept += rows.length
	}
	return kept
}
