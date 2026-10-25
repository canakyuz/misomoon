import { describe, expect, it } from 'vite-plus/test'
import { googleError } from '../src/lib/google'

describe('googleError', () => {
	it('says why a Google sign-in came back without access', () => {
		expect(googleError('?site=a&view=settings&google_error=expired')).toBe('The Google sign-in took more than an hour. Select Connect again.')
		expect(googleError('?google_error=access_denied')).toBe('The Google sign-in was canceled, so nothing was connected.')
		expect(googleError('?google_error=denied')).toBe('The Google sign-in was canceled, so nothing was connected.')
		expect(googleError('?google_error=token')).toBe("Google didn't hand over access. Select Connect again.")
	})

	it('names an error Google sends that it has no message for', () => {
		expect(googleError('?google_error=invalid_scope')).toBe('The Google sign-in failed (invalid_scope). Select Connect again.')
	})

	it('is null when the sign-in worked or none ran', () => {
		expect(googleError('?site=a&view=settings&google=g1')).toBeNull()
		expect(googleError('')).toBeNull()
	})
})
