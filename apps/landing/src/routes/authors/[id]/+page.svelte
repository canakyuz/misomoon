<script lang="ts">
	import Crumbs from '#lib/components/Crumbs.svelte'
	import PostIndex from '#lib/components/PostIndex.svelte'
	import Seo from '#lib/components/Seo.svelte'
	import { authorDescription, breadcrumbs, listTitle, person, webpage } from '#lib/seo.ts'
	import { page } from '$app/state'

	let { data } = $props()
	const a = $derived(data.person)
	const origin = $derived(page.url.origin)
	const path = $derived(`/authors/${a.id}`)
	const crumbs = $derived<[string, string][]>([
		['Blog', '/blog'],
		[a.name, path],
	])
</script>

<!-- the author page backs the byline of every post: who wrote it, and where else they are -->
<Seo
	title={listTitle(`${a.name}, author`, a.name, data.cursor, data.posts)}
	description={authorDescription(a.name, a.bio)}
	{path}
	image={a.avatar}
	noindex={!data.posts.length}
	schema={[webpage(origin, path, a.name, a.bio || `Posts by ${a.name}`, 'ProfilePage', { mainEntity: person(origin, a), dateModified: a.updatedAt }), breadcrumbs(origin, crumbs)]}
/>

<section class="wrap page-head">
	<Crumbs items={crumbs} />
	<span class="eyebrow"><b>By</b> Author</span>
	<h1 class="display">{a.name}</h1>
	{#if a.bio}<p class="lede">{a.bio}</p>{/if}
	{#if a.sameAs.length}
		<p class="links">{#each a.sameAs as u (u)}<a class="chip" href={u} rel="me noopener">{new URL(u).host.replace(/^www\./, '')}</a>{/each}</p>
	{/if}
</section>

<section class="wrap list">
	{#if data.posts.length}
		<PostIndex posts={data.posts} next={data.next} base={path} feature={false} />
	{:else}
		<p>No posts yet.</p>
	{/if}
</section>

<style>
	.links {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin: 24px 0 0;
	}
	.list {
		padding: 24px 0 120px;
	}
</style>
