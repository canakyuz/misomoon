import { checkUrl, tagStatus, type InstallStatus } from '@misomoon/core'
import type { Site } from './control'

/** how long the site's home page may take to answer */
const CHECK_TIMEOUT_MS = 8000
/** the HTML read for script tags; the <head> comes first, so this is plenty */
const CHECK_BYTES = 512 * 1024

export interface InstallCheck {
	/** the page that was read, after redirects; null when the domain is not a public host */
	url: string | null
	status: InstallStatus
	/** the page's HTTP status, or null when it never answered */
	http_status: number | null
	/** the site ids of the misomoon tags on the page */
	sites: string[]
	/** why the page could not be read, when status is unreachable */
	error?: string
}

/** Opens the site's home page and looks for its script tag. Never throws: a failure is a status. */
export async function checkInstall(site: Pick<Site, 'id' | 'domain'>): Promise<InstallCheck> {
	const url = checkUrl(site.domain)
	if (!url) return { url: null, status: 'unreachable', http_status: null, sites: [], error: `${site.domain} is not a public address, so misomoon can't open it` }
	let res: Response
	try {
		res = await fetch(url, {
			headers: { 'User-Agent': 'misomoon-install-check/1 (+https://misomoon.com)', Accept: 'text/html' },
			redirect: 'follow',
			signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
		})
	} catch (err) {
		const late = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
		return { url, status: 'unreachable', http_status: null, sites: [], error: late ? `${url} took longer than ${CHECK_TIMEOUT_MS / 1000} seconds to answer` : `could not connect to ${url}` }
	}
	const read = res.url || url
	if (!res.ok) {
		await res.body?.cancel()
		return { url: read, status: 'unreachable', http_status: res.status, sites: [], error: `${read} answered ${res.status}` }
	}
	return { url: read, http_status: res.status, ...tagStatus(await head(res), site.id) }
}

/** The first CHECK_BYTES of a response body, as text. */
async function head(res: Response): Promise<string> {
	if (!res.body) return ''
	const reader = res.body.getReader()
	const decoder = new TextDecoder()
	let text = ''
	let bytes = 0
	while (bytes < CHECK_BYTES) {
		const { done, value } = await reader.read()
		if (done) break
		bytes += value.byteLength
		text += decoder.decode(value, { stream: true })
	}
	await reader.cancel().catch(() => {})
	return text
}
