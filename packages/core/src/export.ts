/** CSV and ZIP writers for the stats export. */

export function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
	const cell = (v: unknown) => {
		const s = v == null ? '' : String(v)
		// quote what needs it, and defuse spreadsheet formulas in user-supplied values
		const safe = /^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s)) ? `'${s}` : s
		return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
	}
	return [columns.join(','), ...rows.map((r) => columns.map((c) => cell(r[c])).join(','))].join('\r\n') + '\r\n'
}

const CRC = (() => {
	const t = new Uint32Array(256)
	for (let n = 0; n < 256; n++) {
		let c = n
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
		t[n] = c >>> 0
	}
	return t
})()

function crc32(b: Uint8Array): number {
	let c = 0xffffffff
	for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8)
	return (c ^ 0xffffffff) >>> 0
}

/** An uncompressed ZIP of text files. Small exports, so storing beats shipping a deflater. */
export function zipFiles(files: { name: string; text: string }[], at = new Date()): Uint8Array {
	const enc = new TextEncoder()
	const time = (at.getUTCHours() << 11) | (at.getUTCMinutes() << 5) | (at.getUTCSeconds() >> 1)
	const date = ((at.getUTCFullYear() - 1980) << 9) | ((at.getUTCMonth() + 1) << 5) | at.getUTCDate()
	const parts: Uint8Array[] = []
	const central: Uint8Array[] = []
	let offset = 0
	for (const f of files) {
		const name = enc.encode(f.name)
		const data = enc.encode(f.text)
		const crc = crc32(data)
		const local = new DataView(new ArrayBuffer(30))
		local.setUint32(0, 0x04034b50, true)
		local.setUint16(4, 20, true)
		local.setUint16(6, 0x0800, true) // utf-8 names
		local.setUint16(10, time, true)
		local.setUint16(12, date, true)
		local.setUint32(14, crc, true)
		local.setUint32(18, data.length, true)
		local.setUint32(22, data.length, true)
		local.setUint16(26, name.length, true)
		const dir = new DataView(new ArrayBuffer(46))
		dir.setUint32(0, 0x02014b50, true)
		dir.setUint16(4, 20, true)
		dir.setUint16(6, 20, true)
		dir.setUint16(8, 0x0800, true)
		dir.setUint16(12, time, true)
		dir.setUint16(14, date, true)
		dir.setUint32(16, crc, true)
		dir.setUint32(20, data.length, true)
		dir.setUint32(24, data.length, true)
		dir.setUint16(28, name.length, true)
		dir.setUint32(42, offset, true)
		parts.push(new Uint8Array(local.buffer), name, data)
		central.push(new Uint8Array(dir.buffer), name)
		offset += 30 + name.length + data.length
	}
	const size = central.reduce((n, b) => n + b.length, 0)
	const end = new DataView(new ArrayBuffer(22))
	end.setUint32(0, 0x06054b50, true)
	end.setUint16(8, files.length, true)
	end.setUint16(10, files.length, true)
	end.setUint32(12, size, true)
	end.setUint32(16, offset, true)
	const all = [...parts, ...central, new Uint8Array(end.buffer)]
	const out = new Uint8Array(all.reduce((n, b) => n + b.length, 0))
	let p = 0
	for (const b of all) {
		out.set(b, p)
		p += b.length
	}
	return out
}

/** Reads the text files of a ZIP (stored or deflated), such as a CSV export. */
export async function unzipTexts(bytes: Uint8Array, maxFiles = 200): Promise<{ name: string; text: string }[]> {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
	let end = -1
	for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
		if (view.getUint32(i, true) === 0x06054b50) {
			end = i
			break
		}
	}
	if (end < 0) throw new Error('not a zip file')
	const count = view.getUint16(end + 10, true)
	let p = view.getUint32(end + 16, true)
	const dec = new TextDecoder()
	const out: { name: string; text: string }[] = []
	for (let k = 0; k < count && out.length < maxFiles; k++) {
		if (view.getUint32(p, true) !== 0x02014b50) throw new Error('bad zip directory')
		const method = view.getUint16(p + 10, true)
		const size = view.getUint32(p + 20, true)
		const nameLen = view.getUint16(p + 28, true)
		const extra = view.getUint16(p + 30, true)
		const comment = view.getUint16(p + 32, true)
		const local = view.getUint32(p + 42, true)
		const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen))
		p += 46 + nameLen + extra + comment
		if (name.endsWith('/')) continue
		const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true)
		const data = bytes.subarray(start, start + size)
		if (method === 0) out.push({ name, text: dec.decode(data) })
		else if (method === 8) {
			const stream = new Blob([data.slice()]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
			out.push({ name, text: await new Response(stream).text() })
		} else throw new Error(`unsupported zip compression in ${name}`)
	}
	return out
}
