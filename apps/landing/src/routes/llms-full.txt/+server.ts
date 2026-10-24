import type { RequestHandler } from './$types'
import { cached, keys } from '#lib/server/api.ts'
import { getEntry, listEntries } from '#lib/server/content.ts'
import { docsUrlOf } from '#lib/server/docs.ts'
import { llmsFull } from '#lib/server/feeds.ts'
import { db } from '#lib/server/pages.ts'

/** Everything llms.txt links to, as one Markdown file. The posts come through the edge cache. */
export const GET: RequestHandler = async ({ url, platform }) => {
	const d = db(platform)
	const posts = d
		? await cached(platform, keys.llms, async () => {
				const list = (await listEntries(d, { kind: 'post', limit: 50 })).items
				const full = await Promise.all(list.map((p) => getEntry(d, 'post', p.slug)))
				return full.filter((p) => p !== null).map((p) => ({ title: p.title, path: p.path, description: p.description, body: p.body }))
			}).catch((e) => {
				// the docs and the legal pages are worth serving without the posts
				console.error('llms-full', e)
				return []
			})
		: []
	return new Response(llmsFull(url.origin, docsUrlOf(platform), posts), { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } })
}
