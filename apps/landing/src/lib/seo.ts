// Titles, canonical URLs and schema.org JSON-LD for every page of misomoon.com.
// docs/seo.md explains the rules these follow.

import { FEATURES } from './features.ts'
import { PLANS, summary } from './pricing.ts'

export const SITE_NAME = 'misomoon'
export const REPO = 'https://github.com/jackzard/misomoon'
/** The default share image, 1200 by 630 pixels */
export const OG_IMAGE = '/og.png'

/** "Page · misomoon", and the home page's own title as it is. */
export const title = (t: string) => (t.includes(SITE_NAME) ? t : `${t} · ${SITE_NAME}`)

/** An absolute URL on this site. */
export const abs = (origin: string, path: string) => (/^https?:\/\//.test(path) ? path : origin + (path.startsWith('/') ? path : `/${path}`))

type Thing = Record<string, unknown>

export const organization = (origin: string): Thing => ({
	'@type': 'Organization',
	'@id': `${origin}/#org`,
	name: SITE_NAME,
	url: `${origin}/`,
	logo: { '@type': 'ImageObject', url: `${origin}/logo.png`, width: 512, height: 512 },
	sameAs: [REPO],
})

export const website = (origin: string): Thing => ({
	'@type': 'WebSite',
	'@id': `${origin}/#website`,
	name: SITE_NAME,
	url: `${origin}/`,
	inLanguage: 'en',
	publisher: { '@id': `${origin}/#org` },
})

export const software = (origin: string): Thing => ({
	'@type': 'SoftwareApplication',
	'@id': `${origin}/#software`,
	name: SITE_NAME,
	url: `${origin}/`,
	applicationCategory: 'BusinessApplication',
	applicationSubCategory: 'Web analytics',
	operatingSystem: 'Web',
	license: 'https://opensource.org/licenses/MIT',
	codeRepository: REPO,
	featureList: FEATURES.flatMap((g) => g.items.map((f) => f.name)),
	isAccessibleForFree: true,
	// the misomoon Cloud plans, a month each; the open-source version is free
	offers: PLANS.map((p) => ({
		'@type': 'Offer',
		name: `misomoon Cloud ${p.name}`,
		description: summary(p),
		price: String(p.price),
		priceCurrency: 'USD',
		priceSpecification: { '@type': 'UnitPriceSpecification', price: String(p.price), priceCurrency: 'USD', billingDuration: 'P1M' },
		url: `${origin}/pricing`,
	})),
	publisher: { '@id': `${origin}/#org` },
})

/** Breadcrumbs from the home page down. The last crumb is the page itself. */
export const breadcrumbs = (origin: string, crumbs: [name: string, path: string][]): Thing => ({
	'@type': 'BreadcrumbList',
	itemListElement: [['Home', '/'] as [string, string], ...crumbs].map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: abs(origin, path) })),
})

export interface PersonLike {
	id: string
	name: string
	bio?: string
	avatar?: string | null
	sameAs?: string[]
}

export const person = (origin: string, a: PersonLike): Thing => ({
	'@type': 'Person',
	'@id': `${origin}/authors/${a.id}#person`,
	name: a.name,
	url: `${origin}/authors/${a.id}`,
	...(a.bio ? { description: a.bio } : {}),
	...(a.avatar ? { image: abs(origin, a.avatar) } : {}),
	...(a.sameAs?.length ? { sameAs: a.sameAs } : {}),
})

export interface ArticleLike {
	path: string
	title: string
	description: string
	image: string | null
	tags: string[]
	words: number
	publishedAt: string | null
	updatedAt: string
	author: PersonLike | null
}

/** A blog post. Google reads headline, image, both dates with a time zone, and each author with a URL. */
export const posting = (origin: string, e: ArticleLike): Thing => ({
	'@type': 'BlogPosting',
	'@id': `${abs(origin, e.path)}#article`,
	headline: e.title,
	description: e.description,
	url: abs(origin, e.path),
	mainEntityOfPage: abs(origin, e.path),
	...(e.image ? { image: [abs(origin, e.image)] } : { image: [abs(origin, OG_IMAGE)] }),
	...(e.publishedAt ? { datePublished: e.publishedAt } : {}),
	dateModified: e.updatedAt,
	...(e.author ? { author: [person(origin, e.author)] } : { author: [{ '@id': `${origin}/#org` }] }),
	publisher: { '@id': `${origin}/#org` },
	...(e.tags.length ? { keywords: e.tags.join(', ') } : {}),
	wordCount: e.words,
	inLanguage: 'en',
	isPartOf: { '@id': `${origin}/blog#blog` },
})

export const webpage = (origin: string, path: string, name: string, description: string, type = 'WebPage', extra: Thing = {}): Thing => ({
	'@type': type,
	'@id': `${abs(origin, path)}#page`,
	url: abs(origin, path),
	name,
	description,
	inLanguage: 'en',
	isPartOf: { '@id': `${origin}/#website` },
	...extra,
})

/** A list of links, for a hub page such as the blog or the alternatives. */
export const itemList = (origin: string, items: { name: string; path: string }[]): Thing => ({
	'@type': 'ItemList',
	itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, url: abs(origin, it.path) })),
})

export const faq = (items: [q: string, a: string][]): Thing => ({
	'@type': 'FAQPage',
	mainEntity: items.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
})

/**
 * The JSON-LD for a `<script type="application/ld+json">`. "<" is escaped, so a title
 * that contains "</script>" can't end the script early.
 */
export const jsonLd = (things: Thing[]) => JSON.stringify({ '@context': 'https://schema.org', '@graph': things }).replace(/</g, '\\u003c')

/** "25 October 2026", in UTC, the way every date on the site is printed. */
export const day = (iso: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso))

/** Minutes to read at 230 words a minute, at least 1. */
export const minutes = (words: number) => Math.max(1, Math.round(words / 230))
