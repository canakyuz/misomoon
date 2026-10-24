<script lang="ts">
	import { flip } from 'svelte/animate'
	import { fly } from 'svelte/transition'
	import Topbar from '../components/Topbar.svelte'
	import { get, type RealtimeResponse } from '../lib/api'
	import { countryName, flag } from '../lib/countries'
	import { getDash } from '../lib/dash.svelte'
	import { ago, num } from '../lib/format'
	import { serializeFilters } from '../lib/url'

	const dash = getDash()
	let data = $state.raw<RealtimeResponse | null>(null)
	let now = $state(Date.now())
	let hover = $state<number | null>(null)
	let error = $state<string | null>(null)

	// Polls every 5 s while the tab is visible, one request at a time, and
	// catches up as soon as the tab is shown again.
	$effect(() => {
		const site = dash.site
		const filters = dash.filters
		if (!site) return
		// another site's or filter's numbers never stand in while the new ones load
		data = null
		error = null
		const ctrl = new AbortController()
		let inflight = false
		const q = new URLSearchParams({ site })
		if (filters.length) q.set('filters', serializeFilters(filters))
		const load = async () => {
			if (inflight || document.hidden) return
			inflight = true
			try {
				const d = await get<RealtimeResponse>(`/api/v1/stats/realtime?${q}`, ctrl.signal, 0)
				if (ctrl.signal.aborted) return
				data = d
				error = null
			} catch (e) {
				if (!ctrl.signal.aborted) error = (e as Error).message
			} finally {
				inflight = false
			}
		}
		const tick = () => {
			now = Date.now()
			load()
		}
		load()
		const id = setInterval(tick, 5000)
		document.addEventListener('visibilitychange', tick)
		return () => {
			ctrl.abort()
			clearInterval(id)
			document.removeEventListener('visibilitychange', tick)
		}
	})

	const max = $derived(Math.max(1, ...(data?.minutes ?? []).map((m) => m.pageviews)))
	const feed = $derived((data?.feed ?? []).map((e) => ({ ...e, id: `${e.ts}-${e.name}-${e.pathname}` })))
	const tz = $derived(dash.current?.timezone ?? 'UTC')
	const minuteLabel = (t: number) => new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit', timeZone: tz }).format(new Date(t))
</script>

<Topbar title="Live" subtitle="Who is on the site in the last 30 minutes. Updates by itself." periodless />

{#if error}<p class="failed" role="alert">Couldn't refresh: {error}{data ? '. Showing the last numbers we got.' : ''}</p>{/if}

<div class="layout">
	<section class="card hero">
		<div class="now">
			<span class="pulse"></span>
			{#if data}
				<span class="big num">{num(data.visitors)}</span>
			{:else}
				<span class="big skeleton" style="width: 96px; height: 56px" aria-label="Loading"></span>
			{/if}
			<span class="muted">{data?.visitors === 1 ? 'visitor' : 'visitors'} in the last 5 minutes</span>
		</div>
		<div class="bars" role="img" aria-label="Pageviews per minute">
			{#if !data}
				{#each Array(30) as _, i (i)}<span class="b ghost skeleton" style:--h="{20 + ((i * 37) % 50)}%"></span>{/each}
			{/if}
			{#each data?.minutes ?? [] as m, i (m.t)}
				<button
					class="b"
					class:last={i === (data?.minutes.length ?? 0) - 1}
					style:--h="{Math.max(2, (m.pageviews / max) * 100)}%"
					onpointerenter={() => (hover = i)}
					onpointerleave={() => (hover = null)}
					aria-label="{minuteLabel(m.t)}: {m.pageviews} pageviews"
				></button>
			{/each}
			{#if hover != null && data}
				{@const m = data.minutes[hover]}
				<div class="tip" style:left="{((hover + 0.5) / data.minutes.length) * 100}%">
					<strong>{minuteLabel(m.t)}</strong>
					<span class="num">{m.pageviews} pageviews · {m.visitors} visitors</span>
				</div>
			{/if}
		</div>
		<div class="axis muted"><span>30 min ago</span><span>now</span></div>
	</section>

	<section class="card feed">
		<h3>Live activity</h3>
		<ul class="scroll-thin">
			{#each feed as e (e.id)}
				<li animate:flip={{ duration: 300 }} in:fly={{ y: -8, duration: 300 }}>
					<span class="dot" class:ev={e.name !== 'pageview'}></span>
					<div class="what">
						<span class="name">{e.name === 'pageview' ? e.pathname : e.name}</span>
						<span class="muted meta">
							{flag(e.country)}
							{e.city ?? countryName(e.country)} · {e.browser} · {e.source}
						</span>
					</div>
					<span class="when muted num">{ago(e.ts, now)}</span>
				</li>
			{:else}
				{#if data}
					<li class="empty muted">Waiting for the next visitor…</li>
				{:else}
					{#each Array(6) as _, i (i)}<li class="sk"><span class="skeleton" style="width: {72 - (i % 3) * 14}%"></span></li>{/each}
				{/if}
			{/each}
		</ul>
	</section>

	<div class="lists">
	{#each [{ title: 'Pages', rows: data?.pages, dim: 'page' }, { title: 'Sources', rows: data?.sources, dim: 'source' }, { title: 'Countries', rows: data?.countries, dim: 'country' }] as list (list.title)}
		{@const top = Math.max(1, ...(list.rows ?? []).map((r) => r.visitors))}
		<section class="card list">
			<h3>{list.title} <span class="muted">· now</span></h3>
			{#each list.rows ?? [] as r (r.key)}
				<button class="row" onclick={() => dash.toggleFilter(list.dim, r.key)}>
					<span class="bar" style:width="{(r.visitors / top) * 100}%"></span>
					<span class="k">{list.dim === 'country' ? `${flag(r.key)} ${countryName(r.key)}` : r.key}</span>
					<span class="num">{r.visitors}</span>
				</button>
			{:else}
				{#if data}
					<p class="muted empty">Quiet right now.</p>
				{:else}
					{#each Array(4) as _, i (i)}<div class="row sk"><span class="skeleton" style="width: {76 - i * 14}%"></span></div>{/each}
				{/if}
			{/each}
		</section>
	{/each}
	</div>
</div>

<style>
	.failed {
		margin: 16px 0 0;
		padding: 10px 14px;
		border-radius: var(--radius);
		background: var(--bad-soft);
		color: var(--bad);
		font-size: 13px;
	}
	.layout {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 16px;
		margin-top: 20px;
	}
	.hero {
		grid-column: span 2;
		padding: 22px 24px 16px;
		background: var(--surface);
	}
	.now {
		display: flex;
		align-items: baseline;
		gap: 12px;
	}
	.big {
		font-size: 64px;
		font-weight: 700;
		line-height: 1;
		letter-spacing: -0.04em;
	}
	.pulse {
		align-self: center;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--good);
		outline: 1.5px solid var(--edge);
		outline-offset: 2px;
		animation: beat 2s infinite;
	}
	@keyframes beat {
		50% {
			outline-offset: 5px;
			outline-color: transparent;
		}
	}

	.bars {
		position: relative;
		display: flex;
		align-items: flex-end;
		gap: 4px;
		height: 180px;
		margin-top: 28px;
	}
	.b {
		flex: 1;
		height: 100%;
		position: relative;
	}
	.b::before {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: var(--h);
		background: var(--dots-dense);
		border-top: 2px solid var(--edge);
		opacity: 0.85;
		transition:
			height var(--dur-slow) var(--ease-out),
			opacity var(--dur-fast);
	}
	.b:hover::before,
	.b.last::before {
		opacity: 1;
	}
	.b.last::before {
		background: var(--miso);
		animation: glow 2s infinite;
	}
	@keyframes glow {
		50% {
			filter: brightness(1.25);
		}
	}
	.tip {
		position: absolute;
		bottom: calc(100% + 8px);
		transform: translateX(-50%);
		display: flex;
		flex-direction: column;
		padding: 7px 10px;
		border-radius: var(--radius);
		background: var(--surface-3);
		border: 1px solid var(--line-strong);
		box-shadow: var(--shadow-lg);
		font-size: 12px;
		white-space: nowrap;
		pointer-events: none;
	}
	/* while the first numbers load: grey bars of made-up heights, no ink on top */
	.b.ghost {
		height: var(--h);
		align-self: flex-end;
		border-radius: 0;
	}
	.b.ghost::before {
		display: none;
	}
	.sk .skeleton {
		display: block;
		height: 12px;
	}
	.feed li.sk {
		height: 52px;
	}
	.feed li.sk:hover {
		background: none;
	}
	.axis {
		display: flex;
		justify-content: space-between;
		margin-top: 8px;
		font-size: 11px;
	}
	.feed {
		grid-row: span 2;
		display: flex;
		flex-direction: column;
		padding: 16px 0 0;
		max-height: 640px;
	}
	h3 {
		margin: 0 18px 10px;
		font-size: 14px;
		font-weight: 600;
	}
	.feed ul {
		list-style: none;
		margin: 0;
		padding: 0 8px 8px;
		overflow: auto;
	}
	.feed li {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 9px 10px;
		border-radius: var(--radius);
	}
	.feed li:hover {
		background: var(--surface-hover);
	}
	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--miso);
		flex: none;
	}
	.dot.ev {
		background: var(--lunar);
	}
	.what {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex: 1;
	}
	.name {
		font-size: 13px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.meta {
		font-size: 11.5px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.when {
		font-size: 11px;
		flex: none;
	}
	.lists {
		grid-column: span 2;
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 16px;
	}
	.list {
		padding: 16px 10px 12px;
	}
	.list h3 {
		margin: 0 8px 10px;
	}
	.row {
		position: relative;
		display: flex;
		justify-content: space-between;
		width: 100%;
		height: 32px;
		padding: 0 8px;
		align-items: center;
		font-size: 13px;
		isolation: isolate;
		border-radius: var(--radius);
	}
	.row .bar {
		position: absolute;
		inset: 0 auto 0 0;
		background: var(--bar);
		border-radius: var(--radius);
		z-index: -1;
		transition: width var(--dur-slow) var(--ease-out);
	}
	.row:hover .bar {
		background: var(--bar-hover);
	}
	.k {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.empty {
		padding: 24px 10px;
		font-size: 13px;
		text-align: center;
	}
	@media (max-width: 1100px) {
		.layout {
			grid-template-columns: 1fr;
		}
		.hero,
		.lists {
			grid-column: auto;
		}
		.lists {
			grid-template-columns: 1fr;
		}
	}
</style>
