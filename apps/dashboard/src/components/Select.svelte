<!--
	A dropdown that replaces the native <select>: printed like the rest of the dashboard,
	with a search box once the list is long. The list opens in the top layer (popover), so
	a card's overflow or a transformed parent can't clip it. Keyboard: arrows, Page Up and
	Down, Home and End, Enter, Escape, and typing to search or jump.
-->
<script lang="ts" generics="V extends string | number">
	import { tick } from 'svelte'
	import { Check, ChevronDown, Search } from '@lucide/svelte'
	import { filterOptions, moveActive, typeahead, type SelectOption } from '../lib/select'

	interface Props {
		value: V
		options: SelectOption<V>[]
		/** the accessible name, such as "Timezone" */
		label: string
		/** shown while the value matches no option */
		placeholder?: string
		disabled?: boolean
		/** a search box; on by default once there are more than 7 options */
		search?: boolean
		class?: string
		onchange?: (value: V) => void
	}

	let { value = $bindable(), options, label, placeholder = 'Choose…', disabled = false, search, class: cls = '', onchange }: Props = $props()

	const id = $props.id()
	const searchable = $derived(search ?? options.length > 7)
	const selected = $derived(options.find((o) => o.value === value))

	let open = $state(false)
	let query = $state('')
	let active = $state(-1)
	let pos = $state({ left: 0, top: 0, bottom: 0, up: false, width: 0, height: 320 })
	let trigger = $state<HTMLButtonElement>()
	let pop = $state<HTMLDivElement>()
	let input = $state<HTMLInputElement>()
	let list = $state<HTMLUListElement>()

	const shown = $derived(filterOptions(options, query))
	// headings only make sense in the original order, so they go while a search is ranked
	const headed = $derived(!query.trim() && options.some((o) => o.group))

	// type-ahead without a search box: letters typed within half a second build one prefix
	let typed = ''
	let typedAt = 0

	function place() {
		if (!trigger || !pop) return
		const r = trigger.getBoundingClientRect()
		const below = innerHeight - r.bottom - 12
		const above = r.top - 12
		const up = below < 240 && above > below
		const height = Math.max(120, Math.min(320, up ? above : below))
		const width = Math.min(Math.max(r.width, 180), innerWidth - 16)
		pos = { left: r.left, top: r.bottom + 4, bottom: innerHeight - r.top + 4, up, width, height }
		// keep the whole list on screen once its real width is known
		const w = pop.offsetWidth || width
		pos.left = Math.max(8, Math.min(r.left, innerWidth - w - 8))
	}

	function reveal(block: ScrollLogicalPosition = 'nearest') {
		list?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block })
	}

	async function show(first = '') {
		if (disabled || open) return
		open = true
		query = searchable ? first : ''
		active = shown.findIndex((o) => o.value === value)
		if (active < 0 || query) active = moveActive(shown, -1, 1)
		if (!searchable && first) jump(first)
		await tick()
		pop?.showPopover?.()
		place()
		// again once the list has its real width, to keep it on screen
		await tick()
		place()
		;(searchable ? input : list)?.focus({ preventScroll: true })
		// the current choice opens in the middle, with its neighbours on both sides
		reveal('center')
	}

	function hide(refocus = true) {
		if (!open) return
		open = false
		query = ''
		typed = ''
		pop?.hidePopover?.()
		if (refocus) trigger?.focus()
	}

	function choose(o: SelectOption<V> | undefined) {
		if (!o || o.disabled) return
		const changed = o.value !== value
		value = o.value
		hide()
		if (changed) onchange?.(o.value)
	}

	function jump(key: string) {
		const now = Date.now()
		typed = now - typedAt < 500 ? typed + key : key
		typedAt = now
		active = typeahead(shown, active, typed)
		reveal()
	}

	function step(n: number) {
		active = moveActive(shown, active, n)
		reveal()
	}

	function onTriggerKey(e: KeyboardEvent) {
		if (e.metaKey || e.ctrlKey || e.altKey) return
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault()
			show()
		} else if (e.key.length === 1 && e.key !== ' ') {
			// typing on the closed dropdown opens it with the search started, like a native select jumps
			e.preventDefault()
			e.stopPropagation()
			show(e.key)
		}
	}

	function onListKey(e: KeyboardEvent) {
		if (e.metaKey || e.ctrlKey) return
		// keys belong to the dropdown while it's open: Escape must not also close a parent popover
		e.stopPropagation()
		const k = e.key
		if (k === 'ArrowDown' || k === 'ArrowUp') step(k === 'ArrowDown' ? 1 : -1)
		else if (k === 'PageDown' || k === 'PageUp') step(k === 'PageDown' ? 8 : -8)
		else if ((k === 'Home' || k === 'End') && !searchable) step(k === 'Home' ? -Infinity : Infinity)
		else if (k === 'Enter' || (k === ' ' && !searchable)) choose(shown[active])
		else if (k === 'Escape') hide()
		else if (k === 'Tab') return hide(false)
		else if (!searchable && k.length === 1) jump(k)
		else return
		e.preventDefault()
	}

	// A click outside closes the list; scrolling or resizing the page moves it with its button.
	$effect(() => {
		if (!open) return
		const outside = (e: PointerEvent) => {
			const t = e.target as Node
			if (!trigger?.contains(t) && !pop?.contains(t)) hide(false)
		}
		const follow = (e: Event) => {
			if (e.target instanceof Node && pop?.contains(e.target)) return
			place()
		}
		addEventListener('pointerdown', outside, true)
		addEventListener('scroll', follow, true)
		addEventListener('resize', follow)
		return () => {
			removeEventListener('pointerdown', outside, true)
			removeEventListener('scroll', follow, true)
			removeEventListener('resize', follow)
		}
	})
</script>

<button
	bind:this={trigger}
	type="button"
	class="input select {cls}"
	class:open
	class:empty={!selected}
	{disabled}
	aria-haspopup="listbox"
	aria-expanded={open}
	aria-controls="{id}-list"
	aria-label="{label}: {selected?.label ?? placeholder}"
	onclick={() => (open ? hide() : show())}
	onkeydown={onTriggerKey}
>
	<span class="value">{selected?.label ?? placeholder}</span>
	<ChevronDown size={13} class="chev" aria-hidden="true" />
</button>

<!-- clicks are cancelled so a <label> around the dropdown doesn't hand them back to the button -->
<div
	bind:this={pop}
	popover="manual"
	class="menu"
	class:up={pos.up}
	style:left="{pos.left}px"
	style:top={pos.up ? 'auto' : `${pos.top}px`}
	style:bottom={pos.up ? `${pos.bottom}px` : 'auto'}
	style:min-width="{pos.width}px"
	style:max-height="{pos.height}px"
	onkeydown={onListKey}
	onclick={(e) => e.preventDefault()}
	role="presentation"
>
	{#if open}
		{#if searchable}
			<div class="search">
				<Search size={13} aria-hidden="true" />
				<input
					bind:this={input}
					value={query}
					oninput={(e) => {
						query = e.currentTarget.value
						// a new search starts again at the best match
						active = moveActive(filterOptions(options, query), -1, 1)
					}}
					role="combobox"
					aria-label="Search {label}"
					aria-expanded="true"
					aria-controls="{id}-list"
					aria-autocomplete="list"
					aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined}
					autocomplete="off"
					spellcheck="false"
					placeholder="Search"
				/>
			</div>
		{/if}
		<ul
			bind:this={list}
			id="{id}-list"
			role="listbox"
			aria-label={label}
			tabindex={searchable ? -1 : 0}
			aria-activedescendant={!searchable && active >= 0 ? `${id}-${active}` : undefined}
			class="scroll-thin"
		>
			{#each shown as o, i (o.value)}
				{#if headed && o.group && o.group !== shown[i - 1]?.group}
					<li class="heading" role="presentation">{o.group}</li>
				{/if}
				<!-- svelte-ignore a11y_click_events_have_key_events (the listbox or search box handles keys for every option) -->
				<li
					id="{id}-{i}"
					data-i={i}
					role="option"
					aria-selected={o.value === value}
					aria-disabled={o.disabled || undefined}
					class:active={i === active}
					onpointermove={() => !o.disabled && (active = i)}
					onclick={() => choose(o)}
				>
					<span class="label">{o.label}</span>
					{#if o.value === value}<Check size={13} aria-hidden="true" />{/if}
				</li>
			{:else}
				<li class="none" role="presentation">No matches</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.select {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
		padding: 0 10px 0 12px;
		text-align: left;
		cursor: pointer;
	}
	.select:disabled {
		cursor: default;
		opacity: 0.55;
	}
	.select.open {
		border-color: var(--edge);
		box-shadow: var(--shadow-sm);
	}
	.value {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.empty .value {
		color: var(--text-4);
	}
	.select :global(.chev) {
		flex: none;
		color: var(--text-3);
		filter: none;
		transition: transform var(--dur-fast);
	}
	.select.open :global(.chev) {
		transform: rotate(180deg);
	}

	.menu {
		position: fixed;
		inset: auto;
		margin: 0;
		padding: 0;
		max-width: min(420px, calc(100vw - 16px));
		flex-direction: column;
		overflow: hidden;
		color: var(--text);
		background: var(--surface);
		border: 1.5px solid var(--edge);
		border-radius: var(--radius-sm);
		box-shadow: var(--shadow);
	}
	.menu:popover-open {
		display: flex;
	}
	.search {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 10px;
		border-bottom: 1px solid var(--line);
		color: var(--text-3);
		flex: none;
	}
	.search :global(.lucide-icon) {
		filter: none;
	}
	.search input {
		flex: 1;
		min-width: 0;
		height: 36px;
		border: 0;
		outline: none;
		background: none;
		font-size: 13px;
		color: var(--text);
	}
	/* the search row is the field; the page-wide focus ring would box it in twice */
	.search input:focus-visible {
		box-shadow: none;
	}
	.search input::placeholder {
		color: var(--text-4);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 4px;
		overflow-y: auto;
		outline: none;
	}
	li[role='option'] {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 7px 8px;
		border-radius: var(--radius-xs);
		font-size: 13px;
		cursor: pointer;
	}
	li[role='option'] :global(.lucide-icon) {
		flex: none;
		color: var(--miso);
		filter: none;
	}
	.label {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	li.active {
		background: var(--surface-hover);
	}
	li[aria-selected='true'] {
		font-weight: 600;
	}
	li[aria-disabled='true'] {
		color: var(--text-4);
		cursor: default;
	}
	.heading {
		padding: 8px 8px 4px;
		font-size: 10.5px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-3);
	}
	.heading:not(:first-child) {
		margin-top: 4px;
		border-top: 1px solid var(--line);
		padding-top: 10px;
	}
	.none {
		padding: 10px 8px;
		font-size: 13px;
		color: var(--text-3);
	}
</style>
