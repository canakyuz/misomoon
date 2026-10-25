/** The message for a Google sign-in that came back to Settings with `google_error=`, or null when there is none. */
export function googleError(search: string): string | null {
	const code = new URLSearchParams(search).get('google_error')
	if (!code) return null
	if (code === 'expired') return 'The Google sign-in took more than an hour. Select Connect again.'
	if (code === 'denied' || code === 'access_denied') return 'The Google sign-in was canceled, so nothing was connected.'
	if (code === 'token') return "Google didn't hand over access. Select Connect again."
	return `The Google sign-in failed (${code}). Select Connect again.`
}
