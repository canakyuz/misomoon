// A D1 stand-in on node:sqlite for the tests: prepare, bind, first, all, run and batch
// (one transaction, like D1), with the schema from migrations/.
import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

const dir = new URL('../../../migrations/', import.meta.url)
const schema = () =>
	readdirSync(dir)
		.filter((f) => f.endsWith('.sql'))
		.sort()
		.map((f) => readFileSync(new URL(f, dir), 'utf8'))
		.join('\n')

class Statement {
	constructor(
		private db: DatabaseSync,
		readonly sql: string,
		readonly params: unknown[] = [],
	) {}
	bind(...params: unknown[]) {
		if (params.length > 100) throw new Error('D1_ERROR: too many SQL variables')
		return new Statement(this.db, this.sql, params)
	}
	async first<T>(col?: string): Promise<T | null> {
		const row = this.db.prepare(this.sql).get(...(this.params as never[])) as Record<string, unknown> | undefined
		if (!row) return null
		return (col ? row[col] : row) as T
	}
	async all<T>() {
		return { results: this.db.prepare(this.sql).all(...(this.params as never[])) as T[], success: true, meta: {} }
	}
	async run() {
		return this.exec()
	}
	exec() {
		const st = this.db.prepare(this.sql)
		if (st.columns().length) return { results: st.all(...(this.params as never[])), success: true, meta: { changes: 0 } }
		const r = st.run(...(this.params as never[]))
		return { results: [], success: true, meta: { changes: Number(r.changes) } }
	}
}

export class FakeD1 {
	readonly db = new DatabaseSync(':memory:')
	constructor() {
		this.db.exec('PRAGMA foreign_keys = ON')
		this.db.exec(schema())
	}
	prepare(sql: string) {
		return new Statement(this.db, sql)
	}
	async batch(statements: Statement[]) {
		this.db.exec('BEGIN')
		try {
			const out = statements.map((s) => s.exec())
			this.db.exec('COMMIT')
			return out
		} catch (e) {
			this.db.exec('ROLLBACK')
			throw e
		}
	}
}

export const fakeD1 = () => new FakeD1() as unknown as D1Database
