'use client'
// React and Next.js. <Misomoon> adds m.js once on mount; m.js follows client-side routing
// by itself (history.pushState), so the App Router and React Router need nothing else.

import { useEffect } from 'react'
import { init, pageview, ref, track, type EventMap, type MisomoonApi as Api, type WebOptions } from './web.js'

export { ignore, ignored, init, pageview, ref, track, typed, VERSION, type EventMap, type EventOptions, type MisomoonApi, type PageviewOptions, type Props, type Revenue, type TrackOptions, type TypedTrackOptions, type WebOptions } from './web.js'

/** Renders nothing. Put it once in your root layout. */
export function Misomoon(props: WebOptions): null {
	// options are read once, like a script tag; StrictMode's second run finds the script and stops
	useEffect(() => init(props), [])
	return null
}

// a plain object, not a call, so a bundle with only <Misomoon> leaves track() and ref() out
const api = { track, pageview, ref } as Api

/**
 * `const { track, ref } = useMisomoon()`. The functions are stable across renders.
 * Pass your events to type them: `useMisomoon<{ Signup: { plan: string } }>()`.
 */
export function useMisomoon<E extends EventMap = EventMap>(): Api<E> {
	return api as Api<E>
}
