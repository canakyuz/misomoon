import { error } from '@sveltejs/kit'
import { built, sources } from '#lib/server/docs.ts'
import { slugOf } from '#lib/server/render.ts'

// Each page as its Markdown source, for AI tools and for "Copy page".

export function GET({ params }) {
	const file = built.find((f) => slugOf(f) === params.slug)
	if (!file) error(404, 'No such page')
	return new Response(sources.get(file), { headers: { 'content-type': 'text/markdown; charset=utf-8' } })
}
