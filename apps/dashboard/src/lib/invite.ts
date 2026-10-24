import type { Me } from './api'

/** The email you are signed in with when an invitation is for another one; the server refuses to accept it then. */
export function otherAccount(inviteEmail: string, me: Me | null): string | null {
	const mine = me?.kind === 'user' ? me.user?.email : null
	return mine && mine.toLowerCase() !== inviteEmail.toLowerCase() ? mine : null
}
