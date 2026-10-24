<svelte:head>
	<title>Page not found · misomoon docs</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="missing">
	<p class="mono">404</p>
	<h1 class="display">No page here.</h1>
	<p>The page may have moved. Search with <kbd>⌘K</kbd>, or start from <a href="/">the docs overview</a>.</p>
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
