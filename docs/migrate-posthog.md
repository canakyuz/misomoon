# Switch from PostHog

PostHog has no export in the layout that misomoon's [CSV import](import.md#csv-format)
reads, but it keeps every event and session, so one SQL query per file in PostHog's SQL
editor gives exact daily totals. Your tracking calls keep their names, and the properties
move under `props`: `posthog.capture('Signup', { plan })` becomes
`misomoon('Signup', { props: { plan } })`. Revenue history, event properties, and person
profiles stay behind.

## Add misomoon next to PostHog

1. Add your site in misomoon and paste its script tag into the `<head>` of every page, next
   to PostHog's snippet ([Track your site](tracking.md#add-the-script)). In a React or
   Next.js app, use the SDK instead
   ([Add the tracker to a React or Next.js app](sdk.md#add-the-tracker-to-a-react-or-nextjs-app)).
2. Leave both on for a week or two, until misomoon's numbers look right to you.

## Replace PostHog's calls

`posthog.capture()` takes the properties as its second argument. `misomoon()` takes them
under `props`, and revenue under `revenue` as an amount and a currency.

| PostHog | misomoon |
| --- | --- |
| `posthog.capture('user_signed_up', { login_type: 'email', is_free_trial: true })` | `misomoon('user_signed_up', { props: { login_type: 'email', is_free_trial: true } })` |
| `posthog.capture('purchase_completed', { revenue: 1000, currency: 'USD', product: 'Premium Plan' })` | `misomoon('purchase_completed', { revenue: { amount: 10, currency: 'USD' }, props: { product: 'Premium Plan' } })` |
| `$pageview` and `$pageleave` | The automatic `pageview` and `engagement` ([What the tracker sends by itself](tracking.md#what-the-tracker-sends-by-itself)) |
| Autocapture | `data-misomoon-event` on the elements that matter. The **Clicks** feature counts clicks per element in **Behavior** ([See what people do on a page](tracking.md#see-what-people-do-on-a-page)). |
| `cookieless_mode` | Nothing to set. misomoon sets no cookies. |
| `posthog.identify()`, groups, feature flags, and session replay | No equivalent |

PostHog recommends revenue in the currency's smallest unit, so `1000` is $10.00.
misomoon takes the amount in whole units, so divide by 100, except for currencies without
decimals. If PostHog reads your revenue from Stripe, connect Stripe's webhook to misomoon
instead ([Connect payments](revenue.md)) and drop `revenue` from the call, or each sale
counts twice. To send events from your server, use the SDK
([Send events from your server](sdk.md#send-events-from-your-server)).

The `data-misomoon-*` attributes need **Tagged events**, which a new site has on
([Choose what to track](tracking.md#choose-what-to-track)).

Goals and funnels don't move. Add each goal in **Settings** > **Goals**
([Create a goal](conversions.md#create-a-goal)) and each funnel in **Funnels**
([Build a funnel](conversions.md#build-a-funnel)). Both count the events misomoon already
collected, so you can add them at any time.

## Bring your history

Write one query per file in PostHog's SQL editor, export each result as CSV, and name it
after the file. The table below gives each query's table, grouping, and columns. Batch
exports and file download exports hold raw events in Parquet or JSON Lines, which misomoon
doesn't read. misomoon skips the days it already counted ([Days that count once](import.md#days-that-count-once)).

1. Add a `LIMIT` that covers every row. PostHog returns 100 rows without one. For the
   page reports, run one month or one quarter at a time.
2. Export each result as CSV and name it `imported_<report>.csv`. For a report you ran in
   parts, add the dates, such as `imported_pages_20250101_20250331.csv`.
3. Compare one day's visitors in `imported_visitors.csv` with PostHog's web analytics
   dashboard. PostHog's docs don't say which time zone `toDate()` uses in the SQL editor,
   and misomoon stores each imported day under the same date in the site's **Timezone**
   ([Sites](settings.md#sites)).

| misomoon file | PostHog table and grouping | Columns |
| --- | --- | --- |
| `imported_visitors.csv` | `sessions` where `$pageview_count > 0`, by `toDate($start_timestamp)` as `date` | `count(DISTINCT distinct_id)` as `visitors`, `count()` as `visits`, `sum($pageview_count)` as `pageviews`, `countIf($is_bounce = 1)` as `bounces`, and `sum($session_duration)` as `visit_duration` |
| `imported_entry_pages.csv` | The same, and by `$entry_pathname` as `entry_page` | `count()` as `entrances`, and `visitors`, `pageviews`, `bounces`, and `visit_duration` as above |
| `imported_exit_pages.csv` | The same, and by `$exit_pathname` as `exit_page` | `count()` as `exits`, and the rest as above |
| `imported_sources.csv` | The same, and by `$entry_referring_domain` and the five `$entry_utm_*` columns together | The domain as `referrer`, the source's name as `source`, `$entry_utm_source` as `utm_source` and likewise for the other four, and the visit columns as above |
| `imported_pages.csv` | `events` where `event = '$pageview'`, by `toDate(timestamp)` and `properties.$pathname` as `page` | `count()` as `pageviews`, `count(DISTINCT person_id)` as `visitors`, and `count(DISTINCT $session_id)` as `visits` |
| `imported_custom_events.csv` | `events` where `event NOT LIKE '$%'`, by `toDate(timestamp)` and `event` as `name` | `count()` as `events`, and `count(DISTINCT person_id)` as `visitors` |
| `imported_locations.csv`, `imported_browsers.csv`, `imported_operating_systems.csv`, `imported_devices.csv` | The properties of each session's first `$pageview`: `$geoip_country_code` as `country`, `$geoip_subdivision_1_name` as `region`, `$browser` and `$browser_version`, `$os` and `$os_version`, and `$device_type` as `device` | The visit columns, counted per session as for `imported_visitors.csv` |

Group `sources` by the domain and the five tags in one query, so each row is one real
combination. Rows that split a day's sessions by tag would count them again under
`source`.

Write each value the way misomoon names it ([Dimensions](metrics.md#dimensions)), or it
sits on a row of its own next to misomoon's:

- For a source, write the name misomoon gives a known site, such as `Google` for
  `google.com`, and the domain for any other site
  ([Sources and referrers](metrics.md#sources-and-referrers)). PostHog's docs don't say
  what `$entry_referring_domain` holds for a session without a referrer. Find it in your
  results and leave `source` and `referrer` empty on those rows, so misomoon counts them
  as `Direct`.
- Write `browser_version` as the major version only, such as `141`, and
  `operating_system_version` as two numbers, such as `17.4`.
- Write devices as `Desktop`, `Mobile`, or `Tablet`.

`total_time_on_page`, `total_time_on_page_visits`, `total_scroll_depth`, and
`total_scroll_depth_visits` in `imported_pages.csv` have no source in the table and stay
empty.

For a large site, run the same queries through the query API,
`POST /api/projects/<project id>/query/`, with a personal API key. It returns up to
50,000 rows with your own `LIMIT`, and allows 2,400 queries an hour per project
([PostHog's query API](https://posthog.com/docs/api/queries)).

Then zip the files and upload them:

1. Zip the files:

   ```sh
   zip posthog-history.zip imported_*.csv
   ```

2. In misomoon, open **Settings** > **Integrations**, click **Upload CSV or zip**, and
   pick `posthog-history.zip`.

Include `imported_visitors.csv`, the only file that fills the top-line numbers and the
chart. Imported days appear only in reports without filters
([What imported data fills](import.md#what-imported-data-fills)). If you uploaded the
wrong files, [delete the import](import.md#delete-an-import) and upload again.

## Remove PostHog

Once the import shows in misomoon, remove PostHog's snippet, the `posthog.init()` call,
and your `posthog.capture()` calls. If you use PostHog for session replay, feature flags,
or experiments, keep its snippet for those.

## What stays behind

- Revenue history. PostHog keeps revenue in event properties, and misomoon imports none.
- Event properties, person profiles, and funnels. misomoon imports event counts
  without properties.
- Outbound link and download history. PostHog records those clicks as autocapture events,
  with no event name to map to misomoon's `Outbound link` and `Download`.
- Time on page and scroll depth, as listed above.
- Exact bounces. PostHog counts a bounce only for a session with one page view, no
  autocapture, and less than 10 seconds on the page, so imported bounce rates may read
  lower than misomoon's own.
- Exact visitors. PostHog counts an identified person on two devices once, and misomoon
  counts each device.
- Cities. misomoon's CSV import doesn't read them.

## Sources

Checked on 2026-10-25.

- PostHog: [data import and export](https://posthog.com/docs/getting-started/data-import-export),
  [sessions table](https://posthog.com/docs/data/sessions),
  [query API](https://posthog.com/docs/api/queries),
  [API rate limits](https://posthog.com/docs/api),
  [batch exports](https://posthog.com/docs/cdp/batch-exports),
  [file download exports](https://posthog.com/docs/cdp/file-download-exports),
  [web analytics dashboard](https://posthog.com/docs/web-analytics/dashboard),
  [JavaScript library](https://posthog.com/docs/libraries/js),
  [capture events](https://posthog.com/docs/product-analytics/capture-events),
  [capture revenue events](https://posthog.com/docs/revenue-analytics/capture-revenue-events),
  [cookieless tracking](https://posthog.com/docs/privacy/cookieless-tracking)
