# misomoon analytics — architecture

Privacy-first web analytics built entirely on Cloudflare: Workers for compute, D1 for
storage, Queues for buffered ingest, static assets for the dashboard.
`dupuu-api/services/analytics` was the reference for metric
definitions (visits, bounce, funnels, goals); nothing is shared with it at runtime.

```
                       ┌──────────────────────────── apps/api (Worker) ───────────────────────────┐
 site ──m.js──▶ POST /api/event ─▶ enrich (cf geo, UA, bot, salt hash) ─▶ Queue ─▶ consumer ─┐   │
                       │                                   (no queue bound → write inline)     │   │
                       │                                                                       ▼   │
                       │   CONTROL D1  sites · shard_map · shards · api_keys · goals · salts   SHARD_0..N D1
                       │                                                                    events · sessions
 dashboard ─▶ /api/v1/stats/*  ─┐                                                                   ▲
 MCP client ─▶ /mcp           ─┴─▶ query planner ─▶ fan out to shard ranges ─▶ merge ─────────────┘
                       └──────────────────────────────────────────────────────────────────────────┘
 apps/landing  SvelteKit SSR on Workers (marketing site, live demo link)
 apps/dashboard  Svelte 5 SPA, built with Vite+ (`vp dev`), served from the api Worker's assets
```

## Packages

| Path | What it is |
| --- | --- |
| `packages/core` | Pure TypeScript shared by every runtime: event schema, UA parsing, channel classification, filter grammar, SQL builders, shard planning and result merging. Unit tested against `node:sqlite`. |
| `packages/tracker` | `m.js`, the core tracker, under 1 KB gzipped, and the feature parts in `src/x/` that the Worker adds to it per site. No cookies; it only reads the `misomoon_ignore` key from localStorage. `overlay.js` draws clicks and scroll on a page the dashboard opens. |
| `packages/sdk` | `@misomoon/sdk`, published to npm: `m.js` for bundled browser apps and React, and a client for React Native and servers. |
| `packages/brand` | Design tokens (`tokens.css`), logo, fonts. Used by landing and dashboard. |
| `apps/api` | The single Worker: ingest, queue consumer, stats API, MCP server, dashboard assets. |
| `apps/dashboard` | Svelte 5 SPA. |
| `apps/landing` | SvelteKit with `adapter-cloudflare`. |

## Sharding

D1 databases cap out (10 GB each) and a single database serialises writes, so event
data never lives in one database.

* **Control database** (`CONTROL`) holds small, hot, relational data: sites, keys,
  goals, funnels, daily salts, the shard registry and the routing table.
* **Shard databases** (`SHARD_0` … `SHARD_n`) hold `events`, `sessions` and
  `imported`. Their count is one number: `SHARD_COUNT=<n> pnpm run deploy`
  (`apps/api/scripts/deploy.ts`). Growing creates the missing D1 databases, binds them
  in `wrangler.jsonc`, migrates every database and deploys; a bound shard registers
  itself in `shards` once its schema is there, and never before. Shrinking marks the
  extra shards `retiring`. Every five minutes the Worker closes their sites' open
  ranges onto other shards, then copies each closed range (settled for two days) to
  another shard, switches `shard_map`, and deletes the old copy two cache lifetimes
  later (`src/moves.ts`, progress in `shard_moves`, resumable). Running the same deploy
  again unbinds each retiring shard once it holds nothing. Databases are never deleted
  by the script. Without `SHARD_COUNT` the deploy keeps the current count.
* **Data regions.** A shard's binding names its region: `SHARD_EU_n`, `SHARD_US_n`,
  `SHARD_APAC_n`, or `SHARD_n` for none (`shardRegion` in `packages/core/src/shard.ts`).
  `SHARD_REGIONS=eu:2,us:1` sizes each region at deploy (`scripts/shards.ts` plans it),
  creating EU and US shards in that D1 jurisdiction and Asia-Pacific ones with the
  `apac` location hint, which D1 doesn't guarantee. `sites.region` is set when a site
  is added, guessed from its timezone, and never changes. Placement, draining, and
  retiring only pick shards of the site's region (`siteShards` in `src/control.ts`);
  with none free the site stays put. A site without a region may use any shard. The
  control database is one database for every region.
* **What is config and what is data.** Workers can't bind a D1 database at runtime, so
  the shard list is deploy-time config. Everything that changes at runtime is a row in
  `shards`: `weight`, `status` (`active`, `draining`, `readonly`, `retiring`) and
  `size_bytes`, so draining a shard or pinning a tenant needs no deploy. Two vars tune
  it: `SHARD_SOFT_LIMIT_MB` (when a shard drains, default 8000 of D1's 10 GB) and the
  retention pair `RETENTION_DAYS` and `RETENTION_DEFAULT_DAYS`.
* **Routing is per site *and* per time range.** `shard_map(site_id, from_day, to_day,
  shard)` is a directory: it says where a site's data for a span of UTC days lives. A
  new site is placed by weighted rendezvous hashing, where each shard's weight is
  scaled by its free space (`shards.size_bytes`, refreshed hourly), so a fresh shard
  takes most new sites and a full one takes none. When a shard grows past its soft
  limit (`SHARD_SOFT_LIMIT_MB`) it is marked `draining`; the next write for each of
  its sites closes the open range at the end of today (tomorrow when today ends
  within two cache lifetimes, so no isolate still routes by a stale map) and opens a
  range on another shard. A day never straddles two shards, and old data only
  moves when a shard is retired. The close and the open are one conditional batch,
  so racing isolates can't open two ranges.
* **Reads fan out.** The planner intersects the query window with the site's ranges,
  clamps each sub-query to its range, runs them in parallel and merges. Ranges always
  split on UTC day boundaries, and visitor ids rotate daily (see below), so unique
  visitor counts from disjoint ranges add up exactly. Ratios (bounce rate, duration,
  views per visit) are merged from their numerators and denominators, never averaged.
  Reads go through a D1 session (`withSession`), so once read replication is enabled
  on a shard, dashboard scans run on replicas instead of queueing behind ingest on the
  single-threaded primary.
* **Deletes are chunked** (`purge` in `control.ts`, 5,000 rows a statement): a single
  huge DELETE would pass D1's 30 s limit and stall every write to the shard.
* **Every index costs a write.** D1 bills each index entry that a write changes as one
  more row written, and a row written costs as much as 1,000 rows read. So the shard
  tables (`apps/api/migrations/shard/`) keep only the indexes a query needs. `events` has
  two: `events_event_id`, which is unique so a replayed event inserts nothing, and
  `events_site_ts`, which every report, retention purge and shard move reads. A goal or
  page filter reads every event of the window through `events_site_ts`, as the unfiltered
  report beside it does. Indexes on event name and path read fewer rows for those filters,
  but they added two written rows to every event, and most dashboard views have no filter.
  `sessions` has `sessions_site_started` for reports, and `sessions_site_visitor` and
  `sessions_site_next_visitor` to find a visitor's open visit. Those two leave out
  `last_at`, which every event moves, so updating a visit changes no index entry.
  Writing an event costs 3 rows (the row and two index entries), opening a visit 3, and
  updating a visit 1. `packages/core/test/indexes.test.ts` fails when an index on
  `events` or `sessions` isn't in its list.
* **One lookup names its index.** Nothing runs `ANALYZE` or `PRAGMA optimize` on a
  shard, so SQLite plans from the schema alone, and a plan doesn't change as the data
  grows. Without statistics, SQLite plans `visitor_id IN` with two or more ids as a search
  of the primary key on `site_id`, which reads every visit of the site. So
  `openSessionsStmt` names both visitor indexes with `INDEXED BY`, and the statement fails
  instead of scanning if an index is missing. Each other statement has one index that
  fits its `WHERE` clause.
* **A deleted site keeps nothing.** `deleteSite` (`sites.ts`) purges the site's shards,
  removes its `CONTROL` rows, then purges every shard once more. Other isolates can hold
  the site in their cache for a minute and keep accepting its beacons, so the queue
  consumer reads `sites` before it writes and drops a deleted site's events. It checks
  again after each write and purges what landed after the delete. A site added again for
  the same domain starts empty.
* **Large tenants** can be pinned to a dedicated shard by writing their `shard_map`
  row by hand; nothing else changes. One D1 database is single-threaded, so a site
  that outgrows a whole shard's write rate would need its days split further by
  `visitor_id` hash. That stays additive (a visitor and their sessions live on one
  shard) but is not built yet.

Next steps when volume demands it: hourly rollup tables per shard written by a cron
trigger (queries over long ranges then read rollups plus today's raw rows), D1 read
replication with the Sessions API for dashboard reads, and an R2 archive for raw
events past the retention window.

## Ingest

1. `m.js` sends `pageview`, `engagement` (on hide: engaged time, max scroll depth,
   Core Web Vitals), and custom events with `navigator.sendBeacon`. Each page view gets
   a random view key (`y`), which its pageview and all its beacons carry.
2. The Worker drops bots (Cloudflare bot signals, UA patterns, headless hints),
   resolves geo from `request.cf` (country, region, city, continent, timezone, ASN
   organisation), parses the UA, classifies the channel, and computes
   `visitor_id = sha256(daily_salt ‖ site ‖ ip ‖ ua)[0..16]`. The IP is never stored.
   Salts are random per UTC day and deleted after two days, so ids cannot be linked
   across days, except through a visit that was open at 00:00 UTC (step 4). The salt rotates at 00:00 UTC, not at the site's local midnight, so a
   unique count over a local day that spans 00:00 UTC can count one person twice.
   Behind a first-party proxy the connection belongs to the proxy, so the IP and geo
   come from forwarded headers instead (`edgeFromRequest` in `core/src/proxy.ts`,
   see [Serve the tracker from your own domain](PROXY.md)).
3. With a Queue bound, the event is enqueued and the response is `202` immediately;
   the consumer batches by shard. Without one (local dev), or when the send fails, it
   is written inline in `ctx.waitUntil`.
4. Sessions: an event joins the visitor's session when the session's last activity is
   within 30 minutes; otherwise it opens a new one. `sessions` is upserted on every
   pageview and custom event, which makes bounce, duration, entry and exit pages
   single-table reads. An engagement beacon only keeps its visit open and adds its time.
   A visit open at 00:00 UTC stays one visit: in the first 30 minutes of a UTC day the
   Worker also computes the visitor's id under yesterday's salt, and the event joins an
   open session under either id, as long as yesterday wrote to the same shard (when the
   site moved shards at midnight, the visit splits). The continued session records the
   new id in `next_visitor_id`, so it keeps matching after that half hour. Each event
   keeps its own day's id, and only visits that were active across midnight link the
   two days' ids, through their shared session.
5. Every stored event has a unique `event_id` (index `events_event_id`). A pageview's
   is `<site>:<view key>` (`viewEventId` in `packages/core/src/ingest.ts`); any other
   event gets a random one. Events are written with `INSERT OR IGNORE` and the session
   upsert only runs when that insert added a row (`WHERE changes() > 0`), so a queue
   retry after a partial write stores nothing twice and counts nothing twice. The SDK
   picks the id on the client (`id` in the payload), so its resend after a lost
   response is deduplicated the same way. `m.js` sends no id: `sendBeacon` never resends.
6. An engagement beacon is never a row. `pingStmts` adds it to the row of the pageview
   its view key names, with one update that touches no indexed column (one written
   row), and one update of the visit (`last_at`, `engaged_ms`). The pageview's row adds
   the engaged time, keeps the deepest scroll depth and the latest Web Vitals, appends
   the beacon's interaction lists to `detail`, and appends the beacon's mark to `pings`:
   a 7-character hash of its event id and a space. Both updates skip a pageview whose
   `pings` holds the mark, so a queue retry after a partial write adds nothing twice.
   Time and lists add up and scroll depth is a maximum, so the beacons of one view may
   arrive in any order. A page view takes at most 1,000 beacons. Once its `detail` holds
   128 KiB, a beacon still adds its time, scroll depth and Web Vitals, but not its lists.
   The updates run after the batch's inserts, so a pageview in the same batch is there
   for them. A beacon is dropped when it has no view key, when its visit has timed out,
   or when its pageview isn't on the shard: the cap dropped the pageview, the site moved shards at 00:00 UTC
   since the view, or the pageview is in a queue batch that is still waiting for a
   retry. Sending the beacon on to another shard would cost a lookup across shards for
   every beacon, to save the time of views that weren't counted, or of the few behind a
   failed batch. A beacon after 00:00 UTC on the same shard adds to yesterday's pageview
   row, so the time counts on the day of its view, and teaches the visit the new
   visitor id like any event.
7. Revenue is kept with its ISO 4217 currency. Each site has one reporting currency
   (`sites.currency`, USD by default); revenue totals count events in that currency
   and events sent without one, never a sum across currencies.

### Ingest cap

Each site may store at most its daily cap of events per UTC day (`sites.ingest_cap`, else
`INGEST_DAILY_CAP`; none when both are unset, and `0` blocks the site). The code is in
`apps/api/src/usage.ts`. The cap counts stored rows, because the cost is D1 writes. A
pageview or custom event writes 3 rows (the row and its two indexes), a new visit 3 more
and a continued one 1, and each engagement beacon 2 (its pageview's row and the visit),
though it stores no row and takes no room. On 7 days of sample traffic that comes to 6.4
rows written per pageview or custom event, against 1 more per site per batch for the
count.

* **Counting.** After each shard batch, `writeEvents` reads `meta.changes` of every event
  insert and adds the new rows to CONTROL `usage_daily(site_id, day)`. A replayed queue
  batch inserts nothing, so it counts nothing. `events` holds pageviews and custom events,
  which is what a plan counts; `stored` adds the ref-only beacons of sites that take
  payments. A failed count is tried once
  more and then logged as `usage count failed`, without failing the batch: a retry would
  find the events stored already and count nothing.
* **Enforcing.** `writeEvents` reads each site's cap. For each shard group, `Budget.plan`
  runs `assignSessions` on copies first, to see which rows the shard would store. An
  engagement beacon stores no row, and an event the shard holds already (a retried
  batch) is stored once, so neither takes room. Room for the rest is taken in
  one statement per site and day: an upsert adds what fits under the cap to `stored` and
  returns it as `last_grant`. Every `SET` reads the row as it was, so two consumers can't
  both take the last of it. The earliest rows that fit are kept, and the sessions are
  built again without the dropped ones, so a dropped pageview's beacons have nothing to
  add to. Once the group is written, its count adds what the
  shard inserted less the room taken, which gives back what went unused, also when the
  shard write fails. A consumer that fails before that leaves `stored` too high, so the
  day stores less than its cap, never more. Payments come through `revenue.ts` and are
  never capped.
* **The edge.** `acceptBeacon` drops a beacon once the day's count, read through the
  isolate cache (60 seconds), reaches the cap. A flood then stops costing queue
  operations within a minute. It drops engagement beacons too, so the views stored
  before the day filled get no more time after that. Sites without a cap skip the read.
* **Payment refs.** A ref-only beacon (an engagement beacon that only hands out payment
  refs) is dropped at the edge for a site that takes no payments. For a site that
  takes payments, its refs count as one stored row, marked by event id in `usage_refs`, so
  a queue retry counts it once. It takes room when there is some, and is kept when there
  is none, so the payment keeps its visit. Only these beacons, queued before the edge saw
  the day full, take a day past its cap.
* **Telling people.** The first drop of a site's day sets `capped_at` and emails the team's
  owners and admins once. A block sends nothing. Rows older than 400 days are deleted.
  Maintenance also deletes `usage_refs` rows older than 2 days.

With `PLANS=on`, the edge also checks the team, per UTC calendar month
(`apps/api/src/plans.ts`):

* **The edge.** `acceptBeacon` calls `planStops` before the daily cap. It drops the beacon
  when the site's team has lapsed, or when the team's events this month reached `OVERAGE`
  (1.25) of its plan's `events`. The team's plan, `trial_ends_at`, and month total come
  from one query, cached in the isolate for 60 seconds under a key per team and month: a
  cache hit reads nothing, and a miss reads `teams` by its key, the team's sites through
  `sites_team`, and at most a month of their `usage_daily` rows through its `(site_id,
  day)` key. No index was added for it. A new month is a new key, so its count starts at
  00:00 UTC on the 1st; a plan change reaches the edge within a minute. A server without
  `PLANS=on` skips the check.
* **The count.** It is `usage_daily.events`, which the cap's counting already writes. The
  month adds up the sites the team has now, so a site moved mid-month takes its month's
  events to the receiving team. The consumer drops nothing for the month: events queued
  before the edge saw the stop are stored, so a month can end a little past 125%.
* **Telling people.** After each queue batch, `checkMonths` reads the month of each team
  the batch counted events for, fresh, and compares it with `eventLevels`: 80% and 100%
  (`EVENT_WARNINGS`), and 125%. A new level is a row in CONTROL `plan_notices`, keyed by
  team, month, plan, and level, and written with `INSERT OR IGNORE`, so two consumers send
  it once; only the highest new level is emailed, to owners, admins, and billing members.
  The highest level sent is cached for a minute, so a month past a level writes nothing
  per batch. A lapsed team gets no email. The daily cleanup deletes rows older than 3
  months.

Payments never pass the edge: `revenue.ts` takes them from webhooks and writes them to the
shard whatever the team's state, and they don't count toward the month.

The alternatives cost more per beacon. A Durable Object per site counts exactly but adds a
billed call and a round trip to every beacon. The rate-limiting binding takes its limit
from `wrangler.jsonc`, so it can't hold a limit per site. KV charges $5 per million
writes.

### Payments

Payment webhooks (`POST /api/webhooks/:provider/:site`, `apps/api/src/revenue.ts`) become
`Payment` and `Refund` events on the site's shard. Parsing and signature checks live in
`packages/core/src/payments.ts`. A payment finds its visit through keys, strongest first:
a ref from `misomoon.ref()` or a tagged payment link, a checkout id that the server read
from the success page's URL, then `provider:kind:id` links (subscription, customer, order) that
an earlier payment of the same buyer taught. Tracker keys must match `REF_PATTERN`, which
has no colon, so a beacon can't forge a link.

The visit's columns are kept in CONTROL `attribution` (30 days for tracker keys, 400 for
links), so the lookup reads no shard. When two visits claim a key, the earlier one keeps
it. A payment with no visit is written unattributed, and its keys go to `payment_keys`. A
payment credited through a weaker key keeps its stronger keys there. When one of those
keys arrives, or the key that credited a payment leads to another visit, `settle()`
updates the event row in place, re-points the links the payment taught
(`attribution.source`), and settles the payments credited through them, such as its
refunds. It goes on only while a payment's visit actually changes, claims a key again
only when the key leads to a new visit, and writes the payment's own row
(`attributed_by`, `visit`) last, so a queue or webhook retry redoes a pass that failed
part way. One pass moves at most 200 payments. Past that it throws, and the retry carries
on from the moves already written. Final attribution doesn't depend on the order in which
webhooks and beacons arrive. A payment's event id is `$provider:site:id`, because one
provider account can feed two sites on one shard. `visitor_id` and `session_id` are copied only when the visit
is on the payment's UTC day; otherwise the row has `visitor_id ''`, which every unique
count skips with `NULLIF`. Breakdowns by a session dimension read revenue from events
directly, so a renewal still counts toward its source when the source had no visit in
the range.

## Data captured beyond page views

Engaged time (while the page is shown and has focus), max scroll depth, LCP / INP / CLS / FCP / TTFB,
browser and OS versions, viewport and screen class, language, timezone, continent,
ASN organisation, outbound link clicks, file downloads, form submits, revenue,
and arbitrary custom properties. Everything is opt-out per site in tracker options.

### Page interactions

The engagement beacon also carries what happened on the page since the page view's last beacon:
clicks per element (with rage and dead clicks), JavaScript errors, the form fields a visit
used and the one it would leave at, media plays and milestones, and impressions and clicks
of tagged content. The server reads a pageview's site search term from its URL
(`searchTermFromUrl` in `packages/core/src/features.ts`), so the tracker sends none. `eventDetail` in
`packages/core/src/ingest.ts` cleans and caps these lists, and the beacon appends them to
its pageview's row, as JSON in the nullable `events.detail` column (shard migration
`0001_events.sql`). That JSON also holds the pageview's own search term.

Every number on the beacon is a delta, so the beacons of one page view add up. A form
field's `dropped` flag is +1 while the field is where the visit would leave the form and -1
once it isn't, so a visit that moves on cancels its earlier drop. The reports in
`packages/core/src/queries.ts` (`clickMap`, `scrollMap`, `siteSearch`, `errorReport`,
`formReport`, `mediaReport`, `contentReport`) sum the lists with `json_each` on each shard
and merge the shards in TypeScript. Visitor counts per row are distinct per shard and add
across shards, like every other unique count. No new table, so moves and purges cover
`detail` as they cover the rest of the row.

### The tracker and its features

`m.js` holds only pageviews (with history and hash routing), engaged time, scroll depth,
script-wide props, the queue and the public API, and stays under 1 KB gzipped; a test in
`packages/tracker/test/m.test.ts` fails the build at 1,000 bytes. Everything else is a
feature a site ticks in its settings: outbound links, downloads, form submits, tagged
events, payments, Web Vitals, clicks, errors, form fields, media, content, and site
search. The control database stores them in `sites.features`, with `search_params`,
`include_paths` and `exclude_paths` beside them (control migration `0002_sites.sql`).
`NULL` features means the default:
every feature. `LIGHT_FEATURES` is the Light preset the dashboard offers.

The script tag loads `m.js?s=<site>`. The Worker answers with `m.js` followed by the parts
the site ticked (`browserParts` in `packages/core/src/features.ts`), read from
`packages/tracker/dist/parts.min.js`: one minified source per file in
`packages/tracker/src/x/`. Browsers cache it for five minutes. Each part registers through
`misomoon.x(fn)` and hooks the engagement beacon and soft navigations, so `m.js` doesn't
know which parts exist; a browser the tracker doesn't count runs none of them.

The server does what the tracker would otherwise carry code for. `acceptBeacon` in
`apps/api/src/ingest.ts` reads the site search term and a success page's checkout ids
from the page URL, and drops the views and time of pages the path rules leave out.
`buildEvent` names the tracker's unnamed beacons (an engagement carries `e`, a pageview
`w`), takes the language from `Accept-Language`, rounds and caps the scroll depth, and
reads revenue as `{ amount, currency }` or `{ a, c }`.

The overlay never carries a token. The dashboard opens the page with `#misomoon-overlay`;
`m.js` then tracks nothing and loads `overlay.js` from next to its own URL, never from a URL
in the page. `overlay.js` asks `window.opener` for the data by `postMessage`, and the
dashboard answers only the window it opened, and only when the message's origin is on the
site's domain.

## Query surface

The dashboard, the Stats API and the MCP tools (`apps/api/src/tools.ts`) all call the
same query functions in `apps/api/src/stats.ts`, so an answer in an MCP client matches
the dashboard number.

* `GET /api/v1/stats/{aggregate,timeseries,breakdown,realtime,vitals,funnel}`.
  With `compare`, `change` is the percent change per metric, except `bounce_rate`,
  which changes in percentage points.
* `GET /api/v1/stats/export`: a zip of CSVs (one per report).
* `GET|POST /api/v1/sites`, `GET|POST|DELETE /api/v1/sites/:id/goals`, `.../segments` (saved filters),
  `GET|POST /api/v1/sites/:id/funnels`, `PUT|DELETE /api/v1/sites/:id/funnels/:funnel`,
  `GET|POST /api/v1/keys`, `DELETE /api/v1/keys/:id`
* `GET /api/v1/stats/journeys?path=/,/pricing&direction=forward|backward`: the next (or
  previous) page after a path, with `(exit)` and `(entrance)` for visit ends. Reloads fold.
* `POST /api/v2/query`: Stats API v2 (metrics, dimensions, filters,
  date_range, order_by, pagination).
* `.../imports` (CSV upload, Google OAuth import), `.../shared` (shared links),
  `.../reports` (email reports and alerts), `.../annotations` (chart notes; any
  non-shared API key may post, so CI can mark deploys).
* Stats endpoints are rate limited per API key, or per IP without one (`STATS_LIMIT`).

### Imported history

CSV exports and Google reports land in each shard's `imported` table, one row per
local day, dimension and key. Rows route to shards by
day like events, so the window fan-out stays the same. They are added only to unfiltered
reports (filters can't be applied to pre-aggregated rows) and `imported=0` hides them.

### Google Search Console

Editors connect a Search Console property per site through Google OAuth (the same client
as the Google import, `apps/api/src/google.ts`). The `search_term` breakdown, the dashboard's
Sources → Search terms tab and the MCP `get_search_terms` tool read Google live
(searchAnalytics.query, cached ten minutes): clicks, impressions, CTR and position. Only
page and device filters can be passed to Google; source==Google is implied, and other
filters are refused rather than silently ignored.

### Shared links, reports, alerts

A shared link trades its slug (and password, PBKDF2-hashed) for a 7-day HMAC token. The
token reads one site, with the link's segment forced on every query; settings are off. The cron runs every 5 minutes: spike alerts and the sample site's traffic (`fillSample` in `sample.ts`, generated by `sampleTraffic` in core, a day at a time with fixed event ids so a rerun stores nothing twice) every run; weekly and monthly
reports and drop alerts at minute 15, through the email provider (`sendEmail` in `reports.ts`:
Cloudflare Email Service or Amazon SES). With the `BROWSER` binding, `reportPdf`
prints each edition once per run through a Browser Run quick action (`printReport` in
`packages/core/src/report.ts` lays the sheets out as pages) and attaches it; a failed print
sends the email without it.

Metric definitions: visit duration runs from the first to the
last pageview or custom event (engagement pings don't stretch it), a custom event sent
with `interactive: false` doesn't end a bounce, bounce rate under a page filter counts
visits that entered on that page, time on page is engaged time per visit, scroll depth
averages each visit's deepest scroll, exit rate is exits over the page's pageviews, and
funnels count each day's visitor (sequential, strict or flexible).
* `POST /mcp` — stateless MCP (Streamable HTTP, JSON responses), bearer API key.

Filters use one grammar everywhere: `country==US;page~/blog;browser!=Safari`. The
operator is the first one in the text, so values may contain `==`; they cannot contain
`;` or `|`. At most 8 filters, 6 values each, 16 values in total.

Periods are resolved in the site's IANA timezone, per instant: day, week and month
buckets start at local midnight even across a DST change (`time.ts`, `offsetSegments`).
A series has at most 1500 buckets; asking for more is a 400 that names a coarser
interval.

## Auth and team roles

People sign in with email and password (PBKDF2). A session is a random `ms_` token
stored hashed in `sessions`; an unlocked shared link gets an `sh_` token in the same
table, so deleting the link ends every session for it. API keys (`mm_`) belong to a user,
can be limited to one site, and act with that user's role, so a key loses access when its
owner does.

Teams own sites. Each member holds one role on every site of the team:

| Role | Can |
|---|---|
| owner | everything: team settings, moving sites between teams, other owners |
| admin | people (except owners), adding and deleting sites, all settings |
| editor | goals, funnels, segments, imports, shared links, reports, annotations, proxy, adding sites |
| viewer | stats, personal segments |
| billing | no stats. It grants the `billing` permission: on misomoon Cloud, the team's plan, its checkout, its switch, and Polar's billing portal |

Guests are invited to one site as editor or viewer. The rules live in
`packages/core/src/roles.ts`; `authorize(env, who, site, permission)` in
`apps/api/src/auth.ts` is the only gate, used by the REST API, Stats API v2 and MCP
alike. Public sites (the demo) are readable signed out. A team always keeps an
owner. Invitations are `mi_` links, emailed when an email provider is set up and returned
to the inviter either way; `SIGNUPS=invite` closes open sign-up.

Plans belong to teams. `teams.plan` holds a plan id from `packages/core/src/plans.ts`, or
NULL for none. Polar's subscription webhooks set it, and support sets it by hand for a team
without a subscription. Only `PLANS=on` reads it; misomoon Cloud
sets that, and the deploy bundle leaves it out. `apps/api/src/plans.ts` resolves a team's
plan. The site limit is a condition inside the `INSERT` of `createSite` and the `UPDATE`
of a site transfer, so two requests at once can't both pass it, and only the team's own
sites count. Retention under a plan is `planRetention` in core: the longest is the smaller
of `RETENTION_DAYS` and the plan's, and the default the smaller of `RETENTION_DEFAULT_DAYS`
and that. The PATCH route, `/me`, and the daily cleanup all use it. A team moved to a
smaller plan keeps its sites and saved settings; the cleanup applies the plan's limit.

Billing is `apps/api/src/billing.ts`, apart from the customers' revenue webhooks. A team
pays through Polar, the merchant of record: `POST /api/v1/teams/:team/checkout` creates a
checkout with the team id in its metadata, or switches the subscription the team already
pays for, so a team never holds two. Polar's webhooks carry the whole subscription.
`polar_subscriptions` keeps each one in its newest state by Polar's `modified_at`, and a
single batch writes that row and sets the team's plan columns from its newest live
subscription, so a late or concurrent webhook can't move a team back. `polar_webhooks`
drops a second delivery of a `webhook-id`. A team that never had a subscription keeps the
plan support set ([Pay for misomoon Cloud](billing.md)).

The free trial belongs to a person, and runs on a team. `createTeam` sets
`users.trial_started_at` with `WHERE trial_started_at IS NULL`, and in the same batch
inserts the team with `trial_ends_at` 7 days on when that update changed the row, else
equal to `created_at`. Two teams made at once can't both get the trial, and every path
that makes a team goes through it: sign-up, `POST /api/v1/teams`, and the `My sites` team
of `POST /api/v1/sites`. `planState` in core gives a team's state: `plan`, `trial` while
`trial_ends_at` is ahead, or `lapsed`. A NULL `trial_ends_at` is no trial, so a team row
made some other way never gets one by accident. A lapsed team keeps everything it has, and
works under the trial plan's limits for retention. `createSite` and the site transfer
refuse it with `plan_required`, and the edge drops its beacons ([Ingest
cap](#ingest-cap)). A team whose plan is taken away, by support or a revoked subscription,
lapses the same way once its trial is over.

The Worker runs first for every path (`run_worker_first: true`) and serves the
dashboard assets itself, so a customer's proxy hostname answers only the tracker and
the event endpoint, never the app.
