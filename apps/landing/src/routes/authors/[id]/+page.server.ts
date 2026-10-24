import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { PAGE_CACHE } from '#lib/server/api.ts'
import { authorIdProblem } from '#lib/server/content.ts'
import { author, posts } from '#lib/server/pages.ts'

export const load: PageServerLoad = async ({ params, url, platform, setHeaders }) => {
	if (authorIdProblem(params.id)) error(404, 'No such author')
	const cursor = url.searchParams.get('cursor')
	const [person, page] = await Promise.all([author(platform, params.id), posts(platform, { author: params.id, cursor })])
	if (!person) error(404, 'No such author')
	setHeaders(PAGE_CACHE)
	return { person, posts: page.items, next: page.next, cursor }
}
