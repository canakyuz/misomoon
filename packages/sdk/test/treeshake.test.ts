// What an app's bundler keeps from each entry point. Every import below goes through
// esbuild as an app build would, so code that runs at module load, or a helper that one
// function drags into another's bundle, shows up here before it ships.
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { build } from 'esbuild'
import { describe, expect, it } from 'vite-plus/test'

const src = (file: string) => new URL(`../src/${file}`, import.meta.url).pathname

/** The bundle of `code`, readable (names kept) or minified. */
async function bundle(code: string, minify = false): Promise<string> {
	const out = await build({
		stdin: { contents: code, resolveDir: new URL('.', import.meta.url).pathname, loader: 'ts' },
		bundle: true,
		write: false,
		format: 'esm',
		platform: 'neutral',
		target: 'es2020',
		minify,
		external: ['react', 'react-native'],
		logLevel: 'silent',
	})
	return out.outputFiles[0].text
}

const gzip = async (code: string) => gzipSync(await bundle(code, true), { level: 9 }).length

describe('each entry point', () => {
	it('adds nothing to an app that imports it and uses nothing', async () => {
		const all = ['index', 'web', 'react', 'react-native', 'node', 'next'].map((f) => `import '${src(`${f}.ts`)}'`).join('\n')
		expect((await bundle(all)).trim()).toBe('')
	})

	it.each([
		['<Misomoon> without the track() checks', `import { Misomoon } from '${src('react.ts')}'; console.log(Misomoon)`, ['must be 1 to 120 characters', 'misomoon_ignore']],
		['track() without init()', `import { track } from '${src('web.ts')}'; track('x')`, ['data-misomoon-sdk', 'misomoon_ignore']],
		['init() without track()', `import { init } from '${src('web.ts')}'; init({ site: 's', host: 'h' })`, ['must be 1 to 120 characters']],
		['a request helper without the client', `import { visitorFromRequest } from '${src('node.ts')}'; console.log(visitorFromRequest)`, ['TextEncoder', '/api/event']],
		['a link helper without the React context', `import { campaignQuery } from '${src('react-native.ts')}'; console.log(campaignQuery)`, ['createContext(', '/api/event']],
		['newRef() without the transport', `import { newRef } from '${src('index.ts')}'; console.log(newRef())`, ['fetch', '/api/event']],
		['withMisomoon() alone', `import { withMisomoon } from '${src('next.ts')}'; console.log(withMisomoon)`, ['/api/event"', 'createClient']],
	])('%s', async (_, code, absent) => {
		const out = await bundle(code)
		expect(absent.filter((s) => out.includes(s))).toEqual([])
	})
})

describe('browser bundles stay small', () => {
	// gzipped bytes an app ships for these, with a little room; raise them only on purpose
	it.each([
		['track()', `import { track } from '${src('web.ts')}'; track('x')`, 650],
		['init() and track()', `import { init, track } from '${src('web.ts')}'; init({ site: 's', host: 'h' }); track('x')`, 1300],
		['<Misomoon>', `import { Misomoon } from '${src('react.ts')}'; console.log(Misomoon)`, 950],
		['<Misomoon> and useMisomoon()', `import { Misomoon, useMisomoon } from '${src('react.ts')}'; console.log(Misomoon, useMisomoon)`, 1450],
	])('%s', async (_, code, budget) => {
		expect(await gzip(code)).toBeLessThanOrEqual(budget)
	})
})

it('builds for ES2020 or later, so ?. and ?? reach apps as they are', () => {
	const target = JSON.parse(readFileSync(new URL('../tsconfig.build.json', import.meta.url), 'utf8')).compilerOptions.target as string
	expect(Number(target.replace(/^ES/i, ''))).toBeGreaterThanOrEqual(2020)
})
