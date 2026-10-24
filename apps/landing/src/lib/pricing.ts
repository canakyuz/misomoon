// misomoon Cloud plans, as misomoon.com prints them. The numbers come from
// @misomoon/core/plans, the list the API enforces, and this file adds the words around
// them. The home page, /pricing, the llms files, the structured data and the comparison
// pages print them; docs/cloud.md links to /pricing. Every plan has every feature. Plans
// differ in events, sites and how long stats are kept. There is no free plan: every plan
// starts with a trial.
import { PLANS as CLOUD_PLANS, TRIAL_PLAN, type Plan as CloudPlan, type PlanId } from '@misomoon/core/plans'

export interface Plan extends CloudPlan {
	/** who the plan is for, on its card */
	who: string
	/** the plan the cards and the copy point people to */
	popular?: boolean
}

/** The landing's own copy for each plan. A plan added to core fails the type check until it has some. */
const COPY: Record<PlanId, Pick<Plan, 'who' | 'popular'>> = {
	starter: { who: 'One small site: a blog, a portfolio, or a side project.' },
	growth: { who: 'Most sites, and anyone who runs more than one: a shop, a SaaS, or a few projects.', popular: true },
	scale: { who: 'Busy sites, and agencies running many client sites.' },
}

export const PLANS: Plan[] = CLOUD_PLANS.map((p) => ({ ...p, ...COPY[p.id] }))

export const TRIAL_DAYS = 7
/** The plan whose limits the trial has. */
export const TRIAL_LIMITS: Plan = PLANS.find((p) => p.id === TRIAL_PLAN)!
/** The label of every sign-up button. */
export const CTA = 'Start free trial'
/** "a 7-day free trial, no card needed" */
export const TRIAL = `a ${TRIAL_DAYS}-day free trial, no card needed`

/** What a plan counts. Printed once under the cards, and as the answer to "What counts as an event?". */
export const EVENT =
	'An event is a pageview or a custom event, such as a signup, a download, or a click on an outbound link. A plan counts the events of all your sites together. Engaged time and scroll depth are added to their pageview and don’t count.'

/** How the plans differ, for the places that used to say they differ in one number only. */
export const DIFFER = 'Plans differ in how many events they count, how many sites they cover, and how long they keep stats.'

/** What every plan has, in the order the pricing cards list it. */
export const EVERY_PLAN = [
	'Every feature, including revenue, click maps, forms, errors and Web Vitals',
	'Funnels, goals, paths and AI assistant traffic',
	'Email reports, alerts and shared dashboards',
	'Teams and guest access',
	'The MCP server and the REST API',
	'No cookies and no stored IP addresses',
	'The EU, the US or Asia-Pacific for each site’s data',
	'A CSV export of any period',
]

export const SUPPORT = 'support@misomoon.com'

/** "100k", "1M": events as the cards print them. */
export function short(n: number): string {
	if (n >= 1_000_000) return `${n / 1_000_000}M`
	return `${n / 1_000}k`
}

/** "100,000", "1 million": events in a sentence. */
export function words(n: number): string {
	if (n >= 1_000_000) return `${n / 1_000_000} million`
	return new Intl.NumberFormat('en').format(n)
}

/** "1 site", "unlimited sites": a plan's sites in a sentence. */
export function sites(n: number | null): string {
	if (n === null) return 'unlimited sites'
	return n === 1 ? '1 site' : `${n} sites`
}

/** "2 years", or "25 months" for a retention that isn't whole years. Rounded down, so it never overstates. */
export function years(days: number): string {
	if (days % 365 === 0) return days === 365 ? '1 year' : `${days / 365} years`
	const months = Math.floor(days / (365 / 12))
	return months === 1 ? '1 month' : `${months} months`
}

/** "Starter is $5 a month for 100,000 events on 1 site, Growth is $14 for 1 million events on unlimited sites, and ..." */
export function priceSentence(plans: Plan[] = PLANS): string {
	const parts = plans.map((p, i) => `${p.name} is $${p.price}${i === 0 ? ' a month' : ''} for ${words(p.events)} events on ${sites(p.sites)}`)
	return `${parts.slice(0, -1).join(', ')}, and ${parts.at(-1)}.`
}

/** The plans in runs that keep stats for the same time: [[Starter], [Growth, Scale]]. */
function byRetention(plans: Plan[]): Plan[][] {
	const runs: Plan[][] = []
	for (const p of plans) {
		const last = runs.at(-1)
		if (last && last[0].retentionDays === p.retentionDays) last.push(p)
		else runs.push([p])
	}
	return runs
}

const names = (plans: Plan[]) => (plans.length === 1 ? plans[0].name : `${plans.slice(0, -1).map((p) => p.name).join(', ')} and ${plans.at(-1)!.name}`)
const list = (parts: string[]) => (parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')}, and ${parts.at(-1)}`)

/** "Starter keeps stats for 2 years, and Growth and Scale keep them for 3 years." */
export function keepSentence(plans: Plan[] = PLANS): string {
	const parts = byRetention(plans).map((run, i) => `${names(run)} ${run.length === 1 ? 'keeps' : 'keep'} ${i === 0 ? 'stats' : 'them'} for ${years(run[0].retentionDays)}`)
	return `${list(parts)}.`
}

/** "2 years on Starter, 3 years on Growth and Scale": retention by plan, for a table cell. */
export function keptByPlan(plans: Plan[] = PLANS): string {
	return byRetention(plans)
		.map((run) => `${years(run[0].retentionDays)} on ${names(run)}`)
		.join(', ')
}

/** "100,000 events a month on 1 site, stats kept 2 years": one plan's limits in a line. */
export function summary(p: Plan): string {
	return `${words(p.events)} events a month on ${sites(p.sites)}, stats kept ${years(p.retentionDays)}`
}

/**
 * What a plan adds to the one below it, for its card: "10 times the events, unlimited sites,
 * and stats kept 1 year longer, for $9 more." Only the limits that grow are named.
 */
export function step(p: Plan, below: Plan): string {
	const gains: string[] = []
	if (p.events > below.events) gains.push(`${words(p.events / below.events)} times the events`)
	if (below.sites !== null && (p.sites === null || p.sites > below.sites)) gains.push(sites(p.sites))
	if (p.retentionDays > below.retentionDays) gains.push(`stats kept ${years(p.retentionDays - below.retentionDays)} longer`)
	const more = `$${p.price - below.price} more`
	return gains.length ? `${list(gains)}, for ${more}.` : `${more}.`
}

/** The lowest monthly price, for "from $5 a month". */
export const FROM = Math.min(...PLANS.map((p) => p.price))
/** The largest plan's events, for "more than 5 million". */
export const LARGEST = Math.max(...PLANS.map((p) => p.events))
/** The longest any plan keeps stats, in days, for "up to 3 years of history". */
export const LONGEST_KEPT = Math.max(...PLANS.map((p) => p.retentionDays))

/** The dashboard opens on its sign-up form with `?signup`. */
export const signupUrl = (appUrl: string) => `${appUrl}/?signup`
