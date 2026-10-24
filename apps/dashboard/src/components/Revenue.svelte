<script lang="ts">
	import Check from '@lucide/svelte/icons/check'
	import Copy from '@lucide/svelte/icons/copy'
	import { send } from '../lib/api'
	import { getDash, Resource } from '../lib/dash.svelte'
	import { ago } from '../lib/format'

	type Provider = 'stripe' | 'polar' | 'lemonsqueezy' | 'dodo' | 'custom'
	interface Source {
		provider: Provider
		webhook_url: string
		created_at: number
		last_event_at: number | null
		last_test_at: number | null
		last_error: string | null
	}
	interface Sources {
		sources: Source[]
		last_30_days: { payments: number; attributed: number }
	}

	const dash = getDash()
	const origin = location.origin

	const GUIDES: Record<Provider, { name: string; where: string; events: string[]; made: boolean; checkout: string; success?: string }> = {
		stripe: {
			name: 'Stripe',
			where: 'In Stripe, open Developers → Webhooks and add an endpoint with this URL.',
			events: ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'invoice.paid', 'refund.created'],
			made: false,
			checkout: `stripe.checkout.sessions.create({
  // …your line items
  metadata: { misomoon_ref: ref },
  subscription_data: { metadata: { misomoon_ref: ref } }, // subscriptions only
  success_url: 'https://${dash.current?.domain ?? 'example.com'}/thanks?session_id={CHECKOUT_SESSION_ID}',
})`,
			success: '?session_id={CHECKOUT_SESSION_ID}',
		},
		polar: {
			name: 'Polar',
			where: 'In Polar, open Settings → Webhooks, add an endpoint with this URL and pick the Raw format.',
			events: ['order.paid', 'refund.created', 'refund.updated'],
			made: false,
			checkout: `polar.checkouts.create({
  // …your products
  metadata: { misomoon_ref: ref },
  successUrl: 'https://${dash.current?.domain ?? 'example.com'}/thanks?checkout_id={CHECKOUT_ID}',
})`,
			success: '?checkout_id={CHECKOUT_ID}',
		},
		lemonsqueezy: {
			name: 'Lemon Squeezy',
			where: 'In Lemon Squeezy, open Settings → Webhooks, add one with this URL and the signing secret below.',
			events: ['order_created', 'order_refunded', 'subscription_created', 'subscription_payment_success', 'subscription_payment_refunded'],
			made: true,
			checkout: `createCheckout(storeId, variantId, {
  checkoutData: { custom: { misomoon_ref: ref } },
})`,
		},
		dodo: {
			name: 'Dodo Payments',
			where: 'In Dodo Payments, open Developer → Webhooks and add an endpoint with this URL.',
			events: ['payment.succeeded', 'refund.succeeded'],
			made: false,
			checkout: `client.checkoutSessions.create({
  // …your products
  metadata: { misomoon_ref: ref },
})`,
		},
		custom: {
			name: 'Your server',
			where: 'POST each payment and refund from your server to this URL.',
			events: [],
			made: true,
			checkout: `// your server, when the payment succeeds
fetch(WEBHOOK_URL, { method: 'POST', headers: { Authorization: 'Bearer ' + SECRET },
  body: JSON.stringify({ id: order.id, amount: 49.9, currency: 'EUR', ref, customer: order.customerId }) })`,
		},
	}
	const ORDER: Provider[] = ['stripe', 'polar', 'lemonsqueezy', 'dodo', 'custom']

	const res = new Resource<Sources>(() => (dash.site ? `/api/v1/sites/${dash.site}/revenue?_=${dash.tick}` : null), 0)
	const sources = $derived(res.data?.sources ?? [])
	let chosen = $state<Provider | null>(null)
	const provider = $derived<Provider>(chosen ?? sources[0]?.provider ?? 'stripe')
	const guide = $derived(GUIDES[provider])
	const source = $derived(sources.find((s) => s.provider === provider) ?? null)
	const url = $derived(source?.webhook_url ?? `${origin}/api/webhooks/${provider}/${dash.site}`)

	let secret = $state('')
	/** a secret made by the server, shown once */
	let made = $state<string | null>(null)
	let busy = $state(false)
	let error = $state<string | null>(null)
	let copied = $state<string | null>(null)

	function pick(p: Provider) {
		chosen = p
		secret = ''
		made = null
		error = null
	}

	async function copy(text: string, id: string) {
		try {
			await navigator.clipboard.writeText(text)
			copied = id
			setTimeout(() => (copied = null), 1500)
		} catch {
			error = 'Could not copy; select the text and copy it by hand.'
		}
	}

	async function save() {
		busy = true
		error = null
		try {
			const r = await send<{ secret?: string }>('PUT', `/api/v1/sites/${dash.site}/revenue/${provider}`, guide.made ? {} : { secret })
			made = r.secret ?? null
			secret = ''
			dash.tick++
		} catch (e) {
			error = (e as Error).message
		} finally {
			busy = false
		}
	}

	async function disconnect() {
		busy = true
		try {
			await send('DELETE', `/api/v1/sites/${dash.site}/revenue/${provider}`)
			made = null
			dash.tick++
		} catch (e) {
			error = (e as Error).message
		} finally {
			busy = false
		}
	}

	const status = $derived.by(() => {
		if (!source) return null
		if (source.last_error) return { tone: 'bad', text: source.last_error }
		if (source.last_event_at) return { tone: 'ok', text: `Connected · last event ${ago(source.last_event_at)}` }
		if (source.last_test_at) return { tone: 'ok', text: `Test event received ${ago(source.last_test_at)}. Test payments are not counted.` }
		return { tone: 'wait', text: 'Saved. Waiting for the first event.' }
	})
	const totals = $derived(res.data?.last_30_days)
	const refCode = `const ref = misomoon.ref() // in the browser, before checkout\nfetch('/api/checkout', { method: 'POST', body: JSON.stringify({ ref }) })`
</script>

<section class="card block">
	<h3>Revenue</h3>
	<p class="muted">Connect your payment provider, and each payment shows up under the source, campaign, country and device that brought the buyer. No cookies: a payment finds its visit through a reference the tracker hands to the checkout.</p>
	{#if !dash.canEdit}<p class="muted small">Your role can see revenue but not change these settings.</p>{/if}
	{#if totals && totals.payments}
		<p class="small"><strong>{totals.payments.toLocaleString()}</strong> payments in the last 30 days, <strong>{totals.attributed.toLocaleString()}</strong> linked to a visit.</p>
	{/if}

	<div class="chips" role="tablist" aria-label="Payment provider">
		{#each ORDER as p (p)}
			<button role="tab" aria-selected={provider === p} class:on={provider === p} onclick={() => pick(p)}>
				{GUIDES[p].name}{#if sources.some((s) => s.provider === p)}<span class="dot" aria-label="connected"></span>{/if}
			</button>
		{/each}
	</div>

	<ol class="steps">
		<li>
			<p>{guide.where}</p>
			<div class="code">
				<pre>{url}</pre>
				<button class="btn ghost icon" onclick={() => copy(url, 'url')} aria-label="Copy webhook URL">
					{#if copied === 'url'}<Check size={14} />{:else}<Copy size={14} />{/if}
				</button>
			</div>
		</li>
		{#if guide.events.length}
			<li>
				<p>Send these events:</p>
				<p class="events">{#each guide.events as e (e)}<code>{e}</code>{/each}</p>
			</li>
		{/if}
		<li>
			{#if guide.made}
				{#if made}
					<p>Copy this signing secret now; it won't be shown again.</p>
					<div class="code">
						<pre>{made}</pre>
						<button class="btn ghost icon" onclick={() => copy(made!, 'secret')} aria-label="Copy signing secret">
							{#if copied === 'secret'}<Check size={14} />{:else}<Copy size={14} />{/if}
						</button>
					</div>
				{:else}
					<p>{source ? 'A signing secret is saved. Making a new one stops the old one working.' : 'Make the signing secret, then paste it into ' + (provider === 'custom' ? 'your server' : guide.name) + '.'}</p>
					<div><button class="btn" onclick={save} disabled={busy || !dash.canEdit}>{source ? 'Make a new secret' : 'Make signing secret'}</button></div>
				{/if}
			{:else}
				<p>{source ? 'Replace the signing secret:' : `Paste the ${guide.name} signing secret (it starts with whsec_):`}</p>
				<form
					class="inline"
					onsubmit={(e) => {
						e.preventDefault()
						save()
					}}
				>
					<input class="input grow" type="password" autocomplete="off" spellcheck="false" placeholder="whsec_…" aria-label="Signing secret" bind:value={secret} />
					<button class="btn primary" disabled={busy || !secret.trim() || !dash.canEdit}>{busy ? 'Saving…' : 'Save'}</button>
				</form>
			{/if}
		</li>
	</ol>

	{#if status}
		<div class="status">
			<span class="pill {status.tone}">{status.tone === 'bad' ? 'Problem' : status.tone === 'ok' ? 'Live' : 'Waiting'}</span>
			<span class="small grow">{status.text}</span>
			<button class="btn ghost" onclick={disconnect} disabled={busy || !dash.canEdit}>Disconnect</button>
		</div>
	{/if}
	{#if error}<p class="error-text">{error}</p>{/if}
</section>

<section class="card block">
	<h3>Link payments to visits</h3>
	<p><strong>Payment links:</strong> nothing to do. When a visitor clicks a Stripe, Polar, Lemon Squeezy or Dodo Payments checkout link on your site, the tracker adds a reference to it.</p>
	<p><strong>Checkouts your server creates:</strong> pass <code>misomoon.ref()</code> from the browser to your server, and put it in the checkout as <code>misomoon_ref</code>.</p>
	<div class="code">
		<pre>{refCode}</pre>
		<button class="btn ghost icon" onclick={() => copy(refCode, 'ref')} aria-label="Copy">
			{#if copied === 'ref'}<Check size={14} />{:else}<Copy size={14} />{/if}
		</button>
	</div>
	<div class="code">
		<pre>{guide.checkout}</pre>
		<button class="btn ghost icon" onclick={() => copy(guide.checkout, 'checkout')} aria-label="Copy">
			{#if copied === 'checkout'}<Check size={14} />{:else}<Copy size={14} />{/if}
		</button>
	</div>
	{#if guide.success}
		<p class="muted small">No ref? Send buyers back to a page with the tracker and <code>{guide.success}</code> in the URL. The checkout id links the payment to the visit as well.</p>
	{:else if provider === 'dodo'}
		<p class="muted small">No ref? Dodo Payments adds <code>payment_id</code> to your return URL, and the tracker on that page links the payment to the visit.</p>
	{/if}
	<p class="muted small">Renewals and refunds follow the first payment's visit. A payment with no reference still counts toward total revenue, under Unknown.</p>
</section>

<style>
	.block {
		padding: 20px 22px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	h3 {
		margin: 0;
		font-family: var(--font-display);
		font-stretch: var(--display-stretch);
		font-weight: var(--display-weight);
		text-transform: uppercase;
		letter-spacing: -0.005em;
		line-height: 1;
		font-size: 24px;
	}
	p {
		margin: 0;
		font-size: 13px;
		line-height: 1.55;
	}
	.small {
		font-size: 12px;
	}
	code {
		font-family: var(--font-mono);
		font-size: 12px;
	}
	.chips > button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 30px;
		padding: 0 12px;
		font-size: 13px;
	}
	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--good);
	}
	.steps {
		margin: 4px 0 0;
		padding-left: 20px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	/* a list item, not flex: flex hides the step number and leaves its gutter empty */
	.steps li {
		padding-left: 4px;
		font-size: 13px;
	}
	.steps li > * + * {
		margin-top: 8px;
	}
	.steps li::marker {
		font-weight: 600;
		color: var(--text-3);
	}
	.events {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.events code {
		padding: 2px 6px;
		border-radius: var(--radius-xs);
		background: var(--surface-3);
	}
	.code {
		position: relative;
		border-radius: var(--radius-sm);
		background: var(--surface-2);
		border: 1.5px solid var(--line-strong);
	}
	.code pre {
		margin: 0;
		padding: 14px 48px 14px 14px;
		font-family: var(--font-mono);
		font-size: 12px;
		white-space: pre-wrap;
		word-break: break-all;
		color: var(--text-2);
	}
	.code button {
		position: absolute;
		top: 8px;
		right: 8px;
	}
	.inline {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.grow {
		flex: 1;
		min-width: 160px;
	}
	.status {
		display: flex;
		align-items: center;
		gap: 10px;
		padding-top: 12px;
		border-top: 1px dashed var(--line);
	}
	.pill {
		font-size: 10.5px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		padding: 2px 7px;
		border-radius: var(--radius-xs);
		background: var(--surface-3);
		color: var(--text-2);
	}
	.pill.ok {
		background: var(--good-soft);
		color: var(--good);
	}
	.pill.bad {
		background: var(--bad-soft);
		color: var(--bad);
	}
	.error-text {
		color: var(--bad);
		font-size: 13px;
	}
</style>
