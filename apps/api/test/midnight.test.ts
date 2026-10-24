import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { DAY, MINUTE } from '@misomoon/core'
import { invalidate, writeShard } from '../src/control'
import { fakeCtx, fakeEnv, OWNER, type FakeEnv } from './fake'

vi.mock('@misomoon/tracker/m.min.js', () => ({ default: '/* m.js */' }))
const { default: worker } = await import('../src/index')

const UA = 'Mozilla/5.0 (Macintosh) Chrome/141.0.0.0 Safari/537.36'
const MIDNIGHT = Date.UTC(2026, 9, 23)

async function call(env: FakeEnv, method: string, path: string, body: unknown, headers: Record<string, string> = {}) {
	const ctx = fakeCtx()
	const req = new Request(`https://app.test${path}`, { method, headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
	const res = await worker.fetch(req, env as unknown as Env, ctx as unknown as ExecutionContext)
	await ctx.settle()
	return res
}

/** One pageview from the same browser at `at`. */
async function visit(env: FakeEnv, at: number, path = '/') {
	vi.setSystemTime(at)
	await call(env, 'POST', '/api/event', { s: 'shop-com', n: 'pageview', u: `https://shop.com${path}` }, { 'user-agent': UA, 'cf-connecting-ip': '198.51.100.7' })
}

const all = (env: FakeEnv, sql: string) => [...env.SHARD_0.rows(sql), ...env.SHARD_1.rows(sql)] as Record<string, unknown>[]

beforeEach(async () => {
	invalidate('')
	vi.useFakeTimers({ toFake: ['Date'] })
	vi.setSystemTime(MIDNIGHT - DAY / 2)
})
afterEach(() => vi.useRealTimers())

async function shop() {
	const env = fakeEnv()
	expect((await call(env, 'POST', '/api/v1/sites', { domain: 'shop.com' }, OWNER)).status).toBe(201)
	return env
}

describe('a visit across 00:00 UTC, when the salt rotates', () => {
	it('stays one visit, while each day keeps its own visitor id', async () => {
		const env = await shop()
		await visit(env, MIDNIGHT - 5 * MINUTE, '/')
		await visit(env, MIDNIGHT + 5 * MINUTE, '/pricing')

		const events = all(env, 'SELECT session_id, visitor_id FROM events ORDER BY ts')
		expect(events).toHaveLength(2)
		// the salt still rotates: the two days can't be linked from the stored ids
		expect(events[0].visitor_id).not.toBe(events[1].visitor_id)
		expect(events[0].session_id).toBe(events[1].session_id)
		expect(all(env, 'SELECT entry_path, exit_path, pageviews, duration_ms FROM sessions')).toEqual([
			{ entry_path: '/', exit_path: '/pricing', pageviews: 2, duration_ms: 10 * MINUTE },
		])
	})

	it('stays one visit when it goes on past the first half hour of the new day', async () => {
		const env = await shop()
		await visit(env, MIDNIGHT - 5 * MINUTE, '/')
		await visit(env, MIDNIGHT + 20 * MINUTE, '/a')
		await visit(env, MIDNIGHT + 45 * MINUTE, '/b')
		await visit(env, MIDNIGHT + 70 * MINUTE, '/c')

		expect(new Set(all(env, 'SELECT session_id FROM events').map((e) => e.session_id)).size).toBe(1)
		expect(all(env, 'SELECT pageviews, exit_path FROM sessions')).toEqual([{ pageviews: 4, exit_path: '/c' }])
	})

	it('still starts a new visit after 30 quiet minutes', async () => {
		const env = await shop()
		await visit(env, MIDNIGHT - 5 * MINUTE)
		await visit(env, MIDNIGHT + 26 * MINUTE)
		expect(all(env, 'SELECT pageviews FROM sessions')).toEqual([{ pageviews: 1 }, { pageviews: 1 }])
	})

	it('splits the visit when the site moves to another shard at midnight', async () => {
		const env = await shop()
		await visit(env, MIDNIGHT - 5 * MINUTE, '/')
		const e = env as unknown as Env
		const first = await writeShard(e, 'shop-com', MIDNIGHT - 5 * MINUTE)
		const other = first === 'shard_0' ? 'shard_1' : 'shard_0'
		// the shard starts draining: the site writes to `other` from the next UTC day
		env.CONTROL.db.prepare("UPDATE shards SET status = 'draining' WHERE name = ?").run(first)
		invalidate('')
		await writeShard(e, 'shop-com', MIDNIGHT - 4 * MINUTE)
		expect(await writeShard(e, 'shop-com', MIDNIGHT + 5 * MINUTE)).toBe(other)

		await visit(env, MIDNIGHT + 5 * MINUTE, '/pricing')
		const db = (name: string) => (name === 'shard_0' ? env.SHARD_0 : env.SHARD_1)
		expect(db(first).rows('SELECT entry_path, pageviews FROM sessions')).toEqual([{ entry_path: '/', pageviews: 1 }])
		expect(db(other).rows('SELECT entry_path, pageviews FROM sessions')).toEqual([{ entry_path: '/pricing', pageviews: 1 }])
	})
})
