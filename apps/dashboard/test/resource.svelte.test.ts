// @vitest-environment happy-dom
import { tick } from 'svelte'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

// api.ts reads the page path on import (email and shared links)
vi.hoisted(() => {
	;(globalThis as { location?: unknown }).location = { pathname: '/', search: '' }
})

const { Resource } = await import('../src/lib/dash.svelte')

afterEach(() => vi.unstubAllGlobals())

describe('Resource', () => {
	it('stops loading and forgets the last error when its URL goes away mid-request', async () => {
		const pending: ((r: Response) => void)[] = []
		const fetch = vi.fn(() => new Promise<Response>((r) => pending.push(r)))
		vi.stubGlobal('fetch', fetch)
		let url = $state<string | null>('/api/v1/stats/aggregate?site=a&_=resource-1')
		let res!: InstanceType<typeof Resource<unknown>>
		const stop = $effect.root(() => void (res = new Resource(() => url)))
		await tick()
		pending[0](Response.json({ error: 'site not found' }, { status: 404 }))
		await vi.waitFor(() => expect(res.error).toBe('site not found'))
		url = '/api/v1/stats/aggregate?site=b&_=resource-1'
		await tick()
		expect(res.loading).toBe(true)
		url = null
		await tick()
		pending[1](Response.json({}))
		await new Promise((r) => setTimeout(r))
		expect([res.loading, res.error, res.data]).toEqual([false, null, null])
		stop()
	})
})
