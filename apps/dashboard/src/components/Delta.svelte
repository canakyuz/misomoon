<script lang="ts">
	/** `points`: the value is a change in percentage points (rates), not a percent change */
	let { value, inverse = false, points = false }: { value: number | null | undefined; inverse?: boolean; points?: boolean } = $props()
	const good = $derived(value == null || value === 0 ? null : inverse ? value < 0 : value > 0)
</script>

{#if value !== undefined}
	<span class="delta num" class:good={good === true} class:bad={good === false} title={points ? 'Change in percentage points vs the previous period' : 'Change vs the previous period'}>
		{#if value == null}
			new
		{:else}
			<svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true" class:down={value < 0} class:flat={value === 0}>
				<path d="M4 1 L7 6 H1 Z" fill="currentColor" />
			</svg>
			{Math.abs(value) >= 100 ? Math.round(Math.abs(value)) : Math.abs(value).toFixed(1)}{points ? ' pts' : '%'}
		{/if}
	</span>
{/if}

<style>
	.delta {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		height: 18px;
		padding: 0 6px;
		border-radius: var(--radius-xs);
		font-size: 11px;
		font-weight: 500;
		color: var(--text-3);
		background: var(--surface-3);
	}
	.good {
		color: var(--good);
		background: var(--good-soft);
	}
	.bad {
		color: var(--bad);
		background: var(--bad-soft);
	}
	svg.down {
		transform: rotate(180deg);
	}
	svg.flat {
		display: none;
	}
</style>
