// Next.js: serves misomoon from the app's own domain, so ad blockers that drop requests to
// analytics hosts let the tracker through (docs/PROXY.md). It only adds rewrites to the
// config, the same three paths as the Next.js snippet in core/src/snippets.ts, so it
// imports nothing from Next and works in next.config.js, .mjs and .ts.

export interface ProxyOptions {
	/** where misomoon answers: `https://analytics.example.com` */
	host: string
	/** the path on your site the proxy lives under. Default `/relay`; words like `analytics` are on filter lists. */
	prefix?: string
}

interface Rewrite {
	source: string
	destination: string
	[key: string]: unknown
}

type Rewrites = Rewrite[] | { beforeFiles?: Rewrite[]; afterFiles?: Rewrite[]; fallback?: Rewrite[] }

/** The config with the proxy rewrites added. */
export type WithMisomoon<C> = C & { rewrites: () => Promise<Rewrites> }

/** The part of a Next.js config this touches. */
export interface NextConfigLike {
	rewrites?: () => Rewrites | Promise<Rewrites>
	[key: string]: unknown
}

/** next.config may export a function of the build phase that returns the config. */
export type NextConfigInput<C extends NextConfigLike> = C | ((phase: string, ctx: { defaultConfig: C }) => C | Promise<C>)

const DEFAULT_PREFIX = '/relay'

/** "relay/", "/relay//" and " /relay " all become "/relay", as `normalizePrefix` in core/src/snippets.ts. */
export function proxyPrefix(prefix: string | undefined): string {
	const p = (prefix ?? '')
		.trim()
		.replace(/[^a-zA-Z0-9/_-]/g, '')
		.replace(/\/{2,}/g, '/')
		.replace(/^\/|\/$/g, '')
	return p ? '/' + p : DEFAULT_PREFIX
}

/** The rewrites that map `<prefix>/m.js`, `/api/event` and `/overlay.js` to misomoon. A rewrite keeps the query, so `m.js?s=` arrives. */
export function proxyRewrites(options: ProxyOptions): Rewrite[] {
	const up = options.host.trim().replace(/\/+$/, '')
	if (!/^https?:\/\/[^\s/]+/.test(up)) throw new Error(`[misomoon] withMisomoon needs host as a full URL, such as https://analytics.example.com, not "${options.host}"`)
	const p = proxyPrefix(options.prefix)
	return ['m.js', 'api/event', 'overlay.js'].map((path) => ({ source: `${p}/${path}`, destination: `${up}/${path}` }))
}

function withRewrites<C extends NextConfigLike>(config: C, options: ProxyOptions): WithMisomoon<C> {
	const ours = proxyRewrites(options)
	const theirs = config.rewrites
	return {
		...config,
		async rewrites() {
			const existing = theirs ? await theirs() : []
			// before the app's own files and pages, so a catch-all route can't take the paths
			if (Array.isArray(existing)) return { beforeFiles: ours, afterFiles: existing }
			return { ...existing, beforeFiles: [...ours, ...(existing.beforeFiles ?? [])] }
		},
	}
}

/**
 * Wraps your Next.js config with the proxy rewrites:
 *
 * ```js
 * // next.config.mjs
 * import { withMisomoon } from '@misomoon/sdk/next'
 * export default withMisomoon({ reactStrictMode: true }, { host: 'https://analytics.example.com' })
 * ```
 *
 * Then load the tracker from the prefix: `<Misomoon site="your-site" host="/relay" />`.
 */
export function withMisomoon<C extends NextConfigLike>(config: C, options: ProxyOptions): WithMisomoon<C>
export function withMisomoon<C extends NextConfigLike>(config: (phase: string, ctx: { defaultConfig: C }) => C | Promise<C>, options: ProxyOptions): (phase: string, ctx: { defaultConfig: C }) => Promise<WithMisomoon<C>>
export function withMisomoon<C extends NextConfigLike>(config: NextConfigInput<C>, options: ProxyOptions): WithMisomoon<C> | ((phase: string, ctx: { defaultConfig: C }) => Promise<WithMisomoon<C>>) {
	// checks the host now, so a mistake fails the build instead of the first request
	proxyRewrites(options)
	if (typeof config === 'function') return async (phase, ctx) => withRewrites(await config(phase, ctx), options)
	return withRewrites(config ?? ({} as C), options)
}
