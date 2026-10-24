// Shared parts of the content API under /api: the database, the token, JSON answers,
// and the edge cache the pages read through.
import { ContentError, KINDS, type Kind } from './content.ts'
import { worker } from './platform.ts'

export class ApiError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message)
	}
}

/** Reads are public, so another site or app can show the posts. Writes need the token. */
const CORS = {
	'access-control-allow-origin': '*',
	'access-control-allow-methods': 'GET, PUT, DELETE, OPTIONS',
	'access-control-allow-headers': 'authorization, content-type',
	'access-control-max-age': '86400',
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
	new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...CORS, ...headers } })

export const preflight = () => new Response(null, { status: 204, headers: CORS })

/** Runs a handler and turns a known error into `{ error }` with its status. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
	try {
		return await fn()
	} catch (e) {
		if (e instanceof ApiError || e instanceof ContentError) return json({ error: e.message }, e.status)
		console.error('content api', e)
		return json({ error: 'the content database did not answer' }, 503)
	}
}

export function database(platform: App.Platform | undefined): D1Database {
	const db = worker(platform).env.CONTENT
	if (!db) throw new ApiError(503, 'no CONTENT database is bound to this Worker. See docs/content.md')
	return db
}

export function kindOf(v: string): Kind {
	if (!(KINDS as string[]).includes(v)) throw new ApiError(404, 'kind: "post" or "page"')
	return v as Kind
}

async function digest(s: string) {
	return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))
}

/** True when the request carries `Authorization: Bearer <CONTENT_TOKEN>`. */
export async function authorized(request: Request, platform: App.Platform | undefined): Promise<boolean> {
	const token = worker(platform).env.CONTENT_TOKEN
	const got = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
	if (!token || !got) return false
	// compare digests, so the time taken says nothing about the token
	const [a, b] = await Promise.all([digest(got), digest(token)])
	let diff = 0
	for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
	return diff === 0
}

export async function requireToken(request: Request, platform: App.Platform | undefined): Promise<void> {
	if (!worker(platform).env.CONTENT_TOKEN) throw new ApiError(503, 'set the CONTENT_TOKEN secret to write content. See docs/content.md')
	if (!(await authorized(request, platform))) throw new ApiError(401, 'send Authorization: Bearer <CONTENT_TOKEN>')
}

export async function body(request: Request): Promise<unknown> {
	if (!request.headers.get('content-type')?.includes('application/json')) throw new ApiError(415, 'send Content-Type: application/json')
	try {
		return await request.json()
	} catch {
		throw new ApiError(400, 'body: not valid JSON')
	}
}

// ───────────────────────────── edge cache

const ORIGIN = 'https://content.misomoon.internal/'
/** Seconds a read stays in the edge cache of one data center. A write clears it there at once. */
export const CONTENT_TTL = 60

/**
 * Reads through the data center's cache, so a page view rarely waits on D1. A cache that
 * errors counts as a miss. Without a cache (dev, tests), it reads the database.
 */
export async function cached<T>(p: App.Platform | undefined, key: string, fresh: () => Promise<T>): Promise<T> {
	const platform = worker(p)
	const cache = platform.caches?.default
	const url = ORIGIN + encodeURIComponent(key)
	const hit = await cache?.match(url).catch(() => undefined)
	if (hit) return hit.json() as Promise<T>
	const v = await fresh()
	if (cache) {
		const put = cache.put(url, new Response(JSON.stringify(v), { headers: { 'cache-control': `max-age=${CONTENT_TTL}` } })).catch(() => {})
		platform.ctx?.waitUntil(put)
	}
	return v
}

/** Clears the keys a write changes, in this data center. Others expire within CONTENT_TTL. */
export async function purge(platform: App.Platform | undefined, keys: string[]): Promise<void> {
	const cache = worker(platform).caches?.default
	if (!cache) return
	await Promise.all(keys.map((k) => cache.delete(ORIGIN + encodeURIComponent(k)).catch(() => false)))
}

export const keys = {
	entry: (kind: Kind, slug: string) => `entry:${kind}:${slug}`,
	related: (kind: Kind, slug: string) => `related:${kind}:${slug}`,
	list: (kind: Kind, tag = '', author = '', cursor = '') => `list:${kind}:${tag}:${author}:${cursor}`,
	tags: 'tags',
	author: (id: string) => `author:${id}`,
	sitemap: 'sitemap',
	feed: 'feed',
	llms: 'llms',
}

/** What a write to an entry makes stale. */
export const staleAfter = (kind: Kind, slug: string, tags: string[], author: string | null) => [
	keys.entry(kind, slug),
	keys.related(kind, slug),
	keys.list(kind),
	...tags.map((t) => keys.list(kind, t)),
	...(author ? [keys.list(kind, '', author)] : []),
	keys.tags,
	keys.sitemap,
	keys.feed,
	keys.llms,
]

/** Cache headers for HTML built from content: browsers keep it a minute, then revalidate. */
export const PAGE_CACHE = { 'cache-control': 'public, max-age=60, stale-while-revalidate=600' }
