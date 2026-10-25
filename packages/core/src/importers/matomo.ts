import { channelForSource, sourceName } from '../channel'
import { normalizeImportedPath, type ImportedSet } from '../imported'
import { localDay } from '../time'
import { importerInfo } from './info'
import { ImportError, type ApiCall, type Importer } from './types'
import { count, prevDay, publicBase, required } from './util'

/**
 * Matomo's Reporting API, a day at a time: API.getBulkRequest asks for the day's reports,
 * at most 10 to a request as Matomo allows, with `period=day`, the only period whose unique visitors Matomo always
 * processes. Days are Matomo's own, in the time zone set for the site there.
 * https://developer.matomo.org/api-reference/reporting-api
 */

interface State {
	endpoint: string
	token: string
	site: string
	/** the site's own host, which a website referrer row may name */
	domain: string
	/** visits per day, read for many days in one request, so empty days cost none */
	visits: Map<string, number>
}

type Row = Record<string, unknown>

/** Matomo's answer to a failed call, with HTTP 200 */
const failed = (r: unknown): r is { result: 'error'; message: string } => !!r && typeof r === 'object' && (r as Row).result === 'error'

const VISIT = 'nb_uniq_visitors,nb_visits,nb_actions,bounce_count,sum_visit_length'
const PAGE = 'nb_uniq_visitors,nb_visits,nb_hits,sum_time_spent,entry_nb_uniq_visitors,entry_nb_visits,entry_nb_actions,entry_sum_visit_length,entry_bounce_count,exit_nb_uniq_visitors,exit_nb_visits'

/** The reports read for each day. showColumns always names two or more, or Matomo answers `{ value }`. */
const REPORTS = {
	totals: ['VisitsSummary.get', VISIT],
	actions: ['Actions.get', 'nb_pageviews,nb_uniq_pageviews'],
	pages: ['Actions.getPageUrls', PAGE, 'flat=1'],
	types: ['Referrers.getReferrerType', VISIT],
	search: ['Referrers.getSearchEngines', VISIT],
	websites: ['Referrers.getWebsites', VISIT],
	socials: ['Referrers.getSocials', VISIT],
	ai: ['Referrers.getAIAssistants', VISIT],
	campaigns: ['Referrers.getCampaigns', VISIT],
	countries: ['UserCountry.getCountry', VISIT],
	browsers: ['DevicesDetection.getBrowsers', VISIT],
	os: ['DevicesDetection.getOsFamilies', VISIT],
	osVersions: ['DevicesDetection.getOsVersions', VISIT],
	devices: ['DevicesDetection.getType', VISIT],
	events: ['Events.getCategory', 'nb_uniq_visitors,nb_events', 'secondaryDimension=eventAction&flat=1'],
} as const
type Report = keyof typeof REPORTS

/** Referrers.getReferrerType's `referrer_type` */
const TYPE = { direct: 1, search: 2, website: 3, campaign: 6, social: 7, ai: 8 } as const

/** Matomo's browser names (DeviceDetector), as misomoon's tracker names them. */
const BROWSERS: Record<string, string> = {
	'Mobile Safari': 'Safari',
	'Microsoft Edge': 'Edge',
	'Samsung Browser': 'Samsung Internet',
	'Yandex Browser': 'Yandex',
	Chromium: 'Chrome',
}
function browser(name: string): string {
	return BROWSERS[name] ?? /^(Chrome|Firefox|Opera)\b/.exec(name)?.[1] ?? name
}

const OS: Record<string, string> = { Mac: 'macOS', 'GNU/Linux': 'Linux', Ubuntu: 'Linux', Fedora: 'Linux', 'Chrome OS': 'ChromeOS' }
const os = (name: string) => OS[name] ?? name

/** "Windows 10" or "Mac 10.15" as misomoon's version, such as `Windows 10/11` and `macOS 10.15`. */
function osVersion(label: string): string | null {
	const m = /^(Windows|Mac|iOS|Android) (\d+(?:\.\d+)?)/.exec(label)
	if (!m) return null
	return `${os(m[1])} ${m[1] === 'Windows' && m[2] === '10' ? '10/11' : m[2]}`
}

const DEVICES: Record<string, string> = { Desktop: 'Desktop', Smartphone: 'Mobile', Phablet: 'Mobile', 'Feature phone': 'Mobile', Tablet: 'Tablet' }

function host(url: unknown): string {
	if (typeof url !== 'string' || !url) return ''
	try {
		return new URL(url.includes('://') ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, '')
	} catch {
		return ''
	}
}

const rowsOf = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : [])
const label = (r: Row) => String(r.label ?? '').trim()

async function api(s: Pick<State, 'endpoint' | 'token'>, call: ApiCall, params: Record<string, string>): Promise<unknown> {
	const res = await call(s.endpoint, { method: 'POST', form: { module: 'API', format: 'JSON', ...params, token_auth: s.token } })
	if (failed(res)) throw new ImportError(`Matomo answered: ${res.message}`)
	return res
}

/** How many days one request reads visits for. */
const SPAN = 90
/** Matomo's default `API_bulk_request_max_urls` */
const BULK = 10

export const matomo: Importer<State> = {
	...importerInfo('matomo')!,
	// Matomo Cloud documents no limit; a server that archives on request works hard per day
	rate: { calls: 2, ms: 1_000 },

	async open(input, call, zone) {
		const endpoint = `${publicBase(required(input, 'url', 'Matomo address'), 'Matomo address').replace(/\/index\.php$/, '')}/index.php`
		const site = required(input, 'site', 'Site ID')
		if (!/^\d+$/.test(site)) throw new ImportError('Site ID is a number, such as 1')
		const token = required(input, 'token', 'Auth token')
		const info = (await api({ endpoint, token }, call, { method: 'SitesManager.getSiteFromId', idSite: site })) as Row
		if (!info || typeof info !== 'object' || !('idsite' in info)) throw new ImportError('Matomo answered without the site. Check the Matomo address and the site ID.')
		// ts_created is in UTC
		const created = Date.parse(`${String(info.ts_created ?? '').replace(' ', 'T')}Z`)
		return {
			state: { endpoint, token, site, domain: host(info.main_url), visits: new Map() },
			label: `Matomo: ${String(info.name || info.main_url || site)}`,
			first: Number.isFinite(created) ? localDay(created, zone) : undefined,
		}
	},

	async day(s, day, _zone, call, set) {
		if (!s.visits.has(day)) {
			let from = day
			for (let i = 1; i < SPAN; i++) from = prevDay(from)
			const range = (await api(s, call, { method: 'VisitsSummary.get', idSite: s.site, period: 'day', date: `${from},${day}`, showColumns: 'nb_visits,nb_actions' })) as Record<string, Row>
			for (let d = day; d >= from; d = prevDay(d)) s.visits.set(d, count(range?.[d]?.nb_visits))
		}
		if (!s.visits.get(day)) return

		const names = Object.keys(REPORTS) as Report[]
		const got = {} as Record<Report, unknown>
		for (let at = 0; at < names.length; at += BULK) {
			const part = names.slice(at, at + BULK)
			const urls: Record<string, string> = {}
			part.forEach((name, i) => {
				const [method, columns, extra] = REPORTS[name] as readonly [string, string, string?]
				urls[`urls[${i}]`] = `method=${method}&idSite=${s.site}&period=day&date=${day}&filter_limit=-1&showColumns=${columns}${extra ? `&${extra}` : ''}`
			})
			const answers = await api(s, call, { method: 'API.getBulkRequest', ...urls })
			if (!Array.isArray(answers) || answers.length !== part.length) throw new ImportError('Matomo answered the bulk request with something other than a list of reports')
			part.forEach((name, i) => (got[name] = answers[i]))
		}
		// the totals must be there; a report of a plugin that is off is left out
		if (failed(got.totals)) throw new ImportError(`Matomo answered: ${got.totals.message}`)
		for (const n of names) if (failed(got[n])) got[n] = []
		addDay(set, day, got, s.domain)
	},
}

function addDay(set: ImportedSet, day: string, got: Record<Report, unknown>, domain: string) {
	const totals = (got.totals ?? {}) as Row
	const pageviews = count((got.actions as Row)?.nb_pageviews)
	// nb_actions also counts downloads, outlinks and searches; each row's page views are
	// its actions at the day's share of page views among them
	const share = count(totals.nb_actions) ? Math.min(1, pageviews / count(totals.nb_actions)) : 0
	set.add(day, '', '', { visitors: count(totals.nb_uniq_visitors), visits: count(totals.nb_visits), pageviews, bounces: count(totals.bounce_count), duration: count(totals.sum_visit_length) })

	/**
	 * A row's visit counts. Rows Matomo sums from others, such as search engines, have no
	 * unique visitors, so they get their visits at `ratio`, visitors per visit.
	 */
	const visit = (r: Row, ratio = 1) => ({
		visitors: 'nb_uniq_visitors' in r ? count(r.nb_uniq_visitors) : Math.round(count(r.nb_visits) * ratio),
		visits: count(r.nb_visits),
		pageviews: Math.round(count(r.nb_actions) * share),
		bounces: count(r.bounce_count),
		duration: count(r.sum_visit_length),
	})

	for (const r of rowsOf(got.pages)) {
		const path = normalizeImportedPath(r.url ? new URL(String(r.url), 'https://x').pathname : label(r))
		set.add(day, 'page', path, { visitors: count(r.nb_uniq_visitors), visits: count(r.nb_visits), pageviews: count(r.nb_hits), time_s: count(r.sum_time_spent), time_n: count(r.nb_hits) })
		if (count(r.entry_nb_visits))
			set.add(day, 'entry_page', path, { visitors: count(r.entry_nb_uniq_visitors), visits: count(r.entry_nb_visits), pageviews: Math.round(count(r.entry_nb_actions) * share), bounces: count(r.entry_bounce_count), duration: count(r.entry_sum_visit_length) })
		if (count(r.exit_nb_visits)) set.add(day, 'exit_page', path, { visitors: count(r.exit_nb_uniq_visitors), visits: count(r.exit_nb_visits) })
	}

	// visitors per visit of each referrer type, for the rows without unique visitors
	const ratio: Record<number, number> = {}
	for (const r of rowsOf(got.types)) {
		const t = Number(r.referrer_type)
		ratio[t] = count(r.nb_visits) ? count(r.nb_uniq_visitors) / count(r.nb_visits) : 1
		if (t === TYPE.direct && count(r.nb_visits)) {
			set.add(day, 'source', 'Direct', visit(r))
			set.add(day, 'channel', 'Direct', visit(r))
		}
	}
	const source = (r: Row, type: number, name: string, ref: string, channel: string) => {
		const m = visit(r, ratio[type] ?? 1)
		set.add(day, 'source', name, m)
		set.add(day, 'channel', channel, m)
		if (ref) set.add(day, 'referrer', ref, m)
	}
	for (const r of rowsOf(got.search)) {
		const h = host(r.url)
		source(r, TYPE.search, h ? sourceName(h) : label(r), h, 'Organic Search')
	}
	for (const r of rowsOf(got.socials)) {
		const h = host(r.url)
		source(r, TYPE.social, h ? sourceName(h) : label(r), h, 'Organic Social')
	}
	for (const r of rowsOf(got.ai)) {
		const h = host(r.url)
		source(r, TYPE.ai, h ? sourceName(h) : label(r), h, 'AI Assistants')
	}
	for (const r of rowsOf(got.websites)) {
		const h = host(label(r))
		// Matomo counts the site's own pages as direct, but a row may still name it
		if (!h || h === domain) continue
		const name = sourceName(h)
		source(r, TYPE.website, name, h, channelForSource(name, null, null))
	}
	// a campaign row names the campaign only, without its source
	for (const r of rowsOf(got.campaigns)) if (count(r.nb_visits)) set.add(day, 'utm_campaign', label(r), visit(r, ratio[TYPE.campaign] ?? 1))

	for (const r of rowsOf(got.countries)) {
		const code = String(r.code ?? '').toUpperCase()
		if (/^[A-Z]{2}$/.test(code) && code !== 'XX') set.add(day, 'country', code, visit(r))
	}
	for (const r of rowsOf(got.browsers)) set.add(day, 'browser', browser(label(r)), visit(r))
	for (const r of rowsOf(got.os)) set.add(day, 'os', os(label(r)), visit(r))
	for (const r of rowsOf(got.osVersions)) {
		const v = osVersion(label(r))
		if (v) set.add(day, 'os_version', v, visit(r))
	}
	for (const r of rowsOf(got.devices)) {
		const d = DEVICES[label(r)]
		if (d) set.add(day, 'device', d, visit(r))
	}
	// named the way the switching guide says to name new events: `Category: Action`
	for (const r of rowsOf(got.events)) {
		const name = r.Events_EventCategory && r.Events_EventAction ? `${r.Events_EventCategory}: ${r.Events_EventAction}` : label(r)
		set.add(day, 'event', name, { visitors: count(r.nb_uniq_visitors), events: count(r.nb_events) })
	}
}
