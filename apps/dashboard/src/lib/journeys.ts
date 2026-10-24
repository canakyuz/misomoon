/**
 * The Paths view's question for each column: column k follows the first k picks. The API
 * wants pages in visit order, and picking backward prepends. `tick` is the dashboard's
 * refresh counter, so Refresh skips the response cache.
 */
export function journeyUrls(params: string, direction: 'forward' | 'backward', picked: string[], tick: number): string[] {
	return Array.from({ length: picked.length + 1 }, (_, k) => {
		const chosen = picked.slice(0, k)
		const q = new URLSearchParams(params)
		q.set('direction', direction)
		if (k) q.set('path', (direction === 'forward' ? chosen : [...chosen].reverse()).join(','))
		q.set('_', String(tick))
		return `/api/v1/stats/journeys?${q}`
	})
}
