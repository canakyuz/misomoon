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
	// Where the data is stored: only the regions this server has shards in (SHARD_EU_0 and
	// so on), none on a server without them. Guessed from the timezone until picked.
	const regions = $derived(dash.me?.regions ?? [])
	const nearest = $derived(regions.find((r) => r === regionFromTimezone(site.timezone)))
	let picked = $state<Region | ''>('')
	const region = $derived(picked && regions.includes(picked) ? picked : (nearest ?? regions[0]))
	// EU and US shards are in D1's jurisdictions; Asia-Pacific is a location hint D1 doesn't promise
	const WHERE: Record<Region, string> = { eu: 'Stored inside the EU', us: 'Stored inside the US', apac: 'Stored near Asia-Pacific, as a preference' }
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

	{#if regions.length > 1}
		<fieldset class="regions">
			<legend>Where to store its stats <small>You can't move a site to another region later.</small></legend>
			<div class="choices" role="radiogroup" aria-label="Data region">
				{#each regions as r (r)}
					<button type="button" role="radio" aria-checked={r === region} class:on={r === region} onclick={() => (picked = r)}>
						<b>{regionName[r]}{#if r === nearest}<i>Nearest</i>{/if}</b>
						<span>{WHERE[r]}</span>
					</button>
				{/each}
			</div>
		</fieldset>
	{:else if region}
		<p class="one">Its stats are stored in the {regionName[region]}, the only region this server has.</p>
	{/if}

	{#if more}
		<div class="more">
			<SiteFields bind:timezone={site.timezone} bind:currency={site.currency} />
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
			{zoneCity(site.timezone)} time · revenue in {currencyName(site.currency)}{#if teams.length > 1}&nbsp;· {teams[0].name}{/if}
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
	.regions {
		margin: 16px 0 0;
		padding: 0;
		border: 0;
		min-width: 0;
	}
	legend {
		padding: 0;
		margin-bottom: 8px;
		font-size: 12.5px;
		font-weight: 600;
	}
	legend small {
		display: block;
		margin-top: 2px;
		font-size: 11.5px;
		font-weight: 400;
		color: var(--text-3);
	}
	.choices {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 8px;
	}
	.choices button {
		display: flex;
		flex-direction: column;
		gap: 3px;
		padding: 10px 12px;
		border: 1.5px solid var(--line-strong);
		border-radius: var(--radius-sm);
		background: var(--surface);
		color: var(--text-2);
		text-align: left;
		transition:
			border-color var(--dur-fast),
			background var(--dur-fast);
	}
	.choices button:hover {
		background: var(--surface-hover);
	}
	.choices button.on {
		border-color: var(--vermilion);
		box-shadow: inset 0 0 0 1px var(--vermilion);
		color: var(--text);
	}
	.choices button:focus-visible {
		outline: 2px solid var(--cobalt);
		outline-offset: 2px;
	}
	.choices b {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		font-weight: 600;
		color: var(--text);
	}
	.choices i {
		font-style: normal;
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		padding: 1px 5px;
		border-radius: var(--radius-xs);
		background: var(--surface-3);
		color: var(--text-2);
	}
	.choices span {
		font-size: 11.5px;
		color: var(--text-3);
	}
	.one {
		margin: 10px 0 0;
		font-size: 12.5px;
		color: var(--text-3);
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
