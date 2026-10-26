<script lang="ts">
	import '../app.css'
	import Logo from '#lib/components/Logo.svelte'
	import ThemeToggle from '#lib/components/ThemeToggle.svelte'
	import { docLink } from '#lib/links.ts'
	import { page } from '$app/state'
	import { FEATURES } from '#lib/features.ts'
	import { CTA, signupUrl } from '#lib/pricing.ts'

	let { children, data } = $props()
	let scrolled = $state(false)
	let menu = $state(false)

	const NAV = $derived<[string, string][]>([
		['Features', '/features'],
		['Pricing', '/pricing'],
		['Compare', '/alternatives'],
		...(data.blog ? [['Blog', '/blog'] as [string, string]] : []),
	])
	const here = (href: string) => page.url.pathname === href || page.url.pathname.startsWith(href + '/')

	// misomoon counts its own landing page. The tracker loads once the page is idle so
	// it never competes with the first paint.
	$effect(() => {
		if (!data.appUrl) return
		const idle = window.requestIdleCallback ?? ((f: () => void) => setTimeout(f, 1))
		const add = () => {
			const s = document.createElement('script')
			s.defer = true
			s.src = `${data.appUrl}/m.js?s=demo`
			document.head.append(s)
		}
		const go = () => idle(add, { timeout: 4000 })
		if (document.readyState === 'complete') go()
		else addEventListener('load', go, { once: true })
	})
</script>

<svelte:window onscroll={() => (scrolled = window.scrollY > 40)} />

<div class="grain" aria-hidden="true"></div>

<a class="skip" href="#main">Skip to content</a>

<header class="nav" class:scrolled>
	<div class="wrap bar">
		<a href="/" aria-label="misomoon home"><Logo size={26} /></a>
		<nav aria-label="Main">
			{#each NAV as [label, href] (href)}
				<a {href} aria-current={here(href) ? 'page' : undefined}>{label}</a>
			{/each}
			<a href={docLink(data.docsUrl)}>Docs</a>
		</nav>
		<div class="right">
			<span class="theme-top"><ThemeToggle /></span>
			<a class="signin" href="{data.appUrl}/">Sign in</a>
			<a class="cta primary small" href={signupUrl(data.appUrl)}>{CTA} <span class="arrow">→</span></a>
			<details class="menu" bind:open={menu}>
				<summary aria-label="Menu"><span></span><span></span></summary>
				<div class="sheet print">
					{#each NAV as [label, href] (href)}
						<a {href} onclick={() => (menu = false)}>{label}</a>
					{/each}
					<a href={docLink(data.docsUrl)}>Docs</a>
					<a href="/demo">Live preview</a>
					<a href="{data.appUrl}/">Sign in</a>
					<span class="theme-sheet"><ThemeToggle labelled /></span>
				</div>
			</details>
		</div>
	</div>
</header>

<div id="main">
	{@render children()}
</div>

<footer class="foot">
	<div class="wrap cols">
		<div class="brand">
			<p class="mono">Cookieless analytics, hosted for you or run yourself. Printed fresh every day; forgotten every night.</p>
		</div>
		<div>
			<h2 class="mono">Product</h2>
			<a href="/features">Features</a>
			{#each FEATURES.slice(0, 4) as g (g.id)}
				<a href="/features#{g.id}">{g.name}</a>
			{/each}
			<a href="/pricing">Pricing</a>
			<a href="/demo">Live demo</a>
		</div>
		<div>
			<h2 class="mono">Compare</h2>
			{#each data.compare as a (a.slug)}
				<a href="/alternatives/{a.slug}">{a.short} alternative</a>
			{/each}
			<a href="/alternatives">All comparisons</a>
		</div>
		<div>
			<h2 class="mono">Resources</h2>
			{#if data.blog}<a href="/blog">Blog</a>{/if}
			<a href={docLink(data.docsUrl)}>Docs</a>
			<a href={docLink(data.docsUrl, 'self-hosting')}>Self-hosting</a>
			<a href={docLink(data.docsUrl, 'faq')}>FAQ</a>
			<a href="/feed.xml">RSS feed</a>
		</div>
		<div>
			<h2 class="mono">Legal</h2>
			<a href="/privacy">Privacy policy</a>
			<a href="/terms">Terms</a>
			<a href="/dpa">Data processing agreement</a>
			<a href="/security">Security</a>
		</div>
	</div>
	<div class="wrap fine mono">
		<span>© {new Date().getFullYear()} misomoon · AGPL-3.0 license</span>
		<span>printed under a quiet moon</span>
	</div>
	<!-- the wordmark sinks below the footer's edge: only its top half shows -->
	<div class="giant" aria-hidden="true"><span>misomoon</span></div>
</footer>

<style>
	.nav {
		position: sticky;
		top: 0;
		z-index: 50;
		background: var(--bg);
		border-bottom: 2px solid transparent;
		transition: border-color var(--dur);
	}
	.nav.scrolled {
		border-color: var(--ink);
	}
	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 74px;
	}
	nav {
		display: flex;
		gap: 4px;
		font-size: 14.5px;
		font-weight: 500;
	}
	nav a {
		padding: 7px 12px;
		border-radius: 999px;
		border: 1.5px solid transparent;
		transition: border-color var(--dur-fast), background var(--dur-fast);
	}
	nav a:hover {
		border-color: var(--ink);
		background: var(--surface);
	}
	.right {
		display: flex;
		align-items: center;
		gap: 18px;
		font-size: 14.5px;
		font-weight: 500;
	}
	.signin:hover {
		text-decoration: underline;
		text-underline-offset: 4px;
	}
	.small {
		height: 42px;
		padding: 0 16px;
		font-size: 14px;
		box-shadow: 3px 3px 0 var(--ink);
	}
	.foot {
		background: var(--block);
		color: var(--on-block);
		padding: 72px 0 0;
		overflow: hidden;
	}
	.cols {
		display: grid;
		grid-template-columns: 1.6fr repeat(4, 1fr);
		gap: 32px;
	}
	.skip {
		position: absolute;
		left: 12px;
		top: -60px;
		z-index: 60;
		padding: 10px 14px;
		background: var(--block);
		color: var(--on-block);
		border-radius: 8px;
	}
	.skip:focus {
		top: 12px;
	}
	nav a[aria-current='page'] {
		border-color: var(--ink);
		background: var(--surface);
	}
	.menu {
		display: none;
		position: relative;
	}
	.menu summary {
		list-style: none;
		display: grid;
		place-content: center;
		gap: 5px;
		width: 42px;
		height: 42px;
		border: 2px solid var(--ink);
		border-radius: 10px;
		background: var(--surface);
		cursor: pointer;
	}
	.menu summary::-webkit-details-marker {
		display: none;
	}
	.menu summary span {
		display: block;
		width: 18px;
		height: 2px;
		background: var(--block);
		transition: transform var(--dur) var(--ease-out);
	}
	.menu[open] summary span:first-child {
		transform: translateY(3.5px) rotate(45deg);
	}
	.menu[open] summary span:last-child {
		transform: translateY(-3.5px) rotate(-45deg);
	}
	.sheet {
		position: absolute;
		right: 0;
		top: 52px;
		display: grid;
		min-width: 220px;
		padding: 8px;
	}
	.sheet a {
		padding: 12px 14px;
		font-weight: 600;
		border-radius: 8px;
	}
	.sheet a:hover {
		background: var(--surface-2);
	}
	.brand p {
		max-width: 340px;
		margin: 0;
		font-size: 12.5px;
		line-height: 1.7;
		color: rgb(242 236 223 / 0.7);
	}
	h2 {
		margin: 0 0 16px;
		font-size: 11px;
		font-weight: 500;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--mustard);
	}
	.cols a {
		display: block;
		font-size: 15px;
		margin-bottom: 10px;
		color: rgb(242 236 223 / 0.85);
	}
	.cols a:hover {
		color: var(--miso);
	}
	.giant {
		height: 0.46em;
		margin-top: 40px;
		overflow: hidden;
		font-family: var(--font-display);
		font-weight: 900;
		font-stretch: 100%;
		font-size: 18.2vw;
		line-height: 0.78;
		letter-spacing: -0.06em;
		text-align: center;
		color: var(--miso);
		opacity: 0.35;
		white-space: nowrap;
		user-select: none;
	}
	.giant span {
		display: block;
	}
	.fine {
		display: flex;
		justify-content: space-between;
		margin-top: 48px;
		font-size: 11px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: rgb(242 236 223 / 0.5);
	}
	@media (max-width: 860px) {
		nav {
			display: none;
		}
		.signin {
			display: none;
		}
		.menu {
			display: block;
		}
		.cols {
			grid-template-columns: 1fr 1fr;
		}
		.brand {
			grid-column: 1 / -1;
		}
	}
	.theme-top {
		display: contents;
	}
	.theme-sheet {
		display: none;
	}
	/* a phone has no room for the button next to the trial: it moves into the menu */
	@media (max-width: 420px) {
		.theme-top {
			display: none;
		}
		.theme-sheet {
			display: block;
		}
	}
</style>
