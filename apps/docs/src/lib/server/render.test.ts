import { describe, expect, it } from 'vite-plus/test'
import { headingId, parseNav, plain, renderPage, resolveHref, slugOf } from './render.ts'

const docs = new Set(['README.md', 'api.md', 'PROXY.md', 'self-hosting.md'])
const raw = (code: string) => `<pre>${code}</pre>`

describe('slugOf', () => {
	it.each([
		['README.md', ''],
		['self-hosting.md', 'self-hosting'],
		['PROXY.md', 'proxy'],
		['ARCHITECTURE.md', 'architecture'],
	])('%s is /%s', (file, slug) => expect(slugOf(file)).toBe(slug))
})

describe('headingId, the id GitHub gives a heading', () => {
	it.each([
		['Set it up in about 5 minutes', 'set-it-up-in-about-5-minutes'],
		['GET /api/v1/stats/export', 'get-apiv1statsexport'],
		['Stats API v2', 'stats-api-v2'],
		['What does it cost?', 'what-does-it-cost'],
		['1. Managed subdomain', '1-managed-subdomain'],
		['Track `data-misomoon-event` clicks', 'track-data-misomoon-event-clicks'],
		['Sources & campaigns', 'sources--campaigns'],
	])('%s → %s', (text, id) => expect(headingId(text)).toBe(id))
})

describe('resolveHref', () => {
	it('turns a page of docs/ into a site path, keeping the heading', () => {
		expect(resolveHref('api.md#filters', docs)).toEqual({ href: '/api#filters', file: 'api.md', id: 'filters' })
		expect(resolveHref('PROXY.md', docs)).toEqual({ href: '/proxy', file: 'PROXY.md', id: null })
		expect(resolveHref('./self-hosting.md', docs)).toEqual({ href: '/self-hosting', file: 'self-hosting.md', id: null })
	})

	it('opens a file elsewhere in the repository on GitHub', () => {
		expect(resolveHref('../CONTRIBUTING.md', docs).href).toBe('https://github.com/jackzard/misomoon/blob/main/CONTRIBUTING.md')
		expect(resolveHref('../apps/api/src/usage.ts#L10', docs).href).toBe('https://github.com/jackzard/misomoon/blob/main/apps/api/src/usage.ts#L10')
		expect(resolveHref('../apps/api/migrations', docs).href).toBe('https://github.com/jackzard/misomoon/tree/main/apps/api/migrations')
		expect(resolveHref('images/funnels.png', docs).href).toBe('https://github.com/jackzard/misomoon/blob/main/docs/images/funnels.png')
	})

	it('sends a moved page to misomoon.com, keeping a legal page heading and dropping a comparison one', () => {
		const all = new Set([...docs, 'dpa.md', 'comparison.md'])
		expect(resolveHref('dpa.md#9-personal-data-breaches', all)).toEqual({ href: 'https://misomoon.com/dpa#9-personal-data-breaches', file: 'dpa.md', id: '9-personal-data-breaches' })
		expect(resolveHref('comparison.md#plausible', all)).toEqual({ href: 'https://misomoon.com/alternatives', file: 'comparison.md', id: null })
	})

	it('leaves anchors, absolute URLs and mail links alone', () => {
		expect(resolveHref('#filters', docs)).toEqual({ href: '#filters', file: null, id: 'filters' })
		expect(resolveHref('https://developers.cloudflare.com/d1/', docs).href).toBe('https://developers.cloudflare.com/d1/')
		expect(resolveHref('mailto:security@misomoon.com', docs).href).toBe('mailto:security@misomoon.com')
	})

	it('fails the build on a link that runs script or embeds data', () => {
		for (const href of ['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:msgbox(1)']) {
			expect(() => resolveHref(href, docs)).toThrow(`a link must be http, https or mailto: ${href}`)
		}
		expect(() => renderPage('a.md', '# A\n\n[Click](javascript:alert(1))\n', docs, {}, raw)).toThrow('docs/a.md: a link must be http, https or mailto: javascript:alert(1)')
	})
})

describe('parseNav', () => {
	const readme = `# misomoon docs

Analytics in your own Cloudflare account.

## Get started

- [Run misomoon](self-hosting.md): deploy with one button, and
  claim your instance.
- [Track your site](tracking.md): the script tag.

## Reference

- [API](api.md): the Stats API.
`
	it('reads the title, the intro, and each section with its pages in order', () => {
		expect(parseNav(readme)).toEqual({
			title: 'misomoon docs',
			intro: 'Analytics in your own Cloudflare account.',
			sections: [
				{
					title: 'Get started',
					pages: [
						{ file: 'self-hosting.md', slug: 'self-hosting', href: '/self-hosting', title: 'Run misomoon', description: 'deploy with one button, and claim your instance' },
						{ file: 'tracking.md', slug: 'tracking', href: '/tracking', title: 'Track your site', description: 'the script tag' },
					],
				},
				{ title: 'Reference', pages: [{ file: 'api.md', slug: 'api', href: '/api', title: 'API', description: 'the Stats API' }] },
			],
		})
	})

	it('links a moved page to misomoon.com', () => {
		expect(parseNav('# Docs\n\n## Legal\n\n- [Privacy policy](privacy.md): your data.\n').sections[0].pages[0]).toEqual({
			file: 'privacy.md',
			slug: 'privacy',
			href: 'https://misomoon.com/privacy',
			title: 'Privacy policy',
			description: 'your data',
		})
	})

	it('refuses a list item that is not a link to a page', () => {
		expect(() => parseNav('# Docs\n\n## Guides\n\n- Upgrading, soon\n')).toThrow('docs/README.md: a list item is not "[Title](file.md): description": Upgrading, soon')
	})
})

describe('renderPage', () => {
	const md = `# Track your site

The script tag, custom events, and goals.

## Add the script

See [the API](api.md#filters) and [another section](#send-events).

## Send events

### Send events

\`\`\`js
misomoon('Signup')
\`\`\`

| Feature | Size |
| --- | --- |
| \`clicks\` | 1 KB |
`
	const page = renderPage('tracking.md', md, docs, {}, raw)

	it('takes the title from the h1 and the description from the first paragraph', () => {
		expect(page.title).toBe('Track your site')
		expect(page.description).toBe('The script tag, custom events, and goals.')
		expect(page.html).not.toContain('<h1')
	})

	it('keeps the description to whole sentences that fit a search result', () => {
		const long = renderPage('a.md', `# A\n\n${'This sentence is about fifty characters long, ok. '.repeat(5)}\n`, docs, {}, raw)
		expect(long.description).toBe('This sentence is about fifty characters long, ok. '.repeat(3).trim())
		const dotted = renderPage('a.md', `# A\n\nOpen app.misomoon.com, then sign in. ${'Then wait for it to load. '.repeat(8)}\n`, docs, {}, raw)
		expect(dotted.description).toBe(`Open app.misomoon.com, then sign in. ${'Then wait for it to load. '.repeat(4).trim()}`)
		const one = renderPage('a.md', `# A\n\n${'word '.repeat(60)}end.\n`, docs, {}, raw)
		expect(one.description).toBe(`${'word '.repeat(32).trim()}…`)
	})

	it('gives headings GitHub ids, numbering a repeated one, and lists h2 and h3 in the outline', () => {
		expect(page.toc).toEqual([
			{ depth: 2, id: 'add-the-script', text: 'Add the script' },
			{ depth: 2, id: 'send-events', text: 'Send events' },
			{ depth: 3, id: 'send-events-1', text: 'Send events' },
		])
		expect(page.html).toContain('<h2 id="add-the-script"><a class="anchor" href="#add-the-script" aria-hidden="true" tabindex="-1">#</a>Add the script</h2>')
	})

	it('rewrites links to other pages and records them', () => {
		expect(page.html).toContain('<a href="/api#filters">the API</a>')
		expect(page.links).toEqual([
			{ href: '/api#filters', file: 'api.md', id: 'filters' },
			{ href: '#send-events', file: null, id: 'send-events' },
		])
	})

	it('highlights code under a bar with its language and a copy button, and wraps tables to scroll', () => {
		expect(page.html).toContain(`<div class="code"><div class="code-bar"><span>js</span><button type="button" data-copy>Copy</button></div><pre>misomoon('Signup')</pre></div>`)
		expect(page.html).toContain('<div class="table"><table>')
		expect(page.html).toContain('<td><code>clicks</code></td>')
	})

	it('splits the page into searchable sections at each h2 and h3', () => {
		expect(page.sections.map((s) => [s.heading, s.id])).toEqual([
			['Track your site', ''],
			['Add the script', 'add-the-script'],
			['Send events', 'send-events'],
			['Send events', 'send-events-1'],
		])
		expect(page.sections[1].text).toBe('See the API and another section.')
	})

	it('maps an image in docs/images to its built URL', () => {
		const p = renderPage('a.md', '# A\n\n![The funnel](images/funnels.png)\n', docs, { 'images/funnels.png': '/_app/immutable/assets/funnels.abc.png' }, raw)
		expect(p.html).toContain('<img src="/_app/immutable/assets/funnels.abc.png" alt="The funnel" loading="lazy" />')
	})

	it('starts a link to another page with its marks, and leaves other links alone', () => {
		const marks = (f: string) => (f === 'api.md' ? '<svg class="mark"></svg>' : '')
		const p = renderPage('a.md', '# A\n\n[The API](api.md) and [setup](self-hosting.md) and [a site](https://example.com).\n', docs, {}, raw, marks)
		expect(p.html).toContain('<a href="/api" class="marked"><svg class="mark"></svg>The API</a>')
		expect(p.html).toContain('<a href="/self-hosting">setup</a>')
		expect(p.html).toContain('<a href="https://example.com" rel="noopener">a site</a>')
	})
})

describe('plain', () => {
	it('drops tags and decodes the entities marked writes', () => {
		expect(plain('<p>Fish &amp; <code>chips</code> &lt;3 &quot;now&quot; &#39;ok&#39;</p>\n')).toBe(`Fish & chips <3 "now" 'ok'`)
	})
})
