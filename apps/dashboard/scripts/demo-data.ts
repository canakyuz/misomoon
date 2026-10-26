// Records the demo dashboard's data (`pnpm --filter @misomoon/dashboard demo:data`). The
// demo at /demo reads these files instead of the API, so it opens without waiting on a
// query. It reads the sample site from a running misomoon (API_URL, misomoon Cloud by
// default) and writes src/demo/site.json plus one file per period. A rerun records only
// the missing periods; FRESH=1 records them all again, to bring the funnels, pages or
// reports up to date. The dashboard moves the dates to today itself.
import { access, mkdir, writeFile } from 'node:fs/promises'
import { DIMENSIONS } from '@misomoon/core/filters'
import { demoKey, type DemoPeriod, type DemoSite } from '../src/lib/demo-key.ts'

const api = (process.env.API_URL ?? 'https://app.misomoon.com').replace(/\/$/, '')
const out = new URL('../src/demo/', import.meta.url)
const PERIODS = ['today', 'yesterday', '24h', '7d', '28d', '30d', '90d', 'mtd', 'lastmonth', 'ytd', '6mo', '12mo', 'all']
const PROPERTIES = [...Object.keys(DIMENSIONS), 'goal', 'props']
// the rows Overview opens up, and the reports under them (the lenses in Overview.svelte)
const LENSES: Record<string, string[]> = {
	channel: ['source', 'referrer', 'utm_campaign', 'utm_medium', 'entry_page'],
	device: ['browser', 'os', 'screen', 'network'],
}
const MODES = ['sequential', 'strict', 'flexible']
const DAY = 86_400_000
/** pages with their own Clicks and Scroll reports, and first pages with their own next step in Paths */
const PAGES = 15
const STEPS = 10

type Json = any // eslint-disable-line @typescript-eslint/no-explicit-any

async function call(path: string, body?: unknown): Promise<Json> {
	for (let tries = 1; ; tries++) {
		const res = await fetch(api + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}).catch((e: Error) => {
			// a dropped connection is tried again, like a server error
			if (tries === 3) throw e
			return null
		})
		if (!res) continue
		if (res.ok) return res.json()
		// signed out, the stats API takes 100 requests a minute: wait for the next minute
		if (res.status === 429) {
			await new Promise((r) => setTimeout(r, (Number(res.headers.get('Retry-After')) || 60) * 1000))
			tries--
			continue
		}
		if (res.status >= 500 && tries === 3) throw new Error(`${path} → ${res.status}`)
		// a refusal is part of the recording: the demo shows it as the API would
		if (res.status < 500) return { error: ((await res.json().catch(() => null)) as Json)?.error ?? res.statusText, status: res.status }
	}
}

/** Runs `jobs` two at a time by default: each is a real query on the server's database, which other readers share. */
async function pool<T>(jobs: (() => Promise<T>)[], size = Number(process.env.DEMO_CONCURRENCY) || 2): Promise<T[]> {
	const results: T[] = []
	let next = 0
	await Promise.all(
		Array.from({ length: size }, async () => {
			while (next < jobs.length) {
				const i = next++
				results[i] = await jobs[i]()
			}
		}),
	)
	return results
}

const me = await call('/api/v1/me')
const site: string = me.sample
if (!site) throw new Error(`${api} has no sample site: set SAMPLE_SITE there`)
const info = me.sites.find((s: Json) => s.id === site)
const at = Date.now()
console.log(`recording ${site} from ${api}`)

async function period(p: string): Promise<DemoPeriod> {
	const entries: Record<string, unknown> = {}
	const q = (extra: Record<string, string>) => new URLSearchParams({ site, period: p, ...extra })
	const record = async (route: string, extra: Record<string, string>) => {
		entries[demoKey(route, extra)] = await call(`/api/v1/${route}?${q(extra)}`)
		return entries[demoKey(route, extra)] as Json
	}
	const jobs: (() => Promise<unknown>)[] = []
	for (const compare of ['previous', 'year']) {
		jobs.push(() => record('stats/aggregate', { compare }))
		jobs.push(async () => {
			const ts = await record('stats/timeseries', { compare })
			if (compare !== 'previous' || !ts.window) return
			// the other intervals KpiChart offers for this span
			const span = ts.window.to - ts.window.from
			const ok = { minute: span <= DAY / 4, hour: span <= 8 * DAY, day: span >= 2 * DAY && span <= 400 * DAY, week: span >= 14 * DAY, month: span >= 60 * DAY }
			for (const [interval, offered] of Object.entries(ok)) if (offered && interval !== ts.interval) await record('stats/timeseries', { compare, interval })
		})
	}
	jobs.push(() => record('stats/vitals', {}))
	for (const property of PROPERTIES) jobs.push(() => record('stats/breakdown', { property, limit: '100', compare: 'previous' }))
	for (const report of ['forms', 'search', 'errors', 'media', 'content']) jobs.push(() => record('stats/behavior', { report, limit: '100' }))
	await pool(jobs)

	const later: (() => Promise<unknown>)[] = []
	for (const [property, lenses] of Object.entries(LENSES)) {
		const rows = (entries[demoKey('stats/breakdown', { property })] as Json).rows ?? []
		for (const row of rows.slice(0, 10))
			for (const lens of lenses) later.push(() => record('stats/breakdown', { property: lens, limit: '25', compare: 'previous', filters: `${property}==${row.key}` }))
	}
	const pages = ((entries[demoKey('stats/breakdown', { property: 'page' })] as Json).rows ?? []).slice(0, PAGES)
	for (const row of pages) for (const report of ['clicks', 'scroll']) later.push(() => record('stats/behavior', { report, page: row.key, limit: '100' }))
	for (const direction of ['forward', 'backward']) {
		later.push(async () => {
			const root = await record('stats/journeys', { direction })
			for (const step of (root.steps ?? []).slice(0, STEPS)) await record('stats/journeys', { direction, path: step.key })
		})
	}
	for (const funnel of await call(`/api/v1/sites/${site}/funnels`))
		for (const mode of MODES)
			later.push(async () => {
				entries[demoKey('stats/funnel', { mode, steps: JSON.stringify(funnel.steps) })] = await call('/api/v1/stats/funnel', { site, period: p, steps: funnel.steps, mode })
			})
	await pool(later)
	return { at, entries }
}

await mkdir(out, { recursive: true })
const demo: DemoSite = {
	at,
	timezone: info.timezone,
	// the demo is signed out and shows the sample site only
	me: { ...me, kind: 'anonymous', user: null, teams: [], sites: [info], demo: null, share: null, imported: [], search: [] },
	funnels: await call(`/api/v1/sites/${site}/funnels`),
	segments: await call(`/api/v1/sites/${site}/segments`),
	annotations: await call(`/api/v1/sites/${site}/annotations?from=${at - 400 * DAY}&to=${at}`),
	realtime: await call(`/api/v1/stats/realtime?site=${site}`),
	ever: await call(`/api/v1/stats/aggregate?site=${site}&period=all&compare=0`),
}
await writeFile(new URL('site.json', out), JSON.stringify(demo))
for (const p of PERIODS) {
	// a rerun skips the periods already written, unless FRESH=1; delete a file to record it again
	if (!process.env.FRESH && (await access(new URL(`${p}.json`, out)).then(() => true, () => false))) continue
	const started = Date.now()
	const data = await period(p)
	await writeFile(new URL(`${p}.json`, out), JSON.stringify(data))
	console.log(`${p}: ${Object.keys(data.entries).length} responses in ${((Date.now() - started) / 1000).toFixed(0)}s`)
}
