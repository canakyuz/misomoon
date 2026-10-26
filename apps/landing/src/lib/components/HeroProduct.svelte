<script lang="ts">
	import { embedUrl, themeMessage, type Theme } from '#lib/embed.ts'

	// The real dashboard on its sample store, in a browser window. The demo answers from
	// recorded data, so it opens at once; its iframe loads only once the figure is near the
	// screen and the browser is idle, so it never slows the page's first paint.
	let { demo, ready = $bindable(false) }: { demo: string; ready?: boolean } = $props()

	/** the real dashboard's address, once its iframe is in the page */
	let src = $state<string | null>(null)
	let frame = $state<HTMLIFrameElement>()
	let win = $state<HTMLElement>()
	let toggle = $state<HTMLButtonElement>()
	/** the figure fills the screen; `held` keeps its place in the page meanwhile */
	let open = $state(false)
	let held = $state(0)

	const pageTheme = (): Theme => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
	function load() {
		src ??= embedUrl(demo, pageTheme())
	}

	/** Adds the iframe once the figure is within a screen of view and the browser is idle. */
	function whenNear(node: HTMLElement) {
		const idle = window.requestIdleCallback ?? ((f: () => void) => setTimeout(f, 200))
		const io = new IntersectionObserver(
			(entries) => {
				if (!entries.some((e) => e.isIntersecting)) return
				io.disconnect()
				idle(load)
			},
			{ rootMargin: '100% 0px' },
		)
		io.observe(node)
		return () => io.disconnect()
	}

	// the dashboard follows the page's day and night switch without reloading
	$effect(() => {
		if (!src) return
		const origin = new URL(demo).origin
		const watch = new MutationObserver(() => frame?.contentWindow?.postMessage(themeMessage(pageTheme()), origin))
		watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
		return () => watch.disconnect()
	})

	/** Fills the screen with the same window, so the dashboard keeps where it was clicked to. */
	function expand() {
		held = win?.offsetHeight ?? 0
		open = true
		// opened before the figure was near: load the dashboard now
		load()
	}
	function close() {
		open = false
		toggle?.focus({ preventScroll: true })
	}
	$effect(() => {
		if (!open) return
		const root = document.documentElement
		const overflow = root.style.overflow
		root.style.overflow = 'hidden'
		toggle?.focus({ preventScroll: true })
		const key = (e: KeyboardEvent) => e.key === 'Escape' && close()
		addEventListener('keydown', key)
		return () => {
			root.style.overflow = overflow
			removeEventListener('keydown', key)
		}
	})
</script>

<div class="slot" style:height={open ? `${held}px` : null}>
{#if open}<button class="backdrop" aria-label="Close the full-screen demo" tabindex="-1" onclick={close}></button>{/if}
<div
	class="window"
	class:open
	bind:this={win}
	role={open ? 'dialog' : null}
	aria-modal={open ? 'true' : null}
	aria-label={open ? 'The misomoon dashboard on Acme' : null}
	{@attach whenNear}
>
	<div class="chrome">
		<span></span><span></span><span></span>
		<!-- core's SAMPLE.domain: the store the demo shows -->
		<div class="url mono">acme.example</div>
		<button class="size" bind:this={toggle} aria-label={open ? 'Close the full-screen demo' : 'Open the demo full screen'} onclick={() => (open ? close() : expand())}>
			{#if open}
				<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
			{:else}
				<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9" /></svg>
			{/if}
		</button>
	</div>
	{#if src}
		<iframe bind:this={frame} {src} title="The misomoon dashboard on Acme, a sample store: click through every report" loading="lazy" class:ready onload={() => (ready = true)}></iframe>
	{/if}
	<div class="body"></div>
</div>
</div>

<style>
	.slot {
		position: relative;
	}
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 90;
		border: 0;
		padding: 0;
		background: rgb(0 0 0 / 0.55);
		cursor: zoom-out;
	}
	.window.open {
		position: fixed;
		inset: 16px;
		z-index: 91;
		box-shadow: 6px 6px 0 var(--ink);
		display: flex;
		flex-direction: column;
	}
	.window.open .body {
		flex: 1;
		min-height: 0;
	}
	.size {
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		padding: 0;
		border-radius: 7px;
		border: 1.5px solid var(--ink);
		background: var(--surface);
		color: var(--text);
		cursor: pointer;
	}
	.size:hover {
		background: var(--mustard);
		--ink: var(--ink-print);
		color: var(--ink-print);
	}
	.size:focus-visible {
		outline: 2px solid var(--vermilion);
		outline-offset: 2px;
	}
	.size svg {
		width: 14px;
		height: 14px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.window {
		position: relative;
		border-radius: 14px;
		border: 2px solid var(--ink);
		background: var(--surface);
		box-shadow: 10px 10px 0 var(--ink);
		overflow: hidden;
		text-align: left;
		font-size: 12px;
	}
	iframe {
		position: absolute;
		inset: 40px 0 0;
		width: 100%;
		height: calc(100% - 40px);
		border: 0;
		background: var(--surface);
		opacity: 0;
		transition: opacity 0.4s ease;
	}
	iframe.ready {
		opacity: 1;
	}
	@media (prefers-reduced-motion: reduce) {
		iframe {
			transition: none;
		}
	}
	.chrome {
		display: flex;
		align-items: center;
		gap: 7px;
		height: 38px;
		padding: 0 14px;
		border-bottom: 2px solid var(--ink);
		background: var(--bg);
	}
	.chrome > span {
		width: 11px;
		height: 11px;
		border-radius: 50%;
		border: 1.5px solid var(--ink);
		background: var(--vermilion);
	}
	.chrome > span:nth-child(2) {
		/* stays light in the night edition, so ink stays ink on it */
		--ink: var(--ink-print);
		--text: var(--ink-print);
		--text-2: var(--print-2);
		--text-3: var(--print-3);
		--surface: var(--print-surface);
		color: var(--ink-print);
		background: var(--mustard);
	}
	.chrome > span:nth-child(3) {
		background: var(--leaf);
	}
	.url {
		margin: 0 auto;
		padding: 3px 14px;
		border-radius: 999px;
		border: 1.5px solid var(--ink);
		background: var(--surface);
		color: var(--text-2);
		font-size: 11px;
	}
	/* holds the dashboard's place while it loads */
	.body {
		height: min(78vh, 620px);
		min-height: 470px;
		background: var(--surface);
	}
</style>
