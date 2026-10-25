import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

// api.ts reads the page path on import (email and shared links)
vi.hoisted(() => {
	;(globalThis as { location?: unknown }).location = { pathname: '/', search: '' }
})

const { ApiError, get, getHtml } = await import('../src/lib/api')

afterEach(() => vi.unstubAllGlobals())

describe('error messages (F30)', () => {
	it('never shows an empty error', async () => {
		vi.stubGlobal('fetch', async () => new Response('<html>bad gateway</html>', { status: 502, statusText: '' }))
		const e = await get('/api/v1/x', undefined, 0).catch((e) => e)
		expect(e).toBeInstanceOf(ApiError)
		expect([e.status, e.message]).toEqual([502, 'request failed (502)'])
	})

	it('refuses to show an error answer as a report preview', async () => {
		vi.stubGlobal('fetch', async () => Response.json({ error: 'needs the editor role' }, { status: 403 }))
		const e = await getHtml('/api/v1/sites/a/reports/preview').catch((e) => e)
		expect([e instanceof ApiError, e.status, e.message]).toEqual([true, 403, 'needs the editor role'])
	})
})
