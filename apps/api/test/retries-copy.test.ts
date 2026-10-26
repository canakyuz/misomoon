// The queue consumer matches the rows writeEvents says failed to the batch's messages. If
// writeEvents ever hands back copies, nothing may be acked that was not written.
import { describe, expect, it, vi } from 'vite-plus/test'
import { invalidate } from '../src/control'
import { fakeCtx, fakeEnv, OWNER, type FakeEnv } from './fake'

vi.mock('@misomoon/tracker/m.min.js', () => ({ default: '/* m.js */' }))
vi.mock('../src/ingest', async (load) => {
	const real = await load<typeof import('../src/ingest')>()
	return {
		...real,
		writeEvents: (env: Env, all: Parameters<typeof real.writeEvents>[1], failed?: Parameters<typeof real.writeEvents>[2]) =>
			real.writeEvents(env, all, failed && ((rows, e) => failed(rows.map((r) => ({ ...r })), e))),
	}
})
const { default: worker } = await import('../src/index')

const UA = 'Mozilla/5.0 (Macintosh) Chrome/141.0.0.0 Safari/537.36'

async function call(env: FakeEnv, method: string, path: string, body: unknown, headers: Record<string, string> = OWNER) {
	const ctx = fakeCtx()
	const res = await worker.fetch(new Request(`https://app.test${path}`, { method, headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }), env as unknown as Env, ctx as unknown as ExecutionContext)
	await ctx.settle()
	return res
}

describe('a failed shard group handed back as copies', () => {
	it('retries the whole batch instead of acking what it cannot match', async () => {
		invalidate('')
		const env = fakeEnv()
		for (const domain of ['shop.com', 'blog.com']) expect((await call(env, 'POST', '/api/v1/sites', { domain })).status).toBe(201)
		const sent: unknown[] = []
		env.EVENTS = { send: async (body) => void sent.push(body) }
		for (const [host, ip] of [['shop.com', '198.51.100.1'], ['blog.com', '198.51.100.2']])
			expect((await call(env, 'POST', '/api/event', { s: host.replace('.', '-'), n: 'pageview', u: `https://${host}/` }, { 'user-agent': UA, 'cf-connecting-ip': ip })).status).toBe(202)
		for (const db of [env.SHARD_0, env.SHARD_1]) {
			const batch = db.batch.bind(db)
			db.batch = async (stmts) => {
				if (stmts.some((s) => s.params.includes('blog-com'))) throw new Error('D1_ERROR: shard is busy')
				return batch(stmts)
			}
		}
		vi.spyOn(console, 'error').mockImplementation(() => {})
		const out = { ackAll: 0, retryAll: 0, acked: [] as number[], retried: [] as number[] }
		const messages = sent.map((body, i) => ({ body, ack: () => void out.acked.push(i), retry: () => void out.retried.push(i) }))
		await worker.queue!({ messages, ackAll: () => void out.ackAll++, retryAll: () => void out.retryAll++ } as unknown as MessageBatch<never>, env as unknown as Env, fakeCtx() as unknown as ExecutionContext)
		expect(out).toEqual({ ackAll: 0, retryAll: 1, acked: [], retried: [] })
	})
})
