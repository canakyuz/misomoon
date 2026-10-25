# Switch from Mixpanel

misomoon replaces Mixpanel's website analytics: visitors, sources, pages, events, goals,
funnels, and revenue. It doesn't replace per-user product analytics. User profiles,
identity merging, cohorts, retention, experiments, feature flags, and session replay stay
in Mixpanel. Mixpanel's Raw Event Export holds every event, which you add up into
misomoon's daily [CSV files](import.md#csv-format). Your events keep their names:
`mixpanel.track('Signup', { plan: 'pro' })` becomes
`misomoon('Signup', { props: { plan: 'pro' } })`.

## Add misomoon next to Mixpanel

1. Decide where misomoon goes. If your team uses Mixpanel for signed-in users, cohorts, or
   experiments, add misomoon to your marketing site and keep Mixpanel in the product.
   Otherwise, replace it on both.
2. Add your site in misomoon and paste its script tag into the `<head>` of every page, next
   to `mixpanel.init()` ([Track your site](tracking.md#add-the-script)).
3. Leave both on for a week or two, until misomoon's numbers look right to you. misomoon
   counts a visitor per browser per day, so it reads higher than a count of Mixpanel's
   `distinct_id`, which joins a signed-in person's devices
   ([A visitor id lasts one UTC day](metrics.md#a-visitor-id-lasts-one-utc-day)).

## Replace Mixpanel's calls

| Mixpanel | misomoon |
| --- | --- |
| `mixpanel.init('YOUR_PROJECT_TOKEN', { track_pageview: true })` from `mixpanel-browser` | The script tag, or `init({ site: 'your-site', host: 'https://analytics.example.com' })` from `@misomoon/sdk/web`. Both count pageviews and route changes by themselves. |
| `track_pageview: 'url-with-path'` for a single-page app | Nothing. Add `data-hash` for a router that uses `#/routes`. |
| `mixpanel.track('Played song', { genre: 'hip-hop' })` | `misomoon('Played song', { props: { genre: 'hip-hop' } })` |
| `mixpanel.register({ plan: 'pro' })` | `data-prop-plan="pro"` on the script tag, or `init({ props: { plan: 'pro' } })` |
| `mixpanel.track('Purchase', { amount: 49.9 })` | `misomoon('Purchase', { revenue: { amount: 49.9, currency: 'EUR' } })` |
| `mixpanel.identify('12345')`, `mixpanel.people.set()`, and `mixpanel.reset()` | Nothing. misomoon has no user ids, so delete these calls. |
| `autocapture: true` | The **Clicks**, **Form submits**, **Outbound links**, and **Downloads** features, and scroll depth, which is always on. They count per page and element, not per user. |
| `mixpanel.track()` with a `distinct_id` from your server | `track()` from `@misomoon/sdk/node`, with the visitor's request ([Send events from your server](sdk.md#send-events-from-your-server)) |
| Session Replay | Nothing. misomoon records no sessions. |

Features are checkboxes under **Settings** > **Install** > **What to track**, and a new
site has them all on ([Choose what to track](tracking.md#choose-what-to-track)). If you
sell through a payment provider, [connect it](revenue.md) and drop `revenue` from the
call, or each sale counts twice.

Funnels and goals don't move. Add each goal in **Settings** > **Goals**
([Create a goal](conversions.md#create-a-goal)) and each funnel in **Funnels**
([Build a funnel](conversions.md#build-a-funnel)). Both read the events misomoon already
collected, so you can add them at any time.

## Bring your history

misomoon's event endpoint takes only current events, so Mixpanel's old events can't be
sent again. Add them up into one row per day and value instead. Mixpanel keeps 2 years of
events by default. misomoon skips the days it already counted ([Days that count once](import.md#days-that-count-once)).

1. In Mixpanel, make a service account with access to the project.
2. Download one day per request from `GET https://data.mixpanel.com/api/2.0/export`, with
   `project_id` and `from_date` and `to_date` both set to that day. Use
   `data-eu.mixpanel.com` for a project in the EU and `data-in.mixpanel.com` for one in
   India. Each line of the answer is one event, as `{ "event": …, "properties": { … } }`.
3. Group each visitor's events into visits: an event more than 30 minutes after that
   visitor's last one starts a new visit, as in misomoon
   ([A visit ends after 30 minutes without activity](metrics.md#a-visit-ends-after-30-minutes-without-activity)).
   Take each visit's source, location, browser, OS, and device from its first event.
4. Count the rows of the table below, zip the files, and upload the ZIP in misomoon under
   **Settings** > **Integrations** > **Upload CSV or zip**.

The export allows 60 requests an hour, so 2 years at one day per request takes about 12
hours. Mixpanel dates the export in UTC for projects created after 1 January 2023, and in
the project's time zone for older ones. misomoon files each row under its `date` as a day
in the site's time zone, so convert each event's `time` (Unix seconds) to that time zone
first.

| misomoon file and column | From Mixpanel's raw events |
| --- | --- |
| `date` | `time`, as a date in your misomoon site's time zone |
| `visitors` | Distinct `$device_id` per day. Distinct `distinct_id` counts a signed-in person once across devices. |
| `visits` | The visits from step 4 |
| `pageviews` | Events named `$mp_web_page_view`, or your own page view event |
| `bounces` | Visits with one page view and no other event ([A bounce is a visit with one pageview and no interaction](metrics.md#a-bounce-is-a-visit-with-one-pageview-and-no-interaction)) |
| `visit_duration` | The seconds from each visit's first event to its last, added up |
| `imported_pages.csv`: `page` | The path of `$current_url`, without the query string |
| `imported_entry_pages.csv`, `imported_exit_pages.csv`: `entry_page`, `exit_page`, `entrances`, `exits` | The first and last page of each visit, and the number of visits that started or ended there |
| `imported_sources.csv`: `referrer`, `source`, `utm_*` | `$referring_domain`, and `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, and `utm_term`, from the visit's first event |
| `imported_locations.csv`: `country`, `region` | `mp_country_code` and `$region` |
| `imported_browsers.csv`: `browser`, `browser_version` | `$browser` and `$browser_version` |
| `imported_operating_systems.csv`: `operating_system` | `$os` |
| `imported_devices.csv`: `device` | `$screen_width`: `Mobile` under 576 px, `Tablet` under 992, and `Desktop` above. Or leave the file out. |
| `imported_custom_events.csv`: `name`, `visitors`, `events` | Every event other than the page view: its name, the distinct visitors who sent it that day, and its count |

Write the values the way misomoon stores them ([Dimensions](metrics.md#dimensions)):

- `source` is empty for direct visits, misomoon's name for a known host, such as `Google`
  for `google.com` ([Sources and referrers](metrics.md#sources-and-referrers)), or the host
  itself. A referrer on your own domain counts as none.
- `country` is a two-letter code, and `region` is a name, such as California.
- `device` is `Desktop`, `Mobile`, or `Tablet`, and `operating_system` uses misomoon's
  names, such as `macOS`. A value in another form sits on its own row.
- Leave out events you don't want in the counts, such as identity events and events your
  server sent for no visit.

Some columns have no source and stay empty: `operating_system_version`,
`total_time_on_page`, `total_time_on_page_visits`, `total_scroll_depth`, and
`total_scroll_depth_visits`. Imported pages therefore have no time on page or scroll
depth.

Run the conversion on your own machine, because the raw export is much larger than the
daily files. The import fills the top-line numbers, the chart, and the breakdowns
([What imported data fills](import.md#what-imported-data-fills)). Imported days appear only
in reports without filters. If you uploaded the wrong file,
[delete the import](import.md#delete-an-import) and upload again.

## Remove Mixpanel

Once the import shows in misomoon, remove `mixpanel-browser` and its calls from the pages
misomoon now tracks. Mixpanel's SDK keeps a cookie for 365 days by default, so take it out
of your cookie banner on those pages. If you keep Mixpanel in your product, leave it there.

## What stays behind

- User profiles, identities, cohorts, and retention. misomoon counts visitors per day and
  has no user ids.
- Experiments, feature flags, and session replay.
- Revenue history. misomoon imports no revenue.
- Event properties. Imported events have no property breakdown.
- Funnels and reports. Build the funnels again in misomoon. They count misomoon's own
  events only ([What imports leave out](import.md#what-imports-leave-out)).
- Cities. misomoon's CSV import has no city column.

## Sources

Checked on 2026-10-25.

- Mixpanel: [Raw Event Export API](https://docs.mixpanel.com/reference/raw-event-export),
  [export methods](https://docs.mixpanel.com/docs/export-methods),
  [default properties](https://docs.mixpanel.com/docs/data-structure/property-reference/default-properties),
  [JavaScript SDK](https://docs.mixpanel.com/docs/tracking-methods/sdks/javascript),
  [identifying users](https://docs.mixpanel.com/docs/tracking-methods/id-management/identifying-users),
  [pricing and data retention](https://mixpanel.com/pricing)
