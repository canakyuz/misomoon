// What a comparison page leads with, worked out from its sourced facts: the score, how much
// lighter the tracker is, and the rows where misomoon does better, as headlines.
import type { Alternative, Fact } from './alternatives.ts'
import { OURS } from './alternatives.ts'
import { LONGEST_KEPT, PLANS, short, years } from './pricing.ts'

export interface Tally {
	wins: number
	losses: number
	even: number
	total: number
}

export function tally(a: Pick<Alternative, 'facts'>): Tally {
	const wins = a.facts.filter((f) => f.edge === 'us').length
	const losses = a.facts.filter((f) => f.edge === 'them').length
	return { wins, losses, even: a.facts.length - wins - losses, total: a.facts.length }
}

/**
 * How many times lighter misomoon's Light preset is than the other tracker, or null when
 * the gap is under 1.5 times and not worth a headline. Rounded down, so it never overstates.
 */
export function lighter(trackerKb: number): number | null {
	const r = trackerKb / OURS.lightKb
	if (r < 1.5) return null
	return r >= 10 ? Math.floor(r) : Math.floor(r * 10) / 10
}

const START = PLANS[0]

/** The headline for a row misomoon wins. Rows not listed use their label. */
const HEADLINES: Record<string, string> = {
	Cookies: 'No cookies at all',
	'Consent in Europe': 'Nothing stored on the device',
	Price: `$${START.price} for ${short(START.events)} events`,
	'Hosted price': `$${START.price} for ${short(START.events)} events`,
	'Self-hosted edition limits': 'Nothing held back when you self-host',
	'What self-hosting needs': 'No server to run',
	Funnels: 'Funnels on every plan',
	'Funnels and goals': 'Funnels and goals included',
	'Funnels and revenue': 'Funnels and revenue included',
	'Revenue from payments': 'Revenue by source',
	Revenue: 'Revenue by source',
	'Import from Google': 'Bring your Google history',
	'Custom events': 'Custom events on every plan',
	'UTM campaigns': 'UTM campaigns on every plan',
	'Custom events and UTM': 'Custom events and UTM included',
	'Data retention': `Up to ${years(LONGEST_KEPT)} of history`,
	'Reporting window': `Up to ${years(LONGEST_KEPT)} of history`,
	'Core Web Vitals': 'Web Vitals in the same dashboard',
	'Official MCP server': 'An MCP server built in',
	'Open source': 'Open source, AGPL-3.0',
	'Open source and self-hosting': 'Open source, AGPL-3.0',
	'Where your data lives': 'You pick where the data lives',
}

/** The order a reader weighs a switch in: privacy and money first, then features. */
const ORDER = Object.keys(HEADLINES)

export interface Gain {
	headline: string
	fact: Fact
}

/** Up to `n` rows misomoon wins, most persuasive first. The tracker row has its own card. */
export function gains(a: Pick<Alternative, 'facts'>, n = 3): Gain[] {
	const rank = (f: Fact) => {
		const i = ORDER.indexOf(f.label)
		return i === -1 ? ORDER.length : i
	}
	return a.facts
		.filter((f) => f.edge === 'us' && !f.label.startsWith('Tracker'))
		.sort((x, y) => rank(x) - rank(y))
		.slice(0, n)
		.map((fact) => ({ headline: HEADLINES[fact.label] ?? fact.label, fact }))
}
