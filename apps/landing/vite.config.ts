import adapter from '@sveltejs/adapter-cloudflare'
import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite-plus'

export default defineConfig({
	plugins: [
		sveltekit({
			adapter: adapter(),
			// one JS file (and one small CSS file) instead of a dozen modulepreloads
			// competing with the first paint
			output: { bundleStrategy: 'single' },
		}),
	],
	server: { port: 5174, strictPort: true },
})
