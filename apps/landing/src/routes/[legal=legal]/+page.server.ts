import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { PAGE_CACHE } from '#lib/server/api.ts'
import { isLegal, legalPage } from '#lib/server/legal.ts'

/** A legal page, rendered from its file in docs/. */
export const load: PageServerLoad = async ({ params, parent, setHeaders }) => {
	if (!isLegal(params.legal)) error(404, 'Not found')
	const doc = legalPage(params.legal, (await parent()).docsUrl)
	if (!doc) error(404, 'Not found')
	setHeaders(PAGE_CACHE)
	return { doc }
}
