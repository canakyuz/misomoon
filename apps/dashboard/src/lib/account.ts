import type { Me } from './api'

/** The email you are signed in with when an invitation is for another one; the server refuses to accept it then. */
export function otherAccount(inviteEmail: string, me: Me | null): string | null {
	const mine = me?.kind === 'user' ? me.user?.email : null
	return mine && mine.toLowerCase() !== inviteEmail.toLowerCase() ? mine : null
}

/** Whether a signed-out visitor is looking at the server's live demo (DEMO_SITE), not some other public site. */
export function liveDemo(me: Me | null, site: string | null): boolean {
	return me?.kind === 'anonymous' && !!me.demo && site === me.demo
}
