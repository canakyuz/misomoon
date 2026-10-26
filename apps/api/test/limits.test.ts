// The Stats API rate limit (STATS_LIMIT): per API key, or per IP address without one,
// on every route that runs stats queries, MCP included.
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { invalidate } from '../src/control'
import { clientKey } from '../src/limits'
import { fakeCtx, fakeEnv, OWNER, type FakeEnv } from './fake'

vi.mock('@misomoon/tracker/m.min.js', () => ({ default: '/* m.js */' }))
const { default: worker } = await import('../src/index')

const OVER = { error: 'rate limit exceeded, try again in a minute' }
// /mcp answers past the limit in JSON-RPC, so an MCP client can show the message
const RPC_OVER = { jsonrpc: '2.0', id: null, error: { code: -32000, message: OVER.error } }
const TRIES = { error: 'too many attempts, wait a minute' }

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
		expect([over.status, over.headers.get('retry-after'), await over.json()]).toEqual([429, '60', OVER])
		expect(limit.keys).toEqual([keyId, keyId, keyId])
	})

	it("refuses an API key's MCP request past the limit, counting by the key", async () => {
		const { env, limit, keyId, auth } = await setup()
		expect((await call(env, 'POST', '/mcp', aggregate, auth)).status).toBe(200)
		expect((await call(env, 'POST', '/mcp', aggregate, auth)).status).toBe(200)
		const over = await call(env, 'POST', '/mcp', aggregate, auth)
		expect([over.status, over.headers.get('retry-after'), await over.json()]).toEqual([429, '60', { ...RPC_OVER, id: 1 }])
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

	it('counts each tool call of an MCP batch against the limit', async () => {
		const { env, limit, keyId, auth } = await setup()
		const res = await call(env, 'POST', '/mcp', [aggregate, { ...aggregate, id: 2 }, { ...aggregate, id: 3 }], auth)
		expect(limit.keys).toEqual([keyId, keyId, keyId])
		// the third call is past the limit of 2: refused as a JSON-RPC error, the first two answered
		const replies = (await res.json()) as { id: number; result?: unknown; error?: { code: number; message: string } }[]
		expect(replies.map((r) => [r.id, r.error?.message ?? 'ok'])).toEqual([
			[1, 'ok'],
			[2, 'ok'],
			[3, OVER.error],
		])
	})

	it('does not limit MCP for a signed-in dashboard', async () => {
		const { env, limit } = await setup()
		for (let i = 0; i < 3; i++) expect((await call(env, 'POST', '/mcp', aggregate, OWNER)).status).toBe(200)
		expect(limit.keys).toEqual([])
	})
})

describe('rate limit keys and answers', () => {
	/** A fake env with `limiter(allow)` bound, and the limiter. */
	function limitedEnv(allow = 2, over: Partial<FakeEnv> = {}) {
		const env = fakeEnv(over)
		const limit = limiter(allow)
		;(env as unknown as { STATS_LIMIT: unknown }).STATS_LIMIT = limit
		return { env, limit }
	}

	it('says when to try again on the v2 query API', async () => {
		const { env, auth } = await setup()
		const q = { site_id: 'shop-com', metrics: ['visitors'], date_range: '7d' }
		await call(env, 'POST', '/api/v2/query', q, auth)
		await call(env, 'POST', '/api/v2/query', q, auth)
		const over = await call(env, 'POST', '/api/v2/query', q, auth)
		expect([over.status, over.headers.get('retry-after'), await over.json()]).toEqual([429, '60', OVER])
	})

	it('says when to try again on a sign-in route', async () => {
		const { env } = limitedEnv(1)
		await call(env, 'POST', '/api/v1/auth/login', { email: 'owner@test', password: 'wrong password!' })
		const over = await call(env, 'POST', '/api/v1/auth/login', { email: 'owner@test', password: 'wrong password!' })
		expect([over.status, over.headers.get('retry-after'), await over.json()]).toEqual([429, '60', TRIES])
	})

	it('says when the oldest test report of the hour expires', async () => {
		vi.useFakeTimers({ toFake: ['Date'] })
		try {
			const start = Date.UTC(2026, 9, 22, 9)
			vi.setSystemTime(start)
			const env = fakeEnv({ EMAIL: { send: async () => ({ messageId: 'm1' }) } } as Partial<FakeEnv>)
			await call(env, 'POST', '/api/v1/sites', { domain: 'shop.com' }, OWNER)
			for (let i = 0; i < 10; i++) {
				vi.setSystemTime(start + i * 60_000)
				expect((await call(env, 'POST', '/api/v1/sites/shop-com/reports/test', { email: 'me@shop.com' }, OWNER)).status).toBe(200)
			}
			vi.setSystemTime(start + 30 * 60_000)
			const over = await call(env, 'POST', '/api/v1/sites/shop-com/reports/test', { email: 'me@shop.com' }, OWNER)
			// the first send, at `start`, leaves the window 30 minutes from now
			expect([over.status, over.headers.get('retry-after')]).toEqual([429, '1800'])
		} finally {
			vi.useRealTimers()
		}
	})

	it('keys a signed-out stats or MCP request by its whole address, so people sharing an IPv6 /64 each get their own', async () => {
		const { env, limit } = await setup()
		for (const ip of ['2001:db8:1:2:aaaa::1', '2001:DB8:1:2:AAAA:0:0:1', '2001:db8:1:2:bbbb::2', '::ffff:198.51.100.7', '198.51.100.8'])
			await call(env, 'POST', '/mcp', { jsonrpc: '2.0', id: 1, method: 'ping' }, { 'cf-connecting-ip': ip })
		await call(env, 'GET', '/api/v1/stats/aggregate?site=shop-com', undefined, { 'cf-connecting-ip': '2001:db8:1:2:cccc::3' })
		expect(limit.keys).toEqual(['ip:2001:db8:1:2:aaaa:0:0:1', 'ip:2001:db8:1:2:aaaa:0:0:1', 'ip:2001:db8:1:2:bbbb:0:0:2', 'ip:198.51.100.7', 'ip:198.51.100.8', 'ip:2001:db8:1:2:cccc:0:0:3'])
	})

	it('answers a batch refused at the door with a null id, and a request it cannot read too', async () => {
		const { env, auth } = await setup()
		await call(env, 'POST', '/mcp', aggregate, auth)
		await call(env, 'POST', '/mcp', aggregate, auth)
		const batch = await call(env, 'POST', '/mcp', [aggregate, { ...aggregate, id: 2 }], auth)
		expect([batch.status, await batch.json()]).toEqual([429, RPC_OVER])
		const init = { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.9', ...auth }, body: '{not json' }
		const res = await worker.fetch(new Request('https://app.test/mcp', init), env as unknown as Env, fakeCtx() as unknown as ExecutionContext)
		expect([res.status, await res.json()]).toEqual([429, RPC_OVER])
	})

	it('lets a page on another origin read Retry-After', async () => {
		const { env, auth } = await setup()
		const origin = { origin: 'https://tools.example' }
		for (let i = 0; i < 2; i++) await call(env, 'GET', '/api/v1/stats/aggregate?site=shop-com', undefined, auth)
		const v1 = await call(env, 'GET', '/api/v1/stats/aggregate?site=shop-com', undefined, { ...auth, ...origin })
		const v2 = await call(env, 'POST', '/api/v2/query', { site_id: 'shop-com', metrics: ['visitors'], date_range: '7d' }, { ...auth, ...origin })
		const mcp = await call(env, 'POST', '/mcp', aggregate, { ...auth, ...origin })
		for (const res of [v1, v2, mcp]) {
			expect(res.status).toBe(429)
			expect((res.headers.get('access-control-expose-headers') ?? '').toLowerCase().split(/\s*,\s*/)).toContain('retry-after')
		}
	})

	it('keys the sign-in routes by the /64 of an IPv6 address', async () => {
		const { env, limit } = limitedEnv()
		await call(env, 'POST', '/api/v1/auth/forgot', { email: 'nobody@test' }, { 'cf-connecting-ip': '2001:db8:1:2:aaaa::1' })
		expect(limit.keys[0]).toBe('forgot:2001:db8:1:2::/64')
	})

	it('limits sign-in attempts per address only, so nobody can lock an account out by guessing at it', async () => {
		const { env, limit } = limitedEnv()
		const statuses: number[] = []
		for (const ip of ['203.0.113.1', '203.0.113.2', '203.0.113.3'])
			statuses.push((await call(env, 'POST', '/api/v1/auth/login', { email: 'owner@test', password: 'wrong password!' }, { 'cf-connecting-ip': ip })).status)
		expect(statuses).toEqual([401, 401, 401])
		expect(limit.keys).toEqual(['login:203.0.113.1', 'login:203.0.113.2', 'login:203.0.113.3'])
	})

	it('lets many addresses open a shared link without a password', async () => {
		const { env, limit } = limitedEnv(100)
		await call(env, 'POST', '/api/v1/sites', { domain: 'shop.com' }, OWNER)
		const { slug } = (await (await call(env, 'POST', '/api/v1/sites/shop-com/shared', { name: 'Client' }, OWNER)).json()) as { slug: string }
		const statuses: number[] = []
		for (let i = 0; i < 102; i++) statuses.push((await call(env, 'POST', `/api/v1/share/${slug}`, {}, { 'cf-connecting-ip': `203.0.113.${i}` })).status)
		expect(statuses.every((s) => s === 200)).toBe(true)
		expect(limit.keys.every((k) => k.startsWith('share:'))).toBe(true)
	})

	it('limits the invitations one person sends', async () => {
		const { env, limit } = limitedEnv()
		const invite = (n: number) => call(env, 'POST', '/api/v1/teams/t1/invitations', { email: `p${n}@test.com`, role: 'viewer' }, OWNER)
		const statuses = [(await invite(1)).status, (await invite(2)).status]
		const over = await invite(3)
		expect([...statuses, over.status, await over.json()]).toEqual([201, 201, 429, TRIES])
		expect(limit.keys).toEqual(['invite:u1', 'invite:u1', 'invite:u1'])
		// nothing was stored for the refused one
		expect(await env.CONTROL.prepare("SELECT COUNT(*) AS n FROM invitations WHERE email = 'p3@test.com'").first('n')).toBe(0)
	})
})

describe('clientKey', () => {
	it('keys an IPv6 address by its /64, or whole, and an IPv4 address as it is', () => {
		expect(clientKey('2001:db8:1:2:aaaa::1')).toBe('2001:db8:1:2::/64')
		expect(clientKey('2001:DB8:1:2:AAAA:0:0:1', false)).toBe('2001:db8:1:2:aaaa:0:0:1')
		expect(clientKey('2001:db8::1')).toBe('2001:db8:0:0::/64')
		expect(clientKey('::1', false)).toBe('0:0:0:0:0:0:0:1')
		expect(clientKey('::')).toBe('0:0:0:0::/64')
		expect(clientKey(' 203.0.113.9 ')).toBe('203.0.113.9')
		expect(clientKey('203.0.113.9', false)).toBe('203.0.113.9')
	})

	it('reads an IPv4 address written IPv4-mapped, in either notation', () => {
		expect(clientKey('::ffff:198.51.100.7')).toBe('198.51.100.7')
		expect(clientKey('::ffff:c633:6407')).toBe('198.51.100.7')
		expect(clientKey('::FFFF:C633:6407', false)).toBe('198.51.100.7')
	})

	it('reads an IPv6 address with an IPv4 tail, brackets or a zone', () => {
		expect(clientKey('64:ff9b::198.51.100.7')).toBe('64:ff9b:0:0::/64')
		expect(clientKey('2001:db8:1:2:3:4:192.0.2.1')).toBe('2001:db8:1:2::/64')
		expect(clientKey('[2001:db8::1]')).toBe('2001:db8:0:0::/64')
		expect(clientKey('fe80::1%eth0')).toBe('fe80:0:0:0::/64')
		expect(clientKey('fe80::1%eth0.5', false)).toBe('fe80:0:0:0:0:0:0:1')
	})

	it('keeps anything it cannot read as it is, without throwing, and caps its length', () => {
		for (const raw of ['1:2:3:4:5:6:7:8::9', '2001:db8:1:2:3:4:5:6:7', '2001:db8::1:2:3:4:5:6:7', '1::2::3', 'garbage', '999.1.1.1', '1.2.3', '12345::1', 'g::1'])
			expect(clientKey(raw)).toBe(raw)
		expect(clientKey('x'.repeat(500))).toBe('x'.repeat(64))
		expect(clientKey(null)).toBe('unknown')
		expect(clientKey('  ')).toBe('unknown')
		expect(clientKey('garbage')).not.toBe(clientKey('rubbish'))
	})
})
