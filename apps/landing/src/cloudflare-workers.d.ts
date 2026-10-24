// The parts of the Workers runtime module the landing uses. In dev, the Cloudflare
// adapter serves a stand-in backed by wrangler's platform proxy.
declare module 'cloudflare:workers' {
	export const env: Record<string, unknown>
	export function waitUntil(promise: Promise<unknown>): void
}
