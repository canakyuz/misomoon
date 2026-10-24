// AGENTS.md: other products' names appear only in alternatives.ts, docs/comparison.md and
// the README's comparison table, and every claim names its source and the day it was checked.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vite-plus/test'
import { ALTERNATIVES, OURS } from './alternatives.ts'
import { PLANS, keptByPlan, short } from './pricing.ts'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const DATE = /^\d{4}-\d{2}-\d{2}$/

function files(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		if (['node_modules', '.svelte-kit', 'build', 'dist', '.wrangler', '.git'].includes(name)) continue
		const p = join(dir, name)
		if (statSync(p).isDirectory()) files(p, out)
		else if (/\.(ts|js|mjs|svelte|php|md|txt|json|jsonc|html|css|sql)$/.test(name)) out.push(p)
	}
	return out
}

describe('the alternatives data', () => {
	it('gives every claim about another product an https source and a checked date', () => {
		const bad: string[] = []
		for (const a of ALTERNATIVES)
			for (const c of [...a.pickUs, ...a.pickThem, ...a.facts]) {
				const what = 'label' in c ? c.label : c.text
				if (!/^https:\/\/[^\s/]+/.test(c.src)) bad.push(`${a.slug}: ${what}: source "${c.src}"`)
				if (!DATE.test(c.checked) || Number.isNaN(Date.parse(c.checked))) bad.push(`${a.slug}: ${what}: checked "${c.checked}"`)
			}
		expect(bad).toEqual([])
	})

	it('has unique slugs that fit a URL, and meta descriptions of 70 to 160 characters', () => {
		const slugs = ALTERNATIVES.map((a) => a.slug)
		expect(new Set(slugs).size).toBe(slugs.length)
		for (const a of ALTERNATIVES) {
			expect(a.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
			expect(a.description.length, a.slug).toBeGreaterThanOrEqual(70)
			expect(a.description.length, a.slug).toBeLessThanOrEqual(160)
			expect(a.pickUs.length).toBeGreaterThan(0)
			expect(a.pickThem.length, `${a.slug} needs an honest reason to pick them`).toBeGreaterThan(0)
			expect(a.trackerKb).toBeGreaterThan(0)
		}
	})

	it('follows the docs style: no em dashes in the copy', () => {
		expect(JSON.stringify(ALTERNATIVES).includes('—')).toBe(false)
	})

	it('prints the same tracker sizes as docs/comparison.md', () => {
		const doc = readFileSync(join(root, 'docs/comparison.md'), 'utf8')
		expect(doc).toContain('998 bytes core, 1.8 KB with the Light preset, 4.8 KB with every feature')
		expect([OURS.coreKb, OURS.lightKb, OURS.fullKb]).toEqual([1.0, 1.8, 4.8])
		for (const a of ALTERNATIVES) expect(doc, a.slug).toContain(`${a.trackerKb} KB`)
	})

	it('prints misomoon’s price and retention from the plans, here and in docs/comparison.md', () => {
		const start = PLANS[0]
		const growth = PLANS.find((p) => p.popular)!
		for (const a of ALTERNATIVES)
			for (const f of a.facts) {
				if (['Price', 'Hosted price'].includes(f.label)) expect(f.us, a.slug).toContain(`$${start.price} a month for ${short(start.events)} events`)
				if (['Data retention', 'Reporting window'].includes(f.label)) expect(f.us, a.slug).toContain(keptByPlan())
				// misomoon plans count events, not pageviews
				expect(f.us, `${a.slug}: ${f.label}`).not.toMatch(/pageviews/)
			}
		const doc = readFileSync(join(root, 'docs/comparison.md'), 'utf8')
		expect(doc).toContain(`$${start.price}/month for ${short(start.events)} events`)
		expect(doc).toContain(`$${growth.price}/month for ${short(growth.events)} events`)
		expect(doc).toContain(`Cloud: ${keptByPlan()}`)
	})

	it('keeps the names of other products out of every other file', () => {
		// "Cloudflare" alone is the platform misomoon runs on, not the product compared here
		const names = [...new Set(ALTERNATIVES.flatMap((a) => [a.name, a.short]))].filter((n) => n !== 'Cloudflare')
		const allowed = new Set(['apps/landing/src/lib/alternatives.ts', 'docs/comparison.md', 'README.md'])
		const scan = ['apps', 'packages', 'plugins', 'docs'].flatMap((d) => files(join(root, d)))
		const found: string[] = []
		for (const p of scan) {
			const rel = relative(root, p)
			if (allowed.has(rel)) continue
			const text = readFileSync(p, 'utf8')
			for (const n of names) if (text.includes(n)) found.push(`${rel}: ${n}`)
		}
		expect(found).toEqual([])
	})
})
