# Switch from Swetrix

Swetrix doesn't export misomoon's [CSV format](import.md#csv-format), so your history
moves through Swetrix's Statistics API: you write its daily numbers into misomoon's
`imported_*.csv` files and upload them. Your events keep their names:
`swetrix.track({ ev: 'Signup', meta })` becomes `misomoon('Signup', { props })`. Revenue
history, goals, funnels, sessions, and profiles stay behind.

## Add misomoon next to Swetrix

1. Add your site in misomoon and paste its script tag into the `<head>` of every page, next
   to Swetrix's ([Track your site](tracking.md#add-the-script)).
2. Leave both scripts on for a week or two, until misomoon's numbers look right to you.

## Replace Swetrix's calls

misomoon counts pageviews and route changes as soon as its script loads, so it needs no
`init` or `trackViews` call.

| Swetrix | misomoon |
| --- | --- |
| `<script src="https://swetrix.org/swetrix.js" defer></script>`, then `swetrix.init('YOUR_PROJECT_ID')` and `swetrix.trackViews()` | `<script defer src="https://analytics.example.com/m.js?s=your-site"></script>` |
| The `hash` option of `swetrix.trackViews()` | `data-hash` on the script tag |
| `swetrix.track({ ev: 'Signup', meta: { plan: 'pro' } })` | `misomoon('Signup', { props: { plan: 'pro' } })` |
| `swetrix.track({ ev: 'Signup', unique: true })` | `misomoon('Signup')`. misomoon counts every event, and a goal on `Signup` shows how many visitors sent it. |
| The `outboundLinks` event option of `swetrix.init()` | The **Outbound links** feature, which a new site has on |
| `swetrix.trackErrors()` | The **JavaScript errors** feature, which a new site has on. It has no sampling. |
| `swetrix.identify()`, `setTraits()`, and `reset()` | Nothing. misomoon has no user ids, so delete these calls. |
| `POST /log/custom` from your server | `track()` from `@misomoon/sdk/node`, with the visitor's request ([Send events from your server](sdk.md#send-events-from-your-server)) |

Features are checkboxes under **Settings** > **Install** > **What to track**
([Choose what to track](tracking.md#choose-what-to-track)).

If Swetrix gets your revenue from a payment provider or from `POST /log/revenue`,
[connect the provider](revenue.md#connect-a-provider) in misomoon, or
[send payments from your own server](revenue.md#send-payments-from-your-own-server).

Goals and funnels don't move. Add each goal again in **Settings** > **Goals**
([Create a goal](conversions.md#create-a-goal)) and each funnel in **Funnels**
([Build a funnel](conversions.md#build-a-funnel)). Both read the events misomoon already
collected, so you can add them at any time.

## Bring your history

The **Export** button on Swetrix's dashboard writes one CSV per panel, with totals for the
whole period and no dates, so it can't fill daily rows. Use the
[Statistics API v2](https://swetrix.com/docs/statistics-api-v2) instead. It comes with the
Standard, Plus, and Enterprise plans. misomoon skips the days it already counted ([Days that count once](import.md#days-that-count-once)).

1. In Swetrix, make an API key in your account settings. Requests send it in the
   `X-Api-Key` header.
2. Ask for the day totals from `GET https://api.swetrix.com/v2/projects/{pid}/traffic/timeseries`
   with `timeBucket=day`, `from`, `to`, and `timezone` set to your misomoon site's time
   zone. Set `to` to today, or to the day before you added misomoon to make fewer
   requests.
3. Ask `…/traffic/breakdown` once per day and dimension, with `from` and `to` both set to
   that day. A breakdown returns at most 100 rows, so page through longer lists with
   `offset`.
4. Write the rows into the files in the table below, zip them, and upload the ZIP in
   misomoon under **Settings** > **Integrations** > **Upload CSV or zip**.

A year of history at ten breakdowns a day is about 3,650 requests. Swetrix allows 300
requests an hour on Standard, which is about 12 hours, and 6,000 an hour on Plus.

| misomoon file | Columns to fill | Swetrix API v2 |
| --- | --- | --- |
| `imported_visitors.csv` | `date`, `visitors`, `visits`, `pageviews` | `timeseries`: `timestamp`, `visitors`, `sessions`, `pageviews` |
| `imported_pages.csv` | `page`, `visitors`, `visits`, `pageviews` | `breakdown?dimension=page`: `value`, `visitors`, `sessions`, `pageviews` |
| `imported_sources.csv` | `source`, `referrer`, and the visit columns | `breakdown?dimension=referrer` |
| `imported_locations.csv` | `country` on one set of rows, `region` on another | `dimension=country` and `dimension=region` |
| `imported_browsers.csv` | `browser` and the visit columns | `dimension=browser` |
| `imported_operating_systems.csv` | `operating_system` and the visit columns | `dimension=os` |
| `imported_devices.csv` | `device` and the visit columns | `dimension=device` |
| `imported_entry_pages.csv`, `imported_exit_pages.csv` | `entry_page` or `exit_page`, and `visitors` | `dimension=entry_page` and `dimension=exit_page` |
| `imported_custom_events.csv` | `name`, `events` | `…/traffic/custom-events` per day |

Every row also needs `date`, as `YYYY-MM-DD`. Write the values the way misomoon stores
them ([Dimensions](metrics.md#dimensions)):

- `source` is empty for direct visits, misomoon's name for a known host, such as `Google`
  for `google.com` ([Sources and referrers](metrics.md#sources-and-referrers)), or the host
  itself. misomoon counts a row with an empty `source` as `Direct`.
- `country` is a two-letter code. `region` is a name, such as California. Leave `country`
  empty on the region rows, or each visit counts twice under its country.
- `device` is `Desktop`, `Mobile`, or `Tablet`, and `operating_system` uses misomoon's
  names, such as `macOS`. A value in another form, such as `desktop`, sits on its own row.

Some columns have no source and stay empty:

- `bounces` and `visit_duration`. Swetrix's API docs don't say the units of
  `bounce_rate` and `session_duration`. With these columns empty, a period that includes
  imported days shows a lower bounce rate and visit duration.
- `browser_version`, `operating_system_version`, and the `utm_*` columns. Each breakdown
  covers one dimension, and a sources row without its `source` counts as `Direct`.
- `entrances`, `exits`, and per-page bounces. The entry and exit breakdowns return only
  visitors.
- `visitors` in `imported_custom_events.csv`. The API counts events, not the visitors who
  sent them.

On the self-hosted Community Edition, ClickHouse keeps every raw event in the `events`
table, with a daily visitor id in `psid` and a session id in `sid`. You can count every
column of the table above from it, bounces and visit duration included, grouped by day in
your misomoon site's time zone. misomoon's event endpoint takes only current events, so
add the raw events up into daily rows. They can't be sent again as events.

The import fills the top-line numbers, the chart, and the breakdowns
([What imported data fills](import.md#what-imported-data-fills)). Imported days appear
only in reports without filters. If you uploaded the wrong file,
[delete the import](import.md#delete-an-import) and upload again.

## Remove Swetrix

Once the import shows in misomoon, remove Swetrix's script tag and its `swetrix.init()`
and `swetrix.trackViews()` calls. On Swetrix's cloud, cancel your plan after that.

## What stays behind

- Revenue history. misomoon imports no revenue.
- Goals and funnels. Add them again in misomoon.
- Sessions and profiles. misomoon has no user ids, and its import takes daily totals only.
- Event metadata. Imported events have no property breakdown.
- Error and performance history. The **Behavior** and **Speed** views read only misomoon's
  own data ([What imports leave out](import.md#what-imports-leave-out)).
- Cities. misomoon's CSV import has no city column.
- Bounce rate and visit duration per source, page, or country, which the API gives only
  for the day totals.

## Sources

Checked on 2026-10-25.

- Swetrix: [Statistics API v2](https://swetrix.com/docs/statistics-api-v2),
  [pricing and API rate limits](https://swetrix.com/pricing),
  [dashboard export](https://github.com/Swetrix/swetrix/blob/main/docs/content/docs/analytics-dashboard/traffic.mdx),
  [the export in the code](https://github.com/Swetrix/swetrix/blob/main/web/app/pages/Project/View/ViewProject.helpers.tsx),
  [install the script](https://swetrix.com/docs/install-script),
  [swetrix.js reference](https://swetrix.com/docs/swetrix-js-reference),
  [revenue tracking](https://swetrix.com/docs/analytics-dashboard/revenue-tracking),
  [the ClickHouse schema](https://github.com/Swetrix/swetrix/blob/main/backend/migrations/clickhouse/initialise_database.js),
  [the daily visitor id](https://github.com/Swetrix/swetrix/blob/main/backend/apps/community/src/analytics/v2/registry/metrics.ts)
