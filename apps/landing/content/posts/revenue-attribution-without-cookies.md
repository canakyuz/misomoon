---
title: Revenue attribution without cookies: which source pays
description: Revenue attribution ties each payment to the visit that led to it. Carry a ref into checkout and let the webhook bring it back, with no cookie needed.
tags: revenue, how-to, privacy
status: draft
---

Revenue attribution ties each payment to the visit that led to it, so you can rank your traffic sources by the money they bring instead of by the people they send. You don't need a cookie for it. Carry a short reference from the visit into the checkout, and let the payment provider's webhook bring that reference back with the payment.

## Visitors per source tells you who came, not who paid

A traffic report usually lists sources sorted by visitors. That list answers "where does attention come from?" It doesn't answer "where do customers come from?", and the two lists are often in a different order.

Take an example with made-up numbers. A newsletter sends 300 visitors in a month and 6 of them buy a yearly plan at $120. A post that went viral on a forum sends 9,000 visitors and 3 of them buy the monthly plan at $12. By visitors, the forum wins by a factor of 30. By revenue, the newsletter brings $720 and the forum brings $36. If you plan next month's work from the visitors list, you write more forum posts and neglect the newsletter.

Conversion rate alone doesn't fix this. A source can convert well on a cheap plan and still bring less money than one that converts rarely on an expensive plan. Refunds move the numbers again. The number that answers the question is net revenue per source, after refunds, with revenue per visitor next to it to compare sources of different sizes.

## First-touch and last-touch answer different questions

A buyer often visits more than once before paying. Attribution models decide which of those visits gets the credit.

- **First-touch** gives the payment to the source of the buyer's first visit. It answers "what made people discover us?"
- **Last-touch** gives the payment to the source of the visit in which the buyer paid. It answers "what brought people back ready to buy?"
- **Multi-touch** models split the payment across every visit, by a rule such as equal shares or more weight on the first and last visits.

Each model is a choice, not a fact about your buyers. First-touch favors discovery channels such as search and social posts. Last-touch favors the channels people use when they already know you, such as email, a bookmark, or typing your address, which shows up as direct traffic.

### Why first-touch usually needs a stored id

To know the source of someone's first visit when they pay on their fifth, a tool has to recognize them across visits. That means an id stored on their device, usually in a cookie or in local storage. Browsers limit that storage. WebKit, the engine behind Safari, [caps cookies set from JavaScript at seven days](https://webkit.org/blog/8613/intelligent-tracking-prevention-2-1/), and it [deletes all script-writable storage](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/), such as LocalStorage and IndexedDB, after seven days of Safari use without the person interacting with the site. A buyer who takes three weeks to decide can lose that first-touch id before they pay.

A cookieless tool drops the long memory of the person and keeps a firm link between one visit and one payment instead. For a subscription, that link plus the subscription id covers more than it sounds like.

## How a payment finds its visit without a cookie

The checkout runs on the payment provider's domain, and the payment confirmation comes from the provider's server, not from the buyer. Three methods connect the two ends, and a good setup uses all three.

### Carry a ref into the checkout

On your page, the tracker creates a short reference for the current visit and records it with the visit's source, country, and device. When the visitor goes to checkout, the reference goes with them. With a payment link, it goes in the link's URL. With a checkout your server creates, your server puts it in the checkout's metadata.

Payment providers already have fields for this. Stripe documents a [`client_reference_id` parameter for payment links](https://docs.stripe.com/payment-links/url-parameters) that attaches a string of up to 200 characters to the Checkout Session and returns it in the `checkout.session.completed` webhook. Lemon Squeezy [returns custom checkout data](https://docs.lemonsqueezy.com/help/checkout/passing-custom-data) in the `meta.custom_data` object of its order and subscription webhooks.

The reference identifies a visit, not a person. It holds no email, name, or address, so you can pass it through a public URL.

### Read the checkout id on the success page

After paying, many buyers come back to your success page, and the provider can put the checkout's id in that page's URL. Stripe replaces a [`{CHECKOUT_SESSION_ID}` template variable in the success URL](https://docs.stripe.com/payments/checkout/custom-success-page.md?payment-ui=stripe-hosted) with the real id after the customer pays. When your analytics counts that page view, it can read the id and tie it to the visit.

The success page is a backup. Stripe's docs warn that customers [aren't guaranteed to reach that page](https://docs.stripe.com/payments/checkout/custom-success-page.md?payment-ui=stripe-hosted), for example when their connection drops after paying. A buyer can also reload it, so revenue counted from the page alone can count twice.

### Let the webhook carry the money

The webhook is the provider's server telling yours that a payment happened. Take the amount, the currency, renewals, and refunds from the webhook, and use the ref or the checkout id only to find the visit.

Webhooks can arrive late and out of order. Stripe [retries a failed delivery for up to three days in live mode](https://docs.stripe.com/webhooks#automatic-retries) and [doesn't guarantee that events arrive in the order they were created](https://docs.stripe.com/webhooks#event-ordering). A payment can reach your analytics before the success page view does, so whatever stores attribution has to wait for the missing half and credit the payment when it shows up.

## Renewals and refunds belong to the first payment's visit

A subscription brings money long after the visit that started it. The renewal webhook has no fresh visit behind it, because nobody went through checkout. What it does have is the subscription id and the customer id.

So the method is to remember them. When the first payment finds its visit, store its subscription and customer ids with that visit's source. Every later payment with the same subscription or customer gets the same source. A refund points at the payment it returns and takes that payment's source, so the campaign that sold it also loses it.

For subscriptions, this puts cookieless attribution closer to first-touch than it first appears. The months of revenue after the first checkout go back to the visit that started it.

## Mistakes that skew revenue by source

These mistakes skew the numbers in any setup:

- **Counting revenue from the success page only.** You miss buyers who never return to the page, and you count twice for buyers who reload it. Take amounts from the webhook.
- **Expecting each renewal to carry the checkout's ref.** A renewal is billed without a checkout, so the ref belongs to the first payment. Link renewals through the subscription id or the customer id, and with Stripe, also set the ref in `subscription_data.metadata`.
- **Adding currencies together.** Summing $100 and €100 as 200 gives a wrong total. Count one reporting currency.
- **Counting test payments.** A developer's test purchase shows up as real revenue from Direct.
- **Matching buyers by email or IP address.** Two people in one office share an address, and one person can use two emails. Both methods misplace payments and tie them to personal data you didn't need.
- **Reading revenue per visitor for one day.** A payment can land on a later day than its visit. That day then shows revenue with no matching visitors, so compare periods of a week or more.

## Set up revenue attribution in misomoon

misomoon follows the method above. It sets no cookies and stores nothing on the device. Each payment counts toward the source, campaign, country, and device of the visit that brought the buyer, and renewals and refunds count toward that same visit. [Connect payments](https://docs.misomoon.com/revenue) is the full reference.

### Connect your payment provider

1. Open **Settings** > **Revenue** and pick your provider: **Stripe**, **Polar**, **Lemon Squeezy**, **Dodo Payments**, or **Your server**.
2. Copy the webhook URL. It has the form `/api/webhooks/<provider id>/<site id>`.
3. In the provider's dashboard, add a webhook endpoint with that URL and the events in the table below.
4. Save the signing secret. For Stripe, Polar, and Dodo Payments, paste their secret into misomoon and select **Save**. For Lemon Squeezy and your own server, select **Make signing secret** in misomoon and paste it into the provider. The secret shows once.

| Provider | Where to add the webhook | Events |
| --- | --- | --- |
| Stripe | **Developers** > **Webhooks** | `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`, `invoice_payment.paid`, `refund.created`, `refund.updated`, `refund.failed` |
| Polar | **Settings** > **Webhooks**, format **Raw** | `order.paid`, `refund.created`, `refund.updated` |
| Lemon Squeezy | **Settings** > **Webhooks** | `order_created`, `order_refunded`, `subscription_created`, `subscription_payment_success`, `subscription_payment_refunded` |
| Dodo Payments | **Developer** > **Webhooks** | `payment.succeeded`, `refund.succeeded` |

The card then reads **Waiting**, **Live**, or **Problem**, with the time of the last event or the error, such as a failed signature check. Test-mode payments from Stripe and Lemon Squeezy mark the connection as working but don't count toward revenue. For Polar and Dodo Payments, send test webhooks to a separate site.

Connecting a provider also ticks **Payments** under **Settings** > **Install** > **What to track**. That feature tags payment links, hands out `misomoon.ref()`, and reads checkout ids from success pages.

### Use payment links as they are

If you sell through payment links, you change nothing on your pages. When a visitor clicks a link to `buy.stripe.com`, `buy.polar.sh`, a Lemon Squeezy checkout, or `checkout.dodopayments.com`, the tracker adds the ref to the link's URL. A link that already carries its own `client_reference_id` keeps it.

On success pages, misomoon reads the checkout id that the provider adds to the return URL: `session_id` for Stripe, `checkout_id` for Polar, and `payment_id` or `subscription_id` for Dodo Payments.

To turn off link tagging on some pages, add `data-disable="payments"` to the script tag on those pages. `misomoon.ref()` keeps working there.

### Pass the ref to a checkout your server creates

If your server creates the checkout, read the ref in the browser, send it with the order, and put it in the checkout's metadata as `misomoon_ref`. Guard the call, because an ad blocker can stop the tracker. A checkout without a ref still works, and its payment counts under **Unknown**.

```js
// in the browser
const ref = window.misomoon?.ref?.()
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

Polar and Dodo Payments take the ref in `metadata.misomoon_ref`, and Lemon Squeezy in `checkout_data.custom.misomoon_ref`. With Polar, add `?checkout_id={CHECKOUT_ID}` to the success URL. A bundled app, a React Native app, or your server through the Node SDK can make the ref too, as the [SDK guide](https://docs.misomoon.com/sdk) shows.

### Send payments from your own server

For a provider misomoon has no webhook for, pick **Your server** and post each payment as JSON to the webhook URL from **Settings** > **Revenue**, signed with `Authorization: Bearer <secret>`:

```json
{ "id": "order_1042", "amount": 49.9, "currency": "EUR", "ref": "mm_3f9c0a…", "customer": "cus_77" }
```

`amount` is in major units. Add `customer` or `subscription` so later payments find the same visit. A refund sends `"type": "refund"` and `refund_of` with the payment's `id`. A repeated `id` is ignored, so retries are safe. From Node, Bun, Deno, or Workers, `payment()` in the SDK signs and retries the request. The WordPress plugin sends WooCommerce orders and refunds to this webhook.

### Read revenue by source

Payments arrive as events named `Payment`, and refunds as events named `Refund` with a negative amount. Each carries the prop `provider`, and a payment also carries `billing`. On the dashboard:

- The **Revenue** tile shows the period's net revenue whenever it is above zero. Select it to draw revenue on the chart.
- **Where they come from** shows the revenue next to each source. **Where they are** and **What they use** do the same for countries and devices. Select **All channels** to sort the full list by revenue.
- **What they did** lists `Payment` and `Refund` with their revenue. To see one provider, filter by the prop `provider`.
- **Settings** > **Revenue** shows how many payments came in during the last 30 days and how many it linked to a visit. A low share means refs are getting lost on the way to checkout.

Weekly and monthly email reports add a **Business** page when the period had revenue, with the total, the average payment, the revenue per visitor, and up to 4 top paying sources. The [sample dashboard](/demo) shows these views with example data.

Totals count payments in the **Revenue currency** set under **Settings** > **Sites**. misomoon doesn't convert currencies, so it stores payments in other currencies but leaves them out. A payment on a later day than its visit counts toward that visit's source, but not toward its unique visitors, because a visitor id lasts one UTC day.

## Questions people ask

### Is misomoon's revenue attribution first-touch or last-touch?

Each new purchase goes to the visit in which the buyer went to checkout, which is last-touch at the level of that visit. Renewals and refunds go back to the visit of the first payment for up to 400 days, so a subscription's revenue stays with the source that started it. misomoon doesn't link visits across days, so a buyer who found you through search on Monday and came back directly on Thursday to pay counts under the Thursday visit's source.

### Does revenue attribution need a cookie?

No. The ref travels in the checkout URL or in the checkout's metadata, and the provider's webhook brings it back. misomoon sets no cookies and stores nothing on the visitor's device. [Use misomoon within privacy law](https://docs.misomoon.com/compliance) covers what that means for your privacy policy. This is not legal advice.

### What happens when an ad blocker stops the tracker?

The checkout works as usual, because `window.misomoon?.ref?.()` returns `undefined` instead of failing. The payment still counts toward total revenue, under **Unknown**. misomoon never falls back to matching by email or IP address.

### Does a payment that arrives before the visit get lost?

No. If the webhook arrives first, misomoon stores the payment and credits it when the ref or checkout id turns up. A ref or a checkout id is kept for 30 days. When a payment has more than one key, the strongest wins. Its own ref beats the success page, and both beat the buyer's earlier purchases.

### Can I see revenue for one campaign?

Yes. A payment carries its visit's campaign. Filter the dashboard by the campaign under **Where they come from** > **Campaigns**, and the **Revenue** tile shows what it brought.

## Start counting revenue by source

misomoon Cloud runs the tracker, the webhooks, and the attribution for you, and every feature, revenue included, is on every plan. [Start a free trial of misomoon Cloud](https://app.misomoon.com/?signup) or [see the plans](/pricing). If you'd rather run it in your own Cloudflare account, you can [self-host misomoon](https://docs.misomoon.com/self-hosting) under the MIT license.
