import { describe, expect, it } from 'vite-plus/test'
import type { Me } from '../src/lib/api'
import { liveDemo, otherAccount } from '../src/lib/account'

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
