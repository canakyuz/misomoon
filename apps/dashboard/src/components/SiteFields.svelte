<script lang="ts">
	import { COMMON_CURRENCIES, currencies, currencyName, zonesWith } from '../lib/places'
	import Select from './Select.svelte'

	let { timezone = $bindable(), currency = $bindable() }: { timezone: string; currency: string } = $props()

	const zones = $derived(zonesWith(timezone).map((z) => ({ value: z, label: z.replaceAll('_', ' ') })))
	const money = [
		...COMMON_CURRENCIES.map((c) => ({ value: c, label: `${c} · ${currencyName(c)}`, group: 'Common' })),
		...currencies.filter((c) => !COMMON_CURRENCIES.includes(c)).map((c) => ({ value: c, label: `${c} · ${currencyName(c)}`, group: 'All' })),
	]
</script>

<label>
	<span>Timezone</span>
	<small>Where “today” starts and ends in your reports</small>
	<Select label="Timezone" bind:value={timezone} options={zones} />
</label>
<label>
	<span>Revenue currency</span>
	<small>Purchases you track are added up in this currency</small>
	<Select label="Revenue currency" bind:value={currency} options={money} />
</label>

<style>
	label {
		display: flex;
		flex-direction: column;
		gap: 3px;
		min-width: 0;
	}
	label span {
		font-size: 12.5px;
		font-weight: 600;
	}
	label small {
		font-size: 11.5px;
		color: var(--text-3);
		margin-bottom: 4px;
	}
	label :global(.select) {
		width: 100%;
		height: 36px;
	}
</style>
