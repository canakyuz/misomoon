import { describe, expect, it } from 'vite-plus/test'
import { iconDomain } from '../src/lib/labels'

describe('iconDomain', () => {
	it('fetches no icon for a source named like an object property', () => {
		expect([iconDomain('utm_source', 'constructor'), iconDomain('source', 'toString')]).toEqual([null, null])
	})
})
