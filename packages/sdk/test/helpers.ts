import type { Payload } from '../src/client'

export interface Sent {
	url: string
	headers: Record<string, string>
	body: Payload
}

/**
 * A fetch that records requests and answers from a script: a status, 'network' for a
 * connection error, or 'hang' for a request that never answers. Once the script runs
 * out, every request gets 202.
 */
export function fakeFetch(script: (number | 'network' | 'hang')[] = []) {
	const sent: Sent[] = []
	const attempts: Sent[] = []
	const fn = async (url: string | URL | Request, init?: RequestInit) => {
		const req: Sent = { url: String(url), headers: { ...(init?.headers as Record<string, string>) }, body: JSON.parse(String(init?.body)) }
		attempts.push(req)
		const next = script.shift() ?? 202
		if (next === 'network') throw new TypeError('Network request failed')
		if (next === 'hang') {
			return new Promise<Response>((_, reject) => {
				init?.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')))
			})
		}
		if (next >= 200 && next < 300) sent.push(req)
		return new Response(null, { status: next })
	}
	return { fetch: fn as unknown as typeof fetch, sent, attempts }
}
