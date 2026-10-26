import { adClick, classify, readUTM, referrerHost } from './channel'
import { DAY, MINUTE } from './time'
import type { EventDetail, EventRow, TrackerPayload } from './types'
import { isBotUA, parseUA, screenClass } from './ua'
import type { Stmt } from './queries'

export const SESSION_GAP = 30 * MINUTE

/** What the edge knows about a request. On Workers this comes from `request.cf`. */
export interface EdgeContext {
	ua: string
	ip: string
	country?: string | null
	region?: string | null
	city?: string | null
	continent?: string | null
	timezone?: string | null
	asOrganization?: string | null
	/** the request's Accept-Language header, for beacons that don't name a language */
	language?: string | null
	/** Cloudflare verified bot / bot score signals, when available */
	verifiedBot?: boolean
	botScore?: number | null
}

export type Rejection = 'bot' | 'invalid'

const clip = (s: unknown, n: number) => (typeof s === 'string' && s ? s.slice(0, n) : null)
const finite = (v: unknown, min: number, max: number): number | null =>
	typeof v === 'number' && Number.isFinite(v) ? Math.min(Math.max(v, min), max) : null

// any text but control characters, and ; and | which separate filters and their values
const NAME = /^[^\u0000-\u001f\u007f;|]{1,120}$/

/** What a beacon may hand out as a payment key: refs and checkout ids, never a `provider:` link key. */
export const REF_PATTERN = /^[\w-]{6,128}$/
const MAX_REFS = 4
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const VIEW_KEY = /^[\w-]{16,64}$/

/**
 * The event id a page view is stored under: its site and the key the tracker picked for it
 * (`y`), so a beacon can only reach its own site's rows and two sites' keys never meet.
 * m.js sends a number between 0 and 1, kept as 11 base-36 digits or fewer; the SDKs send
 * a string of 16 or more characters, so the two never give the same id. Null when the key
 * is neither.
 */
export function viewEventId(siteId: string, key: unknown): string | null {
	if (typeof key === 'number') return key > 0 && key < 1 ? `${siteId}:${Math.round(key * 2 ** 53).toString(36)}` : null
	return typeof key === 'string' && VIEW_KEY.test(key) ? `${siteId}:${key.toLowerCase()}` : null
}

/** Events the tracker sends on its own (m.js uses the same names). */
export const BUILTIN_EVENTS = { outbound: 'Outbound link', download: 'Download', form: 'Form sent', notFound: '404' } as const

/** Built-in events always count as interaction, so a click away isn't a bounce. */
const SYSTEM_EVENTS = new Set<string>(Object.values(BUILTIN_EVENTS))

/**
 * Turns a beacon into an event row with everything except visitor and session ids,
 * which need the daily salt and the shard. Returns a rejection for traffic we drop.
 */
export function buildEvent(p: TrackerPayload, edge: EdgeContext, now = Date.now()): EventRow | Rejection {
	if (!p || typeof p !== 'object') return 'invalid'
	// m.js leaves the name off its own beacons: an engagement carries `e`, a pageview `w`
	const n = p.n ?? (typeof p.e === 'number' ? 'engagement' : typeof p.w === 'number' ? 'pageview' : '')
	if (typeof p.s !== 'string' || typeof n !== 'string' || typeof p.u !== 'string') return 'invalid'
	// beacons are untrusted JSON: anything that should be text and isn't is dropped, not a 500
	const str = (x: unknown) => (typeof x === 'string' ? x : undefined)
	p = { ...p, r: str(p.r), t: str(p.t), l: str(p.l) }
	if (edge.verifiedBot || (edge.botScore != null && edge.botScore < 10) || isBotUA(edge.ua)) return 'bot'
	const name = n.trim()
	if (!NAME.test(name)) return 'invalid'
	let url: URL
	try {
		url = new URL(p.u)
	} catch {
		return 'invalid'
	}
	if (!/^https?:$/.test(url.protocol)) return 'invalid'

	const ua = parseUA(edge.ua)
	const utm = readUTM(url)
	const r = typeof p.r === 'string' ? p.r : undefined
	const refHost = referrerHost(r)
	const acq = classify(refHost, utm, url.hostname.replace(/^www\./, ''), adClick(url))
	// Beacons can arrive late; anything far from now is a bad client clock. A clock that
	// runs ahead into the next UTC day takes now: that day may already route to another
	// shard, which an isolate with a cached routing table doesn't know yet (control.ts).
	const ts = typeof p.ts === 'number' && Math.abs(p.ts - now) < 5 * MINUTE && Math.floor(p.ts / DAY) <= Math.floor(now / DAY) ? Math.round(p.ts) : now

	let props: string | null = null
	if (p.p && typeof p.p === 'object') {
		const entries = Object.entries(p.p)
			.filter(([k, v]) => /^[\w.-]{1,64}$/.test(k) && ['string', 'number', 'boolean'].includes(typeof v))
			.slice(0, 30)
			.map(([k, v]) => [k, typeof v === 'string' ? v.slice(0, 300) : v])
		if (entries.length) props = JSON.stringify(Object.fromEntries(entries))
	}

	const v = p.v && typeof p.v === 'object' ? p.v : {}
	// m.js passes misomoon()'s revenue as given, { amount, currency }; the SDKs send { a, c }
	const rev = p.$ && typeof p.$ === 'object' ? (p.$ as { a?: unknown; c?: unknown; amount?: unknown; currency?: unknown }) : null
	const amount = rev ? Number(rev.a ?? rev.amount) : NaN
	const currency = rev ? (rev.c ?? rev.currency) : null
	const isEngagement = name === 'engagement'
	const custom = name !== 'pageview' && !isEngagement
	const refs = [...new Set((Array.isArray(p.k) ? p.k : [p.k]).filter((k): k is string => typeof k === 'string' && REF_PATTERN.test(k)))].slice(0, MAX_REFS)
	const site = p.s.slice(0, 64)
	const view = name === 'pageview' || isEngagement ? viewEventId(site, p.y) : null
	// An engagement beacon is never a row: it adds its time to the pageview the view key names,
	// or (with keys and no view) only hands out payment refs. One with neither is dropped, so
	// no custom event can be called `engagement`.
	if (isEngagement && !refs.length && (typeof p.e !== 'number' || !view)) return 'invalid'
	return {
		// events_event_id is unique, so a resent event with the same id inserts nothing. A
		// pageview with a view key takes the id its engagement beacons will name.
		event_id: name === 'pageview' && view ? view : typeof p.id === 'string' && UUID.test(p.id) ? p.id.toLowerCase() : crypto.randomUUID(),
		...(custom && p.i === false && !SYSTEM_EVENTS.has(name) ? { interactive: false } : {}),
		// an engagement beacon with keys is m.js handing out a ref, not time on the page
		...(refs.length ? { refs, ...(isEngagement ? { ref_only: true } : {}) } : {}),
		...(isEngagement && view && !refs.length ? { view } : {}),
		site_id: site,
		ts,
		name,
		visitor_id: '',
		session_id: '',
		hostname: url.hostname.replace(/^www\./, '').slice(0, 253),
		// a hash router's route (#/pricing, #!/pricing) is the page; any other hash is an anchor or a token
		pathname: normalizePath(url.pathname + (/^#!?\/[^?]+/.exec(url.hash)?.[0] ?? '')),
		title: clip(p.t, 300),
		referrer: acq.referrer_host ? clip(stripQuery(r), 500) : null,
		referrer_host: acq.referrer_host,
		source: acq.source,
		channel: acq.channel,
		...utm,
		country: clip(edge.country, 2),
		region: clip(edge.region, 100),
		city: clip(edge.city, 100),
		continent: clip(edge.continent, 2),
		timezone: clip(edge.timezone, 64),
		asn_org: clip(edge.asOrganization, 120),
		browser: ua.browser,
		browser_version: ua.browser_version,
		os: ua.os,
		os_version: ua.os_version,
		device: ua.device,
		screen: screenClass(p.w),
		viewport: finite(p.vw, 0, 10000),
		// from the beacon (the SDKs), else the request's Accept-Language (m.js)
		language: clip((p.l ?? edge.language ?? '').split(',')[0].split(';')[0].trim(), 16),
		engaged_ms: isEngagement ? finite(p.e, 0, 6 * 60 * MINUTE) : null,
		// m.js sends the raw share of the page seen; it can pass 100 near the bottom
		scroll_depth: isEngagement && finite(p.d, 0, 100) != null ? Math.round(finite(p.d, 0, 100)!) : null,
		lcp: isEngagement ? finite(v.lcp, 0, 60000) : null,
		inp: isEngagement ? finite(v.inp, 0, 60000) : null,
		cls: isEngagement ? finite(v.cls, 0, 10) : null,
		fcp: isEngagement ? finite(v.fcp, 0, 60000) : null,
		ttfb: isEngagement ? finite(v.ttfb, 0, 60000) : null,
		revenue: rev ? finite(amount, 0, 1e9) : null,
		currency: typeof currency === 'string' && /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : null,
		props,
		detail: name === 'pageview' || isEngagement ? eventDetail(p, isEngagement) : null,
	}
}

// ---------------------------------------------------------------- page interactions

const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/g
// card, phone and account numbers
const LONG_NUMBER = /\d{6,}/g
// a link's query string and fragment, which carry tokens and ids
const URL_TAIL = /(https?:\/\/[^\s?#]+)[?#]\S*/g
const UUID_TEXT = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi
// API keys, session ids and reset codes: 20 or more letters and digits, mixed
const TOKEN = /\b(?=\w*\d)(?=\w*[A-Za-z])\w{20,}\b/g
/** What the tracker builds element selectors from: tags, nth-of-type, ids and data-misomoon-id. */
const SELECTOR = /^[\w#>:().[\]="-]{1,300}$/

/** Free text a visitor may have typed or seen: one line, without links' queries, emails, ids, tokens or long numbers. */
function scrub(v: unknown, n: number): string | null {
	if (typeof v !== 'string') return null
	const s = v
		.replace(/\s+/g, ' ')
		.trim()
		.replace(URL_TAIL, '$1')
		.replace(EMAIL, '(email)')
		.replace(UUID_TEXT, '(id)')
		.replace(TOKEN, '(token)')
		.replace(LONG_NUMBER, '#')
		.slice(0, n)
	return s || null
}

const int = (v: unknown, min: number, max: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(Math.max(Math.round(v), min), max) : 0)
const flag = (v: unknown) => int(v, 0, 1)

/** Keeps the entries of a beacon list that `each` accepts, up to `cap`. */
function list<T>(v: unknown, cap: number, each: (e: unknown[]) => T | null): T[] {
	if (!Array.isArray(v)) return []
	const out: T[] = []
	for (const e of v) {
		if (out.length >= cap) break
		const kept = Array.isArray(e) ? each(e) : null
		if (kept) out.push(kept)
	}
	return out
}

/** A script URL without its query or hash, which can carry tokens. */
function errorSource(v: unknown): string {
	// everything from ? or # up to the line and column the URL ends with
	return typeof v === 'string' ? v.replace(/[?#].*?(?=(:\d+:\d+)?$)/, '').slice(0, 300) : ''
}

/**
 * The search term of a pageview, or the clicks, errors, forms, media and content of an
 * engagement beacon, checked and trimmed. Never a field's value: forms carry field names
 * and flags only. Returns JSON, or null when there is nothing to keep.
 */
export function eventDetail(p: TrackerPayload, engagement: boolean): string | null {
	const out: EventDetail = {}
	if (!engagement) {
		const q = scrub(p.q, 100)
		if (q) out.q = q.toLowerCase()
	} else {
		type Of<K extends keyof EventDetail> = NonNullable<EventDetail[K]>[number]
		const c = list<Of<'c'>>(p.c, 30, ([sel, label, n, rage, dead]) =>
			typeof sel === 'string' && SELECTOR.test(sel) && int(n, 0, 1000) > 0 ? [sel, scrub(label, 60) ?? '', int(n, 0, 1000), int(rage, 0, 100), int(dead, 0, 1000)] : null,
		)
		const x = list<Of<'x'>>(p.x, 5, ([msg, src, n]) => {
			const m = scrub(msg, 200)
			return m ? [m, errorSource(src), int(n, 1, 1000) || 1] : null
		})
		const f = list<Of<'f'>>(p.f, 10, ([form, started, submitted]) => {
			const key = scrub(form, 100)
			return key ? [key, flag(started), flag(submitted)] : null
		})
		const g = list<Of<'g'>>(p.g, 50, ([form, field, pos, touched, dropped]) => {
			const key = scrub(form, 100)
			const name = scrub(field, 60)
			return key && name ? [key, name, int(pos, 0, 999), flag(touched), int(dropped, -1, 1)] : null
		})
		const m = list<Of<'m'>>(p.m, 10, ([name, type, ...marks]) => {
			const n = scrub(name, 120)
			return n ? [n, type === 'audio' ? 'audio' : 'video', flag(marks[0]), flag(marks[1]), flag(marks[2]), flag(marks[3]), flag(marks[4])] : null
		})
		const o = list<Of<'o'>>(p.o, 20, ([name, seen, clicked]) => {
			const n = scrub(name, 100)
			return n ? [n, flag(seen), flag(clicked)] : null
		})
		if (c.length) out.c = c
		if (x.length) out.x = x
		if (f.length) out.f = f
		if (g.length) out.g = g
		if (m.length) out.m = m
		if (o.length) out.o = o
	}
	return Object.keys(out).length ? JSON.stringify(out) : null
}

function stripQuery(r: string | undefined): string | null {
	if (!r) return null
	try {
		const u = new URL(r)
		// an android-app:// URL has no origin ("null")
		return `${u.origin === 'null' ? `${u.protocol}//${u.host}` : u.origin}${maskPath(u.pathname)}`
	} catch {
		return null
	}
}

/** An unsubscribe or reset link can hold an email or a secret in the path: each such segment becomes :email or :token. */
function maskPath(path: string): string {
	return path
		.split('/')
		.map((s) => (/^[^@]+(@|%40)[^@]+\.\w+$/i.test(s) ? ':email' : /^(?=\w*\d)(?=\w*[A-Za-z])\w{20,}$/.test(s) ? ':token' : s))
		.join('/')
}

export function normalizePath(p: string): string {
	let path = p || '/'
	try {
		path = decodeURI(path)
	} catch {}
	path = maskPath(path)
	if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1)
	return path.slice(0, 500)
}

async function sha256hex(s: string): Promise<string> {
	const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
	return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Daily-salted, so the same person gets a new id every UTC day and IPs are never stored. */
export async function visitorId(salt: string, siteId: string, ip: string, ua: string): Promise<string> {
	return (await sha256hex(`${salt}|${siteId}|${ip}|${ua}`)).slice(0, 16)
}

export function newSessionId(): string {
	const b = crypto.getRandomValues(new Uint8Array(8))
	return [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
}

export const EVENT_COLUMNS = [
	'event_id', 'site_id', 'ts', 'name', 'visitor_id', 'session_id', 'hostname', 'pathname', 'title',
	'referrer', 'referrer_host', 'source', 'channel',
	'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
	'country', 'region', 'city', 'continent', 'timezone', 'asn_org',
	'browser', 'browser_version', 'os', 'os_version', 'device', 'screen', 'viewport', 'language',
	'engaged_ms', 'scroll_depth', 'lcp', 'inp', 'cls', 'fcp', 'ttfb', 'revenue', 'currency', 'props', 'detail',
] as const satisfies readonly (keyof EventRow)[]

/** Columns a visit takes from its first event and keeps for its lifetime. */
export const SESSION_ATTRS = [
	'hostname', 'referrer', 'referrer_host', 'source', 'channel',
	'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
	'country', 'region', 'city', 'continent', 'timezone', 'asn_org',
	'browser', 'browser_version', 'os', 'os_version', 'device', 'screen', 'language',
] as const satisfies readonly (keyof EventRow)[]

/** Acquisition columns an event inherits from the visit it joins. */
export const INHERITED = ['referrer', 'referrer_host', 'source', 'channel', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const

export interface OpenSession {
	session_id: string
	visitor_id: string
	next_visitor_id: string | null
	last_at: number
	referrer: string | null
	referrer_host: string | null
	source: string
	channel: string
	utm_source: string | null
	utm_medium: string | null
	utm_campaign: string | null
	utm_term: string | null
	utm_content: string | null
}

/** Visitor ids per openSessionsStmt: each is bound twice, and D1 binds at most 100 parameters. */
export const OPEN_SESSIONS_CHUNK = 45

/**
 * Finds the visits still within the inactivity gap for these visitor ids, under the
 * id a visit started with or the one it took on after 00:00 UTC.
 *
 * `INDEXED BY` pins each half to its index. Without table statistics, SQLite plans
 * `visitor_id IN (two or more ids)` as a search of the primary key on `site_id`, which
 * reads every visit of the site. `last_at` is not in the indexes, so it is checked on
 * the few visits each id has. If the index is missing, the statement fails instead of
 * scanning.
 */
export function openSessionsStmt(siteId: string, visitorIds: string[], before: number): Stmt {
	const cols = `session_id, visitor_id, next_visitor_id, last_at, ${INHERITED.join(', ')}`
	const ids = visitorIds.map(() => '?').join(', ')
	return {
		sql: `SELECT ${cols} FROM sessions INDEXED BY sessions_site_visitor WHERE site_id = ? AND visitor_id IN (${ids}) AND last_at >= ?
			UNION ALL
			SELECT ${cols} FROM sessions INDEXED BY sessions_site_next_visitor WHERE site_id = ? AND next_visitor_id IN (${ids}) AND last_at >= ?`,
		params: [siteId, ...visitorIds, before - SESSION_GAP, siteId, ...visitorIds, before - SESSION_GAP],
	}
}

/**
 * Assigns visits to events (sorted by time) and returns the statements that persist them:
 * two per event, so a batch cut at an even count keeps each event's pair together. First an
 * insert and its visit upsert for each row in `rows` (the insert of rows[k] is stmts[2k]),
 * then two updates for each engagement beacon, which adds to its pageview's row instead of
 * being stored (see pingStmts). A beacon whose visit has expired is dropped, as is one whose
 * pageview isn't on this shard (the updates then match nothing). `refs` are the events that
 * hand out payment keys, with their visit filled in; a ref-only beacon is among them but
 * writes nothing.
 *
 * The visits assigned here are what `open` showed, and only a fallback: each statement
 * finds the visit again when it runs (insertInVisitStmt, pingStmts). Two queue consumers
 * can read before either writes, and D1 runs their batches one after the other, so the
 * second batch joins the visit the first one opened. A stored event's visit is then the
 * one on its row (storedVisitsStmt), which may not be the one set here.
 */
export function assignSessions(events: EventRow[], open: OpenSession[]): { rows: EventRow[]; stmts: Stmt[]; refs: EventRow[] } {
	const live = new Map<string, OpenSession>()
	const keep = (id: string, s: OpenSession) => {
		const cur = live.get(id)
		if (!cur || cur.last_at < s.last_at) live.set(id, s)
	}
	for (const s of open) {
		keep(s.visitor_id, s)
		if (s.next_visitor_id) keep(s.next_visitor_id, s)
	}
	const within = (id: string | undefined, ts: number) => {
		const s = id ? live.get(id) : undefined
		return s && ts - s.last_at <= SESSION_GAP ? s : undefined
	}
	const rows: EventRow[] = []
	const stmts: Stmt[] = []
	const pings: Stmt[] = []
	const refs: EventRow[] = []
	// at the same instant a pageview goes first, so its engagement beacons find it
	const ping = (e: EventRow) => (e.view ? 1 : 0)
	for (const ev of [...events].sort((a, b) => a.ts - b.ts || ping(a) - ping(b))) {
		// The salt rotates at 00:00 UTC; a visit still open then continues under yesterday's id.
		let s = within(ev.visitor_id, ev.ts) ?? within(ev.prev_visitor_id, ev.ts)
		if (ev.ref_only) {
			// After the visit timed out the beacon still knows its own page and device.
			if (s) for (const k of INHERITED) (ev as unknown as Record<string, unknown>)[k] = s[k]
			ev.session_id = s?.session_id ?? ''
			refs.push(ev)
			continue
		}
		if (ev.name === 'engagement') {
			// Keeps an open visit open, like any event. Its updates go after every insert of
			// the batch, so a pageview written in the same batch is there for them. They find
			// the visit through the pageview when they run, so a visit this batch can't see
			// yet, opened by a batch written first, still takes the beacon.
			if (!ev.view) continue
			if (s) {
				// a visit open at 00:00 UTC learns the visitor's new id, as an event's upsert would teach it
				if (ev.visitor_id !== s.visitor_id && ev.visitor_id !== s.next_visitor_id) s.next_visitor_id = ev.visitor_id
				s.last_at = Math.max(s.last_at, ev.ts)
				live.set(ev.visitor_id, s)
			}
			ev.session_id = s?.session_id ?? ''
			pings.push(...pingStmts(ev))
			continue
		}
		// an event that opens a visit by what this batch saw; another batch may have opened it first
		const opener = !s
		if (!s) {
			s = { session_id: newSessionId(), visitor_id: ev.visitor_id, next_visitor_id: null, last_at: ev.ts, ...pick(ev, INHERITED) } as OpenSession
		} else {
			for (const k of INHERITED) (ev as unknown as Record<string, unknown>)[k] = s[k]
		}
		s.last_at = Math.max(s.last_at, ev.ts)
		live.set(ev.visitor_id, s)
		ev.session_id = s.session_id
		rows.push(ev)
		stmts.push(insertInVisitStmt(ev, opener), upsertSessionStmt(ev, opener))
		if (ev.refs?.length) refs.push(ev)
	}
	stmts.push(...pings)
	return { rows, stmts, refs }
}

/** Engagement beacons a page view takes; later ones are dropped. A real view sends a few. */
export const MAX_PINGS = 1000
/** Characters of interactions (`detail`) a page view keeps; a beacon that would pass it adds none. */
export const MAX_DETAIL = 128 * 1024
const MARK = 8

/**
 * A beacon's mark in `pings`: a 32-bit FNV-1a hash of its event id, in 7 base36 characters and
 * a space. Hashing the whole id spreads ids that share a prefix, such as UUIDv7's timestamp.
 */
export function pingMark(eventId: string): string {
	let h = 0x811c9dc5
	for (let i = 0; i < eventId.length; i++) h = Math.imul(h ^ eventId.charCodeAt(i), 0x01000193)
	return (h >>> 0).toString(36).padStart(MARK - 1, '0') + ' '
}

/**
 * The two statements that add an engagement beacon to its pageview's row, in this order:
 *
 * 1. The visit's update: the time, `last_at` (which keeps the visit open), and the visitor's
 *    id after 00:00 UTC. The visit is the visitor's open one, which may be another tab's than
 *    the pageview's own: the one assignSessions found, or when it found none or that one is
 *    gone (another batch opened the visit first), the visitor's open visit that had started by
 *    the beacon's time, found when the statement runs. It runs only while the pageview is on the
 *    shard and doesn't hold this beacon yet, so it reads the row before statement 2 marks it.
 * 2. The pageview's update: it adds the engaged time, keeps the deepest scroll and the latest
 *    Web Vitals, appends each list of the beacon's `detail` to the row's, and marks the
 *    beacon in `pings`. It runs only when statement 1 changed the visit (`changes()`), and
 *    touches no indexed column, so it is one written row.
 *
 * Both check the mark, so a queue retry after a partial commit adds nothing twice, in any
 * order. The time and the lists add up and scroll depth is a maximum, so beacons of one view
 * may arrive in any order too. Both must run in one D1 batch, which is a transaction, one
 * right after the other.
 */
export function pingStmts(ev: EventRow): Stmt[] {
	if (!ev.view) return []
	// every mark ends in its only space, so instr() can only match a whole mark
	const token = pingMark(ev.event_id)
	const engaged = ev.engaged_ms ?? 0
	// ?1 view, ?2 site, ?3 token: the pageview, while it doesn't hold this beacon and has room for one more
	const fresh = `event_id = ?1 AND site_id = ?2 AND name = 'pageview' AND instr(COALESCE(pings, ''), ?3) = 0 AND COALESCE(length(pings), 0) < ${MAX_PINGS * MARK}`
	// ?6 the visitor's id, ?7 yesterday's in the first half hour of a UTC day, ?8 the oldest last_at of an open
	// visit, ?9 the visit assignSessions found for the beacon, or '' when it saw none
	// Only a visit found under yesterday's id can learn a new one, and setting an indexed column
	// costs D1 a written row even when it doesn't change, so the rest of the day leaves it out.
	const learn = ev.prev_visitor_id ? ', next_visitor_id = CASE WHEN visitor_id = ?6 OR next_visitor_id = ?6 THEN next_visitor_id ELSE ?6 END' : ''
	const visit: Stmt = {
		sql: `UPDATE sessions SET last_at = MAX(last_at, ?4), engaged_ms = engaged_ms + ?5${learn}
			WHERE site_id = ?2 AND session_id = COALESCE((SELECT session_id FROM sessions WHERE site_id = ?2 AND session_id = ?9), ${openVisitSql('?2', '?6', '?8', '?4')}, ${openVisitSql('?2', '?7', '?8', '?4')})
				AND EXISTS (SELECT 1 FROM events WHERE ${fresh})`,
		params: [ev.view, ev.site_id, token, ev.ts, engaged, ev.visitor_id, ev.prev_visitor_id ?? null, ev.ts - SESSION_GAP, ev.session_id ?? ''],
	}
	const params: unknown[] = [ev.view, ev.site_id, token, engaged]
	const at = (v: unknown) => `?${params.push(v)}`
	const set = [`engaged_ms = COALESCE(engaged_ms, 0) + ?4`, `pings = COALESCE(pings, '') || ?3`]
	if (ev.scroll_depth != null) {
		const d = at(ev.scroll_depth)
		set.push(`scroll_depth = COALESCE(MAX(scroll_depth, ${d}), ${d})`)
	}
	for (const k of ['lcp', 'inp', 'cls', 'fcp', 'ttfb'] as const) if (ev[k] != null) set.push(`${k} = ${at(ev[k])}`)
	if (ev.detail) {
		const keys = Object.keys(JSON.parse(ev.detail) as EventDetail).filter((k) => /^[a-z]$/.test(k))
		const d = at(ev.detail)
		// each list of the row, then the beacon's: reports sum them with json_each
		const append = keys.map((k) => `'$.${k}', json((SELECT json_group_array(json(value)) FROM (SELECT value FROM json_each(events.detail, '$.${k}') UNION ALL SELECT value FROM json_each(${d}, '$.${k}'))))`)
		if (append.length) set.push(`detail = CASE WHEN COALESCE(length(detail), 0) + length(${d}) > ${MAX_DETAIL} THEN detail ELSE json_set(COALESCE(detail, '{}'), ${append.join(', ')}) END`)
	}
	// changes() is still statement 1's: the beacon counts on the pageview only when it counted on its visit
	return [visit, { sql: `UPDATE events SET ${set.join(', ')} WHERE ${fresh} AND changes() > 0`, params }]
}

function pick<T extends object, K extends keyof T>(o: T, keys: readonly K[]): Pick<T, K> {
	const out = {} as Pick<T, K>
	for (const k of keys) out[k] = o[k]
	return out
}

export function insertEventStmt(ev: EventRow): Stmt {
	return {
		sql: `INSERT OR IGNORE INTO events (${EVENT_COLUMNS.join(', ')}) VALUES (${EVENT_COLUMNS.map(() => '?').join(', ')})`,
		params: EVENT_COLUMNS.map((c) => ev[c] ?? null),
	}
}

/**
 * The open visit of a visitor id when the statement runs: the one with the latest activity
 * within the gap, found through either index the way openSessionsStmt finds it. `site`,
 * `id` and `since` are parameter names, such as `?2`.
 */
function openVisitSql(site: string, id: string, since: string, at?: string): string {
	// a beacon belongs to a visit that had started by its time, not one a later event opened
	const started = at ? ` AND started_at <= ${at}` : ""
	return `(SELECT session_id FROM (
			SELECT session_id, last_at FROM sessions INDEXED BY sessions_site_visitor WHERE site_id = ${site} AND visitor_id = ${id} AND last_at >= ${since}${started}
			UNION ALL
			SELECT session_id, last_at FROM sessions INDEXED BY sessions_site_next_visitor WHERE site_id = ${site} AND next_visitor_id = ${id} AND last_at >= ${since}${started}
		) ORDER BY last_at DESC LIMIT 1)`
}

/**
 * A tracked event's insert, which joins the visit it finds when it runs: the visitor's open
 * visit under today's id, else under yesterday's (`prev_visitor_id`), else the one
 * assignSessions set (`session_id`), which the visit upsert then opens. A joined visit hands
 * the event its acquisition columns (INHERITED). Like insertEventStmt, a replayed event id
 * inserts nothing.
 */
export function insertInVisitStmt(ev: EventRow, opener = false): Stmt {
	const n = EVENT_COLUMNS.length
	const p = (c: (typeof EVENT_COLUMNS)[number]) => `?${EVENT_COLUMNS.indexOf(c) + 1}`
	const inherited = new Set<string>(INHERITED)
	// An opener that finds a visit another batch opened after its own time keeps its own: the
	// visit then takes them from it (upsertSessionStmt). Any other event takes the visit's.
	const own = opener ? `s.session_id IS NULL OR s.started_at > ${p('ts')}` : 's.session_id IS NULL'
	const exprs = EVENT_COLUMNS.map((c, i) => (c === 'session_id' ? 'v.sid' : inherited.has(c) ? `CASE WHEN ${own} THEN ?${i + 1} ELSE s.${c} END` : `?${i + 1}`))
	const site = p('site_id')
	const since = `?${n + 2}`
	return {
		sql: `INSERT OR IGNORE INTO events (${EVENT_COLUMNS.join(', ')}) SELECT ${exprs.join(', ')}
			FROM (SELECT COALESCE(${openVisitSql(site, p('visitor_id'), since)}, ${openVisitSql(site, `?${n + 1}`, since)}, ${p('session_id')}) AS sid) AS v
			LEFT JOIN sessions AS s ON s.site_id = ${site} AND s.session_id = v.sid`,
		params: [...EVENT_COLUMNS.map((c) => ev[c] ?? null), ev.prev_visitor_id ?? null, ev.ts - SESSION_GAP],
	}
}

/**
 * Stored events' visits and acquisition columns, as their inserts found them. At most 90 ids.
 * Without the hint SQLite seeks `events_site_ts` on `site_id` and reads every event of the site.
 */
export function storedVisitsStmt(siteId: string, eventIds: string[]): Stmt {
	return {
		sql: `SELECT event_id, session_id, ${INHERITED.join(', ')} FROM events INDEXED BY events_event_id WHERE site_id = ? AND event_id IN (${eventIds.map(() => '?').join(', ')})`,
		params: [siteId, ...eventIds],
	}
}

/** The visit's insert or update for a stored event: a pageview or a custom event. */
export function upsertSessionStmt(ev: EventRow, opener = false): Stmt {
	const pv = ev.name === 'pageview' ? 1 : 0
	// `events` counts the interactive custom events, which is all bounce rate needs.
	const custom = !pv && ev.interactive !== false ? 1 : 0
	const cols = ['site_id', 'session_id', 'visitor_id', 'started_at', 'last_at', 'entry_path', 'exit_path', 'pageviews', 'events', 'duration_ms', ...SESSION_ATTRS]
	// the visit is the one the insert stored on the event's row (insertInVisitStmt)
	const exprs = cols.map((c, i) => (c === 'session_id' ? 'e.session_id' : `?${i + 1}`))
	const values = [ev.site_id, null, ev.visitor_id, ev.ts, ev.ts, ev.pathname, ev.pathname, pv, custom, 0, ...SESSION_ATTRS.map((c) => ev[c] ?? null), ev.event_id]
	// Visit duration is the time from the first to the last pageview or custom event.
	// Engagement beacons keep the visit open but don't stretch it (pingStmts).
	// An opener that finds its visit opened by another consumer's batch at a later time becomes
	// the visit's start: its entry page and where the visit came from. Only an opener's upsert
	// sets started_at, which is indexed: setting it costs D1 a written row even unchanged, and
	// an opener's upsert reaches this update only in that race.
	const earlier = 'excluded.started_at < sessions.started_at'
	const start = opener
		? [
				`duration_ms = CASE WHEN ${earlier} THEN sessions.duration_ms + sessions.started_at - excluded.started_at ELSE MAX(sessions.duration_ms, ABS(excluded.last_at - sessions.started_at)) END`,
				'started_at = MIN(sessions.started_at, excluded.started_at)',
				`entry_path = CASE WHEN ${earlier} THEN excluded.entry_path ELSE sessions.entry_path END`,
				...SESSION_ATTRS.map((c) => `${c} = CASE WHEN ${earlier} THEN excluded.${c} ELSE sessions.${c} END`),
			]
		: ['duration_ms = MAX(sessions.duration_ms, ABS(excluded.last_at - sessions.started_at))']
	return {
		// Runs right after insertInVisitStmt for the same event: changes() is 0 when that
		// insert was a replayed duplicate, and then the visit isn't counted twice.
		sql: `INSERT INTO sessions (${cols.join(', ')}) SELECT ${exprs.join(', ')} FROM events AS e WHERE e.event_id = ?${values.length} AND e.site_id = ?1 AND changes() > 0
			ON CONFLICT (site_id, session_id) DO UPDATE SET
				next_visitor_id = CASE WHEN excluded.visitor_id <> sessions.visitor_id THEN excluded.visitor_id ELSE sessions.next_visitor_id END,
				exit_path = CASE WHEN excluded.pageviews > 0 AND excluded.last_at >= sessions.last_at THEN excluded.exit_path ELSE sessions.exit_path END,
				last_at = MAX(sessions.last_at, excluded.last_at),
				pageviews = sessions.pageviews + excluded.pageviews,
				events = sessions.events + excluded.events,
				${start.join(',\n\t\t\t\t')}`,
		params: values,
	}
}
