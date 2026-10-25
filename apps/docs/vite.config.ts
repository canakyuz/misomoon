import adapter from '@sveltejs/adapter-cloudflare'
import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite-plus'

export default defineConfig({
	plugins: [
		sveltekit({
			// each page renders in the Worker from docs/ (src/hooks.server.ts caches it);
			// src/lib/server/docs.test.ts fails on a link to a page or heading that doesn't exist
			adapter: adapter(),
			output: { bundleStrategy: 'single' },
		}),
	],
	server: { port: 5175, strictPort: true },
	// a failing coverage test prints the whole list of what the docs miss
	test: { chaiConfig: { truncateThreshold: 0 } },
})
