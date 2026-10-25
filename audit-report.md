# Pre-launch audit

Date: 2026-10-25. Base: `ef100e5` (Baseline before pre-launch audit). Nothing is live yet, so
every tracked file was in scope: each target's live base is the empty tree. No deploy, no
write to remote state, no call to Polar or any payment provider, and no email was sent.

## Verdict

**SHIP WITH FIXES.** Every confirmed bug found in the audit is fixed, tested and committed (94
commits on `main` since `ef100e5` before this report, none pushed). No P0 or P1 is open.
The "with fixes" part is the launch steps nobody could check here: the Polar sandbox run, the first Cloud deploy with
the new `deploy:cloud` script, and the Deploy to Cloudflare button. Each one is listed under
[Not verifiable locally](#not-verifiable-locally), with steps.

## Counts

| | Baseline (`ef100e5`) | Final |
| --- | --- | --- |
| `pnpm test` | 1,074 passed | 1,161 passed |
| packages/core | 325 | 333 |
| packages/tracker | 54 | 56 |
| packages/sdk | 153 | 154 |
| apps/api | 329 | 367 |
| apps/dashboard | 65 | 79 |
| apps/landing | 104 | 116 |
| apps/docs | 44 | 56 |
| WordPress plugin (`node plugins/wordpress/test/run.mjs`, not part of `pnpm test`) | not counted | 8 passed |
| `pnpm check` | 0 errors | 0 errors, 0 warnings |
| `pnpm build` | passed | passed |
| `pnpm bundle` | passed | passed (`deploy/` is ready: misomoon 0.1.0, 2 shards) |
| Coverage ledger | 684 entries | 699 entries: 312 clean, 176 fixed, 207 excluded, 4 reverted, 0 open |

Some counts went down where tests were removed as slop (see [Cleanups](#cleanups)), so the
final numbers are net of removals.

The protected tests pass and none was loosened: `apps/docs/src/lib/coverage.test.ts`, the
m.js 1,000-byte gzip limit in `packages/tracker/test/m.test.ts`, the index allow-list in
`packages/core/test/indexes.test.ts`, and the SDK budgets in
`packages/sdk/test/treeshake.test.ts`. Against `ef100e5`, the only change to any of them
adds one test to `indexes.test.ts` (F12); the allow-list itself is unchanged.

## How it was reviewed

- A coverage ledger of every tracked file. Each file was read by a sweep or by hand and is
  marked clean, fixed, finding, or excluded (binary assets, lockfiles, vendored skills).
- Haiku sweeps covered the dashboard, revenue and imports, docs pages against code, the
  landing site, templates and brand, and every competitor claim. Each finding was checked
  in the code by hand before it was fixed or refuted. Refuted findings are listed below.
- Every code fix has a test that failed for the right reason before the fix. Template-only
  fixes in Svelte components with no component test harness say so in the table.
- Each fix is its own commit on `main`. Nothing was pushed.

## Findings

Severity: P1 HIGH blocks launch, MEDIUM breaks a documented flow or leaks data in an edge
case, LOW is a small defect or a doc error.

| ID | Area | Severity | Where | Fix | Test | Commit |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | api tests | LOW | `apps/api/test/email.test.ts:61`, `:137-150` | Removed tests for the removed REPORT_FROM name and Resend provider (legacy) | n/a, test-only | 665587c |
| F2 | api, email | MEDIUM | `apps/api/src/reports.ts:112`, `usage.ts:268` | Cloud's cron and queue emails link to the dashboard, not the landing site | deploy.test.ts "links misomoon Cloud's emails to its dashboard, and leaves that address out of the bundle" | f8e45ce |
| F3 | self-hosting | HIGH | `apps/api/wrangler.jsonc`, `docs/self-hosting.md` | Split configs (your decision): `wrangler.jsonc` is the self-hosted template (placeholder database ids, workers.dev, no route, self-hosted vars); Cloud's config moved unchanged to `wrangler.cloud.jsonc`, deployed with `pnpm --filter @misomoon/api run deploy:cloud`; `deploy.ts` and `migrate.ts` take `--config` or `WRANGLER_CONFIG` | deploy.test.ts: 8 new, including "deploys wrangler.jsonc as a new self-hosted server: placeholder database ids, a workers.dev address, no misomoon.com route" and "builds deploy/ from wrangler.jsonc, so no misomoon Cloud database id, route or address reaches it" | 2f35010 |
| F4 | plans | MEDIUM | `packages/core/src/plans.ts` siteLimitMessage | Limit errors point to Settings > Team plan buttons | core plans.test.ts "site limit message …" | b3458de |
| F5 | WordPress | MEDIUM | `plugins/wordpress/misomoon/uninstall.php` | Uninstall clears payment retries queued with arguments | run.mjs "deleting the plugin removes its settings and the payment retries queued with their arguments" | c1423bd |
| F6 | WordPress | MEDIUM | `includes/client.php` misomoon_visitor_ip | A filter returning no address falls back to the real one | run.mjs "a misomoon_visitor_ip filter that returns no address falls back…" | c1423bd |
| F7 | WordPress | LOW | `includes/client.php` misomoon_hand_out_ref | A ref the server refused is dropped | same as F6 | c1423bd |
| F8 | WordPress | LOW | readme, tracker gating | Editors get no tracker, as the readme says | run.mjs "admins and editors get no tracker…" | c1423bd |
| F9 | SDK | LOW | `packages/sdk` payment() | Refuses amounts over the server's 1e9 cap | node.test.ts "refuses %j without a request" | 7697ce7 |
| F10 | SDK docs | LOW | `docs/sdk.md` | Bearer fallback, ignore() key, address order, callback timing | n/a, docs | 7697ce7 |
| F11 | SDK tests | LOW | `react-native.test.ts` | Removed an assertion on a field no payload has | n/a, test slop | 7697ce7 |
| F12 | queries, index | MEDIUM | `packages/core/src/queries.ts` eventWhere | Entry and exit page filters read only visits that can reach the window | indexes.test.ts "entry and exit page filters > read only the visits that can reach the window" | c20da7f |
| F13 | security, sharing | HIGH | `migrations/control/0006_reports.sql:9`, segment delete route | 409 on deleting a segment a link uses; 400 on a link to another site's or a personal segment | api.test.ts "refuses to delete a segment a link is limited to…", "limits a link only to a segment of its own site that every editor sees…" | 0720177 |
| F14 | security, sharing | MEDIUM | `apps/api/src/stats.ts` behaviorStats | A page interaction report keeps the link's forced filter | api.test.ts "applies the link's segment to a page interaction report for another page" | 0720177 |
| F15 | privacy | LOW | `auth.ts:93`, `accounts.ts:131` | Expired sessions and reset links deleted every hour, as privacy.md promises | api.test.ts "forgets expired sign-in sessions and password reset links every hour" | 5bc4ccb |
| F16 | docs | LOW | `docs/configuration.md` | Cleanup runs daily at 03:15 UTC, not hourly | n/a, docs | 5bc4ccb |
| F17 | tracker, security | MEDIUM | `packages/tracker` x/errors.js | Error counts kept off Object.prototype | interactions.test.ts "reports an error named like a built-in property without touching the page's objects" | 0c7d79a |
| F18 | tracker, privacy | LOW | tagged link url prop | Query dropped (signed URL tokens) | interactions.test.ts "sends a tagged link's url without its query…" | 0c7d79a |
| F19 | ingest, privacy | MEDIUM | `packages/core` parse | Referrer path masked like the page path; Android app referrers; error source query | parse.test.ts "masks an email or a token in the referrer path, as in the page path", "stores an Android app referrer as its address, without the query"; behavior.test.ts "drops a script URL's whole query…" | ac15c6a |
| F20 | ingest | MEDIUM | search term from beacon `q` | Search term read from the page URL only | api.test.ts "reads a site search term from the page URL only, not from a field the beacon sets" | e5ccf5c |
| D1 | dashboard | HIGH | invite while signed in as another email | A way out of the dead end | account.test.ts otherAccount (2) | 2cf99dc |
| D2 | dashboard | HIGH | Board dropped Details filterFor | Clicking a Details row filters correctly | template, no component harness | 2cf99dc |
| D3 | dashboard | MEDIUM | Settings effects | A save no longer resets other cards' edits | template | 2cf99dc |
| D4 | dashboard | MEDIUM | plan card, no plan and no trial | Shows what the team can't do | plan.test.ts "shows a team with no plan and no trial what it can't do…" | 2cf99dc |
| D5 | dashboard | MEDIUM | `?metric=events` | Falls back to People | url.test.ts "falls back to People for a metric the chart has no tile for" | 437deb8 |
| D6, D9 | dashboard | MEDIUM | Paths refresh and error | Refresh skips the cache; errors replace skeletons | journeys.test.ts | 80ae69b |
| D7, D8 | dashboard | MEDIUM | Behavior list, Overview brief | Errors replace skeletons | template | 2df5b2c |
| D11 | dashboard | MEDIUM | report preview | Refuses to open an error answer as HTML | api.test.ts "refuses to show an error answer as a report preview" | ca0defb |
| D12 | dashboard | MEDIUM | import poll | Own counter, Settings lists stop reloading every 4 s | component | 4813bf2 |
| D13 | dashboard | MEDIUM | FirstVisit copy | No unhandled rejection on http | component | 81e922f |
| D14 | dashboard | MEDIUM | "live demo" label | Only the demo site | account.test.ts liveDemo | 94bb18d |
| D15 | dashboard | MEDIUM | expired reset link | Can ask for another | template | 2cf99dc |
| D16 | dashboard | MEDIUM | double Enter on notes, saved filters | In-flight guards | component | fe0f763 |
| D17 | dashboard | MEDIUM | Resource with a null URL | Stops loading, clears the error | resource.svelte.test.ts | 19c2b79 |
| D18–D25 | dashboard | LOW | role menu, funnel site switch, Landed on lens, zoom brush, threshold default, moneyShort, test names, upload input | See commits | format.test.ts (D23), url.test.ts (D24); the rest template or component | 118906b, e71909e, 1d08820, 520d08b, b266bc0, 999c91f, 3783af8, 7c0329f |
| D-x | dashboard | LOW | `labels.ts` `key in SOURCE_DOMAINS` | Prototype keys no longer match | labels.test.ts | 846a65d |
| Polar | billing | MEDIUM | Settings > Revenue | Accepts the 32-character secret `polar webhook listen` prints | "takes the secret `polar webhook listen` prints…" | 2a599ec |
| R4 | revenue | MEDIUM | settle | Compare-and-set keeps the strongest key | revenue.test.ts "keeps the ref when its beacon is handled while the webhook is still crediting the customer" | b5d96d7 |
| R6 | revenue docs | LOW | tracking.md, revenue.md | Tracker revenue plus a webhook counts twice | n/a, docs | c4782eb |
| R7, R20 | imports, privacy | MEDIUM | `imports.ts` | Stopped imports fail; the Google grant is deleted when an import ends | imports.test.ts "drops the Google grant when the import fails", "fails an import cut off for an hour…" | f0ebecb |
| R8 | imports | MEDIUM | per-day offset | Each day at its own midnight across DST | "stores each day at that day's midnight in the site's time zone, across a DST change" | e140919 |
| R9 | security, Search Console | MEDIUM | search terms on shared and public dashboards | Members only: 403 for shared links, public viewers and MCP share keys; the tab is hidden for them (your decision) | imports.test.ts "search terms are for the team only" (4) | 7969dbd |
| R10 | revenue | MEDIUM | refund.failed and refund.updated | Money given back | revenue.test.ts (3) | 2e8ec74 |
| R11 | revenue | MEDIUM | Stripe invoice_payment.paid | Renewal refunds credited on 2025-03-31+ API versions | "takes a renewal refund off its source on API versions whose invoices name no payment" | 76bde6e |
| R16 | imports, privacy | LOW | GA pull | Stops pulling languages no report reads | "pulls from Google only what the reports read" | 374df58 |
| R17 | imports | MEDIUM | GA4 events | Outbound clicks, downloads and form submissions mapped | "files Google's outbound clicks…" | df58041 |
| R18, R19 | imports, security | MEDIUM | GA URL | Property id checked, page token encoded | imports.test.ts | a7aa2ee, 928a9f6 |
| R21 | security, OAuth | MEDIUM | Google connect | State also kept in an HttpOnly, SameSite=Lax cookie on `/api/v1/google`; the callback refuses without it (your decision) | api tests "Google sign-in" (3) | be5a8e7 |
| — | dashboard | LOW | `apps/dashboard/src/views/Settings.svelte` | Says why a Google sign-in came back with `google_error=` | google.test.ts (3) | 9101ebb |
| R22 | Search Console | LOW | token revoke | Token in the body, not the URL | imports.test.ts | 4e89053 |
| R23 | Search Console | LOW | has_more | Correct on a full page | core search-console.test.ts | cc9f35d |
| R24 | sample site | LOW | setup | Retried when goals or funnels failed | sample.test.ts | a134867 |
| R25 | seed | LOW | seed script | Refuses a non-local API_URL | seed.test.ts | d77620d |
| — | imports | MEDIUM | failed import | Rows it wrote are taken back | imports.test.ts | ed97233 |
| — | proxy | LOW | Worker proxy | Passes DNT, GPC and Accept-Language through | proxy.test.ts | 6d51ed4 |
| — | email | LOW | SES failure log | Logs only the error type | email.test.ts | 7fadb5f |
| P4–P7 | docs site | MEDIUM | `apps/docs/src/lib/search.ts` | Whole-text index, snippet, failure retry, combobox ARIA | search.test.ts (3) | 753326d |
| P9, P10 | docs site | LOW | phone menu | Focus, Escape, hidden when shut | svelte-check only | 794903b |
| P11 | docs site, security | LOW | `render.ts` resolveHref | `javascript:` and `data:` links fail the build | render.test.ts "fails the build on a link that runs script or embeds data" | 13456a8 |
| P8 | security headers | LOW | api catch-all, landing, docs | frame-ancestors, X-Frame-Options, nosniff, Referrer-Policy | api.test.ts "dashboard pages refuse to load in a frame on another site, except the demo and shared links"; hooks.server.test.ts | 41e4f96, 926e034, 739e8ce |
| P13–P19 | docs | LOW | code blocks | Every block names a language the highlighter loads | docs.test.ts "name a language the highlighter loads on every code block" | fd7f262 |
| P14 | brand | LOW | dark shadow | 6px | n/a | 2534549 |
| G1–G3 | docs, self-hosting | HIGH | `docs/self-hosting.md:41-44`, `:86-91`, `apps/api/scripts/bundle.ts:41` | Fixed with F3: the first deploy now creates the databases and prints a workers.dev URL, and the bundle carries placeholder ids the button replaces | same deploy.test.ts tests | 2f35010 |
| G4 | docs | MEDIUM | `docs/content.md:92-100` | The page example has a body; content.md says a body is required | n/a, docs | 0c02e43 |
| G5 | docs | LOW | `docs/troubleshooting.md:89-92` | Each sign-in route has its own per-IP limit | n/a, docs | 0c02e43 |
| L19 | privacy notice | MEDIUM | `packages/core/src/privacy.ts:169`, `:171` | The notice says the opt-out is kept in the browser and a visit open at midnight UTC keeps both days' ids | privacy.test.ts "…" (exact sentences) | fb8d553 |
| L3, L4 | landing | MEDIUM | `+page.svelte`, `features/+page.svelte`, `alternatives/+page.svelte` | Claims about misomoon only, none about unnamed other tools | n/a, copy | 042ee08 |
| L5, L11 | landing, security | MEDIUM | `apps/landing/src/lib/server/content.ts` | An unparseable profile link no longer breaks the author's pages; `/\` links refused | content.test.ts "refuses a profile link the pages cannot parse, and an avatar path that leaves the site", "drops a link that starts with a backslash after the slash…" | 8f09ebe |
| L6 | landing | LOW | `pages.ts` comment | Comment corrected (a missing CONTENT binding is allowed) | n/a | 69e1392 |
| L7 | landing, a11y | LOW | `Reflection.svelte` | Screen readers get the real days | Reflection.test.ts "lists only the days it has when there are too few to draw" | 3a8cdfb, 0dc66fc |
| L8, L9, L17 | landing, SEO | LOW | `seo.ts`, blog and author pages | Each older page of posts has its own title; author descriptions fit 70–160 characters | seo.test.ts "gives each older page of a list a title of its own, from its newest post", "keeps an author description between 70 and 160 characters" | 85c9080 |
| L12 | landing | MEDIUM | blog `?cursor=` | A made-up cursor answers 404 and caches nothing | api.test.ts "answer 404 to a cursor the blog never handed out, and cache nothing for it" | 69e1392 |
| L14 | landing | MEDIUM | nav, footer, error page, sitemap | Blog is linked only once a post is published (your decision) | api.test.ts "the Blog link" (2) | 67d2060 |
| L18, L19, L21, L24 | landing, privacy | HIGH | home, pricing, `llms.txt`, `alternatives.ts` FAQ | The site no longer says misomoon stores nothing on the device (the opt-out keeps one flag) or never keeps what anyone types (site search keeps the URL term) | n/a, copy | f289b60 |
| L20 | landing | MEDIUM | home | On Cloud, support sets the daily cap | n/a, copy | f289b60 |
| L22 | landing | LOW | home | Lists all 13 MCP tools | page.test.ts "names every MCP tool the API serves" | f289b60 |
| L13, L25–L31 | blog posts, docs | MEDIUM | `content/posts/*.md`, `docs/revenue.md`, `docs/tracking.md` | Posts match the code: 25 months' retention on a new Cloud site, the 30 px rage-click radius, what never counts as a dead click, all seven Stripe events; refunds carry no `billing` prop | n/a, copy | 88781ac |
| MCP | api | MEDIUM | `apps/api/src/mcp.ts:80` | `add_annotation` is no longer called read-only, so clients that ask before a write ask | api.test.ts "marks only add_annotation as a tool that writes" | 36b4db7 |
| SSR | docs site | n/a (your request) | `apps/docs` | The docs site renders each page in a Worker (adapter-cloudflare) instead of prerendering: one page at a time with only the grammars it needs and Shiki's JavaScript regex engine, cached per data center and build; a test now checks every link to a page or heading, which the prerender crawl did; canonical URLs are always `https://docs.misomoon.com` | hooks.server.test.ts (4), docs.test.ts "link only to pages and headings that exist", "render one page on its own…"; checked in `wrangler dev`: `/api` 117 ms cold, 4 ms cached | dcbf8a0 |
| — | billing | HIGH | `apps/api/src/accounts.ts` team and account deletion | Refused with 409 while the team's Polar plan still renews, so a deleted team can't keep charging the card (your decision) | api.test.ts "refuses to delete a team, or the account that is its only member, while its Polar plan still renews" | 7e076dd |
| R1 | security, email | HIGH | `apps/api/src/index.ts` report routes | At most 10 test reports a site an hour (then 429) and 20 report and alert subscriptions a site (then 400), counted in the new `report_tests` table that the hourly run trims (your decision) | email.test.ts "report limits" (3) | b401259 |
| L1, L2 | landing, rules | n/a | footer, `/llms.txt` | Kept; AGENTS.md now allows landing code to print names read from `alternatives.ts` (your decision) | n/a | 5b2d4e0 |

### Refuted

- R5 Stripe ISK and UGX: the API uses two decimals for them (Stripe's currency special cases).
- R14 `fromBase64` returns null, it does not throw.
- D10 the filter box searches while values are ticked, by design (dashboard.md clarified, f91eae6).
- SDK C2, C5, C6: the docs, the queue test and the SSR test are correct.
- The overlay `;` in a page path: the page parameter skips the filter grammar.
- Several competitor-claim downgrades by the sweep agents were wrong and were kept as they
  were, with the vendor page that shows it: Matomo paid plugins and cookie default, the
  Umami audit log, Swetrix feature flags, PostHog GPC, Plausible SPA, time on page and
  scroll, Fathom DNT, and the DataFast cookie.

### By design, not changed

- R12 custom refunds come from the site's own server. R13 is documented in revenue.md Limits.
- R15 the 404 for a missing webhook names it, to help setup; site ids are public slugs.

## Cleanups

- Tests removed as slop: the REPORT_FROM and Resend tests (F1), an SDK assertion on a
  field no payload has (F11), a duplicate long-visit test (c20da7f), three range-only query
  tests that exact tests in parity.test.ts and time.test.ts cover (f247801), and test names
  made to say what they check (35cd4b0, 3783af8).
- Dead code removed: dashboard `stream`, `peek`, `Model`, `isProp` (19e8b11).
- A tsc error in core `proxy.test.ts` (17508b3) and one in `imports.ts` (928a9f6).

## Wording, SEO and legal changes

- Meta descriptions on docs and the home page fit 160 characters as whole sentences
  (5972c4f, 0d598d9); two landing links to the docs fixed (31ec811).
- README lists the docs site, the SDK and the WordPress plugin (29248fc); CONTRIBUTING
  lists every package and the docs-with-code rule (bddbba0); SECURITY.md matches the
  security page (aef73af); CHANGELOG sizes (155defb, 40b63c7).
- Every competitor claim rechecked against the vendor's own pages, with one checked date,
  2026-10-25, in `alternatives.ts`, `docs/comparison.md` and the README table (f77c4f1).
- Legal pages, as you approved (fb8d553): privacy.md names Polar Software, Inc. as merchant
  of record, lists the plan state misomoon keeps in place of billing details it does not
  keep, and says when a Google Analytics import token is deleted; dpa.md makes the same
  account-data and Polar points, adds the midnight UTC exception to the visitor id, and
  explains in Annex 3 why Polar is not a sub-processor; terms.md section 5 summarises the
  plans (linking cloud.md), Polar as merchant of record, monthly billing in US dollars, the
  7-day trial once per person without a card, and the stop at 125%. The placeholders in
  square brackets that were there before (retention of support email, the AWS row, the
  notice period, dates) are still placeholders for you to fill.
- `AGENTS.md`: the competitor rule (5b2d4e0) and the docs site description (dcbf8a0).
- `docs/content.md` and `docs/troubleshooting.md` (0c02e43), `docs/import.md` (be5a8e7,
  9101ebb), `docs/sharing.md`, `docs/api.md`, `docs/mcp.md` (7969dbd, 36b4db7),
  `docs/self-hosting.md`, `docs/configuration.md`, `docs/upgrading.md`, `CONTRIBUTING.md`
  (2f35010).

## Not verifiable locally

| What | Why | Steps |
| --- | --- | --- |
| Polar sandbox: version header, metadata copy, subscription status, customer reuse, webhook-id on retries, 402/403/409 and pending_update, menu paths | The audit may not call Polar | Follow `docs/billing.md` "Test billing" with `POLAR_SERVER=sandbox`, a staging Worker and card 4242 4242 4242 4242; check each of billing.ts:96, :114, :140-160, :259-260, :295, :314-315, :326, :368, :371 |
| `polar webhook trigger --dry-run` fixtures | The Polar CLI calls Polar's API | Run it against the sandbox and compare the payloads with `apps/api/test/billing.test.ts` |
| Vercel forwarding of the visitor IP (P3) | Needs a Vercel deploy | Deploy `templates/` proxy on Vercel, send a pageview, confirm the stored country matches yours |
| CF-Connecting-IP on a Worker subrequest (P18) | Needs two Workers on Cloudflare | Deploy the proxy Worker in front of a staging API and check the country |
| Cloud shard regions (`us`, `eu`, `apac` jurisdictions and location hints) | Needs the Cloud account | `wrangler d1 info` on each shard, read-only |
| The Deploy to Cloudflare button with the `deploy` branch | Needs a public repo and a Cloudflare account | Push `deploy/`, open the button in a fresh account, check databases and queues are created and the URL works |
| github.com/jackzard/misomoon and misomoon.com links | The repo is private and the site is not live | Re-run the external link check after launch |
| Third-party admin paths in shopify.md, webflow.md, framer.md, ghost.md, squarespace.md, wix.md, carrd.md | Need accounts on each platform | Follow each guide once |
| The first misomoon Cloud deploy after the config split | No deploys | Run `pnpm --filter @misomoon/api run deploy:cloud` once from a clean checkout; `pnpm run deploy` now deploys the self-hosted template, not Cloud |
| The docs site on Workers | No deploys | `pnpm --filter @misomoon/docs deploy`; open `/api`, `/api.md`, `/search.json`, `/privacy` (301) and a missing page (404); check the second load is served from cache |

## Decisions for you

Answered during the audit: F3 split configs, legal proposals applied, R9 members only, R21
the cookie, L1/L2 allowed in AGENTS.md, L14 hide Blog, docs SSR, R1 cap test sends, and
refuse to delete a team while its plan renews.

Still open, none blocking launch:

1. **Report recipients aren't confirmed (rest of R1).** Test sends and subscriptions are now
   capped, but a recipient still gets no confirmation email and no unsubscribe link. Add a
   one-click unsubscribe before email volume grows.
2. **Trial on re-signup.** The one trial per person is tied to the account; deleting the
   account and signing up again with the same email gives a new trial.
3. **SDK test helpers exported from entry points** (`cleanIp`, `visitorHeaders`,
   `appUserAgent`, `campaignQuery`, `createNativeClient`, `proxyPrefix`). Un-exporting them
   changes the public API, so they were left.
4. **Brand contrast (P6)** and **unused brand SVGs, docs images in the build (P20).**
5. **Optional proxy auth** for the Worker proxy template.
6. **The docs coverage test matches on prefixes (P12),** so a documented route can cover a
   longer undocumented one. Tightening it is a test change, so it is your call.
7. **Saved segment upsert race (D16, LOW):** two saves at once can hit the unique index as
   a 500 instead of updating.
8. **One Google sign-in cookie for both flows:** starting an import sign-in and a Search
   Console sign-in at the same time refuses the first one, which then has to be started
   again.
