import { QueryError } from './filters'
import type { Interval, Window } from './types'

export const MINUTE = 60_000
export const HOUR = 60 * MINUTE
export const DAY = 24 * HOUR

export const PERIODS = ['realtime', 'today', 'yesterday', '24h', '7d', '28d', '30d', '90d', 'mtd', 'lastmonth', 'ytd', '6mo', '12mo', 'all', 'custom'] as const
export type Period = (typeof PERIODS)[number]

/**
 * A site's clock: an IANA zone name, whose offset is looked up for each instant so
 * days stay local across DST changes, or a fixed offset in minutes east of UTC.
 */
export type Zone = string | number

const formatters = new Map<string, Intl.DateTimeFormat | null>()

function formatter(timeZone: string): Intl.DateTimeFormat | null {
	let f = formatters.get(timeZone)
	if (f === undefined) {
		try {
			f = new Intl.DateTimeFormat('en-US', {
				timeZone,
				hourCycle: 'h23',
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
				hour: '2-digit',
				minute: '2-digit',
				second: '2-digit',
			})
		} catch {
			f = null
		}
		formatters.set(timeZone, f)
	}
	return f
}

/** True for a zone name Intl knows. */
export function isTimeZone(timeZone: string): boolean {
	return formatter(timeZone) !== null
}

/** Minutes east of UTC for an IANA zone at an instant. Falls back to UTC. */
export function tzOffset(timeZone: string, at = Date.now()): number {
	const f = formatter(timeZone)
	if (!f) return 0
	const parts = f.formatToParts(new Date(at))
	const n = (t: string) => Number(parts.find((p) => p.type === t)?.value)
	const local = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'))
	return Math.round((local - Math.floor(at / 1000) * 1000) / MINUTE)
}

/** Minutes east of UTC in `zone` at the instant `at`. */
export function offsetAt(zone: Zone, at: number): number {
	return typeof zone === 'number' ? zone : tzOffset(zone, at)
}

/** Wall-clock time in `zone`, as ms since a UTC epoch, for the instant `at`. */
function toLocal(at: number, zone: Zone): number {
	return at + offsetAt(zone, at) * MINUTE
}

/** The instant a wall-clock time in `zone` happens (inverse of toLocal). */
export function fromLocal(local: number, zone: Zone): number {
	if (typeof zone === 'number') return local - zone * MINUTE
	// Guess with the offset near `local`, then correct once if a DST change lies between.
	const first = local - offsetAt(zone, local) * MINUTE
	const off = offsetAt(zone, first)
	return local - off * MINUTE
}

/** The local date of the instant `at` in `zone`, as YYYY-MM-DD. */
export function localDay(at: number, zone: Zone): string {
	return new Date(toLocal(at, zone)).toISOString().slice(0, 10)
}

/** Start of the local day containing `at`, as a UTC ms instant. */
export function startOfLocalDay(at: number, zone: Zone): number {
	return fromLocal(Math.floor(toLocal(at, zone) / DAY) * DAY, zone)
}

function startOfLocalMonth(at: number, zone: Zone, monthsBack = 0): number {
	const d = new Date(toLocal(at, zone))
	return fromLocal(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - monthsBack, 1), zone)
}

export interface ResolvedPeriod extends Window {
	interval: Interval
}

export function resolvePeriod(
	period: string,
	zone: Zone,
	now = Date.now(),
	custom?: { from?: string | null; to?: string | null; /** when the site started, for `all` */ since?: number },
): ResolvedPeriod {
	const todayLocal = Math.floor(toLocal(now, zone) / DAY) * DAY
	const today = fromLocal(todayLocal, zone)
	// local midnight `n` days back, in the offset that day had
	const daysBack = (n: number) => fromLocal(todayLocal - n * DAY, zone)
	switch (period) {
		case 'realtime':
			return { from: now - 30 * MINUTE, to: now + MINUTE, interval: 'minute' }
		case 'today':
			return { from: today, to: now + MINUTE, interval: 'hour' }
		case 'yesterday':
			return { from: daysBack(1), to: today, interval: 'hour' }
		case '24h':
			return { from: now - DAY, to: now + MINUTE, interval: 'hour' }
		case '7d':
			return { from: daysBack(6), to: now + MINUTE, interval: 'day' }
		case '28d':
			return { from: daysBack(27), to: now + MINUTE, interval: 'day' }
		case '30d':
			return { from: daysBack(29), to: now + MINUTE, interval: 'day' }
		case '90d':
			return { from: daysBack(89), to: now + MINUTE, interval: 'day' }
		case 'mtd':
			return { from: startOfLocalMonth(now, zone), to: now + MINUTE, interval: 'day' }
		case 'lastmonth':
			return { from: startOfLocalMonth(now, zone, 1), to: startOfLocalMonth(now, zone), interval: 'day' }
		case 'ytd': {
			const y = new Date(toLocal(now, zone)).getUTCFullYear()
			return { from: fromLocal(Date.UTC(y, 0, 1), zone), to: now + MINUTE, interval: 'week' }
		}
		case '6mo':
			return { from: startOfLocalMonth(now, zone, 5), to: now + MINUTE, interval: 'month' }
		case '12mo':
			return { from: startOfLocalMonth(now, zone, 11), to: now + MINUTE, interval: 'month' }
		case 'all': {
			const from = startOfLocalDay(Math.min(custom?.since ?? today, today), zone)
			return { from, to: now + MINUTE, interval: defaultInterval(now - from) }
		}
		case 'custom': {
			const from = parseLocalDate(custom?.from)
			const to = parseLocalDate(custom?.to)
			if (from == null || to == null || to < from) throw new QueryError('custom period needs from and to as YYYY-MM-DD')
			if (to + DAY - from > 400 * DAY) throw new QueryError('custom period is limited to 400 days')
			const start = fromLocal(from, zone)
			const end = fromLocal(to + DAY, zone)
			return { from: start, to: Math.min(end, now + MINUTE), interval: defaultInterval(end - start) }
		}
		default:
			throw new QueryError(`unknown period: ${period}`)
	}
}

/** A YYYY-MM-DD date as local midnight (ms since a UTC epoch, before any offset). */
function parseLocalDate(s: string | null | undefined): number | null {
	if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
	const t = Date.parse(s + 'T00:00:00Z')
	return Number.isNaN(t) ? null : t
}

export function defaultInterval(span: number): Interval {
	if (span <= 2 * HOUR) return 'minute'
	if (span <= 3 * DAY) return 'hour'
	if (span <= 120 * DAY) return 'day'
	if (span <= 400 * DAY) return 'week'
	return 'month'
}

/** The window of the same length immediately before `w`. */
export function previousWindow(w: Window): Window {
	const span = w.to - w.from
	return { from: w.from - span, to: w.from }
}

/** The same dates a year earlier, for year-over-year comparison. */
export function yearAgoWindow(w: Window): Window {
	const back = (t: number) => {
		const d = new Date(t)
		d.setUTCFullYear(d.getUTCFullYear() - 1)
		return d.getTime()
	}
	return { from: back(w.from), to: back(w.to) }
}

/** Where `zone`'s offset changes inside a window: the offset from each instant on. */
export function offsetSegments(zone: Zone, w: Window): { at: number; offset: number }[] {
	const segs = [{ at: w.from, offset: offsetAt(zone, w.from) }]
	if (typeof zone === 'number') return segs
	for (let t = w.from + DAY; t < w.to + DAY; t += DAY) {
		const cur = segs[segs.length - 1].offset
		if (offsetAt(zone, t) === cur) continue
		// the change happened in (t - DAY, t]: narrow it down to the whole UTC minute
		let lo = Math.floor((t - DAY) / MINUTE) * MINUTE
		let hi = Math.ceil(t / MINUTE) * MINUTE
		while (hi - lo > MINUTE) {
			const mid = lo + Math.floor((hi - lo) / 2 / MINUTE) * MINUTE
			if (offsetAt(zone, mid) === cur) lo = mid
			else hi = mid
		}
		segs.push({ at: hi, offset: offsetAt(zone, hi) })
	}
	return segs
}

/**
 * SQL giving the bucket key of a ms timestamp column, for timestamps inside `w`.
 * Minute and hour keys are UTC bucket starts; day, week and month keys are local
 * midnights, which `bucketStart` turns into instants.
 */
export function bucketSql(col: string, interval: Interval, zone: Zone, w: Window): string {
	const segs = offsetSegments(zone, w)
	const off =
		segs.length === 1
			? String(segs[0].offset * MINUTE)
			: `(CASE ${segs
					.slice(1)
					.reverse()
					.map((s) => `WHEN (${col}) >= ${s.at} THEN ${s.offset * MINUTE}`)
					.join(' ')} ELSE ${segs[0].offset * MINUTE} END)`
	const local = `((${col}) + ${off})`
	switch (interval) {
		case 'minute':
			return `((${col}) / ${MINUTE}) * ${MINUTE}`
		case 'hour':
			return `(${local} / ${HOUR}) * ${HOUR} - ${off}`
		case 'day':
			return `(${local} / ${DAY}) * ${DAY}`
		case 'week':
			// Epoch day 0 was a Thursday; shift by 3 so weeks start on Monday.
			return `(((${local} / ${DAY}) + 3) / 7 * 7 - 3) * ${DAY}`
		case 'month':
			return `CAST(strftime('%s', strftime('%Y-%m-01', ${local} / 1000, 'unixepoch')) AS INTEGER) * 1000`
	}
}

/** The bucket start instant for a key from `bucketSql`. */
export function bucketStart(key: number, interval: Interval, zone: Zone): number {
	return interval === 'minute' || interval === 'hour' ? key : fromLocal(key, zone)
}

/** Bucket start for a JS timestamp; mirrors `bucketSql`. */
export function bucketOf(ts: number, interval: Interval, zone: Zone): number {
	switch (interval) {
		case 'minute':
			return Math.floor(ts / MINUTE) * MINUTE
		case 'hour': {
			const off = offsetAt(zone, ts) * MINUTE
			return Math.floor((ts + off) / HOUR) * HOUR - off
		}
		case 'day':
			return fromLocal(Math.floor(toLocal(ts, zone) / DAY) * DAY, zone)
		case 'week': {
			const day = Math.floor(toLocal(ts, zone) / DAY)
			return fromLocal((Math.floor((day + 3) / 7) * 7 - 3) * DAY, zone)
		}
		case 'month': {
			const d = new Date(toLocal(ts, zone))
			return fromLocal(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1), zone)
		}
	}
}

export function nextBucket(t: number, interval: Interval, zone: Zone): number {
	switch (interval) {
		case 'minute':
			return t + MINUTE
		case 'hour':
			return t + HOUR
		case 'day':
		case 'week': {
			const local = Math.round(toLocal(t, zone) / DAY) * DAY
			return fromLocal(local + (interval === 'day' ? 1 : 7) * DAY, zone)
		}
		case 'month': {
			const d = new Date(toLocal(t, zone))
			return fromLocal(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1), zone)
		}
	}
}

export const MAX_BUCKETS = 1500

/** Every bucket start in the window, so charts show zero days instead of gaps. */
export function bucketsIn(w: Window, interval: Interval, zone: Zone, max = MAX_BUCKETS): number[] {
	const out: number[] = []
	let n = 0
	for (let t = bucketOf(w.from, interval, zone); t < w.to; t = nextBucket(t, interval, zone)) {
		if (++n <= max) out.push(t)
	}
	if (n > max) throw new QueryError(`this period has ${n} ${interval} buckets, more than ${max}; pick a coarser interval`)
	return out
}

/** UTC day number, the unit shard ranges are expressed in. */
export function utcDay(ts: number): number {
	return Math.floor(ts / DAY)
}
