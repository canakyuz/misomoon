import { describe, expect, it } from 'vite-plus/test'
import { absolute, sections, slugOf, source } from './docs.ts'

const files = {
	'/docs/README.md': `# misomoon docs

Intro.

## Get started

- [Use misomoon Cloud](cloud.md): sign up, and
  the plans.
- [Serve the tracker](PROXY.md): a subdomain.

## Background

- [How misomoon compares](comparison.md) with other tools.

## Legal

- [Privacy policy](privacy.md): your data.
`,
	'/docs/cloud.md': '# Use misomoon Cloud\n',
	'/docs/PROXY.md': '# Serve the tracker\n',
	'/docs/comparison.md': '# Compare\n',
	'/docs/privacy.md': '# Privacy policy\n',
}

describe('the docs pages', () => {
	it('read the sidebar, joining wrapped lines and leaving out the pages misomoon.com shows', () => {
		expect(sections(files)).toEqual([
			{
				title: 'Get started',
				pages: [
					{ file: 'cloud.md', slug: 'cloud', title: 'Use misomoon Cloud', description: 'sign up, and the plans', md: '# Use misomoon Cloud\n' },
					{ file: 'PROXY.md', slug: 'proxy', title: 'Serve the tracker', description: 'a subdomain', md: '# Serve the tracker\n' },
				],
			},
		])
	})

	it('cover the real docs/README.md', () => {
		const all = sections().flatMap((s) => s.pages.map((p) => p.file))
		expect(all).toContain('tracking.md')
		expect(all).not.toContain('dpa.md')
		expect(all).not.toContain('comparison.md')
	})

	it('slug a file the way the docs site does', () => {
		expect(['PROXY.md', 'self-hosting.md'].map(slugOf)).toEqual(['proxy', 'self-hosting'])
	})

	it('find one file', () => {
		expect(source('privacy.md', files)).toBe('# Privacy policy\n')
		expect(source('nope.md', files)).toBeNull()
	})
})

describe('absolute links', () => {
	const O = 'https://misomoon.com'
	const D = 'https://docs.misomoon.com'

	it.each([
		['[a](api.md#filters)', D, '[a](https://docs.misomoon.com/api#filters)'],
		['[a](./PROXY.md)', D, '[a](https://docs.misomoon.com/proxy)'],
		['[a](PROXY.md)', null, '[a](https://github.com/jackzard/misomoon/blob/main/docs/PROXY.md)'],
		['[a](dpa.md#12-deletion)', D, '[a](https://misomoon.com/dpa#12-deletion)'],
		['[a](comparison.md#plausible)', D, '[a](https://misomoon.com/alternatives)'],
		['![f](images/funnels.png)', D, '![f](https://github.com/jackzard/misomoon/blob/main/docs/images/funnels.png)'],
		['[a](../apps/api/migrations)', D, '[a](https://github.com/jackzard/misomoon/tree/main/apps/api/migrations)'],
		['[a](#here) [b](https://x.test/y.md) [c](mailto:a@b.c)', D, '[a](#here) [b](https://x.test/y.md) [c](mailto:a@b.c)'],
	])('%s → %s', (md, docs, out) => expect(absolute(md, O, docs)).toBe(out))
})
