import { createHighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import { marksHtml } from '../guides.ts'
import { MOVED, parseNav, renderPage, slugOf, type Nav, type NavPage, type Rendered } from './render.ts'

// The pages are the repository's docs/ folder, bundled into the Worker at build time:
// GitHub and the site show the same files, and docs/README.md is the sidebar.
const raw = import.meta.glob('../../../../../docs/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const imageUrls = import.meta.glob('../../../../../docs/images/*', { query: '?url', import: 'default', eager: true }) as Record<string, string>

export const sources = new Map(Object.entries(raw).map(([path, md]) => [path.split('/').pop()!, md]))
const images = Object.fromEntries(Object.entries(imageUrls).map(([path, url]) => [`images/${path.split('/').pop()}`, url]))

export const nav: Nav = parseNav(sources.get('README.md') ?? '')
/** The pages this site builds, in sidebar order: all of them except the moved ones. */
export const pages: NavPage[] = nav.sections.flatMap((s) => s.pages).filter((p) => !MOVED[p.file])
/** The files of docs/ this site builds a page for. */
export const built = [...sources.keys()].filter((f) => f !== 'README.md' && !MOVED[f])

export const LANGS = ['html', 'js', 'jsx', 'ts', 'tsx', 'json', 'jsonc', 'sh', 'shellscript', 'svelte', 'css', 'sql', 'yaml', 'toml', 'nginx', 'diff', 'http', 'markdown', 'php']
export const ALIASES: Record<string, string> = { bash: 'sh', shell: 'sh', zsh: 'sh', console: 'sh', md: 'markdown', caddyfile: 'text', text: 'text', txt: 'text', '': 'text' }

// Only these grammars and themes go into the Worker, and the JavaScript regex engine
// highlights without WebAssembly.
let shiki: Promise<(code: string, lang: string) => string> | undefined
function highlighter() {
	shiki ??= (async () => {
		const h = await createHighlighterCore({
			themes: [import('shiki/themes/github-light.mjs'), import('shiki/themes/github-dark-dimmed.mjs')],
			langs: [
				import('shiki/langs/html.mjs'),
				import('shiki/langs/javascript.mjs'),
				import('shiki/langs/jsx.mjs'),
				import('shiki/langs/typescript.mjs'),
				import('shiki/langs/tsx.mjs'),
				import('shiki/langs/json.mjs'),
				import('shiki/langs/jsonc.mjs'),
				import('shiki/langs/shellscript.mjs'),
				import('shiki/langs/svelte.mjs'),
				import('shiki/langs/css.mjs'),
				import('shiki/langs/sql.mjs'),
				import('shiki/langs/yaml.mjs'),
				import('shiki/langs/toml.mjs'),
				import('shiki/langs/nginx.mjs'),
				import('shiki/langs/diff.mjs'),
				import('shiki/langs/http.mjs'),
				import('shiki/langs/markdown.mjs'),
				import('shiki/langs/php.mjs'),
			],
			engine: createJavaScriptRegexEngine(),
		})
		return (code: string, lang: string) => {
			const l = ALIASES[lang] ?? lang
			return h.codeToHtml(code, {
				lang: l === 'text' || !h.getLoadedLanguages().includes(l) ? 'text' : l,
				themes: { light: 'github-light', dark: 'github-dark-dimmed' },
				defaultColor: false,
			})
		}
	})()
	return shiki
}

const docs = new Set(sources.keys())
// the page of all install guides shows each platform's mark beside its link
const marks = (f: string) => marksHtml(slugOf(f))
const done = new Map<string, Rendered>()

/** One page of docs/, rendered on its first request and kept for the life of the Worker; null when there is no such page. */
export async function page(slug: string): Promise<Rendered | null> {
	const hit = done.get(slug)
	if (hit) return hit
	const file = built.find((f) => slugOf(f) === slug)
	if (!file) return null
	const r = renderPage(file, sources.get(file)!, docs, images, await highlighter(), file === 'integrations.md' ? marks : undefined)
	done.set(slug, r)
	return r
}

/** Every page this site serves, for the search index. */
export async function rendered(): Promise<Map<string, Rendered>> {
	const all = new Map<string, Rendered>()
	for (const f of built) all.set(slugOf(f), (await page(slugOf(f)))!)
	return all
}

export const editUrl = (file: string) => `https://github.com/jackzard/misomoon/edit/main/docs/${file}`
