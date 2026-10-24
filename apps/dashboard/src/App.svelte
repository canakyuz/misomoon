<script lang="ts">
	import CommandPalette from './components/CommandPalette.svelte'
	import Logo from './components/Logo.svelte'
	import Nav from './components/Nav.svelte'
	import AddSite from './components/AddSite.svelte'
	import AuthScreen from './components/AuthScreen.svelte'
	import PlanBanner from './components/PlanBanner.svelte'
	import { ApiError, get, getShareToken, send, setShareToken, setToken, shareSlug } from './lib/api'
	import { Dash, setDash } from './lib/dash.svelte'
	import Funnels from './views/Funnels.svelte'
	import Journeys from './views/Journeys.svelte'
	import Behavior from './views/Behavior.svelte'
	import Overview from './views/Overview.svelte'
	import Realtime from './views/Realtime.svelte'
	import Settings from './views/Settings.svelte'
	import Vitals from './views/Vitals.svelte'

	const dash = new Dash()
	setDash(dash)

	let failure = $state<string | null>(null)

	// A shared link (/share/<slug>) first trades the link, and its password if it has one, for a read-only token.
	let gate = $state<{ name: string; protected: boolean } | null>(null)
	let password = $state('')
	let gateError = $state<string | null>(null)

	const boot = () =>
		dash.load().catch(async (e) => {
			if (!(e instanceof ApiError && e.status === 401)) return (failure = e.message)
			if (shareSlug) return (failure = 'share')
			// an expired session: carry on signed out, with the sign-in screen up
			setToken(null)
			dash.authOpen = true
			await dash.load().catch((e2) => (failure = e2.message))
		})

	async function unlock() {
		gateError = null
		try {
			const r = await send<{ token: string; site: string }>('POST', `/api/v1/share/${shareSlug}`, { password: password || undefined })
			setShareToken(r.token)
			dash.site = r.site
			gate = null
			failure = null
			await boot()
		} catch (e) {
			gateError = (e as Error).message
		}
	}

	async function openGate() {
		gate = await get<{ name: string; protected: boolean }>(`/api/v1/share/${shareSlug}`, undefined, 0).catch((e) => {
			failure = e.message
			return null
		})
		if (gate && !gate.protected) await unlock()
	}

	if (shareSlug) {
		// a token from earlier in this tab skips the gate until it expires
		if (getShareToken()) dash.load().catch(openGate)
		else openGate()
	} else boot()

	function onkey(e: KeyboardEvent) {
		const typing = (e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
			e.preventDefault()
			dash.paletteOpen = !dash.paletteOpen
			return
		}
		if (typing || e.metaKey || e.ctrlKey || e.altKey) return
		if (/^[1-9]$/.test(e.key)) {
			const v = dash.views[Number(e.key) - 1]
			if (v) dash.view = v
		} else if (e.key === 'Escape' && dash.filters.length && !document.querySelector('.pop, [aria-modal="true"]')) {
			// Escape closes an open popover or dialog first; only then does it drop the last filter.
			dash.filters = dash.filters.slice(0, -1)
		}
	}
</script>

<svelte:window onkeydown={onkey} />

<div class="glow" aria-hidden="true"></div>

{#if (dash.authLink || dash.authOpen) && !shareSlug}
	<AuthScreen />
{:else if gate?.protected}
	<main class="center">
		<Logo size={36} />
		<h1 class="serif">{gate.name}</h1>
		<p class="muted">This dashboard is shared with a password.</p>
		<form
			class="gate"
			onsubmit={(e) => {
				e.preventDefault()
				unlock()
			}}
		>
			<input class="input" type="password" placeholder="Password" bind:value={password} autocomplete="current-password" />
			<button class="btn primary" disabled={!password}>Open</button>
		</form>
		{#if gateError}<p class="error-text">{gateError}</p>{/if}
	</main>
{:else if failure}
	<main class="center">
		<Logo size={36} />
		{#if failure === 'share'}
			<h1 class="serif">This link has expired.</h1>
			<p class="muted">Ask whoever shared it for a new one.</p>
		{:else}
			<h1 class="serif">The moon is behind a cloud.</h1>
			<p class="muted">{failure}</p>
		{/if}
		<button class="btn" onclick={() => location.reload()}>Try again</button>
	</main>
{:else}
	<div class="app">
		<Nav />
		<main class="main">
			<div class="inner">
				<PlanBanner />
				{#if !dash.me}
					<div class="boot"><span class="skeleton" style="width: 220px; height: 40px"></span><span class="skeleton" style="height: 380px; border-radius: 18px"></span></div>
				{:else if !dash.site && dash.isSample}
					<div class="center">
						<h1 class="serif">No demo here.</h1>
						<p class="muted">This server has no sample site. Set SAMPLE_SITE to show one.</p>
					</div>
				{:else if !dash.site && dash.view !== 'settings'}
					<div class="center">
						<h1 class="serif">Which site should we watch?</h1>
						<p class="muted">Add the domain, paste one script tag, and visitors start appearing here.</p>
						{#if dash.signedIn}
							<div class="first-site">
								<AddSite
									onadded={() => (dash.view = 'overview')}
								/>
							</div>
						{:else}
							<button class="btn primary" onclick={() => (dash.authOpen = true)}>Sign in or create an account</button>
						{/if}
					</div>
				{:else if dash.role === 'billing' && dash.view !== 'settings'}
					<div class="center">
						<h1 class="serif">Billing access</h1>
						<p class="muted">Your role on this team covers billing only, so stats stay hidden. Ask an owner or admin for viewer access.</p>
						{#if dash.me?.plans}
							<button
								class="btn"
								onclick={() => {
									dash.settingsTab = 'team'
									dash.view = 'settings'
								}}>See the plan</button
							>
						{/if}
					</div>
				{:else if dash.view === 'overview'}
					<Overview />
				{:else if dash.view === 'realtime'}
					<Realtime />
				{:else if dash.view === 'funnels'}
					<Funnels />
				{:else if dash.view === 'journeys'}
					<Journeys />
				{:else if dash.view === 'behavior'}
					<Behavior />
				{:else if dash.view === 'vitals'}
					<Vitals />
				{:else if !dash.isShared}
					<Settings />
				{:else}
					<Overview />
				{/if}
			</div>

		</main>
	</div>
{/if}

{#if dash.paletteOpen}
	<CommandPalette />
{/if}

<style>
	.glow {
		position: fixed;
		inset: 0;
		background: var(--bg-glow);
		pointer-events: none;
		z-index: 0;
	}
	.app {
		position: relative;
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
		z-index: 1;
	}
	.main {
		position: relative;
		flex: 1;
		min-width: 0;
	}
	/* one centred column under the navigation, the same width as the bar */
	.inner {
		max-width: 1320px;
		margin: 0 auto;
		padding: 34px 36px 120px;
	}
	.boot {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}
	.center {
		position: relative;
		z-index: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		min-height: 70dvh;
		text-align: center;
	}
	.center h1 {
		font-size: 44px;
		margin: 12px 0 0;
	}
	.center p {
		max-width: 420px;
		margin: 0 0 8px;
	}
	.first-site {
		width: min(100%, 560px);
		text-align: left;
	}
	@media (max-width: 1180px) {
		.inner {
			padding: 28px 24px 110px;
		}
	}
	@media (max-width: 640px) {
		.inner {
			padding: 20px 16px 96px;
		}
	}
	.gate {
		display: flex;
		gap: 8px;
		margin-top: 8px;
	}
	.gate .input {
		width: 240px;
	}
	.error-text {
		color: var(--miso-strong);
		font-size: 13px;
	}
</style>
