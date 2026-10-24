import { describe, expect, it } from 'vite-plus/test'
import { pickShard, privacyPolicy, REGIONS, regionFromTimezone, serverRegions, shardRegion, shardsIn, storeRegion, type ShardInfo } from '../src'

const shard = (name: string, region: ShardInfo['region'], status: ShardInfo['status'] = 'active'): ShardInfo => ({ name, weight: 1, status, size: 0, region })

describe('regions', () => {
	it('lists the three regions in a fixed order', () => {
		expect(REGIONS).toEqual(['eu', 'us', 'apac'])
	})

	it('reads a shard binding: SHARD_EU_0 is in the EU, SHARD_0 in no region, anything else is not a shard', () => {
		expect(shardRegion('SHARD_EU_0')).toBe('eu')
		expect(shardRegion('SHARD_US_12')).toBe('us')
		expect(shardRegion('SHARD_APAC_3')).toBe('apac')
		expect(shardRegion('SHARD_0')).toBeNull()
		for (const other of ['SHARD_SG_0', 'SHARD_EU', 'shard_eu_0', 'CONTROL', 'SHARD_EU_0X']) expect(shardRegion(other)).toBeUndefined()
	})

	it('guesses a region from a timezone', () => {
		expect(regionFromTimezone('Europe/Berlin')).toBe('eu')
		expect(regionFromTimezone('Africa/Lagos')).toBe('eu')
		expect(regionFromTimezone('Atlantic/Reykjavik')).toBe('eu')
		expect(regionFromTimezone('America/New_York')).toBe('us')
		expect(regionFromTimezone('America/Sao_Paulo')).toBe('us')
		expect(regionFromTimezone('Pacific/Honolulu')).toBe('us')
		expect(regionFromTimezone('Asia/Singapore')).toBe('apac')
		expect(regionFromTimezone('Asia/Jakarta')).toBe('apac')
		expect(regionFromTimezone('Australia/Sydney')).toBe('apac')
		expect(regionFromTimezone('Pacific/Auckland')).toBe('apac')
		expect(regionFromTimezone('Asia/Dubai')).toBe('eu')
		expect(regionFromTimezone('UTC')).toBeNull()
	})

	it('lists the regions that have an active shard, in the fixed order', () => {
		expect(serverRegions([shard('shard_0', null), shard('shard_1', null)])).toEqual([])
		expect(serverRegions([shard('shard_us_0', 'us'), shard('shard_eu_0', 'eu'), shard('shard_eu_1', 'eu'), shard('shard_apac_0', 'apac', 'retiring')])).toEqual(['eu', 'us'])
	})

	it('takes a region for a new site: the one asked for, or a guess from the timezone, or null on a server without regions', () => {
		expect(storeRegion('us', 'Europe/Paris', ['eu', 'us'])).toBe('us')
		expect(storeRegion(undefined, 'Europe/Paris', ['eu', 'us'])).toBe('eu')
		expect(storeRegion(null, 'Asia/Singapore', ['eu', 'us', 'apac'])).toBe('apac')
		// a guess the server can't keep falls back to its first region
		expect(storeRegion(undefined, 'Asia/Singapore', ['us', 'eu'])).toBe('eu')
		expect(storeRegion(undefined, 'UTC', ['us'])).toBe('us')
		expect(storeRegion(undefined, 'Europe/Paris', [])).toBeNull()
		expect(storeRegion('mars', 'UTC', ['eu'])).toEqual({ error: 'region is eu, us or apac' })
		expect(storeRegion('apac', 'UTC', ['eu', 'us'])).toEqual({ error: 'this server stores data in eu and us only' })
		expect(storeRegion('eu', 'UTC', [])).toEqual({ error: 'this server has no regions; leave region out' })
	})

	it("places a site only on its region's shards; a site without a region goes anywhere", () => {
		const shards = [shard('shard_0', null), shard('shard_eu_0', 'eu'), shard('shard_eu_1', 'eu'), shard('shard_us_0', 'us')]
		expect(shardsIn(shards, 'eu').map((s) => s.name)).toEqual(['shard_eu_0', 'shard_eu_1'])
		expect(shardsIn(shards, null)).toEqual(shards)
		for (let i = 0; i < 50; i++) expect(['shard_eu_0', 'shard_eu_1']).toContain(pickShard(`site-${i}`, shardsIn(shards, 'eu'), 1e9))
		expect(() => pickShard('x', shardsIn(shards, 'apac'), 1e9)).toThrow('no active shard available')
	})
})

describe('privacy policy text by region', () => {
	const base = { domain: 'shop.com', features: [], retentionDays: 0, signals: false, hosted: true }
	it('names where the statistics are stored', () => {
		expect(privacyPolicy({ ...base, region: 'eu' })).toContain('stores them in the European Union.')
		expect(privacyPolicy({ ...base, region: 'us' })).toContain('stores them in the United States.')
		expect(privacyPolicy({ ...base, region: 'apac' })).toContain('stores them in the Asia-Pacific region.')
		expect(privacyPolicy({ ...base, region: null })).not.toContain('stores them in')
		expect(privacyPolicy({ ...base, hosted: false, region: 'us' })).toContain('in our own Cloudflare account, in the United States')
	})
})
