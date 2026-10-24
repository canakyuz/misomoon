import { describe, expect, it } from 'vite-plus/test'
import {
	DAY,
	EVENT_WARNINGS,
	eventLevels,
	eventStop,
	monthStart,
	OVERAGE,
	periodText,
	planById,
	planInfo,
	PLAN_REQUIRED,
	planRequiredMessage,
	planRetention,
	PLANS,
	plansOn,
	planState,
	retentionLimitMessage,
	roomForSite,
	siteLimitMessage,
	storePlanRetention,
	SUPPORT_EMAIL,
	teamPlan,
	teamStopped,
	TRIAL_DAYS,
	trialEnd,
	TRIAL_PLAN,
	utcMonth,
	type Plan,
	type TeamPlanInfo,
	type TeamPlanRow,
} from '../src'

// The values come from PLANS, so a price or limit change needs no test change.
const plan = (id: string) => planById(id)!
const starter = plan('starter')
const growth = plan('growth')
const scale = plan('scale')
const longest = Math.max(...PLANS.map((p) => p.retentionDays))

describe('plans', () => {
	it('falls back to the trial plan for a team with no plan or an id that is not a plan', () => {
		expect(TRIAL_PLAN).toBe('growth')
		for (const id of [null, undefined, '', 'enterprise', 'Starter', 'growth ']) expect(teamPlan(id)).toBe(growth)
		for (const p of PLANS) expect(teamPlan(p.id)).toBe(p)
	})

	it('turns enforcement on only for PLANS=on', () => {
		for (const on of ['on', 'ON', ' on ']) expect(plansOn(on)).toBe(true)
		for (const off of [undefined, '', 'off', '1', 'true', 'yes', 'onn']) expect(plansOn(off)).toBe(false)
	})

	it('leaves room for a site under the limit, none at it or past it, and always room without a limit', () => {
		expect(starter.sites).toBe(1)
		expect(roomForSite(starter, 0)).toBe(true)
		expect(roomForSite(starter, 1)).toBe(false)
		// a team moved down to Starter keeps its sites and can add none
		expect(roomForSite(starter, 3)).toBe(false)
		for (const p of [growth, scale]) expect(roomForSite(p, 10_000)).toBe(true)
	})

	it('says periods the way people do', () => {
		expect(periodText(365)).toBe('1 year')
		expect(periodText(730)).toBe('2 years')
		expect(periodText(1095)).toBe('3 years')
		expect(periodText(761)).toBe('761 days')
		expect(periodText(1)).toBe('1 day')
		expect(periodText(3650)).toBe('10 years')
	})
})

describe('plan messages', () => {
	it('names the plan, its site limit, and the support email', () => {
		expect(siteLimitMessage(starter)).toBe(`This team is on the Starter plan, which includes 1 site. To add another site, email ${SUPPORT_EMAIL} to upgrade.`)
		expect(siteLimitMessage(starter, true)).toBe(`The team you picked is on the Starter plan, which includes 1 site. To move this site there, email ${SUPPORT_EMAIL} to upgrade.`)
		expect(SUPPORT_EMAIL).toBe('support@misomoon.com')
	})

	it('offers an upgrade for retention only when a plan keeps stats longer', () => {
		for (const p of PLANS) {
			const msg = retentionLimitMessage(p)
			expect(msg.startsWith(`The ${p.name} plan keeps stats for up to ${periodText(p.retentionDays)} (${p.retentionDays} days).`)).toBe(true)
			expect(msg.includes(SUPPORT_EMAIL)).toBe(p.retentionDays < longest)
		}
	})
})

describe('retention under a plan', () => {
	const cloud = { max: 1825, default: 761 }
	const unlimited = { max: 0, default: 0 }

	it("caps the server's longest at the plan's, and keeps the server's default within it", () => {
		for (const p of PLANS) {
			const most = Math.min(1825, p.retentionDays)
			expect(planRetention(cloud, p)).toEqual({ max: most, default: Math.min(761, most) })
			// RETENTION_DEFAULT_DAYS unset follows RETENTION_DAYS, so the default is the plan's longest
			expect(planRetention({ max: 1825, default: 1825 }, p)).toEqual({ max: most, default: most })
			expect(planRetention(unlimited, p)).toEqual({ max: p.retentionDays, default: p.retentionDays })
		}
		// Starter keeps less than 25 months, so its default is its longest
		expect(planRetention(cloud, starter)).toEqual({ max: starter.retentionDays, default: Math.min(761, starter.retentionDays) })
		// a server that keeps less than the plan wins
		expect(planRetention({ max: 90, default: 30 }, scale)).toEqual({ max: 90, default: 30 })
	})

	it("keeps the server's limits when no plan applies", () => {
		expect(planRetention(cloud, null)).toBe(cloud)
		expect(planRetention(unlimited, null)).toBe(unlimited)
	})

	it('refuses a setting past the plan with the plan message, and accepts what the plan allows', () => {
		expect(storePlanRetention(starter.retentionDays, null, cloud, starter)).toBe(starter.retentionDays)
		expect(storePlanRetention(30, null, cloud, starter)).toBe(30)
		expect(storePlanRetention(null, 395, cloud, starter)).toBeNull()
		expect(storePlanRetention(starter.retentionDays + 1, null, cloud, starter)).toEqual({ error: retentionLimitMessage(starter), plan: true })
		// past the server's longest too: still the plan's limit, since the plan is the smaller one
		expect(storePlanRetention(3650, null, cloud, growth)).toEqual({ error: retentionLimitMessage(growth), plan: true })
	})

	it('keeps a value saved under an earlier plan, and refuses a change to another value past the plan', () => {
		expect(storePlanRetention(growth.retentionDays, growth.retentionDays, cloud, starter)).toBe(growth.retentionDays)
		expect(storePlanRetention(growth.retentionDays - 1, growth.retentionDays, cloud, starter)).toEqual({ error: retentionLimitMessage(starter), plan: true })
	})

	it('gives the ordinary error for a value that is not whole days, too short, or past a server that keeps less', () => {
		const range = (most: number) => ({ error: `retention_days is a whole number of days from 30 to ${most}, or null` })
		expect(storePlanRetention(7, null, cloud, starter)).toEqual(range(starter.retentionDays))
		expect(storePlanRetention(45.5, null, cloud, growth)).toEqual(range(growth.retentionDays))
		expect(storePlanRetention('730', null, cloud, growth)).toEqual(range(growth.retentionDays))
		expect(storePlanRetention(200, null, { max: 90, default: 90 }, growth)).toEqual(range(90))
	})

	it('is storeRetention against the server when no plan applies', () => {
		expect(storePlanRetention(1825, null, cloud, null)).toBe(1825)
		expect(storePlanRetention(1826, 1826, cloud, null)).toEqual({ error: 'retention_days is a whole number of days from 30 to 1825, or null' })
		expect(storePlanRetention(3650, null, unlimited, null)).toBe(3650)
	})
})

describe('the trial and lapsing', () => {
	const NOW = Date.UTC(2026, 9, 10, 12)

	it('gives a first team TRIAL_DAYS of trial, and any later team none', () => {
		expect(TRIAL_DAYS).toBe(7)
		expect(trialEnd(NOW, true)).toBe(NOW + 7 * DAY)
		expect(trialEnd(NOW, false)).toBe(NOW)
	})

	it('works under a plan, else the trial while it runs, else lapses', () => {
		for (const p of PLANS) expect(planState(p.id, null, NOW)).toBe('plan')
		expect(planState('starter', NOW - DAY, NOW)).toBe('plan')
		expect(planState(null, NOW + 1, NOW)).toBe('trial')
		expect(planState(null, NOW, NOW)).toBe('lapsed')
		expect(planState(null, NOW - 1, NOW)).toBe('lapsed')
		// no trial_ends_at is no trial, and an id that is not a plan is no plan
		expect(planState(null, null, NOW)).toBe('lapsed')
		expect(planState('enterprise', NOW + DAY, NOW)).toBe('trial')
		expect(planState('enterprise', NOW - DAY, NOW)).toBe('lapsed')
	})

	it('names the plan_required code and points to choosing a plan', () => {
		expect(PLAN_REQUIRED).toBe('plan_required')
		expect(planRequiredMessage()).toBe('This team needs a plan to add a site. Choose one in Settings > Team.')
		expect(planRequiredMessage(true)).toBe('The team you picked needs a plan to take in a site. Choose one in its Settings > Team.')
	})
})

describe('events a month', () => {
	it('counts by UTC calendar month', () => {
		expect(utcMonth(0)).toBe(0)
		expect(utcMonth(Date.UTC(2026, 9, 31, 23, 59, 59, 999))).toBe(utcMonth(Date.UTC(2026, 9, 1)))
		expect(utcMonth(Date.UTC(2026, 10, 1))).toBe(utcMonth(Date.UTC(2026, 9, 1)) + 1)
		expect(monthStart(utcMonth(Date.UTC(2026, 9, 17, 8)))).toBe(Date.UTC(2026, 9, 1))
		// December rolls over into January
		expect(monthStart(utcMonth(Date.UTC(2026, 11, 5)) + 1)).toBe(Date.UTC(2027, 0, 1))
	})

	it('stops at OVERAGE of the plan, and a lapsed team at once', () => {
		expect(OVERAGE).toBe(1.25)
		expect(eventStop(starter)).toBe(125_000)
		expect(eventStop(scale)).toBe(scale.events * 1.25)
		expect(teamStopped('plan', starter, 124_999)).toBe(false)
		expect(teamStopped('plan', starter, 125_000)).toBe(true)
		expect(teamStopped('trial', growth, eventStop(growth) - 1)).toBe(false)
		expect(teamStopped('lapsed', growth, 0)).toBe(true)
	})

	it('earns the 80% and 100% emails, then the stop', () => {
		expect(EVENT_WARNINGS).toEqual([0.8, 1])
		expect(eventLevels(starter, 79_999)).toEqual([])
		expect(eventLevels(starter, 80_000)).toEqual([80])
		expect(eventLevels(starter, 100_000)).toEqual([80, 100])
		expect(eventLevels(starter, 124_999)).toEqual([80, 100])
		expect(eventLevels(starter, 125_000)).toEqual([80, 100, 125])
		expect(eventLevels(growth, 125_000)).toEqual([])
	})
})

describe('the plan summary', () => {
	const NOW = Date.UTC(2026, 9, 10, 12)
	const server = { max: 1825, default: 761 }
	const row = (over: Partial<TeamPlanRow> = {}): TeamPlanRow => ({ plan: null, trial_ends_at: NOW + DAY, created_at: NOW - 6 * DAY, sites_used: 0, events_used: 0, ...over })

	it("describes a team's plan with its effective retention, its sites and its month", () => {
		const expected = (p: Plan, used: number, extra: Partial<TeamPlanInfo>) => {
			const most = Math.min(1825, p.retentionDays)
			return {
				id: p.id,
				name: p.name,
				events: p.events,
				events_stop: eventStop(p),
				month_ends_at: Date.UTC(2026, 10, 1),
				retention_days: most,
				retention_default_days: Math.min(761, most),
				sites: p.sites,
				sites_used: used,
				...extra,
			}
		}
		const paid = { state: 'plan', trial: false, lapsed: false, stopped: false } as const
		expect(planInfo(row({ plan: 'starter', sites_used: 1, events_used: 20 }), server, NOW)).toEqual(expected(starter, 1, { ...paid, events_used: 20, trial_ends_at: NOW + DAY }))
		expect(planInfo(row({ plan: 'scale', sites_used: 4, trial_ends_at: NOW - 6 * DAY }), server, NOW)).toEqual(expected(scale, 4, { ...paid, events_used: 0, trial_ends_at: null }))
		// the trial, and an id that is not a plan, get the trial plan's limits
		const onTrial = { state: 'trial', trial: true, lapsed: false, stopped: false, events_used: 0, trial_ends_at: NOW + DAY } as const
		expect(planInfo(row({ sites_used: 2 }), server, NOW)).toEqual(expected(growth, 2, onTrial))
		expect(planInfo(row({ plan: 'enterprise' }), server, NOW)).toEqual(expected(growth, 0, onTrial))
		expect(planInfo(row({ plan: 'growth' }), { max: 400, default: 400 }, NOW)).toMatchObject({ retention_days: 400, retention_default_days: 400 })
	})

	it('says when the trial ended, null for a team that had none, and that a lapsed team is stopped', () => {
		expect(planInfo(row({ trial_ends_at: NOW - DAY }), server, NOW)).toMatchObject({ state: 'lapsed', trial: false, lapsed: true, stopped: true, trial_ends_at: NOW - DAY })
		const none = row({ trial_ends_at: NOW - 6 * DAY })
		expect(planInfo(none, server, NOW)).toMatchObject({ lapsed: true, trial_ends_at: null })
		expect(planInfo({ ...none, trial_ends_at: null }, server, NOW)).toMatchObject({ lapsed: true, trial_ends_at: null })
	})

	it('is stopped from OVERAGE of the events this month', () => {
		expect(planInfo(row({ plan: 'starter', events_used: 124_999 }), server, NOW).stopped).toBe(false)
		expect(planInfo(row({ plan: 'starter', events_used: 125_000 }), server, NOW).stopped).toBe(true)
	})
})
