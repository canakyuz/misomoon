# Switch from Pirsch

Pirsch's event calls keep their shape: `pirsch('Signup', { meta })` becomes
`misomoon('Signup', { props })`. Pirsch doesn't document the columns of its dashboard CSV
export, so history comes from Pirsch's API, which returns daily visitors, visits, page
views, and bounces, plus pages, entry and exit pages, referrers, countries, devices,
browsers, operating systems, and events. UTM history, conversion goals, funnels, and
revenue stay behind.

## Add misomoon next to Pirsch

1. Add your site in misomoon and paste its script tag into the `<head>` of every page, next
   to Pirsch's `pa.js` tag ([Track your site](tracking.md#add-the-script)).
2. Write down the first full day misomoon collects, which is the day after you added the
   tag. The steps below call it the cutoff day.
3. Leave both scripts on for a week or two, until misomoon's numbers look right to you.

## Replace Pirsch's calls

The call takes an event name and then options. misomoon calls the event's data `props`
instead of `meta`. Both tools count route changes in single-page apps by themselves.

| Pirsch | misomoon |
| --- | --- |
| `pirsch('Button Clicked', { meta: { Clicks: clicks } })` | `misomoon('Button Clicked', { props: { Clicks: clicks } })` |
| `pirsch('Signup', { non_interactive: true })` | `misomoon('Signup', { interactive: false })` |
| `pirsch('Signup').then(next)` | `misomoon('Signup', { callback: next })` |
| `pirsch('Video', { duration: 42 })` | `misomoon('Video', { props: { duration: 42 } })`. misomoon has no event duration. |
| `<button data-pirsch-event="Signup" data-pirsch-meta-plan="pro">` | `<button data-misomoon-event="Signup" data-misomoon-prop-plan="pro">` |
| `class="pirsch-event=Signup pirsch-meta-plan=pro"` | `data-misomoon-event="Signup" data-misomoon-prop-plan="pro"` |
| `data-pirsch-non-interactive` | No attribute. Send the event from JavaScript with `interactive: false`. |
| A sale as a custom metric: `pirsch('Sale', { meta: { amount: 99.42, currency: 'USD' } })` | `misomoon('Sale', { revenue: { amount: 99.42, currency: 'USD' } })` |
| `data-exclude` and `data-include` on the script tag | **Never count these paths** and **Only count these paths** in **Settings** > **Install** > **What to track**. They take `*` and `**` patterns, not regular expressions. |
| `data-disable-outbound-links`, `data-disable-downloads` | `data-disable="outbound,downloads"` on the script tag ([Tracker attributes](configuration.md#tracker-attributes)) |
| The built-in `Outbound Link Click` and `File Download` events | The **Outbound links** and **Downloads** features, which a new site has on. Their events are `Outbound link` and `Download`. |

The `data-misomoon-*` attributes need **Tagged events**, which a new site has on
([Choose what to track](tracking.md#choose-what-to-track)). To count payments without a
tracker call, connect the payment provider's webhook ([Connect payments](revenue.md)) and
drop `revenue` from the call, or each sale counts twice.

Conversion goals and funnels don't move. Add each goal again in **Settings** > **Goals**,
as an event or a page path ([Create a goal](conversions.md#create-a-goal)), and rebuild
each funnel in **Funnels** ([Build a funnel](conversions.md#build-a-funnel)). Both count
the events misomoon already collected, so you can add them at any time.

## Bring your history

Pirsch's statistics routes under `https://api.pirsch.io/api/v1/statistics/` return JSON.
`/visitor` and `/duration/session` return one row per day with `scale=day`. The other
routes return totals for the period you ask for, so call them once per day, with `from` and
`to` on the same day. Ask for days before
the cutoff day only: misomoon adds imported days to its own, so a day in both counts twice.

1. In Pirsch, create an API client and get an access token, as Pirsch's API guide shows.
2. For each day before the cutoff day, call the routes in the table below. Set `tz` to
   the time zone of your misomoon site. A call returns up to 100 rows, so page through
   longer lists with `offset`.
3. Write the rows into the files that the table names, with a header line of column
   names. Then zip the files.
4. In misomoon, open **Settings** > **Integrations**, click **Upload CSV or zip**, and pick
   the ZIP file.

| Pirsch route and field | misomoon file and column |
| --- | --- |
| `/visitor` with `scale=day`: `day`, `visitors`, `sessions`, `views`, `bounces` | `date`, `visitors`, `visits`, `pageviews`, and `bounces` in `imported_visitors.csv` |
| `/duration/session` with `scale=day`: `average_time_spent_seconds` | `visit_duration` in `imported_visitors.csv`, which is the average times `sessions` |
| `/page` with `include_avg_time_on_page=true`: `path`, `visitors`, `sessions`, `views`, and the average time on page | `page`, `visitors`, `visits`, and `pageviews` in `imported_pages.csv`. `total_time_on_page` is the average times `sessions`, and `total_time_on_page_visits` is `sessions`. |
| `/page/entry`: `path`, `entries`, `visitors`, `average_time_spent_seconds` | `entry_page`, `entrances`, and `visitors` in `imported_entry_pages.csv`. `visit_duration` is the average times `entries`. |
| `/page/exit`: `path`, `exits`, `visitors` | `exit_page`, `exits`, and `visitors` in `imported_exit_pages.csv` |
| `/referrer`: `referrer`, `referrer_name`, `visitors`, `sessions`, `bounces` | `referrer`, `source`, `visitors`, `visits`, and `bounces` in `imported_sources.csv`. In `source`, write the name misomoon gives a known host, such as `Google` ([Sources and referrers](metrics.md#sources-and-referrers)). An empty `source` counts as Direct. |
| `/country`: `country_code`, `visitors` | `country` and `visitors` in `imported_locations.csv`. Pirsch writes the code in lowercase, such as `jp`, and misomoon stores it in uppercase. |
| `/platform`: `platform_desktop`, `platform_mobile` | Two rows per day in `imported_devices.csv`: `device` `Desktop` with `platform_desktop` as `visitors`, and `Mobile` with `platform_mobile`. Pirsch has no tablet count, and its unknown platforms have no misomoon device. |
| `/browser`, `/browser/version`, `/os`, `/os/version` | `browser`, `browser_version`, and `visitors` in `imported_browsers.csv`, and `operating_system`, `operating_system_version`, and `visitors` in `imported_operating_systems.csv` |
| `/events`: `name`, `count`, `visitors` | `name`, `events`, and `visitors` in `imported_custom_events.csv`. Rename `Outbound Link Click` to `Outbound Link: Click`, which misomoon imports as `Outbound link`. misomoon already imports `File Download` as `Download`. |

Leave out the `/utm` routes. Every row of `imported_sources.csv` also counts toward
`source` and `channel`, with an empty source as Direct, so UTM rows next to the referrer
rows would count those visitors twice.

No route fills `bounces` and `pageviews` in `imported_entry_pages.csv`, so imported pages
have no bounce rate. The visit columns other than `visitors` stay empty in the location,
device, browser, and operating system files, and so do `region` and the scroll depth
columns. Imported days appear only in reports without filters
([What imported data fills](import.md#what-imported-data-fills)).

If you uploaded the wrong file, [delete the import](import.md#delete-an-import) and upload
again.

## Remove Pirsch

Once the import shows in misomoon, remove Pirsch's `pa.js` script tag and your `pirsch()`
calls.

## What stays behind

- Revenue history and custom metrics. misomoon imports no revenue.
- Conversion goals and funnels. Add them again in misomoon.
- UTM history, for the reason in [Bring your history](#bring-your-history).
- Event metadata. misomoon's import has no column for it, so imported events have no
  property breakdown.
- Regions, cities, languages, and screen sizes.
- Tablets. Pirsch's platform counts have no tablet.

## Sources

Checked on 2026-10-25.

- Pirsch: [website integration](https://docs.pirsch.io/get-started/frontend-integration),
  [events](https://docs.pirsch.io/advanced/events),
  [outbound links](https://docs.pirsch.io/advanced/outbound-links),
  [file downloads](https://docs.pirsch.io/advanced/file-downloads),
  [conversion goals](https://docs.pirsch.io/advanced/conversion-goals),
  [exporting statistics](https://docs.pirsch.io/get-started/export),
  [API v1](https://docs.pirsch.io/api-sdks/api-v1),
  [API guide v1](https://docs.pirsch.io/api-sdks/api-guide-v1),
  [pricing](https://pirsch.io/pricing)
