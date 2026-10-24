import type { RequestHandler } from './$types'
import { robots } from '#lib/server/feeds.ts'

export const GET: RequestHandler = ({ url }) => new Response(robots(url.origin), { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=86400' } })
