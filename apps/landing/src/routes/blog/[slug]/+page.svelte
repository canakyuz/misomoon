<script lang="ts">
	import Crumbs from '#lib/components/Crumbs.svelte'
	import PostCard from '#lib/components/PostCard.svelte'
	import Seo from '#lib/components/Seo.svelte'
	import Toc from '#lib/components/Toc.svelte'
	import { CTA, TRIAL_DAYS, signupUrl } from '#lib/pricing.ts'
	import { breadcrumbs, day, minutes, posting } from '#lib/seo.ts'
	import { page } from '$app/state'

	let { data } = $props()
	const p = $derived(data.post)
	const origin = $derived(page.url.origin)
	const crumbs = $derived<[string, string][]>([
		['Blog', '/blog'],
		...(p.tags[0] ? [[p.tags[0], `/blog/tag/${p.tags[0]}`] as [string, string]] : []),
		[p.title, p.path],
	])
	// a change on another day than the first publish is worth showing
	const edited = $derived(p.publishedAt && p.updatedAt.slice(0, 10) !== p.publishedAt.slice(0, 10))
	const initials = (name: string) =>
		name
			.split(/\s+/)
			.map((w) => w[0])
			.slice(0, 2)
			.join('')
</script>

<Seo
	title={p.title}
	description={p.description}
	path={p.path}
	canonical={p.canonical}
	image={p.image}
	imageAlt={p.imageAlt}
	type="article"
	published={p.publishedAt}
	modified={p.updatedAt}
	noindex={p.noindex}
	schema={[posting(origin, p), breadcrumbs(origin, crumbs)]}
/>

<article class="wrap post">
	<header class="head">
		<Crumbs items={crumbs} />
		{#if p.tags.length}
			<p class="tags">{#each p.tags as t (t)}<a class="chip" href="/blog/tag/{t}">{t}</a>{/each}</p>
		{/if}
		<h1 class="display">{p.title}</h1>
		<p class="lede">{p.description}</p>
		<div class="byline">
			{#if p.author}
				<a class="who" href="/authors/{p.author.id}">
					{#if p.author.avatar}<img src={p.author.avatar} alt="" width="44" height="44" />{:else}<span class="avatar mono">{initials(p.author.name)}</span>{/if}
					<span><b>{p.author.name}</b><small class="mono">Author</small></span>
				</a>
			{/if}
			<p class="dates mono">
				{#if p.publishedAt}<span>Published <time datetime={p.publishedAt}>{day(p.publishedAt)}</time></span>{/if}
				{#if edited}<span>Updated <time datetime={p.updatedAt}>{day(p.updatedAt)}</time></span>{/if}
				<span>{minutes(p.words)} min read</span>
			</p>
		</div>
	</header>

	{#if p.image}
		<figure class="cover">
			<img src={p.image} alt={p.imageAlt ?? ''} width="1200" height="630" fetchpriority="high" />
		</figure>
	{/if}

	<div class="body" class:with-toc={p.toc.length >= 3}>
		<div class="prose">{@html p.html}</div>
		{#if p.toc.length >= 3}
			<aside><Toc toc={p.toc} /></aside>
		{/if}
	</div>

	{#if p.author}
		<aside class="author print">
			{#if p.author.avatar}<img src={p.author.avatar} alt="" width="72" height="72" />{:else}<span class="avatar big mono">{initials(p.author.name)}</span>{/if}
			<div>
				<p class="mono">Written by</p>
				<h2><a href="/authors/{p.author.id}">{p.author.name}</a></h2>
				{#if p.author.bio}<p class="bio">{p.author.bio}</p>{/if}
				{#if p.author.sameAs.length}
					<p class="links">{#each p.author.sameAs as u (u)}<a class="chip" href={u} rel="me noopener">{new URL(u).host.replace(/^www\./, '')}</a>{/each}</p>
				{/if}
			</div>
		</aside>
	{/if}
</article>

{#if data.more.length}
	<section class="wrap more">
		<h2 class="display">Read next</h2>
		<div class="grid">
			{#each data.more as m (m.path)}<PostCard post={m} />{/each}
		</div>
	</section>
{/if}

<section class="wrap">
	<div class="closer print">
		<div>
			<h2 class="display">Count visits, not people.</h2>
			<p>misomoon shows where visitors come from, what they click and which ones pay, with no cookies. Try it free for {TRIAL_DAYS} days, no card needed.</p>
		</div>
		<div class="ctas">
			<a class="cta primary" href={signupUrl(data.appUrl)}>{CTA} <span class="arrow">→</span></a>
			<a class="cta ghost" href="/demo">Open the demo</a>
		</div>
	</div>
</section>

<style>
	.head {
		max-width: 920px;
		padding: 56px 0 36px;
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin: 0 0 18px;
	}
	h1 {
		margin: 0 0 20px;
		font-size: clamp(40px, 6vw, 84px);
		line-height: 0.92;
		text-wrap: balance;
	}
	.lede {
		margin: 0 0 28px;
		max-width: 720px;
		font-size: clamp(18px, 1.7vw, 21px);
		color: var(--text-2);
	}
	.byline {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 16px 28px;
		padding-top: 20px;
		border-top: 2px solid var(--ink);
	}
	.who {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.who b {
		display: block;
	}
	.who small {
		font-size: 10.5px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-3);
	}
	.who:hover b {
		color: var(--miso);
	}
	.who img,
	.author img {
		border-radius: 999px;
		border: 2px solid var(--ink);
		object-fit: cover;
	}
	.avatar {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border-radius: 999px;
		border: 2px solid var(--ink);
		background: var(--vermilion);
		color: var(--on-vermilion);
		font-size: 13px;
		font-weight: 700;
	}
	.avatar.big {
		width: 72px;
		height: 72px;
		font-size: 20px;
	}
	.dates {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 16px;
		margin: 0;
		font-size: 11px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-3);
	}
	.cover {
		margin: 0 0 48px;
	}
	.cover img {
		display: block;
		width: 100%;
		height: auto;
		border: 2px solid var(--ink);
		border-radius: 16px;
		box-shadow: 6px 6px 0 var(--ink);
	}
	.body {
		display: grid;
		gap: 64px;
	}
	.body.with-toc {
		grid-template-columns: minmax(0, 70ch) 240px;
		justify-content: space-between;
	}
	.author {
		display: flex;
		gap: 20px;
		max-width: 70ch;
		margin: 64px 0 0;
		padding: 24px;
		box-shadow: 4px 4px 0 var(--ink);
	}
	.author p.mono {
		margin: 0;
		font-size: 10.5px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-3);
	}
	.author h2 {
		margin: 2px 0 8px;
		font-size: 22px;
	}
	.author h2 a:hover {
		color: var(--miso);
	}
	.bio {
		margin: 0 0 12px;
		color: var(--text-2);
	}
	.links {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin: 0;
	}
	.more {
		margin-top: 96px;
	}
	.more h2 {
		margin: 0 0 28px;
		font-size: clamp(34px, 4.4vw, 56px);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 40px 28px;
	}
	@media (max-width: 1080px) {
		.body.with-toc {
			grid-template-columns: minmax(0, 1fr);
		}
		aside:has(:global(.toc)) {
			display: none;
		}
	}
</style>
