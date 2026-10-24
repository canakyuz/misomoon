// Reads a Markdown file with a front matter block, for `pnpm content publish`.
// The block is "key: value" lines between two "---" lines. A list is comma-separated.

export interface ParsedFile {
	kind: 'post' | 'page' | 'author'
	/** the slug, or the author id */
	slug: string
	/** the JSON body for PUT /api/entries/<kind>/<slug> or PUT /api/authors/<id> */
	body: Record<string, unknown>
}

const LISTS = new Set(['tags', 'sameAs'])
const FLAGS = new Set(['noindex', 'minor'])

export function parseFile(text: string, fileName: string): ParsedFile {
	const m = text.replace(/^﻿/, '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
	if (!m) throw new Error(`${fileName}: no front matter. Start the file with a --- block`)
	const meta: Record<string, unknown> = {}
	for (const [i, line] of m[1].split(/\r?\n/).entries()) {
		if (!line.trim() || line.trimStart().startsWith('#')) continue
		const kv = line.match(/^([A-Za-z]+):\s*(.*)$/)
		if (!kv) throw new Error(`${fileName}:${i + 2}: write "key: value"`)
		const [, key, raw] = kv
		const value = raw.trim().replace(/^(["'])(.*)\1$/, '$2')
		if (LISTS.has(key))
			meta[key] = value
				.split(',')
				.map((v) => v.trim())
				.filter(Boolean)
		else if (FLAGS.has(key)) {
			if (value !== 'true' && value !== 'false') throw new Error(`${fileName}:${i + 2}: ${key} is true or false`)
			meta[key] = value === 'true'
		} else meta[key] = value === '' ? null : value
	}
	const kind = (meta.kind ?? 'post') as string
	if (kind !== 'post' && kind !== 'page' && kind !== 'author') throw new Error(`${fileName}: kind is post, page or author`)
	const base = fileName.split(/[\\/]/).pop()!.replace(/\.md$/i, '')
	const slug = (meta.slug as string | null) ?? (meta.id as string | null) ?? base
	const { kind: _k, slug: _s, id: _i, ...rest } = meta
	const content = m[2].trim()
	const body = kind === 'author' ? { ...rest, bio: content || rest.bio || '' } : { ...rest, body: content }
	return { kind, slug, body }
}
