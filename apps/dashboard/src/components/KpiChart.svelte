<script lang="ts">
	import StickyNote from '@lucide/svelte/icons/sticky-note'
	import { send, type AggregateResponse, type Annotation, type TimeseriesResponse } from '../lib/api'
	import { zoomRange } from '../lib/chart'
	import { getDash, Resource, type MetricKey } from '../lib/dash.svelte'
	import { bucketLabel, METRICS } from '../lib/format'
	import AreaChart from './AreaChart.svelte'
	import Delta from './Delta.svelte'

	const dash = getDash()
	let interval = $state<string | null>(null)

	const agg = new Resource<AggregateResponse>(() => (dash.site ? `/api/v1/stats/aggregate?${dash.params}&compare=${dash.compareParam}&_=${dash.tick}` : null))
	const ts = new Resource<TimeseriesResponse>(() =>
		dash.site ? `/api/v1/stats/timeseries?${dash.params}&compare=${dash.compareParam}${interval ? `&interval=${interval}` : ''}&_=${dash.tick}` : null,
	)

	// Reset a manual interval when the range changes (a zoom keeps the period
	// "custom" but moves from/to) so it can't become absurd.
	$effect(() => {
		void dash.period
		void dash.from
		void dash.to
		interval = null
	})

	const hasRevenue = $derived((agg.data?.current.revenue ?? 0) > 0)
	const shown = $derived(METRICS.filter((m) => m.key !== 'revenue' || hasRevenue))
	const meta = $derived(METRICS.find((m) => m.key === dash.metric) ?? METRICS[0])
	const tz = $derived(dash.current?.timezone ?? 'UTC')
	const currency = $derived(dash.current?.currency)
	const points = $derived((ts.data?.points ?? []).map((p) => ({ t: p.t, v: p[dash.metric] as number })))
	const previous = $derived(dash.compare && ts.data?.previous ? ts.data.previous.map((p) => ({ t: p.t, v: p[dash.metric] as number })) : null)
	// The bucket containing "now" is still filling up; draw it dashed.
	const partialFrom = $derived.by(() => {
		const pts = ts.data?.points
		if (!pts?.length) return null
		const last = pts[pts.length - 1].t
		return Date.now() >= last && Date.now() < (ts.data?.window.to ?? 0) ? pts.length - 1 : null
	})

	const intervals = $derived.by(() => {
		const span = (ts.data?.window.to ?? 0) - (ts.data?.window.from ?? 0)
		const day = 86400000
		const all = [
			{ key: 'minute', ok: span <= 6 * 3600000 },
			{ key: 'hour', ok: span <= 8 * day },
			{ key: 'day', ok: span >= 2 * day && span <= 400 * day },
			{ key: 'week', ok: span >= 14 * day },
			{ key: 'month', ok: span >= 60 * day },
		]
		return all.filter((i) => i.ok).map((i) => i.key)
	})

	function zoom(from: number, to: number) {
		if (!ts.data) return
		// Through the end of the last bucket, so a zoom on weeks or months keeps all of the last one.
		const r = zoomRange([from, to], 0, 1, ts.data.interval, tz)
		dash.setPeriod('custom', r.from, r.to)
	}

	// Notes on the chart: deploys, launches, campaigns. CI can post them too.
	const notes = new Resource<Annotation[]>(() =>
		dash.site && ts.data ? `/api/v1/sites/${dash.site}/annotations?from=${ts.data.window.from}&to=${ts.data.window.to}&_=${dash.tick}` : null,
	)
	const marks = $derived(
		(notes.data ?? []).map((n) => {
			// snap to the bucket the note falls in, so the flag sits on a point
			const pts = ts.data?.points ?? []
			let at = n.ts
			for (const p of pts) if (p.t <= n.ts) at = p.t
			return { t: at, text: n.text }
		}),
	)
	let noting = $state(false)
	let note = $state('')
	let noteError = $state<string | null>(null)
	let noteBusy = false
	async function addNote() {
		if (!note.trim() || noteBusy) return
		noteBusy = true
		noteError = null
		try {
			await send('POST', `/api/v1/sites/${dash.site}/annotations`, { text: note.trim() })
			note = ''
			noting = false
			dash.tick++
		} catch (e) {
			noteError = (e as Error).message
		} finally {
			noteBusy = false
		}
	}

	/** A small line per metric so every tile shows its own trend, not just the picked one. */
	function spark(key: MetricKey) {
		const pts = ts.data?.points ?? []
		if (pts.length < 2) return null
		const vs = pts.map((p) => (p[key] as number) ?? 0)
		const lo = Math.min(...vs)
		const hi = Math.max(...vs)
		const y = (v: number) => (hi === lo ? 12 : 22 - ((v - lo) / (hi - lo)) * 20)
		return vs.map((v, i) => `${i ? 'L' : 'M'}${((i / (vs.length - 1)) * 100).toFixed(2)} ${y(v).toFixed(2)}`).join(' ')
	}

	function pick(key: MetricKey) {
		dash.metric = key
	}
</script>

<section class="card kpi">
	<div class="tiles" role="tablist" aria-label="Metrics">
		{#each shown as m (m.key)}
			{@const value = agg.data?.current[m.key]}
			{@const line = spark(m.key)}
			<button class="tile" class:active={dash.metric === m.key} role="tab" aria-selected={dash.metric === m.key} title={m.hint} onclick={() => pick(m.key)}>
				<span class="label">{m.label}</span>
				{#if value == null && agg.error}
					<span class="value num muted" title={agg.error}>—</span>
				{:else if value == null}
					<span class="skeleton" style="width: 64px; height: 26px; margin-top: 6px"></span>
				{:else}
					<span class="value num">{m.format(value, currency)}</span>
				{/if}
				<span class="foot">
					{#if dash.compare && agg.data?.change}
						<Delta value={agg.data.change[m.key]} inverse={m.inverse} points={m.percent} />
					{/if}
					{#if line}
						<svg class="spark" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true"><path d={line} /></svg>
					{/if}
				</span>
			</button>
		{/each}
	</div>

	<div class="body" class:stale={ts.loading}>
		<div class="toolbar">
			<div class="legend">
				<span class="key"><span class="sw"></span>{meta.label}</span>
				{#if previous}<span class="key muted"><span class="sw prev"></span>{dash.compareTo === 'year' ? 'A year earlier' : 'Previous period'}</span>{/if}
			</div>
			{#if dash.canEdit}
				{#if noting}
					<form class="note" onsubmit={(e) => (e.preventDefault(), addNote())}>
						<!-- svelte-ignore a11y_autofocus -->
						<input class="input" placeholder="What happened today?" maxlength="200" bind:value={note} autofocus onkeydown={(e) => e.key === 'Escape' && ((noting = false), (noteError = null))} />
						<button class="btn primary" disabled={!note.trim()}>Add</button>
						{#if noteError}<span class="note-error" role="alert">{noteError}</span>{/if}
					</form>
				{:else}
					<button class="btn ghost addnote" onclick={() => (noting = true)} title="Mark a launch, deploy or campaign on the chart"><StickyNote size={13} /> Note</button>
				{/if}
			{/if}
			<div class="group sm">
				{#each intervals as i (i)}
					<button class:on={(interval ?? ts.data?.interval) === i} onclick={() => (interval = i)}>{i}</button>
				{/each}
			</div>
		</div>
		{#if ts.error && !ts.data}
			<div class="failed">Couldn't load the chart: {ts.error}</div>
		{:else if ts.data}
			<AreaChart
				{points}
				{previous}
				format={(n) => meta.format(n, currency)}
				percent={meta.percent}
				integer={meta.integer}
				label={(t, long) => bucketLabel(t, ts.data!.interval, tz, long)}
				{partialFrom}
				metricLabel={meta.label}
				inverse={meta.inverse}
				onrange={ts.data.interval === 'minute' || ts.data.interval === 'hour' ? undefined : zoom}
				{marks}
			/>
		{:else}
			<div class="skeleton" style="height: 280px; border-radius: 12px"></div>
		{/if}
	</div>
</section>

<style>
	.failed {
		display: grid;
		place-items: center;
		height: 280px;
		color: var(--text-3);
		font-size: 13px;
	}
	.kpi {
		overflow: hidden;
	}
	.tiles {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
		gap: 10px;
		padding: 14px;
		border-bottom: 1px solid var(--line);
	}
	.tile {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 4px;
		padding: 12px 14px 10px;
		text-align: left;
		border: 1.5px solid var(--line);
		border-radius: var(--radius-lg);
		background: var(--surface);
		transition:
			border-color var(--dur-fast),
			background var(--dur-fast),
			box-shadow var(--dur-fast);
	}
	.tile:hover {
		border-color: var(--line-strong);
	}
	.tile.active {
		border-color: var(--edge);
		background: var(--miso-soft);
		box-shadow: 3px 3px 0 var(--edge);
	}
	.label {
		font-size: 12px;
		font-weight: 600;
		color: var(--text-3);
	}
	.tile.active .label {
		color: var(--text);
	}
	.value {
		font-size: 24px;
		font-weight: 700;
		letter-spacing: -0.03em;
		white-space: nowrap;
		line-height: 1.15;
		color: var(--text);
	}
	.foot {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		min-height: 20px;
	}
	.spark {
		flex: 1;
		height: 20px;
		min-width: 40px;
	}
	.spark path {
		fill: none;
		stroke: var(--text-4);
		stroke-width: 1.5;
		vector-effect: non-scaling-stroke;
		stroke-linejoin: round;
	}
	.tile.active .spark path {
		stroke: var(--miso);
		stroke-width: 2;
	}
	.body {
		padding: 14px 18px 12px 8px;
		transition: opacity var(--dur);
	}
	.body.stale {
		opacity: 0.7;
	}
	.note {
		display: flex;
		gap: 6px;
		margin-left: auto;
	}
	.note .input {
		height: 28px;
		width: 220px;
		font-size: 12.5px;
	}
	.note-error {
		font-size: 12px;
		color: var(--bad);
		align-self: center;
		max-width: 220px;
	}
	.note .btn,
	.addnote {
		height: 28px;
		font-size: 12px;
	}
	.addnote {
		margin-left: auto;
		color: var(--text-3);
	}
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: 10px;
		padding: 0 0 6px 12px;
	}
	.legend {
		display: flex;
		gap: 16px;
		font-size: 12px;
		color: var(--text-2);
	}
	.key {
		display: inline-flex;
		align-items: center;
		gap: 7px;
	}
	.sw {
		width: 12px;
		height: 3px;
		border-radius: var(--radius-xs);
		background: var(--chart-line);
	}
	.sw.prev {
		background: repeating-linear-gradient(90deg, var(--chart-compare) 0 3px, transparent 3px 5px);
	}
</style>
