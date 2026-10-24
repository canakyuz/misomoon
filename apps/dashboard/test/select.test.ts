import { describe, expect, it } from 'vite-plus/test'
import { filterOptions, fold, moveActive, typeahead, type SelectOption } from '../src/lib/select'

const opt = (label: string, extra: Partial<SelectOption> = {}): SelectOption => ({ value: label, label, ...extra })
const labels = (os: SelectOption[]) => os.map((o) => o.label)

describe('fold', () => {
	it('drops case and accents', () => {
		expect(fold('São Paulo')).toBe('sao paulo')
		expect(fold('ZÜRICH')).toBe('zurich')
	})
})

describe('filterOptions', () => {
	const currencies = [opt('AUD · Australian dollar'), opt('EUR · Euro'), opt('USD · US dollar'), opt('BRL · Brazilian real')]

	it('keeps every option, in order, for an empty or blank query', () => {
		expect(labels(filterOptions(currencies, ''))).toEqual(labels(currencies))
		expect(labels(filterOptions(currencies, '   '))).toEqual(labels(currencies))
	})

	it('puts labels that start with the query first, then word starts, then the rest', () => {
		// "us" starts USD, starts the word "US" in no other label, and sits inside "Australian"
		expect(labels(filterOptions(currencies, 'us'))).toEqual(['USD · US dollar', 'AUD · Australian dollar'])
		expect(labels(filterOptions(currencies, 'dollar'))).toEqual(['AUD · Australian dollar', 'USD · US dollar'])
	})

	it('needs every typed word, in any order', () => {
		expect(labels(filterOptions(currencies, 'dollar us'))).toEqual(['USD · US dollar', 'AUD · Australian dollar'])
		expect(labels(filterOptions(currencies, 'dollar euro'))).toEqual([])
	})

	it('ignores case and accents on both sides', () => {
		const zones = [opt('America/Sao_Paulo'.replace('_', ' ')), opt('Europe/Zürich')]
		expect(labels(filterOptions(zones, 'SÃO'))).toEqual(['America/Sao Paulo'])
		expect(labels(filterOptions(zones, 'zurich'))).toEqual(['Europe/Zürich'])
	})

	it('finds options by their keywords', () => {
		const views = [opt('Overview', { keywords: 'home dashboard' }), opt('Funnels')]
		expect(labels(filterOptions(views, 'home'))).toEqual(['Overview'])
	})

	it('does not match on the group name', () => {
		expect(labels(filterOptions([opt('Euro', { group: 'Common' })], 'common'))).toEqual([])
	})
})

describe('moveActive', () => {
	const os = [opt('a'), opt('b', { disabled: true }), opt('c'), opt('d')]

	it('enters the list from nothing at either end', () => {
		expect(moveActive(os, -1, 1)).toBe(0)
		expect(moveActive(os, -1, -1)).toBe(3)
	})

	it('skips disabled options', () => {
		expect(moveActive(os, 0, 1)).toBe(2)
		expect(moveActive(os, 2, -1)).toBe(0)
	})

	it('stops at the ends instead of wrapping', () => {
		expect(moveActive(os, 3, 1)).toBe(3)
		expect(moveActive(os, 0, -1)).toBe(0)
		expect(moveActive(os, 0, 99)).toBe(3)
		expect(moveActive(os, 3, -99)).toBe(0)
	})

	it('answers -1 when nothing can be chosen', () => {
		expect(moveActive([], -1, 1)).toBe(-1)
		expect(moveActive([opt('x', { disabled: true })], -1, 1)).toBe(-1)
	})

	it('treats an index past the end as nothing active', () => {
		expect(moveActive(os, 9, 1)).toBe(0)
	})
})

describe('typeahead', () => {
	const os = [opt('Editor'), opt('Owner', { disabled: true }), opt('Viewer'), opt('Event'), opt('Everyone')]

	it('jumps to the next label starting with the letter, after the active one', () => {
		expect(typeahead(os, -1, 'e')).toBe(0)
		expect(typeahead(os, 0, 'e')).toBe(3)
		expect(typeahead(os, 3, 'e')).toBe(4)
	})

	it('wraps around to the start', () => {
		expect(typeahead(os, 4, 'e')).toBe(0)
	})

	it('matches the whole typed prefix, from the active option', () => {
		expect(typeahead(os, 0, 'ever')).toBe(4)
		expect(typeahead(os, 0, 'ed')).toBe(0)
	})

	it('skips disabled options and keeps the active one when nothing matches', () => {
		expect(typeahead(os, 0, 'o')).toBe(0)
		expect(typeahead(os, 2, 'z')).toBe(2)
	})
})
