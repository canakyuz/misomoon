import { channelForSource, sourceName } from '../channel'
import { normalizeImportedPath, type ImportedSet } from '../imported'
import { localDay, type Zone } from '../time'
import { importerInfo } from './info'
import { ImportError, type ApiCall, type Importer } from './types'
import { count, prevDay, required, tz } from './util'

/**
 * DataFast's Website API (v1) with a `df_` website key, a day at a time in the site's time
 * zone: the overview and each breakdown return totals for the range asked, so each asks
 * for one day. Built from DataFast's API reference and its example answers, and checked
 * against the values of a real public dashboard. https://datafa.st/docs/api
 */

const BASE = 'https://datafa.st/api/v1'

interface State {
	headers: Record<string, string>
	/** visitors per day, read for many days in one request, so empty days cost none */
	visitors: Map<string, number>
}

type Row = Record<string, unknown>

/** How many days one time series request reads visitors for. */
const SPAN = 90
/** rows a request returns, the most the API allows */
const PAGE = 1000
/** a time series of months from here finds the first one with visitors */
const SINCE = '2020-01-01'

// WebKit is an app's web view on iOS, which misomoon's tracker counts as Safari
const BROWSERS: Record<string, string> = { 'Mobile Safari': 'Safari', WebKit: 'Safari', 'Mobile Chrome': 'Chrome', 'Chrome WebView': 'Chrome', 'Mobile Firefox': 'Firefox', 'Samsung Browser': 'Samsung Internet', 'Opera Mobi': 'Opera', 'Opera Mini': 'Opera', unknown: 'Unknown' }
const OS: Record<string, string> = { 'Mac OS': 'macOS', 'Chrome OS': 'ChromeOS', 'Chromium OS': 'ChromeOS', Ubuntu: 'Linux', unknown: 'Unknown' }
const DEVICES: Record<string, string> = { desktop: 'Desktop', mobile: 'Mobile', tablet: 'Tablet' }

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** Names geo databases give that differ from English region names */
const COUNTRY_ALIASES: Record<string, string> = {
	usa: 'US', 'united states of america': 'US', uk: 'GB', 'great britain': 'GB', 'czech republic': 'CZ', turkey: 'TR',
	'ivory coast': 'CI', 'dr congo': 'CD', 'democratic republic of the congo': 'CD', congo: 'CG', 'republic of the congo': 'CG', 'congo republic': 'CG',
	'hong kong': 'HK', macau: 'MO', macao: 'MO', palestine: 'PS', myanmar: 'MM', burma: 'MM', 'republic of korea': 'KR', 'russian federation': 'RU',
	'viet nam': 'VN', swaziland: 'SZ', macedonia: 'MK', 'east timor': 'TL', 'the netherlands': 'NL', 'cape verde': 'CV', 'vatican city': 'VA',
}
const fold = (s: string) =>
	s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/&/g, ' and ').replace(/\bst\.?\s/g, 'saint ').replace(/[^a-z0-9]+/g, ' ').trim()

let countries: Map<string, string> | undefined
/**
 * A country's two-letter code from the flag DataFast sends, as an emoji or as the URL of its
 * picture (`.../3x2/GB.svg`), or else from its English name.
 */
export function countryCode(name: string, ...flags: unknown[]): string | undefined {
	for (const f of flags) {
		const emoji = [...text(f)].map((c) => (c.codePointAt(0) ?? 0) - 0x1f1a5)
		if (emoji.length === 2 && emoji.every((c) => c >= 65 && c <= 90)) return String.fromCharCode(...emoji)
		const picture = text(f).match(/\/([A-Z]{2})\.svg$/)
		if (picture) return picture[1]
	}
	if (/^[A-Z]{2}$/.test(name)) return name
	if (!countries) {
		countries = new Map(Object.entries(COUNTRY_ALIASES))
		try {
			const names = new Intl.DisplayNames(['en'], { type: 'region' })
			for (let a = 65; a <= 90; a++) {
				for (let b = 65; b <= 90; b++) {
					const code = String.fromCharCode(a, b)
					const n = names.of(code)
					// old codes, such as DD for Germany and UK, name their country too
					if (n && n !== code && Intl.getCanonicalLocales(`und-${code}`)[0] === `und-${code}`) {
						if (!countries.has(fold(n))) countries.set(fold(n), code)
						// "Hong Kong SAR China", "Myanmar (Burma)", "Congo - Kinshasa"
						const short = fold(n.replace(/\s*\(.*\)|\s+SAR China$/, ''))
						if (!countries.has(short)) countries.set(short, code)
					}
				}
			}
		} catch {
			// without Intl's names, only the flag and the aliases name a country
		}
	}
	return countries.get(fold(name))
}

/**
 * A time bucket's day. DataFast writes buckets as the start of the day in the time zone
 * asked, `2026-05-01T00:00:00Z` in its reference and `2026-09-28T00:00:00+02:00` on a real
 * dashboard; a bucket that starts at another hour is an instant, read in the zone.
 */
function bucketDay(ts: string, zone: Zone): string {
	if (/^\d{4}-\d{2}-\d{2}(T00:00:00(\.0+)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(ts)) return ts.slice(0, 10)
	const t = Date.parse(ts)
	return Number.isFinite(t) ? localDay(t, zone) : ''
}

/** DataFast's names for known sites where misomoon's differ */
const NAMES: Record<string, string> = { Brave: 'Brave Search' }

/** A referrer as DataFast names it: a domain, a known site's name such as Google, or Direct/None. */
export function referrerSource(name: string): { source: string; channel: string; host: string } {
	const host = /^[^\s/]+\.[a-z]{2,}$/i.test(name) ? name.toLowerCase().replace(/^www\./, '') : ''
	const source = !name || /^direct\b/i.test(name) ? 'Direct' : host ? sourceName(host) : (NAMES[name] ?? name)
	return { source, channel: channelForSource(source, null, null), host }
}

/**
 * A visit's average time in seconds. DataFast doesn't say the unit; its reference's example
 * reads as seconds, and its dashboard's own routes give milliseconds. No day of real visits
 * averages an hour, so a larger number is milliseconds.
 */
const seconds = (v: unknown) => (count(v) > 3600 ? count(v) / 1000 : count(v))

async function get(s: State, call: ApiCall, route: string, query: string): Promise<{ data: Row[]; total?: number }> {
	const got = (await call(`${BASE}/analytics/${route}?${query}`, { headers: s.headers })) as { status?: string; data?: unknown; error?: { message?: string }; pagination?: { total?: unknown } }
	if (got?.status === 'error') throw new ImportError(`DataFast answered: ${text(got.error?.message) || 'an error'}`)
	if (!Array.isArray(got?.data)) throw new ImportError(`DataFast answered ${route} with something other than a list`)
	return { data: got.data as Row[], total: got.pagination?.total == null ? undefined : count(got.pagination.total) }
}

/** Every row of one breakdown for one day. */
async function rows(s: State, call: ApiCall, route: string, day: string, zone: Zone, fields: string): Promise<Row[]> {
	const out: Row[] = []
	for (let offset = 0; ; offset += PAGE) {
		const { data, total } = await get(s, call, route, `fields=${fields}&startAt=${day}&endAt=${day}&timezone=${encodeURIComponent(tz(zone))}&limit=${PAGE}&offset=${offset}`)
		out.push(...data)
		if (data.length < PAGE || (total !== undefined && out.length >= total)) return out
	}
}

export const datafast: Importer<State> = {
	...importerInfo('datafast')!,
	// DataFast allows 60 requests per key; its 429 says when to go on
	rate: { calls: 60, ms: 60_000 },

	async open(input, call, zone) {
		const key = required(input, 'key', 'API key')
		if (key.startsWith('dft_')) throw new ImportError("That's an account token. Use the site's API key, which starts with df_, from Website settings > API in DataFast.")
		const s: State = { headers: { Authorization: `Bearer ${key}` }, visitors: new Map() }
		const [meta] = (await get(s, call, 'metadata', 'fields=domain,name')).data
		const months = await get(s, call, 'timeseries', `fields=visitors&interval=month&startAt=${SINCE}&endAt=${localDay(Date.now(), zone)}&timezone=${encodeURIComponent(tz(zone))}&limit=${PAGE}`)
		const days = months.data.filter((r) => count(r.visitors) > 0).map((r) => bucketDay(text(r.timestamp), zone)).filter(Boolean).sort()
		if (!days.length) throw new ImportError('DataFast has counted no visitors for this site')
		return {
			state: s,
			label: `DataFast: ${text(meta?.domain) || text(meta?.name) || 'website'}`,
			// the first month with visitors; its empty days before the first visit cost no requests
			first: days[0],
		}
	},

	async day(s, day, zone, call, set) {
		if (!s.visitors.has(day)) {
			let from = day
			for (let i = 1; i < SPAN; i++) from = prevDay(from)
			const range = await get(s, call, 'timeseries', `fields=visitors&interval=day&startAt=${from}&endAt=${day}&timezone=${encodeURIComponent(tz(zone))}&limit=${PAGE}`)
			for (let d = day; d >= from; d = prevDay(d)) s.visitors.set(d, 0)
			for (const r of range.data) s.visitors.set(bucketDay(text(r.timestamp), zone), count(r.visitors))
		}
		if (!s.visitors.get(day)) return

		const read = (route: string, fields: string) => rows(s, call, route, day, zone, fields)
		const [total] = (await get(s, call, 'overview', `fields=visitors,pageviews,sessions,bounce_rate,avg_session_duration&startAt=${day}&endAt=${day}&timezone=${encodeURIComponent(tz(zone))}`)).data
		const visits = count(total?.sessions)
		// the bounce rate is a percent of the day's visits, the duration their average in seconds
		set.add(day, '', '', { visitors: count(total?.visitors), visits, pageviews: count(total?.pageviews), bounces: Math.round((visits * count(total?.bounce_rate)) / 100), duration: Math.round(visits * seconds(total?.avg_session_duration)) })

		for (const r of await read('pages', 'path,visitors')) set.add(day, 'page', normalizeImportedPath(text(r.path)), { visitors: count(r.visitors) })

		for (const r of await read('referrers', 'referrer,visitors')) {
			const { source, channel, host } = referrerSource(text(r.referrer))
			const m = { visitors: count(r.visitors) }
			set.add(day, 'source', source, m)
			set.add(day, 'channel', channel, m)
			if (host) set.add(day, 'referrer', host, m)
		}
		// each tag on its own, as a campaign row holds all five
		for (const r of await read('campaigns', 'utm_source,utm_medium,utm_campaign,utm_term,utm_content,visitors')) {
			const c = (r.campaign ?? r) as Row
			for (const tag of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']) {
				const v = text(c[tag])
				if (v) set.add(day, tag, v, { visitors: count(r.visitors) })
			}
		}

		for (const r of await read('countries', 'country,image,visitors')) {
			const code = countryCode(text(r.country), r.flag, r.image)
			if (code) set.add(day, 'country', code, { visitors: count(r.visitors) })
		}
		for (const r of await read('regions', 'region,visitors')) if (text(r.region)) set.add(day, 'region', text(r.region), { visitors: count(r.visitors) })
		for (const r of await read('cities', 'city,visitors')) if (text(r.city)) set.add(day, 'city', text(r.city), { visitors: count(r.visitors) })
		for (const r of await read('devices', 'device,visitors')) {
			const d = DEVICES[text(r.device)]
			if (d) set.add(day, 'device', d, { visitors: count(r.visitors) })
		}
		for (const r of await read('browsers', 'browser,visitors')) set.add(day, 'browser', BROWSERS[text(r.browser)] ?? (text(r.browser) || 'Unknown'), { visitors: count(r.visitors) })
		for (const r of await read('operating-systems', 'operating_system,visitors')) set.add(day, 'os', OS[text(r.operating_system)] ?? (text(r.operating_system) || 'Unknown'), { visitors: count(r.visitors) })

		for (const r of await read('goals', 'name,completions,visitors')) {
			const name = text(r.goal) || text(r.name)
			if (name) set.add(day, 'event', name, { visitors: count(r.visitors), events: count(r.completions) })
		}
	},
}
