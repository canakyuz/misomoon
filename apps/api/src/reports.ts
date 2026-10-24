import { DAY, percentChange, printReport, renderAlert, renderReport, reportDue, tzOffset } from '@misomoon/core'
import { AwsClient } from 'aws4fetch'
import { SYSTEM } from './auth'
import { getSite, type Site } from './control'
import { aggregateStats, breakdownStats, goalConversions, pageviewsBetween, realtimeStats, timeseriesStats } from './stats'

/**
 * Email reports (weekly, monthly) and alerts (traffic spike, traffic stopped),
 * sent through the email provider below. The quiet alert is an addition: it catches a broken
 * snippet or a dead site, which a spike alert never will.
 */

export interface Subscription {
	id: string
	site_id: string
	email: string
	kind: 'weekly' | 'monthly' | 'spike' | 'drop'
	threshold: number | null
	last_sent_at: number | null
}

type EmailProvider = 'cloudflare' | 'ses'
type Attachment = { filename: string; type: string; content: Uint8Array }
type Email = { subject: string; html: string; text: string; attachments?: Attachment[] }

/**
 * Where email goes: EMAIL_PROVIDER when it is set, otherwise Cloudflare Email Service
 * (the EMAIL binding) when it is bound, then Amazon SES (AWS_SES_*). A provider named in
 * EMAIL_PROVIDER but not set up sends nothing, rather than mail going out through another.
 */
function emailProvider(env: Env): EmailProvider | null {
	const ses = !!(env.AWS_SES_REGION && env.AWS_SES_ACCESS_KEY_ID && env.AWS_SES_SECRET_ACCESS_KEY)
	const ready: Record<EmailProvider, boolean> = { cloudflare: !!env.EMAIL, ses }
	const choice = env.EMAIL_PROVIDER?.trim().toLowerCase()
	if (choice) return Object.hasOwn(ready, choice) && ready[choice as EmailProvider] ? (choice as EmailProvider) : null
	return (['cloudflare', 'ses'] as const).find((p) => ready[p]) ?? null
}

export function emailConfigured(env: Env): boolean {
	return emailProvider(env) !== null
}

const sender = (env: Env) => env.EMAIL_FROM || 'misomoon <reports@misomoon.com>'

/** "misomoon <reports@misomoon.com>" as the binding's { name, email }; a bare address stays a string. */
function senderAddress(from: string): string | { name: string; email: string } {
	const m = /^\s*"?([^"<]*?)"?\s*<([^<>\s]+@[^<>\s]+)>\s*$/.exec(from)
	return m && m[1] ? { name: m[1].trim(), email: m[2] } : m ? m[2] : from.trim()
}

/** Sends one email; false when no provider is set up or the provider refused it. */
export async function sendEmail(env: Env, to: string, msg: Email): Promise<boolean> {
	const provider = emailProvider(env)
	if (!provider) {
		console.log(JSON.stringify({ msg: 'email skipped: no email provider set up', subject: msg.subject }))
		return false
	}
	try {
		if (provider === 'cloudflare') {
			const attachments = msg.attachments?.map((a) => ({ disposition: 'attachment' as const, filename: a.filename, type: a.type, content: a.content }))
			await env.EMAIL!.send({ from: senderAddress(sender(env)), to, subject: msg.subject, html: msg.html, text: msg.text, ...(attachments ? { attachments } : {}) })
		}
		else await sendWithSes(env, to, msg)
		return true
	} catch (e) {
		// a provider's error can quote the recipient, so only its code is kept
		const code = (e as { code?: unknown })?.code
		console.error(JSON.stringify({ msg: 'email failed', provider, subject: msg.subject, error: typeof code === 'string' ? code : String((e as Error)?.message ?? e).slice(0, 200) }))
		return false
	}
}

/** SES v2 SendEmail, signed with SigV4 by aws4fetch (fetch and Web Crypto only). */
async function sendWithSes(env: Env, to: string, msg: Email) {
	const region = env.AWS_SES_REGION!.trim()
	// the region goes into the hostname, so nothing else may
	if (!/^[a-z]{2}(-[a-z]+)+-\d$/.test(region)) throw new Error(`not an AWS region: ${region.slice(0, 40)}`)
	const aws = new AwsClient({ accessKeyId: env.AWS_SES_ACCESS_KEY_ID!, secretAccessKey: env.AWS_SES_SECRET_ACCESS_KEY!, service: 'ses', region, retries: 0 })
	const post = () => aws.fetch(`https://email.${region}.amazonaws.com/v2/email/outbound-emails`, {
		method: 'POST',
		redirect: 'error',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			FromEmailAddress: sender(env),
			Destination: { ToAddresses: [to] },
			Content: {
				Simple: {
					Subject: { Data: msg.subject, Charset: 'UTF-8' },
					Body: { Text: { Data: msg.text, Charset: 'UTF-8' }, Html: { Data: msg.html, Charset: 'UTF-8' } },
					...(msg.attachments ? { Attachments: msg.attachments.map((a) => ({ FileName: a.filename, ContentType: a.type, ContentDisposition: 'ATTACHMENT', ContentTransferEncoding: 'BASE64', RawContent: base64(a.content) })) } : {}),
				},
			},
		}),
	})
	let res = await post()
	// SES answers 429 before it sends anything, so that one is safe to try again. After a
	// 5xx the email may have gone out, and a second try could send it twice.
	if (res.status === 429) {
		await new Promise((r) => setTimeout(r, 250))
		res = await post()
	}
	if (!res.ok) throw new Error(`ses ${res.status}: ${(await res.text()).slice(0, 200)}`)
}

/** Base64 in chunks: one spread of a whole PDF would overflow the call stack. */
function base64(bytes: Uint8Array): string {
	let s = ''
	for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
	return btoa(s)
}

const origin = (env: Env) => env.PUBLIC_URL || 'https://misomoon.com'
const link = (env: Env, site: Site, extra = '') => `${origin(env)}/?site=${encodeURIComponent(site.id)}${extra}`

export async function buildReport(env: Env, site: Site, kind: 'weekly' | 'monthly', now = Date.now()) {
	const offset = tzOffset(site.timezone, now)
	const local = new Date(now + offset * 60_000)
	// the last full week (Monday to Sunday) or the last full month, in the site's timezone
	let from: string
	let to: string
	if (kind === 'weekly') {
		const end = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - ((local.getUTCDay() + 6) % 7) * DAY - DAY
		from = new Date(end - 6 * DAY).toISOString().slice(0, 10)
		to = new Date(end).toISOString().slice(0, 10)
	} else {
		from = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - 1, 1)).toISOString().slice(0, 10)
		to = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 0)).toISOString().slice(0, 10)
	}
	const date = (t: number) => new Date(t).toISOString().slice(0, 10)
	const start = Date.parse(`${from}T00:00:00Z`)
	const length = Math.round((Date.parse(`${to}T00:00:00Z`) - start) / DAY) + 1
	const input = { site: site.id, period: 'custom', from, to }
	// the period before, the same number of days, for each source's change
	const before = { ...input, from: date(start - length * DAY), to: date(start - DAY) }
	const [agg, series, pages, sources, sourcesBefore, countries, devices, goals] = await Promise.all([
		aggregateStats(env, SYSTEM, { ...input, compare: 'previous' }),
		timeseriesStats(env, SYSTEM, { ...input, interval: 'day', compare: 'previous' }),
		breakdownStats(env, SYSTEM, { ...input, property: 'page', limit: 5 }),
		// more sources than are listed, so the receipt finds the ones that paid
		breakdownStats(env, SYSTEM, { ...input, property: 'source', limit: 25 }),
		breakdownStats(env, SYSTEM, { ...before, property: 'source', limit: 100 }),
		breakdownStats(env, SYSTEM, { ...input, property: 'country', limit: 5 }),
		breakdownStats(env, SYSTEM, { ...input, property: 'device', limit: 4 }),
		goalConversions(env, SYSTEM, input),
	])
	const prior = new Map(sourcesBefore.rows.map((r) => [r.key, r.visitors]))
	const day = (s: string) => new Date(s + 'T00:00:00Z').toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' })
	const monthName = new Date(from + 'T00:00:00Z').toLocaleDateString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' })
	const rows = (b: { rows: { key: string; visitors: number }[] }) => b.rows.map((r) => ({ key: r.key, visitors: r.visitors }))
	const week = isoWeek(start)
	const filename = `${site.domain.replace(/[^a-z0-9.-]/gi, '-')}-${kind === 'weekly' ? `week-${week.week}-${week.year}` : from.slice(0, 7)}.pdf`
	const report = renderReport({
		site,
		kind: kind === 'weekly' ? 'Weekly' : 'Monthly',
		label: kind === 'weekly' ? `${day(from)} – ${day(to)}` : monthName,
		// it goes out the day after the period: a Monday, or the 1st
		issued: date(start + length * DAY),
		next: kind === 'weekly' ? date(start + (length + 7) * DAY) : new Date(Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) + 1, 1)).toISOString().slice(0, 10),
		edition: kind === 'weekly' ? `Week ${week.week}, ${week.year}` : `No. ${Number(from.slice(5, 7))}, ${from.slice(0, 4)}`,
		currency: site.currency,
		// <Logo size={22} /> (Logo.svelte) rendered at 4x, since email clients drop SVG. The dashboard
		// (public/email/) and misomoon.com (landing static/email/) both serve them; re-render both if the logo changes.
		logo: { light: `${origin(env)}/email/misomoon-light.png`, dark: `${origin(env)}/email/misomoon-dark.png` },
		current: agg.current,
		previous: agg.previous,
		// one point per local day; the buckets come back in order and complete
		days: series.points.slice(0, length).map((pt, i) => ({ date: date(start + i * DAY), visitors: pt.visitors, previous: series.previous?.[i]?.visitors })),
		pages: rows(pages),
		sources: sources.rows.map((r) => ({ key: r.key, visitors: r.visitors, revenue: 'revenue' in r ? (r.revenue ?? 0) : 0, change: percentChange(r.visitors, prior.get(r.key)) })),
		countries: rows(countries),
		devices: rows(devices),
		goals: goals.rows.slice(0, 5).map((g) => ({ key: g.key, visitors: g.visitors, conversion_rate: g.conversion_rate })),
		link: link(env, site, `&period=custom&from=${from}&to=${to}`),
	})
	return { ...report, filename }
}

/**
 * A report as a PDF, printed by Browser Run (the BROWSER binding) from the email's HTML.
 * The PDF is an extra: null when the binding is missing or the print fails (browser time
 * used up, a timeout), and the email goes out without it.
 */
export async function reportPdf(env: Env, html: string): Promise<Uint8Array<ArrayBuffer> | null> {
	if (!env.BROWSER) return null
	try {
		const res = await env.BROWSER.quickAction('pdf', {
			html: printReport(await inlineLogos(env, html)),
			gotoOptions: { waitUntil: 'networkidle0', timeout: 20_000 },
			// printReport marks the body once fonts have loaded and the pages are built
			waitForSelector: { selector: 'body[data-printed]', timeout: 15_000 },
			pdfOptions: { printBackground: true, preferCSSPageSize: true },
		})
		if (!res.ok) throw new Error(`browser run ${res.status}: ${(await res.text()).slice(0, 200)}`)
		const pdf = new Uint8Array(await res.arrayBuffer())
		console.log(JSON.stringify({ msg: 'report pdf', bytes: pdf.length, browserMs: Number(res.headers.get('x-browser-ms-used')) || null }))
		return pdf
	} catch (e) {
		console.error(JSON.stringify({ msg: 'report pdf failed', error: String((e as Error)?.message ?? e).slice(0, 200) }))
		return null
	}
}

/** The logos as data URIs from this Worker's own assets, so the print never waits on them, even before misomoon.com serves them. */
async function inlineLogos(env: Env, html: string): Promise<string> {
	for (const name of ['misomoon-light.png', 'misomoon-dark.png']) {
		const url = `${origin(env)}/email/${name}`
		if (!html.includes(url)) continue
		const res = await env.ASSETS.fetch(new Request(url))
		if (!res.ok || !res.headers.get('content-type')?.startsWith('image/')) continue
		html = html.replaceAll(url, `data:image/png;base64,${base64(new Uint8Array(await res.arrayBuffer()))}`)
	}
	return html
}

/** The report with its PDF attached, or as it is when there is no PDF. */
export async function withPdf(env: Env, report: Email & { filename: string }): Promise<Email> {
	const pdf = await reportPdf(env, report.html)
	return pdf ? { ...report, attachments: [{ filename: report.filename, type: 'application/pdf', content: pdf }] } : report
}

/** ISO 8601 week and week-year of a UTC date: the week of Dec 29, 2025 is week 1 of 2026. */
export function isoWeek(t: number): { week: number; year: number } {
	const d = new Date(t)
	// the Thursday of this week decides its year
	d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7))
	const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
	const week = 1 + Math.round((d.getTime() - jan4.getTime()) / (7 * DAY) - (3 - ((jan4.getUTCDay() + 6) % 7)) / 7)
	return { week, year: d.getUTCFullYear() }
}

async function due(env: Env, kinds: Subscription['kind'][]): Promise<Subscription[]> {
	const { results } = await env.CONTROL.prepare(`SELECT * FROM email_reports WHERE kind IN (${kinds.map(() => '?').join(', ')})`)
		.bind(...kinds)
		.all<Subscription>()
	return results
}

const sent = (env: Env, id: string, at = Date.now()) => env.CONTROL.prepare('UPDATE email_reports SET last_sent_at = ? WHERE id = ?').bind(at, id).run()

/** Hourly: weekly and monthly reports, and the quiet alert. */
export async function runReports(env: Env, now = Date.now()) {
	// one edition per site and kind, however many people subscribe to it: the PDF costs browser time
	const editions = new Map<string, Promise<Email>>()
	for (const sub of await due(env, ['weekly', 'monthly', 'drop'])) {
		try {
			const site = await getSite(env, sub.site_id)
			if (!site) continue
			if (sub.kind === 'drop') {
				await quietAlert(env, site, sub, now)
				continue
			}
			const kind = sub.kind as 'weekly' | 'monthly'
			if (!reportDue(kind, sub.last_sent_at, now, tzOffset(site.timezone, now))) continue
			const key = `${site.id}:${kind}`
			if (!editions.has(key)) editions.set(key, buildReport(env, site, kind, now).then((r) => withPdf(env, r)))
			if (await sendEmail(env, sub.email, await editions.get(key)!)) await sent(env, sub.id, now)
		} catch (e) {
			console.error(JSON.stringify({ msg: 'report failed', id: sub.id, error: String(e) }))
		}
	}
}

/** No pageviews for `threshold` hours (12 by default): once per quiet spell, again only after traffic returns. */
async function quietAlert(env: Env, site: Site, sub: Subscription, now: number) {
	const hours = Math.min(Math.max(1, sub.threshold ?? 12), 168)
	const since = now - hours * 3_600_000
	if (sub.last_sent_at && sub.last_sent_at > since) return
	if ((await pageviewsBetween(env, site.id, since, now)) > 0) return
	// already sent for this quiet spell: wait for a pageview after the alert
	if (sub.last_sent_at && !(await pageviewsBetween(env, site.id, sub.last_sent_at, since))) return
	// a site with no traffic the week before isn't "down", just quiet
	if (!(await pageviewsBetween(env, site.id, since - 7 * DAY, since))) return
	const msg = renderAlert('drop', site, `misomoon hasn't seen a pageview on ${site.domain} for ${hours} hours. The snippet may have been removed, or the site may be down.`, link(env, site))
	if (await sendEmail(env, sub.email, msg)) await sent(env, sub.id, now)
}

/** Every few minutes: visitors right now above the threshold, at most every 12 hours. */
export async function runAlerts(env: Env, now = Date.now()) {
	for (const sub of await due(env, ['spike'])) {
		try {
			if (sub.last_sent_at && now - sub.last_sent_at < 12 * 3_600_000) continue
			const site = await getSite(env, sub.site_id)
			if (!site) continue
			const rt = await realtimeStats(env, SYSTEM, { site: site.id })
			if (rt.visitors < Math.max(1, sub.threshold ?? 10)) continue
			const top = rt.sources[0] ? ` Top source: ${rt.sources[0].key}.` : ''
			const page = rt.pages[0] ? ` Most viewed: ${rt.pages[0].key}.` : ''
			const msg = renderAlert('spike', site, `${rt.visitors} people are on ${site.domain} right now.${top}${page}`, link(env, site, '&view=realtime'))
			if (await sendEmail(env, sub.email, msg)) await sent(env, sub.id, now)
		} catch (e) {
			console.error(JSON.stringify({ msg: 'alert failed', id: sub.id, error: String(e) }))
		}
	}
}
