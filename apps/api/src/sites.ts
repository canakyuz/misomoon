import { getRanges, getShards, invalidate, purge, shardDb, type Site } from './control'
import { moveTargets } from './moves'
import { removeProxy } from './proxy'

/** Deletes a site's events, visits, and imports in these shards. */
async function purgeShards(env: Env, siteId: string, shards: Iterable<string>) {
	for (const name of shards) {
		const db = await shardDb(env, name)
		await purge(db, 'events', 'rowid', 'site_id = ?', [siteId])
		await purge(db, 'sessions', 'site_id, session_id', 'site_id = ?', [siteId])
		await purge(db, 'imported', 'site_id, dim, ts, key, import_id', 'site_id = ?', [siteId])
	}
}

/** Deletes a site and all of its data, in every shard that holds it. */
export async function deleteSite(env: Env, site: Site) {
	const shards = new Set([...(await getRanges(env, site.id)).map((r) => r.shard), ...(await moveTargets(env, site.id))])
	await purgeShards(env, site.id, shards)
	await removeProxy(env, site)
	await env.CONTROL.batch([
		env.CONTROL.prepare('DELETE FROM shard_moves WHERE site_id = ?').bind(site.id),
		env.CONTROL.prepare('DELETE FROM shard_map WHERE site_id = ?').bind(site.id),
		env.CONTROL.prepare('DELETE FROM sites WHERE id = ?').bind(site.id),
	])
	invalidate(`site:${site.id}`)
	invalidate(`ranges:${site.id}`)
	// A queue consumer that found the site before the delete may have written since the
	// purge. It checks again once its write is done; this catches a write that landed
	// before that. Every shard, since the consumer may have placed the site on a new one.
	await purgeShards(env, site.id, [...new Set([...shards, ...(await getShards(env)).map((s) => s.name)])])
}
