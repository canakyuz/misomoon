<script lang="ts">
	import { docLink } from '#lib/links.ts'
	import { CTA, EVENT, EVERY_PLAN, LARGEST, PLANS, SUPPORT, TRIAL_DAYS, TRIAL_LIMITS, short, signupUrl, step, words, years } from '#lib/pricing.ts'
	import { reveal } from '#lib/reveal.ts'

	let { appUrl, docsUrl }: { appUrl: string; docsUrl: string | null } = $props()
	const signup = $derived(signupUrl(appUrl))
</script>

<div class="plans">
	{#each PLANS as plan, i (plan.id)}
		{@const below = PLANS[i - 1]}
		<article class="plan" class:popular={plan.popular} {@attach reveal(i * 60)}>
			{#if plan.popular}<span class="badge mono">Recommended</span>{/if}
			<h3 class="mono">{plan.name}</h3>
			<p class="price"><b class="display">${plan.price}</b><span>a month</span></p>
			<ul class="limits">
				<li><b>{short(plan.events)}</b> events a month</li>
				<li>{#if plan.sites === null}<b>Unlimited</b> sites{:else}<b>{plan.sites}</b> {plan.sites === 1 ? 'site' : 'sites'}{/if}</li>
				<li>Stats kept <b>{years(plan.retentionDays)}</b></li>
			</ul>
			<p class="who">{plan.who}</p>
			{#if below}<p class="step"><b>Compared with {below.name}:</b> {step(plan, below)}</p>{/if}
			<p class="trial mono">{TRIAL_DAYS} days free · no card</p>
			<a class="cta {plan.popular ? 'primary' : 'ghost'}" href={signup}>{CTA}</a>
		</article>
	{/each}
</div>
<p class="event" {@attach reveal(90)}>{EVENT} The trial has {TRIAL_LIMITS.name}’s limits.</p>
<div class="every" {@attach reveal(120)}>
	<h3 class="mono">Every plan includes</h3>
	<ul>
		{#each EVERY_PLAN as f (f)}<li>{f}</li>{/each}
	</ul>
	<p>
		More than {words(LARGEST)} events a month? Email <a href="mailto:{SUPPORT}">{SUPPORT}</a>. Rather run it yourself? The
		<a href={docLink(docsUrl, 'self-hosting')}>open-source version</a> is free.
	</p>
</div>

<style>
	.plans {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 22px;
		margin-top: 60px;
		align-items: stretch;
	}
	.plan {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 24px 22px 22px;
		border: 2px solid var(--ink);
		border-radius: 14px;
		box-shadow: 4px 4px 0 var(--ink);
		background: var(--surface);
		color: var(--text);
	}
	.plan.popular {
		/* stays light in the night edition, so ink stays ink on it */
		--ink: var(--ink-print);
		--text: var(--ink-print);
		--text-2: var(--print-2);
		--text-3: var(--print-3);
		--surface: var(--print-surface);
		background: var(--mustard);
		color: var(--ink);
		box-shadow: 8px 8px 0 var(--ink);
		/* stands taller than its neighbours, so the eye lands on it first */
		margin-block: -14px;
		padding-block: 38px 36px;
	}
	.badge {
		position: absolute;
		top: -13px;
		right: 18px;
		padding: 3px 10px;
		border: 1.5px solid var(--ink);
		border-radius: 999px;
		background: var(--block);
		color: var(--on-block);
		font-size: 10.5px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	h3 {
		margin: 0;
		font-size: 12px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.price {
		display: flex;
		align-items: baseline;
		gap: 8px;
		margin: 4px 0 0;
	}
	.price b {
		font-size: 64px;
		line-height: 0.85;
	}
	.price span {
		font-size: 14px;
		font-weight: 500;
	}
	.limits {
		display: grid;
		gap: 6px;
		margin: 4px 0 2px;
		padding: 0 0 12px;
		list-style: none;
		font-size: 15px;
		border-bottom: 1.5px dashed currentColor;
	}
	.limits li::before {
		content: '✓ ';
		color: var(--miso);
		font-weight: 700;
	}
	.popular .limits li::before {
		color: var(--ink);
	}
	.who {
		flex: 1;
		margin: 0;
		font-size: 14px;
		line-height: 1.45;
		opacity: 0.85;
	}
	.step {
		margin: 0;
		font-size: 13.5px;
		line-height: 1.45;
	}
	.event {
		max-width: 820px;
		margin: 40px 0 0;
		font-size: 14.5px;
		line-height: 1.55;
		color: var(--text-2);
	}
	.trial {
		margin: 0;
		font-size: 11px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		opacity: 0.8;
	}
	.plan .cta {
		justify-content: center;
		margin-top: 8px;
	}
	.every {
		display: grid;
		grid-template-columns: 220px 1fr;
		gap: 18px 40px;
		margin-top: 40px;
		padding-top: 26px;
		border-top: 2px solid var(--ink);
	}
	.every ul {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px 28px;
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: 15px;
	}
	.every li::before {
		content: '✓ ';
		color: var(--miso);
		font-weight: 700;
	}
	.every p {
		grid-column: 2;
		margin: 8px 0 0;
		font-size: 14.5px;
		color: var(--text-2);
	}
	.every a {
		color: var(--miso);
		font-weight: 600;
	}
	@media (max-width: 960px) {
		.plans {
			grid-template-columns: 1fr;
		}
		.plan.popular {
			margin-block: 0;
			padding-block: 24px 22px;
		}
		.every {
			grid-template-columns: 1fr;
		}
		.every p {
			grid-column: auto;
		}
	}
	@media (max-width: 640px) {
		.every ul {
			grid-template-columns: 1fr;
		}
	}
</style>
