# Switch from Matomo

misomoon imports your Matomo history from Matomo's Reporting API: pick Matomo under
**Settings** > **Integrations**, and give it Matomo's address, the site ID, and an auth
token. It reads daily reports with unique visitors, bounces, and visit durations, on
Matomo Cloud and Matomo On-Premise alike. Your tracking calls change from `_paq.push()` arrays to
`misomoon()` calls. Goals, ecommerce revenue, and custom dimensions stay behind.

## Add misomoon next to Matomo

1. Add your site in misomoon and paste its script tag into the `<head>` of every page, next
   to Matomo's tracking code ([Track your site](tracking.md#add-the-script)).
2. Leave both scripts on for a week or two, until misomoon's numbers look right to you.

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

misomoon reads your Matomo history from Matomo's Reporting API, on Matomo Cloud and
Matomo On-Premise alike.

1. In Matomo, open **Personal** > **Security** > **Auth tokens** and create a token for a
   user who can view the site. Matomo asks whether the token only works for secure
   requests. Either works: misomoon sends the token in the body of a `POST`.
2. In misomoon, open **Settings** > **Integrations**, and in the **Import history** card,
   pick Matomo in **Import from another tool**.
3. Fill in:
   - **Matomo address**: the address you open Matomo at, such as
     `https://example.matomo.cloud`. A page of Matomo, such as
     `https://matomo.example.com/index.php`, works too.
   - **Site ID**: the number in Matomo's **Administration** > **Websites** > **Manage**.
   - **Auth token**: the token from step 1.
4. Leave **From** and **To** empty to import every day from the day you added the site in
   Matomo to the day before misomoon started counting. Set them to import less.
5. Click **Import**.

misomoon signs in while you wait. A wrong token or a site the user can't view stops the
import there, with Matomo's answer, such as `Matomo answered: You can't access this
resource as it requires 'view' access for the website id = 1.` Then the import runs on
the server, from the newest day back, so you can close the page. Its row shows
**Importing…** and the days read so far
([Import from another tool](import.md#import-from-another-tool)).

misomoon reads the visits of 90 days in one request and skips the days without any. A day
with visits takes two more requests, of at most 10 reports each, the most Matomo allows in
one. misomoon makes two requests a second at most. A year with visits on every day
usually takes under an hour. On a server that builds reports when they're asked for,
instead of with Matomo's archiving cron job, each request takes longer. misomoon deletes
the token when the import ends.

misomoon skips the days it already counted
([Days that count once](import.md#days-that-count-once)). Matomo counts each day in the
time zone set for the site in Matomo. misomoon stores it under the same date, so set the
misomoon site's **Timezone** to the same one ([Sites](settings.md#sites)).

For each day, it asks for these reports, with `period=day`, the period whose unique
visitors Matomo always processes:

| Matomo report | Goes into |
| --- | --- |
| `VisitsSummary.get` and `Actions.get` | Visitors, visits, page views, bounces, and visit duration for the day |
| `Actions.getPageUrls` | Pages, with time on page, entry pages with their bounces, and exit pages. Paths lose a trailing slash and the query, as misomoon stores them. |
| `Referrers.getReferrerType` | `Direct` for Matomo's direct entries |
| `Referrers.getSearchEngines`, `getSocials`, `getAIAssistants`, `getWebsites` | Sources, referrers, and channels: `Organic Search`, `Organic Social`, `AI Assistants`, and for websites the channel misomoon gives the site. A known site gets misomoon's name, such as `Bing` for `bing.com`. |
| `Referrers.getCampaigns` | UTM campaigns |
| `UserCountry.getCountry` | Countries |
| `DevicesDetection.getBrowsers`, `getOsFamilies`, `getOsVersions`, `getType` | Browsers, operating systems and their versions, and devices, with misomoon's names: `Chrome Mobile` becomes `Chrome`, `Mac 10.15` becomes `macOS` 10.15, and `Smartphone` becomes `Mobile` |
| `Events.getCategory` with the event action | Custom events, named `Category: Action`, with the visitors who sent each |

Some numbers are worked out, because Matomo's reports don't hold them:

- Visitors from a search engine. Matomo gives search engines visits but no unique
  visitors, so each engine gets visitors in the same share of its visits as all search
  engines have together.
- Page views per source, country, browser, operating system, device, and entry page.
  Matomo counts actions there, which hold downloads, outlinks, and site searches too. Each
  row gets the day's share of page views among actions.

A report of a plugin that is off, such as **Events**, or one an older Matomo doesn't have,
such as AI assistants before Matomo 5.4, is left out, and the rest of the day imports.

### Without the importer

To pick the numbers yourself, call the same reports and upload them as
[CSV files](import.md#csv-format). This call gets `VisitsSummary.get` from the first day
you want to the day before you added misomoon, here 2026-10-11:

```sh
curl -d "token_auth=$MATOMO_TOKEN" "https://matomo.example.com/index.php?module=API&method=VisitsSummary.get&idSite=1&period=day&date=2024-01-01,2026-10-11&format=json&filter_limit=-1" > VisitsSummary.get.json
```

The answer holds the rows of each day under the day's date. `filter_limit=-1` returns
every row, where the default is 100. Write `nb_uniq_visitors` as `visitors`, `nb_visits`
as `visits`, `bounce_count` as `bounces`, and `sum_visit_length` as `visit_duration`, in
the files the table above names, with the day in `date`. Zip the files and pick the zip
under **Upload CSV or zip** in the **Import history** card.

### On-Premise database

On-Premise also keeps raw visits in MySQL or MariaDB: one row per visit in `log_visit`,
one row per action in `log_link_visit_action`, and the URLs and names in `log_action`
([database schema](https://developer.matomo.org/guides/database-schema)). misomoon reads
daily totals, so raw rows need you to count visits per day yourself. The Reporting API has
done that already, and the importer reads it.

Matomo Cloud's Data Warehouse Connector, a paid add-on, exports the same raw tables. The
importer is the shorter path there too.

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
- The source and channel of visits from a campaign. `Referrers.getCampaigns` names the
  campaign only, so those visits count in the day's totals and **UTM campaigns**, but in
  no source or channel.
- UTM source and medium. `Referrers.getCampaigns` names the campaign only. The
  MarketingCampaignsReporting plugin, which Matomo Cloud's Business and Enterprise plans
  include, reports more, and this page doesn't map it.
- Regions. Matomo gives region codes, and misomoon names the region, such as California,
  so the importer leaves them out.
- Visits of an unknown country, or of a device that isn't a desktop, phone, or tablet,
  such as a TV or a console, in **Countries** and **Devices**. The day's totals hold them.
- Exact page views per source, country, or browser, which the importer works out from
  actions.
- User ids from `setUserId`.

## Sources

Checked on 2026-10-25.

The importer was tested on one day of Matomo's public demo, read on 2026-10-26.

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
