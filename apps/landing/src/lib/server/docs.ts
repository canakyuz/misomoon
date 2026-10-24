// The docs pages, for the sitemap and the llms files: the docs site builds them from the
// same docs/ folder, and docs/README.md is its sidebar. misomoon.com holds the site-wide
// files for both hosts.
import { isLegal } from '#lib/legal.ts'
import { docLink } from '#lib/links.ts'
import { worker } from './platform.ts'

const FILES = import.meta.glob<string>('../../../../../docs/*.md', { query: '?raw', import: 'default', eager: true })
const REPO = 'https://github.com/jackzard/misomoon'

/** Pages of docs/ the docs site doesn't build, other than the legal pages, and where misomoon.com shows them. */
const ELSEWHERE: Record<string, string> = { 'comparison.md': '/alternatives' }

export interface DocPage {
	file: string
	/** `self-hosting`, `proxy`: the page's path on the docs site */
	slug: string
	title: string
	description: string
	/** the Markdown source */
	md: string
}

export interface DocSection {
	title: string
	pages: DocPage[]
}

/** Where the docs site lives (PUBLIC_DOCS_URL), or null: docs links then open on GitHub. */
export const docsUrlOf = (platform: App.Platform | undefined): string | null =>
	(worker(platform).env.PUBLIC_DOCS_URL ?? process.env.PUBLIC_DOCS_URL ?? '').replace(/\/$/, '') || null

export const slugOf = (file: string) => file.replace(/\.md$/, '').toLowerCase()

/** The Markdown of one file of docs/, such as `dpa.md`. */
export const source = (file: string, files: Record<string, string> = FILES): string | null => Object.entries(files).find(([path]) => path.endsWith(`/${file}`))?.[1] ?? null

/** Reads the sidebar: `## Section` headings over `- [Title](file.md): description` items. */
export function sections(files: Record<string, string> = FILES): DocSection[] {
	const byName = new Map(Object.entries(files).map(([path, md]) => [path.split('/').pop()!, md]))
	const readme = (byName.get('README.md') ?? '').replace(/\n {2,}/g, ' ')
	const out: DocSection[] = []
	for (const line of readme.split('\n')) {
		const h = /^## (.+)$/.exec(line)
		if (h) out.push({ title: h[1].trim(), pages: [] })
		const m = /^- \[([^\]]+)\]\(([^)#\s]+\.md)\):?\s*(.*)$/.exec(line)
		if (!m || !out.length) continue
		const [, title, file, description] = m
		if (isLegal(slugOf(file)) || ELSEWHERE[file] || !byName.has(file)) continue
		out.at(-1)!.pages.push({ file, slug: slugOf(file), title, description: description.replace(/\.$/, ''), md: byName.get(file)! })
	}
	return out.filter((s) => s.pages.length)
}

/**
 * Makes the links of a docs page absolute, for a file read outside the docs site: another
 * page goes to the docs site (a legal page to misomoon.com), and a file elsewhere in the
 * repository, such as an image or a source file, opens on GitHub.
 */
export function absolute(md: string, origin: string, docsUrl: string | null): string {
	return md.replace(/\]\((?!https?:|mailto:|#)([^)\s]+)\)/g, (_, href: string) => {
		const [path, hash] = href.split('#')
		const tail = hash ? `#${hash}` : ''
		const page = /^(?:\.\/)?([A-Za-z0-9-]+)\.md$/.exec(path)?.[1]
		if (page) {
			// /alternatives has none of the comparison's headings
			if (ELSEWHERE[`${page}.md`]) return `](${origin}${ELSEWHERE[`${page}.md`]})`
			const to = isLegal(page) ? `${origin}/${page}` : docsUrl ? `${docsUrl}/${slugOf(page)}` : docLink(null, page)
			return `](${to}${tail})`
		}
		const parts = ['docs']
		for (const seg of path.split('/')) {
			if (seg === '..') parts.pop()
			else if (seg && seg !== '.') parts.push(seg)
		}
		const kind = /\.[a-z0-9]+$/i.test(parts.at(-1) ?? '') ? 'blob' : 'tree'
		return `](${REPO}/${kind}/main/${parts.join('/')}${tail})`
	})
}
