<script lang="ts">
	// Reflection: a half moon rises on a horizon line and its reflection breaks into
	// dots below, the way moonlight scatters on water. The reflection is a dot plot:
	// the moon turned into data. Small sizes use fewer, larger dots so it holds at 16px.
	let { size = 22, wordmark = true }: { size?: number; wordmark?: boolean } = $props()

	const full = [6, 10, 14, 16, 14, 10, 6].flatMap((h, i) =>
		Array.from({ length: Math.ceil(h / 4) }, (_, k) => ({ x: 14 + i * 6, y: 40 + k * 4.5, r: 1.8, o: 1 - k * 0.22 })),
	)
	const compact = [
		...[14, 23, 32, 41, 50].map((x) => ({ x, y: 42, r: 3, o: 1 })),
		...[23, 32, 41].map((x) => ({ x, y: 50, r: 3, o: 0.7 })),
		{ x: 32, y: 58, r: 3, o: 0.45 },
	]
	const dots = $derived(size > 28 ? full : compact)
</script>

<span class="logo">
	<svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
		<path d="M8 33a24 24 0 0 1 48 0z" fill="var(--vermilion)" />
		<path class="horizon" d="M4 35h56" stroke-width={size > 28 ? 2.6 : 3.4} stroke-linecap="round" />
		{#each dots as d, i (i)}<circle cx={d.x} cy={d.y} r={d.r} fill="var(--vermilion)" opacity={d.o} />{/each}
	</svg>
	{#if wordmark}<span class="word" aria-hidden="true">misom<i class="o rise"></i><i class="o full"></i>n</span><span class="sr">misomoon</span>{/if}
</span>

<style>
	.logo {
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	.horizon {
		stroke: var(--text);
	}
	.word {
		display: inline-flex;
		align-items: baseline;
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 19px;
		letter-spacing: -0.03em;
		line-height: 1;
		color: var(--text);
	}
	/* the two o's of "moon": rising on the horizon, then full */
	.o {
		display: inline-block;
		width: 0.56em;
		height: 0.56em;
		margin: 0 0.035em;
		border-radius: 50%;
		background: var(--vermilion);
		box-shadow: inset 0 0 0 0.065em var(--text);
	}
	.o.rise {
		background: linear-gradient(var(--vermilion) 0 50%, var(--text) 50% 58%, transparent 58%);
	}
</style>
