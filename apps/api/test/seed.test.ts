import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { invalidate } from '../src/control'
import { fakeCtx, fakeEnv, type FakeEnv } from './fake'

vi.mock('@misomoon/tracker/m.min.js', () => ({ default: '/* m.js */' }))
const { default: worker } = await import('../src/index')

const ADMIN = { authorization: 'Bearer ms_owner-session', 'content-type': 'application/json' }

async function call(env: FakeEnv, method: string, path: string, body?: unknown) {
	const req = new Request(`https://app.test${path}`, { method, headers: ADMIN, body: body === undefined ? undefined : JSON.stringify(body) })
	const res = await worker.fetch(req, env as unknown as Env, fakeCtx() as unknown as ExecutionContext)
	return { status: res.status, body: await res.json<any>() }
}

const events = (env: FakeEnv) => env.SHARD_0.rows('SELECT COUNT(*) AS n FROM events')[0].n + env.SHARD_1.rows('SELECT COUNT(*) AS n FROM events')[0].n

beforeEach(() => invalidate(''))

describe('synthetic demo traffic (F33)', () => {
	it('is refused unless the deployment turns it on, so real readers are never mixed with invented ones', async () => {
		const env = fakeEnv()
		await call(env, 'POST', '/api/v1/sites', { id: 'demo', domain: 'misomoon.com', public: true })
		const res = await call(env, 'POST', '/api/v1/sites/demo/demo', { days: 1, perDay: 5 })
		expect(res).toEqual({ status: 403, body: { error: 'synthetic traffic is turned off here; set DEMO_SEED=1 to allow it' } })
		expect(events(env)).toBe(0)
	})

	it('writes traffic when DEMO_SEED is 1', async () => {
		const env = { ...fakeEnv(), DEMO_SEED: '1' }
		await call(env, 'POST', '/api/v1/sites', { id: 'demo', domain: 'misomoon.com', public: true })
		// two days, so just after midnight UTC yesterday's visits are still in the past
		const res = await call(env, 'POST', '/api/v1/sites/demo/demo', { days: 2, perDay: 5 })
		expect(res.status).toBe(200)
		expect(events(env)).toBeGreaterThan(0)
	})
})

describe('the seed script', () => {
	it('refuses a server other than a local one, before it signs anyone up', () => {
		const script = fileURLToPath(new URL('../scripts/seed.ts', import.meta.url))
		let out = ''
		try {
			execFileSync(process.execPath, ['--experimental-strip-types', script], { env: { ...process.env, API_URL: 'https://analytics.example.com' }, encoding: 'utf8', stdio: 'pipe' })
		} catch (e) {
			out = String((e as { stderr: string }).stderr)
		}
		expect(out).toContain('the seed fills a local dev server; API_URL is https://analytics.example.com')
	})
})
