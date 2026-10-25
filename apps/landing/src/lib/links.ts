/** The same Markdown the docs site is built from, for a landing without PUBLIC_DOCS_URL. */
const GITHUB_DOCS = 'https://github.com/jackzard/misomoon'

/** A docs page by its file name without `.md` (`faq`, `self-hosting`, `PROXY`), or the docs home. The docs site serves every page at its lowercase name. */
export function docLink(base: string | null, page = ''): string {
	if (base) return page ? `${base}/${page.toLowerCase()}` : base
	return page ? `${GITHUB_DOCS}/blob/main/docs/${page}.md` : `${GITHUB_DOCS}/tree/main/docs`
}
