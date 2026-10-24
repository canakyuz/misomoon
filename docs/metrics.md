# What the numbers mean

The dashboard, the Stats API, and the MCP tools call the same functions in
[`apps/api/src/stats.ts`](../apps/api/src/stats.ts), with SQL from
[`packages/core/src/queries.ts`](../packages/core/src/queries.ts), so a number means the
same thing everywhere. [The API reference](api.md) lists parameters and response fields.

## Headline metrics

The KPI tiles, `GET /api/v1/stats/aggregate`, and each point of
`GET /api/v1/stats/timeseries` return these metrics.

| Metric | What it counts | Notes |
| --- | --- | --- |
| **People** (`visitors`) | Distinct visitor ids among the pageviews and custom events | Engagement pings don't count. Payments count only with a visit on their UTC day. An id lasts [one UTC day](#a-visitor-id-lasts-one-utc-day). |
| **Visits** (`visits`) | Visits that started in the period | |
| **Pageviews** (`pageviews`) | `pageview` events | |
| **Pages per visit** (`views_per_visit`) | Pageviews of the visits that started in the period, divided by `visits` | 2 decimals. It includes views after the period ends, so it can disagree with `pageviews`. |
| **Left at once** (`bounce_rate`) | [Bounced visits](#a-bounce-is-a-visit-with-one-pageview-and-no-interaction) as a percent of visits | Percent, 1 decimal |
| **Time per visit** (`visit_duration`) | Summed [visit durations](#visit-duration-and-time-on-page) divided by `visits` | Whole seconds |
| `events` (no tile) | Every event that is not a `pageview` or an `engagement` | Custom events, the tracker's own events, `Payment`, `Refund`, and events sent with `interactive: false` |
| **Revenue** (`revenue`) | The sum of the amounts on events, net of refunds | Site currency, 2 decimals |
| `average_revenue` (no tile) | `revenue` divided by the events with an amount above zero | Refunds don't count in the divisor. Site currency, 2 decimals. |

`visits`, `views_per_visit`, `bounce_rate`, and `visit_duration` count the visits that
started in the period. The other metrics count the events in it.

Revenue counts events in the site's reporting currency (`USD` by default) and events
without a currency. It never adds up different currencies. Tracker and SDK amounts are kept
between 0 and 1,000,000,000. Refunds come from payment webhooks as negative amounts
([Connect payments](revenue.md)).

`compare=previous` compares with the same length of time right before the period, and
`compare=year` with the same dates a year earlier. `change` is the difference in
percentage points for `bounce_rate` and the percent change for the rest, to 1 decimal. A
percent change is `0` when both periods are `0` and `null` when only the earlier one is.

## A visitor id lasts one UTC day

misomoon sets no cookies. The Worker hashes a salt, the site id, the IP address, and the
user agent with SHA-256 and keeps 16 hex characters as `visitor_id` (`visitorId` in
[`packages/core/src/ingest.ts`](../packages/core/src/ingest.ts)). Each UTC day has its own
random salt in the `salts` table of `CONTROL`. The hourly job deletes salts over two days
old. The IP address is
never stored. [Why is a visitor unique only for one day?](faq.md#why-is-a-visitor-unique-only-for-one-day)

- A person gets a new id at 00:00 UTC. A multi-day count sums each day's unique visitors,
  so someone who visits on 5 days of a month counts 5 times.
- A local day, `today`, or `24h` that spans 00:00 UTC can count one person twice.
- Two people on one IP address with the same user agent share an id. One person on two
  devices or browsers has two.
- Each shard holds whole UTC days ([Sharding](ARCHITECTURE.md#sharding)), so misomoon adds
  each shard's distinct visitors. For a rate, it adds every shard's numerators and
  denominators and divides once, never averaging a rate across shards.

## A visit ends after 30 minutes without activity

A visit (a session in the code, `SESSION_GAP` in
[`packages/core/src/ingest.ts`](../packages/core/src/ingest.ts)) is a run of events from
one visitor id.

- An event within 30 minutes of the last activity joins the visit. Engagement pings count
  as activity. After a longer gap, a pageview or custom event starts a new visit, and an
  engagement ping is dropped.
- An engagement ping is not an event of its own. It adds its time, scroll depth, Web
  Vitals, and interactions to the pageview it belongs to, which the tracker names with a
  view key. They count on that pageview's day and match the filters it matches, its
  props included.
- In the first 30 minutes of a UTC day, the Worker also computes the id under yesterday's
  salt, so an open visit carries on. Each event keeps its own day's id. If the site moved
  to another shard at that midnight, the visit splits in two.
- A visit keeps the source, channel, referrer, UTM tags, hostname, location, browser, OS,
  device, screen, and language of its first event. A later event with a new referrer or
  new UTM tags stays in the visit and takes its values.
- A `Payment` or `Refund` never changes a visit. It takes the visit's visitor id only on
  the visit's UTC day. Otherwise its `visitor_id` is empty and no visitor count has it.

## A bounce is a visit with one pageview and no interaction

The test is `pageviews <= 1 AND events = 0` on the visit. A second pageview or a custom
event ends the bounce. So do the tracker's `Outbound link`, `Download`, `Form sent`, and
`404`, even with `interactive: false`. Custom events sent with `interactive: false`
(`i: false`), `engagement` pings, and `Payment` or `Refund` don't. Under a `page` filter
and on a page row, bounce rate counts only the visits that entered on that page.

## Visit duration and time on page

Both are whole seconds.

- Visit duration (`visit_duration`) runs from a visit's first event to its latest pageview
  or custom event. Engagement pings don't lengthen it, so a one-page visit lasts `0`. It
  averages over every visit, bounces included.
- Time on page (`time_on_page`, page rows only) is engaged time: the page is shown and the
  window has focus. It averages over the visits that sent time for the page, and a visit
  that opens a page twice adds both views.

`m.js` sends engaged time when the page is hidden or the route changes, and skips under
one second unless clicks or Web Vitals have data to send. The Worker keeps at most 6 hours
per ping, and a page view takes at most 1,000 pings.

## Scroll depth is the deepest point of each visit

Scroll depth is always on. It is the scroll position plus the window height, as a whole
percent of the page height, from 0 to 100. A page that fits the window reports 100.
`scroll_depth` on a page row, and `average` in the **Scroll** report, average each visit's
deepest scroll. `reached` gives, for each depth 0, 10, and up to 100, the visits that got
that far and their `share` of the visits that sent a scroll depth.

## Breakdown rows

`GET /api/v1/stats/breakdown?property=<name>` returns one row per value with `key`,
`visitors`, `visits`, `pageviews`, `events`, `bounce_rate`, and `visit_duration`.

| Property | `visitors` | `visits` | `pageviews` | Extra fields |
| --- | --- | --- | --- | --- |
| Visit dimension, such as `source` | Distinct visitors of the visits that started in the period with this value | Visits with this value | Pageviews of those visits | `revenue`, `average_revenue` when a row has revenue |
| `entry_page` | The same, for visits that entered on the page | Visits that entered on the page | Pageviews of those visits | None |
| `exit_page` | The same, for visits that ended on the page | Visits that ended on the page | Pageviews of those visits | `exit_rate` |
| `page` | Distinct visitors with a pageview of the page | Visits that entered on the page | Pageviews of the page | `time_on_page`, `scroll_depth` |
| `event` | Distinct visitors who sent the event | `0` | `0` | `conversion_rate`, `revenue`, `average_revenue` |
| `prop:<key>`, `props` | Distinct visitors with an event that carries the value | `0` | Pageviews that carry the value | `conversion_rate`, `revenue`, `average_revenue` |
| `goal` | Distinct visitors who reached the goal | Visits that match the goal | Pageviews that match the goal | `kind`, `match`, `conversion_rate`, `revenue`, `average_revenue` |

`bounce_rate` and `visit_duration` follow the headline rules over the row's visits.

| Field | Definition |
| --- | --- |
| `exit_rate` | Visits that ended on the page, divided by the page's pageviews in the period, ignoring any `exit_page` filter. At most 100, 1 decimal. `null` when the page has no pageviews. |
| `conversion_rate` | The row's `visitors` divided by the period's visitors under every filter except `goal`, `event`, and `prop:`. Percent, 1 decimal. |
| `revenue` | Net revenue of the row's events, 2 decimals. A payment carries its visit's values, so a renewal counts toward its visit's source even when that source had no visit in the period. |
| `average_revenue` | `revenue` divided by the row's events with an amount above zero. |

- A row with no value has the key `(none)`, shown as **Direct / none** for `source` and
  `referrer`, **(not set)** for UTM dimensions, and **Unknown** elsewhere.
- Rows sort by `visitors`, then `pageviews`, then key. `limit` takes 1 to 200 rows, and
  `has_more` says whether another page exists.
- Each shard returns its top 500 values. If one hits that cap, the response has
  `truncated: true` and rare values may be missing. `search` runs on each shard, so it
  finds values outside the top 500.

## Goals count visitors who reached them

A goal is an event name or a page path. Its row counts the visitors who sent the event, or
who had a pageview or custom event on a matching page. For a page goal, `events` is the
number of matching pageviews and `revenue` is `0`. `goal==<name>` as a filter becomes the
goal's `event` or `page` filter. Goal rows read only collected events, but in a report
without filters the visitors that `conversion_rate` divides by include imported history.
[Conversion rate](conversions.md#conversion-rate) and
[Matching rules](conversions.md#matching-rules) have the details.

## Web Vitals

`GET /api/v1/stats/vitals` and **Speed** need the **Web Vitals** (`vitals`) feature
([Choose what to track](tracking.md#choose-what-to-track)).

| Vital | Measures | Good | Poor | `p75` bins |
| --- | --- | --- | --- | --- |
| Largest Contentful Paint (`lcp`) | Start time of the largest element painted | 2,500 ms or less | Over 4,000 ms | 50 ms, last bin 20,000 ms or more |
| Interaction to Next Paint (`inp`) | 98th percentile of the page's interactions of 16 ms or more | 200 ms or less | Over 500 ms | 8 ms, last bin 2,000 ms or more |
| Cumulative Layout Shift (`cls`) | Largest burst of shifts within 1 second of each other, up to 5 seconds long, not counting shifts right after input. Score, 3 decimals. | 0.1 or less | Over 0.25 | 0.005, last bin 10 |
| First Contentful Paint (`fcp`) | Time of the first paint of text or an image | 1,800 ms or less | Over 3,000 ms | 50 ms, last bin 20,000 ms or more |
| Time to First Byte (`ttfb`) | The navigation's `responseStart` | 800 ms or less | Over 1,800 ms | 25 ms, last bin 10,000 ms or more |

A value is `good` at or under the good limit, `poor` over the poor limit, and
`needs_improvement` in between. `samples` counts values. `p75` is the middle of the
histogram bin, summed over shards, where three quarters of the values are reached, or
`null` without samples. The dashboard rates each tile by its `p75`.

The tracker sends one set per page load with the first engagement ping, none on
single-page app route changes, and leaves out a vital the browser didn't measure. The
page load's pageview keeps the set, and a later ping that carries a vital replaces that
one. The Worker keeps times between 0 and 60,000 ms and CLS between 0 and 10.

## Channels

`classify` in [`packages/core/src/channel.ts`](../packages/core/src/channel.ts) gives each
visit one of 11 channels from its first event's referrer, UTM tags, and URL. The first
matching rule wins. A visit's known site is its referrer's, or else the one its
`utm_source` names, or else the ad network of its click ID (see
[Sources and referrers](#sources-and-referrers)).

| Order | Channel | Rule |
| --- | --- | --- |
| 1 | `AI Assistants` | The known site is an AI assistant, or `utm_source` contains `chatgpt`, `openai`, `perplexity`, `claude`, `gemini`, or `copilot`, in any case. |
| 2 | `Email` | `utm_medium` is `email` or `newsletter`, or the known site is webmail. |
| 3 | `Affiliates` | `utm_medium` is `affiliate`. |
| 4 | `Display` | `utm_medium` is `display`, `banner`, or `interstitial`. |
| 5 | `Paid Search` or `Organic Search` | The known site is a search engine, or `utm_medium` contains `search`. Paid with a paid signal. |
| 6 | `Paid Social` or `Organic Social` | The known site is a social site, or `utm_medium` is `social`, `sm`, `socialmedia`, `social-media`, `social_media`, `social media`, or the same forms with `network`, each optionally after `paid`, `paid-`, `paid_` or `paid ` (`paid_social`). Paid with a paid signal. |
| 7 | `Video` | The known site is a video site, or `utm_medium` is `video`. |
| 8 | `Paid Search` | A paid signal and no rule above matched. |
| 9 | `Referral` | The visit has a referrer host or a `utm_source`. |
| 10 | `Direct` | Nothing above matched. |

`utm_medium` is compared in lower case. A paid signal is an ad click ID in the page URL
(`gclid` from Google, `msclkid` from Bing, `twclid` from X), or a `utm_medium` of `cpc`, `ppc`, `paidsearch`, `paid_search`, `cpm`,
`cpv`, or `cpa`, or one that starts with `paid`.

## Sources and referrers

`referrer` is the host of `document.referrer` without a leading `www.`, then `m.`. Android
apps send `android-app://` and their package name instead, and the known ones become their
site's host: `com.twitter.android` is `x.com`, and likewise the Facebook, Instagram,
Threads, LinkedIn, Reddit, Pinterest, TikTok, Discord, Bluesky, YouTube, Gmail, Google,
Outlook and ChatGPT apps. An unknown app keeps its package name. The page's own host (without `www.`) counts as no referrer. Another subdomain of your site is a
referrer. misomoon also stores the referrer URL without its query string, with a part of its path
that looks like an email as `:email` and a part of 20 or more mixed letters and digits as
`:token`, as in `page`. No report breaks it down.

`source` is the first of these with a value: a known referrer host's name (table below),
the tidied `utm_source`, the ad network of a click ID, the referrer host, or `Direct`.
Tidying gives a `utm_source` that names a known site that site's name, and the site then
sets the channel too, so `x` and `twitter` become `X` in Organic Social. A `utm_source`
names a site when it equals the site's name, ignoring case and anything but letters and
digits (`hacker-news`), or its brand: the first part of a two-part host (`twitter`, `fb`,
`bsky`) or the last part of a pattern (`google`, `yahoo`). AI assistants match by name
only, so `meta` stays `Meta` and isn't Meta AI. Other values of 3 characters or fewer
become upper case, and longer ones get a capital first letter.

`utm_source` falls back to `ref`, then `source`. A known referrer wins over `utm_source`.
An unknown one loses to it but stays in `referrer`. A host without a trailing dot matches
itself and its subdomains. One with a trailing dot, such as `google.`, matches any host
that starts with it or contains it after a dot, such as `google.de`. Exact hosts win, so
`gemini.google.com` is Gemini and `mail.google.com` is Gmail.

| Kind | Source names and hosts |
| --- | --- |
| Search | Google (`google.`), Bing (`bing.com`), DuckDuckGo (`duckduckgo.com`), Yahoo (`search.yahoo.`), Yandex (`yandex.`), Baidu (`baidu.com`), Ecosia (`ecosia.org`), Brave Search (`search.brave.com`), Naver (`naver.com`), Kagi (`kagi.com`) |
| AI assistant | ChatGPT (`chatgpt.com`, `chat.openai.com`), Perplexity (`perplexity.ai`), Claude (`claude.ai`), Gemini (`gemini.google.com`), Copilot (`copilot.microsoft.com`), DeepSeek (`chat.deepseek.com`), You.com (`you.com`), Phind (`phind.com`), Meta AI (`meta.ai`), Grok (`grok.com`) |
| Social | X (`t.co`, `x.com`, `twitter.com`), Facebook (`facebook.com`, `fb.me`), Instagram (`instagram.com`), LinkedIn (`linkedin.com`, `lnkd.in`), Reddit (`reddit.com`), Threads (`threads.net`), Bluesky (`bsky.app`), Hacker News (`news.ycombinator.com`), Pinterest (`pinterest.`), TikTok (`tiktok.com`), Product Hunt (`producthunt.com`), Mastodon (`mastodon.`), Discord (`discord.com`), GitHub (`github.com`) |
| Video | YouTube (`youtube.com`, `youtu.be`), Vimeo (`vimeo.com`), Twitch (`twitch.tv`) |
| Webmail | Gmail (`mail.google.com`), Outlook (`outlook.live.com`), Yahoo Mail (`mail.yahoo.com`) |

## Dimensions

Breakdowns and filters take these 26 dimensions (`DIMENSIONS` in
[`packages/core/src/filters.ts`](../packages/core/src/filters.ts)), and
`GET /api/v1/meta/dimensions` returns them with their filter bar labels. A visit dimension
is stored on the visit and its events, and entry and exit only on the visit. A visit
matches an event filter when any of its events do, and an event matches an entry or exit
filter when its visit does.

| API name | Label | Scope | Meaning |
| --- | --- | --- | --- |
| `page` | Page | Event | The path, without the query string or a trailing slash (except `/`). A hash route (`#/pricing`, `#!/pricing`) is part of it. A part that looks like an email becomes `:email`, and a part of 20 or more mixed letters and digits becomes `:token`. Up to 500 characters. |
| `entry_page`, `exit_page` | Entry page, Exit page | Entry or exit | The path of the visit's first event, or of its latest pageview. |
| `hostname` | Hostname | Visit | The page's host without `www.`, always the site's domain or a subdomain. |
| `event` | Event | Event | `pageview`, `engagement`, a custom or built-in name, `Payment`, or `Refund`. The breakdown lists only custom, built-in, and payment events. |
| `source` | Source | Visit | See [Sources and referrers](#sources-and-referrers). |
| `referrer` | Referrer | Visit | The referrer host. |
| `channel` | Channel | Visit | One of the 11 [channels](#channels). |
| `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content` | UTM source, UTM medium, UTM campaign, UTM term, UTM content | Visit | The landing URL's parameter, up to 200 characters. `utm_source` falls back to `ref`, then `source`. |
| `country`, `continent` | Country, Continent | Visit | Two-letter codes from Cloudflare (ISO 3166-1 for countries). The dashboard shows country names. |
| `region`, `city` | Region, City | Visit | Names from Cloudflare. |
| `timezone` | Timezone | Visit | The visitor's IANA time zone from Cloudflare, not the site's. |
| `network` | Network | Visit | The AS organization that runs the visitor's network. |
| `browser` | Browser | Visit | Edge, Opera, Samsung Internet, Yandex, Vivaldi, Brave, DuckDuckGo, Arc, Facebook, Instagram, Line, Firefox, Chrome, Safari, or `Unknown`. For an SDK app, the app's name. |
| `browser_version` | Browser version | Visit | Browser and major version, such as `Chrome 141`. |
| `os` | OS | Visit | Windows, iOS, Android, ChromeOS, macOS, Linux, or `Unknown`. |
| `os_version` | OS version | Visit | OS and two version numbers, such as `iOS 17.4`. Windows NT 10.0 is `Windows 10/11`. |
| `device` | Device | Visit | `Desktop`, `Mobile`, or `Tablet`, from the user agent. |
| `screen` | Screen | Visit | Screen width: `Mobile` under 576 px, `Tablet` under 992, `Laptop` under 1,440, `Desktop` from 1,440. |
| `language` | Language | Visit | The first language tag from the SDK's beacon or, for `m.js`, the `Accept-Language` header, such as `en-US`. Up to 16 characters. |

These names work in some places only:

| Name | Where | Meaning |
| --- | --- | --- |
| `prop:<key>` | Breakdowns and filters | One custom property. A key is 1 to 64 letters, digits, `_`, `.`, or `-`. An event keeps up to 30 properties, and a text value keeps its first 300 characters. |
| `goal` | Breakdowns and filters | A breakdown lists every goal. A filter takes goal names. One filter can't mix page goals and event goals. |
| `props` | Breakdowns | Every custom property at once, as `key: value` rows. |
| `search_term` | Breakdowns | Google searches that led to the site. See [Search terms](#search-terms). |

A filter value of `(none)` matches a missing value. [Filters](api.md#filters) has the
operators and limits.

## Live

`GET /api/v1/stats/realtime` and **Live** ignore the period but apply filters. `visitors`,
`pageviews`, and the top 8 `pages`, `sources`, and `countries` by visitors cover the last
5 minutes. `minutes` has the pageviews and visitors of each minute of the last 30. `feed`
has the latest 40 events of the last 30 minutes, without engagement pings. Each window
runs one minute past now, so an event from a browser clock that runs a little fast still
shows.

## Funnels and paths

A funnel step counts the visitors who reached it. `conversion` is that count as a percent
of the first step's, to 1 decimal. `dropoff` is the previous step's visitors minus this
step's, never below 0. `entered` counts visitors with a pageview or custom event in the
period. A visitor id lasts one UTC day, so a visitor's steps must happen on one UTC day.
Paths count pageviews in visit order with reloads folded into one. A row's `share` is a
percent of the visitors who followed the path. See [Funnel modes](conversions.md#funnel-modes)
and [Paths](conversions.md#paths).

## Page interactions

`GET /api/v1/stats/behavior` sums the counts that engagement pings added to their
pageviews. Each ping carries the change since the last one, and a ping the queue delivers
twice adds once, so the sums are exact. Each report's `visitors` counts distinct visitors
per row.

| Report | Field | Definition |
| --- | --- | --- |
| `clicks` | `clicks`, `rage`, `dead`, `pageviews`, `visitors` | Clicks, rage clicks, and dead clicks per element and page, and the pageviews and visitors of the pages in scope |
| `scroll` | `visits`, `average`, `reached` | See [Scroll depth](#scroll-depth-is-the-deepest-point-of-each-visit) |
| `search` | `searches`, `visitors`, `total_visitors` | Pageviews with a site search term, visitors who searched, and every visitor in scope |
| `errors` | `count`, `last_seen` | Times an error happened, and the start of the latest page view where it did |
| `forms` | `starts`, `submissions`, `conversion` | Page views where someone started the form, submissions, and `submissions` as a percent of `starts`, at most 100 |
| `forms` | `interactions`, `dropoffs` | Per field, page views that focused it, and page views that left the form at it without a submit |
| `media` | `plays`, `reached` | Plays, and the percent of plays that reached 25%, 50%, 75%, and the end (95%) |
| `content` | `impressions`, `clicks`, `ctr` | Times tagged content was seen and clicked, and clicks as a percent of impressions, at most 100 |

[See what people do on a page](tracking.md#see-what-people-do-on-a-page) lists what the
tracker collects.

## Search terms

`search_term` asks Google Search Console live and caches for ten minutes. It covers the
days Google has processed, usually up to two or three days ago. A row has `clicks` (which
`visitors` repeats), `impressions`, `ctr` as a percent, and the average `position` (`1` is
the top), with 1 decimal. Only page and device filters apply. `source==Google` and
`channel==Organic Search` change nothing, and any other filter returns `400`.

## Periods follow the site's time zone

Each site has an IANA time zone (UTC if unknown). A day starts at local midnight, also
across daylight saving changes ([`packages/core/src/time.ts`](../packages/core/src/time.ts)).

| `period` | Window | Default interval |
| --- | --- | --- |
| `realtime` | The last 30 minutes | `minute` |
| `today`, `yesterday` | Local midnight until now, or the whole local day before | `hour` |
| `24h` | The last 24 hours | `hour` |
| `7d`, `28d`, `90d` | Today and the 6, 27, or 89 local days before it | `day` |
| `30d` | Today and the 29 local days before it. The default. | `day` |
| `mtd`, `lastmonth` | The first of this month until now, or the whole of last month | `day` |
| `ytd` | January 1 until now | `week` |
| `6mo`, `12mo` | This month and the 5 or 11 months before it | `month` |
| `all` | Local midnight of the site's first visit, or of the day the site was added if earlier, until now | By length |
| `custom` | `from` to `to`, whole local days, at most 400 days | By length |

A period that ends now, or a `custom` one whose `to` is today, runs one minute past now.
By length, the interval is `minute` up to 2 hours, `hour` up to 3 days, `day` up to 120
days, `week` up to 400 days, and `month` beyond. `interval` overrides it. Minute buckets
start on UTC minutes, the others at local hours, local midnight, Monday, or the first of the
month. A series over 1,500 buckets returns `400`. Empty buckets come back as zeros.

## Imported history joins unfiltered reports

History from Google or CSV ([Bring your history](import.md)) is stored as daily totals
per dimension and value ([`packages/core/src/imported.ts`](../packages/core/src/imported.ts)).
misomoon adds it to headline metrics, the time series, and breakdowns of the dimensions
below, only without filters. `imported=0` leaves it out. A day lands at its local midnight
bucket. Imported visitors are daily uniques, so they add up like misomoon's own. Goal rows,
revenue, Web Vitals, Live, funnels, paths, and page interactions don't use it, but goal
`conversion_rate` divides by visitors that include it.

| Dimension | From a CSV export | From Google |
| --- | --- | --- |
| `channel` | From the source and UTM tags by the [channel rules](#channels) | Google's channel group. Organic Video and Paid Video become `Video`, Organic Shopping `Referral`, and Paid Shopping `Paid Search`. Other groups go through the channel rules. |
| `source`, `entry_page`, `country`, `region`, `browser`, `os`, `os_version`, `device` | Yes | Yes |
| `referrer` | When the row has a referrer | When the source contains a dot |
| `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term` | When set | Session source, medium, campaign, ad content, and ad keyword |
| `page` | With time on page and scroll depth | With time on page, no scroll depth |
| `exit_page`, `browser_version` | Yes | No |
| `city` | No | Yes |
| `event` | Yes | Yes, without `page_view`, `session_start`, `first_visit`, `user_engagement`, and `scroll` |

From Google, visitors are total users, visits are sessions, pageviews are views, events
are the event count, and bounces are sessions minus engaged sessions. Visit duration is
user engagement duration, and time on page is a page's engagement duration per session.

## What misomoon drops

These events never reach a report:

| What | Rule | Where |
| --- | --- | --- |
| Your own visits, automated browsers, the overlay tab | A `misomoon_ignore` key in local storage ([Exclude yourself](tracking.md#exclude-yourself)), `navigator.webdriver` set to true, or a page opened with `#misomoon-overlay`. | `m.js` |
| Cloudflare bots | Cloudflare marks the request as a verified bot, or its bot score, when it has one, is below 10. | Worker |
| Bot user agents | The user agent is missing, under 20 characters, or matches `BOT_UA` in [`packages/core/src/ua.ts`](../packages/core/src/ua.ts), which covers crawlers, link previews, headless browsers, speed tools, uptime monitors, and HTTP libraries, among others. | Worker |
| Bad beacons | The body is over 16 KB or isn't JSON. The site id or URL is missing, or the URL isn't `http` or `https`. The event name is empty, over 120 characters, or holds a control character, `;`, or `\|`. | Worker |
| Foreign pages | The site doesn't exist, or the page's host isn't the site's domain or a subdomain. | Worker |
| Excluded paths | A pageview or engagement ping on a page the site's path rules leave out. Custom events there still count. See [Choose what to track](tracking.md#choose-what-to-track). | Worker |
| Events past the daily cap | Events after the site's cap for the UTC day. See [Daily ingest cap](configuration.md#daily-ingest-cap). | Worker and queue consumer |
| Late engagement pings | A ping more than 30 minutes after its visit's last activity. | Queue consumer |
| Engagement pings without a pageview | A ping without a view key, or whose pageview isn't stored: the cap or a path rule dropped it, the site moved to another shard at 00:00 UTC since, or its pageview is still waiting in the queue for a retry. | Queue consumer |
| Repeats | An event whose `id` is already stored. | Queue consumer |

An event whose clock is more than 5 minutes off the server's takes the server's time.
[Why are my numbers lower than in Google Analytics?](faq.md#why-are-my-numbers-lower-than-in-google-analytics)
lists other reasons.
