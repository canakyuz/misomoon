// End-to-end test of the WordPress plugin: real WordPress and WooCommerce in WordPress
// Playground (PHP compiled to WebAssembly, no PHP install needed), talking to a fake
// misomoon on a free port that records requests and checks the webhook signature.
//
//   node plugins/wordpress/test/run.mjs [--php=8.3]
//
// It downloads WordPress and WooCommerce, so it needs the network and takes a minute or
// two. It isn't part of `pnpm test` for that reason.

import { spawn } from 'node:child_process'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))
const php = process.argv.find((a) => a.startsWith('--php='))?.slice(6) ?? '8.3'
const SECRET = 'whsec_test'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'

const log = []
const fake = createServer((req, res) => {
	let body = ''
	req.on('data', (c) => (body += c))
	req.on('end', () => {
		const url = new URL(req.url, 'http://x')
		const rec = { method: req.method, path: url.pathname, query: url.search, headers: req.headers, body }
		log.push(rec)
		if (url.pathname.startsWith('/api/webhooks/custom/')) {
			const want = 'sha256=' + createHmac('sha256', SECRET).update(body).digest('hex')
			const got = String(req.headers['x-misomoon-signature'] ?? '')
			rec.signed = got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want))
			return res.writeHead(rec.signed ? 200 : 401).end()
		}
		if (url.pathname === '/m.js' || url.pathname === '/overlay.js') {
			res.writeHead(200, { 'content-type': 'application/javascript' })
			return res.end(`/* ${url.pathname}${url.search} */`)
		}
		res.writeHead(url.pathname === '/api/event' ? 202 : 404).end()
	})
})
// free ports, so a dev server already on a common port can't answer in misomoon's place
await new Promise((r) => fake.listen(0, '127.0.0.1', r))
const upstream = `http://127.0.0.1:${fake.address().port}`
const wpPort = await new Promise((r) => {
	const probe = createServer().listen(0, '127.0.0.1', () => {
		const { port } = probe.address()
		probe.close(() => r(port))
	})
})
const WP = `http://127.0.0.1:${wpPort}`
const blueprint = join(mkdtempSync(join(tmpdir(), 'misomoon-wp-')), 'blueprint.json')
writeFileSync(blueprint, readFileSync(here('blueprint.json'), 'utf8').replace('http://misomoon.invalid', upstream))

const wp = spawn(
	'npx',
	[
		'-y',
		'@wp-playground/cli@latest',
		'server',
		`--port=${wpPort}`,
		`--php=${php}`,
		`--blueprint=${blueprint}`,
		`--mount=${here('../misomoon')}:/wordpress/wp-content/plugins/misomoon`,
		`--mount=${here('mu-plugins')}:/wordpress/wp-content/mu-plugins`,
	],
	{ stdio: ['ignore', 'pipe', 'pipe'] },
)
let output = ''
wp.stdout.on('data', (d) => (output += d))
wp.stderr.on('data', (d) => (output += d))

let failed = 0
const check = async (name, fn) => {
	try {
		await fn()
		console.log(`ok    ${name}`)
	} catch (e) {
		failed++
		console.log(`FAIL  ${name}\n      ${String(e.message).split('\n').join('\n      ')}`)
	}
}

try {
	const started = Date.now()
	while (!output.includes('Ready!')) {
		if (wp.exitCode !== null || Date.now() - started > 300_000) throw new Error(`Playground did not start:\n${output}`)
		await new Promise((r) => setTimeout(r, 500))
	}
	console.log(`WordPress is up on PHP ${php}\n`)

	await check('a guest page loads the tracker through the proxy', async () => {
		const html = await (await fetch(WP + '/')).text()
		assert.ok(html.includes(`<script defer src="${WP}/wp-json/mm-relay/v1/m.js?s=shop-com" data-api="${WP}/wp-json/mm-relay/v1/api/event"></script>`), 'no proxied script tag in <head>')
	})

	await check('the proxy serves m.js for the configured site only, as JavaScript', async () => {
		const res = await fetch(WP + '/wp-json/mm-relay/v1/m.js?s=another-site')
		assert.equal(res.headers.get('content-type'), 'application/javascript; charset=utf-8')
		assert.equal(await res.text(), '/* /m.js?s=shop-com */')
		assert.equal(await (await fetch(WP + '/wp-json/mm-relay/v1/overlay.js')).text(), '/* /overlay.js */')
	})

	await check("the proxy forwards a beacon with the visitor's address, country and language", async () => {
		const res = await fetch(WP + '/wp-json/mm-relay/v1/api/event', {
			method: 'POST',
			headers: { 'content-type': 'text/plain', 'user-agent': UA, 'cf-connecting-ip': '203.0.113.9', 'cf-ipcountry': 'de', 'accept-language': 'de-DE' },
			body: '{"s":"shop-com","u":"https://shop.com/","w":1440}',
		})
		assert.equal(res.status, 202)
		const ev = log.find((r) => r.path === '/api/event' && r.body.includes('"w":1440'))
		assert.ok(ev, 'no beacon reached misomoon')
		assert.deepEqual(
			{ ua: ev.headers['user-agent'], ip: ev.headers['x-misomoon-ip'], country: ev.headers['x-misomoon-country'], lang: ev.headers['accept-language'] },
			{ ua: UA, ip: '203.0.113.9', country: 'DE', lang: 'de-DE' },
		)
	})

	await check('the proxy drops a beacon over 16 KB', async () => {
		const before = log.length
		const res = await fetch(WP + '/wp-json/mm-relay/v1/api/event', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'a'.repeat(20_000) })
		assert.equal(res.status, 202)
		assert.equal(log.slice(before).filter((r) => r.path === '/api/event').length, 0)
	})

	await check('editors get no tracker; the settings page keeps the secret hidden and rejects a bad site id', async () => {
		const r = await (await fetch(WP + '/wp-json/mmtest/v1/admin')).json()
		assert.deepEqual(
			{ guest: r.guest, admin: r.admin, tag: r.page_has_tag, secret: r.secret_printed, site: r.sanitized.site, kept: r.sanitized.secret, errors: r.errors },
			{ guest: true, admin: false, tag: true, secret: false, site: 'shop-com', kept: SECRET, errors: ['site'] },
		)
	})

	await check('a WooCommerce order gets a ref from the visit of the buyer and is sent once, signed; its refund follows', async () => {
		const before = log.length
		const r = await (await fetch(WP + '/wp-json/mmtest/v1/order', { method: 'POST' })).json()
		const sent = log.slice(before)
		assert.match(r.ref, /^mm_[0-9a-f]{24}$/)
		assert.equal(r.sent, 'yes')
		const beacon = sent.find((x) => x.path === '/api/event')
		assert.equal(beacon.headers['x-misomoon-ip'], '198.51.100.7')
		assert.equal(JSON.parse(beacon.body).k, r.ref)
		const hooks = sent.filter((x) => x.path === '/api/webhooks/custom/shop-com')
		assert.ok(hooks.every((h) => h.signed), 'a webhook failed the signature check')
		assert.deepEqual(
			hooks.map((h) => JSON.parse(h.body)).map(({ ts, ...rest }) => rest),
			[
				{ id: `wc_${r.order}`, amount: 49.9, currency: 'EUR', ref: r.ref, billing: 'one_time' },
				{ id: `wc_refund_${r.refund}`, type: 'refund', refund_of: `wc_${r.order}`, amount: 10, currency: 'EUR' },
			],
		)
	})
} catch (e) {
	failed++
	console.log(String(e.message))
} finally {
	wp.kill()
	fake.close()
}

if (/Fatal error|RuntimeError/.test(output)) {
	failed++
	console.log(`\nPHP errors in the Playground output:\n${output.split('\n').filter((l) => /Fatal|RuntimeError|Warning/.test(l)).join('\n')}`)
}
console.log(failed ? `\n${failed} failed` : '\nall passed')
process.exit(failed ? 1 : 0)
