import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

// A D1 stand-in on node:sqlite, close enough for the Worker's own code paths:
// prepare/bind/first/all/run and batch (one transaction, like D1).

const migrations = (dir: string) => {
	const path = fileURLToPath(new URL(`../migrations/${dir}/`, import.meta.url))
	return readdirSync(path)
		.filter((f) => f.endsWith('.sql'))
		.sort()
		.map((f) => readFileSync(path + f, 'utf8'))
		.join('\n')
}

class FakeStatement {
	constructor(
		private db: DatabaseSync,
		readonly sql: string,
		readonly params: unknown[] = [],
	) {}
	bind(...params: unknown[]) {
		// D1 refuses a statement with more than 100 bound parameters
		if (params.length > 100) throw new Error('D1_ERROR: too many SQL variables')
		return new FakeStatement(this.db, this.sql, params)
	}
	private stmt() {
		return this.db.prepare(this.sql)
	}
	async first<T>(col?: string): Promise<T | null> {
		const row = this.stmt().get(...(this.params as never[])) as Record<string, unknown> | undefined
		if (!row) return null
		return (col ? row[col] : row) as T
	}
	async all<T>() {
		return { results: this.stmt().all(...(this.params as never[])) as T[], success: true, meta: {} }
	}
	async run() {
		const r = this.stmt().run(...(this.params as never[]))
		return { results: [], success: true, meta: { changes: Number(r.changes), size_after: 0 } }
	}
	/** One statement of a batch, with `changes` in meta as D1 reports it for writes. */
	exec() {
		const st = this.stmt()
		if (st.columns().length) return { results: st.all(...(this.params as never[])), success: true, meta: { changes: 0 } }
		const r = st.run(...(this.params as never[]))
		return { results: [], success: true, meta: { changes: Number(r.changes) } }
	}
}

export class FakeD1 {
	readonly db = new DatabaseSync(':memory:')
	/** set to make every call fail, like an unavailable database */
	broken: Error | null = null
	constructor(schema: string) {
		this.db.exec('PRAGMA foreign_keys = ON')
		this.db.exec(schema)
	}
	prepare(sql: string) {
		if (this.broken) throw this.broken
		return new FakeStatement(this.db, sql)
	}
	async batch(stmts: FakeStatement[]) {
		if (this.broken) throw this.broken
		this.db.exec('BEGIN')
		try {
			const out = stmts.map((s) => s.exec())
			this.db.exec('COMMIT')
			return out
		} catch (e) {
			this.db.exec('ROLLBACK')
			throw e
		}
	}
	/** D1 read sessions: one database here, so the session is the database itself */
	withSession() {
		return this
	}
	rows(sql: string, ...params: unknown[]) {
		return this.db.prepare(sql).all(...(params as never[]))
	}
}

export interface FakeEnv {
	CONTROL: FakeD1
	SHARD_0: FakeD1
	SHARD_1: FakeD1
	EVENTS?: { send: (body: unknown, opts?: unknown) => Promise<void> }
	ASSETS: { fetch: (req: Request) => Promise<Response> }
	DEMO_SITE: string
	SAMPLE_SITE?: string
	SHARD_SOFT_LIMIT_MB: string
	RETENTION_DAYS: string
	RETENTION_DEFAULT_DAYS: string
	PLANS?: string
	SIGNUPS?: 'open' | 'invite' | 'closed'
	PROXY_CNAME_TARGET?: string
	CF_API_TOKEN?: string
	CF_ZONE_ID?: string
	INGEST_DAILY_CAP?: string
	EMAIL_FROM?: string
	EMAIL_PROVIDER?: string
	EMAIL?: { send: (message: unknown) => Promise<{ messageId: string }> }
	BROWSER?: { quickAction: (action: string, options: unknown) => Promise<Response> }
	AWS_SES_REGION?: string
	AWS_SES_ACCESS_KEY_ID?: string
	AWS_SES_SECRET_ACCESS_KEY?: string
	GOOGLE_CLIENT_ID?: string
	GOOGLE_CLIENT_SECRET?: string
}

/** A signed-in browser session of the owner of team `t1`, which every fake env has. */
export const OWNER_TOKEN = 'ms_owner-session'
export const OWNER = { authorization: `Bearer ${OWNER_TOKEN}` }

function withOwner(db: FakeD1): FakeD1 {
	const hash = createHash('sha256').update(OWNER_TOKEN).digest('hex')
	db.db.exec(`INSERT INTO users (id, email, name, password_hash, created_at) VALUES ('u1', 'owner@test', 'Owner', 'x', 0);
		INSERT INTO teams (id, name, created_at) VALUES ('t1', 'Team', 0);
		INSERT INTO team_members (team_id, user_id, role, created_at) VALUES ('t1', 'u1', 'owner', 0);
		INSERT INTO sessions (hash, user_id, expires_at, created_at) VALUES ('${hash}', 'u1', 9e15, 0);`)
	return db
}

export function fakeEnv(over: Partial<FakeEnv> = {}): FakeEnv {
	const control = migrations('control')
	const shard = migrations('shard')
	return {
		CONTROL: withOwner(new FakeD1(control)),
		SHARD_0: new FakeD1(shard),
		SHARD_1: new FakeD1(shard),
		ASSETS: { fetch: async () => new Response('<!doctype html>dashboard', { headers: { 'content-type': 'text/html' } }) },
		DEMO_SITE: 'demo',
		SHARD_SOFT_LIMIT_MB: '8000',
		RETENTION_DAYS: '0',
		RETENTION_DEFAULT_DAYS: '',
		...over,
	}
}

/** An empty, migrated shard database, to bind under another name such as SHARD_EU_0. */
export const freshShard = () => new FakeD1(migrations('shard'))

/** An ExecutionContext that keeps what was handed to waitUntil. */
export function fakeCtx() {
	const promises: Promise<unknown>[] = []
	return {
		promises,
		waitUntil: (p: Promise<unknown>) => void promises.push(p),
		passThroughOnException: () => {},
		props: {},
		settle: () => Promise.allSettled(promises),
	}
}
