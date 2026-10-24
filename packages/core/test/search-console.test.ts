import { describe, expect, it } from 'vite-plus/test'
import { searchConsoleQuery, searchTermRows } from '../src/search-console'

const day = Date.UTC(2026, 9, 1)

describe('Search Console search terms', () => {
	it('asks Google for the site’s local days', () => {
		// Jakarta is UTC+7: local Oct 1-7 runs from Sep 30 17:00 UTC
		const q = searchConsoleQuery({ from: day - 7 * 3600_000, to: day + 7 * 86_400_000 - 7 * 3600_000 }, 420, [], { limit: 10 })
		expect(q).toMatchObject({ startDate: '2026-10-01', endDate: '2026-10-07', dimensions: ['query'], rowLimit: 10, startRow: 0 })
		expect(q).not.toHaveProperty('dimensionFilterGroups')
	})

	it('maps the filters Google understands and ignores Google-only ones', () => {
		const q = searchConsoleQuery(
			{ from: day, to: day + 86_400_000 },
			0,
			[
				{ dim: 'source', op: '==', values: ['Google'] },
				{ dim: 'page', op: '==', values: ['/docs*', '/'] },
				{ dim: 'device', op: '==', values: ['Mobile'] },
			],
			{ limit: 20, page: 2, search: 'analytics' },
		)
		expect(q.startRow).toBe(20)
		expect(q.dimensionFilterGroups![0].filters).toEqual([
			{ dimension: 'page', operator: 'includingRegex', expression: '^https?://[^/]+(/docs.*|/)$' },
			{ dimension: 'device', operator: 'equals', expression: 'MOBILE' },
			{ dimension: 'query', operator: 'contains', expression: 'analytics' },
		])
	})

	it('refuses filters Google cannot apply', () => {
		expect(() => searchConsoleQuery({ from: day, to: day + 1 }, 0, [{ dim: 'country', op: '==', values: ['US'] }], { limit: 10 })).toThrow(/can't filter by country/)
	})

	it('reports clicks as visitors, CTR in percent', () => {
		expect(searchTermRows({ rows: [{ keys: ['misomoon'], clicks: 12, impressions: 300, ctr: 0.04, position: 3.456 }] })).toEqual([
			{ key: 'misomoon', visitors: 12, clicks: 12, impressions: 300, ctr: 4, position: 3.5 },
		])
	})
})
