// Applies migrations to the control database and every SHARD_* database bound in
// wrangler.jsonc, so a new shard can't be forgotten. `--remote` targets Cloudflare;
// the default is the local dev databases.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const target = process.argv.includes('--remote') ? '--remote' : '--local'
const config = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8')
const bindings = [...config.matchAll(/"binding":\s*"(CONTROL|SHARD_(?:(?:EU|US|APAC)_)?\d+)"/g)].map((m) => m[1])
for (const binding of bindings) {
	console.log(`migrating ${binding} (${target.slice(2)})`)
	execFileSync('wrangler', ['d1', 'migrations', 'apply', binding, target], { stdio: 'inherit' })
}
