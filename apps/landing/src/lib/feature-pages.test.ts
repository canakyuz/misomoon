import { describe, expect, it } from 'vite-plus/test'
import { FEATURE_PAGES } from './feature-pages.ts'
import { FEATURES } from './features.ts'

const DOCS = import.meta.glob<string>('../../../../docs/*.md', { query: '?raw', import: 'default', eager: true })

const ITEMS = FEATURES.flatMap((group) => group.items)
const SLUGS = FEATURE_PAGES.map((p) => p.slug)

// The id a docs heading gets: lowercase, then drop every character that isn't a letter,
// a digit, a space or a hyphen, then turn each space into a hyphen.
function headingIds(md: string): Set<string> {
	const ids = new Set<string>()
	let fenced = false
	for (const line of md.split('\n')) {
		if (line.startsWith('```')) fenced = !fenced
		const text = fenced ? undefined : /^#{1,6} +(.*\S)/.exec(line)?.[1]
		if (text !== undefined) ids.add(text.toLowerCase().replace(/[^\p{L}\p{Nd} -]/gu, '').replace(/ /g, '-'))
	}
	return ids
}

// Every string in a value, however deeply it is nested in objects and arrays.
function strings(value: unknown): string[] {
	if (typeof value === 'string') return [value]
	if (Array.isArray(value)) return value.flatMap(strings)
	if (value !== null && typeof value === 'object') return Object.values(value).flatMap(strings)
	return []
}

describe('the feature pages', () => {
	it('gives every page a unique slug that fits a URL', () => {
		const repeated = SLUGS.filter((slug, i) => SLUGS.indexOf(slug) !== i)
		expect(repeated).toEqual([])
		const bad = SLUGS.filter((slug) => !/^[a-z0-9-]+$/.test(slug))
		expect(bad).toEqual([])
	})

	it('keeps every description between 70 and 160 characters', () => {
		const bad = FEATURE_PAGES.filter((p) => p.description.length < 70 || p.description.length > 160).map(
			(p) => `${p.slug}: ${p.description.length} characters`,
		)
		expect(bad).toEqual([])
	})

	it('keeps every title to 54 characters or fewer, so the title with " · misomoon" stays within 65', () => {
		const bad = FEATURE_PAGES.filter((p) => p.title.length > 54).map((p) => `${p.slug}: ${p.title.length} characters`)
		expect(bad).toEqual([])
	})

	it('links each related page to a different page', () => {
		const bad = FEATURE_PAGES.filter((p) => p.related === p.slug || !SLUGS.includes(p.related)).map(
			(p) => `${p.slug}: related "${p.related}"`,
		)
		expect(bad).toEqual([])
	})

	it('names a FEATURES item for each page, and that item links back to the page', () => {
		const bad = FEATURE_PAGES.flatMap((p) => {
			const item = ITEMS.find((i) => i.name === p.feature)
			if (!item) return [`${p.slug}: no FEATURES item named "${p.feature}"`]
			return item.page === p.slug ? [] : [`${p.slug}: "${p.feature}" has page ${item.page ?? 'none'}`]
		})
		expect(bad).toEqual([])
	})

	it('points every FEATURES item that has a page at an existing page', () => {
		const bad = ITEMS.filter((i) => i.page !== undefined && !SLUGS.includes(i.page)).map((i) => `${i.name}: page "${i.page}"`)
		expect(bad).toEqual([])
	})

	it('points each doc and hash at a real heading in that doc', () => {
		const bad = FEATURE_PAGES.flatMap((p) => {
			const md: string | undefined = DOCS[`../../../../docs/${p.doc}.md`]
			if (md === undefined) return [`${p.slug}: no docs/${p.doc}.md`]
			return headingIds(md).has(p.hash) ? [] : [`${p.slug}: no heading "${p.hash}" in docs/${p.doc}.md`]
		})
		expect(bad).toEqual([])
	})

	it('has no em dash in any string on a page', () => {
		const bad = FEATURE_PAGES.flatMap((p) => strings(p).filter((s) => s.includes('—')).map((s) => `${p.slug}: ${s}`))
		expect(bad).toEqual([])
	})

	it('has at least three FAQ questions on every page, each with an answer', () => {
		const short = FEATURE_PAGES.filter((p) => p.faq.length < 3).map((p) => `${p.slug}: ${p.faq.length} FAQ questions`)
		expect(short).toEqual([])
		const empty = FEATURE_PAGES.flatMap((p) => p.faq.filter(([, a]) => a.trim() === '').map(([q]) => `${p.slug}: ${q}`))
		expect(empty).toEqual([])
	})
})
