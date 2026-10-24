import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vite-plus/test'
import { BRANDS } from '@misomoon/brand/brands'
import { PLATFORMS, SDK } from '../src/lib/guides'

const doc = (page: string) => readFileSync(new URL(`../../../docs/${page}.md`, import.meta.url), 'utf8')
// the id GitHub and the docs site give a heading
const ids = (md: string) => [...md.matchAll(/^#{1,6} (.+)$/gm)].map((m) => m[1].replace(/`/g, '').toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '').replace(/ /g, '-'))

describe('the Install tab links', () => {
	it('open pages and headings that exist in docs/', () => {
		const broken = [...PLATFORMS, ...SDK].filter((g) => {
			try {
				const headings = ids(doc(g.page))
				return !!g.hash && !headings.includes(g.hash)
			} catch {
				return true
			}
		})
		expect(broken.map((g) => `${g.label}: ${g.page}#${g.hash ?? ''}`)).toEqual([])
	})

	it('name every entry point of the SDK', () => {
		const exports = Object.keys(JSON.parse(readFileSync(new URL('../../../packages/sdk/package.json', import.meta.url), 'utf8')).exports as Record<string, unknown>)
			.filter((k) => k !== '.' && k !== './package.json')
			.map((k) => `@misomoon/sdk/${k.slice(2)}`)
		expect(SDK.map((e) => e.pkg).sort()).toEqual(exports.sort())
	})

	it('draw a mark for every brand they name', () => {
		expect([...PLATFORMS, ...SDK].filter((g) => g.brand && !BRANDS[g.brand])).toEqual([])
	})
})
