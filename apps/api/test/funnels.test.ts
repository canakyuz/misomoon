import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { invalidate } from '../src/control'
import { fakeCtx, fakeEnv, type FakeEnv } from './fake'

vi.mock('@misomoon/tracker/m.min.js', () => ({ default: '/* m.js */' }))
const { default: worker } = await import('../src/index')

const ADMIN = { authorization: 'Bearer ms_owner-session' }

async function call(env: FakeEnv, method: string, path: string, body?: unknown, headers: Record<string, string> = ADMIN) {
	const init: RequestInit = { method, headers: { 'content-type': 'application/json', ...headers } }
	if (body !== undefined) init.body = JSON.stringify(body)
	const res = await worker.fetch(new Request(`https://app.test${path}`, init), env as unknown as Env, fakeCtx() as unknown as ExecutionContext)
	return { status: res.status, body: res.status === 204 ? null : await res.json<any>() }
}

const steps = [
	{ kind: 'page', match: '/' },
	{ kind: 'page', match: '/pricing' },
]

async function setup() {
	const env = fakeEnv()
	await call(env, 'POST', '/api/v1/sites', { domain: 'shop.com' })
	const made = await call(env, 'POST', '/api/v1/sites/shop-com/funnels', { name: 'Signup', steps })
	return { env, id: made.body.id as string }
}

beforeEach(() => invalidate(''))

describe('saved funnels (F31)', () => {
	it('rejects a step without a kind or match when saving', async () => {
		const { env } = await setup()
		const bad = await call(env, 'POST', '/api/v1/sites/shop-com/funnels', { name: 'X', steps: [{ kind: 'page', match: '/' }, { kind: 'click' }] })
		expect(bad).toEqual({ status: 400, body: { error: 'each step needs kind page|event and match' } })
	})

	it('updates a funnel in place instead of adding a copy', async () => {
		const { env, id } = await setup()
		const next = [...steps, { kind: 'event', match: 'Signup', label: 'Signed up' }]
		const put = await call(env, 'PUT', `/api/v1/sites/shop-com/funnels/${id}`, { name: 'Signup v2', steps: next })
		expect(put).toEqual({ status: 200, body: { id, name: 'Signup v2', steps: next, mode: 'sequential' } })
		expect((await call(env, 'GET', '/api/v1/sites/shop-com/funnels')).body).toEqual([{ id, name: 'Signup v2', steps: next, mode: 'sequential' }])
	})

	it('answers 404 for a funnel of another site or one that does not exist', async () => {
		const { env, id } = await setup()
		await call(env, 'POST', '/api/v1/sites', { domain: 'other.com' })
		expect(await call(env, 'PUT', `/api/v1/sites/other-com/funnels/${id}`, { name: 'X', steps })).toEqual({ status: 404, body: { error: 'funnel not found' } })
		expect(await call(env, 'DELETE', '/api/v1/sites/shop-com/funnels/nope')).toEqual({ status: 404, body: { error: 'funnel not found' } })
	})

	it('deletes a funnel', async () => {
		const { env, id } = await setup()
		expect(await call(env, 'DELETE', `/api/v1/sites/shop-com/funnels/${id}`)).toEqual({ status: 204, body: null })
		expect((await call(env, 'GET', '/api/v1/sites/shop-com/funnels')).body).toEqual([])
	})

	it('needs an admin to change or delete', async () => {
		const { env, id } = await setup()
		expect((await call(env, 'PUT', `/api/v1/sites/shop-com/funnels/${id}`, { name: 'X', steps }, {})).status).toBe(401)
		expect((await call(env, 'DELETE', `/api/v1/sites/shop-com/funnels/${id}`, undefined, {})).status).toBe(401)
	})
})

describe('unknown API paths (F9)', () => {
	it('answer a JSON 404 instead of the dashboard page', async () => {
		const env = fakeEnv()
		expect(await call(env, 'GET', '/api/v1/nope')).toEqual({ status: 404, body: { error: 'not found' } })
		expect(await call(env, 'POST', '/api/v1/sites/x/funnels/y/z', {})).toEqual({ status: 404, body: { error: 'not found' } })
	})
})
