import {
	eventLevels,
	eventStop,
	monthStart,
	OVERAGE,
	planById,
	planRetention,
	PLANS,
	plansOn,
	planState,
	renderNotice,
	retentionLimits,
	SUPPORT_EMAIL,
	teamPlan,
	teamStopped,
	utcDay,
	utcMonth,
	type Plan,
	type PlanTerms,
	type RetentionLimits,
} from '@misomoon/core'
import { cached, getSite, invalidate } from './control'
import { sendEmail } from './reports'

/**
 * misomoon Cloud plans, enforced only with PLANS=on. A team's plan is `teams.plan`; NULL is
 * no plan, which works under the trial plan while `teams.trial_ends_at` is ahead and is
 * lapsed after it. A plan limits the team's sites (createSite, the site transfer), how long
 * its sites keep data (PATCH /api/v1/sites/:id, the daily cleanup), and its events per UTC
 * month (planStops at the edge, checkMonths after each queue batch). Reads for requests go
 * to CONTROL each time, so a plan change applies at once; the edge reads through the
 * isolate cache, so there it applies within a minute.
 */

/** Whether this server enforces plans. Off unless PLANS=on, so a self-hosted server has no plan limits. */
export const plansEnforced = (env: Env) => plansOn(env.PLANS)

/** The server's retention: RETENTION_DAYS and RETENTION_DEFAULT_DAYS. */
export function serverRetention(env: Env): RetentionLimits {
	return retentionLimits(env.RETENTION_DAYS, env.RETENTION_DEFAULT_DAYS)
}

/** The plan `stored` names, or the trial's. An id that is no plan is logged, so a typo by support shows up. */
function resolve(teamId: string, stored: string | null | undefined): Plan {
	if (stored != null && !planById(stored)) console.error(JSON.stringify({ msg: 'unknown plan', team: teamId, plan: stored }))
	return teamPlan(stored)
}

/** The plan a team works under and where it stands (plan, trial, lapsed), or null when the server enforces none. */
export async function teamTermsOf(env: Env, teamId: string, now = Date.now()): Promise<PlanTerms | null> {
	if (!plansEnforced(env)) return null
	const row = await env.CONTROL.prepare('SELECT plan, trial_ends_at FROM teams WHERE id = ?').bind(teamId).first<{ plan: string | null; trial_ends_at: number | null }>()
	return { plan: resolve(teamId, row?.plan), state: planState(row?.plan, row?.trial_ends_at, now) }
}

/** The plan a team works under, or null when the server enforces none. */
export async function teamPlanOf(env: Env, teamId: string): Promise<Plan | null> {
	return (await teamTermsOf(env, teamId))?.plan ?? null
}

/** The plans of these teams, or null when the server enforces none. Every team id gets one, the trial's when its row is gone. */
export async function teamPlans(env: Env, teamIds: Iterable<string>): Promise<Map<string, Plan> | null> {
	if (!plansEnforced(env)) return null
	const ids = [...new Set(teamIds)]
	const stored = new Map<string, string | null>()
	// D1 binds at most 100 values per statement
	for (let i = 0; i < ids.length; i += 90) {
		const chunk = ids.slice(i, i + 90)
		const { results } = await env.CONTROL.prepare(`SELECT id, plan FROM teams WHERE id IN (${chunk.map(() => '?').join(', ')})`)
			.bind(...chunk)
			.all<{ id: string; plan: string | null }>()
		for (const r of results) stored.set(r.id, r.plan)
	}
	return new Map(ids.map((id) => [id, resolve(id, stored.get(id))]))
}

/** The plan of every team that has one set, for the daily cleanup; a team that isn't listed is on the trial. Null when the server enforces none. */
export async function setPlans(env: Env): Promise<Map<string, Plan> | null> {
	if (!plansEnforced(env)) return null
	const { results } = await env.CONTROL.prepare('SELECT id, plan FROM teams WHERE plan IS NOT NULL').all<{ id: string; plan: string }>()
	return new Map(results.map((r) => [r.id, resolve(r.id, r.plan)]))
}

/** A site's retention limits: the server's, within its team's plan when the server enforces plans. */
export function siteRetention(env: Env, plan: Plan | null): RetentionLimits {
	return planRetention(serverRetention(env), plan)
}

// ---------------------------------------------------------------- events a month

/**
 * A team's events this UTC month, as a subquery on the team id column `team`, with the first
 * day of the month (core utcDay) bound to its `?`: the usage_daily rows of its sites from the month's first
 * day. The sites_team index finds the sites, and the (site_id, day) key reads at most a
 * month of rows for each, so the query reads about sites × (day of month + 1) rows. The
 * sites are the team's now: a site moved in mid-month brings its month's events with it.
 */
export const monthEvents = (team: string) => `SELECT COALESCE(SUM(u.events), 0) FROM sites s JOIN usage_daily u ON u.site_id = s.id AND u.day >= ? WHERE s.team_id = ${team}`

interface Standing {
	name: string
	plan: string | null
	trial_ends_at: number | null
	/** events this month */
	events: number
}

const standingKey = (teamId: string) => `team-month:${teamId}:`

/** A team's plan, trial and events in `month`, in one query, kept in the isolate cache for a minute. */
function standing(env: Env, teamId: string, month: number): Promise<Standing | null> {
	return cached(`${standingKey(teamId)}${month}`, () =>
		env.CONTROL.prepare(`SELECT name, plan, trial_ends_at, (${monthEvents('teams.id')}) AS events FROM teams WHERE id = ?`)
			.bind(utcDay(monthStart(month)), teamId)
			.first<Standing>(),
	)
}

/**
 * Whether the edge drops a beacon of a site of `teamId` at `ts`: with plans on, the team
 * has no plan and no trial running, or its events this month reached OVERAGE of its plan's.
 * A cache hit reads nothing; a miss is one query per team and isolate a minute. A new month
 * is a new cache entry, so its count starts at once.
 */
export async function planStops(env: Env, teamId: string, ts: number): Promise<boolean> {
	if (!plansEnforced(env)) return false
	const s = await standing(env, teamId, utcMonth(ts))
	if (!s) return false
	return teamStopped(planState(s.plan, s.trial_ends_at, ts), teamPlan(s.plan), s.events)
}

/** The highest level emailed to a team for a month and plan, read through the isolate cache, so a month past a level costs no write per batch. */
const emailedKey = (teamId: string, month: number, plan: string) => `plan-emailed:${teamId}:${month}:${plan}`
const emailed = (env: Env, teamId: string, month: number, plan: string) =>
	cached(emailedKey(teamId, month, plan), async () =>
		(await env.CONTROL.prepare('SELECT MAX(level) AS level FROM plan_notices WHERE team_id = ? AND month = ? AND plan = ?').bind(teamId, month, plan).first<number | null>('level')) ?? 0,
	)

/**
 * After a queue batch is counted: the monthly emails of the teams that own `siteIds`. At
 * 80% and 100% of the plan's events the team's owners, admins and billing members get one
 * email each, and one more when the month reaches the stop (OVERAGE) and tracking pauses.
 * `plan_notices` keeps what was sent per team, month and plan, so each goes out once, and
 * a move to another plan starts its own. A team on the trial counts against the trial
 * plan; a lapsed team gets none. Reads each team's month fresh: one query per team per batch.
 */
export async function checkMonths(env: Env, siteIds: Iterable<string>, now = Date.now()) {
	if (!plansEnforced(env)) return
	// team id -> a site of it, for the link
	const teams = new Map<string, string>()
	for (const id of new Set(siteIds)) {
		const site = await getSite(env, id)
		if (site && !teams.has(site.team_id)) teams.set(site.team_id, site.id)
	}
	const month = utcMonth(now)
	for (const [teamId, siteId] of teams) {
		invalidate(standingKey(teamId))
		const s = await standing(env, teamId, month)
		if (!s) continue
		const state = planState(s.plan, s.trial_ends_at, now)
		if (state === 'lapsed') continue
		const plan = teamPlan(s.plan)
		const levels = eventLevels(plan, s.events)
		if (!levels.length || levels[levels.length - 1] <= (await emailed(env, teamId, month, plan.id))) continue
		const mark = env.CONTROL.prepare('INSERT OR IGNORE INTO plan_notices (team_id, month, plan, level, sent_at) VALUES (?, ?, ?, ?, ?)')
		const res = await env.CONTROL.batch(levels.map((level) => mark.bind(teamId, month, plan.id, level, now)))
		invalidate(emailedKey(teamId, month, plan.id))
		// one email for the highest new level: a batch that crosses two sends one
		const fresh = levels.filter((_, i) => (res[i].meta.changes ?? 0) > 0)
		if (!fresh.length) continue
		const level = fresh[fresh.length - 1]
		console.log(JSON.stringify({ msg: level > 100 ? 'plan events stopped' : 'plan events warning', team: teamId, month, plan: plan.id, level, events: s.events }))
		try {
			await emailMonth(env, teamId, siteId, { ...s, trial: state === 'trial' }, plan, level, month)
		} catch (err) {
			// the events are written; a lost email must not replay the batch
			console.error(JSON.stringify({ msg: 'plan email failed', team: teamId, error: String(err) }))
		}
	}
}

const count = (n: number) => n.toLocaleString('en')

async function emailMonth(env: Env, teamId: string, siteId: string, s: Standing & { trial: boolean }, plan: Plan, level: number, month: number) {
	const { results } = await env.CONTROL.prepare("SELECT u.email FROM team_members m JOIN users u ON u.id = m.user_id WHERE m.team_id = ? AND m.role IN ('owner', 'admin', 'billing')")
		.bind(teamId)
		.all<{ email: string }>()
	const until = new Date(monthStart(month + 1)).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })
	const of = s.trial ? `the free trial's ${count(plan.events)} events` : `the ${plan.name} plan's ${count(plan.events)} events`
	const stop = `${count(eventStop(plan))} events, ${Math.round(OVERAGE * 100)}%`
	const room = PLANS.some((p) => p.events > plan.events) ? 'A bigger plan gives the team more room.' : `For more events, email ${SUPPORT_EMAIL}.`
	const used = `The sites of ${s.name} recorded ${count(s.events)} events this month`
	const msg =
		level > 100
			? {
					subject: `Tracking for ${s.name} is paused until ${until}`,
					detail: `${used}, ${level}% of ${of}. New pageviews and events are not recorded until ${until}, 00:00 UTC, or until the team moves to a plan with room. Payments are still recorded, and the stats so far stay readable.`,
				}
			: level >= 100
				? { subject: `${s.name} has used this month's events`, detail: `${used}, all of ${of}. Tracking carries on until ${stop}, then pauses until ${until}. ${room}` }
				: { subject: `${s.name} has used ${level}% of this month's events`, detail: `${used}, ${level}% of ${of}. At ${stop}, tracking pauses until ${until}. ${room}` }
	const notice = renderNotice({ label: 'plan', ...msg, cta: 'See the plan', link: `${env.PUBLIC_URL || 'https://misomoon.com'}/?site=${encodeURIComponent(siteId)}&view=settings&tab=team` })
	for (const { email } of results) await sendEmail(env, email, notice)
}
