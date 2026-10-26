// What a failure leaves to retry: a queue batch whose writes fail on one shard group only,
// plan and daily-cap emails the provider refused, and an SES region that can't be one.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { DAY, eventStop, planById, TRIAL_DAYS } from '@misomoon/core'
import { invalidate } from '../src/control'
import { emailConfigured } from '../src/reports'
import { fakeCtx, fakeEnv, OWNER, type FakeEnv } from './fake'

vi.mock('@misomoon/tracker/m.min.js', () => ({ default: '/* m.js */' }))
const { default: worker } = await import('../src/index')

const UA = 'Mozilla/5.0 (Macintosh) Chrome/141.0.0.0 Safari/537.36'
// 10 October 2026, noon UTC
const NOON = Date.UTC(2026, 9, 10, 12)
const starter = planById('starter')!

async function call(env: FakeEnv, method: string, path: string, body?: unknown, headers: Record<string, string> = OWNER) {
	const ctx = fakeCtx()
	const init: RequestInit = { method, headers: { 'content-type': 'application/json', ...headers } }
	if (body !== undefined) init.body = JSON.stringify(body)
	const res = await worker.fetch(new Request(`https://app.test${path}`, init), env as unknown as Env, ctx as unknown as ExecutionContext)
	await ctx.settle()
	return res
}

/** Sites with a queue: beacons land in `sent` until `deliver` hands them to the consumer. */
async function setup(over: Partial<FakeEnv> = {}, domains = ['shop.com']) {
	const env = fakeEnv(over)
	for (const domain of domains) expect((await call(env, 'POST', '/api/v1/sites', { domain })).status).toBe(201)
	const sent: unknown[] = []
	env.EVENTS = { send: async (body) => void sent.push(body) }
	return { env, sent }
}

async function beacon(env: FakeEnv, host: string, ip: string, at = NOON) {
	vi.setSystemTime(at)
	const res = await call(env, 'POST', '/api/event', { s: host.replace('.', '-'), n: 'pageview', u: `https://${host}/` }, { 'user-agent': UA, 'cf-connecting-ip': ip })
	expect(res.status).toBe(202)
}

/** Runs the queue consumer over these messages as one batch, and says what it did with each. */
async function deliver(env: FakeEnv, bodies: unknown[]) {
	const out = { ackAll: 0, retryAll: 0, acked: [] as number[], retried: [] as number[] }
	const messages = bodies.map((body, i) => ({ body, ack: () => void out.acked.push(i), retry: () => void out.retried.push(i) }))
	const batch = { messages, ackAll: () => void out.ackAll++, retryAll: () => void out.retryAll++ }
	await worker.queue!(batch as unknown as MessageBatch<never>, env as unknown as Env, fakeCtx() as unknown as ExecutionContext)
	return out
}

const stored = (env: FakeEnv, site: string) => [env.SHARD_0, env.SHARD_1].reduce((n, db) => n + (db.rows('SELECT COUNT(*) AS n FROM events WHERE site_id = ?', site)[0] as { n: number }).n, 0)

/** Fails every shard batch that binds `site`, `times` times. */
function failSite(env: FakeEnv, site: string, times = Infinity) {
	let left = times
	for (const db of [env.SHARD_0, env.SHARD_1]) {
		const batch = db.batch.bind(db)
		db.batch = async (stmts) => {
			if (left > 0 && stmts.some((s) => s.params.includes(site))) {
				left--
				throw new Error('D1_ERROR: shard is busy')
			}
			return batch(stmts)
		}
	}
}

beforeEach(() => {
	invalidate('')
	vi.useFakeTimers({ toFake: ['Date'] })
	vi.setSystemTime(NOON)
})
afterEach(() => {
	vi.useRealTimers()
	vi.restoreAllMocks()
	vi.unstubAllGlobals()
})

describe('a queue batch that fails on one site', () => {
	it('acks the events that were written and retries only the ones that failed', async () => {
		const { env, sent } = await setup({}, ['shop.com', 'blog.com'])
		await beacon(env, 'shop.com', '198.51.100.1')
		await beacon(env, 'blog.com', '198.51.100.2')
		await beacon(env, 'shop.com', '198.51.100.3')
		failSite(env, 'blog-com', 1)
		vi.spyOn(console, 'error').mockImplementation(() => {})
		const first = await deliver(env, sent)
		expect(first).toEqual({ ackAll: 0, retryAll: 0, acked: [0, 2], retried: [1] })
		expect([stored(env, 'shop-com'), stored(env, 'blog-com')]).toEqual([2, 0])
		// the retry carries the failed message alone, and writes it
		const again = await deliver(env, [sent[1]])
		expect(again).toMatchObject({ ackAll: 1, retryAll: 0 })
		expect([stored(env, 'shop-com'), stored(env, 'blog-com')]).toEqual([2, 1])
	})

	it('acks the whole batch when every group is written', async () => {
		const { env, sent } = await setup({}, ['shop.com', 'blog.com'])
		await beacon(env, 'shop.com', '198.51.100.1')
		await beacon(env, 'blog.com', '198.51.100.2')
		expect(await deliver(env, sent)).toEqual({ ackAll: 1, retryAll: 0, acked: [], retried: [] })
	})

	it('retries the whole batch when every group fails', async () => {
		const { env, sent } = await setup({}, ['shop.com'])
		await beacon(env, 'shop.com', '198.51.100.1')
		failSite(env, 'shop-com', 1)
		vi.spyOn(console, 'error').mockImplementation(() => {})
		expect(await deliver(env, sent)).toEqual({ ackAll: 0, retryAll: 1, acked: [], retried: [] })
	})
})

/** An EMAIL binding that refuses the first `refuse` sends, then delivers. */
function mailbox(refuse = 0) {
	const mails: { to: string; subject: string }[] = []
	const attempts: string[] = []
	let left = refuse
	const EMAIL = {
		send: async (m: unknown) => {
			attempts.push((m as { subject: string }).subject)
			if (left > 0) {
				left--
				throw Object.assign(new Error('provider is down'), { code: 'E_DOWN' })
			}
			mails.push(m as { to: string; subject: string })
			return { messageId: 'm' }
		},
	}
	return { mails, attempts, EMAIL }
}

const SES = { AWS_SES_REGION: 'us-east-1', AWS_SES_ACCESS_KEY_ID: 'AKIDEXAMPLE', AWS_SES_SECRET_ACCESS_KEY: 'secret' }

/** A fetch that answers every SES send with `status`, and keeps how many there were. */
function ses(status: number) {
	const sends: string[] = []
	vi.stubGlobal('fetch', async (input: string | Request) => {
		sends.push(typeof input === 'string' ? input : input.url)
		return new Response(status < 300 ? JSON.stringify({ MessageId: 'ses-test' }) : '{}', { status, headers: { 'x-amzn-errortype': status >= 500 ? 'InternalFailure' : 'MessageRejected' } })
	})
	return sends
}

const logged = (spy: { mock: { calls: unknown[][] } }, msg: string) => spy.mock.calls.filter(([line]) => String(line).includes(`"msg":"${msg}"`)).length

/** The hourly cron, at minute 15 of `at`. */
async function hourly(env: FakeEnv, at: number) {
	vi.setSystemTime(at)
	const ctx = fakeCtx()
	await worker.scheduled!({ cron: '*/5 * * * *', scheduledTime: at, noRetry() {} } as ScheduledController, env as unknown as Env, ctx as unknown as ExecutionContext)
	await ctx.settle()
}

const hourAfter = (ts: number) => Math.floor(ts / 3_600_000) * 3_600_000 + 3_600_000 + 15 * 60_000

describe('a daily-cap email the provider refused', () => {
	it('is sent again by the next hourly run, once', async () => {
		const box = mailbox(1)
		const { env, sent } = await setup({ INGEST_DAILY_CAP: '1', EMAIL: box.EMAIL })
		vi.spyOn(console, 'error').mockImplementation(() => {})
		vi.spyOn(console, 'log').mockImplementation(() => {})
		await beacon(env, 'shop.com', '198.51.100.1')
		await beacon(env, 'shop.com', '198.51.100.2')
		await deliver(env, sent.splice(0))
		expect(box.mails).toEqual([])
		// the day still shows as capped
		expect(env.CONTROL.rows('SELECT capped_at IS NOT NULL AS capped FROM usage_daily')).toEqual([{ capped: 1 }])
		await hourly(env, hourAfter(NOON))
		expect(box.mails.map((m) => [m.to, m.subject])).toEqual([['owner@test', 'Tracking for shop.com is paused until 00:00 UTC']])
		await hourly(env, hourAfter(NOON) + 3_600_000)
		expect(box.mails).toHaveLength(1)
	})

	it('is not sent again once delivered', async () => {
		const box = mailbox(0)
		const { env, sent } = await setup({ INGEST_DAILY_CAP: '1', EMAIL: box.EMAIL })
		vi.spyOn(console, 'log').mockImplementation(() => {})
		await beacon(env, 'shop.com', '198.51.100.1')
		await beacon(env, 'shop.com', '198.51.100.2')
		await deliver(env, sent.splice(0))
		await hourly(env, hourAfter(NOON))
		expect(box.mails).toHaveLength(1)
	})

	it('is let go when the site is no longer capped, so it never says a false pause', async () => {
		const box = mailbox(1)
		const { env, sent } = await setup({ INGEST_DAILY_CAP: '1', EMAIL: box.EMAIL })
		vi.spyOn(console, 'error').mockImplementation(() => {})
		const log = vi.spyOn(console, 'log').mockImplementation(() => {})
		await beacon(env, 'shop.com', '198.51.100.1')
		await beacon(env, 'shop.com', '198.51.100.2')
		await deliver(env, sent.splice(0))
		// support raises the site's limit before the hourly run
		env.CONTROL.db.prepare('UPDATE sites SET ingest_cap = 500 WHERE id = ?').run('shop-com')
		invalidate('')
		await hourly(env, hourAfter(NOON))
		await hourly(env, hourAfter(NOON) + 3_600_000)
		expect(box.mails).toEqual([])
		expect(box.attempts).toHaveLength(1)
		expect(logged(log, 'cap email let go')).toBe(1)
	})

	it('logs that it waits for the hourly run', async () => {
		const box = mailbox(1)
		const { env, sent } = await setup({ INGEST_DAILY_CAP: '1', EMAIL: box.EMAIL })
		const error = vi.spyOn(console, 'error').mockImplementation(() => {})
		vi.spyOn(console, 'log').mockImplementation(() => {})
		await beacon(env, 'shop.com', '198.51.100.1')
		await beacon(env, 'shop.com', '198.51.100.2')
		await deliver(env, sent.splice(0))
		expect(logged(error, 'cap email queued for retry')).toBe(1)
	})

	it('is not sent again when SES failed in a way that may have sent it', async () => {
		const sends = ses(500)
		const { env, sent } = await setup({ INGEST_DAILY_CAP: '1', ...SES })
		vi.spyOn(console, 'error').mockImplementation(() => {})
		vi.spyOn(console, 'log').mockImplementation(() => {})
		await beacon(env, 'shop.com', '198.51.100.1')
		await beacon(env, 'shop.com', '198.51.100.2')
		await deliver(env, sent.splice(0))
		expect(sends).toHaveLength(1)
		await hourly(env, hourAfter(NOON))
		expect(sends).toHaveLength(1)
	})

	it('is sent again when SES refused it outright', async () => {
		const sends = ses(400)
		const { env, sent } = await setup({ INGEST_DAILY_CAP: '1', ...SES })
		vi.spyOn(console, 'error').mockImplementation(() => {})
		vi.spyOn(console, 'log').mockImplementation(() => {})
		await beacon(env, 'shop.com', '198.51.100.1')
		await beacon(env, 'shop.com', '198.51.100.2')
		await deliver(env, sent.splice(0))
		await hourly(env, hourAfter(NOON))
		expect(sends).toHaveLength(2)
	})

	it('is not sent the next day, since the day it was about is over', async () => {
		const box = mailbox(1)
		const { env, sent } = await setup({ INGEST_DAILY_CAP: '1', EMAIL: box.EMAIL })
		vi.spyOn(console, 'error').mockImplementation(() => {})
		vi.spyOn(console, 'log').mockImplementation(() => {})
		await beacon(env, 'shop.com', '198.51.100.1')
		await beacon(env, 'shop.com', '198.51.100.2')
		await deliver(env, sent.splice(0))
		await hourly(env, NOON + DAY)
		expect(box.mails).toEqual([])
	})
})

describe('a plan email the provider refused', () => {
	const CLOUD = { PLANS: 'on', RETENTION_DAYS: '1825', RETENTION_DEFAULT_DAYS: '761' }

	it('sends only the highest level when several were refused', async () => {
		const box = mailbox(2)
		const env = fakeEnv({ ...CLOUD, EMAIL: box.EMAIL })
		env.CONTROL.db.prepare('UPDATE teams SET trial_ends_at = ?, plan = ? WHERE id = ?').run(NOON + TRIAL_DAYS * DAY, 'starter', 't1')
		expect((await call(env, 'POST', '/api/v1/sites', { domain: 'shop.com' })).status).toBe(201)
		vi.spyOn(console, 'error').mockImplementation(() => {})
		vi.spyOn(console, 'log').mockImplementation(() => {})
		const day = Math.floor(NOON / DAY)
		const at = (events: number) => {
			env.CONTROL.db.prepare('INSERT INTO usage_daily (site_id, day, events, stored) VALUES (?, ?, ?, ?) ON CONFLICT (site_id, day) DO UPDATE SET events = excluded.events, stored = excluded.stored').run('shop-com', day, events, events)
			invalidate('')
		}
		// 80% in one batch, 100% in a later one, and the provider refuses both
		at(starter.events * 0.8 - 1)
		await beacon(env, 'shop.com', '198.51.100.1')
		at(starter.events - 1)
		await beacon(env, 'shop.com', '198.51.100.2', NOON + 61_000)
		expect(box.attempts).toEqual(["Team has used 80% of this month's events", "Team has used this month's events"])
		await hourly(env, hourAfter(NOON))
		expect(box.mails.map((m) => m.subject)).toEqual(["Team has used this month's events"])
		expect(env.CONTROL.rows('SELECT level FROM plan_notices ORDER BY level')).toEqual([{ level: 100 }])
	})

	it('stops trying after 24 sends the provider refused', async () => {
		const { env, attempts, log } = await (async () => {
			const r = await cloud(Infinity)
			return { ...r, log: vi.mocked(console.error) }
		})()
		await beacon(env, 'shop.com', '198.51.100.1')
		for (let h = 0; h < 30; h++) await hourly(env, hourAfter(NOON) + h * 3_600_000)
		expect(attempts).toHaveLength(24)
		expect(logged(log, 'plan email queued for retry')).toBe(23)
		expect(logged(log, 'plan email retries stopped')).toBe(1)
		// still counts as emailed, so no batch sends it again
		expect(env.CONTROL.rows('SELECT COUNT(*) AS n FROM plan_notices WHERE sent_at <= 0')).toEqual([{ n: 0 }])
	})

	async function cloud(refuse: number) {
		const box = mailbox(refuse)
		const env = fakeEnv({ ...CLOUD, EMAIL: box.EMAIL })
		env.CONTROL.db.prepare('UPDATE teams SET trial_ends_at = ?, plan = ? WHERE id = ?').run(NOON + TRIAL_DAYS * DAY, 'starter', 't1')
		expect((await call(env, 'POST', '/api/v1/sites', { domain: 'shop.com' })).status).toBe(201)
		// this month's events up to one short of the stop: the next pageview pauses tracking
		env.CONTROL.db.prepare('INSERT INTO usage_daily (site_id, day, events, stored) VALUES (?, ?, ?, ?)').run('shop-com', Math.floor(NOON / DAY), eventStop(starter) - 1, eventStop(starter) - 1)
		invalidate('')
		vi.spyOn(console, 'error').mockImplementation(() => {})
		vi.spyOn(console, 'log').mockImplementation(() => {})
		return { env, mails: box.mails, attempts: box.attempts }
	}

	it('is sent again by the next hourly run, once, though tracking stopped', async () => {
		const { env, mails } = await cloud(1)
		await beacon(env, 'shop.com', '198.51.100.1')
		expect(mails).toEqual([])
		// stopped: no later batch would ever send it
		await beacon(env, 'shop.com', '198.51.100.2', NOON + 61_000)
		expect(mails).toEqual([])
		await hourly(env, hourAfter(NOON))
		expect(mails.map((m) => [m.to, m.subject])).toEqual([['owner@test', 'Tracking for Team is paused until 1 November']])
		await hourly(env, hourAfter(NOON) + 3_600_000)
		expect(mails).toHaveLength(1)
	})

	it('is not sent twice when it was delivered', async () => {
		const { env, mails } = await cloud(0)
		await beacon(env, 'shop.com', '198.51.100.1')
		expect(mails).toHaveLength(1)
		await hourly(env, hourAfter(NOON))
		expect(mails).toHaveLength(1)
	})

	it('is dropped once the team has moved to another plan', async () => {
		const { env, mails } = await cloud(1)
		await beacon(env, 'shop.com', '198.51.100.1')
		env.CONTROL.db.prepare('UPDATE teams SET plan = ? WHERE id = ?').run('growth', 't1')
		invalidate('')
		await hourly(env, hourAfter(NOON))
		expect(mails).toEqual([])
		// the crossing marked 80 and 100 as passed; only the stop was to be emailed, and it is let go
		expect(env.CONTROL.rows('SELECT level FROM plan_notices ORDER BY level')).toEqual([{ level: 80 }, { level: 100 }])
	})
})

describe('an SES region that is not one', () => {
	const SES = { AWS_SES_ACCESS_KEY_ID: 'AKIA', AWS_SES_SECRET_ACCESS_KEY: 'secret' }

	it('counts as no email provider, and is logged once', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {})
		const bad = fakeEnv({ ...SES, AWS_SES_REGION: 'evil.example.com/x' }) as unknown as Env
		expect([emailConfigured(bad), emailConfigured(bad)]).toEqual([false, false])
		expect(error.mock.calls.filter(([m]) => String(m).includes('AWS_SES_REGION'))).toHaveLength(1)
		expect(emailConfigured(fakeEnv({ ...SES, AWS_SES_REGION: ' ap-southeast-2 ' }) as unknown as Env)).toBe(true)
	})
})
