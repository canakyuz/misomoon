// The Worker's bindings, its waitUntil and the edge cache. The Cloudflare adapter passes
// SvelteKit no `platform`, so they come from `cloudflare:workers` and the global `caches`.
// A test passes its own platform instead.
import { env, waitUntil } from 'cloudflare:workers'

export function worker(platform?: App.Platform): App.Platform {
	if (platform) return platform
	return {
		env: env as App.Platform['env'],
		ctx: { waitUntil },
		caches: globalThis.caches as App.Platform['caches'],
	}
}
