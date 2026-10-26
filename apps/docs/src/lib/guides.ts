import { BRANDS, type Brand } from '@misomoon/brand/brands'

/** The brand marks of each install guide, by page slug, drawn beside its name. */
export const GUIDE_BRANDS: Record<string, Brand[]> = {
	wordpress: ['wordpress'],
	shopify: ['shopify'],
	webflow: ['webflow'],
	framer: ['framer'],
	wix: ['wix'],
	squarespace: ['squarespace'],
	ghost: ['ghost'],
	carrd: ['carrd'],
	nextjs: ['nextdotjs', 'react'],
	vue: ['vuedotjs'],
	sveltekit: ['svelte'],
	astro: ['astro'],
	gatsby: ['gatsby'],
	angular: ['angular'],
	'server-frameworks': ['laravel', 'django', 'rubyonrails'],
	'static-sites': ['hugo', 'jekyll', 'eleventy'],
	'ai-app-builders': ['v0', 'replit'],
	'react-native': ['expo'],
	'google-tag-manager': ['googletagmanager'],
}

/** The marks of a page, none for a page that isn't an install guide. */
export const brandsOf = (slug: string): Brand[] => GUIDE_BRANDS[slug] ?? []

/** A page's marks as inline SVG in the text color, for HTML built outside Svelte. */
export const marksHtml = (slug: string): string =>
	brandsOf(slug)
		.map((b) => `<svg class="mark" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="${BRANDS[b]}"/></svg>`)
		.join('')
