import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vite-plus/test'
import { toCsv, unzipTexts, zipFiles } from '../src'

const hasPython = (() => {
	try {
		execFileSync('python3', ['--version'])
		return true
	} catch {
		return false
	}
})()

describe('export', () => {
	it('quotes CSV cells and defuses formulas', () => {
		expect(toCsv(['key', 'visitors'], [{ key: 'a,"b"', visitors: 3 }, { key: '=HYPERLINK("x")', visitors: -1 }])).toBe(
			'key,visitors\r\n"a,""b""",3\r\n"\'=HYPERLINK(""x"")",-1\r\n',
		)
	})

	it.skipIf(!hasPython)('writes a zip that Python can read', () => {
		const dir = mkdtempSync(join(tmpdir(), 'mm-zip-'))
		const file = join(dir, 'export.zip')
		writeFileSync(file, zipFiles([{ name: 'visitors.csv', text: 'date,visitors\r\n2026-10-22,4\r\n' }, { name: 'pages.csv', text: 'é\r\n' }]))
		const py = `import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print('|'.join(z.namelist())); print(z.read('pages.csv').decode())`
		const out = execFileSync('python3', ['-c', py, file], { encoding: 'utf8' })
		expect(out).toContain('visitors.csv|pages.csv')
		expect(out).toContain('é')
		expect(readFileSync(file).length).toBeGreaterThan(100)
	})

	it.skipIf(!hasPython)('reads a deflated zip', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'mm-unzip-'))
		const file = join(dir, 'in.zip')
		const py = `import zipfile,sys; z=zipfile.ZipFile(sys.argv[1],'w',zipfile.ZIP_DEFLATED); z.writestr('a/imported_visitors.csv','date,visitors\\n'*50); z.writestr('b.csv','é'); z.close()`
		execFileSync('python3', ['-c', py, file])
		const files = await unzipTexts(new Uint8Array(readFileSync(file)))
		expect(files.map((f) => f.name)).toEqual(['a/imported_visitors.csv', 'b.csv'])
		expect(files[0].text.split('\n')).toHaveLength(51)
		expect(files[1].text).toBe('é')
	})
})
