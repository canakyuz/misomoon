import { channelForSource, sourceName } from '../channel'
import { csvRows, normalizeImportedPath, type ImportedSet } from '../imported'
import { localDay, type Zone } from '../time'
import { parseUA } from '../ua'
import { prevDay } from './util'

/**
 * GoatCounter's two exports, read as uploaded files. The CSV export has a row per page
 * view, with its session; the JSON export has counts per hour or day and path.
 * https://github.com/arp242/goatcounter/blob/main/tpl/help/export.md and export-json.md
 */

type Counts = Parameters<ImportedSet['add']>[3]

/** The CSV export's header starts with its format version glued to `Path`: `2Path`. */
export function isGoatCounterCsv(text: string): boolean {
	return /^﻿?\d+,?Path,Title,Event,/.test(text)
}

/** `Chrome 86`, `Safari 14.0` or `Windows 10` as misomoon's name and major version */
function nameVersion(text: string): [string, string | null] {
	const m = /^(.*?)\s+(\d[\w.]*)$/.exec(text.trim())
	return m ? [m[1], m[2]] : [text.trim(), null]
}

const OS: Record<string, string> = { 'Chrome OS': 'ChromeOS', 'Mac OS X': 'macOS', OS_X: 'macOS' }
function osOf(name: string): string {
	return /^Linux\b/.test(name) ? 'Linux' : (OS[name] ?? name)
}

/** misomoon's os_version: a major and minor, and 10/11 for Windows 10 */
function osVersion(os: string, version: string | null): string | null {
	if (!version) return null
	if (os === 'Windows' && version === '10') return 'Windows 10/11'
	return `${os} ${version.split('.').slice(0, 2).join('.')}`
}

/** A screen width, for exports without a user agent, at misomoon's breakpoints */
function deviceOf(ua: string, size: string): string | null {
	if (ua) return parseUA(ua).device
	const width = Number(size.split(',')[0])
	if (!width) return null
	return width < 576 ? 'Mobile' : width < 992 ? 'Tablet' : 'Desktop'
}

/** A referrer as misomoon's source and referrer host, by GoatCounter's scheme. */
function referrer(ref: string, scheme: string): { source: string; host: string; campaign: string } {
	ref = ref.trim()
	if (!ref) return { source: 'Direct', host: '', campaign: '' }
	if (scheme === 'h') {
		const host = ref.replace(/^[a-z]+:\/\//i, '').split(/[/?#]/)[0].toLowerCase().replace(/^www\./, '').replace(/:\d+$/, '')
		return { source: host ? sourceName(host) : 'Direct', host, campaign: '' }
	}
	// a campaign parameter without a referrer is a direct visit, as misomoon's tracker counts it
	if (scheme === 'c') return { source: 'Direct', host: '', campaign: ref }
	return { source: ref, host: '', campaign: '' }
}

/** What a visit needs of its page views: the first in full, the last's time and path. */
interface Session {
	at: number
	path: string
	ref: string
	scheme: string
	browser: string
	system: string
	ua: string
	size: string
	location: string
	lastAt: number
	lastPath: string
	views: number
	/** page views per path */
	paths: Map<string, number>
}

/** Bytes of CSV text read in one upload, so its rows fit in a Worker's memory */
export const GOATCOUNTER_CSV_MAX = 50_000_000

/**
 * Adds the CSV export. Rows of bots are left out. A session's visit counts on the local
 * day of each of its page views. GoatCounter writes rows in the order it got them, so a
 * day is added once the rows are two days past it, and only those days are held. Returns
 * the rows read.
 */
export function addGoatCounterCsv(set: ImportedSet, text: string, zone: Zone): number {
	if (text.length > GOATCOUNTER_CSV_MAX) throw new Error(`this GoatCounter CSV export is larger than ${GOATCOUNTER_CSV_MAX / 1_000_000} MB unzipped; upload the JSON export instead`)
	const rows = csvRows(text.replace(/^\uFEFF/, ''))
	const head = rows.next().value as string[] | undefined
	if (!head) return 0
	const version = /^(\d+),?Path$/.exec(head[0])?.[1]
	if (version !== '2') throw new Error(`this GoatCounter CSV export is version ${version ?? 'unknown'}; misomoon reads version 2, the one GoatCounter exports since 2020`)
	const col = (name: string) => head.indexOf(name)
	const at = { path: 0, event: col('Event'), ua: col('UserAgent'), browser: col('Browser'), system: col('System'), session: col('Session'), bot: col('Bot'), ref: col('Referrer'), scheme: col('Referrer scheme'), size: col('Screen size'), location: col('Location'), date: col('Date') }
	if (Object.values(at).some((i) => i < 0)) throw new Error('this GoatCounter CSV export is missing columns misomoon reads')

	/** day → session → its visit */
	const days = new Map<string, Map<string, Session>>()
	/** day → event → [sessions, count] */
	const events = new Map<string, Map<string, [Set<string>, number]>>()
	const flush = (before: string) => {
		for (const [day, sessions] of days) if (day < before) {
			addDay(set, day, sessions)
			days.delete(day)
		}
		for (const [day, byName] of events) if (day < before) {
			for (const [name, [seen, n]] of byName) set.add(day, 'event', name, { visitors: seen.size, events: n })
			events.delete(day)
		}
	}
	let read = 0
	for (const c of rows) {
		const ts = Date.parse(c[at.date] ?? '')
		if (!Number.isFinite(ts) || (c[at.bot] && c[at.bot] !== '0')) continue
		read++
		const day = localDay(ts, zone)
		flush(prevDay(prevDay(day)))
		const session = c[at.session] || `row${read}`
		const path = c[at.path] ?? ''
		if (c[at.event] === '1' || c[at.event] === 'true') {
			const byName = events.get(day) ?? new Map<string, [Set<string>, number]>()
			events.set(day, byName)
			const e = byName.get(path) ?? [new Set<string>(), 0]
			byName.set(path, e)
			e[0].add(session)
			e[1]++
			continue
		}
		const sessions = days.get(day) ?? new Map<string, Session>()
		days.set(day, sessions)
		const page = normalizeImportedPath(path)
		const s = sessions.get(session)
		if (!s) {
			sessions.set(session, { at: ts, path: page, ref: c[at.ref] ?? '', scheme: c[at.scheme] ?? '', browser: c[at.browser] ?? '', system: c[at.system] ?? '', ua: c[at.ua] ?? '', size: c[at.size] ?? '', location: c[at.location] ?? '', lastAt: ts, lastPath: page, views: 1, paths: new Map([[page, 1]]) })
			continue
		}
		s.views++
		s.paths.set(page, (s.paths.get(page) ?? 0) + 1)
		// rows may come a little out of order
		if (ts < s.at) Object.assign(s, { at: ts, path: page })
		if (ts >= s.lastAt) Object.assign(s, { lastAt: ts, lastPath: page })
	}
	flush('9999-12-31')
	return read
}

function addDay(set: ImportedSet, day: string, sessions: Map<string, Session>) {
	const pages = new Map<string, { sessions: number; views: number }>()
	for (const s of sessions.values()) {
		const visit: Counts = { visitors: 1, visits: 1, pageviews: s.views, bounces: s.views === 1 ? 1 : 0, duration: Math.round((s.lastAt - s.at) / 1000) }
		set.add(day, '', '', visit)
		set.add(day, 'entry_page', s.path, visit)
		set.add(day, 'exit_page', s.lastPath, { visitors: 1, visits: 1 })
		const ref = referrer(s.ref, s.scheme)
		set.add(day, 'source', ref.source, visit)
		set.add(day, 'channel', channelForSource(ref.source, null, null), visit)
		if (ref.host) set.add(day, 'referrer', ref.host, visit)
		if (ref.campaign) set.add(day, 'utm_campaign', ref.campaign, visit)
		const country = s.location.slice(0, 2).toUpperCase()
		if (/^[A-Z]{2}$/.test(country)) set.add(day, 'country', country, visit)
		const ua = s.ua ? parseUA(s.ua) : null
		const [browser, bv] = s.browser ? nameVersion(s.browser) : [ua?.browser ?? '', ua?.browser_version ?? null]
		if (browser) {
			set.add(day, 'browser', browser, visit)
			if (bv) set.add(day, 'browser_version', `${browser} ${bv.split('.')[0]}`, visit)
		}
		const [system, sv] = s.system ? nameVersion(s.system) : [ua?.os ?? '', ua?.os_version ?? null]
		if (system) {
			const os = osOf(system)
			set.add(day, 'os', os, visit)
			const v = osVersion(os, sv)
			if (v) set.add(day, 'os_version', v, visit)
		}
		const device = deviceOf(s.ua, s.size)
		if (device) set.add(day, 'device', device, visit)
		for (const [path, n] of s.paths) {
			const p = pages.get(path) ?? { sessions: 0, views: 0 }
			pages.set(path, p)
			p.sessions++
			p.views += n
		}
	}
	for (const [path, p] of pages) set.add(day, 'page', path, { visitors: p.sessions, visits: p.sessions, pageviews: p.views })
}

// ---------------------------------------------------------------- JSON export

/** The JSON export: a zip with info.json and the .jsonl files. */
export function isGoatCounterJson(files: { name: string; text: string }[]): boolean {
	const info = files.find((f) => base(f.name) === 'info.json')
	return !!info && /"export_version"/.test(info.text) && files.some((f) => base(f.name) === 'hit_stats.jsonl')
}

const base = (name: string) => name.split('/').pop() ?? name

function jsonl(files: { name: string; text: string }[], name: string): Record<string, unknown>[] {
	const f = files.find((x) => base(x.name) === name)
	if (!f) return []
	const out: Record<string, unknown>[] = []
	for (const line of f.text.split('\n')) {
		const t = line.trim()
		if (!t) continue
		try {
			out.push(JSON.parse(t))
		} catch {
			throw new Error(`${name} has a line that isn't JSON`)
		}
	}
	return out
}

/**
 * Adds the JSON export. Its counts are visitors per path: a person who opens three pages
 * counts three times in a day's sum, as in GoatCounter's own totals. Hourly counts go to
 * the local day of their hour; daily ones keep GoatCounter's day. Returns the rows read.
 */
export function addGoatCounterJson(set: ImportedSet, files: { name: string; text: string }[], zone: Zone): number {
	const info = JSON.parse(files.find((f) => base(f.name) === 'info.json')!.text) as { export_version?: string }
	if (!/^1\./.test(info.export_version ?? '')) throw new Error(`this GoatCounter JSON export is version ${info.export_version}; misomoon reads version 1`)
	const byId = (name: string) => new Map(jsonl(files, name).map((r) => [Number(r.id), r]))
	const paths = byId('paths.jsonl')
	const refs = byId('refs.jsonl')
	const browsers = byId('browsers.jsonl')
	const systems = byId('systems.jsonl')
	const path = (id: unknown) => paths.get(Number(id))
	const isEvent = (id: unknown) => path(id)?.event === true
	let read = 0

	for (const r of jsonl(files, 'hit_stats.jsonl')) {
		const ts = Date.parse(String(r.hour ?? ''))
		const n = Number(r.count) || 0
		const p = path(r.path_id)
		if (!Number.isFinite(ts) || !n || !p) continue
		read++
		const day = localDay(ts, zone)
		if (isEvent(r.path_id)) {
			set.add(day, 'event', String(p.path), { visitors: n, events: n })
			continue
		}
		const m = { visitors: n, visits: n, pageviews: n }
		set.add(day, '', '', m)
		set.add(day, 'page', normalizeImportedPath(String(p.path)), m)
		const ref = refs.get(Number(r.ref_id))
		const s = referrer(String(ref?.ref ?? ''), String(ref?.ref_scheme ?? ''))
		set.add(day, 'source', s.source, m)
		set.add(day, 'channel', channelForSource(s.source, null, null), m)
		if (s.host) set.add(day, 'referrer', s.host, m)
		if (s.campaign) set.add(day, 'utm_campaign', s.campaign, m)
	}
	const daily = (name: string, add: (day: string, r: Record<string, unknown>, m: { visitors: number; visits: number }) => void) => {
		for (const r of jsonl(files, name)) {
			const n = Number(r.count) || 0
			const day = String(r.day ?? '')
			if (!n || !/^\d{4}-\d{2}-\d{2}$/.test(day) || isEvent(r.path_id)) continue
			read++
			add(day, r, { visitors: n, visits: n })
		}
	}
	daily('location_stats.jsonl', (day, r, m) => {
		const c = String(r.location ?? '').slice(0, 2).toUpperCase()
		if (/^[A-Z]{2}$/.test(c)) set.add(day, 'country', c, m)
	})
	daily('browser_stats.jsonl', (day, r, m) => {
		const b = browsers.get(Number(r.browser_id))
		const name = String(b?.name ?? '')
		if (!name) return
		set.add(day, 'browser', name, m)
		const v = String(b?.version ?? '')
		if (/^\d/.test(v)) set.add(day, 'browser_version', `${name} ${v.split('.')[0]}`, m)
	})
	daily('system_stats.jsonl', (day, r, m) => {
		const s = systems.get(Number(r.system_id))
		const name = String(s?.name ?? '')
		if (!name) return
		const os = osOf(name)
		set.add(day, 'os', os, m)
		const v = osVersion(os, /^\d/.test(String(s?.version ?? '')) ? String(s?.version) : null)
		if (v) set.add(day, 'os_version', v, m)
	})
	daily('size_stats.jsonl', (day, r, m) => {
		const d = deviceOf('', String(r.width ?? ''))
		if (d) set.add(day, 'device', d, m)
	})
	return read
}
