import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { PAGE_CACHE } from '#lib/server/api.ts'
import { slugProblem } from '#lib/server/content.ts'
import { entry } from '#lib/server/pages.ts'

/** A page from the content database, such as /about or /guides/setup. */
export const load: PageServerLoad = async ({ params, platform, setHeaders }) => {
	const slug = params.path.replace(/\/$/, '')
	if (slugProblem('page', slug)) error(404, 'Not found')
	const doc = await entry(platform, 'page', slug)
	if (!doc) error(404, 'Not found')
	setHeaders({ ...PAGE_CACHE, 'last-modified': new Date(doc.updatedAt).toUTCString() })
	return { doc }
}
