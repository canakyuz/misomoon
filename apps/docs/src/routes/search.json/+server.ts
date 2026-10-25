import { json } from '@sveltejs/kit'
import { nav, rendered } from '#lib/server/docs.ts'
import { MOVED } from '#lib/server/render.ts'

export const prerender = true

/** One entry per heading of every page this site builds, with its whole text; the search dialog loads it on first use. */
export async function GET() {
	const all = await rendered()
	return json(
		nav.sections.flatMap((section) =>
			section.pages.filter((p) => !MOVED[p.file]).flatMap((p) =>
				(all.get(p.slug)?.sections ?? []).map((s) => ({ slug: p.slug, page: p.title, section: section.title, heading: s.heading, id: s.id, text: s.text })),
			),
		),
	)
}
