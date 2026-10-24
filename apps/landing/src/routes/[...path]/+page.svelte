<script lang="ts">
	import Crumbs from '#lib/components/Crumbs.svelte'
	import Seo from '#lib/components/Seo.svelte'
	import Toc from '#lib/components/Toc.svelte'
	import { breadcrumbs, day, webpage } from '#lib/seo.ts'
	import { page } from '$app/state'

	let { data } = $props()
	const d = $derived(data.doc)
	const origin = $derived(page.url.origin)
	const crumbs = $derived<[string, string][]>([[d.title, d.path]])
</script>

<Seo
	title={d.title}
	description={d.description}
	path={d.path}
	canonical={d.canonical}
	image={d.image}
	imageAlt={d.imageAlt}
	noindex={d.noindex}
	schema={[webpage(origin, d.path, d.title, d.description, 'WebPage', { dateModified: d.updatedAt, ...(d.publishedAt ? { datePublished: d.publishedAt } : {}) }), breadcrumbs(origin, crumbs)]}
/>

<section class="wrap page-head">
	<Crumbs items={crumbs} />
	<h1 class="display">{d.title}</h1>
	<p class="lede">{d.description}</p>
	<p class="updated mono">Updated <time datetime={d.updatedAt}>{day(d.updatedAt)}</time></p>
</section>

<div class="wrap body" class:with-toc={d.toc.length >= 3}>
	<div class="prose">{@html d.html}</div>
	{#if d.toc.length >= 3}<aside><Toc toc={d.toc} /></aside>{/if}
</div>

<style>
	.updated {
		margin: 22px 0 0;
		font-size: 11px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-3);
	}
	.body {
		display: grid;
		gap: 64px;
		padding-bottom: 120px;
	}
	.body.with-toc {
		grid-template-columns: minmax(0, 70ch) 240px;
		justify-content: space-between;
	}
	@media (max-width: 1080px) {
		.body.with-toc {
			grid-template-columns: minmax(0, 1fr);
		}
		aside {
			display: none;
		}
	}
</style>
