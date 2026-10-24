<script lang="ts">
	import Crumbs from '#lib/components/Crumbs.svelte'
	import PostIndex from '#lib/components/PostIndex.svelte'
	import Seo from '#lib/components/Seo.svelte'
	import { breadcrumbs, itemList, webpage } from '#lib/seo.ts'
	import { page } from '$app/state'

	let { data } = $props()
	const origin = $derived(page.url.origin)
	const path = $derived(`/blog/tag/${data.tag}`)
	const crumbs = $derived<[string, string][]>([
		['Blog', '/blog'],
		[data.tag, path],
	])
</script>

<!-- a topic with one post is a thin page: it stays out of search until it has more -->
<Seo
	title="Posts about {data.tag}"
	description="Every misomoon blog post about {data.tag}, newest first."
	canonical={data.cursor ? `${origin}${path}?cursor=${encodeURIComponent(data.cursor)}` : `${origin}${path}`}
	noindex={data.posts.length < 2 && !data.next}
	schema={[webpage(origin, path, `Posts about ${data.tag}`, `misomoon blog posts about ${data.tag}`, 'CollectionPage'), breadcrumbs(origin, crumbs), itemList(origin, data.posts.map((p) => ({ name: p.title, path: p.path })))]}
/>

<section class="wrap page-head">
	<Crumbs items={crumbs} />
	<span class="eyebrow"><b>#</b> Topic</span>
	<h1 class="display">{data.tag}</h1>
	<p class="lede"><a href="/blog">All posts</a></p>
</section>

<section class="wrap list">
	<PostIndex posts={data.posts} next={data.next} base={path} feature={false} />
</section>

<style>
	.lede a {
		color: var(--miso);
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.list {
		padding: 24px 0 120px;
	}
</style>
