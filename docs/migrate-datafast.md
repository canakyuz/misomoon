# Switch from DataFast

DataFast's goal calls keep their shape: `window.datafast('signup')` becomes
`misomoon('signup')`. Revenue attribution moves to misomoon's payment webhooks, and a
checkout finds its visit through a ref instead of DataFast's visitor cookie. misomoon
imports your DataFast history from DataFast's API with the site's API key: daily totals,
and visitors per page, source, campaign, place, device, browser, and goal. Revenue
history, funnels, and visitor profiles stay behind.

## Add misomoon next to DataFast

1. Add your site in misomoon and paste its script tag into the `<head>` of every page, next
   to DataFast's `script.js` tag ([Track your site](tracking.md#add-the-script)).
2. Leave both scripts on for a billing cycle, until misomoon's numbers and revenue look
   right to you.

## Replace DataFast's calls

Both take a goal name and then properties. misomoon puts the properties under `props`.
While both scripts run, call both.

| DataFast | misomoon |
| --- | --- |
| `window?.datafast("signup")` | `misomoon('signup')` |
| `window?.datafast("initiate_checkout", { product_id: "prod_123" })` | `misomoon('initiate_checkout', { props: { product_id: 'prod_123' } })` |
| `<button data-fast-goal="initiate_checkout">` | `<button data-misomoon-event="initiate_checkout">` |
| `data-fast-goal-plan-type="pro"`, which DataFast stores as `plan_type` | `data-misomoon-prop-plan_type="pro"` |
| The `window.datafast` queue snippet | misomoon's queue line, before its script tag ([Send custom events](tracking.md#send-custom-events)) |
| A goal from your server: `POST https://datafa.st/api/v1/goals` | `misomoon.track('signup', { url, visitor })` from `@misomoon/sdk/node`, with `visitor` from `visitorFromRequest(req)` ([Send events from your server](sdk.md#send-events-from-your-server)) |

The `data-misomoon-*` attributes need **Tagged events**, which a new site has on
([Choose what to track](tracking.md#choose-what-to-track)). DataFast goal names are
lowercase and up to 64 characters, and misomoon takes up to 120 characters of any text
except `;` and `|`, so your names carry over.

A server event needs the visitor's address and user agent, so send it from the request
the visitor made, such as the signup request. It then joins the visit the browser has
open.

Goals don't move. Add each one again in **Settings** > **Goals**
([Turn goals into conversions](tracking.md#turn-goals-into-conversions)). Rebuild funnels
in **Funnels** ([Build a funnel](conversions.md#build-a-funnel)). Both count the events
misomoon already collected, so you can add them at any time.

## Move revenue attribution

DataFast connects a payment provider in its site settings and finds the buyer by its
`datafast_visitor_id` cookie. misomoon sets no cookies. It needs a webhook in each provider,
and it finds the visit by a ref that the checkout carries, by the checkout id on your
success page, or by the subscription or customer of an earlier payment
([How a payment finds its visit](revenue.md#how-a-payment-finds-its-visit)).

1. In misomoon, open **Settings** > **Revenue**, pick the provider, and add the webhook in
   the provider ([Connect a provider](revenue.md#connect-a-provider)).
2. Add misomoon's ref next to DataFast's ids, in the same metadata object. Get the ref in
   the browser with `misomoon.ref()` and send it to your server, or make it on the server
   with `misomoon.ref({ url, visitor })`
   ([Pass the visit to a checkout your server creates](sdk.md#pass-the-visit-to-a-checkout-your-server-creates)).
3. Leave DataFast connected until you remove it.

| DataFast | misomoon |
| --- | --- |
| Stripe Checkout: `metadata: { datafast_visitor_id, datafast_session_id }`, read from cookies | `metadata: { misomoon_ref: ref }, subscription_data: { metadata: { misomoon_ref: ref } }` |
| Polar: `metadata: { datafast_visitor_id, datafast_session_id }` | `metadata: { misomoon_ref: ref }`, and `?checkout_id={CHECKOUT_ID}` on the success URL |
| Lemon Squeezy: `checkoutData.custom.datafast_visitor_id` | `checkout_data.custom.misomoon_ref` |
| Dodo Payments: `metadata: { datafast_visitor_id }` | `metadata: { misomoon_ref: ref }` |
| Stripe Payment Links with `?session_id={CHECKOUT_SESSION_ID}` on the success URL | Keep the URL. With **Payments** ticked, misomoon reads `session_id`, and it also adds the ref to `buy.stripe.com` links on your site. |
| Polar Checkout Links with `?checkout_id={CHECKOUT_ID}` on the success URL | Keep the URL. misomoon reads `checkout_id`. |
| Lemon Squeezy links with `?order_id=[order_id]` on the success URL | misomoon doesn't read `order_id`. It adds the ref to a Lemon Squeezy checkout link when the buyer clicks it on your site. |
| `POST https://datafa.st/api/v1/payments` with `amount`, `currency`, `transaction_id`, and `datafast_visitor_id` | `misomoon.payment({ id, amount, currency, ref })` from `@misomoon/sdk/node`, or a signed `POST` to `/api/webhooks/custom/<site id>` ([Send payments from your own server](revenue.md#send-payments-from-your-own-server)) |

For a WooCommerce store, the WordPress plugin sends orders to misomoon
([Count WooCommerce orders](wordpress.md#count-woocommerce-orders)). For another provider
that DataFast connects and misomoon has no webhook for, send each payment with
`payment()` ([Send payments from providers without a webhook](sdk.md#send-payments-from-providers-without-a-webhook)).

With a webhook connected, don't also send `revenue` from the tracker for the same sale,
or it counts twice. Once a payment has a visit, misomoon counts renewals of its
subscription toward that visit for 400 days.

## Bring your history

DataFast has no export file, so misomoon reads your history from DataFast's API, a day at
a time.

1. In DataFast, create an API key for the site under **Website settings** > **API**. It
   starts with `df_` and reads that one website. An account token, which starts with
   `dft_`, is refused.
2. In misomoon, open **Settings** > **Integrations**.
3. In the **Import history** card, pick **DataFast** in **Import from another tool**, and
   paste the key into **API key**.
4. Leave **From** and **To** empty to import every day from the first month DataFast
   counted visitors in to the day before misomoon started counting. Set them to import
   less.
5. Click **Import**.

misomoon reads the site's domain and finds its first month while you wait. A wrong key
stops the import there, with DataFast's answer, such as
`DataFast answered 401: check the key or the sign-in, and that it can read this site`, and
a site with no visitors stops it with `DataFast has counted no visitors for this site`.
Then the import runs on the server, from the newest day back, so you can close the page.
Its row shows **Importing…** and the days read so far.

DataFast's docs give a limit of 60 requests without saying per how long, so misomoon makes
at most 60 a minute. A day with visits takes 11 requests, and one more reads which of the
next 90 days have visits, so empty days cost nothing. A year of daily traffic takes about
an hour and a half. When DataFast answers `429` or doesn't answer, the import waits and
tries again. After six failed tries in a row, it fails and keeps none of its rows.
misomoon deletes the key when the import ends
([Import from another tool](import.md#import-from-another-tool)).

misomoon skips the days it already counted ([Days that count once](import.md#days-that-count-once)).
Each request asks for one day, with `startAt` and `endAt` on that day and `timezone` set to
the misomoon site's **Timezone** ([Sites](settings.md#sites)). For each day, it reads:

| DataFast route | Goes into |
| --- | --- |
| `/analytics/timeseries?interval=day` | Which days have visitors, 90 days in one request |
| `/analytics/overview` | Visitors, visits, page views, bounces, and visit duration for the day. Bounces are `sessions` times `bounce_rate` divided by 100, and visit duration is `sessions` times `avg_session_duration`, read as seconds. |
| `/analytics/pages` | Visitors per page, without a trailing slash or query, as misomoon stores paths. Pages on other hostnames of the site count under the same path. |
| `/analytics/referrers` | Visitors per source and channel. A domain also fills referrers and gets misomoon's name for a known site, such as `Google` for `google.com`. `Direct / None` counts as `Direct`, and a name DataFast gives, such as `Google`, is the source. |
| `/analytics/campaigns` | Visitors per UTM tag, each tag on its own. A campaign row holds all five tags, so a tag's visitors are the sum of its rows. `ref`, `source`, and `via` stay behind. |
| `/analytics/countries`, `regions`, `cities` | Visitors per country, region, and city. A country's code comes from the flag DataFast sends, or else from its English name. A name misomoon doesn't know is left out of countries. |
| `/analytics/devices`, `browsers`, `operating-systems` | Visitors per device, browser, and operating system, with misomoon's names: `desktop` becomes `Desktop`, `Mobile Safari` becomes `Safari`, and `Mac OS` becomes `macOS` |
| `/analytics/goals` | Custom events: completions and the visitors who completed each goal |

The breakdowns return visitors only, so imported days add visitors to pages, sources, and
the other breakdowns, without visits, page views, bounces, or time. Imported days appear
only in reports without filters
([What imported data fills](import.md#what-imported-data-fills)). To start again,
[delete the import](import.md#delete-an-import).

## Remove DataFast

Once misomoon's revenue matches DataFast's for a billing cycle:

1. Remove DataFast's script tag and its `window.datafast` queue snippet.
2. Remove the code that reads `datafast_visitor_id` and `datafast_session_id` and puts them
   in checkout metadata.
3. Disconnect the payment providers in DataFast's dashboard.

## What stays behind

- Revenue history. misomoon imports no revenue, so past payments stay in DataFast. Goals
  that DataFast records for payments come through as custom events.
- Funnels, journeys, and visitor profiles.
- Entry and exit pages, time on page, and browser and system versions. DataFast's API has
  none of them.
- Visits, page views, and bounces per page, source, place, device, and goal. DataFast's
  breakdowns report visitors only.
- UTM tags by source, and the `ref`, `source`, and `via` parameters.
- New and returning visitors. misomoon's visitor id lasts
  [one UTC day](metrics.md#a-visitor-id-lasts-one-utc-day).

## Sources

Checked on 2026-10-26.

The import was built from DataFast's API reference and tested on the example answers in
it. It has not yet been run on a real DataFast site, because DataFast's API needs a key
and has no public demo.

- DataFast: [docs index](https://datafa.st/llms.txt),
  [custom goals](https://datafa.st/docs/custom-goals.md),
  [goals API](https://datafa.st/docs/api/website/goals),
  [GDPR and cookieless tracking](https://datafa.st/docs/gdpr-cookieless-tracking.md),
  [connect a payment provider](https://datafa.st/docs/connect-payment-provider.md),
  [Stripe Checkout API](https://datafa.st/docs/stripe-checkout-api.md),
  [Stripe Payment Links](https://datafa.st/docs/stripe-payment-links.md),
  [Polar Checkout API](https://datafa.st/docs/polar-checkout-api.md),
  [Polar Checkout Links](https://datafa.st/docs/polar-checkout-links.md),
  [Lemon Squeezy Checkout API](https://datafa.st/docs/lemonsqueezy-checkout-api.md),
  [Lemon Squeezy payment links](https://datafa.st/docs/lemonsqueezy-payment-links.md),
  [Dodo Payments](https://datafa.st/docs/dodopayments.md),
  [payments API](https://datafa.st/docs/payments-api.md),
  [API errors and rate limits](https://datafa.st/docs/api.md),
  [timeseries](https://datafa.st/docs/api/website/analytics/timeseries.md),
  [overview](https://datafa.st/docs/api/website/analytics/overview.md),
  [pages](https://datafa.st/docs/api/website/breakdowns/pages.md),
  [referrers](https://datafa.st/docs/api/website/breakdowns/referrers.md),
  [campaigns](https://datafa.st/docs/api/website/breakdowns/campaigns.md),
  [countries](https://datafa.st/docs/api/website/breakdowns/countries.md),
  [devices](https://datafa.st/docs/api/website/breakdowns/devices.md),
  [browsers](https://datafa.st/docs/api/website/breakdowns/browsers.md),
  [operating systems](https://datafa.st/docs/api/website/breakdowns/operating-systems.md),
  [regions](https://datafa.st/docs/api/website/breakdowns/regions.md),
  [cities](https://datafa.st/docs/api/website/breakdowns/cities.md),
  [metadata](https://datafa.st/docs/api/website/analytics/metadata.md),
  [goals breakdown](https://datafa.st/docs/api/website/goals/analyze.md)
