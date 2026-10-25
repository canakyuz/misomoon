import { describe, expect, it } from 'vite-plus/test'
import { render } from 'svelte/server'
import HeroProduct from './HeroProduct.svelte'
import { embedUrl } from '#lib/embed.ts'

describe('HeroProduct', () => {
	it('dates the sample chart from the day it is drawn, so it never looks stale', () => {
		// the sample's busiest day is the 15th of 30, which ends today
		const { body } = render(HeroProduct, { props: { now: Date.UTC(2026, 9, 25, 9) } })
		expect(body).toContain('Sat, Oct 10')
		expect(body).not.toContain('Thu, Oct 8')
	})

	it('names the sample store in the address bar and leaves the real dashboard to load in the browser, after the page', () => {
		const { body } = render(HeroProduct, { props: { demo: 'http://localhost:8790/demo' } })
		expect(body).toContain('>acme.example<')
		expect(body).not.toContain('localhost:8790')
		expect(body).not.toContain('<iframe')
	})

	it('opens the demo embedded, without its bars, in the theme of the page', () => {
		expect(embedUrl('https://app.misomoon.com/demo', 'dark')).toBe('https://app.misomoon.com/demo?embed&theme=dark')
		expect(embedUrl('https://app.misomoon.com/demo', 'light')).toBe('https://app.misomoon.com/demo?embed&theme=light')
	})
})
