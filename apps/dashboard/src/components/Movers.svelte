<script lang="ts">
	import TrendingDown from '@lucide/svelte/icons/trending-down'
	import TrendingUp from '@lucide/svelte/icons/trending-up'
	import type { BreakdownResponse, Row } from '../lib/api'
	import { getDash, Resource } from '../lib/dash.svelte'
	import { num } from '../lib/format'
	import { dimLabel, displayKey, favicon, iconDomain, prefix } from '../lib/labels'
	import { rowChange } from './Board.svelte'
	import Delta from './Delta.svelte'

	/**
	 * What moved since the comparison period: the sources, pages and countries that gained
	 * or lost the most people. Small rows swing by large percents on a handful of visits, so
	 * a row ranks by the people it gained or lost, and tiny ones stay out.
	 */
	const dash = getDash()
	const DIMS = ['source', 'page', 'country'] as const
	const lists = DIMS.map(
		(d) =>
			new Resource<BreakdownResponse>(() =>
				dash.site && dash.compare ? `/api/v1/stats/breakdown?${dash.params}&property=${d}&limit=25&compare=${dash.compareTo}&_=${dash.tick}` : null,
			),
	)

	interface Move {
		dim: string
		row: Row
		diff: number
	}
	const loading = $derived(lists.some((l) => !l.data && !l.error))
	const error = $derived(lists.find((l) => l.error)?.error ?? null)
	const moves = $derived.by((): Move[] =>
		lists.flatMap((l, i) => {
			const data = l.data
			if (!data || data.property !== DIMS[i]) return []
			// at least 3 people, and at least 1% of the period's people, on one side or the other
			const floor = Math.max(3, Math.round(data.total_visitors * 0.01))
			return data.rows
				.filter((r) => r.previous_visitors != null && Math.max(r.visitors, r.previous_visitors) >= floor && r.key !== '(none)')
				.map((row) => ({ dim: DIMS[i], row, diff: row.visitors - (row.previous_visitors ?? 0) }))
		}),
	)
	const up = $derived(moves.filter((m) => m.diff > 0).sort((a, b) => b.diff - a.diff).slice(0, 4))
	const down = $derived(moves.filter((m) => m.diff < 0).sort((a, b) => a.diff - b.diff).slice(0, 4))
	const against = $derived(dash.compareTo === 'year' ? 'the same dates a year earlier' : 'the period before')
</script>

<section class="card movers">
	<header>
		<h3>What changed</h3>
		{#if dash.compare}<p class="muted">Against {against}</p>{/if}
	</header>

	{#if !dash.compare}
		<div class="off">
			<p>See which sources, pages and countries gained or lost people.</p>
			<button class="btn" onclick={() => (dash.compare = true)}>Compare with the period before</button>
		</div>
	{:else if error}
		<p class="empty">Couldn't load this. {error}</p>
	{:else if loading}
		<div class="cols">
			{#each [0, 1] as c (c)}
				<div>{#each Array(3) as _, i (i)}<div class="sk"><span class="skeleton" style="width: {80 - i * 14}%"></span></div>{/each}</div>
			{/each}
		</div>
	{:else if !up.length && !down.length}
		<p class="empty">Nothing moved much. The biggest sources, pages and countries are about where they were.</p>
	{:else}
		<div class="cols">
			{#each [{ label: 'Gaining', icon: TrendingUp, list: up, kind: 'up' }, { label: 'Losing', icon: TrendingDown, list: down, kind: 'down' }] as side (side.kind)}
				<div class="side {side.kind}">
					<h4><side.icon size={14} /> {side.label}</h4>
					{#if side.list.length}
						<ul>
							{#each side.list as m (m.dim + m.row.key)}
								{@const domain = iconDomain(m.dim, m.row.key)}
								{@const pre = prefix(m.dim, m.row.key)}
								{@const on = dash.hasFilter(m.dim, m.row.key)}
								<li>
									<button class="move" class:on onclick={() => dash.toggleFilter(m.dim, m.row.key)} title={on ? 'Remove filter' : `Filter by ${displayKey(m.dim, m.row.key)}`}>
										<span class="dim mono">{dimLabel(m.dim)}</span>
										<span class="name">
											{#if domain}
												<img src={favicon(domain)} alt="" width="14" height="14" loading="lazy" onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')} />
											{:else if pre}<span class="flag">{pre}</span>{/if}
											<span class="text">{displayKey(m.dim, m.row.key)}</span>
										</span>
										<span class="diff num">{m.diff > 0 ? '+' : '−'}{num(Math.abs(m.diff))}</span>
										<Delta value={rowChange(m.row)} />
									</button>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="none muted">{side.kind === 'up' ? 'Nothing gained much.' : 'Nothing lost much.'}</p>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</section>

<style>
	.movers {
		display: flex;
		flex-direction: column;
		padding-bottom: 10px;
	}
	header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		padding: 14px 18px 10px;
	}
	h3 {
		margin: 0;
		font-size: 15px;
		font-weight: 700;
	}
	header p {
		margin: 0;
		font-size: 12px;
	}
	.cols {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0;
		flex: 1;
	}
	.side {
		padding: 0 10px;
	}
	.side + .side {
		border-left: 1px dashed var(--line-strong);
	}
	h4 {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 0 8px 6px;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}
	.up h4 {
		color: var(--good);
	}
	.down h4 {
		color: var(--bad);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.move {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto;
		grid-template-areas: 'dim dim dim' 'name diff delta';
		align-items: center;
		column-gap: 8px;
		width: 100%;
		padding: 7px 8px;
		border-radius: var(--radius);
		text-align: left;
	}
	.move:hover {
		background: var(--surface-hover);
	}
	.move.on {
		box-shadow: inset 0 0 0 1.5px var(--edge);
	}
	.dim {
		grid-area: dim;
		font-size: 9.5px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-4);
	}
	.name {
		grid-area: name;
		display: flex;
		align-items: center;
		gap: 7px;
		min-width: 0;
		font-size: 13px;
	}
	.name img {
		flex: none;
		border-radius: var(--radius-xs);
	}
	.flag {
		font-size: 15px;
		line-height: 1;
	}
	.text {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.diff {
		grid-area: diff;
		font-size: 13px;
		font-weight: 600;
	}
	.move :global(.delta) {
		grid-area: delta;
	}
	.none {
		margin: 4px 8px 12px;
		font-size: 12.5px;
	}
	.off {
		display: grid;
		justify-items: start;
		gap: 12px;
		padding: 4px 18px 14px;
	}
	.off p {
		margin: 0;
		font-size: 13px;
		color: var(--text-2);
	}
	.sk {
		display: flex;
		align-items: center;
		height: 44px;
		padding: 0 8px;
	}
	.sk .skeleton {
		height: 14px;
	}
	.empty {
		margin: 0;
		padding: 24px 18px 30px;
		font-size: 13px;
		color: var(--text-3);
	}
	@media (max-width: 640px) {
		.cols {
			grid-template-columns: 1fr;
		}
		.side + .side {
			border-left: 0;
			border-top: 1px dashed var(--line-strong);
			padding-top: 10px;
			margin-top: 6px;
		}
	}
</style>
