<script lang="ts">
	// Every page's <head>: title, description, canonical URL, robots, Open Graph, and JSON-LD.
	import { page } from '$app/state'
	import { abs, jsonLd, OG_IMAGE, SITE_NAME, title as full } from '#lib/seo.ts'

	interface Props {
		title: string
		description: string
		/** the page's own path; defaults to the URL without its query */
		path?: string
		/** a canonical URL elsewhere, for a post first published on another site */
		canonical?: string | null
		image?: string | null
		imageAlt?: string | null
		type?: 'website' | 'article'
		published?: string | null
		modified?: string | null
		noindex?: boolean
		schema?: Record<string, unknown>[]
	}
	let { title, description, path, canonical, image, imageAlt, type = 'website', published, modified, noindex = false, schema = [] }: Props = $props()

	const origin = $derived(page.url.origin)
	const url = $derived(canonical ?? abs(origin, path ?? page.url.pathname))
	const img = $derived(abs(origin, image ?? OG_IMAGE))
	const t = $derived(full(title))
	// large image previews in Discover and search; full snippets for search and AI answers
	const robots = $derived(noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1')
</script>

<svelte:head>
	<title>{t}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={url} />
	<link rel="alternate" type="application/rss+xml" title="misomoon blog" href="/feed.xml" />
	<meta name="robots" content={robots} />
	<meta property="og:site_name" content={SITE_NAME} />
	<meta property="og:type" content={type} />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:url" content={url} />
	<meta property="og:image" content={img} />
	{#if !image}
		<meta property="og:image:width" content="1200" />
		<meta property="og:image:height" content="630" />
	{/if}
	<meta property="og:image:alt" content={imageAlt ?? 'misomoon: cookieless web analytics on Cloudflare'} />
	<meta property="og:locale" content="en_US" />
	<meta name="twitter:card" content="summary_large_image" />
	{#if type === 'article' && published}
		<meta property="article:published_time" content={published} />
	{/if}
	{#if type === 'article' && modified}
		<meta property="article:modified_time" content={modified} />
	{/if}
	{#if schema.length}
		{@html `<script type="application/ld+json">${jsonLd(schema)}</script>`}
	{/if}
</svelte:head>
