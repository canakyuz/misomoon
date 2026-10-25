# Switch from Pirsch

misomoon imports your Pirsch history from Pirsch's API: pick Pirsch under **Settings** >
**Integrations**, and give it an oAuth client's ID and secret. Pirsch's event calls keep
their shape: `pirsch('Signup', { meta })` becomes `misomoon('Signup', { props })`.
Conversion goals, funnels, revenue, and event metadata stay behind.

## Add misomoon next to Pirsch

1. Add your site in misomoon and paste its script tag into the `<head>` of every page, next
   to Pirsch's `pa.js` tag ([Track your site](tracking.md#add-the-script)).
2. Leave both scripts on for a week or two, until misomoon's numbers look right to you.

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

1. In Pirsch, open the dashboard's **Settings** > **Developer**, and add a client of type
   **oAuth**. Turn off its write scopes if you like, since the import only reads. An
   **Access Key** client, whose secret starts with `pa_`, can only send data and can't be
   used.
2. In misomoon, open **Settings** > **Integrations**, and in the **Import history** card,
   pick Pirsch in **Import from another tool**.
3. Fill in **Client ID** and **Client secret**. A client made on the dashboard reads that
   dashboard. A client made on Pirsch's account settings page can read every dashboard you
   have, so also set **Domain** to the one to import, such as `example.com`.
4. Leave **From** and **To** empty to import every day from the day you added the
   dashboard in Pirsch to the day before misomoon started counting. Set them to import less.
5. Click **Import**.

misomoon signs in while you wait. A wrong ID or secret stops the import there, with
Pirsch's answer. Then the import runs on the server, from the newest day back, so you can
close the page. Its row shows **Importing…** and the days read so far
([Import from another tool](import.md#import-from-another-tool)). misomoon deletes the
secret when the import ends.

Pirsch counts each day in the time zone of your misomoon site, which misomoon sends with
each request, so the days match misomoon's own. misomoon reads the visitors of 90 days in
one request and skips the days without any. A day with visitors takes about 25 requests,
and misomoon makes at most 10 a second, so a year takes about half an hour. misomoon
skips the days it already counted ([Days that count once](import.md#days-that-count-once)).

For each day, it reads:

| Pirsch route | Goes into |
| --- | --- |
| `/statistics/total` and `/statistics/duration/session` | Visitors, visits, page views, and bounces for the day. Visit duration is the day's average visit time times its visits. |
| `/statistics/page` with the average time on page | Pages, with time on page. Paths lose a trailing slash, as misomoon stores them. |
| `/statistics/page/entry` and `/statistics/page/exit` | Entry pages and exit pages |
| `/statistics/referrer` | Sources and referrers. A known site gets misomoon's name, such as `Google` for `www.google.com`. A visit without a referrer is `Direct`, unless a `ref` parameter named its source. |
| `/statistics/channel` | Channels. Pirsch's `AI` is `AI Assistants`, `Paid Other` is `Paid Search`, and `Audio`, `SMS`, and `Mobile Push Notifications` are `Referral`, as misomoon's tracker files the same visits. |
| `/statistics/country`, `/browser`, `/os`, `/platform` | Countries, browsers, operating systems, and devices. `Mac` becomes `macOS`. `platform_desktop` is `Desktop` and `platform_mobile` is `Mobile`. |
| `/statistics/events` | Custom events, with the visitors who sent each. `Outbound Link Click` becomes `Outbound link` and `File Download` becomes `Download`, the names of misomoon's own events. |
| `/statistics/utm/source` and the other four UTM routes | Each UTM tag on its own. Pirsch reports each tag apart, so the tags don't add to sources. |

Pirsch gives countries, browsers, operating systems, devices, and UTM tags as visitors
only, so imported days add visitors there but no visits or bounces. Entry pages have no
bounces either. Imported days appear only in reports without filters
([What imported data fills](import.md#what-imported-data-fills)).

### Without the importer

Pirsch's dashboard exports a ZIP of CSV files under **Export**, but Pirsch doesn't document
their columns. To pick the numbers yourself, call the routes in the table with `from` and
`to` on the same day, write them as [CSV files](import.md#csv-format), and upload the zip
under **Upload CSV or zip** in the **Import history** card.

## Remove Pirsch

Once the import shows in misomoon, remove Pirsch's `pa.js` script tag and your `pirsch()`
calls.

## What stays behind

- Revenue history and custom metrics. misomoon imports no revenue.
- Conversion goals and funnels. Add them again in misomoon.
- Event metadata. Imported events have no property breakdown.
- Browser and operating system versions, regions, cities, languages, and screen sizes.
- Tablets, and visits on an unknown platform. Pirsch's platform counts have no tablet.

## Sources

Checked on 2026-10-25.

The importer was tested on one day of Pirsch's own public dashboard, read on 2026-10-26.

- Pirsch: [website integration](https://docs.pirsch.io/get-started/frontend-integration),
  [events](https://docs.pirsch.io/advanced/events),
  [outbound links](https://docs.pirsch.io/advanced/outbound-links),
  [file downloads](https://docs.pirsch.io/advanced/file-downloads),
  [conversion goals](https://docs.pirsch.io/advanced/conversion-goals),
  [exporting statistics](https://docs.pirsch.io/get-started/export),
  [API v1](https://docs.pirsch.io/api-sdks/api-v1),
  [API guide v1](https://docs.pirsch.io/api-sdks/api-guide-v1),
  [pricing](https://pirsch.io/pricing)
