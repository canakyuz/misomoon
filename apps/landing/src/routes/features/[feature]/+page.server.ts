import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { featurePage } from '#lib/feature-pages.ts'

// The page gets its own feature and a short card for the related one, not the whole related page.
export const load: PageServerLoad = ({ params, setHeaders }) => {
	const feature = featurePage(params.feature)
	if (!feature) error(404, 'No such feature')
	const related = featurePage(feature.related)
	if (!related) error(404, 'No such feature')
	setHeaders({ 'cache-control': 'public, max-age=300, stale-while-revalidate=86400' })
	return {
		feature,
		related: { slug: related.slug, h1: related.h1[0], description: related.description },
	}
}
