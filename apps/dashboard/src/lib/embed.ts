// The landing's fig. 1 shows the demo dashboard in an iframe (/demo?embed): no top bar
// and no view tabs, in the landing's theme, which it posts again when the reader switches.

type Theme = 'light' | 'dark'
const theme = (v: unknown): Theme | null => (v === 'light' || v === 'dark' ? v : null)

/** The embed options when the URL is the demo with `?embed`, else null. */
export function embedFrom(pathname: string, search: string): { theme: Theme | null } | null {
	if (!/^\/demo\/?$/.test(pathname)) return null
	const q = new URLSearchParams(search)
	return q.has('embed') ? { theme: theme(q.get('theme')) } : null
}

/** The theme in a `{ type: 'misomoon:theme', theme }` message from the page around the demo. */
export function themeMessage(data: unknown): Theme | null {
	const d = data as { type?: unknown; theme?: unknown } | null
	return d && typeof d === 'object' && d.type === 'misomoon:theme' ? theme(d.theme) : null
}
