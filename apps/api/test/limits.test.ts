// The Stats API rate limit (STATS_LIMIT): per API key, or per IP address without one,
// on every route that runs stats queries, MCP included.
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { invalidate } from '../src/control'
import { fakeCtx, fakeEnv, OWNER, type FakeEnv } from './fake'

vi.mock('@misomoon/tracker/m.min.js', () => ({ default: '/* m.js */' }))
const { default: worker } = await import('../src/index')

const OVER = { error: 'rate limit exceeded, try again in a minute' }

/** A limiter that lets `allow` calls through per key, and remembers the keys it was asked about. */
function limiter(allow = 2) {
	const counts = new Map<string, number>()
	const keys: string[] = []
	return {
		keys,
		limit: async ({ key }: { key: string }) => {
			keys.push(key)
			counts.set(key, (counts.get(key) ?? 0) + 1)
			return { success: counts.get(key)! <= allow }
		},
	}
}

async function call(env: FakeEnv, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
	const init: RequestInit = { method, headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.9', ...headers } }
	if (body !== undefined) init.body = JSON.stringify(body)
	const ctx = fakeCtx()
	const res = await worker.fetch(new Request(`https://app.test${path}`, init), env as unknown as Env, ctx as unknown as ExecutionContext)
	await ctx.settle()
	return res
}

const aggregate = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_aggregate', arguments: { site: 'shop-com' } } }

/** An env with shop.com, an API key for it, and a limiter that allows 2 calls per key. */
async function setup() {
	const env = fakeEnv()
	expect((await call(env, 'POST', '/api/v1/sites', { domain: 'shop.com', public: true }, OWNER)).status).toBe(201)
	expect((await call(env, 'PATCH', '/api/v1/sites/shop-com', { public: true }, OWNER)).status).toBe(200)
	const made = (await (await call(env, 'POST', '/api/v1/keys', { name: 'k', site: 'shop-com' }, OWNER)).json()) as { id: string; key: string }
	const limit = limiter()
	;(env as unknown as { STATS_LIMIT: unknown }).STATS_LIMIT = limit
	return { env, limit, keyId: made.id, auth: { authorization: `Bearer ${made.key}` } }
}

beforeEach(() => invalidate(''))

describe('STATS_LIMIT', () => {
	it('limits the stats API per API key (regression guard)', async () => {
		const { env, limit, keyId, auth } = await setup()
		expect((await call(env, 'GET', '/api/v1/stats/aggregate?site=shop-com', undefined, auth)).status).toBe(200)
		expect((await call(env, 'GET', '/api/v1/stats/aggregate?site=shop-com', undefined, auth)).status).toBe(200)
		const over = await call(env, 'GET', '/api/v1/stats/aggregate?site=shop-com', undefined, auth)
		expect([over.status, await over.json()]).toEqual([429, OVER])
		expect(limit.keys).toEqual([keyId, keyId, keyId])
	})

	it("refuses an API key's MCP request past the limit, counting by the key", async () => {
		const { env, limit, keyId, auth } = await setup()
		expect((await call(env, 'POST', '/mcp', aggregate, auth)).status).toBe(200)
		expect((await call(env, 'POST', '/mcp', aggregate, auth)).status).toBe(200)
		const over = await call(env, 'POST', '/mcp', aggregate, auth)
		expect([over.status, await over.json()]).toEqual([429, OVER])
		expect(limit.keys).toEqual([keyId, keyId, keyId])
	})

	it('counts MCP and the stats API against the same limit of a key', async () => {
		const { env, auth } = await setup()
		expect((await call(env, 'GET', '/api/v1/stats/aggregate?site=shop-com', undefined, auth)).status).toBe(200)
		expect((await call(env, 'POST', '/mcp', aggregate, auth)).status).toBe(200)
		expect((await call(env, 'POST', '/mcp', aggregate, auth)).status).toBe(429)
	})

	it('counts a signed-out MCP request by IP address', async () => {
		const { env, limit } = await setup()
		expect((await call(env, 'POST', '/mcp', aggregate)).status).toBe(200)
		expect((await call(env, 'POST', '/mcp', aggregate)).status).toBe(200)
		expect((await call(env, 'POST', '/mcp', aggregate)).status).toBe(429)
		expect(limit.keys).toEqual(['ip:203.0.113.9', 'ip:203.0.113.9', 'ip:203.0.113.9'])
	})

	it('does not limit MCP for a signed-in dashboard', async () => {
		const { env, limit } = await setup()
		for (let i = 0; i < 3; i++) expect((await call(env, 'POST', '/mcp', aggregate, OWNER)).status).toBe(200)
		expect(limit.keys).toEqual([])
	})
})
