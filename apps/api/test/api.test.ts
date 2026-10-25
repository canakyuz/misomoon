import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { BROWSER_PARTS, DAY } from '@misomoon/core'
import { cacheSize, getShards, invalidate, writeShard } from '../src/control'
import { fakeCtx, fakeEnv, freshShard, type FakeEnv } from './fake'

vi.mock('@misomoon/tracker/m.min.js', () => ({ default: '/* m.js */' }))
vi.mock('@misomoon/tracker/overlay.min.js', () => ({ default: '/* overlay.js */' }))
vi.mock('@misomoon/tracker/parts.min.js', async () => {
	const { BROWSER_PARTS } = await import('@misomoon/core')
	return { default: JSON.stringify(Object.fromEntries(BROWSER_PARTS.map((p) => [p, `/* ${p} */`]))) }
})
const { default: worker } = await import('../src/index')

const ADMIN = { authorization: 'Bearer ms_owner-session' }
const UA = 'Mozilla/5.0 (Macintosh) Chrome/141.0.0.0 Safari/537.36'

async function call(env: FakeEnv, method: string, path: string, body?: unknown, headers: Record<string, string> = {}, host = 'app.test') {
	const ctx = fakeCtx()
	const init: RequestInit = { method, headers: { 'content-type': 'application/json', ...headers } }
	if (body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body)
	const res = await worker.fetch(new Request(`https://${host}${path}`, init), env as unknown as Env, ctx as unknown as ExecutionContext)
	return { res, ctx, json: async () => res.json() as Promise<any> }
}

const site = (env: FakeEnv, body: Record<string, unknown>) => call(env, 'POST', '/api/v1/sites', body, ADMIN)

beforeEach(() => invalidate(''))
afterEach(() => {
	vi.unstubAllGlobals()
	vi.useRealTimers()
})

describe('sign-up', () => {
	const NEW = { email: 'first@example.com', name: 'First', password: 'a long password' }
	const empty = (env: FakeEnv) => env.CONTROL.db.exec('DELETE FROM sessions; DELETE FROM team_members; DELETE FROM teams; DELETE FROM users')
	const signups = async (env: FakeEnv) => (await (await call(env, 'GET', '/api/v1/me')).json()).signups

	it('lets the first account sign up on an empty invite-only server, then closes', async () => {
		const env = fakeEnv({ SIGNUPS: 'invite' })
		empty(env)
		expect(await signups(env)).toBe(true)
		const first = await call(env, 'POST', '/api/v1/auth/signup', NEW)
		expect(first.res.status).toBe(201)
		expect(await signups(env)).toBe(false)
		const second = await call(env, 'POST', '/api/v1/auth/signup', { ...NEW, email: 'second@example.com' })
		expect([second.res.status, await second.json()]).toEqual([403, { error: 'sign-up is by invitation on this server' }])
	})

	it('refuses sign-up on an invite-only server that has an account', async () => {
		const env = fakeEnv({ SIGNUPS: 'invite' })
		expect(await signups(env)).toBe(false)
		expect((await call(env, 'POST', '/api/v1/auth/signup', NEW)).res.status).toBe(403)
	})

	it('refuses every sign-up on a closed server, even the first', async () => {
		const env = fakeEnv({ SIGNUPS: 'closed' })
		empty(env)
		expect(await signups(env)).toBe(false)
		const first = await call(env, 'POST', '/api/v1/auth/signup', NEW)
		expect([first.res.status, await first.json()]).toEqual([403, { error: 'sign-up is by invitation on this server' }])
		expect(env.CONTROL.db.prepare('SELECT COUNT(*) AS n FROM users').get()).toEqual({ n: 0 })
	})

	it('keeps sign-up open by default', async () => {
		const env = fakeEnv()
		expect(await signups(env)).toBe(true)
		expect((await call(env, 'POST', '/api/v1/auth/signup', NEW)).res.status).toBe(201)
		expect(await signups(env)).toBe(true)
	})
})

describe('sites', () => {
	it('answers 409 for a domain that already exists (F22)', async () => {
		const env = fakeEnv()
		expect((await site(env, { domain: 'shop.com' })).res.status).toBe(201)
		const again = await site(env, { domain: 'shop.com', id: 'other' })
		expect([again.res.status, await again.json()]).toEqual([409, { error: 'shop.com is already on misomoon' }])
	})

	it('rejects a domain with no letters or digits, and one that gives no usable id (F24)', async () => {
		const env = fakeEnv()
		const dots = await site(env, { domain: '...' })
		expect([dots.res.status, await dots.json()]).toEqual([400, { error: 'domain is not valid' }])
		const short = await site(env, { domain: 'x' })
		expect([short.res.status, await short.json()]).toEqual([400, { error: 'could not make an id from this domain; pass an id' }])
	})

	it('shortens the id made from a long domain to 40 characters (F24)', async () => {
		const env = fakeEnv()
		const r = await site(env, { domain: `${'a'.repeat(70)}.com` })
		expect([r.res.status, (await r.json()).id]).toEqual([201, 'a'.repeat(40)])
	})

	it('validates the timezone on create and update (F26)', async () => {
		const env = fakeEnv()
		const bad = await site(env, { domain: 'shop.com', timezone: 'Mars/Base' })
		expect([bad.res.status, await bad.json()]).toEqual([400, { error: 'unknown timezone: Mars/Base' }])
		await site(env, { domain: 'shop.com', timezone: 'Asia/Jakarta' })
		const patch = await call(env, 'PATCH', '/api/v1/sites/shop-com', { timezone: 'Mars/Base' }, ADMIN)
		expect([patch.res.status, await patch.json()]).toEqual([400, { error: 'unknown timezone: Mars/Base' }])
	})

	it('keeps the name when PATCH sends an empty one, and trims a new one (F26)', async () => {
		const env = fakeEnv()
		await site(env, { domain: 'shop.com', name: 'Shop' })
		expect((await (await call(env, 'PATCH', '/api/v1/sites/shop-com', { name: '' }, ADMIN)).json()).name).toBe('Shop')
		expect((await (await call(env, 'PATCH', '/api/v1/sites/shop-com', { name: '  New ' }, ADMIN)).json()).name).toBe('New')
	})

	it('stores a currency per site, USD by default (F10)', async () => {
		const env = fakeEnv()
		expect((await (await site(env, { domain: 'a.com' })).json()).currency).toBe('USD')
		expect((await (await site(env, { domain: 'b.com', currency: 'eur' })).json()).currency).toBe('EUR')
		const bad = await site(env, { domain: 'c.com', currency: 'EURO' })
		expect([bad.res.status, await bad.json()]).toEqual([400, { error: 'currency must be a 3-letter ISO 4217 code' }])
		expect((await (await call(env, 'PATCH', '/api/v1/sites/a-com', { currency: 'jpy' }, ADMIN)).json()).currency).toBe('JPY')
	})
})

describe('install check', () => {
	const page = (html: string, status = 200) => {
		const urls: string[] = []
		vi.stubGlobal('fetch', async (url: string) => {
			urls.push(url)
			return new Response(html, { status, headers: { 'content-type': 'text/html' } })
		})
		return urls
	}
	const check = (env: FakeEnv, id = 'shop-com', headers = ADMIN) => call(env, 'GET', `/api/v1/sites/${id}/check`, undefined, headers)

	it('finds the site tag on its home page', async () => {
		const env = fakeEnv()
		await site(env, { domain: 'shop.com' })
		const urls = page('<head><script defer src="https://app.misomoon.com/m.js?s=shop-com"></script></head>')
		const r = await check(env)
		expect([r.res.status, await r.json(), urls]).toEqual([200, { url: 'https://shop.com/', status: 'found', http_status: 200, sites: ['shop-com'] }, ['https://shop.com/']])
	})

	it('names the other site when the page carries another tag', async () => {
		const env = fakeEnv()
		await site(env, { domain: 'shop.com' })
		page('<script defer src="/relay/m.js?s=old-shop"></script>')
		expect(await (await check(env)).json()).toEqual({ url: 'https://shop.com/', status: 'other_site', http_status: 200, sites: ['old-shop'] })
	})

	it('reports a page without the tag as missing', async () => {
		const env = fakeEnv()
		await site(env, { domain: 'shop.com' })
		page('<html><head><title>Shop</title></head></html>')
		expect(await (await check(env)).json()).toEqual({ url: 'https://shop.com/', status: 'missing', http_status: 200, sites: [] })
	})

	it('reports an error page as unreachable, with its status', async () => {
		const env = fakeEnv()
		await site(env, { domain: 'shop.com' })
		page('<script defer src="https://app.misomoon.com/m.js?s=shop-com"></script>', 503)
		expect(await (await check(env)).json()).toEqual({ url: 'https://shop.com/', status: 'unreachable', http_status: 503, sites: [], error: 'https://shop.com/ answered 503' })
	})

	it('reports a page that never answers as unreachable', async () => {
		const env = fakeEnv()
		await site(env, { domain: 'shop.com' })
		vi.stubGlobal('fetch', async () => {
			throw new TypeError('network connection lost')
		})
		expect(await (await check(env)).json()).toEqual({ url: 'https://shop.com/', status: 'unreachable', http_status: null, sites: [], error: 'could not connect to https://shop.com/' })
	})

	it('never opens a local address', async () => {
		const env = fakeEnv()
		await site(env, { domain: 'localhost:5173', id: 'dev' })
		const urls = page('')
		expect([await (await check(env, 'dev')).json(), urls]).toEqual([
			{ url: null, status: 'unreachable', http_status: null, sites: [], error: "localhost:5173 is not a public address, so misomoon can't open it" },
			[],
		])
	})

	it('needs a signed-in editor', async () => {
		const env = fakeEnv()
		await site(env, { domain: 'shop.com' })
		const urls = page('')
		const r = await check(env, 'shop-com', {})
		expect([r.res.status, urls]).toEqual([401, []])
	})
})

describe('goals', () => {
	it('answers 409 for a duplicate goal name (F22)', async () => {
		const env = fakeEnv()
		await site(env, { domain: 'shop.com' })
		await call(env, 'POST', '/api/v1/sites/shop-com/goals', { name: 'Signup', kind: 'event', match: 'Signup' }, ADMIN)
		const again = await call(env, 'POST', '/api/v1/sites/shop-com/goals', { name: 'Signup', kind: 'event', match: 'Other' }, ADMIN)
		expect([again.res.status, await again.json()]).toEqual([409, { error: 'a goal with this name already exists' }])
	})

	it('allows at most 50 goals per site (F21)', async () => {
		const env = fakeEnv()
		await site(env, { domain: 'shop.com' })
		for (let i = 0; i < 50; i++) await call(env, 'POST', '/api/v1/sites/shop-com/goals', { name: `g${i}`, kind: 'event', match: `e${i}` }, ADMIN)
		const over = await call(env, 'POST', '/api/v1/sites/shop-com/goals', { name: 'g50', kind: 'event', match: 'e50' }, ADMIN)
		expect([over.res.status, await over.json()]).toEqual([400, { error: 'a site has at most 50 goals' }])
	})

	it('pages and searches goal conversions (F21, F36)', async () => {
		const env = fakeEnv()
		await site(env, { domain: 'shop.com' })
		for (let i = 0; i < 30; i++) await call(env, 'POST', '/api/v1/sites/shop-com/goals', { name: `Goal ${String(i).padStart(2, '0')}`, kind: 'event', match: `e${i}` }, ADMIN)
		const page = async (q: string) => (await call(env, 'GET', `/api/v1/stats/breakdown?site=shop-com&property=goal&${q}`, undefined, ADMIN)).json()
		const p2 = await page('limit=10&page=2')
		const p3 = await page('limit=10&page=3')
		expect([p2.rows.length, p2.has_more, p3.rows.length, p3.has_more]).toEqual([10, true, 10, false])
		const found = await page('search=goal%202')
		expect(found.rows.map((r: { key: string }) => r.key).sort()).toEqual(['Goal 20', 'Goal 21', 'Goal 22', 'Goal 23', 'Goal 24', 'Goal 25', 'Goal 26', 'Goal 27', 'Goal 28', 'Goal 29'])
	})
})

describe('breakdown compare', () => {
	const view = async (env: FakeEnv, path: string, ip: string) => {
		const { ctx } = await call(env, 'POST', '/api/event', { s: 'shop-com', n: 'pageview', u: `https://shop.com${path}` }, { 'user-agent': UA, 'cf-connecting-ip': ip })
		await ctx.settle()
	}
	const pages = async (env: FakeEnv, q: string) => (await (await call(env, 'GET', `/api/v1/stats/breakdown?site=shop-com&property=page&period=today${q}`, undefined, ADMIN)).json()).rows

	it("gives each row its visitors in the period before, and 0 for a key that wasn't there", async () => {
		vi.useFakeTimers({ toFake: ['Date'] })
		// late yesterday, inside the comparison window however much of today has passed
		vi.setSystemTime(Date.UTC(2026, 9, 21, 18))
		const env = fakeEnv()
		await site(env, { domain: 'shop.com' })
		await view(env, '/a', '198.51.100.1')
		await view(env, '/b', '198.51.100.2')
		vi.setSystemTime(Date.UTC(2026, 9, 22, 10))
		await view(env, '/a', '198.51.100.1')
		await view(env, '/a', '198.51.100.3')
		await view(env, '/c', '198.51.100.4')
		const rows = await pages(env, '&compare=previous')
		expect(rows.map((r: { key: string; visitors: number; previous_visitors: number }) => [r.key, r.visitors, r.previous_visitors])).toEqual([
			['/a', 2, 1],
			['/c', 1, 0],
		])
		// without a comparison, rows have no previous_visitors
		expect((await pages(env, ''))[0]).not.toHaveProperty('previous_visitors')
	})
})

describe('keys', () => {
	it('answers 404 for a key scoped to a site that does not exist (F22)', async () => {
		const r = await call(fakeEnv(), 'POST', '/api/v1/keys', { name: 'k', site: 'nope' }, ADMIN)
		expect([r.res.status, await r.json()]).toEqual([404, { error: 'site nope not found' }])
	})

	it('lists keys without their hash and revokes one (F28)', async () => {
		const env = fakeEnv()
		await site(env, { domain: 'shop.com' })
		const made = await (await call(env, 'POST', '/api/v1/keys', { name: 'k', site: 'shop-com' }, ADMIN)).json()
		const list = await (await call(env, 'GET', '/api/v1/keys', undefined, ADMIN)).json()
		expect(list).toEqual([{ id: made.id, name: 'k', prefix: made.key.slice(0, 10), site_id: 'shop-com', created_at: expect.any(Number), last_used_at: null }])
		expect((await call(env, 'DELETE', `/api/v1/keys/${made.id}`, undefined, ADMIN)).res.status).toBe(204)
		const after = await call(env, 'GET', '/api/v1/stats/aggregate?site=shop-com', undefined, { authorization: `Bearer ${made.key}` })
		expect([after.res.status, await after.json()]).toEqual([401, { error: 'invalid API key' }])
	})

	it('rotates a key: same id, name and site, a new secret, and the old one stops working', async () => {
		const env = fakeEnv()
		await site(env, { domain: 'shop.com' })
		const made = await (await call(env, 'POST', '/api/v1/keys', { name: 'MCP', site: 'shop-com' }, ADMIN)).json()
		const stats = (key: string) => call(env, 'GET', '/api/v1/stats/aggregate?site=shop-com', undefined, { authorization: `Bearer ${key}` })
		await stats(made.key)
		const r = await call(env, 'POST', `/api/v1/keys/${made.id}/rotate`, undefined, ADMIN)
		const rotated = await r.json()
		expect([r.res.status, { ...rotated, key: undefined }]).toEqual([200, { id: made.id, name: 'MCP', prefix: rotated.key.slice(0, 10), site_id: 'shop-com', key: undefined }])
		expect(rotated.key).toMatch(/^mm_/)
		expect(rotated.key).not.toBe(made.key)
		expect((await stats(made.key)).res.status).toBe(401)
		expect((await stats(rotated.key)).res.status).toBe(200)
		const list = await (await call(env, 'GET', '/api/v1/keys', undefined, ADMIN)).json()
		expect(list).toEqual([{ id: made.id, name: 'MCP', prefix: rotated.prefix, site_id: 'shop-com', created_at: expect.any(Number), last_used_at: null }])
	})

	it('answers 404 when rotating a key that is not yours', async () => {
		const env = fakeEnv()
		await site(env, { domain: 'shop.com' })
		const made = await (await call(env, 'POST', '/api/v1/keys', { name: 'k', site: 'shop-com' }, ADMIN)).json()
		await env.CONTROL.prepare("INSERT INTO users (id, email, name, password_hash, created_at) VALUES ('u2', 'other@test', 'Other', 'x', 0)").run()
		await env.CONTROL.prepare('UPDATE api_keys SET user_id = ? WHERE id = ?').bind('u2', made.id).run()
		const hash = () => env.CONTROL.rows('SELECT hash FROM api_keys')
		const before = hash()
		const r = await call(env, 'POST', `/api/v1/keys/${made.id}/rotate`, undefined, ADMIN)
		expect([r.res.status, await r.json()]).toEqual([404, { error: 'key not found' }])
		expect(hash()).toEqual(before)
	})

	it('does not read keys from the query string (F28)', async () => {
		const env = fakeEnv()
		await site(env, { domain: 'shop.com' })
		const made = await (await call(env, 'POST', '/api/v1/keys', { name: 'k', site: 'shop-com' }, ADMIN)).json()
		const r = await call(env, 'GET', `/api/v1/stats/aggregate?site=shop-com&key=${made.key}`)
		expect([r.res.status, await r.json()]).toEqual([401, { error: 'sign in to see this site' }])
	})

	it('records last use at most once a minute per key (F11)', async () => {
		vi.useFakeTimers({ toFake: ['Date'] })
		vi.setSystemTime(Date.UTC(2026, 9, 22, 12))
		const env = fakeEnv()
		await site(env, { domain: 'shop.com' })
		const made = await (await call(env, 'POST', '/api/v1/keys', { name: 'k', site: 'shop-com' }, ADMIN)).json()
		const use = () => call(env, 'GET', '/api/v1/me', undefined, { authorization: `Bearer ${made.key}` })
		const lastUsed = () => (env.CONTROL.rows('SELECT last_used_at FROM api_keys')[0] as { last_used_at: number }).last_used_at
		await use()
		const first = lastUsed()
		vi.setSystemTime(Date.UTC(2026, 9, 22, 12, 0, 30))
		await use()
		expect(lastUsed()).toBe(first)
		vi.setSystemTime(Date.UTC(2026, 9, 22, 12, 1, 1))
		await use()
		expect([first, lastUsed()]).toEqual([Date.UTC(2026, 9, 22, 12), Date.UTC(2026, 9, 22, 12, 1, 1)])
	})
})

describe('ingest', () => {
	const beacon = (extra: Record<string, unknown> = {}) => ({ s: 'shop-com', n: 'pageview', u: 'https://shop.com/', ...extra })
	const send = (env: FakeEnv, body: unknown, headers: Record<string, string> = {}) =>
		call(env, 'POST', '/api/event', body, { 'user-agent': UA, 'cf-connecting-ip': '198.51.100.7', ...headers })
	const events = (env: FakeEnv) => [...env.SHARD_0.rows('SELECT name, revenue, currency FROM events'), ...env.SHARD_1.rows('SELECT name, revenue, currency FROM events')]

	it('writes the event directly when the queue send fails, and still answers 202 (F25)', async () => {
		const env = fakeEnv({ EVENTS: { send: async () => Promise.reject(new Error('queue down')) } })
		await site(env, { domain: 'shop.com' })
		const { res, ctx } = await send(env, beacon())
		await ctx.settle()
		expect([res.status, events(env).length]).toEqual([202, 1])
	})

	it('drops a beacon whose declared size is over 16 KB without reading it (F28)', async () => {
		const sent: unknown[] = []
		const env = fakeEnv({ EVENTS: { send: async (b) => void sent.push(b) } })
		await site(env, { domain: 'shop.com' })
		const { res } = await send(env, beacon(), { 'content-length': '20000' })
		expect([res.status, sent.length]).toEqual([202, 0])
	})

	it('stores a redelivered queue message once (F3)', async () => {
		const sent: { body: unknown }[] = []
		const env = fakeEnv({ EVENTS: { send: async (b) => void sent.push({ body: b }) } })
		await site(env, { domain: 'shop.com' })
		await send(env, beacon())
		const batch = (msgs: { body: unknown }[]) => ({ messages: msgs.map((m) => ({ ...m, ack() {}, retry() {} })), ackAll() {}, retryAll() {} })
		await worker.queue(batch(sent) as never, env as unknown as Env)
		await worker.queue(batch(structuredClone(sent)) as never, env as unknown as Env)
		const n = env.SHARD_0.rows('SELECT COUNT(*) AS n FROM events')[0].n + env.SHARD_1.rows('SELECT COUNT(*) AS n FROM events')[0].n
		const pv = [...env.SHARD_0.rows('SELECT pageviews FROM sessions'), ...env.SHARD_1.rows('SELECT pageviews FROM sessions')]
		expect([n, pv]).toEqual([1, [{ pageviews: 1 }]])
	})

	it("reports revenue in the site's currency (F10)", async () => {
		const env = fakeEnv()
		await site(env, { domain: 'shop.com', currency: 'EUR' })
		for (const [ip, $] of [['198.51.100.1', { a: 10, c: 'EUR' }], ['198.51.100.2', { a: 5, c: 'USD' }]] as const) {
			const { ctx } = await send(env, beacon({ n: 'Purchase', $ }), { 'cf-connecting-ip': ip })
			await ctx.settle()
		}
		const agg = await (await call(env, 'GET', '/api/v1/stats/aggregate?site=shop-com&period=today', undefined, ADMIN)).json()
		expect(agg.current.revenue).toBe(10)
	})
})

describe('site features', () => {
	const script = async (env: FakeEnv, query = '?s=shop-com') => (await call(env, 'GET', `/m.js${query}`)).res
	const beacon = async (env: FakeEnv, body: Record<string, unknown>, headers: Record<string, string> = {}) => {
		const { ctx } = await call(env, 'POST', '/api/event', { s: 'shop-com', ...body }, { 'user-agent': UA, 'cf-connecting-ip': '198.51.100.9', ...headers })
		await ctx.settle()
	}
	const pageview = (env: FakeEnv, u: string) => beacon(env, { n: 'pageview', u })
	const details = (env: FakeEnv) => [...env.SHARD_0.rows('SELECT detail FROM events'), ...env.SHARD_1.rows('SELECT detail FROM events')].map((r) => r.detail)
	const events = (env: FakeEnv, cols: string) => [...env.SHARD_0.rows(`SELECT ${cols} FROM events ORDER BY ts`), ...env.SHARD_1.rows(`SELECT ${cols} FROM events ORDER BY ts`)]

	it('serves m.js as the core plus the parts a site ticked, in one file', async () => {
		const env = fakeEnv()
		await site(env, { domain: 'shop.com' })
		// a new site has every feature
		const guarded = (names: string[]) => ['/* m.js */', 'if (window.misomoon && misomoon.x) {', ...names.map((n) => `/* ${n} */`), '}'].join('\n')
		expect(await (await script(env)).text()).toBe(guarded([...BROWSER_PARTS]))
		const r = await call(env, 'PATCH', '/api/v1/sites/shop-com', { features: ['content', 'outbound', 'clicks'] }, ADMIN)
		expect((await r.json()).features).toBe('outbound,clicks,content')
		const res = await script(env)
		expect([await res.text(), res.headers.get('cache-control')]).toEqual([guarded(['clicks', 'items', 'content', 'outbound']), 'public, max-age=300'])
		// without a known site, the core alone; a site id not created yet may be soon
		for (const q of ['?s=nobody', '?s=../x']) {
			const plain = await script(env, q)
			expect([await plain.text(), plain.headers.get('cache-control')]).toEqual(['/* m.js */', 'public, max-age=300'])
		}
		const none = await script(env, '')
		expect([await none.text(), none.headers.get('cache-control')]).toEqual(['/* m.js */', 'public, max-age=3600, stale-while-revalidate=86400'])
	})

	it('refuses an unknown feature, a bad search parameter or a bad path rule', async () => {
		const env = fakeEnv()
		await site(env, { domain: 'shop.com' })
		const bad = await call(env, 'PATCH', '/api/v1/sites/shop-com', { features: ['heatmap'] }, ADMIN)
		expect([bad.res.status, (await bad.json()).error]).toEqual([400, 'unknown feature: heatmap; use outbound, downloads, forms, events, payments, vitals, clicks, errors, fields, media, content, search'])
		expect((await call(env, 'PATCH', '/api/v1/sites/shop-com', { search_params: ['a b'] }, ADMIN)).res.status).toBe(400)
		const path = await call(env, 'PATCH', '/api/v1/sites/shop-com', { exclude_paths: ['admin'] }, ADMIN)
		expect([path.res.status, (await path.json()).error]).toEqual([400, 'exclude_paths takes up to 20 paths that start with /'])
	})

	it('reads the site search term from the page URL, with the parameters the site set', async () => {
		const env = fakeEnv()
		await site(env, { domain: 'shop.com' })
		await pageview(env, 'https://shop.com/search?q=Red+Shoes')
		await call(env, 'PATCH', '/api/v1/sites/shop-com', { search_params: ['term'] }, ADMIN)
		await pageview(env, 'https://shop.com/find?term=boots&q=ignored')
		await call(env, 'PATCH', '/api/v1/sites/shop-com', { features: ['vitals'] }, ADMIN)
		await pageview(env, 'https://shop.com/find?term=socks')
		expect(details(env).map(String).sort()).toEqual(['null', '{"q":"boots"}', '{"q":"red shoes"}'])
	})

	it("keeps out the views and time of pages the site's path rules leave out, but not its events", async () => {
		const env = fakeEnv()
		await site(env, { domain: 'shop.com' })
		const r = await call(env, 'PATCH', '/api/v1/sites/shop-com', { include_paths: ['/blog/**', '/#/app/*'], exclude_paths: ['/blog/drafts/*'] }, ADMIN)
		expect((await r.json()).exclude_paths).toBe('/blog/drafts/*')
		for (const u of ['https://shop.com/blog/2026/hello', 'https://shop.com/#/app/home', 'https://shop.com/pricing', 'https://shop.com/blog/drafts/x']) await pageview(env, u)
		await beacon(env, { e: 5000, d: 40, u: 'https://shop.com/pricing' })
		await beacon(env, { n: 'Signup', u: 'https://shop.com/pricing' })
		expect(events(env, 'name, pathname').map((e) => `${e.name} ${e.pathname}`)).toEqual(['pageview /blog/2026/hello', 'pageview /#/app/home', 'Signup /pricing'])
		await call(env, 'PATCH', '/api/v1/sites/shop-com', { include_paths: [], exclude_paths: null }, ADMIN)
		await pageview(env, 'https://shop.com/pricing')
		expect(events(env, 'name')).toHaveLength(4)
	})

	it("names m.js's beacons by what they carry, and takes the language from the request", async () => {
		const env = fakeEnv()
		await site(env, { domain: 'shop.com' })
		const lang = { 'accept-language': 'id-ID,id;q=0.9,en;q=0.8' }
		await beacon(env, { u: 'https://shop.com/', r: '', w: 390, y: 0.5 }, lang)
		// an engagement beacon adds to the pageview its view key names
		await beacon(env, { u: 'https://shop.com/', e: 4200, d: 63.7, y: 0.5 }, lang)
		// dropped: neither a pageview nor an engagement, and an engagement with no view key
		await beacon(env, { u: 'https://shop.com/', p: { plan: 'pro' } }, lang)
		await beacon(env, { u: 'https://shop.com/', e: 3000, d: 90 }, lang)
		await beacon(env, { n: 'Purchase', u: 'https://shop.com/', $: { amount: '19.5', currency: 'eur' }, y: 0.5 }, lang)
		expect(events(env, 'name, language, screen, scroll_depth, engaged_ms, revenue, currency')).toEqual([
			{ name: 'pageview', language: 'id-ID', screen: 'Mobile', scroll_depth: 64, engaged_ms: 4200, revenue: null, currency: null },
			{ name: 'Purchase', language: 'id-ID', screen: null, scroll_depth: null, engaged_ms: null, revenue: 19.5, currency: 'EUR' },
		])
	})
})

describe('page interactions', () => {
	const send = async (env: FakeEnv, body: Record<string, unknown>) => {
		const { ctx } = await call(env, 'POST', '/api/event', { s: 'shop-com', u: 'https://shop.com/pricing/', ...body }, { 'user-agent': UA, 'cf-connecting-ip': '198.51.100.7' })
		await ctx.settle()
	}
	const report = (env: FakeEnv, q: string) => call(env, 'GET', `/api/v1/stats/behavior?site=shop-com&period=today&${q}`, undefined, ADMIN)

	it('adds clicks from the engagement beacon to its pageview and reports them for one page', async () => {
		const env = fakeEnv()
		await site(env, { domain: 'shop.com' })
		await send(env, { n: 'pageview', y: 0.25 })
		await send(env, { n: 'engagement', e: 4000, d: 80, c: [['#buy', 'Buy now', 3, 1, 0]], y: 0.25 })
		const r = await (await report(env, 'report=clicks&page=/pricing/')).json()
		expect([r.report, r.page, r.pageviews, r.clicks, r.rage]).toEqual(['clicks', '/pricing/', 1, 3, 1])
		expect(r.elements).toEqual([{ page: '/pricing', selector: '#buy', label: 'Buy now', clicks: 3, visitors: 1, rage: 1, dead: 0 }])
		const scroll = await (await report(env, 'report=scroll&page=/pricing')).json()
		expect([scroll.visits, scroll.average]).toEqual([1, 80])
	})

	it('reads a site search term from the page URL only, not from a field the beacon sets', async () => {
		const env = fakeEnv()
		await site(env, { domain: 'shop.com' })
		await send(env, { n: 'pageview', u: 'https://shop.com/search?q=Tents', y: 0.1 })
		await send(env, { n: 'pageview', u: 'https://shop.com/pricing', q: 'free money', y: 0.2 })
		const r = await (await report(env, 'report=search')).json()
		expect(r.terms).toEqual([{ term: 'tents', searches: 1, visitors: 1 }])
	})

	it('answers 400 for an unknown report or a list of pages', async () => {
		const env = fakeEnv()
		await site(env, { domain: 'shop.com' })
		const unknown = await report(env, 'report=heat')
		expect([unknown.res.status, (await unknown.json()).error]).toEqual([400, 'unknown report: heat; use one of clicks, scroll, search, errors, forms, media, content'])
		expect((await report(env, 'report=clicks&page=/a|/b')).res.status).toBe(400)
	})
})

describe('shared links', () => {
	const send = async (env: FakeEnv, path: string) => {
		const { ctx } = await call(env, 'POST', '/api/event', { s: 'shop-com', n: 'pageview', u: `https://shop.com${path}` }, { 'user-agent': UA, 'cf-connecting-ip': '198.51.100.7' })
		await ctx.settle()
	}
	const segment = async (env: FakeEnv, body: Record<string, unknown>, site = 'shop-com') => (await (await call(env, 'POST', `/api/v1/sites/${site}/segments`, body, ADMIN)).json()).id as string
	/** a link limited to /pricing, unlocked, with its read-only session */
	async function pricingLink() {
		const env = fakeEnv()
		await site(env, { domain: 'shop.com' })
		await send(env, '/pricing')
		await send(env, '/admin')
		const seg = await segment(env, { name: 'Pricing', filters: 'page==/pricing' })
		const { slug } = await (await call(env, 'POST', '/api/v1/sites/shop-com/shared', { name: 'Client', segment_id: seg }, ADMIN)).json()
		const { token } = await (await call(env, 'POST', `/api/v1/share/${slug}`, {})).json()
		const viewer = { authorization: `Bearer ${token}` }
		const pageviews = async () => (await (await call(env, 'GET', '/api/v1/stats/aggregate?site=shop-com&period=today', undefined, viewer)).json()).current.pageviews
		return { env, seg, slug, viewer, pageviews }
	}

	it("applies the link's segment to a page interaction report for another page", async () => {
		const { env, viewer, pageviews } = await pricingLink()
		expect(await pageviews()).toBe(1)
		const r = await (await call(env, 'GET', '/api/v1/stats/behavior?site=shop-com&period=today&report=clicks&page=/admin', undefined, viewer)).json()
		expect(r.pageviews).toBe(0)
	})

	it('refuses to delete a segment a link is limited to, which would open the link to the whole site', async () => {
		const { env, seg, slug, pageviews } = await pricingLink()
		const del = await call(env, 'DELETE', `/api/v1/sites/shop-com/segments/${seg}`, undefined, ADMIN)
		expect([del.res.status, (await del.json()).error]).toEqual([409, 'the shared link "Client" shows only this segment; delete the link first'])
		expect(await pageviews()).toBe(1)
		expect((await call(env, 'DELETE', `/api/v1/sites/shop-com/shared/${slug}`, undefined, ADMIN)).res.status).toBe(204)
		expect((await call(env, 'DELETE', `/api/v1/sites/shop-com/segments/${seg}`, undefined, ADMIN)).res.status).toBe(204)
	})

	it("limits a link only to a segment of its own site that every editor sees, not another site's or a personal one", async () => {
		const env = fakeEnv()
		await site(env, { domain: 'shop.com' })
		await site(env, { domain: 'blog.com' })
		const other = await segment(env, { name: 'Posts', filters: 'page==/posts' }, 'blog-com')
		const personal = await segment(env, { name: 'Mine', filters: 'page==/pricing', personal: true })
		for (const segment_id of [other, personal, 'missing']) {
			const r = await call(env, 'POST', '/api/v1/sites/shop-com/shared', { segment_id }, ADMIN)
			expect([r.res.status, (await r.json()).error]).toEqual([400, 'segment_id must be a saved filter of this site that the whole team sees'])
		}
	})
})

describe('shards', () => {
	it.each(['draining', 'readonly'])('moves a site off a %s shard from tomorrow, not from the day of a late event (F4, F27)', async (status) => {
		vi.useFakeTimers({ toFake: ['Date'] })
		const now = Date.UTC(2026, 9, 22, 12)
		vi.setSystemTime(now)
		const env = fakeEnv()
		await site(env, { domain: 'shop.com' })
		const e = env as unknown as Env
		const first = await writeShard(e, 'shop-com', now)
		const other = first === 'shard_0' ? 'shard_1' : 'shard_0'
		env.CONTROL.db.prepare('UPDATE shards SET status = ? WHERE name = ?').run(status, first)
		invalidate('')
		const today = Math.floor(now / DAY)
		// a message held back in the queue for three days arrives first
		expect(await writeShard(e, 'shop-com', now - 3 * DAY)).toBe(first)
		expect(env.CONTROL.rows('SELECT shard, from_day, to_day FROM shard_map ORDER BY from_day')).toEqual([
			{ shard: first, from_day: 0, to_day: today },
			{ shard: other, from_day: today + 1, to_day: null },
		])
	})

	it('keeps maintaining the other shards when one fails (F28)', async () => {
		vi.useFakeTimers({ toFake: ['Date'] })
		const now = Date.UTC(2026, 9, 22, 12)
		vi.setSystemTime(now)
		const env = fakeEnv({ RETENTION_DAYS: '1' })
		await site(env, { domain: 'shop.com' })
		// one old event on each shard
		for (const db of [env.SHARD_0, env.SHARD_1]) {
			db.db.prepare("INSERT INTO events (event_id, site_id, ts, name, visitor_id, session_id) VALUES ('old', 'shop-com', ?, 'pageview', 'v', 's')").run(now - 3 * DAY)
		}
		// both shards were registered long before one of them fails
		await getShards(env as unknown as Env)
		env.SHARD_0.broken = new Error('shard 0 unavailable')
		const ctx = fakeCtx()
		await worker.scheduled({} as ScheduledController, env as unknown as Env, ctx as unknown as ExecutionContext)
		const results = await ctx.settle()
		env.SHARD_0.broken = null
		expect(results.map((r) => r.status)).toEqual(results.map(() => 'fulfilled'))
		expect([env.SHARD_0.rows('SELECT COUNT(*) AS n FROM events')[0].n, env.SHARD_1.rows('SELECT COUNT(*) AS n FROM events')[0].n]).toEqual([1, 0])
	})

	it('keeps the isolate cache bounded (F28)', async () => {
		const env = fakeEnv()
		for (let i = 0; i < 5100; i++) await call(env, 'POST', '/api/event', { s: `random-${i}`, n: 'pageview', u: 'https://x.com/' }, { 'user-agent': UA })
		expect(cacheSize()).toBeLessThanOrEqual(5000)
	})
})

describe('dashboard pages', () => {
	it('refuse to load in a frame on another site, except the demo and shared links', async () => {
		const env = fakeEnv()
		const head = async (path: string) => {
			const { res } = await call(env, 'GET', path)
			return [path, res.headers.get('content-security-policy'), res.headers.get('x-frame-options'), res.headers.get('x-content-type-options'), res.headers.get('referrer-policy')]
		}
		expect(await Promise.all(['/', '/shop-com/settings', '/demo', '/share/abc'].map(head))).toEqual([
			['/', "frame-ancestors 'self'", 'SAMEORIGIN', 'nosniff', 'strict-origin-when-cross-origin'],
			['/shop-com/settings', "frame-ancestors 'self'", 'SAMEORIGIN', 'nosniff', 'strict-origin-when-cross-origin'],
			['/demo', null, null, 'nosniff', 'strict-origin-when-cross-origin'],
			['/share/abc', null, null, 'nosniff', 'strict-origin-when-cross-origin'],
		])
	})
})

describe('proxy hostnames (F9)', () => {
	const proxied = () => {
		const env = fakeEnv({ PROXY_CNAME_TARGET: 'proxy.misomoon.test' })
		return env
	}

	it('serves the dashboard only on its own host', async () => {
		const env = proxied()
		await site(env, { domain: 'shop.com' })
		env.CONTROL.db.prepare("INSERT INTO proxy_domains (hostname, site_id, cf_id, status, created_at) VALUES ('stats.shop.com', 'shop-com', 'cf1', 'active', 0)").run()
		const onProxy = await call(env, 'GET', '/', undefined, {}, 'stats.shop.com')
		const asset = await call(env, 'GET', '/assets/index.js', undefined, {}, 'stats.shop.com')
		const tracker = await call(env, 'GET', '/m.js', undefined, {}, 'stats.shop.com')
		const overlay = await call(env, 'GET', '/overlay.js', undefined, {}, 'stats.shop.com')
		const own = await call(env, 'GET', '/', undefined, {}, 'app.test')
		expect([onProxy.res.status, asset.res.status, tracker.res.status, own.res.status, await own.res.text()]).toEqual([404, 404, 200, 200, '<!doctype html>dashboard'])
		expect([overlay.res.status, await overlay.res.text()]).toEqual([200, '/* overlay.js */'])
	})

	it('keeps the working hostname when Cloudflare rejects a new one (F28)', async () => {
		const env = fakeEnv({ PROXY_CNAME_TARGET: 'proxy.misomoon.test', CF_API_TOKEN: 't', CF_ZONE_ID: 'z' })
		await site(env, { domain: 'shop.com' })
		env.CONTROL.db.prepare("INSERT INTO proxy_domains (hostname, site_id, cf_id, status, ssl_status, created_at) VALUES ('stats.shop.com', 'shop-com', 'cf1', 'active', 'active', 0)").run()
		const calls: string[] = []
		vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
			calls.push(`${init.method} ${url.split('custom_hostnames')[1]}`)
			return Response.json({ success: false, errors: [{ message: 'hostname not allowed' }] }, { status: 400 })
		})
		const r = await call(env, 'PUT', '/api/v1/sites/shop-com/proxy', { hostname: 'go.shop.com' }, ADMIN)
		expect([r.res.status, calls, env.CONTROL.rows('SELECT hostname FROM proxy_domains')]).toEqual([502, ['POST '], [{ hostname: 'stats.shop.com' }]])
	})
})

describe('mcp', () => {
	const rpc = (env: FakeEnv, body: unknown) => call(env, 'POST', '/mcp', body, ADMIN)
	const ping = (id: number) => ({ jsonrpc: '2.0', id, method: 'ping' })

	it('answers an empty batch with Invalid Request', async () => {
		const r = await rpc(fakeEnv(), [])
		expect([r.res.status, await r.json()]).toEqual([200, { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } }])
	})

	it('accepts a client response message without replying', async () => {
		const r = await rpc(fakeEnv(), { jsonrpc: '2.0', id: 7, result: {} })
		expect([r.res.status, await r.res.text()]).toEqual([202, ''])
	})

	it('limits a batch to 20 requests (F12)', async () => {
		const env = fakeEnv()
		expect((await (await rpc(env, Array.from({ length: 20 }, (_, i) => ping(i)))).json())).toHaveLength(20)
		const over = await rpc(env, Array.from({ length: 21 }, (_, i) => ping(i)))
		expect([over.res.status, await over.json()]).toEqual([400, { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'a batch is limited to 20 requests' } }])
	})

	it('marks only add_annotation as a tool that writes', async () => {
		const r = await rpc(fakeEnv(), { jsonrpc: '2.0', id: 1, method: 'tools/list' })
		const { result } = (await r.json()) as { result: { tools: { name: string; annotations: Record<string, boolean> }[] } }
		const writes = result.tools.filter((t) => !t.annotations.readOnlyHint)
		expect(writes.map((t) => [t.name, t.annotations])).toEqual([['add_annotation', { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }]])
		expect(result.tools.length).toBeGreaterThan(10)
	})

	it('refuses a body over 64 KB (F12)', async () => {
		const r = await rpc(fakeEnv(), JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping', params: { pad: 'x'.repeat(70_000) } }))
		expect([r.res.status, await r.json()]).toEqual([413, { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'request body is limited to 64 KB' } }])
	})
})

describe('funnel input (F14)', () => {
	it.each([
		[{ steps: [{ kind: 'page', match: '/', label: 1 }, { kind: 'page', match: '/a' }] }, 'step label must be text'],
		[{ steps: [{ kind: 'page', match: '/' }, { kind: 'page', match: '/a' }], filters: [] }, 'filters must be a string'],
	])('answers 400 for %j', async (body, error) => {
		const env = fakeEnv()
		await site(env, { domain: 'shop.com' })
		const r = await call(env, 'POST', '/api/v1/stats/funnel', { site: 'shop-com', ...body }, ADMIN)
		expect([r.res.status, await r.json()]).toEqual([400, { error }])
	})
})

describe('privacy settings', () => {
	const beacon = async (env: FakeEnv, headers: Record<string, string> = {}) => {
		const { ctx } = await call(env, 'POST', '/api/event', { s: 'shop-com', n: 'pageview', u: 'https://shop.com/' }, { 'user-agent': UA, 'cf-connecting-ip': '198.51.100.9', ...headers })
		await ctx.settle()
	}
	const count = (env: FakeEnv, site = 'shop-com') =>
		Number(env.SHARD_0.rows('SELECT COUNT(*) AS n FROM events WHERE site_id = ?', site)[0].n) + Number(env.SHARD_1.rows('SELECT COUNT(*) AS n FROM events WHERE site_id = ?', site)[0].n)

	it('stores excluded IPs, browser signals and retention, and refuses bad values', async () => {
		const env = fakeEnv()
		const made = await (await site(env, { domain: 'shop.com' })).json()
		expect([made.exclude_ips, made.privacy_signals, made.retention_days]).toEqual([null, 0, null])
		const r = await call(env, 'PATCH', '/api/v1/sites/shop-com', { exclude_ips: ['203.0.113.7', '2001:db8::/32'], privacy_signals: true, retention_days: 395 }, ADMIN)
		const saved = await r.json()
		expect([saved.exclude_ips, saved.privacy_signals, saved.retention_days]).toEqual(['203.0.113.7,2001:db8::/32', 1, 395])
		// fields left out keep their values; null clears them
		const kept = await (await call(env, 'PATCH', '/api/v1/sites/shop-com', { name: 'Shop' }, ADMIN)).json()
		expect([kept.exclude_ips, kept.privacy_signals, kept.retention_days]).toEqual(['203.0.113.7,2001:db8::/32', 1, 395])
		const cleared = await (await call(env, 'PATCH', '/api/v1/sites/shop-com', { exclude_ips: null, privacy_signals: false, retention_days: null }, ADMIN)).json()
		expect([cleared.exclude_ips, cleared.privacy_signals, cleared.retention_days]).toEqual([null, 0, null])
		const ip = await call(env, 'PATCH', '/api/v1/sites/shop-com', { exclude_ips: ['office'] }, ADMIN)
		expect([ip.res.status, (await ip.json()).error]).toEqual([400, 'exclude_ips takes up to 50 IP addresses or ranges, such as 203.0.113.7 or 2001:db8::/32'])
		const days = await call(env, 'PATCH', '/api/v1/sites/shop-com', { retention_days: 7 }, ADMIN)
		expect([days.res.status, (await days.json()).error]).toEqual([400, 'retention_days is a whole number of days from 30 to 3650, or null'])
		const signals = await call(env, 'PATCH', '/api/v1/sites/shop-com', { privacy_signals: 'yes' }, ADMIN)
		expect([signals.res.status, (await signals.json()).error]).toEqual([400, 'privacy_signals must be true or false'])
	})

	it('drops beacons from excluded IP addresses, before they count toward anything', async () => {
		const env = fakeEnv()
		await site(env, { domain: 'shop.com' })
		await call(env, 'PATCH', '/api/v1/sites/shop-com', { exclude_ips: ['198.51.100.0/24'] }, ADMIN)
		await beacon(env)
		await beacon(env, { 'cf-connecting-ip': '203.0.113.1' })
		expect(count(env)).toBe(1)
	})

	it('drops beacons from browsers that send Global Privacy Control or Do Not Track, only when the site asks', async () => {
		const env = fakeEnv()
		await site(env, { domain: 'shop.com' })
		await beacon(env, { 'sec-gpc': '1' })
		expect(count(env)).toBe(1)
		await call(env, 'PATCH', '/api/v1/sites/shop-com', { privacy_signals: true }, ADMIN)
		await beacon(env, { 'sec-gpc': '1' })
		await beacon(env, { dnt: '1' })
		await beacon(env, { dnt: '0' })
		expect(count(env)).toBe(2)
	})

	it("deletes each site's data after its own retention, within the server's", async () => {
		vi.useFakeTimers({ toFake: ['Date'] })
		const now = Date.UTC(2026, 9, 22, 12)
		vi.setSystemTime(now)
		const env = fakeEnv({ RETENTION_DAYS: '0' })
		await site(env, { domain: 'shop.com' })
		await site(env, { domain: 'blog.com' })
		await call(env, 'PATCH', '/api/v1/sites/shop-com', { retention_days: 30 }, ADMIN)
		for (const [id, age] of [['shop-com', 31], ['shop-com', 29], ['blog-com', 31]] as const) {
			env.SHARD_0.db
				.prepare("INSERT INTO events (event_id, site_id, ts, name, visitor_id, session_id) VALUES (?, ?, ?, 'pageview', 'v', 's')")
				.run(`${id}-${age}`, id, now - age * DAY)
			env.SHARD_0.db.prepare('INSERT INTO sessions (site_id, session_id, visitor_id, started_at, last_at) VALUES (?, ?, ?, ?, ?)').run(id, `${id}-${age}`, 'v', now - age * DAY, now - age * DAY)
		}
		const ctx = fakeCtx()
		await worker.scheduled({} as ScheduledController, env as unknown as Env, ctx as unknown as ExecutionContext)
		await ctx.settle()
		expect(env.SHARD_0.rows('SELECT event_id FROM events ORDER BY event_id').map((r) => r.event_id)).toEqual(['blog-com-31', 'shop-com-29'])
		expect(env.SHARD_0.rows('SELECT session_id FROM sessions ORDER BY session_id').map((r) => r.session_id)).toEqual(['blog-com-31', 'shop-com-29'])
	})

	it('forgets expired sign-in sessions and password reset links every hour', async () => {
		const env = fakeEnv()
		const past = Date.now() - 1000
		env.CONTROL.db.prepare('INSERT INTO sessions (hash, user_id, expires_at, created_at) VALUES (?, ?, ?, 0)').run('expired', 'u1', past)
		env.CONTROL.db.prepare('INSERT INTO password_resets (hash, user_id, expires_at) VALUES (?, ?, ?), (?, ?, ?)').run('used-up', 'u1', past, 'fresh', 'u1', Date.now() + 3_600_000)
		const ctx = fakeCtx()
		await worker.scheduled({} as ScheduledController, env as unknown as Env, ctx as unknown as ExecutionContext)
		await ctx.settle()
		expect(env.CONTROL.rows("SELECT hash FROM sessions WHERE hash = 'expired'")).toEqual([])
		expect(env.CONTROL.rows('SELECT hash FROM password_resets')).toEqual([{ hash: 'fresh' }])
		expect((await call(env, 'GET', '/api/v1/me', undefined, ADMIN)).res.status).toBe(200)
	})

	it('deletes old data once a day, at 03:15 UTC, and not in the other hourly runs', async () => {
		vi.useFakeTimers({ toFake: ['Date'] })
		const now = Date.UTC(2026, 9, 22, 4, 15)
		vi.setSystemTime(now)
		const env = fakeEnv({ RETENTION_DAYS: '30' })
		await site(env, { domain: 'shop.com' })
		env.SHARD_0.db.prepare("INSERT INTO events (event_id, site_id, ts, name, visitor_id, session_id) VALUES ('old', 'shop-com', ?, 'pageview', 'v', 's')").run(now - 31 * DAY)
		const run = async (hour: number, minute: number) => {
			const ctx = fakeCtx()
			const controller = { cron: '*/5 * * * *', scheduledTime: Date.UTC(2026, 9, 22, hour, minute) } as ScheduledController
			await worker.scheduled(controller, env as unknown as Env, ctx as unknown as ExecutionContext)
			await ctx.settle()
			return env.SHARD_0.rows('SELECT COUNT(*) AS n FROM events')[0].n
		}
		expect(await run(4, 15)).toBe(1)
		expect(await run(3, 20)).toBe(1)
		expect(await run(3, 15)).toBe(0)
	})

	it('keeps a site that sets none for the server default, and caps every site at the longest', async () => {
		vi.useFakeTimers({ toFake: ['Date'] })
		const now = Date.UTC(2026, 9, 22, 12)
		vi.setSystemTime(now)
		const env = fakeEnv({ RETENTION_DAYS: '60', RETENTION_DEFAULT_DAYS: '40' })
		await site(env, { domain: 'shop.com' })
		await site(env, { domain: 'blog.com' })
		await site(env, { domain: 'docs.com' })
		await call(env, 'PATCH', '/api/v1/sites/blog-com', { retention_days: 30 }, ADMIN)
		// saved before the server had a limit
		env.CONTROL.db.prepare("UPDATE sites SET retention_days = 3650 WHERE id = 'docs-com'").run()
		invalidate('site:docs-com')
		for (const id of ['shop-com', 'blog-com', 'docs-com'])
			for (const age of [35, 45, 61])
				env.SHARD_0.db.prepare("INSERT INTO events (event_id, site_id, ts, name, visitor_id, session_id) VALUES (?, ?, ?, 'pageview', 'v', 's')").run(`${id}-${age}`, id, now - age * DAY)
		const ctx = fakeCtx()
		await worker.scheduled({} as ScheduledController, env as unknown as Env, ctx as unknown as ExecutionContext)
		await ctx.settle()
		// shop keeps 40 days (the default), blog 30 (its own), docs 60 (the longest)
		expect(env.SHARD_0.rows('SELECT event_id FROM events ORDER BY event_id').map((r) => r.event_id)).toEqual(['docs-com-35', 'docs-com-45', 'shop-com-35'])
	})

	it('tells the dashboard the limits and refuses a site setting past the longest', async () => {
		const env = fakeEnv({ RETENTION_DAYS: '1825', RETENTION_DEFAULT_DAYS: '761' })
		await site(env, { domain: 'shop.com' })
		expect((await (await call(env, 'GET', '/api/v1/me', undefined, ADMIN)).json()).retention).toEqual({ max: 1825, default: 761 })
		const long = await call(env, 'PATCH', '/api/v1/sites/shop-com', { retention_days: 3650 }, ADMIN)
		expect([long.res.status, (await long.json()).error]).toEqual([400, 'retention_days is a whole number of days from 30 to 1825, or null'])
		const most = await (await call(env, 'PATCH', '/api/v1/sites/shop-com', { retention_days: 1825 }, ADMIN)).json()
		expect(most.retention_days).toBe(1825)
		expect((await (await call(env, 'GET', '/api/v1/me', undefined, ADMIN)).json()).retention).toEqual({ max: 1825, default: 761 })
		expect((await (await call(fakeEnv(), 'GET', '/api/v1/me')).json()).retention).toEqual({ max: 0, default: 0 })
	})

	it('deletes payments, with the keys they wait for, after the same retention', async () => {
		vi.useFakeTimers({ toFake: ['Date'] })
		const now = Date.UTC(2026, 9, 22, 12)
		vi.setSystemTime(now)
		const env = fakeEnv({ RETENTION_DAYS: '0' })
		await site(env, { domain: 'shop.com' })
		await site(env, { domain: 'blog.com' })
		await call(env, 'PATCH', '/api/v1/sites/shop-com', { retention_days: 30 }, ADMIN)
		for (const [id, age] of [['shop-com', 31], ['shop-com', 29], ['blog-com', 31]] as const) {
			env.CONTROL.db
				.prepare("INSERT INTO payments (site_id, provider, id, kind, amount, currency, ts, keys, links, visit, created_at) VALUES (?, 'stripe', ?, 'payment', 10, 'USD', ?, '[]', '[]', '{}', ?)")
				.run(id, `${id}-${age}`, now - age * DAY, now - age * DAY)
			env.CONTROL.db.prepare("INSERT INTO payment_keys (site_id, key, provider, payment_id, created_at) VALUES (?, 'stripe:cus_1', 'stripe', ?, ?)").run(id, `${id}-${age}`, now)
		}
		const ctx = fakeCtx()
		await worker.scheduled({} as ScheduledController, env as unknown as Env, ctx as unknown as ExecutionContext)
		await ctx.settle()
		expect(env.CONTROL.rows('SELECT id FROM payments ORDER BY id').map((r) => r.id)).toEqual(['blog-com-31', 'shop-com-29'])
		expect(env.CONTROL.rows('SELECT payment_id FROM payment_keys ORDER BY payment_id').map((r) => r.payment_id)).toEqual(['blog-com-31', 'shop-com-29'])
	})
})

describe('account deletion', () => {
	const PASSWORD = 'a long password'
	const signup = async (env: FakeEnv, email: string) => {
		const made = await (await call(env, 'POST', '/api/v1/auth/signup', { email, name: email.split('@')[0], password: PASSWORD })).json()
		return { id: made.user.id as string, auth: { authorization: `Bearer ${made.token}` } }
	}
	const remove = (env: FakeEnv, auth: Record<string, string>) => call(env, 'DELETE', '/api/v1/me', { password: PASSWORD }, auth)
	const n = (env: FakeEnv, sql: string, ...params: unknown[]) => Number(env.CONTROL.rows(`SELECT COUNT(*) AS n FROM ${sql}`, ...params)[0].n)

	it('needs the password', async () => {
		const env = fakeEnv()
		const ana = await signup(env, 'ana@example.com')
		for (const body of [{ password: 'not it' }, {}]) {
			const r = await call(env, 'DELETE', '/api/v1/me', body, ana.auth)
			expect([r.res.status, await r.json()]).toEqual([401, { error: 'your password is wrong' }])
		}
		expect(n(env, 'users WHERE id = ?', ana.id)).toBe(1)
		const key = await call(env, 'DELETE', '/api/v1/me', { password: PASSWORD })
		expect(key.res.status).toBe(401)
	})

	it('deletes the account, its sessions and keys, and the teams and sites only it was in, with their stats', async () => {
		const env = fakeEnv()
		const ana = await signup(env, 'ana@example.com')
		expect((await call(env, 'POST', '/api/v1/sites', { domain: 'ana.com' }, ana.auth)).res.status).toBe(201)
		await call(env, 'POST', '/api/v1/keys', { name: 'ci' }, ana.auth)
		const { ctx } = await call(env, 'POST', '/api/event', { s: 'ana-com', n: 'pageview', u: 'https://ana.com/' }, { 'user-agent': UA, 'cf-connecting-ip': '198.51.100.9' })
		await ctx.settle()
		const r = await remove(env, ana.auth)
		expect(r.res.status).toBe(204)
		expect([n(env, 'users WHERE id = ?', ana.id), n(env, 'sessions WHERE user_id = ?', ana.id), n(env, 'api_keys WHERE user_id = ?', ana.id), n(env, "sites WHERE id = 'ana-com'"), n(env, 'team_members WHERE user_id = ?', ana.id)]).toEqual([0, 0, 0, 0, 0])
		expect(n(env, "teams WHERE name = 'ana''s sites'")).toBe(0)
		expect(Number(env.SHARD_0.rows("SELECT COUNT(*) AS n FROM events WHERE site_id = 'ana-com'")[0].n) + Number(env.SHARD_1.rows("SELECT COUNT(*) AS n FROM events WHERE site_id = 'ana-com'")[0].n)).toBe(0)
		// the old session no longer signs in
		expect((await call(env, 'GET', '/api/v1/me', undefined, ana.auth)).res.status).toBe(401)
	})

	it('refuses to delete a team, or the account that is its only member, while its Polar plan still renews', async () => {
		const env = fakeEnv()
		const ana = await signup(env, 'ana@example.com')
		const team = env.CONTROL.rows('SELECT team_id FROM team_members WHERE user_id = ?', ana.id)[0].team_id as string
		const name = env.CONTROL.rows('SELECT name FROM teams WHERE id = ?', team)[0].name as string
		env.CONTROL.db
			.prepare("INSERT INTO polar_subscriptions (id, team_id, customer_id, plan, status, live, plan_status, period_end, started_at, modified_at) VALUES ('sub1', ?, 'cus1', 'growth', 'active', 1, 'active', 9e12, 0, 0)")
			.run(team)
		const message = `cancel the plan of ${name} first, under Settings > Team > Manage billing; the team can go once it stops renewing`
		const asTeam = await call(env, 'DELETE', `/api/v1/teams/${team}`, undefined, ana.auth)
		expect([asTeam.res.status, (await asTeam.res.json()).error]).toEqual([409, message])
		const asAccount = await remove(env, ana.auth)
		expect([asAccount.res.status, (await asAccount.res.json()).error]).toEqual([409, message])
		expect([n(env, 'users WHERE id = ?', ana.id), n(env, 'teams WHERE id = ?', team)]).toEqual([1, 1])
		// canceled at the end of its period, it bills no more
		env.CONTROL.db.prepare("UPDATE polar_subscriptions SET plan_status = 'canceled'").run()
		expect((await remove(env, ana.auth)).res.status).toBe(204)
	})

	it('refuses while the account is the only owner of a team that has other members', async () => {
		const env = fakeEnv()
		const ana = await signup(env, 'ana@example.com')
		const ben = await signup(env, 'ben@example.com')
		const team = env.CONTROL.rows('SELECT team_id FROM team_members WHERE user_id = ?', ana.id)[0].team_id
		env.CONTROL.db.prepare("INSERT INTO team_members (team_id, user_id, role, created_at) VALUES (?, ?, 'editor', 0)").run(team, ben.id)
		const r = await remove(env, ana.auth)
		expect([r.res.status, await r.json()]).toEqual([409, { error: "you are the only owner of ana's sites; make someone else owner or remove its members first" }])
		expect(n(env, 'users WHERE id = ?', ana.id)).toBe(1)
		// a member who is not an owner leaves the team; the team stays
		expect((await remove(env, ben.auth)).res.status).toBe(204)
		expect([n(env, 'teams WHERE id = ?', team), n(env, 'team_members WHERE team_id = ?', team), n(env, 'users WHERE id = ?', ben.id)]).toEqual([1, 1, 0])
	})

	it('removes guest access, and the invitations and email reports sent to the account’s email', async () => {
		const env = fakeEnv()
		await site(env, { domain: 'shop.com' })
		const ana = await signup(env, 'ana@example.com')
		env.CONTROL.db.prepare("INSERT INTO site_guests (site_id, user_id, role, created_at) VALUES ('shop-com', ?, 'viewer', 0)").run(ana.id)
		env.CONTROL.db.prepare("INSERT INTO invitations (id, team_id, email, role, hash, expires_at, created_at) VALUES ('i1', 't1', 'ANA@example.com', 'viewer', 'h', 9e15, 0)").run()
		env.CONTROL.db.prepare("INSERT INTO email_reports (id, site_id, email, kind, created_at) VALUES ('r1', 'shop-com', 'ana@example.com', 'weekly', 0), ('r2', 'shop-com', 'owner@test', 'weekly', 0)").run()
		expect((await remove(env, ana.auth)).res.status).toBe(204)
		expect([n(env, 'site_guests WHERE user_id = ?', ana.id), n(env, "invitations WHERE id = 'i1'"), n(env, "sites WHERE id = 'shop-com'")]).toEqual([0, 0, 1])
		expect(env.CONTROL.rows('SELECT id FROM email_reports').map((r) => r.id)).toEqual(['r2'])
	})
})

describe('regions', () => {
	/** A server with EU and US shards only (two in the EU), and no shard without a region. */
	const regional = (extra: Record<string, unknown> = {}) => {
		const env = fakeEnv() as FakeEnv & Record<string, unknown>
		delete (env as Partial<FakeEnv>).SHARD_0
		delete (env as Partial<FakeEnv>).SHARD_1
		Object.assign(env, { SHARD_EU_0: freshShard(), SHARD_EU_1: freshShard(), SHARD_US_0: freshShard() }, extra)
		return env as FakeEnv
	}
	const db = (env: FakeEnv, binding: string) => (env as unknown as Record<string, ReturnType<typeof freshShard>>)[binding]
	const stored = (env: FakeEnv, binding: string) => Number(db(env, binding).rows('SELECT COUNT(*) AS n FROM events')[0].n)
	const beacon = async (env: FakeEnv, s: string, u: string) => {
		const { ctx } = await call(env, 'POST', '/api/event', { s, n: 'pageview', u }, { 'user-agent': UA, 'cf-connecting-ip': '198.51.100.9' })
		await ctx.settle()
	}

	it('lists the regions a new site can use', async () => {
		expect((await (await call(fakeEnv(), 'GET', '/api/v1/me', undefined, ADMIN)).json()).regions).toEqual([])
		// another server: the isolate cache belongs to the first one
		invalidate('')
		expect((await (await call(regional(), 'GET', '/api/v1/me', undefined, ADMIN)).json()).regions).toEqual(['eu', 'us'])
	})

	it("stores a site's events only on its region's shards", async () => {
		const env = regional()
		const us = await (await site(env, { domain: 'shop.com', region: 'us' })).json()
		expect(us.region).toBe('us')
		await beacon(env, 'shop-com', 'https://shop.com/')
		expect([stored(env, 'SHARD_US_0'), stored(env, 'SHARD_EU_0') + stored(env, 'SHARD_EU_1')]).toEqual([1, 0])
		expect(env.CONTROL.rows("SELECT shard FROM shard_map WHERE site_id = 'shop-com'")).toEqual([{ shard: 'shard_us_0' }])
		const agg = await (await call(env, 'GET', '/api/v1/stats/aggregate?site=shop-com&period=today', undefined, ADMIN)).json()
		expect(agg.current.pageviews).toBe(1)
	})

	it("guesses a new site's region from its timezone, and keeps none on a server without regions", async () => {
		const env = regional()
		expect((await (await site(env, { domain: 'berlin.de', timezone: 'Europe/Berlin' })).json()).region).toBe('eu')
		expect((await (await site(env, { domain: 'nyc.com', timezone: 'America/New_York' })).json()).region).toBe('us')
		// no Asia-Pacific shard here, so the EU
		expect((await (await site(env, { domain: 'sg.com', timezone: 'Asia/Singapore' })).json()).region).toBe('eu')
		invalidate('')
		expect((await (await site(fakeEnv(), { domain: 'plain.com', timezone: 'Europe/Berlin' })).json()).region).toBeNull()
	})

	it('refuses a region the server has no shard for, an unknown one, and any change after the site is added', async () => {
		const env = regional()
		const apac = await site(env, { domain: 'sg.com', region: 'apac' })
		expect([apac.res.status, await apac.json()]).toEqual([400, { error: 'this server stores data in eu and us only' }])
		const mars = await site(env, { domain: 'mars.com', region: 'mars' })
		expect([mars.res.status, await mars.json()]).toEqual([400, { error: 'region is eu, us or apac' }])
		await site(env, { domain: 'shop.com', region: 'eu' })
		const move = await call(env, 'PATCH', '/api/v1/sites/shop-com', { region: 'us' }, ADMIN)
		expect([move.res.status, await move.json()]).toEqual([400, { error: "a site's region is set when it is added; add a new site to use another region" }])
		// sending the same region back is fine
		expect((await call(env, 'PATCH', '/api/v1/sites/shop-com', { region: 'eu', name: 'Shop' }, ADMIN)).res.status).toBe(200)
	})

	it('moves a site off a full shard only to another shard in its region', async () => {
		vi.useFakeTimers({ toFake: ['Date'] })
		const now = Date.UTC(2026, 9, 22, 12)
		vi.setSystemTime(now)
		const env = regional()
		await site(env, { domain: 'shop.com', region: 'eu' })
		const e = env as unknown as Env
		const first = await writeShard(e, 'shop-com', now)
		expect(first).toMatch(/^shard_eu_/)
		env.CONTROL.db.prepare("UPDATE shards SET status = 'draining' WHERE name = ?").run(first)
		invalidate('')
		await writeShard(e, 'shop-com', now)
		const shards = env.CONTROL.rows("SELECT shard FROM shard_map WHERE site_id = 'shop-com' ORDER BY from_day").map((r) => r.shard)
		expect(shards).toEqual([first, first === 'shard_eu_0' ? 'shard_eu_1' : 'shard_eu_0'])
		// with no other EU shard left, it stays put rather than leave the region
		env.CONTROL.db.prepare("UPDATE shards SET status = 'draining' WHERE name LIKE 'shard_eu_%'").run()
		invalidate('')
		await writeShard(e, 'shop-com', now + DAY)
		expect(env.CONTROL.rows("SELECT shard FROM shard_map WHERE site_id = 'shop-com' AND shard = 'shard_us_0'")).toEqual([])
	})
})
