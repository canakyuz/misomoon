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

## Days that count once

misomoon adds imported days to the days it counted itself, so it keeps each day from one
place only. An import keeps the days that are:

- Before the first day misomoon counted on the site, in the site's time zone. The day you
  added the script holds part of a day from misomoon, so it isn't imported either.
- Outside the days of every earlier finished import. The first import of a day wins, so
  import the source you trust most first.

You can upload a whole export and leave the trimming to misomoon. The import's row says
how many days it skipped, as in `Skipped 5 days already counted`. If no day is left, the
upload fails and stores nothing, with one of these errors:

- `misomoon has counted this site since 2026-10-12, and every day in this import is on or after it, so there is nothing to add`
- `earlier imports already cover every day in this import, so there is nothing to add`

An import checks the days when it runs. Days misomoon counts later don't change it, and
deleting an import doesn't bring back days another import skipped. To import those days,
delete the later import and upload it again.

## Import a Google Analytics property

A self-hosted instance first needs
[Google sign-in](#set-up-google-sign-in-on-your-instance).

1. Open **Settings** > **Integrations**.
2. In the **Import history** card, click **Connect Google**.
3. Sign in with a Google account that can read the property, and allow access. Finish
   within an hour of the click, in the same browser. A sign-in that ends in another
   browser stops at a page that says "This Google sign-in was started in another
   browser." Click **Connect Google** again in the browser you use misomoon in.
   If you cancel, take more than an hour, or Google refuses, **Settings** shows why, for
   example "The Google sign-in was canceled, so nothing was connected."
4. Back in **Settings**, pick the property in **Google property**. The list shows each
   property as `Account: Property`.
5. To start later than the earliest day Google has, set **From**. To end earlier, set
   **To**.
6. Click **Import**.

Both dates are included. An empty **From** starts at `2015-08-14`, the earliest day
Google serves. An empty **To**, or one on or after the first day misomoon counted, ends
the day before that day. On a site misomoon hasn't counted yet, an empty **To** ends
yesterday. Days an earlier import covers are skipped
([Days that count once](#days-that-count-once)).

The import runs on the server, so you can close the page. Its row says **Importing…**
until it shows the first and last day and the number of rows stored. If it shows
**Failed:** and an error, delete it and start again at **Connect Google**. A failed import
keeps none of its rows, so starting again counts no day twice. An import still
**Importing…** after an hour was stopped part way: within the next hour misomoon marks it
**Failed**, with "The import stopped before it finished", and deletes its rows.

misomoon deletes the Google sign-in it got for the import when the import ends, and within
a day if you never start one.

## Import from another tool

misomoon reads the history of some analytics tools straight from their APIs. The
**Import from another tool** list in the **Import history** card shows them, and each
tool's [switching guide](README.md#switch-from-another-tool) lists what it brings.

1. Open **Settings** > **Integrations**.
2. In the **Import history** card, pick the tool in **Import from another tool**.
3. Fill in the fields the tool asks for, such as its server address, the site's ID in
   the tool, and an API key. **Switching guide** at the top of the form says where to find
   them.
4. Optionally, set **From** and **To**.
5. Click **Import**.

misomoon checks the fields and signs in to the tool while you wait. A wrong key or an
address it can't reach stops the import there, with the tool's answer, and stores nothing.
The server address must be a public `https://` address without a port.

Both dates are included. An empty **From** starts on the first day the tool has, when the
tool says which day that is. Otherwise the form asks you to set **From**. An empty **To**,
or one on or after the first day misomoon counted, ends the day before that day. Days an
earlier import covers are skipped ([Days that count once](#days-that-count-once)).

The import runs on the server, from the newest day back, so you can close the page. It
reads for a few minutes at a time, then goes on every five minutes. Its row shows
**Importing…** and the days read so far, such as `120 of 365 days`, and each finished day
shows in your reports as soon as it's read.

- When the tool asks misomoon to slow down, misomoon waits as long as the tool asks.
- When the tool doesn't answer, or answers with a server error, misomoon tries again five
  minutes later, up to six runs in a row. Then the import fails.
- When the tool refuses the key part way, the import fails.

A failed import keeps none of its rows and shows **Failed:** with the tool's answer.
misomoon keeps the API key or password while the import runs and deletes it when the
import finishes, fails, or is deleted. A running import stops when you delete it.

## Upload CSV files

misomoon reads a CSV export as one ZIP file or as the CSV files from it.
[CSV format](#csv-format) lists the files and columns. It also reads some analytics tools'
own export files as they come, ZIP or gzipped `.csv.gz` alike. Each tool's
[switching guide](README.md#switch-from-another-tool) says whether its export is one of
them.

1. Open **Settings** > **Integrations**.
2. In the **Import history** card, click **Upload CSV or zip**.
3. Pick the ZIP file, one or more CSV files, or the other tool's export file.

Include `imported_visitors.csv`, the only file that fills the site totals and the chart.
misomoon keeps only the days nothing counted yet
([Days that count once](#days-that-count-once)). It reads the files while you wait and skips the ones it doesn't read. If no file
holds rows it reads, the upload fails with
`no imported_*.csv files found (expected a CSV export, or an export misomoon reads from another tool)`.
An export of another tool's that misomoon reads but can't take, such as one in a format
version it doesn't know, fails with the reason, and stores nothing. To upload from a script, see
[the API reference](api.md#imports).

### Raw event exports

Some tools export raw events, one row or line per page view or custom event. misomoon
counts them as its tracker counts visits:

- A visitor's visit ends after 30 minutes without an event, unless the export has its own
  visit id ([A visit ends after 30 minutes without activity](metrics.md#a-visit-ends-after-30-minutes-without-activity)).
- A visit takes its source, UTM tags, place, browser, operating system, and device from its
  first event. A referrer on the site's own host counts as none.
- A visit with one page view and no other event is a bounce
  ([A bounce is a visit with one pageview and no interaction](metrics.md#a-bounce-is-a-visit-with-one-pageview-and-no-interaction)).
- A visit counts on the day it starts in the site's **Timezone**, and a custom event on
  the day it was sent.

Upload all the files of one export at once, such as the page views and the events, so
that an event joins its visit. A visit cut off at the end of an export counts as a shorter
visit, so export whole days.

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
- Text values are trimmed and cut at 500 characters. An empty value becomes `(none)`. An
  empty `country`, `region`, `browser_version`, or `operating_system_version` adds nothing
  to its report.

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
the new one skips them ([Days that count once](#days-that-count-once)). If an import says **Importing…**, wait until it finishes or
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
3. Sign in with a Google account that has the site in Search Console, and allow access,
   in the same browser. A sign-in that ends in another browser stops at a page that says
   "This Google sign-in was started in another browser." If you cancel, take more than
   an hour, or Google refuses, **Settings** shows why.
4. Back in **Settings**, pick the property in **Search Console property**. Properties
   for the site's domain come first and say **matches this site**.
5. Click **Connect**.

The list leaves out properties that the account hasn't verified. If none is left, add
the site in Search Console or sign in with another account. A site has one connected
property. Connecting another one replaces it.

To see the search terms, open **Overview**, click the **Organic Search** channel in
**Where they come from**, then click the **Search terms** tab. The tab lists the terms
with the most clicks from Google in the period. Only the site's team and its guests see
the tab: a [shared link](sharing.md#what-a-viewer-sees) or a
[public site](sharing.md#what-public-means) viewer doesn't. For impressions, click-through rate, and position, call
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

misomoon ties each sign-in to the browser that started it with a cookie, so a link to the
callback that someone else opens connects nothing. In `wrangler dev` at
`http://localhost:8787`, and through the dashboard's dev server, the cookie goes without
`Secure` because the address is HTTP; add `http://localhost:8787/api/v1/google/callback`
as a redirect URI to sign in there.

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
  Google's `click` (an outbound click), `file_download`, and `form_submit` become
  `Outbound link`, `Download`, and `Form sent`, so they add up with what misomoon tracks.

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
| Google import dates | `YYYY-MM-DD`. Another form falls back to the default. A **From** after the day before misomoon's first counted day fails with `misomoon has counted this site since 2026-10-12, so the import must start before it`. |
| Import name, import error, and CSV text value | 120, 500, and 500 characters |
| Another tool's CSV export of single page views | 50 MB unzipped. A larger one fails with the reason, and the tool's guide names a smaller export to upload instead. |
| Raw event exports in one upload | 50 MB unzipped, all files together. More fails with `these raw event exports are larger than 50 MB unzipped; upload fewer days at a time`. |
| A field of an import from another tool | 500 characters. More fails with `<field> must be text of at most 500 characters`. |
| Requests an import from another tool makes in one run | 2,000, and no more than the tool allows |
| Search terms per page | 1,000 from the breakdown, 100 from the MCP tool |
| Imports while the site's data moves between shards | CSV and Google imports fail with `this site's history is being moved between shards; try the import again in a few hours`. An import from another tool waits an hour and goes on. |

### Roles

| Task | Who can do it |
| --- | --- |
| Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` | Whoever deploys the Worker |
| Import, see, and delete imports, and connect or disconnect Search Console | Owner, admin, editor, and guest editor |
| See imported numbers and **Include imported history** | Everyone who can see the site's reports |
| See search terms | Members of the site's team and its guests. A shared link or a public site viewer gets `403` with `search terms are shown to the site's team only`. |

An API key acts with its owner's role. The routes are in the API reference under
[Imports](api.md#imports) and [Google Search Console](api.md#google-search-console).

### What misomoon stores

misomoon stores each import's details and daily totals, and for a connected Search
Console property, the property, its Google tokens, who connected it, and the date. It
deletes sign-in tokens after a successful import or connection. At the next sign-in, it
deletes unused ones older than a day. It asks Google for read-only, offline access with the `analytics.readonly` and
`webmasters.readonly` scopes.
