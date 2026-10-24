// What a site collects beyond pageviews, engaged time and scroll depth. Site settings tick
// these; the Worker serves m.js?s=<site> as the core tracker plus the code for the ticked
// ones only, so a site pays in bytes for what it uses. Search costs the tracker nothing: the
// server reads the term from the page URL it already gets.

export const FEATURES = ['outbound', 'downloads', 'forms', 'events', 'payments', 'vitals', 'clicks', 'errors', 'fields', 'media', 'content', 'search'] as const
export type Feature = (typeof FEATURES)[number]

/** A site that never changed its settings gets every feature. */
export const DEFAULT_FEATURES: Feature[] = [...FEATURES]

/**
 * The light preset: what a minimal analytics script usually covers beyond pageviews, which
 * are outbound links, downloads, form submits and tagged events. Custom events, props and
 * revenue are in the core.
 */
export const LIGHT_FEATURES: Feature[] = ['outbound', 'downloads', 'forms', 'events']

export const DEFAULT_SEARCH_PARAMS = ['q', 's', 'search', 'query', 'keyword']

/**
 * The tracker parts (packages/tracker/src/x), in load order. `items` holds the state that
 * fields, media and content share. `events` runs before `downloads` and `downloads` before
 * `outbound`, so a click one of them counted isn't counted again.
 */
export const BROWSER_PARTS = ['vitals', 'clicks', 'errors', 'items', 'fields', 'media', 'content', 'events', 'downloads', 'outbound', 'forms', 'payments'] as const
export type BrowserPart = (typeof BROWSER_PARTS)[number]

/** The stored column (comma-separated, NULL for the defaults) as a list of known features. */
export function siteFeatures(stored: string | null | undefined): Feature[] {
	if (stored == null) return DEFAULT_FEATURES
	return FEATURES.filter((f) => stored.split(',').includes(f))
}

/** The column value for a list from the API, or a message saying what is wrong with it. */
export function storeFeatures(list: unknown): string | { error: string } {
	if (!Array.isArray(list) || list.some((f) => typeof f !== 'string')) return { error: 'features must be a list of names' }
	const unknown = list.filter((f) => !(FEATURES as readonly string[]).includes(f))
	if (unknown.length) return { error: `unknown feature: ${unknown[0]}; use ${FEATURES.join(', ')}` }
	return FEATURES.filter((f) => list.includes(f)).join(',')
}

/** URL parameters that hold the site search term, from the stored column. */
export function searchParams(stored: string | null | undefined): string[] {
	const list = (stored ?? '').split(',').map((s) => s.trim()).filter(Boolean)
	return list.length ? list : DEFAULT_SEARCH_PARAMS
}

/** The column value for a list from the API: up to 10 parameter names, or an error. */
export function storeSearchParams(list: unknown): string | null | { error: string } {
	if (list == null) return null
	if (!Array.isArray(list) || list.some((p) => typeof p !== 'string')) return { error: 'search_params must be a list of names' }
	const names = [...new Set(list.map((p: string) => p.trim()).filter(Boolean))]
	if (names.length > 10 || names.some((p) => !/^[\w.[\]-]{1,40}$/.test(p))) return { error: 'search_params takes up to 10 URL parameter names' }
	return names.length ? names.join(',') : null
}

/** The site search term in `url`, from the first of `params` that has a value. */
export function searchTermFromUrl(url: string, params: string[]): string | undefined {
	let q: URLSearchParams
	try {
		q = new URL(url).searchParams
	} catch {
		return undefined
	}
	for (const p of params) {
		const v = (q.get(p) ?? '').trim()
		if (v) return v.slice(0, 100)
	}
	return undefined
}

/** The tracker parts a site needs, in load order. */
export function browserParts(features: Feature[]): BrowserPart[] {
	const on = new Set<string>(features)
	if (on.has('fields') || on.has('media') || on.has('content')) on.add('items')
	return BROWSER_PARTS.filter((p) => on.has(p))
}

// ---------------------------------------------------------------- path rules

const MAX_PATH_RULES = 20

/** A path glob as a RegExp: `*` matches within one segment, `**` across segments. */
function pathGlob(glob: string): RegExp {
	const body = glob
		.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
		.replace(/\*\*/g, '\u0000')
		.replace(/\*/g, '[^/]*')
		.replace(/\u0000/g, '.*')
	return new RegExp(`^${body}/?$`)
}

/** The stored column (comma-separated globs) as a list. */
export function pathRules(stored: string | null | undefined): string[] {
	return (stored ?? '').split(',').filter(Boolean)
}

/** The column value for a list of globs from the API: null for none, or an error. */
export function storePathRules(list: unknown, field: string): string | null | { error: string } {
	if (list == null) return null
	if (!Array.isArray(list) || list.some((p) => typeof p !== 'string')) return { error: `${field} must be a list of paths` }
	const globs = [...new Set(list.map((p: string) => p.trim()).filter(Boolean))]
	if (globs.length > MAX_PATH_RULES || globs.some((p) => !/^\/[^\s,]{0,200}$/.test(p))) return { error: `${field} takes up to ${MAX_PATH_RULES} paths that start with /` }
	return globs.length ? globs.join(',') : null
}

/**
 * Whether a page counts under a site's path rules: it must match an include glob when there
 * are any, and no exclude glob. `path` is the URL's path, plus its hash for hash routers.
 */
export function pathCounted(path: string, include: string[], exclude: string[]): boolean {
	const hit = (glob: string) => pathGlob(glob).test(path)
	return (!include.length || include.some(hit)) && !exclude.some(hit)
}

// ---------------------------------------------------------------- checkout ids

/** Success pages: Stripe ?session_id=cs_…, Polar ?checkout_id=…, Dodo ?payment_id=pay_… or ?subscription_id=sub_… */
const SUCCESS: Record<string, RegExp> = { session_id: /^cs_/, checkout_id: /^[\w-]{6,}$/, payment_id: /^pay_/, subscription_id: /^sub_/ }

/** The checkout ids a payment provider put on a success page's URL. */
export function checkoutKeys(url: string): string[] {
	let q: URLSearchParams
	try {
		q = new URL(url).searchParams
	} catch {
		return []
	}
	return Object.keys(SUCCESS).flatMap((name) => {
		const v = q.get(name)
		return v && SUCCESS[name].test(v) && /^[\w-]{6,128}$/.test(v) ? [v] : []
	})
}
