import type { LayoutServerLoad } from './$types'
import { worker } from '#lib/server/platform.ts'
import { ALTERNATIVES } from '#lib/alternatives.ts'

const env = (platform: App.Platform | undefined, name: 'PUBLIC_APP_URL' | 'PUBLIC_DOCS_URL') => (worker(platform).env[name] ?? process.env[name] ?? '').replace(/\/$/, '')

export const load: LayoutServerLoad = ({ platform }) => ({
	appUrl: env(platform, 'PUBLIC_APP_URL') || 'http://localhost:8787',
	// unset: the docs links open the Markdown on GitHub
	docsUrl: env(platform, 'PUBLIC_DOCS_URL') || null,
	// the footer's comparison links; the rest of the data stays on the server
	compare: ALTERNATIVES.slice(0, 5).map((a) => ({ slug: a.slug, short: a.short })),
})
