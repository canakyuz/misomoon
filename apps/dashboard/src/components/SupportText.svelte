<script lang="ts">
	import { SUPPORT_EMAIL } from '@misomoon/core/plans'

	// A message from the API, with the support address in it as a link: a plan limit says
	// to email support to upgrade.
	let { text }: { text: string } = $props()
	const parts = $derived(text.split(SUPPORT_EMAIL))
</script>

{#each parts as part, i (i)}{#if i}<a href="mailto:{SUPPORT_EMAIL}">{SUPPORT_EMAIL}</a>{/if}{part}{/each}

<style>
	a {
		color: inherit;
		font-weight: 600;
		text-decoration: underline;
		text-underline-offset: 2px;
	}
</style>
