<script lang="ts">
	import Calendar from '@lucide/svelte/icons/calendar'
	import ChevronDown from '@lucide/svelte/icons/chevron-down'
	import ChevronLeft from '@lucide/svelte/icons/chevron-left'
	import ChevronRight from '@lucide/svelte/icons/chevron-right'
	import { tick } from 'svelte'
	import { getDash, PERIODS } from '../lib/dash.svelte'
	import { validRange } from '../lib/url'

	const dash = getDash()
	let open = $state(false)
	/** the range being picked, as YYYY-MM-DD; `end` is empty until the second click */
	let start = $state('')
	let end = $state('')
	let hover = $state('')
	/** the first of the two months on screen, as YYYY-MM */
	let month = $state('')
	let grid = $state<HTMLElement>()

	const DAY = 86_400_000
	const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
	const ms = (d: string) => Date.parse(`${d}T00:00:00Z`)
	const ymd = (t: number) => new Date(t).toISOString().slice(0, 10)
	const addDays = (d: string, n: number) => ymd(ms(d) + n * DAY)
	const addMonths = (m: string, n: number) => {
		const [y, mo] = m.split('-').map(Number)
		const t = new Date(Date.UTC(y, mo - 1 + n, 1))
		return t.toISOString().slice(0, 7)
	}
	// days start and end in the site's timezone, so "today" is the site's today
	const today = $derived(new Intl.DateTimeFormat('en-CA', { timeZone: dash.current?.timezone ?? 'UTC' }).format(new Date()))
	const months = $derived(month ? [month, addMonths(month, 1)] : [])

	/** the days of a month, padded to start on Monday */
	function days(m: string): (string | null)[] {
		const first = ms(`${m}-01`)
		const pad = (new Date(first).getUTCDay() + 6) % 7
		const count = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate()
		return [...Array<null>(pad).fill(null), ...Array.from({ length: count }, (_, i) => ymd(first + i * DAY))]
	}

	const sameYear = (a: string, b: string) => a.slice(0, 4) === b.slice(0, 4)
	const fmt = (d: string, year: boolean) =>
		new Date(ms(d)).toLocaleDateString('en', { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' })
	const monthName = (m: string) => new Date(ms(`${m}-01`)).toLocaleDateString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' })
	/** "Oct 3 – Oct 24", with the years when the range isn't all in this year */
	const span = (a: string, b: string) => {
		const year = !sameYear(a, b) || !sameYear(a, today)
		return a === b ? fmt(a, year) : `${fmt(a, year)} – ${fmt(b, year)}`
	}

	// what the numbers are compared with lives in the same menu, since it is a period too
	const COMPARE = [
		{ key: 'off', label: 'Off', short: '' },
		{ key: 'previous', label: 'Previous period', short: 'vs previous' },
		{ key: 'year', label: 'Last year', short: 'vs last year' },
	] as const
	const compareKey = $derived(dash.compare ? dash.compareTo : 'off')
	function compareWith(key: (typeof COMPARE)[number]['key']) {
		dash.compare = key !== 'off'
		if (key !== 'off') dash.compareTo = key
	}

	const label = $derived(
		dash.period === 'custom' && dash.from && dash.to ? span(dash.from, dash.to) : (PERIODS.find((p) => p.key === dash.period)?.label ?? dash.period),
	)

	// the range as it stands: both ends picked, or the first end and the day under the pointer
	const lo = $derived(start && (end || hover) ? ((end || hover) < start ? end || hover : start) : start)
	const hi = $derived(start && (end || hover) ? ((end || hover) < start ? start : end || hover) : start)
	const length = $derived(lo && hi ? (ms(hi) - ms(lo)) / DAY + 1 : 0)
	const rangeOk = $derived(!!start && !!end && validRange(lo, hi))

	function show() {
		if (dash.period === 'custom' && dash.from && dash.to) {
			start = dash.from
			end = dash.to
		} else {
			start = end = ''
		}
		hover = ''
		// the last month on screen is the range's end month, or this month
		month = addMonths((end || today).slice(0, 7), -1)
		open = true
	}

	function toggle() {
		if (open) open = false
		else show()
	}

	function pick(key: string) {
		dash.setPeriod(key)
		open = false
	}

	function choose(d: string) {
		if (!start || end) {
			start = d
			end = ''
		} else {
			end = d
		}
		hover = ''
	}

	function apply() {
		if (!rangeOk) return
		dash.setPeriod('custom', lo, hi)
		open = false
	}

	// arrow keys move a day or a week, and the months follow
	async function onGridKey(e: KeyboardEvent) {
		const from = (e.target as HTMLElement).dataset.day
		const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key]
		if (!from || !step) return
		e.preventDefault()
		let next = addDays(from, step)
		if (next > today) next = today
		if (next.slice(0, 7) < month) month = addMonths(month, -1)
		else if (next.slice(0, 7) > addMonths(month, 1)) month = addMonths(month, 1)
		if (start && !end) hover = next
		await tick()
		grid?.querySelector<HTMLElement>(`[data-day="${next}"]`)?.focus()
	}

	function onkey(e: KeyboardEvent) {
		const t = e.target as HTMLElement
		if (e.key === 'Escape' && open) {
			open = false
			return
		}
		if (e.metaKey || e.ctrlKey || e.altKey || t.closest('input, textarea, select, [contenteditable]')) return
		const p = PERIODS.find((p) => p.hotkey === e.key)
		if (p) pick(p.key)
	}
</script>

<svelte:window onkeydown={onkey} />

<div class="picker">
	<button class="btn" onclick={toggle} aria-expanded={open} aria-haspopup="dialog">
		<Calendar size={14} />
		<span>{label}</span>
		{#if compareKey !== 'off'}<span class="vs">{COMPARE.find((c) => c.key === compareKey)?.short}</span>{/if}
		<ChevronDown size={14} />
	</button>
	{#if open}
		<div class="scrim" role="presentation" onclick={() => (open = false)}></div>
		<div class="pop card" role="dialog" aria-label="Pick a period">
			<div class="presets" role="menu" aria-label="Periods">
				{#each PERIODS as p (p.key)}
					<button role="menuitemradio" aria-checked={dash.period === p.key} class:on={dash.period === p.key} onclick={() => pick(p.key)}>
						<span>{p.label}</span>
						<kbd class="kbd">{p.hotkey.toUpperCase()}</kbd>
					</button>
				{/each}
				<p class="compare-label" id="compare-label">Compare with</p>
				<div class="compare" role="radiogroup" aria-labelledby="compare-label">
					{#each COMPARE as c (c.key)}
						<button role="radio" aria-checked={c.key === compareKey} class:on={c.key === compareKey} onclick={() => compareWith(c.key)}>{c.label}</button>
					{/each}
				</div>
			</div>
			<div class="range">
				<div class="nav">
					<button class="btn icon" onclick={() => (month = addMonths(month, -1))} aria-label="Previous month"><ChevronLeft size={14} /></button>
					<div class="titles">
						{#each months as m (m)}<span>{monthName(m)}</span>{/each}
					</div>
					<button class="btn icon" onclick={() => (month = addMonths(month, 1))} disabled={addMonths(month, 1) >= today.slice(0, 7)} aria-label="Next month">
						<ChevronRight size={14} />
					</button>
				</div>
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="months" bind:this={grid} onkeydown={onGridKey} onpointerleave={() => (hover = '')}>
					{#each months as m, mi (m)}
						<div class="month" class:first={mi === 0}>
							<div class="days" role="grid" aria-label={monthName(m)}>
								{#each WEEKDAYS as w (w)}<span class="wd" aria-hidden="true">{w}</span>{/each}
								{#each days(m) as d, i (d ?? `pad-${i}`)}
									{#if d}
										<button
											class="day"
											class:today={d === today}
											class:edge={d === lo || d === hi}
											class:start={d === lo && hi !== lo}
											class:end={d === hi && hi !== lo}
											class:in={!!lo && !!hi && d > lo && d < hi}
											disabled={d > today}
											data-day={d}
											tabindex={d === (end || start || today) ? 0 : -1}
											aria-pressed={d === lo || d === hi}
											aria-label={new Date(ms(d)).toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}
											onclick={() => choose(d)}
											onpointerenter={() => start && !end && (hover = d)}>{+d.slice(8)}</button
										>
									{:else}
										<span></span>
									{/if}
								{/each}
							</div>
						</div>
					{/each}
				</div>
				<div class="foot">
					<p class="summary" aria-live="polite">
						<span>
							{#if !start}
								<span class="muted">Pick the first day, then the last.</span>
							{:else if !end && !hover}
								<b>{span(start, start)}</b> <span class="muted">to …</span>
							{:else}
								<b>{span(lo, hi)}</b> <span class="muted">· {length} {length === 1 ? 'day' : 'days'}</span>
							{/if}
						</span>
						{#if start && (end || hover) && !validRange(lo, hi)}<span class="warn">A custom range can cover at most 400 days.</span>{/if}
					</p>
					<div class="acts">
						{#if start}<button class="btn" onclick={() => ((start = end = hover = ''), grid?.querySelector<HTMLElement>('[tabindex="0"]')?.focus())}>Clear</button>{/if}
						<button class="btn primary" onclick={apply} disabled={!rangeOk}>Apply</button>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.picker {
		position: relative;
	}
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 29;
	}
	/* the picker sits at the header's right end, so the calendar opens leftward from it */
	.pop {
		position: absolute;
		right: 0;
		top: calc(100% + 6px);
		display: grid;
		grid-template-columns: 188px auto;
		width: max-content;
		max-width: calc(100vw - 24px);
		z-index: 30;
		box-shadow: var(--shadow-lg);
		text-align: left;
		animation: drop var(--dur) var(--ease-out);
	}
	@keyframes drop {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
	}
	.presets {
		display: flex;
		flex-direction: column;
		padding: 6px;
		border-right: 1px solid var(--line);
	}
	.presets > button {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		height: 30px;
		padding: 0 10px;
		border-radius: var(--radius-sm);
		font-size: 13px;
	}
	.presets > button:hover {
		background: var(--surface-hover);
	}
	.presets > button.on {
		background: var(--miso-soft);
		color: var(--miso);
	}
	.vs {
		font-weight: 500;
		color: var(--text-3);
	}
	.compare-label {
		margin: 8px 0 4px;
		padding: 8px 10px 0;
		border-top: 1px solid var(--line);
		font-family: var(--font-mono);
		font-size: 9.5px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-4);
	}
	.compare {
		display: flex;
		flex-direction: column;
	}
	.compare > button {
		display: flex;
		align-items: center;
		height: 30px;
		padding: 0 10px;
		border-radius: var(--radius-sm);
		font-size: 13px;
		text-align: left;
	}
	.compare > button:hover {
		background: var(--surface-hover);
	}
	.compare > button.on {
		background: var(--miso-soft);
		color: var(--miso);
	}
	.range {
		display: flex;
		flex-direction: column;
		padding: 12px 14px;
		gap: 10px;
	}
	.nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.titles {
		display: grid;
		grid-template-columns: 1fr 1fr;
		flex: 1;
		gap: 24px;
		font-size: 13px;
		font-weight: 600;
		text-align: center;
	}
	.months {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 24px;
	}
	.days {
		display: grid;
		grid-template-columns: repeat(7, 34px);
		grid-auto-rows: 32px;
		row-gap: 2px;
	}
	.wd {
		display: grid;
		place-items: center;
		color: var(--text-3);
		font-size: 11px;
	}
	.day {
		position: relative;
		font-size: 12.5px;
		font-variant-numeric: tabular-nums;
		border-radius: var(--radius-sm);
	}
	.day:hover:not(:disabled):not(.edge) {
		background: var(--surface-hover);
	}
	.day:disabled {
		color: var(--text-3);
		opacity: 0.45;
		cursor: default;
	}
	.day.today {
		font-weight: 700;
		text-decoration: underline;
		text-decoration-color: var(--miso);
		text-decoration-thickness: 2px;
		text-underline-offset: 4px;
	}
	.day.in {
		border-radius: 0;
		background: var(--miso-soft);
	}
	.day.start {
		border-radius: var(--radius-sm) 0 0 var(--radius-sm);
	}
	.day.end {
		border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
	}
	.day.edge {
		background: var(--miso);
		color: var(--on-vermilion);
		font-weight: 700;
	}
	.day:focus-visible {
		z-index: 1;
	}
	.foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding-top: 10px;
		border-top: 1px solid var(--line);
	}
	.summary {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin: 0;
		font-size: 12.5px;
	}
	.warn {
		color: var(--bad);
		font-size: 12px;
	}
	.acts {
		display: flex;
		gap: 6px;
	}
	/* a phone gets the presets above one month, pinned under the header */
	@media (max-width: 720px) {
		.pop {
			position: fixed;
			left: 12px;
			right: 12px;
			top: 72px;
			grid-template-columns: 1fr;
			width: auto;
			max-height: calc(100dvh - 96px);
			overflow: auto;
			transform: none;
			animation-name: drop-fixed;
		}
		@keyframes drop-fixed {
			from {
				opacity: 0;
				transform: translateY(-4px);
			}
		}
		.presets {
			flex-direction: row;
			flex-wrap: wrap;
			gap: 4px;
			border-right: 0;
			border-bottom: 1px solid var(--line);
		}
		.presets > button {
			width: auto;
			border: 1px solid var(--line);
		}
		.presets .kbd {
			display: none;
		}
		.compare-label {
			flex-basis: 100%;
			margin: 4px 0 0;
		}
		.compare {
			flex-direction: row;
			flex-wrap: wrap;
			gap: 4px;
		}
		.compare > button {
			border: 1px solid var(--line);
		}
		/* the button keeps to the period on a phone; the menu shows the comparison */
		.vs {
			display: none;
		}
		/* one month: the later of the two, so it ends at this month */
		.titles span:first-child,
		.month.first {
			display: none;
		}
		.months,
		.titles {
			grid-template-columns: 1fr;
		}
		.days {
			grid-template-columns: repeat(7, 1fr);
		}
	}
</style>
