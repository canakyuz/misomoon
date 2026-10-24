<script lang="ts">
	import Crumbs from '#lib/components/Crumbs.svelte'
	import Seo from '#lib/components/Seo.svelte'
	import { FEATURES } from '#lib/features.ts'
	import { docLink } from '#lib/links.ts'
	import { CTA, TRIAL_DAYS, signupUrl } from '#lib/pricing.ts'
	import { reveal } from '#lib/reveal.ts'
	import { breadcrumbs, itemList, software, webpage } from '#lib/seo.ts'
	import { page } from '$app/state'

	let { data } = $props()
	const origin = $derived(page.url.origin)
	const count = FEATURES.reduce((n, g) => n + g.items.length, 0)
	const crumbs: [string, string][] = [['Features', '/features']]
</script>

<Seo
	title="Features: every analytics report, on every plan"
	description="Heatmaps, scroll maps, revenue by source, funnels, form drop-off, errors, Web Vitals, AI traffic, reports, MCP and an API. Every feature, on every plan."
	path="/features"
	schema={[
		webpage(origin, '/features', 'misomoon features', 'Every misomoon feature, on every plan.', 'CollectionPage', { about: { '@id': `${origin}/#software` } }),
		software(origin),
		breadcrumbs(origin, crumbs),
		itemList(
			origin,
			FEATURES.map((g) => ({ name: g.name, path: `/features#${g.id}` })),
		),
	]}
/>

<section class="wrap page-head">
	<Crumbs items={crumbs} />
	<span class="eyebrow"><b>{count}</b> Features</span>
	<h1 class="display">Every feature.<br /><em>On every plan.</em></h1>
	<p class="lede">
		Funnels, revenue, and email reports usually wait behind the top plan. On misomoon Cloud every plan has all of them, and so does the open-source
		version. Every part is listed here with the docs page that explains it.
	</p>
	<ol class="index mono" aria-label="Groups">
		{#each FEATURES as g, i (g.id)}
			<li><a href="#{g.id}"><b>{String(i + 1).padStart(2, '0')}</b>{g.name}<small>{g.items.length}</small></a></li>
		{/each}
	</ol>
</section>

{#each FEATURES as g, i (g.id)}
	<section class="group" id={g.id} class:alt={i % 2 === 1}>
		<div class="wrap grid">
			<header {@attach reveal()}>
				<span class="eyebrow"><b>{String(i + 1).padStart(2, '0')}</b> {g.name}</span>
				<h2 class="display">{g.name}</h2>
				<p>{g.lede}</p>
			</header>
			<ul class="cards">
				{#each g.items as f, j (f.name)}
					<li class="card print" {@attach reveal(j * 50)}>
						<span class="no mono">{String(i + 1).padStart(2, '0')}.{j + 1}</span>
						<h3>{f.name}</h3>
						<p>{f.what}.</p>
						<div class="links">
							{#if f.page}
								<a class="more mono" href="/features/{f.page}">How it works <span aria-hidden="true">→</span></a>
							{/if}
							<a class="more mono" href={docLink(data.docsUrl, f.doc)}>Read the docs <span aria-hidden="true">→</span></a>
						</div>
					</li>
				{/each}
			</ul>
		</div>
	</section>
{/each}

<section class="wrap">
	<div class="closer print">
		<div>
			<h2 class="display">See it with real numbers.</h2>
			<p>The demo dashboard has every report filled in. When you’re ready, try misomoon Cloud free for {TRIAL_DAYS} days, no card needed.</p>
		</div>
		<div class="ctas">
			<a class="cta primary" href={signupUrl(data.appUrl)}>{CTA} <span class="arrow">→</span></a>
			<a class="cta ghost" href="/demo">Open the demo</a>
		</div>
	</div>
</section>

<style>
	.index {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		margin: 36px 0 0;
		padding: 0;
		list-style: none;
	}
	.index a {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		height: 40px;
		padding: 0 14px 0 6px;
		border: 2px solid var(--ink);
		border-radius: 999px;
		background: var(--surface);
		font-size: 12.5px;
		box-shadow: 3px 3px 0 var(--ink);
		transition: transform var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);
	}
	.index a:hover {
		transform: translate(-2px, -2px);
		box-shadow: 5px 5px 0 var(--ink);
	}
	.index b {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: 999px;
		background: var(--block);
		color: var(--on-block);
		font-size: 11px;
	}
	.index small {
		color: var(--text-3);
	}
	.group {
		padding: 80px 0;
		border-top: 2px solid var(--ink);
	}
	.group.alt {
		background: var(--surface-2);
	}
	.grid {
		display: grid;
		grid-template-columns: minmax(260px, 1fr) 2fr;
		gap: 48px;
		align-items: start;
	}
	header {
		position: sticky;
		top: 100px;
	}
	header h2 {
		margin: 14px 0 12px;
		font-size: clamp(40px, 5vw, 72px);
	}
	header p {
		margin: 0;
		max-width: 340px;
		color: var(--text-2);
		font-size: 17px;
	}
	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: 20px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.card {
		display: flex;
		flex-direction: column;
		padding: 22px 22px 18px;
		box-shadow: 4px 4px 0 var(--ink);
	}
	.no {
		font-size: 11px;
		color: var(--miso);
		letter-spacing: 0.06em;
	}
	.card h3 {
		margin: 10px 0 6px;
		font-size: 21px;
		letter-spacing: -0.01em;
	}
	.card p {
		flex: 1;
		margin: 0 0 18px;
		color: var(--text-2);
		font-size: 15px;
	}
	.links {
		display: flex;
		gap: 16px;
		flex-wrap: wrap;
	}
	.more {
		font-size: 11.5px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.more:hover {
		color: var(--miso);
	}
	@media (max-width: 860px) {
		.grid {
			grid-template-columns: 1fr;
			gap: 28px;
		}
		header {
			position: static;
		}
		.group {
			padding: 56px 0;
		}
	}
</style>
