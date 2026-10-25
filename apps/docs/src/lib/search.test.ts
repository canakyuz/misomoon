import { describe, expect, it } from 'vite-plus/test'
import { GET } from '../routes/search.json/+server.ts'
import { rank, snippet, type Entry } from './search.ts'

const entry = (text: string, heading = 'Plan limits'): Entry => ({ slug: 'api', page: 'API', section: 'Reference', heading, id: 'plan-limits', text })

describe('docs search', () => {
	it('indexes the whole text of a section, so a term deep in a long table is found', async () => {
		const index: Entry[] = await (await GET()).json()
		const hits = rank(index, 'plan_retention_limit')
		expect(hits.map((e) => `${e.slug}#${e.id}`)).toContain('api#plan-limits')
	})

	it('shows the passage around the match, whatever spaces the query starts with', () => {
		const text = `${'Intro words. '.repeat(20)}The API answers 429 when a key is over its limit.`
		expect(snippet(text, '  429')).toBe(`…${text.slice(text.indexOf('429') - 40, text.indexOf('429') + 100)}`)
	})

	it('needs every word, and ranks a heading match above a text match', () => {
		const index = [entry('rate limits apply per key', 'Errors'), entry('nothing here', 'Rate limits'), entry('limits only', 'Other')]
		expect(rank(index, 'rate limits').map((e) => e.heading)).toEqual(['Rate limits', 'Errors'])
	})
})
