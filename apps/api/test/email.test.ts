// sendEmail: Cloudflare Email Service (the EMAIL binding) or Amazon SES.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { emailConfigured, isoWeek, reportPdf, runReports, sendEmail } from '../src/reports'
import { invalidate, shardDb, writeShard } from '../src/control'
import { fakeCtx, fakeEnv, OWNER, type FakeEnv } from './fake'

vi.mock('@misomoon/tracker/m.min.js', () => ({ default: '/* m.js */' }))
const { default: worker } = await import('../src/index')

const MSG = { subject: 'Hello', html: '<p>Hi</p>', text: 'Hi' }
const SES = { AWS_SES_REGION: 'us-east-1', AWS_SES_ACCESS_KEY_ID: 'AKIDEXAMPLE', AWS_SES_SECRET_ACCESS_KEY: 'secret' }

/** An EMAIL binding that keeps what it was asked to send. */
function binding(fail?: Error) {
	const sent: unknown[] = []
	return { sent, EMAIL: { send: async (m: unknown) => (fail ? Promise.reject(fail) : (sent.push(m), { messageId: 'm1' })) } }
}

/** A fetch that keeps each request and answers with `status`. */
function http(status = 200) {
	const calls: { url: string; method: string; headers: Headers; body: any }[] = []
	vi.stubGlobal('fetch', async (input: string | Request, init?: RequestInit) => {
		const req = new Request(input, init)
		calls.push({ url: req.url, method: req.method, headers: req.headers, body: JSON.parse(await req.text()) })
		return new Response('{}', { status })
	})
	return calls
}

/** A fetch that answers with each status in turn, keeping the URLs. */
function statuses(...list: number[]) {
	const calls: string[] = []
	vi.stubGlobal('fetch', async (input: string | Request, init?: RequestInit) => {
		calls.push(new Request(input, init).url)
		return new Response('{}', { status: list[Math.min(calls.length, list.length) - 1] })
	})
	return calls
}

const send = (env: FakeEnv, to = 'owner@test') => sendEmail(env as unknown as Env, to, MSG)

// each test has its own fake databases, so nothing cached for another one may carry over
beforeEach(() => invalidate(''))
afterEach(() => vi.unstubAllGlobals())

describe('Cloudflare Email Service', () => {
	it('sends through the EMAIL binding by default, from EMAIL_FROM as name and address', async () => {
		const b = binding()
		const calls = http()
		expect(await send(fakeEnv({ EMAIL: b.EMAIL, EMAIL_FROM: 'misomoon <reports@misomoon.com>' }))).toBe(true)
		expect(b.sent).toEqual([{ from: { name: 'misomoon', email: 'reports@misomoon.com' }, to: 'owner@test', subject: 'Hello', html: '<p>Hi</p>', text: 'Hi' }])
		expect(calls).toEqual([])
	})

	it('keeps a bare EMAIL_FROM address as a string', async () => {
		const b = binding()
		await send(fakeEnv({ EMAIL: b.EMAIL, EMAIL_FROM: 'hello@misomoon.com' }))
		expect((b.sent[0] as { from: unknown }).from).toBe('hello@misomoon.com')
	})

	it('uses misomoon <reports@misomoon.com> when no sender is set', async () => {
		const b = binding()
		await send(fakeEnv({ EMAIL: b.EMAIL }))
		expect((b.sent[0] as { from: unknown }).from).toEqual({ name: 'misomoon', email: 'reports@misomoon.com' })
	})

	it('answers false when the binding refuses, without throwing', async () => {
		const err = Object.assign(new Error('Domain not onboarded'), { code: 'E_SENDER_DOMAIN_NOT_AVAILABLE' })
		expect(await send(fakeEnv({ EMAIL: binding(err).EMAIL }))).toBe(false)
	})

	it('wins over SES when EMAIL_PROVIDER is unset', async () => {
		const b = binding()
		const calls = http()
		await send(fakeEnv({ EMAIL: b.EMAIL, ...SES }))
		expect([b.sent.length, calls.length]).toEqual([1, 0])
	})
})

describe('Amazon SES', () => {
	it('sends SES v2 SendEmail signed with SigV4 when EMAIL_PROVIDER is ses', async () => {
		const b = binding()
		const calls = http()
		expect(await send(fakeEnv({ EMAIL: b.EMAIL, EMAIL_PROVIDER: 'ses', EMAIL_FROM: 'misomoon <hello@misomoon.com>', ...SES }))).toBe(true)
		expect(b.sent).toEqual([])
		expect(calls.map((c) => [c.method, c.url])).toEqual([['POST', 'https://email.us-east-1.amazonaws.com/v2/email/outbound-emails']])
		expect(calls[0].headers.get('authorization')).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/\d{8}\/us-east-1\/ses\/aws4_request, SignedHeaders=.+, Signature=[0-9a-f]{64}$/)
		expect(calls[0].body).toEqual({
			FromEmailAddress: 'misomoon <hello@misomoon.com>',
			Destination: { ToAddresses: ['owner@test'] },
			Content: { Simple: { Subject: { Data: 'Hello', Charset: 'UTF-8' }, Body: { Text: { Data: 'Hi', Charset: 'UTF-8' }, Html: { Data: '<p>Hi</p>', Charset: 'UTF-8' } } } },
		})
	})

	it('is picked without EMAIL_PROVIDER when there is no EMAIL binding', async () => {
		const calls = http()
		expect(await send(fakeEnv(SES))).toBe(true)
		expect(calls.map((c) => c.url)).toEqual(['https://email.us-east-1.amazonaws.com/v2/email/outbound-emails'])
	})

	it("answers false when SES refuses, and logs SES's error type, not its message, which can quote the recipient", async () => {
		vi.stubGlobal('fetch', async () => Response.json({ message: 'Email address is not verified: jane@client.example' }, { status: 400, headers: { 'x-amzn-errortype': 'MessageRejected:http://internal.amazon.com/coral/com.amazonaws.sesv2/' } }))
		const log = vi.spyOn(console, 'error').mockImplementation(() => {})
		expect(await send(fakeEnv({ EMAIL_PROVIDER: 'ses', ...SES }), 'jane@client.example')).toBe(false)
		const logged = log.mock.calls.map((c) => String(c[0])).join('\n')
		log.mockRestore()
		expect(logged).not.toContain('jane@client.example')
		expect(logged).toContain('ses 400 MessageRejected')
	})

	it('does not send again after a 5xx, when SES may have sent the email already', async () => {
		const calls = http(503)
		expect(await send(fakeEnv({ EMAIL_PROVIDER: 'ses', ...SES }))).toBe(false)
		expect(calls.length).toBe(1)
	})

	it('tries once more after a 429, which SES answers before sending anything', async () => {
		const calls = statuses(429, 200)
		expect(await send(fakeEnv({ EMAIL_PROVIDER: 'ses', ...SES }))).toBe(true)
		expect(calls.length).toBe(2)
	})

	it('gives up after a second 429', async () => {
		const calls = statuses(429, 429, 200)
		expect(await send(fakeEnv({ EMAIL_PROVIDER: 'ses', ...SES }))).toBe(false)
		expect(calls.length).toBe(2)
	})

	it('refuses a region that is not an AWS region, without calling out', async () => {
		const calls = http()
		expect(await send(fakeEnv({ EMAIL_PROVIDER: 'ses', ...SES, AWS_SES_REGION: 'evil.com/x' }))).toBe(false)
		expect(calls).toEqual([])
	})
})

describe('choosing a provider', () => {
	it('sends nothing without a provider', async () => {
		const calls = http()
		const env = fakeEnv()
		expect([await send(env), emailConfigured(env as unknown as Env), calls.length]).toEqual([false, false, 0])
	})

	it('does not fall back when EMAIL_PROVIDER names a provider that is not set up', async () => {
		const calls = http()
		const b = binding()
		const env = fakeEnv({ EMAIL_PROVIDER: 'ses', EMAIL: b.EMAIL })
		expect([await send(env), emailConfigured(env as unknown as Env), b.sent.length, calls.length]).toEqual([false, false, 0, 0])
	})

	it.each(['constructor', '__proto__', 'Constructor'])('sends nothing for EMAIL_PROVIDER %s, a key every object inherits', async (name) => {
		const calls = http()
		const b = binding()
		const env = fakeEnv({ EMAIL_PROVIDER: name, EMAIL: b.EMAIL })
		expect([await send(env), emailConfigured(env as unknown as Env), b.sent.length, calls.length]).toEqual([false, false, 0, 0])
	})

	it('does not count SES as set up without all three settings', async () => {
		const calls = http()
		const env = fakeEnv({ AWS_SES_REGION: 'us-east-1', AWS_SES_ACCESS_KEY_ID: 'AKIDEXAMPLE' })
		expect([await send(env), emailConfigured(env as unknown as Env), calls.length]).toEqual([false, false, 0])
	})

	it('sends nothing for an unknown EMAIL_PROVIDER', async () => {
		const b = binding()
		const env = fakeEnv({ EMAIL_PROVIDER: 'postmark', EMAIL: b.EMAIL })
		expect([await send(env), emailConfigured(env as unknown as Env), b.sent.length]).toEqual([false, false, 0])
	})

	it('tells the dashboard email is on when only the EMAIL binding is set', async () => {
		const env = fakeEnv({ EMAIL: binding().EMAIL })
		const get = async (method: string, path: string, body?: unknown) => {
			const req = new Request(`https://app.test${path}`, { method, headers: { 'content-type': 'application/json', ...OWNER }, body: body ? JSON.stringify(body) : undefined })
			return (await worker.fetch(req, env as unknown as Env, fakeCtx() as unknown as ExecutionContext)).json() as Promise<{ sending: boolean }>
		}
		await get('POST', '/api/v1/sites', { domain: 'shop.com' })
		expect([(await get('GET', '/api/v1/sites/shop-com/reports')).sending, (await get('POST', '/api/v1/auth/forgot', { email: 'nobody@test' })).sending]).toEqual([true, true])
	})

	it('reports each configured provider', () => {
		const configured = (over: Partial<FakeEnv>) => emailConfigured(fakeEnv(over) as unknown as Env)
		expect([configured({ EMAIL: binding().EMAIL }), configured(SES), configured({ EMAIL_PROVIDER: 'cloudflare' })]).toEqual([true, true, false])
	})
})

describe('report preview', () => {
	const preview = async (env: FakeEnv, kind: string) => {
		const req = (method: string, path: string, body?: unknown) =>
			worker.fetch(new Request(`https://app.test${path}`, { method, headers: { 'content-type': 'application/json', ...OWNER }, body: body ? JSON.stringify(body) : undefined }), env as unknown as Env, fakeCtx() as unknown as ExecutionContext)
		await req('POST', '/api/v1/sites', { domain: 'shop.com' })
		const res = await req('GET', `/api/v1/sites/shop-com/reports/preview?kind=${kind}`)
		return { status: res.status, html: await res.text() }
	}

	it('renders the weekly edition with one bar per day', async () => {
		const r = await preview(fakeEnv(), 'weekly')
		expect(r.status).toBe(200)
		expect(r.html).toContain('alt="misomoon"')
		expect(r.html).toContain('A quiet week')
		// no PUBLIC_URL: the wordmark comes from misomoon.com, which serves it too
		expect(r.html).toContain('src="https://misomoon.com/email/misomoon-light.png"')
		expect(r.html).toContain('Nobody visited shop.com this week.')
		expect(r.html).toMatch(/Week \d{1,2}, \d{4}/)
		expect(r.html.match(/valign="bottom"/g)).toHaveLength(7)
	})

	it('renders the monthly edition with one bar per day of last month', async () => {
		const r = await preview(fakeEnv(), 'monthly')
		const last = new Date()
		const days = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), 0)).getUTCDate()
		expect(r.html).toContain('>monthly</span>')
		// a new site keeps UTC, so last month is last month in UTC
		expect(r.html.match(/valign="bottom"/g)).toHaveLength(days)
	})
})

describe('isoWeek', () => {
	it('numbers weeks from the one holding the first Thursday', () => {
		const at = (s: string) => isoWeek(Date.parse(`${s}T00:00:00Z`))
		expect([at('2026-10-12'), at('2026-01-01'), at('2025-12-29'), at('2021-01-03'), at('2026-12-28')]).toEqual([
			{ week: 42, year: 2026 },
			{ week: 1, year: 2026 },
			{ week: 1, year: 2026 },
			{ week: 53, year: 2020 },
			{ week: 53, year: 2026 },
		])
	})
})

// "%PDF-" then bytes that only survive a correct base64: high, zero and DEL
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0xff, 0x00, 0x7f, 0x80])
const ATTACHED = { ...MSG, attachments: [{ filename: 'shop.com-week-42-2026.pdf', type: 'application/pdf', content: PDF }] }
const sendAttached = (env: FakeEnv, msg = ATTACHED) => sendEmail(env as unknown as Env, 'owner@test', msg)
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64')

describe('attachments', () => {
	it('hands the PDF to the EMAIL binding as an attachment', async () => {
		const b = binding()
		expect(await sendAttached(fakeEnv({ EMAIL: b.EMAIL }))).toBe(true)
		expect((b.sent[0] as { attachments: unknown }).attachments).toEqual([{ disposition: 'attachment', filename: 'shop.com-week-42-2026.pdf', type: 'application/pdf', content: PDF }])
	})

	it('leaves attachments out of an email without them', async () => {
		const b = binding()
		await send(fakeEnv({ EMAIL: b.EMAIL }))
		expect(Object.keys(b.sent[0] as object)).not.toContain('attachments')
	})

	it('sends the PDF to SES as base64 RawContent', async () => {
		const calls = http()
		expect(await sendAttached(fakeEnv({ EMAIL_PROVIDER: 'ses', ...SES }))).toBe(true)
		expect(calls[0].body.Content.Simple.Attachments).toEqual([
			{ FileName: 'shop.com-week-42-2026.pdf', ContentType: 'application/pdf', ContentDisposition: 'ATTACHMENT', ContentTransferEncoding: 'BASE64', RawContent: 'JVBERi3/AH+A' },
		])
	})

	it('sends a large PDF to SES as base64, however large', async () => {
		const calls = http()
		const big = new Uint8Array(200_000).map((_, i) => (i * 31 + 7) % 256)
		expect(await sendAttached(fakeEnv({ EMAIL_PROVIDER: 'ses', ...SES }), { ...MSG, attachments: [{ filename: 'r.pdf', type: 'application/pdf', content: big }] })).toBe(true)
		expect(calls[0].body.Content.Simple.Attachments[0].RawContent).toBe(b64(big))
	})
})

/** A BROWSER binding that keeps each quick action and answers with `reply`. */
function browser(reply: () => Response = () => new Response(PDF, { headers: { 'content-type': 'application/pdf', 'x-browser-ms-used': '1800' } })) {
	const calls: { action: string; options: any }[] = []
	return { calls, BROWSER: { quickAction: async (action: string, options: unknown) => (calls.push({ action, options }), reply()) } }
}

/** Assets that serve a PNG for the email logos, as the built dashboard does. */
const LOGO = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
const assets = { fetch: async (req: Request) => (new URL(req.url).pathname.startsWith('/email/') ? new Response(LOGO, { headers: { 'content-type': 'image/png' } }) : new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } })) }
const LOGOS = '<img src="https://misomoon.com/email/misomoon-light.png"><img src="https://misomoon.com/email/misomoon-dark.png">'

describe('report PDF', () => {
	it('is null without the BROWSER binding', async () => {
		expect(await reportPdf(fakeEnv() as unknown as Env, '<html><head></head><body></body></html>')).toBeNull()
	})

	it('prints the email through Browser Run, waiting for the print layout, with the logos inlined', async () => {
		const br = browser()
		const pdf = await reportPdf(fakeEnv({ BROWSER: br.BROWSER, ASSETS: assets }) as unknown as Env, `<html><head></head><body>${LOGOS}</body></html>`)
		expect(pdf).toEqual(PDF)
		expect(br.calls.map((c) => c.action)).toEqual(['pdf'])
		const o = br.calls[0].options
		expect([o.pdfOptions, o.waitForSelector.selector, o.gotoOptions.waitUntil]).toEqual([{ printBackground: true, preferCSSPageSize: true }, 'body[data-printed]', 'networkidle0'])
		expect(o.html).toContain('document.body.dataset.printed')
		expect(o.html).toContain(`<img src="data:image/png;base64,${b64(LOGO)}"><img src="data:image/png;base64,${b64(LOGO)}">`)
		expect(o.html).not.toContain('https://misomoon.com/email/')
	})

	it('keeps the logo URLs when the assets have no image for them', async () => {
		const br = browser()
		await reportPdf(fakeEnv({ BROWSER: br.BROWSER }) as unknown as Env, `<html><head></head><body>${LOGOS}</body></html>`)
		expect(br.calls[0].options.html).toContain('src="https://misomoon.com/email/misomoon-light.png"')
	})

	it('is null when Browser Run refuses, or the binding throws', async () => {
		const quota = browser(() => Response.json({ success: false, errors: [{ message: 'browser time limit' }] }, { status: 429 }))
		expect(await reportPdf(fakeEnv({ BROWSER: quota.BROWSER }) as unknown as Env, '<html><head></head></html>')).toBeNull()
		const broken = { quickAction: async () => Promise.reject(new Error('not supported locally')) }
		expect(await reportPdf(fakeEnv({ BROWSER: broken }) as unknown as Env, '<html><head></head></html>')).toBeNull()
	})
})

describe('reports with the PDF', () => {
	const request = (env: FakeEnv) => (method: string, path: string, body?: unknown) =>
		worker.fetch(new Request(`https://app.test${path}`, { method, headers: { 'content-type': 'application/json', ...OWNER }, body: body ? JSON.stringify(body) : undefined }), env as unknown as Env, fakeCtx() as unknown as ExecutionContext)

	it('previews the PDF, named for the site and the edition', async () => {
		const env = fakeEnv({ BROWSER: browser().BROWSER })
		await request(env)('POST', '/api/v1/sites', { domain: 'shop.com' })
		const res = await request(env)('GET', '/api/v1/sites/shop-com/reports/preview?kind=weekly&format=pdf')
		expect([res.status, res.headers.get('content-type')]).toEqual([200, 'application/pdf'])
		expect(res.headers.get('content-disposition')).toMatch(/^inline; filename="shop\.com-week-\d{1,2}-\d{4}\.pdf"$/)
		expect(new Uint8Array(await res.arrayBuffer())).toEqual(PDF)
		const monthly = await request(env)('GET', '/api/v1/sites/shop-com/reports/preview?kind=monthly&format=pdf')
		expect(monthly.headers.get('content-disposition')).toMatch(/^inline; filename="shop\.com-\d{4}-\d{2}\.pdf"$/)
	})

	it('answers 501 for a PDF preview without the binding, and 503 when the print fails', async () => {
		const bare = fakeEnv()
		await request(bare)('POST', '/api/v1/sites', { domain: 'shop.com' })
		expect((await request(bare)('GET', '/api/v1/sites/shop-com/reports/preview?format=pdf')).status).toBe(501)
		const failing = fakeEnv({ BROWSER: browser(() => new Response('busy', { status: 503 })).BROWSER })
		await request(failing)('POST', '/api/v1/sites', { domain: 'shop.com' })
		expect((await request(failing)('GET', '/api/v1/sites/shop-com/reports/preview?format=pdf')).status).toBe(503)
	})

	it('attaches the PDF to a test report', async () => {
		const b = binding()
		const env = fakeEnv({ EMAIL: b.EMAIL, BROWSER: browser().BROWSER })
		await request(env)('POST', '/api/v1/sites', { domain: 'shop.com' })
		expect((await request(env)('POST', '/api/v1/sites/shop-com/reports/test', { email: 'me@shop.com', kind: 'weekly' })).status).toBe(200)
		const [mail] = b.sent as { attachments: { filename: string; type: string; content: Uint8Array }[] }[]
		expect(mail.attachments.map((a) => [a.type, a.content])).toEqual([['application/pdf', PDF]])
	})

	it('still sends a test report when the print fails', async () => {
		const b = binding()
		const env = fakeEnv({ EMAIL: b.EMAIL, BROWSER: browser(() => new Response('busy', { status: 503 })).BROWSER })
		await request(env)('POST', '/api/v1/sites', { domain: 'shop.com' })
		expect((await request(env)('POST', '/api/v1/sites/shop-com/reports/test', { email: 'me@shop.com', kind: 'weekly' })).status).toBe(200)
		expect(Object.keys(b.sent[0] as object)).not.toContain('attachments')
	})

	it('prints each edition once on a scheduled run, however many people subscribe', async () => {
		const b = binding()
		const br = browser()
		const env = fakeEnv({ EMAIL: b.EMAIL, BROWSER: br.BROWSER })
		await request(env)('POST', '/api/v1/sites', { domain: 'shop.com' })
		for (const email of ['a@shop.com', 'b@shop.com']) await request(env)('POST', '/api/v1/sites/shop-com/reports', { email, kind: 'weekly' })
		await runReports(env as unknown as Env, Date.UTC(2026, 9, 19, 9)) // a Monday, 09:00 UTC
		expect(br.calls).toHaveLength(1)
		expect((b.sent as { to: string; attachments: unknown[] }[]).map((m) => [m.to, m.attachments.length])).toEqual([['a@shop.com', 1], ['b@shop.com', 1]])
	})
})

describe('the no-traffic alert', () => {
	const HOUR = 3_600_000
	const DAY = 24 * HOUR
	const NOW = Date.UTC(2026, 9, 22, 12)
	const request = (env: FakeEnv) => (method: string, path: string, body?: unknown) =>
		worker.fetch(new Request(`https://app.test${path}`, { method, headers: { 'content-type': 'application/json', ...OWNER }, body: body ? JSON.stringify(body) : undefined }), env as unknown as Env, fakeCtx() as unknown as ExecutionContext)
	// a pageview at `ts`, on the shard that takes the site's writes
	const pageview = async (env: FakeEnv, ts: number) => {
		const db = await shardDb(env as unknown as Env, await writeShard(env as unknown as Env, 'shop-com', ts))
		await db.prepare("INSERT INTO events (event_id, site_id, ts, name, visitor_id, session_id) VALUES (?, 'shop-com', ?, 'pageview', 'v', 's')").bind(`e${ts}`, ts).run()
	}
	// a site with traffic until 2 days ago, and a drop alert at 12 hours
	async function quietSite() {
		vi.useFakeTimers({ toFake: ['Date'] })
		vi.setSystemTime(NOW - 7 * DAY)
		const b = binding()
		const env = fakeEnv({ EMAIL: b.EMAIL })
		await request(env)('POST', '/api/v1/sites', { domain: 'shop.com' })
		vi.setSystemTime(NOW)
		await pageview(env, NOW - 48 * HOUR)
		expect((await request(env)('POST', '/api/v1/sites/shop-com/reports', { email: 'me@shop.com', kind: 'drop', threshold: 12 })).status).toBe(201)
		return { env, sent: b.sent as { to: string; text: string }[] }
	}
	const run = (env: FakeEnv, at: number) => runReports(env as unknown as Env, at)
	afterEach(() => vi.useRealTimers())

	it('sends once when a site that had traffic the week before goes quiet for the threshold', async () => {
		const { env, sent } = await quietSite()
		await run(env, NOW)
		expect(sent.map((m) => m.to)).toEqual(['me@shop.com'])
		expect(sent[0].text).toContain("misomoon hasn't seen a pageview on shop.com for 12 hours.")
	})

	it('stays silent while the site is still quiet, even after another threshold has passed', async () => {
		const { env, sent } = await quietSite()
		for (const h of [0, 1, 13, 25, 100]) await run(env, NOW + h * HOUR)
		expect(sent).toHaveLength(1)
	})

	it('sends again when traffic comes back and then stops for the threshold again', async () => {
		const { env, sent } = await quietSite()
		await run(env, NOW)
		await pageview(env, NOW + 2 * HOUR)
		await run(env, NOW + 13 * HOUR) // 11 hours since that pageview: not yet
		expect(sent).toHaveLength(1)
		await run(env, NOW + 14 * HOUR + 1)
		expect(sent).toHaveLength(2)
	})

	it.each([
		['drop', 0, 'threshold for drop is a whole number of hours from 1 to 168'],
		['drop', 169, 'threshold for drop is a whole number of hours from 1 to 168'],
		['drop', 1.5, 'threshold for drop is a whole number of hours from 1 to 168'],
		['drop', '12', 'threshold for drop is a whole number of hours from 1 to 168'],
		['spike', 0, 'threshold for spike is a whole number of visitors, 1 or more'],
		['spike', -5, 'threshold for spike is a whole number of visitors, 1 or more'],
	])('refuses a %s threshold of %j', async (kind, threshold, error) => {
		const env = fakeEnv()
		await request(env)('POST', '/api/v1/sites', { domain: 'shop.com' })
		const res = await request(env)('POST', '/api/v1/sites/shop-com/reports', { email: 'me@shop.com', kind, threshold })
		expect([res.status, await res.json()]).toEqual([400, { error }])
		expect(env.CONTROL.rows('SELECT COUNT(*) AS n FROM email_reports')[0].n).toBe(0)
	})

	it('keeps the edge thresholds, and stores none for a report', async () => {
		const env = fakeEnv()
		await request(env)('POST', '/api/v1/sites', { domain: 'shop.com' })
		for (const body of [{ kind: 'drop', threshold: 1 }, { kind: 'drop', threshold: 168, email: 'b@shop.com' }, { kind: 'spike', threshold: 1 }, { kind: 'weekly', threshold: 50 }])
			expect((await request(env)('POST', '/api/v1/sites/shop-com/reports', { email: 'a@shop.com', ...body })).status).toBe(201)
		expect(env.CONTROL.rows('SELECT email, kind, threshold FROM email_reports ORDER BY kind, email')).toEqual([
			{ email: 'a@shop.com', kind: 'drop', threshold: 1 },
			{ email: 'b@shop.com', kind: 'drop', threshold: 168 },
			{ email: 'a@shop.com', kind: 'spike', threshold: 1 },
			{ email: 'a@shop.com', kind: 'weekly', threshold: null },
		])
	})
})

describe('report limits', () => {
	const request = (env: FakeEnv) => (method: string, path: string, body?: unknown) =>
		worker.fetch(new Request(`https://app.test${path}`, { method, headers: { 'content-type': 'application/json', ...OWNER }, body: body ? JSON.stringify(body) : undefined }), env as unknown as Env, fakeCtx() as unknown as ExecutionContext)

	afterEach(() => vi.useRealTimers())

	it('sends at most 10 test reports a site an hour, then answers 429 until the oldest is an hour old', async () => {
		vi.useFakeTimers({ toFake: ['Date'] })
		const start = Date.UTC(2026, 9, 22, 9)
		vi.setSystemTime(start)
		const b = binding()
		const env = fakeEnv({ EMAIL: b.EMAIL })
		await request(env)('POST', '/api/v1/sites', { domain: 'shop.com' })
		await request(env)('POST', '/api/v1/sites', { domain: 'blog.com' })
		const test = (site = 'shop-com') => request(env)('POST', `/api/v1/sites/${site}/reports/test`, { email: 'me@shop.com', kind: 'weekly' })
		const statuses: number[] = []
		for (let i = 0; i < 10; i++) statuses.push((await test()).status)
		expect(statuses).toEqual(Array(10).fill(200))
		const over = await test()
		expect([over.status, await over.json()]).toEqual([429, { error: 'a site sends at most 10 test reports an hour; try again later' }])
		expect(b.sent).toHaveLength(10)
		// another site has its own count
		expect((await test('blog-com')).status).toBe(200)
		vi.setSystemTime(start + 3_600_000)
		expect((await test()).status).toBe(200)
	})

	it('forgets test sends older than an hour in the hourly run', async () => {
		vi.useFakeTimers({ toFake: ['Date'] })
		const now = Date.UTC(2026, 9, 22, 9, 15)
		vi.setSystemTime(now)
		const env = fakeEnv()
		await request(env)('POST', '/api/v1/sites', { domain: 'shop.com' })
		env.CONTROL.db.prepare("INSERT INTO report_tests (site_id, sent_at) VALUES ('shop-com', ?), ('shop-com', ?)").run(now - 3_600_001, now - 60_000)
		const ctx = fakeCtx()
		await worker.scheduled({ cron: '*/5 * * * *', scheduledTime: now } as ScheduledController, env as unknown as Env, ctx as unknown as ExecutionContext)
		await ctx.settle()
		expect(env.CONTROL.rows('SELECT sent_at FROM report_tests').map((r) => r.sent_at)).toEqual([now - 60_000])
	})

	it('keeps at most 20 report and alert subscriptions a site, and still updates one it has', async () => {
		const env = fakeEnv()
		await request(env)('POST', '/api/v1/sites', { domain: 'shop.com' })
		const add = (email: string, kind = 'weekly', threshold?: number) => request(env)('POST', '/api/v1/sites/shop-com/reports', { email, kind, threshold })
		const statuses: number[] = []
		for (let i = 0; i < 19; i++) statuses.push((await add(`p${i}@shop.com`)).status)
		statuses.push((await add('alerts@shop.com', 'drop', 6)).status)
		expect(statuses).toEqual(Array(20).fill(201))
		const over = await add('one-more@shop.com')
		expect([over.status, await over.json()]).toEqual([400, { error: 'a site has at most 20 report and alert subscriptions' }])
		expect((await add('alerts@shop.com', 'drop', 12)).status).toBe(201)
		expect(env.CONTROL.rows("SELECT threshold FROM email_reports WHERE email = 'alerts@shop.com'")[0].threshold).toBe(12)
	})
})
