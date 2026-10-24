<script lang="ts">
	import { untrack } from 'svelte'
	import { Tween } from 'svelte/motion'
	import { cubicOut } from 'svelte/easing'
	import { yScale } from '../lib/chart'

	interface Props {
		points: { t: number; v: number }[]
		previous?: { t: number; v: number }[] | null
		format: (n: number) => string
		label: (t: number, long?: boolean) => string
		/** index from which the line is drawn dashed (incomplete bucket) */
		partialFrom?: number | null
		height?: number
		metricLabel?: string
		/** drag across the chart to zoom into a range */
		onrange?: (from: number, to: number) => void
		inverse?: boolean
		/** annotations: drawn as flags on the bucket they fall in */
		marks?: { t: number; text: string }[]
		/** a 0-100 rate: the axis stops at 100% and the tooltip change is in points */
		percent?: boolean
		/** whole numbers: integer ticks */
		integer?: boolean
	}

	let {
		points,
		previous = null,
		format,
		label,
		partialFrom = null,
		height = 280,
		metricLabel = '',
		onrange,
		inverse = false,
		marks = [],
		percent = false,
		integer = false,
	}: Props = $props()

	let width = $state(0)
	const pad = { top: 16, right: 12, bottom: 30, left: 48 }

	const scale = $derived(yScale([...points.map((p) => p.v), ...(previous ?? []).map((p) => p.v)], { percent, integer }))
	/** a value's height on the current axis, 0 at the bottom and 1 at the top */
	const frac = (v: number) => (v - scale.min) / (scale.max - scale.min)

	// The tweens move heights on the axis, not raw values: the axis jumps to the new
	// metric at once, so tweening raw values would draw the old metric's numbers on the
	// new scale, far outside the chart. Heights stay between 0 and 1 the whole way.
	const heights = new Tween<number[]>([], { duration: 520, easing: cubicOut })
	const prevHeights = new Tween<number[]>([], { duration: 520, easing: cubicOut })

	$effect(() => {
		const next = points.map((p) => frac(p.v))
		const prev = (previous ?? []).map((p) => frac(p.v))
		// Tweening only makes sense between series of the same shape. The tween's own
		// output is read untracked: it changes every frame, and tracking it would
		// restart the tween forever.
		untrack(() => {
			heights.set(next, { duration: heights.current.length === next.length ? 520 : 0 })
			prevHeights.set(prev, { duration: prevHeights.current.length === prev.length ? 520 : 0 })
		})
	})

	const innerW = $derived(Math.max(0, width - pad.left - pad.right))
	const innerH = $derived(height - pad.top - pad.bottom)
	const n = $derived(points.length)
	const x = (i: number) => pad.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW)
	const y = (v: number) => yAt(frac(v))
	const yAt = (h: number) => pad.top + innerH - h * innerH

	/** Monotone cubic interpolation: smooth without overshooting the data. */
	function path(hs: number[]): string {
		if (!hs.length) return ''
		const pts = hs.map((h, i) => [x(i), yAt(h)] as const)
		if (pts.length === 1) return `M${pts[0][0]},${pts[0][1]}`
		const dx = pts.slice(1).map((p, i) => p[0] - pts[i][0])
		const dy = pts.slice(1).map((p, i) => p[1] - pts[i][1])
		const m = dy.map((d, i) => d / dx[i])
		const t = pts.map((_, i) => (i === 0 ? m[0] : i === pts.length - 1 ? m[m.length - 1] : m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2))
		for (let i = 0; i < m.length; i++) {
			if (m[i] === 0) {
				t[i] = t[i + 1] = 0
				continue
			}
			const a = t[i] / m[i]
			const b = t[i + 1] / m[i]
			const h = a * a + b * b
			if (h > 9) {
				const s = 3 / Math.sqrt(h)
				t[i] = s * a * m[i]
				t[i + 1] = s * b * m[i]
			}
		}
		let d = `M${pts[0][0]},${pts[0][1]}`
		for (let i = 0; i < pts.length - 1; i++) {
			const h = dx[i] / 3
			d += `C${pts[i][0] + h},${pts[i][1] + t[i] * h} ${pts[i + 1][0] - h},${pts[i + 1][1] - t[i + 1] * h} ${pts[i + 1][0]},${pts[i + 1][1]}`
		}
		return d
	}

	const cur = $derived(heights.current.length === n ? heights.current : points.map((p) => frac(p.v)))
	const split = $derived(partialFrom != null && partialFrom > 0 && partialFrom < n ? partialFrom : n)
	// One curve for the whole series, split into a solid head and a dashed tail so
	// the join stays smooth. Segment i of the path ends at point i.
	const segments = $derived(width ? path(cur).split('C') : [])
	const solidLine = $derived(segments.slice(0, split).join('C'))
	const dashedLine = $derived(split < n && segments.length ? `M${x(split - 1)},${yAt(cur[split - 1])}C${segments.slice(split).join('C')}` : '')
	const area = $derived(width && n > 1 ? `${path(cur)}L${x(n - 1)},${pad.top + innerH}L${x(0)},${pad.top + innerH}Z` : '')
	const prevLine = $derived(width && prevHeights.current.length ? path(prevHeights.current.slice(0, n)) : '')

	const yTicks = $derived(scale.ticks)
	const xTicks = $derived.by(() => {
		if (!n || !innerW) return []
		const want = Math.max(2, Math.min(n, Math.floor(innerW / 90)))
		const step = Math.max(1, Math.round((n - 1) / (want - 1)))
		const out: number[] = []
		for (let i = 0; i < n; i += step) out.push(i)
		if (out[out.length - 1] !== n - 1 && n - 1 - out[out.length - 1] > step / 2) out.push(n - 1)
		return out
	})

	let hover = $state<number | null>(null)
	let dragStart = $state<number | null>(null)
	let dragEnd = $state<number | null>(null)
	let svgEl: SVGSVGElement | undefined = $state()

	function indexAt(e: PointerEvent) {
		const r = svgEl!.getBoundingClientRect()
		const px = e.clientX - r.left - pad.left
		return Math.max(0, Math.min(n - 1, Math.round((px / innerW) * (n - 1))))
	}

	function onmove(e: PointerEvent) {
		if (!n) return
		hover = indexAt(e)
		if (dragStart != null) dragEnd = hover
	}

	function ondown(e: PointerEvent) {
		if (!onrange || n < 3) return
		dragStart = indexAt(e)
		dragEnd = dragStart
		svgEl?.setPointerCapture(e.pointerId)
	}

	function oncancel() {
		dragStart = dragEnd = null
		hover = null
	}

	function onup() {
		if (dragStart != null && dragEnd != null && Math.abs(dragEnd - dragStart) >= 1 && onrange) {
			const a = Math.min(dragStart, dragEnd)
			const b = Math.max(dragStart, dragEnd)
			onrange(points[a].t, points[b].t)
		}
		dragStart = dragEnd = null
	}

	/** bucket index → annotation texts in it */
	const flags = $derived.by(() => {
		const out = new Map<number, string[]>()
		if (n < 2) return out
		const end = points[n - 1].t + (points[n - 1].t - points[n - 2].t)
		for (const m of marks) {
			if (m.t < points[0].t || m.t >= end) continue
			let i = 0
			while (i < n - 1 && points[i + 1].t <= m.t) i++
			out.set(i, [...(out.get(i) ?? []), m.text])
		}
		return out
	})

	const hp = $derived(hover != null ? points[hover] : null)
	const hprev = $derived(hover != null && previous ? previous[hover] : null)
	// Rates change in points (40% to 45% is +5 pts); everything else in percent.
	const delta = $derived(hp && hprev ? (percent ? hp.v - hprev.v : hprev.v ? ((hp.v - hprev.v) / hprev.v) * 100 : null) : null)
	const tipLeft = $derived(hover != null ? x(hover) : 0)
	const flip = $derived(tipLeft > width - 220)
</script>

<div class="chart" bind:clientWidth={width} style:height="{height}px">
	{#if width}
		<svg
			bind:this={svgEl}
			{width}
			{height}
			role="img"
			aria-label="{metricLabel} over time"
			onpointermove={onmove}
			onpointerleave={() => (hover = null)}
			onpointerdown={ondown}
			onpointerup={onup}
			onpointercancel={oncancel}
			class:zoomable={!!onrange && n > 2}
		>
			<defs>
				<linearGradient id="area-fill" x1="0" x2="0" y1="0" y2="1">
					<stop offset="0" stop-color="var(--chart-fill-top)" />
					<stop offset="1" stop-color="var(--chart-fill-bottom)" />
				</linearGradient>
				<pattern id="area-dots" width="6" height="6" patternUnits="userSpaceOnUse">
					<circle cx="3" cy="3" r="1.3" fill="var(--chart-dot)" />
				</pattern>
			</defs>

			{#each yTicks as t, i (i)}
				<line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} class="grid" class:base={t === 0} />
				<text x={pad.left - 10} y={y(t)} class="ylab num" dy="0.32em" text-anchor="end">{t === 0 ? '0' : format(t)}</text>
			{/each}

			{#each xTicks as i (i)}
				<text x={x(i)} y={height - 8} class="xlab" text-anchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>{label(points[i].t)}</text>
			{/each}

			{#if dragStart != null && dragEnd != null && dragStart !== dragEnd}
				<rect
					class="brush"
					x={x(Math.min(dragStart, dragEnd))}
					y={pad.top}
					width={Math.abs(x(dragEnd) - x(dragStart))}
					height={innerH}
					rx="6"
				/>
			{/if}

			{#if prevLine}<path d={prevLine} class="prev" />{/if}
			{#if area}<path d={area} fill="url(#area-fill)" /><path d={area} fill="url(#area-dots)" />{/if}
			<path d={solidLine} class="line" />
			{#if dashedLine}<path d={dashedLine} class="line dashed" />{/if}
			{#if n === 1 && hover == null}<circle cx={x(0)} cy={yAt(cur[0])} r="5" class="dot" />{/if}

			{#each [...flags.keys()] as i (i)}
				<line x1={x(i)} x2={x(i)} y1={pad.top} y2={pad.top + innerH} class="mark" />
				<rect x={x(i) - 4} y={pad.top - 4} width="8" height="8" class="flag" />
			{/each}

			{#if hover != null && hp}
				<line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + innerH} class="cross" />
				{#if hprev}<circle cx={x(hover)} cy={y(hprev.v)} r="3.5" class="dot prev-dot" />{/if}
				<circle cx={x(hover)} cy={cur[hover] != null ? yAt(cur[hover]) : y(hp.v)} r="5" class="dot" />
			{/if}
		</svg>

		{#if hover != null && hp}
			<div class="tip" style:left="{tipLeft}px" class:flip>
				<div class="tip-date">{label(hp.t, true)}{hover >= split ? ' · in progress' : ''}</div>
				{#each flags.get(hover) ?? [] as note, k (k)}<div class="tip-note">■ {note}</div>{/each}
				<div class="tip-row">
					<span class="sw"></span>
					<span class="tip-l">{metricLabel}</span>
					<span class="num tip-v">{format(hp.v)}</span>
				</div>
				{#if hprev}
					<div class="tip-row prev-row">
						<span class="sw sw-prev"></span>
						<span class="tip-l">{label(hprev.t, true)}</span>
						<span class="num tip-v">{format(hprev.v)}</span>
					</div>
					{#if delta != null}
						<div class="tip-delta num" class:up={inverse ? delta < 0 : delta > 0} class:down={inverse ? delta > 0 : delta < 0}>
							{delta > 0 ? '↑' : delta < 0 ? '↓' : ''}
							{Math.abs(delta).toFixed(1)}{percent ? ' pts' : '%'} vs previous
						</div>
					{/if}
				{/if}
			</div>
		{/if}
	{/if}
</div>

<style>
	.chart {
		position: relative;
		width: 100%;
		user-select: none;
	}
	svg {
		display: block;
		overflow: visible;
		touch-action: pan-y;
	}
	svg.zoomable {
		cursor: crosshair;
	}
	.grid {
		stroke: var(--chart-grid);
		stroke-width: 1;
		stroke-dasharray: 2 4;
	}
	.grid.base {
		stroke-dasharray: none;
		stroke: var(--line-strong);
	}
	.ylab,
	.xlab {
		fill: var(--text-3);
		font-size: 11px;
	}
	.xlab {
		font-family: var(--font-sans);
	}
	.line {
		fill: none;
		stroke: var(--chart-line);
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.line.dashed {
		stroke-dasharray: 4 5;
		filter: none;
	}
	.prev {
		fill: none;
		stroke: var(--chart-compare);
		stroke-width: 1.5;
		stroke-dasharray: 3 4;
	}
	.cross {
		stroke: var(--line-strong);
		stroke-width: 1;
	}
	.dot {
		fill: var(--chart-line);
		stroke: var(--surface);
		stroke-width: 2.5;
	}
	.prev-dot {
		fill: var(--surface);
		stroke: var(--chart-compare);
		stroke-width: 1.5;
	}
	.brush {
		fill: var(--miso-soft);
		stroke: var(--miso-line);
		stroke-width: 1;
	}
	.tip {
		position: absolute;
		top: 4px;
		transform: translateX(14px);
		min-width: 190px;
		padding: 10px 12px;
		border-radius: var(--radius);
		background: var(--surface);
		border: 1.5px solid var(--edge);
		box-shadow: 3px 3px 0 var(--edge);
		pointer-events: none;
		z-index: 2;
		font-size: 12.5px;
	}
	.tip.flip {
		transform: translateX(calc(-100% - 14px));
	}
	.tip-date {
		color: var(--text-2);
		font-weight: 500;
		margin-bottom: 8px;
	}
	.tip-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.tip-row + .tip-row {
		margin-top: 4px;
	}
	.tip-l {
		color: var(--text-2);
		flex: 1;
	}
	.prev-row .tip-l {
		color: var(--text-3);
	}
	.tip-v {
		font-weight: 500;
	}
	.sw {
		width: 10px;
		height: 3px;
		border-radius: var(--radius-xs);
		background: var(--chart-line);
	}
	.sw-prev {
		background: repeating-linear-gradient(90deg, var(--chart-compare) 0 3px, transparent 3px 5px);
	}
	.tip-delta {
		margin-top: 8px;
		padding-top: 8px;
		border-top: 1px solid var(--line);
		font-size: 11.5px;
		color: var(--text-3);
	}
	.tip-delta.up {
		color: var(--good);
	}
	.tip-delta.down {
		color: var(--bad);
	}
	.mark {
		stroke: var(--miso);
		stroke-width: 1.5;
		stroke-dasharray: 2 3;
	}
	.flag {
		fill: var(--miso);
		stroke: var(--edge);
		stroke-width: 1.5;
	}
	.tip-note {
		margin-top: 4px;
		font-size: 12px;
		color: var(--miso-strong);
		max-width: 220px;
	}
</style>
