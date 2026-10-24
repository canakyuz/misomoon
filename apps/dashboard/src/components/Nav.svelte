<script lang="ts">
	import BookOpen from '@lucide/svelte/icons/book-open'
	import Check from '@lucide/svelte/icons/check'
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down'
	import LogIn from '@lucide/svelte/icons/log-in'
	import LogOut from '@lucide/svelte/icons/log-out'
	import Moon from '@lucide/svelte/icons/moon'
	import Plus from '@lucide/svelte/icons/plus'
	import Search from '@lucide/svelte/icons/search'
	import Sun from '@lucide/svelte/icons/sun'
	import { send, setToken, type RealtimeResponse } from '../lib/api'
	import { getDash, Resource } from '../lib/dash.svelte'
	import { DOCS } from '../lib/guides'
	import { VIEW_INFO } from '../lib/nav'
	import Logo from './Logo.svelte'

	const dash = getDash()
	let menu = $state<'site' | 'account' | null>(null)
	const toggle = (m: 'site' | 'account') => (menu = menu === m ? null : m)

	// "Here now" refreshes on its own every 30 s while the tab is visible, not only on a manual refresh.
	let beat = $state(0)
	$effect(() => {
		const id = setInterval(() => {
			if (!document.hidden) beat++
		}, 30_000)
		return () => clearInterval(id)
	})
	const live = new Resource<RealtimeResponse>(() => (dash.site ? `/api/v1/stats/realtime?site=${dash.site}&_=${dash.tick}.${beat}` : null), 10_000)
	const here = $derived(live.data?.visitors ?? 0)

	async function signOut() {
		await send('POST', '/api/v1/auth/logout').catch(() => {})
		setToken(null)
		location.href = '/'
	}
	function addSite() {
		dash.settingsTab = 'sites'
		dash.view = 'settings'
		menu = null
	}
	const ROLE_LABEL: Record<string, string> = { owner: 'Owner', admin: 'Admin', editor: 'Editor', viewer: 'Viewer', billing: 'Billing', guest_editor: 'Guest editor', guest_viewer: 'Guest viewer' }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (menu = null)} />

<header class="nav">
	<div class="bar">
		<div class="start">
			<span class="brand"><Logo /></span>
			<div class="anchor">
				{#if !dash.sites.length && dash.signedIn}
					<!-- nothing to switch between yet, so the button goes straight to adding one -->
					<button class="site" onclick={addSite}><Plus size={14} /><span class="name">Add a site</span></button>
				{:else}
					<button class="site" onclick={() => toggle('site')} aria-expanded={menu === 'site'} aria-haspopup="menu">
						{#if dash.current}
							<span class="dot">{dash.current.name.slice(0, 1)}</span>
							<span class="name">{dash.current.name}</span>
						{:else}
							<span class="name muted">No site</span>
						{/if}
						<ChevronsUpDown size={14} />
					</button>
				{/if}
				{#if menu === 'site'}
					<div class="scrim" role="presentation" onclick={() => (menu = null)}></div>
					<div class="pop card" role="menu">
						{#each dash.sites as s (s.id)}
							<button
								role="menuitemradio"
								aria-checked={s.id === dash.site}
								onclick={() => {
									dash.switchSite(s.id)
									menu = null
								}}
							>
								<span class="dot sm">{s.name.slice(0, 1)}</span>
								<span class="grow">{s.name}<small class="muted">{s.domain}</small></span>
								{#if s.id === dash.site}<Check size={14} />{/if}
							</button>
						{/each}
						{#if dash.isSample}
							<p class="note muted">A sample store with made-up visitors. Your own sites show up here once you add them.</p>
						{:else if dash.signedIn}
							<button role="menuitem" class="add" onclick={addSite}><Plus size={14} /><span class="grow">Add a site</span></button>
						{/if}
					</div>
				{/if}
			</div>
		</div>

		<nav class="tabs scroll-thin" aria-label="Views">
			{#each dash.views as v, i (v)}
				<button class:on={dash.view === v} aria-current={dash.view === v ? 'page' : undefined} title="{VIEW_INFO[v].label} ({i + 1})" onclick={() => (dash.view = v)}>{VIEW_INFO[v].label}</button>
			{/each}
		</nav>

		<div class="end">
			<button class="live" onclick={() => (dash.view = 'realtime')} title="People on the site in the last five minutes">
				<span class="pulse" class:on={here > 0}></span>
				<span class="num">{here}</span>
				<span class="muted label">here now</span>
			</button>
			<a class="btn ghost icon" href={DOCS} target="_blank" rel="noopener" aria-label="Docs" title="Docs"><BookOpen size={15} /></a>
			<button class="btn ghost icon cmd" onclick={() => (dash.paletteOpen = true)} aria-label="Command palette" title="Command palette (⌘K)"><Search size={15} /></button>
			<button class="btn ghost icon" onclick={() => dash.toggleTheme()} aria-label={dash.theme === 'dark' ? 'Day theme' : 'Night theme'} title={dash.theme === 'dark' ? 'Day theme' : 'Night theme'}>
				{#if dash.theme === 'dark'}<Sun size={15} />{:else}<Moon size={15} />{/if}
			</button>
			{#if dash.isSample}
				<span class="tag">Sample data</span>
			{:else if dash.isShared}
				<span class="tag">Read-only</span>
			{:else if dash.me?.user}
				<div class="anchor">
					<button class="avatar" onclick={() => toggle('account')} aria-expanded={menu === 'account'} aria-haspopup="menu" aria-label="Account">{dash.me.user.name.slice(0, 1)}</button>
					{#if menu === 'account'}
						<div class="scrim" role="presentation" onclick={() => (menu = null)}></div>
						<div class="pop card right" role="menu">
							<div class="who">
								<strong>{dash.me.user.name}</strong>
								<span class="muted">{dash.me.user.email}</span>
								{#if dash.role}<span class="muted">{ROLE_LABEL[dash.role] ?? dash.role} on {dash.current?.name}</span>{/if}
							</div>
							<button role="menuitem" onclick={signOut}><LogOut size={14} /><span class="grow">Sign out</span></button>
						</div>
					{/if}
				</div>
			{:else}
				<button class="btn signin" onclick={() => (dash.authOpen = true)}><LogIn size={14} /> Sign in</button>
			{/if}
		</div>
	</div>
</header>

<style>
	.nav {
		position: sticky;
		top: 0;
		z-index: 20;
		background: color-mix(in oklab, var(--bg) 92%, transparent);
		backdrop-filter: blur(8px);
		border-bottom: 1.5px solid var(--edge);
	}
	/* three columns so the views sit in the true centre, whatever the two sides hold */
	.bar {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		grid-template-areas: 'start tabs end';
		align-items: center;
		gap: 10px 16px;
		max-width: 1320px;
		margin: 0 auto;
		padding: 10px 36px;
	}
	.start {
		grid-area: start;
		display: flex;
		align-items: center;
		gap: 14px;
		min-width: 0;
	}
	.end {
		grid-area: end;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 4px;
	}
	.brand {
		display: inline-flex;
		flex: none;
	}
	.anchor {
		position: relative;
		min-width: 0;
	}
	.site {
		display: flex;
		align-items: center;
		gap: 8px;
		/* never wider than what the controls on the right leave, so the name shortens instead of running under them */
		max-width: min(220px, 100%);
		/* at the narrowest it keeps the site's initial */
		min-width: 40px;
		height: 34px;
		padding: 0 10px;
		border-radius: var(--radius-sm);
		border: 1.5px solid var(--line-strong);
		background: var(--surface);
		color: var(--text-3);
	}
	.site:hover {
		background: var(--surface-3);
	}
	.name {
		color: var(--text);
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.dot {
		display: grid;
		place-items: center;
		flex: none;
		width: 18px;
		height: 18px;
		border-radius: var(--radius-xs);
		background: var(--vermilion);
		color: var(--on-vermilion);
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
	}
	.dot.sm {
		width: 16px;
		height: 16px;
		font-size: 10px;
	}

	.tabs {
		grid-area: tabs;
		display: flex;
		gap: 2px;
		padding: 3px;
		border: 1.5px solid var(--line-strong);
		border-radius: var(--radius);
		background: var(--surface);
		overflow-x: auto;
	}
	.tabs button {
		flex: none;
		height: 30px;
		padding: 0 13px;
		border-radius: var(--radius-sm);
		color: var(--text-2);
		font-size: 13.5px;
		font-weight: 600;
		white-space: nowrap;
		transition:
			background var(--dur-fast),
			color var(--dur-fast);
	}
	.tabs button:hover {
		background: var(--surface-hover);
		color: var(--text);
	}
	.tabs button.on {
		background: var(--vermilion);
		color: var(--on-vermilion);
		box-shadow: var(--shadow-sm);
	}

	.live {
		display: flex;
		align-items: center;
		gap: 7px;
		height: 32px;
		padding: 0 10px;
		border-radius: var(--radius-sm);
		font-size: 12.5px;
		white-space: nowrap;
	}
	.live:hover {
		background: var(--surface-hover);
	}
	.live .num {
		font-weight: 700;
	}
	.pulse {
		position: relative;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--text-4);
	}
	.pulse.on {
		background: var(--good);
	}
	.pulse.on::after {
		content: '';
		position: absolute;
		inset: -4px;
		border-radius: 50%;
		border: 2px solid var(--good);
		animation: ping 2s var(--ease-out) infinite;
	}
	@keyframes ping {
		from {
			transform: scale(0.6);
			opacity: 0.8;
		}
		to {
			transform: scale(1.8);
			opacity: 0;
		}
	}
	.tag {
		margin-left: 6px;
		padding: 4px 9px;
		border: 1.5px dashed var(--line-strong);
		border-radius: var(--radius-sm);
		color: var(--text-2);
		font-family: var(--font-mono);
		font-stretch: 87.5%;
		font-size: 11px;
		text-transform: uppercase;
		white-space: nowrap;
	}
	.avatar {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		margin-left: 6px;
		border-radius: 50%;
		border: 1.5px solid var(--edge);
		background: var(--miso-soft);
		color: var(--miso);
		font-weight: 700;
		font-size: 12px;
		text-transform: uppercase;
	}
	.signin {
		margin-left: 6px;
	}

	.scrim {
		position: fixed;
		inset: 0;
		z-index: 29;
	}
	.pop {
		position: absolute;
		top: calc(100% + 8px);
		left: 0;
		z-index: 30;
		width: 260px;
		padding: 4px;
		border-radius: var(--radius-sm);
		box-shadow: var(--shadow-lg);
	}
	.pop.right {
		left: auto;
		right: 0;
	}
	.pop button {
		display: flex;
		align-items: center;
		gap: 9px;
		width: 100%;
		min-height: 36px;
		padding: 6px 8px;
		border-radius: var(--radius-xs);
		font-size: 13px;
		text-align: left;
	}
	.pop button:hover {
		background: var(--surface-3);
	}
	.grow {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
	}
	.grow small {
		font-size: 11.5px;
	}
	.pop .add {
		margin-top: 4px;
		border-top: 1px dashed var(--line-strong);
		border-radius: 0 0 var(--radius-xs) var(--radius-xs);
		color: var(--text-2);
	}
	.note {
		margin: 4px 0 0;
		padding: 8px 8px 6px;
		border-top: 1px dashed var(--line-strong);
		font-size: 12px;
		line-height: 1.4;
	}
	.who {
		display: flex;
		flex-direction: column;
		gap: 1px;
		padding: 8px 8px 10px;
		margin-bottom: 4px;
		border-bottom: 1px dashed var(--line-strong);
		font-size: 12.5px;
	}
	.who span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* below this the views move to their own row, still centred */
	@media (max-width: 1180px) {
		.bar {
			grid-template-columns: 1fr auto;
			grid-template-areas: 'start end' 'tabs tabs';
			padding: 10px 24px;
		}
		.tabs {
			justify-self: center;
			max-width: 100%;
		}
	}
	@media (max-width: 640px) {
		.bar {
			padding: 8px 16px;
			gap: 8px;
		}
		.brand :global(.word) {
			display: none;
		}
		.start {
			gap: 10px;
		}
		.site {
			max-width: min(150px, 100%);
		}
		.live .label,
		.cmd {
			display: none;
		}
		.live {
			padding: 0 6px;
		}
		/* on a phone the row of views scrolls sideways instead of squeezing */
		.tabs {
			justify-self: stretch;
			scrollbar-width: none;
		}
	}
</style>
