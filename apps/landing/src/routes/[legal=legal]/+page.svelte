<script lang="ts">
	import Crumbs from '#lib/components/Crumbs.svelte'
	import Seo from '#lib/components/Seo.svelte'
	import Toc from '#lib/components/Toc.svelte'
	import { SUPPORT } from '#lib/pricing.ts'
	import { breadcrumbs, webpage } from '#lib/seo.ts'
	import { page } from '$app/state'

	let { data } = $props()
	const d = $derived(data.doc)
	const path = $derived(`/${d.slug}`)
	const origin = $derived(page.url.origin)
	const crumbs = $derived<[string, string][]>([[d.title, path]])
	const LINKS: [string, string][] = [
		['/privacy', 'Privacy policy'],
		['/terms', 'Terms'],
		['/dpa', 'Data processing agreement'],
		['/security', 'Security'],
	]
</script>

<Seo title={d.title} description={d.description} {path} noindex={d.draft} schema={[webpage(origin, path, d.title, d.description, 'WebPage'), breadcrumbs(origin, crumbs)]} />

<section class="wrap page-head">
	<Crumbs items={crumbs} />
	<h1 class="display">{d.title}</h1>
	<p class="lede">{d.description}</p>
	<nav class="legal mono" aria-label="Legal">
		{#each LINKS as [href, label] (href)}
			<a {href} aria-current={href === path ? 'page' : undefined}>{label}</a>
		{/each}
	</nav>
</section>

<div class="wrap body" class:with-toc={d.toc.length >= 3}>
	<div class="prose">
		{@html d.html}
		<p class="ask">Questions about this page? Email <a href="mailto:{SUPPORT}">{SUPPORT}</a>.</p>
	</div>
	{#if d.toc.length >= 3}<aside><Toc toc={d.toc} /></aside>{/if}
</div>

<style>
	.legal {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 28px;
		font-size: 11.5px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.legal a {
		padding: 6px 12px;
		border: 1.5px solid var(--ink);
		border-radius: 999px;
		background: var(--surface);
	}
	.legal a:hover,
	.legal a[aria-current='page'] {
		background: var(--block);
		color: var(--on-block);
	}
	.ask {
		margin-top: 48px;
		padding-top: 20px;
		border-top: 2px solid var(--ink);
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
