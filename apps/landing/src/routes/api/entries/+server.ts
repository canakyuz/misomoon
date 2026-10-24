import type { RequestHandler } from './$types'
import { listEntries } from '#lib/server/content.ts'
import { ApiError, authorized, database, handle, json, kindOf, preflight } from '#lib/server/api.ts'

/** GET /api/entries?kind=post&tag=&author=&limit=&cursor=&drafts=1 */
export const GET: RequestHandler = ({ url, request, platform }) =>
	handle(async () => {
		const q = url.searchParams
		const kind = kindOf(q.get('kind') ?? 'post')
		const drafts = q.get('drafts') === '1'
		if (drafts && !(await authorized(request, platform))) throw new ApiError(401, 'drafts=1 needs Authorization: Bearer <CONTENT_TOKEN>')
		const limit = q.has('limit') ? Number(q.get('limit')) : undefined
		if (limit !== undefined && !(Number.isInteger(limit) && limit >= 1 && limit <= 100)) throw new ApiError(400, 'limit: 1 to 100')
		const page = await listEntries(database(platform), {
			kind,
			tag: q.get('tag') ?? undefined,
			author: q.get('author') ?? undefined,
			limit,
			cursor: q.get('cursor'),
			drafts,
		})
		return json(page, 200, drafts ? { 'cache-control': 'private, no-store' } : { 'cache-control': 'public, max-age=60' })
	})

export const OPTIONS: RequestHandler = () => preflight()
