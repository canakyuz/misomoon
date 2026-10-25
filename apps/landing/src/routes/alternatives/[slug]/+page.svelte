<script lang="ts">
	import Crumbs from '#lib/components/Crumbs.svelte'
	import Seo from '#lib/components/Seo.svelte'
	import WeighIn from '#lib/components/WeighIn.svelte'
	import { docLink } from '#lib/links.ts'
	import { CTA, TRIAL_DAYS, signupUrl } from '#lib/pricing.ts'
	import { reveal } from '#lib/reveal.ts'
	import { breadcrumbs, day, faq, webpage } from '#lib/seo.ts'
	import { gains, lighter, tally } from '#lib/verdict.ts'
	import { page } from '$app/state'
	import { fly } from 'svelte/transition'

	let { data } = $props()
	const a = $derived(data.alt)
	const OURS = $derived(data.ours)
	const origin = $derived(page.url.origin)
	const path = $derived(`/alternatives/${a.slug}`)
	const crumbs = $derived<[string, string][]>([
		['Compare', '/alternatives'],
		[`vs ${a.short}`, path],
	])
	// every source on the page, numbered once: the table first, as the cards above it repeat its rows
	const sources = $derived.by(() => {
		const list: { src: string; checked: string }[] = []
		for (const c of [...a.facts, ...a.pickUs, ...a.pickThem]) if (!list.some((s) => s.src === c.src)) list.push({ src: c.src, checked: c.checked })
		return list
	})
	const n = (src: string) => sources.findIndex((s) => s.src === src) + 1
	const latest = $derived([...a.facts.map((f) => f.checked), ...a.pickThem.map((f) => f.checked)].sort().at(-1)!)
	const key = $derived(a.facts.filter((f) => ['License', 'What self-hosting needs', 'Where your data lives', 'Cookies', 'Cookieless by default', 'Price'].includes(f.label)).slice(0, 3))
	const score = $derived(tally(a))
	const ratio = $derived(lighter(a.trackerKb))
	// the weight card counts as one of the three reasons when the gap is big enough
	const top = $derived(gains(a, ratio ? 2 : 3))
	const signup = $derived(signupUrl(data.appUrl))
	const KIND = { 'self-hosted': 'Self-hosted tool', hosted: 'Hosted service', product: 'Product analytics' } as const
	const pct = (v: number) => `${(v / score.total) * 100}%`

	// the dock shows once the hero's buttons scroll away, and hides again at the closing buttons
	let heroGone = $state(false)
	let closerSeen = $state(false)
	const watch = (set: (v: boolean) => void, gone: boolean) => (el: HTMLElement) => {
		const io = new IntersectionObserver(([e]) => set(gone ? !e.isIntersecting && e.boundingClientRect.top < 0 : e.isIntersecting))
		io.observe(el)
		return () => io.disconnect()
	}
	const host = (u: string) => new URL(u).host.replace(/^www\./, '')
	const code = (s: string) => s.replace(/`([^`]+)`/g, '<code>$1</code>')
	const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
	const rich = (s: string) => code(esc(s))
</script>

<Seo
	title="{a.name} alternative: misomoon vs {a.short}"
	description={a.description}
	{path}
	type="article"
	modified={latest}
	schema={[
		webpage(origin, path, `misomoon vs ${a.name}`, a.description, 'WebPage', {
			dateModified: latest,
			about: [{ '@id': `${origin}/#software` }, { '@type': 'SoftwareApplication', name: a.name }],
		}),
		breadcrumbs(origin, crumbs),
		faq(a.faq.map(([q, ans]) => [q, ans.replace(/`/g, '')])),
	]}
/>

<section class="wrap page-head hero">
	<Crumbs items={crumbs} />
	<div class="hero-grid">
		<div>
			<span class="eyebrow"><b>VS</b> {KIND[a.kind]}</span>
			<h1 class="display">
				<span>misomoon</span>
				<span class="vs" aria-label="versus">vs</span>
				<span class="them">{a.name}</span>
			</h1>
			<p class="lede answer">{@html rich(a.answer)}</p>
			<div class="ctas" {@attach watch((v) => (heroGone = v), true)}>
				<a class="cta primary" href={signup}>{CTA} <span class="arrow">→</span></a>
				<a class="cta ghost" href="#side-by-side">See all {score.total} rows</a>
			</div>
			<p class="assure mono">{TRIAL_DAYS}-day free trial · No card needed · Or self-host free</p>
		</div>

		<aside class="board print" aria-label="The tally" {@attach reveal(60)}>
			<p class="mono board-label">The tally · {score.total} rows</p>
			<div class="nums">
				<div class="n us"><b class="display num">{score.wins}</b><span class="mono">misomoon</span></div>
				<div class="n"><b class="display num">{score.even}</b><span class="mono">Even</span></div>
				<div class="n them"><b class="display num">{score.losses}</b><span class="mono">{a.short}</span></div>
			</div>
			<div class="split" aria-hidden="true">
				<span class="s-us" style:width={pct(score.wins)}></span><span class="s-even" style:width={pct(score.even)}></span><span class="s-them" style:width={pct(score.losses)}></span>
			</div>
			<p class="mono board-foot">Every row has a source · checked {day(latest)}</p>
		</aside>
	</div>

	<div class="tape" {@attach reveal(80)}>
		<article class="side print ours">
			<h2 class="mono">misomoon</h2>
			<dl>
				{#each key as f (f.label)}<div><dt class="mono">{f.label}</dt><dd>{@html rich(f.us)}</dd></div>{/each}
				<div><dt class="mono">Tracker</dt><dd>{OURS.coreKb.toFixed(1)} KB core</dd></div>
			</dl>
		</article>
		<article class="side print">
			<h2 class="mono">{a.short}</h2>
			<dl>
				{#each key as f (f.label)}<div><dt class="mono">{f.label}</dt><dd>{@html rich(f.them)}<sup><a href="#source-{n(f.src)}">{n(f.src)}</a></sup></dd></div>{/each}
				<div><dt class="mono">Tracker</dt><dd>{a.trackerKb} KB</dd></div>
			</dl>
		</article>
	</div>
</section>

<section class="wrap gains">
	<h2 class="display" {@attach reveal()}>Why teams switch from {a.short}</h2>
	<div class="gain-grid">
		{#if ratio}
			<article class="gain print hot" {@attach reveal(0)}>
				<p class="mono g-label">Page weight</p>
				<p class="big display num">{ratio}×</p>
				<h3>lighter on every page</h3>
				<p>misomoon’s Light preset is {OURS.lightKb} KB gzipped. {a.short}’s tracker measured {a.trackerKb} KB.<sup><a href="#source-{n(data.measured)}">{n(data.measured)}</a></sup></p>
			</article>
		{/if}
		{#each top as g, i (g.fact.label)}
			<article class="gain print" {@attach reveal((i + (ratio ? 1 : 0)) * 70)}>
				<p class="mono g-label">{g.fact.label}</p>
				<h3>{g.headline}</h3>
				<dl>
					<div class="us"><dt class="mono">misomoon</dt><dd>{@html rich(g.fact.us)}</dd></div>
					<div><dt class="mono">{a.short}</dt><dd>{@html rich(g.fact.them)}<sup><a href="#source-{n(g.fact.src)}">{n(g.fact.src)}</a></sup></dd></div>
				</dl>
			</article>
		{/each}
	</div>
</section>

<section class="wrap picks">
	<h2 class="display" {@attach reveal()}>The short answer</h2>
	<div class="pick-grid">
		<div class="pick print ours" {@attach reveal(40)}>
			<h3 class="mono">misomoon is the better fit if</h3>
			<ul>
				{#each a.pickUs as p (p.text)}<li>{@html rich(p.text)}<sup><a href="#source-{n(p.src)}">{n(p.src)}</a></sup></li>{/each}
			</ul>
			<a class="cta primary" href={signup}>Make the switch <span class="arrow">→</span></a>
		</div>
		<div class="pick print theirs" {@attach reveal(100)}>
			<h3 class="mono">{a.short} may suit you better if</h3>
			<ul>
				{#each a.pickThem as p (p.text)}<li>{@html rich(p.text)}<sup><a href="#source-{n(p.src)}">{n(p.src)}</a></sup></li>{/each}
			</ul>
		</div>
	</div>
</section>

<section class="wrap table-wrap" id="side-by-side">
	<h2 class="display" {@attach reveal()}>Every row, side by side</h2>
	<p class="sub">Each fact about {a.short} links to the page it came from, with the day we read it.</p>
	<div class="table print" {@attach reveal(60)}>
		<table>
			<thead>
				<tr>
					<th scope="col"><span class="visually-hidden">Feature</span></th>
					<th scope="col" class="ours">misomoon</th>
					<th scope="col">{a.short}</th>
					<th scope="col" class="edge-h">Edge</th>
				</tr>
			</thead>
			<tbody>
				{#each a.facts as f (f.label)}
					<tr>
						<th scope="row">{f.label}</th>
						<td class="ours" data-label="misomoon">{@html rich(f.us)}</td>
						<td data-label={a.short}>{@html rich(f.them)}<sup><a href="#source-{n(f.src)}">{n(f.src)}</a></sup></td>
						<td class="edge">
							{#if f.edge === 'us'}<span class="tag us mono">misomoon</span>{:else if f.edge === 'them'}<span class="tag them mono">{a.short}</span>{:else}<span class="tag even mono">Even</span>{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</section>

<section class="wrap weigh-wrap">
	<h2 class="display" {@attach reveal()}>{ratio ? `${ratio}× lighter on every page` : 'Page weight'}</h2>
	<div {@attach reveal(60)}>
		<WeighIn
			caption="Tracker size, gzipped, as we measured it"
			rows={[
				{ name: 'misomoon, core', kb: OURS.coreKb, ours: true },
				{ name: 'misomoon, Light', kb: OURS.lightKb, ours: true },
				{ name: 'misomoon, every feature', kb: OURS.fullKb, ours: true },
				{ name: a.short, kb: a.trackerKb },
			]}
		/>
	</div>
</section>

<section class="wrap switch">
	<h2 class="display" {@attach reveal()}>Switch without losing a day of data</h2>
	<p class="sub">Run misomoon next to {a.short} first. Your old numbers keep counting until the new ones line up.</p>
	<ol>
		{#each a.switching as s, i (s)}
			<li class="print" {@attach reveal(i * 60)}><b class="display">{i + 1}</b><p>{@html rich(s)}</p></li>
		{/each}
	</ol>
	<div class="ctas switch-ctas">
		<a class="cta primary" href={signup}>{CTA} <span class="arrow">→</span></a>
		<a class="cta ghost" href={docLink(data.docsUrl, `migrate-${a.slug}`)}>Read the switching guide</a>
	</div>
</section>

<section class="wrap qa">
	<h2 class="display" {@attach reveal()}>Questions</h2>
	<div class="faq">
		{#each a.faq as [q, ans] (q)}
			<details>
				<summary>{q}</summary>
				<p>{@html rich(ans)}</p>
			</details>
		{/each}
	</div>
</section>

<section class="wrap sources" id="sources">
	<h2 class="mono">Sources</h2>
	<p>
		misomoon’s own facts are in its docs, and its prices on <a href="/pricing">the pricing page</a>. Its plans count events: pageviews and custom events together. Prices
		and features change: follow the links to confirm.
	</p>
	<ol>
		{#each sources as s, i (s.src)}
			<li id="source-{i + 1}"><a href={s.src} rel="noopener">{host(s.src)}{new URL(s.src).pathname.replace(/\/$/, '')}</a> <span class="mono">checked {day(s.checked)}</span></li>
		{/each}
	</ol>
</section>

<section class="wrap others">
	<h2 class="mono">Other comparisons</h2>
	<ul>
		{#each data.others as o (o.slug)}<li><a class="chip" href="/alternatives/{o.slug}">vs {o.short}</a></li>{/each}
		<li><a class="chip" href="/alternatives">All comparisons</a></li>
	</ul>
</section>

<section class="wrap">
	<div class="closer print" {@attach watch((v) => (closerSeen = v), false)}>
		<div>
			<h2 class="display">Run it next to {a.short} for a week.</h2>
			<p>One script tag, no cookies, and your own numbers to compare. {TRIAL_DAYS} days free with no card, or self-host it in your Cloudflare account.</p>
		</div>
		<div class="ctas">
			<a class="cta primary" href={signup}>{CTA} <span class="arrow">→</span></a>
			<a class="cta ghost" href="/demo">Open the demo</a>
		</div>
	</div>
</section>

{#if heroGone && !closerSeen}
	<div class="dock print" transition:fly={{ y: 24, duration: 220 }}>
		<p><span class="mono">vs {a.short}</span> misomoon wins <b>{score.wins}</b> of {score.total} rows</p>
		<a class="cta primary" href={signup}>{CTA} <span class="arrow">→</span></a>
	</div>
{/if}

<style>
	.hero h1 {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0 0.22em;
	}
	.hero .them {
		color: var(--text-2);
	}
	.vs {
		display: inline-grid;
		place-items: center;
		width: 1.15em;
		height: 1.15em;
		border-radius: 999px;
		background: var(--vermilion);
		color: var(--on-vermilion);
		font-size: 0.42em;
		transform: rotate(-8deg);
		box-shadow: 3px 3px 0 var(--ink);
	}
	.answer {
		max-width: 760px;
	}
	.answer :global(code),
	td :global(code),
	.pick :global(code),
	.faq :global(code),
	.switch :global(code) {
		font-family: var(--font-mono);
		font-size: 0.85em;
		padding: 1px 5px;
		border-radius: 4px;
		/* a tint of the text colour, so it reads on paper and inside the ink box */
		background: color-mix(in srgb, currentColor 14%, transparent);
	}
	.hero-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 340px;
		gap: 56px;
		align-items: end;
	}
	.ctas {
		display: flex;
		flex-wrap: wrap;
		gap: 14px;
		margin-top: 30px;
	}
	.assure {
		margin: 14px 0 0;
		font-size: 11px;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--text-3);
	}
	.board {
		padding: 22px 24px 18px;
		transform: rotate(1.2deg);
		box-shadow: 6px 6px 0 var(--ink);
	}
	.board-label,
	.board-foot {
		margin: 0;
		font-size: 10.5px;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--text-3);
	}
	.nums {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		margin: 14px 0 16px;
	}
	.n {
		display: grid;
		justify-items: center;
		gap: 2px;
	}
	.n + .n {
		border-left: 1.5px dashed var(--line-strong);
	}
	.n b {
		font-size: 64px;
		line-height: 1;
		color: var(--text-3);
	}
	.n.us b {
		color: var(--miso);
	}
	.n.them b {
		color: var(--lunar);
	}
	.n span {
		font-size: 10.5px;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		text-align: center;
	}
	.split {
		display: flex;
		height: 14px;
		margin-bottom: 14px;
		border: 1.5px solid var(--ink);
		border-radius: 999px;
		overflow: hidden;
		background: var(--surface-2);
	}
	.s-us {
		background: var(--vermilion);
	}
	.s-even {
		background: repeating-linear-gradient(-45deg, var(--line-strong) 0 2px, transparent 2px 6px);
	}
	.s-them {
		background: var(--cobalt);
	}
	.gains {
		margin-top: 96px;
	}
	.gain-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 24px;
	}
	.gain {
		display: flex;
		flex-direction: column;
		padding: 22px 24px;
		box-shadow: 4px 4px 0 var(--ink);
	}
	.gain.hot {
		background: var(--vermilion);
		color: var(--on-vermilion);
		border-color: var(--ink);
	}
	.gain.hot sup a {
		color: inherit;
	}
	.g-label {
		margin: 0 0 10px;
		font-size: 10.5px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		opacity: 0.75;
	}
	.big {
		margin: 0;
		font-size: clamp(72px, 9vw, 112px);
		line-height: 0.9;
	}
	.gain h3 {
		margin: 0 0 14px;
		font-size: 24px;
		line-height: 1.15;
		text-wrap: balance;
	}
	.gain.hot h3 {
		margin-top: 4px;
	}
	.gain > p:last-child {
		margin: auto 0 0;
	}
	.gain dl {
		display: grid;
		gap: 10px;
		margin: auto 0 0;
	}
	.gain dl div {
		padding-top: 10px;
		border-top: 1px dashed var(--line-strong);
	}
	.gain dt {
		font-size: 10.5px;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--text-3);
	}
	.gain dd {
		margin: 2px 0 0;
		color: var(--text-2);
	}
	.gain .us dd {
		font-weight: 700;
		color: var(--text);
	}
	.gain .us dt {
		color: var(--miso);
	}
	.sub {
		margin: -12px 0 28px;
		max-width: 640px;
		color: var(--text-2);
	}
	.switch-ctas {
		margin-top: 32px;
	}
	.dock {
		position: fixed;
		z-index: 40;
		right: 24px;
		bottom: 24px;
		display: flex;
		align-items: center;
		gap: 18px;
		padding: 10px 10px 10px 20px;
		box-shadow: 5px 5px 0 var(--ink);
	}
	.dock p {
		margin: 0;
		font-size: 14.5px;
	}
	.dock p span {
		margin-right: 8px;
		font-size: 10.5px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-3);
	}
	.dock b {
		color: var(--miso);
	}
	.dock .cta {
		padding-block: 10px;
	}
	.tape {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 28px;
		margin-top: 44px;
	}
	.side {
		padding: 22px 24px;
	}
	.side h2 {
		margin: 0 0 14px;
		font-size: 13px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.side.ours {
		border-color: var(--vermilion);
		box-shadow: 6px 6px 0 var(--vermilion);
	}
	.side.ours h2 {
		color: var(--miso);
	}
	.side dl {
		display: grid;
		gap: 12px;
		margin: 0;
	}
	.side dl div {
		display: grid;
		grid-template-columns: 150px 1fr;
		gap: 12px;
		padding-top: 12px;
		border-top: 1px dashed var(--line-strong);
	}
	.side dt {
		font-size: 11px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-3);
	}
	.side dd {
		margin: 0;
		font-weight: 600;
	}
	sup {
		margin-left: 2px;
		font-size: 0.65em;
	}
	sup a {
		color: var(--lunar);
	}
	section > h2.display {
		margin: 0 0 24px;
		font-size: clamp(34px, 4.6vw, 60px);
	}
	.picks,
	.table-wrap,
	.weigh-wrap,
	.switch,
	.qa {
		margin-top: 96px;
	}
	.pick-grid {
		display: grid;
		grid-template-columns: 1.6fr 1fr;
		gap: 28px;
		align-items: start;
	}
	.pick {
		padding: 24px 26px;
		box-shadow: 4px 4px 0 var(--ink);
	}
	.pick.ours {
		background: var(--block);
		color: var(--on-block);
	}
	.pick.ours {
		padding: 30px 32px;
		box-shadow: 6px 6px 0 var(--vermilion);
	}
	.pick.ours li {
		font-size: 18px;
	}
	.pick.ours .cta {
		margin-top: 26px;
	}
	.pick.ours sup a {
		color: var(--mustard);
	}
	.pick.theirs {
		background: var(--surface-2);
		box-shadow: none;
	}
	.pick.theirs h3 {
		color: var(--text-3);
	}
	.pick.theirs li {
		font-size: 15.5px;
		color: var(--text-2);
	}
	.pick.theirs li::before {
		content: '·';
		color: var(--text-3);
	}
	.pick h3 {
		margin: 0 0 14px;
		font-size: 12px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--miso);
	}
	.pick ul {
		display: grid;
		gap: 12px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.pick li {
		position: relative;
		padding-left: 28px;
		font-size: 16.5px;
	}
	.pick li::before {
		content: '✓';
		position: absolute;
		left: 0;
		top: 0;
		font-weight: 800;
		color: var(--miso);
	}
	.table {
		overflow-x: auto;
		box-shadow: 4px 4px 0 var(--ink);
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 15px;
	}
	th,
	td {
		padding: 14px 18px;
		text-align: left;
		vertical-align: top;
		border-bottom: 1px solid var(--line);
	}
	thead th {
		font-family: var(--font-mono);
		font-stretch: 87.5%;
		font-size: 11.5px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		background: var(--surface-2);
		border-bottom: 2px solid var(--ink);
	}
	thead th.ours {
		color: var(--miso);
	}
	tbody th {
		width: 22%;
		font-weight: 700;
	}
	td.ours {
		background: var(--miso-soft);
		font-weight: 600;
	}
	.edge,
	.edge-h {
		width: 1%;
		white-space: nowrap;
	}
	.tag {
		display: inline-block;
		padding: 3px 8px;
		border-radius: 6px;
		font-size: 10.5px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		border: 1.5px solid currentColor;
	}
	.tag.us {
		color: var(--miso);
		transform: rotate(-2deg);
	}
	.tag.them {
		color: var(--lunar);
		transform: rotate(2deg);
	}
	.tag.even {
		color: var(--text-3);
	}
	.weigh-wrap > div {
		max-width: 880px;
	}
	.switch ol {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 24px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.switch li {
		padding: 22px 24px;
		box-shadow: 4px 4px 0 var(--ink);
	}
	.switch b {
		font-size: 56px;
		color: var(--miso);
	}
	.switch p {
		margin: 8px 0 0;
	}
	.faq {
		max-width: 820px;
		border-top: 2px solid var(--ink);
	}
	details {
		border-bottom: 2px solid var(--ink);
	}
	summary {
		padding: 20px 40px 20px 0;
		position: relative;
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
		color: var(--text-2);
		max-width: 680px;
	}
	.sources,
	.others {
		margin-top: 88px;
	}
	.sources h2,
	.others h2 {
		margin: 0 0 12px;
		font-size: 12px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.sources p {
		margin: 0 0 14px;
		color: var(--text-2);
	}
	.sources ol {
		margin: 0;
		padding-left: 22px;
		display: grid;
		gap: 6px;
		font-size: 14.5px;
	}
	.sources li:target {
		/* stays light in the night edition, so ink stays ink on it */
		--ink: var(--ink-print);
		--text: var(--ink-print);
		--text-2: var(--print-2);
		--text-3: var(--print-3);
		--surface: var(--print-surface);
		color: var(--ink-print);
		background: var(--highlight);
	}
	.sources a {
		color: var(--lunar);
		text-decoration: underline;
		text-underline-offset: 3px;
		word-break: break-all;
	}
	.sources span {
		font-size: 11px;
		color: var(--text-3);
	}
	.others ul {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}
	@media (max-width: 980px) {
		.hero-grid,
		.gain-grid {
			grid-template-columns: 1fr;
		}
		.board {
			max-width: 420px;
			transform: none;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.board {
			transform: none;
		}
	}
	@media (max-width: 860px) {
		.tape,
		.pick-grid,
		.switch ol {
			grid-template-columns: 1fr;
		}
		.dock {
			left: 12px;
			right: 12px;
			bottom: 12px;
			justify-content: space-between;
		}
		.dock p span {
			display: none;
		}
		.side dl div {
			grid-template-columns: 1fr;
			gap: 4px;
		}
		/* the table becomes one card per row */
		thead {
			display: none;
		}
		table,
		tbody,
		tr,
		th,
		td {
			display: block;
			width: auto;
		}
		tr {
			padding: 14px 16px;
			border-bottom: 2px solid var(--ink);
		}
		tbody th,
		td {
			padding: 4px 0;
			border: 0;
		}
		td.ours {
			background: none;
		}
		td[data-label]::before {
			content: attr(data-label) ': ';
			font-family: var(--font-mono);
			font-size: 11px;
			text-transform: uppercase;
			color: var(--text-3);
		}
	}
</style>
