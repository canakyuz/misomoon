import { describe, expect, it } from 'vite-plus/test'
import { ALTERNATIVES, type Fact } from './alternatives.ts'
import { PLANS, short } from './pricing.ts'
import { gains, lighter, tally } from './verdict.ts'

const fact = (label: string, edge?: 'us' | 'them'): Fact => ({ label, us: 'u', them: 't', edge, src: 'https://a.com', checked: '2026-10-25' })

describe('the verdict on a comparison page', () => {
	it('counts the rows each side wins, and the even ones', () => {
		expect(tally({ facts: [fact('A', 'us'), fact('B', 'us'), fact('C', 'them'), fact('D')] })).toEqual({ wins: 2, losses: 1, even: 1, total: 4 })
	})

	it('says how many times lighter the Light preset is, rounded down, and nothing under 1.5 times', () => {
		expect(lighter(157)).toBe(87)
		expect(lighter(5.3)).toBe(2.9)
		expect(lighter(2.5)).toBeNull()
		expect(lighter(1.8)).toBeNull()
	})

	it('leads with privacy and price, leaves out the tracker row and the rows misomoon loses', () => {
		const g = gains({ facts: [fact('Official MCP server', 'us'), fact('Tracker, gzipped', 'us'), fact('Two-factor sign-in', 'them'), fact('Cookies', 'us'), fact('Price', 'us'), fact('Funnels', 'us')] })
		expect(g.map((x) => x.fact.label)).toEqual(['Cookies', 'Price', 'Funnels'])
		expect(g[0].headline).toBe('No cookies at all')
		expect(g[1].headline).toBe(`$${PLANS[0].price} for ${short(PLANS[0].events)} events`)
	})

	it('falls back to the label for a row with no headline', () => {
		expect(gains({ facts: [fact('Audit log', 'us')] })[0].headline).toBe('Audit log')
	})

	it('gives every comparison something to lead with', () => {
		for (const a of ALTERNATIVES) expect(gains(a).length + (lighter(a.trackerKb) ? 1 : 0), a.slug).toBeGreaterThanOrEqual(3)
	})
})
