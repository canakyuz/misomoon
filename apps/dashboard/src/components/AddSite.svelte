<script lang="ts">
	import { send, type Site } from '../lib/api'
	import { getDash } from '../lib/dash.svelte'
	import { regionFromTimezone, type Region } from '@misomoon/core/shard'
	import { browserZone, currencyName, guessCurrency, regionName, zoneCity } from '../lib/places'
	import Select from './Select.svelte'
	import SiteFields from './SiteFields.svelte'
	import SupportText from './SupportText.svelte'

	let { onadded }: { onadded?: (site: Site) => void } = $props()

	const dash = getDash()
	// teams where you may add sites
	const teams = $derived((dash.me?.teams ?? []).filter((t) => ['owner', 'admin', 'editor'].includes(t.role)))

	// Only the domain needs the user: timezone and currency are guessed, and stay one tap away.
	let site = $state({ domain: '', timezone: browserZone, currency: guessCurrency() })
	let team = $state('')
	// Where the data is stored, on a server with regions: guessed from the timezone until picked.
	const regions = $derived(dash.me?.regions ?? [])
	let picked = $state<Region | ''>('')
	const region = $derived(picked || (regions.find((r) => r === regionFromTimezone(site.timezone)) ?? regions[0]))
	let more = $state(false)
	let busy = $state(false)
	let error = $state<string | null>(null)

	async function add(e: SubmitEvent) {
		e.preventDefault()
		if (busy || !site.domain.trim()) return
		busy = true
		error = null
		try {
			const s = await send<Site>('POST', '/api/v1/sites', { ...site, team: team || teams[0]?.id, region })
			await dash.load()
			dash.switchSite(s.id)
			site.domain = ''
			onadded?.(s)
		} catch (err) {
			error = (err as Error).message
		} finally {
			busy = false
		}
	}
</script>

<form onsubmit={add}>
	<div class="row">
		<input
			class="input grow"
			aria-label="Domain"
			placeholder="example.com"
			inputmode="url"
			autocapitalize="off"
			autocomplete="off"
			spellcheck="false"
			bind:value={site.domain}
		/>
		<button class="btn primary" type="submit" disabled={!site.domain.trim() || busy}>{busy ? 'Adding…' : 'Add site'}</button>
	</div>

	{#if more}
		<div class="more">
			<SiteFields bind:timezone={site.timezone} bind:currency={site.currency} />
			{#if regions.length > 1}
				<label>
					<span>Data region</span>
					<small>Where its stats are stored. It can't be changed later</small>
					<Select label="Data region" bind:value={() => region ?? '', (v) => (picked = v as Region)} options={regions.map((r) => ({ value: r, label: regionName[r] }))} />
				</label>
			{/if}
			{#if teams.length > 1}
				<label>
					<span>Team</span>
					<small>Who else can see this site</small>
					<Select label="Team" bind:value={team} options={teams.map((t) => ({ value: t.id, label: t.name }))} />
				</label>
			{/if}
		</div>
	{:else}
		<p class="defaults">
			{zoneCity(site.timezone)} time · revenue in {currencyName(site.currency)}{#if regions.length > 1}&nbsp;· stored in {regionName[region]}{/if}{#if teams.length > 1}&nbsp;· {teams[0].name}{/if}
			<button type="button" class="change" onclick={() => ((more = true), (team ||= teams[0]?.id ?? ''))}>Change</button>
		</p>
	{/if}
</form>
<!-- a plan's site limit names the plan and the support address, so the message is shown as the API wrote it -->
{#if error}<p class="error" role="alert"><SupportText text={error} /></p>{/if}

<style>
	.row {
		display: flex;
		gap: 8px;
	}
	.row .input,
	.row .btn {
		height: 40px;
	}
	.grow {
		flex: 1;
		min-width: 0;
	}
	.defaults {
		margin: 10px 0 0;
		font-size: 12.5px;
		color: var(--text-3);
	}
	.change {
		margin-left: 4px;
		color: var(--text);
		font-weight: 500;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.more {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 14px;
		margin-top: 16px;
	}
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
	.error {
		margin: 8px 0 0;
		color: var(--bad);
		font-size: 13px;
	}
</style>
