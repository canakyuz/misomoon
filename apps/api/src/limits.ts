import { HttpError } from './control'

/**
 * The rate-limit key of an address. An IPv6 subscriber usually holds a whole /64, so with
 * `block` the key is that block, which the sign-in routes use; without it, the whole
 * address. An IPv4 address, also when written IPv4-mapped, is the address itself. Anything
 * that isn't an address is its own key, as sent, cut to 64 characters.
 */
export function clientKey(ip: string | null | undefined, block = true): string {
	const raw = (ip ?? '').trim()
	if (!raw) return 'unknown'
	const v4 = ipv4(raw)
	if (v4) return v4.join('.')
	const g = ipv6(raw.toLowerCase())
	if (!g) return raw.slice(0, 64)
	// ::ffff:a.b.c.d, also written ::ffff:XXXX:XXXX
	if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return [g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255].join('.')
	const hex = g.map((x) => x.toString(16))
	return block ? `${hex.slice(0, 4).join(':')}::/64` : hex.join(':')
}

function ipv4(s: string): number[] | null {
	if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) return null
	const parts = s.split('.').map(Number)
	return parts.every((n) => n <= 255) ? parts : null
}

/** The eight groups of an IPv6 address, which may be in brackets, carry a zone or end in IPv4. */
function ipv6(s: string): number[] | null {
	s = s.replace(/%.*$/, '')
	if (s.startsWith('[') && s.endsWith(']')) s = s.slice(1, -1)
	const last = s.lastIndexOf(':')
	if (last < 0) return null
	if (s.includes('.')) {
		const v4 = ipv4(s.slice(last + 1))
		if (!v4) return null
		s = `${s.slice(0, last + 1)}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`
	}
	const halves = s.split('::')
	if (halves.length > 2) return null
	const side = (x: string) => (x === '' ? [] : x.split(':'))
	const front = side(halves[0])
	const back = halves.length === 2 ? side(halves[1]) : []
	if (![...front, ...back].every((x) => /^[0-9a-f]{1,4}$/.test(x))) return null
	const n = front.length + back.length
	if (halves.length === 1 ? n !== 8 : n > 7) return null
	return [...front, ...Array(8 - n).fill('0'), ...back].map((x) => parseInt(x, 16))
}

/** A 429 that says in `Retry-After` how many seconds until the caller may try again. */
export class TooMany extends HttpError {
	constructor(
		message: string,
		public retryAfter = 60,
	) {
		super(429, message)
	}
}
