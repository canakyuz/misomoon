import type { Feature } from './features'
import type { Region } from './shard'

// ---------------------------------------------------------------- excluded IP addresses

const MAX_IP_RULES = 50
const IP_RULES_ERROR = `exclude_ips takes up to ${MAX_IP_RULES} IP addresses or ranges, such as 203.0.113.7 or 2001:db8::/32`

/** An address as a number and its width in bits, or null when it is not an IPv4 or IPv6 address. */
function parseIp(text: string): { value: bigint; bits: 32 | 128 } | null {
	if (/^\d{1,3}(\.\d{1,3}){3}$/.test(text)) {
		const parts = text.split('.').map(Number)
		if (parts.some((p) => p > 255)) return null
		return { value: parts.reduce((n, p) => (n << 8n) | BigInt(p), 0n), bits: 32 }
	}
	if (!/^[0-9a-f:]+$/i.test(text) || (text.match(/::/g) ?? []).length > 1 || text.includes(':::')) return null
	const [head, tail] = text.includes('::') ? text.split('::') : [text, null]
	const left = head ? head.split(':') : []
	const right = tail ? tail.split(':') : []
	const missing = 8 - left.length - right.length
	if (tail === null ? missing !== 0 : missing < 1) return null
	const groups = [...left, ...Array(tail === null ? 0 : missing).fill('0'), ...right]
	if (groups.some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return null
	return { value: groups.reduce((n, g) => (n << 16n) | BigInt(parseInt(g, 16)), 0n), bits: 128 }
}

/** An address or a CIDR range in canonical text, or null when it is neither. */
function canonicalRule(text: string): string | null {
	const [addr, prefix, extra] = text.trim().toLowerCase().split('/')
	if (extra !== undefined || !parseIp(addr)) return null
	if (prefix === undefined) return addr
	const bits = parseIp(addr)!.bits
	return /^\d{1,3}$/.test(prefix) && Number(prefix) <= bits ? `${addr}/${Number(prefix)}` : null
}

/** The stored column (comma-separated addresses and ranges) as a list. */
export function ipRules(stored: string | null | undefined): string[] {
	return (stored ?? '').split(',').filter(Boolean)
}

/** The column value for a list of addresses and ranges from the API: null for none, or an error. */
export function storeIpRules(list: unknown): string | null | { error: string } {
	if (list == null) return null
	if (!Array.isArray(list) || list.some((p) => typeof p !== 'string')) return { error: 'exclude_ips must be a list of IP addresses' }
	const rules = list.map((p: string) => (p.trim() ? canonicalRule(p) : ''))
	if (rules.some((r) => r === null)) return { error: IP_RULES_ERROR }
	const unique = [...new Set(rules.filter(Boolean) as string[])]
	if (unique.length > MAX_IP_RULES) return { error: IP_RULES_ERROR }
	return unique.length ? unique.join(',') : null
}

/** Whether a visitor's address falls in one of a site's excluded addresses or ranges. */
export function ipExcluded(ip: string, rules: string[]): boolean {
	const visitor = parseIp(ip.trim().toLowerCase())
	if (!visitor) return false
	return rules.some((rule) => {
		const [addr, prefix] = rule.split('/')
		const net = parseIp(addr)
		if (!net || net.bits !== visitor.bits) return false
		const shift = BigInt(net.bits - (prefix === undefined ? net.bits : Number(prefix)))
		return visitor.value >> shift === net.value >> shift
	})
}

// ---------------------------------------------------------------- browser signals

/**
 * Whether the browser asked not to be tracked: Global Privacy Control (`Sec-GPC: 1`) or
 * Do Not Track (`DNT: 1`). Browsers send both headers on every request, the beacon too, so
 * the tracker carries no code for them.
 */
export function privacySignal(h: Headers): boolean {
	return h.get('sec-gpc')?.trim() === '1' || h.get('dnt')?.trim() === '1'
}

// ---------------------------------------------------------------- retention

const MIN_RETENTION = 30
const MAX_RETENTION = 3650

/** The server's retention, in days: the longest any site keeps data, and what a site that sets none keeps. 0 is no limit. */
export interface RetentionLimits {
	max: number
	default: number
}

/**
 * Reads RETENTION_DAYS (the longest) and RETENTION_DEFAULT_DAYS (for sites that set none).
 * An unset default follows RETENTION_DAYS, and a default can't pass it. Anything that is
 * not a positive whole number is 0.
 */
export function retentionLimits(max: string | undefined, fallback: string | undefined): RetentionLimits {
	const days = (v: string | undefined) => (/^\d+$/.test(v?.trim() ?? '') ? Number(v) : 0)
	const longest = days(max)
	const chosen = fallback?.trim() ? days(fallback) : longest
	return { max: longest, default: longest && (!chosen || chosen > longest) ? longest : chosen }
}

/** The column value for a site's retention from the API: whole days, null for the server default, or an error. */
export function storeRetention(days: unknown, max = 0): number | null | { error: string } {
	if (days == null || days === 0) return null
	const most = max > 0 ? Math.min(max, MAX_RETENTION) : MAX_RETENTION
	if (typeof days !== 'number' || !Number.isInteger(days) || days < MIN_RETENTION || days > most)
		return { error: `retention_days is a whole number of days from ${MIN_RETENTION} to ${most}, or null` }
	return days
}

/** Days a site's events and visits are kept: its own setting or the server default, never past the server's longest. 0 keeps them. */
export function retentionDays(site: number | null | undefined, limits: RetentionLimits): number {
	const days = site ?? limits.default
	return limits.max && (!days || days > limits.max) ? limits.max : days
}

// ---------------------------------------------------------------- privacy policy text

/** What each feature adds to the list of what is recorded, in the policy's words. */
const RECORDS: Record<Feature, string> = {
	outbound: 'links you follow to other sites, without their query string',
	downloads: 'files you download, without their query string',
	forms: 'forms you send, by the form’s name, never what you typed',
	events: 'buttons and links we marked as events',
	payments:
		'whether a visit led to a purchase, through a random reference our payment provider passes back with the payment, without your name, email address or card details',
	vitals: 'how fast pages load and respond',
	clicks: 'the buttons and links you click, with their text',
	errors: 'JavaScript errors on the page, with email addresses, ids and other details removed',
	fields: 'which form fields you use and where you stop, never what you type',
	media: 'videos and audio you play, and how far',
	content: 'sections of a page we marked, when you see or click them',
	search: 'what you search for on this site, with email addresses and long numbers removed',
}

export interface PolicyInput {
	domain: string
	features: readonly Feature[]
	/** days the statistics are kept; 0 when nothing deletes them on a schedule */
	retentionDays: number
	/** the site drops visits from browsers that send Global Privacy Control or Do Not Track */
	signals: boolean
	/** the site uses the hosted service, rather than misomoon in its own Cloudflare account */
	hosted: boolean
	/** where the site's statistics are stored; null or absent when the server has no regions */
	region?: Region | null
}

const REGION_NAMES: Record<Region, string> = { eu: 'the European Union', us: 'the United States', apac: 'the Asia-Pacific region' }

/**
 * A privacy policy section, in Markdown, for a site that uses misomoon: what is recorded with
 * the site's features on, how visitors are counted, where the data is kept, for how long, the
 * legal basis, and how to opt out. Site owners paste it into their own policy.
 */
export function privacyPolicy(p: PolicyInput): string {
	const recorded = [
		'the page address, the site that sent you, and campaign tags',
		'your country, region and city, read from your IP address, and your network operator',
		'your browser, operating system, device type, screen size and language',
		'how long a page was open and how far you scrolled',
		'actions we count, such as a sign-up or a purchase, with the details we attach to them',
		...p.features.map((f) => RECORDS[f]),
	]
	const place = p.region ? REGION_NAMES[p.region] : null
	const where = p.hosted
		? `misomoon processes these statistics for us under a data processing agreement, on Cloudflare’s network${place ? `, and stores them in ${place}` : ''}.`
		: `We run misomoon in our own Cloudflare account${place ? `, in ${place}` : ''}, so these statistics stay with us; Cloudflare processes them for us under its data processing agreement.`
	return [
		'## Analytics',
		'',
		`To see how ${p.domain} is used, we use misomoon, a privacy-friendly analytics tool. It sets no cookies, and stores nothing on your device unless you opt out of being counted, which it remembers in your browser.`,
		'',
		'To count unique visitors, misomoon makes an identifier from your IP address and browser with a random value that changes every day, and keeps only that identifier. Your IP address is never stored. The identifier can’t be followed across sites, or from one day to the next, except that a visit still going at midnight UTC keeps both days’ identifiers.',
		'',
		'It records:',
		'',
		...recorded.map((r) => `- ${r}`),
		'',
		`These statistics are counted together; we don’t use them to identify you or to show you ads. ${where}`,
		'',
		p.retentionDays > 0 ? `We keep these statistics for ${p.retentionDays} days.` : 'We keep these statistics until we delete them.',
		'',
		'We rely on our legitimate interest in understanding and improving our site (Article 6(1)(f) of the GDPR).',
		'',
		[
			p.signals ? 'If your browser sends Global Privacy Control or Do Not Track, misomoon records nothing.' : '',
			'To stop being counted in this browser, use the opt-out button on this page.',
		]
			.filter(Boolean)
			.join(' '),
		'',
	].join('\n')
}

/**
 * A button for a site's privacy page that stops misomoon counting this browser, and undoes
 * it. It sets the flag m.js reads (`misomoon_ignore` in localStorage), at the visitor's request.
 */
export const OPT_OUT_SNIPPET = `<button type="button" id="misomoon-opt-out"></button>
<script>
  (function (button) {
    function out() { try { return !!localStorage.misomoon_ignore } catch (e) { return false } }
    function show() { button.textContent = out() ? 'Count my visits again' : 'Stop counting my visits' }
    button.onclick = function () {
      try { out() ? localStorage.removeItem('misomoon_ignore') : localStorage.setItem('misomoon_ignore', 'true') } catch (e) {}
      show()
    }
    show()
  })(document.getElementById('misomoon-opt-out'))
</script>`
