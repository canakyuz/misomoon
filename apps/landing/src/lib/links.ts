/** The same Markdown the docs site is built from, for a landing without PUBLIC_DOCS_URL. */
const GITHUB_DOCS = 'https://github.com/jackzard/misomoon'

/** A docs page by its file name without `.md` (`faq`, `self-hosting`), or the docs home. */
export function docLink(base: string | null, page = ''): string {
	if (base) return page ? `${base}/${page}` : base
	return page ? `${GITHUB_DOCS}/blob/main/docs/${page}.md` : `${GITHUB_DOCS}/tree/main/docs`
}
