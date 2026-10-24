import type { RequestHandler } from './$types'
import { worker } from '#lib/server/platform.ts'
import { docLink } from '#lib/links.ts'

// RFC 9116. Expires stays six months ahead, so the file never lapses between deploys.
const HALF_YEAR = 182 * 86_400_000

export const GET: RequestHandler = ({ url, platform }) => {
	const docs = (worker(platform).env.PUBLIC_DOCS_URL ?? process.env.PUBLIC_DOCS_URL ?? '').replace(/\/$/, '') || null
	const expires = new Date(Math.floor((Date.now() + HALF_YEAR) / 86_400_000) * 86_400_000).toISOString()
	const body = [
		'Contact: mailto:security@misomoon.com',
		`Expires: ${expires}`,
		`Policy: ${docLink(docs, 'security')}`,
		'Preferred-Languages: en',
		`Canonical: ${url.origin}/.well-known/security.txt`,
		'',
	].join('\n')
	return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=86400' } })
}
