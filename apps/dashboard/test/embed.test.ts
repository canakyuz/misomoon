import { describe, expect, it } from 'vite-plus/test'
import { embedFrom, themeMessage } from '../src/lib/embed'

describe('embedFrom', () => {
	it('embeds the demo with ?embed, in the theme the page around it asks for', () => {
		expect(embedFrom('/demo', '?embed&theme=dark')).toEqual({ theme: 'dark' })
		expect(embedFrom('/demo/', '?embed=1')).toEqual({ theme: null })
		expect(embedFrom('/demo', '?embed&theme=sepia')).toEqual({ theme: null })
	})

	it('embeds nothing but the demo', () => {
		expect(embedFrom('/demo', '')).toBeNull()
		expect(embedFrom('/', '?embed')).toBeNull()
		expect(embedFrom('/share/abc', '?embed')).toBeNull()
	})
})

describe('themeMessage', () => {
	it('reads the theme the page around the demo switched to', () => {
		expect(themeMessage({ type: 'misomoon:theme', theme: 'light' })).toBe('light')
		expect(themeMessage({ type: 'misomoon:theme', theme: 'dark' })).toBe('dark')
	})

	it('ignores any other message', () => {
		expect(themeMessage({ type: 'misomoon:theme', theme: 'red' })).toBeNull()
		expect(themeMessage({ type: 'other', theme: 'dark' })).toBeNull()
		expect(themeMessage('dark')).toBeNull()
		expect(themeMessage(null)).toBeNull()
	})
})
