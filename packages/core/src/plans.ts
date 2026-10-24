// misomoon Cloud plans: the one list the API enforces and the landing prints. A plan
// counts the events of all a team's sites together: pageviews and custom events, not
// engagement beacons. Self-hosted servers enforce no plan.
import { storeRetention, type RetentionLimits } from './privacy'

export type PlanId = 'starter' | 'growth' | 'scale'

export interface Plan {
	id: PlanId
	name: string
	/** US dollars a month */
	price: number
	/** pageviews and custom events a month, across all the team's sites */
	events: number
	/** the longest a site keeps its events and visits, in days */
	retentionDays: number
	/** sites the team may have; null for no limit */
	sites: number | null
}

export const PLANS: readonly Plan[] = [
	{ id: 'starter', name: 'Starter', price: 5, events: 100_000, retentionDays: 730, sites: 1 },
	{ id: 'growth', name: 'Growth', price: 14, events: 1_000_000, retentionDays: 1095, sites: null },
	{ id: 'scale', name: 'Scale', price: 49, events: 5_000_000, retentionDays: 1095, sites: null },
]

/** What a team on the trial, with no plan picked yet, may do. */
export const TRIAL_PLAN: PlanId = 'growth'

/** Days of free trial. Each person gets one, on the first team they create. */
export const TRIAL_DAYS = 7

/**
 * How far past its plan's monthly events a team keeps recording: at 1.25, the team's
 * beacons are dropped at the edge from 125% of the events until the next UTC month, or
 * until the team moves to a plan with room.
 */
export const OVERAGE = 1.25

/** The shares of a plan's monthly events at which the team's owners, admins and billing members get one email each month. */
export const EVENT_WARNINGS = [0.8, 1] as const

/** The plan with this id, or null for anything else. */
export function planById(id: unknown): Plan | null {
	return PLANS.find((p) => p.id === id) ?? null
}

/** The limits a team works under: its plan, or the trial's when it has none. */
export function teamPlan(id: string | null | undefined): Plan {
	return planById(id) ?? planById(TRIAL_PLAN)!
}

// ---------------------------------------------------------------- enforcement

/** Where a team asks for a plan or a change of plan. Paid plans are set up by email. */
export const SUPPORT_EMAIL = 'support@misomoon.com'

/** The `code` of the API's 403 for a team at its plan's site limit, and for a retention_days longer than its plan keeps. */
export const PLAN_SITE_LIMIT = 'plan_site_limit'
export const PLAN_RETENTION_LIMIT = 'plan_retention_limit'
/** The `code` of the API's 403 for adding a site to, or moving one into, a lapsed team: no plan, and no trial running. */
export const PLAN_REQUIRED = 'plan_required'

/**
 * Where a team stands. `plan`: it has a plan. `trial`: no plan, and its free trial runs
 * until `trial_ends_at`. `lapsed`: no plan and no trial running. A lapsed team's sites
 * record nothing and it can't add or take in a site; its stats stay readable.
 */
export type PlanState = 'plan' | 'trial' | 'lapsed'

/**
 * The state of a team whose `teams.plan` is `stored` and whose trial ends at `trialEndsAt`.
 * An id that is no plan counts as none. A NULL `trial_ends_at` is no trial, so a team row
 * made without one never gets a free trial by accident.
 */
export function planState(stored: string | null | undefined, trialEndsAt: number | null | undefined, now: number): PlanState {
	if (planById(stored)) return 'plan'
	return trialEndsAt != null && trialEndsAt > now ? 'trial' : 'lapsed'
}

/** When the trial of a team created at `createdAt` ends: TRIAL_DAYS later for the creator's first trial, else at once (no trial). */
export function trialEnd(createdAt: number, firstTrial: boolean): number {
	return firstTrial ? createdAt + TRIAL_DAYS * 86_400_000 : createdAt
}

/** The plan a team works under, and where it stands. */
export interface PlanTerms {
	plan: Plan
	state: PlanState
}

/** The UTC calendar month of `ts`, as months since January 1970. A plan's events count per month. */
export function utcMonth(ts: number): number {
	const d = new Date(ts)
	return d.getUTCFullYear() * 12 + d.getUTCMonth() - 1970 * 12
}

/** When a utcMonth starts, in ms. */
export function monthStart(month: number): number {
	return Date.UTC(1970, month, 1)
}

/** The events at which a team's month stops recording: OVERAGE of its plan's. */
export const eventStop = (plan: Plan) => Math.round(plan.events * OVERAGE)

/** Whether a team drops its beacons: lapsed, or `used` events this month reached the stop of the plan it works under. */
export function teamStopped(state: PlanState, plan: Plan, used: number): boolean {
	return state === 'lapsed' || used >= eventStop(plan)
}

/**
 * The emails a team's month has earned at `used` events: the EVENT_WARNINGS it reached, and
 * the stop, in percent of the plan's events (80, 100, 125). Each is sent once a month.
 */
export function eventLevels(plan: Plan, used: number): number[] {
	const levels = EVENT_WARNINGS.filter((share) => used >= plan.events * share).map((share) => Math.round(share * 100))
	return used >= eventStop(plan) ? [...levels, Math.round(OVERAGE * 100)] : levels
}

/** The API's message for adding a site to, or moving one into, a lapsed team. */
export function planRequiredMessage(moving = false): string {
	return moving ? 'The team you picked needs a plan to take in a site. Choose one in its Settings > Team.' : 'This team needs a plan to add a site. Choose one in Settings > Team.'
}

/**
 * Whether a server enforces plans: PLANS=on, which only misomoon Cloud sets. Anything else,
 * unset included, is off, so a self-hosted server has no plan limits.
 */
export function plansOn(value: string | undefined): boolean {
	return value?.trim().toLowerCase() === 'on'
}

/** Whether a team on `plan` that has `used` sites may add one more. Guest sites are other teams' sites and don't count. */
export function roomForSite(plan: Plan, used: number): boolean {
	return plan.sites === null || used < plan.sites
}

/** Days as people say them: whole years as years, anything else in days. */
export function periodText(days: number): string {
	if (days > 0 && days % 365 === 0) return days === 365 ? '1 year' : `${days / 365} years`
	return days === 1 ? '1 day' : `${days.toLocaleString('en')} days`
}

const sitesText = (n: number) => (n === 1 ? '1 site' : `${n.toLocaleString('en')} sites`)

/** The API's message for a team at its plan's site limit. `moving`: a site moved into the team rather than added to it. */
export function siteLimitMessage(plan: Plan, moving = false): string {
	const more = PLANS.some((p) => p.sites === null || p.sites > (plan.sites ?? Infinity))
	const team = moving ? 'The team you picked' : 'This team'
	const upgrade = more ? ` To ${moving ? 'move this site there' : 'add another site'}, email ${SUPPORT_EMAIL} to upgrade.` : ` No plan includes more; email ${SUPPORT_EMAIL} to talk about it.`
	return `${team} is on the ${plan.name} plan, which includes ${sitesText(plan.sites ?? 0)}.${upgrade}`
}

/** The API's message for a retention_days longer than the team's plan keeps. */
export function retentionLimitMessage(plan: Plan): string {
	const more = PLANS.some((p) => p.retentionDays > plan.retentionDays)
	const upgrade = more ? ` To keep them longer, email ${SUPPORT_EMAIL} to upgrade.` : ' No plan keeps them longer.'
	return `The ${plan.name} plan keeps stats for up to ${periodText(plan.retentionDays)} (${plan.retentionDays} days).${upgrade}`
}

/**
 * A site's retention limits under a plan. The longest is the smaller of the server's
 * (RETENTION_DAYS, 0 for none) and the plan's. A site that sets none keeps the server's
 * default (RETENTION_DEFAULT_DAYS, 25 months on misomoon Cloud) or the plan's longest,
 * whichever is shorter, so a new site stays inside the CNIL's 25 months until its owner
 * picks longer. With no plan (a server that enforces none), the server's limits.
 */
export function planRetention(server: RetentionLimits, plan: Plan | null): RetentionLimits {
	if (!plan) return server
	const max = server.max > 0 ? Math.min(server.max, plan.retentionDays) : plan.retentionDays
	return { max, default: server.default > 0 ? Math.min(server.default, max) : max }
}

/**
 * storeRetention under a plan: the column value for a site's retention_days, or an error.
 * `plan: true` marks a value refused because it is longer than the plan keeps. A value the
 * site saved already stays, even past a plan it moved down to: the cleanup applies the
 * plan's limit anyway, and saving another setting must not fail on it.
 */
export function storePlanRetention(days: unknown, saved: number | null, server: RetentionLimits, plan: Plan | null): number | null | { error: string; plan?: true } {
	const limits = planRetention(server, plan)
	const value = storeRetention(days, limits.max)
	if (!plan || value === null || typeof value === 'number') return value
	if (typeof days === 'number' && Number.isInteger(days) && days > limits.max && limits.max === plan.retentionDays) {
		return days === saved ? saved : { error: retentionLimitMessage(plan), plan: true }
	}
	return value
}

/** What GET /api/v1/me says about a team's plan, on a server that enforces plans. */
export interface TeamPlanInfo {
	/** the plan the team works under: its own, or TRIAL_PLAN without one */
	id: PlanId
	name: string
	/** plan: the team has one. trial: none, and the free trial runs. lapsed: none, and no trial running */
	state: PlanState
	/** no plan, and the free trial runs, with TRIAL_PLAN's limits. An id that is not a plan counts as none. */
	trial: boolean
	/** when the free trial ends or ended, in ms; null for a team that never had one */
	trial_ends_at: number | null
	/** no plan and no trial running: the team's sites record nothing, and it can't add or take in a site */
	lapsed: boolean
	/** pageviews and custom events a month the plan includes, across the team's sites */
	events: number
	/** pageviews and custom events this UTC month, across the team's sites */
	events_used: number
	/** where the month stops recording: OVERAGE of `events` */
	events_stop: number
	/** the team's beacons are dropped: it lapsed, or the month reached events_stop */
	stopped: boolean
	/** when the next UTC month starts, in ms, and with it a new count */
	month_ends_at: number
	/** the longest a site of the team may keep its stats: the plan's, within the server's RETENTION_DAYS */
	retention_days: number
	/** what a site of the team keeps when it sets none: the server's default, at most retention_days */
	retention_default_days: number
	/** sites the team may have; null for no limit */
	sites: number | null
	/** sites the team has; a plan change to fewer keeps them all */
	sites_used: number
}

/** The columns of a team that planInfo reads, and what it counted. */
export interface TeamPlanRow {
	/** teams.plan */
	plan: string | null
	/** teams.trial_ends_at: equal to created_at for a team that got no trial */
	trial_ends_at: number | null
	created_at: number
	/** the team's sites */
	sites_used: number
	/** the team's events this UTC month (usage_daily.events) */
	events_used: number
}

/** The plan summary of a team at `now`. */
export function planInfo(team: TeamPlanRow, server: RetentionLimits, now = Date.now()): TeamPlanInfo {
	const plan = teamPlan(team.plan)
	const retention = planRetention(server, plan)
	const state = planState(team.plan, team.trial_ends_at, now)
	return {
		id: plan.id,
		name: plan.name,
		state,
		trial: state === 'trial',
		trial_ends_at: team.trial_ends_at != null && team.trial_ends_at > team.created_at ? team.trial_ends_at : null,
		lapsed: state === 'lapsed',
		events: plan.events,
		events_used: team.events_used,
		events_stop: eventStop(plan),
		stopped: teamStopped(state, plan, team.events_used),
		month_ends_at: monthStart(utcMonth(now) + 1),
		retention_days: retention.max,
		retention_default_days: retention.default,
		sites: plan.sites,
		sites_used: team.sites_used,
	}
}
