import { localMidnight } from '../imported'
import type { Zone } from '../time'
import { ImportError } from './types'

/**
 * The server address someone typed, as an https origin with an optional path, or an
 * ImportError. Only public hosts: no IP address, `localhost`, internal names or ports, so
 * an import never reaches a private network.
 */
export function publicBase(input: string, what = 'Server address'): string {
	let url: URL
	try {
		url = new URL(/^[a-z]+:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`)
	} catch {
		throw new ImportError(`${what} isn't a web address`)
	}
	const host = url.hostname.toLowerCase()
	if (url.protocol !== 'https:') throw new ImportError(`${what} must start with https://`)
	if (url.port || url.username || url.password) throw new ImportError(`${what} can't have a port or a user name`)
	if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) || /^\d+(\.\d+){3}$/.test(host) || /\.(localhost|local|internal|home\.arpa)$/.test(host)) {
		throw new ImportError(`${what} must be a public host name, such as analytics.example.com`)
	}
	return `https://${host}${url.pathname.replace(/\/+$/, '')}`
}

const DAY_MS = 86_400_000

/** The next calendar day of a YYYY-MM-DD date. */
export const nextDay = (day: string) => new Date(Date.parse(day + 'T00:00:00Z') + DAY_MS).toISOString().slice(0, 10)
/** The calendar day before a YYYY-MM-DD date. */
export const prevDay = (day: string) => new Date(Date.parse(day + 'T00:00:00Z') - DAY_MS).toISOString().slice(0, 10)

/** A local day as UTC milliseconds: its first instant, and the first of the next day. */
export function dayBounds(day: string, zone: Zone): [start: number, end: number] {
	return [localMidnight(day, zone), localMidnight(nextDay(day), zone)]
}

/** A field's trimmed value, or an ImportError naming it. */
export function required(input: Record<string, string>, name: string, label: string): string {
	const v = (input[name] ?? '').trim()
	if (!v) throw new ImportError(`${label} is required`)
	return v
}

/** A count from an API: a number, a numeric string, or `{ value }`. Anything else is 0. */
export function count(v: unknown): number {
	const x = Number(v && typeof v === 'object' && 'value' in v ? (v as { value: unknown }).value : v)
	return Number.isFinite(x) && x > 0 ? x : 0
}
