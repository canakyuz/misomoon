# Switch from Google Analytics

misomoon imports a Google Analytics 4 property straight from Google, so your daily history
moves without export files. Your tracking calls keep their event names:
`gtag('event', 'sign_up', { method: 'email' })` becomes
`misomoon('sign_up', { props: { method: 'email' } })`, and the `purchase` event carries
`revenue`. Revenue history, key events, and Universal Analytics data stay behind.

## Add misomoon next to Google Analytics

1. Add your site in misomoon and paste its script tag into the `<head>` of every page, next
   to the Google tag ([Track your site](tracking.md#add-the-script)). If Google Tag Manager
   loads your Google tag, add misomoon there instead
   ([Install with Google Tag Manager](google-tag-manager.md#add-the-tag)).
2. Leave both on for a week or two, until misomoon's numbers look right to you.

## Replace Google Analytics' calls

misomoon counts pageviews by itself, route changes in single-page apps included, so
`gtag('config', 'TAG_ID')` needs no replacement. For each event, keep its name and move its
parameters into `props`. A property value is a string, a number, or a boolean, and an
event keeps up to 30 of them.

| Google Analytics | misomoon |
| --- | --- |
| `gtag('event', 'sign_up', { method: 'email' })` | `misomoon('sign_up', { props: { method: 'email' } })` |
| `gtag('event', 'purchase', { transaction_id: 'T_12345', value: 72.05, currency: 'USD', coupon: 'SUMMER_SALE', items: [...] })` | `misomoon('purchase', { revenue: { amount: 72.05, currency: 'USD' }, props: { transaction_id: 'T_12345', coupon: 'SUMMER_SALE' } })` |
| The `items` array of an ecommerce event | No equivalent. Send one item field as a property, or leave it out. |
| `gtag('event', 'refund', ...)` | No tracker call. A [payment webhook](revenue.md) or the SDK's `payment()` with `type: 'refund'` counts refunds ([Send payments from providers without a webhook](sdk.md#send-payments-from-providers-without-a-webhook)). |
| A key event marked in **Admin** | A goal on the event name in **Settings** > **Goals** |
| Enhanced measurement's outbound clicks, file downloads, and form interactions | The **Outbound links**, **Downloads**, and **Form submits** features, which a new site has on |
| Enhanced measurement's scrolls | Scroll depth, always on, in **Behavior** |
| Enhanced measurement's site search | The **Site search** feature, which reads `q`, `s`, `search`, `query`, and `keyword` |
| `gclid` and UTM tags on your links | Work as they are. `gclid` marks the visit as paid ([Tag the links you post](tracking.md#tag-the-links-you-post)). |

Keep Google's event names, such as `sign_up` and `purchase`. The import brings your events
under those names, so the days before and after the switch add up under one name.

misomoon takes `amount` in the currency's major units, the same as Google's `value`. Each
site has one reporting currency, and revenue in another currency stays out of the totals
([Track revenue](tracking.md#track-revenue)). If a payment provider's webhook reports your
sales, [connect it](revenue.md) and leave `revenue` out of `purchase`, or each sale counts
twice. For events your server sends, use the Node SDK
([Send events from your server](sdk.md#send-events-from-your-server)).

Key events don't move. Add each one again as a goal in **Settings** > **Goals**
([Create a goal](conversions.md#create-a-goal)). A goal counts the events misomoon already
collected, so you can add it at any time.

### Move Google Tag Manager tags

Keep your site's `dataLayer` pushes as they are, and add misomoon's tags next to the GA4
ones:

1. Create a **Custom HTML** tag with the trigger **All Pages**. Paste the queue line and the
   script tag, so calls made before `m.js` loads wait for it:

   ```html
   <script>window.misomoon = window.misomoon || function () { (misomoon.q = misomoon.q || []).push(arguments) }</script>
   <script defer src="https://analytics.example.com/m.js?s=your-site"></script>
   ```

2. For each **GA4 Event** tag except `purchase`, create a **Custom HTML** tag with the same
   trigger that calls misomoon with the same event name, such as
   `<script>misomoon('sign_up')</script>`.
3. Submit and publish the container.

For a `purchase` that your page pushes to the `dataLayer`, call misomoon next to the push,
with the same values:

```js
dataLayer.push({ ecommerce: null })
dataLayer.push({ event: 'purchase', ecommerce: { transaction_id: 'T_12345', value: 72.05, currency: 'USD' } })
misomoon('purchase', { revenue: { amount: 72.05, currency: 'USD' }, props: { transaction_id: 'T_12345' } })
```

## Bring your history

Use misomoon's Google import. Follow
[Import a Google Analytics property](import.md#import-a-google-analytics-property), and leave
**To** empty. The import ends the day before misomoon started counting
([Days that count once](import.md#days-that-count-once)).

The import fills the top-line numbers, the chart, channels, sources, referrers, UTM tags,
pages, entry pages, countries, regions, cities, browsers, operating systems, devices, and
custom events ([What imported data fills](import.md#what-imported-data-fills)). Imported
days appear only in reports without filters. Google's own `page_view`, `session_start`,
`first_visit`, `user_engagement`, and `scroll` events stay out, because misomoon measures
them itself. Google's `click`, `file_download`, and `form_submit` become `Outbound link`,
`Download`, and `Form sent`.

If the import shows **Failed:**, or you picked the wrong dates,
[delete the import](import.md#delete-an-import) and run it again.

Universal Analytics data is gone. Google shut Universal Analytics down, its API included,
from the week of July 1, 2024. A report you downloaded from it before then can come in
only as a CSV upload that you rewrite in misomoon's [CSV format](import.md#csv-format).
Upload it after your GA4 import, so misomoon skips any day the GA4 import already holds.

## Remove Google Analytics

Once the import shows in misomoon, remove the Google tag and your `gtag()` calls. With
Google Tag Manager, pause the Google tag and the **GA4 Event** tags, then publish the
container. To keep seeing the Google searches that bring people to the site, connect
[Search Console](import.md#connect-search-console), which doesn't need Google Analytics.

## What stays behind

- Revenue and ecommerce history. misomoon's imports fill no revenue.
- Key events. An import fills no goal conversions, so add the goals again.
- Event parameters. The import brings each event's count and visitors, not its parameters.
- Exit pages, browser versions, and scroll depth. The Google import fills none of them.
- Funnels, paths, and behavior. The **Funnels**, **Paths**, **Behavior**, and **Speed**
  views show only what misomoon collected.
- misomoon's bounce rule on imported days. From Google, a bounce is a session that wasn't
  engaged. misomoon's own data counts a visit with one pageview and no interaction.
- Universal Analytics data, unless you saved reports before July 2024.

## Sources

Checked on 2026-10-25.

- Google Analytics: [the Google tag](https://developers.google.com/tag-platform/gtagjs/install),
  [events](https://developers.google.com/analytics/devguides/collection/ga4/events),
  [ecommerce, with Google Tag Manager](https://developers.google.com/analytics/devguides/collection/ga4/ecommerce),
  [Data API runReport](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport),
  [GA4 replaced Universal Analytics](https://support.google.com/analytics/answer/11583528)
