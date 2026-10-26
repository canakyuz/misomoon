import { describe, expect, it } from 'vite-plus/test'
import { render } from 'svelte/server'
import HeroProduct from './HeroProduct.svelte'
import { embedUrl } from '#lib/embed.ts'

describe('HeroProduct', () => {
	it('names the sample store in the address bar and leaves the real dashboard to load in the browser, after the page', () => {
		const { body } = render(HeroProduct, { props: { demo: 'http://localhost:8790/demo' } })
		expect(body).toContain('>acme.example<')
		expect(body).not.toContain('localhost:8790')
		expect(body).not.toContain('<iframe')
	})

	it('draws no stand-in dashboard while the real one loads', () => {
		const { body } = render(HeroProduct, { props: { demo: 'http://localhost:8790/demo' } })
		expect(body).not.toContain('<svg viewBox="0 0 760')
		expect(body).not.toContain('Sample data')
	})

	it('opens the demo embedded, without its bars, in the theme of the page', () => {
		expect(embedUrl('https://app.misomoon.com/demo', 'dark')).toBe('https://app.misomoon.com/demo?embed&theme=dark')
		expect(embedUrl('https://app.misomoon.com/demo', 'light')).toBe('https://app.misomoon.com/demo?embed&theme=light')
	})
})
