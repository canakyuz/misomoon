import { OVERAGE, periodText, type TeamPlanInfo } from '@misomoon/core/plans'

/** 25 months: the longest the CNIL lets audience measurement keep data without consent (docs/compliance.md). */
export const CNIL_DAYS = 761

/** The periods Settings > Install > Privacy offers for Keep stats for, in days. */
export const RETENTION: [number, string][] = [
	[30, '30 days'],
	[90, '90 days'],
	[182, '6 months'],
	[395, '13 months'],
	[730, '2 years'],
	[CNIL_DAYS, '25 months'],
	[1095, '3 years'],
	[1825, '5 years'],
]

/** A retention period in the words the picker uses. */
export const span = (days: number) => RETENTION.find(([d]) => d === days)?.[1] ?? periodText(days)

/** The rows of the plan card in Settings > Team: what the team's plan includes, and the sites it uses. */
export function planFacts(plan: TeamPlanInfo): [label: string, value: string][] {
	const most = span(plan.retention_days)
	return [
		['Plan', plan.state === 'plan' ? plan.name : plan.trial ? `Trial, ${plan.name} limits` : 'None'],
		['Sites', plan.sites === null ? `${plan.sites_used}, no limit` : `${plan.sites_used} of ${plan.sites}`],
		['Keeps stats for', plan.retention_default_days < plan.retention_days ? `${span(plan.retention_default_days)} by default, up to ${most}` : `Up to ${most}`],
		['Events a month', `${plan.events.toLocaleString('en')} included`],
	]
}

/** Whether the team can add no more sites under its plan. A team moved to a smaller plan keeps its sites. */
export const atSiteLimit = (plan: TeamPlanInfo) => plan.sites !== null && plan.sites_used >= plan.sites

const DAY = 86_400_000
const count = (n: number) => n.toLocaleString('en')
/** A day as the plan card and banner say it, in UTC, which is when trials and months turn: "1 November". */
export const dayText = (ts: number) => new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })
const stopShare = `${Math.round(OVERAGE * 100)}%`

/** Whole days of trial left, counting today's part: 1 on its last day. Null when the team isn't on the trial. */
export function trialDaysLeft(plan: TeamPlanInfo, now = Date.now()): number | null {
	if (!plan.trial || plan.trial_ends_at === null) return null
	return Math.max(1, Math.ceil((plan.trial_ends_at - now) / DAY))
}

const inDays = (days: number) => (days === 1 ? 'within a day' : `in ${days} days`)

export interface PlanLine {
	tone: 'ok' | 'warn' | 'bad'
	text: string
}

/** The plan card's line about the trial: days left, or that it ended. Null for a team with a plan. */
export function trialLine(plan: TeamPlanInfo, now = Date.now()): PlanLine | null {
	if (plan.state === 'plan') return null
	const left = trialDaysLeft(plan, now)
	if (left !== null) return { tone: left <= 2 ? 'warn' : 'ok', text: `Free trial: ${left === 1 ? 'ends within a day' : `${left} days left`}, until ${dayText(plan.trial_ends_at!)}.` }
	if (plan.trial_ends_at !== null) return { tone: 'bad', text: `Trial ended on ${dayText(plan.trial_ends_at)}. The team's sites record nothing until it has a plan. Their stats stay readable.` }
	return { tone: 'bad', text: "No plan. Each person gets one free trial, on the first team they create, so this team starts without one. Its sites record nothing until it has a plan." }
}

/** The events meter of the plan card: this month's events against the plan's, and where the month stops. */
export function eventsMeter(plan: TeamPlanInfo): { label: string; share: number; stopAt: number; tone: 'ok' | 'warn' | 'bad'; note: string | null } {
	const share = plan.events ? plan.events_used / plan.events : 0
	const tone = plan.stopped && !plan.lapsed ? 'bad' : share >= 0.8 ? 'warn' : 'ok'
	const until = dayText(plan.month_ends_at)
	const note = plan.lapsed
		? null
		: plan.stopped
			? `Tracking is paused until ${until}: this month reached ${count(plan.events_stop)} events, ${stopShare} of the plan. A plan with more events starts it again within a minute.`
			: share >= 1
				? `Past the plan's events. Tracking carries on until ${count(plan.events_stop)} events (${stopShare}), then pauses until ${until}.`
				: null
	return { label: `${count(plan.events_used)} of ${count(plan.events)} events this month`, share, stopAt: plan.events ? plan.events_stop / plan.events : OVERAGE, tone, note }
}

/** The banner across the dashboard for the open site's team, or null: its trial ends within 2 days, it has no plan, or its month passed the plan's events. */
export function planBanner(plan: TeamPlanInfo, now = Date.now()): PlanLine | null {
	if (plan.lapsed)
		return {
			tone: 'bad',
			text: plan.trial_ends_at !== null ? "The free trial has ended, so this team's sites record nothing. Pick a plan to start again." : "This team has no plan, so its sites record nothing. Pick a plan to start.",
		}
	if (plan.stopped) return { tone: 'bad', text: `Tracking is paused until ${dayText(plan.month_ends_at)}: this month's events reached ${stopShare} of ${plan.trial ? "the free trial's" : `the ${plan.name} plan's`}.` }
	if (plan.events_used >= plan.events) return { tone: 'warn', text: `This month's events passed the ${count(plan.events)} the plan includes. Tracking pauses at ${count(plan.events_stop)}.` }
	const left = trialDaysLeft(plan, now)
	if (left !== null && plan.trial_ends_at! - now <= 2 * DAY) return { tone: 'warn', text: `The free trial ends ${inDays(left)}, on ${dayText(plan.trial_ends_at!)}. Pick a plan to keep tracking.` }
	return null
}
