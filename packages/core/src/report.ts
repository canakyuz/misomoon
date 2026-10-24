import type { Aggregate } from './types'

/**
 * Email reports in the Miso Print look, laid out as a small newspaper: a front page with
 * the masthead, the headline and the markets table, inside pages with one section each,
 * and a back page printed in ink with the scoreboard and the almanac. Every headline and
 * figure comes from the numbers. Email clients drop <style>, SVG and gradients, so it is
 * inline styles on tables, and the chart is table cells.
 */

export interface ReportRow {
	key: string
	visitors: number
	/** in the site's currency; sources only */
	revenue?: number
	/** percent against the previous period; null when the previous period had none */
	change?: number | null
	/** goals only */
	conversion_rate?: number
}

export interface ReportDay {
	/** YYYY-MM-DD in the site's timezone */
	date: string
	visitors: number
	/** the same day of the previous period */
	previous?: number
}

export interface ReportData {
	site: { name: string; domain: string }
	/** "Weekly" or "Monthly" */
	kind: string
	label: string
	/** the issue line, such as "Week 42, 2026" */
	edition?: string
	/** YYYY-MM-DD the edition goes out, and the next one */
	issued?: string
	next?: string
	/** ISO 4217; revenue is counted in this currency only */
	currency?: string
	/** absolute URLs of the misomoon logo (mark and wordmark) as PNG, since email clients drop SVG: for paper and for ink */
	logo?: { light: string; dark: string }
	current: Aggregate
	previous: Aggregate | null
	/** one entry per day of the period */
	days?: ReportDay[]
	pages: ReportRow[]
	sources: ReportRow[]
	countries?: ReportRow[]
	devices?: ReportRow[]
	goals: ReportRow[]
	link: string
}

const INK = '#17140f'
const PAPER = '#efe8d9'
const SHEET = '#fbf7ee'
const RECEIPT = '#fffdf8'
const NEWSPRINT = '#f2ecdf'
const TEXT_2 = '#474035'
const TEXT_3 = '#6e6556'
const ON_INK_3 = '#b3a995'
const RULE = '#d9d0bd'
const ON_INK_RULE = '#4a4337'
const MISO = '#e8461a'
const MISO_TINT = '#f5c4b0'
const GOOD = '#0b7a4b'
const BAD = '#c9370e'
const HIGHLIGHT = '#ffd23f'
const SANS = "Archivo,'Helvetica Neue',Arial,sans-serif"
const NARROW = "Archivo,'Arial Narrow','Helvetica Neue',Arial,sans-serif"
const MONO = "'Martian Mono',Menlo,Consolas,monospace"

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const fmt = new Intl.NumberFormat('en')
const dur = (s: number) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`)
/** keeps long paths from widening the table: email clients ignore text-overflow */
const clip = (s: string, n = 44) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const share = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0)

function money(amount: number, currency = 'USD'): string {
	try {
		return new Intl.NumberFormat('en', { style: 'currency', currency }).format(amount)
	} catch {
		return `${fmt.format(amount)} ${currency}`
	}
}

/** Money without cents once it reaches the thousands (or always, for tables that line up). */
function roundMoney(amount: number, currency = 'USD', whole = amount >= 1000): string {
	try {
		return new Intl.NumberFormat('en', { style: 'currency', currency, minimumFractionDigits: whole ? 0 : undefined, maximumFractionDigits: whole ? 0 : 2 }).format(amount)
	} catch {
		return money(amount, currency)
	}
}

let regions: Intl.DisplayNames | null | undefined
function countryName(code: string): string {
	if (!code || code === '(none)' || code === 'XX') return 'Unknown'
	if (code === 'T1') return 'Tor network'
	try {
		regions ??= new Intl.DisplayNames(['en'], { type: 'region' })
		return regions.of(code) ?? code
	} catch {
		regions = null
		return code
	}
}

function flag(code: string): string {
	if (!/^[A-Z]{2}$/.test(code) || code === 'XX' || code === 'T1') return ''
	return String.fromCodePoint(...[...code].map((c) => 0x1f1a5 + c.charCodeAt(0))) + ' '
}

/** Whole percent change, or null when there is nothing to compare with. */
export function percentChange(cur: number, prev: number | undefined | null): number | null {
	if (prev == null || !prev) return null
	return Math.round(((cur - prev) / prev) * 100)
}

/** Bounce rate moves in percentage points, like the dashboard shows it. */
const points = (cur: number, prev: number | undefined) => (prev == null ? null : Math.round(cur - prev))

function changeText(d: number | null, unit = '%'): string {
	return d == null ? '' : ` (${d > 0 ? '+' : ''}${d}${unit})`
}

/** A change printed as a small stamp: leaf when it went the good way, red when not. */
function stamp(d: number | null, unit = '%', inverse = false): string {
	if (d == null) return ''
	const tone = !d ? TEXT_3 : (inverse ? d < 0 : d > 0) ? GOOD : BAD
	return `<span style="display:inline-block;font:600 11px/1 ${MONO};color:${tone};border:1px solid ${tone};padding:3px 5px">${!d ? '±0' : `${d > 0 ? '+' : ''}${d}`}${unit}</span>`
}

/** A change for the markets table: an arrow and the size, coloured the good or bad way. */
function arrow(d: number | null, unit = '%', inverse = false): string {
	if (d == null) return `<span style="color:${TEXT_3}">new</span>`
	if (!d) return `<span style="color:${TEXT_3}">±0${unit}</span>`
	const good = inverse ? d < 0 : d > 0
	return `<span style="color:${good ? GOOD : BAD}">${d > 0 ? '▲' : '▼'}&nbsp;${Math.abs(d)}${unit}</span>`
}

const utc = (date: string) => new Date(`${date}T00:00:00Z`)
const weekday = (date: string, style: 'long' | 'short' = 'long') => utc(date).toLocaleDateString('en', { weekday: style, timeZone: 'UTC' })
const dayMonth = (date: string) => utc(date).toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const longDate = (date: string) => utc(date).toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const shortDate = (date: string) => utc(date).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })

const spanOf = (d: ReportData): 'week' | 'month' => (d.kind.toLowerCase() === 'monthly' ? 'month' : 'week')
const named = (d: ReportData, date: string) => (spanOf(d) === 'week' ? weekday(date) : dayMonth(date))

function busiest(days: ReportDay[] | undefined): ReportDay | null {
	if (!days || days.length < 2) return null
	const top = days.reduce((a, b) => (b.visitors > a.visitors ? b : a))
	return top.visitors > 0 ? top : null
}

function quietest(days: ReportDay[] | undefined): ReportDay | null {
	if (!days || days.length < 2 || !busiest(days)) return null
	return days.reduce((a, b) => (b.visitors < a.visitors ? b : a))
}

const realKey = (r: ReportRow | undefined) => (r && r.key !== '(none)' ? r : undefined)
/** A path in a sentence: "/" reads as the home page. */
const pageName = (path: string) => (path === '/' ? 'the home page' : path)

/** The front page story in a sentence or three, from the numbers only. */
export function lede(d: ReportData): string[] {
	const c = d.current
	const span = spanOf(d)
	if (!c.visitors) return [`Nobody visited ${d.site.domain} this ${span}.`, "If that's a surprise, check that the snippet is still on the site."]
	const people = c.visitors === 1 ? '1 person' : `${fmt.format(c.visitors)} people`
	const d1 = percentChange(c.visitors, d.previous?.visitors)
	const vs = d1 == null ? '' : d1 === 0 ? `, the same as the ${span} before` : `, ${Math.abs(d1)}% ${d1 > 0 ? 'more' : 'fewer'} than the ${span} before`
	const parts = [`${people} visited ${d.site.domain}${vs}.`]
	const src = realKey(d.sources[0])?.key
	const top = busiest(d.days)
	const when = top ? named(d, top.date) : ''
	const from = src ? (src === 'Direct' ? 'Most came in directly' : `Most came from ${src}`) : ''
	if (from && when) parts.push(`${from}, and ${when} was the busiest day.`)
	else if (from) parts.push(`${from}.`)
	else if (when) parts.push(`${when} was the busiest day.`)
	if (c.revenue > 0) parts.push(`Together they paid ${money(c.revenue, d.currency)}.`)
	return parts
}

/** The front page headline: the biggest move of the period, or its size when nothing moved much. */
export function headline(d: ReportData): string {
	const c = d.current
	const span = spanOf(d)
	if (!c.visitors) return `A quiet ${span}`
	const v = percentChange(c.visitors, d.previous?.visitors)
	if (v != null && v >= 10) return `Visitors up ${v}%`
	if (v != null && v <= -10) return `Visitors down ${-v}%`
	if (c.revenue > 0) return `${roundMoney(c.revenue, d.currency)} in revenue`
	return `${fmt.format(c.visitors)} ${c.visitors === 1 ? 'visitor' : 'visitors'} this ${span}`
}

// ---------------------------------------------------------------- printed parts

function heading(title: string, note = '', ink = false): string {
	const fg = ink ? NEWSPRINT : INK
	return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:26px 0 4px"><tr>
<td style="font:800 13px/1 ${NARROW};letter-spacing:.08em;text-transform:uppercase;color:${fg};padding-bottom:7px;border-bottom:2px solid ${fg}">${esc(title)}</td>
<td class="mm-hide" align="right" style="font:11px/1 ${MONO};color:${ink ? ON_INK_3 : TEXT_3};padding-bottom:7px;border-bottom:2px solid ${fg}">${note}</td>
</tr></table>`
}

/** A section's headline and deck, at the top of an inside page. */
function story(title: string, deck: string, ink = false): string {
	return `<h2 class="mm-h2" style="font:800 30px/1.02 ${NARROW};letter-spacing:-.015em;text-transform:uppercase;color:${ink ? NEWSPRINT : INK};margin:14px 0 8px">${esc(title)}</h2>
<p style="font:15px/1.5 ${SANS};color:${ink ? NEWSPRINT : TEXT_2};margin:0">${esc(deck)}</p>`
}

/** A row with dotted leaders between the name and the value, like a receipt or a scoreboard. */
function leader(k: string, v: string, o: { strong?: boolean; ink?: boolean; size?: number } = {}): string {
	const fg = o.ink ? NEWSPRINT : INK
	const size = o.size ?? 12
	const weight = o.strong ? 700 : 400
	return `<tr><td style="font:${weight} ${size}px/1.3 ${MONO};color:${fg};padding:5px 0;white-space:nowrap">${k}</td>
<td width="100%" style="padding:0 6px"><div style="border-bottom:2px dotted ${o.ink ? ON_INK_RULE : RULE};height:${Math.round(size * 0.75)}px;font-size:0;line-height:0">&nbsp;</div></td>
<td align="right" style="font:${weight} ${size}px/1.3 ${MONO};color:${fg};padding:5px 0;white-space:nowrap">${v}</td></tr>`
}

/**
 * Phones: Gmail, Apple Mail and iOS Mail apply media queries, so narrow screens get one
 * column and smaller type. Clients that drop <style> keep the inline layout.
 */
const PHONE = `<style>@media (max-width:480px){
.mm-outer{padding:16px 6px 4px!important}
.mm-pad{padding:16px 14px 20px!important}
.mm-mast{font-size:30px!important}
.mm-h1{font-size:32px!important}
.mm-h2{font-size:24px!important}
.mm-stack{display:block!important;width:100%!important;padding-left:0!important;padding-right:0!important;border-left:0!important}
.mm-hide{display:none!important}
.mm-wrap{white-space:normal!important}
}</style>`

const CHART_H = 110

/**
 * Visitors per day as table-cell bars, the front page's picture. The previous period is
 * a dashed ink tick at its height, so both periods share one column per day.
 */
function chart(days: ReportDay[], span: 'week' | 'month'): string {
	if (days.length < 2) return ''
	const max = Math.max(1, ...days.map((d) => Math.max(d.visitors, d.previous ?? 0)))
	const top = busiest(days)
	const gap = days.length > 14 ? 1 : 4
	const px = (v: number) => Math.round((v / max) * CHART_H)
	const bar = (h: number) => (h > 0 ? `<div style="height:${h}px;background:${MISO};font-size:0;line-height:0">&nbsp;</div>` : '')
	const tick = `<div style="height:0;border-top:2px dashed ${INK};font-size:0;line-height:0">&nbsp;</div>`
	const cols = days
		.map((d) => {
			const h = px(d.visitors)
			const ph = d.previous == null ? -1 : px(d.previous)
			let body: string
			if (ph <= 0) body = bar(h)
			else if (ph > h) body = `${tick}<div style="height:${Math.max(ph - h - 2, 0)}px;font-size:0;line-height:0">&nbsp;</div>${bar(h)}`
			else body = `${bar(h - ph)}${tick}${bar(Math.max(ph - 2, 0))}`
			const label = top && d.date === top.date ? `<div style="font:700 10px/1 ${MONO};color:${INK};text-align:center;padding-bottom:4px;white-space:nowrap">${fmt.format(d.visitors)}</div>` : ''
			return `<td valign="bottom" style="height:${CHART_H + 14}px;padding:0 ${gap}px">${label}${body}</td>`
		})
		.join('')
	const labels = days
		.map((d, i) => {
			const n = Number(d.date.slice(8))
			const text = span === 'week' ? weekday(d.date, 'short').slice(0, 1) : i === 0 || n % 7 === 1 ? String(n) : ''
			return `<td align="center" style="font:10px/1 ${MONO};color:${TEXT_3};padding:6px 0 0">${text}</td>`
		})
		.join('')
	return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="table-layout:fixed;border-bottom:2px solid ${INK}"><tr>${cols}</tr></table>
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="table-layout:fixed"><tr>${labels}</tr></table>`
}

/** The front page's markets table: this period, the one before, and the move, like stock listings. */
function markets(d: ReportData): string {
	const c = d.current
	const p = d.previous ?? undefined
	const cur = d.currency ?? 'USD'
	const rows: [string, string, string, string][] = [
		['Visitors', fmt.format(c.visitors), p ? fmt.format(p.visitors) : '–', arrow(percentChange(c.visitors, p?.visitors))],
		['Visits', fmt.format(c.visits), p ? fmt.format(p.visits) : '–', arrow(percentChange(c.visits, p?.visits))],
		['Pageviews', fmt.format(c.pageviews), p ? fmt.format(p.pageviews) : '–', arrow(percentChange(c.pageviews, p?.pageviews))],
		['Views per visit', String(c.views_per_visit), p ? String(p.views_per_visit) : '–', arrow(percentChange(c.views_per_visit, p?.views_per_visit))],
		['Bounce rate', `${c.bounce_rate}%`, p ? `${p.bounce_rate}%` : '–', arrow(points(c.bounce_rate, p?.bounce_rate), ' pts', true)],
		['Visit duration', dur(c.visit_duration), p ? dur(p.visit_duration) : '–', arrow(percentChange(c.visit_duration, p?.visit_duration))],
	]
	if (c.revenue > 0 || (p && p.revenue > 0)) rows.push(['Revenue', roundMoney(c.revenue, cur, true), p ? roundMoney(p.revenue, cur, true) : '–', arrow(percentChange(c.revenue, p?.revenue))])
	const cell = (v: string, align: string, extra = '') => `<td align="${align}" style="font:12px/1.3 ${MONO};color:${INK};padding:7px 0;border-bottom:1px solid ${RULE};white-space:nowrap${extra}">${v}</td>`
	const head = (v: string, align: string) => `<td align="${align}" style="font:600 10px/1 ${MONO};letter-spacing:.06em;text-transform:uppercase;color:${TEXT_3};padding:8px 0 6px">${v}</td>`
	const span = spanOf(d)
	return `${heading('Markets', `this ${span} against the ${span} before`)}
<table width="100%" cellpadding="0" cellspacing="0" role="presentation">
<tr>${head('', 'left')}${head(`This ${span}`, 'right')}${head('Before', 'right')}${head('Move', 'right')}</tr>
${rows.map(([k, a, b, m]) => `<tr>${cell(esc(k), 'left', `;font-family:${SANS};font-size:13px`)}${cell(esc(a), 'right', ';font-weight:700')}${cell(esc(b), 'right', `;color:${TEXT_3}`)}${cell(m, 'right')}</tr>`).join('\n')}
</table>`
}

/** A ranked list: name, share, count, and a bar printed under the row. */
function list(title: string, rows: ReportRow[], opts: { total?: number; label?: (k: string) => string; note?: string; extra?: (r: ReportRow) => string } = {}): string {
	if (!rows.length) return ''
	const max = Math.max(1, ...rows.map((r) => r.visitors))
	const body = rows
		.map((r) => {
			const part = opts.total ? `${share(r.visitors, opts.total)}%` : ''
			const extra = opts.extra?.(r) ?? ''
			const width = Math.max(1, Math.round((r.visitors / max) * 100))
			return `<tr><td style="padding:9px 0 0;font:14px/1.3 ${SANS};color:${INK}">${esc(clip(opts.label ? opts.label(r.key) : r.key))}</td>
<td align="right" style="padding:9px 0 0;font:12px/1.3 ${MONO};color:${INK};white-space:nowrap">${extra}${part ? `<span style="color:${TEXT_3}">${part}</span>&nbsp;&nbsp;` : ''}${fmt.format(r.visitors)}</td></tr>
<tr><td colspan="2" style="padding:5px 0 0;border-bottom:1px solid ${RULE}"><div style="width:${width}%;height:5px;background:${MISO_TINT};border-right:2px solid ${MISO};font-size:0;line-height:0;margin-bottom:8px">&nbsp;</div></td></tr>`
		})
		.join('\n')
	return `${heading(title, opts.note ?? 'visitors')}
<table width="100%" cellpadding="0" cellspacing="0" role="presentation">${body}</table>`
}

function sideBySide(left: string, right: string): string {
	if (!left || !right) return left || right
	return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
<td class="mm-stack" width="50%" valign="top" style="padding-right:12px">${left}</td>
<td class="mm-stack" width="50%" valign="top" style="padding-left:12px">${right}</td>
</tr></table>`
}

// ---------------------------------------------------------------- pages

interface Page {
	/** the section name in the running head, such as "Business" */
	section: string
	/** what the front page's index lists for this page */
	contents: string[]
	body: string
	text: string[]
}

/** Revenue: a printed receipt with dotted leaders. Only when the site took payments. */
function businessPage(d: ReportData): Page | null {
	const c = d.current
	const p = d.previous ?? undefined
	if (!(c.revenue > 0) && !(p && p.revenue > 0)) return null
	const cur = d.currency ?? 'USD'
	const span = spanOf(d)
	const paying = d.sources.filter((s) => (s.revenue ?? 0) > 0).sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0)).slice(0, 4)
	const perVisitor = c.visitors ? Math.round((c.revenue / c.visitors) * 100) / 100 : 0
	const move = percentChange(c.revenue, p?.revenue)
	const deck = [
		move == null ? `No revenue the ${span} before.` : move === 0 ? `The same as the ${span} before.` : `${move > 0 ? 'Up' : 'Down'} ${Math.abs(move)}% on the ${span} before.`,
		paying[0] ? `${paying[0].key} paid the most: ${money(paying[0].revenue!, cur)}.` : '',
	]
		.filter(Boolean)
		.join(' ')
	const caption = (t: string) => `<tr><td colspan="3" style="font:600 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:${TEXT_3};padding:14px 0 4px">${t}</td></tr>`
	const body = `${story(`${roundMoney(c.revenue, cur)} in revenue`, deck)}
${heading('Revenue', esc(cur))}
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:14px"><tr><td style="background:${RECEIPT};border:1.5px solid ${INK};border-top:2px dashed ${INK};border-bottom:2px dashed ${INK};padding:16px 20px">
<div style="font:800 34px/1 ${NARROW};color:${INK};letter-spacing:-.01em">${esc(money(c.revenue, cur))}</div>
<div style="margin:8px 0 6px;line-height:1">${stamp(move) || '&nbsp;'}</div>
<table width="100%" cellpadding="0" cellspacing="0" role="presentation">
${leader('Average payment', esc(money(c.average_revenue, cur)))}
${leader('Revenue per visitor', esc(money(perVisitor, cur)))}
${p ? leader('Period before', esc(money(p.revenue, cur))) : ''}
${paying.length ? caption('Top paying sources') + paying.map((s) => leader(esc(clip(s.key, 26)), esc(money(s.revenue!, cur)))).join('') : ''}
<tr><td colspan="3" style="padding-top:8px;border-bottom:3px double ${INK};font-size:0;line-height:0">&nbsp;</td></tr>
${leader('Total', esc(money(c.revenue, cur)), { strong: true })}
</table>
<div style="font:10.5px/1.5 ${MONO};color:${TEXT_3};margin-top:10px">Counted in ${esc(cur)}. Payments in other currencies are left out.</div>
</td></tr></table>`
	return {
		section: 'Business',
		contents: ['Revenue'],
		body,
		text: [`Total: ${money(c.revenue, cur)}${changeText(move)}`, `Average payment: ${money(c.average_revenue, cur)}`, `Revenue per visitor: ${money(perVisitor, cur)}`, ...paying.map((s) => `  ${s.key}  ${money(s.revenue!, cur)}`)],
	}
}

/** Where visitors came from and what they read. */
function arrivalsPage(d: ReportData): Page | null {
	const sources = d.sources.slice(0, 5)
	if (!sources.length && !d.pages.length) return null
	const c = d.current
	const span = spanOf(d)
	const top = realKey(sources[0])
	// the fastest riser among sources that sent a real share of the visitors
	const riser = sources.filter((s) => s.change != null && s.change > 0 && share(s.visitors, c.visitors) >= 5).sort((a, b) => b.change! - a.change!)[0]
	const title = !top ? 'Where they came from' : top.key === 'Direct' ? 'Most came in directly' : `${top.key} sent the most`
	const deck = [
		top ? `${fmt.format(top.visitors)} visitors, ${share(top.visitors, c.visitors)}% of the ${span}.` : '',
		riser && riser.key !== top?.key ? `${riser.key} grew fastest, up ${riser.change}%.` : '',
		realKey(d.pages[0]) ? `The most read page was ${pageName(d.pages[0].key)}.` : '',
	]
		.filter(Boolean)
		.join(' ')
	const change = (r: ReportRow) => (r.change == null ? '' : `<span style="color:${r.change >= 0 ? GOOD : BAD}">${r.change > 0 ? '+' : ''}${r.change}%</span>&nbsp;&nbsp;`)
	return {
		section: 'Arrivals',
		contents: [sources.length ? 'Top sources' : '', d.pages.length ? 'Most read' : ''].filter(Boolean),
		body: `${story(title, deck)}
${list('Top sources', sources, { total: c.visitors, extra: change, note: d.previous ? `visitors, against the ${span} before` : 'visitors' })}
${list('Most read', d.pages)}`,
		text: [
			...(sources.length ? ['Top sources:', ...sources.map((r) => `  ${r.key}  ${fmt.format(r.visitors)}${changeText(r.change ?? null)}`)] : []),
			...(d.pages.length ? ['Most read:', ...d.pages.map((r) => `  ${r.key}  ${fmt.format(r.visitors)}`)] : []),
		],
	}
}

/** Countries and devices. */
function worldPage(d: ReportData): Page | null {
	const countries = d.countries ?? []
	const devices = d.devices ?? []
	if (!countries.length && !devices.length) return null
	const c = d.current
	const span = spanOf(d)
	const place = realKey(countries[0])
	const device = realKey(devices[0])
	const title = place ? `${countryName(place.key)} leads` : 'Who visited'
	const deck = [
		place ? `${fmt.format(place.visitors)} visitors, ${share(place.visitors, c.visitors)}% of the ${span}.` : '',
		countries.length > 1 ? `${countries.length} countries made the list.` : '',
		device ? `${share(device.visitors, c.visitors)}% were on ${device.key.toLowerCase()}.` : '',
	]
		.filter(Boolean)
		.join(' ')
	return {
		section: 'World',
		contents: [countries.length ? 'Countries' : '', devices.length ? 'Devices' : ''].filter(Boolean),
		body: `${story(title, deck)}
${sideBySide(list('Countries', countries, { total: c.visitors, label: (k) => `${flag(k)}${countryName(k)}` }), list('Devices', devices, { total: c.visitors }))}`,
		text: [
			...(countries.length ? ['Countries:', ...countries.map((r) => `  ${countryName(r.key)}  ${fmt.format(r.visitors)}`)] : []),
			...(devices.length ? ['Devices:', ...devices.map((r) => `  ${r.key}  ${fmt.format(r.visitors)}`)] : []),
		],
	}
}

/** The almanac's records: the period's bests and leaders. */
function records(d: ReportData): [string, string, string][] {
	const top = busiest(d.days)
	const low = quietest(d.days)
	const c = d.current
	const out: [string, string, string][] = []
	if (top) out.push(['Busiest day', named(d, top.date), `${fmt.format(top.visitors)} visitors`])
	if (low) out.push(['Quietest day', named(d, low.date), `${fmt.format(low.visitors)} visitors`])
	const page = realKey(d.pages[0])
	if (page) out.push(['Most read', page.key === '/' ? 'Home page' : clip(page.key, 22), `${fmt.format(page.visitors)} visitors`])
	const src = realKey(d.sources[0])
	if (src) out.push(['Top source', clip(src.key, 22), `${share(src.visitors, c.visitors)}% of visitors`])
	const place = realKey(d.countries?.[0])
	if (place) out.push(['Top country', countryName(place.key), `${share(place.visitors, c.visitors)}% of visitors`])
	const device = realKey(d.devices?.[0])
	if (device) out.push(['Top device', device.key, `${share(device.visitors, c.visitors)}% of visitors`])
	return out
}

/** The back page, printed in ink: the scoreboard (goals), the almanac, the way to the dashboard. */
function backPage(d: ReportData, number: number): { html: string; text: string[] } {
	const span = spanOf(d)
	const goals = d.goals.slice(0, 5)
	const recs = records(d)
	const scoreboard = goals.length
		? `${heading('Scoreboard', 'goals reached', true)}
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:6px">
${goals.map((g) => leader(esc(clip(g.key, 24)), `${g.conversion_rate != null ? `<span style="color:${ON_INK_3};font-weight:400">${g.conversion_rate}%</span>&nbsp;&nbsp;` : ''}${fmt.format(g.visitors)}`, { ink: true, strong: true, size: 14 })).join('\n')}
</table>`
		: ''
	const cells = recs.map(
		([k, v, note]) => `<td width="50%" valign="top" style="padding:12px 12px 12px 0;border-top:1px solid ${ON_INK_RULE}">
<div style="font:600 10px/1.2 ${MONO};letter-spacing:.08em;text-transform:uppercase;color:${MISO}">${esc(k)}</div>
<div style="font:800 19px/1.15 ${NARROW};color:${NEWSPRINT};margin-top:5px;text-transform:uppercase">${esc(v)}</div>
<div style="font:11px/1.3 ${MONO};color:${ON_INK_3};margin-top:4px">${esc(note)}</div></td>`,
	)
	const rows: string[] = []
	for (let i = 0; i < cells.length; i += 2) rows.push(`<tr>${cells[i]}${cells[i + 1] ?? '<td width="50%"></td>'}</tr>`)
	const almanac = recs.length ? `${heading('Almanac', `records of the ${span}`, true)}<table width="100%" cellpadding="0" cellspacing="0" role="presentation">${rows.join('\n')}</table>` : ''
	const next = d.next ? `The next edition comes out ${longDate(d.next)}.` : ''
	const lead = goals[0]
	const title = lead ? `${lead.key} leads the table` : `The ${span} in records`
	const deck = lead
		? `${fmt.format(lead.visitors)} ${lead.visitors === 1 ? 'visitor' : 'visitors'} reached it${lead.conversion_rate != null ? `, ${lead.conversion_rate}% of everyone who came` : ''}.${goals.length > 1 ? ` ${goals.length} goals on the board.` : ''}`
		: `The ${span}'s bests and leaders, from the busiest day to the top device.`
	// the back cover's advert, for the one thing this email can't do: open the reports
	const advert = `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:30px"><tr><td style="border:2px solid ${NEWSPRINT};padding:18px 20px">
<div style="font:600 10px/1 ${MONO};letter-spacing:.12em;text-transform:uppercase;color:${MISO}">In the dashboard</div>
<div style="font:800 24px/1.05 ${NARROW};text-transform:uppercase;color:${NEWSPRINT};margin:8px 0 6px">Every report behind this edition</div>
<div style="font:14px/1.5 ${SANS};color:${ON_INK_3};margin-bottom:14px">With filters, comparisons and the full lists.</div>
<a href="${esc(d.link)}" style="display:inline-block;background:${MISO};color:#ffffff;font:700 14px/1 ${SANS};text-decoration:none;padding:13px 18px;border:2px solid ${NEWSPRINT}">Open the dashboard</a>
</td></tr></table>`
	const html = `${runningHead(d, number, 'Back page', true)}
${story(title, deck, true)}
${scoreboard}
${almanac}
${advert}
<p style="font:11px/1.6 ${MONO};color:${ON_INK_3};margin:26px 0 0;padding-top:14px;border-top:3px double ${ON_INK_RULE}">Printed by misomoon for ${esc(d.site.domain)}. Cookieless counts: no personal data was used to make this edition.${next ? `<br>${esc(next)}` : ''}</p>
${d.logo ? `<div style="text-align:center;margin-top:26px;line-height:1"><img src="${esc(d.logo.dark)}" width="194" height="36" alt="misomoon" style="display:inline-block;width:194px;height:auto;border:0"></div>` : ''}`
	return {
		html,
		text: [
			...(goals.length ? ['Scoreboard:', ...goals.map((g) => `  ${g.key}  ${fmt.format(g.visitors)}${g.conversion_rate != null ? ` (${g.conversion_rate}%)` : ''}`)] : []),
			...(recs.length ? ['Almanac:', ...recs.map(([k, v, note]) => `  ${k}: ${v}, ${note}`)] : []),
			...(next ? ['', next] : []),
		],
	}
}

/** The line across the top of every page but the front: paper, issue, page. */
function runningHead(d: ReportData, number: number, section: string, ink = false): string {
	const fg = ink ? NEWSPRINT : INK
	return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
<td style="font:700 11px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:${MISO};padding-bottom:9px;border-bottom:1px solid ${fg}">${esc(section)}</td>
<td align="right" style="font:11px/1 ${MONO};color:${ink ? ON_INK_3 : TEXT_3};padding-bottom:9px;border-bottom:1px solid ${fg};white-space:nowrap"><span class="mm-hide">${esc(clip(d.site.name, 24))} · ${esc(d.edition ?? d.label)} · </span>Page ${number}</td>
</tr></table>`
}

/** One printed sheet: a card with an ink edge and an offset shadow. */
function sheet(inner: string, ink = false): string {
	return `<table width="560" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;max-width:560px;background:${ink ? INK : SHEET};border:2px solid ${INK};box-shadow:6px 6px 0 ${ink ? MISO : INK};margin:0 auto 28px">
<tr><td class="mm-pad" style="padding:22px 26px 26px">${inner}</td></tr></table>`
}

/** The line under the masthead: the misomoon logo and the edition, or the words when there is no logo. */
function publisher(d: ReportData): string {
	const kind = `<span style="font:600 10px/1 ${MONO};letter-spacing:.14em;text-transform:uppercase;color:${MISO};vertical-align:middle">${esc(d.kind.toLowerCase())}</span>`
	if (!d.logo) return `<div style="text-align:center;font:600 10px/1 ${MONO};letter-spacing:.14em;text-transform:uppercase;color:${MISO};margin-bottom:12px">the misomoon ${esc(d.kind.toLowerCase())}</div>`
	return `<div style="text-align:center;margin:2px 0 12px;line-height:1"><img src="${esc(d.logo.light)}" width="140" height="26" alt="misomoon" style="display:inline-block;width:140px;height:auto;border:0;vertical-align:middle">&nbsp;&nbsp;${kind}</div>`
}

/** The masthead's size follows the name's length, so a long site name still fits one line. */
const mastSize = (name: string) => (name.length <= 12 ? 50 : name.length <= 18 ? 40 : name.length <= 26 ? 30 : 24)

function frontPage(d: ReportData, index: [string, number | string][]): string {
	const told = lede(d)
	const span = spanOf(d)
	const ears = (left: string, right: string) => `<table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
<td width="50%" style="font:10.5px/1.4 ${MONO};color:${TEXT_2};padding:6px 8px;border:1px solid ${INK}">${left}</td>
<td width="12"></td>
<td width="50%" align="right" style="font:10.5px/1.4 ${MONO};color:${TEXT_2};padding:6px 8px;border:1px solid ${INK}">${right}</td>
</tr></table>`
	const left = `<b style="color:${INK}">${fmt.format(d.current.visitors)}</b> visitors this ${span}`
	const right = d.next ? `Next edition <b style="color:${INK}">${esc(shortDate(d.next))}</b>` : `<b style="color:${INK}">Free</b>, cookieless`
	const dateline = [d.edition ?? '', d.issued ? longDate(d.issued) : d.label, 'Free, cookieless'].filter(Boolean)
	const indexRows = index.map(([k, n]) => leader(esc(k), String(n), { size: 11 })).join('')
	const days = d.days ?? []
	const top = busiest(days)
	const picture = chart(days, span)
	const caption = picture
		? `<div style="font:10.5px/1.5 ${MONO};color:${TEXT_3};margin-top:8px">Fig. 1. Visitors per day, ${esc(d.label)}.${d.previous ? ` Dashed: the ${span} before.` : ''}${top ? ` Busiest: ${esc(named(d, top.date))}.` : ''}</div>`
		: ''
	return `${ears(left, right)}
<div class="mm-mast" style="text-align:center;font:800 ${mastSize(d.site.name)}px/1 ${NARROW};letter-spacing:-.02em;text-transform:uppercase;color:${INK};margin:16px 0 4px">${esc(d.site.name)}</div>
${publisher(d)}
<table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr><td align="center" style="font:11px/1.4 ${MONO};color:${TEXT_2};padding:7px 0;border-top:3px double ${INK};border-bottom:3px double ${INK}">${dateline.map(esc).join(' &nbsp;·&nbsp; ')}</td></tr></table>
<div style="font:600 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:${MISO};margin:20px 0 0">${esc(d.site.domain)} · ${esc(d.label)}</div>
<h1 class="mm-h1" style="font:800 44px/.98 ${NARROW};letter-spacing:-.02em;text-transform:uppercase;color:${INK};margin:8px 0 12px">${esc(headline(d))}</h1>
<p style="font:16px/1.5 ${SANS};color:${INK};margin:0 0 18px"><span style="background:${HIGHLIGHT};padding:0 3px">${esc(told[0])}</span>${told.length > 1 ? ` ${esc(told.slice(1).join(' '))}` : ''}</p>
<table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
${picture ? `<td class="mm-stack" valign="top" style="padding-right:16px;border-top:2px solid ${INK};padding-top:12px">${picture}${caption}</td>` : ''}
<td class="mm-stack" width="${picture ? '34%' : '100%'}" valign="top" style="border-top:2px solid ${INK};padding-top:12px${picture ? `;padding-left:14px;border-left:1px solid ${RULE}` : ''}">
<div style="font:800 13px/1 ${NARROW};letter-spacing:.08em;text-transform:uppercase;color:${INK};margin-bottom:6px">Inside</div>
<table width="100%" cellpadding="0" cellspacing="0" role="presentation">${indexRows}</table>
</td></tr></table>
${markets(d)}`
}

export function renderReport(d: ReportData): { subject: string; html: string; text: string } {
	const c = d.current
	const p = d.previous ?? undefined
	const cur = d.currency ?? 'USD'
	const told = lede(d)
	const subject = `${d.kind} report for ${d.site.name}: ${fmt.format(c.visitors)} visitors${c.revenue > 0 ? `, ${money(c.revenue, cur)}` : ''}`
	const inside = [businessPage(d), arrivalsPage(d), worldPage(d)].filter((x): x is Page => !!x)
	const back = inside.length + 2
	const index: [string, number | string][] = [
		...inside.flatMap((pg, i) => pg.contents.map((k): [string, number] => [k, i + 2])),
		...(d.goals.length ? [['Scoreboard', back] as [string, number]] : []),
		['Almanac', back],
	]
	const backCover = backPage(d, back)
	const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(subject)}</title>${PHONE}</head>
<body style="margin:0;padding:0;background:${PAPER};color:${INK}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${PAPER}">${esc(told.join(' '))}</div>
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:${PAPER}"><tr><td class="mm-outer" align="center" style="padding:28px 12px 8px">
${sheet(frontPage(d, index))}
${inside.map((pg, i) => sheet(`${runningHead(d, i + 2, pg.section)}\n${pg.body}`)).join('\n')}
${sheet(backCover.html, true)}
</td></tr></table></body></html>`

	const top = busiest(d.days)
	const text = [
		`${d.site.name.toUpperCase()}: THE MISOMOON ${d.kind.toUpperCase()}`,
		[d.edition, d.issued ? longDate(d.issued) : '', d.label].filter(Boolean).join(' · '),
		'',
		headline(d).toUpperCase(),
		told.join(' '),
		'',
		`Visitors: ${fmt.format(c.visitors)}${changeText(percentChange(c.visitors, p?.visitors))}`,
		`Visits: ${fmt.format(c.visits)}${changeText(percentChange(c.visits, p?.visits))}`,
		`Pageviews: ${fmt.format(c.pageviews)}${changeText(percentChange(c.pageviews, p?.pageviews))}`,
		`Views per visit: ${c.views_per_visit}`,
		`Bounce rate: ${c.bounce_rate}%${changeText(points(c.bounce_rate, p?.bounce_rate), ' pts')}`,
		`Visit duration: ${dur(c.visit_duration)}`,
		...(top ? [`Busiest day: ${named(d, top.date)} (${fmt.format(top.visitors)} visitors)`] : []),
		...inside.flatMap((pg, i) => ['', `PAGE ${i + 2}: ${pg.section.toUpperCase()}`, ...pg.text]),
		'',
		`PAGE ${back}: BACK PAGE`,
		...backCover.text,
		'',
		`Open the dashboard: ${d.link}`,
	].join('\n')
	return { subject, html, text }
}

/** The brand's web fonts; email clients mostly fall back, but a printed PDF can load them. */
const FONTS = 'https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=Martian+Mono:wdth,wght@75..112.5,300..700&display=block'

/**
 * A report email laid out for print: each sheet on its own page, every page the size of the
 * tallest sheet with the paper around it, backgrounds kept. The script runs once fonts and
 * images have loaded, then marks `<body data-printed>`, which the renderer waits for.
 */
export function printReport(html: string): string {
	const gutter = 28
	const script = `<script>
addEventListener('load', async () => {
	await document.fonts.ready
	const sheets = [...document.querySelectorAll('table[width="560"]')]
	const h = Math.max(...sheets.map((s) => s.offsetHeight))
	const W = 560 + 2 * ${gutter} + 8, H = h + 2 * ${gutter} + 8
	const css = document.createElement('style')
	css.textContent = '@page{size:' + W + 'px ' + H + 'px;margin:0}' +
		'.pg{width:' + W + 'px;height:' + H + 'px;padding:${gutter}px;box-sizing:border-box;break-after:page;overflow:hidden}' +
		'.pg>table{height:' + h + 'px;margin:0!important}'
	document.head.appendChild(css)
	document.body.replaceChildren(...sheets.map((s) => { const p = document.createElement('div'); p.className = 'pg'; p.appendChild(s); return p }))
	document.body.dataset.printed = ''
})
</script>`
	// the widths docs/BRAND.md sets: display Archivo (where the email names Arial Narrow) at 68%,
	// Martian Mono at 87.5%; important, since an inline `font` shorthand resets the width
	const style = `<link rel="stylesheet" href="${FONTS}"><style>html,body{margin:0;background:${PAPER};-webkit-print-color-adjust:exact;print-color-adjust:exact}
[style*="Arial Narrow"]{font-stretch:68%!important;word-spacing:.08em}
[style*="Martian Mono"]{font-stretch:87.5%!important}
.pg:last-child{break-after:auto}
.pg td.mm-pad{vertical-align:top}</style>`
	return html.replace('</head>', `${style}${script}</head>`)
}

export function renderAlert(kind: 'spike' | 'drop', site: { name: string }, detail: string, link: string): { subject: string; html: string; text: string } {
	const subject = kind === 'spike' ? `Traffic spike on ${site.name}` : `No traffic on ${site.name}`
	return renderNotice({ label: `${kind === 'spike' ? 'spike' : 'quiet'} alert`, subject, detail, cta: kind === 'spike' ? 'See who is here' : 'Check the site', link })
}

/** A short one-action email (alerts, invitations, password resets) in the Miso Print style. */
export function renderNotice(n: { label: string; subject: string; detail: string; cta: string; link: string; footnote?: string }): { subject: string; html: string; text: string } {
	const html = `<!doctype html><html><body style="margin:0;background:${PAPER};color:${INK};font:15px/1.5 ${SANS}">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:${SHEET};border:2px solid ${INK};box-shadow:6px 6px 0 ${INK}"><tr><td style="padding:26px 28px">
<div style="font:600 11px/1 ${MONO};letter-spacing:.12em;text-transform:uppercase;color:${MISO}">misomoon · ${esc(n.label)}</div>
<h1 style="font:800 28px/1.1 ${SANS};text-transform:uppercase;margin:10px 0">${esc(n.subject)}</h1>
<p style="margin:0 0 18px">${esc(n.detail)}</p>
<a href="${esc(n.link)}" style="display:inline-block;background:${MISO};color:#ffffff;font-weight:700;text-decoration:none;padding:10px 16px;border:2px solid ${INK};box-shadow:3px 3px 0 ${INK}">${esc(n.cta)}</a>
${n.footnote ? `<p style="margin:18px 0 0;font-size:12px;color:#6b6457">${esc(n.footnote)}</p>` : ''}
</td></tr></table></td></tr></table></body></html>`
	return { subject: n.subject, html, text: `${n.subject}\n\n${n.detail}\n\n${n.link}${n.footnote ? `\n\n${n.footnote}` : ''}` }
}

/** Whether a scheduled report is due at `now` in the site's local time (Mondays / the 1st, from 8:00). */
export function reportDue(kind: 'weekly' | 'monthly', lastSent: number | null, now: number, offsetMinutes: number): boolean {
	const local = new Date(now + offsetMinutes * 60_000)
	if (local.getUTCHours() < 8) return false
	if (kind === 'weekly' && local.getUTCDay() !== 1) return false
	if (kind === 'monthly' && local.getUTCDate() !== 1) return false
	return !lastSent || now - lastSent > 20 * 3_600_000
}
