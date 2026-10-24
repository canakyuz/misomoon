import type { PageServerLoad } from './$types'
import { edition } from '#lib/edition.ts'
import { worker } from '#lib/server/platform.ts'
import { cachedLive, LIVE_PATHS, toLive, type Answers } from '#lib/live.ts'

/**
 * The landing is a daily edition: the edition strip, tonight's moon and the yesterday
 * line come from today's date and misomoon's own numbers for the public demo site.
 * The numbers are cached at the edge for a minute and printed into the HTML when they're
 * at hand. On a cold cache the page goes out at once with the evergreen edition and the
 * numbers are fetched in the background for the next reader, so a slow or missing API
 * never delays the first paint (no streaming, which some compressors buffer).
 */
const CACHE_KEY = 'https://landing.misomoon.internal/live'

export const load: PageServerLoad = async ({ parent, fetch, setHeaders, platform: given }) => {
	// the adapter passes no platform: the cache and waitUntil come from the Workers runtime
	const platform = worker(given)
	const { appUrl } = await parent()
	setHeaders({
		'cache-control': 'public, max-age=60, stale-while-revalidate=600',
	})
	const get = async (path: string) => {
		const res = await fetch(appUrl + path, {
			signal: AbortSignal.timeout(1500),
		})
		if (!res.ok) throw new Error(String(res.status))
		return res.json()
	}
	const fresh = async () => {
		try {
			const keys = Object.keys(LIVE_PATHS) as (keyof Answers)[]
			const values = await Promise.all(keys.map((k) => get(LIVE_PATHS[k])))
			return toLive(Object.fromEntries(keys.map((k, i) => [k, values[i]])) as unknown as Answers)
		} catch {
			return null
		}
	}
	const waitUntil = (p: Promise<unknown>) => platform.ctx?.waitUntil(p)
	const live = cachedLive({ cache: platform.caches?.default, key: CACHE_KEY, fresh, waitUntil })
	// give the numbers a moment to make this HTML; after that, they're for the next reader
	const ready = await Promise.race([live, new Promise<undefined>((r) => setTimeout(r, 120))])
	if (ready === undefined) waitUntil(live)
	return { live: ready ?? null, edition: edition(Date.now()) }
}
