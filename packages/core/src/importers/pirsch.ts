import { sourceName, type Channel } from '../channel'
import { GA_CHANNELS, normalizeImportedPath, type ImportedSet } from '../imported'
import { BUILTIN_EVENTS } from '../ingest'
import { localDay, type Zone } from '../time'
import { importerInfo } from './info'
import { ImportError, type ApiCall, type Importer } from './types'
import { count, prevDay, required } from './util'

/**
 * Pirsch's statistics API (v1), a day at a time in the site's time zone (`tz`), one
 * request per report. An oAuth client trades its ID and secret for an access token.
 * https://docs.pirsch.io/api-sdks/api-v1
 */

const BASE = 'https://api.pirsch.io/api/v1'

interface State {
	headers: Record<string, string>
	/** the dashboard's id */
	id: string
	/** visitors per day, read for many days in one request, so empty days cost none */
	visitors: Map<string, number>
}

type Row = Record<string, unknown>

/** Pirsch's channels beyond Google's, as misomoon's tracker files the same visits */
const CHANNELS: Record<string, Channel> = { AI: 'AI Assistants', 'Paid Other': 'Paid Search', Audio: 'Referral', SMS: 'Referral', 'Mobile Push Notifications': 'Referral' }

/** Pirsch's default names for the events misomoon's tracker sends itself */
const EVENTS: Record<string, string> = { 'Outbound Link Click': BUILTIN_EVENTS.outbound, 'File Download': BUILTIN_EVENTS.download }

const OS: Record<string, string> = { Mac: 'macOS', 'Chrome OS': 'ChromeOS' }
const os = (name: string) => OS[name] ?? name

/** How many days one request reads visitors for. */
const SPAN = 90
/** rows a request returns, as the API documents */
const PAGE = 100

/** The site's zone as Pirsch's `tz` takes it: an IANA name. Etc/GMT's sign is reversed. */
export function tz(zone: Zone): string {
	if (typeof zone === 'string') return zone
	return zone && zone % 60 === 0 && Math.abs(zone) <= 14 * 60 ? `Etc/GMT${zone > 0 ? '-' : '+'}${Math.abs(zone / 60)}` : 'UTC'
}

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

function host(url: string): string {
	try {
		return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
	} catch {
		return ''
	}
}

async function rows(s: State, call: ApiCall, report: string, day: string, zone: Zone, extra = ''): Promise<Row[]> {
	const out: Row[] = []
	for (let offset = 0; ; offset += PAGE) {
		const got = await call(`${BASE}/statistics/${report}?id=${s.id}&from=${day}&to=${day}&tz=${encodeURIComponent(tz(zone))}&limit=${PAGE}&offset=${offset}${extra}`, { headers: s.headers })
		if (!Array.isArray(got)) throw new ImportError(`Pirsch answered the ${report} report with something other than a list`)
		out.push(...(got as Row[]))
		if (got.length < PAGE) return out
	}
}

export const pirsch: Importer<State> = {
	...importerInfo('pirsch')!,
	// Pirsch sets no limit on reading statistics; this keeps a run polite
	rate: { calls: 10, ms: 1_000 },

	async open(input, call, zone) {
		const secret = required(input, 'secret', 'Client secret')
		if (secret.startsWith('pa_')) throw new ImportError("That's an access key, which can only send data to Pirsch. Add an oAuth client under Settings > Developer and use its ID and secret.")
		const auth = (await call(`${BASE}/token`, { method: 'POST', json: { client_id: required(input, 'client', 'Client ID'), client_secret: secret } })) as { access_token?: string }
		if (!auth?.access_token) throw new ImportError('Pirsch signed in without an access token')
		const headers = { Authorization: `Bearer ${auth.access_token}` }
		const domains = (await call(`${BASE}/domain`, { headers })) as Row[]
		if (!Array.isArray(domains) || !domains.length) throw new ImportError('This Pirsch client can read no dashboard')
		const want = text(input.domain).toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')
		const domain = want ? domains.find((d) => text(d.hostname).toLowerCase().replace(/^www\./, '') === want) : domains.length === 1 ? domains[0] : undefined
		if (!domain) {
			const names = domains.map((d) => text(d.hostname)).join(', ')
			throw new ImportError(want ? `This Pirsch client can't read ${want}, only ${names}` : `This Pirsch client reads ${domains.length} dashboards (${names}). Set Domain to the one to import.`)
		}
		// an import into Pirsch sets statistics_start before the dashboard was added
		const starts = [domain.def_time, domain.statistics_start].map((t) => Date.parse(text(t))).filter(Number.isFinite)
		return {
			state: { headers, id: text(domain.id), visitors: new Map() },
			label: `Pirsch: ${text(domain.display_name) || text(domain.hostname)}`,
			first: starts.length ? localDay(Math.min(...starts), zone) : undefined,
		}
	},

	async day(s, day, zone, call, set) {
		if (!s.visitors.has(day)) {
			let from = day
			for (let i = 1; i < SPAN; i++) from = prevDay(from)
			const range = await call(`${BASE}/statistics/visitor?id=${s.id}&from=${from}&to=${day}&tz=${encodeURIComponent(tz(zone))}`, { headers: s.headers })
			for (let d = day; d >= from; d = prevDay(d)) s.visitors.set(d, 0)
			for (const r of Array.isArray(range) ? (range as Row[]) : []) s.visitors.set(text(r.day).slice(0, 10), count(r.visitors) + count(r.views))
		}
		if (!s.visitors.get(day)) return

		const read = (report: string, extra?: string) => rows(s, call, report, day, zone, extra)
		const total = (await call(`${BASE}/statistics/total?id=${s.id}&from=${day}&to=${day}&tz=${encodeURIComponent(tz(zone))}`, { headers: s.headers })) as Row
		const [duration] = await read('duration/session')
		// the day's average visit time, over all its visits
		set.add(day, '', '', { visitors: count(total.visitors), visits: count(total.sessions), pageviews: count(total.views), bounces: count(total.bounces), duration: Math.round(count(duration?.average_time_spent_seconds) * count(total.sessions)) })

		for (const r of await read('page', '&include_avg_time_on_page=true')) {
			const time = count(r.average_time_spent_seconds)
			set.add(day, 'page', normalizeImportedPath(text(r.path)), { visitors: count(r.visitors), visits: count(r.sessions), pageviews: count(r.views), bounces: count(r.bounces), ...(time ? { time_s: Math.round(time * count(r.views)), time_n: count(r.views) } : {}) })
		}
		for (const r of await read('page/entry')) set.add(day, 'entry_page', normalizeImportedPath(text(r.path)), { visitors: count(r.visitors), visits: count(r.entries) })
		for (const r of await read('page/exit')) set.add(day, 'exit_page', normalizeImportedPath(text(r.path)), { visitors: count(r.visitors), visits: count(r.exits) })

		for (const r of await read('referrer')) {
			const url = text(r.referrer)
			const h = url ? host(url) : ''
			// a visit without a referrer URL may still carry a name from ?ref=
			const source = h ? sourceName(h) : text(r.referrer_name) || 'Direct'
			const m = { visitors: count(r.visitors), visits: count(r.sessions), bounces: count(r.bounces) }
			set.add(day, 'source', source, m)
			if (h) set.add(day, 'referrer', h, m)
		}
		for (const r of await read('channel')) {
			const name = text(r.channel)
			set.add(day, 'channel', GA_CHANNELS[name] ?? CHANNELS[name] ?? 'Referral', { visitors: count(r.visitors), visits: count(r.sessions), pageviews: count(r.views), bounces: count(r.bounces) })
		}

		for (const r of await read('country')) {
			const code = text(r.country_code).toUpperCase()
			if (/^[A-Z]{2}$/.test(code)) set.add(day, 'country', code, { visitors: count(r.visitors) })
		}
		for (const r of await read('browser')) set.add(day, 'browser', text(r.browser) || 'Unknown', { visitors: count(r.visitors) })
		for (const r of await read('os')) set.add(day, 'os', os(text(r.os) || 'Unknown'), { visitors: count(r.visitors) })
		const platform = (await call(`${BASE}/statistics/platform?id=${s.id}&from=${day}&to=${day}&tz=${encodeURIComponent(tz(zone))}`, { headers: s.headers })) as Row
		set.add(day, 'device', 'Desktop', { visitors: count(platform?.platform_desktop) })
		set.add(day, 'device', 'Mobile', { visitors: count(platform?.platform_mobile) })

		for (const r of await read('events')) set.add(day, 'event', EVENTS[text(r.name)] ?? text(r.name), { visitors: count(r.visitors), events: count(r.count) })
		for (const tag of ['source', 'medium', 'campaign', 'content', 'term']) {
			for (const r of await read(`utm/${tag}`)) {
				const v = text(r[`utm_${tag}`])
				if (v) set.add(day, `utm_${tag}`, v, { visitors: count(r.visitors) })
			}
		}
	},
}
