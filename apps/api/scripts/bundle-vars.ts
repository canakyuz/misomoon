// What bundle.ts takes from apps/api/wrangler.jsonc, the self-hosted template, for the
// deploy bundle. Kept apart from bundle.ts, which builds on import, so
// test/deploy.test.ts can check it.
import { readFileSync } from 'node:fs'

/** wrangler.jsonc without its comments; `//` inside strings (URLs) is kept */
export function parseJsonc(text: string) {
	let json = ''
	for (let i = 0, str = false; i < text.length; i++) {
		const ch = text[i]
		if (str) {
			json += ch
			if (ch === '\\') json += text[++i]
			else if (ch === '"') str = false
		} else if (ch === '"') {
			str = true
			json += ch
		} else if (ch === '/' && text[i + 1] === '/') {
			while (i < text.length && text[i] !== '\n') i++
			json += '\n'
		} else json += ch
	}
	return JSON.parse(json)
}

/** The bundle's `vars`: the Cloud's, less what only misomoon Cloud runs. The template's
 *  vars are already these, which test/deploy.test.ts checks. */
export function selfHostedVars(cloud: Record<string, string>): Record<string, string> {
	// The Cloud's plans never ship: a self-hosted server has no plan limits (docs/configuration.md#plans).
	// Nor does its address: email links would lead to misomoon Cloud's dashboard.
	const { PLANS: _cloudOnly, PUBLIC_URL: _cloudUrl, EMAIL_PROVIDER: _cloudEmailProvider, EMAIL_FROM: _cloudEmailFrom, AWS_SES_REGION: _cloudSesRegion, ...rest } = cloud
	// Nor does the Cloud's billing: every POLAR_* setting is misomoon Cloud's own Polar (docs/billing.md).
	const vars = Object.fromEntries(Object.entries(rest).filter(([name]) => !name.startsWith('POLAR_')))
	return {
		...vars,
		// After the first account signs up, new people join by invitation only.
		SIGNUPS: 'invite',
		// No demo site, so the dashboard opens on your own first site, and no sample site.
		DEMO_SITE: '',
		SAMPLE_SITE: '',
		// Your own databases: keep everything until you set a limit.
		RETENTION_DAYS: '0',
		RETENTION_DEFAULT_DAYS: '',
	}
}


/** The config the bundle is built from: the self-hosted template, never misomoon Cloud's
 *  wrangler.cloud.jsonc, so no Cloud database id or route reaches deploy/. */
export const bundleSource = (api: URL) => parseJsonc(readFileSync(new URL('wrangler.jsonc', api), 'utf8'))

/** deploy/wrangler.jsonc. Its placeholder database ids are the defaults the Deploy to
 *  Cloudflare button replaces with the databases it creates. */
export function bundleConfig(source: Record<string, any>) {
	return {
		$schema: 'node_modules/wrangler/config-schema.json',
		name: 'misomoon',
		main: 'worker/index.js',
		no_bundle: true,
		find_additional_modules: true,
		base_dir: 'worker',
		rules: source.rules,
		compatibility_date: source.compatibility_date,
		compatibility_flags: source.compatibility_flags,
		observability: source.observability,
		assets: { ...source.assets, directory: 'public' },
		d1_databases: source.d1_databases,
		queues: source.queues,
		ratelimits: source.ratelimits,
		browser: source.browser,
		triggers: source.triggers,
		vars: selfHostedVars(source.vars),
	}
}
