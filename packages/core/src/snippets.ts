// Copy-paste proxy setups for serving misomoon from a site's own domain. The dashboard
// shows them, and docs/PROXY.md explains them.
// Every setup maps three paths under a prefix on the site to misomoon:
//   <prefix>/m.js?s=…    -> <upstream>/m.js?s=…     (the tracker with the site's features; keeps the query)
//   <prefix>/api/event   -> <upstream>/api/event    (beacons)
//   <prefix>/overlay.js  -> <upstream>/overlay.js   (the click and scroll overlay, loaded only
//                                                    on a page the dashboard opens)
// The tracker posts next to wherever it was loaded from, so no extra attribute is needed.

import { PROXY_HEADERS } from './proxy'

export interface ProxyOptions {
	/** site id, as in m.js?s= */
	site: string
	/** misomoon's origin, e.g. https://app.misomoon.com */
	upstream: string
	/** path on the site the proxy lives under; neutral words survive filter lists best */
	prefix?: string
}

export interface ProxySnippet {
	id: 'cloudflare' | 'nextjs' | 'vercel' | 'netlify' | 'nginx' | 'caddy' | 'sveltekit'
	label: string
	/** where the code goes */
	file: string
	code: string
	/** whether visitor location survives this setup */
	geo: 'full' | 'platform' | 'country-unknown'
}

export const DEFAULT_PREFIX = '/relay'

/** "relay/", "/relay//" and " /relay " all become "/relay". Only path-safe characters. */
export function normalizePrefix(prefix: string | undefined): string {
	const p = (prefix ?? '')
		.trim()
		.replace(/[^a-zA-Z0-9/_-]/g, '')
		.replace(/\/{2,}/g, '/')
		.replace(/^\/|\/$/g, '')
	return p ? '/' + p : DEFAULT_PREFIX
}

const origin = (u: string) => u.trim().replace(/\/+$/, '')

/** The script tag to use once a proxy is in place. */
export function proxiedScriptTag(o: Pick<ProxyOptions, 'site' | 'prefix'>): string {
	return `<script defer src="${normalizePrefix(o.prefix)}/m.js?s=${o.site}"></script>`
}

export function proxySnippets(o: ProxyOptions): ProxySnippet[] {
	const up = origin(o.upstream)
	const host = new URL(up).host
	const p = normalizePrefix(o.prefix)
	const H = PROXY_HEADERS
	return [
		{
			id: 'cloudflare',
			label: 'Cloudflare Worker',
			file: `worker.js, routed on your-domain${p}/*`,
			geo: 'full',
			code: `const UPSTREAM = '${up}'
const PREFIX = '${p}'

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url)
		const path = url.pathname.slice(PREFIX.length)
		if (path === '/m.js' || path === '/overlay.js') {
			const cache = caches.default
			let res = await cache.match(request)
			if (!res) {
				const up = await fetch(UPSTREAM + path + url.search)
				if (!up.ok) return new Response(up.body, { status: up.status, headers: { 'cache-control': 'no-store' } })
				res = new Response(up.body, {
					headers: { 'content-type': 'application/javascript', 'cache-control': up.headers.get('cache-control') ?? 'public, max-age=3600' },
				})
				ctx.waitUntil(cache.put(request, res.clone()))
			}
			return res
		}
		if (path === '/api/event' && request.method === 'POST') {
			const cf = request.cf ?? {}
			const headers = new Headers({
				'content-type': 'text/plain',
				'user-agent': request.headers.get('user-agent') ?? '',
				'${H.ip}': request.headers.get('cf-connecting-ip') ?? '',
			})
			const geo = { country: cf.country, region: cf.region, city: cf.city, continent: cf.continent, timezone: cf.timezone, 'as-org': cf.asOrganization }
			for (const [k, v] of Object.entries(geo)) if (v) headers.set('x-misomoon-' + k, encodeURIComponent(v))
			return fetch(UPSTREAM + '/api/event', { method: 'POST', headers, body: request.body })
		}
		return new Response('Not found', { status: 404 })
	},
}`,
		},
		{
			id: 'nextjs',
			label: 'Next.js',
			file: 'next.config.js',
			geo: 'platform',
			code: `module.exports = {
	async rewrites() {
		return [
			{ source: '${p}/m.js', destination: '${up}/m.js' },
			{ source: '${p}/api/event', destination: '${up}/api/event' },
			{ source: '${p}/overlay.js', destination: '${up}/overlay.js' },
		]
	},
}`,
		},
		{
			id: 'vercel',
			label: 'Vercel (any framework)',
			file: 'vercel.json',
			geo: 'platform',
			code: JSON.stringify(
				{
					rewrites: [
						{ source: `${p}/m.js`, destination: `${up}/m.js` },
						{ source: `${p}/api/event`, destination: `${up}/api/event` },
						{ source: `${p}/overlay.js`, destination: `${up}/overlay.js` },
					],
				},
				null,
				2,
			),
		},
		{
			id: 'netlify',
			label: 'Netlify',
			file: 'public/_redirects (or netlify.toml)',
			geo: 'platform',
			code: `${p}/m.js         ${up}/m.js         200
${p}/api/event    ${up}/api/event    200
${p}/overlay.js   ${up}/overlay.js   200`,
		},
		{
			id: 'nginx',
			label: 'Nginx',
			file: 'inside your server { } block',
			geo: 'country-unknown',
			code: `location = ${p}/m.js {
	proxy_pass ${up}/m.js;
	proxy_set_header Host ${host};
	proxy_ssl_server_name on;
	proxy_set_header Cookie "";
}
location = ${p}/api/event {
	proxy_pass ${up}/api/event;
	proxy_set_header Host ${host};
	proxy_ssl_server_name on;
	proxy_set_header Cookie "";
	proxy_set_header ${H.ip} $remote_addr;
}
location = ${p}/overlay.js {
	proxy_pass ${up}/overlay.js;
	proxy_set_header Host ${host};
	proxy_ssl_server_name on;
	proxy_set_header Cookie "";
}`,
		},
		{
			id: 'caddy',
			label: 'Caddy',
			file: 'inside your site block in the Caddyfile',
			geo: 'country-unknown',
			code: `handle ${p}/m.js {
	rewrite * /m.js?{query}
	reverse_proxy ${up} {
		header_up Host {upstream_hostport}
		header_up -Cookie
	}
}
handle ${p}/api/event {
	rewrite * /api/event
	reverse_proxy ${up} {
		header_up Host {upstream_hostport}
		header_up -Cookie
		header_up ${H.ip} {remote_host}
	}
}
handle ${p}/overlay.js {
	rewrite * /overlay.js
	reverse_proxy ${up} {
		header_up Host {upstream_hostport}
		header_up -Cookie
	}
}`,
		},
		{
			id: 'sveltekit',
			label: 'SvelteKit',
			file: `src/routes${p}/[...path]/+server.ts`,
			geo: 'platform',
			code: `import type { RequestHandler } from './$types'

const UPSTREAM = '${up}'
const FILES = ['/m.js', '/overlay.js']

export const GET: RequestHandler = async ({ params, url }) => {
	const file = '/' + params.path
	if (!FILES.includes(file)) return new Response(null, { status: 404 })
	const res = await fetch(UPSTREAM + file + url.search)
	if (!res.ok) return new Response(res.body, { status: res.status })
	return new Response(res.body, {
		headers: { 'content-type': 'application/javascript', 'cache-control': res.headers.get('cache-control') ?? 'public, max-age=3600' },
	})
}

export const POST: RequestHandler = async ({ params, request, getClientAddress, platform }) => {
	if (params.path !== 'api/event') return new Response(null, { status: 404 })
	const headers = new Headers({
		'content-type': 'text/plain',
		'user-agent': request.headers.get('user-agent') ?? '',
		'${H.ip}': getClientAddress(),
	})
	// on Cloudflare Pages/Workers the visitor's location is on platform.cf
	const cf = (platform as { cf?: Record<string, string> } | undefined)?.cf
	if (cf) {
		const geo = { country: cf.country, region: cf.region, city: cf.city, continent: cf.continent, timezone: cf.timezone }
		for (const [k, v] of Object.entries(geo)) if (v) headers.set('x-misomoon-' + k, encodeURIComponent(v))
	}
	return fetch(UPSTREAM + '/api/event', { method: 'POST', headers, body: await request.text() })
}`,
		},
	]
}

/** Ready-to-deploy proxy templates in this repo (templates/proxy-*), as one-click links. */
export const TEMPLATES_URL = 'https://github.com/jackzard/misomoon/tree/main/templates'

export interface DeployLink {
	id: 'cloudflare' | 'vercel'
	label: string
	href: string
	/** where the custom domain is added after deploying */
	then: string
}

export function deployLinks(): DeployLink[] {
	const repo = (name: string) => encodeURIComponent(`${TEMPLATES_URL}/${name}`)
	return [
		{
			id: 'cloudflare',
			label: 'Deploy to Cloudflare',
			href: `https://deploy.workers.cloudflare.com/?url=${repo('proxy-cloudflare')}`,
			then: 'Worker → Settings → Domains & Routes',
		},
		{
			id: 'vercel',
			label: 'Deploy with Vercel',
			href: `https://vercel.com/new/clone?repository-url=${repo('proxy-vercel')}&project-name=misomoon-proxy&repository-name=misomoon-proxy`,
			then: 'Project → Settings → Domains',
		},
	]
}
