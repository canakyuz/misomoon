<script lang="ts">
	import { page } from '$app/state'
	import Marks from '#lib/components/Marks.svelte'

	let { data } = $props()
	// the sidebar's sections; the home page leaves out the ones only a few people look for
	const HIDDEN = new Set(['Legal', 'Contributing'])
	const [start, ...rest] = $derived(data.nav.sections.filter((s) => !HIDDEN.has(s.title)))
</script>

<svelte:head>
	<title>misomoon docs</title>
	<meta name="description" content={data.nav.intro} />
	<meta property="og:type" content="website" />
	<meta property="og:title" content="misomoon docs" />
	<meta property="og:description" content={data.nav.intro} />
	<meta property="og:url" content="{page.url.origin}/" />
	<meta property="og:image" content="https://misomoon.com/og.png" />
	<meta name="twitter:card" content="summary_large_image" />
	<link rel="canonical" href="{page.url.origin}/" />
	<link rel="alternate" type="text/plain" href="https://misomoon.com/llms.txt" title="llms.txt" />
</svelte:head>

<div class="home">
	<header>
		<p class="kicker mono">Documentation</p>
		<h1 class="display">{data.nav.title}</h1>
		<p class="intro">{data.nav.intro}</p>
	</header>

	{#if start}
		<section>
			<h2 class="mono">{start.title}</h2>
			<!-- Cloud and self-hosting are two ways in, not steps, so the cards carry no numbers -->
			<ul class="steps">
				{#each start.pages as p (p.slug)}
					<li>
						<a href={p.href}>
							<b>{p.title}</b>
							<span>{p.description}</span>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#each rest as s (s.title)}
		<section>
			<h2 class="mono">{s.title}</h2>
			{#if s.title === 'Install guides'}
				<!-- a platform name says enough, so the guides are a grid of names -->
				<ul class="names">
					{#each s.pages as p (p.slug)}
						<li><a href={p.href}><Marks slug={p.slug} size={18} /><b>{p.title}</b></a></li>
					{/each}
				</ul>
			{:else}
				<ul class="cards">
					{#each s.pages as p (p.slug)}
						<li>
							<a href={p.href}><b>{p.title}</b><span>{p.description}</span></a>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/each}

	<p class="foot">
		Every page is also plain Markdown: add <code>.md</code> to its address, or give an AI tool <a href="https://misomoon.com/llms.txt">llms.txt</a> or
		<a href="https://misomoon.com/llms-full.txt">llms-full.txt</a>.
	</p>
</div>

<style>
	.home {
		max-width: 1040px;
		margin: 0 auto;
		padding: 48px 40px 90px;
	}
	.kicker {
		margin: 0 0 12px;
		font-size: 11px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--vermilion);
	}
	h1 {
		margin: 0;
		font-size: clamp(48px, 8vw, 96px);
	}
	.intro {
		max-width: 640px;
		margin: 18px 0 0;
		font-size: 18px;
		line-height: 1.55;
		color: var(--text-2);
	}
	section {
		margin-top: 52px;
	}
	h2 {
		margin: 0 0 16px;
		padding-bottom: 10px;
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		border-bottom: 2px solid var(--edge);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 16px;
	}
	.steps {
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 230px), 1fr));
	}
	.cards {
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
	}
	.names {
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 190px), 1fr));
		gap: 10px;
	}
	.names a {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 11px 14px;
	}
	.names b {
		font-size: 14.5px;
	}
	li a {
		display: grid;
		align-content: start;
		gap: 6px;
		height: 100%;
		padding: 16px 18px;
		border: 2px solid var(--edge);
		border-radius: var(--radius-lg, 14px);
		background: var(--surface);
		box-shadow: var(--shadow);
		text-decoration: none;
		transition: transform var(--dur-fast, 0.12s);
	}
	li a:hover {
		transform: translate(-1px, -1px);
		box-shadow: 4px 4px 0 var(--edge);
	}
	li a:active {
		transform: translate(2px, 2px);
		box-shadow: 1px 1px 0 var(--edge);
	}
	li b {
		font-size: 16.5px;
		font-weight: 700;
	}
	li span {
		font-size: 14.5px;
		line-height: 1.5;
		color: var(--text-2);
	}
	.foot {
		margin-top: 56px;
		font-size: 14.5px;
		color: var(--text-2);
	}
	.foot a {
		text-decoration-color: var(--vermilion);
	}
	code {
		font-family: var(--font-mono);
		font-size: 0.86em;
		padding: 0.1em 0.35em;
		border-radius: 5px;
		background: var(--surface-3);
	}
	@media (max-width: 900px) {
		.home {
			padding: 30px 16px 70px;
		}
	}
</style>
