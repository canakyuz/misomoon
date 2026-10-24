<script lang="ts">
	// The visible trail that matches the page's BreadcrumbList JSON-LD. The last crumb is this page.
	let { items }: { items: [name: string, path: string][] } = $props()
</script>

<nav aria-label="Breadcrumb">
	<ol class="crumbs">
		<li><a href="/">Home</a></li>
		{#each items as [name, path], i (path)}
			<li>
				{#if i === items.length - 1}<span aria-current="page">{name}</span>{:else}<a href={path}>{name}</a>{/if}
			</li>
		{/each}
	</ol>
</nav>
