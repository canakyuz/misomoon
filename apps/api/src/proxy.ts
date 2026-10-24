// The managed first-party proxy. A site points its own subdomain at misomoon with a
// CNAME; we register it as a Cloudflare for SaaS custom hostname, Cloudflare issues the
// certificate, and the tracker loads from https://stats.example.com/m.js. The browser
// talks to that hostname directly, so the visitor's IP and location arrive as usual.
// Self-hosted installs without Cloudflare for SaaS get 501 and use a snippet instead.

import { cached, HttpError, invalidate, type Site } from './control'

export interface ProxyDomain {
	hostname: string
	site_id: string
	cf_id: string
	status: string
	ssl_status: string | null
	verification: string | null
	created_at: number
	checked_at: number | null
}

interface CustomHostname {
	id: string
	hostname: string
	status: string
	ssl?: { status?: string; validation_records?: { txt_name?: string; txt_value?: string }[] }
	ownership_verification?: { type: string; name: string; value: string }
	verification_errors?: string[]
}

export const managedProxyEnabled = (env: Env) => Boolean(env.CF_API_TOKEN && env.CF_ZONE_ID && env.PROXY_CNAME_TARGET)

async function cfApi<T>(env: Env, method: string, path: string, body?: unknown): Promise<T> {
	const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${env.CF_ZONE_ID}/custom_hostnames${path}`, {
		method,
		headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, 'Content-Type': 'application/json' },
		body: body ? JSON.stringify(body) : undefined,
	})
	const json = (await res.json().catch(() => null)) as { success: boolean; result: T; errors?: { message: string }[] } | null
	if (!json?.success) throw new HttpError(res.status === 404 ? 404 : 502, `Cloudflare: ${json?.errors?.map((e) => e.message).join('; ') || res.statusText}`)
	return json.result
}

/** The hostname has to sit under the site's own domain, so nobody can claim someone else's. */
export function validProxyHostname(site: Pick<Site, 'domain'>, hostname: string): string {
	const h = hostname.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[/:].*$/, '')
	const domain = site.domain.replace(/:\d+$/, '').replace(/^www\./, '')
	if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h)) throw new HttpError(400, 'hostname is not valid')
	if (!h.endsWith('.' + domain)) throw new HttpError(400, `use a subdomain of ${domain}, e.g. stats.${domain}`)
	if (h === 'www.' + domain) throw new HttpError(400, 'pick a subdomain other than www')
	return h
}

const fromCf = (ch: CustomHostname) => {
	const txt = [
		...(ch.ownership_verification ? [{ name: ch.ownership_verification.name, value: ch.ownership_verification.value }] : []),
		...(ch.ssl?.validation_records ?? []).filter((r) => r.txt_name).map((r) => ({ name: r.txt_name!, value: r.txt_value! })),
	]
	return { status: ch.status, ssl_status: ch.ssl?.status ?? null, verification: txt.length ? JSON.stringify(txt) : null }
}

export function proxyView(env: Env, row: ProxyDomain | null) {
	return {
		available: managedProxyEnabled(env),
		target: env.PROXY_CNAME_TARGET || null,
		domain: row && {
			hostname: row.hostname,
			status: row.status,
			ssl_status: row.ssl_status,
			active: row.status === 'active' && row.ssl_status === 'active',
			records: [{ type: 'CNAME', name: row.hostname, value: env.PROXY_CNAME_TARGET }, ...(row.verification ? (JSON.parse(row.verification) as { name: string; value: string }[]).map((r) => ({ type: 'TXT', ...r })) : [])],
			script: `https://${row.hostname}/m.js?s=${row.site_id}`,
		},
	}
}

const rowFor = (env: Env, siteId: string) => env.CONTROL.prepare('SELECT * FROM proxy_domains WHERE site_id = ?').bind(siteId).first<ProxyDomain>()

/** Current state, refreshed from Cloudflare while the hostname is still being set up. */
export async function getProxy(env: Env, site: Site) {
	let row = await rowFor(env, site.id)
	if (row && managedProxyEnabled(env) && !(row.status === 'active' && row.ssl_status === 'active')) {
		const next = fromCf(await cfApi<CustomHostname>(env, 'GET', `/${row.cf_id}`))
		await env.CONTROL.prepare('UPDATE proxy_domains SET status = ?, ssl_status = ?, verification = ?, checked_at = ? WHERE hostname = ?')
			.bind(next.status, next.ssl_status, next.verification, Date.now(), row.hostname)
			.run()
		row = { ...row, ...next }
		invalidate('proxyhost:')
	}
	return proxyView(env, row)
}

export async function setProxy(env: Env, site: Site, hostname: string) {
	if (!managedProxyEnabled(env)) throw new HttpError(501, 'The managed proxy needs Cloudflare for SaaS: set CF_API_TOKEN, CF_ZONE_ID and PROXY_CNAME_TARGET. Use one of the proxy snippets instead.')
	const h = validProxyHostname(site, hostname)
	const existing = await rowFor(env, site.id)
	if (existing?.hostname === h) return getProxy(env, site)
	// Register the new hostname first: if Cloudflare refuses it, the working one stays.
	const ch = await cfApi<CustomHostname>(env, 'POST', '', { hostname: h, ssl: { method: 'http', type: 'dv', settings: { min_tls_version: '1.2' } } })
	const s = fromCf(ch)
	try {
		if (existing) await removeProxy(env, site)
		await env.CONTROL.prepare('INSERT INTO proxy_domains (hostname, site_id, cf_id, status, ssl_status, verification, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
			.bind(h, site.id, ch.id, s.status, s.ssl_status, s.verification, Date.now())
			.run()
	} catch (e) {
		// don't leave a custom hostname at Cloudflare that no row points to
		await cfApi(env, 'DELETE', `/${ch.id}`).catch(() => {})
		throw e
	}
	invalidate('proxyhost:')
	return proxyView(env, await rowFor(env, site.id))
}

export async function removeProxy(env: Env, site: Site) {
	const row = await rowFor(env, site.id)
	if (!row) return proxyView(env, null)
	if (managedProxyEnabled(env)) {
		try {
			await cfApi(env, 'DELETE', `/${row.cf_id}`)
		} catch (e) {
			// already gone at Cloudflare is fine; anything else should surface
			if (!(e instanceof HttpError && e.status === 404)) throw e
		}
	}
	await env.CONTROL.prepare('DELETE FROM proxy_domains WHERE hostname = ?').bind(row.hostname).run()
	invalidate('proxyhost:')
	return proxyView(env, null)
}

/** Whether a request arrived on a customer's proxy hostname (cached per isolate). */
export function isProxyHost(env: Env, hostname: string): Promise<boolean> {
	if (!env.PROXY_CNAME_TARGET) return Promise.resolve(false)
	// the Host header is caller-controlled: only real hostnames reach the cache
	if (hostname.length > 253 || !/^[a-z0-9.-]+$/i.test(hostname)) return Promise.resolve(false)
	return cached(`proxyhost:${hostname}`, async () => Boolean(await env.CONTROL.prepare('SELECT 1 FROM proxy_domains WHERE hostname = ?').bind(hostname).first()))
}
