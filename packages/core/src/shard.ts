import { DAY, utcDay } from './time'
import type { Window } from './types'

export interface ShardInfo {
	name: string
	/** relative capacity; a shard with weight 2 receives roughly twice the sites */
	weight: number
	/** draining: full, keeps its data; retiring: being emptied so it can be unbound */
	status: 'active' | 'draining' | 'readonly' | 'retiring'
	/** bytes on disk at the last maintenance run */
	size: number
	/** where the shard stores data (from its binding, see shardRegion); null or absent for anywhere */
	region?: Region | null
}

/** A span of UTC days of one site's data living on one shard. `to_day` null means open. */
export interface ShardRange {
	shard: string
	from_day: number
	to_day: number | null
}

/** FNV-1a, 32 bit. Stable across runtimes, good enough for placement. */
export function fnv1a(s: string): number {
	let h = 0x811c9dc5
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i)
		h = Math.imul(h, 0x01000193)
	}
	return h >>> 0
}

/**
 * Weighted rendezvous hashing over the active shards. The weight is scaled by the
 * shard's free space under `limit` bytes, so a fresh shard takes most new placements
 * and a nearly full one takes almost none. Only new ranges are placed this way;
 * existing ranges never move, so the order shifting as shards fill is harmless.
 */
export function pickShard(siteId: string, shards: ShardInfo[], limit: number): string {
	let best: string | null = null
	let bestScore = -Infinity
	for (const s of shards) {
		const weight = s.weight * (1 - s.size / limit)
		if (s.status !== 'active' || weight <= 0) continue
		const h = (fnv1a(`${siteId}:${s.name}`) + 1) / 4294967297
		const score = -weight / Math.log(h)
		if (score > bestScore) {
			bestScore = score
			best = s.name
		}
	}
	if (!best) throw new Error('no active shard available')
	return best
}

/**
 * The last day a site writes to a shard it is leaving. Usually the later of the event's
 * day and today, but when today ends within `settle` ms it is tomorrow, so every
 * isolate's cached routing (which lives up to `settle`) has expired before the new
 * range takes writes.
 */
export function closingDay(eventDay: number, now: number, settle: number): number {
	return Math.max(eventDay, utcDay(now + settle))
}

/** The range that receives writes for `day`, or null when the site has none yet. */
export function writeRange(ranges: ShardRange[], day: number): ShardRange | null {
	return ranges.find((r) => r.from_day <= day && (r.to_day == null || r.to_day >= day)) ?? null
}

/** Splits a query window across the ranges it touches, clamping each to its days. */
export function planWindow(ranges: ShardRange[], w: Window): { shard: string; window: Window }[] {
	const out: { shard: string; window: Window }[] = []
	for (const r of ranges) {
		const from = Math.max(w.from, r.from_day * DAY)
		const to = r.to_day == null ? w.to : Math.min(w.to, (r.to_day + 1) * DAY)
		if (from < to) out.push({ shard: r.shard, window: { from, to } })
	}
	return out
}

// ---------------------------------------------------------------- regions

/**
 * Where a site's events are stored. A shard's region comes from its binding name:
 * SHARD_EU_0 lives in D1's `eu` jurisdiction, SHARD_US_0 in `us`, SHARD_APAC_0 under the
 * `apac` location hint, and SHARD_0 in no particular region.
 */
export const REGIONS = ['eu', 'us', 'apac'] as const
export type Region = (typeof REGIONS)[number]

const BINDING = /^SHARD_(?:(EU|US|APAC)_)?\d+$/

/** A binding's region, null for a shard without one, or undefined when it isn't a shard binding. */
export function shardRegion(binding: string): Region | null | undefined {
	const m = BINDING.exec(binding)
	if (!m) return undefined
	return m[1] ? (m[1].toLowerCase() as Region) : null
}

// Middle Eastern zones are closer to the EU's data centers than to Asia-Pacific's.
const NEAR_EU = /^Asia\/(Dubai|Riyadh|Qatar|Kuwait|Bahrain|Muscat|Baghdad|Tehran|Jerusalem|Tel_Aviv|Beirut|Damascus|Amman|Nicosia|Famagusta|Tbilisi|Yerevan|Baku|Gaza|Hebron|Aden)$/

/** The region nearest a timezone, or null when the zone says nothing about place (UTC). */
export function regionFromTimezone(zone: string): Region | null {
	if (NEAR_EU.test(zone) || /^(Europe|Africa)\//.test(zone) || /^Atlantic\/(Reykjavik|Azores|Canary|Madeira|Faroe|Faeroe)$/.test(zone)) return 'eu'
	if (/^(America|US|Canada)\//.test(zone) || zone === 'Pacific/Honolulu' || /^Atlantic\/(Bermuda|Stanley|South_Georgia)$/.test(zone)) return 'us'
	if (/^(Asia|Australia|Pacific|Indian)\//.test(zone)) return 'apac'
	return null
}

/** The regions that have an active shard, in REGIONS order: what a new site may choose. */
export function serverRegions(shards: ShardInfo[]): Region[] {
	return REGIONS.filter((r) => shards.some((s) => s.region === r && s.status === 'active'))
}

/** The shards a site may be placed on: its region's, or every shard for a site without one. */
export function shardsIn<T extends ShardInfo>(shards: T[], region: Region | null | undefined): T[] {
	return region ? shards.filter((s) => s.region === region) : shards
}

/**
 * A new site's region: the one asked for, or the region of its timezone, or the server's
 * first region in REGIONS order. Null on a server without regional shards. An error when the server can't
 * keep the region asked for.
 */
export function storeRegion(asked: unknown, timezone: string, available: Region[]): Region | null | { error: string } {
	if (asked != null && !REGIONS.includes(asked as Region)) return { error: `region is ${REGIONS.slice(0, -1).join(', ')} or ${REGIONS.at(-1)}` }
	if (!available.length) return asked == null ? null : { error: 'this server has no regions; leave region out' }
	if (asked != null) {
		if (available.includes(asked as Region)) return asked as Region
		return { error: `this server stores data in ${available.length > 1 ? `${available.slice(0, -1).join(', ')} and ${available.at(-1)}` : available[0]} only` }
	}
	const guess = regionFromTimezone(timezone)
	// otherwise the first in REGIONS order, so the EU wins when it is there
	return guess && available.includes(guess) ? guess : REGIONS.find((r) => available.includes(r))!
}
