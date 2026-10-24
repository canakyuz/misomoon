import { describe, expect, it } from 'vite-plus/test'
import type { Row } from '../src/lib/api'
import { appendRows, sortRows } from '../src/lib/rows'

const row = (key: string, visitors: number, extra: Partial<Row> = {}): Row => ({
	key,
	visitors,
	pageviews: 0,
	events: 0,
	visits: 0,
	bounce_rate: 0,
	visit_duration: 0,
	...extra,
})

describe('Details rows (F36)', () => {
	it('appends a page without repeating keys already shown', () => {
		expect(appendRows([row('a', 3), row('b', 2)], [row('b', 2), row('c', 1)]).map((r) => r.key)).toEqual(['a', 'b', 'c'])
	})

	it('sorts with ties kept in their original order', () => {
		const rows = [row('a', 1), row('b', 2), row('c', 1), row('d', 2)]
		expect(sortRows(rows, 'visitors', -1).map((r) => r.key)).toEqual(['b', 'd', 'a', 'c'])
		expect(sortRows(rows, 'visitors', 1).map((r) => r.key)).toEqual(['a', 'c', 'b', 'd'])
	})

	it('puts rows without the value last in both directions', () => {
		const rows = [row('a', 1, { time_on_page: 5 }), row('b', 1), row('c', 1, { time_on_page: 9 })]
		expect(sortRows(rows, 'time_on_page', -1).map((r) => r.key)).toEqual(['c', 'a', 'b'])
		expect(sortRows(rows, 'time_on_page', 1).map((r) => r.key)).toEqual(['a', 'c', 'b'])
	})

	it('does not change the input', () => {
		const rows = [row('a', 1), row('b', 2)]
		sortRows(rows, 'visitors', -1)
		expect(rows.map((r) => r.key)).toEqual(['a', 'b'])
	})
})
