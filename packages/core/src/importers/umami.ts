import { channelForSource, sourceName } from '../channel'
import { normalizeImportedPath, type ImportedSet } from '../imported'
import { localDay, type Zone } from '../time'
import { importerInfo } from './info'
import { ImportError, type ApiCall, type Importer } from './types'
import { count, dayBounds, publicBase, required } from './util'

/**
 * Umami's Website Statistics API, a day at a time: `/stats` for the totals and
 * `/metrics/expanded` for each breakdown. Both return visitors, visits, bounces and
 * `totaltime` in seconds for each value, the way misomoon counts them.
 * https://docs.umami.is/docs/api, and the routes under src/app/api/websites in the
 * Umami repository.
 */

interface State {
	base: string
	headers: Record<string, string>
	website: string
	/** the site's own host, which Umami lists among referrers for moves between pages */
	domain: string
}

interface Row {
	name: string
	pageviews: number
	visitors: number
	visits: number
	bounces: number
	totaltime: number
}

/** Umami's browser keys (BROWSERS in src/lib/constants.ts), as misomoon names browsers. */
const BROWSERS: Record<string, string> = {
	browser: 'Unknown',
	android: 'Android Browser',
	ie: 'Internet Explorer',
	chrome: 'Chrome',
	crios: 'Chrome',
	'chromium-webview': 'Chrome',
	edge: 'Edge',
	'edge-chromium': 'Edge',
	'edge-ios': 'Edge',
	firefox: 'Firefox',
	fxios: 'Firefox',
	safari: 'Safari',
	ios: 'Safari',
	'ios-webview': 'Safari',
	opera: 'Opera',
	'opera-mini': 'Opera',
	samsung: 'Samsung Internet',
	yandexbrowser: 'Yandex',
	facebook: 'Facebook',
	instagram: 'Instagram',
}
/** Umami's bot and tool keys, which misomoon doesn't count */
const BOTS = new Set(['searchbot', 'curl', 'phantomjs'])

/** Umami's OS names, which carry Windows' version, as misomoon's name and version. */
function os(name: string): [string, string | null] {
	const win = /^Windows (.+)$/.exec(name)
	if (win) return ['Windows', win[1] === '10' ? '10/11' : win[1]]
	const known: Record<string, string> = { 'Mac OS': 'macOS', 'Android OS': 'Android', 'Chrome OS': 'ChromeOS' }
	return [known[name] ?? name, null]
}

const DEVICES: Record<string, string> = { desktop: 'Desktop', laptop: 'Desktop', mobile: 'Mobile', tablet: 'Tablet' }

/** The breakdowns asked for each day, and the misomoon dimension each fills. */
const TYPES = ['path', 'entry', 'exit', 'referrer', 'country', 'browser', 'os', 'device', 'event', 'utmSource', 'utmMedium', 'utmCampaign', 'utmContent', 'utmTerm'] as const
const UTM: Record<string, string> = { utmSource: 'utm_source', utmMedium: 'utm_medium', utmCampaign: 'utm_campaign', utmContent: 'utm_content', utmTerm: 'utm_term' }

const PAGE = 500

async function expanded(s: State, call: ApiCall, type: string, start: number, end: number): Promise<Row[]> {
	const out: Row[] = []
	for (let offset = 0; ; offset += PAGE) {
		const rows = (await call(`${s.base}/websites/${s.website}/metrics/expanded?type=${type}&startAt=${start}&endAt=${end - 1}&limit=${PAGE}&offset=${offset}`, { headers: s.headers })) as Row[]
		if (!Array.isArray(rows)) throw new ImportError(`Umami sent something other than a list for the ${type} breakdown`)
		out.push(...rows)
		if (rows.length < PAGE) return out
	}
}

const visit = (r: Row) => ({ visitors: count(r.visitors), visits: count(r.visits), pageviews: count(r.pageviews), bounces: count(r.bounces), duration: count(r.totaltime) })

export const umami: Importer<State> = {
	...importerInfo('umami')!,
	// Umami Cloud: "Each API key is limited to 50 calls every 15 seconds"
	rate: { calls: 50, ms: 15_000 },

	async open(input, call, zone) {
		const website = required(input, 'website', 'Website ID')
		if (!/^[0-9a-f-]{36}$/i.test(website)) throw new ImportError('Website ID is a UUID, such as 94db1cb1-74f4-4a40-ad6c-962362670409')
		let base: string
		let headers: Record<string, string>
		if (!input.url?.trim()) {
			base = 'https://api.umami.is/v1'
			headers = { Authorization: `Bearer ${required(input, 'key', 'API key')}` }
		} else {
			base = `${publicBase(input.url)}/api`
			const login = (await call(`${base}/auth/login`, { method: 'POST', json: { username: required(input, 'username', 'Username'), password: required(input, 'password', 'Password') } })) as { token?: string; requiresTwoFactor?: boolean }
			if (login.requiresTwoFactor) throw new ImportError('This Umami user signs in with two-factor authentication. Use a user without it, made for the import.')
			if (!login.token) throw new ImportError('Umami signed in without a token')
			headers = { Authorization: `Bearer ${login.token}` }
		}
		const site = (await call(`${base}/websites/${website}`, { headers })) as { name?: string; domain?: string; createdAt?: string }
		const created = Date.parse(site.createdAt ?? '')
		return {
			state: { base, headers, website, domain: (site.domain ?? '').toLowerCase().replace(/^www\./, '') },
			label: `Umami: ${site.name || site.domain || website}`,
			first: Number.isFinite(created) ? localDay(created, zone) : undefined,
		}
	},

	async day(s, day, zone, call, set) {
		const [start, end] = dayBounds(day, zone)
		const stats = (await call(`${s.base}/websites/${s.website}/stats?startAt=${start}&endAt=${end - 1}`, { headers: s.headers })) as Record<string, unknown>
		const total = { name: '', pageviews: count(stats.pageviews), visitors: count(stats.visitors), visits: count(stats.visits), bounces: count(stats.bounces), totaltime: count(stats.totaltime) }
		// a day without visits has no breakdowns to ask for
		if (!total.visits && !total.pageviews) return
		set.add(day, '', '', visit(total))
		for (const type of TYPES) addRows(set, day, type, await expanded(s, call, type, start, end), total, s.domain)
	},
}

function addRows(set: ImportedSet, day: string, type: (typeof TYPES)[number], rows: Row[], total: Row, domain: string) {
	switch (type) {
		case 'path':
			for (const r of rows) set.add(day, 'page', normalizeImportedPath(r.name), { visitors: count(r.visitors), visits: count(r.visits), pageviews: count(r.pageviews) })
			return
		case 'entry':
		case 'exit':
			for (const r of rows) set.add(day, type === 'entry' ? 'entry_page' : 'exit_page', normalizeImportedPath(r.name), visit(r))
			return
		case 'referrer': {
			// visits without a referrer, or from the site itself, are direct. Umami leaves
			// bounces and time off its referrer rows, so Direct gets none of the day's either.
			const timed = rows.some((r) => count(r.bounces) || count(r.totaltime))
			const direct = { ...total, ...(timed ? {} : { bounces: 0, totaltime: 0 }) }
			for (const r of rows) {
				const host = r.name.toLowerCase().replace(/^www\./, '')
				if (!host || host === domain) continue
				const source = sourceName(host)
				set.add(day, 'source', source, visit(r))
				set.add(day, 'referrer', host, visit(r))
				set.add(day, 'channel', channelForSource(source, null, null), visit(r))
				for (const k of ['pageviews', 'visitors', 'visits', 'bounces', 'totaltime'] as const) direct[k] -= count(r[k])
			}
			if (direct.visits > 0) {
				const m = visit({ ...direct, visitors: Math.max(0, direct.visitors), pageviews: Math.max(0, direct.pageviews), bounces: Math.max(0, direct.bounces), totaltime: Math.max(0, direct.totaltime) })
				set.add(day, 'source', 'Direct', m)
				set.add(day, 'channel', 'Direct', m)
			}
			return
		}
		case 'country':
			for (const r of rows) if (r.name) set.add(day, 'country', r.name.toUpperCase(), visit(r))
			return
		case 'browser':
			for (const r of rows) if (!BOTS.has(r.name)) set.add(day, 'browser', BROWSERS[r.name] ?? r.name, visit(r))
			return
		case 'os':
			for (const r of rows) {
				const [name, version] = os(r.name)
				set.add(day, 'os', name, visit(r))
				if (version) set.add(day, 'os_version', `${name} ${version}`, visit(r))
			}
			return
		case 'device':
			for (const r of rows) set.add(day, 'device', DEVICES[r.name] ?? r.name, visit(r))
			return
		case 'event':
			// for events, `pageviews` counts the events
			for (const r of rows) set.add(day, 'event', r.name, { visitors: count(r.visitors), events: count(r.pageviews) })
			return
		default:
			for (const r of rows) if (r.name) set.add(day, UTM[type], r.name, visit(r))
	}
}
