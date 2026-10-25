// The wrangler config that scripts/deploy.ts and scripts/migrate.ts read, and pass to every
// wrangler call: `--config <file>` (or `-c`), else WRANGLER_CONFIG, else wrangler.jsonc, the
// self-hosted template. misomoon Cloud deploys with wrangler.cloud.jsonc. A relative path
// is read from apps/api. Kept free of I/O so test/deploy.test.ts can check it.
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const api = fileURLToPath(new URL('../', import.meta.url))

export function configPath(argv: string[], env: Record<string, string | undefined>): string {
	const i = argv.findIndex((a) => a === '--config' || a === '-c')
	const flag = i >= 0 ? argv[i + 1] : argv.find((a) => a.startsWith('--config='))?.slice('--config='.length)
	if ((i >= 0 && (!flag || flag.startsWith('-'))) || flag === '') throw new Error('--config needs a file, like --config wrangler.cloud.jsonc')
	return resolve(api, flag || env.WRANGLER_CONFIG || 'wrangler.jsonc')
}
