import { describe, expect, it } from 'vite-plus/test'
import { handle } from './hooks.server.ts'

describe('every landing page', () => {
	it('refuses to load in a frame and tells the browser not to sniff types', async () => {
		const res = await handle({ event: {} as never, resolve: async () => new Response('<!doctype html>') })
		expect(Object.fromEntries(['content-security-policy', 'x-frame-options', 'x-content-type-options', 'referrer-policy'].map((h) => [h, res.headers.get(h)]))).toEqual({
			'content-security-policy': "frame-ancestors 'none'",
			'x-frame-options': 'DENY',
			'x-content-type-options': 'nosniff',
			'referrer-policy': 'strict-origin-when-cross-origin',
		})
	})
})
