import { describe, expect, it, vi } from 'vite-plus/test'
import { cachedLive, toLive, type Live } from './live.ts'

const LIVE = { visitors: 10 } as Live

/** A Cache API stand-in that keeps what was put, with its max-age. */
function memoryCache() {
	const store = new Map<string, { body: string; maxAge: number }>()
	return {
		store,
		match: async (key: string) => {
			const hit = store.get(key)
			return hit ? new Response(hit.body) : undefined
		},
		put: async (key: string, res: Response) => {
			const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '')?.[1])
			store.set(key, { body: await res.text(), maxAge })
		},
	}
}

describe('the live numbers cache (F34)', () => {
	it('serves a cached value without asking the API', async () => {
		const cache = memoryCache()
		cache.store.set('k', { body: JSON.stringify(LIVE), maxAge: 60 })
		const fresh = vi.fn(async () => null)
		expect(await cachedLive({ cache, key: 'k', fresh, waitUntil: () => {} })).toEqual(LIVE)
		expect(fresh).not.toHaveBeenCalled()
	})

	it('fetches on a miss and keeps the result for a minute', async () => {
		const cache = memoryCache()
		const pending: Promise<unknown>[] = []
		expect(await cachedLive({ cache, key: 'k', fresh: async () => LIVE, waitUntil: (p) => void pending.push(p) })).toEqual(LIVE)
		await Promise.all(pending)
		expect(cache.store.get('k')).toEqual({ body: JSON.stringify(LIVE), maxAge: 60 })
	})

	it('remembers for 15 seconds that the API is down, so the next views do not all try again', async () => {
		const cache = memoryCache()
		const pending: Promise<unknown>[] = []
		const fresh = vi.fn(async () => null)
		const opts = { cache, key: 'k', fresh, waitUntil: (p: Promise<unknown>) => void pending.push(p) }
		expect(await cachedLive(opts)).toBeNull()
		await Promise.all(pending)
		expect(cache.store.get('k')?.maxAge).toBe(15)
		expect(await cachedLive(opts)).toBeNull()
		expect(fresh).toHaveBeenCalledTimes(1)
	})

	it('treats a failing cache as a miss instead of failing the page', async () => {
		const cache = { match: async () => Promise.reject(new Error('cache down')), put: async () => Promise.reject(new Error('cache down')) }
		expect(await cachedLive({ cache, key: 'k', fresh: async () => LIVE, waitUntil: (p) => void p.catch(() => {}) })).toEqual(LIVE)
	})

	it('works without a cache', async () => {
		expect(await cachedLive({ cache: undefined, key: 'k', fresh: async () => LIVE, waitUntil: () => {} })).toEqual(LIVE)
	})
})

describe('mapping API answers for the hero (F33)', () => {
	const point = (t: number, visitors: number) => ({ t, visitors })
	const answers = {
		agg: {
			current: { visitors: 3200, pageviews: 9000, bounce_rate: 48.1, visit_duration: 122 },
			change: { visitors: 22.2, pageviews: 23.7, bounce_rate: -1, visit_duration: 2.5 },
		},
		channels: {
			total_visitors: 200,
			rows: [
				{ key: 'Direct', visitors: 80 },
				{ key: 'Organic Search', visitors: 60 },
				{ key: 'AI Assistants', visitors: 30 },
				{ key: 'Email', visitors: 20 },
				{ key: 'Referral', visitors: 6 },
				{ key: 'Paid', visitors: 4 },
			],
		},
		realtime: { visitors: 4 },
		yesterday: { current: { visitors: 120 }, change: { visitors: -5 } },
		sources: { rows: [{ key: 'Google' }] },
		pages: { rows: [{ key: '/' }] },
		series: { points: [point(1, 90), point(2, 140)], previous: [point(0, 80), point(1, 70)] },
		vitals: {
			vitals: [
				{ name: 'lcp', p75: 2100 },
				{ name: 'inp', p75: 140 },
				{ name: 'cls', p75: 0.04 },
				{ name: 'fcp', p75: 900 },
				{ name: 'ttfb', p75: null },
			],
		},
	}

	it('keeps every figure the hero draws', () => {
		expect(toLive(answers)).toEqual({
			visitors: 3200,
			pageviews: 9000,
			bounce_rate: 48.1,
			visit_duration: 122,
			change: { visitors: 22.2, pageviews: 23.7, bounce_rate: -1, visit_duration: 2.5 },
			ai_share: 15,
			channels: [
				['Direct', 40],
				['Organic Search', 30],
				['AI Assistants', 15],
				['Email', 10],
				['Referral', 3],
			],
			now: 4,
			yesterday: 120,
			yesterday_change: -5,
			top_source: 'Google',
			top_page: '/',
			days: [point(1, 90), point(2, 140)],
			previous: [80, 70],
			vitals: { lcp: 2100, inp: 140, cls: 0.04, ttfb: null },
		})
	})

	it('copes with no comparison and no traffic', () => {
		const live = toLive({ ...answers, agg: { ...answers.agg, change: null }, channels: { total_visitors: 0, rows: [] }, series: { points: [], previous: null } })
		expect([live.change, live.ai_share, live.channels, live.previous]).toEqual([null, null, [], []])
	})
})
