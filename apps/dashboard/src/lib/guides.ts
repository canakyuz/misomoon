import type { Brand } from '@misomoon/brand/brands'

/** The public docs. A self-hosted instance runs the same code, so it links there too. */
export const DOCS = 'https://docs.misomoon.com'
/** misomoon's home page, where the demo dashboard leads back to. */
export const HOME = 'https://misomoon.com'

/** A docs page by its file name without `.md`, such as `shopify`, with an optional heading id. */
export const docUrl = (page = '', hash = '') => `${DOCS}/${page}${hash ? `#${hash}` : ''}`

export interface Guide {
	label: string
	/** the docs page, by file name without `.md` */
	page: string
	hash?: string
	/** a brand mark from brands.ts, or null for a generic icon */
	brand: Brand | null
}

/** One link per platform in the Install tab, in the order of the docs sidebar. */
export const PLATFORMS: Guide[] = [
	{ label: 'WordPress', page: 'wordpress', brand: 'wordpress' },
	{ label: 'Shopify', page: 'shopify', brand: 'shopify' },
	{ label: 'Webflow', page: 'webflow', brand: 'webflow' },
	{ label: 'Framer', page: 'framer', brand: 'framer' },
	{ label: 'Wix', page: 'wix', brand: 'wix' },
	{ label: 'Squarespace', page: 'squarespace', brand: 'squarespace' },
	{ label: 'Ghost', page: 'ghost', brand: 'ghost' },
	{ label: 'Carrd', page: 'carrd', brand: 'carrd' },
	{ label: 'Next.js', page: 'nextjs', brand: 'nextdotjs' },
	{ label: 'Vue and Nuxt', page: 'vue', brand: 'vuedotjs' },
	{ label: 'SvelteKit', page: 'sveltekit', brand: 'svelte' },
	{ label: 'Astro', page: 'astro', brand: 'astro' },
	{ label: 'Angular', page: 'angular', brand: 'angular' },
	{ label: 'Laravel', page: 'server-frameworks', brand: 'laravel' },
	{ label: 'Django', page: 'server-frameworks', brand: 'django' },
	{ label: 'Rails', page: 'server-frameworks', brand: 'rubyonrails' },
	{ label: 'Hugo', page: 'static-sites', brand: 'hugo' },
	{ label: 'Jekyll', page: 'static-sites', brand: 'jekyll' },
	{ label: 'Eleventy', page: 'static-sites', brand: 'eleventy' },
	{ label: 'v0', page: 'ai-app-builders', brand: 'v0' },
	{ label: 'Replit', page: 'ai-app-builders', brand: 'replit' },
	{ label: 'Lovable and Bolt', page: 'ai-app-builders', brand: null },
	{ label: 'Google Tag Manager', page: 'google-tag-manager', brand: 'googletagmanager' },
]

export interface SdkEntry extends Guide {
	/** the import path */
	pkg: string
}

/** The SDK's entry points, each with the page that shows it in use. */
export const SDK: SdkEntry[] = [
	{ label: 'Browser apps', pkg: '@misomoon/sdk/web', page: 'sdk', brand: 'javascript' },
	{ label: 'React', pkg: '@misomoon/sdk/react', page: 'nextjs', brand: 'react' },
	{ label: 'Next.js', pkg: '@misomoon/sdk/next', page: 'nextjs', hash: 'serve-the-tracker-from-your-domain', brand: 'nextdotjs' },
	{ label: 'React Native and Expo', pkg: '@misomoon/sdk/react-native', page: 'react-native', brand: 'expo' },
	{ label: 'Node and servers', pkg: '@misomoon/sdk/node', page: 'sdk', hash: 'send-events-from-your-server', brand: 'nodedotjs' },
]
