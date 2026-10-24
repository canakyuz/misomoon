<script lang="ts">
	// The list of posts on /blog, a tag page and an author page: the newest one large, then a grid.
	import PostCard from './PostCard.svelte'
	import type { Summary } from '#lib/server/content.ts'

	let { posts, next, base, feature = true }: { posts: Summary[]; next: string | null; base: string; feature?: boolean } = $props()
	const [first, ...rest] = $derived(feature ? posts : [null, ...posts])
</script>

{#if first}
	<div class="lead"><PostCard post={first} big /></div>
{/if}
{#if rest.length}
	<div class="grid">
		{#each rest as p (p!.path)}<PostCard post={p!} />{/each}
	</div>
{/if}
{#if next}
	<nav class="more" aria-label="Pages">
		<a class="cta ghost" href="{base}?cursor={encodeURIComponent(next)}">Older posts <span class="arrow">→</span></a>
	</nav>
{/if}

<style>
	.lead {
		padding-bottom: 48px;
		margin-bottom: 48px;
		border-bottom: 2px solid var(--ink);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 48px 32px;
	}
	.more {
		margin-top: 56px;
	}
</style>
