import { classify, referrerHost } from '../channel'
import { normalizeImportedPath, type ImportedSet } from '../imported'
import { localDay, type Zone } from '../time'

/**
 * Raw events from another tool's export, one per page view or custom event, counted into
 * misomoon's daily rows as its tracker would count them: a visit ends after 30 minutes
 * without activity, its source and place come from its first event, and it bounces with
 * one page view and nothing else. Each tool's file is read into hits by its own module.
 */

export type UtmTag = 'utm_source' | 'utm_medium' | 'utm_campaign' | 'utm_content' | 'utm_term'
export const UTM_TAGS: UtmTag[] = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']

export interface RawHit {
	/** Unix milliseconds */
	t: number
	visitor: string
	/** the tool's own visit id; without one, 30 minutes without a hit starts a new visit */
	visit?: string
	/** a custom event's name; a hit without one is a page view */
	event?: string
	path: string
	/** the site's host, so a referrer on it counts as none */
	host?: string
	/** a URL, a host, or a source's name such as `google` */
	referrer?: string
	utm?: Partial<Record<UtmTag, string>>
	/** the ad network of a click id in the page's URL, such as `Google` for gclid (adClick in channel.ts) */
	click?: string | null
	country?: string
	region?: string
	city?: string
	browser?: string
	browser_version?: string
	os?: string
	os_version?: string
	device?: string
	/** seconds on the page */
	seconds?: number
	/** percent of the page scrolled */
	scroll?: number
	/** false when the tool didn't count the visitor again, as on a second visit that day */
	counted?: boolean
}

/** A visit ends after this long without a hit, as in misomoon's tracker. */
export const VISIT_GAP_MS = 30 * 60_000
/** Bytes of raw export read in one upload, so its hits fit in a Worker's memory */
export const RAW_MAX = 50_000_000

interface Page {
	path: string
	t: number
	seconds?: number
	scroll?: number
}

interface Visit {
	first: RawHit
	last: number
	pages: Page[]
	events: number
	counted: boolean
}

interface Tally {
	visitors: Set<string>
	visits: number
	pageviews: number
	bounces: number
	duration: number
	time_s: number
	time_n: number
	scroll: number
	scroll_n: number
	events: number
}

const blank = (): Tally => ({ visitors: new Set(), visits: 0, pageviews: 0, bounces: 0, duration: 0, time_s: 0, time_n: 0, scroll: 0, scroll_n: 0, events: 0 })

/** A referrer as a host, read from a URL as the tracker reads it, or as a name when it has no dot, such as `google`. */
function referrerOf(ref: string): { host: string | null; name: string | null } {
	ref = ref.trim()
	if (!ref) return { host: null, name: null }
	const host = (/^[a-z][a-z0-9+.-]*:\/\//i.test(ref) ? (referrerHost(ref) ?? '') : ref.split(/[/?#]/)[0].replace(/:\d+$/, '').replace(/^www\./, '').replace(/^m\./, '')).toLowerCase()
	if (host.includes('.')) return { host, name: null }
	return { host: null, name: host || null }
}

/** misomoon's version keys: `Chrome 141`, `macOS 15.4`, `Windows 10/11` */
export function browserVersion(browser: string, version: string | undefined): string | null {
	const major = (version ?? '').trim().split('.')[0]
	return browser && /^\d+$/.test(major) ? `${browser} ${major}` : null
}
export function osVersion(os: string, version: string | undefined): string | null {
	const v = (version ?? '').trim().split('.').filter(Boolean)
	if (!os || !v.length || !/^\d+$/.test(v[0])) return null
	// a browser's client hints give Windows 11 as 13 and up
	if (os === 'Windows') return Number(v[0]) >= 10 ? 'Windows 10/11' : `Windows ${v[1] && v[1] !== '0' ? `${v[0]}.${v[1]}` : v[0]}`
	return `${os} ${v.slice(0, 2).join('.')}`
}

/**
 * Adds the hits to `set`. A visit counts on the local day it starts, and a custom event on
 * the day it was sent. Returns the hits read.
 */
export function addRawHits(set: ImportedSet, hits: RawHit[], zone: Zone): number {
	const tallies = new Map<string, Tally>()
	const tally = (day: string, dim: string, key: string) => {
		const id = `${day}\u0000${dim}\u0000${key}`
		let t = tallies.get(id)
		if (!t) tallies.set(id, (t = blank()))
		return t
	}

	// a visit starts with a page view, so it has one
	const close = (v: Visit) => {
		const day = localDay(v.first.t, zone)
		const f = v.first
		const views = v.pages.length
		const lastPage = v.pages[views - 1]
		const duration = Math.max(0, Math.round((lastPage.t - v.pages[0].t) / 1000 + (lastPage.seconds ?? 0)), Math.round((v.last - v.pages[0].t) / 1000))
		const bounce = views === 1 && !v.events ? 1 : 0
		const visit = (t: Tally) => {
			if (v.counted) t.visitors.add(f.visitor)
			t.visits++
			t.pageviews += views
			t.bounces += bounce
			t.duration += duration
		}

		const ref = referrerOf(f.referrer ?? '')
		const utm = { utm_source: null, utm_medium: null, utm_campaign: null, utm_term: null, utm_content: null, ...f.utm } as Record<UtmTag, string | null>
		const self = (f.host ?? '').toLowerCase().replace(/^www\./, '')
		const acq = classify(ref.host, ref.name && !utm.utm_source ? { ...utm, utm_source: ref.name } : utm, self, f.click ?? null)
		const dims: [string, string | null | undefined][] = [
			['', ''],
			['entry_page', v.pages[0].path],
			['source', acq.source],
			['channel', acq.channel],
			['referrer', acq.referrer_host],
			...UTM_TAGS.map((tag) => [tag, f.utm?.[tag]] as [string, string | undefined]),
			['country', f.country && /^[A-Za-z]{2}$/.test(f.country) ? f.country.toUpperCase() : null],
			['region', f.region],
			['city', f.city],
			['browser', f.browser],
			['browser_version', f.browser ? browserVersion(f.browser, f.browser_version) : null],
			['os', f.os],
			['os_version', f.os ? osVersion(f.os, f.os_version) : null],
			['device', f.device],
		]
		for (const [dim, key] of dims) if (key || !dim) visit(tally(day, dim, key ?? ''))
		const exit = tally(day, 'exit_page', lastPage.path)
		if (v.counted) exit.visitors.add(f.visitor)
		exit.visits++

		const seen = new Set<string>()
		for (const p of v.pages) {
			const t = tally(day, 'page', p.path)
			if (v.counted) t.visitors.add(f.visitor)
			if (!seen.has(p.path)) t.visits++
			seen.add(p.path)
			t.pageviews++
			if (p.seconds !== undefined) {
				t.time_s += p.seconds
				t.time_n++
			}
			if (p.scroll !== undefined) {
				t.scroll += p.scroll
				t.scroll_n++
			}
		}
	}

	const open = new Map<string, Visit>()
	const sorted = [...hits].filter((h) => Number.isFinite(h.t) && h.visitor).sort((a, b) => a.t - b.t)
	for (const h of sorted) {
		const key = h.visit ? `v\u0000${h.visit}` : `u\u0000${h.visitor}`
		let v = open.get(key)
		if (v && !h.visit && h.t - v.last > VISIT_GAP_MS) {
			close(v)
			open.delete(key)
			v = undefined
		}
		if (h.event) {
			const t = tally(localDay(h.t, zone), 'event', h.event)
			t.visitors.add(h.visitor)
			t.events++
			if (v) {
				v.events++
				v.last = h.t
			}
			continue
		}
		const page: Page = { path: normalizeImportedPath(h.path), t: h.t, seconds: h.seconds, scroll: h.scroll }
		if (!v) {
			open.set(key, { first: h, last: h.t, pages: [page], events: 0, counted: h.counted !== false })
			continue
		}
		v.pages.push(page)
		v.last = h.t
		if (h.counted !== false) v.counted = true
	}
	for (const v of open.values()) close(v)

	for (const [id, t] of tallies) {
		const [day, dim, key] = id.split('\u0000')
		set.add(day, dim, key, { visitors: t.visitors.size, visits: t.visits, pageviews: t.pageviews, bounces: t.bounces, duration: t.duration, time_s: t.time_s, time_n: t.time_n, scroll: t.scroll, scroll_n: t.scroll_n, events: t.events })
	}
	return sorted.length
}
