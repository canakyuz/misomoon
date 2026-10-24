import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite-plus'

// react-native can't run under Node, so tests use the stand-in, which mirrors the
// AppState, Dimensions and Platform signatures the SDK calls. Type checks use the real
// package, a devDependency.
export default defineConfig({
	resolve: { alias: { 'react-native': fileURLToPath(new URL('./test/fake-react-native.ts', import.meta.url)) } },
})
