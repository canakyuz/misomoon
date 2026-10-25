# Switch from Umami

misomoon imports your Umami history from Umami's API: pick Umami under **Settings** >
**Integrations**, and give it the website ID and an API key or a sign-in. Your tracking calls keep their names, and the event data moves under
`props`: `umami.track('Signup', { plan })` becomes `misomoon('Signup', { props: { plan } })`.
Revenue history and event data stay behind.

## Add misomoon next to Umami

1. Add your site in misomoon and paste its script tag into the `<head>` of every page, next
   to Umami's tag with `data-website-id` ([Track your site](tracking.md#add-the-script)).
2. Leave both scripts on for a week or two, until misomoon's numbers look right to you.

## Replace Umami's calls

`umami.track()` takes the event data as its second argument. `misomoon()` takes it under
`props`, and revenue under `revenue` as an amount and a currency.

| Umami | misomoon |
| --- | --- |
| `umami.track('signup-button')` | `misomoon('signup-button')` |
| `umami.track('signup-button', { plan: 'newsletter', id: 123 })` | `misomoon('signup-button', { props: { plan: 'newsletter', id: 123 } })` |
| `umami.track('checkout-cart', { revenue: 19.99, currency: 'USD' })` | `misomoon('checkout-cart', { revenue: { amount: 19.99, currency: 'USD' } })` |
| `data-umami-event="Signup button" data-umami-event-id="123"` | `data-misomoon-event="Signup button" data-misomoon-prop-id="123"` |
| `data-auto-pageview="false"` on the tag, then `umami.track()` | `data-manual` on the tag, then `misomoon('pageview')` |
| `data-domains` | Nothing to set. misomoon counts pages only on the site's domain and its subdomains. |
| `data-exclude-search` | Nothing to set. misomoon stores each page without its query string. |
| `data-do-not-track` | **Respect Global Privacy Control and Do Not Track** in **Settings** > **Install** > **Privacy** ([privacy settings](compliance.md#privacy-settings)) |
| `umami.identify()` | No equivalent. misomoon has no user ids. |

The `data-misomoon-*` attributes need **Tagged events**, which a new site has on
([Choose what to track](tracking.md#choose-what-to-track)). If you send revenue from a
payment provider's webhook instead, [connect it](revenue.md) and drop `revenue` from the
call, or each sale counts twice.

misomoon imports no goals. To count an event as a conversion, add a goal for it in
**Settings** > **Goals** ([Create a goal](conversions.md#create-a-goal)). A goal counts
the events misomoon already collected, so you can add it at any time.

## Bring your history

misomoon reads your history from Umami's API, a day at a time, on Umami Cloud and on your
own server alike.

1. In misomoon, open **Settings** > **Integrations**.
2. In the **Import history** card, pick **Umami** in **Import from another tool**.
3. Fill in the form:
   - **Server address**: leave it empty for Umami Cloud. For your own server, type its
     address, such as `https://umami.example.com`.
   - **Website ID**: in Umami, under **Settings** > **Websites** > **Edit**.
   - On Umami Cloud, **API key**: create one under **Settings** > **API keys**
     ([Umami's API key page](https://docs.umami.is/docs/cloud/api-key)).
   - On your own server, **Username** and **Password** of a user who can view the
     website. A user with two-factor sign-in can't be used. Make a user for the import.
4. Leave **From** and **To** empty to import every day from the day you added the website
   in Umami to the day before misomoon started counting. Set them to import less.
5. Click **Import**.

misomoon signs in while you wait. A wrong key, a wrong password, or a website the user
can't read stops the import there, with Umami's answer, such as
`Umami answered 401: check the key or the sign-in, and that it can read this site`. Then
the import runs on the server, from the newest day back, so you can close the page. Its row
shows **Importing…** and the days read so far, such as `120 of 365 days`.

Umami Cloud allows 50 calls every 15 seconds per API key, and a day with visits takes 15
calls, so a year takes about half an hour of calls. misomoon reads for a few minutes at a
time and goes on every five minutes, so a year takes about an hour. When Umami
asks it to slow down or doesn't answer, the import waits and tries again. After six failed
tries in a row, it fails and keeps none of its rows. misomoon deletes the API key or the
password when the import ends ([Import from another tool](import.md#import-from-another-tool)).

misomoon skips the days it already counted ([Days that count once](import.md#days-that-count-once)).
For each day, it reads:

| Umami call | Goes into |
| --- | --- |
| `/stats` | Visitors, visits, page views, bounces, and visit duration for the day |
| `/metrics/expanded?type=path`, `entry`, `exit` | Pages, entry pages, and exit pages, without a trailing slash or query, as misomoon stores paths |
| `/metrics/expanded?type=referrer` | Sources, referrers, and channels. A known site gets misomoon's name, such as `Google` for `google.com`. Visits without a referrer, or from your own site, count as `Direct`. |
| `/metrics/expanded?type=country`, `browser`, `os`, `device` | Countries, browsers, operating systems, and devices, with misomoon's names: `chrome` becomes `Chrome`, `Mac OS` becomes `macOS`, and `Windows 10` becomes `Windows` 10/11 |
| `/metrics/expanded?type=event` | Custom events, with the visitors who sent each |
| `/metrics/expanded?type=utmSource` and the other four UTM tags | Each UTM tag on its own. Umami reports each tag apart, so the tags don't add to sources. |

### From the database

On your own server you can also read Umami's database and upload the files yourself, to
bring what the API can't, such as UTM tags together with their source. The table says
where each file comes from in the `website_event` and `session` tables of Umami 3.4.1. In
`website_event`, an `event_type` of `1` is a page view and `2` is a custom event. Count
each day in the time zone of the misomoon site's **Timezone** ([Sites](settings.md#sites)),
and write values the way misomoon names them ([Dimensions](metrics.md#dimensions)).

| misomoon file | Umami tables and columns |
| --- | --- |
| `imported_visitors.csv` | Per day: distinct `session_id` as `visitors`, distinct `visit_id` as `visits`, page view rows as `pageviews`, visits with one page view as `bounces`, and the sum over visits of the last `created_at` minus the first, in seconds, as `visit_duration` |
| `imported_sources.csv` | Each visit's first event: `referrer_domain` as `referrer`, the source's name as `source`, and the `utm_*` columns. Write one row per combination of the six values. |
| `imported_pages.csv` | Page view rows by `url_path`: their count as `pageviews`, distinct `session_id` as `visitors`, and distinct `visit_id` as `visits` |
| `imported_entry_pages.csv`, `imported_exit_pages.csv` | The first and the last page view of each visit, by `url_path` |
| `imported_locations.csv` | `session.country` |
| `imported_browsers.csv`, `imported_operating_systems.csv`, `imported_devices.csv` | `session.browser`, `session.os`, and `session.device` |
| `imported_custom_events.csv` | Custom event rows by `event_name`: their count as `events`, and distinct `session_id` as `visitors` |

Umami's session id changes once a month by default, so distinct `session_id` per day
counts each visitor once that day. Zip the files and upload them under **Settings** >
**Integrations** > **Upload CSV or zip** ([Upload CSV files](import.md#upload-csv-files)).

Imported days appear only in reports without filters
([What imported data fills](import.md#what-imported-data-fills)). To start again,
[delete the import](import.md#delete-an-import).

## Remove Umami

Once the import shows in misomoon, remove Umami's script tag and its `umami.track()`
calls.

## What stays behind

- Revenue history. Umami keeps revenue in its `revenue` table, and misomoon imports none.
- Event data. misomoon imports event counts without properties.
- Browser versions, time on page, and scroll depth. Umami's API has none of them.
- Bounces and visit duration per page, entry page, exit page, source, and UTM tag. Umami
  Cloud answers `0` for both on those breakdowns, so imported days add visits there but
  no bounces, and `Direct` gets none of the day's bounces either. The day's totals,
  countries, browsers, operating systems, and devices keep them.
- Bot and tool visits Umami names `searchbot`, `curl`, or `phantomjs`. misomoon counts
  no bots, so they stay out of browsers, though the day's totals still hold them.
- UTM tags by source. The API reports each tag on its own.
- Regions and cities. Umami stores region codes, such as `US-CA`, and misomoon names the
  region, such as California, so misomoon leaves them out.

## Sources

Checked on 2026-10-25. The import was tested on one day of Umami Cloud's public demo,
read on 2026-10-26.

- Umami: [export data](https://docs.umami.is/docs/cloud/export-data),
  [API](https://docs.umami.is/docs/api),
  [API key](https://docs.umami.is/docs/cloud/api-key),
  [tracker configuration](https://docs.umami.is/docs/tracker-configuration),
  [tracker functions](https://docs.umami.is/docs/tracker-functions),
  [track events](https://docs.umami.is/docs/track-events),
  [revenue](https://docs.umami.is/docs/revenue),
  [database schema in the code](https://github.com/umami-software/umami/blob/559e3c6/prisma/schema.prisma),
  [stats query in the code](https://github.com/umami-software/umami/blob/559e3c6/src/queries/sql/getWebsiteStats.ts),
  [expanded metrics route in the code](https://github.com/umami-software/umami/blob/559e3c6/src/app/api/websites/%5BwebsiteId%5D/metrics/expanded/route.ts),
  [session salt in the code](https://github.com/umami-software/umami/blob/559e3c6/src/lib/crypto.ts)
