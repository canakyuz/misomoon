<script lang="ts">
	import { BRANDS } from '@misomoon/brand/brands'
	import { brandsOf } from '#lib/guides.ts'

	/** first: only the page's first mark, where a row has room for one */
	let { slug, size = 16, first = false }: { slug: string; size?: number; first?: boolean } = $props()
	const marks = $derived(first ? brandsOf(slug).slice(0, 1) : brandsOf(slug))
</script>

{#if marks.length}
	<span class="marks" aria-hidden="true">
		{#each marks as b (b)}
			<svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor"><path d={BRANDS[b]} /></svg>
		{/each}
	</span>
{/if}

<style>
	.marks {
		display: inline-flex;
		flex: none;
		gap: 4px;
		vertical-align: -0.15em;
	}
	svg {
		display: block;
	}
</style>
