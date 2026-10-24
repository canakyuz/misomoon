// misomoon Cloud plans (PLANS=on): sites per team, and how long a site keeps its stats.
// The limits come from PLANS in packages/core/src/plans.ts, so a change there needs no
// change here.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { DAY, planById, PLAN_RETENTION_LIMIT, PLAN_SITE_LIMIT, retentionLimitMessage, siteLimitMessage, TRIAL_PLAN } from '@misomoon/core'
import { invalidate } from '../src/control'
import { fakeCtx, fakeEnv, OWNER, type FakeEnv } from './fake'

vi.mock('@misomoon/tracker/m.min.js', () => ({ default: '/* m.js */' }))
const { default: worker } = await import('../src/index')

const starter = planById('starter')!
const growth = planById('growth')!
const trial = planById(TRIAL_PLAN)!
// misomoon Cloud's server limits (apps/api/wrangler.jsonc): 5 years at most, 25 months by default
const CLOUD = { PLANS: 'on', RETENTION_DAYS: '1825', RETENTION_DEFAULT_DAYS: '761' }
const DEFAULT = 761

async function call(env: FakeEnv, method: string, path: string, body?: unknown, headers: Record<string, string> = OWNER) {
	const ctx = fakeCtx()
	const init: RequestInit = { method, headers: { 'content-type': 'application/json', ...headers } }
	if (body !== undefined) init.body = JSON.stringify(body)
	const res = await worker.fetch(new Request(`https://app.test${path}`, init), env as unknown as Env, ctx as unknown as ExecutionContext)
	await ctx.settle()
	return { status: res.status, body: (res.status === 204 ? null : await res.json()) as any }
}

/** A misomoon Cloud server whose team t1 is on its free trial, which these tests never let end (trial.test.ts covers the end). */
function cloudEnv() {
	const env = fakeEnv(CLOUD)
	env.CONTROL.db.exec('UPDATE teams SET trial_ends_at = 9e15')
	return env
}

const addSite = (env: FakeEnv, domain: string, team?: string) => call(env, 'POST', '/api/v1/sites', { domain, ...(team ? { team } : {}) })
const setPlan = (env: FakeEnv, team: string, plan: string | null) => env.CONTROL.db.prepare('UPDATE teams SET plan = ? WHERE id = ?').run(plan, team)
const teamSites = (env: FakeEnv, team: string) => env.CONTROL.rows('SELECT id FROM sites WHERE team_id = ? ORDER BY id', team).map((r) => r.id)
const me = async (env: FakeEnv) => (await call(env, 'GET', '/api/v1/me')).body
/** A scheduled run outside the five-minute cron, which runs the daily cleanup too. */
async function runCleanup(env: FakeEnv) {
	const ctx = fakeCtx()
	await worker.scheduled({} as ScheduledController, env as unknown as Env, ctx as unknown as ExecutionContext)
	await ctx.settle()
}

/** A second team the owner of t1 also owns, and a third team, of someone else, where the owner is a guest on one site. Both are on the trial. */
function moreTeams(env: FakeEnv) {
	env.CONTROL.db.exec(`INSERT INTO teams (id, name, created_at, trial_ends_at) VALUES ('t2', 'Client work', 1, 9e15), ('t3', 'Someone else', 2, 9e15);
		INSERT INTO users (id, email, name, password_hash, created_at) VALUES ('u2', 'other@test', 'Other', 'x', 0);
		INSERT INTO team_members (team_id, user_id, role, created_at) VALUES ('t2', 'u1', 'owner', 1), ('t3', 'u2', 'owner', 2);
		INSERT INTO sites (id, domain, name, team_id, created_at) VALUES ('guest-com', 'guest.com', 'Guest', 't3', 3);
		INSERT INTO site_guests (site_id, user_id, role, created_at) VALUES ('guest-com', 'u1', 'editor', 3);`)
}

beforeEach(() => invalidate(''))
afterEach(() => {
	vi.useRealTimers()
	vi.restoreAllMocks()
})

describe('the site limit', () => {
	it('lets a Starter team add sites up to its limit and refuses the next with the plan, the code, and where to pick a bigger one', async () => {
		const env = cloudEnv()
		setPlan(env, 't1', 'starter')
		for (let i = 0; i < starter.sites!; i++) expect((await addSite(env, `site${i}.com`)).status).toBe(201)
		const over = await addSite(env, 'one-more.com')
		expect(over).toEqual({ status: 403, body: { error: siteLimitMessage(starter), code: PLAN_SITE_LIMIT } })
		expect(over.body.error).toContain('choose a bigger plan in Settings > Team')
		expect(teamSites(env, 't1')).toHaveLength(starter.sites!)
		// naming the team is refused the same way as leaving it out
		expect((await addSite(env, 'again.com', 't1')).body.code).toBe(PLAN_SITE_LIMIT)
	})

	it("counts only the team's own sites, not the sites it is a guest on", async () => {
		const env = cloudEnv()
		moreTeams(env)
		setPlan(env, 't1', 'starter')
		setPlan(env, 't3', 'starter')
		expect((await addSite(env, 'shop.com', 't1')).status).toBe(201)
		expect(teamSites(env, 't1')).toEqual(['shop-com'])
		// guest.com fills t3's one site, not t1's, and shop.com now fills t1's
		expect(teamSites(env, 't3')).toEqual(['guest-com'])
		expect((await addSite(env, 'two.com', 't1')).body.code).toBe(PLAN_SITE_LIMIT)
	})

	it('keeps every site when a team moves to a plan with fewer, and only blocks adding more', async () => {
		const env = cloudEnv()
		for (const d of ['a.com', 'b.com', 'c.com']) expect((await addSite(env, d)).status).toBe(201)
		setPlan(env, 't1', 'starter')
		expect((await addSite(env, 'd.com')).body.code).toBe(PLAN_SITE_LIMIT)
		expect(teamSites(env, 't1')).toEqual(['a-com', 'b-com', 'c-com'])
		const team = (await me(env)).teams.find((t: { id: string }) => t.id === 't1')
		expect(team.plan).toMatchObject({ id: 'starter', sites: starter.sites, sites_used: 3, trial: false })
		// deleting down to the limit doesn't make room; deleting below it does
		await call(env, 'DELETE', '/api/v1/sites/a-com')
		await call(env, 'DELETE', '/api/v1/sites/b-com')
		expect((await addSite(env, 'd.com')).status).toBe(403)
		await call(env, 'DELETE', '/api/v1/sites/c-com')
		expect((await addSite(env, 'd.com')).status).toBe(201)
	})
})

describe('moving a site to another team', () => {
	it('refuses a move into a team at its limit, and leaves the site, its guests and its invitations as they were', async () => {
		const env = cloudEnv()
		moreTeams(env)
		expect((await addSite(env, 'shop.com', 't1')).status).toBe(201)
		expect((await addSite(env, 'client.com', 't2')).status).toBe(201)
		setPlan(env, 't2', 'starter')
		env.CONTROL.db.exec(`INSERT INTO site_guests (site_id, user_id, role, created_at) VALUES ('shop-com', 'u2', 'viewer', 5);
			INSERT INTO invitations (id, team_id, site_id, email, role, hash, expires_at, created_at) VALUES ('i1', 't1', 'shop-com', 'x@test', 'viewer', 'h1', 9e15, 5);`)
		const refused = await call(env, 'POST', '/api/v1/sites/shop-com/transfer', { team: 't2' })
		expect(refused).toEqual({ status: 403, body: { error: siteLimitMessage(starter, true), code: PLAN_SITE_LIMIT } })
		expect(teamSites(env, 't1')).toEqual(['shop-com'])
		expect(env.CONTROL.rows("SELECT user_id FROM site_guests WHERE site_id = 'shop-com'").map((r) => r.user_id)).toEqual(['u2'])
		expect(env.CONTROL.rows("SELECT id FROM invitations WHERE site_id = 'shop-com'").map((r) => r.id)).toEqual(['i1'])
	})

	it('moves a site into a team with room, out of a Starter team, and cleans up as before', async () => {
		const env = cloudEnv()
		moreTeams(env)
		setPlan(env, 't1', 'starter')
		setPlan(env, 't2', 'starter')
		expect((await addSite(env, 'shop.com', 't1')).status).toBe(201)
		env.CONTROL.db.exec("INSERT INTO invitations (id, team_id, site_id, email, role, hash, expires_at, created_at) VALUES ('i1', 't1', 'shop-com', 'x@test', 'viewer', 'h1', 9e15, 5)")
		expect(await call(env, 'POST', '/api/v1/sites/shop-com/transfer', { team: 't2' })).toEqual({ status: 200, body: { ok: true } })
		expect(teamSites(env, 't2')).toEqual(['shop-com'])
		expect(env.CONTROL.rows("SELECT id FROM invitations WHERE site_id = 'shop-com'")).toEqual([])
		// t1 has room again, and t2 has none left
		expect((await addSite(env, 'next.com', 't1')).status).toBe(201)
		expect((await call(env, 'POST', '/api/v1/sites/next-com/transfer', { team: 't2' })).body.code).toBe(PLAN_SITE_LIMIT)
	})
})

describe('retention under a plan', () => {
	it("refuses a setting longer than the plan keeps, and keeps the server's default within the plan", async () => {
		const env = cloudEnv()
		setPlan(env, 't1', 'starter')
		await addSite(env, 'shop.com')
		const long = await call(env, 'PATCH', '/api/v1/sites/shop-com', { retention_days: starter.retentionDays + 1 })
		expect(long).toEqual({ status: 403, body: { error: retentionLimitMessage(starter), code: PLAN_RETENTION_LIMIT } })
		expect((await call(env, 'PATCH', '/api/v1/sites/shop-com', { retention_days: starter.retentionDays })).body.retention_days).toBe(starter.retentionDays)
		// too short is the ordinary 400, with the plan's longest as the top of the range
		const short = await call(env, 'PATCH', '/api/v1/sites/shop-com', { retention_days: 7 })
		expect(short).toEqual({ status: 400, body: { error: `retention_days is a whole number of days from 30 to ${starter.retentionDays}, or null` } })
		await call(env, 'PATCH', '/api/v1/sites/shop-com', { retention_days: null })
		const site = (await me(env)).sites.find((s: { id: string }) => s.id === 'shop-com')
		expect([site.retention_days, site.retention]).toEqual([null, { max: starter.retentionDays, default: Math.min(DEFAULT, starter.retentionDays) }])
	})

	it('keeps a value saved under a bigger plan, so other settings still save, and refuses a new value past the plan', async () => {
		const env = cloudEnv()
		setPlan(env, 't1', 'growth')
		await addSite(env, 'shop.com')
		expect((await call(env, 'PATCH', '/api/v1/sites/shop-com', { retention_days: growth.retentionDays })).status).toBe(200)
		setPlan(env, 't1', 'starter')
		// the dashboard sends the whole privacy card, retention included
		const same = await call(env, 'PATCH', '/api/v1/sites/shop-com', { retention_days: growth.retentionDays, exclude_ips: ['203.0.113.7'] })
		expect([same.status, same.body.retention_days, same.body.exclude_ips]).toEqual([200, growth.retentionDays, '203.0.113.7'])
		expect((await call(env, 'PATCH', '/api/v1/sites/shop-com', { retention_days: growth.retentionDays - 1 })).body.code).toBe(PLAN_RETENTION_LIMIT)
	})

	it("deletes by the smaller of the server's and the plan's limit, so a move to a smaller plan applies without touching the site", async () => {
		vi.useFakeTimers({ toFake: ['Date'] })
		const now = Date.UTC(2026, 9, 22, 12)
		vi.setSystemTime(now)
		const env = cloudEnv()
		moreTeams(env)
		await addSite(env, 'shop.com', 't1')
		await addSite(env, 'blog.com', 't1')
		await addSite(env, 'docs.com', 't2')
		await addSite(env, 'wiki.com', 't2')
		// shop and wiki save the trial's longest; then t1 moves down to Starter. t2 stays on the trial.
		for (const id of ['shop-com', 'wiki-com']) expect((await call(env, 'PATCH', `/api/v1/sites/${id}`, { retention_days: trial.retentionDays })).status).toBe(200)
		setPlan(env, 't1', 'starter')
		// days each site keeps: its setting or the server's default, never past its plan's longest
		const keeps: Record<string, number> = {
			'shop-com': Math.min(trial.retentionDays, starter.retentionDays),
			'blog-com': Math.min(DEFAULT, starter.retentionDays),
			'docs-com': Math.min(DEFAULT, trial.retentionDays),
			'wiki-com': trial.retentionDays,
		}
		const ages = [...new Set([starter.retentionDays, DEFAULT, trial.retentionDays].flatMap((d) => [d - 1, d + 1]))]
		for (const id of Object.keys(keeps))
			for (const age of ages)
				env.SHARD_0.db.prepare("INSERT INTO events (event_id, site_id, ts, name, visitor_id, session_id) VALUES (?, ?, ?, 'pageview', 'v', 's')").run(`${id}-${age}`, id, now - age * DAY)
		await runCleanup(env)
		const left = env.SHARD_0.rows('SELECT event_id FROM events').map((r) => r.event_id)
		const kept = Object.entries(keeps).flatMap(([id, days]) => ages.filter((a) => a < days).map((a) => `${id}-${a}`))
		expect(left.sort()).toEqual(kept.sort())
		// Starter's longest cuts shop below what it saved, and blog's default below 25 months
		expect(left).not.toContain(`shop-com-${starter.retentionDays + 1}`)
		expect(left).toContain(`docs-com-${DEFAULT - 1}`)
		// the site's own setting is untouched
		expect(env.CONTROL.rows("SELECT retention_days FROM sites WHERE id = 'shop-com'")[0].retention_days).toBe(trial.retentionDays)
	})
})

describe('the trial, and plan ids that are not plans', () => {
	for (const stored of [null, 'enterprise']) {
		it(`gives a team whose plan is ${stored ?? 'NULL'} the trial plan's limits`, async () => {
			const error = vi.spyOn(console, 'error').mockImplementation(() => {})
			const env = cloudEnv()
			setPlan(env, 't1', stored)
			const count = trial.sites ?? 5
			for (let i = 0; i < count; i++) expect((await addSite(env, `site${i}.com`)).status).toBe(201)
			expect((await call(env, 'PATCH', '/api/v1/sites/site0-com', { retention_days: trial.retentionDays + 1 })).body).toEqual({ error: retentionLimitMessage(trial), code: PLAN_RETENTION_LIMIT })
			const body = await me(env)
			expect(body.plans).toBe(true)
			const most = Math.min(1825, trial.retentionDays)
			expect(body.teams[0].plan).toMatchObject({ id: trial.id, name: trial.name, state: 'trial', trial: true, lapsed: false, events: trial.events, retention_days: most, retention_default_days: Math.min(DEFAULT, most), sites: trial.sites, sites_used: count })
			expect(body.sites[0].retention).toEqual({ max: most, default: Math.min(DEFAULT, most) })
			// a stored id that is not a plan is logged, so support can fix it
			expect(error.mock.calls.some(([line]) => String(line).includes('"msg":"unknown plan"'))).toBe(stored !== null)
		})
	}
})

describe('a server without PLANS=on (self-hosted)', () => {
	for (const PLANS of [undefined, '', 'off']) {
		it(`enforces nothing with PLANS ${JSON.stringify(PLANS)}, whatever teams.plan says`, async () => {
			vi.useFakeTimers({ toFake: ['Date'] })
			const now = Date.UTC(2026, 9, 22, 12)
			vi.setSystemTime(now)
			const env = fakeEnv({ PLANS, RETENTION_DAYS: '0', RETENTION_DEFAULT_DAYS: '' })
			moreTeams(env)
			setPlan(env, 't1', 'starter')
			setPlan(env, 't2', 'starter')
			for (const d of ['a.com', 'b.com', 'c.com']) expect((await addSite(env, d, 't1')).status).toBe(201)
			expect((await addSite(env, 'd.com', 't2')).status).toBe(201)
			expect((await call(env, 'POST', '/api/v1/sites/a-com/transfer', { team: 't2' })).status).toBe(200)
			expect((await call(env, 'PATCH', '/api/v1/sites/b-com', { retention_days: 3650 })).body.retention_days).toBe(3650)
			const body = await me(env)
			expect(body.plans).toBe(false)
			expect(body.teams.map((t: { plan: unknown }) => t.plan)).toEqual([null, null])
			expect(body.sites.find((s: { id: string }) => s.id === 'c-com').retention).toEqual({ max: 0, default: 0 })
			// the cleanup keeps everything: no server limit, and no plan
			env.SHARD_0.db.prepare("INSERT INTO events (event_id, site_id, ts, name, visitor_id, session_id) VALUES ('old', 'c-com', ?, 'pageview', 'v', 's')").run(now - 3000 * DAY)
			await runCleanup(env)
			expect(env.SHARD_0.rows('SELECT event_id FROM events').map((r) => r.event_id)).toEqual(['old'])
		})
	}
})
