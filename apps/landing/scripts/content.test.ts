import { execFile } from 'node:child_process'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vite-plus/test'

const script = fileURLToPath(new URL('./content.ts', import.meta.url))

describe('pnpm content', () => {
	it('names the status when the server answers with a page instead of JSON', async () => {
		const server = createServer((_, res) => res.writeHead(404, { 'content-type': 'text/html' }).end('<!doctype html><h1>Not found</h1>'))
		await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok))
		const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
		const run = promisify(execFile)(process.execPath, ['--experimental-strip-types', script, 'delete', 'post', 'hello'], { env: { ...process.env, CONTENT_URL: url, CONTENT_TOKEN: 't' } })
		const err = await run.then(() => null, (e: { code: number; stderr: string }) => e)
		server.close()
		expect(err?.code).toBe(1)
		expect(err?.stderr.trim().split('\n').at(-1)).toBe('DELETE /api/entries/post/hello: 404 <!doctype html><h1>Not found</h1>')
	})
})
