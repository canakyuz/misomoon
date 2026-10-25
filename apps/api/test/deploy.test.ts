import { execFileSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vite-plus/test'
import { bundleConfig, bundleSource, parseJsonc, selfHostedVars } from '../scripts/bundle-vars.ts'
import { configPath } from '../scripts/config.ts'
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

const api = new URL('../', import.meta.url)
const read = (file: string) => parseJsonc(readFileSync(new URL(file, api), 'utf8'))
const PLACEHOLDER = /^0{8}-0{4}-0{4}-0{4}-\d{12}$/

describe('deploy: the two configs', () => {
	const template = read('wrangler.jsonc')
	const cloud = read('wrangler.cloud.jsonc')

	it('deploys wrangler.jsonc as a new self-hosted server: placeholder database ids, a workers.dev address, no misomoon.com route', () => {
		expect(template.d1_databases.map((d: { database_id: string }) => d.database_id)).toEqual(['00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002'])
		expect(template.workers_dev).toBe(true)
		expect(template.routes).toBeUndefined()
		expect(JSON.stringify(template)).not.toContain('misomoon.com')
	})

	it("leaves misomoon Cloud's plans, address and billing out of wrangler.jsonc, and sets what the bundle sets", () => {
		const vars = template.vars as Record<string, string>
		expect(Object.keys(vars).filter((k) => k === 'PLANS' || k === 'PUBLIC_URL' || k.startsWith('POLAR_'))).toEqual([])
		expect(vars).toEqual(selfHostedVars(cloud.vars))
		expect(vars).toMatchObject({ SIGNUPS: 'invite', DEMO_SITE: '', SAMPLE_SITE: '', RETENTION_DAYS: '0', RETENTION_DEFAULT_DAYS: '' })
	})

	it('keeps misomoon Cloud on app.misomoon.com in wrangler.cloud.jsonc, with plans on and its own databases', () => {
		expect(cloud.workers_dev).toBe(false)
		expect(cloud.routes).toEqual([{ pattern: 'app.misomoon.com', custom_domain: true }])
		expect(cloud.vars).toMatchObject({ PLANS: 'on', PUBLIC_URL: 'https://app.misomoon.com', SIGNUPS: 'open', DEMO_SITE: 'demo', SAMPLE_SITE: 'acme' })
		expect(cloud.d1_databases.filter((d: { database_id: string }) => PLACEHOLDER.test(d.database_id))).toEqual([])
	})

	it('runs the same Worker from both: the same bindings, queues, limits, assets and cron', () => {
		const same = (c: any) => ({
			...Object.fromEntries(['main', 'compatibility_date', 'compatibility_flags', 'observability', 'rules', 'assets', 'queues', 'ratelimits', 'browser', 'triggers'].map((k) => [k, c[k]])),
			d1: c.d1_databases.map(({ database_id: _id, ...d }: { database_id: string }) => d),
		})
		expect(same(template)).toEqual(same(cloud))
		expect(Object.keys(template).filter((k) => !['routes', 'workers_dev', 'vars', 'd1_databases', ...Object.keys(same(cloud))].includes(k)).sort()).toEqual(['$schema', 'name'])
	})
})

describe('deploy: the self-hosted bundle', () => {
	const cloudConfig = read('wrangler.cloud.jsonc')
	const cloud = cloudConfig.vars as Record<string, string>
	const bundle = bundleConfig(bundleSource(api))

	it('builds deploy/ from wrangler.jsonc, so no misomoon Cloud database id, route or address reaches it', () => {
		const text = JSON.stringify(bundle)
		const cloudOnly = [...cloudConfig.d1_databases.map((d: { database_id: string }) => d.database_id), ...cloudConfig.routes.map((r: { pattern: string }) => r.pattern), cloud.PUBLIC_URL]
		expect(cloudOnly.filter((v: string) => text.includes(v))).toEqual([])
		expect(text).not.toContain('misomoon.com')
		expect(bundle.d1_databases.map((d: { binding: string; database_id: string }) => [d.binding, PLACEHOLDER.test(d.database_id)])).toEqual([
			['CONTROL', true],
			['SHARD_0', true],
			['SHARD_1', true],
		])
		expect('routes' in bundle || 'account_id' in bundle).toBe(false)
	})

	// the cron's reports and plan emails have no request to take an origin from
	it("links misomoon Cloud's emails to its dashboard, and leaves that address out of the bundle", () => {
		expect(cloud.PUBLIC_URL).toBe(`https://${cloudConfig.routes[0].pattern}`)
		expect('PUBLIC_URL' in selfHostedVars(cloud)).toBe(false)
		expect('PUBLIC_URL' in bundle.vars).toBe(false)
	})

	it('turns plans on for misomoon Cloud only', () => {
		expect(cloud.PLANS).toBe('on')
		expect('PLANS' in selfHostedVars(cloud)).toBe(false)
		expect('PLANS' in bundle.vars).toBe(false)
		expect(selfHostedVars({ ...cloud, PLANS: 'ON' }).PLANS).toBeUndefined()
	})

	it("leaves out misomoon Cloud's Polar billing, whatever POLAR_* settings its vars hold", () => {
		const polar = { POLAR_SERVER: 'sandbox', POLAR_PRODUCT_STARTER: 'p1', POLAR_PRODUCT_GROWTH: 'p2', POLAR_PRODUCT_SCALE: 'p3', POLAR_SOMETHING_NEW: 'x' }
		for (const vars of [selfHostedVars(cloud), selfHostedVars({ ...cloud, ...polar }), bundle.vars]) {
			expect(Object.keys(vars).filter((k) => k.startsWith('POLAR_'))).toEqual([])
		}
		expect(selfHostedVars({ ...cloud, ...polar }).SHARD_SOFT_LIMIT_MB).toBe(cloud.SHARD_SOFT_LIMIT_MB)
	})

	it('keeps everything until the owner sets a limit, and opens no demo or sample site', () => {
		for (const vars of [selfHostedVars(cloud), bundle.vars]) {
			expect(vars).toMatchObject({ SIGNUPS: 'invite', DEMO_SITE: '', SAMPLE_SITE: '', RETENTION_DAYS: '0', RETENTION_DEFAULT_DAYS: '' })
			expect(vars.SHARD_SOFT_LIMIT_MB).toBe(cloud.SHARD_SOFT_LIMIT_MB)
		}
	})
})

describe('deploy: which config it deploys', () => {
	const dir = fileURLToPath(api)

	it('takes --config, then WRANGLER_CONFIG, then wrangler.jsonc, relative to apps/api', () => {
		expect(configPath([], {})).toBe(join(dir, 'wrangler.jsonc'))
		expect(configPath(['--plan'], { WRANGLER_CONFIG: 'wrangler.cloud.jsonc' })).toBe(join(dir, 'wrangler.cloud.jsonc'))
		expect(configPath(['--config', 'wrangler.cloud.jsonc'], { WRANGLER_CONFIG: 'other.jsonc' })).toBe(join(dir, 'wrangler.cloud.jsonc'))
		expect(configPath(['-c', '/abs/w.jsonc', '--plan'], {})).toBe('/abs/w.jsonc')
		expect(configPath(['--config=wrangler.cloud.jsonc'], {})).toBe(join(dir, 'wrangler.cloud.jsonc'))
		expect(() => configPath(['--config'], {})).toThrow('--config needs a file, like --config wrangler.cloud.jsonc')
	})

	// Runs scripts/deploy.ts against a stand-in `wrangler` that records its arguments, so
	// nothing reaches Cloudflare.
	function deploy(config: string, args: string[], extraEnv: Record<string, string> = {}) {
		const tmp = mkdtempSync(join(tmpdir(), 'misomoon-deploy-'))
		const log = join(tmp, 'calls.jsonl')
		const fake = join(tmp, 'wrangler')
		writeFileSync(
			fake,
			`#!${process.execPath}
const fs = require('node:fs')
const args = process.argv.slice(2)
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(args) + '\\n')
const n = fs.readFileSync(${JSON.stringify(log)}, 'utf8').split('\\n').length - 1
if (args[0] === 'd1' && args[1] === 'create') console.log('"database_id": "abcdef00-0000-4000-8000-' + String(n).padStart(12, '0') + '"')
if (args[0] === 'd1' && args[1] === 'execute') console.log('[{"results":[]}]')
`,
		)
		chmodSync(fake, 0o755)
		const file = join(tmp, 'w.jsonc')
		writeFileSync(file, readFileSync(new URL(config, api)))
		const env: Record<string, string | undefined> = { ...process.env, ...extraEnv, PATH: `${tmp}:${process.env.PATH}`, CLOUDFLARE_API_TOKEN: 'not-a-token', WRANGLER_SEND_METRICS: 'false' }
		for (const k of ['SHARD_COUNT', 'SHARD_REGIONS', 'D1_JURISDICTION']) delete env[k]
		if (extraEnv.WRANGLER_CONFIG === '<file>') env.WRANGLER_CONFIG = file
		const real = readFileSync(new URL('wrangler.jsonc', api), 'utf8')
		try {
			execFileSync(process.execPath, ['--experimental-strip-types', fileURLToPath(new URL('scripts/deploy.ts', api)), ...args.map((a) => (a === '<file>' ? file : a))], { env, cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] })
			expect(readFileSync(new URL('wrangler.jsonc', api), 'utf8')).toBe(real)
			const calls = readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as string[])
			return { file, calls, after: parseJsonc(readFileSync(file, 'utf8')) }
		} finally {
			rmSync(tmp, { recursive: true, force: true })
		}
	}

	it('creates the databases of a fresh wrangler.jsonc on the first run, and passes the chosen config to every wrangler call', () => {
		const { file, calls, after } = deploy('wrangler.jsonc', ['--config', '<file>'])
		expect(calls.filter((c) => c.at(-2) !== '--config' || c.at(-1) !== file)).toEqual([])
		expect(calls.map((c) => c.slice(0, -2).join(' '))).toEqual([
			'd1 create misomoon-control',
			'd1 create misomoon-shard-0',
			'd1 create misomoon-shard-1',
			'queues create misomoon-events',
			'queues create misomoon-events-dlq',
			'd1 migrations apply CONTROL --remote',
			'd1 migrations apply SHARD_0 --remote',
			'd1 migrations apply SHARD_1 --remote',
			'deploy',
		])
		expect(after.d1_databases.map((d: { database_id: string }) => d.database_id)).toEqual(['abcdef00-0000-4000-8000-000000000001', 'abcdef00-0000-4000-8000-000000000002', 'abcdef00-0000-4000-8000-000000000003'])
	})

	it('deploys the config that WRANGLER_CONFIG names, and creates nothing once its databases exist', () => {
		const { file, calls, after } = deploy('wrangler.cloud.jsonc', [], { WRANGLER_CONFIG: '<file>' })
		expect(calls.filter((c) => c.at(-2) !== '--config' || c.at(-1) !== file)).toEqual([])
		expect(calls.map((c) => c.slice(0, 2).join(' ')).filter((c) => c.startsWith('d1 create'))).toEqual([])
		expect(calls.at(-1)).toEqual(['deploy', '--config', file])
		expect(after.d1_databases).toEqual(read('wrangler.cloud.jsonc').d1_databases)
	})
})
