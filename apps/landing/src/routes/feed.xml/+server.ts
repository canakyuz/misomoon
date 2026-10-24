import type { RequestHandler } from './$types'
import { cached, keys } from '#lib/server/api.ts'
import { feed } from '#lib/server/content.ts'
import { rss } from '#lib/server/feeds.ts'
import { db } from '#lib/server/pages.ts'

export const GET: RequestHandler = async ({ url, platform }) => {
	const d = db(platform)
	let posts
	try {
		posts = d ? await cached(platform, keys.feed, () => feed(d)) : []
	} catch (e) {
		// an empty feed would tell readers every post is gone, so ask them to come back
		console.error('feed', e)
		return new Response('The feed is resting. Try again in a minute.', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8', 'retry-after': '60' } })
	}
	return new Response(rss(url.origin, posts), { headers: { 'content-type': 'application/rss+xml; charset=utf-8', 'cache-control': 'public, max-age=900' } })
}
