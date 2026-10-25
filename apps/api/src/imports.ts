import { addGoogleRows, addCsvExport, GOOGLE_PULLS, importedInsertStmts, ImportedSet, localMidnight, tzOffset, unzipTexts } from '@misomoon/core'
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
	source: 'csv' | 'google'
	label: string
	from_day: string | null
	to_day: string | null
	status: 'importing' | 'done' | 'failed'
	error: string | null
	rows: number
	created_at: number
}

export async function listImports(env: Env, siteId: string): Promise<ImportRow[]> {
	const { results } = await env.CONTROL.prepare('SELECT * FROM imports WHERE site_id = ? ORDER BY created_at DESC').bind(siteId).all<ImportRow>()
	return results
}

async function begin(env: Env, site: Site, source: 'csv' | 'google', label: string): Promise<string> {
	const id = crypto.randomUUID()
	await env.CONTROL.prepare('INSERT INTO imports (id, site_id, source, label, status, created_at) VALUES (?, ?, ?, ?, ?, ?)')
		.bind(id, site.id, source, label.slice(0, 120), 'importing', Date.now())
		.run()
	return id
}

/** Writes an import's rows to the shards that own their days, then marks it done. */
async function persist(env: Env, site: Site, id: string, set: ImportedSet) {
	// Rows written behind a running shard move would be lost when its old copy is purged.
	if (await moving(env, site.id)) throw new HttpError(409, 'this site\'s history is being moved between shards; try the import again in a few hours')
	const offset = tzOffset(site.timezone)
	const byShard = new Map<string, ReturnType<ImportedSet['list']>>()
	for (const row of set.list()) {
		const shard = await writeShard(env, site.id, localMidnight(row.day, offset))
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
			const stmts = importedInsertStmts(site.id, id, rows, offset)
			for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100).map((s) => db.prepare(s.sql).bind(...s.params)))
		}
	} catch (e) {
		for (const db of written) await db.prepare('DELETE FROM imported WHERE site_id = ? AND import_id = ?').bind(site.id, id).run().catch(() => {})
		throw e
	}
	const days = set.days
	await env.CONTROL.prepare("UPDATE imports SET status = 'done', rows = ?, from_day = ?, to_day = ? WHERE id = ?")
		.bind(set.list().length, days?.from ?? null, days?.to ?? null, id)
		.run()
}

async function fail(env: Env, id: string, e: unknown) {
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
	const id = await begin(env, site, 'csv', files.map((f) => f.name).join(', '))
	try {
		await persist(env, site, id, set)
	} catch (e) {
		await fail(env, id, e)
		throw e
	}
	return (await env.CONTROL.prepare('SELECT * FROM imports WHERE id = ?').bind(id).first<ImportRow>())!
}

export async function deleteImport(env: Env, site: Site, id: string) {
	const shards = new Set([...(await getRanges(env, site.id)).map((r) => r.shard), ...(await moveTargets(env, site.id))])
	for (const shard of shards) {
		await (await shardDb(env, shard)).prepare('DELETE FROM imported WHERE site_id = ? AND import_id = ?').bind(site.id, id).run()
	}
	await env.CONTROL.prepare('DELETE FROM imports WHERE id = ? AND site_id = ?').bind(id, site.id).run()
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
			`https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200${pageToken ? `&pageToken=${pageToken}` : ''}`,
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
		await persist(env, site, id, set)
		await env.CONTROL.prepare('DELETE FROM google_auth WHERE id = ?').bind(grantId).run()
	} catch (e) {
		await fail(env, id, e)
	}
}

export async function startGoogleImport(env: Env, ctx: ExecutionContext, site: Site, body: { grant?: string; property?: string; from?: string; to?: string; label?: string }) {
	googleConfigured(env)
	if (!body.grant || !body.property?.startsWith('properties/')) throw new HttpError(400, 'grant and property (properties/123) are required')
	const day = /^\d{4}-\d{2}-\d{2}$/
	const to = body.to && day.test(body.to) ? body.to : new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
	const from = body.from && day.test(body.from) ? body.from : '2015-08-14' // earliest date Google serves
	const id = await begin(env, site, 'google', body.label || `Google ${body.property}`)
	ctx.waitUntil(googleImport(env, site, body.grant, body.property, from, to, id))
	return { id, status: 'importing' }
}
