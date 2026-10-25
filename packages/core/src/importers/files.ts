import { addCsvExport, type ImportedSet } from '../imported'
import type { Zone } from '../time'
import { addGoatCounterCsv, addGoatCounterJson, isGoatCounterCsv, isGoatCounterJson } from './goatcounter'

/**
 * Adds uploaded files: misomoon's CSV format (imported_*.csv), or another tool's own
 * export, told apart by what the files hold. Returns the rows read; a file of a known
 * export that misomoon can't read throws with the reason.
 */
export function addExportFiles(set: ImportedSet, files: { name: string; text: string }[], zone: Zone): number {
	if (isGoatCounterJson(files)) return addGoatCounterJson(set, files, zone)
	let rows = 0
	for (const f of files) rows += isGoatCounterCsv(f.text) ? addGoatCounterCsv(set, f.text, zone) : addCsvExport(set, f.name, f.text)
	return rows
}
