// A controllable stand-in for the parts of react-native the SDK calls. Tests change
// `Platform`, the dimensions and the app state through `native`.

type Listener = (state: string) => void
type UrlListener = (event: { url: string }) => void

const listeners = new Set<Listener>()
const urlListeners = new Set<UrlListener>()

export const native = {
	state: 'active' as string,
	screen: { width: 393, height: 852 },
	window: { width: 393, height: 852 },
	setState(next: string) {
		native.state = next
		for (const l of [...listeners]) l(next)
	},
	listeners,
	/** what Linking.getInitialURL() resolves to; a promise that never settles stands for a slow platform */
	initialURL: Promise.resolve(null) as Promise<string | null>,
	/** a link that opens the app while it runs */
	openURL(url: string) {
		for (const l of [...urlListeners]) l({ url })
	},
	urlListeners,
	reset() {
		native.initialURL = Promise.resolve(null)
		urlListeners.clear()
		native.state = 'active'
		native.screen = { width: 393, height: 852 }
		native.window = { width: 393, height: 852 }
		listeners.clear()
		Object.assign(Platform, { OS: 'ios', Version: '17.4', isPad: false, constants: {} })
	},
}

export const AppState = {
	get currentState() {
		return native.state
	},
	addEventListener(_type: 'change', listener: Listener) {
		listeners.add(listener)
		return { remove: () => void listeners.delete(listener) }
	},
}

export const Dimensions = {
	get(dim: 'window' | 'screen') {
		return dim === 'screen' ? native.screen : native.window
	},
}

export const Platform: { OS: string; Version: string | number; isPad?: boolean; constants?: { Release?: string } } = {
	OS: 'ios',
	Version: '17.4',
	isPad: false,
	constants: {},
}

export const Linking = {
	getInitialURL: () => native.initialURL,
	addEventListener(_type: 'url', listener: UrlListener) {
		urlListeners.add(listener)
		return { remove: () => void urlListeners.delete(listener) }
	},
}
