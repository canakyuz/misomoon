// What scripts/deploy.ts changes in the shard list, kept free of I/O so it can be tested.
// A shard's region is in its binding: SHARD_EU_0, SHARD_US_0, SHARD_APAC_0, or SHARD_0
// for a shard without one (src/control.ts reads it the same way).

export const REGIONS = ['eu', 'us', 'apac'] as const
export type Region = (typeof REGIONS)[number]
/** '' is the group of shards without a region. */
export type Group = '' | Region

export interface Db {
	binding: string
	name: string
	id: string
	dir: string
}

const BINDING = /^SHARD_(?:(EU|US|APAC)_)?(\d+)$/

export function shardOf(binding: string): { group: Group; index: number } | undefined {
	const m = binding.match(BINDING)
	return m ? { group: (m[1]?.toLowerCase() ?? '') as Group, index: Number(m[2]) } : undefined
}

const bindingOf = (group: Group, i: number) => (group ? `SHARD_${group.toUpperCase()}_${i}` : `SHARD_${i}`)
const nameOf = (group: Group, i: number) => (group ? `misomoon-shard-${group}-${i}` : `misomoon-shard-${i}`)

/** SHARD_COUNT as a number of shards; undefined when unset or blank, which keeps what is bound. */
export function parseCount(value: string | undefined): number | undefined {
	if (value === undefined || value.trim() === '') return undefined
	const count = Number(value)
	if (!Number.isInteger(count) || count < 0) throw new Error('SHARD_COUNT must be a whole number')
	return count
}

/** SHARD_REGIONS, like `eu:2,us:1,apac:1`, as a count per region; null when unset. */
export function parseRegions(value: string | undefined): Partial<Record<Region, number>> | null {
	if (value === undefined || value.trim() === '') return null
	const out: Partial<Record<Region, number>> = {}
	for (const part of value.split(',')) {
		const m = part.trim().match(/^(eu|us|apac):(\d+)$/)
		if (!m || m[1] in out) throw new Error('SHARD_REGIONS is like eu:2,us:1,apac:1, with each region once: eu, us or apac')
		out[m[1] as Region] = Number(m[2])
	}
	return out
}

/** The `wrangler d1 create` flags for a new shard. D1 offers a guaranteed jurisdiction for
 *  the EU and the US only; Asia-Pacific is a location hint. */
export function createArgs(region: Region | null, jurisdiction: string | undefined): string[] {
	if (region === 'apac') return ['--location', 'apac']
	if (region) return ['--jurisdiction', region]
	return jurisdiction ? ['--jurisdiction', jurisdiction] : []
}

export interface Plan {
	/** The shards bound after this run, in order; a new one has an empty id. */
	keep: Db[]
	/** The databases to create. */
	create: { binding: string; name: string; region: Region | null }[]
	/** Bound shards beyond the wanted count, to retire or unbind. */
	extra: Db[]
}

/** Keeps `want[group]` shards per group; a group left out of `want` keeps what is bound. */
export function planShards(bound: Db[], want: Partial<Record<Group, number>>): Plan {
	const plan: Plan = { keep: [], create: [], extra: [] }
	for (const group of ['', ...REGIONS] as Group[]) {
		const mine = bound.filter((d) => shardOf(d.binding)?.group === group)
		const count = want[group] ?? mine.length
		for (let i = 0; i < count; i++) {
			const d = mine.find((x) => shardOf(x.binding)!.index === i)
			if (d) plan.keep.push(d)
			else {
				const fresh = { binding: bindingOf(group, i), name: nameOf(group, i), region: group || null }
				plan.create.push(fresh)
				plan.keep.push({ binding: fresh.binding, name: fresh.name, id: '', dir: 'migrations/shard' })
			}
		}
		plan.extra.push(...mine.filter((d) => shardOf(d.binding)!.index >= count))
	}
	if (plan.keep.length === 0) throw new Error('at least one shard is needed: set SHARD_COUNT or SHARD_REGIONS')
	return plan
}
