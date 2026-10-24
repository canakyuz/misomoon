import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import type { Site } from './control'
import { searchTerms } from './searchconsole'

const site: Site = { id: 'gsc-test', domain: 'shop.com', name: 'shop.com', timezone: 'UTC', currency: 'USD', team_id: 't', public: 0, ingest_cap: null, features: null, search_params: null, include_paths: null, exclude_paths: null, exclude_ips: null, privacy_signals: 0, retention_days: null, region: null, created_at: 0 }

/** A CONTROL binding that answers the one lookup searchTerms makes. */
function env(row: Record<string, unknown> | null) {
	const updates: unknown[][] = []
	const stmt = (sql: string) => ({
		bind: (...args: unknown[]) => ({
			first: async () => (sql.startsWith('SELECT') ? row : null),
			run: async () => (updates.push(args), {}),
		}),
	})
	return { env: { CONTROL: { prepare: stmt }, GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' } as unknown as Env, updates }
}

afterEach(() => vi.unstubAllGlobals())

describe('Search Console search terms', () => {
	it('refreshes an expired token, queries the property and maps the rows', async () => {
		const calls: { url: string; body: unknown }[] = []
		vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
			calls.push({ url, body: init?.body instanceof URLSearchParams ? Object.fromEntries(init.body) : init?.body ? JSON.parse(String(init.body)) : null })
			if (url.startsWith('https://oauth2.googleapis.com/token')) return Response.json({ access_token: 'fresh', expires_in: 3600 })
			return Response.json({ rows: [{ keys: ['shop analytics'], clicks: 9, impressions: 120, ctr: 0.075, position: 4.24 }, { keys: ['shop'], clicks: 3, impressions: 40, ctr: 0.075, position: 7 }] })
		})
		const { env: e, updates } = env({ property: 'sc-domain:shop.com', access_token: 'old', refresh_token: 'r', expires_at: 0 })
		const day = Date.UTC(2026, 9, 1)
		const res = await searchTerms(e, site, { window: { from: day, to: day + 86_400_000 }, tzOffset: 0, filters: [{ dim: 'page', op: '==', values: ['/pricing'] }], limit: 1 })
		expect(res).toEqual({ rows: [{ key: 'shop analytics', visitors: 9, clicks: 9, impressions: 120, ctr: 7.5, position: 4.2 }], has_more: true })
		expect(calls[0].body).toMatchObject({ grant_type: 'refresh_token', refresh_token: 'r' })
		expect(calls[1].url).toBe('https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Ashop.com/searchAnalytics/query')
		expect(calls[1].body).toMatchObject({ startDate: '2026-10-01', endDate: '2026-10-01', rowLimit: 2, startRow: 0 })
		expect(updates[0]).toEqual(['fresh', expect.any(Number), 'gsc-test'])
	})

	it('asks to connect when the site has no property', async () => {
		const { env: e } = env(null)
		await expect(searchTerms(e, { ...site, id: 'gsc-none' }, { window: { from: 0, to: 86_400_000 }, tzOffset: 0, filters: [], limit: 10 })).rejects.toThrow(/connect Google Search Console/)
	})
})
