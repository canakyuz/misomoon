import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
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
