import type { ImportedSet } from '../imported'
import type { Zone } from '../time'
import type { ImporterInfo } from './info'

/** A request an importer makes. `call` returns the parsed JSON body. */
export interface CallInit {
	method?: 'GET' | 'POST'
	headers?: Record<string, string>
	/** sent as JSON */
	json?: unknown
	/** sent as application/x-www-form-urlencoded */
	form?: Record<string, string>
}
export type ApiCall = (url: string, init?: CallInit) => Promise<unknown>

/** A refusal the person can act on, such as a wrong key. The import fails with this message. */
export class ImportError extends Error {}

/** The tool asked to slow down or is down for now: the job tries again after `ms`. */
export class RetryLater extends Error {
	constructor(
		readonly ms: number,
		message: string,
	) {
		super(message)
	}
}

/**
 * Reads one tool's history a local day at a time. An import job calls `open` at the start
 * of each run, then `day` for each day from the newest back, and stores what `day` adds
 * to the set: whole days only, so a run can stop between any two.
 */
export interface Importer<S = unknown> extends ImporterInfo {
	/** at most `calls` requests in any `ms`, as the tool documents */
	rate?: { calls: number; ms: number }
	/**
	 * Checks the form's fields and signs in. Returns what `day` needs, a label for the
	 * import, and the first day the tool has data for, when it says.
	 */
	open(input: Record<string, string>, call: ApiCall, zone: Zone): Promise<{ state: S; label: string; first?: string }>
	/** Adds one local day, `YYYY-MM-DD` in `zone`, to `set`. */
	day(state: S, day: string, zone: Zone, call: ApiCall, set: ImportedSet): Promise<void>
}
