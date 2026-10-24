import { can, type Permission, type SiteRole, type TeamRole } from '@misomoon/core'
import { conflict, HttpError, getSite, listSites, type Site } from './control'

export interface Principal {
	/** user: a signed-in browser. key: an API key acting as its user. share: an unlocked shared link. system: cron jobs. */
	kind: 'user' | 'key' | 'share' | 'anonymous' | 'system'
	userId: string | null
	/** the one site a scoped key or shared link may read */
	siteId: string | null
	/** the API key's id, for rate limits */
	keyId?: string
	/** a shared link: read-only, maybe limited to a segment */
	share?: { slug: string; filters: string | null }
}

export const ANONYMOUS: Principal = { kind: 'anonymous', userId: null, siteId: null }
/** Background jobs (reports, alerts) read any site. Never returned by `authenticate`. */
export const SYSTEM: Principal = { kind: 'system', userId: null, siteId: null }

export async function sha256(s: string): Promise<string> {
	const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
	return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Constant-time comparison of two secrets via their digests. */
async function sameSecret(a: string, b: string): Promise<boolean> {
	const [x, y] = await Promise.all([sha256(a), sha256(b)])
	let diff = 0
	for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i)
	return diff === 0
}

/** A random bearer secret with a readable prefix: ms_ sessions, sh_ shared links, mm_ API keys, mi_ invitations, mr_ resets. */
export function secret(prefix: string): string {
	return prefix + [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Salted password hash (PBKDF2), stored as `salt:hash`. */
export async function hashPassword(password: string, salt = crypto.getRandomValues(new Uint8Array(16))): Promise<string> {
	const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
	const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' }, key, 256)
	const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
	return `${hex(salt)}:${hex(new Uint8Array(bits))}`
}

export async function checkPassword(password: string, stored: string): Promise<boolean> {
	const [salt] = stored.split(':')
	const again = await hashPassword(password, new Uint8Array(salt.match(/../g)!.map((h) => parseInt(h, 16))))
	return sameSecret(again, stored)
}

// When each key's last_used_at was last written by this isolate, so a busy client
// writes to the control database about once a minute, not on every request.
const touched = new Map<string, number>()
const TOUCH_EVERY = 60_000

export async function authenticate(env: Env, req: Request): Promise<Principal> {
	// Bearer only: keys in a query string end up in logs, traces and browser history.
	const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
	if (!token) return ANONYMOUS
	const hash = await sha256(token)
	if (token.startsWith('ms_') || token.startsWith('sh_')) {
		const row = await env.CONTROL.prepare(
			`SELECT s.user_id, s.share_slug, l.site_id, g.filters FROM sessions s
			 LEFT JOIN shared_links l ON l.slug = s.share_slug
			 LEFT JOIN segments g ON g.id = l.segment_id
			 WHERE s.hash = ? AND s.expires_at > ? AND (l.slug IS NULL OR l.expires_at IS NULL OR l.expires_at > ?)`,
		)
			.bind(hash, Date.now(), Date.now())
			.first<{ user_id: string | null; share_slug: string | null; site_id: string | null; filters: string | null }>()
		if (!row) throw new HttpError(401, token.startsWith('sh_') ? 'this shared link has expired; open it again' : 'your session has expired; sign in again')
		if (row.share_slug) return { kind: 'share', userId: null, siteId: row.site_id, share: { slug: row.share_slug, filters: row.filters } }
		return { kind: 'user', userId: row.user_id, siteId: null }
	}
	const key = await env.CONTROL.prepare('SELECT id, user_id, site_id FROM api_keys WHERE hash = ?').bind(hash).first<{ id: string; user_id: string; site_id: string | null }>()
	if (!key) throw new HttpError(401, 'invalid API key')
	const now = Date.now()
	if (now - (touched.get(key.id) ?? 0) >= TOUCH_EVERY) {
		touched.set(key.id, now)
		if (touched.size > 1000) touched.delete(touched.keys().next().value!)
		await env.CONTROL.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').bind(now, key.id).run()
	}
	return { kind: 'key', userId: key.user_id, siteId: key.site_id, keyId: key.id }
}

const SESSION_TTL = 30 * 86_400_000

/** Starts a browser session for a user (or an unlocked shared link) and returns its token. */
export async function startSession(env: Env, owner: { userId: string } | { shareSlug: string; expiresAt: number }): Promise<{ token: string; expires_at: number }> {
	const isUser = 'userId' in owner
	const token = secret(isUser ? 'ms_' : 'sh_')
	const expires = isUser ? Date.now() + SESSION_TTL : owner.expiresAt
	await env.CONTROL.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(Date.now()).run()
	await env.CONTROL.prepare('INSERT INTO sessions (hash, user_id, share_slug, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
		.bind(await sha256(token), isUser ? owner.userId : null, isUser ? null : owner.shareSlug, expires, Date.now())
		.run()
	return { token, expires_at: expires }
}

export function requireUser(who: Principal): string {
	if (who.kind === 'user' && who.userId) return who.userId
	throw new HttpError(who.kind === 'anonymous' ? 401 : 403, who.kind === 'key' ? 'API keys cannot do this; sign in to the dashboard' : 'sign in first')
}

/** The user's role on a team, or null. */
export async function teamRole(env: Env, userId: string | null, teamId: string): Promise<TeamRole | null> {
	if (!userId) return null
	const row = await env.CONTROL.prepare('SELECT role FROM team_members WHERE team_id = ? AND user_id = ?').bind(teamId, userId).first<{ role: TeamRole }>()
	return row?.role ?? null
}

/** A team role covers every site of the team; otherwise a guest role on this one site. */
export async function siteRole(env: Env, who: Principal, site: Site): Promise<SiteRole | null> {
	if (!who.userId || (who.siteId && who.siteId !== site.id)) return null
	const row = await env.CONTROL.prepare(
		`SELECT (SELECT role FROM team_members WHERE team_id = ? AND user_id = ?) AS team,
		        (SELECT role FROM site_guests WHERE site_id = ? AND user_id = ?) AS guest`,
	)
		.bind(site.team_id, who.userId, site.id, who.userId)
		.first<{ team: TeamRole | null; guest: 'editor' | 'viewer' | null }>()
	return row?.team ?? (row?.guest ? `guest_${row.guest}` : null)
}

/**
 * Loads a site and checks that `who` may act on it. Public sites and shared links are
 * readable only; everything else follows the person's role.
 */
export async function authorize(env: Env, who: Principal, siteId: string | null | undefined, need: Permission = 'read'): Promise<Site> {
	if (!siteId) throw new HttpError(400, 'site is required')
	const site = await getSite(env, siteId)
	if (!site) throw new HttpError(404, `site ${siteId} not found`)
	if (who.kind === 'system') return site
	if (need === 'read' && (site.public || (who.kind === 'share' && who.siteId === site.id))) return site
	if (can(await siteRole(env, who, site), need)) return site
	if (who.kind === 'anonymous') throw new HttpError(401, 'sign in to see this site')
	throw new HttpError(403, need === 'read' ? 'you do not have access to this site' : `your role on ${site.name} cannot do this`)
}

/** The sites `who` can open, with their role. The public demo shows when signed out. */
export async function visibleSites(env: Env, who: Principal): Promise<(Site & { role: SiteRole | null })[]> {
	const sites = await listSites(env)
	if (who.kind === 'anonymous') return sites.filter((s) => s.public).map((s) => ({ ...s, role: null }))
	if (who.kind === 'share') return sites.filter((s) => s.id === who.siteId).map((s) => ({ ...s, role: null }))
	if (!who.userId) return []
	const [teams, guests] = await Promise.all([
		env.CONTROL.prepare('SELECT team_id, role FROM team_members WHERE user_id = ?').bind(who.userId).all<{ team_id: string; role: TeamRole }>(),
		env.CONTROL.prepare('SELECT site_id, role FROM site_guests WHERE user_id = ?').bind(who.userId).all<{ site_id: string; role: 'editor' | 'viewer' }>(),
	])
	const byTeam = new Map(teams.results.map((r) => [r.team_id, r.role]))
	const byGuest = new Map(guests.results.map((r) => [r.site_id, r.role]))
	return sites
		.filter((s) => !who.siteId || s.id === who.siteId)
		.map((s) => ({ ...s, role: (byTeam.get(s.team_id) ?? (byGuest.has(s.id) ? (`guest_${byGuest.get(s.id)}` as SiteRole) : null)) as SiteRole | null }))
		.filter((s) => s.role)
}

export async function createKey(env: Env, userId: string, name: string, siteId: string | null) {
	const key = secret('mm_')
	const id = crypto.randomUUID()
	await env.CONTROL.prepare('INSERT INTO api_keys (id, name, hash, prefix, user_id, site_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
		.bind(id, name, await sha256(key), key.slice(0, 10), userId, siteId, Date.now())
		.run()
		.catch((e) => conflict(e, 400, `unknown site: ${siteId}`))
	return { id, name, key, prefix: key.slice(0, 10), site_id: siteId }
}

// ---------------------------------------------------------------- shared links

export interface SharedLink {
	slug: string
	site_id: string
	name: string
	password_hash: string | null
	segment_id: string | null
	expires_at: number | null
	created_at: number
}

export async function getSharedLink(env: Env, slug: string): Promise<SharedLink | null> {
	const link = await env.CONTROL.prepare('SELECT * FROM shared_links WHERE slug = ?').bind(slug).first<SharedLink>()
	if (!link || (link.expires_at && link.expires_at < Date.now())) return null
	return link
}

const SHARE_TTL = 7 * 86_400_000

/** Trades a shared link (and its password, when it has one) for a read-only session. */
export async function unlockShare(env: Env, slug: string, password: string | undefined) {
	const link = await getSharedLink(env, slug)
	if (!link) throw new HttpError(404, 'this link has expired or was removed')
	if (link.password_hash && !(password && (await checkPassword(password, link.password_hash)))) throw new HttpError(401, 'wrong password')
	const session = await startSession(env, { shareSlug: slug, expiresAt: Math.min(Date.now() + SHARE_TTL, link.expires_at ?? Infinity) })
	return { token: session.token, site: link.site_id, name: link.name, expires_at: session.expires_at }
}
