import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vite-plus/test'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

describe('home page', () => {
	it('names every MCP tool the API serves', () => {
		const tools = [...read('../../../api/src/tools.ts').matchAll(/^\t\tname: '(\w+)'/gm)].map((m) => m[1])
		const chips = read('+page.svelte').match(/\{#each (\[[^\]]*'list_sites'[^\]]*\])/)?.[1]
		expect(tools.length).toBeGreaterThan(10)
		expect(JSON.parse(chips!.replace(/'/g, '"')).sort()).toEqual(tools.sort())
	})
})
