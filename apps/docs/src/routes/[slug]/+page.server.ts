import { error } from '@sveltejs/kit'
import { built, editUrl, nav, page, pages } from '#lib/server/docs.ts'
import { slugOf } from '#lib/server/render.ts'

export async function load({ params }) {
	const file = built.find((f) => slugOf(f) === params.slug)
	const doc = file && (await page(params.slug))
	if (!file || !doc) error(404, 'No such page')
	const i = pages.findIndex((p) => p.slug === params.slug)
	return {
		slug: params.slug,
		title: doc.title,
		description: doc.description,
		html: doc.html,
		toc: doc.toc,
		section: nav.sections.find((s) => s.pages.some((p) => p.slug === params.slug))?.title ?? null,
		prev: i > 0 ? pages[i - 1] : null,
		next: i >= 0 && i < pages.length - 1 ? pages[i + 1] : null,
		edit: editUrl(file),
	}
}
