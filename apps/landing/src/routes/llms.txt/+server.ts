import type { RequestHandler } from './$types'
import { listEntries } from '#lib/server/content.ts'
import { docsUrlOf } from '#lib/server/docs.ts'
import { llms } from '#lib/server/feeds.ts'
import { db } from '#lib/server/pages.ts'

export const GET: RequestHandler = async ({ url, platform }) => {
	const d = db(platform)
	const posts = d ? (await listEntries(d, { kind: 'post', limit: 50 }).catch(() => ({ items: [] }))).items : []
	return new Response(llms(url.origin, docsUrlOf(platform), posts), { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } })
}
