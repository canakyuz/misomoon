import type { Row } from './api'

/** Adds a page of rows, skipping keys already shown (a page boundary can move while data arrives). */
export function appendRows(rows: Row[], more: Row[]): Row[] {
	const seen = new Set(rows.map((r) => r.key))
	return [...rows, ...more.filter((r) => !seen.has(r.key))]
}

/** A stable sort on one column; rows without a value go last in either direction. */
export function sortRows(rows: Row[], key: keyof Row, dir: 1 | -1): Row[] {
	return [...rows].sort((a, b) => {
		const x = a[key] as number | undefined | null
		const y = b[key] as number | undefined | null
		if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1
		return x === y ? 0 : x > y ? dir : -dir
	})
}
