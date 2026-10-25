# Connect payments

This guide sends payments from Stripe, Polar, Lemon Squeezy, Dodo Payments, or your own
server to misomoon. Each payment then counts toward the source, campaign, country, and
device of the visit that brought the buyer. Renewals and refunds count toward that same
visit. You don't need cookies for any of this.

## How a payment finds its visit

The tracker sets no cookies, so misomoon can't recognise a buyer by a stored id. The
checkout carries a reference from the visit to the payment instead:

1. On your site, the tracker makes a ref such as `mm_3f9c0a…` and records it with the
   visit's source, country, and device.
2. The ref travels into the checkout: in a payment-link URL, or in the metadata of a
   checkout that your server creates.
3. The payment provider sends the ref back to misomoon in its webhook. misomoon finds the
   visit by the ref and writes a `Payment` event with that visit's details.

A payment can also find its visit by the checkout id on your success page. Stripe adds
`session_id`, Polar adds `checkout_id`, and Dodo Payments adds `payment_id` or
`subscription_id` to the return URL. When the tracker counts that page, the server reads
the id from its URL and records it with the visit.

The order of events doesn't matter. If the webhook arrives first, misomoon stores the
payment and credits it when the ref or the id turns up. A payment always ends up with its
strongest key: its own ref beats the success page, and both beat the buyer's earlier
purchases. A refund follows its payment.

Once a payment has a visit, misomoon remembers its subscription and customer for 400
days. A renewal a year later still counts toward the visit that started the
subscription. A ref or a checkout id is kept for 30 days.

A payment that finds no visit still counts toward total revenue. Reports list it under
**Unknown**.

Totals add the revenue of every event, the tracker's included. If your site also sends
`misomoon('Purchase', { revenue })` for a sale that a webhook reports, that sale counts
twice. Leave `revenue` out of the tracker event once a provider is connected.

## Connect a provider

1. Open **Settings** > **Revenue** and pick your provider.
2. Copy the webhook URL. It looks like `https://analytics.example.com/api/webhooks/stripe/shop`:
   `/api/webhooks/<provider id>/<site id>`, with the provider ids in the table below.
3. In the provider's dashboard, add a webhook endpoint with that URL and the events below.
4. Save the signing secret. For Stripe, Polar, and Dodo Payments, paste their secret into
   misomoon. For Lemon Squeezy and your own server, click **Make signing secret** in
   misomoon and paste it into the provider.

Connecting a provider ticks **Payments** under **Settings** > **Install** > **What to
track**. That feature tags payment links, hands out `misomoon.ref()`, and reads checkout
ids from success pages. Without it, `misomoon.ref()` returns `undefined`, so a checkout
gets no ref but still works.

| Provider | Id | Where to add the webhook | Events |
| --- | --- | --- | --- |
| Stripe | `stripe` | **Developers** > **Webhooks** | `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`, `invoice_payment.paid`, `refund.created`, `refund.updated`, `refund.failed` |
| Polar | `polar` | **Settings** > **Webhooks**, format **Raw** | `order.paid`, `refund.created`, `refund.updated` |
| Lemon Squeezy | `lemonsqueezy` | **Settings** > **Webhooks** | `order_created`, `order_refunded`, `subscription_created`, `subscription_payment_success`, `subscription_payment_refunded` |
| Dodo Payments | `dodo` | **Developer** > **Webhooks** | `payment.succeeded`, `refund.succeeded` |
| Your server | `custom` | Your own code ([Send payments from your own server](#send-payments-from-your-own-server)) | Payments and refunds |

Stripe API versions from 2025-03-31 on leave the payment out of an invoice, so
`invoice_payment.paid` tells misomoon which payment paid it. Without that event, a refund
of a subscription payment still counts toward total revenue, under **Unknown**.

A refund counts when Stripe creates it, or when Polar marks it succeeded. A Stripe refund
can still fail weeks later. When a refund fails or is canceled, misomoon deletes its
`Refund` event, and the payment counts in full again.

**Settings** > **Revenue** shows the time of the last event. If a webhook fails its
signature check, the page shows the error. Test-mode payments from Stripe and Lemon
Squeezy mark the connection as working but don't count toward revenue.

### Test Polar on your machine

On a misomoon server running in `wrangler dev`, the
[Polar CLI](https://polar.sh/docs/integrate/cli/webhooks) can deliver Polar's webhooks
without a public URL. Use a site kept for testing, because the sample orders count as
revenue.

1. Sign in to the CLI with `polar auth login --sandbox`, then forward to the site's
   webhook URL. It prints a secret.

   ```sh
   polar webhook listen http://localhost:8787/api/webhooks/polar/<site id>
   ```

2. Paste that secret into **Settings** > **Revenue** > **Polar**. misomoon takes the
   CLI's 32-character secret as well as one that starts with `whsec_`.
3. Send a sample order with `polar webhook trigger order.paid`. The CLI shows misomoon's
   answer, and **Settings** > **Revenue** shows the time of the event.

## Pass the ref to the checkout

If you use payment links, you don't need to change anything. When a visitor clicks a
link to `buy.stripe.com`, `buy.polar.sh`, a Lemon Squeezy checkout, or
`checkout.dodopayments.com`, the tracker adds the ref to the link's URL. A link that
already carries its own `client_reference_id` keeps it.

If your server creates the checkout, get the ref in the browser with `misomoon.ref()`,
send it to your server, and put it in the checkout's metadata as `misomoon_ref`:

```js
// in the browser
const ref = misomoon.ref()
await fetch('/api/checkout', { method: 'POST', body: JSON.stringify({ plan, ref }) })
```

```js
// Stripe, on your server
stripe.checkout.sessions.create({
	// your line items
	metadata: { misomoon_ref: ref },
	subscription_data: { metadata: { misomoon_ref: ref } },
	success_url: 'https://example.com/thanks?session_id={CHECKOUT_SESSION_ID}',
})
```

| Provider | Where the ref goes |
| --- | --- |
| Stripe | `metadata.misomoon_ref`, or `client_reference_id` |
| Polar | `metadata.misomoon_ref`. Add `?checkout_id={CHECKOUT_ID}` to the success URL. |
| Lemon Squeezy | `checkout_data.custom.misomoon_ref` |
| Dodo Payments | `metadata.misomoon_ref` |

In a bundled app, `ref()` from `@misomoon/sdk/web` waits for the tracker and returns the
same ref. A React Native app gets one from `misomoon.ref()`. Your server can also make
the ref from the visitor's request with the Node SDK, so the browser sends nothing extra.
The [SDK guide](sdk.md#pass-the-visit-to-a-checkout-your-server-creates) shows all three.

`misomoon.ref()` returns the same ref for the whole page view and a new one after the
next page view. If the tracker isn't loaded, for example because an ad blocker stopped
it, guard the call: `window.misomoon?.ref?.()`. A checkout without a ref still works.

To turn off the link tagging on some pages, add `data-disable="payments"` to the script
tag there. `misomoon.ref()` keeps working. To turn off the success-page ids too, untick
**Payments**.

## Send payments from your own server

For a WooCommerce store, the WordPress plugin sends orders and refunds to the custom
webhook for you ([Count WooCommerce orders](wordpress.md#count-woocommerce-orders)).

For a provider that misomoon doesn't support, post each payment to the custom webhook
URL. From Node, Bun, Deno, or Workers, `payment()` in the SDK signs and retries the
request for you ([Send payments from providers without a webhook](sdk.md#send-payments-from-providers-without-a-webhook)).
From another language, sign the request with one of these headers:

- `Authorization: Bearer <secret>`
- `X-Misomoon-Signature: sha256=<hex HMAC-SHA256 of the raw body, keyed with the secret>`

```sh
curl -X POST "https://analytics.example.com/api/webhooks/custom/shop" \
	-H "Authorization: Bearer $MISOMOON_WEBHOOK_SECRET" -H "Content-Type: application/json" \
	-d '{"id": "order_1042", "amount": 49.9, "currency": "EUR", "ref": "mm_3f9c0a…", "customer": "cus_77"}'
```

| Field | Meaning |
| --- | --- |
| `id` | Your payment id, unique per site. Required. A second request with the same id is ignored, so retries are safe. |
| `amount` | Positive, in major units: `49.9` for 49.90. Required. |
| `currency` | ISO 4217 code. Required. |
| `type` | `payment` (the default) or `refund`. |
| `refund_of` | For a refund, the `id` of the payment it returns. Required for refunds. |
| `ref` | The value of `misomoon.ref()` from the buyer's visit. |
| `customer`, `subscription` | Your ids. A later payment with the same customer or subscription counts toward the first payment's visit. |
| `billing` | `new`, `renewal`, or `one_time`. Defaults to `renewal` when `subscription` is set. |
| `ts` | When the payment happened: Unix seconds, milliseconds, or an ISO 8601 string. Defaults to now. |
| `test` | `true` to check the connection without counting the payment. |

The response is `{"ok": true, "counted": 1}`. A malformed body returns `400` with the
reason, and a bad signature returns `401`.

## Read revenue on the dashboard

Payments are events named `Payment` and refunds are events named `Refund`, with a
negative amount. Each event has the prop `provider`, and a payment also has `billing`. They appear in
**What they did**, and the revenue they carry shows next to each source, country, and
device. To see revenue for one provider, filter by the prop `provider`.

Totals count only payments in the site's currency, the same rule as for
[revenue events](tracking.md#track-revenue). Payments in other currencies are stored but
left out, because misomoon doesn't convert currencies.

## Limits

- A visit and a payment are linked only through a ref, a checkout id, or a subscription
  or customer that an earlier payment already linked. misomoon never matches by email or
  IP address.
- A payment on a later day than its visit counts toward that visit's source, country, and
  device. It doesn't count toward the visit's unique visitors, because visitor ids change
  every day.
- Test mode is detected for Stripe and Lemon Squeezy. Use a separate site for test
  webhooks from Polar and Dodo Payments.
