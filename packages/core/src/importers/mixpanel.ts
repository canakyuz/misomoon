import type { RawHit, UtmTag } from './raw'
import { UTM_TAGS } from './raw'

/**
 * Mixpanel's Raw Event Export (`GET /api/2.0/export`), read as an uploaded file: JSON
 * Lines, each `{ "event": …, "properties": { "time": …, … } }`. Page views are
 * `$mp_web_page_view`; Mixpanel's other `$` and `mp_` events are its own and stay out.
 * https://docs.mixpanel.com/reference/raw-event-export
 */

type Props = Record<string, unknown>

const PAGE_VIEW = '$mp_web_page_view'

/** The first line is an event with a `time`. */
export function isMixpanelJsonl(text: string): boolean {
	const line = text.replace(/^﻿/, '').trimStart().split('\n', 1)[0]
	if (!line.startsWith('{')) return false
	try {
		const e = JSON.parse(line) as { event?: unknown; properties?: Props }
		return typeof e.event === 'string' && typeof e.properties?.time === 'number'
	} catch {
		return false
	}
}

const BROWSERS: Record<string, string> = {
	'Mobile Safari': 'Safari',
	'Chrome iOS': 'Chrome',
	'Firefox iOS': 'Firefox',
	'Microsoft Edge': 'Edge',
	'Android Mobile': 'Android Browser',
	'Facebook Mobile': 'Facebook',
}
const OS: Record<string, string> = { 'Mac OS X': 'macOS', 'Chrome OS': 'ChromeOS' }
const DESKTOPS = new Set(['Windows', 'Mac OS X', 'Linux', 'Chrome OS'])

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '')

function url(v: unknown): URL | null {
	try {
		return new URL(str(v))
	} catch {
		return null
	}
}

/** The screen width at misomoon's breakpoints, else what `$device` and `$os` say. */
function device(p: Props): string | undefined {
	const width = Number(p.$screen_width)
	if (width > 0) return width < 576 ? 'Mobile' : width < 992 ? 'Tablet' : 'Desktop'
	const d = str(p.$device)
	if (d) return /ipad|tablet/i.test(d) ? 'Tablet' : 'Mobile'
	return DESKTOPS.has(str(p.$os)) ? 'Desktop' : undefined
}

/** The file's lines as hits. Events without a visitor, such as ones your server sent, stay out. */
export function mixpanelHits(text: string): RawHit[] {
	const out: RawHit[] = []
	let n = 0
	for (const line of text.replace(/^﻿/, '').split('\n')) {
		n++
		const s = line.trim()
		if (!s) continue
		let e: { event?: unknown; properties?: Props }
		try {
			e = JSON.parse(s)
		} catch {
			throw new Error(`line ${n} of this Mixpanel export isn't JSON`)
		}
		const name = str(e.event)
		const p = e.properties ?? {}
		if (!name || (name !== PAGE_VIEW && /^(\$|mp_)/.test(name))) continue
		const time = Number(p.time)
		// exported with time_in_ms=true, or in seconds
		const t = time > 1e11 ? time : time * 1000
		// the export resolves distinct_id to the user; a signed-in user's $device_id can change on each event
		const visitor = (str(p.distinct_id) || str(p.$device_id)).replace(/^\$device:/, '')
		if (!Number.isFinite(t) || !visitor) continue
		const page = url(p.$current_url)
		const utm: Partial<Record<UtmTag, string>> = {}
		for (const tag of UTM_TAGS) {
			const v = str(p[tag]) || page?.searchParams.get(tag)?.trim()
			if (v) utm[tag] = v
		}
		const browser = str(p.$browser)
		const os = str(p.$os)
		const ref = str(p.$referrer)
		out.push({
			t,
			visitor,
			...(name === PAGE_VIEW ? {} : { event: name }),
			path: str(p.current_url_path) || page?.pathname || '/',
			host: str(p.current_domain) || page?.hostname,
			referrer: ref && ref !== '$direct' ? ref : str(p.$referring_domain).replace(/^\$direct$/, ''),
			utm,
			country: str(p.mp_country_code),
			region: str(p.$region),
			city: str(p.$city),
			browser: BROWSERS[browser] ?? browser,
			browser_version: str(p.$browser_version),
			os: OS[os] ?? os,
			device: device(p),
		})
	}
	return out
}
