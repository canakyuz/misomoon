import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { DEFAULT_PREFIX, deployLinks, edgeFromRequest, forwardedIp, normalizePrefix, proxiedScriptTag, proxySnippets } from '../src'

const h = (o: Record<string, string>) => new Headers(o)
const cf = { country: 'NL', city: 'Amsterdam', timezone: 'Europe/Amsterdam', verifiedBot: false, botScore: 5 }

describe('forwardedIp', () => {
	it('prefers our own header, then the leftmost X-Forwarded-For', () => {
		expect(forwardedIp(h({ 'x-misomoon-ip': '203.0.113.9', 'x-forwarded-for': '198.51.100.1' }))).toBe('203.0.113.9')
		expect(forwardedIp(h({ 'x-forwarded-for': '198.51.100.1, 10.0.0.2' }))).toBe('198.51.100.1')
	})
	it('ignores values that are not addresses', () => {
		expect(forwardedIp(h({ 'x-forwarded-for': '<script>' }))).toBeNull()
	})
})

describe('edgeFromRequest', () => {
	it('uses the connection when the request is direct', () => {
		const e = edgeFromRequest(h({ 'cf-connecting-ip': '198.51.100.1', 'x-forwarded-for': '198.51.100.1', 'user-agent': 'UA' }), cf)
		expect(e).toMatchObject({ proxied: false, ip: '198.51.100.1', country: 'NL', city: 'Amsterdam', botScore: 5 })
	})

	it('keeps the connection geo when only a corporate proxy added X-Forwarded-For', () => {
		const e = edgeFromRequest(h({ 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '198.51.100.9' }), cf)
		expect(e).toMatchObject({ proxied: false, ip: '203.0.113.7', country: 'NL', botScore: 5 })
	})

	it('drops the proxy location and bot score when proxied without geo headers', () => {
		const e = edgeFromRequest(h({ 'cf-connecting-ip': '2a06:98c0::1', 'x-forwarded-for': '203.0.113.9', 'x-forwarded-host': 'shop.com', host: 'app.misomoon.com' }), cf)
		expect(e).toMatchObject({ proxied: true, ip: '203.0.113.9', country: null, city: null, botScore: null, verifiedBot: false })
	})

	it('reads our own geo headers from the Cloudflare Worker proxy', () => {
		const e = edgeFromRequest(
			h({ 'cf-connecting-ip': '2a06:98c0::1', 'x-misomoon-ip': '203.0.113.9', 'x-misomoon-country': 'id', 'x-misomoon-city': 'Jakarta', 'x-misomoon-timezone': 'Asia/Jakarta' }),
			cf,
		)
		expect(e).toMatchObject({ ip: '203.0.113.9', country: 'ID', city: 'Jakarta', timezone: 'Asia/Jakarta' })
	})

	it('reads Vercel geo headers and decodes city names', () => {
		const e = edgeFromRequest(
			h({ 'cf-connecting-ip': '76.76.21.1', 'x-forwarded-for': '203.0.113.9', 'x-vercel-id': 'iad1::abc', 'x-vercel-ip-country': 'BR', 'x-vercel-ip-city': 'S%C3%A3o%20Paulo' }),
			cf,
		)
		expect(e).toMatchObject({ country: 'BR', city: 'São Paulo' })
	})

	it("treats Cloudflare's unknown country as unknown", () => {
		const e = edgeFromRequest(h({ 'cf-connecting-ip': '1.1.1.1', 'x-forwarded-for': '203.0.113.9', 'x-nf-request-id': 'r1', 'cf-ipcountry': 'XX' }), cf)
		expect(e.country).toBeNull()
	})
})

describe('proxy snippets', () => {
	const o = { site: 'shop', upstream: 'https://app.misomoon.com/', prefix: 'p/' }

	it('normalises the prefix', () => {
		expect(normalizePrefix(' /a//b/ ')).toBe('/a/b')
		expect(normalizePrefix('')).toBe(DEFAULT_PREFIX)
		expect(normalizePrefix('../<x>')).toBe('/x')
	})

	it('maps the tracker, the beacon and the overlay in every setup, and keeps the query on m.js', () => {
		const all = proxySnippets(o)
		expect(all.map((s) => s.id)).toEqual(['cloudflare', 'nextjs', 'vercel', 'netlify', 'nginx', 'caddy', 'sveltekit'])
		for (const s of all) {
			expect(s.code, s.id).toContain('/m.js')
			expect(s.code, s.id).toContain('/api/event')
			expect(s.code, s.id).toContain('overlay.js')
			expect(s.code, s.id).not.toContain('/x.js')
			expect(s.code, s.id).not.toContain('misomoon.com//')
		}
		expect(all.find((s) => s.id === 'nextjs')!.code).toContain("source: '/p/m.js', destination: 'https://app.misomoon.com/m.js'")
		expect(all.find((s) => s.id === 'caddy')!.code).toContain('rewrite * /m.js?{query}')
		for (const id of ['cloudflare', 'sveltekit']) expect(all.find((s) => s.id === id)!.code, id).toContain('url.search')
	})

	it('round-trips the Worker geo headers through edgeFromRequest', () => {
		const e = edgeFromRequest(
			h({ 'cf-connecting-ip': '2a06:98c0::1', 'x-misomoon-ip': '203.0.113.9', 'x-misomoon-timezone': encodeURIComponent('America/New_York'), 'x-misomoon-city': encodeURIComponent('Zürich') }),
			{},
		)
		expect(e).toMatchObject({ timezone: 'America/New_York', city: 'Zürich' })
	})

	describe("a Worker proxy passes on the browser's privacy signals and language", () => {
		afterEach(() => vi.unstubAllGlobals())
		const browser = { 'user-agent': 'Mozilla/5.0', 'cf-connecting-ip': '203.0.113.9', 'sec-gpc': '1', dnt: '1', 'accept-language': 'fr-FR' }
		const forwarded = async (worker: { fetch: (r: Request, env: object, ctx: object) => Promise<Response> }, url: string) => {
			let sent: Headers | null = null
			vi.stubGlobal('fetch', async (_: string, init: RequestInit) => ((sent = new Headers(init.headers)), new Response(null, { status: 202 })))
			await worker.fetch(new Request(url, { method: 'POST', headers: browser, body: '{}' }), {}, {})
			return ['sec-gpc', 'dnt', 'accept-language'].map((k) => sent!.get(k))
		}

		it('in the one-click template', async () => {
			const { default: worker } = await import('../../../templates/proxy-cloudflare/src/index.js')
			expect(await forwarded(worker, 'https://stats.shop.com/api/event')).toEqual(['1', '1', 'fr-FR'])
		})

		it('in the Worker snippet', async () => {
			const code = proxySnippets(o).find((s) => s.id === 'cloudflare')!.code
			const { default: worker } = await import(`data:text/javascript,${encodeURIComponent(code)}`)
			expect(await forwarded(worker, 'https://shop.com/p/api/event')).toEqual(['1', '1', 'fr-FR'])
		})

		it('in the SvelteKit snippet', () => {
			const code = proxySnippets(o).find((s) => s.id === 'sveltekit')!.code
			for (const k of ['sec-gpc', 'dnt', 'accept-language']) expect(code).toContain(`'${k}'`)
		})
	})

	it('writes a script tag that loads from the prefix', () => {
		expect(proxiedScriptTag(o)).toBe('<script defer src="/p/m.js?s=shop"></script>')
	})
})

describe('deploy links', () => {
	it('point the one-click deploys at the templates in this repo', () => {
		const [cf, vercel] = deployLinks()
		expect(decodeURIComponent(cf.href)).toBe('https://deploy.workers.cloudflare.com/?url=https://github.com/jackzard/misomoon/tree/main/templates/proxy-cloudflare')
		expect(decodeURIComponent(vercel.href)).toContain('repository-url=https://github.com/jackzard/misomoon/tree/main/templates/proxy-vercel')
	})
})
