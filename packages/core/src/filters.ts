import type { Filter, FilterOp } from './types'

/**
 * Every property the dashboard, API and MCP can break down or filter by.
 * `session` dimensions live on both tables (copied onto each event at ingest),
 * `event` dimensions only on `events`, `entry`/`exit` only on `sessions`.
 */
export const DIMENSIONS = {
	page: { col: 'pathname', scope: 'event', label: 'Page' },
	entry_page: { col: 'entry_path', scope: 'entry', label: 'Entry page' },
	exit_page: { col: 'exit_path', scope: 'entry', label: 'Exit page' },
	hostname: { col: 'hostname', scope: 'session', label: 'Hostname' },
	event: { col: 'name', scope: 'event', label: 'Event' },
	source: { col: 'source', scope: 'session', label: 'Source' },
	referrer: { col: 'referrer_host', scope: 'session', label: 'Referrer' },
	channel: { col: 'channel', scope: 'session', label: 'Channel' },
	utm_source: { col: 'utm_source', scope: 'session', label: 'UTM source' },
	utm_medium: { col: 'utm_medium', scope: 'session', label: 'UTM medium' },
	utm_campaign: { col: 'utm_campaign', scope: 'session', label: 'UTM campaign' },
	utm_term: { col: 'utm_term', scope: 'session', label: 'UTM term' },
	utm_content: { col: 'utm_content', scope: 'session', label: 'UTM content' },
	country: { col: 'country', scope: 'session', label: 'Country' },
	region: { col: 'region', scope: 'session', label: 'Region' },
	city: { col: 'city', scope: 'session', label: 'City' },
	continent: { col: 'continent', scope: 'session', label: 'Continent' },
	timezone: { col: 'timezone', scope: 'session', label: 'Timezone' },
	network: { col: 'asn_org', scope: 'session', label: 'Network' },
	browser: { col: 'browser', scope: 'session', label: 'Browser' },
	browser_version: { col: "browser || ' ' || COALESCE(browser_version, '')", scope: 'session', label: 'Browser version' },
	os: { col: 'os', scope: 'session', label: 'OS' },
	os_version: { col: "os || ' ' || COALESCE(os_version, '')", scope: 'session', label: 'OS version' },
	device: { col: 'device', scope: 'session', label: 'Device' },
	screen: { col: 'screen', scope: 'session', label: 'Screen' },
	language: { col: 'language', scope: 'session', label: 'Language' },
} as const

export type Dimension = keyof typeof DIMENSIONS | `prop:${string}`
export type DimScope = 'event' | 'session' | 'entry'

const PROP_KEY = /^[A-Za-z0-9_.-]{1,64}$/

export function isDimension(d: string): d is Dimension {
	return Object.hasOwn(DIMENSIONS, d) || (d.startsWith('prop:') && PROP_KEY.test(d.slice(5)))
}

export function dimInfo(d: string): { col: string; scope: DimScope; label: string } {
	if (d.startsWith('prop:')) {
		const key = d.slice(5)
		if (!PROP_KEY.test(key)) throw new QueryError(`invalid property key: ${key}`)
		return { col: `json_extract(props, '$."${key}"')`, scope: 'event', label: key }
	}
	if (!Object.hasOwn(DIMENSIONS, d)) throw new QueryError(`unknown dimension: ${d}`)
	return (DIMENSIONS as Record<string, { col: string; scope: DimScope; label: string }>)[d]
}

export class QueryError extends Error {
	status = 400
}

// Two-character operators first, so `!~` is not read as `~` at the same position.
const OPS: FilterOp[] = ['!=', '==', '!~', '~']
export const MAX_FILTERS = 8
export const MAX_VALUES = 6
export const MAX_TOTAL_VALUES = 16

/** Parses `country==US|CA;page~/blog;browser!=Safari`. */
export function parseFilters(input: string | null | undefined): Filter[] {
	if (!input) return []
	const out: Filter[] = []
	for (const part of input.split(';')) {
		if (!part.trim()) continue
		// the first operator in the text wins (values may contain ==, != or ~); at the same
		// spot the two-character one does, so != isn't read as ~ or =
		const at = OPS.map((o) => ({ o, i: part.indexOf(o) }))
			.filter((m) => m.i >= 0)
			.sort((a, b) => a.i - b.i || b.o.length - a.o.length)[0]
		if (!at) throw new QueryError(`bad filter: ${part}`)
		const op = at.o
		const idx = at.i
		const dim = part.slice(0, idx).trim()
		if (!isDimension(dim) && dim !== 'goal') throw new QueryError(`unknown filter dimension: ${dim}`)
		const values = part
			.slice(idx + op.length)
			.split('|')
			.map((v) => v.trim())
			.filter((v) => v.length > 0)
			.slice(0, MAX_VALUES)
		if (!values.length) throw new QueryError(`filter has no value: ${part}`)
		out.push({ dim, op, values })
	}
	if (out.length > MAX_FILTERS) throw new QueryError(`at most ${MAX_FILTERS} filters`)
	// D1 binds at most 100 parameters per statement and some queries repeat the scope.
	if (out.reduce((n, f) => n + f.values.length, 0) > MAX_TOTAL_VALUES) {
		throw new QueryError(`at most ${MAX_TOTAL_VALUES} filter values in total`)
	}
	return out
}

export function serializeFilters(filters: Filter[]): string {
	return filters.map((f) => `${f.dim}${f.op}${f.values.join('|')}`).join(';')
}

export function likeEscape(v: string): string {
	return v.replace(/[\\%_]/g, (c) => '\\' + c)
}

/** One SQL predicate for one filter against `alias`. */
export function predicate(f: Filter, alias: string, params: unknown[]): string {
	const expr = dimExpr(f.dim, alias)
	const parts = f.values.map((v) => {
		if (v === '(none)') {
			return f.op.startsWith('!') ? `(${expr} IS NOT NULL AND ${expr} <> '')` : `(${expr} IS NULL OR ${expr} = '')`
		}
		if (f.op === '~' || f.op === '!~') {
			params.push(`%${likeEscape(v)}%`)
			return `${expr} ${f.op === '~' ? 'LIKE' : 'NOT LIKE'} ? ESCAPE '\\'`
		}
		if (v.includes('*')) {
			params.push(likeEscape(v).replace(/\*/g, '%'))
			return `${expr} ${f.op === '==' ? 'LIKE' : 'NOT LIKE'} ? ESCAPE '\\'`
		}
		params.push(v)
		return `${expr} ${f.op === '==' ? '=' : '<>'} ?`
	})
	// Positive filters match any value; negative filters must exclude all of them.
	const joiner = f.op.startsWith('!') ? ' AND ' : ' OR '
	const body = parts.length === 1 ? parts[0] : `(${parts.join(joiner)})`
	// A negative filter keeps rows with no value, unless it excludes `(none)` itself.
	return f.op.startsWith('!') && !f.values.includes('(none)') ? `(${body} OR ${expr} IS NULL)` : body
}

/** A dimension's SQL expression against `alias`. */
export function dimExpr(d: string, alias: string): string {
	// Property keys go into the JSON path as they are; qualify() would rewrite words in them.
	if (d.startsWith('prop:')) return `json_extract(${alias ? `${alias}.` : ''}props, '$."${dimInfo(d).label}"')`
	return qualify(dimInfo(d).col, alias)
}

/** Prefixes bare column names in a dimension expression with a table alias. */
export function qualify(col: string, alias: string): string {
	if (!alias) return col
	return col.replace(/\b(pathname|entry_path|exit_path|hostname|name|source|referrer_host|channel|utm_\w+|country|region|city|continent|timezone|asn_org|browser_version|browser|os_version|os|device|screen|language|props)\b(?!['"])/g, `${alias}.$1`)
}
