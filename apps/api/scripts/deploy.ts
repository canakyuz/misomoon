// Deploys the API with its event shards:  SHARD_COUNT=4 pnpm run deploy
//
// SHARD_COUNT is the number of shards without a region. SHARD_REGIONS adds shards that
// keep their data in one region, like SHARD_REGIONS=eu:2,us:1,apac:1: EU and US shards are
// created in that D1 jurisdiction, and Asia-Pacific ones with the `apac` location hint.
// A site stays on the shards of the region it was added with (src/control.ts).
//
// The first run creates the D1 databases and the queues. Growing creates the missing
// D1 databases, binds them in the config, migrates and deploys; a migrated shard
// registers itself. Shrinking marks the extra shards `retiring`: the Worker moves their
// data onto the others (src/moves.ts), and a later run with the same count unbinds each
// one once it holds nothing. Databases are never deleted here. A count left unset keeps
// what is bound. `--plan` prints what would change and touches nothing.
// D1_JURISDICTION=eu keeps the control database and shards without a region in the EU;
// D1 sets it at creation only, so an existing database keeps where it is.
// It deploys wrangler.jsonc, the self-hosted template, unless `--config <file>` or
// WRANGLER_CONFIG names another, like misomoon Cloud's wrangler.cloud.jsonc
// (`pnpm run deploy:cloud`). Every wrangler call gets that config.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import { configPath } from './config.ts'
import { createArgs, parseRegions, planShards, shardOf, type Db, type Region } from './shards.ts'

const CONFIG = configPath(process.argv.slice(2), process.env)
const plan = process.argv.includes('--plan')
const PLACEHOLDER = /^0{8}-0{4}-0{4}-0{4}-\d{12}$/
const JURISDICTION = process.env.D1_JURISDICTION
if (JURISDICTION && !/^(eu|us|fedramp)$/.test(JURISDICTION)) throw new Error(`D1_JURISDICTION is ${JURISDICTION}; use eu, us or fedramp`)
const LINE = /^\s*\{ "binding": "(\w+)", "database_name": "([\w-]+)", "database_id": "([\w-]+)", "migrations_dir": "([\w/]+)" \},?$/

function wrangler(...args: string[]): string {
	return execFileSync('wrangler', [...args, '--config', CONFIG], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
}

function control<T>(sql: string): T[] {
	const out = JSON.parse(wrangler('d1', 'execute', 'CONTROL', '--remote', '--json', '--command', sql))
	return out[0].results as T[]
}

function create(name: string, region: Region | null = null): string {
	if (plan) return '(new)'
	const id = wrangler('d1', 'create', name, ...createArgs(region, JURISDICTION)).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)?.[0]
	if (!id) throw new Error(`could not read the id of ${name}`)
	console.log(`created ${name} (${id})`)
	return id
}

const text = readFileSync(CONFIG, 'utf8')
const lines = text.split('\n')
const dbs: Db[] = lines.flatMap((l) => {
	const m = l.match(LINE)
	return m ? [{ binding: m[1], name: m[2], id: m[3], dir: m[4] }] : []
})
const shards = dbs.filter((d) => shardOf(d.binding))
const count = process.env.SHARD_COUNT === undefined ? undefined : Number(process.env.SHARD_COUNT)
if (count !== undefined && (!Number.isInteger(count) || count < 0)) throw new Error('SHARD_COUNT must be a whole number')
const regions = parseRegions(process.env.SHARD_REGIONS)
const wanted = planShards(shards, { '': count, ...regions })

// First deploy: databases still carrying placeholder ids get created.
const deployed = !dbs.some((d) => PLACEHOLDER.test(d.id))
for (const d of dbs) if (PLACEHOLDER.test(d.id)) d.id = create(d.name, shardOf(d.binding)?.group || null)

const kept = [...wanted.keep]
for (const c of wanted.create) kept.find((d) => d.binding === c.binding)!.id = create(c.name, c.region)
const pending: string[] = []
const extra = wanted.extra
const registry = deployed
	? control<{ name: string; status: string; ranges: number }>('SELECT name, status, (SELECT COUNT(*) FROM shard_map m WHERE m.shard = s.name) + (SELECT COUNT(*) FROM shard_moves v WHERE v.from_shard = s.name) AS ranges FROM shards s')
	: []
for (const d of extra) {
	const row = registry.find((r) => r.name === d.binding.toLowerCase())
	if (row && row.ranges > 0) {
		pending.push(`${row.name} still holds ${row.ranges} ranges; its data moves off every 5 minutes, run this again later to unbind it`)
		kept.push(d)
		if (row.status !== 'retiring' && !plan) control(`UPDATE shards SET status = 'retiring' WHERE name = '${row.name}'`)
	} else {
		console.log(`unbinding ${d.binding}; the database ${d.name} is kept, delete it with \`wrangler d1 delete ${d.name}\` when sure`)
		if (row && !plan) control(`DELETE FROM shards WHERE name = '${row.name}'`)
	}
}
// A shard brought back inside the count stops retiring.
for (const r of registry) {
	const d = wanted.keep.find((k) => k.binding.toLowerCase() === r.name)
	if (d && r.status === 'retiring' && !plan) control(`UPDATE shards SET status = 'active' WHERE name = '${r.name}'`)
}

// Plain shards first, then each region, by index.
const order = (d: Db) => ['', 'eu', 'us', 'apac'].indexOf(shardOf(d.binding)!.group) * 1e6 + shardOf(d.binding)!.index
kept.sort((a, b) => order(a) - order(b))
const render = (d: Db, last: boolean) => `\t\t{ "binding": "${d.binding}", "database_name": "${d.name}", "database_id": "${d.id}", "migrations_dir": "${d.dir}" }${last ? '' : ','}`
const out: string[] = []
let placed = false
for (const l of lines) {
	const m = l.match(LINE)
	if (!m) {
		out.push(l)
		continue
	}
	const d = dbs.find((x) => x.binding === m[1])!
	if (!shardOf(d.binding)) out.push(render(d, false))
	else if (!placed) {
		kept.forEach((k, i) => out.push(render(k, i === kept.length - 1)))
		placed = true
	}
}
const next = out.join('\n')

console.log(`shards: ${shards.length} bound, ${wanted.keep.length} wanted, ${kept.length} after this run`)
for (const p of pending) console.log(p)
if (plan) {
	if (next !== text) console.log(`\n${basename(CONFIG)} would become:\n` + next.split('\n').filter((l) => l.includes('"database_id"')).join('\n'))
	process.exit(0)
}
if (next !== text) writeFileSync(CONFIG, next)
// The events queue and its dead-letter queue; creating one that exists is a no-op.
for (const name of new Set([...text.matchAll(/"(?:queue|dead_letter_queue)": "([\w-]+)"/g)].map((m) => m[1]))) {
	try {
		execFileSync('wrangler', ['queues', 'create', name, '--config', CONFIG], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
		console.log(`created queue ${name}`)
	} catch (e) {
		const out = `${(e as { stdout?: string }).stdout ?? ''}${(e as { stderr?: string }).stderr ?? ''}`
		if (!/already (exists|taken)/i.test(out)) throw new Error(`could not create queue ${name}: ${out.trim()}`)
	}
}
execFileSync('node', ['--experimental-strip-types', new URL('./migrate.ts', import.meta.url).pathname, '--remote', '--config', CONFIG], { stdio: 'inherit' })
execFileSync('wrangler', ['deploy', '--config', CONFIG], { stdio: 'inherit' })
