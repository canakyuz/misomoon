import { version } from '$app/env'
import type { Handle } from '@sveltejs/kit/hooks'
import { waitUntil } from 'cloudflare:workers'

// Pages render in the Worker. Each data center keeps a page it rendered for this build, so
// most requests skip the rendering; a new deploy has a new version and renders afresh.
const PAGE_CACHE = 'public, max-age=300, stale-while-revalidate=86400'

// the same headers as _headers, which covers the files served without the Worker
function secure(res: Response) {
	res.headers.set('Content-Security-Policy', "frame-ancestors 'none'")
	res.headers.set('X-Frame-Options', 'DENY')
	res.headers.set('X-Content-Type-Options', 'nosniff')
	res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
	return res
}

export const handle: Handle = async ({ event, resolve }) => {
	// the Cloudflare adapter passes no platform: the Worker's cache is the global one
	const cache = (event.platform?.caches ?? (globalThis.caches as App.Platform['caches'] | undefined))?.default
	const wait = event.platform?.ctx.waitUntil ?? waitUntil
	if (!cache || event.request.method !== 'GET') return secure(await resolve(event))
	// one entry per page and build: a query string can't add entries
	const url = new URL(event.request.url)
	const key = new Request(`${url.origin}${url.pathname}?__build=${version}`)
	const hit = await cache.match(key).catch(() => undefined)
	if (hit) return secure(new Response(hit.body, hit))
	const res = await resolve(event)
	if (res.status !== 200) return secure(res)
	const out = new Response(res.body, res)
	out.headers.set('Cache-Control', PAGE_CACHE)
	wait(cache.put(key, out.clone()).catch(() => {}))
	return secure(out)
}
