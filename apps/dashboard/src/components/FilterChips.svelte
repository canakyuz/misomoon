<script lang="ts">
	import X from '@lucide/svelte/icons/x'
	import { getDash } from '../lib/dash.svelte'
	import { dimLabel, displayKey, OP_LABELS } from '../lib/labels'

	/** The filters in effect, on their own line under the page header, so the controls above never shift. */
	const dash = getDash()
</script>

{#if dash.filters.length || dash.notice}
	<div class="applied" aria-label="Filters in effect">
		{#if dash.filters.length}<span class="lead mono">Filtered by</span>{/if}
		{#each dash.filters as f (f.dim)}
			<span class="chip">
				<span class="d">{dimLabel(f.dim)}</span>
				<span class="o">{OP_LABELS[f.op]}</span>
				<span class="v">{f.values.map((v) => displayKey(f.dim, v)).join(' or ')}</span>
				<button onclick={() => dash.removeFilter(f.dim)} aria-label="Remove {dimLabel(f.dim)} filter"><X size={12} /></button>
			</span>
		{/each}
		{#if dash.filters.length > 1}
			<button class="clear" onclick={() => (dash.filters = [])}>Clear all</button>
		{/if}
		{#if dash.notice}<span class="notice" role="alert">{dash.notice}</span>{/if}
	</div>
{/if}

<style>
	.applied {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding-top: 14px;
		border-top: 1px dashed var(--line-strong);
	}
	.lead {
		font-size: 10.5px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-3);
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		max-width: 100%;
		height: 30px;
		padding: 0 4px 0 11px;
		border-radius: var(--radius-sm);
		border: 1.5px solid var(--edge);
		background: var(--miso-soft);
		box-shadow: var(--shadow-sm);
		font-size: 12.5px;
		animation: pop var(--dur) var(--ease-out);
	}
	@keyframes pop {
		from {
			opacity: 0;
			transform: scale(0.96);
		}
	}
	.d {
		color: var(--text-2);
		white-space: nowrap;
	}
	.o {
		color: var(--text-3);
		white-space: nowrap;
	}
	.v {
		min-width: 0;
		max-width: 240px;
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.chip button {
		display: grid;
		place-items: center;
		flex: none;
		width: 22px;
		height: 22px;
		border-radius: var(--radius-xs);
		color: var(--text-3);
	}
	.chip button:hover {
		background: var(--surface-3);
		color: var(--text);
	}
	.clear {
		height: 30px;
		padding: 0 8px;
		border-radius: var(--radius-sm);
		font-size: 12px;
		color: var(--text-3);
	}
	.clear:hover {
		color: var(--text);
		background: var(--surface-hover);
	}
	.notice {
		font-size: 12px;
		color: var(--bad);
	}
</style>
