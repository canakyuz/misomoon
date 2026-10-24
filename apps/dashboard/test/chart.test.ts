import { describe, expect, it } from 'vite-plus/test'
import { yScale, zoomRange } from '../src/lib/chart'

describe('chart y axis (F36)', () => {
	it('stops a percentage axis at 100%', () => {
		expect(yScale([93, 40], { percent: true })).toEqual({ min: 0, max: 100, ticks: [0, 25, 50, 75, 100] })
	})

	it('uses whole-number ticks for small counts', () => {
		expect(yScale([1], { integer: true })).toEqual({ min: 0, max: 4, ticks: [0, 1, 2, 3, 4] })
		expect(yScale([2, 0], { integer: true })).toEqual({ min: 0, max: 4, ticks: [0, 1, 2, 3, 4] })
		expect(yScale([7], { integer: true })).toEqual({ min: 0, max: 8, ticks: [0, 2, 4, 6, 8] })
	})

	it('keeps headroom without doubling the axis', () => {
		expect(yScale([1000], { integer: true })).toEqual({ min: 0, max: 1200, ticks: [0, 300, 600, 900, 1200] })
	})

	it('allows fractional ticks for ratios', () => {
		expect(yScale([0.5, 1.5])).toEqual({ min: 0, max: 2, ticks: [0, 0.5, 1, 1.5, 2] })
	})

	it('draws an empty series on a 0 to 4 axis', () => {
		expect(yScale([], { integer: true })).toEqual({ min: 0, max: 4, ticks: [0, 1, 2, 3, 4] })
	})

	it('extends below zero for negative values', () => {
		expect(yScale([-50, 100])).toEqual({ min: -50, max: 150, ticks: [-50, 0, 50, 100, 150] })
	})
})

describe('drag-zoom range (F36)', () => {
	const days = [0, 1, 2, 3, 4].map((i) => Date.UTC(2026, 2, 1 + i))

	it('covers whole day buckets, in either drag direction', () => {
		expect(zoomRange(days, 1, 3, 'day', 'UTC')).toEqual({ from: '2026-03-02', to: '2026-03-04' })
		expect(zoomRange(days, 3, 1, 'day', 'UTC')).toEqual({ from: '2026-03-02', to: '2026-03-04' })
	})

	it('ends at the last day of the last week or month', () => {
		const weeks = [Date.UTC(2026, 2, 2), Date.UTC(2026, 2, 9), Date.UTC(2026, 2, 16)]
		expect(zoomRange(weeks, 0, 1, 'week', 'UTC')).toEqual({ from: '2026-03-02', to: '2026-03-15' })
		const months = [Date.UTC(2026, 0, 1), Date.UTC(2026, 1, 1), Date.UTC(2026, 2, 1)]
		expect(zoomRange(months, 0, 1, 'month', 'UTC')).toEqual({ from: '2026-01-01', to: '2026-02-28' })
	})

	it("uses the site's local dates", () => {
		// Berlin days start at 23:00 UTC before the DST change and 22:00 UTC after it.
		const berlin = [Date.UTC(2026, 2, 27, 23), Date.UTC(2026, 2, 28, 23), Date.UTC(2026, 2, 29, 22)]
		expect(zoomRange(berlin, 0, 2, 'day', 'Europe/Berlin')).toEqual({ from: '2026-03-28', to: '2026-03-30' })
	})
})
