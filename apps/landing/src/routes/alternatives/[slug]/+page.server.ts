import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { ALTERNATIVES, MEASURED, OURS, alternative } from '#lib/alternatives.ts'

// The data stays on the server: the page gets only its own comparison, not every one.
export const load: PageServerLoad = ({ params, setHeaders }) => {
	const alt = alternative(params.slug)
	if (!alt) error(404, 'No such comparison')
	setHeaders({ 'cache-control': 'public, max-age=300, stale-while-revalidate=86400' })
	return { alt, ours: OURS, measured: MEASURED, others: ALTERNATIVES.filter((a) => a.slug !== alt.slug).map((a) => ({ slug: a.slug, short: a.short })) }
}
