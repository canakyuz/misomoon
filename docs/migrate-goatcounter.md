# Switch from GoatCounter

GoatCounter's click events become misomoon's tagged events:
`data-goatcounter-click="signup"` becomes `data-misomoon-event="signup"`. Neither of
GoatCounter's exports is in the format misomoon's [CSV import](import.md#csv-format)
reads, so you write the files from one of them. The CSV export of single pageviews fills
almost every report. The JSON export has per-page counts only, with no daily total of
people for the whole site. GoatCounter has no goals, funnels, or revenue, so nothing of
those moves.

## Add misomoon next to GoatCounter

1. Add your site in misomoon and paste its script tag into the `<head>` of every page, next
   to GoatCounter's `count.js` tag ([Track your site](tracking.md#add-the-script)).
2. Write down the first full day misomoon collects, which is the day after you added the
   tag. The steps below call it the cutoff day.
3. Leave both scripts on for a week or two, until misomoon's numbers look right to you.
   misomoon's page views run higher. GoatCounter counts the first view of each path in a
   session of 8 hours, and misomoon counts every page view.

## Replace GoatCounter's calls

GoatCounter records an event as a path. misomoon records it under its name, with the page
it happened on.

| GoatCounter | misomoon |
| --- | --- |
| `<button data-goatcounter-click="signup">` | `<button data-misomoon-event="signup">` |
| `data-goatcounter-title="Example event"` | `data-misomoon-prop-title="Example event"` |
| `<a href="https://example.com" data-goatcounter-click="ext-example.com">` | Nothing. The **Outbound links** feature, which a new site has on, sends an `Outbound link` event for each click on a link to another host. |
| `window.goatcounter.count({ path: 'click-banana', title: 'Yellow curvy fruit', event: true })` | `misomoon('click-banana', { props: { title: 'Yellow curvy fruit' } })` |
| Links tagged with `?ref=` or `?source=` | Keep them. misomoon reads `ref`, then `source`, when `utm_source` is missing ([Sources and referrers](metrics.md#sources-and-referrers)). |
| Links tagged with `?campaign=` | Change them to `?utm_campaign=`. misomoon reads no `campaign` parameter. |

The `data-misomoon-*` attributes need **Tagged events**, which a new site has on
([Choose what to track](tracking.md#choose-what-to-track)). To count an event as a
conversion, add it in **Settings** > **Goals**
([Turn goals into conversions](tracking.md#turn-goals-into-conversions)).

## Bring your history

Both exports are under **Settings** > **Export/Import** in GoatCounter, and each runs at
most once per hour. An export runs up to the day you start it, so the files hold the days
you ran both scripts. Keep only the days before the cutoff day, because misomoon adds imported days to
its own and a day in both counts twice.

1. Pick the export:
   - The CSV export holds one row per page view, but only if **Settings** >
     **Data collection** > **Individual pageviews** was on when the view happened. That
     setting is off by default.
   - The JSON export holds hourly and daily counts and works without that setting. On a
     self-hosted instance, it needs a release after v2.7.0.
2. Start the export and download the file.
3. Write the files that the matching table below names, one row per day, with a header line
   of column names. Then zip the files.
4. In misomoon, open **Settings** > **Integrations**, click **Upload CSV or zip**, and pick
   the ZIP file.

### From the CSV export

Leave out rows where `Bot` isn't `0`. Group the rest by the day of `Date` in your
misomoon site's time zone. A row with `Event` set to `true` is an event, and its `2Path`
is the event name. Every other row is a page view.

| GoatCounter column | misomoon file and column |
| --- | --- |
| Distinct `Session` values among page views | `visitors` and `visits` in `imported_visitors.csv`. GoatCounter has no id for a person beyond the session, so both columns get the same number. |
| Page views | `pageviews` in `imported_visitors.csv` |
| Sessions with one page view | `bounces` in `imported_visitors.csv` |
| The last `Date` minus the first `Date` of each session, in seconds | `visit_duration` in `imported_visitors.csv`. GoatCounter records no time of leaving, so a one-page session is 0. |
| `2Path` of page views | `page`, `visitors` (sessions), and `pageviews` (rows) in `imported_pages.csv` |
| `2Path` of each session's first and last page view | `entry_page` and `entrances` in `imported_entry_pages.csv`, and `exit_page` and `exits` in `imported_exit_pages.csv` |
| `Referrer` of each session's first page view | `imported_sources.csv`. For `Referrer scheme` `h`, put the host in `referrer`, and in `source` the name misomoon gives a known host, such as `Google`, or else the host. For scheme `g`, put the name in `source`. Leave out scheme `c`. |
| `Location`, such as `US` or `US-TX` | `country` in `imported_locations.csv`: the first two letters |
| `Browser`, `System` | `browser` and `browser_version` in `imported_browsers.csv`, and `operating_system` and `operating_system_version` in `imported_operating_systems.csv`. Split the name from the version. |
| `2Path` of events | `name`, `events` (rows), and `visitors` (sessions) in `imported_custom_events.csv` |

Scheme `c` holds campaign text instead of a referrer. Every row of `imported_sources.csv`
also counts toward `source` and `channel`, with an empty source as Direct, so campaign
rows would count those visits under Direct.

### From the JSON export

The ZIP file holds lookup files such as `paths.jsonl`, `refs.jsonl`, `browsers.jsonl`,
`systems.jsonl`, and `locations.jsonl`, and the counts in `hit_stats.jsonl` (per hour,
path, and referrer), `browser_stats`, `system_stats`, and `location_stats` (per day).
Each `count` is a number of visitors, and a visitor counts once on each path.

| GoatCounter file and field | misomoon file and column |
| --- | --- |
| `hit_stats` `count`, added up per day and path, for paths that aren't events | `page` and `visitors` in `imported_pages.csv`, with the path from `paths.jsonl` |
| `hit_stats` `count`, added up per day and referrer | `referrer`, `source`, and `visitors` in `imported_sources.csv`, with the referrer from `refs.jsonl`, by the same rules as the CSV export |
| `location_stats` `count`, with the code from `locations.jsonl` | `country` and `visitors` in `imported_locations.csv`: the first two letters of the code |
| `browser_stats` and `system_stats` `count`, with names from `browsers.jsonl` and `systems.jsonl` | `imported_browsers.csv` and `imported_operating_systems.csv`, with the name split from the version |
| `hit_stats` `count` for paths with `"event": true` | `name`, `events`, and `visitors` in `imported_custom_events.csv` |

No field gives the people who visited the site on a day. Added up over a day,
`hit_stats` counts a person once for each page they opened, so it overstates `visitors` in
`imported_visitors.csv`. If you write it anyway, read imported people as an upper limit.
`visits`, `pageviews`, `bounces`, and `visit_duration` have no source, and nor do the
entry and exit page files.

### Columns with no source

From either export, `region` stays empty. GoatCounter writes regions as codes, such as
`US-TX`, and misomoon names them, such as Texas, so codes would sit on separate rows.
GoatCounter records screen widths, not devices, and misomoon reads the device from the
user agent, so leave `imported_devices.csv` out. Imported days appear only in reports
without filters ([What imported data fills](import.md#what-imported-data-fills)).

If you uploaded the wrong file, [delete the import](import.md#delete-an-import) and upload
again.

## Remove GoatCounter

Once the import shows in misomoon, remove GoatCounter's `count.js` script tag and your
`data-goatcounter-*` attributes and `goatcounter.count()` calls. GoatCounter deletes old
data only if you set its data retention, so the history stays there until you delete it.

## What stays behind

- Devices, regions, languages, and screen sizes.
- Campaign history, which GoatCounter keeps in place of the referrer.
- From the JSON export, a true count of people, visits, page views, bounces, visit
  durations, and entry and exit pages.
- Page views from before you turned on **Individual pageviews**. The CSV export has only
  the views recorded while it was on.

## Sources

Checked on 2026-10-25.

- GoatCounter: [getting started](https://www.goatcounter.com/help/start),
  [events](https://www.goatcounter.com/help/events),
  [campaigns](https://www.goatcounter.com/help/campaigns),
  [sessions](https://www.goatcounter.com/help/sessions),
  [CSV exports](https://www.goatcounter.com/help/export),
  [JSON exports](https://www.goatcounter.com/help/export-json),
  [JSON API](https://www.goatcounter.com/help/api),
  [export settings in the code](https://github.com/arp242/goatcounter/blob/master/tpl/settings_export.gohtml),
  [changelog](https://github.com/arp242/goatcounter/blob/master/CHANGELOG.md),
  [retention settings in the code](https://github.com/arp242/goatcounter/blob/master/settings.go)
