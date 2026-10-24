// The legal pages: /privacy, /terms, /dpa and /security. Their text is docs/*.md, read at
// build time, so the docs folder stays the one place to change it.
import { LEGAL, isLegal, type Legal } from '#lib/legal.ts'
import { docLink } from '#lib/links.ts'
import { render, type Rendered } from './markdown.ts'

export { LEGAL, isLegal, type Legal }

const FILES = import.meta.glob<string>('../../../../../docs/{privacy,terms,dpa,security}.md', { query: '?raw', import: 'default', eager: true })

const DESCRIPTIONS: Record<Legal, string> = {
	privacy: 'The personal data misomoon keeps about you as a customer, why, for how long, and your rights.',
	terms: 'The terms for using misomoon Cloud: your account, plans, acceptable use, and liability.',
	dpa: 'The data processing agreement between you and misomoon for the visitor data misomoon Cloud processes.',
	security: 'How misomoon Cloud protects your data, and how to report a vulnerability.',
}

export interface LegalPage extends Rendered {
	slug: Legal
	title: string
	description: string
	/** The text still has a "**Draft.**" note, so search engines skip it. */
	draft: boolean
}

/**
 * A link to another docs file becomes a landing path when it is a legal page, and a
 * docs-site link otherwise: `dpa.md#9-breaches` → `/dpa#9-breaches`, `teams.md` →
 * `https://docs.misomoon.com/teams`.
 */
export function relink(md: string, docsUrl: string | null): string {
	return md.replace(/\]\(([a-z0-9-]+)\.md(#[^)\s]*)?\)/g, (_, page: string, hash = '') => `](${isLegal(page) ? `/${page}` : docLink(docsUrl, page)}${hash})`)
}

export function legalPage(slug: Legal, docsUrl: string | null, files: Record<string, string> = FILES): LegalPage | null {
	const md = Object.entries(files).find(([path]) => path.endsWith(`/${slug}.md`))?.[1]
	if (!md) return null
	const title = /^# (.+)$/m.exec(md)?.[1].trim() ?? slug
	const body = md.replace(/^# .+\n+/m, '')
	return { slug, title, description: DESCRIPTIONS[slug], draft: md.includes('**Draft.**'), ...render(relink(body, docsUrl)) }
}

/** The legal pages the sitemap lists: every one that is no longer a draft. */
export const publishedLegal = (files: Record<string, string> = FILES): Legal[] => LEGAL.filter((s) => legalPage(s, null, files)?.draft === false)
