import { csvRows } from '../imported'
import { BUILTIN_EVENTS } from '../ingest'
import type { RawHit, UtmTag } from './raw'
import { UTM_TAGS } from './raw'

/**
 * Simple Analytics' raw export (Export API `/api/export/datapoints`, CSV), read as uploaded
 * files: the page views export and the events export, each a row per data point, joined
 * into visits by `session_id`. Simple Analytics has no visitor id; `is_unique` marks the
 * page view it counted as a visitor.
 * https://docs.simpleanalytics.com/api/export-data-points
 */

/** The header of a data points export: `added_iso` and a page or event column. */
export function isSimpleAnalyticsCsv(text: string): boolean {
	const head = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0].split(',')
	return head.includes('added_iso') && (head.includes('path') || head.includes('datapoint'))
}

const BROWSERS: Record<string, string> = {
	'Google Chrome': 'Chrome',
	'Chrome Mobile': 'Chrome',
	'Chrome Mobile iOS': 'Chrome',
	'Chrome WebView': 'Chrome',
	'iOS Safari': 'Safari',
	'Mobile Safari': 'Safari',
	'Microsoft Edge': 'Edge',
	'Firefox Mobile': 'Firefox',
	'Firefox iOS': 'Firefox',
	'Samsung Browser': 'Samsung Internet',
	'Opera Mobile': 'Opera',
}
const OS: Record<string, string> = { 'Mac OS X': 'macOS', 'Mac OS': 'macOS', 'Chrome OS': 'ChromeOS' }
const DEVICES: Record<string, string> = { desktop: 'Desktop', mobile: 'Mobile', tablet: 'Tablet' }

/** auto-events.js names its events `outbound_<host>` and `download_<file>` */
function eventName(name: string): string {
	if (/^outbound_/.test(name)) return BUILTIN_EVENTS.outbound
	if (/^download_/.test(name)) return BUILTIN_EVENTS.download
	return name
}

const number = (v: string | undefined) => (v && Number.isFinite(Number(v)) ? Number(v) : undefined)

/** The rows of one export as hits. */
export function simpleAnalyticsHits(text: string): RawHit[] {
	const rows = csvRows(text.replace(/^﻿/, ''))
	const head = rows.next().value as string[] | undefined
	if (!head) return []
	const col = Object.fromEntries(head.map((h, i) => [h.trim(), i]))
	if (col.session_id === undefined) throw new Error('this Simple Analytics export has no session_id column; export it again with session_id among the fields')
	const events = col.datapoint !== undefined
	const out: RawHit[] = []
	for (const r of rows) {
		const get = (name: string) => (col[name] === undefined ? '' : (r[col[name]] ?? '').trim())
		const t = Date.parse(get('added_iso'))
		const session = get('session_id')
		if (!Number.isFinite(t) || !session) continue
		const utm: Partial<Record<UtmTag, string>> = {}
		for (const tag of UTM_TAGS) if (get(tag)) utm[tag] = get(tag)
		const browser = get('browser_name')
		const os = get('os_name')
		out.push({
			t,
			visitor: session,
			visit: session,
			...(events ? { event: eventName(get('datapoint')) } : {}),
			path: get('path'),
			host: get('hostname'),
			referrer: get('referrer_hostname'),
			utm,
			country: get('country_code'),
			browser: BROWSERS[browser] ?? browser,
			browser_version: get('browser_version'),
			os: OS[os] ?? os,
			os_version: get('os_version'),
			device: DEVICES[get('device_type').toLowerCase()],
			seconds: number(get('duration_seconds')),
			scroll: number(get('scrolled_percentage')),
			...(events ? {} : { counted: get('is_unique') !== 'false' }),
		})
	}
	return out.filter((h) => !h.event || h.event.trim())
}
