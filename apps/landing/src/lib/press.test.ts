import { describe, expect, it } from 'vite-plus/test'
import { untilPress } from './edition.ts'

describe('next edition countdown (F34)', () => {
	it('counts down to the next midnight UTC', () => {
		expect(untilPress(Date.UTC(2026, 9, 24, 12, 0, 0))).toBe('12:00:00')
		expect(untilPress(Date.UTC(2026, 9, 24, 23, 59, 58, 500))).toBe('00:00:01')
	})

	it('starts over after midnight instead of sticking at zero', () => {
		expect(untilPress(Date.UTC(2026, 9, 25, 0, 0, 1))).toBe('23:59:59')
	})

	it('prints placeholders before the browser knows the time', () => {
		expect(untilPress(null)).toBe('--:--:--')
	})
})
