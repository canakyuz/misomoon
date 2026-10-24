// Every feature in the code is in the docs. Each test reads a list straight from the
// source (routes, settings, attributes, tools, exports) and names what the docs miss, so
// adding a feature without its docs fails `pnpm test`. AGENTS.md states the rule.
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vite-plus/test'
import { headingId, parseNav, resolveHref } from './server/render.ts'

const root = new URL('../../../../', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), 'utf8')
const docFiles = readdirSync(new URL('docs/', root)).filter((f) => f.endsWith('.md'))
const doc = (file: string) => read(`docs/${file}`)
const allDocs = docFiles.map(doc).join('\n')
// fails with one missing name per line, so the output says what to write
const none = (list: string[]) => expect(list.join('\n')).toBe('')
const missing = (names: Iterable<string>, text: string, wrap = (n: string) => n) => [...new Set(names)].filter((n) => !text.includes(wrap(n))).sort()

describe('the docs site', () => {
	const nav = parseNav(doc('README.md'))
	const listed = nav.sections.flatMap((s) => s.pages.map((p) => p.file))

	it('lists every page of docs/ in the docs/README.md sidebar, once', () => {
		none(docFiles.filter((f) => f !== 'README.md' && !listed.includes(f)))
		none(listed.filter((f, i) => listed.indexOf(f) !== i))
	})

	it('lists only pages that exist', () => {
		none(listed.filter((f) => !docFiles.includes(f)))
	})

	it('links only to files that exist, and to headings that exist', () => {
		const docs = new Set(docFiles)
		const ids = new Map(docFiles.map((f) => [f, new Set([...doc(f).matchAll(/^#{1,6} (.+)$/gm)].map((m) => headingId(m[1].replace(/`/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1'))))]))
		const broken: string[] = []
		for (const f of docFiles) {
			// links outside fenced code blocks
			const text = doc(f).replace(/```[\s\S]*?```/g, '')
			for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
				const href = m[1]
				if (/^[a-z]+:/i.test(href)) continue
				const r = resolveHref(href, docs)
				const [path, hash] = href.split('#')
				if (r.file) {
					if (r.id && !ids.get(r.file)!.has(r.id)) broken.push(`${f}: ${href} (no such heading)`)
				} else if (!path) {
					if (hash && !ids.get(f)!.has(hash)) broken.push(`${f}: ${href} (no such heading)`)
				} else {
					const repoPath = r.href.replace(/^https:\/\/github\.com\/jackzard\/misomoon\/(blob|tree)\/main\//, '').split('#')[0]
					try {
						readdirSync(new URL(repoPath, root))
					} catch (e) {
						try {
							readFileSync(new URL(repoPath, root))
						} catch {
							broken.push(`${f}: ${href} (no such file: ${repoPath}; ${(e as Error).message.split(':')[0]})`)
						}
					}
				}
			}
		}
		none(broken)
	})
})

describe('every feature is documented', () => {
	it('documents every binding, variable and secret of the Worker in configuration.md', () => {
		const names = [...read('apps/api/src/env.d.ts').matchAll(/^\s+([A-Z][A-Z0-9_]+)\??:/gm)].map((m) => m[1])
		expect(names.length).toBeGreaterThan(10)
		none(missing(names, doc('configuration.md'), (n) => `\`${n}\``))
	})

	it('documents every API route with its method and path', () => {
		const index = read('apps/api/src/index.ts')
		const routes = [...index.matchAll(/\bapp\.(get|post|put|patch|delete|all)\('([^']+)'/g)].map((m) => `${m[1].toUpperCase()} ${m[2]}`)
		const accounts = [...read('apps/api/src/accounts.ts').matchAll(/\baccounts\.(get|post|put|patch|delete)\('([^']+)'/g)].map((m) => `${m[1].toUpperCase()} /api/v1${m[2]}`)
		// catch-alls, and the OAuth redirect that only Google calls
		const internal = new Set(['ALL /api/*', 'ALL *', 'GET /api/v1/google/callback'])
		const all = [...routes, ...accounts].filter((r) => !internal.has(r)).map((r) => r.replace(/^ALL /, 'POST '))
		expect(all.length).toBeGreaterThan(60)
		none(missing(all, allDocs))
	})

	it('documents every MCP tool in mcp.md', () => {
		const tools = [...read('apps/api/src/tools.ts').matchAll(/^\t\tname: '([a-z_]+)'/gm)].map((m) => m[1])
		expect(tools.length).toBeGreaterThan(8)
		none(missing(tools, doc('mcp.md'), (t) => `\`${t}\``))
	})

	it('documents every tracker feature in tracking.md', () => {
		const features = read('packages/core/src/features.ts').match(/FEATURES = \[([^\]]+)\]/)![1].match(/'([a-z]+)'/g)!.map((s) => s.slice(1, -1))
		none(missing(features, doc('tracking.md'), (f) => `\`${f}\``))
	})

	it('documents every attribute the tracker reads', () => {
		const src = readdirSync(new URL('packages/tracker/src/x/', root))
			.map((f) => read(`packages/tracker/src/x/${f}`))
			.concat(read('packages/tracker/src/m.js'))
			.join('\n')
		const script = [...src.matchAll(/\bdata\.([a-zA-Z]+)/g)].map((m) => `data-${m[1].replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}`)
		const element = [...src.matchAll(/'(data-misomoon-[a-z]+)/g)].map((m) => m[1])
		none(missing([...script, ...element, 'data-prop-', 'data-manual', 'data-hash'], allDocs, (a) => `\`${a}`))
	})

	it('documents every entry point of the SDK in sdk.md', () => {
		const exports = Object.keys(JSON.parse(read('packages/sdk/package.json')).exports as Record<string, unknown>)
			.filter((k) => k !== '.' && k !== './package.json')
			.map((k) => `@misomoon/sdk/${k.slice(2)}`)
		expect(exports.length).toBeGreaterThan(2)
		none(missing(exports, doc('sdk.md'), (e) => `\`${e}\``))
	})

	it('documents every dashboard view and every settings tab in dashboard.md', () => {
		const views = [...read('apps/dashboard/src/lib/nav.ts').matchAll(/[a-z]+: \{ label: '([^']+)', icon:/g)].map((m) => m[1])
		const tabs = [...read('apps/dashboard/src/views/Settings.svelte').matchAll(/\{ id: '[a-z]+', label: '([^']+)', icon:/g)].map((m) => m[1])
		expect(views.length).toBeGreaterThan(5)
		expect(tabs.length).toBeGreaterThan(5)
		none(missing([...views, ...tabs], doc('dashboard.md'), (l) => `**${l}**`))
	})

	it('documents every email report and alert kind', () => {
		// the kinds POST /api/v1/sites/:id/reports accepts
		const kinds = read('apps/api/src/index.ts')
			.match(/\[([^\]]+)\]\.includes\(body\.kind \?\? ''\)/)![1]
			.match(/'([a-z]+)'/g)!
			.map((s) => s.slice(1, -1))
		expect(kinds.length).toBeGreaterThan(2)
		none(missing(kinds, doc('reports.md'), (k) => `\`${k}\``))
	})

	it('documents every team and guest role', () => {
		const roles = read('packages/core/src/roles.ts').match(/TEAM_ROLES = \[([^\]]+)\]/)![1].match(/'([a-z]+)'/g)!.map((s) => s.slice(1, -1))
		none(missing(roles, doc('teams.md'), (r) => `**${r[0].toUpperCase()}${r.slice(1)}**`))
	})

	it('documents every filter of the WordPress plugin in wordpress.md', () => {
		const dir = 'plugins/wordpress/misomoon/'
		const php = ['misomoon.php', ...readdirSync(new URL(`${dir}includes/`, root)).map((f) => `includes/${f}`)].filter((f) => f.endsWith('.php')).map((f) => read(dir + f)).join('\n')
		const hooks = [...php.matchAll(/\b(?:apply_filters|do_action)\(\s*'([a-z_]+)'/g)].map((m) => m[1])
		expect(hooks.length).toBeGreaterThan(2)
		none(missing(hooks, doc('wordpress.md'), (h) => `\`${h}\``))
	})

	it('documents every payment provider in revenue.md', () => {
		const providers = read('packages/core/src/payments.ts').match(/PROVIDERS = \[([^\]]+)\]/)![1].match(/'([a-z]+)'/g)!.map((s) => s.slice(1, -1))
		none(missing(providers, doc('revenue.md'), (p) => `\`${p}\``))
	})
})
