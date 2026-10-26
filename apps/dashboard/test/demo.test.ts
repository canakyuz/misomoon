import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vite-plus/test'
import { demoKey, type DemoPeriod } from '../src/lib/demo-key'
import { PERIODS } from '../src/lib/url'

vi.hoisted(() => {
	;(globalThis as { location?: unknown }).location = { pathname: '/demo', search: '' }
})

const { adjust, breakdown, demoGet, demoSend, funnel, journey, periodFile, share, shiftFor } = await import('../src/lib/demo')
const { ApiError, get, send } = await import('../src/lib/api')

const DAY = 86_400_000
const rows = (...r: [string, number][]) => r.map(([key, visitors]) => ({ key, visitors, pageviews: visitors * 2, bounce_rate: 40 }))
const rec: DemoPeriod = {
	at: Date.UTC(2026, 9, 20, 15),
	entries: {
		[demoKey('stats/aggregate', { compare: 'previous' })]: { current: { visitors: 1000, pageviews: 3000, bounce_rate: 45 }, previous: { visitors: 800 }, change: { visitors: 25 } },
		[demoKey('stats/breakdown', { property: 'country' })]: { property: 'country', rows: rows(['US', 500], ['DE', 300], ['FR', 100]), total_visitors: 1000, has_more: true },
		[demoKey('stats/breakdown', { property: 'page' })]: { property: 'page', rows: rows(['/', 600], ['/shop', 300], ['/shop/pack', 200], ['/shop/stove', 100]), total_visitors: 1000, has_more: false },
		[demoKey('stats/breakdown', { property: 'event' })]: { property: 'event', rows: rows(['Add to cart', 150], ['Purchase', 40]), total_visitors: 1000, has_more: false },
		[demoKey('stats/breakdown', { property: 'props' })]: { property: 'props', rows: rows(['plan: pro', 250], ['plan: free', 750]), total_visitors: 1000, has_more: false },
		[demoKey('stats/breakdown', { property: 'source', filters: 'country==US' })]: { property: 'source', rows: rows(['google', 300], ['bing', 50]), total_visitors: 500, has_more: false },
		[demoKey('stats/journeys', { direction: 'forward' })]: { direction: 'forward', path: [], visitors: 1000, steps: [{ key: '/', visitors: 600, share: 60 }, { key: '/shop', visitors: 300, share: 30 }] },
		[demoKey('stats/journeys', { direction: 'forward', path: '/' })]: { direction: 'forward', path: ['/'], visitors: 600, steps: [{ key: '/shop', visitors: 300, share: 50 }, { key: '/blog', visitors: 120, share: 20 }] },
		[demoKey('stats/journeys', { direction: 'forward', path: '/shop' })]: { direction: 'forward', path: ['/shop'], visitors: 400, steps: [{ key: '/', visitors: 40, share: 10 }, { key: '/shop/pack', visitors: 200, share: 50 }] },
	},
}

describe('the recording a request reads', () => {
	it('is its own period, or for a custom range the preset closest in length', () => {
		expect(periodFile(new URLSearchParams('period=7d'))).toBe('7d')
		expect(periodFile(new URLSearchParams(''))).toBe('30d')
		expect(periodFile(new URLSearchParams('period=custom&from=2026-10-01&to=2026-10-10'))).toBe('7d')
		expect(periodFile(new URLSearchParams('period=custom&from=2026-08-01&to=2026-10-20'))).toBe('90d')
		expect(periodFile(new URLSearchParams('period=custom&from=bad'))).toBe('30d')
	})

	it('keys on what changes the answer, in any filter order', () => {
		expect(demoKey('stats/breakdown', new URLSearchParams('site=acme&period=7d&property=page&limit=8&_=3&filters=os==Mac;country==US'))).toBe('stats/breakdown?property=page&filters=country==US;os==Mac')
		expect(demoKey('stats/aggregate', { compare: 'year', limit: '5' })).toBe('stats/aggregate?compare=year')
	})
})

describe('dates', () => {
	it('move by whole days in the site’s time zone, so a recording ends today', () => {
		// 23:30 in New York on the 20th, read at 01:00 there on the 22nd: two calendar days
		const at = Date.UTC(2026, 9, 21, 3, 30)
		const now = Date.UTC(2026, 9, 22, 5)
		expect(shiftFor('day', at, now, 'America/New_York')).toBe(2 * DAY)
		expect(shiftFor('day', at, now, 'UTC')).toBe(DAY)
		expect(shiftFor('hour', at, at + 5.6 * 3_600_000, 'UTC')).toBe(6 * 3_600_000)
		expect(shiftFor('exact', at, at + 1234, 'UTC')).toBe(1234)
	})

	it('move only timestamps, and filters scale only counts', () => {
		const v = adjust({ t: 1.7e12, ts: 1.7e12, window: { from: 1.7e12, to: 1.8e12 }, visitors: 100, revenue: 10.5, bounce_rate: 40, share: 12.5, steps: [{ visitors: 9 }] }, DAY, 0.5)
		expect(v).toEqual({ t: 1.7e12 + DAY, ts: 1.7e12 + DAY, window: { from: 1.7e12 + DAY, to: 1.8e12 + DAY }, visitors: 50, revenue: 5.25, bounce_rate: 40, share: 12.5, steps: [{ visitors: 5 }] })
	})
})

describe('filters', () => {
	it('keep the filtered value’s share of visitors', () => {
		expect(share(rec, { dim: 'country', op: '==', values: ['US'] })).toBe(0.5)
		expect(share(rec, { dim: 'country', op: '==', values: ['US', 'DE'] })).toBe(0.8)
		// everyone but the US, including countries past the recorded rows
		expect(share(rec, { dim: 'country', op: '!=', values: ['US'] })).toBe(0.5)
		expect(share(rec, { dim: 'page', op: '~', values: ['SHOP'] })).toBeCloseTo(0.6)
		expect(share(rec, { dim: 'prop:plan', op: '==', values: ['pro'] })).toBe(0.25)
		// a dimension the recording lacks changes nothing
		expect(share(rec, { dim: 'language', op: '==', values: ['fr'] })).toBe(1)
	})

	it('pick rows of the broken-down property and scale the others', () => {
		const own = breakdown(rec, new URLSearchParams('property=country&limit=10'), [{ dim: 'country', op: '!=', values: ['US'] }], 0)
		expect(own.rows.map((r) => [r.key, r.visitors])).toEqual([
			['DE', 300],
			['FR', 100],
		])
		const other = breakdown(rec, new URLSearchParams('property=page&limit=2'), [{ dim: 'country', op: '==', values: ['DE'] }], 0)
		expect(other.rows.map((r) => [r.key, r.visitors])).toEqual([
			['/', 180],
			['/shop', 90],
		])
		expect(other.total_visitors).toBe(300)
	})

	it('use a recording made with the filter when there is one', () => {
		const b = breakdown(rec, new URLSearchParams('property=source&limit=10'), [{ dim: 'country', op: '==', values: ['US'] }], 0)
		expect(b.rows.map((r) => r.key)).toEqual(['google', 'bing'])
		expect(b.rows[0].visitors).toBe(300)
	})
})

describe('breakdowns', () => {
	it('page, limit and search over the recorded rows', () => {
		const q = (s: string) => breakdown(rec, new URLSearchParams(`property=page&${s}`), [], 0)
		expect(q('limit=1').rows.map((r) => r.key)).toEqual(['/'])
		expect(q('limit=2&page=2')).toMatchObject({ rows: [{ key: '/shop/pack' }, { key: '/shop/stove' }], has_more: false })
		expect(q('limit=1&page=2').has_more).toBe(true)
		expect(q('limit=10&search=STOVE').rows.map((r) => r.key)).toEqual(['/shop/stove'])
	})

	it('of a property the recording lacks come back empty', () => {
		expect(breakdown(rec, new URLSearchParams('property=hostname&limit=5'), [], 0)).toEqual({ property: 'hostname', rows: [], total_visitors: 0, has_more: false })
	})
})

describe('paths', () => {
	it('past the recorded step follow the last page’s own recording, scaled to the people who got there', () => {
		const j = journey(rec, new URLSearchParams('direction=forward&path=/,/shop'), [], 0)
		// 300 reached /shop from /; /shop's recording has 400, and / is already on the path
		expect(j).toEqual({ direction: 'forward', path: ['/', '/shop'], visitors: 300, steps: [{ key: '/shop/pack', visitors: 150, share: 50 }] })
	})

	it('end where nothing was recorded', () => {
		expect(journey(rec, new URLSearchParams('direction=forward&path=/,/blog'), [], 0)).toEqual({ direction: 'forward', path: ['/', '/blog'], visitors: 120, steps: [] })
	})
})

describe('funnels', () => {
	it('the recording lacks never grow from one step to the next', () => {
		const f = funnel(
			rec,
			[
				{ kind: 'page', match: '/shop*' },
				{ kind: 'event', match: 'Add to cart' },
				{ kind: 'event', match: 'Purchase' },
			],
			'sequential',
			[],
		)
		expect(f.entered).toBe(1000)
		expect(f.steps.map((s) => [s.label, s.visitors, s.conversion, s.dropoff])).toEqual([
			['Visit /shop*', 600, 100, 0],
			['Add to cart', 90, 15, 510],
			['Purchase', 24, 4, 66],
		])
		expect(f.completed).toBe(24)
	})
})

describe('on /demo', () => {
	it('loads the recordings and answers the account request without the API', async () => {
		const fetch = vi.fn()
		vi.stubGlobal('fetch', fetch)
		const me = (await get<{ kind: string; sites: { id: string }[]; sample: string }>('/api/v1/me')) as { kind: string; sites: { id: string }[]; sample: string }
		expect(me.kind).toBe('anonymous')
		expect(me.sites.map((s) => s.id)).toEqual([me.sample])
		expect(fetch).not.toHaveBeenCalled()
		vi.unstubAllGlobals()
	})

	it('is read-only, except for running a funnel', async () => {
		const e = await send('POST', '/api/v1/sites/acme/annotations', { text: 'hi' }).catch((e) => e)
		expect(e).toBeInstanceOf(ApiError)
		expect(e.status).toBe(403)
		await expect(demoSend('DELETE', '/api/v1/sites/acme/funnels/x', undefined)).rejects.toThrow(/read-only/)
		await expect(demoGet('/api/v1/sites/acme/check')).rejects.toThrow(/read-only/)
	})
})

describe('the recordings', () => {
	// read from disk: a glob in a test is resolved once and cached with the test's transform
	const dir = new URL('../src/demo/', import.meta.url)
	const files = Object.fromEntries(readdirSync(dir).map((n) => [n, JSON.parse(readFileSync(new URL(n, dir), 'utf8')) as DemoPeriod]))

	it('cover every period the picker offers, with what Overview opens on', () => {
		for (const p of PERIODS) {
			const f = files[`${p.key}.json`]
			expect(f, p.key).toBeDefined()
			for (const k of ['stats/aggregate?compare=previous', 'stats/timeseries?compare=previous', 'stats/breakdown?property=channel', 'stats/breakdown?property=page', 'stats/vitals'])
				expect(f.entries[k], `${p.key}: ${k}`).toBeDefined()
		}
	})

	it('hold no rate limit or server error in place of an answer', () => {
		for (const [name, f] of Object.entries(files)) {
			if (name === 'site.json') continue
			const bad = Object.entries(f.entries).filter(([, v]) => ((v as { status?: number }).status ?? 0) >= 429)
			expect(bad, name).toEqual([])
		}
	})
})
