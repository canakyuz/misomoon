import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { PAGE_CACHE } from '#lib/server/api.ts'
import { posts } from '#lib/server/pages.ts'

export const load: PageServerLoad = async ({ params, url, platform, setHeaders }) => {
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(params.tag)) error(404, 'No such topic')
	const cursor = url.searchParams.get('cursor')
	const page = await posts(platform, { tag: params.tag, cursor })
	if (!page.items.length) error(404, 'No posts on this topic')
	setHeaders(PAGE_CACHE)
	return { tag: params.tag, posts: page.items, next: page.next, cursor }
}
