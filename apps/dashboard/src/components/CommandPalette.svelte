<script lang="ts">
	import CalendarDays from '@lucide/svelte/icons/calendar-days'
	import FunnelX from '@lucide/svelte/icons/funnel-x'
	import GitCompareArrows from '@lucide/svelte/icons/git-compare-arrows'
	import Globe from '@lucide/svelte/icons/globe'
	import Search from '@lucide/svelte/icons/search'
	import SunMoon from '@lucide/svelte/icons/sun-moon'
	import { getDash, PERIODS } from '../lib/dash.svelte'
	import { VIEW_INFO } from '../lib/nav'

	const dash = getDash()
	let q = $state('')
	let index = $state(0)
	let input: HTMLInputElement | undefined = $state()

	interface Cmd {
		group: string
		label: string
		icon: typeof Search
		hint?: string
		run: () => void
	}

	const commands = $derived.by((): Cmd[] => {
		return [
			...dash.views.map((v, i) => ({ group: 'Go to', label: VIEW_INFO[v].label, icon: VIEW_INFO[v].icon, hint: String(i + 1), run: () => (dash.view = v) })),
			...PERIODS.map((p) => ({ group: 'Period', label: p.label, icon: CalendarDays, hint: p.hotkey.toUpperCase(), run: () => dash.setPeriod(p.key) })),
			...dash.sites.map((s) => ({ group: 'Switch site', label: s.name, icon: Globe, hint: s.domain, run: () => dash.switchSite(s.id) })),
			{ group: 'Actions', label: dash.compare ? 'Hide comparison' : 'Compare with previous period', icon: GitCompareArrows, run: () => (dash.compare = !dash.compare) },
			{ group: 'Actions', label: 'Clear all filters', icon: FunnelX, run: () => (dash.filters = []) },
			{ group: 'Actions', label: `Switch to ${dash.theme === 'dark' ? 'day' : 'night'} theme`, icon: SunMoon, run: () => dash.toggleTheme() },
		]
	})

	const results = $derived.by(() => {
		const needle = q.trim().toLowerCase()
		const list = needle ? commands.filter((c) => `${c.group} ${c.label} ${c.hint ?? ''}`.toLowerCase().includes(needle)) : commands
		// With no query every command is listed (the list scrolls), so sites and actions are not cut off.
		return needle ? list.slice(0, 12) : list
	})

	$effect(() => {
		void q
		index = 0
	})
	$effect(() => input?.focus())
	// Keep the highlighted command in view while moving through a long list.
	let list: HTMLDivElement | undefined = $state()
	$effect(() => {
		void index
		list?.querySelector('.on')?.scrollIntoView({ block: 'nearest' })
	})

	function close() {
		dash.paletteOpen = false
	}

	function run(c: Cmd) {
		c.run()
		close()
	}

	function onkey(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault()
			index = Math.min(results.length - 1, index + 1)
		} else if (e.key === 'ArrowUp') {
			e.preventDefault()
			index = Math.max(0, index - 1)
		} else if (e.key === 'Enter' && results[index]) {
			e.preventDefault()
			run(results[index])
		} else if (e.key === 'Escape') close()
	}
</script>

<div class="scrim" role="presentation" onclick={close}></div>
<div class="palette card" role="dialog" aria-modal="true" aria-label="Command palette">
	<label class="search">
		<Search size={16} />
		<input bind:this={input} bind:value={q} aria-label="Command" placeholder="Type a command…" onkeydown={onkey} />
		<kbd class="kbd">esc</kbd>
	</label>
	<div class="list scroll-thin" role="listbox" bind:this={list}>
		{#each results as c, i (`${c.group}|${c.label}|${c.hint ?? ''}`)}
			{#if i === 0 || results[i - 1].group !== c.group}<div class="heading">{c.group}</div>{/if}
			<button role="option" aria-selected={i === index} class:on={i === index} onpointermove={() => (index = i)} onclick={() => run(c)}>
				<c.icon size={15} strokeWidth={1.75} />
				<span>{c.label}</span>
				{#if c.hint}<span class="hint">{c.hint}</span>{/if}
			</button>
		{:else}
			<p class="empty">No command matches “{q.trim()}”.</p>
		{/each}
	</div>
</div>

<style>
	.scrim {
		position: fixed;
		inset: 0;
		background:
			radial-gradient(circle, rgb(23 20 15 / 0.2) 1px, transparent 1.4px) 0 0 / 5px 5px,
			rgb(23 20 15 / 0.16);
		z-index: 70;
	}
	.palette {
		position: fixed;
		top: 14vh;
		left: 50%;
		transform: translateX(-50%);
		width: min(600px, calc(100vw - 32px));
		z-index: 71;
		overflow: hidden;
		box-shadow: var(--shadow-lg);
		animation: rise var(--dur) var(--ease-out);
	}
	@keyframes rise {
		from {
			opacity: 0;
			transform: translate(-50%, 6px) scale(0.99);
		}
	}
	.search {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 14px 16px;
		border-bottom: 1px solid var(--line);
		color: var(--text-3);
	}
	.search input {
		flex: 1;
		border: 0;
		outline: 0;
		background: none;
		font-size: 15px;
		color: var(--text);
		box-shadow: none;
	}
	.list {
		max-height: 380px;
		overflow: auto;
		padding: 6px;
	}
	.heading {
		padding: 10px 10px 4px;
		font-family: var(--font-mono);
		font-size: 10.5px;
		font-weight: 600;
		color: var(--text-4);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.list button {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		height: 36px;
		padding: 0 10px;
		border-radius: var(--radius);
		font-size: 13.5px;
		text-align: left;
	}
	.list button span:first-of-type {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.list button :global(svg) {
		flex: none;
		color: var(--text-3);
	}
	.list button.on {
		background: var(--surface-3);
	}
	.list button.on :global(svg) {
		color: var(--text);
	}
	.empty {
		margin: 0;
		padding: 14px 10px;
		font-size: 13.5px;
		color: var(--text-3);
	}
	.hint {
		font-size: 11.5px;
		color: var(--text-3);
		font-family: var(--font-mono);
	}
</style>
