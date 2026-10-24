import { searchConsoleQuery, searchTermRows, type Filter, type SearchTermRow } from '@misomoon/core'
import { cached, HttpError, invalidate, type Site } from './control'
import { freshToken, google, googleConfigured, grantToken, type GoogleTokens } from './google'

/** Search Console properties the signed-in Google account can read, best match for the site first. */
export async function searchProperties(env: Env, site: Site, grantId: string) {
	googleConfigured(env)
	const token = await grantToken(env, site, grantId, 'search')
	const r = await google<{ siteEntry?: { siteUrl: string; permissionLevel: string }[] }>(token, 'https://www.googleapis.com/webmasters/v3/sites')
	const host = site.domain.replace(/:\d+$/, '')
	const matches = (url: string) => url === `sc-domain:${host}` || url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') === host
	return (r.siteEntry ?? [])
		.filter((s) => s.permissionLevel !== 'siteUnverifiedUser')
		.map((s) => ({ property: s.siteUrl, matches: matches(s.siteUrl) }))
		.sort((a, b) => Number(b.matches) - Number(a.matches) || a.property.localeCompare(b.property))
}

/** Keeps the grant's tokens for the site and forgets the grant. */
export async function connectSearch(env: Env, site: Site, userId: string | null, grantId: string, property: string) {
	const props = await searchProperties(env, site, grantId)
	if (!props.some((p) => p.property === property)) throw new HttpError(400, 'pick a property from your Search Console account')
	const g = await env.CONTROL.prepare('SELECT access_token, refresh_token, expires_at FROM google_auth WHERE id = ?').bind(grantId).first<GoogleTokens>()
	if (!g?.refresh_token) throw new HttpError(400, 'Google did not grant offline access; connect again')
	await env.CONTROL.batch([
		env.CONTROL.prepare(
			'INSERT INTO search_console (site_id, property, access_token, refresh_token, expires_at, connected_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (site_id) DO UPDATE SET property = excluded.property, access_token = excluded.access_token, refresh_token = excluded.refresh_token, expires_at = excluded.expires_at, connected_by = excluded.connected_by',
		).bind(site.id, property, g.access_token, g.refresh_token, g.expires_at ?? 0, userId, Date.now()),
		env.CONTROL.prepare('DELETE FROM google_auth WHERE id = ?').bind(grantId),
	])
	invalidate(`gsc:${site.id}:`)
	return searchStatus(env, site)
}

export async function disconnectSearch(env: Env, site: Site) {
	const row = await env.CONTROL.prepare('SELECT refresh_token FROM search_console WHERE site_id = ?').bind(site.id).first<{ refresh_token: string }>()
	if (row) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(row.refresh_token)}`, { method: 'POST' }).catch(() => {})
	await env.CONTROL.prepare('DELETE FROM search_console WHERE site_id = ?').bind(site.id).run()
	invalidate(`gsc:${site.id}:`)
}

export async function searchStatus(env: Env, site: Site) {
	const row = await env.CONTROL.prepare('SELECT s.property, s.created_at, u.name AS connected_by FROM search_console s LEFT JOIN users u ON u.id = s.connected_by WHERE s.site_id = ?')
		.bind(site.id)
		.first<{ property: string; created_at: number; connected_by: string | null }>()
	return { available: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET), connected: row }
}

/** Search terms from Google for a window, read live and kept for ten minutes. */
export async function searchTerms(
	env: Env,
	site: Site,
	q: { window: { from: number; to: number }; tzOffset: number; filters: Filter[]; limit: number; page?: number; search?: string },
): Promise<{ rows: SearchTermRow[]; has_more: boolean }> {
	const body = searchConsoleQuery(q.window, q.tzOffset, q.filters, { limit: q.limit + 1, page: q.page, search: q.search })
	body.startRow = (Math.max(q.page ?? 1, 1) - 1) * q.limit
	return cached(
		`gsc:${site.id}:${JSON.stringify(body)}`,
		async () => {
			const row = await env.CONTROL.prepare('SELECT property, access_token, refresh_token, expires_at FROM search_console WHERE site_id = ?').bind(site.id).first<GoogleTokens & { property: string }>()
			if (!row) throw new HttpError(409, 'connect Google Search Console in Settings to see search terms')
			googleConfigured(env)
			const token = await freshToken(env, row, (t, exp) => env.CONTROL.prepare('UPDATE search_console SET access_token = ?, expires_at = ? WHERE site_id = ?').bind(t, exp, site.id).run())
			const rows = searchTermRows(await google(token, `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(row.property)}/searchAnalytics/query`, body))
			return { rows: rows.slice(0, q.limit), has_more: rows.length > q.limit }
		},
		600_000,
	)
}
