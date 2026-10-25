# Switch from Fathom

misomoon imports your Fathom history from Fathom's API with an API token: daily totals,
pages, entry and exit pages, sources, UTM tags, countries, cities, browsers, operating
systems, devices, and event completions. Your tracking calls keep their names:
`fathom.trackEvent('newsletter signup')` becomes `misomoon('newsletter signup')`. Event
values and goals stay behind.

## Add misomoon next to Fathom

1. Add your site in misomoon and paste its script tag into the `<head>` of every page, next
   to Fathom's ([Track your site](tracking.md#add-the-script)).
2. Leave both scripts on for a week or two, until misomoon's numbers look right to you.

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

misomoon reads your history from Fathom's API, a day at a time. Every Fathom plan has the
API.

1. In Fathom, open **Settings** > **API**, click **Create new**, and give the token read
   access to the site, or to all sites.
2. In misomoon, open **Settings** > **Integrations**.
3. In the **Import history** card, pick **Fathom** in **Import from another tool**.
4. Fill in **Site ID**, the code in your Fathom embed script such as `CDBUGS`, and paste
   the token into **API token**.
5. Leave **From** and **To** empty to import every day from the day you added the site in
   Fathom to the day before misomoon started counting. Set them to import less.
6. Click **Import**.

misomoon reads the site and its event names while you wait. A wrong token or site ID
stops the import there, with Fathom's answer, such as
`Fathom answered 401: check the key or the sign-in, and that it can read this site`. Then
the import runs on the server, from the newest day back, so you can close the page. Its
row shows **Importing…** and the days read so far.

Fathom's included API plan allows 600 requests an hour, so misomoon makes at most 10 a
minute. A day with visits takes 8 requests. Totals and each event's completions are read
90 days to a request, so empty days cost nothing. A year of daily traffic takes about five
hours, and a larger API plan doesn't make it faster. Fathom counts each request toward
your monthly pageviews, so a year adds about 3,000. When Fathom answers `429` or doesn't
answer, the import waits as its `Retry-After` header says and tries again. After six
failed tries in a row, it fails and keeps none of its rows. misomoon deletes the token
when the import ends ([Import from another tool](import.md#import-from-another-tool)).

misomoon skips the days it already counted ([Days that count once](import.md#days-that-count-once)).
Every request goes to `GET /v1/aggregations` with `timezone` set to the misomoon site's
**Timezone** ([Sites](settings.md#sites)). For each day, it reads:

| Fathom aggregation | Goes into |
| --- | --- |
| `date_grouping=day` with `visits`, `pageviews`, `bounce_rate`, and `avg_duration` | Visitors, visits, page views, bounces, and visit duration for the day. Fathom counts a visitor once a day, so the day's visits are its visitors. Bounces are visits times `bounce_rate`, and visit duration is visits times `avg_duration` in seconds. |
| `field_grouping=pathname` | Page views and visitors per page, without a trailing slash or query, as misomoon stores paths |
| `field_grouping=entry_page`, `exit_page` | Entry pages with their bounces and time, and exit pages |
| `field_grouping=referrer_hostname` | Sources, referrers, and channels. A known site gets misomoon's name, such as `Google` for `google.com`. An Android app such as `android-app://com.linkedin.android` counts as its site, `linkedin.com`, as misomoon's tracker counts it. Visits without a referrer count as `Direct`. |
| `field_grouping` with the five UTM fields | Each UTM tag on its own. A row holds all five tags, so a tag's visits are the sum of its rows. |
| `field_grouping=country_code`, `city` | Countries and cities |
| `field_grouping=browser,operating_system,device_type` | Browsers, operating systems, and devices, with misomoon's names: `OS X` becomes `macOS`, `AndroidOS` becomes `Android`, `Ubuntu` becomes `Linux`, and `Phone` becomes `Mobile` |
| `entity=event` for each event name | Custom events: completions and the visitors who completed each |

A grouped request returns at most 1,000 rows, and Fathom's API has no further pages. On a
day with more pages, cities, or referrers than that, misomoon keeps the 1,000 with the most
visits. Fathom says its breakdowns are accurate only from March 2021 on, since it didn't
tie browser, country, and page together before then. The day's totals are accurate
before then too.

Imported days appear only in reports without filters
([What imported data fills](import.md#what-imported-data-fills)). To start again,
[delete the import](import.md#delete-an-import).

## Remove Fathom

Once the import shows in misomoon, remove Fathom's script tag and its `fathom` calls.

## What stays behind

- Event values. Fathom's revenue per event doesn't come across, because misomoon's imports
  fill no revenue.
- Goals. Add them again in misomoon.
- Time on page and scroll depth. Fathom reports time on site, not per page.
- Browser and operating system versions.
- Visits. Imported days have one visit per visitor, so pages per visit read high on
  sites where people come back the same day.
- Bounces and time per source, country, and device. misomoon asks for them only on the
  day's totals and entry pages.
- Regions. Fathom doesn't document how it names them.
- Fathom's source groups and AI sources. misomoon works out each channel from the
  referrer, as its tracker does.

## Sources

Checked on 2026-10-26.

The import was built from Fathom's API reference and tested on the answers in it, on
answers a Fathom user published, and on a real day of a public Fathom dashboard. A
dashboard reads the same rows as the API under other names, so the test asks for the
API's names. The import has not yet run against the API itself, which needs a token.

- Fathom: [export your data](https://usefathom.com/docs/features/exporting),
  [API](https://usefathom.com/api),
  [API reference as text](https://usefathom.com/api/llms.txt),
  [OpenAPI schema](https://usefathom.com/api/openapi.json),
  [how Fathom measures](https://usefathom.com/docs/start/measurement),
  [events](https://usefathom.com/docs/events/overview),
  [ecommerce events](https://usefathom.com/docs/events/ecommerce-conversions),
  [features](https://usefathom.com/features),
  [pricing](https://usefathom.com/pricing)
- Published API answers: [a Fathom user's post with aggregation answers](https://github.com/spences10/scottspence.com/blob/main/posts/adding-real-time-analytics-to-my-sveltekit-site-with-fathom.md)
- Real data: [the public dashboard of dylanbeattie.net](https://app.usefathom.com/share/qygedclj/dylanbeattie.net), read for 2026-09-28,
  and [Fathom's shared dashboards](https://usefathom.com/docs/features/shared-dashboards)
