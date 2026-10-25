# Switch from Simple Analytics

misomoon reads Simple Analytics' raw export as you download it: every pageview and event,
counted into visits by their session. Without the Export API, the Stats API gives a
smaller set of daily totals, which you write into misomoon's
[CSV files](import.md#csv-format) yourself. Your tracking calls keep their names:
`sa_event('click_signup')` becomes `misomoon('click_signup')`. Metadata stays behind.

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

If your plan has the Export API, call `GET /api/export/datapoints` with your key in the
`Api-Key` header, once for page views and once for events, and upload both files
together.

1. Set `version=6`, `format=csv`, `hostname` to your site, `start` and `end` to whole
   days, `timezone` to the misomoon site's **Timezone** ([Sites](settings.md#sites)), and
   `robots=false`.
2. Set `fields` to `added_iso`, `hostname`, `path`, `is_unique`, `referrer_hostname`,
   `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`,
   `duration_seconds`, `scrolled_percentage`, `country_code`, `browser_name`,
   `browser_version`, `os_name`, `os_version`, `device_type`, and `session_id`, and
   `type=pageviews`.
3. Ask again with `fields` set to `added_iso`, `hostname`, `datapoint`, `path`, and
   `session_id`, and `type=events`.
4. In misomoon, open **Settings** > **Integrations**, click **Upload CSV or zip**, and
   pick both files, or a ZIP of them.

```sh
curl -H "Api-Key: $SA_KEY" -o pageviews.csv \
  "https://simpleanalytics.com/api/export/datapoints?version=6&format=csv&hostname=example.com&start=2026-01-01&end=2026-03-31&timezone=Europe/Amsterdam&robots=false&type=pageviews&fields=added_iso,hostname,path,is_unique,referrer_hostname,utm_source,utm_medium,utm_campaign,utm_content,utm_term,duration_seconds,scrolled_percentage,country_code,browser_name,browser_version,os_name,os_version,device_type,session_id"
```

misomoon counts the rows as its tracker counts visits
([Raw event exports](import.md#raw-event-exports)). An export without `session_id`
fails with `this Simple Analytics export has no session_id column; export it again with
session_id among the fields`.

| Simple Analytics field | Goes into |
| --- | --- |
| `session_id` | The visit. Its first page view gives the entry page, source, UTM tags, country, browser, system, and device, and its last page view the exit page. A session with one page view and no event is a bounce. |
| `is_unique` | Visitors. A session counts as a visitor when one of its page views has `is_unique`, as Simple Analytics counts them. Simple Analytics has no visitor id, so a person with two sessions in a day counts twice in breakdowns where both land. |
| `added_iso` | The day, in the misomoon site's time zone |
| `referrer_hostname` | Sources, referrers, and channels. A referrer on `hostname` counts as none, and a name without a dot, such as `google`, is a source's name. |
| `duration_seconds`, `scrolled_percentage` | Time on page and scroll depth per page, and the time on a visit's last page adds to its duration |
| `browser_name`, `os_name`, and their versions | misomoon's names: `Google Chrome` becomes `Chrome` and `Microsoft Edge` becomes `Edge`. Windows `10` and up, which includes Simple Analytics' `19.0.0` for Windows 11, is `Windows 10/11`. |
| `device_type` | `Desktop`, `Mobile`, or `Tablet` |
| `datapoint` | Custom events. `auto-events.js` names its events `outbound_<host>` and `download_<file>`; they count as misomoon's own `Outbound link` and `Download` events. |

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

### Upload the Stats API files

1. Zip the files as `simple-analytics-history.zip`, with `imported_visitors.csv` among
   them.
2. In misomoon, open **Settings** > **Integrations**, click **Upload CSV or zip**, and pick
   `simple-analytics-history.zip`.

From the Stats API, an empty `bounces` counts as `0`, so the imported days lower the
bounce rate of any period that includes them. Imported days appear only in reports without filters
([What imported data fills](import.md#what-imported-data-fills)). If you uploaded the
wrong file, [delete the import](import.md#delete-an-import) and upload again.

## Remove Simple Analytics

Once the import shows in misomoon, remove `latest.js`, `auto-events.js`, and the `sa_event`
calls. The Simple plan keeps your data for 3 years, so keep your files and export again
while you need to.

## What stays behind

- Metadata. misomoon imports events without properties.
- Regions and cities. Simple Analytics records countries only.
- From the Stats API, bounces, exit pages, UTM tags, browser and operating system
  versions, time on page, and scroll depth. The API gives only a median time on page.
- Goals and funnels. Add them again in misomoon.

## Sources

Checked on 2026-10-26.

The raw export import was tested on one real day of Simple Analytics' own public
dashboard, 2026-10-20, read from its Export API on 2026-10-26. misomoon counted the 625
visitors the export marks with `is_unique`, and all 817 page views, in 685 visits.

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
