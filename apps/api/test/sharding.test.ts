// Sharding under load and failure: the daily cleanup's query count, a shard that fails or
// is retiring, routing a day before 1970, a site with nowhere to go, and retiring shards.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { DAY, utcDay } from '@misomoon/core'
import { getRanges, getShards, invalidate, shardLimit, writeShard } from '../src/control'
import { moveTargets, retireShards } from '../src/moves'
import { FakeD1, fakeCtx, fakeEnv, freshShard, OWNER, type FakeEnv } from './fake'

vi.mock('@misomoon/tracker/m.min.js', () => ({ default: '/* m.js */' }))
const { default: worker } = await import('../src/index')

const NOON = Date.UTC(2026, 9, 22, 12)
const UA = 'Mozilla/5.0 (Macintosh) Chrome/141.0.0.0 Safari/537.36'

beforeEach(() => invalidate(''))
afterEach(() => vi.useRealTimers())

/** Counts the queries a database is sent, D1's way: a batch is one. */
function countQueries(db: FakeD1) {
	const count = { n: 0 }
	const wrap = <T extends object>(st: T): T =>
		new Proxy(st, {
			get(target, prop, receiver) {
				const v = Reflect.get(target, prop, receiver)
				if (prop === 'bind') return (...p: unknown[]) => wrap((v as (...a: unknown[]) => object).apply(target, p))
				if (prop === 'run' || prop === 'first' || prop === 'all') count.n++
				return typeof v === 'function' ? v.bind(target) : v
			},
		})
	const prepare = db.prepare.bind(db)
	const batch = db.batch.bind(db)
	db.prepare = (sql: string) => wrap(prepare(sql))
	db.batch = (stmts) => {
		count.n++
		return batch(stmts)
	}
	return count
}

const addSite = (env: FakeEnv, id: string, region: string | null = null) =>
	env.CONTROL.db.prepare("INSERT INTO sites (id, domain, name, timezone, currency, team_id, public, region, created_at) VALUES (?, ?, ?, 'UTC', 'USD', 't1', 0, ?, 0)").run(id, `${id}.com`, id, region)

const addEvent = (db: FakeD1, site: string, id: string, ts: number) =>
	db.db.prepare("INSERT INTO events (event_id, site_id, ts, name, visitor_id, session_id) VALUES (?, ?, ?, 'pageview', 'v', ?)").run(id, site, ts, `s-${id}`)

const addVisit = (db: FakeD1, site: string, id: string, ts: number) =>
	db.db.prepare('INSERT INTO sessions (site_id, session_id, visitor_id, started_at, last_at) VALUES (?, ?, ?, ?, ?)').run(site, id, 'v', ts, ts)

const count = (db: FakeD1, sql: string, ...params: unknown[]) => (db.rows(sql, ...params)[0] as { n: number }).n

async function runCron(env: FakeEnv) {
	const ctx = fakeCtx()
	await worker.scheduled({} as ScheduledController, env as unknown as Env, ctx as unknown as ExecutionContext)
	return ctx.settle()
}

describe('daily cleanup', () => {
	it('deletes old rows of many sites on every shard in a few queries per shard', async () => {
		vi.useFakeTimers({ toFake: ['Date'] })
		vi.setSystemTime(NOON)
		const env = fakeEnv({ RETENTION_DAYS: '1' })
		for (let i = 0; i < 150; i++) {
			addSite(env, `site-${i}`)
			for (const db of [env.SHARD_0, env.SHARD_1]) {
				addEvent(db, `site-${i}`, `old-${i}`, NOON - 3 * DAY)
				addEvent(db, `site-${i}`, `new-${i}`, NOON - DAY / 2)
				addVisit(db, `site-${i}`, `old-${i}`, NOON - 3 * DAY)
			}
		}
		await getShards(env as unknown as Env)
		const queries = [countQueries(env.SHARD_0), countQueries(env.SHARD_1)]
		const results = await runCron(env)
		expect(results.map((r) => r.status)).toEqual(results.map(() => 'fulfilled'))
		for (const db of [env.SHARD_0, env.SHARD_1]) {
			expect([count(db, 'SELECT COUNT(*) AS n FROM events'), count(db, "SELECT COUNT(*) AS n FROM events WHERE event_id LIKE 'new-%'"), count(db, 'SELECT COUNT(*) AS n FROM sessions')]).toEqual([150, 150, 0])
		}
		// 2 queries per site and shard before: 301 on each
		for (const q of queries) expect(q.n).toBeLessThanOrEqual(10)
	})

	it('works through a backlog bigger than one delete', async () => {
		vi.useFakeTimers({ toFake: ['Date'] })
		vi.setSystemTime(NOON)
		const env = fakeEnv({ RETENTION_DAYS: '1' })
		addSite(env, 'big')
		for (let i = 0; i < 12_000; i++) addEvent(env.SHARD_1, 'big', `old-${i}`, NOON - 3 * DAY)
		addEvent(env.SHARD_1, 'big', 'new', NOON)
		await runCron(env)
		expect(env.SHARD_1.rows('SELECT event_id FROM events')).toEqual([{ event_id: 'new' }])
	})

	it('records size and drains a shard whose cleanup fails', async () => {
		vi.useFakeTimers({ toFake: ['Date'] })
		vi.setSystemTime(NOON)
		const env = fakeEnv({ RETENTION_DAYS: '1' })
		addSite(env, 'shop')
		addEvent(env.SHARD_0, 'shop', 'old', NOON - 3 * DAY)
		await getShards(env as unknown as Env)
		const full = 9000 * 1024 * 1024
		const prepare = env.SHARD_0.prepare.bind(env.SHARD_0)
		env.SHARD_0.prepare = (sql: string) => {
			const st = prepare(sql)
			if (sql.startsWith('DELETE')) {
				const fail = async () => Promise.reject(new Error('D1_ERROR: shard is busy'))
				const bind = st.bind.bind(st)
				st.run = fail
				st.bind = (...p: unknown[]) => Object.assign(bind(...p), { run: fail })
			}
			if (sql === 'SELECT 1') st.run = async () => ({ results: [], success: true, meta: { changes: 0, size_after: full } })
			return st
		}
		env.SHARD_0.batch = async () => Promise.reject(new Error('D1_ERROR: shard is busy'))
		await runCron(env)
		expect(env.CONTROL.rows("SELECT status, size_bytes FROM shards WHERE name = 'shard_0'")).toEqual([{ status: 'draining', size_bytes: full }])
	})

	it('leaves a retiring shard retiring when it is past the soft limit', async () => {
		vi.useFakeTimers({ toFake: ['Date'] })
		vi.setSystemTime(NOON)
		const env = fakeEnv()
		// this isolate cached shard_1 as active; another one has since marked it retiring
		await getShards(env as unknown as Env)
		env.CONTROL.db.exec("UPDATE shards SET status = 'retiring' WHERE name = 'shard_1'")
		const prepare = env.SHARD_1.prepare.bind(env.SHARD_1)
		env.SHARD_1.prepare = (sql: string) => {
			const st = prepare(sql)
			if (sql === 'SELECT 1') st.run = async () => ({ results: [], success: true, meta: { changes: 0, size_after: 9000 * 1024 * 1024 } })
			return st
		}
		await runCron(env)
		expect(env.CONTROL.rows("SELECT status FROM shards WHERE name = 'shard_1'")).toEqual([{ status: 'retiring' }])
	})
})

describe('routing', () => {
	it('keeps one open range when a day before 1970 is written', async () => {
		vi.useFakeTimers({ toFake: ['Date'] })
		vi.setSystemTime(NOON)
		const env = fakeEnv()
		addSite(env, 'shop')
		const e = env as unknown as Env
		await writeShard(e, 'shop', NOON)
		await writeShard(e, 'shop', Date.UTC(1969, 11, 31))
		const ranges = await getRanges(e, 'shop')
		expect(ranges.filter((r) => r.to_day == null)).toHaveLength(1)
		expect(ranges.map((r) => r.from_day)).toEqual([0])
	})

	it('falls back to 8,000 MB when SHARD_SOFT_LIMIT_MB is not a positive number', () => {
		for (const bad of ['abc', '0', '-5', ' ']) expect(shardLimit(fakeEnv({ SHARD_SOFT_LIMIT_MB: bad }) as unknown as Env)).toBe(8000 * 1024 * 1024)
		expect(shardLimit(fakeEnv({ SHARD_SOFT_LIMIT_MB: '500' }) as unknown as Env)).toBe(500 * 1024 * 1024)
	})
})

describe('queue', () => {
	it('writes the other sites of a batch when one site has no shard to go to', async () => {
		vi.useFakeTimers({ toFake: ['Date'] })
		vi.setSystemTime(NOON)
		const env = fakeEnv()
		const sent: unknown[] = []
		env.EVENTS = { send: async (body) => void sent.push(body) }
		for (const domain of ['shop.com', 'blog.com']) {
			const ctx = fakeCtx()
			const res = await worker.fetch(new Request('https://app.test/api/v1/sites', { method: 'POST', headers: { 'content-type': 'application/json', ...OWNER }, body: JSON.stringify({ domain }) }), env as unknown as Env, ctx as unknown as ExecutionContext)
			await ctx.settle()
			expect(res.status).toBe(201)
		}
		for (const s of ['shop-com', 'blog-com']) {
			const ctx = fakeCtx()
			const res = await worker.fetch(new Request('https://app.test/api/event', { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': UA }, body: JSON.stringify({ s, n: 'pageview', u: `https://${s.replace('-', '.')}/` }) }), env as unknown as Env, ctx as unknown as ExecutionContext)
			await ctx.settle()
			expect(res.status).toBe(202)
		}
		// the blog keeps its data in a region this server no longer has a shard in
		env.CONTROL.db.exec("UPDATE sites SET region = 'eu' WHERE id = 'blog-com'")
		invalidate('')
		const out = { ackAll: 0, retryAll: 0, acked: [] as number[], retried: [] as number[] }
		const messages = sent.map((body, i) => ({ body, ack: () => void out.acked.push(i), retry: () => void out.retried.push(i) }))
		await worker.queue!({ messages, ackAll: () => void out.ackAll++, retryAll: () => void out.retryAll++ } as unknown as MessageBatch<never>, env as unknown as Env, fakeCtx() as unknown as ExecutionContext)
		expect(out).toEqual({ ackAll: 0, retryAll: 0, acked: [0], retried: [1] })
		expect(count(env.SHARD_0, 'SELECT COUNT(*) AS n FROM events') + count(env.SHARD_1, 'SELECT COUNT(*) AS n FROM events')).toBe(1)
	})
})

describe('queue retries', () => {
	it('waits longer after each failed attempt, up to an hour', async () => {
		vi.useFakeTimers({ toFake: ['Date'] })
		vi.setSystemTime(NOON)
		const env = fakeEnv()
		env.SHARD_0.broken = env.SHARD_1.broken = new Error('D1_ERROR: shard is busy')
		addSite(env, 'shop')
		const body = (id: string) => ({ event_id: id, site_id: 'shop', ts: NOON, name: 'pageview', visitor_id: 'v', session_id: '' })
		const delays: unknown[] = []
		const messages = [1, 4, 12].map((attempts, i) => ({ body: body(`e${i}`), attempts, ack: () => {}, retry: (o: unknown) => void delays.push(o) }))
		await worker.queue!({ messages, ackAll: () => {}, retryAll: (o: unknown) => void delays.push(['all', o]) } as unknown as MessageBatch<never>, env as unknown as Env, fakeCtx() as unknown as ExecutionContext)
		expect(delays).toEqual([['all', { delaySeconds: 3600 }]])
		delays.length = 0
		const one = [{ body: body('x'), attempts: 4, ack: () => {}, retry: (o: unknown) => void delays.push(o) }]
		await worker.queue!({ messages: one, ackAll: () => {}, retryAll: (o: unknown) => void delays.push(['all', o]) } as unknown as MessageBatch<never>, env as unknown as Env, fakeCtx() as unknown as ExecutionContext)
		expect(delays).toEqual([['all', { delaySeconds: 80 }]])
	})
})

describe('retiring shards', () => {
	it('moves the other ranges when one has nowhere to go, and never rejects', async () => {
		vi.useFakeTimers({ toFake: ['Date'] })
		vi.setSystemTime(NOON)
		const env = { ...fakeEnv(), SHARD_2: freshShard() }
		const e = env as unknown as Env
		const today = utcDay(NOON)
		// an EU site on a server without an EU shard, and a site that can go anywhere
		addSite(env, 'eu-site', 'eu')
		addSite(env, 'any-site')
		await getShards(e)
		env.CONTROL.db.exec(`UPDATE shards SET status = 'retiring' WHERE name IN ('shard_0', 'shard_1');
			INSERT INTO shard_map (site_id, from_day, to_day, shard) VALUES ('eu-site', 0, ${today - 5}, 'shard_0'), ('any-site', 0, ${today - 5}, 'shard_1');`)
		invalidate('')
		addEvent(env.SHARD_1, 'any-site', 'a', NOON - 10 * DAY)
		// the first run starts the moves, the next copies them
		await expect(retireShards(e)).resolves.toBeUndefined()
		await expect(retireShards(e)).resolves.toBeUndefined()
		expect(env.CONTROL.rows("SELECT shard FROM shard_map WHERE site_id = 'any-site'")).toEqual([{ shard: 'shard_2' }])
		expect(count(env.SHARD_2, "SELECT COUNT(*) AS n FROM events WHERE site_id = 'any-site'")).toBe(1)
		const results = await runCron(env as unknown as FakeEnv)
		expect(results.map((r) => r.status)).toEqual(results.map(() => 'fulfilled'))
	})

	it('picks up a move another run already started', async () => {
		vi.useFakeTimers({ toFake: ['Date'] })
		vi.setSystemTime(NOON)
		const env = { ...fakeEnv(), SHARD_2: freshShard() }
		const e = env as unknown as Env
		const today = utcDay(NOON)
		addSite(env, 'shop')
		await getShards(e)
		env.CONTROL.db.exec(`UPDATE shards SET status = 'retiring' WHERE name = 'shard_1';
			INSERT INTO shard_map (site_id, from_day, to_day, shard) VALUES ('shop', 0, ${today - 5}, 'shard_1');`)
		invalidate('')
		addEvent(env.SHARD_1, 'shop', 'a', NOON - 10 * DAY)
		// a run in another isolate inserts the move between this run's read and its insert
		const prepare = env.CONTROL.prepare.bind(env.CONTROL)
		let raced = false
		env.CONTROL.prepare = (sql: string) => {
			if (!raced && sql.startsWith('INSERT') && sql.includes('shard_moves')) {
				raced = true
				env.CONTROL.db.prepare("INSERT INTO shard_moves (site_id, from_day, to_day, from_shard, to_shard, stage) VALUES ('shop', 0, ?, 'shard_1', 'shard_2', 'events')").run(today - 5)
			}
			return prepare(sql)
		}
		await expect(retireShards(e)).resolves.toBeUndefined()
		await retireShards(e)
		expect(env.CONTROL.rows("SELECT shard FROM shard_map WHERE site_id = 'shop'")).toEqual([{ shard: 'shard_2' }])
	})

	/** A site on shard_1, retiring, with one event 10 days back in a closed range, and shard_2 to take it. */
	async function retiring() {
		vi.useFakeTimers({ toFake: ['Date'] })
		vi.setSystemTime(NOON)
		const env = { ...fakeEnv(), SHARD_2: freshShard() }
		const e = env as unknown as Env
		addSite(env, 'shop')
		await getShards(e)
		env.CONTROL.db.exec(`UPDATE shards SET status = 'retiring' WHERE name = 'shard_1';
			INSERT INTO shard_map (site_id, from_day, to_day, shard) VALUES ('shop', 0, ${utcDay(NOON) - 5}, 'shard_1');`)
		invalidate('')
		addEvent(env.SHARD_1, 'shop', 'a', NOON - 10 * DAY)
		return { env, e }
	}

	it('copies nothing on the run that starts a move, and refuses writes into the range until it ends', async () => {
		const { env, e } = await retiring()
		await retireShards(e)
		expect([env.CONTROL.rows('SELECT stage FROM shard_moves'), count(env.SHARD_2, 'SELECT COUNT(*) AS n FROM events')]).toEqual([[{ stage: 'events' }], 0])
		await expect(writeShard(e, 'shop', NOON - 10 * DAY)).rejects.toThrow('being moved')
		// today's range is not moving
		expect(await writeShard(e, 'shop', NOON)).not.toBe('shard_1')
		await retireShards(e)
		await expect(writeShard(e, 'shop', NOON - 10 * DAY)).rejects.toThrow('being moved')
		// the old copy goes two cache lifetimes after the switch, and the range takes writes again
		vi.setSystemTime(NOON + 3 * 60_000)
		await retireShards(e)
		expect(env.CONTROL.rows('SELECT * FROM shard_moves')).toEqual([])
		expect([count(env.SHARD_1, 'SELECT COUNT(*) AS n FROM events'), count(env.SHARD_2, 'SELECT COUNT(*) AS n FROM events')]).toEqual([0, 1])
		invalidate('')
		expect(await writeShard(e, 'shop', NOON - 10 * DAY)).toBe('shard_2')
	})

	it('names both shards of a move for deleting a site', async () => {
		const { e } = await retiring()
		await retireShards(e)
		expect((await moveTargets(e, 'shop')).sort()).toEqual(['shard_1', 'shard_2'])
	})

	it('finishes the moves of a shard brought back to active', async () => {
		const { env, e } = await retiring()
		await retireShards(e)
		env.CONTROL.db.exec("UPDATE shards SET status = 'active' WHERE name = 'shard_1'")
		invalidate('')
		await retireShards(e)
		vi.setSystemTime(NOON + 3 * 60_000)
		await retireShards(e)
		expect(env.CONTROL.rows('SELECT * FROM shard_moves')).toEqual([])
		expect(env.CONTROL.rows("SELECT shard FROM shard_map WHERE site_id = 'shop'")).toEqual([{ shard: 'shard_2' }])
	})

	it('stays within its query budget with many ranges waiting', async () => {
		vi.useFakeTimers({ toFake: ['Date'] })
		vi.setSystemTime(NOON)
		const env = { ...fakeEnv(), SHARD_2: freshShard() }
		const e = env as unknown as Env
		await getShards(e)
		const today = utcDay(NOON)
		const rows: string[] = []
		for (let i = 0; i < 700; i++) {
			addSite(env, `s-${i}`)
			rows.push(`('s-${i}', 0, ${today - 5}, 'shard_1', 'shard_2', 'purge', ${NOON})`)
		}
		env.CONTROL.db.exec(`UPDATE shards SET status = 'retiring' WHERE name = 'shard_1';
			INSERT INTO shard_moves (site_id, from_day, to_day, from_shard, to_shard, stage, switched_at) VALUES ${rows.join(', ')};`)
		invalidate('')
		const queries = countQueries(env.CONTROL)
		await retireShards(e)
		expect(queries.n).toBeLessThanOrEqual(520)
	})
})

describe('a region with no shard to take data', () => {
	it('logs once per site while it keeps writing, and the hourly run names the region', async () => {
		vi.useFakeTimers({ toFake: ['Date'] })
		vi.setSystemTime(NOON)
		const env = { ...fakeEnv(), SHARD_EU_0: freshShard() }
		const e = env as unknown as Env
		addSite(env, 'shop', 'eu')
		expect(await writeShard(e, 'shop', NOON)).toBe('shard_eu_0')
		env.CONTROL.db.exec("UPDATE shards SET status = 'draining' WHERE name = 'shard_eu_0'")
		invalidate('')
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
		try {
			for (let i = 0; i < 3; i++) expect(await writeShard(e, 'shop', NOON + i)).toBe('shard_eu_0')
			const full = () => errors.mock.calls.map((c) => JSON.parse(String(c[0]))).filter((m) => m.msg === 'no active shard to move to')
			expect(full()).toHaveLength(1)
			await runCron(env as unknown as FakeEnv)
			const regions = errors.mock.calls.map((c) => JSON.parse(String(c[0]))).filter((m) => m.msg === 'no shard can take new data')
			expect(regions).toEqual([{ msg: 'no shard can take new data', region: 'eu', shards: ['shard_eu_0'] }])
		} finally {
			errors.mockRestore()
		}
	})
})

describe('deploy', () => {
	it('reads a blank SHARD_COUNT as unset', async () => {
		const { parseCount } = (await import('../scripts/shards.ts')) as unknown as { parseCount: (v: string | undefined) => number | undefined }
		for (const unset of [undefined, '', '  ']) expect(parseCount(unset)).toBeUndefined()
		expect(parseCount('3')).toBe(3)
		expect(parseCount('0')).toBe(0)
		for (const bad of ['x', '-1', '1.5']) expect(() => parseCount(bad)).toThrow('SHARD_COUNT must be a whole number')
	})
})
