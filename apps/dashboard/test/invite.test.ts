import { describe, expect, it } from 'vite-plus/test'
import type { Me } from '../src/lib/api'
import { otherAccount } from '../src/lib/invite'

const me = (email: string | null): Me => ({ kind: email ? 'user' : 'anonymous', user: email ? { id: 'u1', email, name: 'Ada' } : null, teams: [], sites: [], demo: null, signups: true, share: null })

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
