import { describe, expect, it } from 'vite-plus/test'
import { render } from 'svelte/server'
import Reflection from './Reflection.svelte'

describe('Reflection', () => {
	it('lists only the days it has when there are too few to draw', () => {
		const day = Date.UTC(2026, 9, 20)
		const { body } = render(Reflection, { props: { days: [{ t: day, visitors: 4 }, { t: day + 864e5, visitors: 6 }] } })
		expect(body).toContain('10 visitors in the last 30 days')
		expect(body.match(/<li>/g)).toHaveLength(2)
		expect(body).toContain('Tue, 20 Oct: 4')
	})
})
