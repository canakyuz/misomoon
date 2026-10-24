import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { PAGE_CACHE } from '#lib/server/api.ts'
import { entry, relatedTo } from '#lib/server/pages.ts'

export const load: PageServerLoad = async ({ params, platform, setHeaders }) => {
	const [post, more] = await Promise.all([entry(platform, 'post', params.slug), relatedTo(platform, 'post', params.slug)])
	if (!post) error(404, 'No such post')
	setHeaders({ ...PAGE_CACHE, 'last-modified': new Date(post.updatedAt).toUTCString() })
	return { post, more }
}
