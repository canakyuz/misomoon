import { Marked, type Tokens } from 'marked'

export const REPO = 'https://github.com/jackzard/misomoon'
export const SITE = 'https://misomoon.com'

/**
 * Pages of docs/ that misomoon.com shows instead of this site: the legal pages, which
 * the landing renders from the same files, and the comparison, which the landing's
 * /alternatives pages cover. The sidebar and every link in the docs send readers there.
 */
export const MOVED: Record<string, string> = {
	'privacy.md': `${SITE}/privacy`,
	'terms.md': `${SITE}/terms`,
	'dpa.md': `${SITE}/dpa`,
	'security.md': `${SITE}/security`,
	'comparison.md': `${SITE}/alternatives`,
}

export interface NavPage {
	file: string
	slug: string
	/** `/tracking` on this site, or the misomoon.com URL of a moved page */
	href: string
	title: string
	description: string
}
export interface NavSection {
	title: string
	pages: NavPage[]
}
export interface Nav {
	title: string
	intro: string
	sections: NavSection[]
}
export interface TocEntry {
	depth: 2 | 3
	id: string
	text: string
}
/** One heading's worth of a page, for search. */
export interface SearchSection {
	heading: string
	id: string
	text: string
}
export interface Rendered {
	title: string
	description: string
	html: string
	toc: TocEntry[]
	sections: SearchSection[]
	/** every link and image in the page, resolved, so a test can check that each one lands */
	links: { href: string; file: string | null; id: string | null }[]
}
/** Code to HTML; `lang` may be empty or unknown. */
export type Highlight = (code: string, lang: string) => string

/** The page's URL path for a file in docs/: `self-hosting.md` is `/self-hosting`, the README is `/`. */
export function slugOf(file: string): string {
	return file === 'README.md' ? '' : file.replace(/\.md$/, '').toLowerCase()
}

/** The id GitHub gives a heading, so links written for GitHub land on the site too. */
export function headingId(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
		.replace(/ /g, '-')
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' }
/** Text content of an HTML fragment. */
export function plain(html: string): string {
	return html
		.replace(/<[^>]*>/g, '')
		.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e: string) => ENTITIES[e])
		.replace(/\s+/g, ' ')
		.trim()
}

/**
 * The sidebar, read from docs/README.md: each `##` heading is a section, and each list
 * item in it a page, written `[Title](file.md): what it covers`.
 */
export function parseNav(readme: string): Nav {
	const tokens = new Marked().lexer(readme)
	const nav: Nav = { title: '', intro: '', sections: [] }
	for (const t of tokens) {
		if (t.type === 'heading' && t.depth === 1) nav.title = t.text
		else if (t.type === 'heading' && t.depth === 2) nav.sections.push({ title: t.text, pages: [] })
		else if (t.type === 'paragraph' && !nav.sections.length) nav.intro = [nav.intro, t.text].filter(Boolean).join(' ')
		else if (t.type === 'list' && nav.sections.length) {
			for (const item of (t as Tokens.List).items) {
				const m = item.text.replace(/\s+/g, ' ').match(/^\[([^\]]+)\]\(([^)#\s]+\.md)\)\s*:?\s*(.*)$/)
				if (!m) throw new Error(`docs/README.md: a list item is not "[Title](file.md): description": ${item.text}`)
				const [, title, file, description] = m
				nav.sections.at(-1)!.pages.push({ file, slug: slugOf(file), href: MOVED[file] ?? `/${slugOf(file)}`, title, description: description.replace(/\.$/, '') })
			}
		}
	}
	return nav
}

/**
 * Where a link in `docs/<from>` goes on the site. Other pages in docs/ become site paths,
 * a moved page goes to misomoon.com, files elsewhere in the repo open on GitHub, and
 * everything else is left alone.
 */
export function resolveHref(href: string, docs: Set<string>): { href: string; file: string | null; id: string | null } {
	if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) return { href, file: null, id: null }
	const [path, hash = ''] = href.split('#')
	if (!path) return { href, file: null, id: hash || null }
	const clean = path.replace(/^\.\//, '')
	// still a file of docs/, so its headings are checked; the landing renders legal pages
	// with the same heading ids, and /alternatives has none of the comparison's
	if (MOVED[clean]) {
		const id = hash && clean !== 'comparison.md' ? hash : null
		return { href: `${MOVED[clean]}${id ? `#${id}` : ''}`, file: clean, id }
	}
	if (!clean.includes('/') && docs.has(clean)) return { href: `/${slugOf(clean)}${hash ? `#${hash}` : ''}`, file: clean, id: hash || null }
	// a path outside docs/: resolve it against docs/ and open it in the repository
	const parts = ['docs']
	for (const seg of clean.split('/')) {
		if (seg === '..') parts.pop()
		else if (seg && seg !== '.') parts.push(seg)
	}
	const kind = /\.[a-z0-9]+$/i.test(parts.at(-1) ?? '') ? 'blob' : 'tree'
	return { href: `${REPO}/${kind}/main/${parts.join('/')}${hash ? `#${hash}` : ''}`, file: null, id: null }
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * Renders one page of docs/. `docs` names every file in docs/, `images` maps `images/x.png`
 * to its URL, and `marks` gives the icon HTML a link to a page of docs/ starts with.
 */
export function renderPage(file: string, md: string, docs: Set<string>, images: Record<string, string>, highlight: Highlight, marks: (file: string) => string = () => ''): Rendered {
	const toc: TocEntry[] = []
	const links: Rendered['links'] = []
	const used = new Map<string, number>()
	let title = ''
	const marked = new Marked({
		gfm: true,
		renderer: {
			heading({ tokens, depth }) {
				const inner = this.parser.parseInline(tokens)
				const text = plain(inner)
				if (depth === 1) {
					title ||= text
					return ''
				}
				const base = headingId(text)
				const n = used.get(base) ?? 0
				used.set(base, n + 1)
				const id = n ? `${base}-${n}` : base
				if (depth === 2 || depth === 3) toc.push({ depth, id, text })
				return `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true" tabindex="-1">#</a>${inner}</h${depth}>\n`
			},
			link({ href, title: t, tokens }) {
				const r = resolveHref(href, docs)
				links.push(r)
				const external = /^https?:/.test(r.href) && !r.href.startsWith(REPO + '/blob/main/docs/')
				const icon = r.file ? marks(r.file) : ''
				return `<a href="${escape(r.href)}"${t ? ` title="${escape(t)}"` : ''}${external ? ' rel="noopener"' : ''}${icon ? ' class="marked"' : ''}>${icon}${this.parser.parseInline(tokens)}</a>`
			},
			image({ href, title: t, text }) {
				const src = images[href.replace(/^\.\//, '')] ?? href
				links.push({ href: src, file: null, id: null })
				return `<img src="${escape(src)}" alt="${escape(text)}"${t ? ` title="${escape(t)}"` : ''} loading="lazy" />`
			},
			code({ text, lang }) {
				const l = (lang ?? '').split(/\s/)[0]
				return `<div class="code"><div class="code-bar"><span>${escape(l || 'text')}</span><button type="button" data-copy>Copy</button></div>${highlight(text, l)}</div>\n`
			},
			table(token) {
				// keep the default table, scrollable on a phone
				return `<div class="table">${tableHtml(this, token)}</div>\n`
			},
		},
	})
	const html = marked.parse(md, { async: false }) as string
	// the first paragraph, for the page description
	const first = new Marked().lexer(md).find((t) => t.type === 'paragraph') as Tokens.Paragraph | undefined
	const description = first ? plain(new Marked().parseInline(first.text, { async: false }) as string) : ''
	return { title: title || file, description, html, toc, sections: splitSections(html, title), links }
}

// marked's own table markup: the renderer above only wraps it
function tableHtml(self: { parser: { parseInline: (t: Tokens.Generic[]) => string } }, token: Tokens.Table): string {
	const cell = (c: Tokens.TableCell, tag: 'th' | 'td') => `<${tag}${c.align ? ` align="${c.align}"` : ''}>${self.parser.parseInline(c.tokens)}</${tag}>`
	const head = `<tr>${token.header.map((c) => cell(c, 'th')).join('')}</tr>`
	const body = token.rows.map((r) => `<tr>${r.map((c) => cell(c, 'td')).join('')}</tr>`).join('\n')
	return `<table>\n<thead>\n${head}\n</thead>\n${body ? `<tbody>\n${body}\n</tbody>\n` : ''}</table>`
}

/** The page cut at each h2 and h3, as plain text. */
function splitSections(html: string, title: string): SearchSection[] {
	const out: SearchSection[] = []
	const re = /<h([23]) id="([^"]+)">([\s\S]*?)<\/h\1>/g
	let last = 0
	let current: SearchSection = { heading: title, id: '', text: '' }
	for (let m = re.exec(html); m; m = re.exec(html)) {
		current.text = plain(html.slice(last, m.index))
		out.push(current)
		current = { heading: plain(m[3]).replace(/^#/, ''), id: m[2], text: '' }
		last = m.index + m[0].length
	}
	current.text = plain(html.slice(last))
	out.push(current)
	return out.filter((s) => s.text || s.id)
}
