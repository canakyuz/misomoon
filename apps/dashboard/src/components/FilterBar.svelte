<script lang="ts">
	import Bookmark from '@lucide/svelte/icons/bookmark'
	import Check from '@lucide/svelte/icons/check'
	import Plus from '@lucide/svelte/icons/plus'
	import Search from '@lucide/svelte/icons/search'
	import X from '@lucide/svelte/icons/x'
	import { MAX_VALUES } from '@misomoon/core/filters'
	import { tick } from 'svelte'
	import { get, send, type BreakdownResponse, type Row, type Segment } from '../lib/api'
	import { getDash, Resource, type Filter, type FilterOp } from '../lib/dash.svelte'
	import { num } from '../lib/format'
	import { dimLabel, displayKey, favicon, iconDomain, OP_LABELS, prefix } from '../lib/labels'
	import { filterProblem, parseFilters, serializeFilters } from '../lib/url'

	const dash = getDash()

	// Saved filters: named filter sets. The API calls them segments.
	const segments = new Resource<Segment[]>(() => (dash.site ? `/api/v1/sites/${dash.site}/segments?_=${dash.tick}` : null))
	let segOpen = $state(false)
	let segName = $state('')
	let segError = $state<string | null>(null)
	const current = $derived(serializeFilters(dash.filters))
	const activeSegment = $derived(segments.data?.find((g) => g.filters === current) ?? null)
	/** the button shows once there is a saved filter to apply, or filters to save */
	const canSave = $derived(dash.signedIn && dash.filters.length > 0)
	const showSaved = $derived(!!segments.data?.length || canSave || segOpen)

	function applySegment(g: Segment) {
		dash.filters = parseFilters(g.filters)
		segOpen = false
	}

	let shareSeg = $state(false)

	let segSaving = false
	async function saveSegment() {
		if (!dash.site || !segName.trim() || !dash.filters.length || segSaving) return
		segSaving = true
		segError = null
		try {
			await send('POST', `/api/v1/sites/${dash.site}/segments`, { name: segName.trim(), filters: current, personal: !(dash.canEdit && shareSeg) })
			segName = ''
			dash.tick++
		} catch (e) {
			segError = (e as Error).message
		} finally {
			segSaving = false
		}
	}

	async function deleteSegment(g: Segment) {
		if (!dash.site) return
		segError = null
		try {
			await send('DELETE', `/api/v1/sites/${dash.site}/segments/${g.id}`)
			dash.tick++
		} catch (e) {
			segError = (e as Error).message
		}
	}

	const GROUPS: { label: string; dims: string[] }[] = [
		{ label: 'Content', dims: ['page', 'entry_page', 'exit_page', 'hostname'] },
		{ label: 'Acquisition', dims: ['channel', 'source', 'referrer', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] },
		{ label: 'Location', dims: ['country', 'region', 'city', 'continent', 'timezone', 'network'] },
		{ label: 'Technology', dims: ['browser', 'browser_version', 'os', 'os_version', 'device', 'screen', 'language'] },
		{ label: 'Behaviour', dims: ['goal', 'event', 'prop'] },
	]
	const OPS = Object.keys(OP_LABELS) as FilterOp[]

	// The picker: dimensions on the left, that dimension's values on the right.
	let open = $state(false)
	/** the highlighted dimension; `prop` stands for every custom property */
	let dim = $state('page')
	let dimQuery = $state('')
	let op = $state<FilterOp>('==')
	let text = $state('')
	/** values ticked but not applied yet; for `prop` they read "plan: pro" */
	let picked = $state<string[]>([])
	/** a value row the arrow keys point at, -1 for none */
	let cursor = $state(-1)
	let problem = $state<string | null>(null)
	let rows = $state.raw<Row[]>([])
	let loading = $state(false)
	let loadError = $state<string | null>(null)
	let pos = $state({ top: 0, left: 0 })
	let button: HTMLButtonElement | undefined = $state()
	let valueInput: HTMLInputElement | undefined = $state()

	const isProp = (d: string) => d === 'prop' || d.startsWith('prop:')
	/** the filter already set for a picker dimension; custom properties share one entry */
	const existing = (d: string) => dash.filters.find((f) => (d === 'prop' ? f.dim.startsWith('prop:') : f.dim === d))
	const shown = $derived(
		GROUPS.map((g) => ({ ...g, dims: g.dims.filter((d) => dimLabel(d).toLowerCase().includes(dimQuery.trim().toLowerCase())) })).filter((g) => g.dims.length),
	)
	const flat = $derived(shown.flatMap((g) => g.dims))
	/** the filter this dimension has now */
	const already = $derived(existing(dim))
	const word = $derived(OP_LABELS[op])

	function openPicker() {
		dash.notice = null
		if (open) return (open = false)
		dimQuery = ''
		place()
		choose(GROUPS.flatMap((g) => g.dims).find((d) => existing(d)) ?? 'page', true)
		open = true
	}

	/** Fixed below the button, kept inside the window: the Topbar row is centred. */
	function place() {
		if (!button) return
		const r = button.getBoundingClientRect()
		const width = Math.min(600, innerWidth - 24)
		pos = { top: r.bottom + 6, left: Math.max(12, Math.min(r.left, innerWidth - width - 12)) }
	}

	/** Switches the right pane to a dimension, starting from the filter it already has. */
	async function choose(d: string, focus = false) {
		dim = d
		const f = existing(d)
		op = f?.op ?? '=='
		picked = f ? (d === 'prop' ? f.values.map((v) => `${f.dim.slice(5)}: ${v}`) : [...f.values]) : []
		text = ''
		cursor = -1
		problem = null
		await tick()
		document.getElementById(`dim-${d}`)?.scrollIntoView({ block: 'nearest' })
		if (focus) valueInput?.focus()
	}

	function moveDim(e: KeyboardEvent) {
		if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
		e.preventDefault()
		const i = flat.indexOf(dim)
		const next = flat[(i + (e.key === 'ArrowDown' ? 1 : flat.length - 1)) % flat.length]
		if (next) choose(next)
		document.getElementById(`dim-${next}`)?.focus({ preventScroll: false })
	}

	// The values come from this period's breakdown of the dimension, with the other filters
	// applied. Each run aborts the one before, so a slow answer can't replace a newer one.
	$effect(() => {
		const d = dim
		const q = text.trim()
		if (!open || !dash.site) return
		const ctrl = new AbortController()
		loading = true
		loadError = null
		const timer = setTimeout(async () => {
			const p = new URLSearchParams(dash.params)
			p.delete('filters')
			const rest = dash.filters.filter((f) => (d === 'prop' ? !f.dim.startsWith('prop:') : f.dim !== d))
			if (rest.length) p.set('filters', serializeFilters(rest))
			p.set('property', d === 'prop' ? 'props' : d)
			p.set('limit', '50')
			if (q) p.set('search', q)
			try {
				const res = await get<BreakdownResponse>(`/api/v1/stats/breakdown?${p}`, ctrl.signal)
				if (!ctrl.signal.aborted) rows = res.rows
			} catch (e) {
				if (!ctrl.signal.aborted) loadError = (e as Error).message
			} finally {
				if (!ctrl.signal.aborted) loading = false
			}
		}, q ? 150 : 0)
		return () => {
			clearTimeout(timer)
			ctrl.abort()
		}
	})

	function toggle(key: string) {
		problem = null
		if (picked.includes(key)) return (picked = picked.filter((k) => k !== key))
		if (picked.length >= MAX_VALUES) return (problem = `At most ${MAX_VALUES} values in one filter.`)
		picked = [...picked, key]
	}

	/** "plan: pro" into its property and value */
	function split(key: string): [string, string] | null {
		const at = key.indexOf(': ')
		return at > 0 ? [key.slice(0, at).trim(), key.slice(at + 2).trim()] : null
	}

	/** The filter the footer would set: the ticked values, or else the typed text split on |. */
	function build(): Filter | null {
		const values = picked.length ? picked : text.split('|').map((v) => v.trim()).filter(Boolean)
		if (!values.length) return null
		if (dim !== 'prop') return { dim, op, values }
		const pairs = values.map(split)
		if (pairs.some((x) => !x)) {
			problem = 'Write a custom property as key: value, for example plan: pro.'
			return null
		}
		const key = pairs[0]![0]
		const same = pairs.filter((x) => x![0] === key).map((x) => x![1])
		if (same.length < pairs.length) problem = `One filter covers one property, so only ${key} was applied.`
		return { dim: `prop:${key}`, op, values: same }
	}

	function apply() {
		problem = null
		const f = build()
		if (!f) return
		const left = problem
		// a custom property whose key changed replaces the old property's filter
		const replaced = dim === 'prop' && already && already.dim !== f.dim ? already : null
		const why = filterProblem(
			dash.filters.filter((x) => x !== replaced),
			f,
		)
		if (why) return (problem = why)
		if (replaced) dash.removeFilter(replaced.dim)
		if (!dash.setFilter(f)) return
		// what the filter left out stays on screen in the bar
		if (left) dash.notice = left
		open = false
	}

	function remove() {
		if (already) dash.removeFilter(already.dim)
		open = false
	}

	function valueKey(e: KeyboardEvent) {
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault()
			if (!rows.length) return
			cursor = e.key === 'ArrowDown' ? Math.min(cursor + 1, rows.length - 1) : Math.max(cursor - 1, -1)
			document.getElementById(`val-${cursor}`)?.scrollIntoView({ block: 'nearest' })
		} else if (e.key === 'Enter') {
			e.preventDefault()
			// Enter on a highlighted value ticks it; otherwise it applies
			if (cursor >= 0 && rows[cursor]) toggle(rows[cursor].key)
			else apply()
		}
	}
	// the cursor points into the current list only
	$effect(() => {
		void rows
		cursor = -1
	})

	const counted = $derived(picked.length ? `${picked.length} selected` : text.trim() ? `${word} “${text.trim()}”` : 'Nothing selected')
	const label = (k: string) => (dim === 'prop' ? k : displayKey(dim, k))
</script>

<svelte:window onkeydown={(e) => open && e.key === 'Escape' && (open = false)} />

<div class="bar">
	<div class="add">
		<button class="btn" class:on={open} bind:this={button} onclick={openPicker} aria-expanded={open} aria-haspopup="dialog"><Plus size={14} />Filter</button>
		{#if open}
			<div class="scrim" role="presentation" onclick={() => (open = false)}></div>
			<div class="pop card picker" role="dialog" aria-label="Add a filter" style:top="{pos.top}px" style:left="{pos.left}px">
				<div class="dims">
					<label class="find">
						<Search size={13} aria-hidden="true" />
						<input aria-label="Find a dimension" placeholder="Find a dimension" bind:value={dimQuery} onkeydown={moveDim} spellcheck="false" />
					</label>
					<div class="dim-list" role="listbox" aria-label="Dimension">
						{#each shown as g (g.label)}
							<p class="group-label">{g.label}</p>
							{#each g.dims as d (d)}
								<button
									id="dim-{d}"
									role="option"
									aria-selected={d === dim}
									class="dim"
									class:on={d === dim}
									onclick={() => choose(d, true)}
									onkeydown={moveDim}
									tabindex={d === dim ? 0 : -1}
								>
									<span>{dimLabel(d)}</span>
									{#if existing(d)}<i class="dot" title="Filter set"></i>{/if}
								</button>
							{/each}
						{:else}
							<p class="none">No dimension matches.</p>
						{/each}
					</div>
				</div>

				<div class="vals">
					<div class="vals-head">
						<label class="find">
							<Search size={13} aria-hidden="true" />
							<input
								bind:this={valueInput}
								aria-label="{dimLabel(dim)} {word}"
								placeholder={dim === 'prop' ? `Property ${word}… e.g. plan: pro` : `${dimLabel(dim)} ${word}…`}
								bind:value={text}
								onkeydown={valueKey}
								spellcheck="false"
								autocomplete="off"
							/>
						</label>
						<div class="ops" role="radiogroup" aria-label="Operator">
							{#each OPS as o (o)}
								<button role="radio" aria-checked={o === op} class:on={o === op} onclick={() => (op = o)} title={OP_LABELS[o]}>{OP_LABELS[o]}</button>
							{/each}
						</div>
					</div>

					<div class="val-list" role="listbox" aria-label="{dimLabel(dim)} values" aria-multiselectable="true" class:stale={loading && rows.length > 0}>
						{#if loadError}
							<p class="none">Couldn't load the values. {loadError}</p>
						{:else if loading && !rows.length}
							{#each Array(6) as _, i (i)}<div class="sk"><span class="skeleton" style:width="{72 - i * 9}%"></span></div>{/each}
						{:else if !rows.length}
							<p class="none">
								{#if text.trim()}No value matches “{text.trim()}”.{#if !picked.length} Press Enter to filter by it anyway.{/if}{:else}No values in this period.{/if}
							</p>
						{:else}
							{#each rows as r, i (r.key)}
								{@const on = picked.includes(r.key)}
								{@const domain = iconDomain(dim, r.key)}
								{@const pre = prefix(dim, r.key)}
								<button id="val-{i}" role="option" aria-selected={on} class="val" class:on class:cursor={i === cursor} onclick={() => toggle(r.key)}>
									<span class="tick" aria-hidden="true">{#if on}<Check size={13} strokeWidth={2.5} />{/if}</span>
									{#if domain}
										<img src={favicon(domain)} alt="" width="14" height="14" loading="lazy" onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')} />
									{:else if pre}
										<span class="flag">{pre}</span>
									{/if}
									<span class="text">{label(r.key)}</span>
									<span class="n num">{num(r.visitors)}</span>
								</button>
							{/each}
						{/if}
					</div>

					<footer>
						<span class="count" class:warn={!!problem} role={problem ? 'alert' : undefined}>{problem ?? dash.notice ?? counted}</span>
						{#if already}<button class="btn ghost" onclick={remove}>Remove filter</button>{/if}
						<button class="btn primary" onclick={apply} disabled={!picked.length && !text.trim()}>Apply</button>
					</footer>
				</div>
			</div>
		{/if}
	</div>
	{#if showSaved}
		<div class="add">
			<button class="btn" class:on={segOpen || !!activeSegment} onclick={() => (segOpen = !segOpen)} aria-expanded={segOpen}
				><Bookmark size={14} />{activeSegment ? activeSegment.name : 'Saved filters'}</button
			>
			{#if segOpen}
				<div class="scrim" role="presentation" onclick={() => (segOpen = false)}></div>
				<div class="pop card">
					{#each segments.data ?? [] as g (g.id)}
						<div class="seg">
							<button class="seg-name" class:on={g.filters === current} onclick={() => applySegment(g)}>{g.name}</button>
							{#if g.personal}<span class="mine" title="Only you see this saved filter">you</span>{/if}
							{#if g.personal || dash.canEdit}<button class="seg-x" onclick={() => deleteSegment(g)} aria-label="Delete saved filter"><X size={12} /></button>{/if}
						</div>
					{:else}
						<p class="muted note">Nothing saved yet. Name the filters you set to use them again.</p>
					{/each}
					{#if canSave}
						<input class="input" placeholder="Name" aria-label="Name" bind:value={segName} onkeydown={(e) => e.key === 'Enter' && saveSegment()} />
						{#if dash.canEdit}<label class="share-seg"><input type="checkbox" bind:checked={shareSeg} /> Everyone on the site sees it</label>{/if}
						<button class="btn primary" onclick={saveSegment} disabled={!segName.trim()}>Save current filters</button>
					{/if}
					{#if segError}<p class="seg-error" role="alert">{segError}</p>{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.mine {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-3);
	}
	.share-seg {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		color: var(--text-2);
	}
	.seg-error {
		margin: 4px 0 0;
		font-size: 12.5px;
		color: var(--bad);
	}
	/* the buttons sit in the Topbar's row of controls, and wrap with it; the chips are FilterChips, on the line below */
	.bar {
		display: contents;
	}
	@keyframes pop {
		from {
			opacity: 0;
			transform: scale(0.96);
		}
	}
	.add {
		position: relative;
	}
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 29;
	}
	.pop:not(.picker) {
		position: absolute;
		left: 0;
		top: calc(100% + 6px);
		width: 340px;
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		z-index: 30;
		box-shadow: var(--shadow-lg);
		animation: pop var(--dur) var(--ease-out);
	}
	.pop .btn.primary {
		justify-content: center;
	}
	/* the picker: fixed so it can sit anywhere under a centred toolbar */
	.picker {
		position: fixed;
		z-index: 30;
		display: grid;
		grid-template-columns: 190px minmax(0, 1fr);
		width: min(600px, calc(100vw - 24px));
		height: 380px;
		overflow: hidden;
		box-shadow: var(--shadow-lg);
		animation: pop var(--dur) var(--ease-out);
	}
	.dims {
		display: flex;
		flex-direction: column;
		min-height: 0;
		border-right: 1.5px solid var(--edge);
		background: var(--surface-2);
	}
	.find {
		display: flex;
		align-items: center;
		gap: 7px;
		height: 42px;
		padding: 0 12px;
		border-bottom: 1px solid var(--line-strong);
		color: var(--text-4);
	}
	.find input {
		flex: 1;
		min-width: 0;
		height: 100%;
		border: 0;
		outline: none;
		background: transparent;
		color: var(--text);
		font-size: 13px;
	}
	.find input::placeholder {
		color: var(--text-4);
	}
	/* the box draws the focus, not the bare input inside it */
	.find input:focus-visible {
		box-shadow: none;
	}
	.find:focus-within {
		color: var(--text-2);
		box-shadow: inset 0 -2px 0 var(--vermilion);
	}
	.dim-list {
		flex: 1;
		overflow-y: auto;
		padding: 4px 6px 8px;
	}
	.group-label {
		margin: 10px 8px 4px;
		font-family: var(--font-mono);
		font-size: 9.5px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-4);
	}
	.dim {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		height: 30px;
		padding: 0 10px;
		border-radius: var(--radius-sm);
		font-size: 13px;
		text-align: left;
		color: var(--text-2);
	}
	.dim:hover {
		background: var(--surface-hover);
		color: var(--text);
	}
	.dim.on {
		background: var(--surface);
		color: var(--text);
		font-weight: 600;
		box-shadow: inset 0 0 0 1.5px var(--edge);
	}
	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--vermilion);
		box-shadow: 0 0 0 1.5px var(--edge);
	}
	.vals {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
	}
	.vals-head {
		border-bottom: 1px solid var(--line-strong);
	}
	.vals-head .find {
		border-bottom: 0;
	}
	.ops {
		display: flex;
		gap: 2px;
		width: fit-content;
		margin: 0 10px 8px;
		padding: 2px;
		border: 1.5px solid var(--line-strong);
		border-radius: var(--radius-sm);
	}
	.ops button {
		height: 22px;
		padding: 0 7px;
		border-radius: var(--radius-xs);
		font-size: 11px;
		white-space: nowrap;
		color: var(--text-3);
	}
	.ops button:hover {
		color: var(--text);
		background: var(--surface-hover);
	}
	.ops button.on {
		background: var(--vermilion);
		color: var(--on-vermilion);
		font-weight: 600;
	}
	/* the switch has 2px of padding, so an outside ring would cover its edge */
	.ops button:focus-visible {
		box-shadow:
			inset 0 0 0 2px var(--cobalt),
			inset 0 0 0 3.5px var(--surface);
		border-radius: var(--radius-xs);
	}
	.val-list {
		flex: 1;
		overflow-y: auto;
		padding: 6px;
		transition: opacity var(--dur);
	}
	.val-list.stale {
		opacity: 0.6;
	}
	.val {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		height: 32px;
		padding: 0 10px 0 6px;
		border-radius: var(--radius-sm);
		font-size: 13px;
		text-align: left;
	}
	.val:hover,
	.val.cursor {
		background: var(--surface-hover);
	}
	.val.cursor {
		box-shadow: inset 0 0 0 1.5px var(--line-strong);
	}
	.val.on {
		font-weight: 600;
	}
	.tick {
		display: grid;
		place-items: center;
		flex: none;
		width: 16px;
		height: 16px;
		border: 1.5px solid var(--line-strong);
		border-radius: var(--radius-xs);
	}
	.val.on .tick {
		border-color: var(--edge);
		background: var(--vermilion);
		color: var(--on-vermilion);
	}
	.val img {
		flex: none;
		border-radius: var(--radius-xs);
	}
	.flag {
		font-size: 14px;
		line-height: 1;
	}
	.val .text {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.val .n {
		font-size: 12px;
		font-weight: 400;
		color: var(--text-3);
	}
	.sk {
		display: flex;
		align-items: center;
		height: 32px;
		padding: 0 10px;
	}
	.sk .skeleton {
		height: 12px;
	}
	.none {
		margin: 0;
		padding: 28px 14px;
		text-align: center;
		font-size: 12.5px;
		color: var(--text-3);
	}
	.picker footer {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		border-top: 1px solid var(--line-strong);
	}
	.count {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 12px;
		color: var(--text-3);
	}
	.count.warn {
		color: var(--bad);
		white-space: normal;
	}
	@media (max-width: 640px) {
		.picker {
			/* minmax(0, …): the chip strip scrolls inside the picker instead of widening it */
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: auto minmax(0, 1fr);
			height: min(440px, calc(100vh - 120px));
		}
		.dims {
			min-width: 0;
			border-right: 0;
			border-bottom: 1.5px solid var(--edge);
		}
		.dims .find,
		.group-label {
			display: none;
		}
		/* the dimensions turn into one scrolling strip of chips */
		.dim-list {
			display: flex;
			gap: 4px;
			overflow-x: auto;
			overflow-y: hidden;
			scrollbar-width: none;
			padding: 6px;
			mask-image: linear-gradient(to right, #000 calc(100% - 18px), transparent);
		}
		.dim-list::-webkit-scrollbar {
			display: none;
		}
		.dim {
			flex: none;
			width: auto;
			gap: 6px;
			height: 28px;
		}
		.ops button {
			padding: 0 5px;
		}
	}
	.seg {
		display: flex;
		align-items: center;
	}
	.seg-name {
		flex: 1;
		text-align: left;
		height: 30px;
		padding: 0 8px;
		border-radius: var(--radius-sm);
		font-size: 13px;
	}
	.seg-name:hover {
		background: var(--surface-hover);
	}
	.seg-name.on {
		font-weight: 600;
	}
	.seg-x {
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		color: var(--text-3);
	}
	.seg-x:hover {
		background: var(--surface-3);
		color: var(--text);
	}
	.note {
		margin: 0;
		font-size: 12.5px;
	}
</style>
