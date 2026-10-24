import { describe, expect, it } from 'vite-plus/test'
import { proxyView, validProxyHostname } from './proxy'

const site = { id: 'shop', domain: 'www.shop.com', name: 'Shop', timezone: 'UTC', team_id: 't', public: 0, created_at: 0 }

describe('managed proxy', () => {
	it("accepts subdomains of the site's own domain only", () => {
		expect(validProxyHostname(site, 'https://Stats.shop.com/')).toBe('stats.shop.com')
		expect(() => validProxyHostname(site, 'stats.other.com')).toThrow(/subdomain of shop.com/)
		expect(() => validProxyHostname(site, 'evilshop.com')).toThrow()
		expect(() => validProxyHostname(site, 'www.shop.com')).toThrow(/other than www/)
	})

	it('lists the DNS records to add, and says when it is unavailable', () => {
		const env = { PROXY_CNAME_TARGET: 'proxy.misomoon.com' } as Env
		expect(proxyView(env, null)).toEqual({ available: false, target: 'proxy.misomoon.com', domain: null })
		const v = proxyView(env, {
			hostname: 'stats.shop.com',
			site_id: 'shop',
			cf_id: 'x',
			status: 'pending',
			ssl_status: 'pending_validation',
			verification: JSON.stringify([{ name: '_cf-custom-hostname.stats.shop.com', value: 'abc' }]),
			created_at: 0,
			checked_at: null,
		})
		expect(v.domain?.active).toBe(false)
		expect(v.domain?.records).toEqual([
			{ type: 'CNAME', name: 'stats.shop.com', value: 'proxy.misomoon.com' },
			{ type: 'TXT', name: '_cf-custom-hostname.stats.shop.com', value: 'abc' },
		])
	})
})
