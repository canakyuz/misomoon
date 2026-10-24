import { describe, expect, it } from 'vite-plus/test'
import { parseFile } from './frontmatter.ts'

describe('parseFile', () => {
	it('reads a post, taking the slug from the file name', () => {
		const f = parseFile('---\ntitle: "Count: visits"\ndescription: How it works\nstatus: published\ntags: privacy, how-to\nnoindex: false\ncanonical:\n---\n\n## Hello\n', 'content/blog/count-visits.md')
		expect(f).toEqual({
			kind: 'post',
			slug: 'count-visits',
			body: { title: 'Count: visits', description: 'How it works', status: 'published', tags: ['privacy', 'how-to'], noindex: false, canonical: null, body: '## Hello' },
		})
	})

	it('reads a page with its own slug, and an author whose body is the bio', () => {
		expect(parseFile('---\nkind: page\nslug: guides/setup\ntitle: T\n---\nText', 'x.md')).toMatchObject({ kind: 'page', slug: 'guides/setup', body: { title: 'T', body: 'Text' } })
		expect(parseFile('---\nkind: author\nname: Jane Doe\nsameAs: https://github.com/jane\n---\nBuilds misomoon.', 'jane-doe.md')).toEqual({
			kind: 'author',
			slug: 'jane-doe',
			body: { name: 'Jane Doe', sameAs: ['https://github.com/jane'], bio: 'Builds misomoon.' },
		})
	})

	it('names the file and line of a mistake', () => {
		expect(() => parseFile('# no front matter', 'a.md')).toThrow('a.md: no front matter')
		expect(() => parseFile('---\ntitle T\n---\n', 'a.md')).toThrow('a.md:2: write "key: value"')
		expect(() => parseFile('---\nminor: yes\n---\n', 'a.md')).toThrow('a.md:2: minor is true or false')
		expect(() => parseFile('---\nkind: video\n---\n', 'a.md')).toThrow('kind is post, page or author')
	})
})
