// The landing is reissued every UTC day. Everything here is computed from the date,
// so the server and the browser print the same edition.

const DAY = 86_400_000
const SYNODIC = 29.530588853
// A reference new moon: 6 Jan 2000, 18:14 UTC.
const NEW_MOON = Date.UTC(2000, 0, 6, 18, 14)
// No. 1 went to press on 1 Oct 2026.
const FIRST_ISSUE = Date.UTC(2026, 9, 1)

const NAMES = [
	'new moon',
	'waxing crescent',
	'first quarter',
	'waxing gibbous',
	'full moon',
	'waning gibbous',
	'last quarter',
	'waning crescent',
] as const

export interface Edition {
	/** issue number, 1 on launch day */
	no: number
	/** start of the UTC day this edition covers */
	day: number
	moon: {
		/** days since the last new moon */
		age: number
		/** 0 new, 0.5 full, 1 new again */
		fraction: number
		/** share of the disc that is lit, 0..1 */
		lit: number
		name: (typeof NAMES)[number]
		/** for <Moon>: -1 new, 0 full, 1 new; waxing lights the right-hand side */
		phase: number
		next_full: number
	}
}

export function edition(now: number): Edition {
	const day = Math.floor(now / DAY) * DAY
	// the moon as it stands at 21:00 UTC, when most of the world is looking up
	const t = day + 21 * 3_600_000
	const age = ((((t - NEW_MOON) / DAY) % SYNODIC) + SYNODIC) % SYNODIC
	const fraction = age / SYNODIC
	const lit = (1 - Math.cos(2 * Math.PI * fraction)) / 2
	const name = NAMES[Math.round(fraction * 8) % 8]
	const toFull = (((SYNODIC / 2 - age) % SYNODIC) + SYNODIC) % SYNODIC
	return {
		no: Math.max(1, Math.floor((day - FIRST_ISSUE) / DAY) + 1),
		day,
		moon: { age, fraction, lit, name, phase: (0.5 - fraction) * 2, next_full: t + toFull * DAY },
	}
}

/** Time left until the next edition goes to press at midnight UTC, as HH:MM:SS; placeholders until the time is known. */
export function untilPress(now: number | null): string {
	if (now == null) return '--:--:--'
	const left = Math.floor(now / DAY) * DAY + DAY - now
	const p = (n: number) => String(Math.floor(n)).padStart(2, '0')
	return `${p(left / 3_600_000)}:${p((left / 60_000) % 60)}:${p((left / 1000) % 60)}`
}
