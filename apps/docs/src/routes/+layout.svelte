<script lang="ts">
	import '../app.css'
	import Logo from '#lib/components/Logo.svelte'
	import Marks from '#lib/components/Marks.svelte'
	import Search from '#lib/components/Search.svelte'
	import { afterNavigate } from '$app/navigation'
	import { page } from '$app/state'

	let { children, data } = $props()
	let searching = $state(false)
	let menu = $state(false)
	let theme = $state<'light' | 'dark'>('light')

	$effect(() => {
		theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
	})
	function toggleTheme() {
		theme = theme === 'dark' ? 'light' : 'dark'
		document.documentElement.dataset.theme = theme
		try {
			localStorage.setItem('misomoon-docs-theme', theme)
		} catch {
			// private mode: the choice lasts for this page only
		}
	}

	afterNavigate(() => (menu = false))

	// ⌘K, Ctrl+K and / open the search, unless the reader is typing somewhere
	function onkeydown(e: KeyboardEvent) {
		const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))
		if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
			e.preventDefault()
			searching = true
		}
	}

	const current = $derived(page.url.pathname.replace(/\/$/, '').slice(1))
</script>

<svelte:window {onkeydown} />

<a class="skip" href="#main">Skip to the page</a>

<header class="top">
	<div class="bar">
		<button class="menu" onclick={() => (menu = !menu)} aria-expanded={menu} aria-controls="sidebar">
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d={menu ? 'M6 6l12 12M18 6 6 18' : 'M4 7h16M4 12h16M4 17h16'} /></svg>
			<span class="sr">{menu ? 'Close the menu' : 'Open the menu'}</span>
		</button>
		<a class="brand" href="/"><Logo size={24} /><span class="tag mono">Docs</span></a>
		<button class="search" onclick={() => (searching = true)}>
			<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
			<span class="label">Search</span>
			<kbd>⌘K</kbd>
		</button>
		<nav class="links" aria-label="misomoon">
			<a href="https://misomoon.com">Home</a>
			<a href="https://app.misomoon.com/?site=demo">Live demo</a>
			<a href="https://github.com/jackzard/misomoon">GitHub</a>
		</nav>
		<button class="theme" onclick={toggleTheme} aria-label={theme === 'dark' ? 'Use the light theme' : 'Use the dark theme'}>
			{#if theme === 'dark'}
				<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
			{:else}
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" /></svg>
			{/if}
		</button>
	</div>
</header>

<div class="shell">
	<aside id="sidebar" class="side" class:open={menu}>
		<nav aria-label="Docs">
			<a class="home" class:on={current === ''} href="/">Overview</a>
			{#each data.nav.sections as s (s.title)}
				<h2 class="mono">{s.title}</h2>
				<ul>
					{#each s.pages as p (p.slug)}
						<li><a href={p.href} class:on={current === p.slug} aria-current={current === p.slug ? 'page' : undefined}><Marks slug={p.slug} size={14} first />{p.title}</a></li>
					{/each}
				</ul>
			{/each}
		</nav>
	</aside>
	{#if menu}<button class="scrim" onclick={() => (menu = false)} aria-label="Close the menu"></button>{/if}
	<main id="main">
		{@render children()}
	</main>
</div>

<Search bind:open={searching} />

<style>
	.skip {
		position: absolute;
		left: 12px;
		top: -60px;
		z-index: 100;
		padding: 8px 12px;
		background: var(--surface);
		border: 2px solid var(--edge);
		border-radius: 8px;
	}
	.skip:focus {
		top: 12px;
	}
	.top {
		position: sticky;
		top: 0;
		z-index: 30;
		background: var(--bg);
		border-bottom: 2px solid var(--edge);
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 14px;
		height: 62px;
		padding: 0 20px;
	}
	.brand {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		text-decoration: none;
	}
	.tag {
		padding: 2px 8px;
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		border: 1.5px solid var(--edge);
		border-radius: 999px;
		background: var(--mustard);
		color: var(--ink);
	}
	.search {
		display: flex;
		align-items: center;
		gap: 10px;
		width: min(340px, 100%);
		margin-left: 18px;
		padding: 7px 10px 7px 12px;
		border: 2px solid var(--edge);
		border-radius: 10px;
		background: var(--surface);
		box-shadow: var(--shadow-sm);
		color: var(--text-2);
		font-size: 14.5px;
	}
	.search:hover {
		color: var(--text);
	}
	.search .label {
		flex: 1;
		text-align: left;
	}
	svg {
		width: 18px;
		height: 18px;
		flex: none;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.links {
		display: flex;
		gap: 20px;
		margin-left: auto;
		font-size: 14.5px;
	}
	.links a {
		text-decoration: none;
		color: var(--text-2);
	}
	.links a:hover {
		color: var(--text);
	}
	.theme,
	.menu {
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		border-radius: 9px;
		color: var(--text-2);
	}
	.theme:hover,
	.menu:hover {
		background: var(--surface-3);
		color: var(--text);
	}
	.menu {
		display: none;
	}

	.shell {
		display: grid;
		grid-template-columns: 272px minmax(0, 1fr);
		min-height: calc(100vh - 62px);
	}
	.side {
		position: sticky;
		top: 62px;
		height: calc(100vh - 62px);
		overflow-y: auto;
		padding: 22px 16px 40px 20px;
		border-right: 2px solid var(--edge);
		background: var(--bg);
	}
	.side h2 {
		margin: 22px 0 6px 10px;
		font-size: 10.5px;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-3);
	}
	.side ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.side a {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 10px;
		border-radius: 8px;
		font-size: 14.5px;
		line-height: 1.35;
		text-decoration: none;
		color: var(--text-2);
	}
	.side a:hover {
		background: var(--surface-3);
		color: var(--text);
	}
	.side a.on {
		background: var(--vermilion);
		color: var(--on-vermilion);
		font-weight: 600;
	}
	.side .home {
		font-weight: 600;
	}
	main {
		min-width: 0;
	}
	.scrim {
		display: none;
	}

	@media (max-width: 960px) {
		.links {
			display: none;
		}
		.search {
			margin-left: auto;
			width: auto;
		}
		.theme {
			margin-left: 0;
		}
	}
	@media (max-width: 900px) {
		.bar {
			gap: 8px;
			padding: 0 12px;
		}
		.menu {
			display: grid;
		}
		.shell {
			grid-template-columns: minmax(0, 1fr);
		}
		.side {
			position: fixed;
			top: 62px;
			left: 0;
			z-index: 25;
			width: min(300px, 86vw);
			transform: translateX(-102%);
			transition: transform var(--dur, 0.2s) var(--ease-out, ease-out);
		}
		.side.open {
			transform: none;
			box-shadow: var(--shadow-lg);
		}
		.scrim {
			display: block;
			position: fixed;
			inset: 62px 0 0;
			z-index: 20;
			background: rgb(23 20 15 / 0.3);
		}
	}
	@media (max-width: 520px) {
		.search .label,
		.search kbd {
			display: none;
		}
		.tag {
			display: none;
		}
	}
</style>
