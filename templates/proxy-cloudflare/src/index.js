// misomoon first-party proxy. Serves the tracker and forwards beacons from your own
// domain, so ad blockers that drop third-party analytics leave them alone.
// Works on a subdomain (stats.example.com/m.js) or under a path route
// (example.com/relay/* -> example.com/relay/m.js); see README.md.

export default {
	async fetch(request, env, ctx) {
		const upstream = (env.MISOMOON_URL || 'https://app.misomoon.com').replace(/\/+$/, '')
		const url = new URL(request.url)
		const path = url.pathname
		// m.js?s=<site> carries the features the site ticked, so the query goes along; overlay.js
		// draws clicks and scroll on a page the dashboard opens
		const file = path.match(/\/(m|overlay)\.js$/)
		if (file) {
			const cache = caches.default
			let res = await cache.match(request)
			if (!res) {
				const up = await fetch(upstream + file[0] + url.search)
				// pass errors through as they are, and never cache them
				if (!up.ok) return new Response(up.body, { status: up.status, headers: { 'cache-control': 'no-store' } })
				res = new Response(up.body, {
					headers: { 'content-type': 'application/javascript', 'cache-control': up.headers.get('cache-control') ?? 'public, max-age=3600' },
				})
				ctx.waitUntil(cache.put(request, res.clone()))
			}
			return res
		}
		if (path.endsWith('/api/event') && request.method === 'POST') {
			const cf = request.cf ?? {}
			const headers = new Headers({
				'content-type': 'text/plain',
				'user-agent': request.headers.get('user-agent') ?? '',
				'x-misomoon-ip': request.headers.get('cf-connecting-ip') ?? '',
			})
			// the browser's privacy signals and language, which misomoon reads as the visitor's
			for (const k of ['sec-gpc', 'dnt', 'accept-language']) {
				const v = request.headers.get(k)
				if (v) headers.set(k, v)
			}
			const geo = { country: cf.country, region: cf.region, city: cf.city, continent: cf.continent, timezone: cf.timezone, 'as-org': cf.asOrganization }
			for (const [k, v] of Object.entries(geo)) if (v) headers.set('x-misomoon-' + k, encodeURIComponent(v))
			return fetch(upstream + '/api/event', { method: 'POST', headers, body: request.body })
		}
		return new Response('Not found', { status: 404 })
	},
}
