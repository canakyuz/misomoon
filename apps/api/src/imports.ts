import { addGoogleRows, addCsvExport, GOOGLE_PULLS, importedInsertStmts, ImportedSet, localDay, localMidnight, unzipTexts } from '@misomoon/core'
import { getRanges, HttpError, shardDb, writeShard, type Site } from './control'
import { google, googleConfigured, grantToken } from './google'
import { moveTargets, moving } from './moves'

/**
 * Imported history: a CSV export (zip or loose CSVs) or a
 * Google property becomes daily per-dimension rows in the shards' `imported`
 * table, which unfiltered reports add to native data.
 */

export interface ImportRow {
	id: string
	site_id: string
	/** csv, google, or an importer id (packages/core/src/importers) */
	source: string
	label: string
	from_day: string | null
	to_day: string | null
	status: 'importing' | 'done' | 'failed'
	error: string | null
	rows: number
	/** days left out because misomoon or an earlier import counted them already */
	skipped_days: number
	created_at: number
	/** while an API import runs: the days read so far, and all it will read */
	days_done: number | null
	days_total: number | null
}

export async function listImports(env: Env, siteId: string): Promise<ImportRow[]> {
	const { results } = await env.CONTROL.prepare(
		'SELECT i.*, j.days_done, j.days_total FROM imports i LEFT JOIN import_jobs j ON j.import_id = i.id WHERE i.site_id = ? ORDER BY i.created_at DESC',
	)
		.bind(siteId)
		.all<ImportRow>()
	return results
}

export async function begin(env: Env, site: Site, source: string, label: string): Promise<string> {
	const id = crypto.randomUUID()
	await env.CONTROL.prepare('INSERT INTO imports (id, site_id, source, label, status, created_at) VALUES (?, ?, ?, ?, ?, ?)')
		.bind(id, site.id, source, label.slice(0, 120), 'importing', Date.now())
		.run()
	return id
}

/** The first local day misomoon counted on the site, or null before its first event. */
export async function firstCountedDay(env: Env, site: Site): Promise<string | null> {
	let first: number | null = null
	for (const shard of new Set((await getRanges(env, site.id)).map((r) => r.shard))) {
		const t = await (await shardDb(env, shard)).prepare('SELECT MIN(ts) AS t FROM events WHERE site_id = ?').bind(site.id).first<number | null>('t')
		if (t != null && (first == null || t < first)) first = t
	}
	return first == null ? null : localDay(first, site.timezone)
}

export const dayBefore = (day: string) => new Date(Date.parse(day + 'T00:00:00Z') - 86_400_000).toISOString().slice(0, 10)

/** The day ranges of the site's other imports, finished or running, which a new import leaves alone. */
export async function takenDays(env: Env, siteId: string, id = ''): Promise<{ from_day: string; to_day: string }[]> {
	const { results } = await env.CONTROL.prepare("SELECT from_day, to_day FROM imports WHERE site_id = ? AND status != 'failed' AND id != ? AND from_day IS NOT NULL").bind(siteId, id).all<{ from_day: string; to_day: string }>()
	return results
}

/**
 * Keeps only the days nothing has counted yet: those before misomoon's first day on the
 * site, and outside every earlier import. Returns the days it dropped, or throws when no
 * day is left.
 */
async function keepNew(env: Env, site: Site, set: ImportedSet, id?: string): Promise<number> {
	if (!set.days) throw new HttpError(400, 'no row has a date as YYYY-MM-DD, so there is nothing to add')
	const first = await firstCountedDay(env, site)
	const taken = await takenDays(env, site.id, id)
	let covered = false
	const skipped = set.drop((day) => {
		if (first != null && day >= first) return true
		if (!taken.some((r) => day >= r.from_day && day <= r.to_day)) return false
		covered = true
		return true
	})
	if (set.days) return skipped
	throw new HttpError(400, covered
		? 'earlier imports already cover every day in this import, so there is nothing to add'
		: `misomoon has counted this site since ${first}, and every day in this import is on or after it, so there is nothing to add`)
}

/** Writes an import's rows to the shards that own their days, then marks it done. */
async function persist(env: Env, site: Site, id: string, set: ImportedSet, skipped: number) {
	// Rows written behind a running shard move would be lost when its old copy is purged.
	if (await moving(env, site.id)) throw new HttpError(409, 'this site\'s history is being moved between shards; try the import again in a few hours')
	const byShard = new Map<string, ReturnType<ImportedSet['list']>>()
	for (const row of set.list()) {
		const shard = await writeShard(env, site.id, localMidnight(row.day, site.timezone))
		const list = byShard.get(shard) ?? []
		list.push(row)
		byShard.set(shard, list)
	}
	// each batch commits on its own, so a failure takes back what earlier batches wrote
	const written: D1Database[] = []
	try {
		for (const [shard, rows] of byShard) {
			const db = await shardDb(env, shard)
			written.push(db)
			const stmts = importedInsertStmts(site.id, id, rows, site.timezone)
			for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100).map((s) => db.prepare(s.sql).bind(...s.params)))
		}
	} catch (e) {
		for (const db of written) await db.prepare('DELETE FROM imported WHERE site_id = ? AND import_id = ?').bind(site.id, id).run().catch(() => {})
		throw e
	}
	const days = set.days
	await env.CONTROL.prepare("UPDATE imports SET status = 'done', rows = ?, from_day = ?, to_day = ?, skipped_days = ? WHERE id = ?")
		.bind(set.list().length, days?.from ?? null, days?.to ?? null, skipped, id)
		.run()
}

export async function fail(env: Env, id: string, e: unknown) {
	await env.CONTROL.prepare("UPDATE imports SET status = 'failed', error = ? WHERE id = ?").bind(String((e as Error)?.message ?? e).slice(0, 500), id).run()
}

/** A CSV export: one zip, or the imported_*.csv files themselves. */
export async function importCsv(env: Env, site: Site, files: File[]): Promise<ImportRow> {
	if (!files.length) throw new HttpError(400, 'upload a CSV export zip or its imported_*.csv files')
	const texts: { name: string; text: string }[] = []
	for (const f of files) {
		if (f.name.endsWith('.zip') || f.type === 'application/zip') texts.push(...(await unzipTexts(new Uint8Array(await f.arrayBuffer()))))
		else texts.push({ name: f.name, text: await f.text() })
	}
	const set = new ImportedSet()
	let lines = 0
	for (const t of texts) lines += addCsvExport(set, t.name, t.text)
	if (!lines) throw new HttpError(400, 'no imported_*.csv files found (expected a CSV export)')
	const skipped = await keepNew(env, site, set)
	const id = await begin(env, site, 'csv', files.map((f) => f.name).join(', '))
	try {
		await persist(env, site, id, set, skipped)
	} catch (e) {
		await fail(env, id, e)
		throw e
	}
	return (await env.CONTROL.prepare('SELECT * FROM imports WHERE id = ?').bind(id).first<ImportRow>())!
}

/** Deletes an import's rows from every shard that may hold them. */
export async function dropRows(env: Env, siteId: string, id: string) {
	const shards = new Set([...(await getRanges(env, siteId)).map((r) => r.shard), ...(await moveTargets(env, siteId))])
	for (const shard of shards) {
		await (await shardDb(env, shard)).prepare('DELETE FROM imported WHERE site_id = ? AND import_id = ?').bind(siteId, id).run()
	}
}

export async function deleteImport(env: Env, site: Site, id: string) {
	// a running API import stops before its rows go, so it writes no more
	await env.CONTROL.prepare('DELETE FROM import_jobs WHERE import_id = ? AND site_id = ?').bind(id, site.id).run()
	await dropRows(env, site.id, id)
	await env.CONTROL.prepare('DELETE FROM imports WHERE id = ? AND site_id = ?').bind(id, site.id).run()
}

/**
 * Hourly: a Google import runs as background work, which the Worker can stop part way, so
 * one still importing after an hour failed. It keeps none of its rows. API imports run as
 * jobs (jobs.ts), which end themselves. Google grants nobody used within a day go too.
 */
export async function expireImports(env: Env, now = Date.now()) {
	const { results } = await env.CONTROL.prepare("SELECT id, site_id FROM imports WHERE status = 'importing' AND created_at < ? AND id NOT IN (SELECT import_id FROM import_jobs)")
		.bind(now - 3_600_000)
		.all<{ id: string; site_id: string }>()
	for (const r of results) {
		await dropRows(env, r.site_id, r.id)
		await fail(env, r.id, 'The import stopped before it finished. Delete it and start again.')
	}
	await env.CONTROL.prepare('DELETE FROM google_auth WHERE created_at < ?').bind(now - 86_400_000).run()
}

// ---------------------------------------------------------------- Google

/** Google properties the signed-in account can read. */
export async function googleProperties(env: Env, site: Site, grantId: string) {
	googleConfigured(env)
	const token = await grantToken(env, site, grantId, 'import')
	const out: { id: string; name: string; account: string }[] = []
	let pageToken = ''
	do {
		const r = await google<{ accountSummaries?: { displayName: string; propertySummaries?: { property: string; displayName: string }[] }[]; nextPageToken?: string }>(
			token,
			`https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`,
		)
		for (const a of r.accountSummaries ?? []) for (const p of a.propertySummaries ?? []) out.push({ id: p.property, name: p.displayName, account: a.displayName })
		pageToken = r.nextPageToken ?? ''
	} while (pageToken)
	return out
}

const PAGE = 100_000

/** Runs the Google reports for a property and stores them. Called in the background. */
export async function googleImport(env: Env, site: Site, grantId: string, property: string, from: string, to: string, id: string) {
	try {
		const token = await grantToken(env, site, grantId, 'import')
		const set = new ImportedSet()
		for (const pull of GOOGLE_PULLS) {
			for (let offset = 0; ; offset += PAGE) {
				const body: Record<string, unknown> = {
					dateRanges: [{ startDate: from, endDate: to }],
					dimensions: ['date', ...pull.dims].map((name) => ({ name })),
					metrics: pull.metrics.map((name) => ({ name })),
					limit: PAGE,
					offset,
					keepEmptyRows: false,
				}
				const r = await google<{ rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[]; rowCount?: number }>(
					token,
					`https://analyticsdata.googleapis.com/v1beta/${property}:runReport`,
					body,
				)
				addGoogleRows(set, pull, r.rows ?? [])
				if (!r.rows?.length || offset + PAGE >= (r.rowCount ?? 0)) break
			}
		}
		await persist(env, site, id, set, await keepNew(env, site, set, id))
	} catch (e) {
		await fail(env, id, e)
	} finally {
		// starting again goes through Connect Google, which makes a new grant
		await env.CONTROL.prepare('DELETE FROM google_auth WHERE id = ?').bind(grantId).run()
	}
}

export async function startGoogleImport(env: Env, ctx: ExecutionContext, site: Site, body: { grant?: string; property?: string; from?: string; to?: string; label?: string }) {
	googleConfigured(env)
	// the property goes into the runReport URL, so it is a property id and nothing else
	if (!body.grant || !body.property || !/^properties\/\d+$/.test(body.property)) throw new HttpError(400, 'grant and property (properties/123) are required')
	const day = /^\d{4}-\d{2}-\d{2}$/
	// a day misomoon counted would count twice, so the import ends the day before its first
	const first = await firstCountedDay(env, site)
	const last = first ? dayBefore(first) : dayBefore(new Date().toISOString().slice(0, 10))
	const to = body.to && day.test(body.to) && body.to < last ? body.to : last
	const from = body.from && day.test(body.from) ? body.from : '2015-08-14' // earliest date Google serves
	if (from > to) throw new HttpError(400, first ? `misomoon has counted this site since ${first}, so the import must start before it` : 'From must be on or before To')
	const id = await begin(env, site, 'google', body.label || `Google ${body.property}`)
	ctx.waitUntil(googleImport(env, site, body.grant, body.property, from, to, id))
	return { id, status: 'importing' }
}
