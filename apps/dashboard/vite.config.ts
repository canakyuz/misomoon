import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite-plus'

// `vp dev` serves the dashboard with HMR and proxies the API to `wrangler dev`.
const api = process.env.API_URL ?? 'http://localhost:8787'

export default defineConfig({
	plugins: [svelte()],
	server: {
		proxy: {
			'/api': { target: api, changeOrigin: true },
			'/mcp': { target: api, changeOrigin: true },
			'/m.js': { target: api, changeOrigin: true },
		},
	},
	build: { target: 'es2022', sourcemap: true },
})
