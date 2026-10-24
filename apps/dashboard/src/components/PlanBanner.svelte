<script lang="ts">
	import CircleAlert from '@lucide/svelte/icons/circle-alert'
	import { can } from '@misomoon/core/roles'
	import { getDash } from '../lib/dash.svelte'
	import { planBanner } from '../lib/plan'

	// On misomoon Cloud, a strip above every view when the open site's team needs to act: its
	// trial ends within 2 days, it has no plan, or this month's events passed the plan's.
	const dash = getDash()
	const team = $derived(dash.me?.plans && !dash.isSample ? dash.me.teams.find((t) => t.id === dash.current?.team_id) : undefined)
	const banner = $derived(team?.plan ? planBanner(team.plan) : null)
	// the people who can open Settings > Team
	const canSee = $derived(dash.canManage || can(dash.role, 'billing'))
</script>

{#if banner}
	<div class="plan-banner {banner.tone}" role="status">
		<CircleAlert size={16} aria-hidden="true" />
		<p>{banner.text}{canSee ? '' : ' Ask an owner of the team.'}</p>
		{#if canSee && !(dash.view === 'settings' && dash.settingsTab === 'team')}
			<button
				class="btn"
				onclick={() => {
					dash.settingsTab = 'team'
					dash.view = 'settings'
				}}>See the plan</button
			>
		{/if}
	</div>
{/if}

<style>
	.plan-banner {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 20px;
		padding: 10px 12px 10px 14px;
		border: 1.5px solid var(--edge);
		border-radius: var(--radius);
		box-shadow: var(--shadow-sm);
		background: var(--warn-soft);
		font-size: 13.5px;
	}
	.plan-banner.bad {
		background: var(--bad-soft);
	}
	.plan-banner :global(svg) {
		flex: none;
		color: var(--warn);
	}
	.plan-banner.bad :global(svg) {
		color: var(--bad);
	}
	p {
		flex: 1;
		margin: 0;
		font-weight: 600;
	}
	.btn {
		flex: none;
	}
	@media (max-width: 640px) {
		.plan-banner {
			flex-wrap: wrap;
		}
		p {
			flex-basis: calc(100% - 26px);
		}
	}
</style>
