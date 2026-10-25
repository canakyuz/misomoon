// Writes content to a misomoon.com landing through its API.
//
//   pnpm content publish <file.md> [more.md...]   create or replace posts, pages and authors
//   pnpm content delete <post|page|author> <slug>
//
// CONTENT_URL is the landing (default http://localhost:5174), CONTENT_TOKEN its token.
// docs/content.md has the front matter keys.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseFile } from '../src/lib/frontmatter.ts'

const base = (process.env.CONTENT_URL ?? 'http://localhost:5174').replace(/\/$/, '')
const token = process.env.CONTENT_TOKEN
const [cmd, ...args] = process.argv.slice(2)

function usage(): never {
	console.error('usage: pnpm content publish <file.md>... | pnpm content delete <post|page|author> <slug>')
	process.exit(2)
}

async function call(method: string, path: string, body?: unknown) {
	const res = await fetch(base + path, {
		method,
		headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
		body: body ? JSON.stringify(body) : undefined,
	})
	const text = await res.text()
	let json: { error?: string; warnings?: string[] } = {}
	try {
		if (text) json = JSON.parse(text)
	} catch {
		// an error page from a proxy or the wrong CONTENT_URL; the status and text say enough
	}
	if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${json.error ?? text}`)
	return { status: res.status, json }
}

if (!token) {
	console.error('Set CONTENT_TOKEN to the token of the landing at ' + base)
	process.exit(2)
}

let failed = 0
if (cmd === 'publish' && args.length) {
	// authors first, so a post can name an author published in the same run
	// pnpm runs this in apps/landing; INIT_CWD is where the command was typed, which the paths are relative to
	const files = args.map((f) => parseFile(readFileSync(resolve(process.env.INIT_CWD ?? '.', f), 'utf8'), f)).sort((a, b) => Number(b.kind === 'author') - Number(a.kind === 'author'))
	for (const f of files) {
		const path = f.kind === 'author' ? `/api/authors/${f.slug}` : `/api/entries/${f.kind}/${f.slug}`
		try {
			const { status, json } = await call('PUT', path, f.body)
			console.log(`${status === 201 ? 'created' : 'updated'}  ${f.kind} ${f.slug}`)
			for (const w of json.warnings ?? []) console.log(`  warning: ${w}`)
		} catch (e) {
			failed++
			console.error(`failed   ${(e as Error).message}`)
		}
	}
} else if (cmd === 'delete' && args.length === 2) {
	const [kind, slug] = args
	try {
		await call('DELETE', kind === 'author' ? `/api/authors/${slug}` : `/api/entries/${kind}/${slug}`)
		console.log(`deleted  ${kind} ${slug}`)
	} catch (e) {
		failed++
		console.error((e as Error).message)
	}
} else usage()
process.exit(failed ? 1 : 0)
