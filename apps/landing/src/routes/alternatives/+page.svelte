<script lang="ts">
	import Crumbs from '#lib/components/Crumbs.svelte'
	import Seo from '#lib/components/Seo.svelte'
	import WeighIn from '#lib/components/WeighIn.svelte'
	import { docLink } from '#lib/links.ts'
	import { CTA, TRIAL_DAYS, signupUrl } from '#lib/pricing.ts'
	import { reveal } from '#lib/reveal.ts'
	import { breadcrumbs, day, itemList, webpage } from '#lib/seo.ts'
	import { page } from '$app/state'

	let { data } = $props()
	const origin = $derived(page.url.origin)
	const crumbs: [string, string][] = [['Compare', '/alternatives']]
	const groups = [
		['self-hosted', 'Self-hosted and open source', 'Tools you run yourself. Most need a server with Docker and a database. misomoon needs a Cloudflare account.'],
		['hosted', 'Hosted services', 'Tools someone else runs for you, on their servers. misomoon Cloud runs it for you too, in the region you pick, or you keep it in your own account.'],
		['product', 'Product analytics and session replay', 'Bigger tools built for product teams, with heavier trackers. misomoon covers the web analytics part at a fraction of the weight.'],
	] as const
	const ALTERNATIVES = $derived(data.alternatives)
	const CHECKED = $derived(data.checked)
	const OURS = $derived(data.ours)
	const signup = $derived(signupUrl(data.appUrl))
	const facts = $derived(ALTERNATIVES.reduce((sum, a) => sum + a.score.total, 0))
	const heavier = $derived(ALTERNATIVES.filter((a) => a.trackerKb > OURS.lightKb).length)
	const rows = $derived([
		{ name: 'misomoon, core', kb: OURS.coreKb, ours: true },
		{ name: 'misomoon, Light', kb: OURS.lightKb, ours: true },
		{ name: 'misomoon, every feature', kb: OURS.fullKb, ours: true },
		...ALTERNATIVES.map((a) => ({ name: a.short, kb: a.trackerKb, href: `/alternatives/${a.slug}` })),
	])
</script>

<Seo
	title="Analytics alternatives, compared with sources"
	description="misomoon next to {ALTERNATIVES.length} analytics tools: hosting needs, cookies, funnels, revenue, MCP and tracker size, with a source for every fact."
	path="/alternatives"
	schema={[
		webpage(origin, '/alternatives', 'misomoon compared with other analytics tools', 'A source for every fact, checked on ' + CHECKED, 'CollectionPage', { dateModified: CHECKED }),
		breadcrumbs(origin, crumbs),
		itemList(
			origin,
			ALTERNATIVES.map((a) => ({ name: `misomoon vs ${a.name}`, path: `/alternatives/${a.slug}` })),
		),
	]}
/>

<section class="wrap page-head">
	<Crumbs items={crumbs} />
	<span class="eyebrow"><b>VS</b> Compare</span>
	<h1 class="display">The tools you know,<br /><em>side by side.</em></h1>
	<p class="lede">
		Every fact about another product on these pages comes from its own pricing page, docs, repository or license, with a link. Where we couldn’t confirm something, the
		page says so. Where another tool does better, the page says that too.
	</p>
	<div class="ctas">
		<a class="cta primary" href={signup}>{CTA} <span class="arrow">→</span></a>
		<a class="cta ghost" href="/demo">Open the demo</a>
	</div>
	<p class="stamp mono">Checked on {day(CHECKED)}</p>
</section>

<section class="wrap">
	<dl class="stats print" {@attach reveal()}>
		<div><dt class="mono">Tools compared</dt><dd class="display num">{ALTERNATIVES.length}</dd></div>
		<div><dt class="mono">Facts, each with a source</dt><dd class="display num">{facts}</dd></div>
		<div><dt class="mono">Trackers heavier than misomoon Light</dt><dd class="display num">{heavier}<small>/{ALTERNATIVES.length}</small></dd></div>
		<div><dt class="mono">Cookies misomoon sets</dt><dd class="display num">0</dd></div>
	</dl>
</section>

<section class="wrap weigh-wrap" {@attach reveal()}>
	<WeighIn caption="The weigh-in: tracker size, gzipped, as we measured it" {rows} />
	<p class="note">Every byte of the tracker loads on every page of your site. misomoon’s Light preset keeps the signals most sites read and weighs 1.8 KB.</p>
</section>

{#each groups as [kind, heading, lede] (kind)}
	<section class="wrap group">
		<header {@attach reveal()}>
			<h2 class="display">{heading}</h2>
			<p>{lede}</p>
		</header>
		<ul class="tickets">
			{#each ALTERNATIVES.filter((a) => a.kind === kind) as a, i (a.slug)}
				<li {@attach reveal(i * 60)}>
					<a class="ticket print" href="/alternatives/{a.slug}">
						<span class="perf" aria-hidden="true"></span>
						<span class="vs mono">misomoon <b>vs</b></span>
						<h3 class="display">{a.name}</h3>
						<p>{a.answer}</p>
						<p class="tally mono"><b>{a.score.wins}</b> of {a.score.total} rows go to misomoon</p>
						<dl class="mono">
							{#if a.where}<div><dt>{kind === 'self-hosted' ? 'Needs' : 'Data at'}</dt><dd>{a.where}</dd></div>{/if}
							<div><dt>Tracker</dt><dd>{a.trackerKb} KB</dd></div>
						</dl>
						<span class="go mono">Compare <span aria-hidden="true">→</span></span>
					</a>
				</li>
			{/each}
		</ul>
	</section>
{/each}

<section class="wrap method" {@attach reveal()}>
	<h2 class="display">How we compare</h2>
	<div class="cols">
		<p>We read each vendor’s own pages and link them next to each fact. “Their claim” marks something a vendor says about itself, such as needing no consent banner.</p>
		<p>“Not found” means we looked in their docs and pricing and didn’t find it. It may still exist. Tracker sizes are our own download, gzipped at the default level.</p>
		<p>
			Prices and features change. If a fact is wrong or out of date, <a href="https://github.com/jackzard/misomoon/issues">open an issue</a> with the source. The full
			tables are in <a href={docLink(data.docsUrl, 'comparison')}>the comparison docs</a>.
		</p>
	</div>
</section>

<section class="wrap">
	<div class="closer print">
		<div>
			<h2 class="display">Try it next to yours.</h2>
			<p>misomoon is one script tag. Run it beside your current analytics and compare the numbers yourself. {TRIAL_DAYS} days free with no card, or self-host it free.</p>
		</div>
		<div class="ctas">
			<a class="cta primary" href={signup}>{CTA} <span class="arrow">→</span></a>
			<a class="cta ghost" href="/demo">Open the demo</a>
		</div>
	</div>
</section>

<style>
	.stamp {
		display: inline-block;
		margin: 26px 0 0;
		padding: 8px 14px;
		border: 2px dashed var(--vermilion);
		border-radius: 8px;
		color: var(--miso);
		font-size: 12px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		transform: rotate(-1.5deg);
	}
	.page-head .ctas {
		display: flex;
		flex-wrap: wrap;
		gap: 14px;
		margin-top: 30px;
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		margin: 0 0 72px;
		padding: 0;
		box-shadow: 6px 6px 0 var(--ink);
	}
	.stats div {
		padding: 22px 24px;
	}
	.stats div + div {
		border-left: 1.5px dashed var(--line-strong);
	}
	.stats dt {
		font-size: 10.5px;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--text-3);
	}
	.stats dd {
		margin: 6px 0 0;
		font-size: clamp(44px, 5vw, 68px);
		line-height: 1;
		color: var(--miso);
	}
	.stats small {
		font-size: 0.45em;
		color: var(--text-3);
	}
	.ticket .tally {
		margin-top: -6px;
		font-size: 11px;
		color: var(--text);
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.ticket .tally b {
		color: var(--miso);
	}
	.weigh-wrap {
		max-width: 920px;
	}
	.note {
		margin: 16px 0 0;
		color: var(--text-2);
		font-size: 15px;
	}
	.group {
		margin-top: 88px;
	}
	.group header {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 32px;
		align-items: end;
		padding-bottom: 20px;
		border-bottom: 2px solid var(--ink);
	}
	.group h2 {
		margin: 0;
		font-size: clamp(34px, 4.4vw, 58px);
	}
	.group header p {
		margin: 0;
		color: var(--text-2);
	}
	.tickets {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 24px;
		margin: 28px 0 0;
		padding: 0;
		list-style: none;
	}
	.ticket {
		display: flex;
		flex-direction: column;
		height: 100%;
		padding: 24px 24px 20px;
		box-shadow: 4px 4px 0 var(--ink);
		transition: transform var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);
	}
	.ticket:hover {
		transform: translate(-3px, -3px);
		box-shadow: 7px 7px 0 var(--vermilion);
	}
	/* a perforated tear line, like a ticket stub */
	.perf {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 56px;
		border-top: 2px dashed var(--line-strong);
	}
	.vs {
		font-size: 11px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-3);
	}
	.vs b {
		display: inline-grid;
		place-items: center;
		width: 26px;
		height: 26px;
		margin-left: 4px;
		border-radius: 999px;
		background: var(--vermilion);
		color: var(--on-vermilion);
		font-size: 10px;
	}
	.ticket h3 {
		margin: 12px 0 10px;
		font-size: 34px;
	}
	.ticket p {
		margin: 0 0 16px;
		font-size: 15px;
		color: var(--text-2);
	}
	.ticket dl {
		display: grid;
		gap: 6px;
		margin: auto 0 0;
		padding-bottom: 30px;
		font-size: 11.5px;
	}
	.ticket dl div {
		display: grid;
		grid-template-columns: 72px 1fr;
		gap: 8px;
	}
	.ticket dt {
		color: var(--text-3);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.ticket dd {
		margin: 0;
	}
	.go {
		margin-top: 8px;
		font-size: 12px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--miso);
	}
	.method {
		margin-top: 104px;
	}
	.method h2 {
		margin: 0 0 24px;
		font-size: clamp(30px, 3.6vw, 46px);
	}
	.method .cols {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 32px;
	}
	.method p {
		margin: 0;
		color: var(--text-2);
	}
	.method a {
		color: var(--miso);
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	@media (max-width: 860px) {
		.stats {
			grid-template-columns: 1fr 1fr;
		}
		.stats div:nth-child(3) {
			border-left: 0;
		}
		.stats div:nth-child(n + 3) {
			border-top: 1.5px dashed var(--line-strong);
		}
		.group header,
		.method .cols {
			grid-template-columns: 1fr;
		}
	}
</style>
