import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

// api.ts reads the page path on import (email and shared links)
vi.hoisted(() => {
	;(globalThis as { location?: unknown }).location = { pathname: '/', search: '' }
})

const { ApiError, get } = await import('../src/lib/api')

afterEach(() => vi.unstubAllGlobals())

describe('error messages (F30)', () => {
	it('never shows an empty error', async () => {
		vi.stubGlobal('fetch', async () => new Response('<html>bad gateway</html>', { status: 502, statusText: '' }))
		const e = await get('/api/v1/x', undefined, 0).catch((e) => e)
		expect(e).toBeInstanceOf(ApiError)
		expect([e.status, e.message]).toEqual([502, 'request failed (502)'])
	})
})
