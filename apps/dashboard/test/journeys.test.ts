import { describe, expect, it } from 'vite-plus/test'
import { journeyUrls } from '../src/lib/journeys'

const paths = (urls: string[]) => urls.map((u) => new URL(u, 'http://x').searchParams.get('path'))

describe('Paths columns', () => {
	it('asks one question per column, with the pages in visit order', () => {
		expect(paths(journeyUrls('site=a', 'forward', ['/', '/pricing'], 0))).toEqual([null, '/', '/,/pricing'])
		expect(paths(journeyUrls('site=a', 'backward', ['/thanks', '/cart'], 0))).toEqual([null, '/thanks', '/cart,/thanks'])
	})

	it('loads every column again after Refresh instead of reusing the cached answer', () => {
		const before = journeyUrls('site=a', 'forward', ['/'], 0)
		const after = journeyUrls('site=a', 'forward', ['/'], 1)
		expect(after.filter((u) => before.includes(u))).toEqual([])
	})
})
