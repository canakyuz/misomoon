# Switch from Rybbit

Rybbit's exports don't use the file names and columns that misomoon's
[CSV import](import.md#csv-format) reads, so you write the files yourself. The dashboard
export gives the daily totals. The API on a paid plan, or the database on a self-hosted
Rybbit, gives the breakdowns per day. Your tracking calls keep their shape:
`window.rybbit.event('Signup', { plan: 'pro' })` becomes
`misomoon('Signup', { props: { plan: 'pro' } })`. Goals, event properties, and identified
users stay behind.

## Add misomoon next to Rybbit

1. Add your site in misomoon and paste its script tag into the `<head>` of every page, next
   to Rybbit's ([Track your site](tracking.md#add-the-script)).
2. Write down the first full day misomoon collects, which is the day after you added the
   tag. The steps below call it the cutoff day.
3. Leave both scripts on for a week or two, until misomoon's numbers look right to you.

## Replace Rybbit's calls

Both calls take the event name first. misomoon puts the properties under `props`, and a
property value is a string, a number, or a boolean.

| Rybbit | misomoon |
| --- | --- |
| `window.rybbit.event('Item Added To Cart', { itemId: 'PROD123', price: 49.99 })` | `misomoon('Item Added To Cart', { props: { itemId: 'PROD123', price: 49.99 } })` |
| `data-rybbit-event="signup_clicked" data-rybbit-prop-plan="pro"` | `data-misomoon-event="signup_clicked" data-misomoon-prop-plan="pro"` |
| `window.rybbit.pageview()` | `misomoon('pageview')`, with `data-manual` on the script tag if you send every pageview yourself |
| `rybbit.identify(userId, traits)` and `setTraits` | No equivalent. misomoon keeps no user ids, so delete the calls. |
| Rybbit's outbound clicks and form submits | The **Outbound links** and **Form submits** features, which a new site has on |
| `data-skip-patterns` on the script tag | **Never count these paths** in **Settings** > **Install** > **What to track** |
| A price sent as a property | `misomoon('Purchase', { revenue: { amount: 49.99, currency: 'USD' } })` |

Keep Rybbit's event names, such as `signup_clicked`. Imported events keep their names, so
the days before and after the switch add up under one name.

The `data-misomoon-*` attributes need **Tagged events**, which a new site has on
([Choose what to track](tracking.md#choose-what-to-track)). Rybbit has no revenue call, so
revenue starts in misomoon. If a payment provider's webhook reports your sales instead,
[connect it](revenue.md) and leave `revenue` out of the call, or each sale counts twice.

Goals don't move. Add each one again in **Settings** > **Goals**
([Create a goal](conversions.md#create-a-goal)). A Rybbit goal on outbound clicks or form
submits becomes a goal on the `Outbound link` or `Form sent` event. A goal counts the
events misomoon already collected, so you can add it at any time.

## Bring your history

Rybbit Cloud's Free and Basic plans have no API keys, so on them only the daily totals and
the chart can come across, from the dashboard export. Rybbit doesn't say which plans show
the **Export** button.

### Export the daily totals

1. In Rybbit's dashboard, clear the filters and set the range to end the day before the
   cutoff day. The export holds the dashboard's current range and filters.
2. Click **Export** and unzip the download.
3. Open `overview-timeseries.csv`, the only file in the ZIP with a row per day. The other
   files hold totals for the whole range and have no date, so misomoon can't use them.
4. Write its rows into `imported_visitors.csv` with the columns below.

Rybbit doesn't document the columns of `overview-timeseries.csv`. The table uses the
field names of the time-series API (`overview/time-series` with `bucket=day`), which
returns the same daily numbers.

| misomoon column | Rybbit field |
| --- | --- |
| `date` | The first 10 characters of `time`, such as `2026-10-11` |
| `visitors` | `users` |
| `visits` | `sessions` |
| `pageviews` | `pageviews` |
| `bounces` | `sessions` times `bounce_rate`, divided by 100. Rybbit's rate runs from 0 to 100. |
| `visit_duration` | `sessions` times `session_duration`, Rybbit's average visit length in seconds |

### Export the breakdowns

The breakdowns need Rybbit's raw events, one row per event:

- On Rybbit Cloud's Standard and Pro plans, page through
  `GET /api/sites/:site/events` with an API key, back from the day before the cutoff day.
  The API allows 50 requests per 10 seconds, and 5,000 a day on Standard or 25,000 on Pro.
  Past the limit it answers `429` with a `Retry-After` header.
- On a self-hosted Rybbit, the events are in the `events` table of the `analytics`
  database. Open it with:

  ```sh
  docker exec -it clickhouse clickhouse-client --database analytics
  ```

Count the events per day in the misomoon site's time zone, because misomoon stores each
row under its date in that time zone. Each file takes the visit columns for each value:
`visitors` (distinct `user_id`), `visits` (distinct `session_id`), `pageviews` (events
with `type` `pageview`), `bounces` (sessions with one pageview), and `visit_duration` (the
seconds from each session's first event to its last, added up).

| misomoon file | Rybbit fields |
| --- | --- |
| `imported_sources.csv` | The first event of each session: the host of `referrer` as `source`, written as misomoon names a known site, such as `Google` ([Sources and referrers](metrics.md#sources-and-referrers)), `referrer` as it is, and the `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, and `utm_term` values of `querystring`. Keep a session's referrer and UTM values on one row. A row with an empty `source` counts as `Direct`, so a separate row per UTM value adds its visits to `Direct` again. |
| `imported_pages.csv` | `pathname` as `page`, with `visitors`, `visits`, and `pageviews`. `total_time_on_page`, `total_time_on_page_visits`, `total_scroll_depth`, and `total_scroll_depth_visits` have no source and stay empty. |
| `imported_entry_pages.csv` | The `pathname` of each session's first pageview as `entry_page`, and the number of those sessions as `entrances` |
| `imported_exit_pages.csv` | The `pathname` of each session's last pageview as `exit_page`, and the number of those sessions as `exits` |
| `imported_locations.csv` | `country` and `region` |
| `imported_browsers.csv` | `browser` and `browser_version` |
| `imported_operating_systems.csv` | `operating_system` and `operating_system_version` |
| `imported_devices.csv` | `device_type` as `device`, written `Desktop`, `Mobile`, or `Tablet` as misomoon writes it |
| `imported_custom_events.csv` | `event_name` of the `custom_event` events as `name`, with `outbound` events as `Outbound Link: Click` and `form_submit` events as `Form: Submission`. `events` is the count, and `visitors` the distinct `user_id`. |

### Upload the files

1. Check that every file holds only days before the cutoff day. misomoon reads every row,
   so a day that misomoon also collected counts twice. Delete the later rows.
2. Zip the files as `rybbit-history.zip`, with `imported_visitors.csv` among them.
3. In misomoon, open **Settings** > **Integrations**, click **Upload CSV or zip**, and pick
   `rybbit-history.zip`.

Imported days appear only in reports without filters
([What imported data fills](import.md#what-imported-data-fills)). If you uploaded the
wrong file, [delete the import](import.md#delete-an-import) and upload again.

## Remove Rybbit

Once the import shows in misomoon, remove Rybbit's script tag and its `rybbit` calls.
Rybbit Cloud keeps your data for 3 years on Standard and 5 years on Pro. Keep your export
files, so you can upload them again later.

## What stays behind

- The breakdowns, on Free and Basic. Only the daily totals come across there.
- Event properties. misomoon's CSV import reads none.
- Button clicks, copies, input changes, Web Vitals, and identified users. misomoon imports
  none of them.
- Goals and funnels. Add them again in misomoon.
- Time on page and scroll depth. Rybbit's events carry neither.
- Cities and hostnames. misomoon's CSV import reads no city, and a site with several
  hostnames gets their paths added together.
- Region names. Rybbit stores region codes, such as `US-CA`, and misomoon's own data names
  the region, such as California. The two sit on separate rows in **Regions**.
- Rybbit's channels. misomoon works out each channel from `source`, `utm_medium`, and
  `utm_source`.

## Sources

Checked on 2026-10-25.

- Rybbit: [API getting started](https://rybbit.com/docs/api/getting-started),
  [get events](https://rybbit.com/docs/api/events/list),
  [time series](https://rybbit.com/docs/api/overview/time-series),
  [dashboard export in the code](https://github.com/rybbit-io/rybbit/blob/master/client/src/app/%5Bsite%5D/components/SubHeader/Export/exportCsv.ts),
  [event fields in the code](https://github.com/rybbit-io/rybbit/blob/master/server/src/api/analytics/utils/eventSchema.ts),
  [managing your installation](https://rybbit.com/docs/managing-your-installation),
  [script](https://rybbit.com/docs/script),
  [custom events](https://rybbit.com/docs/track-events),
  [goals](https://rybbit.com/docs/goals),
  [pricing](https://rybbit.com/pricing)
