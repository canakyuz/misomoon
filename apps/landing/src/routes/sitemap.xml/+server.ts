import type { RequestHandler } from './$types'
import { cached, keys } from '#lib/server/api.ts'
import { indexable, listEntries } from '#lib/server/content.ts'
import { codePages, sitemap } from '#lib/server/feeds.ts'
import { db } from '#lib/server/pages.ts'

export const GET: RequestHandler = async ({ url, platform }) => {
	const d = db(platform)
	const fromDb = d
		? await cached(platform, keys.sitemap, async () => {
				const [entries, newest] = await Promise.all([indexable(d), listEntries(d, { kind: 'post', limit: 1 })])
				return { entries, blog: newest.items[0]?.updatedAt ?? null }
			}).catch((e) => {
				// a sitemap without the posts beats no sitemap
				console.error('sitemap', e)
				return { entries: [], blog: null }
			})
		: { entries: [], blog: null }
	const urls = [...codePages(), ...(fromDb.blog ? [{ path: '/blog', lastmod: fromDb.blog }] : [{ path: '/blog' }]), ...fromDb.entries.map((e) => ({ path: e.path, lastmod: e.updatedAt }))]
	return new Response(sitemap(url.origin, urls), { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } })
}
