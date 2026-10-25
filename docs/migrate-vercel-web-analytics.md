# Switch from Vercel Web Analytics

Vercel's Web Analytics API returns daily visitors and pageviews, overall and per page,
referrer, country, browser, OS, and device. You write them into misomoon's
[CSV files](import.md#csv-format) and upload them. The API has no visits, bounces, or visit
duration, so those columns stay empty. Your events keep their names:
`track('Signup', { location: 'footer' })` becomes
`track('Signup', { props: { location: 'footer' } })`. Feature flags and history past
Vercel's reporting window stay behind.

## Add misomoon next to Vercel Web Analytics

1. Add your site in misomoon. In a Next.js app, put `<Misomoon>` in the root layout next to
   `<Analytics />`, and wrap `next.config.mjs` in `withMisomoon()` so the tracker loads from
   your own domain ([Install misomoon on Next.js and React](nextjs.md)). On any other site,
   paste misomoon's script tag into the `<head>` of every page
   ([Track your site](tracking.md#add-the-script)).
2. Leave both on for a week or two, until misomoon's numbers look right to you. Vercel
   identifies a visitor by a hash of the request that it discards after 24 hours, and
   misomoon by a hash with a daily salt, so the visitor counts should be close.

Vercel's API reads only the days inside your plan's reporting window: 1 month on Hobby, 12
months on Pro, and 24 months with Web Analytics Plus or on Enterprise. Each day you wait
drops the oldest day, so on Hobby, export your history soon after you add misomoon.

## Replace Vercel's calls

| Vercel Web Analytics | misomoon |
| --- | --- |
| `import { Analytics } from '@vercel/analytics/next'` and `<Analytics />` in `app/layout.tsx` | `import { Misomoon } from '@misomoon/sdk/react'` and `<Misomoon site="your-site" host="/relay" />`, with `withMisomoon()` in `next.config.mjs` |
| `inject()` or `injectAnalytics()` | `init({ site: 'your-site', host: 'https://analytics.example.com' })` from `@misomoon/sdk/web` |
| The `window.va` queue line and the `script.js` tag from Vercel's HTML setup | misomoon's [queue line](tracking.md#send-custom-events) and `<script defer src="https://analytics.example.com/m.js?s=your-site"></script>` |
| `track('Signup', { location: 'footer' })` from `@vercel/analytics` | `track('Signup', { props: { location: 'footer' } })` from `@misomoon/sdk/web`, or `useMisomoon().track()` in React |
| `track('Purchase', { productName: 'Shoes', price: 49.99 })` | `track('Purchase', { revenue: { amount: 49.99, currency: 'USD' }, props: { productName: 'Shoes' } })` |
| `track('Item purchased', { quantity: 1 })` from `@vercel/analytics/server` | `track('Item purchased', { url, visitor: visitorFromRequest(req), props: { quantity: 1 } })` on a client from `createMisomoon()` in `@misomoon/sdk/node` ([Send events from your server](sdk.md#send-events-from-your-server)) |
| Feature flags on events | A prop, such as `props: { flag: 'new-checkout' }` |

Vercel keeps 2 properties per event on Pro and 8 on Plus. misomoon keeps 30 per event and
cuts strings at 300 characters ([Event ingestion](api.md#event-ingestion)). A server event
needs the visitor's request, because misomoon gives it the same visitor id as the browser.
If you sell through a payment provider, [connect it](revenue.md) and drop `revenue` from
the call, or each sale counts twice.

If you used `beforeSend` to strip query strings, misomoon already stores each page without
its query string, and replaces a part of the path that looks like an email or a token
([Dimensions](metrics.md#dimensions)).

Mark the events that matter as goals in **Settings** > **Goals**
([Create a goal](conversions.md#create-a-goal)). A goal counts the events misomoon already
collected, so you can add it at any time.

## Bring your history

The **Export as CSV** menu on each dashboard panel holds totals for the whole timeframe, not
days, so it can't fill daily rows. Use the Web Analytics API instead. misomoon skips the days it already counted ([Days that count once](import.md#days-that-count-once)).

1. In Vercel, make an access token. Requests send it as `Authorization: Bearer <token>`,
   with your `projectId` and `teamId`.
2. Ask `GET https://api.vercel.com/v1/query/web-analytics/visits/aggregate` with
   `by=day`, `since`, and `until` for the day totals.
3. For each breakdown, ask once per day, with `since` and `until` around that day,
   `by` set to the dimension, and `limit=100`. Rows past the top 100 come back as `Others`.
   Leave that row out.
4. Zip the files and upload the ZIP in misomoon under **Settings** > **Integrations** >
   **Upload CSV or zip**.

| misomoon file | Columns to fill | Vercel API |
| --- | --- | --- |
| `imported_visitors.csv` | `date`, `visitors`, `pageviews` | `visits/aggregate?by=day`: `timestamp`, `visitors`, `pageviews` |
| `imported_pages.csv` | `page`, `visitors`, `pageviews` | `visits/aggregate?by=requestPath` |
| `imported_sources.csv` | `source`, `referrer`, `visitors`, `pageviews` | `visits/aggregate?by=referrerHostname` |
| `imported_locations.csv` | `country`, `visitors`, `pageviews` | `visits/aggregate?by=country` |
| `imported_browsers.csv` | `browser`, `visitors`, `pageviews` | `visits/aggregate?by=browserName` |
| `imported_operating_systems.csv` | `operating_system`, `visitors`, `pageviews` | `visits/aggregate?by=osName` |
| `imported_devices.csv` | `device`, `visitors`, `pageviews` | `visits/aggregate?by=deviceType` |
| `imported_custom_events.csv` | `name`, `visitors`, `events` | `events/aggregate?by=eventName`: `eventName`, `visitors`, `count` |

Every row also needs `date`, as `YYYY-MM-DD`. misomoon files it as a day in the site's time
zone. Write the values the way misomoon stores them ([Dimensions](metrics.md#dimensions)):

- `source` is empty for direct visits, misomoon's name for a known host, such as `Google`
  for `google.com` ([Sources and referrers](metrics.md#sources-and-referrers)), or the host
  itself. misomoon counts a row with an empty `source` as `Direct`.
- `country` is a two-letter code.
- `device` is `Desktop`, `Mobile`, or `Tablet`, with a capital letter, and
  `operating_system` uses misomoon's names, such as `macOS`. A value in another form, such
  as `desktop`, sits on its own row.

Some columns have no source and stay empty:

- `visits`, `bounces`, and `visit_duration`. **Visits** reads 0 on imported days, and bounce
  rate and visit duration come from misomoon's own visits only.
- `region`, `browser_version`, and `operating_system_version`. The API has no region and no
  versions.
- The `utm_*` columns, unless you have Web Analytics Plus or Enterprise. Then ask for
  `by=referrerHostname,utmSource` and write both on each row. A sources row of UTM tags
  alone counts as `Direct`.
- `imported_entry_pages.csv` and `imported_exit_pages.csv`. The API has no entry or exit
  pages.

On Hobby, custom events aren't available, so `imported_custom_events.csv` has nothing to
fill. The import fills the top-line numbers, the chart, and the breakdowns
([What imported data fills](import.md#what-imported-data-fills)). Imported days appear only
in reports without filters. If you uploaded the wrong file,
[delete the import](import.md#delete-an-import) and upload again.

## Remove Vercel Web Analytics

Once the import shows in misomoon, remove `<Analytics />` and the `@vercel/analytics`
package. Then, in the Vercel project, turn Web Analytics off with **Disable Web Analytics**,
so it stops counting and Pro stops billing for its events.

## What stays behind

- Days before the reporting window. Vercel guarantees to keep only that window.
- Visits, bounces, and visit duration for imported days.
- Entry and exit pages, regions, and browser and OS versions.
- Routes as a dimension. misomoon breaks pages down by path only.
- Feature flags and event properties. Imported events have no property breakdown.

## Sources

Checked on 2026-10-25.

- Vercel: [Web Analytics API guide](https://vercel.com/docs/analytics/web-analytics-api),
  [API reference](https://vercel.com/docs/rest-api/web-analytics/aggregates-page-views),
  [the API's release](https://vercel.com/changelog/web-analytics-api),
  [limits and pricing](https://vercel.com/docs/analytics/limits-and-pricing),
  [using Web Analytics, export, and disabling](https://vercel.com/docs/analytics/using-web-analytics),
  [quickstart](https://vercel.com/docs/analytics/quickstart),
  [custom events](https://vercel.com/docs/analytics/custom-events),
  [privacy and the visitor hash](https://vercel.com/docs/analytics/privacy-policy)
