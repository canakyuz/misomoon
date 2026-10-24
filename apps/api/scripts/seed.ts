// Creates the demo account and its public demo site, then fills the site with weeks of
// realistic traffic through the running dev server (`pnpm dev` in apps/api), exercising
// the real write path. Sign in to the dashboard with SEED_EMAIL / SEED_PASSWORD.
const api = process.env.API_URL ?? 'http://localhost:8787'
const email = process.env.SEED_EMAIL ?? 'demo@misomoon.dev'
const password = process.env.SEED_PASSWORD ?? 'misomoon-demo'
const headers: Record<string, string> = { 'Content-Type': 'application/json' }

async function call(method: string, path: string, body?: unknown, allow: number[] = []) {
	const res = await fetch(api + path, { method, headers, body: body ? JSON.stringify(body) : undefined })
	const text = await res.text()
	if (!res.ok && !allow.includes(res.status)) throw new Error(`${method} ${path} → ${res.status} ${text}`)
	return text ? JSON.parse(text) : null
}

const signedUp = await call('POST', '/api/v1/auth/signup', { email, password, name: 'Demo' }, [409])
const session = signedUp?.token ? signedUp : await call('POST', '/api/v1/auth/login', { email, password })
headers.Authorization = `Bearer ${session.token}`
console.log(`signed in as ${email} (password: ${password})`)

const sites = (await call('GET', '/api/v1/sites')) as { id: string }[]
if (!sites.some((s) => s.id === 'demo')) {
	await call('POST', '/api/v1/sites', { id: 'demo', domain: 'misomoon.com', name: 'misomoon.com', timezone: 'Asia/Jakarta', public: true })
}
// the demo shows every report, so every feature is on
await call('PATCH', '/api/v1/sites/demo', { features: ['vitals', 'clicks', 'errors', 'fields', 'media', 'content', 'search'] })
const goals = (await call('GET', '/api/v1/sites/demo/goals')) as { name: string }[]
for (const [name, kind, match] of [
	['Signup', 'event', 'Signup'],
	['Purchase', 'event', 'Purchase'],
	['Visit pricing', 'page', '/pricing'],
	['Read the docs', 'page', '/docs*'],
	['Copy snippet', 'event', 'Copy Snippet'],
] as const) {
	if (!goals.some((g) => g.name === name)) await call('POST', '/api/v1/sites/demo/goals', { name, kind, match })
}
const funnels = (await call('GET', '/api/v1/sites/demo/funnels')) as unknown[]
if (!funnels.length) {
	await call('POST', '/api/v1/sites/demo/funnels', {
		name: 'Home to signup',
		steps: [
			{ kind: 'page', match: '/', label: 'Landed on home' },
			{ kind: 'page', match: '/pricing', label: 'Viewed pricing' },
			{ kind: 'page', match: '/signup', label: 'Opened signup' },
			{ kind: 'event', match: 'Signup', label: 'Signed up' },
		],
	})
}
console.log('seeding traffic…')
console.log(await call('POST', '/api/v1/sites/demo/demo', { days: Number(process.env.DAYS ?? 40), perDay: Number(process.env.PER_DAY ?? 160) }))
