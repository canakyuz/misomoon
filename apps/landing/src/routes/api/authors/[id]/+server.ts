import type { RequestHandler } from './$types'
import { authorIdProblem, deleteAuthor, getAuthor, parseAuthor, putAuthor } from '#lib/server/content.ts'
import { ApiError, body, database, handle, json, keys, preflight, purge, requireToken } from '#lib/server/api.ts'

const idOf = (id: string) => {
	const problem = authorIdProblem(id)
	if (problem) throw new ApiError(400, problem)
	return id
}

export const GET: RequestHandler = ({ params, platform }) =>
	handle(async () => {
		const author = await getAuthor(database(platform), idOf(params.id))
		if (!author) throw new ApiError(404, `no author "${params.id}"`)
		return json({ author }, 200, { 'cache-control': 'public, max-age=60' })
	})

/** PUT /api/authors/<id>: creates or replaces the author. 201 when it is new. */
export const PUT: RequestHandler = ({ params, request, platform }) =>
	handle(async () => {
		await requireToken(request, platform)
		const id = idOf(params.id)
		const parsed = parseAuthor(await body(request))
		if (!parsed.ok) throw new ApiError(400, parsed.error)
		const { author, created } = await putAuthor(database(platform), id, parsed)
		// posts print the author's name, so they go stale too, within the cache's minute
		await purge(platform, [keys.author(id)])
		return json({ author }, created ? 201 : 200)
	})

/** DELETE /api/authors/<id>: only an author that no entry names. */
export const DELETE: RequestHandler = ({ params, request, platform }) =>
	handle(async () => {
		await requireToken(request, platform)
		const id = idOf(params.id)
		if (!(await deleteAuthor(database(platform), id))) throw new ApiError(404, `no author "${id}"`)
		await purge(platform, [keys.author(id)])
		return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*' } })
	})

export const OPTIONS: RequestHandler = () => preflight()
