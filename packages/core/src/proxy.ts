// First-party proxying. Sites can serve the tracker and send events through their own
// domain (a Cloudflare Worker, a Next.js/Vercel/Netlify rewrite, Nginx, …) so ad
// blockers that match third-party analytics hosts leave it alone. Behind a proxy the
// connection comes from the proxy, so the visitor's IP and location travel in headers.
// This module decides which headers to believe and turns them into an EdgeContext.

import type { EdgeContext } from './ingest'

/** Headers our own proxy snippets set. Provider headers are read as fallbacks. */
export const PROXY_HEADERS = {
	ip: 'x-misomoon-ip',
	country: 'x-misomoon-country',
	region: 'x-misomoon-region',
	city: 'x-misomoon-city',
	continent: 'x-misomoon-continent',
	timezone: 'x-misomoon-timezone',
	asOrganization: 'x-misomoon-as-org',
} as const

type Headers = { get(name: string): string | null }

/** What Cloudflare tells us about the connection itself (`request.cf`). */
export interface ConnectionInfo {
	country?: string | null
	region?: string | null
	city?: string | null
	continent?: string | null
	timezone?: string | null
	asOrganization?: string | null
	verifiedBot?: boolean
	botScore?: number | null
}

const first = (h: Headers, ...names: string[]): string | null => {
	for (const n of names) {
		const v = h.get(n)?.trim()
		if (v) return v
	}
	return null
}

// Vercel URL-encodes city names ("S%C3%A3o%20Paulo"); our snippets encode every value.
const decode = (v: string | null) => {
	if (!v) return null
	try {
		return decodeURIComponent(v)
	} catch {
		return v
	}
}

const IP = /^[0-9a-f.:]{3,45}$/i

/** The visitor's address as the proxy reported it, or null if the request is direct. */
export function forwardedIp(h: Headers): string | null {
	const own = h.get(PROXY_HEADERS.ip)?.trim()
	if (own && IP.test(own)) return own
	// leftmost entry is the original client; later hops are proxies
	const xff = h.get('x-forwarded-for')?.split(',')[0]?.trim()
	if (xff && IP.test(xff)) return xff
	const other = first(h, 'x-real-ip', 'x-nf-client-connection-ip', 'true-client-ip')
	return other && IP.test(other) ? other : null
}

/**
 * Whether the request carries a mark of a first-party proxy, beyond a bare
 * X-Forwarded-For. Corporate proxies and VPNs add X-Forwarded-For to ordinary direct
 * requests; on those the connection's own geo is right and must be kept. Our snippets
 * set x-misomoon-ip, and hosted rewrites leave their own request ids.
 */
export function viaProxy(h: Headers): boolean {
	if (h.get(PROXY_HEADERS.ip)) return true
	if (h.get('x-vercel-id') || h.get('x-nf-request-id') || h.get('cf-worker')) return true
	// self-hosted Next.js and most reverse proxies name the site they rewrote for
	const fwdHost = h.get('x-forwarded-host')?.split(',')[0]?.trim().toLowerCase()
	return Boolean(fwdHost && fwdHost !== h.get('host')?.toLowerCase())
}

/**
 * Builds the edge context for a beacon. A request counts as proxied when it carries a
 * proxy's mark (viaProxy) and a forwarded client address differs from the connecting
 * one. Then the connection's location and bot signals describe the proxy, not the
 * visitor, so they are dropped in favour of forwarded geo headers (ours, then Vercel,
 * Netlify and Cloudflare's), or left unknown.
 */
export function edgeFromRequest(h: Headers, cf: ConnectionInfo): EdgeContext & { proxied: boolean } {
	const connecting = h.get('cf-connecting-ip')?.trim() || null
	const forwarded = forwardedIp(h)
	const proxied = forwarded != null && forwarded !== connecting && viaProxy(h)
	const ua = h.get('user-agent') ?? ''
	// proxies pass the browser's headers through, so this is the visitor's either way
	const language = h.get('accept-language')
	if (!proxied) {
		return {
			ua,
			language,
			ip: connecting ?? forwarded ?? '0.0.0.0',
			country: cf.country ?? null,
			region: cf.region ?? null,
			city: cf.city ?? null,
			continent: cf.continent ?? null,
			timezone: cf.timezone ?? null,
			asOrganization: cf.asOrganization ?? null,
			verifiedBot: cf.verifiedBot ?? false,
			botScore: cf.botScore ?? null,
			proxied,
		}
	}
	const country = decode(first(h, PROXY_HEADERS.country, 'x-vercel-ip-country', 'x-country', 'cf-ipcountry'))
	return {
		ua,
		language,
		ip: forwarded,
		// "XX" and "T1" are Cloudflare's unknown and Tor markers
		country: country && /^[A-Z]{2}$/i.test(country) && !/^(XX|T1)$/i.test(country) ? country.toUpperCase() : null,
		region: decode(first(h, PROXY_HEADERS.region, 'x-vercel-ip-country-region')),
		city: decode(first(h, PROXY_HEADERS.city, 'x-vercel-ip-city')),
		continent: decode(first(h, PROXY_HEADERS.continent, 'x-vercel-ip-continent')),
		timezone: decode(first(h, PROXY_HEADERS.timezone, 'x-vercel-ip-timezone')),
		asOrganization: decode(first(h, PROXY_HEADERS.asOrganization)),
		// the proxy's own bot score says nothing about the visitor; the UA check still runs
		verifiedBot: false,
		botScore: null,
		proxied,
	}
}
