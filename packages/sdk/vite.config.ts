import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite-plus'

// react-native isn't installed here: tests and type checks use the stand-in, which
// mirrors the AppState, Dimensions and Platform signatures the SDK calls.
export default defineConfig({
	resolve: { alias: { 'react-native': fileURLToPath(new URL('./test/fake-react-native.ts', import.meta.url)) } },
})
