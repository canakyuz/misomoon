import type { Handle } from '@sveltejs/kit/hooks'

// the same headers as static/_headers, which covers the files served without the Worker
export const handle: Handle = async ({ event, resolve }) => {
	const res = await resolve(event)
	res.headers.set('Content-Security-Policy', "frame-ancestors 'none'")
	res.headers.set('X-Frame-Options', 'DENY')
	res.headers.set('X-Content-Type-Options', 'nosniff')
	res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
	return res
}
