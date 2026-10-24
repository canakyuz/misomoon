import { nextBucket } from '@misomoon/core/time'

export type Interval = 'minute' | 'hour' | 'day' | 'week' | 'month'

const STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]

/** The smallest "nice" step at least `raw`; whole numbers only when `integer`. */
function niceStep(raw: number, integer: boolean): number {
	if (raw <= 0) return 1
	const exp = Math.pow(10, Math.floor(Math.log10(raw)))
	for (const s of STEPS) {
		const step = s * exp
		if (step >= raw * (1 - 1e-9) && (!integer || Number.isInteger(step))) return step
	}
	return 10 * exp
}

/**
 * A y axis with four equal steps and a little headroom. Percent axes stop at
 * 100% when the data does, and count axes keep whole-number ticks.
 */
export function yScale(values: number[], opts: { percent?: boolean; integer?: boolean } = {}): { min: number; max: number; ticks: number[] } {
	const hi = Math.max(0, ...values)
	const lo = Math.min(0, ...values)
	if (opts.percent && lo >= 0 && hi <= 100 && hi * 1.08 > 75) return { min: 0, max: 100, ticks: [0, 25, 50, 75, 100] }
	const step = hi === lo ? 1 : niceStep(((hi - lo) * 1.08) / 4, !!opts.integer)
	const min = Math.floor(lo / step) * step
	let count = 4
	while (min + count * step < hi) count++
	const ticks = Array.from({ length: count + 1 }, (_, i) => Number((min + i * step).toPrecision(12)))
	return { min: ticks[0] || 0, max: ticks[ticks.length - 1], ticks: ticks.map((t) => t || 0) }
}

function localDate(t: number, timeZone: string): string {
	return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t))
}

/** The custom date range covering buckets a..b: from the first bucket's start to the last day of the last bucket. */
export function zoomRange(starts: number[], a: number, b: number, interval: Interval, timeZone: string): { from: string; to: string } {
	const first = starts[Math.min(a, b)]
	const last = starts[Math.max(a, b)]
	return { from: localDate(first, timeZone), to: localDate(nextBucket(last, interval, timeZone) - 1, timeZone) }
}
