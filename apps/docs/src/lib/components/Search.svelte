<script lang="ts">
	import { goto } from '$app/navigation'

	interface Entry {
		slug: string
		page: string
		section: string
		heading: string
		id: string
		text: string
	}

	let { open = $bindable(false) }: { open?: boolean } = $props()
	let dialog = $state<HTMLDialogElement>()
	let input = $state<HTMLInputElement>()
	let query = $state('')
	let active = $state(0)
	let index = $state<Entry[] | null>(null)

	$effect(() => {
		if (!dialog) return
		if (open && !dialog.open) {
			dialog.showModal()
			query = ''
			active = 0
			input?.focus()
			index ??= []
			fetch('/search.json')
				.then((r) => r.json())
				.then((d: Entry[]) => (index = d))
				.catch(() => (index = []))
		} else if (!open && dialog.open) dialog.close()
	})

	// Every word must appear somewhere in the entry; titles and headings weigh more than text.
	const results = $derived.by(() => {
		const words = query.toLowerCase().split(/\s+/).filter(Boolean)
		if (!words.length || !index) return []
		const scored: { e: Entry; score: number }[] = []
		for (const e of index) {
			const page = e.page.toLowerCase()
			const heading = e.heading.toLowerCase()
			const text = e.text.toLowerCase()
			let score = 0
			for (const w of words) {
				const s = (page.includes(w) ? 4 : 0) + (heading.includes(w) ? 6 : 0) + (text.includes(w) ? 1 : 0)
				if (!s) {
					score = 0
					break
				}
				score += s
			}
			if (score) scored.push({ e, score: score + (e.id ? 0 : 2) })
		}
		return scored.sort((a, b) => b.score - a.score).slice(0, 12).map((s) => s.e)
	})

	function snippet(e: Entry): string {
		const w = query.toLowerCase().split(/\s+/).find((x) => e.text.toLowerCase().includes(x))
		if (!w) return e.text.slice(0, 120)
		const i = e.text.toLowerCase().indexOf(w)
		const start = Math.max(0, i - 40)
		return (start ? '…' : '') + e.text.slice(start, start + 140) + (start + 140 < e.text.length ? '…' : '')
	}

	function go(e: Entry) {
		open = false
		goto(`/${e.slug}${e.id ? `#${e.id}` : ''}`)
	}

	function onkeydown(ev: KeyboardEvent) {
		if (ev.key === 'ArrowDown') {
			ev.preventDefault()
			active = Math.min(active + 1, results.length - 1)
		} else if (ev.key === 'ArrowUp') {
			ev.preventDefault()
			active = Math.max(active - 1, 0)
		} else if (ev.key === 'Enter' && results[active]) {
			ev.preventDefault()
			go(results[active])
		}
	}
</script>

<dialog bind:this={dialog} onclose={() => (open = false)} onclick={(e) => e.target === dialog && (open = false)} aria-label="Search the docs">
	<div class="box">
		<label class="field">
			<span class="sr">Search the docs</span>
			<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
			<input bind:this={input} bind:value={query} oninput={() => (active = 0)} {onkeydown} placeholder="Search the docs" autocomplete="off" spellcheck="false" />
			<kbd>esc</kbd>
		</label>
		{#if query.trim()}
			{#if results.length}
				<ul role="listbox" aria-label="Results">
					{#each results as r, i (r.slug + r.id)}
						<li role="option" aria-selected={i === active}>
							<a href="/{r.slug}{r.id ? `#${r.id}` : ''}" class:on={i === active} onclick={(ev) => (ev.preventDefault(), go(r))} onmouseenter={() => (active = i)}>
								<span class="where mono">{r.section} · {r.page}</span>
								<b>{r.heading}</b>
								<span class="text">{snippet(r)}</span>
							</a>
						</li>
					{/each}
				</ul>
			{:else if index && index.length}
				<p class="empty">Nothing matches “{query.trim()}”. Try a feature name, a setting, or an error message.</p>
			{:else}
				<p class="empty">Loading the index…</p>
			{/if}
		{:else}
			<p class="empty">Search every page and heading. <kbd>↑</kbd> <kbd>↓</kbd> to move, <kbd>enter</kbd> to open.</p>
		{/if}
	</div>
</dialog>

<style>
	dialog {
		width: min(640px, calc(100vw - 32px));
		max-height: min(560px, calc(100vh - 120px));
		margin: 12vh auto auto;
		padding: 0;
		border: 2px solid var(--edge);
		border-radius: var(--radius-lg, 14px);
		background: var(--surface);
		color: var(--text);
		box-shadow: var(--shadow-lg);
		overflow: hidden;
	}
	dialog::backdrop {
		background: rgb(23 20 15 / 0.35);
	}
	.box {
		display: flex;
		flex-direction: column;
		max-height: inherit;
	}
	.field {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 16px;
		border-bottom: 2px solid var(--edge);
	}
	.field svg {
		width: 18px;
		height: 18px;
		flex: none;
		fill: none;
		stroke: var(--text-2);
		stroke-width: 2.2;
		stroke-linecap: round;
	}
	input {
		flex: 1;
		min-width: 0;
		border: 0;
		outline: 0;
		background: none;
		color: var(--text);
		font: inherit;
		font-size: 17px;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 6px;
		overflow-y: auto;
	}
	li a {
		display: grid;
		gap: 2px;
		padding: 10px 12px;
		border-radius: var(--radius-sm, 8px);
		text-decoration: none;
	}
	li a.on {
		background: var(--surface-3);
	}
	.where {
		font-size: 10.5px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--vermilion);
	}
	b {
		font-weight: 700;
	}
	.text {
		font-size: 13.5px;
		line-height: 1.45;
		color: var(--text-2);
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}
	.empty {
		margin: 0;
		padding: 18px 16px;
		color: var(--text-2);
		font-size: 14.5px;
	}
</style>
