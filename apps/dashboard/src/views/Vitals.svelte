<script lang="ts">
	import Panel, { type PanelTab } from '../components/Panel.svelte'
	import Topbar from '../components/Topbar.svelte'
	import VitalsSummary from '../components/VitalsSummary.svelte'
	import { getDash } from '../lib/dash.svelte'
	import { num } from '../lib/format'

	const dash = getDash()
	const page = $derived(dash.filters.find((f) => f.dim === 'page')?.values.join(', '))
	const tabs: PanelTab[] = [
		{ property: 'page', label: 'Pages', columns: [{ key: 'pageviews', label: 'Views', format: num }] },
		{ property: 'device', label: 'Devices' },
		{ property: 'country', label: 'Countries' },
		{ property: 'browser', label: 'Browsers' },
	]
</script>

<Topbar title="Speed" subtitle={page ? `How fast ${page} feels to real people` : 'How fast the site feels to real people, measured in their browsers.'} />

<div class="stack">
	<section class="card intro">
		<VitalsSummary large />
	</section>
	<div class="grid">
		<Panel title="Slice by" {tabs} limit={12} storageKey="vitals" />
		<section class="card notes">
			<h3>Reading these numbers</h3>
			<p>
				Each value is the <strong>75th percentile</strong> of what real visitors experienced, measured in their browsers by the misomoon script with the
				native Performance APIs. Google uses the same threshold for search ranking.
			</p>
			<p>Shapes, not just colours, mark each rating: a circle is good, a square needs work, a triangle is poor.</p>
			<p class="muted">INP needs interactions to be measured, so pages people only read tend to show fewer INP samples.</p>
		</section>
	</div>
</div>

<style>
	.stack {
		display: flex;
		flex-direction: column;
		gap: 16px;
		margin-top: 20px;
	}
	.intro {
		padding: 16px;
	}
	.grid {
		display: grid;
		grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
		gap: 16px;
	}
	.notes {
		padding: 20px 22px;
		font-size: 13.5px;
		line-height: 1.6;
		color: var(--text-2);
	}
	.notes h3 {
		margin: 0 0 8px;
		font-weight: 700;
		font-size: 15px;
		letter-spacing: -0.01em;
		color: var(--text);
	}
	.notes strong {
		color: var(--text);
		font-weight: 500;
	}
	@media (max-width: 1100px) {
		.grid {
			grid-template-columns: 1fr;
		}
	}
</style>
