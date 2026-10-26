# Configuration reference

The API Worker (`apps/api`) reads all of its settings from a wrangler config file and
from Worker secrets. This page lists every binding, variable, and secret it reads.
To change a variable, edit `vars` in the config file and deploy again. To set a secret,
run `wrangler secret put <NAME>` in `apps/api`. Locally, put secrets in
`apps/api/.dev.vars`, which git ignores.

`apps/api` holds two config files:

| File | What it is | Deployed by |
| --- | --- | --- |
| `wrangler.jsonc` | The self-hosted template, and the file that `pnpm --filter @misomoon/api dev` and `pnpm bundle` read. Its database ids are placeholders until the first deploy creates the databases. It has a `workers.dev` address and no route, and its `vars` hold what a self-hosted server needs: `SIGNUPS` set to `invite`, no demo or sample site, no retention limit, and no plans, `PUBLIC_URL`, or Polar settings. | `pnpm --filter @misomoon/api run deploy` |
| `wrangler.cloud.jsonc` | misomoon Cloud's own config, with its databases, the `app.misomoon.com` route, `PLANS=on`, and `PUBLIC_URL`. | `pnpm --filter @misomoon/api run deploy:cloud` |

The deploy script and `pnpm db:migrate` read `wrangler.jsonc` unless `--config <file>`
or the environment variable `WRANGLER_CONFIG` names another file. A relative path is
read from `apps/api`. The deploy passes the same file to every `wrangler` command it
runs. For example, to see what a deploy of misomoon Cloud would change:

```sh
pnpm --filter @misomoon/api run deploy:cloud -- --plan
```

## Bindings

| Binding | Type | Required | What it holds |
| --- | --- | --- | --- |
| `CONTROL` | D1 database | Yes | Accounts, sites, goals, API keys, daily salts, the shard registry, and the routing table (`migrations/control`). |
| `SHARD_0` ... `SHARD_n` | D1 database | At least one shard | Events, visits, and imported history (`migrations/shard`). A migrated `SHARD_*` binding registers itself on the next request. |
| `SHARD_EU_0`, `SHARD_US_0`, `SHARD_APAC_0` ... | D1 database | No | Shards in a data region: a site added in that region uses only its shards. [Add data regions](upgrading.md#add-data-regions) explains how to create them. |
| `EVENTS` | Queue producer and consumer | No | Buffers beacons so the response is `202` at once. The consumer writes them in batches of up to 100. Without a queue, the Worker writes each event in `ctx.waitUntil`. |
| `ASSETS` | Static assets | Yes | The built dashboard (`apps/dashboard/dist`), served by the same Worker. |
| `STATS_LIMIT` | Rate limit | No | 100 requests per minute, approximate and counted in each Cloudflare location. It counts calls to `/api/v1/stats/*`, `/api/v2/query`, and `POST /mcp` together, each request of an MCP batch on its own, per API key, or per whole IP address for signed-out callers. Signed-in dashboards and shared links aren't counted. It also counts sign-up, sign-in, sign-in with Google, password reset, account deletion, invitation accept, and shared-link password attempts per IP address (per /64 block for IPv6), and invitations sent per sender. Without it, none of these are limited; a password reset still goes to an account at most once a minute. See [Rate limits](api.md#rate-limits). |
| `EMAIL` | Send email | No | Cloudflare Email Service. Sends invitations, password resets, reports, alerts, and the daily-cap notice from `EMAIL_FROM`, which must be on a domain onboarded to Email Service. Sending to any address needs the Workers Paid plan. The deploy bundle leaves it out. |
| `BROWSER` | Browser Run | No | Prints the PDF attached to weekly and monthly reports, and the PDF preview (`/reports/preview?format=pdf`). Each edition is printed once per site, whoever subscribes; a print takes a few seconds of browser time. Workers Free includes 10 minutes of browser time a day, Workers Paid 10 hours a month, then $0.09 an hour ([pricing](https://developers.cloudflare.com/browser-run/pricing/), checked 2026-10-24). Without it, or when a print fails, reports go out without the PDF. `wrangler dev` cannot print: quick actions run on Cloudflare only. The deploy bundle keeps it. |

The consumer retries a failed event 10 times, waiting 10 seconds and doubling the wait
each time up to an hour, so about 2.5 hours in all. Then it moves the event to the
dead-letter queue `misomoon-events-dlq`. The cron trigger (`*/5 * * * *`) checks
traffic-spike alerts and moves data off retiring shards every 5 minutes. At minute 15 of
every hour, it also sends email reports, checks traffic-drop alerts, and deletes old
salts, expired sign-ins, and expired password reset links. Once a day, at 03:15 UTC, it
applies retention and deletes usage rows older than 400 days.

## Variables

Set these in `vars` in `apps/api/wrangler.jsonc`. The **Default** column shows
misomoon Cloud's value where `wrangler.cloud.jsonc` sets one, and otherwise what an
unset variable means. Where `wrangler.jsonc` sets another value, the row says so.

| Variable | Default | What it does |
| --- | --- | --- |
| `PUBLIC_URL` | unset | The public origin of your dashboard, for example `https://analytics.example.com`. Links in emails use it. Invitations and password resets fall back to the address of the request. Email reports are sent by the cron job, which has no request, so they fall back to `https://misomoon.com`. Set it if you send reports. misomoon Cloud sets it; `wrangler.jsonc` and the deploy bundle leave it unset. |
| `SIGNUPS` | `open` | `invite` turns off open sign-up after the first account. While no account exists, one person can sign up and own the instance. After that, new people join only through an invitation from a team owner or admin. `closed` turns off sign-up completely, including the first account. Invitations still work. `wrangler.jsonc` and the deploy bundle set `invite`. Local dev sets `open` in `.dev.vars`. |
| `DEMO_SITE` | `demo` | The id of a public site that the dashboard opens first for signed-in people who can see it. Signed-out visitors get the sign-in screen, and open a public site from a link with its id (`/?site=demo`). `wrangler.jsonc` and the deploy bundle set it empty, so the dashboard opens your first site. Local dev sets `demo` in `.dev.vars`. |
| `SAMPLE_SITE` | `acme` | The id of the sample site that the [demo dashboard](dashboard.md#the-demo-dashboard) at `/demo` is recorded from (the demo reads the recording, not this site), and that the sign-in screen links to. The first cron run creates it as Acme (`acme.example`), a public site on a team called **Sample sites** that has no members, with goals, two funnels, and 90 days of retention. Every five minutes the cron then writes its made-up traffic up to now through the normal write path, starting with the last 62 days, one day per run, so the history fills in about six hours. Once it has, a **Live** read of the site also writes the minutes since the last run, at most every 20 seconds, and the traffic keeps at least three people online at every minute. The traffic is the same on every run, so nothing is stored twice. If a site with this id already belongs to another team, the cron logs `sample site skipped` and writes nothing. Empty or unset turns it off. `wrangler.jsonc` and the deploy bundle set it empty. |
| `RETENTION_DAYS` | `1825` | The longest any site keeps its events, visits, and payments, in days. The daily cleanup at 03:15 UTC deletes older ones, even on a site whose **Keep stats for** is longer, and the API refuses a longer `retention_days`. `0` sets no limit. `wrangler.jsonc` and the deploy bundle set `0`, so your own server keeps everything until you set it ([privacy settings](compliance.md#privacy-settings)). |
| `RETENTION_DEFAULT_DAYS` | `761` | How long a site keeps its data when its **Keep stats for** is **Default**, in days. 761 days is 25 months. Unset, or longer than `RETENTION_DAYS`, means `RETENTION_DAYS`. With both `0`, a site without a setting keeps everything. With `PLANS=on`, a site without a setting keeps this or its plan's longest, whichever is shorter ([Plans](#plans)). `wrangler.jsonc` and the deploy bundle leave it unset. |
| `PLANS` | `on` | `on` enforces the misomoon Cloud plans: the free trial, how many sites a team can have, how long its sites can keep their stats, and how many events they record a month. See [Plans](#plans). Unset, or any other value, enforces no plan. `wrangler.jsonc` and the deploy bundle leave it out, so a self-hosted server has no plan limits. |
| `SHARD_SOFT_LIMIT_MB` | `8000` | The size at which a shard stops taking new sites and starts draining. D1's hard limit is 10 GB per database. A value that is not a positive number counts as `8000`. Only an `active` shard drains: a `retiring` one stays retiring. |
| `INGEST_DAILY_CAP` | unset | The most events a site can store per UTC day, unless the site has its own cap. Unset means no cap. A value that is not a positive whole number also means no cap. See [Daily ingest cap](#daily-ingest-cap). |
| `EMAIL_PROVIDER` | `ses` | `cloudflare` or `ses`. misomoon Cloud sets `ses`. Unset picks the `EMAIL` binding when it is bound, then SES. A provider named here that is not set up sends nothing; email does not go out through another provider. |
| `EMAIL_FROM` | `misomoon <reports@misomoon.com>` | The sender of every email. Use an address on a domain that your provider verified. |
| `AWS_SES_REGION` | `ap-southeast-2` | Amazon SES: the region of your SES identity. misomoon Cloud uses Sydney, `ap-southeast-2`. Email goes through SES when this and both `AWS_SES_*` secrets are set. A value that isn't an AWS region, such as `Sydney` or a URL, turns SES off: the Worker logs `AWS_SES_REGION is not an AWS region; SES is off` once per isolate and sends nothing through SES. |
| `DEMO_SEED` | unset | `1` allows `POST /api/v1/sites/:id/demo`, which writes synthetic traffic. Use it only locally. |
| `CF_ZONE_ID` | unset | Managed proxy: the zone that owns `PROXY_CNAME_TARGET` and has Cloudflare for SaaS turned on. |
| `PROXY_CNAME_TARGET` | unset | Managed proxy: the fallback origin that customer hostnames point a CNAME at, for example `proxy.example.com`. |

## Secrets

| Secret | Needed for | Notes |
| --- | --- | --- |
| `AWS_SES_ACCESS_KEY_ID`, `AWS_SES_SECRET_ACCESS_KEY` | Email through Amazon SES | An IAM key that may call `ses:SendEmail`. Requests use SES v2 with SigV4 signing. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google import, Search Console, and sign-in with Google | An OAuth web client. Add `<your misomoon URL>/api/v1/google/callback` as an authorized redirect URI, and `<your misomoon URL>/api/v1/auth/oauth/google/callback` for sign-in, using the address you open the dashboard on: misomoon builds the redirect from the request's own origin, not from `PUBLIC_URL`. In the Google Cloud project, enable the Google Analytics Data API, the Google Analytics Admin API, and the Google Search Console API. The import asks for `analytics.readonly`, Search Console for `webmasters.readonly`, and sign-in for `openid`, `email`, and `profile`. [Bring your history](import.md) and [Sign in with Google](sign-in.md#set-it-up-on-your-own-server) walk through the setup. |
| `CF_API_TOKEN` | Managed proxy | A Cloudflare API token with **SSL and Certificates: Edit** on `CF_ZONE_ID`. |

Without an email provider, the dashboard shows invitation links to copy by hand, and
reports, alerts, password resets, and the daily-cap notice are not sent.

misomoon Cloud sends from `misomoon <reports@misomoon.com>` through SES in Sydney.
Its IAM user, `misomoon-ses`, may call only `ses:SendEmail`, using the `misomoon.com`
identity in `ap-southeast-2` with `reports@misomoon.com` as the From address. Its access
key is stored in the two `AWS_SES_*` Worker secrets. The domain uses SES DKIM and
`bounce.misomoon.com` as its custom MAIL FROM domain, with DNS hosted by Cloudflare.
Changing the sender or region also requires updating the IAM policy and verifying the
identity in that region. SES failures are logged as `email failed`; invitations then
show a link to copy, and reports stay due for a later attempt.
An SES redirect is treated as a failed send. The Worker never forwards the signed
request or its email content to the redirect destination.
The self-hosted template and deploy bundle leave out misomoon Cloud's email provider,
sender, and SES region. Set your own provider and credentials to send email there.

The managed proxy is on only when `CF_API_TOKEN`, `CF_ZONE_ID`, and `PROXY_CNAME_TARGET`
are all set. [Serve the tracker from your own domain](PROXY.md) explains the proxy and its other options.

## Daily ingest cap

The cap limits how many events one site stores per UTC day, so a bot flood or a broken
script can't run up D1 writes. It counts every stored row: a pageview and a custom event
each count as one. An engagement beacon adds its time to its pageview's row and counts as
nothing, and the beacons of a pageview the cap dropped are dropped too. The queue consumer applies the cap before it writes
to a shard, and keeps the earliest events of the day. Several consumers can run at once.
Each adds the room it takes to the day's count in `CONTROL` in one statement, so together
they never store more than the cap, and it gives back the room it didn't use once its write
is done. If a consumer fails before it can give the room back, the day stores a little less
than the cap, never more. A queue retry never counts an event twice or drops one that was
already stored. Once a day is full, the edge also drops beacons for that site within a
minute, before they reach the queue, engagement beacons included: a page viewed before the
day filled gets no more time after that. A ref-only beacon is an engagement beacon that
carries only payment refs. The edge drops it for a site that takes no payments. For a site that
takes payments, it counts as one stored row, not as an event, and a queue retry doesn't
count it twice. It takes room under the cap like any other row, but once queued it is never
dropped, so the payment keeps its visit. Those beacons are the one way a day can store more
than its cap: one row each, for those queued before the edge saw the day full.
Payments from webhooks are never capped. The day starts over at 00:00 UTC.

Each site has an `ingest_cap` column in the `sites` table of `CONTROL`:

| `ingest_cap` | Effect |
| --- | --- |
| `NULL` | The site uses `INGEST_DAILY_CAP`. |
| A positive number | The site may store this many events per UTC day. |
| `0` | The site is blocked. Every beacon is dropped. |

To give one site its own cap, run:

```sh
wrangler d1 execute CONTROL --remote --command "UPDATE sites SET ingest_cap = 500000 WHERE id = 'shop-com'"
```

Workers pick up the change within a minute. The first time a cap drops an event on a
given day, the team's owners and admins get one email. A block sends no email.
`GET /api/v1/sites/:id/usage` returns the cap and the counts for the last 31 days. The
`dropped` count includes only events that the consumer dropped. Beacons that the edge
dropped are not counted, because counting them would cost a write each.

## Plans

misomoon Cloud sells [plans](cloud.md#plans). With `PLANS=on`, the Worker enforces each
team's plan, using the limits in `PLANS` in `packages/core/src/plans.ts`:

- **Sites.** A team with as many sites as its plan includes can't add a site
  (`POST /api/v1/sites`) or take one in from another team
  (`POST /api/v1/sites/:id/transfer`). Both answer `403` with the code `plan_site_limit`
  ([Errors](api.md#errors)). The count covers the team's own sites, not the sites its
  members are guests on. The count and the write are one statement, so two requests at
  once can't pass the limit.
- **Retention.** A site keeps its stats for at most its plan's longest period, or
  `RETENTION_DAYS` when that is shorter. A site without a setting keeps
  `RETENTION_DEFAULT_DAYS` or that longest, whichever is shorter. A longer `retention_days`
  answers `403` with the code `plan_retention_limit`. The daily cleanup deletes by the same
  limit.
- **Trial.** A team without a plan works under `TRIAL_PLAN` (Growth) until
  `teams.trial_ends_at`. A person's first team gets `TRIAL_DAYS` (7) days:
  `createTeam` sets `users.trial_started_at` and the team's `trial_ends_at` in one batch.
  Every later team of that person gets `trial_ends_at = created_at`, so it has no trial.
  This covers the team sign-up makes, `POST /api/v1/teams`, and the `My sites` team that
  `POST /api/v1/sites` makes for someone with no team to add to.
- **Lapsed teams.** A team with no plan past `trial_ends_at`, or with `trial_ends_at`
  `NULL`, has lapsed. `acceptBeacon` drops its sites' beacons, and adding a site or taking
  one in answers `403` with the code `plan_required`. Its stats and settings stay
  available, the daily cleanup keeps its data by the trial plan's retention, and payment
  webhooks still record payments.
- **Events a month.** The [monthly events](#monthly-events) of a team are counted per UTC
  calendar month. At 80% and 100% of its plan's events, the team's owners, admins, and
  billing members get one email each. At `OVERAGE` (125%), `acceptBeacon` drops the team's
  beacons until the month ends or the plan changes to one with room, and the same people
  get one more email. A team on the trial counts against the trial plan's events.

Without `PLANS=on`, none of this applies, whatever the `plan` and `trial_ends_at` columns
hold: a self-hosted server starts no trial, lapses no team, and never stops recording.

### Set a team's plan

A team's plan is the `plan` column of `teams` in `CONTROL`: `starter`, `growth`, or
`scale`. `NULL` is no plan: the trial, with the limits of `TRIAL_PLAN` (Growth), while
`trial_ends_at` is ahead, and lapsed after it. In `apps/api`, find the teams that a
customer owns, then set the plan of one:

```sh
wrangler d1 execute CONTROL --remote --command "SELECT t.id, t.name, t.plan, (SELECT COUNT(*) FROM sites WHERE team_id = t.id) AS sites FROM teams t JOIN team_members m ON m.team_id = t.id JOIN users u ON u.id = m.user_id WHERE u.email = 'ada@example.com' AND m.role = 'owner'"
wrangler d1 execute CONTROL --remote --command "UPDATE teams SET plan = 'starter' WHERE id = '<team id>'"
```

The Worker reads the plan on each request that checks it, so the change applies at once
to the API. The edge reads it through the isolate cache, so beacons follow within a
minute. Setting `plan = NULL` takes the plan away: the team is on the trial while
`trial_ends_at` is ahead, and lapsed after it. A value that isn't a plan id counts as
`NULL`, and the Worker logs `unknown plan` with the team id each time a request reads it.

misomoon's own teams follow the same rules. The team that owns `DEMO_SITE` needs a plan,
or its site stops recording when the trial ends. The sample site (`SAMPLE_SITE`) is
written by the cron, past the edge, so it never stops.

A move to a plan with fewer sites keeps every site. The team can't add or take in a site
until it has fewer than the plan includes. A move to a plan that keeps stats for less
leaves each site's **Keep stats for** setting as it is. The next daily cleanup, at 03:15
UTC, deletes what is older than the new limit.

### Extend a trial or reset a team

Support changes the trial and the month with SQL in `CONTROL`. Each change reaches the
API at once and the edge within a minute.

To extend a team's trial, set its end in milliseconds, here to 7 days from now:

```sh
wrangler d1 execute CONTROL --remote --command "UPDATE teams SET trial_ends_at = (CAST(strftime('%s', 'now') AS INTEGER) + 7 * 86400) * 1000 WHERE id = '<team id>'"
```

To give a person a new trial on the next team they create, clear theirs:

```sh
wrangler d1 execute CONTROL --remote --command "UPDATE users SET trial_started_at = NULL WHERE email = 'ada@example.com'"
```

To let a team that stopped at 125% record again this month, move it to a bigger plan.
Without a plan change, set its sites' events for the month to 0. The site's
`GET /api/v1/sites/:id/usage` then shows 0 events for those days too:

```sh
wrangler d1 execute CONTROL --remote --command "UPDATE usage_daily SET events = 0 WHERE site_id IN (SELECT id FROM sites WHERE team_id = '<team id>') AND day >= CAST(strftime('%s', 'now', 'start of month') AS INTEGER) / 86400"
```

To send the month's emails again when the team next reaches 80%, 100%, or 125%, delete
what was sent:

```sh
wrangler d1 execute CONTROL --remote --command "DELETE FROM plan_notices WHERE team_id = '<team id>'"
```

### Monthly events

`usage_daily.events` holds each site's pageviews and custom events per UTC day, which is
what a plan counts. Engagement beacons and payments are not in it. A team's month is the
sum over the sites it has now, from the 1st of the month in UTC, so a site moved to another
team mid-month takes its month's events with it. To see a team's events this month:

```sh
wrangler d1 execute CONTROL --remote --command "SELECT SUM(u.events) AS events FROM usage_daily u JOIN sites s ON s.id = u.site_id WHERE s.team_id = '<team id>' AND u.day >= CAST(strftime('%s', 'now', 'start of month') AS INTEGER) / 86400"
```

With `PLANS=on`, the Worker checks the month in two places:

- After each queue batch, `checkMonths` in `apps/api/src/plans.ts` reads the month of each
  team that the batch counted events for. At 80% and 100% of the plan's events, and at
  `OVERAGE` (125%), it adds a row to `plan_notices` and emails the team's owners, admins,
  and billing members. The row's key is the team, the month, the plan, and the level, so
  each email goes out once a month, and a team that moves to another plan gets that plan's
  emails. With no email provider set up, the Worker logs
  `email skipped: no email provider set up` instead. A lapsed team gets no email. When
  the provider refuses the email for every recipient, the hourly run at minute 15 sends it
  again within the month, up to 24 tries in all
  ([Notices the provider refused](reports.md#notices-the-provider-refused)).
- `acceptBeacon` drops a beacon once the team's month reaches 125% of its plan's events.
  It reads the month through the isolate cache, so a stop starts within a minute, and
  events queued before it are still stored. A new month starts a new count at 00:00 UTC
  on the 1st.

`plan_notices.month` counts months since January 1970, and the daily cleanup deletes rows
older than 3 months. The Worker logs `plan events warning` and `plan events stopped` with
the team id and the level when it sends one.

The [daily ingest cap](#daily-ingest-cap) is separate. It limits what one site stores in
a UTC day.

## Billing

With `PLANS=on`, teams can pay for their plan by card through Polar, the merchant of
record ([Pay for misomoon Cloud](billing.md)). Billing is on when every setting below is
set. With one missing, `GET /api/v1/me` says `"billing": false`, the dashboard shows no
billing, and the billing routes answer `501` with the names of the missing settings.
Without `PLANS=on`, they answer `404`. `wrangler.jsonc` and the deploy bundle leave out
every `POLAR_*` setting, so a self-hosted server has no billing.

| Name | Kind | What it does |
| --- | --- | --- |
| `POLAR_ACCESS_TOKEN` | Secret | A Polar organization access token with the scopes `checkouts:write`, `customer_sessions:write`, `subscriptions:read`, and `subscriptions:write`. Set it with `wrangler secret put POLAR_ACCESS_TOKEN`. |
| `POLAR_WEBHOOK_SECRET` | Secret | The secret of the Polar webhook endpoint that points at `/api/billing/polar/webhook`, starting with `whsec_`. A secret made before 8 September 2026 works too. Set it with `wrangler secret put POLAR_WEBHOOK_SECRET`. |
| `POLAR_SERVER` | Variable | `production`, or unset, uses `https://api.polar.sh`. `sandbox` uses `https://sandbox-api.polar.sh`. The token and the products must belong to the same one. Any other value turns billing off. |
| `POLAR_PRODUCT_STARTER`, `POLAR_PRODUCT_GROWTH`, `POLAR_PRODUCT_SCALE` | Variable | The Polar product id of each plan: a product with a monthly recurring price. A webhook for another product changes nothing and logs `unknown Polar product`. |

Every request to Polar sends `Polar-Version: 2026-10`. Set the webhook endpoint's API
version to `2026-10` too. Each `wrangler secret put` deploys a new version of the Worker at
once. To stage a secret with a later deploy instead, use `wrangler versions secret put`.
[Set up billing on your server](billing.md#set-up-billing-on-your-server) walks through the
setup in Polar.

## Tracker attributes

The tracker reads these attributes from its own `<script>` tag. The
[tracking guide](tracking.md) shows them in use.

| Attribute | Example | What it does |
| --- | --- | --- |
| `?s=` on the script URL | `src=".../m.js?s=shop"` | The site id. Required. The server also uses it to add the code for the site's ticked features. |
| `data-api` | `data-api="/relay/api/event"` | Where to send events. Defaults to `api/event` next to the script URL. |
| `data-disable` | `data-disable="forms,clicks"` | Turns features ticked in the site settings off on the pages that carry it. Values: `outbound`, `downloads`, `forms`, `events`, `payments`, `vitals`, `clicks`, `errors`, `fields`, `media`, `content`. |
| `data-manual` | `data-manual` | Sends no pageview on load. Call `misomoon('pageview')` yourself. |
| `data-hash` | `data-hash` | Counts `#/route` changes as pages, for hash-based routers. |
| `data-prop-<name>` | `data-prop-plan="pro"` | Adds a custom property to every event. |
| `data-download-ext` | `data-download-ext="dmg,apk"` | More file extensions to count as downloads, with Downloads ticked. |

Which paths count, the search parameters, and what the tracker collects are site settings,
not attributes: see [Choose what to track](tracking.md#choose-what-to-track). A browser
the tracker doesn't count says why in its console.

Attributes on a page's own elements (`data-misomoon-content`, `data-misomoon-media`,
`data-misomoon-id`, `data-misomoon-mask`) are in the
[tracking guide](tracking.md#see-what-people-do-on-a-page).

## Marketing site

The marketing site (`apps/landing`) is a separate Worker with its own
`apps/landing/wrangler.jsonc`. Self-hosting misomoon doesn't need it. It reads these
settings:

| Name | Kind | Required | What it does |
| --- | --- | --- | --- |
| `CONTENT` | D1 database | For the blog | Blog posts, pages, and authors (`apps/landing/migrations`). Without it, the blog is empty, the nav shows no **Blog** link, and the content API answers `503`. |
| `CONTENT_TOKEN` | Secret | For writes | The bearer token for `PUT` and `DELETE` on the content API, and for reading drafts. Without it, writes answer `503`. |
| `PUBLIC_APP_URL` | Variable | No | Where the dashboard lives, for **Sign in** and the live demo. `wrangler.jsonc` sets `https://app.misomoon.com`. Unset, the links go to `http://localhost:8787`, the API Worker in `wrangler dev`. |
| `PUBLIC_DOCS_URL` | Variable | No | Where the docs site lives. Unset, docs links open the Markdown on GitHub. |

[Publish posts and pages](content.md) explains how to create the database, set the
token, and publish.
