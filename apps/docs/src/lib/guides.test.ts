import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vite-plus/test'
import { BRANDS } from '@misomoon/brand/brands'
import { brandsOf, GUIDE_BRANDS, marksHtml } from './guides.ts'
import { parseNav, slugOf } from './server/render.ts'

const docs = new URL('../../../../docs/', import.meta.url)
const guides = parseNav(readFileSync(new URL('README.md', docs), 'utf8')).sections.find((s) => s.title === 'Install guides')!.pages

describe('install guide marks', () => {
	it('draw every guide in the sidebar, except the page of all platforms', () => {
		expect(guides.filter((p) => !brandsOf(p.slug).length).map((p) => p.file)).toEqual(['integrations.md'])
	})

	it('belong to pages that exist and brands that have a mark', () => {
		const slugs = readdirSync(docs).filter((f) => f.endsWith('.md')).map(slugOf)
		expect(Object.keys(GUIDE_BRANDS).filter((s) => !slugs.includes(s))).toEqual([])
		expect(Object.values(GUIDE_BRANDS).flat().filter((b) => !BRANDS[b])).toEqual([])
	})

	it('draw nothing for a page that is not a guide', () => {
		expect(brandsOf('api')).toEqual([])
		expect(marksHtml('api')).toBe('')
	})

	it('draw each brand of a guide as an inline SVG in the text color', () => {
		const html = marksHtml('server-frameworks')
		expect(html.match(/<svg class="mark" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">/g)).toHaveLength(3)
		expect(html).toContain(`<path d="${BRANDS.laravel}"/>`)
	})
})
