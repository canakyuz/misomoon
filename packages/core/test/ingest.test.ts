import { describe, expect, it } from 'vite-plus/test'
import { assignSessions, buildEvent, openSessionsStmt, type EdgeContext, type EventRow, type OpenSession, type TrackerPayload } from '../src'
import { runner, shardDb } from './helpers'

const NOW = Date.UTC(2026, 9, 22, 12)
const edge: EdgeContext = { ua: 'Mozilla/5.0 (Macintosh) Chrome/141.0.0.0 Safari/537.36', ip: '10.0.0.1' }
const page = (extra: Partial<TrackerPayload> = {}): TrackerPayload => ({ s: 'a', n: 'pageview', u: 'https://a.com/', ...extra })

function build(p: TrackerPayload): EventRow {
	const row = buildEvent(p, edge, NOW)
	if (typeof row === 'string') throw new Error(`rejected: ${row}`)
	return row
}

describe('buildEvent with wrong field types (F23)', () => {
	it('drops a numeric title, language and referrer instead of throwing', () => {
		const row = build(page({ t: 1, l: 1, r: 1 } as unknown as Partial<TrackerPayload>))
		expect([row.title, row.language, row.referrer, row.referrer_host, row.source, row.channel]).toEqual([null, null, null, null, 'Direct', 'Direct'])
	})
})

describe('buildEvent names', () => {
	it('takes any event name up to 120 characters, without the filter separators', () => {
		const name = (n: string) => {
			const row = buildEvent({ s: 'a', n, u: 'https://a.com/' }, edge, NOW)
			return typeof row === 'string' ? row : row.name
		}
		expect(['Add to cart (mobile)', 'Café: daftar gratis!', ' Signup ', 'x'.repeat(120)].map(name)).toEqual(['Add to cart (mobile)', 'Café: daftar gratis!', 'Signup', 'x'.repeat(120)])
		expect(['Plan;Pro', 'a|b', 'tab\there', 'x'.repeat(121), '  '].map(name)).toEqual(['invalid', 'invalid', 'invalid', 'invalid', 'invalid'])
	})
})

describe('buildEvent paths', () => {
	it('keeps a hash route, which m.js sends with data-hash, without its query', () => {
		const path = (u: string) => build(page({ u })).pathname
		expect([path('https://a.com/#/pricing'), path('https://a.com/app/#!/docs/'), path('https://a.com/#/cb?token=abc')]).toEqual(['/#/pricing', '/app/#!/docs', '/#/cb'])
	})

	it('masks emails and tokens in the path, which a reset or unsubscribe link can hold', () => {
		const path = (u: string) => build(page({ u })).pathname
		expect([
			path('https://a.com/reset/q8Zr2LmN0pXv7TbK3sYw9Hc1'),
			path('https://a.com/unsubscribe/jane.doe%40mail.com'),
			path('https://a.com/#/invite/Ab12Cd34Ef56Gh78Ij90Kl12'),
			// slugs, product numbers and short ids stay
			path('https://a.com/blog/2026-10-25-how-we-count-visitors-without-cookies'),
			path('https://a.com/p/12345678'),
			path('https://a.com/orders/3f2b8c1e-9d4a-4f6e-8b7c-1a2b3c4d5e6f'),
		]).toEqual(['/reset/:token', '/unsubscribe/:email', '/#/invite/:token', '/blog/2026-10-25-how-we-count-visitors-without-cookies', '/p/12345678', '/orders/3f2b8c1e-9d4a-4f6e-8b7c-1a2b3c4d5e6f'])
	})

	it('leaves out a hash that is not a route', () => {
		expect([build(page({ u: 'https://a.com/docs#faq' })).pathname, build(page({ u: 'https://a.com/#access_token=abc' })).pathname]).toEqual(['/docs', '/'])
	})
})

describe('buildEvent currency (F10)', () => {
	it.each([
		[{ a: 19 }, 19, null],
		[{ a: 19, c: 'usd' }, 19, 'USD'],
		[{ a: 19, c: 'dollars' }, 19, null],
		[{ a: 19, c: 5 }, 19, null],
	])('$ %j gives revenue %s and currency %s', ($, revenue, currency) => {
		const row = build({ s: 'a', n: 'Purchase', u: 'https://a.com/', $ } as unknown as TrackerPayload)
		expect([row.revenue, row.currency]).toEqual([revenue, currency])
	})
})

describe('writing the same event twice (F3)', () => {
	async function write(db: ReturnType<typeof shardDb>, rows: EventRow[]) {
		const run = runner(db)
		const [open] = await run([openSessionsStmt('a', [...new Set(rows.map((r) => r.visitor_id))], Math.min(...rows.map((r) => r.ts)))])
		const { stmts } = assignSessions(rows, open as unknown as OpenSession[])
		for (const s of stmts) db.prepare(s.sql).run(...(s.params as never[]))
	}

	it('gives every event an id', () => {
		expect(build(page()).event_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
		expect(build(page()).event_id).not.toBe(build(page()).event_id)
	})

	it('keeps a client event id, so an SDK resend stores nothing twice', () => {
		const id = 'A1B2C3D4-0000-4000-8000-00000000000F'
		expect(build(page({ id })).event_id).toBe(id.toLowerCase())
		for (const bad of ['', 'x', 'a1b2c3d4-0000-4000-8000-00000000000f; DROP', 7]) {
			expect(build(page({ id: bad } as unknown as Partial<TrackerPayload>)).event_id).not.toBe(bad)
		}
	})

	it('stores an SDK event resent with the same id once', async () => {
		const db = shardDb()
		const id = '0f8e6a52-3c1d-4b2a-9e7f-5d4c3b2a1908'
		await write(db, [{ ...build(page({ id })), visitor_id: 'v1' }])
		await write(db, [{ ...build(page({ id })), visitor_id: 'v1' }])
		expect(db.prepare('SELECT COUNT(*) AS n FROM events').get()).toEqual({ n: 1 })
		expect(db.prepare('SELECT pageviews FROM sessions').all()).toEqual([{ pageviews: 1 }])
	})

	it('stores a retried event once and counts it once in its visit', async () => {
		const db = shardDb()
		const queued = { ...build(page()), visitor_id: 'v1' }
		await write(db, [structuredClone(queued)])
		await write(db, [structuredClone(queued)]) // the queue redelivers the same message
		expect(db.prepare('SELECT COUNT(*) AS n FROM events').get()).toEqual({ n: 1 })
		expect(db.prepare('SELECT COUNT(*) AS n, SUM(pageviews) AS pv FROM sessions').get()).toEqual({ n: 1, pv: 1 })
	})

	it('still counts two different events of one visit', async () => {
		const db = shardDb()
		await write(db, [{ ...build(page()), visitor_id: 'v1' }])
		await write(db, [{ ...build(page({ u: 'https://a.com/pricing' })), visitor_id: 'v1', ts: NOW + 1000 }])
		expect(db.prepare('SELECT COUNT(*) AS n FROM events').get()).toEqual({ n: 2 })
		expect(db.prepare('SELECT COUNT(*) AS n, SUM(pageviews) AS pv, MAX(exit_path) AS exit FROM sessions').get()).toEqual({ n: 1, pv: 2, exit: '/pricing' })
	})
})
