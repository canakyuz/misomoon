import { proxySnippets } from '@misomoon/core'
import { describe, expect, it } from 'vite-plus/test'
import { proxyRewrites, withMisomoon } from '../src/next'

const host = 'https://analytics.example.com/'
const ours = [
	{ source: '/relay/m.js', destination: 'https://analytics.example.com/m.js' },
	{ source: '/relay/api/event', destination: 'https://analytics.example.com/api/event' },
	{ source: '/relay/overlay.js', destination: 'https://analytics.example.com/overlay.js' },
]

describe('withMisomoon', () => {
	it('adds the proxy before the files and pages of a config without rewrites, keeping the rest', async () => {
		const config = withMisomoon({ reactStrictMode: true }, { host })
		expect(config.reactStrictMode).toBe(true)
		expect(await config.rewrites()).toEqual({ beforeFiles: ours, afterFiles: [] })
	})

	it("keeps the app's own rewrites, in either shape", async () => {
		const app = { source: '/old', destination: '/new' }
		expect(await withMisomoon({ rewrites: async () => [app] }, { host }).rewrites()).toEqual({ beforeFiles: ours, afterFiles: [app] })
		const shaped = withMisomoon({ rewrites: () => ({ beforeFiles: [app], fallback: [app] }) }, { host })
		expect(await shaped.rewrites()).toEqual({ beforeFiles: [...ours, app], fallback: [app] })
	})

	it('wraps a config exported as a function of the phase', async () => {
		const config = withMisomoon((phase: string) => ({ phase }), { host, prefix: 'pulse/' })
		const out = await config('phase-production-build', { defaultConfig: { phase: '' } })
		expect(out.phase).toBe('phase-production-build')
		expect(((await out.rewrites()) as { beforeFiles: { source: string }[] }).beforeFiles.map((r) => r.source)).toEqual(['/pulse/m.js', '/pulse/api/event', '/pulse/overlay.js'])
	})

	it('fails the build on a host that is not a URL', () => {
		expect(() => withMisomoon({}, { host: 'analytics.example.com' })).toThrow(/full URL/)
	})
})

describe('proxyRewrites', () => {
	it("matches the dashboard's Next.js snippet", () => {
		const snippet = proxySnippets({ site: 's', upstream: 'https://analytics.example.com', prefix: '/relay' }).find((s) => s.id === 'nextjs')!.code
		for (const r of proxyRewrites({ host })) expect(snippet).toContain(`{ source: '${r.source}', destination: '${r.destination}' }`)
	})
})
