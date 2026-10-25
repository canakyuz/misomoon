# Switch from Fathom

Fathom's custom export groups its numbers by day, which is what misomoon's
[CSV import](import.md#csv-format) needs, but its files have Fathom's names and columns.
You rename the columns, work out two of them, and save each file as an
`imported_<report>.csv`. Your tracking calls keep their names:
`fathom.trackEvent('newsletter signup')` becomes `misomoon('newsletter signup')`. Event
values, goals, and entry and exit pages stay behind, unless you use Fathom's API for the
pages.

## Add misomoon next to Fathom

1. Add your site in misomoon and paste its script tag into the `<head>` of every page, next
   to Fathom's ([Track your site](tracking.md#add-the-script)).
2. Write down the first full day misomoon collects, which is the day after you added the
   tag. The steps below call it the cutoff day.
3. Leave both scripts on for a week or two, until misomoon's numbers look right to you.

## Replace Fathom's calls

Fathom takes an event value in cents. misomoon takes `amount` in the currency's major
units, so divide by 100.

| Fathom | misomoon |
| --- | --- |
| `fathom.trackEvent('newsletter signup')` | `misomoon('newsletter signup')` |
| `fathom.trackEvent('cart add', { _value: 100 })` | `misomoon('cart add', { revenue: { amount: 1, currency: 'USD' } })` |
| `fathom.trackEvent('widget purchase', { _value: 1000 })` | `misomoon('widget purchase', { revenue: { amount: 10, currency: 'USD' } })` |
| The older `fathom.trackGoal(code, cents)` | `misomoon('<event name>', { revenue: { amount, currency } })`, with a name in place of the code |
| `fathom.trackPageview()` | `misomoon('pageview')`, with `data-manual` on the script tag if you send every pageview yourself |
| Fathom's snippets for external links and form submits | The **Outbound links** and **Form submits** features, which a new site has on |

Keep Fathom's event names. Imported events keep their names, so the days before and after
the switch add up under one name.

Fathom sets the event currency per event or per site. A misomoon site has one reporting
currency, and revenue in another currency stays out of the totals
([Track revenue](tracking.md#track-revenue)). Set the site's currency to Fathom's, and pass
`currency` on each call. If a payment provider's webhook reports your sales instead,
[connect it](revenue.md) and leave `revenue` out of the call, or each sale counts twice.

If a tag manager loads Fathom, replace that tag with misomoon's script tag
([install with a tag manager](google-tag-manager.md#add-the-tag)). Keep the event tags,
and swap `fathom.trackEvent(...)` for `misomoon(...)` in them.

Goals don't move. Add each one again in **Settings** > **Goals**
([Create a goal](conversions.md#create-a-goal)). A goal counts the events misomoon already
collected, so you can add it at any time.

## Bring your history

Every Fathom plan has the custom export. Fathom emails a CSV file for each export when it
is ready.

### Export from Fathom

1. In Fathom, open **Settings**, pick the site, then open **More** > **Exports**.
2. Make a **Pageviews** export with **Daily** grouping and a range that ends the day before
   the cutoff day. Pick the metrics **Pageviews**, **Site Visitors**, **Bounce Rate**, and
   **Avg Time on Site**.
3. Make one such export with no dimension, for the totals, and one for each of these:
   - **Page**
   - **Referrer** with the five UTM dimensions, in one export
   - **Country**
   - **Browser**
   - **Operating System**
   - **Device Type**
4. Make an **Events** export with **Daily** grouping, the same range, the dimension
   **Event Name**, and the metrics **Completions** and **Unique Completions**.

### Write the misomoon files

Rename each file's columns as the table shows, and save it under the misomoon name.
Fathom doesn't document the export's column headers, so match each column by the metric
or dimension it holds. Write `date` as `YYYY-MM-DD`.

| misomoon file | From the Fathom export |
| --- | --- |
| `imported_visitors.csv` | **Site Visitors** as both `visitors` and `visits`, and **Pageviews** as `pageviews`. `bounces` is **Site Visitors** times **Bounce Rate**, and `visit_duration` is **Site Visitors** times **Avg Time on Site** in seconds. |
| `imported_sources.csv` | **Referrer** as `referrer`, its host as `source`, written as misomoon names a known site, such as `Google` ([Sources and referrers](metrics.md#sources-and-referrers)), and the UTM dimensions as `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, and `utm_term`, with the visit columns as above. Keep them on one row. A row with an empty `source` counts as `Direct`. |
| `imported_pages.csv` | **Page** as `page`, **Site Visitors** as `visitors` and `visits`, and **Pageviews** as `pageviews`. `total_time_on_page`, `total_time_on_page_visits`, `total_scroll_depth`, and `total_scroll_depth_visits` have no source and stay empty. |
| `imported_locations.csv` | **Country** as `country`, which misomoon reads as a two-letter code such as `DE`, with the visit columns. `region` stays empty. |
| `imported_browsers.csv` | **Browser** as `browser`, with the visit columns. `browser_version` has no source and stays empty. |
| `imported_operating_systems.csv` | **Operating System** as `operating_system`, with the visit columns. `operating_system_version` has no source and stays empty. |
| `imported_devices.csv` | **Device Type** as `device`, written `Desktop`, `Mobile`, or `Tablet` |
| `imported_custom_events.csv` | **Event Name** as `name`, **Completions** as `events`, and **Unique Completions** as `visitors` |

Fathom has no separate count of visits, so `visits` takes the visitor count. Fathom doesn't
document whether **Bounce Rate** is a fraction or a percentage. If the values run above 1,
divide them by 100 first.

### Add entry and exit pages from the API

Entry and exit pages aren't among the export's dimensions, and misomoon takes a page's
bounce rate and visit duration from its entry page rows. Fathom's API has both. Call
`GET /v1/aggregations` with `entity=pageview`, `date_grouping=day`, `field_grouping` set to
`entry_page` or `exit_page`, and the aggregates `visits`, `uniques`, `pageviews`,
`bounce_rate`, and `avg_duration`.

- In `imported_entry_pages.csv`, write the path as `entry_page`, `visits` as `entrances`,
  `uniques` as `visitors`, and `pageviews` as `pageviews`. Work out `bounces` and
  `visit_duration` from `visits` as for the totals.
- In `imported_exit_pages.csv`, write the same columns with `exit_page` and `exits`.

A call returns at most 1,000 rows and has no further pages, so ask for a short range on a
busy site. The included API tier allows 600 requests an hour, and each request counts
toward your monthly pageviews. Fathom says the API's numbers are accurate only from
March 2021 on.

### Upload the files

1. Check that every file holds only days before the cutoff day. misomoon reads every row,
   so a day that misomoon also collected counts twice. Delete the later rows.
2. Zip the files as `fathom-history.zip`, with `imported_visitors.csv` among them.
3. In misomoon, open **Settings** > **Integrations**, click **Upload CSV or zip**, and pick
   `fathom-history.zip`.

Imported days appear only in reports without filters
([What imported data fills](import.md#what-imported-data-fills)). If you uploaded the
wrong file, [delete the import](import.md#delete-an-import) and upload again.

## Remove Fathom

Once the import shows in misomoon, remove Fathom's script tag and its `fathom` calls.
Fathom's plans keep your data, so you can export again while the account is open.

## What stays behind

- Event values. Fathom's revenue per event doesn't come across, because misomoon's imports
  fill no revenue.
- Goals. Add them again in misomoon.
- Entry and exit pages, unless you fetch them from the API.
- Time on page and scroll depth. Fathom exports time on site, not per page.
- Browser and operating system versions.
- Visits. Imported days have one visit per visitor, so pages per visit read high on
  sites where people come back the same day.
- Regions and cities. Fathom doesn't document how it names regions, and misomoon's CSV
  import reads no city.
- Fathom's source groups and AI sources. misomoon works out each channel from `source`,
  `utm_medium`, and `utm_source`.

## Sources

Checked on 2026-10-25.

- Fathom: [export your data](https://usefathom.com/docs/features/exporting),
  [API](https://usefathom.com/api),
  [API reference as text](https://usefathom.com/api/llms.txt),
  [how Fathom measures](https://usefathom.com/docs/start/measurement),
  [events](https://usefathom.com/docs/events/overview),
  [ecommerce events](https://usefathom.com/docs/events/ecommerce-conversions),
  [features](https://usefathom.com/features),
  [pricing](https://usefathom.com/pricing)
