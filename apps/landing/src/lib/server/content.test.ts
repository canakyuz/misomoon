import { describe, expect, it } from 'vite-plus/test'
import { deleteAuthor, deleteEntry, getEntry, indexable, listEntries, listTags, parseAuthor, parseEntry, putAuthor, putEntry, related, slugProblem } from './content.ts'
import { fakeD1 } from './fake-d1.ts'
import { render } from './markdown.ts'

const post = (over: Record<string, unknown> = {}) => ({
	title: 'Count visits without cookies',
	description: 'How misomoon tells one visitor from another for a day, with a salt that changes at midnight and no cookie at all.',
	body: '## Why\n\nNo cookie is set.\n\n### How\n\nA daily salt.',
	status: 'published',
	author: 'jane-doe',
	tags: ['privacy'],
	image: 'https://misomoon.com/og.png',
	imageAlt: 'A moon over a horizon',
	...over,
})

const ok = <T>(r: { ok: true; value: T } | { ok: false; error: string }) => {
	if (!r.ok) throw new Error(r.error)
	return r as { ok: true; value: T; warnings: string[] }
}

async function db() {
	const d = fakeD1()
	await putAuthor(d, 'jane-doe', ok(parseAuthor({ name: 'Jane Doe', bio: 'Builds misomoon.', sameAs: ['https://github.com/jane'] })))
	return d
}

describe('Markdown', () => {
	it('prints raw HTML as text and drops unsafe links', () => {
		const { html } = render('<script>alert(1)</script>\n\n[x](javascript:alert(1)) [y](https://a.com) [z](/blog) ![i](data:image/png;base64,AA)')
		expect(html).not.toContain('<script>')
		expect(html).toContain('&lt;script&gt;')
		expect(html).not.toContain('javascript:')
		expect(html).toContain('<a href="https://a.com" rel="noopener">y</a>')
		expect(html).toContain('<a href="/blog">z</a>')
		expect(html).not.toContain('<img')
	})

	it('keeps one h1 per page: a # heading becomes an h2, with a unique id in the contents', () => {
		const r = render('# Setup\n\ntext\n\n## Setup\n\n### Details\n\n#### Deep')
		expect(r.html).toContain('<h2 id="setup">')
		expect(r.html).toContain('<h2 id="setup-1">')
		expect(r.toc).toEqual([
			{ id: 'setup', text: 'Setup', level: 2 },
			{ id: 'setup-1', text: 'Setup', level: 2 },
			{ id: 'details', text: 'Details', level: 3 },
		])
	})

	it('counts words without the heading anchors', () => {
		expect(render('## One two\n\nthree four five').words).toBe(5)
	})
})

describe('slugs', () => {
	it('takes lowercase words with dashes, and pages up to three segments', () => {
		expect(slugProblem('post', 'cookieless-analytics')).toBeNull()
		expect(slugProblem('page', 'guides/setup')).toBeNull()
		expect(slugProblem('post', 'a/b')).toMatch(/no "\/"/)
		expect(slugProblem('page', 'a/b/c/d')).toMatch(/three/)
		expect(slugProblem('post', 'Hello_World')).toMatch(/lowercase/)
	})

	it("keeps the site's own routes away from pages", () => {
		for (const s of ['blog', 'api/x', 'alternatives', 'features', 'demo']) expect(slugProblem('page', s)).toMatch(/belongs/)
		expect(slugProblem('post', 'features')).toBeNull()
	})
})

describe('parseEntry', () => {
	it('needs a title, a description and a body', () => {
		expect(parseEntry('post', { description: 'd', body: 'b' })).toEqual({ ok: false, error: 'title: 1 to 140 characters' })
		expect(parseEntry('post', { title: 't', body: 'b' })).toMatchObject({ ok: false, error: expect.stringMatching(/^description/) })
		expect(parseEntry('post', { title: 't', description: 'd', body: '  ' })).toMatchObject({ ok: false, error: expect.stringMatching(/^body/) })
	})

	it('refuses a published post without an author, an image without alt text, and bad URLs and dates', () => {
		expect(parseEntry('post', post({ author: null }))).toMatchObject({ error: 'author: a published post needs an author' })
		expect(parseEntry('page', post({ author: null })).ok).toBe(true)
		expect(parseEntry('post', post({ imageAlt: '' }))).toMatchObject({ error: expect.stringMatching(/^imageAlt/) })
		expect(parseEntry('post', post({ image: 'javascript:x' }))).toMatchObject({ error: expect.stringMatching(/^image:/) })
		expect(parseEntry('post', post({ canonical: 'http://a.com' }))).toMatchObject({ error: expect.stringMatching(/^canonical/) })
		expect(parseEntry('post', post({ publishedAt: 'yesterday' }))).toMatchObject({ error: expect.stringMatching(/^publishedAt/) })
		expect(parseEntry('post', post({ tags: ['Has Space'] }))).toMatchObject({ error: expect.stringMatching(/^tags/) })
	})

	it('warns about a long title, a description of the wrong length, and a post without an image', () => {
		const r = ok(parseEntry('post', post({ title: 'x'.repeat(70), description: 'short', image: null, imageAlt: null })))
		expect(r.warnings).toEqual([
			'title: over 60 characters, search results may cut it',
			'description: 70 to 160 characters fits a search result',
			expect.stringMatching(/^image:/),
		])
		expect(ok(parseEntry('post', post())).warnings).toEqual([])
	})
})

describe('the content database', () => {
	it('stores a post with its rendered HTML, contents, tags and author', async () => {
		const d = await db()
		const now = new Date('2026-10-25T09:00:00Z')
		const { entry, created } = await putEntry(d, 'post', 'cookieless', ok(parseEntry('post', post({ tags: ['privacy', 'how-to'] }))), now)
		expect(created).toBe(true)
		expect(entry).toMatchObject({
			kind: 'post',
			slug: 'cookieless',
			path: '/blog/cookieless',
			status: 'published',
			tags: ['how-to', 'privacy'],
			author: { id: 'jane-doe', name: 'Jane Doe', sameAs: ['https://github.com/jane'] },
			publishedAt: '2026-10-25T09:00:00.000Z',
			updatedAt: '2026-10-25T09:00:00.000Z',
			toc: [
				{ id: 'why', text: 'Why', level: 2 },
				{ id: 'how', text: 'How', level: 3 },
			],
		})
		expect(entry.html).toContain('<h2 id="why">')
	})

	it('keeps the publish date, and moves updatedAt only for a real change that is not minor', async () => {
		const d = await db()
		await putEntry(d, 'post', 'a', ok(parseEntry('post', post())), new Date('2026-10-01T00:00:00Z'))
		const same = await putEntry(d, 'post', 'a', ok(parseEntry('post', post({ tags: ['other'] }))), new Date('2026-10-02T00:00:00Z'))
		expect(same.entry).toMatchObject({ publishedAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', tags: ['other'] })
		const typo = await putEntry(d, 'post', 'a', ok(parseEntry('post', post({ body: '## Why\n\nNo cookie.', minor: true }))), new Date('2026-10-03T00:00:00Z'))
		expect(typo.entry.updatedAt).toBe('2026-10-01T00:00:00.000Z')
		const real = await putEntry(d, 'post', 'a', ok(parseEntry('post', post({ body: 'New text' }))), new Date('2026-10-04T00:00:00Z'))
		expect(real.entry).toMatchObject({ publishedAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-04T00:00:00.000Z' })
		expect(real.created).toBe(false)
	})

	it('hides drafts from readers, and a draft has no publish date until it is published', async () => {
		const d = await db()
		await putEntry(d, 'post', 'wip', ok(parseEntry('post', post({ status: 'draft' }))), new Date('2026-10-01T00:00:00Z'))
		expect(await getEntry(d, 'post', 'wip')).toBeNull()
		expect((await getEntry(d, 'post', 'wip', true))?.publishedAt).toBeNull()
		expect((await listEntries(d, { kind: 'post' })).items).toEqual([])
		expect((await listEntries(d, { kind: 'post', drafts: true })).items).toHaveLength(1)
		const pub = await putEntry(d, 'post', 'wip', ok(parseEntry('post', post())), new Date('2026-10-05T00:00:00Z'))
		expect(pub.entry.publishedAt).toBe('2026-10-05T00:00:00.000Z')
	})

	it('refuses an author that does not exist', async () => {
		const d = await db()
		await expect(putEntry(d, 'post', 'x', ok(parseEntry('post', post({ author: 'nobody' }))))).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/no author "nobody"/) })
	})

	it('lists newest first, by tag and by author, one page at a time', async () => {
		const d = await db()
		for (let i = 1; i <= 5; i++)
			await putEntry(d, 'post', `p${i}`, ok(parseEntry('post', post({ tags: i % 2 ? ['odd'] : ['even'], publishedAt: `2026-10-0${i}T00:00:00Z` }))))
		const first = await listEntries(d, { kind: 'post', limit: 2 })
		expect(first.items.map((e) => e.slug)).toEqual(['p5', 'p4'])
		const second = await listEntries(d, { kind: 'post', limit: 2, cursor: first.next })
		expect(second.items.map((e) => e.slug)).toEqual(['p3', 'p2'])
		const third = await listEntries(d, { kind: 'post', limit: 2, cursor: second.next })
		expect(third).toMatchObject({ items: [{ slug: 'p1' }], next: null })
		expect((await listEntries(d, { kind: 'post', tag: 'odd' })).items.map((e) => e.slug)).toEqual(['p5', 'p3', 'p1'])
		expect((await listEntries(d, { kind: 'post', author: 'jane-doe' })).items).toHaveLength(5)
		expect(await listTags(d)).toEqual([
			{ tag: 'odd', count: 3 },
			{ tag: 'even', count: 2 },
		])
		expect((await related(d, 'post', 'p1', 2)).map((e) => e.slug)).toEqual(['p5', 'p3'])
	})

	it('puts only published, indexable entries without an outside canonical in the sitemap', async () => {
		const d = await db()
		await putEntry(d, 'post', 'yes', ok(parseEntry('post', post())), new Date('2026-10-01T00:00:00Z'))
		await putEntry(d, 'post', 'hidden', ok(parseEntry('post', post({ noindex: true }))))
		await putEntry(d, 'post', 'elsewhere', ok(parseEntry('post', post({ canonical: 'https://dev.to/x' }))))
		await putEntry(d, 'post', 'draft', ok(parseEntry('post', post({ status: 'draft' }))))
		await putEntry(d, 'page', 'about', ok(parseEntry('page', post({ author: null }))), new Date('2026-10-02T00:00:00Z'))
		expect(await indexable(d)).toEqual([
			{ path: '/about', updatedAt: '2026-10-02T00:00:00.000Z' },
			{ path: '/blog/yes', updatedAt: '2026-10-01T00:00:00.000Z' },
		])
	})

	it('deletes an entry with its tags, and an author only once no entry names them', async () => {
		const d = await db()
		await putEntry(d, 'post', 'a', ok(parseEntry('post', post())))
		await expect(deleteAuthor(d, 'jane-doe')).rejects.toMatchObject({ status: 409 })
		expect(await deleteEntry(d, 'post', 'a')).toBe(true)
		expect(await deleteEntry(d, 'post', 'a')).toBe(false)
		expect(await listTags(d)).toEqual([])
		expect(await deleteAuthor(d, 'jane-doe')).toBe(true)
	})
})

describe('parseAuthor', () => {
	it('needs a name and takes https profile links', () => {
		expect(parseAuthor({})).toMatchObject({ ok: false, error: expect.stringMatching(/^name/) })
		expect(parseAuthor({ name: 'A', sameAs: ['ftp://x'] })).toMatchObject({ ok: false, error: expect.stringMatching(/^sameAs/) })
		expect(parseAuthor({ name: 'A' })).toEqual({ ok: true, warnings: [], value: { name: 'A', bio: '', avatar: null, sameAs: [] } })
	})
})
