<script lang="ts">
	// The hero mark at full size: tonight's moon rising on the horizon, and below it
	// the reflection, which is misomoon's own traffic for the last 30 days. Each
	// column is a day; the deeper it reaches, the more people read the site that day.
	import { untrack } from 'svelte'
	import Moon from './Moon.svelte'

	let {
		phase = 0,
		days = [],
		size = 560,
	}: { phase?: number; days?: { t: number; visitors: number }[]; size?: number } = $props()

	const ROWS = 11
	const fmt = new Intl.NumberFormat('en')
	const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

	// No data (API down, or a brand-new site): a calm reflection shaped like the moon.
	const cols = $derived.by(() => {
		if (days.length >= 7) {
			const max = Math.max(1, ...days.map((d) => d.visitors))
			// square root keeps one spike from flattening every other day
			return days.map((d) => ({ ...d, depth: Math.max(2, Math.round(Math.sqrt(d.visitors / max) * ROWS)) }))
		}
		return Array.from({ length: 30 }, (_, i) => {
			const x = (i + 0.5) / 30 - 0.5
			return { t: 0, visitors: 0, depth: Math.max(1, Math.round(Math.sqrt(Math.max(0, 0.25 - x * x)) * 2 * ROWS)) }
		})
	})
	const total = $derived(days.reduce((n, d) => n + d.visitors, 0))

	let hover = $state<number | null>(null)

	// Upgrade to the live WebGL version on the visitor's first sign of life (a pointer
	// over the page, a touch, a scroll, a key). Until then nothing runs, so the page loads
	// as fast as the static print. The SVG stays for reduced motion or no WebGL.
	let stage: HTMLDivElement
	let canvas: HTMLCanvasElement
	let horizonEl: HTMLDivElement
	let gl = $state<import('../reflection-gl.ts').ReflectionGL | null>(null)
	$effect(() => {
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
		let alive = true
		const wake = ['pointermove', 'touchstart', 'scroll', 'keydown'] as const
		const start = async () => {
			for (const e of wake) removeEventListener(e, start)
			const { startReflection } = await import('../reflection-gl.ts')
			if (!alive) return
			gl = untrack(() =>
				startReflection(stage, canvas, {
					phase,
					depths: cols.map((c) => c.depth),
					rows: ROWS,
					horizon: () => horizonEl.offsetTop + 1.5,
				}),
			)
		}
		for (const e of wake) addEventListener(e, start, { once: true, passive: true })
		// After a GPU reset the SVG print shows again until the context comes back,
		// then the live version is rebuilt on the same canvas.
		const lost = (e: Event) => {
			e.preventDefault()
			gl?.destroy()
			gl = null
		}
		const restored = () => {
			if (alive) start()
		}
		canvas.addEventListener('webglcontextlost', lost)
		canvas.addEventListener('webglcontextrestored', restored)
		return () => {
			for (const e of wake) removeEventListener(e, start)
			canvas.removeEventListener('webglcontextlost', lost)
			canvas.removeEventListener('webglcontextrestored', restored)
			alive = false
			gl?.destroy()
			gl = null
		}
	})
	$effect(() => gl?.setHover(hover))
	$effect(() => gl?.setPhase(phase))
	$effect(() => gl?.setDepths(cols.map((c) => c.depth)))
</script>

<figure class="refl" class:gl style:--size="{size}px">
	<div class="stage" bind:this={stage}>
	<canvas bind:this={canvas} aria-hidden="true"></canvas>
	<div class="sky"><Moon {size} {phase} grid={38} /></div>
	<div class="horizon" bind:this={horizonEl}></div>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="water"
		style:--n={cols.length}
		aria-hidden="true"
		onpointermove={(e) => {
			const r = e.currentTarget.getBoundingClientRect()
			const pad = r.width * 0.04
			const i = Math.floor(((e.clientX - r.left - pad) / (r.width - 2 * pad)) * cols.length)
			hover = cols[i]?.t ? i : null
		}}
		onpointerleave={() => (hover = null)}
	>
		{#each cols as c, i (i)}
			<div class="col" class:on={hover === i} class:data={!!c.t}>
				{#each { length: c.depth } as _, k (k)}
					<i style:--dx="{k % 2 ? 1.5 : -1.5}px" style:--w="{66 - k * 3.6}%" style:--o={1 - (k / ROWS) * 0.7}></i>
				{/each}
			</div>
		{/each}
		{#if hover != null && cols[hover]?.t}
			<div class="tip mono" style:left="{((hover + 0.5) / cols.length) * 100}%">
				<b>{fmt.format(cols[hover].visitors)}</b> visitors · {dayFmt.format(cols[hover].t)}
			</div>
		{/if}
	</div>
	</div>
	{#if total}
		<figcaption class="sr">
			{fmt.format(total)} visitors in the last 30 days:
			<ul>
				{#each cols as c (c.t)}<li>{dayFmt.format(c.t)}: {fmt.format(c.visitors)}</li>{/each}
			</ul>
		</figcaption>
	{/if}
</figure>

<style>
	.refl {
		position: relative;
		width: var(--size);
		max-width: 100%;
		margin: 0;
	}
	.stage {
		position: relative;
	}
	canvas {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
		opacity: 0;
		transition: opacity 600ms var(--ease-out);
	}
	.gl canvas {
		opacity: 1;
	}
	/* the live version takes over; the buttons stay as hit targets for the tooltip */
	.gl .sky,
	.gl .col i {
		opacity: 0;
		transition: opacity 600ms var(--ease-out);
	}
	.gl .stage {
		cursor: crosshair;
	}
	/* only the top half of the moon has risen */
	.sky {
		aspect-ratio: 2 / 1;
		overflow: hidden;
	}
	.horizon {
		position: relative;
		left: -6%;
		width: 112%;
		height: 3px;
		background: var(--block);
		border-radius: 2px;
	}
	.water {
		position: relative;
		display: grid;
		grid-template-columns: repeat(var(--n), 1fr);
		align-items: start;
		padding: 8px 4% 0;
	}
	.col {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 5px;
		min-height: 100%;
		padding: 0 0 8px;
		cursor: default;
	}
	.col.data {
		cursor: crosshair;
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	.col i {
		display: block;
		width: var(--w);
		aspect-ratio: 1;
		border-radius: 50%;
		background: var(--vermilion);
		opacity: var(--o);
		/* ripples: alternate rows drift a little, like light on moving water */
		translate: var(--dx) 0;
		transition:
			opacity var(--dur-fast),
			background var(--dur-fast);
	}
	.col.on i {
		background: var(--block);
		opacity: 1;
	}
	.tip {
		position: absolute;
		top: -38px;
		translate: -50% 0;
		padding: 5px 9px;
		white-space: nowrap;
		font-size: 11px;
		background: var(--surface);
		border: 1.5px solid var(--ink);
		box-shadow: 2px 2px 0 var(--ink);
		pointer-events: none;
	}
	.tip b {
		font-weight: 700;
	}
</style>
