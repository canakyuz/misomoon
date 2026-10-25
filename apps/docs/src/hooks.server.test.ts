import { describe, expect, it } from 'vite-plus/test'
import { handle } from './hooks.server.ts'

/** A Cache that keeps what was put, by URL. */
function edge() {
	const store = new Map<string, Response>()
	return {
		store,
		default: {
			match: async (req: Request) => store.get(req.url)?.clone(),
			put: async (req: Request, res: Response) => void store.set(req.url, res),
		},
	}
}

const event = (url: string, caches?: ReturnType<typeof edge>, method = 'GET') =>
	({ request: new Request(url, { method }), platform: caches ? { caches, ctx: { waitUntil: (p: Promise<unknown>) => p } } : undefined }) as never

describe('every docs page', () => {
	it('refuses to load in a frame and tells the browser not to sniff types', async () => {
		const res = await handle({ event: event('https://docs.misomoon.com/api'), resolve: async () => new Response('<!doctype html>') })
		expect(Object.fromEntries(['content-security-policy', 'x-frame-options', 'x-content-type-options', 'referrer-policy'].map((h) => [h, res.headers.get(h)]))).toEqual({
			'content-security-policy': "frame-ancestors 'none'",
			'x-frame-options': 'DENY',
			'x-content-type-options': 'nosniff',
			'referrer-policy': 'strict-origin-when-cross-origin',
		})
	})

	it('renders a page once per data center and build, then serves it from the edge cache', async () => {
		const caches = edge()
		let renders = 0
		const resolve = async () => (renders++, new Response('<!doctype html><h1>API</h1>', { headers: { 'content-type': 'text/html' } }))
		const first = await handle({ event: event('https://docs.misomoon.com/api', caches), resolve })
		const second = await handle({ event: event('https://docs.misomoon.com/api', caches), resolve })
		expect([renders, await first.text(), await second.text()]).toEqual([1, '<!doctype html><h1>API</h1>', '<!doctype html><h1>API</h1>'])
		expect(second.headers.get('x-frame-options')).toBe('DENY')
		expect(first.headers.get('cache-control')).toBe('public, max-age=300, stale-while-revalidate=86400')
	})

	it('caches neither a missing page nor anything but a GET', async () => {
		const caches = edge()
		let renders = 0
		const missing = async () => (renders++, new Response('gone', { status: 404 }))
		await handle({ event: event('https://docs.misomoon.com/nope', caches), resolve: missing })
		await handle({ event: event('https://docs.misomoon.com/nope', caches), resolve: missing })
		await handle({ event: event('https://docs.misomoon.com/api', caches, 'HEAD'), resolve: missing })
		expect([renders, caches.store.size]).toEqual([3, 0])
	})

	it('uses the Worker\'s own cache when SvelteKit passes no platform, as the Cloudflare adapter does', async () => {
		const caches = edge()
		const before = globalThis.caches
		Object.defineProperty(globalThis, 'caches', { value: caches, configurable: true })
		try {
			let renders = 0
			const resolve = async () => (renders++, new Response('<!doctype html>'))
			await handle({ event: event('https://docs.misomoon.com/sdk'), resolve })
			await new Promise((r) => setTimeout(r))
			await handle({ event: event('https://docs.misomoon.com/sdk'), resolve })
			expect(renders).toBe(1)
		} finally {
			Object.defineProperty(globalThis, 'caches', { value: before, configurable: true })
		}
	})
})
