// What bundle.ts takes from apps/api/wrangler.jsonc (misomoon Cloud's config) for the
// self-hosted deploy bundle. Kept apart from bundle.ts, which builds on import, so
// test/deploy.test.ts can check it.

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

/** The bundle's `vars`: the Cloud's, less what only misomoon Cloud runs. */
export function selfHostedVars(cloud: Record<string, string>): Record<string, string> {
	// The Cloud's plans never ship: a self-hosted server has no plan limits (docs/configuration.md#plans).
	const { PLANS: _cloudOnly, ...rest } = cloud
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
