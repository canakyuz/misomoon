# Switch from Simple Analytics

Simple Analytics' raw export lists every pageview and event, and misomoon's
[CSV import](import.md#csv-format) reads daily totals, so you count the rows per day and
write the files yourself. Without the Export API, the Stats API gives a smaller set of
daily totals. Your tracking calls keep their names: `sa_event('click_signup')` becomes
`misomoon('click_signup')`. Bounces, exit pages, and metadata stay behind.

## Add misomoon next to Simple Analytics

1. Add your site in misomoon and paste its script tag into the `<head>` of every page, next
   to Simple Analytics' `latest.js` ([Track your site](tracking.md#add-the-script)).
2. Leave both scripts on for a week or two, until misomoon's numbers look right to you.

The visitor counts differ by design. Simple Analytics counts a visitor for each pageview
that arrives from another site or with no referrer, so its visitors equal its visits.
misomoon counts a person once a day
([A visitor id lasts one UTC day](metrics.md#a-visitor-id-lasts-one-utc-day)). A person
who comes back from a search later that day counts twice in Simple Analytics and once in
misomoon.

## Replace Simple Analytics' calls

| Simple Analytics | misomoon |
| --- | --- |
| `sa_event('click_signup')` | `misomoon('click_signup')` |
| `sa_event('click_download', { filename: 'document.pdf' })` | `misomoon('click_download', { props: { filename: 'document.pdf' } })` |
| The `window.sa_event` queue snippet | misomoon's queue line ([Send custom events](tracking.md#send-custom-events)) |
| `sa_metadata = { theme_color: 'green' }` for the whole page | `data-prop-theme_color="green"` on the script tag, which adds the property to every event on the page |
| `data-simple-event="click_pricing_page"` on an element | `data-misomoon-event="click_pricing_page"` |
| `auto-events.js` for outbound links and downloads | The **Outbound links** and **Downloads** features, which a new site has on. For email links, add `data-misomoon-event`. |
| `data-ignore-pages="/search/*"` | **Never count these paths** in **Settings** > **Install** > **What to track** |
| `data-mode="hash"` | `data-hash` on the script tag |

Keep Simple Analytics' event names. Imported events keep their names, so the days before
and after the switch add up under one name.

The `data-misomoon-*` attributes need **Tagged events**, which a new site has on
([Choose what to track](tracking.md#choose-what-to-track)). Simple Analytics has no revenue
call, so revenue starts in misomoon. Pass `revenue` on the purchase event
([Track revenue](tracking.md#track-revenue)), or [connect a payment provider](revenue.md).
Pick one of the two per sale, or each sale counts twice.

If a tag manager loads Simple Analytics, replace that tag with misomoon's script tag
([install with a tag manager](google-tag-manager.md#add-the-tag)).

Goals and funnels don't move. Add each goal again in **Settings** > **Goals**
([Create a goal](conversions.md#create-a-goal)), and each funnel in **Funnels**
([Build a funnel](conversions.md#build-a-funnel)). A goal counts the events misomoon
already collected, so you can add it at any time.

## Bring your history

misomoon skips the days it already counted ([Days that count once](import.md#days-that-count-once)). Ask for a range that ends today, or end it the day before you added misomoon to
make fewer requests.

What you can bring depends on your plan. On the Free plan, Simple Analytics keeps 30 days
and has no Stats API, so skip the import. On the Simple plan, the Stats API gives daily totals.
The raw export needs the Export API, which the Simple plan doesn't include.

### Export the raw data points

If your plan has the Export API, use **Export your data** in the dashboard, or call
`GET /api/export/datapoints` with your key in the `Api-Key` header.

1. Set `start` and `end` to a range that ends today, and
   `timezone` to the misomoon site's time zone.
2. Set `format` to CSV and `fields` to `added_iso`, `path`, `is_unique`,
   `referrer_hostname`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`,
   `utm_term`, `duration_seconds`, `scrolled_percentage`, `country_code`, `browser_name`,
   `browser_version`, `os_name`, `os_version`, `device_type`, and `datapoint`.
3. Export once with `type` set to `pageviews`, and once with `type` set to `events`.

Count the rows per day. Take the day from `added_iso`, because `added_date` is in UTC.
`is_unique` marks a pageview that Simple Analytics counted as a visitor.

| misomoon file | From the pageviews export |
| --- | --- |
| `imported_visitors.csv` | The rows with `is_unique` as `visitors` and `visits`, all rows as `pageviews`, and the sum of `duration_seconds` as `visit_duration`. `bounces` has no source. |
| `imported_sources.csv` | The rows with `is_unique`, counted as `visitors` and `visits` per `referrer_hostname` and UTM values. Write the host as `referrer`, and as `source` the way misomoon names a known site, such as `Google` ([Sources and referrers](metrics.md#sources-and-referrers)). Keep a row's referrer and UTM values together, because a row with an empty `source` counts as `Direct`. |
| `imported_pages.csv` | `path` as `page`, with the rows as `pageviews`. There is no visitor id, so use the row count for `visitors` and `visits` too. `total_time_on_page` is the sum of `duration_seconds` and `total_time_on_page_visits` the rows that have one. `total_scroll_depth` is the sum of `scrolled_percentage` and `total_scroll_depth_visits` the rows that have one. |
| `imported_entry_pages.csv` | The `path` of the rows with `is_unique` as `entry_page`, and their count as `entrances` and `visitors`. The other columns have no source. |
| `imported_locations.csv` | `country_code` as `country`. `region` has no source. |
| `imported_browsers.csv` | `browser_name` as `browser`, and `browser_version` |
| `imported_operating_systems.csv` | `os_name` as `operating_system`, and `os_version` as `operating_system_version` |
| `imported_devices.csv` | `device_type` as `device`, written `Desktop`, `Mobile`, or `Tablet` |
| `imported_custom_events.csv` | From the events export, `datapoint` as `name` and the rows as `events`. There is no visitor id, so use the row count for `visitors` too. |

`auto-events.js` names its events `outbound_<host>` and `download_<file>`. Write them as
`Outbound Link: Click` and `File Download`, and misomoon adds them to its own
`Outbound link` and `Download` events.

### Use the Stats API on the Simple plan

Call `GET https://simpleanalytics.com/<hostname>.json?version=6` once for each day, with
`start` and `end` both set to that day, `limit=1000`, and `fields` set to `pageviews`,
`visitors`, `pages`, `referrers`, `countries`, `browser_names`, `os_names`, and
`device_types`. Each list item has `value`, `pageviews`, and `visitors`.

| misomoon file | From the Stats API |
| --- | --- |
| `imported_visitors.csv` | `visitors` as `visitors` and `visits`, and `pageviews`. `bounces` and `visit_duration` have no source. |
| `imported_pages.csv` | `pages`: `value` as `page`, `visitors` as `visitors` and `visits`, and `pageviews`. The time and scroll columns have no source. |
| `imported_sources.csv` | `referrers`: `value` as `referrer`, and as `source` the way misomoon names a known site, such as `Google`, with `visitors` as `visitors` and `visits`, and `pageviews` |
| `imported_locations.csv` | `countries`: `value` as `country` |
| `imported_browsers.csv` | `browser_names`: `value` as `browser` |
| `imported_operating_systems.csv` | `os_names`: `value` as `operating_system` |
| `imported_devices.csv` | `device_types`: `value` as `device`, written `Desktop`, `Mobile`, or `Tablet` |

Leave out the UTM lists. Each comes as its own list, and a row with no `source` would add
its visits to `Direct` a second time. A list stops at 1,000 values a day.

### Upload the files

1. Zip the files as `simple-analytics-history.zip`, with `imported_visitors.csv` among
   them.
2. In misomoon, open **Settings** > **Integrations**, click **Upload CSV or zip**, and pick
   `simple-analytics-history.zip`.

An empty `bounces` counts as `0`, so the imported days lower the bounce rate of any period
that includes them. Imported days appear only in reports without filters
([What imported data fills](import.md#what-imported-data-fills)). If you uploaded the
wrong file, [delete the import](import.md#delete-an-import) and upload again.

## Remove Simple Analytics

Once the import shows in misomoon, remove `latest.js`, `auto-events.js`, and the `sa_event`
calls. The Simple plan keeps your data for 3 years, so keep your files and export again
while you need to.

## What stays behind

- Bounces. Simple Analytics has no visit that spans pages, so imported days have none.
- Exit pages. The export has no way to tell a visit's last page.
- Exact visitors per page and per event. There is no visitor id, so the counts above
  count a person once per view or per event.
- Metadata. misomoon's CSV import reads no properties.
- Regions and cities. Simple Analytics records countries only.
- From the Stats API, UTM tags, browser and operating system versions, time on page, and
  scroll depth. The API gives only a median time on page.
- Goals and funnels. Add them again in misomoon.

## Sources

Checked on 2026-10-25.

- Simple Analytics: [export your data](https://docs.simpleanalytics.com/export-data),
  [Export API](https://docs.simpleanalytics.com/api/export-data-points),
  [Stats API](https://docs.simpleanalytics.com/api/stats),
  [unique visits](https://docs.simpleanalytics.com/explained/unique-visits),
  [time on page](https://docs.simpleanalytics.com/explained/time-on-page),
  [script](https://docs.simpleanalytics.com/script),
  [events](https://docs.simpleanalytics.com/events),
  [metadata](https://docs.simpleanalytics.com/metadata),
  [automated events](https://docs.simpleanalytics.com/automated-events),
  [automated events in the code](https://github.com/simpleanalytics/scripts/blob/main/src/auto-events.js),
  [pricing](https://www.simpleanalytics.com/pricing)
