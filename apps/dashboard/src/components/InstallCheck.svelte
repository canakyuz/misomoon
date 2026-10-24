<script lang="ts">
	import Search from '@lucide/svelte/icons/search'
	import { get, type AggregateResponse } from '../lib/api'
	import { getDash, Resource } from '../lib/dash.svelte'

	/**
	 * Is the script working? `visits` adds a line on whether visits arrive; without it, only
	 * the button that opens the site's home page and looks for the tag.
	 */
	let { visits = false }: { visits?: boolean } = $props()

	interface Check {
		url: string | null
		status: 'found' | 'other_site' | 'missing' | 'unreachable'
		http_status: number | null
		sites: string[]
		error?: string
	}

	const dash = getDash()
	const ever = new Resource<AggregateResponse>(() => (visits && dash.site ? `/api/v1/stats/aggregate?site=${dash.site}&period=all&compare=0&_=${dash.tick}` : null))
	const day = new Resource<AggregateResponse>(() => (visits && dash.site ? `/api/v1/stats/aggregate?site=${dash.site}&period=24h&compare=0&_=${dash.tick}` : null))
	const traffic = $derived(!ever.data || !day.data ? null : ever.data.current.visitors === 0 ? 'none' : day.data.current.visitors === 0 ? 'quiet' : 'live')

	let result = $state<{ site: string; check: Check } | null>(null)
	let busy = $state(false)
	let error = $state<string | null>(null)
	const shown = $derived(result && result.site === dash.site ? result.check : null)

	async function run() {
		const site = dash.site
		if (!site || busy) return
		busy = true
		error = null
		try {
			result = { site, check: await get<Check>(`/api/v1/sites/${site}/check`, undefined, 0) }
		} catch (err) {
			error = (err as Error).message
		} finally {
			busy = false
		}
	}
</script>

<div class="install-check">
	{#if visits && traffic}
		<p class="state {traffic}" role="status">
			<span class="dot"></span>
			{#if traffic === 'none'}
				No visits yet. Paste the tag, open your site, and the first visit shows up within seconds.
			{:else if traffic === 'quiet'}
				No visits in the last 24 hours. If the site had visitors, the script may be gone.
			{:else}
				Visits are arriving: {day.data?.current.visitors.toLocaleString()} visitors in the last 24 hours.
			{/if}
		</p>
	{/if}

	{#if dash.canEdit}
		<button class="btn" onclick={run} disabled={busy}><Search size={14} /> {busy ? 'Checking…' : 'Check my site'}</button>
	{/if}
	{#if error}<p class="note bad" role="alert">{error}</p>{/if}
	{#if shown}
		<p class="note {shown.status === 'found' ? 'good' : 'bad'}" role="status">
			{#if shown.status === 'found'}
				Found the script on <strong>{shown.url}</strong>. Open a page there. If no visit shows up within a minute, an ad blocker or the site's Content Security Policy may block it.
			{:else if shown.status === 'other_site'}
				<strong>{shown.url}</strong> has the script of another site, <code>{shown.sites.join(', ')}</code>. Replace it with this site's tag, which ends in
				<code>s={dash.site}</code>.
			{:else if shown.status === 'missing'}
				No misomoon script on <strong>{shown.url}</strong>. Paste the tag into the <code>&lt;head&gt;</code> and publish the site. Added it with Google Tag Manager or the SDK? This
				check reads only the page's HTML, so wait for the first visit instead.
			{:else}
				{shown.error}. Check the domain under Settings, or open your site and wait for the first visit.
			{/if}
		</p>
	{/if}
</div>

<style>
	.install-check {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 10px;
		margin-top: 14px;
	}
	.state {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0;
		font-size: 13px;
		color: var(--text-2);
	}
	.dot {
		flex: none;
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: var(--text-4);
	}
	.live .dot {
		background: var(--good);
	}
	.quiet .dot {
		background: var(--bad);
	}
	.note {
		margin: 0;
		max-width: 640px;
		font-size: 13px;
		line-height: 1.5;
		color: var(--text-2);
	}
	.note.good {
		color: var(--text);
	}
	.note.bad strong,
	.note.good strong {
		word-break: break-all;
	}
	code {
		font-family: var(--font-mono);
		font-size: 12px;
	}
</style>
