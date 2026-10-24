// Builds m.js, overlay.js, and the feature parts. The Worker serves m.js?s=<site> as m.js
// plus the parts the site ticked, so the parts ship as one JSON object of minified sources.
// The file ends in .min.js because the Worker imports *.min.js files as text (wrangler.jsonc).
import { build } from 'esbuild'
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

// es2019 syntax, so the core runs in every browser from 2019 on
const opts = { minify: true, target: 'es2019', write: false }
const size = (name, code) => console.log(`${name.padEnd(18)} ${String(code.length).padStart(6)} bytes ${String(gzipSync(code).length).padStart(6)} gzipped`)

mkdirSync('dist', { recursive: true })
for (const name of ['m', 'overlay']) {
	const [out] = (await build({ ...opts, entryPoints: [`src/${name}.js`] })).outputFiles
	writeFileSync(`dist/${name}.min.js`, out.text)
	size(`${name}.js`, out.text)
}

const parts = {}
for (const file of readdirSync('src/x').sort()) {
	const name = file.replace(/\.js$/, '')
	const [out] = (await build({ ...opts, entryPoints: [`src/x/${file}`] })).outputFiles
	parts[name] = out.text.trim()
	size(`+ ${name}`, parts[name])
}
writeFileSync('dist/parts.min.js', JSON.stringify(parts))
