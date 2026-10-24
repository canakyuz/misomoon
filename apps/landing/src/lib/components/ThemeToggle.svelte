<script lang="ts">
	// Day or night edition. app.html sets the theme before the first paint; this button
	// switches it and remembers the choice. Without a choice, the page follows the system.
	const KEY = 'misomoon.theme'
	const COLOR = { light: '#efe8d9', dark: '#0f0d0a' } as const
	type Theme = keyof typeof COLOR

	/** labelled: a full-width row with words, for the phone menu */
	let { labelled = false }: { labelled?: boolean } = $props()
	let theme = $state<Theme>('light')

	function set(t: Theme) {
		theme = t
		document.documentElement.dataset.theme = t
		document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', COLOR[t])
	}

	function stored(): string | null {
		try {
			return localStorage.getItem(KEY)
		} catch {
			return null
		}
	}

	$effect(() => {
		const root = document.documentElement
		const read = () => (theme = root.dataset.theme === 'dark' ? 'dark' : 'light')
		read()
		// the header and the phone menu each have a button; both follow the page
		const watch = new MutationObserver(read)
		watch.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
		const system = matchMedia('(prefers-color-scheme: dark)')
		const follow = (e: MediaQueryListEvent) => {
			if (!stored()) set(e.matches ? 'dark' : 'light')
		}
		system.addEventListener('change', follow)
		return () => {
			watch.disconnect()
			system.removeEventListener('change', follow)
		}
	})

	function toggle() {
		const next = theme === 'dark' ? 'light' : 'dark'
		set(next)
		try {
			localStorage.setItem(KEY, next)
		} catch {
			// private mode: the choice lasts until the page closes
		}
	}
</script>

<button class="theme" class:labelled onclick={toggle} aria-label={theme === 'dark' ? 'Switch to the day edition' : 'Switch to the night edition'} title={theme === 'dark' ? 'Day edition' : 'Night edition'}>
	{#if theme === 'dark'}
		<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"
			><circle cx="12" cy="12" r="4.5" fill="currentColor" /><g stroke="currentColor" stroke-width="2" stroke-linecap="round"
				><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></g
			></svg
		>
	{:else}
		<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" fill="currentColor" /></svg>
	{/if}
	{#if labelled}<span>{theme === 'dark' ? 'Day edition' : 'Night edition'}</span>{/if}
</button>

<style>
	.theme {
		flex: none;
		display: grid;
		place-items: center;
		width: 38px;
		height: 38px;
		border: 2px solid var(--ink);
		border-radius: 999px;
		background: var(--surface);
		color: var(--ink);
		transition:
			transform var(--dur-fast) var(--ease-out),
			box-shadow var(--dur-fast) var(--ease-out);
	}
	/* matches the links of the phone menu it sits in */
	.theme.labelled {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		height: auto;
		padding: 12px 14px;
		border: 0;
		border-radius: 8px;
		background: none;
		font-weight: 600;
	}
	.theme.labelled:hover {
		transform: none;
		box-shadow: none;
		background: var(--surface-2);
	}
	.theme:hover {
		transform: translate(-1px, -1px);
		box-shadow: 2px 2px 0 var(--ink);
	}
</style>
