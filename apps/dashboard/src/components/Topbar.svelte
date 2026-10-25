<script lang="ts">
	import Check from '@lucide/svelte/icons/check'
	import Download from '@lucide/svelte/icons/download'
	import Ellipsis from '@lucide/svelte/icons/ellipsis'
	import History from '@lucide/svelte/icons/history'
	import RefreshCw from '@lucide/svelte/icons/refresh-cw'
	import { download } from '../lib/api'
	import { getDash } from '../lib/dash.svelte'
	import FilterBar from './FilterBar.svelte'
	import FilterChips from './FilterChips.svelte'
	import PeriodPicker from './PeriodPicker.svelte'

	let { title, subtitle, periodless = false }: { title: string; subtitle?: string; periodless?: boolean } = $props()
	const dash = getDash()
	// export, refresh and imported history are used now and then, so they share one menu
	let more = $state(false)
	let exporting = $state(false)

	async function exportCsv() {
		more = false
		exporting = true
		try {
			await download(`/api/v1/stats/export?${dash.params}`)
		} catch (e) {
			alert(`Export failed: ${(e as Error).message}`)
		} finally {
			exporting = false
		}
	}

	function refresh() {
		more = false
		dash.tick++
	}
</script>

<svelte:window onkeydown={(e) => more && e.key === 'Escape' && (more = false)} />

<header class="top">
	<div class="titles">
		<h1 class="serif">{title}</h1>
		{#if subtitle}<p class="muted">{subtitle}</p>{/if}
	</div>
	<div class="actions">
		{#if periodless}
			{#if !dash.isEmbed}<button class="btn icon" onclick={refresh} aria-label="Refresh" title="Refresh"><RefreshCw size={14} /></button>{/if}
		{:else}
			<PeriodPicker />
			<FilterBar />
			<!-- embedded in the landing's fig. 1: no export or refresh, just the reports -->
			{#if !dash.isEmbed}<div class="anchor">
				<button class="btn icon" class:on={more} onclick={() => (more = !more)} aria-expanded={more} aria-haspopup="menu" aria-label="More" title="More"><Ellipsis size={14} /></button>
				{#if more}
					<div class="scrim" role="presentation" onclick={() => (more = false)}></div>
					<div class="pop card" role="menu">
						<button role="menuitem" onclick={exportCsv} disabled={exporting}><Download size={14} /><span>{exporting ? 'Exporting…' : 'Export CSV'}</span></button>
						<button role="menuitem" onclick={refresh}><RefreshCw size={14} /><span>Refresh</span></button>
						{#if dash.hasImports}
							<button
								role="menuitemcheckbox"
								aria-checked={dash.imported}
								onclick={() => (dash.imported = !dash.imported)}
								title="Add history imported from Google or a CSV export to reports without filters"
								><History size={14} /><span>Include imported history</span>{#if dash.imported}<Check size={14} />{/if}</button
							>
						{/if}
					</div>
				{/if}
			</div>{/if}
		{/if}
	</div>
	{#if !periodless}<FilterChips />{/if}
</header>

<style>
	/* the page header: the title on the left and its controls on the right of one line.
	   When the controls don't fit beside the title, they drop under it, still left-aligned. */
	.top {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 16px 24px;
		margin: 0 auto;
	}
	/* the title takes what the controls leave, down to 160px, before the controls wrap */
	.titles {
		flex: 1 1 0;
		min-width: min(100%, 160px);
		max-width: 560px;
	}
	h1 {
		margin: 0;
		font-size: 40px;
		line-height: 1;
		letter-spacing: -0.02em;
	}
	.titles p {
		margin: 8px 0 0;
		font-size: 13px;
		text-wrap: pretty;
	}
	.actions {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 8px;
		flex: 0 1 auto;
		max-width: 100%;
	}
	@media (max-width: 900px) {
		/* the controls wrap onto several lines here, so they start under the title */
		.actions {
			justify-content: flex-start;
		}
	}
	@media (max-width: 640px) {
		.top {
			gap: 14px;
		}
		h1 {
			font-size: 32px;
		}
	}
	.anchor {
		position: relative;
	}
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 29;
	}
	.pop {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		z-index: 30;
		width: 240px;
		padding: 4px;
		box-shadow: var(--shadow-lg);
	}
	.pop button {
		display: flex;
		align-items: center;
		gap: 9px;
		width: 100%;
		min-height: 34px;
		padding: 6px 8px;
		border-radius: var(--radius-xs);
		font-size: 13px;
		text-align: left;
	}
	.pop button span {
		flex: 1;
	}
	.pop button:hover:not(:disabled) {
		background: var(--surface-3);
	}
	.pop button:disabled {
		color: var(--text-3);
	}
</style>
