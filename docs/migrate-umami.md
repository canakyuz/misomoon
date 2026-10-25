# Switch from Umami

Umami has no export in the layout that misomoon's [CSV import](import.md#csv-format)
reads, so you build the daily files yourself: from Umami's API, or on a self-hosted Umami,
from its database. Your tracking calls keep their names, and the event data moves under
`props`: `umami.track('Signup', { plan })` becomes `misomoon('Signup', { props: { plan } })`.
Revenue history and event data stay behind.

## Add misomoon next to Umami

1. Add your site in misomoon and paste its script tag into the `<head>` of every page, next
   to Umami's tag with `data-website-id` ([Track your site](tracking.md#add-the-script)).
2. Write down the first full day misomoon collects, which is the day after you added the
   tag. The steps below call it the cutoff day.
3. Leave both scripts on for a week or two, until misomoon's numbers look right to you.

## Replace Umami's calls

`umami.track()` takes the event data as its second argument. `misomoon()` takes it under
`props`, and revenue under `revenue` as an amount and a currency.

| Umami | misomoon |
| --- | --- |
| `umami.track('signup-button')` | `misomoon('signup-button')` |
| `umami.track('signup-button', { plan: 'newsletter', id: 123 })` | `misomoon('signup-button', { props: { plan: 'newsletter', id: 123 } })` |
| `umami.track('checkout-cart', { revenue: 19.99, currency: 'USD' })` | `misomoon('checkout-cart', { revenue: { amount: 19.99, currency: 'USD' } })` |
| `data-umami-event="Signup button" data-umami-event-id="123"` | `data-misomoon-event="Signup button" data-misomoon-prop-id="123"` |
| `data-auto-pageview="false"` on the tag, then `umami.track()` | `data-manual` on the tag, then `misomoon('pageview')` |
| `data-domains` | Nothing to set. misomoon counts pages only on the site's domain and its subdomains. |
| `data-exclude-search` | Nothing to set. misomoon stores each page without its query string. |
| `data-do-not-track` | **Respect Global Privacy Control and Do Not Track** in **Settings** > **Install** > **Privacy** ([privacy settings](compliance.md#privacy-settings)) |
| `umami.identify()` | No equivalent. misomoon has no user ids. |

The `data-misomoon-*` attributes need **Tagged events**, which a new site has on
([Choose what to track](tracking.md#choose-what-to-track)). If you send revenue from a
payment provider's webhook instead, [connect it](revenue.md) and drop `revenue` from the
call, or each sale counts twice.

misomoon imports no goals. To count an event as a conversion, add a goal for it in
**Settings** > **Goals** ([Create a goal](conversions.md#create-a-goal)). A goal counts
the events misomoon already collected, so you can add it at any time.

## Bring your history

The **Export** button on Umami's dashboard doesn't help here. Its ZIP file holds one
total per value for the whole period, with no dates, bounces, or visit durations. Build
one `imported_<report>.csv` file per report instead, with a `date` column and one row
per day and value.

Include only the days before the cutoff day. misomoon reads every row of an upload, so a
day that is both in the files and in misomoon counts twice. Count each day in the time
zone of the misomoon site's **Timezone** ([Sites](settings.md#sites)), because misomoon
stores an imported day under the same date.

Write each value the way misomoon names it ([Dimensions](metrics.md#dimensions)), or it
sits on a row of its own next to misomoon's. Umami stores browsers as keys such as
`chrome`, so write `Chrome`. For a source, write the name misomoon gives a known site,
such as `Google` for `google.com`, and the domain for any other site
([Sources and referrers](metrics.md#sources-and-referrers)). Write devices as `Desktop`,
`Mobile`, or `Tablet`.

### Umami Cloud

Umami Cloud's **Settings** > **Data** > **Export** emails gzip-compressed CSV files of
raw page views, events, and sessions. Umami doesn't document their columns, and misomoon
reads neither `.gz` files nor raw events, so use the API instead.

1. Create an API key in Umami Cloud ([Umami's API key page](https://docs.umami.is/docs/cloud/api-key)).
2. For each day before the cutoff day, call the endpoints in the table below under
   `https://api.umami.is/v1/websites/<website id>/`. Set `startAt` and `endAt` to the
   start and the end of the day, in milliseconds.
3. Write each answer into the file and columns that the table names, with the day in
   `date`.

Umami Cloud allows 50 calls every 15 seconds per API key. A day takes about a dozen
calls, so a year of history takes about 4,500 calls and 25 minutes.

The field names come from Umami 3.4.1's code, because Umami's API pages don't list them.
Each `/metrics/expanded` row has `name`, `pageviews`, `visitors`, `visits`, `bounces`, and
`totaltime`, the total length of the visits in seconds.

| misomoon file | Umami call | Columns |
| --- | --- | --- |
| `imported_visitors.csv` | `/stats` | `visitors`, `visits`, `pageviews`, and `bounces` as they are, and `totaltime` as `visit_duration` |
| `imported_pages.csv` | `/metrics/expanded?type=path` | `name` as `page`, and `pageviews`, `visitors`, and `visits` |
| `imported_entry_pages.csv` | `/metrics/expanded?type=entry` | `name` as `entry_page`, `visits` as `entrances`, `totaltime` as `visit_duration`, and `visitors`, `pageviews`, and `bounces` |
| `imported_exit_pages.csv` | `/metrics/expanded?type=exit` | `name` as `exit_page`, `visits` as `exits`, `totaltime` as `visit_duration`, and `visitors`, `pageviews`, and `bounces` |
| `imported_sources.csv` | `/metrics/expanded?type=referrer` | `name` as `referrer`, the source's name as `source`, `totaltime` as `visit_duration`, and the other visit columns |
| `imported_locations.csv` | `/metrics/expanded?type=country` and `?type=region` | `name` as `country` on one set of rows, and as `region` on another, with the visit columns |
| `imported_browsers.csv` | `/metrics/expanded?type=browser` | `name` as `browser`, with the visit columns |
| `imported_operating_systems.csv` | `/metrics/expanded?type=os` | `name` as `operating_system`, with the visit columns |
| `imported_devices.csv` | `/metrics/expanded?type=device` | `name` as `device`, with the visit columns |
| `imported_custom_events.csv` | `/metrics/expanded?type=event` and `/metrics?type=event` | The event name as `name`, `visitors` from the first call, and the count from the second as `events` |

A row with an empty `country` adds nothing to countries, and one with an empty `region`
adds nothing to regions, so the two sets of location rows don't count twice.
`/metrics` and `/metrics/expanded` return 500 rows unless you raise their limit
([Umami's API docs](https://docs.umami.is/docs/api)).

These misomoon columns have no source in the API and stay empty:

- The five `utm_*` columns of `imported_sources.csv`. Umami reports each UTM tag on its
  own, and rows that split a day's visits by tag would count them again under `source`.
- `browser_version` and `operating_system_version`. Umami stores no browser version, and
  its OS name carries the version, such as `Windows 10`.
- `total_time_on_page`, `total_time_on_page_visits`, `total_scroll_depth`, and
  `total_scroll_depth_visits` in `imported_pages.csv`.

### Self-hosted Umami

Call the same endpoints on your own server, under
`https://<your Umami>/api/websites/<website id>/`, with a login token
([Umami's API docs](https://docs.umami.is/docs/api)).

Or read the database. The table says where each file comes from in the `website_event`
and `session` tables of Umami 3.4.1. In `website_event`, an `event_type` of `1` is a page
view and `2` is a custom event. Keep only rows whose `created_at` falls before the cutoff
day.

| misomoon file | Umami tables and columns |
| --- | --- |
| `imported_visitors.csv` | Per day: distinct `session_id` as `visitors`, distinct `visit_id` as `visits`, page view rows as `pageviews`, visits with one page view as `bounces`, and the sum over visits of the last `created_at` minus the first, in seconds, as `visit_duration` |
| `imported_sources.csv` | Each visit's first event: `referrer_domain` as `referrer`, the source's name as `source`, and the `utm_*` columns. Write one row per combination of the six values. |
| `imported_pages.csv` | Page view rows by `url_path`: their count as `pageviews`, distinct `session_id` as `visitors`, and distinct `visit_id` as `visits` |
| `imported_entry_pages.csv`, `imported_exit_pages.csv` | The first and the last page view of each visit, by `url_path` |
| `imported_locations.csv` | `session.country` and `session.region` |
| `imported_browsers.csv`, `imported_operating_systems.csv`, `imported_devices.csv` | `session.browser`, `session.os`, and `session.device` |
| `imported_custom_events.csv` | Custom event rows by `event_name`: their count as `events`, and distinct `session_id` as `visitors` |

Umami's session id changes once a month by default, so distinct `session_id` per day
counts each visitor once that day.

### Upload the files

1. Zip the files:

   ```sh
   zip umami-history.zip imported_*.csv
   ```

2. In misomoon, open **Settings** > **Integrations**, click **Upload CSV or zip**, and
   pick `umami-history.zip`.

Include `imported_visitors.csv`, the only file that fills the top-line numbers and the
chart. Imported days appear only in reports without filters
([What imported data fills](import.md#what-imported-data-fills)). If you uploaded the
wrong files, [delete the import](import.md#delete-an-import) and upload again.

## Remove Umami

Once the import shows in misomoon, remove Umami's script tag and its `umami.track()`
calls.

## What stays behind

- Revenue history. Umami keeps revenue in its `revenue` table, and misomoon imports none.
- Event data. misomoon imports event counts without properties.
- Browser versions, UTM tags on the API path, time on page, and scroll depth, as listed
  above.
- Cities. misomoon's CSV import doesn't read them.
- Region names. Umami stores region codes, such as `US-CA`, and misomoon's own data names
  the region, such as California. The two sit on separate rows in **Regions**.
- Operating systems. Umami's `Windows 10` sits on its own row next to misomoon's
  `Windows`.
- User ids from `umami.identify()`.

## Sources

Checked on 2026-10-25.

- Umami: [export data](https://docs.umami.is/docs/cloud/export-data),
  [API](https://docs.umami.is/docs/api),
  [API key](https://docs.umami.is/docs/cloud/api-key),
  [tracker configuration](https://docs.umami.is/docs/tracker-configuration),
  [tracker functions](https://docs.umami.is/docs/tracker-functions),
  [track events](https://docs.umami.is/docs/track-events),
  [revenue](https://docs.umami.is/docs/revenue),
  [database schema in the code](https://github.com/umami-software/umami/blob/559e3c6/prisma/schema.prisma),
  [stats query in the code](https://github.com/umami-software/umami/blob/559e3c6/src/queries/sql/getWebsiteStats.ts),
  [expanded metrics route in the code](https://github.com/umami-software/umami/blob/559e3c6/src/app/api/websites/%5BwebsiteId%5D/metrics/expanded/route.ts),
  [session salt in the code](https://github.com/umami-software/umami/blob/559e3c6/src/lib/crypto.ts)
