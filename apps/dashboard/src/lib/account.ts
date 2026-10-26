import type { Me, Provider, User } from './api'

/** The email you are signed in with when an invitation is for another one; the server refuses to accept it then. */
export function otherAccount(inviteEmail: string, me: Me | null): string | null {
	const mine = me?.kind === 'user' ? me.user?.email : null
	return mine && mine.toLowerCase() !== inviteEmail.toLowerCase() ? mine : null
}

/** Whether a signed-out visitor is looking at the server's live demo (DEMO_SITE), not some other public site. */
export function liveDemo(me: Me | null, site: string | null): boolean {
	return me?.kind === 'anonymous' && !!me.demo && site === me.demo
}

export const PROVIDER_NAME = { google: 'Google' } as const

/** The message for a Google sign-in that came back with `login_error=`. */
export function loginMessage(reason: string): string {
	switch (reason) {
		case 'expired':
			return 'That sign-in took more than 10 minutes or started in another browser. Try again.'
		case 'denied':
			return 'The sign-in was canceled.'
		case 'provider':
			return "Google didn't confirm the sign-in. Try again."
		case 'unverified':
			return 'That account has no verified email address. Verify one with Google, then try again.'
		case 'password':
			return 'An account with this email signs in with a password. Sign in with it, then connect Google under Settings > Account.'
		case 'closed':
			return 'Sign-up is by invitation on this server.'
		case 'invite':
			return 'This invitation has expired or was withdrawn.'
		case 'invite_email':
			return 'This invitation is for another email address. Sign in with the account it was sent to.'
		case 'another_google':
			return "This email's misomoon account signs in with another Google account. Use that one, or reset your password by email."
		case 'taken':
			return 'That account is already connected to another misomoon account.'
		default:
			// the reason comes from the address, so never repeat one we don't know
			return 'The sign-in failed. Try again.'
	}
}

/** Whether a provider is the only way left to sign in: the server refuses to disconnect it then. */
export function onlyLogin(user: User | null, p: Provider): boolean {
	return !!user && user.has_password === false && (user.logins ?? []).length === 1 && user.logins![0] === p
}
