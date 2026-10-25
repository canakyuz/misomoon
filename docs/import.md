# Import your history and connect Search Console

Bring the numbers you collected before misomoon into your reports, from a Google
Analytics property or from the CSV files of an export. Connect Google Search Console to
see the Google searches that brought people to the site.

An import stores daily totals per dimension, such as the visitors from each source on
each day. misomoon adds them to its own data in the top-line numbers, the chart, and
[the breakdowns that imports fill](#what-imported-data-fills). Imported numbers appear
only in reports without filters, because misomoon can't tell which imported visits match
a filter.

To hide imported history, turn off
[**More** > **Include imported history**](dashboard.md#include-imported-history). It
appears once the site has a finished import, and it starts on. Turning it off adds
`imported=0` to the address, which [the API](api.md#query-parameters) also accepts.

## Import a Google Analytics property

misomoon adds imported days to the days it collected, so a day in both counts twice.
Import only the days before misomoon started collecting on the site. A self-hosted
instance first needs [Google sign-in](#set-up-google-sign-in-on-your-instance).

1. Open **Settings** > **Integrations**.
2. In the **Import history** card, click **Connect Google**.
3. Sign in with a Google account that can read the property, and allow access. Finish
   within an hour of the click.
4. Back in **Settings**, pick the property in **Google property**. The list shows each
   property as `Account: Property`.
5. In **To**, set the day before misomoon started collecting.
6. To start later than the earliest day Google has, set **From**.
7. Click **Import**.

Both dates are included. An empty **From** starts at `2015-08-14`, the earliest day
Google serves. An empty **To** ends yesterday.

The import runs on the server, so you can close the page. Its row says **Importing…**
until it shows the first and last day and the number of rows stored. If it shows
**Failed:** and an error, delete it and start again at **Connect Google**. A failed import
keeps none of its rows, so starting again counts no day twice.

## Upload CSV files

misomoon reads a CSV export as one ZIP file or as the CSV files from it.
[CSV format](#csv-format) lists the files and columns.

1. Open **Settings** > **Integrations**.
2. In the **Import history** card, click **Upload CSV or zip**.
3. Pick the ZIP file, or one or more CSV files.

Include `imported_visitors.csv`, the only file that fills the site totals and the chart.
misomoon reads the files while you wait and skips the ones it doesn't read. If no file
holds rows it reads, the upload fails with
`no imported_*.csv files found (expected a CSV export)`. To upload from a script, see
[the API reference](api.md#imports).

### CSV format

Each file holds one report and is named `imported_<report>.csv` or
`imported_<report>_<YYYYMMDD>_<YYYYMMDD>.csv`. Inside a ZIP file, a file may sit in a
folder. misomoon skips files for reports that the table below doesn't list.

- The first line holds the column names. Columns can come in any order, misomoon ignores
  columns it doesn't read, and a missing column counts as empty.
- `date` is `YYYY-MM-DD`. misomoon skips rows with any other date.
- Commas separate values. A value in double quotes may hold commas and line breaks, and
  `""` inside it is one double quote.
- Counts are rounded to whole numbers. An empty, negative, or non-numeric count is `0`.
- Text values are trimmed and cut at 500 characters. An empty value becomes `(none)`.

The visit columns are `visitors` (unique visitors that day), `visits`, `pageviews`,
`bounces`, and `visit_duration` (the total length of all visits, in seconds).

| Report | Columns besides `date` | Fills |
| --- | --- | --- |
| `visitors` | The visit columns | The site totals and the chart |
| `sources` | `source`, `referrer`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, and the visit columns | `source` (empty is `Direct`), `channel` (worked out from `source`, `utm_medium`, and `utm_source`), `referrer` (its host without `www.`), and each UTM dimension that has a value |
| `pages` | `page`, `visitors`, `visits`, `pageviews`, `total_time_on_page`, `total_time_on_page_visits`, `total_scroll_depth`, `total_scroll_depth_visits` | `page`. Time on page is `total_time_on_page` (seconds) divided by `total_time_on_page_visits`. Scroll depth is `total_scroll_depth` (percent) divided by `total_scroll_depth_visits`. |
| `entry_pages` | `entry_page`, `entrances`, `visitors`, `pageviews`, `bounces`, `visit_duration` | `entry_page`, with `entrances` as visits |
| `exit_pages` | `exit_page`, `exits`, `visitors`, `pageviews`, `bounces`, `visit_duration` | `exit_page`, with `exits` as visits |
| `locations` | `country`, `region`, and the visit columns | `country` as an uppercase code, and `region` |
| `browsers` | `browser`, `browser_version`, and the visit columns | `browser`, and `browser_version` as the name followed by the version |
| `operating_systems` | `operating_system`, `operating_system_version`, and the visit columns | `os`, and `os_version` as the name followed by the version |
| `devices` | `device` and the visit columns | `device` |
| `custom_events` | `name`, `visitors`, `events` | `event` and the total event count. `Outbound Link: Click` becomes `Outbound link`, `File Download` becomes `Download`, and `Form: Submission` becomes `Form sent`. |

## Delete an import

Each import is separate. To import the same days again, delete the old import first, or
those days count twice. If an import says **Importing…**, wait until it finishes or
fails. Rows that a running import writes after you delete it stay in your reports.

1. Open **Settings** > **Integrations**.
2. In the **Import history** card, click **Delete import** on the import's row.

misomoon deletes the import and its rows at once, without asking you to confirm. When
the last finished import is gone, **Include imported history** leaves the **More** menu.

## Connect Search Console

The site must be in Search Console under a Google account you can sign in with. A
self-hosted instance also needs [Google sign-in](#set-up-google-sign-in-on-your-instance).
Without it, the **Google Search Console** card says **Not enabled on this server**.

1. Open **Settings** > **Integrations**.
2. In the **Google Search Console** card, click **Connect Search Console**.
3. Sign in with a Google account that has the site in Search Console, and allow access.
4. Back in **Settings**, pick the property in **Search Console property**. Properties
   for the site's domain come first and say **matches this site**.
5. Click **Connect**.

The list leaves out properties that the account hasn't verified. If none is left, add
the site in Search Console or sign in with another account. A site has one connected
property. Connecting another one replaces it.

To see the search terms, open **Overview**, click the **Organic Search** channel in
**Where they come from**, then click the **Search terms** tab. The tab lists the terms
with the most clicks from Google in the period. For impressions, click-through rate, and position, call
[the breakdown endpoint](api.md#get-apiv1statsbreakdown) with `property=search_term`, or
use the `get_search_terms` [MCP tool](mcp.md#tools).

misomoon asks Google when you open the report, keeps each answer for ten minutes, and
doesn't store search terms. Google reports searches about two days late, so the last two
or three days of a period fill in later. Google can filter search terms by page and by
device only. Any other filter shows an error that names it.

To disconnect, click **Disconnect Search Console** in the card. misomoon asks Google to
revoke its access and deletes the stored tokens, without asking you to confirm.

## Set up Google sign-in on your instance

misomoon Cloud users can skip this section, and CSV uploads don't need it. The Google
import and Search Console share one OAuth client in your own Google Cloud project. If the
instance already has `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, you are done.

1. In the Google Cloud console, create or open a project.
2. Enable the Google Analytics Data API and the Google Analytics Admin API for the
   import, and the Google Search Console API for Search Console.
3. Configure the OAuth consent screen.
4. Create an OAuth client ID of type **Web application**.
5. Under **Authorized redirect URIs**, add your misomoon address followed by
   `/api/v1/google/callback`, such as
   `https://analytics.example.com/api/v1/google/callback`.
6. In `apps/api`, set the client ID and secret:

   ```sh
   wrangler secret put GOOGLE_CLIENT_ID
   wrangler secret put GOOGLE_CLIENT_SECRET
   ```

On an instance deployed with the button, set the secrets under the Worker's
**Settings** > **Variables and Secrets** in the Cloudflare dashboard. misomoon builds the
redirect URI from the address you open the dashboard at, not from `PUBLIC_URL`, so add
one for each address you use.

If the consent screen's publishing status is **Testing**, add each Google account that
signs in as a test user. Google ends the refresh tokens of apps in testing after 7 days
([Google's OAuth documentation](https://developers.google.com/identity/protocols/oauth2#expiration),
checked 2026-10-25). Search Console then shows `Google sign-in expired; connect again`
until you connect again. [The secrets reference](configuration.md#secrets) lists the
other secrets.

## Reference

### What imported data fills

[The metrics page](metrics.md) defines each metric.

| Dimension | Google property | CSV files |
| --- | --- | --- |
| Site totals and the chart | Yes | `imported_visitors.csv` |
| Custom event counts in the totals | Yes | `imported_custom_events.csv` |
| `channel`, `source`, `referrer` | Yes | Yes |
| `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term` | Yes | Yes |
| `page`, `entry_page`, `country`, `region`, `browser`, `os`, `os_version`, `device`, `event` | Yes | Yes |
| `exit_page`, `browser_version` | No | Yes |
| `city` | Yes | No |

- Imported visitors are unique per day, so a period's imported visitors are the sum of
  its days.
- misomoon stores each day under the same date in the site's time zone. A day has no
  time of day, so minute and hour charts show it at midnight.
- A page's bounce rate and visit duration come from the `entry_page` rows.
- From Google, a bounce is a session that wasn't engaged (`sessions` minus
  `engagedSessions`). Google's own events `page_view`, `session_start`, `first_visit`,
  `user_engagement`, and `scroll` are left out, because misomoon measures them itself.

### What imports leave out

- Reports with any filter, including saved filters and goal filters.
- Goal conversions, revenue, and the **Funnels**, **Paths**, **Live**, **Behavior**, and
  **Speed** views.
- Dimensions the table above doesn't list, such as screens, networks, and languages.
- Scroll depth from a Google import.
- The **All time** period, which starts at the first visit misomoon collected. To see
  older imported days, pick a period that reaches back to them. A custom period covers up
  to 400 days.

### Limits

| Limit | Value |
| --- | --- |
| Time to finish a Google sign-in | 1 hour from the click on **Connect Google** or **Connect Search Console** |
| Google import dates | `YYYY-MM-DD`. Another form falls back to the default. |
| Import name, import error, and CSV text value | 120, 500, and 500 characters |
| Search terms per page | 1,000 from the breakdown, 100 from the MCP tool |
| Imports while the site's data moves between shards | Fail with `this site's history is being moved between shards; try the import again in a few hours` |

### Roles

| Task | Who can do it |
| --- | --- |
| Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` | Whoever deploys the Worker |
| Import, see, and delete imports, and connect or disconnect Search Console | Owner, admin, editor, and guest editor |
| See imported numbers, **Include imported history**, and search terms | Everyone who can see the site's reports |

An API key acts with its owner's role. The routes are in the API reference under
[Imports](api.md#imports) and [Google Search Console](api.md#google-search-console).

### What misomoon stores

misomoon stores each import's details and daily totals, and for a connected Search
Console property, the property, its Google tokens, who connected it, and the date. It
deletes sign-in tokens after a successful import or connection. At the next sign-in, it
deletes unused ones older than a day. It asks Google for read-only, offline access with the `analytics.readonly` and
`webmasters.readonly` scopes.
