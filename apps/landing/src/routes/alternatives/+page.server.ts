import type { PageServerLoad } from './$types'
import { ALTERNATIVES, OURS } from '#lib/alternatives.ts'
import { tally } from '#lib/verdict.ts'

const LABELS = ['What self-hosting needs', 'Where your data lives']
// the day the newest fact on any comparison was read
const CHECKED = ALTERNATIVES.flatMap((a) => [...a.facts, ...a.pickThem].map((f) => f.checked)).sort().at(-1)!

export const load: PageServerLoad = ({ setHeaders }) => {
	setHeaders({ 'cache-control': 'public, max-age=300, stale-while-revalidate=86400' })
	return {
		checked: CHECKED,
		ours: OURS,
		alternatives: ALTERNATIVES.map((a) => ({
			slug: a.slug,
			name: a.name,
			short: a.short,
			kind: a.kind,
			answer: a.answer.split(/(?<=\.)\s/)[0],
			trackerKb: a.trackerKb,
			where: a.facts.find((f) => LABELS.includes(f.label))?.them ?? null,
			score: tally(a),
		})),
	}
}
