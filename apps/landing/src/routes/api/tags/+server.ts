import type { RequestHandler } from './$types'
import { listTags } from '#lib/server/content.ts'
import { database, handle, json, preflight } from '#lib/server/api.ts'

/** GET /api/tags: tags of published posts, most used first. */
export const GET: RequestHandler = ({ platform }) => handle(async () => json({ items: await listTags(database(platform)) }, 200, { 'cache-control': 'public, max-age=60' }))

export const OPTIONS: RequestHandler = () => preflight()
