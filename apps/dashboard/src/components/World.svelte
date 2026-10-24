<script lang="ts">
	import type { Row } from '../lib/api'
	import { countryName, flag, isCountry } from '../lib/countries'
	import { num, pct } from '../lib/format'
	import Board, { type BoardTab } from './Board.svelte'
	import Globe from './Globe.svelte'

	/**
	 * Where people are: the globe and the country list side by side. Opening a country in
	 * the list spins the globe to it, and selecting a country on the globe opens it.
	 */
	const tabs: BoardTab[] = [
		{
			property: 'country',
			label: 'Countries',
			plural: 'countries',
			lenses: [
				{ property: 'region', label: 'Regions' },
				{ property: 'city', label: 'Cities' },
				{ property: 'language', label: 'Languages' },
				{ property: 'channel', label: 'Came via' },
			],
		},
	]
	let rows = $state<Row[]>([])
	let opened = $state<string | null>(null)
	const places = $derived(rows.filter((r) => isCountry(r.key)))
	const total = $derived(rows.reduce((n, r) => n + r.visitors, 0))
	const top3 = $derived(places.slice(0, 3).reduce((n, r) => n + r.visitors, 0))
	const lead = $derived(places[0])
</script>

<section class="card world">
	<div class="sphere">
		<Globe {rows} selected={opened} onpick={(code) => (opened = code)} />
		{#if places.length}
			<dl class="facts">
				<div><dt class="mono">Countries</dt><dd class="num">{num(places.length)}{places.length >= 100 ? '+' : ''}</dd></div>
				<div><dt class="mono">Top 3 hold</dt><dd class="num">{pct(total ? (top3 / total) * 100 : 0, 0)}</dd></div>
				{#if lead}<div><dt class="mono">Most from</dt><dd>{flag(lead.key)} {countryName(lead.key)}</dd></div>{/if}
			</dl>
		{/if}
	</div>
	<Board title="Where they are" {tabs} storageKey="places" limit={10} fetch={100} bare bind:rows bind:opened />
</section>

<style>
	.world {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		overflow: hidden;
	}
	.sphere {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 18px;
		padding: 26px 24px 20px;
		border-right: 1px dashed var(--line-strong);
		background: var(--surface-2);
	}
	.world > :global(.board) {
		min-height: 100%;
	}
	.facts {
		display: grid;
		grid-template-columns: repeat(3, auto);
		gap: 0;
		margin: 0;
		border: 1.5px solid var(--edge);
		border-radius: var(--radius);
		background: var(--surface);
		box-shadow: var(--shadow-sm);
	}
	.facts div {
		padding: 8px 14px;
	}
	.facts div + div {
		border-left: 1px dashed var(--line-strong);
	}
	dt {
		font-size: 9.5px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-3);
	}
	dd {
		margin: 2px 0 0;
		font-size: 14px;
		font-weight: 700;
		white-space: nowrap;
	}
	@media (max-width: 900px) {
		.world {
			grid-template-columns: 1fr;
		}
		.sphere {
			border-right: 0;
			border-bottom: 1px dashed var(--line-strong);
			padding: 18px 16px 16px;
		}
		.sphere > :global(.globe) {
			max-width: 360px;
		}
	}
	@media (max-width: 420px) {
		.facts {
			grid-template-columns: 1fr 1fr;
		}
		.facts div:nth-child(3) {
			grid-column: 1 / -1;
			border-left: 0;
			border-top: 1px dashed var(--line-strong);
		}
	}
</style>
