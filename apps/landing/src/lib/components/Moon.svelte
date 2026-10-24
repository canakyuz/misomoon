<script lang="ts">
	// A risograph-style halftone moon. Each dot's size is the light falling on a
	// sphere at that point, so moving the light changes the phase. The whole moon is
	// one <path>, which keeps the DOM small enough to redraw on scroll.
	let {
		size = 520,
		phase = 0.35,
		grid = 34,
		color = 'var(--vermilion)',
		ink = 'var(--ink)',
		rim = true,
	}: { size?: number; phase?: number; grid?: number; color?: string; ink?: string; rim?: boolean } = $props()

	const R = 100

	// phase: -1 new moon from the left, 0 full, 1 new moon from the right.
	// Dots are zero-length round-capped strokes, bucketed by size: one short path per
	// dot size instead of two arcs per dot keeps the SSR markup ~5x smaller.
	const BUCKETS = 10
	const layers = $derived.by(() => {
		const a = phase * Math.PI * 0.95
		const L = [Math.sin(a), -0.18, Math.cos(a)]
		const n = Math.hypot(L[0], L[1], L[2])
		const step = (2 * R) / grid
		const maxR = step * 0.56
		const paths: string[] = Array(BUCKETS).fill('')
		for (let j = 0; j < grid; j++) {
			for (let i = 0; i < grid; i++) {
				// offset alternate rows like a real screen
				const x = -R + step * (i + 0.5 + (j % 2 ? 0.25 : -0.25))
				const y = -R + step * (j + 0.5)
				const rr = x * x + y * y
				if (rr > R * R * 0.985) continue
				const z = Math.sqrt(R * R - rr)
				const b = Math.max(0, (x * L[0] + y * L[1] + z * L[2]) / (R * n))
				const r = maxR * Math.pow(b, 0.7)
				if (r < 0.35) continue
				const k = Math.min(BUCKETS - 1, Math.round((r / maxR) * (BUCKETS - 1)))
				paths[k] += `M${(x + R).toFixed(1)} ${(y + R).toFixed(1)}h0`
			}
		}
		return paths.map((d, k) => ({ d, w: ((2 * maxR * k) / (BUCKETS - 1)).toFixed(2) })).filter((l) => l.d && +l.w > 0)
	})
</script>

<svg class="moon" width={size} height={size} viewBox="-2 -2 204 204" aria-hidden="true">
	<g stroke={color} stroke-linecap="round" fill="none">
		{#each layers as l (l.w)}<path d={l.d} stroke-width={l.w} />{/each}
	</g>
	{#if rim}<circle cx="100" cy="100" r="99" fill="none" stroke={ink} stroke-width="1.2" stroke-dasharray="1.5 3" />{/if}
</svg>

<style>
	.moon {
		display: block;
		max-width: 100%;
		height: auto;
	}
</style>
