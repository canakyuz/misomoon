import { describe, expect, it } from 'vite-plus/test'
import * as entries from '../../routes/api/entries/+server.ts'
import * as one from '../../routes/api/entries/[kind]/[...slug]/+server.ts'
import * as author from '../../routes/api/authors/[id]/+server.ts'
import { cached, keys } from './api.ts'
import { fakeD1 } from './fake-d1.ts'

const TOKEN = 'secret-token'

/** A tiny Cache: what a write purges is gone, everything else stays. */
class MemCache {
	store = new Map<string, string>()
	async match(url: string) {
		const v = this.store.get(url)
		return v === undefined ? undefined : new Response(v)
	}
	async put(url: string, res: Response) {
		this.store.set(url, await res.text())
	}
	async delete(url: string) {
		return this.store.delete(url)
	}
}

function platform(o: { token?: string | null; db?: boolean } = {}) {
	const cache = new MemCache()
	return {
		env: { CONTENT: o.db === false ? undefined : fakeD1(), CONTENT_TOKEN: o.token === null ? undefined : (o.token ?? TOKEN) },
		ctx: { waitUntil: () => {} },
		caches: { default: cache },
		cache,
	} as unknown as App.Platform & { cache: MemCache }
}

const req = (method: string, body?: unknown, o: { token?: string; type?: string } = {}) =>
	new Request('https://misomoon.com/api', {
		method,
		headers: { ...(o.token !== '' ? { authorization: `Bearer ${o.token ?? TOKEN}` } : {}), ...(body !== undefined ? { 'content-type': o.type ?? 'application/json' } : {}) },
		body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
	})

// the handlers read only these fields of the event
const ev = (p: App.Platform, request: Request, params: Record<string, string> = {}, url = 'https://misomoon.com/api') => ({ platform: p, request, params, url: new URL(url) }) as never

const post = {
	title: 'Count visits without cookies',
	description: 'How misomoon tells one visitor from another for a day, with a salt that changes at midnight and no cookie.',
	body: '## Why\n\nNo cookie.',
	status: 'published',
	author: 'jane-doe',
	image: 'https://misomoon.com/og.png',
	imageAlt: 'A moon',
}

async function withAuthor(p: App.Platform) {
	const res = await author.PUT(ev(p, req('PUT', { name: 'Jane Doe' }), { id: 'jane-doe' }))
	expect(res.status).toBe(201)
}

describe('the content API', () => {
	it('refuses writes without the token, and says how to turn writes on when no token is set', async () => {
		const p = platform()
		expect((await one.PUT(ev(p, req('PUT', post, { token: '' }), { kind: 'post', slug: 'a' }))).status).toBe(401)
		expect((await one.PUT(ev(p, req('PUT', post, { token: 'wrong' }), { kind: 'post', slug: 'a' }))).status).toBe(401)
		const off = await one.PUT(ev(platform({ token: null }), req('PUT', post), { kind: 'post', slug: 'a' }))
		expect(off.status).toBe(503)
		expect((await off.json()).error).toMatch(/CONTENT_TOKEN/)
	})

	it('creates, reads, replaces and deletes a post', async () => {
		const p = platform()
		await withAuthor(p)
		const created = await one.PUT(ev(p, req('PUT', post), { kind: 'post', slug: 'count' }))
		expect(created.status).toBe(201)
		expect(created.headers.get('access-control-allow-origin')).toBe('*')
		const body = await created.json()
		expect(body.entry).toMatchObject({ path: '/blog/count', author: { name: 'Jane Doe' } })
		expect(body.warnings).toEqual([])
		expect((await one.PUT(ev(p, req('PUT', { ...post, title: 'New' }), { kind: 'post', slug: 'count' }))).status).toBe(200)
		const read = await one.GET(ev(p, req('GET', undefined, { token: '' }), { kind: 'post', slug: 'count' }))
		expect((await read.json()).entry.title).toBe('New')
		expect((await one.DELETE(ev(p, req('DELETE'), { kind: 'post', slug: 'count' }))).status).toBe(204)
		expect((await one.DELETE(ev(p, req('DELETE'), { kind: 'post', slug: 'count' }))).status).toBe(404)
	})

	it('answers 400 with the reason for a bad entry, and 415 for a body that is not JSON', async () => {
		const p = platform()
		const bad = await one.PUT(ev(p, req('PUT', { ...post, title: '' }), { kind: 'post', slug: 'a' }))
		expect(bad.status).toBe(400)
		expect(await bad.json()).toEqual({ error: 'title: 1 to 140 characters' })
		expect((await one.PUT(ev(p, req('PUT', 'x', { type: 'text/plain' }), { kind: 'post', slug: 'a' }))).status).toBe(415)
		expect((await one.PUT(ev(p, req('PUT', post), { kind: 'page', slug: 'blog' }))).status).toBe(400)
		expect((await one.GET(ev(p, req('GET'), { kind: 'video', slug: 'a' }))).status).toBe(404)
	})

	it('shows drafts only to a client with the token', async () => {
		const p = platform()
		await withAuthor(p)
		await one.PUT(ev(p, req('PUT', { ...post, status: 'draft' }), { kind: 'post', slug: 'wip' }))
		expect((await one.GET(ev(p, req('GET', undefined, { token: '' }), { kind: 'post', slug: 'wip' }))).status).toBe(404)
		expect((await one.GET(ev(p, req('GET'), { kind: 'post', slug: 'wip' }))).status).toBe(200)
		const pub = await entries.GET(ev(p, req('GET', undefined, { token: '' }), {}, 'https://misomoon.com/api/entries?kind=post'))
		expect((await pub.json()).items).toEqual([])
		expect((await entries.GET(ev(p, req('GET', undefined, { token: '' }), {}, 'https://misomoon.com/api/entries?drafts=1'))).status).toBe(401)
		const all = await entries.GET(ev(p, req('GET'), {}, 'https://misomoon.com/api/entries?drafts=1'))
		expect(all.headers.get('cache-control')).toBe('private, no-store')
		expect((await all.json()).items).toHaveLength(1)
	})

	it('answers 503 when no database is bound', async () => {
		const res = await entries.GET(ev(platform({ db: false }), req('GET'), {}, 'https://misomoon.com/api/entries'))
		expect(res.status).toBe(503)
	})

	it('clears the cached post and the blog list in this data center after a write', async () => {
		const p = platform()
		await withAuthor(p)
		let reads = 0
		// the cache write runs in the background, through waitUntil
		const read = async () => {
			const v = await cached(p, keys.list('post'), async () => ++reads)
			await new Promise((r) => setTimeout(r))
			return v
		}
		expect(await read()).toBe(1)
		expect(await read()).toBe(1)
		await one.PUT(ev(p, req('PUT', post), { kind: 'post', slug: 'count' }))
		expect(await read()).toBe(2)
	})
})
