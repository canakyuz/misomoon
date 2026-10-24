import { Marked, type Tokens } from 'marked'

export interface TocEntry {
	id: string
	text: string
	level: 2 | 3
}

export interface Rendered {
	html: string
	toc: TocEntry[]
	words: number
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c])

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' }
/** Text content of an HTML fragment. */
export function plain(html: string): string {
	return html.replace(/<[^>]*>/g, '').replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e: string) => ENTITIES[e])
}

/** The same heading ids as the docs site, so a link to a heading reads the same on both. */
export function headingId(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
		.replace(/ /g, '-')
}

/** Links may go to the web, to an email address, or to a path or heading on this site. */
export function safeHref(href: string): string | null {
	const h = href.trim()
	if (/^(https?:\/\/|mailto:|\/(?!\/)|#)/i.test(h)) return h
	return null
}

/**
 * Renders the Markdown of a post or page. Raw HTML in the Markdown is printed as text,
 * a link with another scheme (`javascript:`) loses its href, and a level-1 heading
 * becomes a level-2 one, because the page title is the only h1.
 */
export function render(md: string): Rendered {
	const toc: TocEntry[] = []
	const used = new Map<string, number>()
	const marked = new Marked({
		gfm: true,
		renderer: {
			html({ text }) {
				return escape(text)
			},
			heading({ tokens, depth }) {
				const level = Math.max(2, depth)
				const inner = this.parser.parseInline(tokens)
				const base = headingId(plain(inner)) || 'section'
				const n = used.get(base) ?? 0
				used.set(base, n + 1)
				const id = n ? `${base}-${n}` : base
				if (level <= 3) toc.push({ id, text: plain(inner), level: level as 2 | 3 })
				return `<h${level} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true" tabindex="-1">#</a>${inner}</h${level}>\n`
			},
			link({ href, title, tokens }) {
				const inner = this.parser.parseInline(tokens)
				const safe = safeHref(href)
				if (!safe) return inner
				const external = /^https?:/i.test(safe)
				return `<a href="${escape(safe)}"${title ? ` title="${escape(title)}"` : ''}${external ? ' rel="noopener"' : ''}>${inner}</a>`
			},
			image({ href, title, text }) {
				const safe = safeHref(href)
				if (!safe || safe.startsWith('mailto:')) return escape(text)
				return `<img src="${escape(safe)}" alt="${escape(text)}"${title ? ` title="${escape(title)}"` : ''} loading="lazy" decoding="async" />`
			},
			code({ text, lang }) {
				const l = (lang ?? '').split(/\s/)[0]
				return `<pre class="code"${l ? ` data-lang="${escape(l)}"` : ''}><code>${escape(text)}</code></pre>\n`
			},
			table(token: Tokens.Table) {
				const cell = (c: Tokens.TableCell, tag: 'th' | 'td') => `<${tag}${c.align ? ` align="${c.align}"` : ''}>${this.parser.parseInline(c.tokens)}</${tag}>`
				const head = `<tr>${token.header.map((c) => cell(c, 'th')).join('')}</tr>`
				const body = token.rows.map((r) => `<tr>${r.map((c) => cell(c, 'td')).join('')}</tr>`).join('\n')
				return `<div class="table"><table>\n<thead>\n${head}\n</thead>\n${body ? `<tbody>\n${body}\n</tbody>\n` : ''}</table></div>\n`
			},
		},
	})
	const html = marked.parse(md, { async: false }) as string
	const words = plain(html.replace(/<a class="anchor"[^>]*>#<\/a>/g, '')).split(/\s+/).filter(Boolean).length
	return { html, toc, words }
}
