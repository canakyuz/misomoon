import { describe, expect, it } from 'vite-plus/test'
import { LEGAL, legalPage, publishedLegal, relink } from './legal.ts'

const DOCS = import.meta.glob<string>('../../../../../docs/*.md', { query: '?raw', import: 'default', eager: true })

const files = {
	'/docs/privacy.md': '# Privacy policy\n\n**Draft.** Fill in the brackets.\n\nSee the [agreement](dpa.md) and [roles](teams.md#what-each-role-can-do).\n',
	'/docs/terms.md': '# Terms of service\n\nRead the [privacy policy](privacy.md).\n',
}

describe('the legal pages', () => {
	it('send legal links to the landing and other links to the docs site', () => {
		expect(relink('[a](dpa.md#9-breaches) [b](teams.md) [c](https://x.test/y.md)', 'https://docs.misomoon.com')).toBe(
			'[a](/dpa#9-breaches) [b](https://docs.misomoon.com/teams) [c](https://x.test/y.md)',
		)
	})

	it('send other links to GitHub when there is no docs site', () => {
		expect(relink('[b](teams.md#delete)', null)).toBe('[b](https://github.com/jackzard/misomoon/blob/main/docs/teams.md#delete)')
	})

	it('take the title from the h1 and leave it out of the body', () => {
		const p = legalPage('terms', null, files)!
		expect(p.title).toBe('Terms of service')
		expect(p.html).not.toContain('Terms of service')
		expect(p.html).toContain('<a href="/privacy">privacy policy</a>')
		expect(p.draft).toBe(false)
	})

	it('mark a page with a draft note, and keep it out of the sitemap', () => {
		expect(legalPage('privacy', null, files)!.draft).toBe(true)
		expect(publishedLegal(files)).toEqual(['terms'])
	})

	it('answer null for a page with no file', () => {
		expect(legalPage('security', null, files)).toBeNull()
	})

	it('have every heading that a link in docs/ points at', () => {
		const ids = new Map(LEGAL.map((slug) => [slug, new Set([...legalPage(slug, null)!.html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]))]))
		const broken: string[] = []
		for (const [path, md] of Object.entries(DOCS)) {
			for (const m of md.replace(/```[\s\S]*?```/g, '').matchAll(/\]\((?:\.\/)?(privacy|terms|dpa|security)\.md#([^)\s]+)\)/g)) {
				if (!ids.get(m[1] as (typeof LEGAL)[number])!.has(m[2])) broken.push(`${path.split('/').pop()}: ${m[1]}.md#${m[2]}`)
			}
		}
		expect(broken).toEqual([])
	})

	it('read all four files from docs/', () => {
		for (const slug of LEGAL) expect(legalPage(slug, null)?.title).toBeTruthy()
	})
})
