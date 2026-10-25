<script lang="ts">
	import type { AggregateResponse, BreakdownResponse, RealtimeResponse } from '../lib/api'
	import { getDash, PERIODS, Resource } from '../lib/dash.svelte'
	import { num, pct } from '../lib/format'
	import { displayKey } from '../lib/labels'

	/**
	 * The page in a few sentences: how many people came, whether that is more or
	 * less than before, and where they came from.
	 */
	const dash = getDash()
	const base = $derived(dash.site ? `${dash.params}&_=${dash.tick}` : null)
	const agg = new Resource<AggregateResponse>(() => (base ? `/api/v1/stats/aggregate?${base}&compare=previous` : null))
	const top = (property: string) => new Resource<BreakdownResponse>(() => (base ? `/api/v1/stats/breakdown?${base}&property=${property}&limit=1` : null))
	const channel = top('channel')
	const page = top('page')
	const country = top('country')
	const live = new Resource<RealtimeResponse>(() => (dash.site ? `/api/v1/stats/realtime?site=${dash.site}&_=${dash.tick}` : null), 10_000)

	const when = $derived.by(() => {
		if (dash.period === 'custom' && dash.from && dash.to) return `between ${dash.from} and ${dash.to}`
		if (dash.period === 'today') return 'today'
		if (dash.period === 'yesterday') return 'yesterday'
		if (dash.period === 'all') return 'since tracking began'
		const label = PERIODS.find((p) => p.key === dash.period)?.label ?? dash.period
		if (dash.period === 'mtd') return 'so far this month'
		if (dash.period === 'ytd') return 'so far this year'
		return `in the ${label.toLowerCase()}`
	})

	const people = $derived(agg.data?.current.visitors ?? null)
	const change = $derived(agg.data?.change?.visitors ?? null)
	function share(r: BreakdownResponse | null) {
		const row = r?.rows[0]
		return row && r.total_visitors ? Math.round((row.visitors / r.total_visitors) * 100) : 0
	}
	const ch = $derived(channel.data?.rows[0] ?? null)
	const pg = $derived(page.data?.rows[0] ?? null)
	const co = $derived(country.data?.rows[0] ?? null)
</script>

<section class="brief card">
	{#if agg.error}
		<p class="muted">The summary didn't load: {agg.error}</p>
	{:else if people == null}
		<div class="skeleton" style="height: 22px; width: 70%"></div>
		<div class="skeleton" style="height: 22px; width: 45%; margin-top: 10px"></div>
	{:else if people === 0}
		<p class="lede">Nobody visited {when}{dash.filters.length ? ' with these filters' : ''}.</p>
	{:else}
		<p class="lede">
			<strong class="num">{num(people)}</strong>
			{people === 1 ? 'person' : 'people'} visited {when}{#if change != null},
				{#if Math.abs(change) < 1}about the same as before{:else}
					<span class:up={change > 0} class:down={change < 0}>{change > 0 ? 'up' : 'down'} {pct(Math.abs(change), 0)}</span> on the period before{/if}{/if}.
			{#if ch}Most came through <strong>{displayKey('channel', ch.key)}</strong> ({share(channel.data)}%){#if pg}, and <strong class="path">{pg.key}</strong> was the most opened page{/if}.{/if}
			{#if co}The biggest audience is in <strong>{displayKey('country', co.key)}</strong>.{/if}
			{#if live.data?.visitors}
				<button class="now" onclick={() => (dash.view = 'realtime')}><span class="dot"></span>{live.data.visitors} on the site right now</button>
			{/if}
		</p>
	{/if}
</section>

<style>
	.brief {
		padding: 20px 22px;
	}
	.lede {
		margin: 0;
		font-size: 19px;
		line-height: 1.5;
		letter-spacing: -0.01em;
		text-wrap: pretty;
		color: var(--text-2);
	}
	.lede strong {
		color: var(--text);
		font-weight: 700;
	}
	.lede .num {
		font-size: 22px;
	}
	.path {
		font-family: var(--font-mono);
		font-size: 0.85em;
		background: var(--surface-2);
		padding: 1px 6px;
		border-radius: var(--radius-sm);
	}
	.up {
		color: var(--good);
		font-weight: 600;
	}
	.down {
		color: var(--bad);
		font-weight: 600;
	}
	.now {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin-left: 4px;
		padding: 1px 10px;
		border: 1.5px solid var(--edge);
		border-radius: var(--radius-xs);
		font-size: 13px;
		font-weight: 600;
		color: var(--text);
		vertical-align: 2px;
	}
	.now:hover {
		background: var(--miso-soft);
	}
	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--good);
	}
	@media (max-width: 720px) {
		.lede {
			font-size: 16px;
		}
	}
</style>
