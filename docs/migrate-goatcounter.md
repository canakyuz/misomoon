# Switch from GoatCounter

misomoon reads both of GoatCounter's exports as they come: upload the file under
**Settings** > **Integrations**. GoatCounter's click events become misomoon's tagged
events: `data-goatcounter-click="signup"` becomes `data-misomoon-event="signup"`. The CSV
export of single pageviews fills almost every report. The JSON export has per-page counts
only, with no daily total of people for the whole site. GoatCounter has no goals, funnels,
or revenue, so nothing of those moves.

## Add misomoon next to GoatCounter

1. Add your site in misomoon and paste its script tag into the `<head>` of every page, next
   to GoatCounter's `count.js` tag ([Track your site](tracking.md#add-the-script)).
2. Leave both scripts on for a week or two, until misomoon's numbers look right to you.
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
most once per hour. An export runs up to the day you start it, so the file holds the days
you ran both scripts. misomoon skips the days it already counted
([Days that count once](import.md#days-that-count-once)).

1. Pick the export:
   - The CSV export holds one row per page view, but only if **Settings** >
     **Data collection** > **Individual pageviews** was on when the view happened. That
     setting is off by default. GoatCounter sends it gzipped, as
     `goatcounter-export-….csv.gz`.
   - The JSON export holds hourly and daily counts and works without that setting. On a
     self-hosted instance, it needs a release after v2.7.0. It comes as a ZIP file.
2. Start the export and download the file.
3. In misomoon, open **Settings** > **Integrations**, click **Upload CSV or zip**, and pick
   the file as you downloaded it ([Upload CSV files](import.md#upload-csv-files)).

misomoon reads the file while you wait. An export in a format version misomoon doesn't
read fails with the reason, such as `this GoatCounter CSV export is version 1; misomoon
reads version 2, the one GoatCounter exports since 2020`, and stores nothing.

### From the CSV export

misomoon leaves out rows where `Bot` isn't `0`, and counts each row on its day in your
misomoon site's time zone. A row with `Event` set to `1` or `true` is an event, and its
path is the event name. Every other row is a page view.

| GoatCounter column | Goes into |
| --- | --- |
| `Session` | One visit and one visitor per session and day. GoatCounter has no id for a person beyond the session, so visitors and visits are the same number. A one-page session is a bounce, and a visit lasts from its first page view to its last. GoatCounter records no time of leaving, so a one-page visit lasts 0 seconds. |
| `2Path` of page views | Pages, and each session's first and last page as its entry and exit page. Paths lose a trailing slash, as misomoon stores them. |
| `Referrer` of each session's first page view | Sources, referrers, and channels. For scheme `h`, the host is the referrer, and the source is misomoon's name for a known host, such as `Reddit`, or else the host. For scheme `g`, the name is the source. Scheme `c` holds campaign text instead of a referrer, so the visit is `Direct` with that UTM campaign. |
| `Location`, such as `US` or `US-TX` | Countries, by the first two letters |
| `Browser`, `System` | Browsers and operating systems, with their versions as misomoon writes them, such as `Chrome 86` and `Windows 10/11` |
| `UserAgent`, or else `Screen size` | Devices. Exports from before GoatCounter stopped storing user agents carry them. Otherwise the screen width says `Mobile` below 576 pixels, `Tablet` below 992, and `Desktop` from there. |
| `2Path` of events | Custom events, with the sessions that sent each as visitors |

GoatCounter writes the rows in the order it received them. misomoon adds a day once the
rows are two days past it, so a session whose rows are a little out of order still counts
once. An export larger than 50 MB unzipped fails with the reason. Upload the JSON export
of the same site instead.

### From the JSON export

misomoon reads `hit_stats.jsonl` for pages, sources, events, and the day's totals, with the
names from `paths.jsonl` and `refs.jsonl`, and `browser_stats`, `system_stats`,
`location_stats`, and `size_stats` for browsers, operating systems, countries, and
devices. The hourly counts go to the local day of their hour in your misomoon site's time
zone. The daily ones keep GoatCounter's day.

Each `count` is a number of visitors, and a visitor counts once on each path. misomoon adds
them up for a day's total, as GoatCounter's own totals do, so a person who opened three
pages counts three times. Read imported people as an upper limit. The JSON export has no
visits, bounces, visit durations, or entry and exit pages, so visits and page views take
the same number as visitors.

Imported days appear only in reports without filters
([What imported data fills](import.md#what-imported-data-fills)). If you uploaded the wrong
file, [delete the import](import.md#delete-an-import) and upload again.

## Remove GoatCounter

Once the import shows in misomoon, remove GoatCounter's `count.js` script tag and your
`data-goatcounter-*` attributes and `goatcounter.count()` calls. GoatCounter deletes old
data only if you set its data retention, so the history stays there until you delete it.

## What stays behind

- Regions, languages, and screen sizes.
- From the CSV export without user agents, devices beyond what the screen width says.
- From the JSON export, a true count of people, visits, page views, bounces, visit
  durations, and entry and exit pages.
- Page views from before you turned on **Individual pageviews**. The CSV export has only
  the views recorded while it was on.

## Sources

Checked on 2026-10-25.

The import was tested on the real CSV export in GoatCounter's repository,
[`cmd/goatcounter/testdata/export.csv`](https://github.com/arp242/goatcounter/blob/main/cmd/goatcounter/testdata/export.csv),
and on the examples of its JSON export documentation, read on 2026-10-26.

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
