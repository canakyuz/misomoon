// Matching and keyboard movement for <Select>, kept out of the component so it can be tested.

export interface SelectOption<V = string> {
	value: V
	label: string
	/** heading the option sits under while nothing is typed */
	group?: string
	/** more words that find the option, such as a currency's code */
	keywords?: string
	disabled?: boolean
}

/** Lower case without accents, so `sao` finds São Paulo. */
export const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

/**
 * Options with every typed word in their label or keywords. Labels that start with the
 * query come first, then labels where each typed word starts one of their words, then the
 * rest, each in their original order. An empty query keeps every option in order.
 */
export function filterOptions<O extends SelectOption<unknown>>(options: readonly O[], query: string): O[] {
	const q = fold(query).trim()
	if (!q) return [...options]
	const words = q.split(/\s+/)
	const ranked: { o: O; rank: number; i: number }[] = []
	options.forEach((o, i) => {
		const label = fold(o.label)
		const hay = `${label} ${fold(o.keywords ?? '')}`
		if (!words.every((w) => hay.includes(w))) return
		const starts = label.split(/[^\p{L}\p{N}]+/u)
		const rank = label.startsWith(q) ? 0 : words.every((w) => starts.some((s) => s.startsWith(w))) ? 1 : 2
		ranked.push({ o, rank, i })
	})
	return ranked.sort((a, b) => a.rank - b.rank || a.i - b.i).map((r) => r.o)
}

/**
 * The option `step` enabled places from `from`, skipping disabled ones and stopping at
 * the ends. From -1 (nothing active) a step down lands on the first enabled option and a
 * step up on the last. Returns -1 when no option is enabled.
 */
export function moveActive(options: readonly SelectOption<unknown>[], from: number, step: number): number {
	const n = options.length
	const dir = step < 0 ? -1 : 1
	let at = from < 0 || from >= n ? (dir > 0 ? -1 : n) : from
	for (let k = 0; k < Math.abs(step); k++) {
		let j = at + dir
		while (j >= 0 && j < n && options[j].disabled) j += dir
		if (j < 0 || j >= n) break
		at = j
	}
	return at >= 0 && at < n && !options[at].disabled ? at : -1
}

/**
 * Type-ahead: the first enabled option at or after `from` whose label starts with
 * `typed`, wrapping around. The same letter typed again moves on to the next match.
 */
export function typeahead(options: readonly SelectOption<unknown>[], from: number, typed: string): number {
	const t = fold(typed)
	const n = options.length
	if (!t || !n) return from
	const repeat = [...t].every((c) => c === t[0])
	const prefix = repeat ? t[0] : t
	const start = repeat ? from + 1 : Math.max(from, 0)
	for (let k = 0; k < n; k++) {
		const i = (start + k) % n
		if (!options[i].disabled && fold(options[i].label).startsWith(prefix)) return i
	}
	return from
}
