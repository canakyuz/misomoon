import { Marked, type Tokens } from 'marked'
import { describe, expect, it } from 'vite-plus/test'
import { ALIASES, LANGS, sources } from './docs.ts'

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
})
