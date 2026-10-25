# First-party proxy

Ad blockers and privacy browsers drop requests to known analytics hosts. Serving
misomoon from the site's own domain makes the tracker and its beacons first-party, so
they count the visitors a third-party script would miss.

There are two ways to do it. Both are in the dashboard under **Settings** > **Install**,
in the **Proxy** card, filled in for the current site.

## 1. Managed subdomain

The site adds one DNS record:

```text
stats.example.com  CNAME  proxy.misomoon.com
```

and enters `stats.example.com` in Settings. misomoon registers it as a Cloudflare for
SaaS custom hostname, Cloudflare issues the certificate (HTTP validation, usually a few
minutes once the CNAME resolves), and the site loads:

```html
<script defer src="https://stats.example.com/m.js?s=example"></script>
```

The browser talks to that hostname directly, so the visitor's IP and full location
arrive exactly as without a proxy. On a customer hostname the Worker only answers
`/m.js`, `/api/event` and `/overlay.js`; everything else is a 404.

The hostname must be a subdomain of the site's domain (not `www`), one per site.
If Cloudflare asks for TXT records (for example while the CNAME is proxied through
another CDN), Settings lists them next to the CNAME.

API (needs the edit permission, so an editor's session or an API key for the site works):

| Method | Path | |
|---|---|---|
| `GET` | `/api/v1/sites/:id/proxy` | state; refreshes from Cloudflare until live |
| `PUT` | `/api/v1/sites/:id/proxy` | `{ "hostname": "stats.example.com" }` |
| `DELETE` | `/api/v1/sites/:id/proxy` | removes the custom hostname |

### Enabling it on your own deployment

1. On the zone that owns the target (say `misomoon.com`), enable Cloudflare for SaaS,
   create `proxy.misomoon.com` (proxied) and set it as the fallback origin.
2. Route customer hostnames to the Worker: add `{ "pattern": "*/*", "zone_name":
   "misomoon.com" }` to `routes`, after the app's own route. misomoon Cloud's routes are
   in `apps/api/wrangler.cloud.jsonc`. A self-hosted server adds `routes` to
   `apps/api/wrangler.jsonc`, with its own domain first.
3. Set `CF_ZONE_ID` and `PROXY_CNAME_TARGET` as vars and `CF_API_TOKEN` as a secret
   (token permission: *SSL and Certificates: Edit* on that zone).
4. Apply the control migrations. [`apps/api/migrations/control/0002_sites.sql`](../apps/api/migrations/control/0002_sites.sql) creates the `proxy_domains` table.

Without these settings `GET …/proxy` reports `available: false`, `PUT` answers 501
and the dashboard points to the snippets.

## 2. One-click deploy

Templates in `templates/` deploy a ready proxy to the site owner's own account, then
they add a subdomain to it:

| | Button | Then add the domain under |
|---|---|---|
| Cloudflare Worker (`templates/proxy-cloudflare`) | [Deploy to Cloudflare](https://deploy.workers.cloudflare.com/?url=https://github.com/jackzard/misomoon/tree/main/templates/proxy-cloudflare) | Worker → Settings → Domains & Routes |
| Vercel (`templates/proxy-vercel`) | [Deploy with Vercel](https://vercel.com/new/clone?repository-url=https://github.com/jackzard/misomoon/tree/main/templates/proxy-vercel&project-name=misomoon-proxy&repository-name=misomoon-proxy) | Project → Settings → Domains |

Both buttons clone from GitHub, so the repository has to be public. The Worker reads
`MISOMOON_URL` (default `https://app.misomoon.com`); the Vercel template has it in
`vercel.json`. The links come from `deployLinks()` in `packages/core/src/snippets.ts`.

## 3. Your own proxy

Map three paths under a prefix of your choice to misomoon:

| On your site | Upstream |
|---|---|
| `<prefix>/m.js` | `https://app.misomoon.com/m.js`, with the query string |
| `<prefix>/api/event` | `https://app.misomoon.com/api/event` |
| `<prefix>/overlay.js` | `https://app.misomoon.com/overlay.js` |

`m.js?s=<site id>` carries the site id, and the server adds the code for the features
ticked in the site settings ([tracking guide](tracking.md#choose-what-to-track)). Pass
the query string through: without it the tracker doesn't know the site and counts
nothing.

`overlay.js` loads only on a page the dashboard opens to draw clicks over it
([tracking guide](tracking.md#see-what-people-do-on-a-page)). A proxy without it still
tracks everything, but **Show on your site** stays empty.

Then load `<script defer src="<prefix>/m.js?s=example">`. The tracker posts to
`api/event` next to wherever its script came from, so there is nothing else to
configure (`data-api` still overrides it). Pick a neutral prefix: words like
`analytics`, `tracking` or `stats` are on filter lists. The default is `/relay`.

Ready-made versions live in `packages/core/src/snippets.ts` (Settings shows them with
your site's values): Cloudflare Worker, Next.js, Vercel, Netlify, Nginx, Caddy and
SvelteKit.

In Next.js, `withMisomoon()` from `@misomoon/sdk/next` adds the same three rewrites to
your config ([SDK guide](sdk.md#serve-the-tracker-from-your-nextjs-app)).

### Visitor IP and location

Behind a proxy the request reaches misomoon from the proxy, so the Worker reads the
visitor from headers (`edgeFromRequest` in `packages/core/src/proxy.ts`):

- **IP**, used only for the daily visitor hash and never stored: `x-misomoon-ip`, else
  the first `X-Forwarded-For` hop, else `X-Real-IP` and friends.
- **Location**: `x-misomoon-country`, `-region`, `-city`, `-continent`, `-timezone`,
  `-as-org` (URL-encoded), else Vercel's `x-vercel-ip-*`, Netlify's `x-country`, or
  `cf-ipcountry`. Without any of them, location is unknown; visitors still count.
- A request counts as proxied when the forwarded IP differs from the connecting one
  and the request carries a proxy's mark: `x-misomoon-ip`, Vercel's `x-vercel-id`,
  Netlify's `x-nf-request-id`, Cloudflare's `cf-worker`, or an `X-Forwarded-Host` for
  another host. A bare `X-Forwarded-For` (corporate proxies, VPNs) is ignored. Then Cloudflare's own geo and bot score describe the proxy, so they are ignored;
  user-agent bot detection still runs.

| Setup | Location |
|---|---|
| Managed subdomain, Cloudflare Worker | full |
| Vercel, Next.js on Vercel, Netlify, SvelteKit on Cloudflare | what the platform forwards |
| Nginx, Caddy, other self-hosted | unknown, unless you add `x-misomoon-country` (e.g. from the GeoIP2 module or `CF-IPCountry` when Cloudflare sits in front) |

Anyone can send these headers. A script that sends them picks the address and the
location of each beacon and skips Cloudflare's bot score, so one machine can count as
many visitors. The user-agent check, the site's hostname check, and the site's daily
event cap still apply. Without the headers, the same script could fake beacons from
many addresses, as with any analytics endpoint that a browser can reach.

The Worker, SvelteKit, Nginx and Caddy snippets drop the site's cookies on the way
through. Platform rewrites (Next.js, Vercel, Netlify) forward them; misomoon never reads
or stores cookies.
