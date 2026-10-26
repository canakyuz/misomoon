import { describe, expect, it } from 'vite-plus/test'
import type { Me } from '../src/lib/api'
import { liveDemo, loginMessage, onlyLogin, otherAccount } from '../src/lib/account'

const me = (email: string | null, demo: string | null = null): Me => ({ kind: email ? 'user' : 'anonymous', user: email ? { id: 'u1', email, name: 'Ada' } : null, teams: [], sites: [], demo, signups: true, share: null })

describe('otherAccount', () => {
	it('names the account you are signed in with when an invitation is for another email', () => {
		expect(otherAccount('b@example.com', me('a@example.com'))).toBe('a@example.com')
	})

	it('is null when the invitation is yours, in any case, or nobody is signed in', () => {
		expect(otherAccount('Ada@Example.com', me('ada@example.com'))).toBeNull()
		expect(otherAccount('b@example.com', me(null))).toBeNull()
		expect(otherAccount('b@example.com', null)).toBeNull()
	})
})

describe('liveDemo', () => {
	it("calls only the server's demo site a live demo, and only for signed-out visitors", () => {
		expect(liveDemo(me(null, 'demo'), 'demo')).toBe(true)
		expect(liveDemo(me(null, 'demo'), 'blog')).toBe(false)
		expect(liveDemo(me(null), 'blog')).toBe(false)
		expect(liveDemo(me('a@example.com', 'demo'), 'demo')).toBe(false)
	})
})

describe('loginMessage', () => {
	it('explains each reason a Google sign-in came back without an account', () => {
		expect(loginMessage('password')).toBe('An account with this email signs in with a password. Sign in with it, then connect Google under Settings > Account.')
		expect(loginMessage('closed')).toBe('Sign-up is by invitation on this server.')
		expect(loginMessage('taken')).toBe('That account is already connected to another misomoon account.')
		expect(loginMessage('another_google')).toBe("This email's misomoon account signs in with another Google account. Use that one, or reset your password by email.")
	})

	it('never echoes a reason it has no words for, since anyone can put one in the address', () => {
		expect(loginMessage('weird')).toBe('The sign-in failed. Try again.')
		expect(loginMessage('Call 555-0100 to restore access')).toBe('The sign-in failed. Try again.')
	})
})

describe('onlyLogin', () => {
	const user = (has_password: boolean | undefined, logins: ('google')[] | undefined) => ({ id: 'u1', email: 'a@example.com', name: 'Ada', has_password, logins })

	it('is true when Google is the only way an account without a password signs in', () => {
		expect(onlyLogin(user(false, ['google']), 'google')).toBe(true)
	})

	it('is false with a password, or when the provider is not connected', () => {
		expect(onlyLogin(user(true, ['google']), 'google')).toBe(false)
		expect(onlyLogin(user(undefined, ['google']), 'google')).toBe(false)
		expect(onlyLogin(user(false, []), 'google')).toBe(false)
		expect(onlyLogin(null, 'google')).toBe(false)
	})
})
