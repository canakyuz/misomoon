import { IMPORTERS, importedInsertStmts, ImportedSet, ImportError, localMidnight, prevDay, RetryLater, type ApiCall, type CallInit, type Importer } from '@misomoon/core'
import { getSite, HttpError, shardDb, writeShard, type Site } from './control'
import { begin, dayBefore, dropRows, fail, firstCountedDay, takenDays } from './imports'
import { moving } from './moves'

/**
 * API imports (packages/core/src/importers): a job reads one day at a time from the newest
 * back and stores each day as it goes, so it can stop between any two days. It starts in
 * the request that creates it, and the five-minute cron moves it on, until every day is
 * read or it fails. A day is written by deleting this import's rows for it first, so a
 * run cut off after writing a day and before saving its place counts that day once.
 */

interface Job {
	import_id: string
	site_id: string
	importer: string
	input: string
	from_day: string
	to_day: string
	next_day: string
	days_done: number
	days_total: number
	retries: number
}

/** a run's time; the request that starts a job has 30 seconds of waitUntil */
const START_RUN_MS = 20_000
/** the cron's share of its 15 minutes, which ends well before the next run */
const CRON_RUN_MS = 4 * 60_000
/** a job a run holds, as long as the longest run */
const LEASE_MS = 6 * 60_000
/** a run's last request starts this long before its hold ends, so it ends inside it (requests time out after 30 seconds) */
const LEASE_MARGIN_MS = 60_000
/** requests a run makes, under the Workers Paid limit of 10,000 a run with room for the cron's other work */
const RUN_CALLS = 2_000
/** an error the tool may get over, such as a 503, is tried again this many runs in a row */
const MAX_RETRIES = 6
/** days written to the shards together */
const DAYS_PER_WRITE = 7
const FIELD_MAX = 500

const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1

/** What the person typed, as strings, without fields the importer doesn't have. */
function fields(imp: Importer, input: unknown): Record<string, string> {
	const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
	const out: Record<string, string> = {}
	for (const f of imp.fields) {
		const v = raw[f.name]
		if (v == null || v === '') continue
		if (typeof v !== 'string' || v.length > FIELD_MAX) throw new HttpError(400, `${f.label} must be text of at most ${FIELD_MAX} characters`)
		out[f.name] = v
	}
	return out
}

/**
 * The `call` an importer gets: JSON in and out, the tool's rate kept, and its errors sorted.
 * No request starts at or after `stop`, even part way through a day.
 */
export function caller(imp: Importer, now = () => Date.now(), stop = Infinity): ApiCall & { count: number } {
	const sent: number[] = []
	const call = async (url: string, init: CallInit = {}) => {
		if (call.count >= RUN_CALLS) throw new RetryLater(0, 'this run made all its requests')
		if (imp.rate) {
			while (sent.length >= imp.rate.calls) {
				const wait = sent[sent.length - imp.rate.calls] + imp.rate.ms - now()
				if (wait <= 0) break
				if (now() + wait >= stop) throw new RetryLater(0, 'this run is out of time')
				await new Promise((r) => setTimeout(r, wait))
			}
			sent.push(now())
			if (sent.length > imp.rate.calls) sent.shift()
		}
		if (now() >= stop) throw new RetryLater(0, 'this run is out of time')
		call.count++
		const headers: Record<string, string> = { Accept: 'application/json', 'User-Agent': 'misomoon-import/1 (+https://misomoon.com)', ...init.headers }
		let body: string | undefined
		if (init.json !== undefined) {
			body = JSON.stringify(init.json)
			headers['Content-Type'] = 'application/json'
		} else if (init.form) {
			body = new URLSearchParams(init.form).toString()
			headers['Content-Type'] = 'application/x-www-form-urlencoded'
		}
		let res: Response
		try {
			res = await fetch(url, { method: init.method ?? (body ? 'POST' : 'GET'), headers, body, signal: AbortSignal.timeout(30_000) })
		} catch {
			throw new RetryLater(5 * 60_000, `${imp.name} didn't answer`)
		}
		if (res.status === 429) {
			const after = Number(res.headers.get('retry-after'))
			throw new RetryLater(Number.isFinite(after) && after > 0 ? after * 1000 : 60_000, `${imp.name} asked to slow down`)
		}
		if (res.status >= 500) throw new RetryLater(5 * 60_000, `${imp.name} answered ${res.status}`)
		const text = await res.text()
		if (!res.ok) {
			const detail = text.length < 300 ? text.replace(/\s+/g, ' ').trim() : ''
			const hint = res.status === 401 || res.status === 403 ? ': check the key or the sign-in, and that it can read this site' : ''
			throw new ImportError(`${imp.name} answered ${res.status}${hint}${detail ? ` (${detail})` : ''}`)
		}
		try {
			return JSON.parse(text)
		} catch {
			throw new ImportError(`${imp.name} answered with something other than JSON. Check the server address.`)
		}
	}
	call.count = 0
	return call
}

/** A refusal while starting is the person's to fix, so it answers 400. */
function asHttp(e: unknown): never {
	if (e instanceof ImportError) throw new HttpError(400, e.message)
	if (e instanceof RetryLater) throw new HttpError(503, `${e.message}; try again in a few minutes`)
	throw e
}

/** Checks the fields and the sign-in while the person waits, then reads the first days. */
export async function startApiImport(env: Env, ctx: ExecutionContext, site: Site, body: { importer?: string; input?: unknown; from?: string; to?: string }) {
	const imp = body.importer && Object.hasOwn(IMPORTERS, body.importer) ? IMPORTERS[body.importer] : undefined
	if (!imp) throw new HttpError(400, `importer must be one of ${Object.keys(IMPORTERS).join(', ')}`)
	const input = fields(imp, body.input)
	const opened = await imp.open(input, caller(imp), site.timezone).catch(asHttp)
	const day = /^\d{4}-\d{2}-\d{2}$/
	// a day misomoon counted would count twice, so the import ends the day before its first
	const first = await firstCountedDay(env, site)
	const last = dayBefore(first ?? new Date().toISOString().slice(0, 10))
	const to = body.to && day.test(body.to) && body.to < last ? body.to : last
	const from = body.from && day.test(body.from) ? body.from : opened.first
	if (!from) throw new HttpError(400, `${imp.name} doesn't say when its data starts, so set From`)
	if (from > to) throw new HttpError(400, first ? `misomoon has counted this site since ${first}, so the import must start before it` : 'From must be on or before To')
	const id = await begin(env, site, imp.id, opened.label)
	await env.CONTROL.prepare('INSERT INTO import_jobs (import_id, site_id, importer, input, from_day, to_day, next_day, days_total, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
		.bind(id, site.id, imp.id, JSON.stringify(input), from, to, to, days(from, to), Date.now())
		.run()
	ctx.waitUntil(runJob(env, id, Date.now() + START_RUN_MS))
	return { id, status: 'importing' }
}

/** The cron's turn: jobs that are due, oldest first, until its time is up. */
export async function runImportJobs(env: Env, now = Date.now()) {
	const { results } = await env.CONTROL.prepare('SELECT import_id FROM import_jobs WHERE run_after <= ? AND lease_until < ? ORDER BY updated_at LIMIT 10').bind(now, now).all<{ import_id: string }>()
	const deadline = now + CRON_RUN_MS
	for (const { import_id } of results) {
		if (Date.now() >= deadline) break
		await runJob(env, import_id, deadline).catch((e) => console.error(JSON.stringify({ msg: 'import job failed', import: import_id, error: String(e) })))
	}
}

/** Reads days until `deadline`, a run's requests, or the job's first day. */
export async function runJob(env: Env, id: string, deadline: number) {
	const now = Date.now()
	const leased = await env.CONTROL.prepare('UPDATE import_jobs SET lease_until = ? WHERE import_id = ? AND lease_until < ?').bind(now + LEASE_MS, id, now).run()
	if (!leased.meta.changes) return
	const job = await env.CONTROL.prepare('SELECT * FROM import_jobs WHERE import_id = ?').bind(id).first<Job>()
	const site = job && (await getSite(env, job.site_id))
	const imp = job && IMPORTERS[job.importer]
	if (!job || !site || !imp) {
		await env.CONTROL.prepare('DELETE FROM import_jobs WHERE import_id = ?').bind(id).run()
		return
	}
	// rows written behind a running shard move would be lost when its old copy is purged
	if (await moving(env, site.id)) return release(env, id, Date.now() + 3_600_000, job.retries)
	// a day that runs past the hold would be read by the next run at the same time
	const call = caller(imp, undefined, now + LEASE_MS - LEASE_MARGIN_MS)
	let next = job.next_day
	let done = job.days_done
	let saved = job.days_done
	try {
		const { state } = await imp.open(JSON.parse(job.input), call, site.timezone)
		const taken = await takenDays(env, site.id, id)
		let skipped = 0
		while (next >= job.from_day && Date.now() < deadline) {
			const set = new ImportedSet()
			const read: string[] = []
			while (read.length < DAYS_PER_WRITE && next >= job.from_day && Date.now() < deadline) {
				if (taken.some((r) => next >= r.from_day && next <= r.to_day)) skipped++
				else {
					await imp.day(state, next, site.timezone, call, set)
					read.push(next)
				}
				next = prevDay(next)
				done++
			}
			await writeDays(env, site, id, read, set)
			const [written] = await env.CONTROL.batch([
				env.CONTROL.prepare('UPDATE import_jobs SET next_day = ?, days_done = ?, retries = 0, updated_at = ? WHERE import_id = ?').bind(next, done, Date.now(), id),
				env.CONTROL.prepare(
					`UPDATE imports SET rows = rows + ?, skipped_days = skipped_days + ?,
					from_day = CASE WHEN ? IS NULL THEN from_day WHEN from_day IS NULL OR ? < from_day THEN ? ELSE from_day END,
					to_day = CASE WHEN ? IS NULL THEN to_day WHEN to_day IS NULL OR ? > to_day THEN ? ELSE to_day END
					WHERE id = ?`,
				).bind(set.list().length, skipped, set.days?.from ?? null, set.days?.from ?? null, set.days?.from ?? null, set.days?.to ?? null, set.days?.to ?? null, set.days?.to ?? null, id),
			])
			// the import was deleted while this run read: the days it wrote since go too
			if (!written.meta.changes) return dropRows(env, site.id, id)
			saved = done
			skipped = 0
		}
		if (next >= job.from_day) return release(env, id, 0, 0)
		await env.CONTROL.batch([
			env.CONTROL.prepare("UPDATE imports SET status = 'done' WHERE id = ?").bind(id),
			env.CONTROL.prepare('DELETE FROM import_jobs WHERE import_id = ?').bind(id),
		])
	} catch (e) {
		// out of requests or time after writing a day: carry on in the next run, from the last day written
		if (e instanceof RetryLater && e.ms === 0 && saved > job.days_done) return release(env, id, 0, 0)
		// a run that wrote no day counts as a failed one, so a day that never fits a run ends the job
		if (e instanceof RetryLater && job.retries < MAX_RETRIES) return release(env, id, Date.now() + e.ms, job.retries + 1)
		await env.CONTROL.prepare('DELETE FROM import_jobs WHERE import_id = ?').bind(id).run()
		await dropRows(env, site.id, id)
		const message = e instanceof RetryLater && e.ms === 0 ? `${imp.name} needs more time or requests for one day than a run has` : e instanceof ImportError || e instanceof RetryLater ? e.message : `The import stopped on an error: ${String((e as Error)?.message ?? e)}`
		await fail(env, id, message)
	}
}

function release(env: Env, id: string, runAfter: number, retries: number) {
	return env.CONTROL.prepare('UPDATE import_jobs SET lease_until = 0, run_after = ?, retries = ?, updated_at = ? WHERE import_id = ?').bind(runAfter, retries, Date.now(), id).run()
}

/**
 * Replaces this import's rows for each of `days` with those in `set`. A day's old rows go in
 * the batch that writes its first new ones, and a day cut off part way is written again
 * whole by the next run, which deletes it first.
 */
async function writeDays(env: Env, site: Site, id: string, days: string[], set: ImportedSet) {
	const rows = new Map<string, ReturnType<ImportedSet['list']>>()
	for (const r of set.list()) {
		const list = rows.get(r.day) ?? []
		list.push(r)
		rows.set(r.day, list)
	}
	for (const day of days) {
		const ts = localMidnight(day, site.timezone)
		const db = await shardDb(env, await writeShard(env, site.id, ts))
		const stmts = [{ sql: 'DELETE FROM imported INDEXED BY imported_import WHERE site_id = ? AND import_id = ? AND ts = ?', params: [site.id, id, ts] }, ...importedInsertStmts(site.id, id, rows.get(day) ?? [], site.timezone)]
		for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100).map((s) => db.prepare(s.sql).bind(...s.params)))
	}
}
