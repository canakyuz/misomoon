<script lang="ts">
	import { page } from '$app/state'
	import Marks from '#lib/components/Marks.svelte'
	import { brandsOf } from '#lib/guides.ts'

	let { data } = $props()
	const url = $derived(`${page.url.origin}/${data.slug}`)
	const OG_IMAGE = 'https://misomoon.com/og.png'
	// a TechArticle in a breadcrumb trail: docs home, the sidebar section, this page
	const ld = $derived(
		JSON.stringify({
			'@context': 'https://schema.org',
			'@graph': [
				{
					'@type': 'TechArticle',
					'@id': `${url}#article`,
					headline: data.title,
					description: data.description,
					url,
					image: OG_IMAGE,
					inLanguage: 'en',
					isPartOf: { '@type': 'WebSite', name: 'misomoon docs', url: page.url.origin },
					publisher: { '@type': 'Organization', name: 'misomoon', url: 'https://misomoon.com', logo: 'https://misomoon.com/logo.png' },
					about: { '@type': 'SoftwareApplication', name: 'misomoon', url: 'https://misomoon.com' },
				},
				{
					'@type': 'BreadcrumbList',
					itemListElement: [
						{ '@type': 'ListItem', position: 1, name: 'Docs', item: page.url.origin },
						...(data.section ? [{ '@type': 'ListItem', position: 2, name: data.section }] : []),
						{ '@type': 'ListItem', position: data.section ? 3 : 2, name: data.title, item: url },
					],
				},
			],
		}).replace(/</g, '\\u003c'),
	)
	let copied = $state(false)
	let here = $state('')

	// the code blocks' Copy buttons
	function onclick(e: MouseEvent) {
		const button = e.target instanceof Element ? e.target.closest('[data-copy]') : null
		const code = button?.closest('.code')?.querySelector('pre')?.textContent
		if (!button || code == null) return
		navigator.clipboard.writeText(code).then(
			() => {
				button.textContent = 'Copied'
				setTimeout(() => (button.textContent = 'Copy'), 1400)
			},
			() => {},
		)
	}

	async function copyPage() {
		try {
			const md = await fetch(`/${data.slug}.md`).then((r) => r.text())
			await navigator.clipboard.writeText(md)
			copied = true
			setTimeout(() => (copied = false), 1400)
		} catch {
			// the clipboard can be blocked; "View as Markdown" still works
		}
	}

	// the outline marks the last heading scrolled past
	$effect(() => {
		const ids = data.toc.map((t) => t.id)
		const update = () => {
			let id = ''
			for (const i of ids) {
				const el = document.getElementById(i)
				if (el && el.getBoundingClientRect().top < 120) id = i
			}
			here = id
		}
		update()
		addEventListener('scroll', update, { passive: true })
		return () => removeEventListener('scroll', update)
	})
</script>

<svelte:head>
	<title>{data.title} · misomoon docs</title>
	<meta name="description" content={data.description} />
	<meta property="og:type" content="article" />
	<meta property="og:site_name" content="misomoon docs" />
	<meta property="og:title" content="{data.title} · misomoon docs" />
	<meta property="og:description" content={data.description} />
	<meta property="og:url" content={url} />
	<meta property="og:image" content={OG_IMAGE} />
	<meta name="twitter:card" content="summary_large_image" />
	<link rel="canonical" href={url} />
	<!-- JSON built above, with < escaped -->
	{@html `<script type="application/ld+json">${ld}</script>`}
	<link rel="alternate" type="text/markdown" href="/{data.slug}.md" />
</svelte:head>

<div class="page">
	<article>
		<header>
			{#if data.section}<p class="crumb mono">{data.section}</p>{/if}
			{#if brandsOf(data.slug).length}<div class="logos"><Marks slug={data.slug} size={28} /></div>{/if}
			<h1>{data.title}</h1>
			<div class="actions mono">
				<button onclick={copyPage}>{copied ? 'Copied' : 'Copy page'}</button>
				<a href="/{data.slug}.md">View as Markdown</a>
				<a href={data.edit}>Edit on GitHub</a>
			</div>
		</header>
		<!-- the HTML is docs/*.md rendered at build time, from this repository -->
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<div class="prose" {onclick}>{@html data.html}</div>
		<nav class="pager" aria-label="Next and previous pages">
			{#if data.prev}<a class="prev" href="/{data.prev.slug}"><span class="mono">Previous</span>{data.prev.title}</a>{/if}
			{#if data.next}<a class="next" href="/{data.next.slug}"><span class="mono">Next</span>{data.next.title}</a>{/if}
		</nav>
	</article>
	{#if data.toc.length > 1}
		<aside class="toc" aria-label="On this page">
			<p class="mono">On this page</p>
			<ul>
				{#each data.toc as t (t.id)}
					<li class:sub={t.depth === 3}><a href="#{t.id}" class:on={here === t.id}>{t.text}</a></li>
				{/each}
			</ul>
		</aside>
	{/if}
</div>

<style>
	.page {
		display: grid;
		grid-template-columns: minmax(0, 760px) 220px;
		gap: 56px;
		justify-content: center;
		padding: 44px 40px 90px;
	}
	article {
		min-width: 0;
	}
	header {
		margin-bottom: 34px;
	}
	.crumb {
		margin: 0 0 10px;
		font-size: 11px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--vermilion);
	}
	.logos {
		margin-bottom: 14px;
	}
	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-stretch: 68%;
		font-weight: 800;
		font-size: clamp(38px, 5.4vw, 58px);
		line-height: 0.95;
		text-transform: uppercase;
		letter-spacing: -0.01em;
		overflow-wrap: anywhere;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 18px;
	}
	.actions :is(a, button) {
		padding: 5px 10px;
		font-size: 10.5px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		text-decoration: none;
		color: var(--text-2);
		border: 1.5px solid var(--line-strong);
		border-radius: 999px;
		background: var(--surface);
	}
	.actions :is(a, button):hover {
		color: var(--text);
		border-color: var(--edge);
	}
	.pager {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
		margin-top: 64px;
	}
	.pager a {
		display: grid;
		gap: 4px;
		padding: 14px 18px;
		border: 2px solid var(--edge);
		border-radius: var(--radius, 10px);
		background: var(--surface);
		box-shadow: var(--shadow);
		font-weight: 700;
		text-decoration: none;
	}
	.pager a:hover {
		border-color: var(--vermilion);
	}
	.pager .mono {
		font-size: 10.5px;
		font-weight: 500;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-3);
	}
	.next {
		grid-column: 2;
		text-align: right;
	}
	.toc {
		position: sticky;
		top: 96px;
		align-self: start;
		max-height: calc(100vh - 120px);
		overflow-y: auto;
		font-size: 13.5px;
	}
	.toc p {
		margin: 0 0 10px;
		font-size: 10.5px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-3);
	}
	.toc ul {
		list-style: none;
		margin: 0;
		padding: 0;
		border-left: 2px solid var(--line-strong);
	}
	.toc a {
		display: block;
		margin-left: -2px;
		padding: 4px 0 4px 12px;
		border-left: 2px solid transparent;
		line-height: 1.35;
		text-decoration: none;
		color: var(--text-2);
	}
	.toc .sub a {
		padding-left: 24px;
		font-size: 12.5px;
	}
	.toc a:hover {
		color: var(--text);
	}
	.toc a.on {
		color: var(--vermilion);
		border-left-color: var(--vermilion);
		font-weight: 600;
	}

	@media (max-width: 1200px) {
		.page {
			grid-template-columns: minmax(0, 760px);
		}
		.toc {
			display: none;
		}
	}
	@media (max-width: 900px) {
		.page {
			padding: 28px 16px 70px;
		}
	}
	@media (max-width: 520px) {
		.pager {
			grid-template-columns: 1fr;
		}
		.next {
			grid-column: 1;
		}
	}
</style>
