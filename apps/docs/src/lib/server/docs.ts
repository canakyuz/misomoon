import { createHighlighter } from 'shiki'
import { marksHtml } from '../guides.ts'
import { MOVED, parseNav, renderPage, slugOf, type Nav, type NavPage, type Rendered } from './render.ts'

// The pages are the repository's docs/ folder, read at build time: GitHub and the site
// show the same files, and docs/README.md is the sidebar.
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

let ready: Promise<Map<string, Rendered>> | undefined
/** Every page in docs/, rendered once per build. */
export function rendered(): Promise<Map<string, Rendered>> {
	ready ??= (async () => {
		const shiki = await createHighlighter({ themes: ['github-light', 'github-dark-dimmed'], langs: LANGS })
		const highlight = (code: string, lang: string) => {
			const l = ALIASES[lang] ?? lang
			return shiki.codeToHtml(code, {
				lang: l === 'text' || !shiki.getLoadedLanguages().includes(l) ? 'text' : l,
				themes: { light: 'github-light', dark: 'github-dark-dimmed' },
				defaultColor: false,
			})
		}
		const docs = new Set(sources.keys())
		// the page of all install guides shows each platform's mark beside its link
		const marks = (f: string) => marksHtml(slugOf(f))
		return new Map([...sources].map(([file, md]) => [slugOf(file), renderPage(file, md, docs, images, highlight, file === 'integrations.md' ? marks : undefined)]))
	})()
	return ready
}

export const editUrl = (file: string) => `https://github.com/jackzard/misomoon/edit/main/docs/${file}`
