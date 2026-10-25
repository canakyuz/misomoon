import { describe, expect, it } from 'vite-plus/test'
import { docLink } from './links.ts'

describe('docLink', () => {
	it('links to a page of the docs site when PUBLIC_DOCS_URL is set', () => {
		expect(docLink('https://docs.misomoon.com', 'faq')).toBe('https://docs.misomoon.com/faq')
		expect(docLink('https://docs.misomoon.com', 'self-hosting')).toBe('https://docs.misomoon.com/self-hosting')
		expect(docLink('https://docs.misomoon.com')).toBe('https://docs.misomoon.com')
	})

	it('uses the docs site\'s lowercase address for an uppercase file such as PROXY.md', () => {
		expect(docLink('https://docs.misomoon.com', 'PROXY')).toBe('https://docs.misomoon.com/proxy')
		expect(docLink(null, 'PROXY')).toBe('https://github.com/jackzard/misomoon/blob/main/docs/PROXY.md')
	})

	it('falls back to the Markdown on GitHub, the same source, without it', () => {
		expect(docLink(null, 'faq')).toBe('https://github.com/jackzard/misomoon/blob/main/docs/faq.md')
		expect(docLink(null)).toBe('https://github.com/jackzard/misomoon/tree/main/docs')
	})
})
