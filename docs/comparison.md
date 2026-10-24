# How misomoon compares

This page compares misomoon with other analytics tools. The facts about other products
come from their own pricing pages, docs, repositories, and license files, checked on
**2026-10-24**. Prices, plans, and features change. Follow the links to confirm before
you decide. If you find a fact that is wrong or out of date, open an issue or a pull
request with the source, and we will fix it.

"Their claim" marks a statement that a vendor makes about itself, such as whether a
consent banner is needed. This page is not legal advice.

## Where misomoon is different

misomoon runs entirely on Cloudflare in your own account: a Worker, D1 databases, and a
queue. Nothing to rent, patch, or keep running. Other self-hosted tools need a server
with Docker and a database such as Postgres or ClickHouse. misomoon needs a Cloudflare
account and one deploy.

Every feature is in the one free version: funnels, journeys, revenue, Core Web Vitals,
email reports, and Google import. It also has a built-in MCP server, so Claude, Cursor,
and other MCP clients can read your numbers directly.

The trade-off is that misomoon depends on Cloudflare. If you can't use Cloudflare, or you
need a tool that runs on your own hardware, a Docker-based option fits better.

## Self-hosted and open-source tools

| | misomoon | Plausible CE | Umami | Matomo | PostHog | Rybbit |
| --- | --- | --- | --- | --- | --- | --- |
| License | MIT | AGPL-3.0 | MIT | GPL-3.0 | MIT, except the proprietary `ee/` folder | AGPL-3.0 |
| What self-hosting needs | A Cloudflare account | Docker, Postgres, ClickHouse, 2 GB RAM | Node.js and Postgres | PHP 8.1+, MySQL or MariaDB, a web server | Docker with ClickHouse, Postgres, Kafka, Redis, MinIO; 4 vCPU and 16 GB RAM | Docker, ClickHouse, 2 GB RAM |
| Servers to maintain | None | Yes | Yes | Yes | Yes | Yes |
| Self-hosted edition limits | None | No funnels, journeys, or revenue goals | No email reports | Funnels and Web Vitals are paid plugins | Paid features are cloud-only. Self-hosting is "officially unsupported". | No email reports or Pages view |
| Cookieless by default | Yes | Yes (their claim) | Yes (their claim) | No. Cookies are on until you turn them off. | No. Cookieless mode is opt-in. | Yes (their claim) |
| Funnels | Yes, 3 modes | Cloud Business plan | Yes | Paid plugin | Yes | Yes |
| Revenue | Yes, per-site currency | Cloud Business plan | Yes | Yes | Yes | Not checked |
| Core Web Vitals | Yes | Not in docs | Yes | Paid plugin | Yes | Yes |
| Official MCP server | Yes, built in | No (third-party only) | Yes | Yes | Yes | Yes |
| Import from Google | Yes | Yes | No | Yes | Manual, through BigQuery | No |
| First-party proxy | Managed subdomain or self-run, with one-click deploys | Self-run (managed on Enterprise) | Self-run | Self-run | Managed on their cloud | Self-run |
| Tracker size, gzipped | 998 bytes core, 1.8 KB with the Light preset, 4.8 KB with every feature (measured) | 1.3 KB for `script.js`, 2.5 KB for the current per-site script (measured) | 2.3 KB (measured) | 28 KB (measured) | 106 KB (measured, full bundle) | 11 KB (measured) |
| GitHub stars | New | 29.6k | 39.6k | 22.0k | 40.4k | 13.2k |

"Measured" means we downloaded the script with gzip on 2026-10-24. Sizes depend on the
version and configuration.

## Hosted tools

misomoon Cloud plans count events: pageviews and custom events together, across all the
sites in a team. Where another tool's price counts pageviews only, a misomoon plan of the
same size covers fewer pageviews if your sites also send custom events.

| | misomoon | Google Analytics 4 | Fathom | Simple Analytics | Cloudflare Web Analytics |
| --- | --- | --- | --- | --- | --- |
| Where your data lives | Your Cloudflare account | Google | Fathom (EU collection, then US) | The Netherlands | Cloudflare |
| Open source | Yes (MIT) | No | No (the old Fathom Lite is MIT and no longer developed) | No (only the tracker scripts) | No |
| Price | misomoon Cloud from $5/month for 100k events on 1 site, or $14/month for 1M events on unlimited sites, after a 7-day trial. Free to self-host | Free | From $15/month for 100k pageviews | Free for 5 sites with a 1-month history; from $20/month | Free |
| Cookies | None | `_ga` cookies for 2 years. Google's EU policy requires consent where the law requires it. | None (their claim) | None (their claim) | None |
| Funnels | Yes | Yes | Not found | Multi-step goals on some plans | No |
| Revenue | Yes | Yes | Yes | Not found | No |
| Core Web Vitals | Yes | No built-in report | Not found | Not found | Yes |
| Custom events and UTM | Yes | Yes | Yes | Yes | No |
| Official MCP server | Yes | Yes, "Experimental" | No (community only) | No | A general Cloudflare GraphQL server |
| Data retention | Cloud: 2 years on Starter, 3 years on Growth and Scale. Self-hosted: no limit | 2 or 14 months for explorations | While you subscribe | 1 month on the free plan; paid plans don't say | 6 months, sampled after 7 days |
| Tracker size, gzipped | 998 bytes core, 1.8 KB with the Light preset, 4.8 KB with every feature (measured) | 157 KB (measured, `gtag.js`) | 2.1 KB (measured) | 3.9 KB (measured) | 10 KB (measured) |

## More hosted tools

Checked on 2026-10-25.

| | misomoon | DataFast | Pirsch | Vercel Web Analytics |
| --- | --- | --- | --- | --- |
| Entry price | misomoon Cloud $5/month for 100k events, 1 site. $14/month for 1M events, unlimited sites | $9/month for 10k events, 1 site, 1 team member | $6/month for 10k pageviews | Hobby: 50,000 events a month free, then counting pauses. Pro: $0.03 per 1k events |
| Free trial | 7 days, no card | 14 days, no card | 30 days, no card | Not a trial: the Hobby limit |
| Cookies | None | `datafast_visitor_id` for 1 year by default; a cookieless script is optional | None (their claim) | None (their claim) |
| Where hosted data lives | EU, US, or Asia-Pacific, per site | Mostly outside the EU, including the US | Germany | Not stated for analytics |
| Funnels | Yes | Yes | Plus plan ($12/month) and up | Not found |
| Revenue from payment providers | Stripe, Polar, Lemon Squeezy, Dodo Payments, your server | Stripe, Lemon Squeezy, Polar, Shopify, WooCommerce, and more | Revenue from your own events; no payment connections found | Not found |
| Custom events and UTM | Every plan | Yes | Yes | Custom events on Pro; UTM with the Plus add-on |
| Core Web Vitals | Yes | Not found in its docs | Not on its feature list | Speed Insights, a separate product; all vitals at $10 per project a month |
| Import from Google | GA4 | No, Plausible only ("Next is Google Analytics") | Universal Analytics (GA3) only | Not found |
| Official MCP server | Yes | Yes | No, an unsupported community project | Vercel MCP can query Web Analytics |
| Open source | MIT | Not found | AGPL-3.0 core library; on-premise on Enterprise | Only the client package (MIT) |
| SOC 2 or ISO 27001 | No (Cloudflare has both) | Not found | Not found | SOC 2 Type 2, ISO 27001:2022 |
| Tracker size, gzipped | 998 bytes core, 1.8 KB Light (measured) | 5.3 KB (measured) | 3.5 KB (measured, `pa.js`) | 2 KB (measured, 2,029 bytes) |

## More open-source tools

Checked on 2026-10-25.

| | misomoon | GoatCounter | Swetrix |
| --- | --- | --- | --- |
| License | MIT | A modified EUPL 1.2 | AGPL-3.0 |
| What self-hosting needs | A Cloudflare account | A server for its Go binary, with SQLite or PostgreSQL | Docker, ClickHouse, and Redis |
| Self-hosted edition limits | None | None stated | No revenue, alerts, feature flags, or experiments (cloud only) |
| Hosted price | $5/month for 100k events on 1 site, or $14/month for 1M events on unlimited sites, after a 7-day trial | Free, supported by donations | From $19/month; the 14-day trial needs a payment method |
| Funnels and goals | Yes | Not found | Yes |
| Revenue | Yes | Not found | Stripe and Paddle, cloud only |
| Core Web Vitals | Yes | Not found | Load timings such as TTFB; no Web Vitals named |
| Session replay | No | No | Plus plan ($39/month) |
| Import from Google | GA4 | No, web server logfiles | GA4 |
| Two-factor sign-in | No | Not found | Yes |
| Tracker size, gzipped | 998 bytes core, 1.8 KB Light (measured) | 3.3 KB (measured, `count.js`) | 6.7 KB (measured) |
| GitHub stars | New | 6.1k | 1.2k |

## Product analytics and session replay

misomoon is web analytics. These tools also record sessions, and Mixpanel runs
experiments and feature flags, which misomoon doesn't. Checked on 2026-10-25.

| | misomoon | Mixpanel | Microsoft Clarity |
| --- | --- | --- | --- |
| Price | misomoon Cloud from $5/month, or free to self-host | Free up to 1M events a month; Growth by usage | Free ("a free service forever") |
| Cookies | None | A cookie for 365 days by default | `_clck`, `_clsk`, and Microsoft's `MUID` advertising cookie |
| Consent in Europe | No cookies, nothing stored on the device | Not checked | A consent signal is required for EEA, UK, and Swiss visits since 31 October 2025 |
| Session replay | No | 10k replays a month free | Yes |
| Heatmaps | Click maps and scroll depth | Yes | Click, scroll, and area maps |
| Funnels | Yes | Yes | Yes |
| Data retention | Cloud: 2 years on Starter, 3 years on Growth and Scale. Self-hosted: no limit | Not checked | Recordings 30 days, heatmaps 9 months |
| Official MCP server | Yes | Yes | Yes, 10 requests a day over the last 3 days of data |
| Open source | MIT | Not found: hosted only | Only the tracking script |
| SOC 2 or ISO 27001 | No (Cloudflare has both) | SOC 2 Type II, ISO 27001 and 27701 | Not found |
| Tracker size, gzipped | 998 bytes core, 1.8 KB Light (measured) | 34 KB (measured, `mixpanel-2-latest.min.js`) | 26 KB (measured, `clarity.js` 0.8.73) |

## Tracker size, feature for feature

A new misomoon site gets every feature. The **Light** preset under **Settings** >
**Install** > **What to track** keeps what Plausible's script does: pageviews with
single-page app and hash routing, engaged time and scroll depth, custom events with props
and revenue, outbound links, file downloads, form submissions, and tagged events.

| Script | Gzipped |
| --- | --- |
| misomoon, core only | 998 bytes |
| misomoon, Light preset | 1,846 bytes |
| misomoon, every feature | 4,763 bytes |
| Plausible, `script.js` (pageviews only) | 1,280 bytes |
| Plausible, `script.outbound-links.file-downloads.tagged-events.js` | 2,069 bytes |
| Plausible, the per-site `pa-` script on plausible.io | 2,475 bytes |
| Vercel Web Analytics, `/_vercel/insights/script.js` | 2,029 bytes |
| GoatCounter, `count.js` | 3,325 bytes |
| Pirsch, `pa.js` | 3,510 bytes |
| DataFast, `script.js` | 5,257 bytes |
| Swetrix, `swetrix.js` | 6,718 bytes |
| Microsoft Clarity, `clarity.js` 0.8.73 | 26,262 bytes |
| Mixpanel, `mixpanel-2-latest.min.js` | 33,795 bytes |

Measured on 2026-10-24 with Node's `zlib.gzipSync` at its default level, on the files
served by `plausible.io/js/` and on misomoon's build. Plausible's current per-site script
turns outbound links, downloads and form submissions on and off from its dashboard, so it
carries their code on every site ([script extensions](https://plausible.io/docs/script-extensions),
page updated 2026-08-14).

The rows from Vercel Web Analytics down were measured the same way on 2026-10-25, on the
files served by `vercel.com/_vercel/insights/`, `gc.zgo.at`, `api.pirsch.io`, `datafa.st/js/`,
`swetrix.org`, and `cdn.mxpnl.com`, and on the `clarity-js` 0.8.73 package on jsDelivr, the
script Clarity's tag loads. Clarity's tag adds a small loader on top.

## Data processing agreements

A self-hosted misomoon needs no agreement with the misomoon project: the data stays in
your Cloudflare account, under Cloudflare's DPA. The hosted service at app.misomoon.com
has its own [data processing agreement](dpa.md). Bracketed values in it are drafts.

| | app.misomoon.com | Plausible | Fathom | Simple Analytics | Umami Cloud | Matomo Cloud | PostHog |
| --- | --- | --- | --- | --- | --- | --- | --- |
| How you get it | Part of the terms, nothing to sign | Part of the terms, nothing to sign | Sign the PDF and email it | None; they review yours | Part of the terms, nothing to sign | Accept at sign-up or in the admin | Generate and sign it in the app |
| Breach notice | Within [48] hours | Within 48 hours | Without undue delay | Not stated | Without undue delay | Without undue delay | Without undue delay |
| Notice of a new sub-processor | [30] days, object or leave with a refund | No day count, object and leave | 14 days, leave | Not stated | 15 days, object or leave with a refund | 30 days, object | 14 days, object or leave |
| Audits | Reports first, then once a year | No clause | Third-party audit results | Not stated | Reports first, then once a year | Certificates, documents, and interviews | At your cost |
| Deletion after you leave | [30] days, backups [30] days | Without undue delay, backups 30 days | Within 24 hours | 90 days after cancelling | No day count | 30 days, backups 60 days | On request |
| Transfers outside the EU | Standard contractual clauses | Not in the DPA | Not in the DPA | Not stated | Standard contractual clauses | Adequacy or standard contractual clauses | Standard contractual clauses and the Data Privacy Framework |

Checked on 2026-10-25: Plausible's [DPA](https://plausible.io/dpa) (updated September
2026), Fathom's [DPA](https://usefathom.com/legal/dpa) (2025-06-20), Simple Analytics'
[DPA page](https://www.simpleanalytics.com/data-processing-agreement) and
[terms](https://www.simpleanalytics.com/terms), Umami's [DPA](https://umami.is/dpa)
(2026-08-02), Matomo's [Cloud DPA](https://matomo.org/matomo-cloud-dpa/) (2025-10-09), and
PostHog's [DPA](https://posthog.com/dpa).

## Privacy tools in the product

| | misomoon | Plausible | Fathom | Simple Analytics | Umami Cloud | Matomo | PostHog |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Where hosted stats are stored | You pick per site: EU, US, or Asia-Pacific (a Cloudflare placement hint, not a guarantee) | EU only | Collected in the EU, stored in the US | EU only | US or EU, picked at sign-up and fixed | EU (Frankfurt) | US or EU (Frankfurt) |
| Retention you set per site | Yes, from 30 days to your plan's limit on Cloud | By plan | Kept while you subscribe | By plan | By plan | Yes | By plan |
| Longest hosted retention | 3 years on Growth and Scale, 2 years on Starter | 3 years, 5 on Business | While you subscribe | 1 month free; paid plans don't say | 6 months free, 2 years Pro, 5 years Business | Raw data by plan (24 months on Business), reports kept | 1 year free, 7 years paid |
| Exclude IP addresses | Yes, IPv4 and IPv6 ranges | Yes | Yes | IPv4 | Pro plan | Yes | Internal users filter |
| Global Privacy Control | Optional, per site | No | No | No | No | No | Read in its code, off by default |
| Do Not Track | Optional, per site | No | Optional | On by default | Optional | Off by default | Off by default |
| Opt-out button for visitors | Yes, in the dashboard | A downloadable opt-out page | A flag set from the console | No | A flag set by the site | An opt-out form and API | An API |
| Privacy policy text for your site | Written from your settings | Guidance only | Yes | Yes | No | Yes, a fill-in paragraph | No |
| Consent banner guidance by country | EU, France, Germany, UK, US | General | EU and UK | Partial | Partial | EU country by country | General |
| Legitimate interest and Article 30 templates | Yes | No | No | No | No | Article 30 help | No |
| Delete your own account | Yes, at once | Yes | Yes | Yes | Yes | After cancelling | Yes |
| Two-factor sign-in | No | Yes | Yes | No | Yes | Yes | Yes |
| Audit log | No | No | No | No | Enterprise plan | Yes | Paid plans |
| SOC 2 or ISO 27001 | No (Cloudflare has both) | No | No | Unclear | No | ISO 27001 | SOC 2 Type 2 |

Retention was checked on 2026-10-25 on [Plausible's plans](https://plausible.io/#pricing),
[Fathom's pricing](https://usefathom.com/pricing) ("Full analytics history while
subscribed"), [Simple Analytics' pricing](https://www.simpleanalytics.com/pricing),
[Umami's pricing](https://umami.is/pricing), Matomo's
[data retention FAQ](https://matomo.org/faq/general/configure-data-retention/), and
PostHog's [events retention](https://posthog.com/docs/data/events-retention).

Checked on 2026-10-25, on each vendor's own pages: Plausible's
[docs](https://plausible.io/docs) (opt-out, 2FA, account deletion; pages updated June to
October 2026) and [security page](https://plausible.io/security) (August 2026); Fathom's
[docs](https://usefathom.com/docs) and [compliance guides](https://usefathom.com/legal/compliance)
(September 2026); Simple Analytics' [docs](https://docs.simpleanalytics.com) and
[security page](https://www.simpleanalytics.com/security); Umami's
[docs](https://docs.umami.is) and [security page](https://umami.is/security) (22 October
2026); Matomo's [FAQ](https://matomo.org/faq/), [consent guide](https://developer.matomo.org/guides/tracking-consent),
and [ISO 27001 announcement](https://matomo.org/blog/2025/09/matomo-iso-27001-certification-2025/)
(24 September 2025); PostHog's [privacy docs](https://posthog.com/docs/privacy),
[activity logs](https://posthog.com/docs/settings/activity-logs), and
[trust center](https://trust.posthog.com). Simple Analytics calls itself SOC 2 certified
on one page and "in progress" on another. Data locations: Plausible's
[EU hosting page](https://plausible.io/eu-hosted-web-analytics), Fathom's
[data page](https://usefathom.com/data), Simple Analytics'
[compliance FAQ](https://docs.simpleanalytics.com/compliance-faq), Umami's
[Cloud FAQ](https://docs.umami.is/docs/cloud/faq), Matomo's
[Cloud data location FAQ](https://matomo.org/faq/in-which-locations-does-the-matomo-cloud-store-the-data/),
and PostHog's [data storage docs](https://posthog.com/docs/privacy/data-storage); misomoon's
Asia-Pacific placement follows Cloudflare's
[D1 data location](https://developers.cloudflare.com/d1/configuration/data-location/) page.

## Sources

Checked on 2026-10-24.

- Google Analytics: [cookie usage](https://support.google.com/analytics/answer/11397207),
  [EU user consent policy](https://www.google.com/about/company/user-consent-policy/),
  [data retention](https://support.google.com/analytics/answer/7667196),
  [MCP server](https://github.com/googleanalytics/google-analytics-mcp)
- Plausible: [self-hosted vs cloud](https://plausible.io/self-hosted-web-analytics),
  [Community Edition](https://github.com/plausible/community-edition),
  [data policy](https://plausible.io/data-policy),
  [Google import](https://plausible.io/docs/google-analytics-import),
  [proxy](https://plausible.io/docs/proxy/introduction),
  [script extensions](https://plausible.io/docs/script-extensions)
- Umami: [install](https://docs.umami.is/docs/install), [pricing](https://umami.is/pricing),
  [Web Vitals](https://docs.umami.is/docs/performance), [MCP](https://docs.umami.is/docs/mcp),
  [import](https://docs.umami.is/docs/cloud/import-data)
- Matomo: [requirements](https://matomo.org/faq/on-premise/matomo-requirements/),
  [cookies](https://matomo.org/faq/general/faq_157/), [funnels](https://matomo.org/docs/funnels/),
  [SEO Web Vitals](https://matomo.org/docs/seo-web-vitals/),
  [MCP plugin](https://plugins.matomo.org/McpServer),
  [Google importer](https://plugins.matomo.org/GoogleAnalyticsImporter)
- PostHog: [self-host](https://posthog.com/docs/self-host),
  [persistence](https://posthog.com/docs/libraries/js/persistence),
  [Web Vitals](https://posthog.com/docs/web-analytics/web-vitals),
  [MCP](https://posthog.com/docs/model-context-protocol),
  [Google migration](https://posthog.com/docs/migrate/google-analytics)
- Rybbit: [self-hosting](https://rybbit.com/docs/self-hosting),
  [self-host vs cloud](https://rybbit.com/docs/self-host-vs-cloud), [MCP](https://rybbit.com/docs/mcp),
  [import](https://rybbit.com/docs/data-import)
- Fathom: [pricing](https://usefathom.com/pricing), [compliance](https://usefathom.com/compliance),
  [data](https://usefathom.com/data), [Fathom Lite](https://github.com/usefathom/fathom)
- Simple Analytics: [pricing](https://simpleanalytics.com/pricing),
  [compliance](https://docs.simpleanalytics.com/compliance)
- Cloudflare Web Analytics: [product page](https://www.cloudflare.com/web-analytics/),
  [FAQ](https://developers.cloudflare.com/web-analytics/faq/),
  [Core Web Vitals](https://developers.cloudflare.com/web-analytics/data-metrics/core-web-vitals/)
- DataFast (2026-10-25): [home and pricing](https://datafa.st/),
  [cookieless tracking](https://datafa.st/docs/gdpr-cookieless-tracking),
  [payment providers](https://datafa.st/docs/connect-payment-provider),
  [MCP](https://datafa.st/docs/mcp-introduction), [DPA](https://datafa.st/dpa) (updated
  2025-08-09), and its [docs index](https://datafa.st/llms.txt). The cookie lifetimes come
  from reading its `script.js`.
- Pirsch (2026-10-25): [pricing](https://pirsch.io/pricing),
  [Google import](https://docs.pirsch.io/get-started/ga-import),
  [MCP](https://docs.pirsch.io/integrations/mcp),
  [core library](https://github.com/pirsch-analytics/pirsch)
- Vercel Web Analytics (2026-10-25): [overview](https://vercel.com/docs/analytics),
  [limits and pricing](https://vercel.com/docs/analytics/limits-and-pricing),
  [using Web Analytics](https://vercel.com/docs/analytics/using-web-analytics),
  [Speed Insights pricing](https://vercel.com/docs/speed-insights/limits-and-pricing),
  [Vercel MCP](https://vercel.com/docs/agent-resources/vercel-mcp),
  [compliance](https://vercel.com/docs/security/compliance)
- GoatCounter (2026-10-25): [home](https://www.goatcounter.com/),
  [FAQ](https://www.goatcounter.com/help/faq), [privacy](https://www.goatcounter.com/privacy),
  [API](https://www.goatcounter.com/api), [repository](https://github.com/arp242/goatcounter)
- Swetrix (2026-10-25): [pricing](https://swetrix.com/pricing),
  [repository](https://github.com/Swetrix/swetrix), [performance](https://swetrix.com/performance),
  [data import](https://swetrix.com/docs/data-import), [security](https://swetrix.com/security)
- Mixpanel (2026-10-25): [pricing](https://mixpanel.com/pricing),
  [JavaScript SDK](https://docs.mixpanel.com/docs/tracking-methods/sdks/javascript),
  [EU residency](https://docs.mixpanel.com/docs/privacy/eu-residency),
  [MCP](https://docs.mixpanel.com/docs/mcp),
  [security overview](https://mixpanel.com/legal/security-overview/)
- Microsoft Clarity (2026-10-25): [FAQ](https://learn.microsoft.com/en-us/clarity/faq),
  [cookies](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-cookies),
  [consent mode](https://learn.microsoft.com/en-us/clarity/setup-and-installation/consent-mode),
  [data retention](https://learn.microsoft.com/en-us/clarity/setup-and-installation/data-retention),
  [funnels](https://learn.microsoft.com/en-us/clarity/setup-and-installation/funnels),
  [MCP server](https://learn.microsoft.com/en-us/clarity/third-party-integrations/clarity-mcp-server)
- Star counts and licenses: the GitHub API, read on 2026-10-24, and on 2026-10-25 for
  GoatCounter and Swetrix.
