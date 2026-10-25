import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { invalidate } from '../src/control'
import { fakeCtx, fakeEnv, OWNER, type FakeEnv } from './fake'

vi.mock('@misomoon/tracker/m.min.js', () => ({ default: '/* m.js */' }))
const { default: worker } = await import('../src/index')

async function call(env: FakeEnv, method: string, path: string, body?: BodyInit, headers: Record<string, string> = {}) {
	const ctx = fakeCtx()
	const res = await worker.fetch(new Request(`https://app.test${path}`, { method, headers: { ...OWNER, ...headers }, body }), env as unknown as Env, ctx as unknown as ExecutionContext)
	await ctx.settle()
	return res
}

/** A visitors CSV with one row per day for `days` days from 2022-01-01. */
function visitorsCsv(days: number) {
	const rows = Array.from({ length: days }, (_, i) => `${new Date(Date.UTC(2022, 0, 1 + i)).toISOString().slice(0, 10)},10,30,4,12,600`)
	return new File([`date,visitors,pageviews,bounces,visits,visit_duration\n${rows.join('\n')}\n`], 'imported_visitors_20220101_20240630.csv', { type: 'text/csv' })
}

beforeEach(() => invalidate(''))
afterEach(() => vi.unstubAllGlobals())

describe('CSV imports', () => {
	it('leaves no rows behind when an import fails part way, so a retry does not count days twice', async () => {
		const env = fakeEnv()
		expect((await call(env, 'POST', '/api/v1/sites', JSON.stringify({ domain: 'shop.com' }), { 'content-type': 'application/json' })).status).toBe(201)
		// the second write batch fails, after the first one committed
		let batches = 0
		for (const shard of [env.SHARD_0, env.SHARD_1]) {
			const batch = shard.batch.bind(shard)
			shard.batch = async (stmts) => (++batches === 2 ? Promise.reject(new Error('D1 network error')) : batch(stmts))
		}
		const form = new FormData()
		form.append('file', visitorsCsv(900))
		expect((await call(env, 'POST', '/api/v1/sites/shop-com/imports', form)).status).toBe(500)
		expect(batches).toBe(2)
		expect(env.CONTROL.rows("SELECT status FROM imports")).toEqual([{ status: 'failed' }])
		expect([...env.SHARD_0.rows('SELECT 1 FROM imported'), ...env.SHARD_1.rows('SELECT 1 FROM imported')]).toEqual([])
	})
})

const HOUR = 3_600_000
const grant = (env: FakeEnv, id: string, createdAt: number) =>
	env.CONTROL.db.prepare("INSERT INTO google_auth (id, site_id, purpose, access_token, refresh_token, expires_at, created_at) VALUES (?, 'shop-com', 'import', 'ya29.token', '1//refresh', ?, ?)").run(id, Date.now() + HOUR, createdAt)

describe('Google imports', () => {
	it('drops the Google grant when the import fails', async () => {
		const env = fakeEnv({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' })
		await call(env, 'POST', '/api/v1/sites', JSON.stringify({ domain: 'shop.com' }), { 'content-type': 'application/json' })
		grant(env, 'g1', Date.now())
		vi.stubGlobal('fetch', async () => Response.json({ error: { message: 'Quota exceeded' } }, { status: 429 }))
		const res = await call(env, 'POST', '/api/v1/sites/shop-com/imports/google', JSON.stringify({ grant: 'g1', property: 'properties/123' }), { 'content-type': 'application/json' })
		expect(res.status).toBe(202)
		expect(env.CONTROL.rows('SELECT status, error FROM imports')).toEqual([{ status: 'failed', error: 'Google: Quota exceeded' }])
		expect(env.CONTROL.rows('SELECT id FROM google_auth')).toEqual([])
	})

	it('fails an import cut off for an hour, with none of its rows, and forgets grants a day old', async () => {
		const env = fakeEnv()
		await call(env, 'POST', '/api/v1/sites', JSON.stringify({ domain: 'shop.com' }), { 'content-type': 'application/json' })
		const form = new FormData()
		form.append('file', visitorsCsv(30))
		await call(env, 'POST', '/api/v1/sites/shop-com/imports', form)
		const imported = () => [...env.SHARD_0.rows('SELECT 1 FROM imported'), ...env.SHARD_1.rows('SELECT 1 FROM imported')].length
		expect(imported()).toBeGreaterThan(0)
		// as a background import the Worker stopped part way leaves it
		env.CONTROL.db.prepare("UPDATE imports SET status = 'importing', created_at = ?").run(Date.now() - 2 * HOUR)
		env.CONTROL.db.prepare("INSERT INTO imports (id, site_id, source, label, status, created_at) VALUES ('running', 'shop-com', 'google', 'Google', 'importing', ?)").run(Date.now() - 10 * 60_000)
		grant(env, 'old', Date.now() - 25 * HOUR)
		grant(env, 'new', Date.now() - HOUR)
		const ctx = fakeCtx()
		await worker.scheduled({} as ScheduledController, env as unknown as Env, ctx as unknown as ExecutionContext)
		await ctx.settle()
		expect(env.CONTROL.rows('SELECT id, status, error FROM imports ORDER BY created_at')).toEqual([
			{ id: expect.any(String), status: 'failed', error: 'The import stopped before it finished. Delete it and start again.' },
			{ id: 'running', status: 'importing', error: null },
		])
		expect(imported()).toBe(0)
		expect(env.CONTROL.rows('SELECT id FROM google_auth')).toEqual([{ id: 'new' }])
	})
})
