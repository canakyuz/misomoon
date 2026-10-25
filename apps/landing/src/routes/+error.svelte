<script lang="ts">
	import { page } from '$app/state'

	const missing = $derived(page.status === 404)
</script>

<svelte:head>
	<title>{missing ? 'Page not found' : 'Something went wrong'} · misomoon</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<section class="page-head">
	<div class="wrap">
		<p class="eyebrow"><b>{page.status}</b> {missing ? 'Not in this edition' : 'Press stopped'}</p>
		<h1 class="display">{#if missing}This page<br /><em>isn’t here.</em>{:else}Something<br /><em>went wrong.</em>{/if}</h1>
		<p class="lede">
			{missing
				? 'The link may be old, or the address has a typo. These pages are a good place to start.'
				: 'The page couldn’t be printed this time. Try again in a minute, or start from one of these pages.'}
		</p>
		<ul class="links">
			<li><a class="cta primary" href="/">Home <span class="arrow">→</span></a></li>
			<li><a class="cta ghost" href="/features">Features</a></li>
			<li><a class="cta ghost" href="/pricing">Pricing</a></li>
			{#if page.data.blog}<li><a class="cta ghost" href="/blog">Blog</a></li>{/if}
		</ul>
	</div>
</section>

<style>
	.page-head {
		padding-bottom: 120px;
	}
	.links {
		display: flex;
		flex-wrap: wrap;
		gap: 14px;
		margin: 36px 0 0;
		padding: 0;
		list-style: none;
	}
</style>
