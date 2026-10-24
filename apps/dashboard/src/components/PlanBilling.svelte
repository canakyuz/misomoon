<script lang="ts">
	import { PLANS, periodText, type Plan, type PlanId } from '@misomoon/core/plans'
	import { checkoutReturn, send } from '../lib/api'
	import { getDash } from '../lib/dash.svelte'

	// Paying for misomoon Cloud through Polar, inside the plan card of Settings > Team: the
	// three plans with their prices, Choose (Polar's checkout) or Switch (the subscription the
	// team pays for), and Manage billing (Polar's portal). Nothing without billing on this
	// server (docs/billing.md).
	interface Props {
		teamId: string
		/** the team's plan id; null on the trial or with no plan */
		plan: string | null
		/** owners and billing members */
		canManage: boolean
	}
	let { teamId, plan, canManage }: Props = $props()

	const dash = getDash()
	const team = $derived(dash.me?.teams.find((t) => t.id === teamId) ?? null)
	const status = $derived(team?.plan_status ?? null)
	const ends = $derived(team?.plan_period_end ?? null)
	const current = $derived(PLANS.find((p) => p.id === plan) ?? null)

	let busy = $state<PlanId | 'portal' | null>(null)
	let confirming = $state<Plan | null>(null)
	let notice = $state<string | null>(null)
	let error = $state<string | null>(null)

	// Back from Polar's checkout, the plan shows once Polar's webhook arrives: look again
	// every few seconds for a minute, and keep the buttons off so nobody pays twice.
	let waiting = $state(checkoutReturn)
	const waitSince = Date.now()
	$effect(() => {
		if (!waiting) return
		if (status) {
			waiting = false
			return
		}
		const timer = setInterval(() => {
			if (Date.now() - waitSince > 60_000) waiting = false
			else dash.load().catch(() => {})
		}, 3000)
		return () => clearInterval(timer)
	})

	const date = (ms: number | null) => (ms ? new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '')
	const nameOf = (id: string | null | undefined) => PLANS.find((p) => p.id === id)?.name ?? 'no plan'
	const sites = (p: Plan) => (p.sites === null ? 'Any number of sites' : p.sites === 1 ? '1 site' : `${p.sites} sites`)
	/** what the plan's button does: nothing for the plan the team pays for, unless it is canceled */
	const action = (p: Plan): 'choose' | 'switch' | 'resume' | null => {
		if (!status) return p.id === plan ? null : 'choose'
		if (p.id === plan) return status === 'canceled' ? 'resume' : null
		return 'switch'
	}
	const LABEL = { choose: 'Choose', switch: 'Switch to', resume: 'Keep' }

	async function choose(p: Plan) {
		confirming = null
		busy = p.id
		notice = error = null
		try {
			const r = await send<{ url: string | null; plan?: PlanId | null; pending?: { plan: PlanId | null; applies_at: number | null } | null }>('POST', `/api/v1/teams/${encodeURIComponent(teamId)}/checkout`, { plan: p.id })
			if (r.url) {
				// to Polar's checkout; the button stays busy while the page leaves
				location.assign(r.url)
				return
			}
			await dash.load()
			notice = r.pending?.plan
				? `${nameOf(r.pending.plan)} starts on ${date(r.pending.applies_at)}. Until then the team stays on ${nameOf(r.plan)}.`
				: `The team is on ${nameOf(r.plan)} now.`
			busy = null
		} catch (e) {
			error = (e as Error).message
			busy = null
		}
	}

	async function manage() {
		busy = 'portal'
		notice = error = null
		try {
			location.assign((await send<{ url: string }>('POST', `/api/v1/teams/${encodeURIComponent(teamId)}/portal`)).url)
		} catch (e) {
			error = (e as Error).message
			busy = null
		}
	}
</script>

{#if dash.me?.billing}
	<div class="billing">
		{#if status === 'canceled'}
			<p class="state warn" role="status">{current?.name ?? 'The plan'} is canceled. It stays until {date(ends)}, then the team has no plan. To keep it, select <strong>Keep {current?.name}</strong>.</p>
		{:else if status === 'past_due'}
			<p class="state bad" role="status">The last payment failed. Polar tries the card again for up to 21 days, and the plan stays until then. Update the card in <strong>Manage billing</strong>.</p>
		{:else if waiting}
			<p class="state" role="status">Payment received. The plan shows here once Polar confirms it, usually within a minute.</p>
		{/if}

		<ul class="plans">
			{#each PLANS as p (p.id)}
				{@const does = action(p)}
				<li class:current={p.id === plan}>
					<div class="top">
						<strong class="name">{p.name}</strong>
						{#if p.id === plan}<span class="tag">{status === 'canceled' ? 'Ends ' + date(ends) : 'Current'}</span>{/if}
					</div>
					<p class="price"><span class="num">${p.price}</span> a month</p>
					<ul class="facts">
						<li>{p.events.toLocaleString('en')} events a month</li>
						<li>{sites(p)}</li>
						<li>Stats kept up to {periodText(p.retentionDays)}</li>
					</ul>
					{#if canManage && does}
						<button class="btn" class:primary={does === 'resume'} disabled={busy !== null || waiting} onclick={() => (does === 'switch' ? (confirming = p) : choose(p))}>
							{busy === p.id ? 'Opening…' : `${LABEL[does]} ${p.name}`}
						</button>
					{/if}
				</li>
			{/each}
		</ul>

		{#if confirming}
			<div class="confirm" role="group" aria-label="Switch plans">
				<p>
					Switch {team?.name ?? 'the team'} from {current?.name ?? 'its plan'} to {confirming.name}, ${confirming.price} a month? {status === 'canceled' ? 'The canceled subscription goes on, and the' : 'The'} card on file pays the new price. Polar works out the difference for the rest of this period.
				</p>
				<div class="row">
					<button class="btn primary" disabled={busy !== null} onclick={() => choose(confirming!)}>Switch now</button>
					<button class="btn ghost" onclick={() => (confirming = null)}>Cancel</button>
				</div>
			</div>
		{/if}

		{#if status === 'active' && ends}<p class="muted small">Renews on {date(ends)}.</p>{/if}
		{#if canManage && team?.billing_portal}
			<div class="row">
				<button class="btn" disabled={busy !== null} onclick={manage}>{busy === 'portal' ? 'Opening…' : 'Manage billing'}</button>
				<span class="muted small">Card, invoices, and cancelling, in Polar.</span>
			</div>
		{/if}
		{#if !canManage}<p class="muted small">Owners and billing members of the team choose and pay for the plan.</p>{/if}
		{#if notice}<p class="small" role="status">{notice}</p>{/if}
		{#if error}<p class="error" role="alert">{error}</p>{/if}
		<p class="muted small">Prices are in US dollars. Polar is the merchant of record: it charges the card, adds the sales tax or VAT your country needs, and sends the invoices.</p>
	</div>
{/if}

<style>
	.billing {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-top: 4px;
	}
	p {
		margin: 0;
		font-size: 13px;
		line-height: 1.55;
	}
	.small {
		font-size: 12px;
	}
	.state {
		padding: 8px 12px;
		border-radius: var(--radius-sm);
		background: var(--surface-3);
	}
	.state.warn {
		background: var(--warn-soft);
	}
	.state.bad {
		background: var(--bad-soft);
		color: var(--bad);
	}
	.plans {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 12px;
	}
	.plans > li {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 14px;
		border: 1.5px solid var(--edge);
		border-radius: var(--radius);
		background: var(--surface);
	}
	/* the plan the team is on: printed with the hard ink shadow, like a ticket pulled from the stack */
	.plans > li.current {
		box-shadow: var(--shadow);
		background: var(--surface-2);
	}
	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.name {
		font-size: 15px;
	}
	.tag {
		font-family: var(--font-mono);
		font-size: 10.5px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		padding: 2px 7px;
		border-radius: var(--radius-xs);
		background: var(--miso-soft);
		color: var(--miso);
	}
	.price {
		font-size: 12px;
		color: var(--text-3);
	}
	.price .num {
		font-size: 22px;
		font-weight: 700;
		color: var(--text);
		margin-right: 2px;
	}
	.facts {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-size: 12px;
		color: var(--text-2);
		flex: 1;
	}
	.plans .btn {
		align-self: flex-start;
	}
	.confirm {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 12px 14px;
		border: 1.5px solid var(--edge);
		border-radius: var(--radius);
		background: var(--surface-2);
	}
	.row {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}
	.error {
		color: var(--bad);
		font-size: 13px;
	}
</style>
