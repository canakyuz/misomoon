import { canAssign, isGuestRole, isTeamRole, keepsOwner, PLAN_REQUIRED, PLAN_SITE_LIMIT, planRequiredMessage, renderNotice, siteLimitMessage, trialEnd, type TeamRole } from '@misomoon/core'
import { Hono, type Context } from 'hono'
import { authorize, checkPassword, createKey, hashPassword, requireUser, secret, sha256, startSession, teamRole, type Principal } from './auth'
import { HttpError, getSite, invalidate, type Site } from './control'
import { plansEnforced, teamTermsOf } from './plans'
import { emailConfigured, sendEmail } from './reports'
import { deleteSite } from './sites'

type App = { Bindings: Env; Variables: { who: Principal } }

/** Sign-in, accounts, teams, members, guests, invitations and API keys. Mounted at /api/v1. */
export const accounts = new Hono<App>()

interface User {
	id: string
	email: string
	name: string
	password_hash: string
	created_at: number
}

const INVITE_TTL = 7 * 86_400_000
const RESET_TTL = 3_600_000
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const origin = (c: Context<App>) => c.env.PUBLIC_URL || new URL(c.req.url).origin

function validPassword(p: unknown): string {
	if (typeof p !== 'string' || p.length < 10) throw new HttpError(400, 'passwords need at least 10 characters')
	if (p.length > 200) throw new HttpError(400, 'that password is too long')
	return p
}

async function limited(c: Context<App>, what: string) {
	const ip = c.req.header('cf-connecting-ip') ?? 'unknown'
	if (c.env.STATS_LIMIT && !(await c.env.STATS_LIMIT.limit({ key: `${what}:${ip}` })).success) throw new HttpError(429, 'too many attempts, wait a minute')
}

const getUser = (env: Env, id: string) => env.CONTROL.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<User>()
const userByEmail = (env: Env, email: string) => env.CONTROL.prepare('SELECT * FROM users WHERE email = ?').bind(email.trim()).first<User>()
const publicUser = (u: User) => ({ id: u.id, email: u.email, name: u.name })

/** Invite-only servers still let the first account sign up, so a fresh deploy can be claimed. Closed servers take none. */
export const signupsOpen = async (env: Env) =>
	env.SIGNUPS !== 'closed' && (env.SIGNUPS !== 'invite' || !(await env.CONTROL.prepare('SELECT 1 FROM users LIMIT 1').first()))

async function createUser(env: Env, input: { email?: unknown; name?: unknown; password?: unknown }, onlyFirst = false): Promise<User> {
	const email = String(input.email ?? '').trim().toLowerCase()
	if (!EMAIL.test(email)) throw new HttpError(400, 'a valid email is required')
	if (await userByEmail(env, email)) throw new HttpError(409, 'there is already an account for this email; sign in instead')
	const user: User = { id: crypto.randomUUID(), email, name: String(input.name ?? '').trim().slice(0, 80) || email.split('@')[0], password_hash: await hashPassword(validPassword(input.password)), created_at: Date.now() }
	// onlyFirst: the check and the insert are one statement, so two first sign-ups can't both land
	const sql = onlyFirst
		? 'INSERT INTO users (id, email, name, password_hash, created_at) SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM users)'
		: 'INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)'
	const r = await env.CONTROL.prepare(sql).bind(user.id, user.email, user.name, user.password_hash, user.created_at).run()
	if (!r.meta.changes) throw new HttpError(403, 'sign-up is by invitation on this server')
	return user
}

/**
 * Makes a team with `ownerId` as its owner. With plans on, it gets the free trial only when
 * it is the first team that person creates: `users.trial_started_at` is set in the same
 * batch, and the team's `trial_ends_at` is TRIAL_DAYS later only when that update changed
 * the row. Any later team starts with `trial_ends_at = created_at`, so it needs a plan.
 */
export async function createTeam(env: Env, ownerId: string, name: string) {
	const team = { id: crypto.randomUUID(), name: name.trim().slice(0, 80) || 'My team', created_at: Date.now() }
	const insert = plansEnforced(env)
		? [
				env.CONTROL.prepare('UPDATE users SET trial_started_at = ? WHERE id = ? AND trial_started_at IS NULL').bind(team.created_at, ownerId),
				// changes() is the update's: 1 when this is the person's first trial
				env.CONTROL.prepare('INSERT INTO teams (id, name, created_at, trial_ends_at) SELECT ?, ?, ?, CASE WHEN changes() > 0 THEN ? ELSE ? END').bind(
					team.id,
					team.name,
					team.created_at,
					trialEnd(team.created_at, true),
					trialEnd(team.created_at, false),
				),
			]
		: [env.CONTROL.prepare('INSERT INTO teams (id, name, created_at) VALUES (?, ?, ?)').bind(team.id, team.name, team.created_at)]
	await env.CONTROL.batch([
		...insert,
		env.CONTROL.prepare("INSERT INTO team_members (team_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)").bind(team.id, ownerId, team.created_at),
	])
	return { ...team, role: 'owner' as TeamRole }
}

async function requireTeamRole(env: Env, who: Principal, teamId: string, allowed: TeamRole[]): Promise<TeamRole> {
	const role = await teamRole(env, requireUser(who), teamId)
	if (!role) throw new HttpError(404, 'team not found')
	if (!allowed.includes(role)) throw new HttpError(403, `a team ${role} cannot do this`)
	return role
}

const countOwners = async (env: Env, teamId: string) =>
	(await env.CONTROL.prepare("SELECT COUNT(*) AS n FROM team_members WHERE team_id = ? AND role = 'owner'").bind(teamId).first<{ n: number }>())?.n ?? 0

// ---------------------------------------------------------------- sign-in

accounts.post('/auth/signup', async (c) => {
	await limited(c, 'signup')
	if (!(await signupsOpen(c.env))) throw new HttpError(403, 'sign-up is by invitation on this server')
	const body = await c.req.json<{ email?: string; name?: string; password?: string }>()
	const user = await createUser(c.env, body, c.env.SIGNUPS === 'invite')
	await createTeam(c.env, user.id, `${user.name}'s sites`)
	return c.json({ ...(await startSession(c.env, { userId: user.id })), user: publicUser(user) }, 201)
})

accounts.post('/auth/login', async (c) => {
	await limited(c, 'login')
	const body = await c.req.json<{ email?: string; password?: string }>()
	const user = body.email ? await userByEmail(c.env, body.email) : null
	// same answer and similar time whether or not the email exists
	const ok = await checkPassword(String(body.password ?? ''), user?.password_hash ?? '00:00')
	if (!user || !ok) throw new HttpError(401, 'wrong email or password')
	return c.json({ ...(await startSession(c.env, { userId: user.id })), user: publicUser(user) })
})

accounts.post('/auth/logout', async (c) => {
	const token = (c.req.header('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
	if (token.startsWith('ms_')) await c.env.CONTROL.prepare('DELETE FROM sessions WHERE hash = ?').bind(await sha256(token)).run()
	return c.body(null, 204)
})

accounts.post('/auth/forgot', async (c) => {
	await limited(c, 'forgot')
	const body = await c.req.json<{ email?: string }>()
	const user = body.email ? await userByEmail(c.env, body.email) : null
	if (user) {
		const token = secret('mr_')
		await c.env.CONTROL.prepare('DELETE FROM password_resets WHERE user_id = ? OR expires_at < ?').bind(user.id, Date.now()).run()
		await c.env.CONTROL.prepare('INSERT INTO password_resets (hash, user_id, expires_at) VALUES (?, ?, ?)').bind(await sha256(token), user.id, Date.now() + RESET_TTL).run()
		await sendEmail(
			c.env,
			user.email,
			renderNotice({ label: 'password', subject: 'Reset your password', detail: `Someone asked to reset the misomoon password for ${user.email}. The link works for an hour.`, cta: 'Set a new password', link: `${origin(c)}/reset/${token}`, footnote: "If it wasn't you, ignore this email." }),
		)
	}
	return c.json({ ok: true, sending: emailConfigured(c.env) })
})

accounts.post('/auth/reset', async (c) => {
	await limited(c, 'reset')
	const body = await c.req.json<{ token?: string; password?: string }>()
	const row = body.token ? await c.env.CONTROL.prepare('SELECT user_id FROM password_resets WHERE hash = ? AND expires_at > ?').bind(await sha256(body.token), Date.now()).first<{ user_id: string }>() : null
	if (!row) throw new HttpError(400, 'this reset link has expired; ask for a new one')
	await c.env.CONTROL.batch([
		c.env.CONTROL.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword(validPassword(body.password)), row.user_id),
		c.env.CONTROL.prepare('DELETE FROM password_resets WHERE user_id = ?').bind(row.user_id),
		// signs out everywhere else
		c.env.CONTROL.prepare('DELETE FROM sessions WHERE user_id = ?').bind(row.user_id),
	])
	return c.json(await startSession(c.env, { userId: row.user_id }))
})

accounts.patch('/me', async (c) => {
	const userId = requireUser(c.get('who'))
	const user = (await getUser(c.env, userId))!
	const body = await c.req.json<{ name?: string; password?: string; current_password?: string }>()
	if (body.password) {
		if (!(await checkPassword(String(body.current_password ?? ''), user.password_hash))) throw new HttpError(401, 'your current password is wrong')
		await c.env.CONTROL.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword(validPassword(body.password)), userId).run()
	}
	if (body.name?.trim()) await c.env.CONTROL.prepare('UPDATE users SET name = ? WHERE id = ?').bind(body.name.trim().slice(0, 80), userId).run()
	return c.json(publicUser((await getUser(c.env, userId))!))
})

/**
 * Deletes your account. Teams only you are in go with their sites and stats; you leave the
 * others. An only owner of a team with other members hands it on first.
 */
/**
 * Deleting a team leaves its Polar subscription billing, so a team whose plan still renews
 * (active or past due, not canceled at the end of its period) can't go until it is canceled.
 */
async function refuseWhileRenewing(env: Env, team: { id: string; name: string }) {
	const renewing = await env.CONTROL.prepare("SELECT 1 FROM polar_subscriptions WHERE team_id = ? AND live = 1 AND plan_status IN ('active', 'past_due') LIMIT 1").bind(team.id).first()
	if (renewing) throw new HttpError(409, `cancel the plan of ${team.name} first, under Settings > Team > Manage billing; the team can go once it stops renewing`)
}

accounts.delete('/me', async (c) => {
	const userId = requireUser(c.get('who'))
	await limited(c, 'delete')
	const user = (await getUser(c.env, userId))!
	const body = await c.req.json<{ password?: unknown }>().catch(() => ({}) as { password?: unknown })
	if (!(await checkPassword(String(body.password ?? ''), user.password_hash))) throw new HttpError(401, 'your password is wrong')
	const { results: teams } = await c.env.CONTROL.prepare(
		`SELECT t.id, t.name, m.role, (SELECT COUNT(*) FROM team_members WHERE team_id = t.id) AS members,
			(SELECT COUNT(*) FROM team_members WHERE team_id = t.id AND role = 'owner') AS owners
		 FROM teams t JOIN team_members m ON m.team_id = t.id AND m.user_id = ?`,
	)
		.bind(userId)
		.all<{ id: string; name: string; role: TeamRole; members: number; owners: number }>()
	const held = teams.find((t) => t.role === 'owner' && t.owners === 1 && t.members > 1)
	if (held) throw new HttpError(409, `you are the only owner of ${held.name}; make someone else owner or remove its members first`)
	for (const team of teams.filter((t) => t.members === 1)) await refuseWhileRenewing(c.env, team)
	for (const team of teams.filter((t) => t.members === 1)) {
		const { results: sites } = await c.env.CONTROL.prepare('SELECT * FROM sites WHERE team_id = ?').bind(team.id).all<Site>()
		for (const site of sites) await deleteSite(c.env, site)
		await c.env.CONTROL.prepare('DELETE FROM teams WHERE id = ?').bind(team.id).run()
	}
	// memberships, guest access, sessions, keys and saved segments go with the user row
	await c.env.CONTROL.batch([
		c.env.CONTROL.prepare('DELETE FROM invitations WHERE email = ?').bind(user.email),
		c.env.CONTROL.prepare('DELETE FROM email_reports WHERE email = ? COLLATE NOCASE').bind(user.email),
		c.env.CONTROL.prepare('DELETE FROM users WHERE id = ?').bind(userId),
	])
	return c.body(null, 204)
})

// ---------------------------------------------------------------- teams

accounts.get('/teams', async (c) => {
	const userId = requireUser(c.get('who'))
	const { results } = await c.env.CONTROL.prepare(
		`SELECT t.id, t.name, m.role, (SELECT COUNT(*) FROM team_members WHERE team_id = t.id) AS members, (SELECT COUNT(*) FROM sites WHERE team_id = t.id) AS sites
		 FROM teams t JOIN team_members m ON m.team_id = t.id AND m.user_id = ? ORDER BY t.created_at`,
	)
		.bind(userId)
		.all()
	return c.json(results)
})

accounts.post('/teams', async (c) => {
	const userId = requireUser(c.get('who'))
	const body = await c.req.json<{ name?: string }>()
	return c.json(await createTeam(c.env, userId, body.name ?? ''), 201)
})

accounts.patch('/teams/:team', async (c) => {
	await requireTeamRole(c.env, c.get('who'), c.req.param('team'), ['owner', 'admin'])
	const body = await c.req.json<{ name?: string }>()
	if (!body.name?.trim()) throw new HttpError(400, 'name is required')
	await c.env.CONTROL.prepare('UPDATE teams SET name = ? WHERE id = ?').bind(body.name.trim().slice(0, 80), c.req.param('team')).run()
	return c.json({ ok: true })
})

accounts.delete('/teams/:team', async (c) => {
	const teamId = c.req.param('team')
	await requireTeamRole(c.env, c.get('who'), teamId, ['owner'])
	const team = await c.env.CONTROL.prepare('SELECT id, name FROM teams WHERE id = ?').bind(teamId).first<{ id: string; name: string }>()
	if (team) await refuseWhileRenewing(c.env, team)
	const sites = await c.env.CONTROL.prepare('SELECT COUNT(*) AS n FROM sites WHERE team_id = ?').bind(teamId).first<{ n: number }>()
	if (sites?.n) throw new HttpError(409, 'move or delete the team’s sites first')
	await c.env.CONTROL.prepare('DELETE FROM teams WHERE id = ?').bind(teamId).run()
	return c.body(null, 204)
})

/** Members, pending invitations and the guests of each site: what the Team settings show. */
accounts.get('/teams/:team/members', async (c) => {
	const teamId = c.req.param('team')
	await requireTeamRole(c.env, c.get('who'), teamId, ['owner', 'admin'])
	const [members, guests, invites] = await Promise.all([
		c.env.CONTROL.prepare('SELECT u.id, u.email, u.name, m.role, m.created_at FROM team_members m JOIN users u ON u.id = m.user_id WHERE m.team_id = ? ORDER BY m.created_at').bind(teamId).all(),
		c.env.CONTROL.prepare('SELECT u.id, u.email, u.name, g.role, g.site_id FROM site_guests g JOIN users u ON u.id = g.user_id JOIN sites s ON s.id = g.site_id WHERE s.team_id = ? ORDER BY g.created_at').bind(teamId).all(),
		c.env.CONTROL.prepare('SELECT id, email, role, site_id, expires_at, created_at FROM invitations WHERE team_id = ? AND expires_at > ? ORDER BY created_at').bind(teamId, Date.now()).all(),
	])
	return c.json({ members: members.results, guests: guests.results, invitations: invites.results })
})

accounts.patch('/teams/:team/members/:user', async (c) => {
	const teamId = c.req.param('team')
	const actor = await requireTeamRole(c.env, c.get('who'), teamId, ['owner', 'admin'])
	const body = await c.req.json<{ role?: string }>()
	if (!isTeamRole(body.role)) throw new HttpError(400, 'role is owner, admin, editor, viewer or billing')
	const from = await teamRole(c.env, c.req.param('user'), teamId)
	if (!from) throw new HttpError(404, 'not a member of this team')
	if (!canAssign(actor, from, body.role)) throw new HttpError(403, 'only an owner can change owners or make new ones')
	if (!keepsOwner(await countOwners(c.env, teamId), from, body.role)) throw new HttpError(409, 'a team needs an owner; make someone else owner first')
	await c.env.CONTROL.prepare('UPDATE team_members SET role = ? WHERE team_id = ? AND user_id = ?').bind(body.role, teamId, c.req.param('user')).run()
	return c.json({ ok: true })
})

/** Remove a member, or leave the team yourself. */
accounts.delete('/teams/:team/members/:user', async (c) => {
	const teamId = c.req.param('team')
	const target = c.req.param('user')
	const self = requireUser(c.get('who')) === target
	const actor = self ? await requireTeamRole(c.env, c.get('who'), teamId, ['owner', 'admin', 'editor', 'viewer', 'billing']) : await requireTeamRole(c.env, c.get('who'), teamId, ['owner', 'admin'])
	const from = await teamRole(c.env, target, teamId)
	if (!from) throw new HttpError(404, 'not a member of this team')
	if (!self && !canAssign(actor, from, null)) throw new HttpError(403, 'only an owner can remove an owner')
	if (!keepsOwner(await countOwners(c.env, teamId), from, null)) throw new HttpError(409, 'a team needs an owner; make someone else owner first')
	await c.env.CONTROL.prepare('DELETE FROM team_members WHERE team_id = ? AND user_id = ?').bind(teamId, target).run()
	return c.body(null, 204)
})

// ---------------------------------------------------------------- guests

accounts.patch('/sites/:id/guests/:user', async (c) => {
	const site = await authorize(c.env, c.get('who'), c.req.param('id'), 'manage')
	const body = await c.req.json<{ role?: string }>()
	if (!isGuestRole(body.role)) throw new HttpError(400, 'a guest is an editor or a viewer')
	await c.env.CONTROL.prepare('UPDATE site_guests SET role = ? WHERE site_id = ? AND user_id = ?').bind(body.role, site.id, c.req.param('user')).run()
	return c.json({ ok: true })
})

accounts.delete('/sites/:id/guests/:user', async (c) => {
	const who = c.get('who')
	const self = who.userId === c.req.param('user')
	const site = await authorize(c.env, who, c.req.param('id'), self ? 'read' : 'manage')
	await c.env.CONTROL.prepare('DELETE FROM site_guests WHERE site_id = ? AND user_id = ?').bind(site.id, c.req.param('user')).run()
	return c.body(null, 204)
})

// ---------------------------------------------------------------- invitations

accounts.post('/teams/:team/invitations', async (c) => {
	const teamId = c.req.param('team')
	const who = c.get('who')
	const body = await c.req.json<{ email?: string; role?: string; site?: string }>()
	const email = String(body.email ?? '').trim().toLowerCase()
	if (!EMAIL.test(email)) throw new HttpError(400, 'a valid email is required')
	let actor: TeamRole
	let siteName: string | null = null
	if (body.site) {
		// a guest on one site
		const site = await authorize(c.env, who, body.site, 'manage')
		if (site.team_id !== teamId) throw new HttpError(400, 'that site belongs to another team')
		if (!isGuestRole(body.role)) throw new HttpError(400, 'a guest is an editor or a viewer')
		actor = (await teamRole(c.env, who.userId, teamId))!
		siteName = site.name
	} else {
		actor = await requireTeamRole(c.env, who, teamId, ['owner', 'admin'])
		if (!isTeamRole(body.role)) throw new HttpError(400, 'role is owner, admin, editor, viewer or billing')
		if (!canAssign(actor, null, body.role)) throw new HttpError(403, 'only an owner can invite another owner')
		const existing = await userByEmail(c.env, email)
		if (existing && (await teamRole(c.env, existing.id, teamId))) throw new HttpError(409, `${email} is already on this team`)
	}
	const token = secret('mi_')
	const id = crypto.randomUUID()
	await c.env.CONTROL.batch([
		c.env.CONTROL.prepare('DELETE FROM invitations WHERE team_id = ? AND email = ? AND site_id IS ?').bind(teamId, email, body.site ?? null),
		c.env.CONTROL.prepare('INSERT INTO invitations (id, team_id, site_id, email, role, hash, invited_by, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(
			id,
			teamId,
			body.site ?? null,
			email,
			body.role,
			await sha256(token),
			who.userId,
			Date.now() + INVITE_TTL,
			Date.now(),
		),
	])
	const team = await c.env.CONTROL.prepare('SELECT name FROM teams WHERE id = ?').bind(teamId).first<{ name: string }>()
	const inviter = await getUser(c.env, who.userId!)
	const url = `${origin(c)}/invite/${token}`
	const where = siteName ? `${siteName} on misomoon` : `the ${team?.name} team on misomoon`
	const sent = await sendEmail(
		c.env,
		email,
		renderNotice({ label: 'invitation', subject: `Join ${siteName ?? team?.name}`, detail: `${inviter?.name ?? 'Someone'} invited you to ${where} as ${body.role}.`, cta: 'Accept the invitation', link: url, footnote: 'The link works for 7 days.' }),
	)
	// The link is returned too, so it can be sent another way when email isn't set up.
	return c.json({ id, email, role: body.role, site_id: body.site ?? null, url, sent }, 201)
})

accounts.delete('/teams/:team/invitations/:invitation', async (c) => {
	await requireTeamRole(c.env, c.get('who'), c.req.param('team'), ['owner', 'admin'])
	await c.env.CONTROL.prepare('DELETE FROM invitations WHERE id = ? AND team_id = ?').bind(c.req.param('invitation'), c.req.param('team')).run()
	return c.body(null, 204)
})

interface Invitation {
	id: string
	team_id: string
	site_id: string | null
	email: string
	role: string
	invited_by: string | null
}

async function findInvitation(env: Env, token: string): Promise<Invitation> {
	const row = await env.CONTROL.prepare('SELECT id, team_id, site_id, email, role, invited_by FROM invitations WHERE hash = ? AND expires_at > ?').bind(await sha256(token), Date.now()).first<Invitation>()
	if (!row) throw new HttpError(404, 'this invitation has expired or was withdrawn')
	return row
}

// Public: what the invitation is for, so the page can greet the person.
accounts.get('/invitations/:token', async (c) => {
	const inv = await findInvitation(c.env, c.req.param('token'))
	const [team, site, inviter, account] = await Promise.all([
		c.env.CONTROL.prepare('SELECT name FROM teams WHERE id = ?').bind(inv.team_id).first<{ name: string }>(),
		inv.site_id ? getSite(c.env, inv.site_id) : null,
		inv.invited_by ? getUser(c.env, inv.invited_by) : null,
		userByEmail(c.env, inv.email),
	])
	return c.json({ email: inv.email, role: inv.role, team: team?.name, site: site?.name ?? null, invited_by: inviter?.name ?? null, has_account: !!account })
})

/** Accept while signed in as the invited email, or create the account in the same step. */
accounts.post('/invitations/:token/accept', async (c) => {
	await limited(c, 'accept')
	const inv = await findInvitation(c.env, c.req.param('token'))
	const who = c.get('who')
	let userId: string
	let session: { token: string; expires_at: number } | null = null
	if (who.kind === 'user') {
		const me = (await getUser(c.env, who.userId!))!
		if (me.email.toLowerCase() !== inv.email.toLowerCase()) throw new HttpError(403, `this invitation is for ${inv.email}; sign in with that email`)
		userId = me.id
	} else {
		const body = await c.req.json<{ name?: string; password?: string }>()
		const user = await createUser(c.env, { email: inv.email, name: body.name, password: body.password })
		userId = user.id
		session = await startSession(c.env, { userId })
	}
	const now = Date.now()
	const join = inv.site_id
		? c.env.CONTROL.prepare('INSERT INTO site_guests (site_id, user_id, role, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (site_id, user_id) DO UPDATE SET role = excluded.role').bind(inv.site_id, userId, inv.role, now)
		: c.env.CONTROL.prepare('INSERT INTO team_members (team_id, user_id, role, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (team_id, user_id) DO NOTHING').bind(inv.team_id, userId, inv.role, now)
	await c.env.CONTROL.batch([join, c.env.CONTROL.prepare('DELETE FROM invitations WHERE id = ?').bind(inv.id)])
	const site = inv.site_id ?? (await c.env.CONTROL.prepare('SELECT id FROM sites WHERE team_id = ? ORDER BY created_at LIMIT 1').bind(inv.team_id).first<{ id: string }>())?.id ?? null
	return c.json({ ...(session ?? {}), site, team: inv.team_id })
})

// ---------------------------------------------------------------- sites across teams

/** Moves a site to another team the person owns or administers. */
accounts.post('/sites/:id/transfer', async (c) => {
	const who = c.get('who')
	const site = await authorize(c.env, who, c.req.param('id'), 'own')
	const body = await c.req.json<{ team?: string }>()
	if (!body.team || body.team === site.team_id) throw new HttpError(400, 'pick another team')
	await requireTeamRole(c.env, who, body.team, ['owner', 'admin'])
	// With plans on, the receiving team needs a plan or a running trial, and room under its
	// plan's site limit. The count and the move are one statement, and the clean-up runs only
	// once the site moved.
	const terms = await teamTermsOf(c.env, body.team)
	if (terms?.state === 'lapsed') throw new HttpError(403, planRequiredMessage(true), PLAN_REQUIRED)
	const plan = terms?.plan ?? null
	const limit = plan?.sites ?? null
	const moved = 'EXISTS (SELECT 1 FROM sites WHERE id = ? AND team_id = ?)'
	const [move] = await c.env.CONTROL.batch([
		limit === null
			? c.env.CONTROL.prepare('UPDATE sites SET team_id = ? WHERE id = ?').bind(body.team, site.id)
			: c.env.CONTROL.prepare('UPDATE sites SET team_id = ? WHERE id = ? AND (SELECT COUNT(*) FROM sites WHERE team_id = ?) < ?').bind(body.team, site.id, body.team, limit),
		// members of the new team already see it; guests stay guests
		c.env.CONTROL.prepare(`DELETE FROM site_guests WHERE site_id = ? AND user_id IN (SELECT user_id FROM team_members WHERE team_id = ?) AND ${moved}`).bind(site.id, body.team, site.id, body.team),
		c.env.CONTROL.prepare(`DELETE FROM invitations WHERE site_id = ? AND ${moved}`).bind(site.id, site.id, body.team),
	])
	if (!move.meta.changes) throw new HttpError(403, siteLimitMessage(plan!, true), PLAN_SITE_LIMIT)
	invalidate(`site:${site.id}`)
	return c.json({ ok: true })
})

// ---------------------------------------------------------------- API keys

accounts.get('/keys', async (c) => {
	const userId = requireUser(c.get('who'))
	const { results } = await c.env.CONTROL.prepare('SELECT id, name, prefix, site_id, created_at, last_used_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC').bind(userId).all()
	return c.json(results)
})

accounts.post('/keys', async (c) => {
	const who = c.get('who')
	const userId = requireUser(who)
	const body = await c.req.json<{ name?: string; site?: string }>().catch(() => ({}) as { name?: string; site?: string })
	if (body.site) await authorize(c.env, who, body.site, 'read')
	return c.json(await createKey(c.env, userId, (body.name || 'API key').slice(0, 80), body.site ?? null), 201)
})

/** A new secret for the same key: the name and site stay, and the old secret stops working at once. */
accounts.post('/keys/:key/rotate', async (c) => {
	const who = c.get('who')
	const userId = requireUser(who)
	const id = c.req.param('key')
	const row = await c.env.CONTROL.prepare('SELECT name, site_id FROM api_keys WHERE id = ? AND user_id = ?').bind(id, userId).first<{ name: string; site_id: string | null }>()
	if (!row) throw new HttpError(404, 'key not found')
	if (row.site_id) await authorize(c.env, who, row.site_id, 'read')
	const key = secret('mm_')
	await c.env.CONTROL.prepare('UPDATE api_keys SET hash = ?, prefix = ?, created_at = ?, last_used_at = NULL WHERE id = ? AND user_id = ?')
		.bind(await sha256(key), key.slice(0, 10), Date.now(), id, userId)
		.run()
	return c.json({ id, name: row.name, key, prefix: key.slice(0, 10), site_id: row.site_id })
})

accounts.delete('/keys/:key', async (c) => {
	const userId = requireUser(c.get('who'))
	await c.env.CONTROL.prepare('DELETE FROM api_keys WHERE id = ? AND user_id = ?').bind(c.req.param('key'), userId).run()
	return c.body(null, 204)
})
