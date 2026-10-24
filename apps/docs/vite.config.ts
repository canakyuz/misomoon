import adapter from '@sveltejs/adapter-static'
import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite-plus'

export default defineConfig({
	plugins: [
		sveltekit({
			// every page is prerendered from docs/; the Worker only serves files
			adapter: adapter({ pages: 'build', strict: true }),
			// a link to a page or a heading that doesn't exist fails the build
			prerender: { entries: ['*', '/404'], handleHttpError: 'fail', handleMissingId: 'fail' },
			// the canonical and structured-data URLs are built from page.url.origin
			paths: { origin: 'https://docs.misomoon.com' },
			output: { bundleStrategy: 'single' },
		}),
	],
	server: { port: 5175, strictPort: true },
	// a failing coverage test prints the whole list of what the docs miss
	test: { chaiConfig: { truncateThreshold: 0 } },
})
