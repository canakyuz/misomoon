import { get, type ClickMap, type ScrollMap } from './api'

/**
 * Opens a page of the site with #misomoon-overlay. m.js on that page loads overlay.js,
 * which asks this window for the page's clicks and scroll depth by postMessage. Only the
 * window opened here, on the site's own domain, gets an answer, so no token is involved.
 */
let win: Window | null = null
let site: { id: string; domain: string } | null = null
let query = () => ''

/** www.shop.com and shop.com are the same site; so is any subdomain of the site's domain. */
export function sameSite(origin: string, domain: string): boolean {
	let host: string
	try {
		const u = new URL(origin)
		if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
		host = u.hostname
	} catch {
		return false
	}
	const d = domain.toLowerCase().replace(/^www\./, '')
	return host === d || host.endsWith('.' + d)
}

async function answer(e: MessageEvent) {
	const m = e.data
	if (!win || e.source !== win || !site || !sameSite(e.origin, site.domain)) return
	if (!m || m.misomoon !== 'overlay' || typeof m.path !== 'string' || m.path.length > 500) return
	const q = new URLSearchParams(query())
	q.set('site', site.id)
	q.set('page', m.path)
	const [clicks, scroll] = await Promise.all([
		get<ClickMap>(`/api/v1/stats/behavior?${q}&report=clicks&limit=200`),
		get<ScrollMap>(`/api/v1/stats/behavior?${q}&report=scroll`),
	])
	win?.postMessage({ misomoon: 'overlay-data', path: m.path, clicks, scroll }, e.origin)
}

let listening = false

/** `params` is read on every request, so the overlay follows the dashboard's period and filters. */
export function openOverlay(target: { id: string; domain: string }, page: string, params: () => string): boolean {
	site = target
	query = params
	if (!listening) {
		window.addEventListener('message', (e) => void answer(e).catch(() => {}))
		listening = true
	}
	const path = page.startsWith('/') ? page : '/' + page
	win = window.open(`https://${target.domain}${path}#misomoon-overlay`, 'misomoon-overlay')
	return !!win
}
