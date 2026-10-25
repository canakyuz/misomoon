import { describe, expect, it } from 'vite-plus/test'
import { filterProblem, parseFilters, readUrlState, serializeFilters, type Filter } from '../src/lib/url'

describe('filters in the URL (F7)', () => {
	it('splits at the first operator in the text, like the server', () => {
		expect(parseFilters('page~/a==b')).toEqual([{ dim: 'page', op: '~', values: ['/a==b'] }])
		expect(parseFilters('source!~x;browser!=Safari|Edge')).toEqual([
			{ dim: 'source', op: '!~', values: ['x'] },
			{ dim: 'browser', op: '!=', values: ['Safari', 'Edge'] },
		])
	})

	it('drops parts with no operator or no value', () => {
		expect(parseFilters('page;country==;browser==Chrome')).toEqual([{ dim: 'browser', op: '==', values: ['Chrome'] }])
		expect(parseFilters(null)).toEqual([])
	})

	it('round-trips through serializeFilters', () => {
		const f: Filter[] = [
			{ dim: 'country', op: '==', values: ['US', 'CA'] },
			{ dim: 'page', op: '!~', values: ['/blog/*'] },
		]
		expect(serializeFilters(f)).toBe('country==US|CA;page!~/blog/*')
		expect(parseFilters(serializeFilters(f))).toEqual(f)
	})
})

describe('checking a filter before adding it (F30)', () => {
	const f = (dim: string, ...values: string[]): Filter => ({ dim, op: '==', values })

	it('accepts a filter within the server limits', () => {
		expect(filterProblem([], f('country', 'US'))).toBeNull()
	})

	it('refuses a ninth filter', () => {
		const eight = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((d) => f(d, 'x'))
		expect(filterProblem(eight, f('page', '/'))).toBe('at most 8 filters')
		// replacing one of the eight is fine
		expect(filterProblem(eight, f('a', 'y'))).toBeNull()
	})

	it('allows 6 values in one filter and 16 in total, and no more', () => {
		expect(filterProblem([], f('country', '1', '2', '3', '4', '5', '6'))).toBeNull()
		expect(filterProblem([], f('country', '1', '2', '3', '4', '5', '6', '7'))).toBe('at most 6 values in one filter')
		const many = [f('a', '1', '2', '3', '4', '5', '6'), f('b', '1', '2', '3', '4', '5', '6')]
		expect(filterProblem(many, f('c', '1', '2', '3', '4'))).toBeNull()
		expect(filterProblem(many, f('c', '1', '2', '3', '4', '5'))).toBe('at most 16 filter values in total')
	})

	it('refuses values the URL grammar cannot carry', () => {
		expect(filterProblem([], f('page', 'a;b'))).toBe('filter values cannot contain ; or |')
		expect(filterProblem([], f('page', 'a|b'))).toBe('filter values cannot contain ; or |')
	})
})

describe('reading the URL (F30)', () => {
	it('falls back to the defaults for unknown period, metric and view', () => {
		expect(readUrlState('?period=bogus&metric=foo&view=nope')).toMatchObject({ period: '30d', metric: 'visitors', view: 'overview' })
	})

	it('falls back to People for a metric the chart has no tile for', () => {
		expect(readUrlState('?metric=events').metric).toBe('visitors')
	})

	it('keeps a valid custom range, up to 400 days', () => {
		expect(readUrlState('?period=custom&from=2026-01-01&to=2026-01-31')).toMatchObject({ period: 'custom', from: '2026-01-01', to: '2026-01-31' })
		expect(readUrlState('?period=custom&from=2025-01-01&to=2026-02-04')).toMatchObject({ period: 'custom', from: '2025-01-01', to: '2026-02-04' })
	})

	it.each([
		['over 400 days', '?period=custom&from=2025-01-01&to=2026-02-05'],
		['backwards', '?period=custom&from=2026-02-01&to=2026-01-01'],
		['not a date', '?period=custom&from=yesterday&to=2026-01-01'],
		['missing to', '?period=custom&from=2026-01-01'],
	])('drops a custom range that is %s', (_label, search) => {
		expect(readUrlState(search)).toMatchObject({ period: '30d', from: null, to: null })
	})

	it('reads site, filters, compare and a known metric', () => {
		expect(readUrlState('?site=shop&f=country==US&compare=0&metric=bounce_rate&view=vitals')).toEqual({
			site: 'shop',
			period: '30d',
			from: null,
			to: null,
			compare: false,
			compareTo: 'previous',
			imported: true,
			filters: [{ dim: 'country', op: '==', values: ['US'] }],
			view: 'vitals',
			metric: 'bounce_rate',
		})
	})

	it('reads a year-over-year comparison and imports turned off', () => {
		expect(readUrlState('?compare=year&imported=0&period=6mo&view=journeys')).toMatchObject({ compare: true, compareTo: 'year', imported: false, period: '6mo', view: 'journeys' })
	})
})
