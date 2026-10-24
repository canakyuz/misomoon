<script lang="ts">
	import type { TocEntry } from '#lib/server/markdown.ts'

	let { toc }: { toc: TocEntry[] } = $props()
	let active = $state('')

	// mark the heading being read, from the headings that cross the top of the screen
	$effect(() => {
		const els = toc.map((t) => document.getElementById(t.id)).filter((e): e is HTMLElement => !!e)
		const seen = new IntersectionObserver(
			(entries) => {
				for (const e of entries) if (e.isIntersecting) active = e.target.id
			},
			{ rootMargin: '-90px 0px -70% 0px' },
		)
		els.forEach((e) => seen.observe(e))
		return () => seen.disconnect()
	})
</script>

<nav class="toc" aria-label="On this page">
	<p class="mono">On this page</p>
	<ol>
		{#each toc as t (t.id)}
			<li class:sub={t.level === 3}><a href="#{t.id}" aria-current={active === t.id ? 'location' : undefined}>{t.text}</a></li>
		{/each}
	</ol>
</nav>

<style>
	.toc {
		position: sticky;
		top: 100px;
		font-size: 14px;
	}
	p {
		margin: 0 0 12px;
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-3);
	}
	ol {
		margin: 0;
		padding: 0 0 0 14px;
		list-style: none;
		border-left: 2px solid var(--line-strong);
	}
	li {
		margin: 0 0 8px;
	}
	li.sub {
		padding-left: 14px;
		font-size: 13px;
	}
	a {
		color: var(--text-2);
	}
	a:hover,
	a[aria-current] {
		color: var(--miso);
	}
	a[aria-current] {
		font-weight: 700;
	}
</style>
