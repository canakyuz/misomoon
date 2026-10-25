<script lang="ts">
	import { page } from '$app/state'

	const missing = $derived(page.status === 404)
</script>

<svelte:head>
	<title>{missing ? 'Page not found' : 'Something went wrong'} · misomoon docs</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="missing">
	<p class="mono">{page.status}</p>
	<h1 class="display">{missing ? 'No page here.' : 'Something went wrong.'}</h1>
	<p>
		{missing ? 'The page may have moved.' : 'Try again in a minute.'} Search with <kbd>⌘K</kbd>, or start from <a href="/">the docs overview</a>.
	</p>
</div>

<style>
	.missing {
		max-width: 640px;
		padding: 80px 40px;
	}
	.mono {
		margin: 0 0 10px;
		font-size: 12px;
		letter-spacing: 0.1em;
		color: var(--vermilion);
	}
	h1 {
		margin: 0 0 18px;
		font-size: clamp(44px, 7vw, 80px);
	}
	a {
		text-decoration-color: var(--vermilion);
	}
	@media (max-width: 900px) {
		.missing {
			padding: 50px 16px;
		}
	}
</style>
