// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"handleDisabledFileLoadingAsSuccess":true}}
import { act, createElement, StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { Misomoon, useMisomoon } from '../src/react'
import { MisomoonProvider, useMisomoon as useNative, useNavigationTracking, useScreen, type NavigationRefLike, type NativeClient } from '../src/react-native'
import { native } from './fake-react-native'
import { fakeFetch } from './helpers'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

async function render(node: ReactNode) {
	const el = document.createElement('div')
	const root = createRoot(el)
	await act(async () => root.render(createElement(StrictMode, null, node)))
	return () => act(async () => root.unmount())
}

beforeEach(() => {
	native.reset()
	document.head.innerHTML = ''
	delete (window as { misomoon?: unknown }).misomoon
	vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('<Misomoon>', () => {
	it('adds the tracker once under StrictMode', async () => {
		await render(createElement(Misomoon, { site: 'shop-com', host: 'https://a.test', manual: true }))
		const scripts = document.head.querySelectorAll('script[data-misomoon-sdk]')
		expect(scripts).toHaveLength(1)
		expect([scripts[0].getAttribute('src'), scripts[0].getAttribute('data-manual')]).toEqual(['https://a.test/m.js?s=shop-com', ''])
	})

	it('renders nothing on the server', () => {
		expect(renderToString(createElement(Misomoon, { site: 'shop-com', host: 'https://a.test' }))).toBe('')
	})

	it('gives the same functions on every render', async () => {
		const seen: unknown[] = []
		function Button() {
			seen.push(useMisomoon().track)
			return null
		}
		await render(createElement(Button))
		expect(seen.length).toBeGreaterThan(1)
		expect(new Set(seen).size).toBe(1)
	})
})

describe('<MisomoonProvider>', () => {
	const options = (f: ReturnType<typeof fakeFetch>) => ({ site: 'recipes-app', host: 'https://a.test', domain: 'recipes.app', fetch: f.fetch })
	const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))))

	it('counts a screen once under StrictMode and keeps one app state listener', async () => {
		const f = fakeFetch()
		function Home() {
			useScreen('Home')
			return null
		}
		const unmount = await render(createElement(MisomoonProvider, options(f), createElement(Home)))
		await settle()
		expect(f.sent.map((s) => s.body.u)).toEqual(['https://recipes.app/Home'])
		expect(native.listeners.size).toBe(1)
		await unmount()
		expect(native.listeners.size).toBe(0)
	})

	it('follows React Navigation routes from the first one', async () => {
		const f = fakeFetch()
		let route = 'Home'
		const ref: NavigationRefLike = { getCurrentRoute: () => ({ name: route }) }
		const seen: ReturnType<typeof useNavigationTracking>[] = []
		function Container() {
			seen.push(useNavigationTracking(ref))
			return null
		}
		await render(createElement(MisomoonProvider, options(f), createElement(Container)))
		const { onReady, onStateChange } = seen[seen.length - 1]
		onReady()
		route = 'Recipe'
		onStateChange()
		onStateChange()
		await settle()
		expect(f.sent.filter((s) => s.body.n === 'pageview').map((s) => s.body.u)).toEqual(['https://recipes.app/Home', 'https://recipes.app/Recipe'])
		expect(new Set(seen.map((h) => h.onStateChange)).size).toBe(1)
	})

	it('gives the client to hooks, and says so when the provider is missing', async () => {
		const f = fakeFetch()
		let client: NativeClient | null = null
		function Grab() {
			client = useNative()
			return null
		}
		await render(createElement(MisomoonProvider, options(f), createElement(Grab)))
		expect(typeof client!.track).toBe('function')
		vi.spyOn(console, 'error').mockImplementation(() => {})
		await expect(render(createElement(Grab))).rejects.toThrow('useMisomoon must be used inside <MisomoonProvider>')
	})
})
