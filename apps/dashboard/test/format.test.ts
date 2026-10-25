import { describe, expect, it } from 'vite-plus/test'
import { moneyShort } from '../src/lib/format'

describe('moneyShort', () => {
	it('keeps the cents of an amount under 10, so a small revenue never reads as zero', () => {
		expect([0.4, 9.5, 167, 1234].map((n) => moneyShort(n))).toEqual(['$0.40', '$9.50', '$167', '$1.2K'])
	})
})
