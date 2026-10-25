<script lang="ts">
	import { goto } from '$app/navigation'
	import { rank, snippet, type Entry } from '#lib/search.ts'

	let { open = $bindable(false) }: { open?: boolean } = $props()
	let dialog = $state<HTMLDialogElement>()
	let input = $state<HTMLInputElement>()
	let query = $state('')
	let active = $state(0)
	let index = $state<Entry[] | null>(null)
	let failed = $state(false)

	function load() {
		failed = false
		fetch('/search.json')
			.then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
			.then((d: Entry[]) => (index = d))
			.catch(() => (failed = true))
	}

	$effect(() => {
		if (!dialog) return
		if (open && !dialog.open) {
			dialog.showModal()
			query = ''
			active = 0
			input?.focus()
			if (!index) load()
		} else if (!open && dialog.open) dialog.close()
	})

	const results = $derived(index ? rank(index, query) : [])

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
			<input
				bind:this={input}
				bind:value={query}
				oninput={() => (active = 0)}
				{onkeydown}
				role="combobox"
				aria-expanded={results.length > 0}
				aria-controls="search-results"
				aria-autocomplete="list"
				aria-activedescendant={results[active] ? `result-${active}` : undefined}
				placeholder="Search the docs"
				autocomplete="off"
				spellcheck="false"
			/>
			<kbd>esc</kbd>
		</label>
		{#if query.trim()}
			{#if results.length}
				<!-- the input keeps focus; arrows move aria-activedescendant through these options -->
				<ul id="search-results" role="listbox" aria-label="Results">
					{#each results as r, i (r.slug + r.id)}
						<li role="presentation">
							<a
								id="result-{i}"
								role="option"
								aria-selected={i === active}
								tabindex="-1"
								href="/{r.slug}{r.id ? `#${r.id}` : ''}"
								class:on={i === active}
								onclick={(ev) => (ev.preventDefault(), go(r))}
								onmouseenter={() => (active = i)}
							>
								<span class="where mono">{r.section} · {r.page}</span>
								<b>{r.heading}</b>
								<span class="text">{snippet(r.text, query)}</span>
							</a>
						</li>
					{/each}
				</ul>
			{:else if index}
				<p class="empty">Nothing matches “{query.trim()}”. Try a feature name, a setting, or an error message.</p>
			{:else if failed}
				<p class="empty" role="alert">The search index didn't load. <button type="button" class="retry" onclick={load}>Try again</button></p>
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
	.retry {
		padding: 0;
		border: 0;
		background: none;
		color: var(--text);
		font: inherit;
		font-weight: 600;
		text-decoration: underline;
		cursor: pointer;
	}
</style>
