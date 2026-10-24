import { describe, expect, it } from 'vite-plus/test'
import { eventStop, planById, planInfo, type TeamPlanRow } from '@misomoon/core/plans'
import { atSiteLimit, CNIL_DAYS, dayText, eventsMeter, planBanner, planFacts, span, trialDaysLeft, trialLine } from '../src/lib/plan'

const server = { max: 1825, default: 1825 }
const DAY = 86_400_000
// 10 October 2026, noon UTC
const NOW = Date.UTC(2026, 9, 10, 12)
const row = (over: Partial<TeamPlanRow> = {}): TeamPlanRow => ({ plan: null, trial_ends_at: NOW + 5 * DAY, created_at: NOW - 2 * DAY, sites_used: 0, events_used: 0, ...over })
const info = (over: Partial<TeamPlanRow> = {}, at = NOW) => planInfo(row(over), server, at)
const starter = planById('starter')!
const growth = planById('growth')!

describe('the plan card', () => {
	it('lists the plan, its sites, how long it keeps stats, and the events it includes', () => {
		expect(planFacts(info({ plan: 'starter', sites_used: 1 }))).toEqual([
			['Plan', 'Starter'],
			['Sites', '1 of 1'],
			['Keeps stats for', `Up to ${span(starter.retentionDays)}`],
			['Events a month', `${starter.events.toLocaleString('en')} included`],
		])
	})

	it('names the trial with the limits it runs under, a team with no plan, and a plan without a site limit', () => {
		const trial = info({ sites_used: 4 })
		const facts = Object.fromEntries(planFacts(trial))
		expect(facts.Plan).toBe(`Trial, ${trial.name} limits`)
		expect(facts.Sites).toBe(trial.sites === null ? '4, no limit' : `4 of ${trial.sites}`)
		expect(Object.fromEntries(planFacts(info({ trial_ends_at: NOW - DAY }))).Plan).toBe('None')
	})

	it("says the default when it is shorter than the plan's longest, in the picker's words", () => {
		const facts = Object.fromEntries(planFacts(planInfo(row({ plan: 'growth' }), { max: 1825, default: CNIL_DAYS }, NOW)))
		expect(facts['Keeps stats for']).toBe(CNIL_DAYS < growth.retentionDays ? `25 months by default, up to ${span(growth.retentionDays)}` : `Up to ${span(growth.retentionDays)}`)
		expect([span(730), span(761), span(1095), span(3650), span(45)]).toEqual(['2 years', '25 months', '3 years', '10 years', '45 days'])
	})

	it('is at the site limit at or past it, never without a limit', () => {
		expect(atSiteLimit(info({ plan: 'starter', sites_used: 0 }))).toBe(false)
		expect(atSiteLimit(info({ plan: 'starter', sites_used: 1 }))).toBe(true)
		expect(atSiteLimit(info({ plan: 'starter', sites_used: 3 }))).toBe(true)
		expect(atSiteLimit(info({ plan: 'scale', sites_used: 50 }))).toBe(false)
	})
})

describe('the trial line', () => {
	it('counts the days left, today included, and turns to a warning for the last two', () => {
		expect(trialDaysLeft(info(), NOW)).toBe(5)
		expect(trialDaysLeft(info({}, NOW + 4 * DAY + 1), NOW + 4 * DAY + 1)).toBe(1)
		expect(trialDaysLeft(info({ plan: 'starter' }), NOW)).toBeNull()
		expect(trialLine(info(), NOW)).toEqual({ tone: 'ok', text: 'Free trial: 5 days left, until 15 October.' })
		expect(trialLine(info({}, NOW + 3 * DAY), NOW + 3 * DAY)).toEqual({ tone: 'warn', text: 'Free trial: 2 days left, until 15 October.' })
		expect(trialLine(info({}, NOW + 5 * DAY - 1), NOW + 5 * DAY - 1)).toEqual({ tone: 'warn', text: 'Free trial: ends within a day, until 15 October.' })
	})

	it('says when the trial ended, and why a later team has none', () => {
		expect(trialLine(info({ trial_ends_at: NOW - DAY }))).toEqual({ tone: 'bad', text: "Trial ended on 9 October. The team's sites record nothing until it has a plan. Their stats stay readable." })
		expect(trialLine(info({ trial_ends_at: NOW - 2 * DAY }))?.text).toMatch(/^No plan\. Each person gets one free trial/)
		expect(trialLine(info({ plan: 'growth' }))).toBeNull()
	})
})

describe('the events meter', () => {
	it("measures this month against the plan's events, with the stop at the end of the bar", () => {
		const m = eventsMeter(info({ plan: 'starter', events_used: 40_000 }))
		expect(m).toEqual({ label: '40,000 of 100,000 events this month', share: 0.4, stopAt: 1.25, tone: 'ok', note: null })
		expect(eventsMeter(info({ plan: 'starter', events_used: 80_000 })).tone).toBe('warn')
	})

	it('says past 100% that tracking carries on to the stop, and at the stop that it is paused', () => {
		expect(eventsMeter(info({ plan: 'starter', events_used: 110_000 })).note).toBe("Past the plan's events. Tracking carries on until 125,000 events (125%), then pauses until 1 November.")
		const stopped = eventsMeter(info({ plan: 'starter', events_used: eventStop(starter) }))
		expect([stopped.tone, stopped.note]).toEqual(['bad', 'Tracking is paused until 1 November: this month reached 125,000 events, 125% of the plan. A plan with more events starts it again within a minute.'])
		// a lapsed team says so in the trial line instead
		expect(eventsMeter(info({ trial_ends_at: NOW - DAY })).note).toBeNull()
	})
})

describe('the banner', () => {
	it('stays away while the trial has more than 2 days and the month is within the plan', () => {
		expect(planBanner(info({}, NOW + 2 * DAY), NOW + 2 * DAY)).toBeNull()
		expect(planBanner(info({ plan: 'starter', events_used: 99_999 }), NOW)).toBeNull()
	})

	it('warns in the last 2 days of the trial', () => {
		expect(planBanner(info({}, NOW + 3 * DAY), NOW + 3 * DAY)).toEqual({ tone: 'warn', text: 'The free trial ends in 2 days, on 15 October. Pick a plan to keep tracking.' })
		expect(planBanner(info({}, NOW + 5 * DAY - 60_000), NOW + 5 * DAY - 60_000)?.text).toBe('The free trial ends within a day, on 15 October. Pick a plan to keep tracking.')
	})

	it('says a team without a plan records nothing', () => {
		expect(planBanner(info({ trial_ends_at: NOW - DAY }))).toEqual({ tone: 'bad', text: "The free trial has ended, so this team's sites record nothing. Pick a plan to start again." })
		expect(planBanner(info({ trial_ends_at: NOW - 2 * DAY }))).toEqual({ tone: 'bad', text: "This team has no plan, so its sites record nothing. Pick a plan to start." })
	})

	it("warns past 100% of the month's events, and says when a stopped month starts again", () => {
		expect(planBanner(info({ plan: 'starter', events_used: 100_000 }))).toEqual({ tone: 'warn', text: "This month's events passed the 100,000 the plan includes. Tracking pauses at 125,000." })
		expect(planBanner(info({ plan: 'starter', events_used: 125_000 }))).toEqual({ tone: 'bad', text: "Tracking is paused until 1 November: this month's events reached 125% of the Starter plan's." })
		expect(planBanner(info({ events_used: eventStop(growth) }))?.text).toBe("Tracking is paused until 1 November: this month's events reached 125% of the free trial's.")
	})

	it('writes days in UTC, when trials and months turn', () => {
		expect(dayText(Date.UTC(2026, 10, 1))).toBe('1 November')
		expect(dayText(Date.UTC(2026, 10, 1) - 1)).toBe('31 October')
	})
})
