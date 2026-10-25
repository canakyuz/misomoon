import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { invalidate } from '../src/control'
import { fakeCtx, fakeEnv, OWNER, type FakeEnv } from './fake'

vi.mock('@misomoon/tracker/m.min.js', () => ({ default: '/* m.js */' }))
vi.mock('@misomoon/tracker/overlay.min.js', () => ({ default: '/* overlay.js */' }))
vi.mock('@misomoon/tracker/parts.min.js', () => ({ default: '{}' }))
const { default: worker } = await import('../src/index')

const KEYS = { GOOGLE_CLIENT_ID: 'g-id', GOOGLE_CLIENT_SECRET: 'g-secret' }

async function call(env: FakeEnv, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
	const init: RequestInit = { method, headers: { 'content-type': 'application/json', ...headers }, redirect: 'manual' }
	if (body !== undefined) init.body = JSON.stringify(body)
	const res = await worker.fetch(new Request(`https://app.test${path}`, init), env as unknown as Env, fakeCtx() as unknown as ExecutionContext)
	return { res, json: async () => res.json() as Promise<any> }
}

interface Person {
	sub: string
	email?: string
	verified?: boolean
	name?: string
}

/** Google as fetch sees it: grants `person`, and records what misomoon sent. */
function providers(person: Person) {
	const sent: { url: string; body: string }[] = []
	vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
		sent.push({ url, body: String(init.body ?? '') })
		if (url === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'ya29.google' })
		if (url === 'https://openidconnect.googleapis.com/v1/userinfo') return Response.json({ sub: person.sub, email: person.email, email_verified: person.verified ?? true, name: person.name })
		return new Response('unexpected', { status: 500 })
	})
	return sent
}

/** Starts a sign-in, follows the provider back to the callback, and returns where it lands. */
async function signIn(env: FakeEnv, provider: 'google', opts: { invite?: string; headers?: Record<string, string>; cookie?: string | null } = {}) {
	const start = await call(env, 'POST', `/api/v1/auth/oauth/${provider}`, opts.invite ? { invite: opts.invite } : {}, opts.headers)
	const { url } = await start.json()
	const state = new URL(url).searchParams.get('state')!
	const cookie = opts.cookie === undefined ? start.res.headers.get('set-cookie')!.split(';')[0] : opts.cookie
	const back = await call(env, 'GET', `/api/v1/auth/oauth/${provider}/callback?code=c0de&state=${state}`, undefined, cookie ? { cookie } : {})
	return { start, url: new URL(url), back, location: new URL(back.res.headers.get('location')!) }
}

const exchange = (env: FakeEnv, code: string | null, cookie?: string) => call(env, 'POST', '/api/v1/auth/exchange', { code }, cookie ? { cookie } : {})
/** Trades a finished sign-in's code for a session, in the browser that signed in. */
const redeem = (env: FakeEnv, s: Awaited<ReturnType<typeof signIn>>) => exchange(env, s.location.searchParams.get('login'), s.back.res.headers.get('set-cookie')!.split(';')[0])
const users = (env: FakeEnv) => env.CONTROL.rows('SELECT id, email, name, password_hash FROM users ORDER BY created_at') as { id: string; email: string; name: string; password_hash: string }[]

beforeEach(() => invalidate(''))
afterEach(() => vi.unstubAllGlobals())

describe('starting a sign-in', () => {
	it('sends the browser to Google with PKCE and the state, and sets the state cookie', async () => {
		const r = await call(fakeEnv(KEYS), 'POST', '/api/v1/auth/oauth/google', {})
		const u = new URL((await r.json()).url)
		expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
		expect(Object.fromEntries(u.searchParams)).toMatchObject({
			client_id: 'g-id',
			redirect_uri: 'https://app.test/api/v1/auth/oauth/google/callback',
			response_type: 'code',
			scope: 'openid email profile',
			code_challenge_method: 'S256',
		})
		expect(u.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/)
		expect(r.res.headers.get('set-cookie')).toBe(`misomoon_login=${u.searchParams.get('state')}; Path=/api/v1/auth; Max-Age=600; HttpOnly; Secure; SameSite=Lax`)
	})

	it('answers 501 without a Google client, and 404 for a provider misomoon has no sign-in for', async () => {
		const bare = await call(fakeEnv({ GOOGLE_CLIENT_ID: 'g-id' }), 'POST', '/api/v1/auth/oauth/google', {})
		expect([bare.res.status, await bare.json()]).toEqual([501, { error: 'sign-in with Google needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET' }])
		for (const p of ['github', 'apple']) {
			expect((await call(fakeEnv(KEYS), 'POST', `/api/v1/auth/oauth/${p}`, {})).res.status).toBe(404)
			expect((await call(fakeEnv(KEYS), 'GET', `/api/v1/auth/oauth/${p}/callback?code=c&state=s`)).res.status).toBe(404)
		}
	})

	it('lists the providers with a client in /me', async () => {
		expect((await (await call(fakeEnv(), 'GET', '/api/v1/me')).json()).providers).toEqual([])
		expect((await (await call(fakeEnv(KEYS), 'GET', '/api/v1/me')).json()).providers).toEqual(['google'])
	})
})

describe('signing up with Google', () => {
	it('creates an account with no password and a team, and the code from the callback signs it in once', async () => {
		const env = fakeEnv(KEYS)
		const sent = providers({ sub: 'g-123', email: 'Ada@Example.com', name: 'Ada' })
		const done = await signIn(env, 'google')
		const { location } = done
		expect(location.pathname).toBe('/')
		const code = location.searchParams.get('login')!
		expect(code).toMatch(/^ml_[a-f0-9]{48}$/)
		// the token request carries the PKCE verifier
		expect(new URLSearchParams(sent[0].body).get('code_verifier')).toMatch(/^[A-Za-z0-9_-]{43}$/)

		const ada = users(env).find((u) => u.email === 'ada@example.com')!
		expect([ada.name, ada.password_hash]).toEqual(['Ada', ''])
		expect(env.CONTROL.rows("SELECT t.name, m.role FROM team_members m JOIN teams t ON t.id = m.team_id WHERE m.user_id = ?", ada.id)).toEqual([{ name: "Ada's sites", role: 'owner' }])

		const first = await redeem(env, done)
		const session = await first.json()
		expect(session).toMatchObject({ user: { id: ada.id, email: 'ada@example.com', name: 'Ada' }, site: null })
		const me = await (await call(env, 'GET', '/api/v1/me', undefined, { authorization: `Bearer ${session.token}` })).json()
		expect(me.user).toEqual({ id: ada.id, email: 'ada@example.com', name: 'Ada', has_password: false, logins: ['google'] })
		const again = await redeem(env, done)
		expect([again.res.status, await again.json()]).toEqual([400, { error: 'this sign-in has expired; sign in again' }])
	})

	it('signs the same Google account in again, by its id even after its email changed', async () => {
		const env = fakeEnv(KEYS)
		providers({ sub: 'g-1', email: 'ada@example.com' })
		await signIn(env, 'google')
		providers({ sub: 'g-1', email: 'ada@new.example' })
		expect((await (await redeem(env, await signIn(env, 'google'))).json()).user.email).toBe('ada@example.com')
		expect(users(env).filter((u) => u.email.startsWith('ada'))).toHaveLength(1)
	})

	it('refuses an address Google has not verified, or no address at all', async () => {
		const env = fakeEnv(KEYS)
		providers({ sub: 'g-9', email: 'x@example.com', verified: false })
		expect((await signIn(env, 'google')).location.search).toBe('?login_error=unverified')
		providers({ sub: 'g-10' })
		expect((await signIn(env, 'google')).location.search).toBe('?login_error=unverified')
		expect(users(env).map((u) => u.email)).toEqual(['owner@test'])
	})

	it('follows SIGNUPS: invite-only servers take only the first account, closed ones none', async () => {
		providers({ sub: 'g-2', email: 'new@example.com' })
		expect((await signIn(fakeEnv({ ...KEYS, SIGNUPS: 'invite' }), 'google')).location.search).toBe('?login_error=closed')
		expect((await signIn(fakeEnv({ ...KEYS, SIGNUPS: 'closed' }), 'google')).location.search).toBe('?login_error=closed')
		const empty = fakeEnv({ ...KEYS, SIGNUPS: 'invite' })
		empty.CONTROL.db.exec('DELETE FROM sessions; DELETE FROM team_members; DELETE FROM teams; DELETE FROM users')
		expect((await signIn(empty, 'google')).location.searchParams.get('login')).toMatch(/^ml_/)
	})
})

describe('accounts that already exist', () => {
	it("won't open a password account by its email, since sign-up doesn't check addresses", async () => {
		const env = fakeEnv(KEYS)
		providers({ sub: 'g-owner', email: 'owner@test' })
		expect((await signIn(env, 'google')).location.search).toBe('?login_error=password')
		expect(env.CONTROL.rows('SELECT * FROM user_logins')).toEqual([])
	})

	it("won't open an account that signs in with another Google account, even with the same verified email", async () => {
		// a Workspace address handed to someone new comes back from Google with a new id
		const env = fakeEnv(KEYS)
		providers({ sub: 'g-5', email: 'grace@example.com' })
		await signIn(env, 'google')
		providers({ sub: 'g-6', email: 'grace@example.com' })
		expect((await signIn(env, 'google')).location.search).toBe('?login_error=another_google')
		expect(env.CONTROL.rows('SELECT subject FROM user_logins')).toEqual([{ subject: 'g-5' }])
	})

	it('connects a provider to the signed-in account from Settings, and refuses one that belongs to someone else', async () => {
		const env = fakeEnv(KEYS)
		providers({ sub: 'g-77', email: 'whatever@example.com' })
		const linked = await signIn(env, 'google', { headers: OWNER })
		expect(linked.location.search).toBe('?view=settings&tab=account&linked=google')
		expect(env.CONTROL.rows("SELECT subject FROM user_logins WHERE user_id = 'u1'")).toEqual([{ subject: 'g-77' }])
		// now it signs the owner in, password and all
		expect((await (await redeem(env, await signIn(env, 'google'))).json()).user.id).toBe('u1')

		providers({ sub: 'g-other', email: 'other@example.com' })
		await signIn(env, 'google')
		const taken = await signIn(env, 'google', { headers: OWNER })
		expect(taken.location.search).toBe('?view=settings&tab=account&login_error=taken')
		expect(env.CONTROL.rows("SELECT subject FROM user_logins WHERE user_id = 'u1'")).toEqual([{ subject: 'g-77' }])
	})
})

describe('the callback', () => {
	it('refuses a callback opened in another browser, without asking the provider', async () => {
		const env = fakeEnv(KEYS)
		const sent = providers({ sub: 'g-1', email: 'a@example.com' })
		expect((await signIn(env, 'google', { cookie: null })).location.search).toBe('?login_error=expired')
		expect((await signIn(env, 'google', { cookie: 'misomoon_login=someone-else' })).location.search).toBe('?login_error=expired')
		expect(sent).toEqual([])
	})

	it('uses each state once, and clears the cookie when the sign-in fails', async () => {
		const env = fakeEnv(KEYS)
		providers({ sub: 'g-1', email: 'a@example.com' })
		const first = await signIn(env, 'google')
		const state = first.url.searchParams.get('state')
		const replay = await call(env, 'GET', `/api/v1/auth/oauth/google/callback?code=c0de&state=${state}`, undefined, { cookie: `misomoon_login=${state}` })
		expect(new URL(replay.res.headers.get('location')!).search).toBe('?login_error=expired')
		expect(replay.res.headers.get('set-cookie')).toContain('misomoon_login=; Path=/api/v1/auth; Max-Age=0')
	})

	it('trades the code only in the browser that signed in, so a link with it signs no one else in', async () => {
		const env = fakeEnv(KEYS)
		providers({ sub: 'g-1', email: 'a@example.com' })
		const done = await signIn(env, 'google')
		const code = done.location.searchParams.get('login')
		const cookie = done.back.res.headers.get('set-cookie')!
		expect(cookie).toMatch(/^misomoon_login=[0-9a-f-]{36}; Path=\/api\/v1\/auth; Max-Age=60; HttpOnly; Secure; SameSite=Lax$/)
		for (const other of [undefined, 'misomoon_login=someone-else']) {
			const r = await exchange(env, code, other)
			expect([r.res.status, await r.json()]).toEqual([400, { error: 'this sign-in has expired; sign in again' }])
		}
		const r = await redeem(env, done)
		expect(r.res.status).toBe(200)
		expect(r.res.headers.get('set-cookie')).toContain('misomoon_login=; Path=/api/v1/auth; Max-Age=0')
	})

	it('goes back with denied when the person cancels, and provider when the provider refuses the code', async () => {
		const env = fakeEnv(KEYS)
		const start = await call(env, 'POST', '/api/v1/auth/oauth/google', {})
		const state = new URL((await start.json()).url).searchParams.get('state')
		const cookie = start.res.headers.get('set-cookie')!.split(';')[0]
		const denied = await call(env, 'GET', `/api/v1/auth/oauth/google/callback?error=access_denied&state=${state}`, undefined, { cookie })
		expect(new URL(denied.res.headers.get('location')!).search).toBe('?login_error=denied')

		vi.stubGlobal('fetch', async () => Response.json({ error: 'invalid_grant' }, { status: 400 }))
		expect((await signIn(env, 'google')).location.search).toBe('?login_error=provider')
	})
})

describe('invitations', () => {
	async function invite(env: FakeEnv, email: string) {
		return (await (await call(env, 'POST', '/api/v1/teams/t1/invitations', { email, role: 'editor' }, OWNER)).json()).url.split('/invite/')[1] as string
	}

	it('creates the invited account on an invite-only server and joins the team', async () => {
		const env = fakeEnv({ ...KEYS, SIGNUPS: 'invite' })
		const token = await invite(env, 'linus@example.com')
		providers({ sub: 'g-linus', email: 'linus@example.com' })
		const { user } = await (await redeem(env, await signIn(env, 'google', { invite: token }))).json()
		expect(env.CONTROL.rows('SELECT role FROM team_members WHERE team_id = ? AND user_id = ?', 't1', user.id)).toEqual([{ role: 'editor' }])
		// no team of their own: they came to join this one
		expect(env.CONTROL.rows("SELECT COUNT(*) AS n FROM team_members WHERE user_id = ?", user.id)).toEqual([{ n: 1 }])
		expect(env.CONTROL.rows('SELECT * FROM invitations')).toEqual([])
	})

	it('refuses a provider account whose email is not the invited one', async () => {
		const env = fakeEnv({ ...KEYS, SIGNUPS: 'invite' })
		const token = await invite(env, 'linus@example.com')
		providers({ sub: 'g-someone', email: 'someone@example.com' })
		expect((await signIn(env, 'google', { invite: token })).location.search).toBe('?login_error=invite_email')
		expect(users(env).map((u) => u.email)).toEqual(['owner@test'])
	})

	it('refuses an invitation that expired or was withdrawn', async () => {
		providers({ sub: 'g-linus', email: 'linus@example.com' })
		expect((await signIn(fakeEnv(KEYS), 'google', { invite: 'mi_abc123' })).location.search).toBe('?login_error=invite')
	})
})

describe('an account without a password', () => {
	async function passwordless(env: FakeEnv) {
		providers({ sub: 'g-np', email: 'np@example.com' })
		const s = await (await redeem(env, await signIn(env, 'google'))).json()
		return { authorization: `Bearer ${s.token}` }
	}

	it('never signs in with a password, and answers 401 rather than failing', async () => {
		const env = fakeEnv(KEYS)
		await passwordless(env)
		const r = await call(env, 'POST', '/api/v1/auth/login', { email: 'np@example.com', password: '' })
		expect([r.res.status, await r.json()]).toEqual([401, { error: 'wrong email or password' }])
	})

	it('sets a first password without a current one, then signs in with it', async () => {
		const env = fakeEnv(KEYS)
		const auth = await passwordless(env)
		expect((await call(env, 'PATCH', '/api/v1/me', { password: 'a long new password' }, auth)).res.status).toBe(200)
		expect((await call(env, 'POST', '/api/v1/auth/login', { email: 'np@example.com', password: 'a long new password' })).res.status).toBe(200)
		const second = await call(env, 'PATCH', '/api/v1/me', { password: 'another long one' }, auth)
		expect(second.res.status).toBe(401)
	})

	it('keeps its only login: disconnecting it needs a password first', async () => {
		const env = fakeEnv(KEYS)
		const auth = await passwordless(env)
		const r = await call(env, 'DELETE', '/api/v1/me/logins/google', undefined, auth)
		expect([r.res.status, await r.json()]).toEqual([409, { error: 'set a password first, so you can still sign in' }])
		await call(env, 'PATCH', '/api/v1/me', { password: 'a long new password' }, auth)
		expect((await call(env, 'DELETE', '/api/v1/me/logins/google', undefined, auth)).res.status).toBe(204)
		expect(env.CONTROL.rows('SELECT * FROM user_logins')).toEqual([])
	})

	it('deletes the account when you type its email', async () => {
		const env = fakeEnv(KEYS)
		const auth = await passwordless(env)
		const wrong = await call(env, 'DELETE', '/api/v1/me', { email: 'someone@example.com' }, auth)
		expect([wrong.res.status, await wrong.json()]).toEqual([401, { error: 'type your email to confirm' }])
		expect((await call(env, 'DELETE', '/api/v1/me', { email: 'NP@example.com' }, auth)).res.status).toBe(204)
		expect(users(env).map((u) => u.email)).toEqual(['owner@test'])
		expect(env.CONTROL.rows('SELECT * FROM user_logins')).toEqual([])
	})
})

describe('hardening', () => {
	it('keeps only the hash of an invitation code while the sign-in is on its way', async () => {
		const env = fakeEnv(KEYS)
		const start = await call(env, 'POST', '/api/v1/auth/oauth/google', { invite: 'mi_abc123' })
		expect(start.res.status).toBe(200)
		expect(env.CONTROL.rows('SELECT invite FROM login_states')).toEqual([{ invite: createHash('sha256').update('mi_abc123').digest('hex') }])
	})

	it('answers 404 for disconnecting a provider misomoon has no sign-in for', async () => {
		const r = await call(fakeEnv(KEYS), 'DELETE', '/api/v1/me/logins/github', undefined, OWNER)
		expect(r.res.status).toBe(404)
	})
})
