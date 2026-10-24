import { describe, expect, it } from 'vite-plus/test'
import { bucketOf, bucketsIn, DAY, MINUTE, QueryError, resolvePeriod, timeseries, type Scope } from '../src'
import { ingest, runner, shardDb } from './helpers'

// Berlin moved from CET (+60) to CEST (+120) at 2026-03-29 01:00 UTC.
const BERLIN = 'Europe/Berlin'
const NOW = Date.UTC(2026, 3, 1, 12) // Wed 1 Apr 2026, 14:00 in Berlin

describe('local days across a DST change (F19)', () => {
	it('starts 7d at local midnight seven days back, in the offset of that day', () => {
		// local Thu 26 Mar 00:00 CET = 25 Mar 23:00 UTC
		expect(resolvePeriod('7d', BERLIN, NOW)).toEqual({ from: Date.UTC(2026, 2, 25, 23), to: NOW + MINUTE, interval: 'day' })
	})

	it('lists day buckets that each start at local midnight', () => {
		const w = resolvePeriod('7d', BERLIN, NOW)
		expect(bucketsIn(w, 'day', BERLIN)).toEqual([
			Date.UTC(2026, 2, 25, 23),
			Date.UTC(2026, 2, 26, 23),
			Date.UTC(2026, 2, 27, 23),
			Date.UTC(2026, 2, 28, 23),
			Date.UTC(2026, 2, 29, 22),
			Date.UTC(2026, 2, 30, 22),
			Date.UTC(2026, 2, 31, 22),
		])
	})

	it.each([
		['01:30 CET on the change day', Date.UTC(2026, 2, 29, 0, 30), 'day', Date.UTC(2026, 2, 28, 23)],
		['00:30 CEST the day after', Date.UTC(2026, 2, 29, 22, 30), 'day', Date.UTC(2026, 2, 29, 22)],
		['a winter month', Date.UTC(2026, 0, 15), 'month', Date.UTC(2025, 11, 31, 23)],
		['a summer month', Date.UTC(2026, 6, 15), 'month', Date.UTC(2026, 5, 30, 22)],
		['a summer week (Monday 29 Jun)', Date.UTC(2026, 6, 1, 12), 'week', Date.UTC(2026, 5, 28, 22)],
	] as const)('puts %s in the right bucket', (_label, ts, interval, want) => {
		expect(bucketOf(ts, interval, BERLIN)).toBe(want)
	})

	it('counts events in the local day they happened on', async () => {
		const db = shardDb()
		const hit = (ts: number) => ({
			ts,
			edge: { ua: 'Mozilla/5.0 (Macintosh) Chrome/141.0.0.0 Safari/537.36', ip: `10.0.0.${ts % 250}` },
			payload: { s: 'b', n: 'pageview', u: 'https://b.de/' },
		})
		await ingest(db, [
			hit(Date.UTC(2026, 2, 26, 23, 30)), // Fri 27 Mar 00:30 CET
			hit(Date.UTC(2026, 2, 29, 22, 30)), // Mon 30 Mar 00:30 CEST
		])
		const scope: Scope = { siteId: 'b', filters: [], tz: BERLIN }
		const w = resolvePeriod('7d', BERLIN, NOW)
		const pts = await timeseries([{ run: runner(db), window: w }], scope, w, 'day')
		expect(pts.map((p) => [p.t, p.pageviews])).toEqual([
			[Date.UTC(2026, 2, 25, 23), 0],
			[Date.UTC(2026, 2, 26, 23), 1],
			[Date.UTC(2026, 2, 27, 23), 0],
			[Date.UTC(2026, 2, 28, 23), 0],
			[Date.UTC(2026, 2, 29, 22), 1],
			[Date.UTC(2026, 2, 30, 22), 0],
			[Date.UTC(2026, 2, 31, 22), 0],
		])
	})

	it('keeps fixed offsets in minutes working', () => {
		expect(bucketOf(Date.UTC(2026, 2, 29, 0, 30), 'day', 60)).toBe(Date.UTC(2026, 2, 28, 23))
	})
})

describe('bucket limit (F17)', () => {
	it('rejects an interval that would need more than 1500 buckets instead of cutting the series', () => {
		const w = { from: 0, to: 30 * DAY }
		expect(() => bucketsIn(w, 'minute', 0)).toThrow(QueryError)
		// 30 days of minutes = 43,200 buckets
		expect(() => bucketsIn(w, 'minute', 0)).toThrow('this period has 43200 minute buckets, more than 1500; pick a coarser interval')
	})

	it('allows exactly 1500 buckets', () => {
		expect(bucketsIn({ from: 0, to: 1500 * MINUTE }, 'minute', 0)).toHaveLength(1500)
	})
})
