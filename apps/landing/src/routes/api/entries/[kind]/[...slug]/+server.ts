import type { RequestHandler } from './$types'
import { deleteEntry, getEntry, parseEntry, putEntry, slugProblem } from '#lib/server/content.ts'
import { ApiError, authorized, body, database, handle, json, kindOf, preflight, purge, requireToken, staleAfter } from '#lib/server/api.ts'

const target = (params: { kind: string; slug: string }) => {
	const kind = kindOf(params.kind)
	const problem = slugProblem(kind, params.slug)
	if (problem) throw new ApiError(400, problem)
	return { kind, slug: params.slug }
}

/** GET /api/entries/post/<slug>. A client with the token also reads drafts. */
export const GET: RequestHandler = ({ params, request, platform }) =>
	handle(async () => {
		const { kind, slug } = target(params)
		const drafts = await authorized(request, platform)
		const entry = await getEntry(database(platform), kind, slug, drafts)
		if (!entry) throw new ApiError(404, `no ${kind} "${slug}"`)
		return json({ entry }, 200, { 'cache-control': drafts ? 'private, no-store' : 'public, max-age=60' })
	})

/** PUT /api/entries/post/<slug>: creates or replaces the entry. 201 when it is new. */
export const PUT: RequestHandler = ({ params, request, platform }) =>
	handle(async () => {
		await requireToken(request, platform)
		const { kind, slug } = target(params)
		const parsed = parseEntry(kind, await body(request))
		if (!parsed.ok) throw new ApiError(400, parsed.error)
		const db = database(platform)
		const before = await getEntry(db, kind, slug, true)
		const { entry, created } = await putEntry(db, kind, slug, parsed)
		await purge(platform, [...staleAfter(kind, slug, [...new Set([...entry.tags, ...(before?.tags ?? [])])], entry.author?.id ?? null), ...(before?.author ? staleAfter(kind, slug, [], before.author.id) : [])])
		return json({ entry, warnings: parsed.warnings }, created ? 201 : 200)
	})

export const DELETE: RequestHandler = ({ params, request, platform }) =>
	handle(async () => {
		await requireToken(request, platform)
		const { kind, slug } = target(params)
		const db = database(platform)
		const before = await getEntry(db, kind, slug, true)
		if (!(await deleteEntry(db, kind, slug))) throw new ApiError(404, `no ${kind} "${slug}"`)
		await purge(platform, staleAfter(kind, slug, before?.tags ?? [], before?.author?.id ?? null))
		return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*' } })
	})

export const OPTIONS: RequestHandler = () => preflight()
