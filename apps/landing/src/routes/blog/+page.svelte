<script lang="ts">
	import Crumbs from '#lib/components/Crumbs.svelte'
	import PostIndex from '#lib/components/PostIndex.svelte'
	import Seo from '#lib/components/Seo.svelte'
	import { docLink } from '#lib/links.ts'
	import { breadcrumbs, itemList, listTitle, webpage } from '#lib/seo.ts'
	import { page } from '$app/state'

	let { data } = $props()
	const origin = $derived(page.url.origin)
	const crumbs: [string, string][] = [['Blog', '/blog']]
	// an older page keeps its own canonical URL, as Google asks for paginated lists
	const canonical = $derived(data.cursor && data.posts.length ? `${origin}/blog?cursor=${encodeURIComponent(data.cursor)}` : `${origin}/blog`)
</script>

<Seo
	title={listTitle('Blog: notes on privacy-first analytics', 'Blog', data.cursor, data.posts)}
	description="Notes from the people building misomoon: cookieless counting, Cloudflare, analytics for AI tools, and what the numbers mean."
	{canonical}
	schema={[
		webpage(origin, '/blog', 'The misomoon blog', 'Notes from the people building misomoon.', 'Blog', { '@id': `${origin}/blog#blog`, publisher: { '@id': `${origin}/#org` } }),
		breadcrumbs(origin, crumbs),
		itemList(
			origin,
			data.posts.map((p) => ({ name: p.title, path: p.path })),
		),
	]}
/>

<section class="wrap page-head">
	<Crumbs items={crumbs} />
	<span class="eyebrow"><b>Blog</b> Field notes</span>
	<h1 class="display">Notes from<br /><em>the print room.</em></h1>
	<p class="lede">How misomoon counts without cookies, what runs it on Cloudflare, and what the numbers mean. Written by the people who build it.</p>
	{#if data.tags.length}
		<ul class="tags" aria-label="Topics">
			<li><a class="chip" href="/blog" aria-current="page">All</a></li>
			{#each data.tags as t (t.tag)}<li><a class="chip" href="/blog/tag/{t.tag}">{t.tag} <small>{t.count}</small></a></li>{/each}
		</ul>
	{/if}
	<p class="rss mono"><a href="/feed.xml">RSS feed</a></p>
</section>

<section class="wrap list">
	{#if data.posts.length}
		<PostIndex posts={data.posts} next={data.next} base="/blog" feature={!data.cursor} />
	{:else}
		<div class="empty print halftone">
			<h2 class="display">The first edition<br /><em>is on the press.</em></h2>
			<p>No posts yet. Until then, the docs explain how misomoon works, from the tracker to the shards.</p>
			<a class="cta primary" href={docLink(data.docsUrl)}>Read the docs <span class="arrow">→</span></a>
		</div>
	{/if}
</section>

<style>
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin: 30px 0 0;
		padding: 0;
		list-style: none;
	}
	.tags small {
		margin-left: 6px;
		opacity: 0.6;
	}
	.rss {
		margin: 18px 0 0;
		font-size: 11.5px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.rss a {
		color: var(--miso);
	}
	.list {
		padding: 24px 0 120px;
	}
	.empty {
		padding: 56px 48px;
		background-color: var(--surface);
		text-align: center;
	}
	.empty h2 {
		margin: 0 0 16px;
		font-size: clamp(34px, 5vw, 64px);
	}
	.empty p {
		margin: 0 auto 28px;
		max-width: 480px;
		color: var(--text-2);
	}
</style>
