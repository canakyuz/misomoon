import { addCsvExport, type ImportedSet } from '../imported'
import type { Zone } from '../time'
import { addGoatCounterCsv, addGoatCounterJson, isGoatCounterCsv, isGoatCounterJson } from './goatcounter'
import { isMixpanelJsonl, mixpanelHits } from './mixpanel'
import { addRawHits, RAW_MAX, type RawHit } from './raw'
import { isSimpleAnalyticsCsv, simpleAnalyticsHits } from './simpleanalytics'

/** Raw event exports, whose files are counted together so a visit can span them */
const RAW: { is: (text: string) => boolean; hits: (text: string) => RawHit[] }[] = [
	{ is: isMixpanelJsonl, hits: mixpanelHits },
	{ is: isSimpleAnalyticsCsv, hits: simpleAnalyticsHits },
]

/**
 * Adds uploaded files: misomoon's CSV format (imported_*.csv), or another tool's own
 * export, told apart by what the files hold. Returns the rows read; a file of a known
 * export that misomoon can't read throws with the reason.
 */
export function addExportFiles(set: ImportedSet, files: { name: string; text: string }[], zone: Zone): number {
	if (isGoatCounterJson(files)) return addGoatCounterJson(set, files, zone)
	let rows = 0
	const hits: RawHit[] = []
	let size = 0
	for (const f of files) {
		const raw = RAW.find((r) => r.is(f.text))
		if (raw) {
			size += f.text.length
			if (size > RAW_MAX) throw new Error(`these raw event exports are larger than ${RAW_MAX / 1_000_000} MB unzipped; upload fewer days at a time`)
			hits.push(...raw.hits(f.text))
		} else rows += isGoatCounterCsv(f.text) ? addGoatCounterCsv(set, f.text, zone) : addCsvExport(set, f.name, f.text)
	}
	return rows + (hits.length ? addRawHits(set, hits, zone) : 0)
}
