import { channelForSource, sourceName } from '../channel'
import { normalizeImportedPath, type ImportedSet } from '../imported'
import type { Zone } from '../time'
import { importerInfo } from './info'
import { ImportError, type ApiCall, type Importer } from './types'
import { count, prevDay, required, tz } from './util'

/**
 * Fathom's API (v1) aggregations, a day at a time in the site's time zone. Totals and
 * events are read 90 days at a time with `date_grouping=day`, the breakdowns one day per
 * request. Built from Fathom's API reference and answers others published, not yet run
 * against a real site. https://usefathom.com/api
 */

const BASE = 'https://api.usefathom.com/v1'

interface State {
	headers: Record<string, string>
	site: string
	/** the site's event names, from its events list */
	events: string[]
	/** the day's totals, read for many days in one request, so empty days cost none */
	days: Map<string, Row>
	/** each event's completions per day, read with the totals */
	conversions: Map<string, Row[]>
}

type Row = Record<string, unknown>

/** How many days one request reads totals and events for. */
const SPAN = 90
/** rows a grouped request returns, the most the API allows; it has no further pages */
const LIMIT = 1000

const OS: Record<string, string> = { 'Mac OS': 'macOS', 'Mac OS X': 'macOS', 'Chrome OS': 'ChromeOS', 'GNU/Linux': 'Linux' }
const DEVICES: Record<string, string> = { desktop: 'Desktop', mobile: 'Mobile', tablet: 'Tablet' }
const UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** Fathom writes hostnames with their scheme, such as `https://www.google.com`. */
function host(v: string): string {
	try {
		return new URL(/^[a-z]+:\/\//i.test(v) ? v : `https://${v}`).hostname.toLowerCase().replace(/^www\./, '')
	} catch {
		return ''
	}
}

/** A bounce rate as a fraction. Fathom answers one, such as 0.28; a value above 1 is a percent. */
const rate = (v: unknown) => (count(v) > 1 ? count(v) / 100 : count(v))

async function aggregate(s: State, call: ApiCall, query: Record<string, string>, from: string, to: string, zone: Zone): Promise<Row[]> {
	const q = new URLSearchParams({ ...query, date_from: `${from} 00:00:00`, date_to: `${to} 23:59:59`, timezone: tz(zone) })
	const got = await call(`${BASE}/aggregations?${q}`, { headers: s.headers })
	if (!Array.isArray(got)) throw new ImportError('Fathom answered an aggregation with something other than a list')
	return got as Row[]
}

/** One day of a pageview breakdown, the busiest rows first. */
const breakdown = (s: State, call: ApiCall, day: string, zone: Zone, fields: string, aggregates = 'visits,uniques') =>
	aggregate(s, call, { entity: 'pageview', entity_id: s.site, aggregates, field_grouping: fields, sort_by: `${aggregates.split(',')[0]}:desc`, limit: String(LIMIT) }, day, day, zone)

export const fathom: Importer<State> = {
	...importerInfo('fathom')!,
	// the included API plan allows 600 requests an hour, spread here over the hour
	rate: { calls: 10, ms: 60_000 },

	async open(input, call) {
		const site = required(input, 'site', 'Site ID').toUpperCase()
		const headers = { Authorization: `Bearer ${required(input, 'token', 'API token')}` }
		if (!/^[A-Z0-9]+$/.test(site)) throw new ImportError('Site ID is the code in your Fathom embed script, such as CDBUGS')
		const info = (await call(`${BASE}/sites/${site}`, { headers })) as Row
		if (!text(info?.id)) throw new ImportError(`Fathom has no site ${site} for this token`)
		const events: string[] = []
		for (let after = ''; ; ) {
			const page = (await call(`${BASE}/sites/${site}/events?limit=100${after ? `&starting_after=${encodeURIComponent(after)}` : ''}`, { headers })) as { data?: Row[]; has_more?: boolean }
			const data = Array.isArray(page?.data) ? page.data : []
			for (const e of data) if (text(e.name)) events.push(text(e.name))
			if (!page?.has_more || !data.length) break
			after = text(data[data.length - 1].id)
		}
		const created = text(info.created_at).slice(0, 10)
		return {
			state: { headers, site, events, days: new Map(), conversions: new Map() },
			label: `Fathom: ${text(info.name) || site}`,
			first: /^\d{4}-\d{2}-\d{2}$/.test(created) ? created : undefined,
		}
	},

	async day(s, day, zone, call, set) {
		if (!s.days.has(day)) {
			let from = day
			for (let i = 1; i < SPAN; i++) from = prevDay(from)
			const rows = await aggregate(s, call, { entity: 'pageview', entity_id: s.site, aggregates: 'visits,uniques,pageviews,avg_duration,bounce_rate', date_grouping: 'day' }, from, day, zone)
			for (let d = day; d >= from; d = prevDay(d)) s.days.set(d, {})
			for (const r of rows) s.days.set(text(r.date).slice(0, 10), r)
			s.conversions.clear()
			// a span without visits has no events either
			for (const name of rows.some((r) => count(r.visits) || count(r.uniques)) ? s.events : []) {
				s.conversions.set(name, await aggregate(s, call, { entity: 'event', site_id: s.site, entity_name: name, aggregates: 'conversions,unique_conversions', date_grouping: 'day' }, from, day, zone))
			}
		}
		const total = s.days.get(day)!
		// a visit is a visitor's day, so the day's visits are its visitors
		const visits = count(total.visits) || count(total.uniques)
		if (!visits) return
		set.add(day, '', '', { visitors: visits, visits, pageviews: count(total.pageviews), bounces: Math.round(visits * rate(total.bounce_rate)), duration: Math.round(visits * count(total.avg_duration)) })

		for (const r of await breakdown(s, call, day, zone, 'pathname', 'uniques,pageviews')) {
			set.add(day, 'page', normalizeImportedPath(text(r.pathname)), { visitors: count(r.uniques), visits: count(r.uniques), pageviews: count(r.pageviews) })
		}
		for (const r of await breakdown(s, call, day, zone, 'entry_page', 'visits,uniques,bounce_rate,avg_duration')) {
			const v = count(r.visits)
			set.add(day, 'entry_page', normalizeImportedPath(text(r.entry_page)), { visitors: count(r.uniques) || v, visits: v, bounces: Math.round(v * rate(r.bounce_rate)), duration: Math.round(v * count(r.avg_duration)) })
		}
		for (const r of await breakdown(s, call, day, zone, 'exit_page')) set.add(day, 'exit_page', normalizeImportedPath(text(r.exit_page)), { visitors: count(r.uniques) || count(r.visits), visits: count(r.visits) })

		for (const r of await breakdown(s, call, day, zone, 'referrer_hostname', 'visits')) {
			const h = host(text(r.referrer_hostname))
			const source = h ? sourceName(h) : 'Direct'
			const m = { visitors: count(r.visits), visits: count(r.visits) }
			set.add(day, 'source', source, m)
			set.add(day, 'channel', channelForSource(source, null, null), m)
			if (h) set.add(day, 'referrer', h, m)
		}
		// all five tags in one request; each tag's visits are the sum of its rows
		for (const r of await breakdown(s, call, day, zone, UTM.join(','), 'visits')) {
			for (const tag of UTM) if (text(r[tag])) set.add(day, tag, text(r[tag]), { visitors: count(r.visits), visits: count(r.visits) })
		}

		for (const r of await breakdown(s, call, day, zone, 'country_code', 'visits')) {
			const code = text(r.country_code).toUpperCase()
			if (/^[A-Z]{2}$/.test(code)) set.add(day, 'country', code, { visitors: count(r.visits), visits: count(r.visits) })
		}
		for (const r of await breakdown(s, call, day, zone, 'city', 'visits')) if (text(r.city)) set.add(day, 'city', text(r.city), { visitors: count(r.visits), visits: count(r.visits) })
		// a visitor has one browser, system and device a day, so the three share a request
		for (const r of await breakdown(s, call, day, zone, 'browser,operating_system,device_type', 'visits')) {
			const m = { visitors: count(r.visits), visits: count(r.visits) }
			set.add(day, 'browser', text(r.browser) || 'Unknown', m)
			set.add(day, 'os', OS[text(r.operating_system)] ?? (text(r.operating_system) || 'Unknown'), m)
			const device = DEVICES[text(r.device_type).toLowerCase()]
			if (device) set.add(day, 'device', device, m)
		}

		for (const [name, rows] of s.conversions) {
			const r = rows.find((x) => text(x.date).slice(0, 10) === day)
			if (r && count(r.conversions)) set.add(day, 'event', name, { visitors: count(r.unique_conversions), events: count(r.conversions) })
		}
	},
}
