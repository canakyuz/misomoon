import { IMPORTERS } from '@misomoon/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { invalidate } from '../src/control'
import { fakeCtx, fakeEnv, OWNER, type FakeEnv } from './fake'
import matomoDay from '../../../packages/core/test/importers/fixtures/matomo-day.json'

vi.mock('@misomoon/tracker/m.min.js', () => ({ default: '/* m.js */' }))
const { default: worker } = await import('../src/index')

/** the tool's name, read from the importers, which alone may type it (AGENTS.md) */
const NAME = IMPORTERS.umami.name
const SITE = '94db1cb1-74f4-4a40-ad6c-962362670409'
const HOUR = 3_600_000

async function call(env: FakeEnv, method: string, path: string, body?: unknown) {
	const ctx = fakeCtx()
	const res = await worker.fetch(
		new Request(`https://app.test${path}`, { method, headers: { ...OWNER, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }),
		env as unknown as Env,
		ctx as unknown as ExecutionContext,
	)
	await ctx.settle()
	return res
}

async function cron(env: FakeEnv) {
	const ctx = fakeCtx()
	await worker.scheduled({ cron: '*/5 * * * *' } as ScheduledController, env as unknown as Env, ctx as unknown as ExecutionContext)
	await ctx.settle()
}

/**
 * The tool's API: 12 visitors on each day, and answers set per day, such as a 429. `asked`
 * lists the days whose totals were read, in order.
 */
function fakeTool(answer: (day: string) => Response | null = () => null) {
	const asked: string[] = []
	vi.stubGlobal('fetch', async (url: string) => {
		const u = new URL(url)
		if (u.pathname.endsWith(`/websites/${SITE}`)) return Response.json({ name: 'Shop', domain: 'shop.com', createdAt: '2024-01-01T00:00:00Z' })
		const day = new Date(Number(u.searchParams.get('startAt'))).toISOString().slice(0, 10)
		if (u.pathname.endsWith('/stats')) {
			const res = answer(day)
			if (res) return res
			asked.push(day)
			return Response.json({ pageviews: 30, visitors: 12, visits: 15, bounces: 3, totaltime: 600 })
		}
		return Response.json([])
	})
	return asked
}

const start = (env: FakeEnv, body: Record<string, unknown> = {}) => call(env, 'POST', '/api/v1/sites/shop-com/imports/api', { importer: 'umami', input: { website: SITE, key: 'api_1' }, ...body })
const imports = (env: FakeEnv) => env.CONTROL.rows('SELECT source, label, status, error, from_day, to_day, skipped_days FROM imports ORDER BY created_at')
const jobs = (env: FakeEnv) => env.CONTROL.rows('SELECT next_day, days_done, days_total, retries FROM import_jobs')
/** The stored site totals, as day → visitors. */
const totals = (env: FakeEnv) =>
	Object.fromEntries(
		[...env.SHARD_0.rows("SELECT ts, visitors FROM imported WHERE dim = ''"), ...env.SHARD_1.rows("SELECT ts, visitors FROM imported WHERE dim = ''")].map((r) => {
			const { ts, visitors } = r as { ts: number; visitors: number }
			return [new Date(ts).toISOString().slice(0, 10), visitors]
		}),
	)

let rate: (typeof IMPORTERS)['umami']['rate']
beforeEach(async () => {
	invalidate('')
	// the tool's own rate limit would make these tests wait
	rate = IMPORTERS.umami.rate
	IMPORTERS.umami.rate = undefined
	vi.useFakeTimers({ toFake: ['Date'] })
	vi.setSystemTime(Date.UTC(2024, 5, 10, 12))
})
afterEach(() => {
	IMPORTERS.umami.rate = rate
	vi.unstubAllGlobals()
	vi.useRealTimers()
})

async function site() {
	const env = fakeEnv()
	await call(env, 'POST', '/api/v1/sites', { domain: 'shop.com' })
	return env
}

describe('API imports', () => {
	it('reads every day from the newest back while the person waits, and keeps no sign-in once done', async () => {
		const env = await site()
		const asked = fakeTool()
		const res = await start(env, { from: '2024-06-06' })
		expect([res.status, await res.json()]).toEqual([202, { id: expect.any(String), status: 'importing' }])
		// no To ends yesterday on a site misomoon hasn't counted yet
		expect(asked).toEqual(['2024-06-09', '2024-06-08', '2024-06-07', '2024-06-06'])
		expect(imports(env)).toEqual([{ source: 'umami', label: `${NAME}: Shop`, status: 'done', error: null, from_day: '2024-06-06', to_day: '2024-06-09', skipped_days: 0 }])
		expect(totals(env)).toEqual({ '2024-06-06': 12, '2024-06-07': 12, '2024-06-08': 12, '2024-06-09': 12 })
		expect(jobs(env)).toEqual([])
	})

	it("starts at the tool's first day when From is empty", async () => {
		const env = await site()
		const asked = fakeTool()
		vi.setSystemTime(Date.UTC(2024, 0, 4, 12))
		await start(env)
		expect(asked).toEqual(['2024-01-03', '2024-01-02', '2024-01-01'])
	})

	it('refuses a wrong key while the person waits, with what the tool said, and stores nothing', async () => {
		const env = await site()
		vi.stubGlobal('fetch', async () => Response.json({ error: 'Unauthorized' }, { status: 401 }))
		const res = await start(env)
		expect([res.status, await res.json()]).toEqual([400, { error: `${NAME} answered 401: check the key or the sign-in, and that it can read this site ({"error":"Unauthorized"})` }])
		expect([imports(env), jobs(env)]).toEqual([[], []])
	})

	it('refuses an unknown importer and fields that are not text', async () => {
		const env = await site()
		expect((await call(env, 'POST', '/api/v1/sites/shop-com/imports/api', { importer: 'nope' })).status).toBe(400)
		const res = await start(env, { input: { website: SITE, key: { $gt: '' } } })
		expect([res.status, await res.json()]).toEqual([400, { error: 'API key must be text of at most 500 characters' }])
	})

	it('waits when the tool asks it to slow down, and carries on from the last day written', async () => {
		const env = await site()
		let limited = true
		const asked = fakeTool((day) => (limited && day === '2024-05-31' ? new Response('slow down', { status: 429, headers: { 'retry-after': '120' } }) : null))
		await start(env, { from: '2024-05-25' })
		// a write holds 7 days, so the run stored 9 June back to 3 June
		expect(Object.keys(totals(env)).sort()).toEqual(['2024-06-03', '2024-06-04', '2024-06-05', '2024-06-06', '2024-06-07', '2024-06-08', '2024-06-09'])
		expect(jobs(env)).toEqual([{ next_day: '2024-06-02', days_done: 7, days_total: 16, retries: 1 }])
		expect((await (await call(env, 'GET', '/api/v1/sites/shop-com/imports')).json())[0]).toMatchObject({ status: 'importing', days_done: 7, days_total: 16 })
		// the next cron run is too early for the tool's two minutes
		asked.length = 0
		await cron(env)
		expect(asked).toEqual([])
		limited = false
		vi.setSystemTime(Date.now() + 3 * 60_000)
		await cron(env)
		expect(asked[0]).toBe('2024-06-02')
		expect(imports(env)[0]).toMatchObject({ status: 'done', from_day: '2024-05-25', to_day: '2024-06-09' })
		expect(Object.values(totals(env))).toEqual(Array(16).fill(12))
	})

	it('writes a day again without counting it twice when a run stopped before saving its place', async () => {
		const env = await site()
		let limited = true
		fakeTool((day) => (limited && day === '2024-06-01' ? new Response(null, { status: 429 }) : null))
		await start(env, { from: '2024-06-01' })
		// as if the run had written 9 June back to 3 June and stopped before saving that
		env.CONTROL.db.prepare("UPDATE import_jobs SET next_day = '2024-06-09', days_done = 0, run_after = 0").run()
		limited = false
		await cron(env)
		expect(imports(env)[0]).toMatchObject({ status: 'done' })
		expect(Object.values(totals(env))).toEqual(Array(9).fill(12))
	})

	it('fails with none of its rows when the key stops working part way', async () => {
		const env = await site()
		fakeTool((day) => (day === '2024-05-30' ? Response.json({ error: 'Unauthorized' }, { status: 401 }) : null))
		await start(env, { from: '2024-05-20' })
		expect(imports(env)[0]).toMatchObject({ status: 'failed', error: expect.stringMatching(new RegExp(`^${NAME} answered 401`)) })
		expect([totals(env), jobs(env)]).toEqual([{}, []])
	})

	it('gives up after six failed runs in a row on a tool that stays down', async () => {
		const env = await site()
		fakeTool(() => new Response('down', { status: 503 }))
		await start(env, { from: '2024-06-01' })
		for (let i = 0; i < 6; i++) {
			vi.setSystemTime(Date.now() + HOUR)
			await cron(env)
		}
		expect(imports(env)[0]).toMatchObject({ status: 'failed', error: `${NAME} answered 503` })
		expect(jobs(env)).toEqual([])
	})

	it('skips days an earlier import covers, and ends the day before misomoon counted its first pageview', async () => {
		const env = await site()
		const form = new FormData()
		form.append('file', new File(['date,visitors\n2024-06-03,5\n2024-06-04,5\n'], 'imported_visitors.csv'))
		await worker.fetch(new Request('https://app.test/api/v1/sites/shop-com/imports', { method: 'POST', headers: OWNER, body: form }), env as unknown as Env, fakeCtx() as unknown as ExecutionContext)
		env.SHARD_0.db.prepare("INSERT INTO events (event_id, site_id, ts, name, visitor_id, session_id) VALUES ('e', 'shop-com', ?, 'pageview', 'v', 's')").run(Date.UTC(2024, 5, 7, 9))
		env.SHARD_1.db.prepare("INSERT INTO events (event_id, site_id, ts, name, visitor_id, session_id) VALUES ('e', 'shop-com', ?, 'pageview', 'v', 's')").run(Date.UTC(2024, 5, 7, 9))
		const asked = fakeTool()
		await start(env, { from: '2024-06-01', to: '2024-06-30' })
		expect(asked).toEqual(['2024-06-06', '2024-06-05', '2024-06-02', '2024-06-01'])
		expect(imports(env)[1]).toMatchObject({ status: 'done', from_day: '2024-06-01', to_day: '2024-06-06', skipped_days: 2 })
	})

	it('stops a running import when it is deleted, and leaves it to the hourly check no longer', async () => {
		const env = await site()
		fakeTool(() => new Response(null, { status: 429, headers: { 'retry-after': '60' } }))
		await start(env, { from: '2024-06-01' })
		const [{ id }] = env.CONTROL.rows('SELECT id FROM imports') as { id: string }[]
		// a running API import isn't one the Worker stopped part way
		env.CONTROL.db.prepare('UPDATE imports SET created_at = ?').run(Date.now() - 2 * HOUR)
		await worker.scheduled({ cron: '15 * * * *' } as ScheduledController, env as unknown as Env, fakeCtx() as unknown as ExecutionContext)
		expect(imports(env)[0]).toMatchObject({ status: 'importing' })
		expect((await call(env, 'DELETE', `/api/v1/sites/shop-com/imports/${id}`)).status).toBe(204)
		expect([imports(env), jobs(env)]).toEqual([[], []])
	})

	it('keeps none of the days a run reads after its import is deleted part way', async () => {
		const env = await site()
		const asked = fakeTool()
		const tool = fetch
		let deleted = false
		vi.stubGlobal('fetch', async (url: string) => {
			// the person deletes the import while the run reads 1 June, after it wrote 9 June back to 3 June
			if (!deleted && url.includes('/stats') && new URL(url).searchParams.get('startAt') === String(Date.UTC(2024, 5, 1))) {
				deleted = true
				const [{ id }] = env.CONTROL.rows('SELECT id FROM imports') as { id: string }[]
				expect((await call(env, 'DELETE', `/api/v1/sites/shop-com/imports/${id}`)).status).toBe(204)
			}
			return tool(url)
		})
		await start(env, { from: '2024-05-20' })
		expect(deleted).toBe(true)
		expect(asked).not.toContain('2024-05-20')
		expect([imports(env), jobs(env), totals(env)]).toEqual([[], [], {}])
	})

	it(`imports a real day of ${IMPORTERS.matomo.name}'s public demo, as it answered`, async () => {
		const env = await site()
		vi.setSystemTime(Date.UTC(2026, 9, 21, 12))
		const matomoRate = IMPORTERS.matomo.rate
		IMPORTERS.matomo.rate = undefined
		vi.stubGlobal('fetch', async (_: string, init: RequestInit) => {
			const form = Object.fromEntries(new URLSearchParams(String(init.body)))
			const hit = matomoDay.calls.find((c) => c.form.method === form.method && c.form['urls[0]'] === form['urls[0]'])
			return Response.json(hit ? hit.answer : { result: 'error', message: 'not recorded' })
		})
		try {
			const res = await start(env, { importer: 'matomo', input: { url: 'https://demo.matomo.cloud', site: '1', token: 'anonymous' }, from: '2026-10-20' })
			expect(res.status).toBe(202)
		} finally {
			IMPORTERS.matomo.rate = matomoRate
		}
		expect(imports(env)).toEqual([{ source: 'matomo', label: `${IMPORTERS.matomo.name}: Demo Site`, status: 'done', error: null, from_day: '2026-10-20', to_day: '2026-10-20', skipped_days: 0 }])
		expect(totals(env)).toEqual({ '2026-10-20': 11994 })
		const pages = [...env.SHARD_0.rows("SELECT SUM(pageviews) AS n FROM imported WHERE dim = 'page'"), ...env.SHARD_1.rows("SELECT SUM(pageviews) AS n FROM imported WHERE dim = 'page'")] as { n: number | null }[]
		expect(pages.reduce((a, r) => a + (r.n ?? 0), 0)).toBe(28947)
	})
})
