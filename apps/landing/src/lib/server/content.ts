// Blog posts and pages, stored in the CONTENT D1 database (migrations/). The routes
// under /blog and /[...path] and the API under /api/entries call these same functions.
import { render, type TocEntry } from './markdown.ts'

export type Kind = 'post' | 'page'
export type Status = 'draft' | 'published'
export const KINDS: Kind[] = ['post', 'page']

export interface Author {
	id: string
	name: string
	bio: string
	avatar: string | null
	sameAs: string[]
	updatedAt: string
}

export interface Summary {
	kind: Kind
	slug: string
	/** where the entry is served: /blog/<slug> or /<slug> */
	path: string
	status: Status
	title: string
	description: string
	image: string | null
	imageAlt: string | null
	tags: string[]
	author: Author | null
	words: number
	publishedAt: string | null
	updatedAt: string
	noindex: boolean
	canonical: string | null
}

export interface Entry extends Summary {
	body: string
	html: string
	toc: TocEntry[]
}

/** What a client sends to create or replace an entry. */
export interface EntryInput {
	title: string
	description: string
	body: string
	status?: Status
	tags?: string[]
	author?: string | null
	image?: string | null
	imageAlt?: string | null
	canonical?: string | null
	noindex?: boolean
	publishedAt?: string | null
	/** a typo fix: keep `updatedAt`, so the sitemap's lastmod stays honest */
	minor?: boolean
}

export interface AuthorInput {
	name: string
	bio?: string
	avatar?: string | null
	sameAs?: string[]
}

/** First path segments that belong to the site's own routes, so a page can't take them. */
export const RESERVED = new Set(['api', 'blog', 'authors', 'alternatives', 'features', 'pricing', 'privacy', 'terms', 'dpa', 'security', 'demo', 'sitemap.xml', 'sitemap-docs.xml', 'robots.txt', 'llms.txt', 'llms-full.txt', 'feed.xml', '.well-known', '_app'])

const SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const TAG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const pathOf = (kind: Kind, slug: string) => (kind === 'post' ? `/blog/${slug}` : `/${slug}`)

/** Why a slug can't be used, or null. A page slug may have up to three segments, such as `guides/setup`. */
export function slugProblem(kind: Kind, slug: string): string | null {
	if (slug.length > 120) return 'slug: at most 120 characters'
	const parts = slug.split('/')
	if (kind === 'post' && parts.length > 1) return 'slug: a post slug has no "/"'
	if (parts.length > 3) return 'slug: at most three segments'
	if (!parts.every((p) => SEGMENT.test(p))) return 'slug: lowercase letters, digits and dashes, such as "cookieless-analytics"'
	if (kind === 'page' && RESERVED.has(parts[0])) return `slug: "${parts[0]}" belongs to the site's own pages`
	return null
}

const isUrl = (v: string, paths = false) => (paths && /^\/(?!\/)/.test(v)) || /^https:\/\/[^\s/]+/i.test(v)
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2}))?$/.test(v) && !Number.isNaN(Date.parse(v))

type Result<T> = { ok: true; value: T; warnings: string[] } | { ok: false; error: string }

/**
 * Checks an entry from a client. Errors refuse the write. Warnings don't: they point at
 * what search engines and readers miss, such as a description of the wrong length.
 */
export function parseEntry(kind: Kind, input: unknown): Result<Required<Omit<EntryInput, 'minor'>> & { minor: boolean }> {
	if (!input || typeof input !== 'object') return { ok: false, error: 'body: send a JSON object' }
	const i = input as Record<string, unknown>
	const str = (k: string) => (typeof i[k] === 'string' ? (i[k] as string).trim() : undefined)
	const opt = (k: string) => (i[k] == null || i[k] === '' ? null : str(k))
	const title = str('title')
	const description = str('description')
	const body = typeof i.body === 'string' ? i.body : undefined
	if (!title || title.length > 140) return { ok: false, error: 'title: 1 to 140 characters' }
	if (!description || description.length > 320) return { ok: false, error: 'description: 1 to 320 characters' }
	if (!body || !body.trim() || body.length > 200_000) return { ok: false, error: 'body: Markdown, 1 to 200,000 characters' }
	const status = i.status ?? 'draft'
	if (status !== 'draft' && status !== 'published') return { ok: false, error: 'status: "draft" or "published"' }
	const tags = i.tags ?? []
	if (!Array.isArray(tags) || tags.length > 10 || !tags.every((t) => typeof t === 'string' && t.length <= 40 && TAG.test(t)))
		return { ok: false, error: 'tags: up to 10, lowercase letters, digits and dashes' }
	const author = opt('author')
	if (author === undefined || (author && !ID.test(author))) return { ok: false, error: 'author: an author id, such as "jane-doe"' }
	const image = opt('image')
	if (image === undefined || (image && !isUrl(image, true))) return { ok: false, error: 'image: an https URL or a path on this site' }
	const imageAlt = opt('imageAlt')
	if (imageAlt === undefined) return { ok: false, error: 'imageAlt: text' }
	if (image && !imageAlt) return { ok: false, error: 'imageAlt: describe the image for people who can’t see it' }
	const canonical = opt('canonical')
	if (canonical === undefined || (canonical && !isUrl(canonical))) return { ok: false, error: 'canonical: an https URL' }
	const publishedAt = opt('publishedAt')
	if (publishedAt === undefined || (publishedAt && !isDate(publishedAt))) return { ok: false, error: 'publishedAt: an ISO 8601 date, such as 2026-10-25T09:00:00Z' }
	if (i.noindex != null && typeof i.noindex !== 'boolean') return { ok: false, error: 'noindex: true or false' }
	if (i.minor != null && typeof i.minor !== 'boolean') return { ok: false, error: 'minor: true or false' }
	if (kind === 'post' && status === 'published' && !author) return { ok: false, error: 'author: a published post needs an author' }

	const warnings: string[] = []
	if (title.length > 60) warnings.push('title: over 60 characters, search results may cut it')
	if (description.length < 70 || description.length > 160) warnings.push('description: 70 to 160 characters fits a search result')
	if (kind === 'post' && !image) warnings.push('image: a post without an image of at least 1200 pixels wide gets no large preview in Discover or on social sites')
	return {
		ok: true,
		warnings,
		value: {
			title,
			description,
			body,
			status,
			tags: [...new Set(tags as string[])],
			author: author ?? null,
			image: image ?? null,
			imageAlt: image ? (imageAlt ?? null) : null,
			canonical: canonical ?? null,
			noindex: i.noindex === true,
			publishedAt: publishedAt ? new Date(publishedAt).toISOString() : null,
			minor: i.minor === true,
		},
	}
}

export function parseAuthor(input: unknown): Result<Required<AuthorInput>> {
	if (!input || typeof input !== 'object') return { ok: false, error: 'body: send a JSON object' }
	const i = input as Record<string, unknown>
	const name = typeof i.name === 'string' ? i.name.trim() : ''
	if (!name || name.length > 80) return { ok: false, error: 'name: 1 to 80 characters' }
	const bio = typeof i.bio === 'string' ? i.bio.trim() : i.bio == null ? '' : null
	if (bio === null || bio.length > 600) return { ok: false, error: 'bio: up to 600 characters' }
	const avatar = i.avatar == null || i.avatar === '' ? null : typeof i.avatar === 'string' && isUrl(i.avatar, true) ? i.avatar : undefined
	if (avatar === undefined) return { ok: false, error: 'avatar: an https URL or a path on this site' }
	const sameAs = i.sameAs ?? []
	if (!Array.isArray(sameAs) || sameAs.length > 10 || !sameAs.every((u) => typeof u === 'string' && isUrl(u)))
		return { ok: false, error: 'sameAs: up to 10 https URLs of the author’s profiles' }
	return { ok: true, warnings: [], value: { name, bio, avatar, sameAs } }
}

export const authorIdProblem = (id: string) => (ID.test(id) && id.length <= 60 ? null : 'id: lowercase letters, digits and dashes, such as "jane-doe"')

// ───────────────────────────── reads

interface Row {
	kind: Kind
	slug: string
	status: Status
	title: string
	description: string
	image: string | null
	image_alt: string | null
	tags: string
	words: number
	published_at: string | null
	updated_at: string
	noindex: number
	canonical: string | null
	a_id: string | null
	a_name: string | null
	a_bio: string | null
	a_avatar: string | null
	a_same_as: string | null
	a_updated_at: string | null
	body?: string
	html?: string
	toc?: string
}

const SUMMARY = `e.kind, e.slug, e.status, e.title, e.description, e.image, e.image_alt, e.words, e.published_at, e.updated_at, e.noindex, e.canonical,
	(SELECT json_group_array(tag) FROM entry_tags WHERE entry_id = e.id) AS tags,
	a.id AS a_id, a.name AS a_name, a.bio AS a_bio, a.avatar AS a_avatar, a.same_as AS a_same_as, a.updated_at AS a_updated_at`
const FROM = `FROM entries e LEFT JOIN authors a ON a.id = e.author_id`

function toSummary(r: Row): Summary {
	return {
		kind: r.kind,
		slug: r.slug,
		path: pathOf(r.kind, r.slug),
		status: r.status,
		title: r.title,
		description: r.description,
		image: r.image,
		imageAlt: r.image_alt,
		tags: (JSON.parse(r.tags || '[]') as string[]).sort(),
		author: r.a_id ? { id: r.a_id, name: r.a_name!, bio: r.a_bio ?? '', avatar: r.a_avatar, sameAs: JSON.parse(r.a_same_as || '[]'), updatedAt: r.a_updated_at! } : null,
		words: r.words,
		publishedAt: r.published_at,
		updatedAt: r.updated_at,
		noindex: r.noindex === 1,
		canonical: r.canonical,
	}
}

/** One entry. Drafts only when `drafts` is set, for a client with the token. */
export async function getEntry(db: D1Database, kind: Kind, slug: string, drafts = false): Promise<Entry | null> {
	const r = await db
		.prepare(`SELECT ${SUMMARY}, e.body, e.html, e.toc ${FROM} WHERE e.kind = ? AND e.slug = ?${drafts ? '' : ` AND e.status = 'published'`}`)
		.bind(kind, slug)
		.first<Row>()
	return r ? { ...toSummary(r), body: r.body!, html: r.html!, toc: JSON.parse(r.toc || '[]') } : null
}

export interface ListOptions {
	kind: Kind
	tag?: string
	author?: string
	limit?: number
	/** the `next` value of the previous page */
	cursor?: string | null
	drafts?: boolean
}

export interface Page<T> {
	items: T[]
	/** pass as `cursor` for the next page; null on the last one */
	next: string | null
}

/** Newest first. A draft has no publish date yet and sorts first. */
export async function listEntries(db: D1Database, o: ListOptions): Promise<Page<Summary>> {
	const limit = Math.min(Math.max(o.limit ?? 20, 1), 100)
	const where = ['e.kind = ?']
	const args: unknown[] = [o.kind]
	if (!o.drafts) where.push(`e.status = 'published'`)
	if (o.tag) {
		where.push('EXISTS (SELECT 1 FROM entry_tags t WHERE t.entry_id = e.id AND t.tag = ?)')
		args.push(o.tag)
	}
	if (o.author) {
		where.push('e.author_id = ?')
		args.push(o.author)
	}
	const cursor = o.cursor ? decodeCursor(o.cursor) : null
	if (cursor) {
		where.push(`(coalesce(e.published_at, '9999') < ? OR (coalesce(e.published_at, '9999') = ? AND e.id < ?))`)
		args.push(cursor.at, cursor.at, cursor.id)
	}
	const { results } = await db
		.prepare(`SELECT ${SUMMARY}, e.id AS id ${FROM} WHERE ${where.join(' AND ')} ORDER BY coalesce(e.published_at, '9999') DESC, e.id DESC LIMIT ?`)
		.bind(...args, limit + 1)
		.all<Row & { id: number }>()
	const more = results.length > limit
	const rows = results.slice(0, limit)
	const last = rows.at(-1)
	return { items: rows.map(toSummary), next: more && last ? encodeCursor(last.published_at ?? '9999', last.id) : null }
}

const encodeCursor = (at: string, id: number) => btoa(`${at}|${id}`).replace(/=+$/, '')
function decodeCursor(c: string): { at: string; id: number } | null {
	try {
		const [at, id] = atob(c).split('|')
		return at && /^\d+$/.test(id) ? { at, id: Number(id) } : null
	} catch {
		return null
	}
}

/** Tags of published posts, most used first. */
export async function listTags(db: D1Database): Promise<{ tag: string; count: number }[]> {
	const { results } = await db
		.prepare(
			`SELECT t.tag AS tag, count(*) AS count FROM entry_tags t JOIN entries e ON e.id = t.entry_id
			WHERE e.kind = 'post' AND e.status = 'published' GROUP BY t.tag ORDER BY count DESC, t.tag`,
		)
		.all<{ tag: string; count: number }>()
	return results
}

/** Every published entry that search engines may index, for the sitemap. */
export async function indexable(db: D1Database): Promise<{ path: string; updatedAt: string }[]> {
	const { results } = await db
		.prepare(`SELECT kind, slug, updated_at FROM entries WHERE status = 'published' AND noindex = 0 AND canonical IS NULL ORDER BY kind, slug`)
		.all<{ kind: Kind; slug: string; updated_at: string }>()
	return results.map((r) => ({ path: pathOf(r.kind, r.slug), updatedAt: r.updated_at }))
}

/** Entries that share a tag with this one, for "Read next". */
export async function related(db: D1Database, kind: Kind, slug: string, limit = 3): Promise<Summary[]> {
	const { results } = await db
		.prepare(
			`SELECT ${SUMMARY}, (SELECT count(*) FROM entry_tags t JOIN entry_tags mine ON mine.tag = t.tag
				WHERE t.entry_id = e.id AND mine.entry_id = (SELECT id FROM entries WHERE kind = ? AND slug = ?)) AS shared
			${FROM} WHERE e.kind = ? AND e.slug != ? AND e.status = 'published'
			ORDER BY shared DESC, e.published_at DESC LIMIT ?`,
		)
		.bind(kind, slug, kind, slug, limit)
		.all<Row>()
	return results.map(toSummary)
}

export async function getAuthor(db: D1Database, id: string): Promise<Author | null> {
	const r = await db.prepare('SELECT id, name, bio, avatar, same_as, updated_at FROM authors WHERE id = ?').bind(id).first<AuthorRow>()
	return r ? toAuthor(r) : null
}

export async function listAuthors(db: D1Database): Promise<Author[]> {
	const { results } = await db.prepare('SELECT id, name, bio, avatar, same_as, updated_at FROM authors ORDER BY name').all<AuthorRow>()
	return results.map(toAuthor)
}

interface AuthorRow {
	id: string
	name: string
	bio: string
	avatar: string | null
	same_as: string
	updated_at: string
}
const toAuthor = (r: AuthorRow): Author => ({ id: r.id, name: r.name, bio: r.bio, avatar: r.avatar, sameAs: JSON.parse(r.same_as || '[]'), updatedAt: r.updated_at })

// ───────────────────────────── writes

export class ContentError extends Error {
	constructor(
		readonly status: 400 | 404 | 409,
		message: string,
	) {
		super(message)
	}
}

/**
 * Creates or replaces an entry. The Markdown is rendered here, once. `publishedAt` is
 * set on the first publish and kept after that unless the client sends one. `updatedAt`
 * moves only when the title, description, body or image changes, and not for a `minor`
 * edit, so the sitemap's lastmod means a real change.
 */
export async function putEntry(db: D1Database, kind: Kind, slug: string, input: ReturnType<typeof parseEntry> & { ok: true }, now = new Date()): Promise<{ entry: Entry; created: boolean }> {
	const v = input.value
	if (v.author && !(await getAuthor(db, v.author))) throw new ContentError(400, `author: no author "${v.author}". Create it with PUT /api/authors/${v.author}`)
	const old = await db
		.prepare('SELECT title, description, body, image, published_at, updated_at FROM entries WHERE kind = ? AND slug = ?')
		.bind(kind, slug)
		.first<{ title: string; description: string; body: string; image: string | null; published_at: string | null; updated_at: string }>()
	const at = now.toISOString()
	const changed = !old || old.title !== v.title || old.description !== v.description || old.body !== v.body || old.image !== v.image
	const updatedAt = old && (!changed || v.minor) ? old.updated_at : at
	const publishedAt = v.publishedAt ?? old?.published_at ?? (v.status === 'published' ? at : null)
	const r = render(v.body)
	const pick = `(SELECT id FROM entries WHERE kind = ? AND slug = ?)`
	await db.batch([
		db
			.prepare(
				`INSERT INTO entries (kind, slug, status, title, description, body, html, toc, words, author_id, image, image_alt, canonical, noindex, published_at, updated_at, created_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT (kind, slug) DO UPDATE SET status = excluded.status, title = excluded.title, description = excluded.description,
					body = excluded.body, html = excluded.html, toc = excluded.toc, words = excluded.words, author_id = excluded.author_id,
					image = excluded.image, image_alt = excluded.image_alt, canonical = excluded.canonical, noindex = excluded.noindex,
					published_at = excluded.published_at, updated_at = excluded.updated_at`,
			)
			.bind(kind, slug, v.status, v.title, v.description, v.body, r.html, JSON.stringify(r.toc), r.words, v.author, v.image, v.imageAlt, v.canonical, v.noindex ? 1 : 0, publishedAt, updatedAt, at),
		db.prepare(`DELETE FROM entry_tags WHERE entry_id = ${pick}`).bind(kind, slug),
		...v.tags.map((t) => db.prepare(`INSERT INTO entry_tags (entry_id, tag) SELECT id, ? FROM entries WHERE kind = ? AND slug = ?`).bind(t, kind, slug)),
	])
	return { entry: (await getEntry(db, kind, slug, true))!, created: !old }
}

/** Deletes an entry and its tags. False when there was none. */
export async function deleteEntry(db: D1Database, kind: Kind, slug: string): Promise<boolean> {
	const [, del] = await db.batch([
		db.prepare('DELETE FROM entry_tags WHERE entry_id = (SELECT id FROM entries WHERE kind = ? AND slug = ?)').bind(kind, slug),
		db.prepare('DELETE FROM entries WHERE kind = ? AND slug = ?').bind(kind, slug),
	])
	return (del.meta.changes ?? 0) > 0
}

export async function putAuthor(db: D1Database, id: string, input: ReturnType<typeof parseAuthor> & { ok: true }, now = new Date()): Promise<{ author: Author; created: boolean }> {
	const v = input.value
	const old = await getAuthor(db, id)
	await db
		.prepare(
			`INSERT INTO authors (id, name, bio, avatar, same_as, updated_at) VALUES (?, ?, ?, ?, ?, ?)
			ON CONFLICT (id) DO UPDATE SET name = excluded.name, bio = excluded.bio, avatar = excluded.avatar, same_as = excluded.same_as, updated_at = excluded.updated_at`,
		)
		.bind(id, v.name, v.bio, v.avatar, JSON.stringify(v.sameAs), now.toISOString())
		.run()
	return { author: (await getAuthor(db, id))!, created: !old }
}

/** Deletes an author with no entries. An author with entries stays, with a 409. */
export async function deleteAuthor(db: D1Database, id: string): Promise<boolean> {
	const used = await db.prepare('SELECT count(*) AS n FROM entries WHERE author_id = ?').bind(id).first<number>('n')
	if (used) throw new ContentError(409, `author: ${used} ${used === 1 ? 'entry names' : 'entries name'} this author. Move or delete them first`)
	const r = await db.prepare('DELETE FROM authors WHERE id = ?').bind(id).run()
	return (r.meta.changes ?? 0) > 0
}

/** The newest published posts with their HTML, for the RSS feed. */
export async function feed(db: D1Database, limit = 20): Promise<Entry[]> {
	const { results } = await db
		.prepare(`SELECT ${SUMMARY}, e.body, e.html, e.toc ${FROM} WHERE e.kind = 'post' AND e.status = 'published' ORDER BY e.published_at DESC, e.id DESC LIMIT ?`)
		.bind(limit)
		.all<Row>()
	return results.map((r) => ({ ...toSummary(r), body: r.body!, html: r.html!, toc: JSON.parse(r.toc || '[]') }))
}
