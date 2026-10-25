import type { Channel } from './channel'
import { channelForSource } from './channel'
import { BUILTIN_EVENTS } from './ingest'
import { fromLocal, type Zone } from './time'
import type { Stmt } from './queries'

/**
 * Imported history: daily aggregates from Google or a CSV export,
 * stored per dimension and added to reports that
 * have no filters. Visitors are daily uniques, so summing days matches native data.
 */
export interface ImportedRow {
	/** local date, YYYY-MM-DD */
	day: string
	/** '' for the site totals, otherwise a misomoon dimension */
	dim: string
	key: string
	visitors: number
	visits: number
	pageviews: number
	bounces: number
	/** summed visit duration, seconds */
	duration: number
	events: number
	time_s: number
	time_n: number
	scroll: number
	scroll_n: number
}

export const IMPORTED_DIMS = [
	'channel', 'source', 'referrer', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
	'page', 'entry_page', 'exit_page', 'country', 'region', 'city', 'browser', 'browser_version', 'os', 'os_version', 'device', 'event',
] as const

const METRICS = ['visitors', 'visits', 'pageviews', 'bounces', 'duration', 'events', 'time_s', 'time_n', 'scroll', 'scroll_n'] as const
type Metric = (typeof METRICS)[number]

const n = (v: unknown) => {
	const x = Number(v)
	return Number.isFinite(x) && x > 0 ? Math.round(x) : 0
}

function blank(day: string, dim: string, key: string): ImportedRow {
	return { day, dim, key, visitors: 0, visits: 0, pageviews: 0, bounces: 0, duration: 0, events: 0, time_s: 0, time_n: 0, scroll: 0, scroll_n: 0 }
}

/** Sums rows that share a day, dimension and value. */
export class ImportedSet {
	private rows = new Map<string, ImportedRow>()

	add(day: string, dim: string, key: string | null | undefined, m: Partial<Record<Metric, unknown>>) {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return
		const k = (key ?? '').toString().trim().slice(0, 500) || (dim ? '(none)' : '')
		const id = `${day}\u0000${dim}\u0000${k}`
		let r = this.rows.get(id)
		if (!r) this.rows.set(id, (r = blank(day, dim, k)))
		for (const f of METRICS) if (f in m) r[f] += n(m[f])
	}

	list(): ImportedRow[] {
		return [...this.rows.values()]
	}

	get days(): { from: string; to: string } | null {
		let from = ''
		let to = ''
		for (const r of this.rows.values()) {
			if (!from || r.day < from) from = r.day
			if (!to || r.day > to) to = r.day
		}
		return from ? { from, to } : null
	}
}

// ---------------------------------------------------------------- CSV export

export function parseCsv(text: string): string[][] {
	const out: string[][] = []
	let row: string[] = []
	let cell = ''
	let quoted = false
	for (let i = 0; i < text.length; i++) {
		const c = text[i]
		if (quoted) {
			if (c === '"' && text[i + 1] === '"') {
				cell += '"'
				i++
			} else if (c === '"') quoted = false
			else cell += c
		} else if (c === '"') quoted = true
		else if (c === ',') {
			row.push(cell)
			cell = ''
		} else if (c === '\n' || c === '\r') {
			if (c === '\r' && text[i + 1] === '\n') i++
			row.push(cell)
			if (row.length > 1 || row[0] !== '') out.push(row)
			row = []
			cell = ''
		} else cell += c
	}
	if (cell !== '' || row.length) {
		row.push(cell)
		out.push(row)
	}
	return out
}

/** `imported_sources_20240101_20241231.csv` → `sources`. */
export function csvExportTable(filename: string): string | null {
	const m = /(?:^|\/)imported_([a-z_]+?)(?:_\d{8}_\d{8})?\.csv$/.exec(filename)
	return m ? m[1] : null
}

const SESSION_METRICS = (r: Record<string, string>) => ({ visitors: r.visitors, visits: r.visits, pageviews: r.pageviews, bounces: r.bounces, duration: r.visit_duration })

/** Adds one file of a CSV export. */
export function addCsvExport(set: ImportedSet, filename: string, text: string): number {
	const table = csvExportTable(filename)
	if (!table) return 0
	const [head, ...lines] = parseCsv(text)
	if (!head) return 0
	let count = 0
	for (const cells of lines) {
		const r = Object.fromEntries(head.map((h, i) => [h.trim(), cells[i] ?? '']))
		const day = r.date
		count++
		switch (table) {
			case 'visitors':
				set.add(day, '', '', SESSION_METRICS(r))
				break
			case 'sources': {
				const m = SESSION_METRICS(r)
				const source = r.source || 'Direct'
				set.add(day, 'source', source, m)
				set.add(day, 'channel', channelForSource(source, r.utm_medium || null, r.utm_source || null), m)
				if (r.referrer) set.add(day, 'referrer', referrerKey(r.referrer), m)
				for (const u of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) if (r[u]) set.add(day, u, r[u], m)
				break
			}
			case 'pages':
				set.add(day, 'page', r.page, {
					visitors: r.visitors,
					visits: r.visits,
					pageviews: r.pageviews,
					time_s: r.total_time_on_page,
					time_n: r.total_time_on_page_visits,
					scroll: r.total_scroll_depth,
					scroll_n: r.total_scroll_depth_visits,
				})
				break
			case 'entry_pages':
				set.add(day, 'entry_page', r.entry_page, { ...SESSION_METRICS(r), visits: r.entrances })
				break
			case 'exit_pages':
				set.add(day, 'exit_page', r.exit_page, { ...SESSION_METRICS(r), visits: r.exits })
				break
			case 'locations': {
				const m = SESSION_METRICS(r)
				if (r.country) set.add(day, 'country', r.country.toUpperCase(), m)
				if (r.region) set.add(day, 'region', r.region, m)
				break
			}
			case 'browsers':
				set.add(day, 'browser', r.browser, SESSION_METRICS(r))
				if (r.browser_version) set.add(day, 'browser_version', `${r.browser} ${r.browser_version}`, SESSION_METRICS(r))
				break
			case 'operating_systems':
				set.add(day, 'os', r.operating_system, SESSION_METRICS(r))
				if (r.operating_system_version) set.add(day, 'os_version', `${r.operating_system} ${r.operating_system_version}`, SESSION_METRICS(r))
				break
			case 'devices':
				set.add(day, 'device', r.device, SESSION_METRICS(r))
				break
			case 'custom_events':
				set.add(day, 'event', EXPORT_EVENTS[r.name] ?? r.name, { visitors: r.visitors, events: r.events })
				break
			default:
				count--
		}
	}
	return count
}

function referrerKey(r: string): string {
	try {
		return new URL(r.includes('://') ? r : `https://${r}`).hostname.replace(/^www\./, '')
	} catch {
		return r
	}
}

// ---------------------------------------------------------------- Google

const GA_CHANNELS: Record<string, Channel> = {
	'Organic Search': 'Organic Search',
	'Paid Search': 'Paid Search',
	'Organic Social': 'Organic Social',
	'Paid Social': 'Paid Social',
	Email: 'Email',
	'Organic Video': 'Video',
	'Paid Video': 'Video',
	Display: 'Display',
	Affiliates: 'Affiliates',
	Referral: 'Referral',
	Direct: 'Direct',
	'Organic Shopping': 'Referral',
	'Paid Shopping': 'Paid Search',
}

/** CSV exports name automatic events differently; imports use misomoon's names. */
const EXPORT_EVENTS: Record<string, string> = { 'Outbound Link: Click': BUILTIN_EVENTS.outbound, 'File Download': BUILTIN_EVENTS.download, 'Form: Submission': BUILTIN_EVENTS.form }

const GA_DEVICES: Record<string, string> = { desktop: 'Desktop', mobile: 'Mobile', tablet: 'Tablet' }

type GoogleValues = Record<string, string>
type GoogleMetrics = Record<string, number>
type Counters = Parameters<ImportedSet['add']>[3]

/**
 * One Google runReport per group of misomoon dimensions. Unique users don't add up across
 * dimensions, so each group is its own report; `rows` turns a Google row into the
 * misomoon rows it fills (dim '' is the site total).
 */
interface GooglePull {
	name: string
	dims: string[]
	metrics: string[]
	rows: (d: GoogleValues, m: GoogleMetrics) => [dim: string, key: string, counters: Counters][]
}

const VISIT_METRICS = ['totalUsers', 'sessions', 'screenPageViews', 'engagedSessions', 'userEngagementDuration']
/** Google reports have no bounce; a session that wasn't engaged is the closest thing. */
const visit = (m: GoogleMetrics): Counters => ({ visitors: m.totalUsers, visits: m.sessions, pageviews: m.screenPageViews, bounces: m.sessions - m.engagedSessions, duration: m.userEngagementDuration })
const named = (v: string | undefined, fallback = '(none)') => unset(v) || fallback

export const GOOGLE_PULLS: GooglePull[] = [
	{ name: 'totals', dims: [], metrics: VISIT_METRICS, rows: (_, m) => [['', '', visit(m)]] },
	{
		name: 'acquisition',
		dims: ['sessionSource', 'sessionMedium', 'sessionCampaignName', 'sessionManualAdContent', 'sessionGoogleAdsKeyword', 'sessionDefaultChannelGroup'],
		metrics: VISIT_METRICS,
		rows: (d, m) => {
			const source = unset(d.sessionSource)
			const medium = unset(d.sessionMedium)
			const c = visit(m)
			const out: [string, string, Counters][] = [
				['source', source ? source.replace(/^www\./, '') : 'Direct', c],
				['channel', GA_CHANNELS[d.sessionDefaultChannelGroup] ?? channelForSource(source || 'Direct', medium || null, source || null), c],
			]
			if (source.includes('.')) out.push(['referrer', source.replace(/^www\./, ''), c])
			if (source) out.push(['utm_source', source, c])
			if (medium) out.push(['utm_medium', medium, c])
			for (const [dim, key] of [['utm_campaign', d.sessionCampaignName], ['utm_content', d.sessionManualAdContent], ['utm_term', d.sessionGoogleAdsKeyword]] as const) {
				if (unset(key)) out.push([dim, key, c])
			}
			return out
		},
	},
	{
		name: 'page',
		dims: ['pagePath'],
		metrics: ['totalUsers', 'sessions', 'screenPageViews', 'userEngagementDuration'],
		rows: (d, m) => [['page', normalizeImportedPath(d.pagePath), { visitors: m.totalUsers, visits: m.sessions, pageviews: m.screenPageViews, time_s: m.userEngagementDuration, time_n: m.sessions }]],
	},
	{ name: 'entry_page', dims: ['landingPage'], metrics: VISIT_METRICS, rows: (d, m) => [['entry_page', normalizeImportedPath(d.landingPage), visit(m)]] },
	{
		name: 'event',
		dims: ['eventName'],
		metrics: ['totalUsers', 'eventCount'],
		rows: (d, m) => (GA_OWN_EVENTS.has(d.eventName) ? [] : [['event', d.eventName, { visitors: m.totalUsers, events: m.eventCount }]]),
	},
	{
		name: 'place',
		dims: ['countryId', 'region', 'city'],
		metrics: VISIT_METRICS,
		rows: (d, m) => {
			const out: [string, string, Counters][] = []
			if (unset(d.countryId)) out.push(['country', d.countryId.toUpperCase(), visit(m)])
			if (unset(d.region)) out.push(['region', d.region, visit(m)])
			if (unset(d.city)) out.push(['city', d.city, visit(m)])
			return out
		},
	},
	{ name: 'device', dims: ['deviceCategory'], metrics: VISIT_METRICS, rows: (d, m) => [['device', GA_DEVICES[d.deviceCategory] ?? d.deviceCategory, visit(m)]] },
	{ name: 'browser', dims: ['browser'], metrics: VISIT_METRICS, rows: (d, m) => [['browser', named(d.browser), visit(m)]] },
	{
		name: 'os',
		dims: ['operatingSystem', 'operatingSystemVersion'],
		metrics: VISIT_METRICS,
		rows: (d, m) => {
			const os = named(d.operatingSystem)
			return unset(d.operatingSystemVersion) ? [['os', os, visit(m)], ['os_version', `${os} ${d.operatingSystemVersion}`, visit(m)]] : [['os', os, visit(m)]]
		},
	},
]

/** Google's automatic events, which misomoon measures itself (pageviews, visits, scroll). */
const GA_OWN_EVENTS = new Set(['page_view', 'session_start', 'first_visit', 'user_engagement', 'scroll'])

const unset = (v: string | undefined) => (!v || v === '(not set)' || v === '(none)' || v === '(direct)' ? '' : v)

/** Adds one runReport response for a pull. Google rows put `date` first, then the pull's dimensions. */
export function addGoogleRows(set: ImportedSet, pull: GooglePull, rows: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[]): void {
	for (const row of rows) {
		const date = row.dimensionValues[0]?.value ?? ''
		const d = Object.fromEntries(pull.dims.map((k, i) => [k, row.dimensionValues[i + 1]?.value ?? '']))
		const m = Object.fromEntries(pull.metrics.map((k, i) => [k, Number(row.metricValues[i]?.value ?? 0)]))
		const day = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
		for (const [dim, key, counters] of pull.rows(d, m)) set.add(day, dim, key, counters)
	}
}

function normalizeImportedPath(p: string): string {
	const path = (p || '/').split('?')[0]
	return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path
}

// ---------------------------------------------------------------- storage

const COLS = ['site_id', 'import_id', 'ts', 'dim', 'key', ...METRICS] as const

const midnights = new Map<string, number>()

/** Midnight of a YYYY-MM-DD date in `zone`, with that day's own offset, as a UTC instant. */
export function localMidnight(day: string, zone: Zone): number {
	// an import asks for the same few thousand days once per row
	const k = `${zone} ${day}`
	let ts = midnights.get(k)
	if (ts === undefined) {
		if (midnights.size >= 20_000) midnights.clear()
		midnights.set(k, (ts = fromLocal(Date.parse(day + 'T00:00:00Z'), zone)))
	}
	return ts
}

/** Insert statements, a few rows each to stay under D1's 100 bound parameters. */
export function importedInsertStmts(siteId: string, importId: string, rows: ImportedRow[], zone: Zone): Stmt[] {
	const per = Math.floor(100 / COLS.length)
	const stmts: Stmt[] = []
	for (let i = 0; i < rows.length; i += per) {
		const chunk = rows.slice(i, i + per)
		stmts.push({
			sql: `INSERT INTO imported (${COLS.join(', ')}) VALUES ${chunk.map(() => `(${COLS.map(() => '?').join(', ')})`).join(', ')}
				ON CONFLICT (site_id, dim, ts, key, import_id) DO UPDATE SET ${METRICS.map((m) => `${m} = ${m} + excluded.${m}`).join(', ')}`,
			params: chunk.flatMap((r) => [siteId, importId, localMidnight(r.day, zone), r.dim, r.key, ...METRICS.map((m) => r[m])]),
		})
	}
	return stmts
}
