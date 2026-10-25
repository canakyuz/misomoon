# Switch from Plausible

Plausible's CSV export uses the same file names and columns that misomoon's
[CSV import](import.md#csv-format) reads, so your daily history moves as it is. Your
tracking calls keep their shape: `plausible('Signup', { props })` becomes
`misomoon('Signup', { props })`. Revenue history and goals stay behind.

## Add misomoon next to Plausible

1. Add your site in misomoon and paste its script tag into the `<head>` of every page, next
   to Plausible's ([Track your site](tracking.md#add-the-script)).
2. Write down the first full day misomoon collects, which is the day after you added the
   tag. The steps below call it the cutoff day.
3. Leave both scripts on for a week or two, until misomoon's numbers look right to you.

## Replace Plausible's calls

The call has the same arguments: an event name, then `props`, `revenue`, `callback`, and
`interactive`. On most sites, replacing `plausible(` with `misomoon(` is enough.

| Plausible | misomoon |
| --- | --- |
| `plausible('Signup')` | `misomoon('Signup')` |
| `plausible('Download', { props: { method: 'HTTP' }, callback })` | `misomoon('Download', { props: { method: 'HTTP' }, callback })` |
| `plausible('Purchase', { revenue: { amount: 10.29, currency: 'USD' } })` | `misomoon('Purchase', { revenue: { amount: 10.29, currency: 'USD' } })` |
| `class="plausible-event-name=Signup plausible-event-plan=pro"` | `data-misomoon-event="Signup" data-misomoon-prop-plan="pro"` |
| `class="plausible-event-name=Purchase plausible-revenue-amount=10.29 plausible-revenue-currency=EUR"` | `data-misomoon-event="Purchase" data-misomoon-revenue-amount="10.29" data-misomoon-revenue-currency="EUR"` |
| `plausible.init({ hashBasedRouting: true })` | `data-hash` on the script tag |
| The `outboundLinks`, `fileDownloads`, and `formSubmissions` options | The **Outbound links**, **Downloads**, and **Form submits** features, which a new site has on |

The `data-misomoon-*` attributes need **Tagged events**, which a new site has on
([Choose what to track](tracking.md#choose-what-to-track)). If you send revenue from a
payment provider's webhook instead, [connect it](revenue.md) and drop `revenue` from the
call, or each sale counts twice.

Goals don't move. Add each one again in **Settings** > **Goals**
([Turn goals into conversions](tracking.md#turn-goals-into-conversions)). A goal counts
the events misomoon already collected, so you can add it at any time.

## Bring your history

Use the export in Plausible's site settings. The **Export stats** download on the
dashboard holds totals for one period, not days, and the upload refuses it with
`no imported_*.csv files found (expected a CSV export)`.

1. In Plausible, open **Site Settings** > **Imports & Exports** and click
   **Export to CSV**.
2. Download the ZIP file from the email Plausible sends. On Plausible Cloud, the link works
   for 24 hours.
3. Unzip it. Plausible exports every day up to its last visit, so the days you ran both
   scripts are in the files and in misomoon. Delete those rows, or misomoon counts them
   twice. The command keeps the rows before the cutoff day and drops Plausible's own
   `engagement` events, a name misomoon keeps for itself:

   ```sh
   cut=2026-10-12   # your cutoff day
   for f in imported_*.csv; do
   	awk -F, -v cut="$cut" 'NR == 1 || ($1 < cut && $2 != "engagement")' "$f" > "$f.new" && mv "$f.new" "$f"
   done
   zip plausible-history.zip imported_*.csv
   ```

   The first column of every file is `date`, and the second column of
   `imported_custom_events` is the event name.
4. In misomoon, open **Settings** > **Integrations**, click **Upload CSV or zip**, and pick
   `plausible-history.zip`.

The import fills the top-line numbers, the chart, sources, UTM tags, pages, entry and exit
pages, countries, devices, browsers, operating systems, and custom events, with bounces,
visit duration, time on page, and scroll depth. Imported days appear only in reports
without filters ([What imported data fills](import.md#what-imported-data-fills)).

If you uploaded the wrong file, [delete the import](import.md#delete-an-import) and upload
again.

## Remove Plausible

Once the import shows in misomoon, remove Plausible's script tag and its
`window.plausible` snippet. Plausible keeps your data until you delete the site there.

## What stays behind

- Revenue history. Plausible's export doesn't include revenue, and misomoon imports none.
- Goals and funnels. Add them again in misomoon.
- Custom properties. misomoon skips `imported_custom_props`, so imported events have no
  property breakdown.
- Cities and hostnames. misomoon ignores the `city` column and the `hostname` column of
  `imported_pages`. A site with several hostnames gets their paths added together.
- Region names. Plausible exports region codes, such as `US-CA`, and misomoon's own data
  names the region, such as California. The two sit on separate rows in **Regions**.
- Visitor counts of `File Download` and `Outbound Link: Click` events. Plausible writes a
  row per link, and misomoon adds the rows up, so a person who clicked two links counts
  twice. The event counts are exact. misomoon renames these events `Download` and
  `Outbound link`, and `Form: Submission` becomes `Form sent`.

## Sources

Checked on 2026-10-25.

- Plausible: [CSV import and export](https://plausible.io/docs/csv-import),
  [Export stats](https://plausible.io/docs/export-stats),
  [export columns in the code](https://github.com/plausible/analytics/blob/master/lib/plausible/exports.ex),
  [custom events](https://plausible.io/docs/custom-event-goals),
  [revenue](https://plausible.io/docs/ecommerce-revenue-tracking),
  [script options](https://plausible.io/docs/script-extensions),
  [the current snippet](https://plausible.io/docs/proxy/guides/fresh)
