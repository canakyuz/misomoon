<script lang="ts">
	import Monitor from '@lucide/svelte/icons/monitor'
	import Smartphone from '@lucide/svelte/icons/smartphone'
	import Tablet from '@lucide/svelte/icons/tablet'
	import Target from '@lucide/svelte/icons/target'
	import Zap from '@lucide/svelte/icons/zap'
	import Board, { type BoardTab } from '../components/Board.svelte'
	import Brief from '../components/Brief.svelte'
	import FirstVisit from '../components/FirstVisit.svelte'
	import KpiChart from '../components/KpiChart.svelte'
	import Movers from '../components/Movers.svelte'
	import Topbar from '../components/Topbar.svelte'
	import VitalsSummary from '../components/VitalsSummary.svelte'
	import World from '../components/World.svelte'
	import type { AggregateResponse } from '../lib/api'
	import { getDash, Resource } from '../lib/dash.svelte'
	import { duration, num, pct } from '../lib/format'

	const dash = getDash()

	// Has this site ever had a visit? If not, the page is a setup guide instead.
	const ever = new Resource<AggregateResponse>(() => (dash.site ? `/api/v1/stats/aggregate?site=${dash.site}&period=all&compare=0&_=${dash.tick}` : null))
	const fresh = $derived(ever.data?.current.visitors === 0)

	const sources = $derived<BoardTab[]>([
		{
			property: 'channel',
			label: 'Channels',
			plural: 'channels',
			lenses: [
				{ property: 'source', label: 'Sites' },
				...(dash.hasSearch ? [{ property: 'search_term', label: 'Search terms', when: (v: string) => v === 'Organic Search' }] : []),
				{ property: 'referrer', label: 'Links' },
				{ property: 'utm_campaign', label: 'Campaigns' },
				{ property: 'utm_medium', label: 'Mediums' },
				{ property: 'entry_page', label: 'Landed on' },
			],
		},
		{ property: 'source', label: 'Sites', plural: 'sites' },
		{ property: 'utm_campaign', label: 'Campaigns', plural: 'campaigns' },
	])
	const pages: BoardTab[] = [
		{
			property: 'page',
			label: 'Most opened',
			plural: 'pages',
			columns: [
				{ key: 'time_on_page', label: 'Time', format: duration },
				{ key: 'scroll_depth', label: 'Read', format: (v) => pct(v, 0) },
			],
		},
		{ property: 'entry_page', label: 'First page', plural: 'first pages', columns: [{ key: 'bounce_rate', label: 'Left', format: (v) => pct(v, 0) }] },
		{ property: 'exit_page', label: 'Last page', plural: 'last pages', columns: [{ key: 'exit_rate', label: 'Exit', format: (v) => pct(v, 0) }] },
	]
	const tech: BoardTab[] = [
		{
			property: 'device',
			label: 'Devices',
			plural: 'devices',
			lenses: [
				{ property: 'browser', label: 'Browsers' },
				{ property: 'os', label: 'Systems' },
				{ property: 'screen', label: 'Screens' },
				{ property: 'network', label: 'Networks' },
			],
		},
		{ property: 'browser', label: 'Browsers', plural: 'browsers' },
		{ property: 'os', label: 'Systems', plural: 'systems' },
	]
	const actions: BoardTab[] = [
		{ property: 'goal', label: 'Goals', plural: 'goals', columns: [{ key: 'conversion_rate', label: 'Rate', format: (v) => pct(v) }] },
		{
			property: 'event',
			label: 'Events',
			plural: 'events',
			columns: [
				{ key: 'events', label: 'Times', format: num },
				{ key: 'conversion_rate', label: 'Rate', format: (v) => pct(v) },
			],
		},
		{
			property: 'props',
			label: 'Details sent',
			plural: 'details',
			// rows read "plan: pro"
			filterFor: (key) => {
				const at = key.indexOf(': ')
				return at > 0 ? [`prop:${key.slice(0, at)}`, key.slice(at + 2)] : null
			},
			columns: [
				{ key: 'events', label: 'Times', format: num },
				{ key: 'conversion_rate', label: 'Rate', format: (v) => pct(v) },
			],
		},
	]
	const subtitle = $derived(dash.current ? `${dash.current.domain} · ${dash.current.timezone}${dash.isSample ? ' · sample data' : dash.isDemo ? ' · live demo' : ''}` : '')
	const DEVICE_ICONS = { Desktop: Monitor, Mobile: Smartphone, Tablet: Tablet }
</script>

<Topbar title="Overview" {subtitle} periodless={fresh} />

<div class="stack">
	{#if fresh}
		<FirstVisit />
	{:else}
		<Brief />
		<KpiChart />
		<World />

		<div class="grid">
			<Board title="Where they come from" tabs={sources} storageKey="sources" />
			<Board title="What they read" tabs={pages} storageKey="pages" />
			<Movers />
			<Board title="What they did" tabs={actions} storageKey="actions">
				{#snippet icon({ property })}
					{#if property === 'goal'}<span class="ic"><Target size={13} /></span>{:else if property === 'event'}<span class="ic"><Zap size={13} /></span>{/if}
				{/snippet}
			</Board>
			<Board title="What they use" tabs={tech} storageKey="tech">
				{#snippet icon({ property, row })}
					{#if property === 'device' && row.key in DEVICE_ICONS}
						{@const Icon = DEVICE_ICONS[row.key as keyof typeof DEVICE_ICONS]}
						<Icon size={14} strokeWidth={1.75} />
					{/if}
				{/snippet}
			</Board>
			<section class="card vitals">
				<header>
					<h3>How fast it feels</h3>
					<button class="link" onclick={() => (dash.view = 'vitals')}>Open Speed →</button>
				</header>
				<p class="muted lead">Measured in real visitors' browsers. Green means most people get a quick page.</p>
				<VitalsSummary />
			</section>
		</div>
	{/if}
</div>

<style>
	.stack {
		display: flex;
		flex-direction: column;
		gap: 16px;
		margin-top: 20px;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 16px;
	}
	@media (max-width: 1100px) {
		.grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	@media (max-width: 640px) {
		.stack,
		.grid {
			gap: 12px;
		}
	}
	.ic {
		display: grid;
		place-items: center;
		width: 20px;
		height: 20px;
		border-radius: var(--radius-sm);
		background: var(--surface-3);
		color: var(--text-2);
	}
	.vitals {
		padding: 14px 18px 18px;
	}
	.vitals header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
	}
	.vitals h3 {
		margin: 0;
		font-size: 15px;
		font-weight: 700;
	}
	.lead {
		margin: 6px 0 16px;
		font-size: 12.5px;
	}
	.link {
		font-size: 12px;
		color: var(--text-3);
		white-space: nowrap;
	}
	.link:hover {
		color: var(--miso);
	}
</style>
