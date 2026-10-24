import { error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { docsUrlOf } from '#lib/server/docs.ts'
import { docPages, sitemap } from '#lib/server/feeds.ts'

/**
 * The docs site's pages, and only those: docs.misomoon.com's robots.txt names this file,
 * which is how a sitemap on one host may list another host's URLs.
 */
export const GET: RequestHandler = ({ url, platform }) => {
	const docs = docsUrlOf(platform)
	if (!docs) error(404, 'No docs site')
	return new Response(sitemap(url.origin, docPages(docs)), { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } })
}
