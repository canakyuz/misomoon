<script lang="ts">
	import X from '@lucide/svelte/icons/x'
	import { get, send, setToken, signupLink } from '../lib/api'
	import { getDash } from '../lib/dash.svelte'
	import { otherAccount } from '../lib/invite'
	import Logo from './Logo.svelte'

	type Mode = 'signin' | 'signup' | 'forgot' | 'reset' | 'invite'
	interface Invite {
		email: string
		role: string
		team: string
		site: string | null
		invited_by: string | null
		has_account: boolean
	}

	const dash = getDash()
	const emailLink = dash.authLink
	let mode = $state<Mode>(emailLink?.kind ?? (signupLink ? 'signup' : 'signin'))
	// a Start free link for someone already signed in, or on a server with sign-up closed
	$effect(() => {
		if (mode !== 'signup' || !dash.me) return
		if (dash.signedIn) dash.authOpen = false
		else if (!dash.me.signups) mode = 'signin'
	})
	let email = $state('')
	let name = $state('')
	let password = $state('')
	let error = $state<string | null>(null)
	let note = $state<string | null>(null)
	let busy = $state(false)
	let invite = $state<Invite | null>(null)

	if (emailLink?.kind === 'invite') {
		get<Invite>(`/api/v1/invitations/${emailLink.token}`, undefined, 0)
			.then((i) => {
				invite = i
				email = i.email
			})
			.catch((e) => (error = (e as Error).message))
	}

	const ROLE: Record<string, string> = {
		owner: 'an owner',
		admin: 'an admin',
		editor: 'an editor',
		viewer: 'a viewer',
		billing: 'billing',
	}

	/** Signs in with the token and opens the dashboard at a clean URL. */
	/** Leaves an invitation or reset link for the dashboard (or the sign-in screen it was on). */
	function leave() {
		if (emailLink) history.replaceState(null, '', '/')
		dash.authOpen = false
		dash.authLink = null
	}

	/** Signs out of the account an invitation isn't for, so you can sign in or sign up as the invited email. */
	async function switchAccount() {
		await send('POST', '/api/v1/auth/logout').catch(() => {})
		setToken(null)
		error = null
		await dash.load()
	}

	const wrong = $derived(invite ? otherAccount(invite.email, dash.me) : null)

	async function enter(token: string | undefined, site?: string | null) {
		if (token) setToken(token)
		history.replaceState(null, '', site ? `/?site=${encodeURIComponent(site)}` : '/')
		dash.authOpen = false
		dash.authLink = null
		if (site) dash.site = site
		await dash.load()
		dash.tick++
	}

	async function submit() {
		error = null
		note = null
		busy = true
		try {
			if (mode === 'signin') {
				const r = await send<{ token: string }>('POST', '/api/v1/auth/login', { email, password })
				if (invite && emailLink) {
					setToken(r.token)
					const a = await send<{ site: string | null }>('POST', `/api/v1/invitations/${emailLink.token}/accept`, {})
					await enter(undefined, a.site)
				} else await enter(r.token)
			} else if (mode === 'signup') {
				await enter((await send<{ token: string }>('POST', '/api/v1/auth/signup', { email, name, password })).token)
			} else if (mode === 'forgot') {
				const r = await send<{ sending: boolean }>('POST', '/api/v1/auth/forgot', { email })
				note = r.sending ? `If ${email} has an account, a reset link is on its way.` : 'Email is not set up on this server; ask whoever runs it to reset your password.'
			} else if (mode === 'reset' && emailLink) {
				await enter((await send<{ token: string }>('POST', '/api/v1/auth/reset', { token: emailLink.token, password })).token)
			} else if (mode === 'invite' && emailLink) {
				const a = await send<{ token?: string; site: string | null }>('POST', `/api/v1/invitations/${emailLink.token}/accept`, dash.signedIn ? {} : { name, password })
				await enter(a.token, a.site)
			}
		} catch (e) {
			error = (e as Error).message
		} finally {
			busy = false
		}
	}

	const title = $derived(
		mode === 'invite'
			? invite
				? `Join ${invite.site ?? invite.team}`
				: 'Invitation'
			: mode === 'signup'
				? 'Start counting'
				: mode === 'forgot'
					? 'Forgot it?'
					: mode === 'reset'
						? 'New password'
						: 'Welcome back',
	)
	const ready = $derived(
		mode === 'forgot' ? !!email : mode === 'reset' ? password.length >= 10 : mode === 'invite' ? dash.signedIn || password.length >= 10 : !!email && password.length >= (mode === 'signup' ? 10 : 1),
	)
</script>

<main class="auth">
	<button class="btn ghost icon close" onclick={leave} aria-label="Close"><X size={16} /></button>
	<section class="card sheet">
		<Logo size={30} />
		<span class="kicker">{mode === 'invite' ? 'invitation' : mode === 'signup' ? 'new account' : 'sign in'}</span>
		<h1>{title}</h1>

		{#if mode === 'invite'}
			{#if invite}
				<p class="muted">
					{invite.invited_by ?? 'Someone'} invited <strong>{invite.email}</strong> to {invite.site ? `see ${invite.site}` : `the ${invite.team} team`} as {ROLE[invite.role] ?? invite.role}.
					{#if invite.has_account && !dash.signedIn}Sign in to accept.{:else if !dash.signedIn}Pick a password to create your account.{/if}
				</p>
				{#if invite.has_account && !dash.signedIn}
					<button class="btn primary wide" onclick={() => (mode = 'signin')}>Sign in as {invite.email}</button>
				{:else if wrong}
					<p class="muted">You're signed in as <strong>{wrong}</strong>. Sign out to accept it as {invite.email}.</p>
					<button class="btn primary wide" onclick={switchAccount}>Sign out</button>
				{/if}
			{/if}
		{:else if mode === 'signin'}
			<p class="muted">{invite ? `Sign in as ${invite.email} to accept the invitation.` : 'Sign in to see your sites and your team.'}</p>
		{:else if mode === 'signup'}
			<p class="muted">An account, a team for your sites, and a script tag. No cookies on your visitors.</p>
		{:else if mode === 'forgot'}
			<p class="muted">We'll email you a link to choose a new password.</p>
		{:else}
			<p class="muted">At least 10 characters. You'll be signed out everywhere else.</p>
		{/if}

		{#if mode !== 'invite' || (invite && !(invite.has_account && !dash.signedIn) && !wrong)}
			<form
				onsubmit={(e) => {
					e.preventDefault()
					submit()
				}}
			>
				{#if mode === 'signup' || (mode === 'invite' && !dash.signedIn)}
					<label><span>Name</span><input class="input" autocomplete="name" bind:value={name} placeholder="Ada Lovelace" /></label>
				{/if}
				{#if mode === 'signin' || mode === 'signup' || mode === 'forgot'}
					<label><span>Email</span><input class="input" type="email" autocomplete="email" bind:value={email} readonly={!!invite} placeholder="you@example.com" /></label>
				{/if}
				{#if mode !== 'forgot' && !(mode === 'invite' && dash.signedIn)}
					<label>
						<span>Password</span>
						<input class="input" type="password" autocomplete={mode === 'signin' ? 'current-password' : 'new-password'} bind:value={password} placeholder={mode === 'signin' ? '' : '10 characters or more'} />
					</label>
				{/if}
				<button class="btn primary wide" disabled={!ready || busy}>
					{busy ? '…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : mode === 'forgot' ? 'Send the link' : mode === 'reset' ? 'Save and sign in' : 'Accept invitation'}
				</button>
			</form>
		{/if}

		{#if error}<p class="error">{error}</p>{/if}
		{#if note}<p class="note">{note}</p>{/if}

		<footer>
			{#if mode === 'signin'}
				<button class="link" onclick={() => (mode = 'forgot')}>Forgot your password?</button>
				{#if dash.me?.signups && !invite}<button class="link" onclick={() => (mode = 'signup')}>Create an account</button>{/if}
			{:else if mode === 'signup' || mode === 'forgot'}
				<button class="link" onclick={() => (mode = 'signin')}>I have an account</button>
			{:else if mode === 'reset'}
				<button class="link" onclick={() => (mode = 'forgot')}>Send me a new link</button>
			{/if}
		</footer>
	</section>
</main>

<style>
	.auth {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: grid;
		place-items: center;
		padding: 24px 16px;
		overflow-y: auto;
		background: var(--bg);
		background-image: radial-gradient(var(--line) 1px, transparent 1px);
		background-size: 14px 14px;
	}
	.close {
		position: absolute;
		top: 18px;
		right: 18px;
	}
	.sheet {
		width: min(420px, 100%);
		padding: 28px 28px 22px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.kicker {
		margin-top: 14px;
		font-family: var(--font-mono);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--miso);
	}
	h1 {
		margin: 0;
		font-size: 34px;
		line-height: 1.05;
		text-transform: uppercase;
		letter-spacing: -0.01em;
	}
	p {
		margin: 0;
		font-size: 13.5px;
		line-height: 1.55;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-top: 8px;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}
	label span {
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-3);
	}
	.wide {
		width: 100%;
		height: 40px;
		justify-content: center;
		margin-top: 4px;
	}
	.error {
		color: var(--miso-strong);
	}
	.note {
		padding: 10px 12px;
		border: 1.5px dashed var(--miso-line);
		border-radius: var(--radius-sm);
	}
	footer {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		margin-top: 8px;
	}
	.link {
		font-size: 12.5px;
		color: var(--text-3);
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.link:hover {
		color: var(--text);
	}
</style>
