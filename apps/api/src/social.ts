import { HttpError } from './control'

/** Sign-in with Google: the OAuth half. accounts.ts decides which account it opens. */
export type Provider = 'google'
export const PROVIDERS: Provider[] = ['google']

/** Who the provider says signed in. `verified` is the provider's word that the person owns `email`. */
export interface Profile {
	subject: string
	email: string | null
	verified: boolean
	name: string
}

/** The providers this server has a client for, in button order. */
export const loginProviders = (env: Env) => PROVIDERS.filter(() => env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)

export function loginProvider(env: Env, name: string): Provider {
	const p = PROVIDERS.find((x) => x === name)
	if (!p) throw new HttpError(404, 'sign-in is with google')
	if (!loginProviders(env).includes(p)) throw new HttpError(501, 'sign-in with Google needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET')
	return p
}

export const callbackUrl = (origin: string, p: Provider) => `${origin}/api/v1/auth/oauth/${p}/callback`

const base64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** A PKCE verifier and its S256 challenge. */
export async function pkce(): Promise<{ verifier: string; challenge: string }> {
	const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)))
	const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))
	return { verifier, challenge }
}

/** Where the browser goes to sign in with the provider. */
export function authorizeUrl(env: Env, p: Provider, origin: string, state: string, challenge: string): string {
	const params = {
		client_id: env.GOOGLE_CLIENT_ID!,
		redirect_uri: callbackUrl(origin, p),
		state,
		code_challenge: challenge,
		code_challenge_method: 'S256',
		response_type: 'code',
		scope: 'openid email profile',
		prompt: 'select_account',
	}
	return `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams(params)}`
}

async function json<T>(res: Response): Promise<T | null> {
	return res.ok ? ((await res.json().catch(() => null)) as T | null) : null
}

/** Trades the callback's code for who signed in, or null when the provider refuses. */
export async function profileFor(env: Env, p: Provider, origin: string, code: string, verifier: string): Promise<Profile | null> {
	const body = new URLSearchParams({
		client_id: env.GOOGLE_CLIENT_ID!,
		client_secret: env.GOOGLE_CLIENT_SECRET!,
		code,
		redirect_uri: callbackUrl(origin, p),
		code_verifier: verifier,
		grant_type: 'authorization_code',
	})
	const t = await json<{ access_token?: string }>(await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }))
	if (!t?.access_token) return null
	const u = await json<{ sub?: string; email?: string; email_verified?: boolean; name?: string }>(
		await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${t.access_token}` } }),
	)
	if (!u?.sub) return null
	return { subject: u.sub, email: u.email?.toLowerCase() ?? null, verified: u.email_verified === true, name: u.name ?? '' }
}
