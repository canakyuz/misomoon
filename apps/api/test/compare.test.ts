import { describe, expect, it } from 'vite-plus/test'
import { changes } from '../src/stats'

describe('compare changes (F36)', () => {
	it('gives bounce rate in percentage points and the rest as a percent', () => {
		expect(changes({ visitors: 150, bounce_rate: 45 }, { visitors: 100, bounce_rate: 40 })).toEqual({ visitors: 50, bounce_rate: 5 })
	})

	it('handles a zero previous value', () => {
		expect(changes({ visitors: 3, bounce_rate: 30, revenue: 0 }, { visitors: 0, bounce_rate: 0, revenue: 0 })).toEqual({ visitors: null, bounce_rate: 30, revenue: 0 })
	})

	it('rounds points to one decimal', () => {
		expect(changes({ bounce_rate: 45.26 }, { bounce_rate: 40.11 })).toEqual({ bounce_rate: 5.2 })
	})
})
