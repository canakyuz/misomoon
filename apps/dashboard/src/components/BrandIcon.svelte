<script lang="ts">
	import Sparkles from '@lucide/svelte/icons/sparkles'
	import { BRANDS, type Brand } from '@misomoon/brand/brands'

	let { brand, size = 16 }: { brand: Brand | null; size?: number } = $props()
</script>

<!-- a brand mark in the text color, or a generic mark for a tool without one -->
{#if brand}
	<svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true"><path d={BRANDS[brand]} /></svg>
{:else}
	<Sparkles {size} aria-hidden="true" />
{/if}
