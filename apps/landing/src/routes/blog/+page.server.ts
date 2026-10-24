import type { PageServerLoad } from './$types'
import { PAGE_CACHE } from '#lib/server/api.ts'
import { posts, tags } from '#lib/server/pages.ts'

export const load: PageServerLoad = async ({ url, platform, setHeaders }) => {
	setHeaders(PAGE_CACHE)
	const cursor = url.searchParams.get('cursor')
	const [page, all] = await Promise.all([posts(platform, { cursor }), tags(platform)])
	return { posts: page.items, next: page.next, tags: all, cursor }
}
