<script lang="ts">
	import { embedUrl, themeMessage, type Theme } from '#lib/embed.ts'
	import type { Live } from '#lib/live.ts'

	// A faithful, lightweight rendition of the dashboard for the hero. It is drawn
	// with HTML and SVG (not a screenshot) so it stays crisp at any size. With
	// `live` it shows the demo site's real numbers; without (a cold edge cache or
	// the API down) it shows a sample, dated back from `now`, and says so.
	// With `demo`, the real dashboard on its sample store replaces the drawing once the
	// figure is near the screen and the browser is idle: only then does its iframe load.
	let {
		live = null,
		demo = null,
		now = Date.now(),
		ready = $bindable(false),
	}: { live?: Live | null; demo?: string | null; now?: number; ready?: boolean } = $props()

	const SAMPLE = {
		visitors: 3234,
		pageviews: 9100,
		bounce_rate: 48.1,
		visit_duration: 122,
		change: { visitors: 22.2, pageviews: 23.7, bounce_rate: -1, visit_duration: 2.5 },
		now: 12,
		series: [96, 104, 88, 112, 120, 108, 132, 126, 118, 140, 152, 138, 129, 147, 288, 236, 171, 158, 166, 149, 162, 178, 171, 190, 184, 176, 198, 206, 194, 212],
		prev: [88, 92, 85, 90, 101, 95, 98, 104, 97, 108, 112, 106, 101, 115, 118, 112, 121, 117, 124, 119, 126, 131, 124, 133, 138, 129, 141, 137, 144, 149],
		channels: [
			['Organic Search', 33],
			['Direct', 31],
			['Organic Social', 29],
			['AI Assistants', 14],
			['Email', 4],
		] as [string, number][],
		vitals: { lcp: 2100, inp: 142, cls: 0.04, ttfb: 310 } as Live['vitals'],
	}

	const DAY = 86_400_000
	const sample = $derived(!live || live.days.length < 2)
	const d = $derived.by(() => {
		// the sample's 30 days end today
		const today = Math.floor(now / DAY) * DAY
		if (sample || !live) return { ...SAMPLE, days: SAMPLE.series.map((_, i) => today - (SAMPLE.series.length - 1 - i) * DAY) }
		return {
			...live,
			series: live.days.map((p) => p.visitors),
			prev: live.previous.slice(0, live.days.length),
			days: live.days.map((p) => p.t),
		}
	})

	const W = 760
	const H = 210
	const max = $derived(Math.max(4, ...d.series, ...d.prev) * 1.1)
	const x = (i: number, n: number) => (n > 1 ? (i / (n - 1)) * W : W / 2)
	const y = (v: number) => H - (v / max) * H

	function smooth(vals: number[]) {
		if (!vals.length) return ''
		let path = `M0,${y(vals[0])}`
		for (let i = 1; i < vals.length; i++) {
			const cx = (x(i - 1, vals.length) + x(i, vals.length)) / 2
			path += `C${cx},${y(vals[i - 1])} ${cx},${y(vals[i])} ${x(i, vals.length)},${y(vals[i])}`
		}
		return path
	}
	const line = $derived(smooth(d.series))
	const area = $derived(`${line}L${W},${H}L0,${H}Z`)
	const prevLine = $derived(d.prev.length > 1 ? smooth(d.prev) : '')
	// The tooltip marks the busiest day.
	const peak = $derived(d.series.indexOf(Math.max(...d.series)))
	const peakPrev = $derived(d.prev[peak])
	const peakDate = $derived(
		new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(d.days[peak] ?? now),
	)
	const peakNote = $derived(
		sample ? 'Hacker News · ↑ 144%' : peakPrev ? `${d.series[peak] >= peakPrev ? '↑' : '↓'} ${Math.round(Math.abs((d.series[peak] - peakPrev) / peakPrev) * 100)}% vs a month before` : 'busiest day',
	)

	const fmt = new Intl.NumberFormat('en')
	const pct1 = (n: number) => `${n.toFixed(1)}%`
	function duration(sec: number) {
		const s = Math.round(sec)
		return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
	}
	/** `points`: a rate, whose change is in percentage points */
	function delta(c: number | null | undefined, points = false) {
		if (c == null) return ''
		return `${c > 0 ? '▲' : c < 0 ? '▼' : ''} ${Math.abs(c).toFixed(1)}${points ? ' pts' : '%'}`
	}
	function vital(name: keyof Live['vitals'], v: number | null) {
		if (v == null) return '—'
		if (name === 'cls') return v.toFixed(2)
		return v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`
	}
	const GOOD = { lcp: 2500, inp: 200, cls: 0.1, ttfb: 800 }
	const POOR = { lcp: 4000, inp: 500, cls: 0.25, ttfb: 1800 }
	const grade = (name: keyof Live['vitals'], v: number | null) => (v == null ? '' : v <= GOOD[name] ? 'g' : v > POOR[name] ? 'p' : 'n')
	const topShare = $derived(Math.max(1, ...d.channels.map(([, v]) => v)))

	/** the real dashboard's address, once its iframe is in the page */
	let src = $state<string | null>(null)
	let frame = $state<HTMLIFrameElement>()
	let win = $state<HTMLElement>()
	let toggle = $state<HTMLButtonElement>()
	/** the figure fills the screen; `held` keeps its place in the page meanwhile */
	let open = $state(false)
	let held = $state(0)
	const pageTheme = (): Theme => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')

	/** Asks whether the server has a sample store to show, then adds the iframe. */
	let asked = false
	function load() {
		if (!demo || asked) return
		asked = true
		const url = demo
		fetch(new URL('/api/v1/me', url), { credentials: 'omit', signal: AbortSignal.timeout(5000) })
			.then((r) => (r.ok ? r.json() : null))
			.then((me: { sample?: string | null } | null) => {
				if (me?.sample) src = embedUrl(url, pageTheme())
			})
			.catch(() => {})
	}
	/**
	 * Adds the iframe once the figure is within a screen of view and the browser is idle,
	 * and only when the server has a sample store to show: otherwise, or with the API down,
	 * the drawing stays. Never for Save-Data.
	 */
	function whenNear(node: HTMLElement) {
		if (!demo || (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return
		const idle = window.requestIdleCallback ?? ((f: () => void) => setTimeout(f, 200))
		const io = new IntersectionObserver(
			(entries) => {
				if (!entries.some((e) => e.isIntersecting)) return
				io.disconnect()
				idle(load)
			},
			{ rootMargin: '100% 0px' },
		)
		io.observe(node)
		return () => io.disconnect()
	}

	// the dashboard follows the page's day and night switch without reloading
	$effect(() => {
		if (!src || !demo) return
		const origin = new URL(demo).origin
		const watch = new MutationObserver(() => frame?.contentWindow?.postMessage(themeMessage(pageTheme()), origin))
		watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
		return () => watch.disconnect()
	})

	/** Fills the screen with the same window, so the dashboard keeps where it was clicked to. */
	function expand() {
		held = win?.offsetHeight ?? 0
		open = true
		// opened before the figure was near: load the dashboard now
		if (demo && !(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) load()
	}
	function close() {
		open = false
		toggle?.focus({ preventScroll: true })
	}
	$effect(() => {
		if (!open) return
		const root = document.documentElement
		const overflow = root.style.overflow
		root.style.overflow = 'hidden'
		toggle?.focus({ preventScroll: true })
		const key = (e: KeyboardEvent) => e.key === 'Escape' && close()
		addEventListener('keydown', key)
		return () => {
			root.style.overflow = overflow
			removeEventListener('keydown', key)
		}
	})
</script>

<div class="slot" style:height={open ? `${held}px` : null}>
{#if open}<button class="backdrop" aria-label="Close the full-screen demo" tabindex="-1" onclick={close}></button>{/if}
<div
	class="window"
	class:open
	bind:this={win}
	role={open ? 'dialog' : null}
	aria-modal={open ? 'true' : null}
	aria-label={open ? 'The misomoon dashboard on Acme' : null}
	{@attach whenNear}
>
	<div class="chrome">
		<span></span><span></span><span></span>
		<!-- core's SAMPLE.domain: the store the demo shows -->
		<div class="url mono">acme.example</div>
		<button class="size" bind:this={toggle} aria-label={open ? 'Close the full-screen demo' : 'Open the demo full screen'} onclick={() => (open ? close() : expand())}>
			{#if open}
				<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
			{:else}
				<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9" /></svg>
			{/if}
		</button>
	</div>
	{#if src}
		<iframe bind:this={frame} {src} title="The misomoon dashboard on Acme, a sample store: click through every report" loading="lazy" class:ready onload={() => (ready = true)}></iframe>
	{/if}
	<div class="body" class:gone={ready} inert={ready} aria-hidden={ready}>
		<aside>
			<div class="site"><i></i>misomoon.com</div>
			<div class="live"><b></b>{fmt.format(d.now)} {d.now === 1 ? 'person' : 'people'} here now</div>
			{#each ['Overview', 'Live', 'Funnels', 'Paths', 'Speed', 'Settings'] as item, i (item)}
				<div class="item" class:on={i === 0}>{item}</div>
			{/each}
		</aside>
		<main>
			<div class="title">
				<span class="serif">Overview</span>
				<span class="pill">Last 30 days</span>
				{#if sample}<span class="pill sample" title="Sample numbers, not real visitors">Sample data</span>{/if}
			</div>
			<div class="kpis">
				<div class="kpi on"><span>People</span><strong class="num">{fmt.format(d.visitors)}</strong><em>{delta(d.change?.visitors)}</em></div>
				<div class="kpi"><span>Pageviews</span><strong class="num">{fmt.format(d.pageviews)}</strong><em>{delta(d.change?.pageviews)}</em></div>
				<div class="kpi"><span>Left at once</span><strong class="num">{pct1(d.bounce_rate)}</strong><em>{delta(d.change?.bounce_rate, true)}</em></div>
				<div class="kpi"><span>Time per visit</span><strong class="num">{duration(d.visit_duration)}</strong><em>{delta(d.change?.visit_duration)}</em></div>
			</div>
			<svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" class="chart" aria-hidden="true">
				<defs>
					<pattern id="hero-dots" width="7" height="7" patternUnits="userSpaceOnUse">
						<circle cx="3.5" cy="3.5" r="1.5" fill="var(--vermilion)" />
					</pattern>
				</defs>
				{#each [0.25, 0.5, 0.75] as g (g)}<line x1="0" x2={W} y1={H * g} y2={H * g} class="grid" />{/each}
				{#if prevLine}<path d={prevLine} class="prev" />{/if}
				<path d={area} fill="url(#hero-dots)" class="area" />
				<path d={line} class="line" pathLength="1" />
				<circle cx={x(peak, d.series.length)} cy={y(d.series[peak])} r="4.5" class="dot" />
			</svg>
			<div class="tip" style:left="{Math.min(70, Math.max(8, (peak / Math.max(1, d.series.length - 1)) * 100))}%">
				<span class="muted">{peakDate}</span>
				<b class="num">{fmt.format(d.series[peak])} visitors</b>
				<span class="up">{peakNote}</span>
			</div>
			<div class="lower">
				<div class="panel">
					<div class="ph">Channels</div>
					{#each d.channels as [k, v] (k)}
						<div class="row" class:hl={k === 'AI Assistants'}>
							<span class="bar" style:width="{(v / topShare) * 86}%"></span>
							<span>{k}</span><span class="num">{Math.round(v)}%</span>
						</div>
					{/each}
				</div>
				<div class="panel">
					<div class="ph">Speed · p75</div>
					<div class="vitals">
						{#each ['lcp', 'inp', 'cls', 'ttfb'] as const as name (name)}
							<div><span>{name.toUpperCase()}</span><b class="num">{vital(name, d.vitals[name])}</b><i class={grade(name, d.vitals[name])}></i></div>
						{/each}
					</div>
				</div>
			</div>
		</main>
	</div>
</div>
</div>

<style>
	.slot {
		position: relative;
	}
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 90;
		border: 0;
		padding: 0;
		background: rgb(0 0 0 / 0.55);
		cursor: zoom-out;
	}
	.window.open {
		position: fixed;
		inset: 16px;
		z-index: 91;
		box-shadow: 6px 6px 0 var(--ink);
		display: flex;
		flex-direction: column;
	}
	.window.open .body {
		flex: 1;
		min-height: 0;
	}
	.size {
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		padding: 0;
		border-radius: 7px;
		border: 1.5px solid var(--ink);
		background: var(--surface);
		color: var(--text);
		cursor: pointer;
	}
	.size:hover {
		background: var(--mustard);
		--ink: var(--ink-print);
		color: var(--ink-print);
	}
	.size:focus-visible {
		outline: 2px solid var(--vermilion);
		outline-offset: 2px;
	}
	.size svg {
		width: 14px;
		height: 14px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.window {
		position: relative;
		border-radius: 14px;
		border: 2px solid var(--ink);
		background: var(--surface);
		box-shadow: 10px 10px 0 var(--ink);
		overflow: hidden;
		text-align: left;
		font-size: 12px;
	}
	iframe {
		position: absolute;
		inset: 40px 0 0;
		width: 100%;
		height: calc(100% - 40px);
		border: 0;
		background: var(--surface);
		/* above the drawing's own layers, such as the tooltip */
		z-index: 5;
		opacity: 0;
		transition: opacity 0.4s ease;
	}
	iframe.ready {
		opacity: 1;
	}
	/* the drawing goes once the dashboard has faded in over it */
	.body.gone {
		visibility: hidden;
		transition: visibility 0s 0.4s;
	}
	@media (prefers-reduced-motion: reduce) {
		iframe {
			transition: none;
		}
	}
	.chrome {
		display: flex;
		align-items: center;
		gap: 7px;
		height: 38px;
		padding: 0 14px;
		border-bottom: 2px solid var(--ink);
		background: var(--bg);
	}
	.chrome > span {
		width: 11px;
		height: 11px;
		border-radius: 50%;
		border: 1.5px solid var(--ink);
		background: var(--vermilion);
	}
	.chrome > span:nth-child(2) {
		/* stays light in the night edition, so ink stays ink on it */
		--ink: var(--ink-print);
		--text: var(--ink-print);
		--text-2: var(--print-2);
		--text-3: var(--print-3);
		--surface: var(--print-surface);
		color: var(--ink-print);
		background: var(--mustard);
	}
	.chrome > span:nth-child(3) {
		background: var(--leaf);
	}
	.url {
		margin: 0 auto;
		padding: 3px 14px;
		border-radius: 999px;
		border: 1.5px solid var(--ink);
		background: var(--surface);
		color: var(--text-2);
		font-size: 11px;
	}
	.body {
		display: grid;
		grid-template-columns: 170px 1fr;
		min-height: 470px;
	}
	aside {
		padding: 14px 10px;
		border-right: 1.5px solid var(--line-strong);
		background: var(--surface-2);
		display: flex;
		flex-direction: column;
		gap: 3px;
		color: var(--text-2);
	}
	.site {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px;
		border-radius: 8px;
		border: 1.5px solid var(--ink);
		background: var(--surface);
		color: var(--text);
		font-weight: 600;
		margin-bottom: 6px;
	}
	.site i {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		border: 1.5px solid var(--ink);
		background: var(--vermilion);
	}
	.live {
		display: flex;
		align-items: center;
		gap: 7px;
		padding: 4px 8px 10px;
		font-size: 11px;
		color: var(--text-3);
	}
	.live b {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--good);
		box-shadow: 0 0 0 3px var(--good-soft);
	}
	.item {
		padding: 7px 8px;
		border-radius: 7px;
	}
	.item.on {
		background: var(--block);
		color: var(--on-block);
		font-weight: 600;
	}
	main {
		position: relative;
		padding: 18px 20px;
		min-width: 0;
	}
	.title {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.title .serif {
		font-size: 34px;
		line-height: 0.9;
	}
	.pill.sample {
		/* stays light in the night edition, so ink stays ink on it */
		--ink: var(--ink-print);
		--text: var(--ink-print);
		--text-2: var(--print-2);
		--text-3: var(--print-3);
		--surface: var(--print-surface);
		margin-left: 6px;
		background: var(--mustard);
		color: var(--ink);
	}
	.pill {
		padding: 4px 10px;
		border-radius: 999px;
		border: 1.5px solid var(--ink);
		font-weight: 600;
	}
	.kpis {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		margin-top: 16px;
		border: 1.5px solid var(--ink);
		border-radius: 10px;
		overflow: hidden;
	}
	.kpi {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 10px 12px;
		border-right: 1.5px solid var(--line-strong);
		position: relative;
	}
	.kpi:last-child {
		border-right: 0;
	}
	.kpi.on::after {
		content: '';
		position: absolute;
		left: 12px;
		right: 12px;
		bottom: 0;
		height: 4px;
		background: var(--vermilion);
	}
	.kpi span {
		color: var(--text-3);
		font-size: 11px;
	}
	.kpi.on {
		background: var(--surface-2);
	}
	.kpi strong {
		font-size: 21px;
		font-weight: 700;
		letter-spacing: -0.02em;
	}
	.kpi em {
		font-style: normal;
		font-size: 10px;
		color: var(--good);
	}
	.chart {
		display: block;
		width: 100%;
		height: 170px;
		margin-top: 16px;
		overflow: visible;
	}
	.grid {
		stroke: var(--chart-grid);
		stroke-dasharray: 2 4;
		vector-effect: non-scaling-stroke;
	}
	.line {
		fill: none;
		stroke: var(--vermilion);
		stroke-width: 2.5;
		vector-effect: non-scaling-stroke;
		stroke-dasharray: 1;
		stroke-dashoffset: 1;
		animation: draw 2.2s 0.3s var(--ease-out) forwards;
	}
	.area {
		opacity: 0;
		animation: fade 1.2s 1s forwards;
	}
	.prev {
		fill: none;
		stroke: var(--chart-compare);
		stroke-width: 1.5;
		stroke-dasharray: 3 4;
		vector-effect: non-scaling-stroke;
	}
	.dot {
		fill: var(--mustard);
		stroke: var(--ink);
		stroke-width: 2.5;
		opacity: 0;
		animation: fade 0.4s 1.6s forwards;
	}
	@keyframes draw {
		to {
			stroke-dashoffset: 0;
		}
	}
	@keyframes fade {
		to {
			opacity: 1;
		}
	}
	.tip {
		position: absolute;
		top: 132px;
		left: 50%;
		display: flex;
		flex-direction: column;
		gap: 1px;
		padding: 9px 11px;
		border-radius: 8px;
		background: var(--block);
		color: var(--on-block);
		box-shadow: 4px 4px 0 var(--vermilion);
		opacity: 0;
		animation: fade 0.5s 1.8s forwards;
	}
	.tip b {
		font-weight: 500;
		font-size: 13px;
	}
	.tip .muted {
		color: rgb(242 236 223 / 0.6);
	}
	.up {
		color: var(--mustard);
		font-size: 10.5px;
	}
	.muted {
		color: var(--text-3);
	}
	.lower {
		display: grid;
		grid-template-columns: 1.2fr 1fr;
		gap: 12px;
		margin-top: 14px;
	}
	.panel {
		border: 1.5px solid var(--line-strong);
		border-radius: 10px;
		padding: 10px;
	}
	.ph {
		font-weight: 600;
		margin-bottom: 8px;
		font-size: 12px;
	}
	.row {
		position: relative;
		display: flex;
		justify-content: space-between;
		padding: 5px 8px;
		margin-bottom: 2px;
		isolation: isolate;
		color: var(--text-2);
	}
	.row .bar {
		position: absolute;
		inset: 0 auto 0 0;
		background: radial-gradient(circle, rgb(232 70 26 / 0.55) 1px, transparent 1.35px) 0 0 / 4px 4px;
		border-right: 2px solid var(--vermilion);
		z-index: -1;
	}
	.row.hl {
		color: var(--text);
	}
	.row.hl .bar {
		background: var(--mustard);
		box-shadow: inset 0 0 0 1.5px var(--ink);
	}
	.vitals {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 6px;
	}
	.vitals div {
		position: relative;
		display: flex;
		flex-direction: column;
		padding: 8px;
		border-radius: 8px;
		border: 1.5px solid var(--line-strong);
	}
	.vitals span {
		font-size: 10px;
		color: var(--text-3);
		letter-spacing: 0.06em;
	}
	.vitals b {
		font-weight: 700;
		font-size: 16px;
	}
	.vitals i {
		position: absolute;
		top: 9px;
		right: 9px;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--good);
	}
	.vitals i.n {
		background: var(--warn);
	}
	.vitals i.p {
		background: var(--bad);
	}
	.vitals i:not(.g, .n, .p) {
		display: none;
	}
	@media (max-width: 760px) {
		.body {
			grid-template-columns: 1fr;
		}
		aside {
			display: none;
		}
		.kpis {
			grid-template-columns: repeat(2, 1fr);
		}
		.lower {
			grid-template-columns: 1fr;
		}
		.tip {
			display: none;
		}
	}
</style>
