<script lang="ts">
	import Crumbs from '#lib/components/Crumbs.svelte'
	import Seo from '#lib/components/Seo.svelte'
	import { docLink } from '#lib/links.ts'
	import { CTA, TRIAL_DAYS, signupUrl } from '#lib/pricing.ts'
	import { reveal } from '#lib/reveal.ts'
	import { breadcrumbs, faq, webpage } from '#lib/seo.ts'
	import { page } from '$app/state'
	import type { PageProps } from './$types'

	let { data }: PageProps = $props()
	const f = $derived(data.feature)
	const origin = $derived(page.url.origin)
	const path = $derived(`/features/${f.slug}`)
	const crumbs = $derived<[string, string][]>([
		['Features', '/features'],
		[f.feature, path],
	])
	const signup = $derived(signupUrl(data.appUrl))

	// the FAQ answer as plain text: the markup stripped, the same words the page shows
	const plain = (s: string) => s.replace(/`|\*\*/g, '')
	const ENTITY: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
	const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ENTITY[c] ?? c)
	const code = (s: string) => s.replace(/`([^`]+)`/g, '<code>$1</code>')
	const bold = (s: string) => s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
	// escape first, so only the marks added here reach {@html}
	const rich = (s: string) => bold(code(esc(s)))
</script>

<Seo
	title={f.title}
	description={f.description}
	{path}
	schema={[
		webpage(origin, path, f.h1[0].replace(/\.$/, ''), f.description, 'WebPage', { about: { '@id': `${origin}/#software` } }),
		faq(f.faq.map(([q, a]): [string, string] => [q, plain(a)])),
		breadcrumbs(origin, crumbs),
	]}
/>

<section class="wrap page-head">
	<Crumbs items={crumbs} />
	<span class="eyebrow">Behavior</span>
	<h1 class="display">{f.h1[0]}<br /><em>{f.h1[1]}</em></h1>
	<p class="lede">{f.answer}</p>
	<div class="ctas">
		<a class="cta primary" href={signup}>{CTA} <span class="arrow">→</span></a>
		<a class="cta ghost" href="/demo">Open the demo</a>
	</div>
</section>

<section class="block alt">
	<div class="wrap">
		<h2 class="display" {@attach reveal()}>What it shows</h2>
		<ul class="cards">
			{#each f.shows as s, i (s.name)}
				<li class="card print" {@attach reveal(i * 60)}>
					<h3>{s.name}</h3>
					<p>{@html rich(s.what)}</p>
				</li>
			{/each}
		</ul>
	</div>
</section>

<section class="block">
	<div class="wrap">
		<h2 class="display" {@attach reveal()}>Turn it on</h2>
		<ol class="steps">
			{#each f.steps as s (s)}
				<li>{@html rich(s)}</li>
			{/each}
		</ol>
	</div>
</section>

<section class="block alt">
	<div class="wrap">
		<h2 class="display" {@attach reveal()}>Privacy and limits</h2>
		<ul class="notes">
			{#each f.notes as n (n)}
				<li>{@html rich(n)}</li>
			{/each}
		</ul>
		<a class="more mono" href={docLink(data.docsUrl, f.doc) + '#' + f.hash}>Read the docs <span aria-hidden="true">→</span></a>
	</div>
</section>

<section class="block">
	<div class="wrap">
		<h2 class="display" {@attach reveal()}>Questions</h2>
		<div class="faq">
			{#each f.faq as [q, a] (q)}
				<details>
					<summary>{q}</summary>
					<p>{@html rich(a)}</p>
				</details>
			{/each}
		</div>
	</div>
</section>

<section class="wrap">
	<a class="card print related" href="/features/{data.related.slug}" {@attach reveal()}>
		<span class="no mono">Related</span>
		<h3>{data.related.h1}</h3>
		<p>{data.related.description}</p>
	</a>
</section>

<section class="wrap">
	<div class="closer print">
		<div>
			<h2 class="display">See it with real numbers.</h2>
			<p>The demo dashboard has every report filled in. When you’re ready, try misomoon Cloud free for {TRIAL_DAYS} days, no card needed.</p>
		</div>
		<div class="ctas">
			<a class="cta primary" href={signup}>{CTA} <span class="arrow">→</span></a>
			<a class="cta ghost" href="/demo">Open the demo</a>
		</div>
	</div>
</section>

<style>
	.page-head .ctas {
		display: flex;
		flex-wrap: wrap;
		gap: 14px;
		margin-top: 30px;
	}
	.block {
		padding: 80px 0;
		border-top: 2px solid var(--ink);
	}
	.block.alt {
		background: var(--surface-2);
	}
	.block h2.display {
		margin: 0 0 32px;
		font-size: clamp(34px, 4.6vw, 60px);
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
	.card h3 {
		margin: 10px 0 6px;
		font-size: 21px;
		letter-spacing: -0.01em;
	}
	.card p {
		margin: 0;
		color: var(--text-2);
		font-size: 15px;
	}
	.no {
		font-size: 11px;
		color: var(--miso);
		letter-spacing: 0.06em;
	}
	.steps {
		counter-reset: step;
		display: grid;
		gap: 18px;
		max-width: 760px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.steps li {
		counter-increment: step;
		position: relative;
		padding-left: 56px;
		font-size: 18px;
	}
	.steps li::before {
		content: counter(step, decimal-leading-zero);
		position: absolute;
		left: 0;
		top: 2px;
		font-family: var(--font-mono);
		font-size: 14px;
		color: var(--miso);
	}
	.notes {
		display: grid;
		gap: 14px;
		max-width: 760px;
		margin: 0 0 32px;
		padding: 0;
		list-style: none;
	}
	.notes li {
		position: relative;
		padding-left: 28px;
		font-size: 16.5px;
		color: var(--text-2);
	}
	.notes li::before {
		content: '';
		position: absolute;
		left: 4px;
		top: 0.5em;
		width: 8px;
		height: 8px;
		border-radius: 2px;
		background: var(--vermilion);
	}
	.more {
		display: inline-block;
		font-size: 11.5px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.more:hover {
		color: var(--miso);
	}
	.faq {
		max-width: 820px;
		border-top: 2px solid var(--ink);
	}
	details {
		border-bottom: 2px solid var(--ink);
	}
	summary {
		position: relative;
		padding: 20px 40px 20px 0;
		font-size: 19px;
		font-weight: 700;
		cursor: pointer;
		list-style: none;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	summary::after {
		content: '+';
		position: absolute;
		right: 4px;
		top: 14px;
		font-size: 28px;
		font-weight: 400;
		transition: transform var(--dur) var(--ease-out);
	}
	details[open] summary::after {
		transform: rotate(45deg);
	}
	details p {
		margin: 0 0 22px;
		max-width: 680px;
		color: var(--text-2);
	}
	.related {
		max-width: 420px;
	}
	.related:hover {
		transform: translate(-2px, -2px);
		box-shadow: 6px 6px 0 var(--ink);
	}
	/* code and bold come from {@html}, so they need :global to reach it */
	.card :global(code),
	.steps :global(code),
	.notes :global(code),
	.faq :global(code) {
		font-family: var(--font-mono);
		font-size: 0.85em;
		padding: 1px 5px;
		border-radius: 4px;
		background: color-mix(in srgb, currentColor 14%, transparent);
	}
	@media (max-width: 860px) {
		.block {
			padding: 56px 0;
		}
		.steps li {
			padding-left: 48px;
		}
	}
</style>
