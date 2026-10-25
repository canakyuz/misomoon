# Changelog

All notable changes to misomoon are listed here. Versions follow
[semantic versioning](https://semver.org/).

## 0.1.0 (unreleased)

The first public release.

- A cookieless tracker under 1 KB gzipped that sends pageviews, engaged time, scroll
  depth, custom events, and revenue.
- Per-site features under Settings: outbound links, downloads, form submits, tagged
  events, payments, Web Vitals, clicks, JavaScript errors, form fields, media, content,
  and site search, plus path rules. A new site has every feature on; the Light preset
  keeps outbound links, downloads, form submits, and tagged events at 1.9 KB gzipped.
  `m.js?s=<site>` carries the code for the ticked features only.
- Privacy settings per site under Settings > Install > Privacy: how long stats and
  payments are kept (30 days to 10 years), IP addresses and ranges that never count, and an option to
  leave out browsers that send Global Privacy Control or Do Not Track. The card also
  writes the section for the site's privacy policy from its settings, and gives an
  opt-out button for visitors.
- Data regions: each site keeps its stats in the EU, the US, or Asia-Pacific, picked when
  it is added and guessed from its timezone. `SHARD_REGIONS=eu:2,us:1,apac:1` creates
  `SHARD_EU_*` and `SHARD_US_*` shards in that D1 jurisdiction and `SHARD_APAC_*` shards
  with the `apac` location hint. Sites stay on their region's shards when shards drain
  or retire.
- `DELETE /api/v1/me` and Settings > Account > Delete account: deletes the account, with
  the teams only it is in and their sites and data.
- Legal pages for app.misomoon.com: a data processing agreement, a privacy policy, terms
  of service, and a security page, plus a privacy-law guide with legitimate interest and
  Article 30 templates. The Worker no longer keeps Cloudflare's invocation logs or traces, and the dashboard
  serves its own fonts instead of loading them from Google Fonts.
- Ingest writes about 6.4 D1 rows and stores about 550 bytes per pageview or custom
  event. Engagement beacons update their pageview's row instead of storing rows of their
  own, `events` keeps two indexes, and the visit lookup always uses its index.
- A Behavior view: clicks per element with rage and dead clicks, drawn over the live page
  by `overlay.js`; scroll depth; form field drop-off; site search terms; JavaScript
  errors; video and audio plays; and tagged content impressions. Counts only, no session
  recordings.
- `@misomoon/sdk` on npm: the tracker for bundled apps, React and Next.js, a React
  Native and Expo client that counts screens and engaged time without storing anything
  on the device, and server-side events that join the visitor's visit.
  `@misomoon/sdk/next` serves the tracker from a Next.js app's own domain with
  `withMisomoon()`. Every client hands out payment refs with `ref()`, so a checkout from
  a browser, an app, or a server finds its visit. The Node client sends signed payments
  and refunds to the custom webhook with `payment()`. The browser client takes
  `enabled: false`, types events with `typed<Events>()` and `useMisomoon<Events>()`, and
  leaves a browser out of the counts with `ignore()`. A React Native app opened from a link credits the
  visit with the link's campaign, without code. Every client refuses an event the server
  would drop, with a console warning.
- A guide to installing the tracker on WordPress, Shopify, Webflow, Framer, Wix,
  Squarespace, Ghost, Google Tag Manager, Carrd, common frameworks, and AI app builders.
- A WordPress plugin in `plugins/wordpress/misomoon`: it adds the tracker, leaves out
  logged-in editors, can serve the tracker through the REST API, and sends WooCommerce
  orders and refunds, each credited to the visit that placed the order.
- A dashboard with an overview, realtime visitors, funnels, journeys, goals, Web Vitals,
  annotations, segments, and a command palette. The overview has a halftone globe of
  where people are, cards that open a row in place, each row's change against the
  comparison period, and **What changed**, the sources, pages, and countries that gained
  or lost the most people. The filter picker lists each dimension's values with their
  people, to tick one or several.
- `GET /api/v1/stats/breakdown` with `compare` adds `previous_visitors` to each row.
- An MCP server with 13 tools for Claude, Cursor, and other MCP clients.
- The Stats API (v1 and v2), with filters, comparisons, and ZIP export.
- Teams with roles, invitations, API keys, public sites, and shared links.
- Email reports and traffic-spike and traffic-drop alerts.
- Google Analytics import, CSV import, and Google Search Console queries.
- A first-party proxy: a managed subdomain, or one-click proxies for Cloudflare and
  Vercel.
- Sharded D1 storage that grows with `SHARD_COUNT`.
- A one-click Deploy to Cloudflare bundle. With `SIGNUPS=invite`, the first account
  can still sign up and claim an empty instance.
- misomoon.com has more pages: features, a comparison for each of 16 analytics tools
  with a source and a checked date for every claim, and a blog with topics, authors, an
  RSS feed, and a sitemap. Posts and extra pages live in the landing's `CONTENT` D1
  database and are written through its content API with `CONTENT_TOKEN`
  ([Publish posts and pages](docs/content.md)).
- Plans on misomoon Cloud, turned on with `PLANS=on`, which the self-hosted bundle never
  sets. A team's plan is `teams.plan`, set by Polar's subscription webhooks or by support,
  and NULL is no plan. Adding a site or moving one into a team past the plan's site limit
  answers `403` `plan_site_limit`, and a `retention_days` past the plan's answers `403`
  `plan_retention_limit`. The cleanup keeps stats for the plan's limit at most. Settings >
  Team shows the plan ([Plans](docs/cloud.md#plans)).
- One free trial per person on misomoon Cloud, on the first team they create, and a
  monthly event limit per team. A team with no plan after its trial lapses: its beacons
  are dropped, and adding or taking in a site answers `403` `plan_required`. At 80% and
  100% of the plan's events the owners, admins, and billing members get an email, and at
  125% the team's beacons are dropped until the next UTC month or a bigger plan. Payments
  are always recorded. Settings > Team shows the trial and the month's events, and a
  banner warns the team ([Go past your monthly events](docs/cloud.md#go-past-your-monthly-events)).
- Self-serve billing on misomoon Cloud through Polar, the merchant of record. Owners and
  billing members choose, switch, and cancel the team's plan in Settings > Team:
  `POST /api/v1/teams/:team/checkout` opens a Polar checkout, or switches the subscription
  the team pays for, and `POST /api/v1/teams/:team/portal` opens Polar's portal for the
  card and invoices. Polar's signed webhooks at `POST /api/billing/polar/webhook` set
  `teams.plan`, `plan_status`, and `plan_period_end`, once per `webhook-id` and never from
  an older state. It needs `PLANS=on` and the `POLAR_*` settings, which the self-hosted
  bundle leaves out ([Pay for misomoon Cloud](docs/billing.md)).
