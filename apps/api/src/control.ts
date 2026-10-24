import { closingDay, isTimeZone, pickShard, PLAN_REQUIRED, PLAN_SITE_LIMIT, planRequiredMessage, serverRegions, shardRegion, shardsIn, siteLimitMessage, storeRegion, utcDay, writeRange, type PlanTerms, type Region, type Runner, type ShardInfo, type ShardRange } from '@misomoon/core'

export interface Site {
	id: string
	domain: string
	name: string
	timezone: string
	/** ISO 4217; revenue is reported in this currency only */
	currency: string
	team_id: string
	public: number
	/** most events stored per UTC day; null takes INGEST_DAILY_CAP, 0 blocks the site (usage.ts) */
	ingest_cap: number | null
	/** comma-separated FEATURES (packages/core/src/features.ts); null for the defaults */
	features: string | null
	/** URL parameters that hold the site search term, comma-separated; null for the defaults */
	search_params: string | null
	/** path globs a page must match to count, comma-separated (core pathRules); null for every path */
	include_paths: string | null
	/** path globs that never count, comma-separated; null for none */
	exclude_paths: string | null
	/** visitor IP addresses and CIDR ranges whose beacons are dropped, comma-separated (core ipRules); null for none */
	exclude_ips: string | null
	/** 1 drops beacons from browsers that send Global Privacy Control or Do Not Track */
	privacy_signals: number
	/** days events and visits are kept (core retentionDays); null for the server default, RETENTION_DEFAULT_DAYS */
	retention_days: number | null
	/** where its events are stored, set when it is added (core REGIONS); null for any shard */
	region: Region | null
	created_at: number
}

interface ShardRow extends ShardInfo {
	binding: string
}

// Isolate-level caches of control data. They hold no request state and expire
// quickly, so a change made by another isolate is picked up within a minute.
export const TTL = 60_000
// Misses (unknown site ids, Host headers) are kept briefly and the map is bounded, so
// random ids in beacons can neither grow it nor turn every beacon into a D1 read.
const MISS_TTL = 10_000
const MAX_ENTRIES = 5000
const cache = new Map<string, { at: number; ttl: number; value: unknown }>()

export async function cached<T>(key: string, load: () => Promise<T>, ttl = TTL): Promise<T> {
	const hit = cache.get(key)
	if (hit && Date.now() - hit.at < hit.ttl) return hit.value as T
	const value = await load()
	cache.delete(key)
	if (cache.size >= MAX_ENTRIES) {
		const now = Date.now()
		for (const [k, v] of cache) if (now - v.at >= v.ttl) cache.delete(k)
		// still full: drop the oldest entries (a Map iterates in insertion order)
		for (const k of cache.keys()) {
			if (cache.size < MAX_ENTRIES) break
			cache.delete(k)
		}
	}
	cache.set(key, { at: Date.now(), ttl: value == null || value === false ? Math.min(ttl, MISS_TTL) : ttl, value })
	return value
}

/** Entries in the isolate cache (for tests). */
export function cacheSize(): number {
	return cache.size
}

export function invalidate(prefix: string) {
	for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k)
}

export function getSite(env: Env, id: string): Promise<Site | null> {
	return cached(`site:${id}`, () => env.CONTROL.prepare('SELECT * FROM sites WHERE id = ?').bind(id).first<Site>())
}

export async function listSites(env: Env): Promise<Site[]> {
	const { results } = await env.CONTROL.prepare('SELECT * FROM sites ORDER BY created_at').all<Site>()
	return results
}

export const SITE_ID = /^[a-z0-9-]{2,40}$/

/** A timezone name Intl knows, or a 400. */
export function checkTimezone(tz: unknown): string {
	if (typeof tz !== 'string' || !isTimeZone(tz)) throw new HttpError(400, `unknown timezone: ${String(tz)}`)
	return tz
}

/** An ISO 4217 code, upper-cased, or a 400. */
export function checkCurrency(c: unknown): string {
	if (typeof c !== 'string' || !/^[A-Za-z]{3}$/.test(c)) throw new HttpError(400, 'currency must be a 3-letter ISO 4217 code')
	return c.toUpperCase()
}

/** Turns a constraint error from D1 into an HttpError with `message`. */
export function conflict(e: unknown, status: number, message: string): never {
	if (/UNIQUE constraint failed|FOREIGN KEY constraint failed/.test(String(e))) throw new HttpError(status, message)
	throw e
}

/**
 * Adds a site to a team. With `terms` (a server with PLANS=on), a lapsed team (no plan, no
 * trial running) is a 403 with `code` PLAN_REQUIRED. With a plan that limits sites, the
 * insert only runs while the team has fewer sites than the plan includes, in the same
 * statement, so two requests at once can't both take the last one; a full team is a 403
 * with `code` PLAN_SITE_LIMIT.
 */
export async function createSite(
	env: Env,
	teamId: string,
	input: { id?: string; domain: string; name?: string; timezone?: string; currency?: string; public?: boolean; region?: unknown },
	terms: PlanTerms | null = null,
): Promise<Site> {
	const domain = String(input.domain).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')
	if (!/^[a-z0-9.-]+(:\d+)?$/.test(domain) || !/[a-z0-9]/.test(domain)) throw new HttpError(400, 'domain is not valid')
	const id = input.id ?? domain.replace(/[^a-z0-9]+/g, '-').slice(0, 40).replace(/^-+|-+$/g, '')
	if (!SITE_ID.test(id)) throw new HttpError(400, input.id == null ? 'could not make an id from this domain; pass an id' : 'id must be 2-40 lowercase letters, digits or dashes')
	const site: Site = {
		id,
		domain,
		name: (typeof input.name === 'string' && input.name.trim().slice(0, 80)) || domain,
		timezone: input.timezone == null ? 'UTC' : checkTimezone(input.timezone),
		currency: input.currency == null ? 'USD' : checkCurrency(input.currency),
		team_id: teamId,
		public: input.public ? 1 : 0,
		ingest_cap: null,
		features: null,
		search_params: null,
		include_paths: null,
		exclude_paths: null,
		exclude_ips: null,
		privacy_signals: 0,
		retention_days: null,
		region: null,
		created_at: Date.now(),
	}
	const region = storeRegion(input.region, site.timezone, serverRegions(await getShards(env)))
	if (region && typeof region === 'object') throw new HttpError(400, region.error)
	site.region = region
	if (terms?.state === 'lapsed') throw new HttpError(403, planRequiredMessage(), PLAN_REQUIRED)
	if (await env.CONTROL.prepare('SELECT 1 FROM sites WHERE id = ? OR domain = ?').bind(id, domain).first()) throw new HttpError(409, `${domain} is already on misomoon`)
	const plan = terms?.plan ?? null
	const values = [site.id, site.domain, site.name, site.timezone, site.currency, site.team_id, site.public, site.region, site.created_at]
	const limit = plan?.sites ?? null
	const insert =
		limit === null
			? env.CONTROL.prepare('INSERT INTO sites (id, domain, name, timezone, currency, team_id, public, region, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(...values)
			: env.CONTROL.prepare(
					'INSERT INTO sites (id, domain, name, timezone, currency, team_id, public, region, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM sites WHERE team_id = ?) < ?',
				).bind(...values, teamId, limit)
	const res = await insert.run().catch((e) => conflict(e, 409, `${domain} is already on misomoon`))
	if (!res.meta.changes) throw new HttpError(403, siteLimitMessage(plan!), PLAN_SITE_LIMIT)
	invalidate(`site:${id}`)
	return site
}

/** Bytes a shard may hold before it drains (D1's hard cap is 10 GB). */
export function shardLimit(env: Env): number {
	return Number(env.SHARD_SOFT_LIMIT_MB || 8000) * 1024 * 1024
}

/**
 * The shard registry. Capacity is data, not config: a SHARD_* binding in wrangler.jsonc
 * joins the registry by itself once its schema is migrated, and weight and status are
 * rows in `shards`, changed without a deploy.
 */
export function getShards(env: Env): Promise<ShardRow[]> {
	return cached('shards', async () => {
		const { results: rows } = await env.CONTROL.prepare('SELECT name, binding, weight, status, size_bytes AS size FROM shards').all<ShardRow>()
		// a shard's region is part of its binding's name, so it is config, never a row
		const results = rows.map((r) => ({ ...r, region: shardRegion(r.binding) ?? null }))
		const bound = env as unknown as Record<string, D1Database | undefined>
		const fresh: ShardRow[] = []
		for (const binding of Object.keys(env).filter((k) => shardRegion(k) !== undefined).sort()) {
			if (results.some((r) => r.binding === binding)) continue
			// An unmigrated database must never take writes, so wait until it has the schema.
			const ready = await bound[binding]!.prepare('SELECT events.pings FROM events, sessions, imported LIMIT 0').run().then(() => true, () => false)
			if (ready) fresh.push({ name: binding.toLowerCase(), binding, weight: 1, status: 'active', size: 0, region: shardRegion(binding) ?? null })
			else console.error(JSON.stringify({ msg: 'shard binding is not migrated', binding }))
		}
		if (fresh.length) {
			const now = Date.now()
			await env.CONTROL.batch(
				fresh.map((s) => env.CONTROL.prepare('INSERT OR IGNORE INTO shards (name, binding, weight, status, created_at) VALUES (?, ?, 1, ?, ?)').bind(s.name, s.binding, s.status, now)),
			)
			console.log(JSON.stringify({ msg: 'shards registered', shards: fresh.map((s) => s.name) }))
		}
		const missing = results.filter((r) => !bound[r.binding])
		if (missing.length) console.error(JSON.stringify({ msg: 'registered shards have no binding', shards: missing.map((r) => r.name) }))
		// A registered shard whose binding is gone can't take new placements.
		return [...results.map((r) => (bound[r.binding] ? r : { ...r, status: 'readonly' as const })), ...fresh]
	})
}

export async function shardDb(env: Env, name: string): Promise<D1Database> {
	const shard = (await getShards(env)).find((s) => s.name === name)
	const db = shard && (env as unknown as Record<string, unknown>)[shard.binding]
	if (!db) throw new Error(`shard ${name} has no binding`)
	return db as D1Database
}

/**
 * A read session on a shard. The dashboard, the APIs and MCP read through this so that,
 * with read replication enabled, their scans run on replicas instead of queueing behind
 * ingest on the single-threaded primary. Data may lag the primary by a few seconds.
 */
export async function shardReader(env: Env, name: string): Promise<D1DatabaseSession> {
	return (await shardDb(env, name)).withSession('first-unconstrained')
}

/**
 * Deletes matching rows a chunk at a time: one huge DELETE would run past D1's 30 s
 * query limit and stall every other write to the shard while it ran. `key` is the
 * row's identity (rowid, or the primary key of a WITHOUT ROWID table).
 */
export async function purge(db: D1Database, table: string, key: string, where: string, params: unknown[], max = Infinity, chunk = 5000): Promise<{ deleted: number; done: boolean }> {
	let deleted = 0
	while (deleted < max) {
		const res = await db
			.prepare(`DELETE FROM ${table} WHERE (${key}) IN (SELECT ${key} FROM ${table} WHERE ${where} LIMIT ${chunk})`)
			.bind(...params)
			.run()
		deleted += res.meta.changes
		if (res.meta.changes < chunk) return { deleted, done: true }
	}
	return { deleted, done: false }
}

/**
 * Every shard, with `placeable` set on the ones that may take a new range of this site:
 * those in its region, or any shard for a site without a region (core shardsIn).
 */
export async function siteShards(env: Env, siteId: string): Promise<(ShardRow & { placeable: boolean })[]> {
	const shards = await getShards(env)
	const region = (await getSite(env, siteId))?.region ?? null
	const ok = new Set(shardsIn(shards, region).map((s) => s.name))
	return shards.map((s) => ({ ...s, placeable: ok.has(s.name) }))
}

export function getRanges(env: Env, siteId: string): Promise<ShardRange[]> {
	return cached(`ranges:${siteId}`, async () => {
		const { results } = await env.CONTROL.prepare('SELECT shard, from_day, to_day FROM shard_map WHERE site_id = ? ORDER BY from_day').bind(siteId).all<ShardRange>()
		return results
	})
}

/**
 * The shard that takes writes for a site on a given day. Places new sites, and
 * moves sites off a shard that stopped taking new data, starting a later UTC day.
 */
export async function writeShard(env: Env, siteId: string, ts: number): Promise<string> {
	const day = utcDay(ts)
	const ranges = await getRanges(env, siteId)
	const shards = await siteShards(env, siteId)
	const current = writeRange(ranges, day)
	if (current) {
		const status = shards.find((s) => s.name === current.shard)?.status
		if (current.to_day != null || status === 'active') return current.shard
		await leaveShard(env, siteId, current.shard, current.from_day, day)
		return writeRange(await getRanges(env, siteId), day)?.shard ?? current.shard
	}
	// A site's first range starts at day 0 so backfilled history has somewhere to go.
	const first = ranges.length === 0
	const shard = pickShard(siteId, shards.filter((s) => s.placeable), shardLimit(env))
	await env.CONTROL.prepare('INSERT OR IGNORE INTO shard_map (site_id, from_day, to_day, shard) VALUES (?, ?, NULL, ?)')
		.bind(siteId, first ? 0 : day, shard)
		.run()
	invalidate(`ranges:${siteId}`)
	const fresh = writeRange(await getRanges(env, siteId), day)
	return fresh?.shard ?? shard
}

/**
 * Closes a site's open range on a shard that stopped taking new data and opens one on
 * an active shard, starting a later UTC day. Returns false when every shard is full.
 */
export async function leaveShard(env: Env, siteId: string, shard: string, fromDay: number, day = utcDay(Date.now())): Promise<boolean> {
	let next: string
	try {
		next = pickShard(siteId, (await siteShards(env, siteId)).filter((s) => s.placeable), shardLimit(env))
	} catch {
		// Every shard is full: keep writing here and shout, rather than drop events.
		console.error(JSON.stringify({ msg: 'no active shard to move to', site: siteId, shard }))
		return false
	}
	// Close at today (or tomorrow near midnight, see closingDay), never at the event's
	// day: a late event from yesterday must not strand today's rows on the old shard.
	const last = closingDay(day, Date.now(), TTL * 2)
	// The insert only runs when this call closed the range, so two isolates racing
	// through a drain can't open two ranges.
	await env.CONTROL.batch([
		env.CONTROL.prepare('UPDATE shard_map SET to_day = ? WHERE site_id = ? AND from_day = ? AND to_day IS NULL').bind(last, siteId, fromDay),
		env.CONTROL.prepare('INSERT INTO shard_map (site_id, from_day, to_day, shard) SELECT ?, ?, NULL, ? WHERE changes() > 0').bind(siteId, last + 1, next),
	])
	invalidate(`ranges:${siteId}`)
	return true
}

const saltCache = new Map<number, string>()

export async function dailySalt(env: Env, ts: number): Promise<string> {
	const day = utcDay(ts)
	const hit = saltCache.get(day)
	if (hit) return hit
	const bytes = crypto.getRandomValues(new Uint8Array(32))
	const fresh = btoa(String.fromCharCode(...bytes))
	await env.CONTROL.prepare('INSERT OR IGNORE INTO salts (day, salt) VALUES (?, ?)').bind(day, fresh).run()
	const row = await env.CONTROL.prepare('SELECT salt FROM salts WHERE day = ?').bind(day).first<{ salt: string }>()
	const salt = row?.salt ?? fresh
	saltCache.set(day, salt)
	for (const d of saltCache.keys()) if (d < day - 1) saltCache.delete(d)
	return salt
}

/** Runs core statements on a D1 database as one batch (one round trip). */
export function d1Runner(db: D1Database | D1DatabaseSession): Runner {
	return async (stmts) => {
		if (!stmts.length) return []
		const res = await db.batch(stmts.map((s) => db.prepare(s.sql).bind(...s.params)))
		return res.map((r) => (r.results ?? []) as Record<string, unknown>[])
	}
}

export class HttpError extends Error {
	constructor(
		public status: number,
		message: string,
		/** a stable id for errors a client acts on, such as PLAN_SITE_LIMIT; sent as `code` beside `error` */
		public code?: string,
	) {
		super(message)
	}
}
