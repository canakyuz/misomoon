import { describe, expect, it } from 'vite-plus/test'
import { edition } from './edition.ts'

describe('edition', () => {
	it('numbers issues from launch day', () => {
		expect(edition(Date.UTC(2026, 9, 1, 8)).no).toBe(1)
		expect(edition(Date.UTC(2026, 9, 22, 23, 59)).no).toBe(22)
	})

	it('finds known full and new moons', () => {
		// full moon 26 Oct 2026, new moon 9 Nov 2026
		const full = edition(Date.UTC(2026, 9, 26)).moon
		expect(full.name).toBe('full moon')
		expect(full.lit).toBeGreaterThan(0.97)
		const fresh = edition(Date.UTC(2026, 10, 9)).moon
		expect(fresh.name).toBe('new moon')
		expect(fresh.lit).toBeLessThan(0.03)
	})

	it('lights the right-hand side while waxing', () => {
		const m = edition(Date.UTC(2026, 9, 22)).moon
		expect(m.fraction).toBeLessThan(0.5)
		expect(m.phase).toBeGreaterThan(0)
	})
})
