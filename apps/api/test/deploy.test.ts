import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vite-plus/test'
import { parseJsonc, selfHostedVars } from '../scripts/bundle-vars.ts'
import { createArgs, parseRegions, planShards, type Db } from '../scripts/shards.ts'

const db = (binding: string): Db => ({ binding, name: `misomoon-${binding.toLowerCase().replaceAll('_', '-')}`, id: `id-${binding}`, dir: 'migrations/shard' })

describe('deploy: shard regions', () => {
	it('reads SHARD_REGIONS', () => {
		expect(parseRegions(undefined)).toBeNull()
		expect(parseRegions('eu:2, us:1,apac:1')).toEqual({ eu: 2, us: 1, apac: 1 })
		expect(parseRegions('eu:0')).toEqual({ eu: 0 })
		for (const bad of ['sg:1', 'eu', 'eu:-1', 'eu:1.5', 'eu:1,eu:2']) expect(() => parseRegions(bad)).toThrow('SHARD_REGIONS is like eu:2,us:1,apac:1, with each region once: eu, us or apac')
	})

	it('creates EU and US shards in their D1 jurisdiction, and Asia-Pacific ones with a location hint', () => {
		expect(createArgs('eu', undefined)).toEqual(['--jurisdiction', 'eu'])
		expect(createArgs('us', 'eu')).toEqual(['--jurisdiction', 'us'])
		expect(createArgs('apac', undefined)).toEqual(['--location', 'apac'])
		// a shard without a region follows D1_JURISDICTION, like the control database
		expect(createArgs(null, 'eu')).toEqual(['--jurisdiction', 'eu'])
		expect(createArgs(null, undefined)).toEqual([])
	})

	it('adds the missing shards of each region, after the plain ones, in order', () => {
		const plan = planShards([db('SHARD_0'), db('SHARD_1')], { '': 2, eu: 2, us: 1 })
		expect(plan.keep.map((d) => d.binding)).toEqual(['SHARD_0', 'SHARD_1', 'SHARD_EU_0', 'SHARD_EU_1', 'SHARD_US_0'])
		expect(plan.create).toEqual([
			{ binding: 'SHARD_EU_0', name: 'misomoon-shard-eu-0', region: 'eu' },
			{ binding: 'SHARD_EU_1', name: 'misomoon-shard-eu-1', region: 'eu' },
			{ binding: 'SHARD_US_0', name: 'misomoon-shard-us-0', region: 'us' },
		])
		expect(plan.extra).toEqual([])
	})

	it('keeps regions it was not told about, and marks the extra shards of a smaller count', () => {
		const bound = [db('SHARD_0'), db('SHARD_EU_0'), db('SHARD_EU_1'), db('SHARD_APAC_0')]
		const plan = planShards(bound, { '': 0, eu: 1, apac: 1 })
		expect(plan.keep.map((d) => d.binding)).toEqual(['SHARD_EU_0', 'SHARD_APAC_0'])
		expect(plan.extra.map((d) => d.binding)).toEqual(['SHARD_0', 'SHARD_EU_1'])
		expect(plan.create).toEqual([])
	})

	it('needs at least one shard', () => {
		expect(() => planShards([db('SHARD_0')], { '': 0 })).toThrow('at least one shard is needed: set SHARD_COUNT or SHARD_REGIONS')
	})
})

describe('deploy: the self-hosted bundle', () => {
	const cloud = parseJsonc(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8')).vars as Record<string, string>

	it('turns plans on for misomoon Cloud only', () => {
		expect(cloud.PLANS).toBe('on')
		const vars = selfHostedVars(cloud)
		expect('PLANS' in vars).toBe(false)
		expect(selfHostedVars({ ...cloud, PLANS: 'ON' }).PLANS).toBeUndefined()
	})

	it("leaves out misomoon Cloud's Polar billing, whatever POLAR_* settings its vars hold", () => {
		const polar = { POLAR_SERVER: 'sandbox', POLAR_PRODUCT_STARTER: 'p1', POLAR_PRODUCT_GROWTH: 'p2', POLAR_PRODUCT_SCALE: 'p3', POLAR_SOMETHING_NEW: 'x' }
		for (const vars of [selfHostedVars(cloud), selfHostedVars({ ...cloud, ...polar })]) {
			expect(Object.keys(vars).filter((k) => k.startsWith('POLAR_'))).toEqual([])
		}
		expect(selfHostedVars({ ...cloud, ...polar }).SHARD_SOFT_LIMIT_MB).toBe(cloud.SHARD_SOFT_LIMIT_MB)
	})

	it('keeps everything until the owner sets a limit, and opens no demo or sample site', () => {
		expect(selfHostedVars(cloud)).toMatchObject({ SIGNUPS: 'invite', DEMO_SITE: '', SAMPLE_SITE: '', RETENTION_DAYS: '0', RETENTION_DEFAULT_DAYS: '' })
		expect(selfHostedVars(cloud).SHARD_SOFT_LIMIT_MB).toBe(cloud.SHARD_SOFT_LIMIT_MB)
	})
})
