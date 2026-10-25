import { Marked, type Tokens } from 'marked'
import { describe, expect, it } from 'vite-plus/test'
import { ALIASES, built, LANGS, page, rendered, sources } from './docs.ts'
import { slugOf } from './render.ts'

describe('the docs pages', () => {
	it('name a language the highlighter loads on every code block', () => {
		const bad: string[] = []
		for (const [file, md] of sources) {
			new Marked().walkTokens(new Marked().lexer(md), (t) => {
				if (t.type !== 'code' || (t as Tokens.Code).codeBlockStyle === 'indented') return
				const lang = ((t as Tokens.Code).lang ?? '').split(/\s/)[0]
				const l = ALIASES[lang] ?? lang
				if (!lang || (l !== 'text' && !LANGS.includes(l))) bad.push(`${file}: ${lang || '(none)'}`)
			})
		}
		expect(bad).toEqual([])
	})

	it('link only to pages and headings that exist', async () => {
		const all = await rendered()
		const ids = new Map([...all].map(([slug, r]) => [slug, new Set([...r.html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]))]))
		const bad: string[] = []
		for (const [slug, r] of all) {
			for (const l of r.links) {
				if (!l.file || !built.includes(l.file)) continue
				const target = slugOf(l.file)
				if (!ids.has(target)) bad.push(`${slug}: ${l.href}`)
				else if (l.id && !ids.get(target)!.has(l.id)) bad.push(`${slug}: ${l.href}`)
			}
		}
		expect(bad).toEqual([])
	})

	it('render one page on its own, with highlighted code, and nothing for a page that is not there', async () => {
		const api = await page('api')
		expect(api?.title).toBe('API reference')
		expect(api?.html).toMatch(/<pre class="shiki/)
		expect(await page('nope')).toBeNull()
	})
})
