import { PLANS as CLOUD_PLANS, TRIAL_PLAN } from '@misomoon/core/plans'
import { describe, expect, it } from 'vite-plus/test'
import {
	FROM,
	LARGEST,
	LONGEST_KEPT,
	PLANS,
	TRIAL,
	TRIAL_LIMITS,
	keepSentence,
	keptByPlan,
	priceSentence,
	short,
	signupUrl,
	sites,
	step,
	summary,
	words,
	years,
	type Plan,
} from './pricing.ts'

const plan = (id: Plan['id'], name: string, price: number, events: number, retentionDays: number, sites: number | null): Plan => ({ id, name, price, events, retentionDays, sites, who: '' })
const LADDER = [plan('starter', 'Starter', 5, 100_000, 730, 1), plan('growth', 'Growth', 14, 1_000_000, 1095, null), plan('scale', 'Scale', 49, 5_000_000, 1095, null)]

describe('the Cloud plans', () => {
	it('are the plans the API enforces, with only the landing’s copy added', () => {
		expect(PLANS.map(({ who: _who, popular: _popular, ...limits }) => limits)).toEqual(CLOUD_PLANS)
		expect(PLANS.every((p) => p.who.length > 0)).toBe(true)
		expect(TRIAL_LIMITS.id).toBe(TRIAL_PLAN)
	})

	it('print each plan’s limits from the core values', () => {
		for (const p of CLOUD_PLANS) {
			const line = summary(PLANS.find((x) => x.id === p.id)!)
			expect(line).toContain(`${words(p.events)} events a month`)
			expect(line).toContain(p.sites === null ? 'unlimited sites' : `${p.sites} site`)
			expect(line).toContain(`stats kept ${years(p.retentionDays)}`)
			expect(priceSentence()).toContain(`${p.name} is $${p.price}`)
			expect(keepSentence()).toContain(p.name)
		}
		expect(FROM).toBe(Math.min(...CLOUD_PLANS.map((p) => p.price)))
		expect(LARGEST).toBe(Math.max(...CLOUD_PLANS.map((p) => p.events)))
		expect(LONGEST_KEPT).toBe(Math.max(...CLOUD_PLANS.map((p) => p.retentionDays)))
	})

	it('go up in price and in events, with one popular plan and no free plan', () => {
		for (let i = 1; i < PLANS.length; i++) {
			expect(PLANS[i].price).toBeGreaterThan(PLANS[i - 1].price)
			expect(PLANS[i].events).toBeGreaterThan(PLANS[i - 1].events)
		}
		expect(PLANS.every((p) => p.price > 0)).toBe(true)
		expect(PLANS.filter((p) => p.popular).map((p) => p.id)).toEqual(['growth'])
	})

	it('print events short and in words, sites, and retention in years', () => {
		expect([10_000, 100_000, 1_000_000, 5_000_000].map(short)).toEqual(['10k', '100k', '1M', '5M'])
		expect([100_000, 250_000, 1_000_000, 2_500_000].map(words)).toEqual(['100,000', '250,000', '1 million', '2.5 million'])
		expect([1, 3, null].map(sites)).toEqual(['1 site', '3 sites', 'unlimited sites'])
		expect([365, 730, 1095, 1825].map(years)).toEqual(['1 year', '2 years', '3 years', '5 years'])
		expect([761, 45].map(years)).toEqual(['25 months', '1 month'])
	})

	it('read as sentences', () => {
		expect(priceSentence(LADDER)).toBe('Starter is $5 a month for 100,000 events on 1 site, Growth is $14 for 1 million events on unlimited sites, and Scale is $49 for 5 million events on unlimited sites.')
		expect(keepSentence(LADDER)).toBe('Starter keeps stats for 2 years, and Growth and Scale keep them for 3 years.')
		expect(keepSentence([LADDER[0], LADDER[1], { ...LADDER[2], retentionDays: 1825 }])).toBe('Starter keeps stats for 2 years, Growth keeps them for 3 years, and Scale keeps them for 5 years.')
		expect(keptByPlan(LADDER)).toBe('2 years on Starter, 3 years on Growth and Scale')
		expect(summary(LADDER[0])).toBe('100,000 events a month on 1 site, stats kept 2 years')
	})

	it('say what each plan adds to the one below it', () => {
		expect(step(LADDER[1], LADDER[0])).toBe('10 times the events, unlimited sites, and stats kept 1 year longer, for $9 more.')
		expect(step(LADDER[2], LADDER[1])).toBe('5 times the events, for $35 more.')
	})

	it('start with a trial that needs no card', () => {
		expect(TRIAL).toBe('a 7-day free trial, no card needed')
	})

	it('send people to the sign-up form', () => {
		expect(signupUrl('https://app.misomoon.com')).toBe('https://app.misomoon.com/?signup')
	})
})
