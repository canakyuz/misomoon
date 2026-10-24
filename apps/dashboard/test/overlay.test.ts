import { describe, expect, it, vi } from 'vite-plus/test'

// api.ts reads the page path on import
vi.hoisted(() => {
	;(globalThis as { location?: unknown }).location = { pathname: '/', search: '' }
})

const { sameSite } = await import('../src/lib/overlay')

describe('overlay origin check', () => {
	it("answers only the site's own domain and its subdomains", () => {
		expect(sameSite('https://shop.com', 'shop.com')).toBe(true)
		expect(sameSite('https://www.shop.com', 'shop.com')).toBe(true)
		expect(sameSite('https://shop.com', 'www.shop.com')).toBe(true)
		expect(sameSite('http://blog.shop.com:8080', 'shop.com')).toBe(true)
		expect(sameSite('https://evilshop.com', 'shop.com')).toBe(false)
		expect(sameSite('https://shop.com.evil.io', 'shop.com')).toBe(false)
		expect(sameSite('null', 'shop.com')).toBe(false)
		expect(sameSite('file://shop.com', 'shop.com')).toBe(false)
	})
})
