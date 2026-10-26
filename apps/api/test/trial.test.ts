// misomoon Cloud (PLANS=on): one free trial per person, lapsed teams, and the monthly event
// limit with its emails and its stop. The limits come from PLANS in
// packages/core/src/plans.ts, so a change there needs no change here.
import { createHash, createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { DAY, eventStop, monthStart, OVERAGE, planById, PLAN_REQUIRED, planRequiredMessage, TRIAL_DAYS, TRIAL_PLAN, utcDay, utcMonth } from '@misomoon/core'
import { invalidate } from '../src/control'
import { fakeCtx, fakeEnv, OWNER, type FakeEnv } from './fake'

vi.mock('@misomoon/tracker/m.min.js', () => ({ default: '/* m.js */' }))
const { default: worker } = await import('../src/index')

const CLOUD = { PLANS: 'on', RETENTION_DAYS: '1825', RETENTION_DEFAULT_DAYS: '761' }
const UA = 'Mozilla/5.0 (Macintosh) Chrome/141.0.0.0 Safari/537.36'
const STRIPE_SECRET = 'whsec_stripeTestSecret123'
// 10 October 2026, noon UTC
const NOW = Date.UTC(2026, 9, 10, 12)
const starter = planById('starter')!
const trial = planById(TRIAL_PLAN)!

async function call(env: FakeEnv, method: string, path: string, body?: unknown, headers: Record<string, string> = OWNER) {
	const ctx = fakeCtx()
	const init: RequestInit = { method, headers: { 'content-type': 'application/json', ...headers } }
	if (body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body)
	const res = await worker.fetch(new Request(`https://app.test${path}`, init), env as unknown as Env, ctx as unknown as ExecutionContext)
	await ctx.settle()
	return { status: res.status, body: (res.status === 204 || res.status === 202 ? null : await res.json()) as any }
}

const at = (ts: number) => vi.setSystemTime(ts)
const teamRow = (env: FakeEnv, id: string) => env.CONTROL.rows('SELECT name, plan, created_at, trial_ends_at FROM teams WHERE id = ?', id)[0] as { name: string; plan: string | null; created_at: number; trial_ends_at: number | null }
const userRow = (env: FakeEnv, email: string) => env.CONTROL.rows('SELECT id, trial_started_at FROM users WHERE email = ?', email)[0] as { id: string; trial_started_at: number | null }
const setPlan = (env: FakeEnv, team: string, plan: string | null) => env.CONTROL.db.prepare('UPDATE teams SET plan = ? WHERE id = ?').run(plan, team)
const setTrial = (env: FakeEnv, team: string, ends: number | null) => env.CONTROL.db.prepare('UPDATE teams SET trial_ends_at = ? WHERE id = ?').run(ends, team)
const me = async (env: FakeEnv, headers = OWNER) => (await call(env, 'GET', '/api/v1/me', undefined, headers)).body
const teamPlan = async (env: FakeEnv, team: string, headers = OWNER) => (await me(env, headers)).teams.find((t: { id: string }) => t.id === team).plan

/** Someone signed in, by a session token inserted straight into CONTROL. */
function person(env: FakeEnv, id: string, opts: { trial?: number | null; teams?: [string, string][] } = {}) {
	const token = `ms_${id}-session`
	const hash = createHash('sha256').update(token).digest('hex')
	env.CONTROL.db.prepare('INSERT INTO users (id, email, name, password_hash, created_at, trial_started_at) VALUES (?, ?, ?, ?, 0, ?)').run(id, `${id}@test`, id, 'x', opts.trial ?? null)
	env.CONTROL.db.prepare('INSERT INTO sessions (hash, user_id, expires_at, created_at) VALUES (?, ?, 9e15, 0)').run(hash, id)
	for (const [team, role] of opts.teams ?? []) env.CONTROL.db.prepare('INSERT INTO team_members (team_id, user_id, role, created_at) VALUES (?, ?, ?, 0)').run(team, id, role)
	return { authorization: `Bearer ${token}` }
}

/** A pageview from one browser; true when it was stored. Writes inline: the fake env binds no queue. */
async function pageview(env: FakeEnv, site = 'shop-com', ip = '198.51.100.7') {
	const before = events(env, site)
	expect((await call(env, 'POST', '/api/event', { s: site, n: 'pageview', u: `https://${site.replace(/-com$/, '.com')}/` }, { 'user-agent': UA, 'cf-connecting-ip': ip })).status).toBe(202)
	return events(env, site) > before
}

const events = (env: FakeEnv, site: string) => [env.SHARD_0, env.SHARD_1].reduce((n, db) => n + (db.rows("SELECT COUNT(*) AS n FROM events WHERE site_id = ? AND name = 'pageview'", site)[0] as { n: number }).n, 0)
const payments = (env: FakeEnv) => [env.SHARD_0, env.SHARD_1].flatMap((db) => db.rows("SELECT name, revenue FROM events WHERE name = 'Payment'"))

/** This UTC day's events of a site in usage_daily, as if they had been counted already. */
function setUsed(env: FakeEnv, site: string, n: number, day = utcDay(Date.now())) {
	env.CONTROL.db.prepare('INSERT INTO usage_daily (site_id, day, events, stored) VALUES (?, ?, ?, ?) ON CONFLICT (site_id, day) DO UPDATE SET events = excluded.events, stored = excluded.stored').run(site, day, n, n)
	invalidate('')
}

function stripe(env: FakeEnv, id: string) {
	const body = JSON.stringify({ id: `evt_${id}`, type: 'checkout.session.completed', livemode: true, data: { object: { created: Math.floor(Date.now() / 1000), id, mode: 'payment', payment_status: 'paid', amount_total: 4900, currency: 'usd', payment_intent: `pi_${id}` } } })
	const t = Math.floor(Date.now() / 1000)
	const sig = createHmac('sha256', STRIPE_SECRET).update(`${t}.${body}`).digest('hex')
	return call(env, 'POST', '/api/webhooks/stripe/shop-com', body, { 'stripe-signature': `t=${t},v1=${sig}` })
}

/** A Cloud server with email, team t1 on its trial, and shop.com in it. */
async function cloud(over: Partial<FakeEnv> = {}) {
	const mails: { to: string; subject: string; text: string }[] = []
	const env = fakeEnv({ ...CLOUD, EMAIL: { send: async (m) => (mails.push(m as (typeof mails)[number]), { messageId: 'm' }) }, ...over })
	setTrial(env, 't1', NOW + TRIAL_DAYS * DAY)
	expect((await call(env, 'POST', '/api/v1/sites', { domain: 'shop.com' })).status).toBe(201)
	return { env, mails }
}

beforeEach(() => {
	invalidate('')
	vi.useFakeTimers({ toFake: ['Date'] })
	at(NOW)
})
afterEach(() => {
	vi.useRealTimers()
	vi.restoreAllMocks()
})

describe('one free trial per person', () => {
	it("gives a person's first team the trial, and every team they make after it none", async () => {
		const env = fakeEnv(CLOUD)
		const signup = await call(env, 'POST', '/api/v1/auth/signup', { email: 'ada@example.com', name: 'Ada', password: 'correct horse battery' }, {})
		expect(signup.status).toBe(201)
		const ada = { authorization: `Bearer ${signup.body.token}` }
		const [first] = (await me(env, ada)).teams
		expect(teamRow(env, first.id)).toMatchObject({ created_at: NOW, trial_ends_at: NOW + TRIAL_DAYS * DAY })
		expect(userRow(env, 'ada@example.com').trial_started_at).toBe(NOW)
		expect(first.plan).toMatchObject({ state: 'trial', trial: true, lapsed: false, stopped: false, trial_ends_at: NOW + TRIAL_DAYS * DAY, id: trial.id, events: trial.events })

		at(NOW + DAY)
		const second = await call(env, 'POST', '/api/v1/teams', { name: 'Client work' }, ada)
		expect(second.status).toBe(201)
		expect(teamRow(env, second.body.id)).toMatchObject({ created_at: NOW + DAY, trial_ends_at: NOW + DAY })
		// the person's trial started with the first team and stays there
		expect(userRow(env, 'ada@example.com').trial_started_at).toBe(NOW)
		expect(await teamPlan(env, second.body.id, ada)).toMatchObject({ state: 'lapsed', trial: false, lapsed: true, stopped: true, trial_ends_at: null })
		// the first team's trial runs on
		expect(await teamPlan(env, first.id, ada)).toMatchObject({ state: 'trial', trial_ends_at: NOW + TRIAL_DAYS * DAY })
	})

	it('gives only one of two teams made at once the trial', async () => {
		const env = fakeEnv(CLOUD)
		const made = await Promise.all([call(env, 'POST', '/api/v1/teams', { name: 'A' }), call(env, 'POST', '/api/v1/teams', { name: 'B' })])
		const trials = made.map((r) => teamRow(env, r.body.id)).filter((t) => t.trial_ends_at! > t.created_at)
		expect(trials).toHaveLength(1)
		expect(userRow(env, 'owner@test').trial_started_at).toBe(NOW)
	})

	it("makes the on-demand 'My sites' team with the trial only for someone who never had one", async () => {
		const env = fakeEnv(CLOUD)
		// both are viewers on t1, so adding a site makes them a team of their own
		const fresh = person(env, 'fresh', { teams: [['t1', 'viewer']] })
		const used = person(env, 'used', { trial: NOW - 30 * DAY, teams: [['t1', 'viewer']] })
		expect((await call(env, 'POST', '/api/v1/sites', { domain: 'fresh.com' }, fresh)).status).toBe(201)
		const refused = await call(env, 'POST', '/api/v1/sites', { domain: 'used.com' }, used)
		expect(refused).toEqual({ status: 403, body: { error: planRequiredMessage(), code: PLAN_REQUIRED } })
		const mine = (headers: Record<string, string>) => me(env, headers).then((b) => b.teams.find((t: { name: string }) => t.name === 'My sites'))
		expect((await mine(fresh)).plan).toMatchObject({ state: 'trial', sites_used: 1 })
		expect((await mine(used)).plan).toMatchObject({ state: 'lapsed', sites_used: 0 })
		expect(userRow(env, 'fresh@test').trial_started_at).toBe(NOW)
		expect(userRow(env, 'used@test').trial_started_at).toBe(NOW - 30 * DAY)
	})

	it('treats a team row without trial_ends_at as no trial', async () => {
		const env = fakeEnv(CLOUD)
		// the fixture's t1 was inserted without one
		expect(teamRow(env, 't1').trial_ends_at).toBeNull()
		expect((await call(env, 'POST', '/api/v1/sites', { domain: 'shop.com' })).body.code).toBe(PLAN_REQUIRED)
	})
})

describe('a lapsed team', () => {
	it("drops its sites' beacons at the edge, still records payments, and keeps the dashboard readable", async () => {
		const { env, mails } = await cloud()
		expect((await call(env, 'PUT', '/api/v1/sites/shop-com/revenue/stripe', { secret: STRIPE_SECRET })).status).toBe(200)
		expect(await pageview(env)).toBe(true)
		// the trial ends; the cached state lasts a minute at most, and a week has gone by
		at(NOW + TRIAL_DAYS * DAY + 1)
		expect(await pageview(env, 'shop-com', '198.51.100.8')).toBe(false)
		expect(await pageview(env, 'shop-com', '198.51.100.9')).toBe(false)
		expect(await stripe(env, 'cs_live_1')).toEqual({ status: 200, body: { ok: true, counted: 1 } })
		expect(payments(env)).toEqual([{ name: 'Payment', revenue: 49 }])
		const stats = await call(env, 'GET', '/api/v1/stats/aggregate?site=shop-com&period=30d')
		expect([stats.status, stats.body.current.pageviews]).toEqual([200, 1])
		expect((await call(env, 'PATCH', '/api/v1/sites/shop-com', { name: 'Shop' })).status).toBe(200)
		expect(await teamPlan(env, 't1')).toMatchObject({ state: 'lapsed', lapsed: true, stopped: true, trial: false, trial_ends_at: NOW + TRIAL_DAYS * DAY, events_used: 1 })
		expect(mails).toEqual([])
	})

	it('costs the edge one query per team a minute, and sends nothing to the queue', async () => {
		const { env } = await cloud()
		for (const d of ['blog.com', 'docs.com']) expect((await call(env, 'POST', '/api/v1/sites', { domain: d })).status).toBe(201)
		const sent: unknown[] = []
		env.EVENTS = { send: async (body) => void sent.push(body) }
		const prepare = vi.spyOn(env.CONTROL, 'prepare')
		const reads = () => prepare.mock.calls.filter(([sql]) => sql.includes('AS events FROM teams')).length
		for (const site of ['shop-com', 'blog-com', 'docs-com', 'shop-com']) await pageview(env, site)
		expect([sent.length, reads()]).toEqual([4, 1])
		setTrial(env, 't1', NOW + 30_000)
		at(NOW + 61_000)
		for (const site of ['shop-com', 'blog-com', 'docs-com']) await pageview(env, site)
		expect([sent.length, reads()]).toEqual([4, 2])
	})

	it("judges the trial by the server's clock, not the time a beacon says it was sent", async () => {
		const { env } = await cloud()
		setTrial(env, 't1', NOW - 60_000)
		invalidate('')
		// m.js may send a time up to 5 minutes off; one from before the trial ended still counts as now
		const sent = await call(env, 'POST', '/api/event', { s: 'shop-com', n: 'pageview', u: 'https://shop.com/', ts: NOW - 4 * 60_000 }, { 'user-agent': UA, 'cf-connecting-ip': '198.51.100.7' })
		expect(sent.status).toBe(202)
		expect(events(env, 'shop-com')).toBe(0)
	})

	it('records again within a minute once the team has a plan', async () => {
		const { env } = await cloud()
		setTrial(env, 't1', NOW - 1)
		invalidate('')
		expect(await pageview(env)).toBe(false)
		setPlan(env, 't1', 'growth')
		at(NOW + 61_000)
		expect(await pageview(env)).toBe(true)
		expect(await teamPlan(env, 't1')).toMatchObject({ state: 'plan', lapsed: false, stopped: false, trial: false })
	})

	it('answers plan_required to a site added to it or moved into it, and lets a site move out', async () => {
		const { env } = await cloud()
		env.CONTROL.db.exec(`INSERT INTO teams (id, name, created_at, trial_ends_at) VALUES ('t2', 'Client work', 1, 1);
			INSERT INTO team_members (team_id, user_id, role, created_at) VALUES ('t2', 'u1', 'owner', 1);`)
		expect(await call(env, 'POST', '/api/v1/sites', { domain: 'client.com', team: 't2' })).toEqual({ status: 403, body: { error: planRequiredMessage(), code: PLAN_REQUIRED } })
		expect(await call(env, 'POST', '/api/v1/sites/shop-com/transfer', { team: 't2' })).toEqual({ status: 403, body: { error: planRequiredMessage(true), code: PLAN_REQUIRED } })
		expect(env.CONTROL.rows("SELECT team_id FROM sites WHERE id = 'shop-com'")).toEqual([{ team_id: 't1' }])
		// t1 lapses; its site moves to t2, which now has a plan, and records there
		setPlan(env, 't2', 'starter')
		setTrial(env, 't1', NOW - 1)
		expect((await call(env, 'POST', '/api/v1/sites', { domain: 'more.com', team: 't1' })).body.code).toBe(PLAN_REQUIRED)
		expect(await call(env, 'POST', '/api/v1/sites/shop-com/transfer', { team: 't2' })).toEqual({ status: 200, body: { ok: true } })
		invalidate('')
		expect(await pageview(env)).toBe(true)
	})
})

describe('the monthly event limit', () => {
	it("adds up a team's events this UTC month across its sites, by the team the site is in now", async () => {
		const { env } = await cloud()
		for (const d of ['blog.com', 'docs.com']) expect((await call(env, 'POST', '/api/v1/sites', { domain: d })).status).toBe(201)
		env.CONTROL.db.exec(`INSERT INTO teams (id, name, created_at, plan) VALUES ('t2', 'Client work', 1, 'growth'), ('t3', 'Someone else', 1, 'growth');
			INSERT INTO team_members (team_id, user_id, role, created_at) VALUES ('t2', 'u1', 'owner', 1);
			INSERT INTO sites (id, domain, name, team_id, created_at) VALUES ('other-com', 'other.com', 'Other', 't3', 1);`)
		const first = utcDay(monthStart(utcMonth(NOW)))
		setUsed(env, 'shop-com', 1000, first - 1) // September: not this month
		setUsed(env, 'shop-com', 10, first)
		setUsed(env, 'shop-com', 20)
		setUsed(env, 'blog-com', 5)
		setUsed(env, 'other-com', 999)
		expect(await teamPlan(env, 't1')).toMatchObject({ events_used: 35, events: trial.events, events_stop: eventStop(trial), month_ends_at: Date.UTC(2026, 10, 1) })
		// a site moved mid-month takes its month's events to the team it moved to
		expect((await call(env, 'POST', '/api/v1/sites/blog-com/transfer', { team: 't2' })).status).toBe(200)
		expect([(await teamPlan(env, 't1')).events_used, (await teamPlan(env, 't2')).events_used]).toEqual([30, 5])
	})

	it('emails owners, admins and billing members at 80% and at 100% of the plan, once each', async () => {
		const { env, mails } = await cloud()
		setPlan(env, 't1', 'starter')
		person(env, 'admin', { teams: [['t1', 'admin']] })
		person(env, 'billing', { teams: [['t1', 'billing']] })
		person(env, 'editor', { teams: [['t1', 'editor']] })
		person(env, 'viewer', { teams: [['t1', 'viewer']] })
		const recipients = ['admin@test', 'billing@test', 'owner@test']
		setUsed(env, 'shop-com', starter.events * 0.8 - 1)
		expect(await pageview(env, 'shop-com', '198.51.100.1')).toBe(true)
		expect(mails.map((m) => m.to).sort()).toEqual(recipients)
		expect(new Set(mails.map((m) => m.subject))).toEqual(new Set(["Team has used 80% of this month's events"]))
		expect(mails[0].text).toContain(`${(starter.events * 0.8).toLocaleString('en')} events this month, 80% of the Starter plan's ${starter.events.toLocaleString('en')} events`)
		expect(mails[0].text).toContain('1 November')
		expect(mails[0].text).toContain('/?site=shop-com&view=settings&tab=team')
		expect(await pageview(env, 'shop-com', '198.51.100.2')).toBe(true)
		expect(mails).toHaveLength(3)

		mails.length = 0
		setUsed(env, 'shop-com', starter.events - 1)
		expect(await pageview(env, 'shop-com', '198.51.100.3')).toBe(true)
		expect(await pageview(env, 'shop-com', '198.51.100.4')).toBe(true)
		expect(mails.map((m) => [m.to, m.subject]).sort()).toEqual(recipients.map((to) => [to, "Team has used this month's events"]))
		// still recording past 100%
		expect(await teamPlan(env, 't1')).toMatchObject({ events_used: starter.events + 1, stopped: false })
		expect(env.CONTROL.rows('SELECT level FROM plan_notices ORDER BY level').map((r) => r.level)).toEqual([80, 100])
	})

	it('stops at OVERAGE until the next UTC month, emails once, and still records payments', async () => {
		const { env, mails } = await cloud()
		setPlan(env, 't1', 'starter')
		expect((await call(env, 'PUT', '/api/v1/sites/shop-com/revenue/stripe', { secret: STRIPE_SECRET })).status).toBe(200)
		setUsed(env, 'shop-com', eventStop(starter) - 1)
		// the last event that fits, then nothing
		expect(await pageview(env, 'shop-com', '198.51.100.1')).toBe(true)
		expect(mails.map((m) => m.subject)).toEqual(['Tracking for Team is paused until 1 November'])
		expect(mails[0].text).toContain(`${Math.round(OVERAGE * 100)}% of the Starter plan's`)
		for (const ip of ['198.51.100.2', '198.51.100.3']) expect(await pageview(env, 'shop-com', ip)).toBe(false)
		expect(mails).toHaveLength(1)
		expect(await teamPlan(env, 't1')).toMatchObject({ state: 'plan', stopped: true, events_used: eventStop(starter) })
		expect((await stripe(env, 'cs_live_1')).body).toEqual({ ok: true, counted: 1 })
		expect(payments(env)).toHaveLength(1)
		// a new month is a new count, at once
		at(Date.UTC(2026, 10, 1, 0, 0, 30))
		expect(await pageview(env, 'shop-com', '198.51.100.4')).toBe(true)
		expect(await teamPlan(env, 't1')).toMatchObject({ stopped: false, events_used: 1, month_ends_at: Date.UTC(2026, 11, 1) })
	})

	it('records again when the team moves to a plan with room, and counts the new plan for its emails', async () => {
		const { env, mails } = await cloud()
		setPlan(env, 't1', 'starter')
		setUsed(env, 'shop-com', eventStop(starter))
		expect(await pageview(env)).toBe(false)
		setPlan(env, 't1', 'growth')
		at(NOW + 61_000)
		expect(await pageview(env)).toBe(true)
		// 125,001 of Growth's 1,000,000 is under 80%
		expect(mails).toEqual([])
		expect(await teamPlan(env, 't1')).toMatchObject({ id: 'growth', stopped: false })
	})

	it("stops at once when the team moves to a smaller plan whose stop this month's events have passed, and records again on moving back", async () => {
		const { env } = await cloud()
		setPlan(env, 't1', 'growth')
		setUsed(env, 'shop-com', eventStop(starter) + 10)
		expect(await pageview(env, 'shop-com', '198.51.100.1')).toBe(true)
		setPlan(env, 't1', 'starter')
		at(NOW + 61_000)
		expect(await pageview(env, 'shop-com', '198.51.100.2')).toBe(false)
		expect(await teamPlan(env, 't1')).toMatchObject({ id: 'starter', stopped: true })
		setPlan(env, 't1', 'growth')
		at(NOW + 122_000)
		expect(await pageview(env, 'shop-com', '198.51.100.3')).toBe(true)
	})

	it("counts a team on the trial against the trial plan's events", async () => {
		const { env, mails } = await cloud()
		setUsed(env, 'shop-com', eventStop(trial) - 1)
		expect(await pageview(env, 'shop-com', '198.51.100.1')).toBe(true)
		expect(mails.map((m) => m.subject)).toEqual(['Tracking for Team is paused until 1 November'])
		expect(mails[0].text).toContain(`of the free trial's ${trial.events.toLocaleString('en')} events`)
		expect(await pageview(env, 'shop-com', '198.51.100.2')).toBe(false)
		expect(await teamPlan(env, 't1')).toMatchObject({ state: 'trial', stopped: true })
	})

	it('skips the emails quietly without an email provider', async () => {
		const { env } = await cloud({ EMAIL: undefined })
		const log = vi.spyOn(console, 'log').mockImplementation(() => {})
		setPlan(env, 't1', 'starter')
		setUsed(env, 'shop-com', starter.events * 0.8 - 1)
		expect(await pageview(env)).toBe(true)
		expect(log.mock.calls.some(([line]) => String(line).includes('email skipped: no email provider set up'))).toBe(true)
		expect(env.CONTROL.rows('SELECT level FROM plan_notices').map((r) => r.level)).toEqual([80])
	})
})

describe('a server without PLANS=on (self-hosted)', () => {
	for (const PLANS of [undefined, '', 'off']) {
		it(`starts no trial, lapses nothing, and counts no month with PLANS ${JSON.stringify(PLANS)}`, async () => {
			const mails: unknown[] = []
			const env = fakeEnv({ PLANS, EMAIL: { send: async (m) => (mails.push(m), { messageId: 'm' }) } })
			const signup = await call(env, 'POST', '/api/v1/auth/signup', { email: 'ada@example.com', name: 'Ada', password: 'correct horse battery' }, {})
			const ada = { authorization: `Bearer ${signup.body.token}` }
			const second = await call(env, 'POST', '/api/v1/teams', { name: 'Client work' }, ada)
			for (const id of [(await me(env, ada)).teams[0].id, second.body.id]) expect(teamRow(env, id).trial_ends_at).toBeNull()
			expect(userRow(env, 'ada@example.com').trial_started_at).toBeNull()
			expect((await call(env, 'POST', '/api/v1/sites', { domain: 'client.com', team: second.body.id }, ada)).status).toBe(201)
			// the fixture's t1 has no plan and no trial, which with plans on would be lapsed
			expect((await call(env, 'POST', '/api/v1/sites', { domain: 'shop.com' })).status).toBe(201)
			setUsed(env, 'shop-com', 50_000_000)
			expect(await pageview(env)).toBe(true)
			expect(await pageview(env, 'shop-com', '198.51.100.8')).toBe(true)
			expect((await me(env)).teams.map((t: { plan: unknown }) => t.plan)).toEqual([null])
			expect([mails, env.CONTROL.rows('SELECT * FROM plan_notices')]).toEqual([[], []])
		})
	}
})
