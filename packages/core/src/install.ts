/**
 * The install check: misomoon opens a site's home page and looks for its script tag,
 * so the setup guide can say what is wrong before the first visit arrives.
 */

export type InstallStatus = 'found' | 'other_site' | 'missing' | 'unreachable'

/**
 * The site ids of the misomoon script tags in a page's HTML, in page order and without
 * repeats. A tag counts when its src is an `m.js` with an `s=` site id, from misomoon, a
 * managed subdomain or a proxy path. Tags inside HTML comments don't count.
 */
export function trackerSites(html: string): string[] {
	const sites: string[] = []
	const page = html.replace(/<!--[\s\S]*?-->/g, '')
	for (const [, src] of page.matchAll(/<script\b[^>]*?\ssrc\s*=\s*["']?([^"'\s>]+)/gi)) {
		let url: URL
		try {
			url = new URL(src.replaceAll('&amp;', '&'), 'https://page.invalid/')
		} catch {
			continue
		}
		const id = url.pathname.endsWith('/m.js') ? url.searchParams.get('s') : null
		if (id && !sites.includes(id)) sites.push(id)
	}
	return sites
}

/** Whether a page carries the tag of `site`: found, only the tag of other sites, or none. */
export function tagStatus(html: string, site: string): { status: Exclude<InstallStatus, 'unreachable'>; sites: string[] } {
	const sites = trackerSites(html)
	return { status: sites.includes(site) ? 'found' : sites.length ? 'other_site' : 'missing', sites }
}

/**
 * The page the check opens for a site's domain: its home page over HTTPS. Null for a host
 * that is not on the public internet, such as `localhost`, an IP address, a name without a
 * dot or with a port, so the check never reaches a private network.
 */
export function checkUrl(domain: string): string | null {
	const host = domain.trim().toLowerCase()
	if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return null
	if (/^\d+(\.\d+){3}$/.test(host) || /\.(localhost|local|internal|home\.arpa)$/.test(host)) return null
	return `https://${host}/`
}
