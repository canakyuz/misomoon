<script lang="ts">
	import type { Summary } from '#lib/server/content.ts'
	import { day, minutes } from '#lib/seo.ts'

	let { post, big = false }: { post: Summary; big?: boolean } = $props()
</script>

<article class="card" class:big>
	<a class="cover" href={post.path} tabindex="-1" aria-hidden="true">
		{#if post.image}
			<img src={post.image} alt="" loading={big ? 'eager' : 'lazy'} decoding="async" width="1200" height="630" />
		{:else}
			<span class="plate halftone"><span class="display">{post.title}</span></span>
		{/if}
	</a>
	<div class="text">
		{#if post.tags[0]}<a class="tag mono" href="/blog/tag/{post.tags[0]}">{post.tags[0]}</a>{/if}
		<h3><a href={post.path}>{post.title}</a></h3>
		<p>{post.description}</p>
		<p class="meta mono">
			{#if post.author}<span>{post.author.name}</span>{/if}
			{#if post.publishedAt}<time datetime={post.publishedAt}>{day(post.publishedAt)}</time>{/if}
			<span>{minutes(post.words)} min read</span>
		</p>
	</div>
</article>

<style>
	.card {
		display: grid;
		gap: 16px;
		align-content: start;
	}
	.card.big {
		grid-template-columns: 1.25fr 1fr;
		gap: 36px;
		align-items: center;
	}
	.cover {
		display: block;
		overflow: hidden;
		aspect-ratio: 1200 / 630;
		border: 2px solid var(--ink);
		border-radius: 14px;
		box-shadow: 4px 4px 0 var(--ink);
		background: var(--surface-2);
		transition: transform var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);
	}
	.card:hover .cover {
		transform: translate(-2px, -2px);
		box-shadow: 6px 6px 0 var(--vermilion);
	}
	img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	/* no image: the title, printed large over a halftone */
	.plate {
		display: flex;
		align-items: flex-end;
		height: 100%;
		padding: 18px 20px;
		background-color: var(--surface);
	}
	.plate span {
		font-size: 30px;
		line-height: 0.92;
		color: var(--miso);
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.big .plate span {
		font-size: clamp(36px, 4vw, 56px);
	}
	.tag {
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--miso);
	}
	h3 {
		margin: 6px 0 8px;
		font-size: 22px;
		line-height: 1.2;
		letter-spacing: -0.01em;
	}
	.big h3 {
		font-size: clamp(28px, 3vw, 40px);
		line-height: 1.08;
	}
	h3 a:hover {
		text-decoration: underline;
		text-underline-offset: 4px;
	}
	p {
		margin: 0;
		color: var(--text-2);
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 14px;
		margin-top: 14px;
		font-size: 11px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-3);
	}
	@media (max-width: 860px) {
		.card.big {
			grid-template-columns: 1fr;
			gap: 16px;
		}
	}
</style>
