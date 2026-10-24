import type { RequestHandler } from './$types'
import { listAuthors } from '#lib/server/content.ts'
import { database, handle, json, preflight } from '#lib/server/api.ts'

/** GET /api/authors */
export const GET: RequestHandler = ({ platform }) => handle(async () => json({ items: await listAuthors(database(platform)) }, 200, { 'cache-control': 'public, max-age=60' }))

export const OPTIONS: RequestHandler = () => preflight()
