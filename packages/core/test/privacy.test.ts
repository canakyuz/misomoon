import { describe, expect, it } from 'vite-plus/test'
import { DEFAULT_FEATURES, ipExcluded, OPT_OUT_SNIPPET, ipRules, privacyPolicy, privacySignal, retentionDays, retentionLimits, storeIpRules, storeRetention } from '../src'

describe('excluded IP addresses', () => {
	it('stores addresses and ranges, trimmed and without repeats', () => {
		expect(storeIpRules([' 203.0.113.7 ', '198.51.100.0/24', '2001:DB8::/32', '203.0.113.7'])).toBe('203.0.113.7,198.51.100.0/24,2001:db8::/32')
		expect(storeIpRules([])).toBeNull()
		expect(storeIpRules(null)).toBeNull()
	})

	it('refuses anything that is not an address or a range, and more than 50', () => {
		const error = { error: 'exclude_ips takes up to 50 IP addresses or ranges, such as 203.0.113.7 or 2001:db8::/32' }
		for (const bad of [['example.com'], ['256.1.1.1'], ['10.0.0.0/33'], ['2001:db8::/129'], ['1.2.3'], ['2001:db8:::1'], ['1:2:3:4:5:6:7:8:9']]) expect(storeIpRules(bad)).toEqual(error)
		expect(storeIpRules(Array.from({ length: 51 }, (_, i) => `10.0.0.${i}`))).toEqual(error)
		expect(storeIpRules('10.0.0.1')).toEqual({ error: 'exclude_ips must be a list of IP addresses' })
	})

	it('matches an address against single addresses and ranges of either family', () => {
		const rules = ipRules('203.0.113.7,198.51.100.0/24,2001:db8::/32,::1')
		expect(ipExcluded('203.0.113.7', rules)).toBe(true)
		expect(ipExcluded('203.0.113.8', rules)).toBe(false)
		expect(ipExcluded('198.51.100.255', rules)).toBe(true)
		expect(ipExcluded('198.51.101.0', rules)).toBe(false)
		expect(ipExcluded('2001:db8:ffff::42', rules)).toBe(true)
		expect(ipExcluded('2001:0DB8:0:0:0:0:0:1', rules)).toBe(true)
		expect(ipExcluded('2001:db9::1', rules)).toBe(false)
		expect(ipExcluded('0:0:0:0:0:0:0:1', rules)).toBe(true)
		// an IPv4 address only matches IPv4 rules
		expect(ipExcluded('0.0.0.1', ipRules('::/0'))).toBe(false)
		expect(ipExcluded('8.8.8.8', ipRules('0.0.0.0/0'))).toBe(true)
		expect(ipExcluded('not an ip', rules)).toBe(false)
		expect(ipExcluded('203.0.113.7', [])).toBe(false)
	})
})

describe('browser privacy signals', () => {
	it('reads Global Privacy Control and Do Not Track from the request headers', () => {
		expect(privacySignal(new Headers({ 'sec-gpc': '1' }))).toBe(true)
		expect(privacySignal(new Headers({ dnt: '1' }))).toBe(true)
		expect(privacySignal(new Headers({ dnt: '0', 'sec-gpc': '0' }))).toBe(false)
		expect(privacySignal(new Headers())).toBe(false)
	})
})

describe('retention', () => {
	it('stores whole days from 30 to 3650, or null to use the server default', () => {
		expect(storeRetention(395)).toBe(395)
		expect(storeRetention(null)).toBeNull()
		expect(storeRetention(0)).toBeNull()
		const error = { error: 'retention_days is a whole number of days from 30 to 3650, or null' }
		for (const bad of [29, 3651, 90.5, '90', -1]) expect(storeRetention(bad)).toEqual(error)
	})

	it('refuses more days than the server keeps', () => {
		expect(storeRetention(1825, 1825)).toBe(1825)
		expect(storeRetention(1826, 1825)).toEqual({ error: 'retention_days is a whole number of days from 30 to 1825, or null' })
		// a limit past ten years still stops at ten years
		expect(storeRetention(3651, 5000)).toEqual({ error: 'retention_days is a whole number of days from 30 to 3650, or null' })
	})

	it('reads the server limits; the default follows the longest and never passes it', () => {
		expect(retentionLimits('0', undefined)).toEqual({ max: 0, default: 0 })
		expect(retentionLimits(undefined, '')).toEqual({ max: 0, default: 0 })
		expect(retentionLimits('1825', '761')).toEqual({ max: 1825, default: 761 })
		expect(retentionLimits('400', undefined)).toEqual({ max: 400, default: 400 })
		expect(retentionLimits('400', ' ')).toEqual({ max: 400, default: 400 })
		expect(retentionLimits('400', '0')).toEqual({ max: 400, default: 400 })
		expect(retentionLimits('400', '900')).toEqual({ max: 400, default: 400 })
		expect(retentionLimits('0', '90')).toEqual({ max: 0, default: 90 })
		for (const bad of ['-5', '1.5', 'forever']) expect(retentionLimits(bad, undefined)).toEqual({ max: 0, default: 0 })
	})

	it('keeps data for the site setting or the server default, never past the longest; 0 keeps it', () => {
		expect(retentionDays(null, { max: 0, default: 0 })).toBe(0)
		expect(retentionDays(90, { max: 0, default: 0 })).toBe(90)
		expect(retentionDays(null, { max: 0, default: 90 })).toBe(90)
		expect(retentionDays(800, { max: 0, default: 90 })).toBe(800)
		expect(retentionDays(null, { max: 1825, default: 761 })).toBe(761)
		expect(retentionDays(90, { max: 1825, default: 761 })).toBe(90)
		expect(retentionDays(1825, { max: 1825, default: 761 })).toBe(1825)
		// saved before the server had a limit
		expect(retentionDays(3650, { max: 1825, default: 761 })).toBe(1825)
	})
})

describe('privacy policy text', () => {
	const base = { domain: 'shop.com', features: DEFAULT_FEATURES, retentionDays: 395, signals: false, hosted: true }

	it('names the site, says how visitors are counted, and gives the legal basis', () => {
		const text = privacyPolicy(base)
		expect(text).toMatch(/^## Analytics\n/)
		expect(text).toContain('To see how shop.com is used, we use misomoon')
		expect(text).toContain('It sets no cookies, and stores nothing on your device unless you opt out of being counted, which it remembers in your browser.')
		expect(text).toContain('The identifier can’t be followed across sites, or from one day to the next, except that a visit still going at midnight UTC keeps both days’ identifiers.')
		expect(text).toContain('Your IP address is never stored.')
		expect(text).toContain('legitimate interest')
		expect(text).toContain('Article 6(1)(f)')
		expect(text).toContain('We keep these statistics for 395 days.')
		expect(text).not.toMatch(/\s—\s/)
	})

	it('lists only what the ticked features collect', () => {
		const all = privacyPolicy(base)
		for (const phrase of ['links you follow to other sites', 'files you download', 'how fast pages load', 'JavaScript errors', 'what you type', 'videos and audio', 'search for on this site', 'payment provider'])
			expect(all).toContain(phrase)
		const light = privacyPolicy({ ...base, features: ['outbound'] })
		expect(light).toContain('links you follow to other sites')
		for (const phrase of ['files you download', 'how fast pages load', 'JavaScript errors', 'payment provider', 'search for on this site']) expect(light).not.toContain(phrase)
	})

	it('says where the data is kept, for the hosted service and for a self-hosted server', () => {
		expect(privacyPolicy(base)).toContain('under a data processing agreement')
		const self = privacyPolicy({ ...base, hosted: false })
		expect(self).toContain('in our own Cloudflare account')
		expect(self).not.toContain('under a data processing agreement with misomoon')
	})

	it('explains how to opt out, and honours browser signals when the site does', () => {
		expect(privacyPolicy(base)).toContain('opt-out button')
		expect(privacyPolicy(base)).not.toContain('Global Privacy Control')
		expect(privacyPolicy({ ...base, signals: true })).toContain('If your browser sends Global Privacy Control or Do Not Track, misomoon records nothing.')
	})

	it('says when nothing is deleted on a schedule', () => {
		expect(privacyPolicy({ ...base, retentionDays: 0 })).toContain('We keep these statistics until we delete them.')
	})
})

describe('opt-out button', () => {
	it('sets and clears the flag the tracker reads, and survives blocked storage', () => {
		expect(OPT_OUT_SNIPPET).toContain('<button type="button" id="misomoon-opt-out">')
		expect(OPT_OUT_SNIPPET).toContain("localStorage.setItem('misomoon_ignore', 'true')")
		expect(OPT_OUT_SNIPPET).toContain("localStorage.removeItem('misomoon_ignore')")
		expect(OPT_OUT_SNIPPET.match(/try \{/g)).toHaveLength(2)
	})
})
