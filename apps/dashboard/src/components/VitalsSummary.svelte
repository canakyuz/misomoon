<script lang="ts" module>
	export const VITAL_META = {
		lcp: { label: 'Largest Contentful Paint', short: 'LCP', good: 2500, poor: 4000, unit: 'ms', about: 'How long until the main content is visible.' },
		inp: { label: 'Interaction to Next Paint', short: 'INP', good: 200, poor: 500, unit: 'ms', about: 'How quickly the page responds to clicks and taps.' },
		cls: { label: 'Cumulative Layout Shift', short: 'CLS', good: 0.1, poor: 0.25, unit: '', about: 'How much the layout jumps while loading.' },
		fcp: { label: 'First Contentful Paint', short: 'FCP', good: 1800, poor: 3000, unit: 'ms', about: 'When the first text or image appears.' },
		ttfb: { label: 'Time to First Byte', short: 'TTFB', good: 800, poor: 1800, unit: 'ms', about: 'How fast the server starts responding.' },
	} as const

	export function vitalValue(name: keyof typeof VITAL_META, v: number | null) {
		if (v == null) return '—'
		if (name === 'cls') return v.toFixed(2)
		return v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${Math.round(v)}ms`
	}

	export function rating(name: keyof typeof VITAL_META, v: number | null): 'good' | 'ni' | 'poor' | null {
		if (v == null) return null
		const m = VITAL_META[name]
		return v <= m.good ? 'good' : v > m.poor ? 'poor' : 'ni'
	}
</script>

<script lang="ts">
	import type { Vital } from '../lib/api'
	import { getDash, Resource } from '../lib/dash.svelte'
	import { num } from '../lib/format'

	let { large = false }: { large?: boolean } = $props()
	const dash = getDash()
	const res = new Resource<{ vitals: Vital[] }>(() => (dash.site ? `/api/v1/stats/vitals?${dash.params}&_=${dash.tick}` : null))
	const RATING_LABEL = { good: 'Good', ni: 'Needs work', poor: 'Poor' }
</script>

<div class="grid" class:large>
	{#each res.data?.vitals ?? [] as v (v.name)}
		{@const meta = VITAL_META[v.name]}
		{@const r = rating(v.name, v.p75)}
		{@const total = Math.max(1, v.samples)}
		<div class="tile">
			<div class="top">
				<span class="short">{meta.short}</span>
				{#if r}
					<span class="badge {r}">
						<svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
							{#if r === 'good'}<circle cx="4" cy="4" r="4" />{:else if r === 'ni'}<rect width="8" height="8" rx="1.5" />{:else}<path d="M4 0 L8 8 H0 Z" />{/if}
						</svg>
						{RATING_LABEL[r]}
					</span>
				{/if}
			</div>
			<div class="value num">{vitalValue(v.name, v.p75)}</div>
			<div class="p75 muted">p75 · {num(v.samples)} samples</div>
			<div class="dist" aria-label="Distribution">
				{#if v.good}<span class="g" style:flex={v.good / total}></span>{/if}
				{#if v.needs_improvement}<span class="n" style:flex={v.needs_improvement / total}></span>{/if}
				{#if v.poor}<span class="p" style:flex={v.poor / total}></span>{/if}
			</div>
			{#if large}
				<div class="legend num">
					<span><i class="g"></i>{Math.round((v.good / total) * 100)}%</span>
					<span><i class="n"></i>{Math.round((v.needs_improvement / total) * 100)}%</span>
					<span><i class="p"></i>{Math.round((v.poor / total) * 100)}%</span>
				</div>
				<p class="about">{meta.label}. {meta.about}</p>
			{/if}
		</div>
	{:else}
		{#if res.error}
			<p class="failed">Couldn't load Web Vitals: {res.error}</p>
		{:else}
			{#each Array(5) as _, i (i)}<div class="tile"><span class="skeleton" style="height: 80px"></span></div>{/each}
		{/if}
	{/each}
</div>

<style>
	.failed {
		grid-column: 1 / -1;
		margin: 0;
		color: var(--text-3);
		font-size: 13px;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 10px;
	}
	.tile {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 14px;
		border-radius: var(--radius-lg);
		background: var(--surface);
		border: 1.5px solid var(--line);
	}
	.large .tile {
		padding: 18px;
		gap: 6px;
	}
	.top {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.short {
		font-family: var(--font-mono);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.06em;
		color: var(--text-2);
	}
	.badge {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		height: 20px;
		padding: 0 6px;
		border-radius: var(--radius-xs);
		border: 1.5px solid currentColor;
		font-family: var(--font-mono);
		font-size: 9.5px;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		transform: rotate(-2deg);
	}
	.badge svg {
		fill: currentColor;
	}
	.badge.good {
		color: var(--good);
	}
	.badge.ni {
		color: var(--warn);
	}
	.badge.poor {
		color: var(--bad);
	}
	.value {
		font-size: 24px;
		font-weight: 700;
		letter-spacing: -0.03em;
		margin-top: 4px;
	}
	.large .value {
		font-size: 32px;
	}
	.p75 {
		font-size: 11.5px;
	}
	/* a printed strip: solid good, hatched needs-work, dotted poor */
	.dist {
		display: flex;
		height: 12px;
		margin-top: 10px;
		border: 1.5px solid var(--edge);
		border-radius: var(--radius-xs);
		overflow: hidden;
		background: var(--surface);
	}
	.dist span {
		min-width: 0;
		transition: flex var(--dur-slow) var(--ease-out);
	}
	.dist span + span {
		border-left: 1.5px solid var(--edge);
	}
	.g {
		background: var(--good);
	}
	.n {
		color: var(--warn);
		background: var(--hatch);
	}
	.p {
		background: radial-gradient(circle, var(--bad) 1.2px, transparent 1.5px) 0 0 / 4px 4px;
	}
	.legend {
		display: flex;
		gap: 12px;
		margin-top: 6px;
		font-size: 11.5px;
		color: var(--text-2);
	}
	.legend span {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}
	.legend i {
		width: 9px;
		height: 9px;
		border: 1px solid var(--edge);
	}
	.about {
		margin: 8px 0 0;
		font-size: 12px;
		color: var(--text-3);
		line-height: 1.5;
	}
</style>
