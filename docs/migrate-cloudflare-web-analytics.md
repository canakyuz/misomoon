# Switch from Cloudflare Web Analytics

Cloudflare Web Analytics has no custom events and no export file, so the switch is mostly
a script tag swap. Its GraphQL API returns daily page views and visits per page, referrer,
country, device, browser, and operating system, which misomoon's
[CSV import](import.md#csv-format) can read once you write them into its files. Unique
visitors, bounces, visit durations, and anything older than six months stay behind.

## Add misomoon next to Cloudflare Web Analytics

1. Add your site in misomoon and paste its script tag into the `<head>` of every page, next
   to Cloudflare's `beacon.min.js` tag ([Track your site](tracking.md#add-the-script)). On a
   proxied zone with automatic setup, Cloudflare adds its beacon itself, so your HTML has
   no Cloudflare tag.
2. Leave both scripts on for a week or two, until misomoon's numbers look right to you.
   The visits won't match. Cloudflare counts a visit for each page view that comes from
   another site or a direct link, and misomoon ends a visit after
   [30 minutes without activity](metrics.md#a-visit-ends-after-30-minutes-without-activity).

## Replace Cloudflare's beacon

Cloudflare's beacon sends page views and page load timings only. It has no custom events,
and it doesn't log query strings, so it records no UTM tags.

| Cloudflare Web Analytics | misomoon |
| --- | --- |
| The `beacon.min.js` script tag with its `data-cf-beacon` attribute | `<script defer src="https://analytics.example.com/m.js?s=your-site"></script>` |
| Automatic setup on a proxied zone | The misomoon script tag in your pages |
| The Core Web Vitals report | The **Web Vitals** feature, which a new site has on |
| No custom events | `misomoon('Signup')`, or `data-misomoon-event="Signup"` on an element ([Send custom events](tracking.md#send-custom-events)) |
| No UTM tags | `utm_source`, `utm_medium`, and `utm_campaign` on your links ([Tag the links you post](tracking.md#tag-the-links-you-post)) |

Features such as **Web Vitals** and **Tagged events** are under **Settings** >
**Install** > **What to track** ([Choose what to track](tracking.md#choose-what-to-track)). To count
events as conversions, add them in **Settings** > **Goals**
([Turn goals into conversions](tracking.md#turn-goals-into-conversions)).

## Bring your history

Export soon. Cloudflare keeps six months of data, so each week you wait loses a week of
the oldest days. It keeps unsampled data for the last seven days only and keeps about 10%
of older data. If you read mostly people and bounce rate, skip the import: Cloudflare
measures neither, so imported days show 0 people and pull the bounce rate down.

misomoon skips the days it already counted ([Days that count once](import.md#days-that-count-once)).
Ask for a range that ends today, or end it the day before you added misomoon to make fewer
requests.

Cloudflare's Web Analytics docs describe no export file. The data comes from the account's
`rumPageloadEventsAdaptiveGroups` dataset in the GraphQL Analytics API, at
`POST https://api.cloudflare.com/client/v4/graphql`. Cloudflare doesn't document that
dataset on its own pages, so the field names below come from the published API schema.

1. Create a Cloudflare API token for the account, and note the account ID.
2. Query `rumPageloadEventsAdaptiveGroups` once per report. Filter on your site's
   `siteTag`, `bot: 0`, `date_geq` set to the first day you want, and `date_leq` set to
   the last day you want. Group by `date` and the report's dimension from the table
   below, and select `count` and `sum { visits }`.
3. Compare one week of results with Cloudflare's dashboard. Cloudflare samples each query
   and returns a `sampleInterval` field, but doesn't document whether `count` and `visits`
   are already scaled up for sampling.
4. Write the rows into the files that the table below names, with a header line of column
   names. Then zip the files.
5. In misomoon, open **Settings** > **Integrations**, click **Upload CSV or zip**, and pick
   the ZIP file.

The API allows 300 queries in 5 minutes. Each dataset also has its own limits on page size
and date range, which the `settings` node returns, so query it first. Cloudflare says its
Web Analytics datasets return data only on an account with the US metadata boundary.

| Cloudflare field | misomoon file and column |
| --- | --- |
| `dimensions.date` | `date` in every file. It is already `YYYY-MM-DD`. |
| `count` | `pageviews` in every file |
| `sum.visits` | `visits` in every file |
| `requestPath` | `page` in `imported_pages.csv` |
| `refererHost` | `referrer` in `imported_sources.csv`. In `source`, write the name misomoon gives a known host, such as `Google` for `google.com` ([Sources and referrers](metrics.md#sources-and-referrers)), or else the host. Leave `source` empty for an empty host, which counts as Direct. Leave out rows whose host is your own site. |
| `countryName` | `country` in `imported_locations.csv`. It is already a two-letter code. |
| `deviceType` | `device` in `imported_devices.csv`, written as `Desktop`, `Mobile`, or `Tablet` |
| `userAgentBrowser`, `browserVersion` | `browser` and `browser_version` in `imported_browsers.csv`. Keep the major version only, so `Chrome` with `141` merges with misomoon's own `Chrome 141`. |
| `userAgentOS`, `osVersion` | `operating_system` and `operating_system_version` in `imported_operating_systems.csv` |

No Cloudflare field fills `visitors`, `bounces`, or `visit_duration` in any file, so they
stay empty and count as `0`. A period that includes imported days then shows a lower
bounce rate and a shorter time per visit. `imported_entry_pages.csv`,
`imported_exit_pages.csv`, `imported_custom_events.csv`, the UTM columns, and `region` have
no source either. Imported days appear only in reports without filters
([What imported data fills](import.md#what-imported-data-fills)).

If you uploaded the wrong file, [delete the import](import.md#delete-an-import) and upload
again.

## Remove Cloudflare Web Analytics

Once misomoon's numbers look right, delete the `beacon.min.js` tag from your pages. On a
proxied zone with automatic setup, open the site under **Web Analytics**, click
**Manage site**, and set automatic setup to **Disable**.

## What stays behind

- Unique visitors, bounces, and visit durations. Cloudflare doesn't measure them.
- Days older than six months, and the detail that sampling removed from days older than
  seven days.
- Web Vitals history. misomoon imports none, and the **Speed** view shows only what
  misomoon collected.
- Entry and exit pages, regions, and UTM tags. Cloudflare doesn't collect them.
- Hostnames. misomoon's import reads only the path, so a site with several hostnames gets
  their paths added together.

## Sources

Checked on 2026-10-25.

- Cloudflare: [Web Analytics FAQ](https://developers.cloudflare.com/web-analytics/faq/),
  [high-level metrics](https://developers.cloudflare.com/web-analytics/data-metrics/high-level-metrics/),
  [dimensions](https://developers.cloudflare.com/web-analytics/data-metrics/dimensions/),
  [get started](https://developers.cloudflare.com/web-analytics/get-started/),
  [GraphQL API limits](https://developers.cloudflare.com/analytics/graphql-api/limits/),
  [GraphQL settings node](https://developers.cloudflare.com/analytics/graphql-api/features/discovery/settings/),
  [GraphQL datasets and the metadata boundary](https://developers.cloudflare.com/data-localization/metadata-boundary/graphql-datasets/),
  [a third-party copy of the GraphQL schema](https://pages.johnspurlock.com/graphql-schema-docs/cloudflare.html)
