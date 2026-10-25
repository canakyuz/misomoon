# Switch from DataFast

DataFast's goal calls keep their shape: `window.datafast('signup')` becomes
`misomoon('signup')`. Revenue attribution moves to misomoon's payment webhooks, and a
checkout finds its visit through a ref instead of DataFast's visitor cookie. DataFast has
no export file, so history comes from its API, as daily totals with visitors per page,
source, country, and device. Revenue history, funnels, and visitor profiles stay behind.

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

DataFast's docs describe no export file, so the history comes from its API. The overview
and the breakdown routes return totals for the whole period you ask for, so call each one
once per day, with the start and the end on the same day. That is about ten calls for
each day of history. misomoon skips the days it already counted ([Days that count once](import.md#days-that-count-once)). Ask for days up to
today, or stop the day before you added misomoon to make fewer calls. If DataFast answers `429`, wait as its
`X-RateLimit-*` headers say and call again.

1. Create an API key for the site in DataFast.
2. Call the routes in the table below for each day you want.
3. Write the rows into the files that the table names, with a header line of column
   names. Then zip the files.
4. In misomoon, open **Settings** > **Integrations**, click **Upload CSV or zip**, and pick
   the ZIP file.

| DataFast route and field | misomoon file and column |
| --- | --- |
| `/analytics/timeseries?interval=day`: `visitors`, `pageviews`, `sessions` | `visitors`, `pageviews`, and `visits` in `imported_visitors.csv`. One call covers up to 1,000 days. |
| `/analytics/overview` for one day: `bounce_rate`, `avg_session_duration`, `sessions` | `bounces` is `sessions` times `bounce_rate` divided by 100. `visit_duration` is `sessions` times `avg_session_duration`. Both go in `imported_visitors.csv`. |
| `/analytics/pages`: `path`, `visitors` | `page` and `visitors` in `imported_pages.csv` |
| `/analytics/referrers`: `referrer`, `visitors` | `source` and `visitors` in `imported_sources.csv`. Write `Direct / None` as an empty `source`, which counts as Direct. For a domain, also put it in `referrer`, and write the name misomoon gives a known host in `source` ([Sources and referrers](metrics.md#sources-and-referrers)). |
| `/analytics/countries`: `country`, `visitors` | `country` and `visitors` in `imported_locations.csv`. DataFast returns the country name. Write the two-letter code instead, such as `US` for United States. |
| `/analytics/devices` | `device` in `imported_devices.csv`. DataFast writes `desktop`, `mobile`, and `tablet`. Write `Desktop`, `Mobile`, and `Tablet`. |
| `/analytics/browsers`, `/analytics/operating-systems` | `browser` in `imported_browsers.csv`, and `operating_system` in `imported_operating_systems.csv`. Use the names misomoon uses, such as `Chrome` and `macOS` ([Dimensions](metrics.md#dimensions)). |
| `/analytics/goals`: `goal`, `completions`, `visitors` | `name`, `events`, and `visitors` in `imported_custom_events.csv`. Leave out the goals DataFast records for payments, because misomoon imports no revenue. |

Leave out `/analytics/campaigns`. Every row of `imported_sources.csv` also counts toward
`source` and `channel`, with an empty source as Direct, so campaign rows next to the
referrer rows would count those visitors twice.

The breakdowns return visitors only. `visits`, `pageviews`, `bounces`, and
`visit_duration` stay empty in every file except `imported_visitors.csv`, and so do
`total_time_on_page`, the versions, and `region`. Imported days appear only in reports
without filters ([What imported data fills](import.md#what-imported-data-fills)).

If you uploaded the wrong file, [delete the import](import.md#delete-an-import) and upload
again.

## Remove DataFast

Once misomoon's revenue matches DataFast's for a billing cycle:

1. Remove DataFast's script tag and its `window.datafast` queue snippet.
2. Remove the code that reads `datafast_visitor_id` and `datafast_session_id` and puts them
   in checkout metadata.
3. Disconnect the payment providers in DataFast's dashboard.

## What stays behind

- Revenue history. misomoon imports no revenue, so past payments stay in DataFast.
- Funnels, journeys, and visitor profiles.
- Entry and exit pages, time on page, and regions.
- Visits, page views, and bounces per page, source, country, and device. DataFast's
  breakdowns report visitors only.
- UTM history, for the reason in [Bring your history](#bring-your-history).
- New and returning visitors. misomoon's visitor id lasts
  [one UTC day](metrics.md#a-visitor-id-lasts-one-utc-day).

## Sources

Checked on 2026-10-25.

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
  [goals breakdown](https://datafa.st/docs/api/website/goals/analyze.md)
