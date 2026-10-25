/** One heading of a docs page, as /search.json lists it. */
export interface Entry {
	slug: string
	page: string
	section: string
	heading: string
	id: string
	text: string
}

/** Every word must appear somewhere in the entry; titles and headings weigh more than text. */
export function rank(index: Entry[], query: string): Entry[] {
	const words = query.toLowerCase().split(/\s+/).filter(Boolean)
	if (!words.length) return []
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
}

/** The passage of `text` around the first query word it contains. */
export function snippet(text: string, query: string): string {
	const w = query.toLowerCase().split(/\s+/).filter(Boolean).find((x) => text.toLowerCase().includes(x))
	if (!w) return text.slice(0, 120)
	const i = text.toLowerCase().indexOf(w)
	const start = Math.max(0, i - 40)
	return (start ? '…' : '') + text.slice(start, start + 140) + (start + 140 < text.length ? '…' : '')
}
