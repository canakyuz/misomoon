// What the blog and page routes read, through the edge cache. A database that is missing
// or down answers 503, never a 404, so search engines don't drop the pages.
import { error } from '@sveltejs/kit'
import { cached, keys } from './api.ts'
import { worker } from './platform.ts'
import { getAuthor, getEntry, listEntries, listTags, related, type Kind } from './content.ts'

export function db(platform: App.Platform | undefined): D1Database | null {
	return worker(platform).env.CONTENT ?? null
}

async function guard<T>(fn: () => Promise<T>): Promise<T> {
	try {
		return await fn()
	} catch (e) {
		console.error('content', e)
		error(503, 'The blog is resting. Try again in a minute.')
	}
}

export const POSTS_PER_PAGE = 12

export function posts(platform: App.Platform | undefined, o: { tag?: string; author?: string; cursor?: string | null } = {}) {
	const d = db(platform)
	if (!d) return Promise.resolve({ items: [], next: null })
	return guard(() =>
		cached(platform, keys.list('post', o.tag, o.author, o.cursor ?? ''), () => listEntries(d, { kind: 'post', tag: o.tag, author: o.author, cursor: o.cursor, limit: POSTS_PER_PAGE })),
	)
}

export function tags(platform: App.Platform | undefined) {
	const d = db(platform)
	if (!d) return Promise.resolve([])
	return guard(() => cached(platform, keys.tags, () => listTags(d)))
}

export function entry(platform: App.Platform | undefined, kind: Kind, slug: string) {
	const d = db(platform)
	if (!d) return Promise.resolve(null)
	return guard(() => cached(platform, keys.entry(kind, slug), () => getEntry(d, kind, slug)))
}

export function relatedTo(platform: App.Platform | undefined, kind: Kind, slug: string) {
	const d = db(platform)
	if (!d) return Promise.resolve([])
	return guard(() => cached(platform, keys.related(kind, slug), () => related(d, kind, slug)))
}

export function author(platform: App.Platform | undefined, id: string) {
	const d = db(platform)
	if (!d) return Promise.resolve(null)
	return guard(() => cached(platform, keys.author(id), () => getAuthor(d, id)))
}
