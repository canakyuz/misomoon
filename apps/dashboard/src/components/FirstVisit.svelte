<script lang="ts">
	import Check from '@lucide/svelte/icons/check'
	import Copy from '@lucide/svelte/icons/copy'
	import { get, type RealtimeResponse } from '../lib/api'
	import { getDash } from '../lib/dash.svelte'
	import { docUrl, PLATFORMS } from '../lib/guides'
	import BrandIcon from './BrandIcon.svelte'
	import InstallCheck from './InstallCheck.svelte'

	/**
	 * What a site with no visits yet sees instead of empty charts: the one line
	 * to paste, and a check that turns green the moment the first visit lands.
	 */
	const dash = getDash()
	// the platforms most sites run on; the rest are behind All guides
	const GUIDES = PLATFORMS.filter((g) => ['WordPress', 'Shopify', 'Webflow', 'Framer', 'Wix', 'Squarespace', 'Next.js', 'Google Tag Manager'].includes(g.label))
	const tag = $derived(`<script defer src="${location.origin}/m.js?s=${dash.site}"><\/script>`)
	let copied = $state(false)
	let copyFailed = $state(false)
	let seen = $state(false)

	$effect(() => {
		const site = dash.site
		if (!site) return
		let stop = false
		const look = async () => {
			try {
				const d = await get<RealtimeResponse>(`/api/v1/stats/realtime?site=${site}`, undefined, 0)
				if (!stop && d.visitors > 0) {
					seen = true
					// give the tick a beat so people see it turn green
					setTimeout(() => dash.tick++, 1200)
				}
			} catch {}
		}
		look()
		const id = setInterval(look, 4000)
		return () => {
			stop = true
			clearInterval(id)
		}
	})

	async function copy() {
		try {
			await navigator.clipboard.writeText(tag)
		} catch {
			copyFailed = true
			return
		}
		copied = true
		setTimeout(() => (copied = false), 1500)
	}
</script>

<section class="card first">
	<p class="step">Step 1</p>
	<h2>Paste this into the &lt;head&gt; of {dash.current?.domain ?? 'your site'}</h2>
	<div class="code">
		<pre>{tag}</pre>
		<button class="btn" onclick={copy}>
			{#if copied}<Check size={14} /> Copied{:else}<Copy size={14} /> Copy{/if}
		</button>
	</div>
	{#if copyFailed}<p class="error-text">Could not copy; select the text and copy it by hand.</p>{/if}
	<p class="muted small">It sets no cookies and stores nothing on the visitor's device. On a site builder or a framework, its guide shows where the tag goes:</p>
	<ul class="guides">
		{#each GUIDES as g (g.label)}
			<li><a href={docUrl(g.page, g.hash)} target="_blank" rel="noopener"><BrandIcon brand={g.brand} />{g.label}</a></li>
		{/each}
		<li><a href={docUrl('integrations')} target="_blank" rel="noopener">All guides</a></li>
	</ul>
	<p class="muted small">
		To serve the tag from your own domain, so ad blockers don't drop it, see
		<button class="inline" onclick={() => (dash.view = 'settings')}>Settings</button>.
	</p>

	<p class="step">Step 2</p>
	<h2>Open your site in another tab</h2>
	<div class="wait" class:seen>
		<span class="dot"></span>
		{#if seen}
			<strong>First visit in. Loading your dashboard…</strong>
		{:else}
			<span>Waiting for the first visit. This page checks every few seconds.</span>
		{/if}
	</div>
	{#if !seen}<InstallCheck />{/if}
</section>

<style>
	.first {
		max-width: 760px;
		padding: 28px 30px 30px;
	}
	.step {
		margin: 0 0 6px;
		font-family: var(--font-mono);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--miso);
	}
	.step + h2 {
		margin: 0 0 14px;
		font-size: 20px;
		letter-spacing: -0.02em;
	}
	.step:not(:first-child) {
		margin-top: 30px;
	}
	.code {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 10px 10px 14px;
		border: 1.5px solid var(--edge);
		border-radius: var(--radius-lg);
		background: var(--surface-2);
		box-shadow: 3px 3px 0 var(--edge);
	}
	pre {
		flex: 1;
		margin: 0;
		overflow-x: auto;
		font-family: var(--font-mono);
		font-size: 12.5px;
	}
	.small {
		margin: 12px 0 0;
		font-size: 12.5px;
	}
	.guides {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin: 10px 0 0;
		padding: 0;
		list-style: none;
	}
	.guides a {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 5px 10px;
		border: 1.5px solid var(--line-strong);
		border-radius: 999px;
		font-size: 12.5px;
		color: var(--text);
		text-decoration: none;
	}
	.guides a :global(svg) {
		color: var(--text-2);
	}
	.guides a:hover {
		border-color: var(--edge);
	}
	.inline {
		color: var(--miso);
		text-decoration: underline;
		font-size: inherit;
	}
	.wait {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 14px;
		color: var(--text-2);
	}
	.dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--text-4);
		animation: breathe 1.6s ease-in-out infinite;
	}
	.seen .dot {
		background: var(--good);
		animation: none;
	}
	@keyframes breathe {
		50% {
			opacity: 0.3;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.dot {
			animation: none;
		}
	}
</style>
