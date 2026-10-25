# Switch from Matomo

Matomo has no export in the layout that misomoon's [CSV import](import.md#csv-format)
reads, but its Reporting API gives daily totals per report, with unique visitors,
bounces, and visit durations. You turn those into misomoon's files, on Matomo Cloud and
on Matomo On-Premise alike. Your tracking calls change from `_paq.push()` arrays to
`misomoon()` calls. Goals, ecommerce revenue, and custom dimensions stay behind.

## Add misomoon next to Matomo

1. Add your site in misomoon and paste its script tag into the `<head>` of every page, next
   to Matomo's tracking code ([Track your site](tracking.md#add-the-script)).
2. Write down the first full day misomoon collects, which is the day after you added the
   tag. The steps below call it the cutoff day.
3. Leave both scripts on for a week or two, until misomoon's numbers look right to you.

## Replace Matomo's calls

Matomo names an event with a category, an action, and an optional name. misomoon events
have one name. Pick one way to build it, such as `Category: Action`, and use the same one
for the imported events, so old and new counts share a row.

| Matomo | misomoon |
| --- | --- |
| `_paq.push(['trackEvent', category, action, name, value])` | `misomoon(category + ': ' + action, { props: { name, value } })`. misomoon has no event value, so the value goes in a property. |
| `_paq.push(['trackGoal', 1])` | `misomoon('Signup')`, plus a goal for `Signup`. misomoon goals match an event name or a page path, not an id. |
| `_paq.push(['trackGoal', 1, revenue])` | `misomoon('Signup', { revenue: { amount: revenue, currency: 'EUR' } })` |
| `_paq.push(['trackEcommerceOrder', '000123', grandTotal, subTotal, tax, shipping, discount])` | `misomoon('Purchase', { revenue: { amount: grandTotal, currency: 'EUR' } })` |
| `_paq.push(['addEcommerceItem', sku, name, category, price, qty])` and `trackEcommerceCartUpdate` | No equivalent. misomoon counts revenue per event, not per item. |
| `_paq.push(['enableLinkTracking'])` | The **Outbound links** and **Downloads** features, which a new site has on |
| `_paq.push(['trackSiteSearch', keyword])` | The **Site search** feature reads the term from the page URL. List your own parameter under **Search parameters**. |
| `_paq.push(['disableCookies'])` | Nothing to set. misomoon sets no cookies. |
| `_paq.push(['setUserId', id])` | No equivalent. misomoon has no user ids. |

The features sit under **Settings** > **Install** > **What to track**
([Choose what to track](tracking.md#choose-what-to-track)). Revenue counts in the site's
currency ([Track revenue](tracking.md#track-revenue)). If you send revenue from a
payment provider's webhook instead, [connect it](revenue.md) and drop `revenue` from the
call, or each sale counts twice.

Goals don't move. Add each one again in **Settings** > **Goals**
([Create a goal](conversions.md#create-a-goal)). A goal counts the events misomoon
already collected, so you can add it at any time.

## Bring your history

Call Matomo's Reporting API once per report, with `period=day` and a date range that ends
the day before the cutoff day. misomoon reads every row of an upload, so a day that is
both in the files and in misomoon counts twice. The range keeps those days out. Matomo
Cloud and On-Premise both process unique visitors for single days.

### Matomo Cloud and On-Premise

1. In Matomo, open **Personal** > **Security** > **Auth tokens** and create a token.
2. Call each method in the table below. This call gets `VisitsSummary.get` from the first
   day you want to the day before a cutoff day of 2026-10-12:

   ```sh
   curl -d "token_auth=$MATOMO_TOKEN" "https://matomo.example.com/index.php?module=API&method=VisitsSummary.get&idSite=1&period=day&date=2024-01-01,2026-10-11&format=json&flat=1&filter_limit=-1" > VisitsSummary.get.json
   ```

   The answer holds the rows of each day under the day's date. `filter_limit=-1` returns
   every row, where the default is 100. For a large site, ask for one month per call.
3. Write each day's rows into the file and columns that the table names, with the day in
   `date`.

Every report row carries the same visit columns. They go into misomoon's visit columns
like this:

| Matomo | misomoon |
| --- | --- |
| `nb_uniq_visitors` | `visitors` |
| `nb_visits` | `visits` |
| `bounce_count` | `bounces` |
| `sum_visit_length` | `visit_duration` |
| `nb_actions` | `pageviews`, if you accept a higher count. `nb_actions` also counts downloads, outlinks, and site searches. Otherwise leave `pageviews` empty. |

| misomoon file | Matomo method | Columns besides the visit columns |
| --- | --- | --- |
| `imported_visitors.csv` | `VisitsSummary.get` | None |
| `imported_sources.csv` | `Referrers.getAll` | The label as `source`, and for a website, as `referrer` too. A campaign row has no source. Write its label in `utm_campaign`, and misomoon counts it under `Direct`. |
| `imported_locations.csv` | `UserCountry.getCountry` and `UserCountry.getRegion` | The country's `code` as `country` on one set of rows, and the region code as `region` on another |
| `imported_browsers.csv` | `DevicesDetection.getBrowsers` | The label as `browser` |
| `imported_operating_systems.csv` | `DevicesDetection.getOsFamilies` | The label as `operating_system` |
| `imported_devices.csv` | `DevicesDetection.getType` | The label as `device`. Write `Smartphone` and `Phablet` as `Mobile`. |
| `imported_custom_events.csv` | `Events.getCategory` or `Events.getName` | The event name you picked as `name`, `nb_events` as `events`, and `nb_uniq_visitors` as `visitors`. This file takes no other visit columns. |

A row with an empty `country` adds nothing to countries, and one with an empty `region`
adds nothing to regions, so the two sets of location rows don't count twice.

Write each value the way misomoon names it ([Dimensions](metrics.md#dimensions)), or it
sits on a row of its own next to misomoon's. For a source, write the name misomoon gives a
known site, such as `Google`, and the domain for any other site
([Sources and referrers](metrics.md#sources-and-referrers)).

`Actions.getPageUrls`, `Actions.getEntryPageUrls`, and `Actions.getExitPageUrls` hold
the pages for `imported_pages.csv`, `imported_entry_pages.csv`, and
`imported_exit_pages.csv`. Matomo's API reference doesn't list the columns of these three
reports, so this page doesn't map them. Read the column names from one day's answer and
match them to the [CSV format](import.md#csv-format).

These misomoon columns have no source in the table and stay empty:

- `browser_version` and `operating_system_version`. The version reports split the same
  visits again, so rows from them would count each browser twice.
- `utm_source`, `utm_medium`, `utm_content`, and `utm_term` of `imported_sources.csv`.

### On-Premise database

On-Premise also keeps raw visits in MySQL or MariaDB: one row per visit in `log_visit`,
one row per action in `log_link_visit_action`, and the URLs and names in `log_action`
([database schema](https://developer.matomo.org/guides/database-schema)). misomoon reads
daily totals, so raw rows need you to count visits per day yourself. The Reporting API has
done that already.

Matomo Cloud's Data Warehouse Connector, a paid add-on, exports the same raw tables. The
Reporting API is the shorter path there too.

### Upload the files

1. Zip the files:

   ```sh
   zip matomo-history.zip imported_*.csv
   ```

2. In misomoon, open **Settings** > **Integrations**, click **Upload CSV or zip**, and
   pick `matomo-history.zip`.

Include `imported_visitors.csv`, the only file that fills the top-line numbers and the
chart. Imported days appear only in reports without filters
([What imported data fills](import.md#what-imported-data-fills)). If you uploaded the
wrong files, [delete the import](import.md#delete-an-import) and upload again.

## Remove Matomo

Once the import shows in misomoon, remove Matomo's tracking code, the block between
`<!-- Matomo -->` and `<!-- End Matomo Code -->`, and your `_paq.push()` calls.

## What stays behind

- Goals and conversions. Add the goals again in misomoon.
- Ecommerce revenue and items. misomoon imports no revenue.
- Custom dimensions, site search keywords, and cities.
- Reports from paid plugins, such as funnels, forms, media, and heatmaps.
- Rows past Matomo's archive limits. With On-Premise's default settings, a day keeps
  1,000 referrers and 500 rows of most other reports. Matomo adds the rest into one
  `Others` row, which misomoon imports as a value of its own.
- UTM source and medium. `Referrers.getAll` names the campaign only. The
  MarketingCampaignsReporting plugin, which Matomo Cloud's Business and Enterprise plans
  include, reports more, and this page doesn't map it.
- Region names. Matomo gives region codes, and misomoon's own data names the region, such
  as California. The two sit on separate rows in **Regions**.
- Exact page views per source, country, or browser, since `nb_actions` counts more than
  page views.
- User ids from `setUserId`.

## Sources

Checked on 2026-10-25.

- Matomo: [export methods](https://matomo.org/faq/how-to/faq_24574/),
  [export a report](https://matomo.org/faq/how-to/faq_26727/),
  [Reporting API](https://developer.matomo.org/api-reference/api),
  [report metrics](https://developer.matomo.org/api-reference/reporting-api-metadata),
  [unique visitors per period](https://matomo.org/faq/faq_113/),
  [archive row limits](https://raw.githubusercontent.com/matomo-org/matomo/5.x-dev/config/global.ini.php),
  [Data Warehouse Connector](https://matomo.org/faq/cloud/data-warehouse-exports/),
  [database schema](https://developer.matomo.org/guides/database-schema),
  [tracking code](https://developer.matomo.org/guides/tracking-javascript-guide),
  [ecommerce tracking](https://matomo.org/faq/manual-ecommerce-tracking-quick-start),
  [tracking without cookies](https://matomo.org/faq/general/faq_157/),
  [MarketingCampaignsReporting](https://plugins.matomo.org/MarketingCampaignsReporting),
  [plugins in Matomo Cloud plans](https://matomo.org/faq/faq_34889/)
