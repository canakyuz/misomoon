# Track your site

This guide adds the misomoon tracker to a website and sends custom events and revenue.
It assumes you already run misomoon, either on your own Cloudflare account
([self-hosting](self-hosting.md)) or locally.

The core tracker is `m.js`, under 1 KB gzipped. Each feature you tick in the site settings adds
its own code to the same file ([Choose what to track](#choose-what-to-track)). It sets no cookies and stores nothing on the
visitor's device. Each visitor gets an id that is a hash of a daily salt, the site, the
IP address, and the user agent. The salt changes every day at 00:00 UTC, and the IP
address is never stored. [Architecture](ARCHITECTURE.md#ingest) explains the details.

## Add the script

1. In the dashboard, add your site's domain. A new account sees the form on its first
   screen; later sites go in **Settings** > **Sites**. The dashboard then opens the
   install snippet, which carries the site id.
2. Paste the snippet into the `<head>` of every page:

   ```html
   <script defer src="https://analytics.example.com/m.js?s=your-site"></script>
   ```

3. Open your site in a browser. Within a few seconds, you appear in **Live** in the
   dashboard.

The server counts a page only on the site's domain or one of its subdomains, so visits on
`localhost` are left out. A browser the tracker doesn't count says why in its console, for
example `misomoon skipped: bot`.

Single-page apps need nothing extra. The tracker listens to `pushState` and `popstate`
and counts each route change as a pageview. For a router that uses `#/routes`, add
`data-hash`. Each route is then its own page, such as `/#/pricing`, without any query
string inside the route.

## Send custom events

Call `misomoon()` with an event name:

```js
misomoon('Signup')
misomoon('Signup', { props: { plan: 'pro', source: 'pricing' } })
```

To send events from HTML without JavaScript, tick **Tagged events** in the
[settings](#choose-what-to-track) and put `data-misomoon-event` on an element. A click
sends the event. On a form, the submit sends it.

```html
<button data-misomoon-event="Start trial" data-misomoon-prop-plan="pro">Start trial</button>
<a href="/checkout" data-misomoon-event="Buy" data-misomoon-revenue-amount="19" data-misomoon-revenue-currency="USD">Buy</a>
```

Each `data-misomoon-prop-<name>` attribute adds the property `<name>` to the event. On a
link, the event also gets a `url` property: the link's address without its query string.
`data-misomoon-revenue-amount` and `data-misomoon-revenue-currency` add revenue, as the
`revenue` option of `misomoon()` does.

An event name can be up to 120 characters of any text except `;` and `|`, which separate
filters in the dashboard and the API. `pageview` counts a page view, and `engagement` is
the tracker's own: the server drops an event you name `engagement`.

To count an event without letting it end a bounce, pass `interactive: false`. Use it for
events that fire without a real action from the visitor, such as a video that plays by
itself:

```js
misomoon('Autoplay started', { interactive: false })
```

To run code after the event is sent, for example before a navigation, pass `callback`:

```js
misomoon('Download', { props: { file: 'report.pdf' }, callback: () => (location.href = '/report.pdf') })
```

Calls made before `m.js` loads are lost unless you queue them. Add this line before the
script tag. `m.js` sends the queued calls after its first pageview:

```html
<script>window.misomoon = window.misomoon || function () { (misomoon.q = misomoon.q || []).push(arguments) }</script>
```

## Track revenue

Pass the amount and an ISO 4217 currency code:

```js
misomoon('Purchase', { revenue: { amount: 49.9, currency: 'EUR' }, props: { plan: 'yearly' } })
```

Each site has one reporting currency. The dashboard guesses it from your timezone when
you add the site, and USD is the fallback. To change it, open **Settings** > **Sites**,
or send `PATCH /api/v1/sites/<site>` with `{"currency": "EUR"}`
([API reference](api.md#sites)). Revenue totals include events in that currency and events sent without a currency. Events in other
currencies are stored but left out of the totals, so the dashboard never adds euros to
dollars.

To count payments from Stripe, Polar, Lemon Squeezy, or Dodo Payments without calling
`misomoon()`, connect the provider's webhook: [Connect payments](revenue.md).

## Turn goals into conversions

In **Settings**, add a goal for an event name (`Signup`) or a page path (`/thank-you`,
or `/docs*` for a prefix). The **What they did** panel then shows each goal's visitors,
conversion rate, and revenue. Goals work on data you already collected.

## Tag the links you post

Visits from X, Facebook, LinkedIn and other known sites show up under their name in
**Sources** without any setup. X wraps every link in `t.co`, though, so the referrer says
only that a visit came from X, not which post. Add UTM tags to the links you share to tell
posts and campaigns apart:

```text
https://example.com/launch?utm_source=x&utm_medium=social&utm_campaign=launch
```

- `utm_source` names where the link is. A known site's name or brand, such as `x`,
  `twitter`, `facebook`, `linkedin` or `google`, counts as that site, so the visit is
  **X** in **Organic Social** even when the X app sends no referrer.
- `utm_medium` sets the channel: `social` for posts, `paid_social` or `cpc` for ads,
  `email` for newsletters.
- `utm_campaign` is what you filter on later, such as `launch` or `spring-sale`.

Ad clicks count as paid on their own when the network adds its click ID: `twclid` (X),
`gclid` (Google) or `msclkid` (Bing). Filter the dashboard to **Source** = X to see the
goals, funnels and revenue that visitors from X bring.
[Channels](metrics.md#channels) lists every rule.

## What the tracker sends by itself

| Event | When | Turn off with |
| --- | --- | --- |
| `pageview` | On load, on each route change, and when the back button shows a page from the browser's cache | `data-manual` (send them yourself with `misomoon('pageview')`) |
| `engagement` | When the page is hidden or the route changes: engaged time, which counts only while the page has focus, and the share of the page scrolled, plus what the ticked features collected. It carries the page view's key, and the server adds it to that page view instead of storing an event. | |

The [configuration reference](configuration.md#tracker-attributes) lists every attribute
the script tag accepts.

## Choose what to track

Everything else is a checkbox under **Settings** > **Install** > **What to track**. A new
site has every feature on. Three presets set the boxes for you:

| Preset | Features | `m.js`, gzipped |
| --- | --- | --- |
| Everything (the default) | All of the table below | 4.8 KB |
| Light | Outbound links, downloads, form submits, and tagged events | 1.9 KB |
| Pageviews only | None | 987 bytes |

The id in brackets is the name that `data-disable` on the script tag and the API's
`features` field take.

| Feature | What it collects | Adds, gzipped |
| --- | --- | --- |
| Outbound links (`outbound`) | An `Outbound link` event for a click or middle click on a link to another host, without its query string | 0.2 KB |
| Downloads (`downloads`) | A `Download` event for a click or middle click on a link to a file such as `.pdf` or `.zip`, or on a link with a `download` attribute, without its query string; `data-download-ext="sketch,fig"` on the script tag adds extensions | 0.4 KB |
| Form submits (`forms`) | A `Form sent` event for each form, named by its `id` or `name` | 0.2 KB |
| Tagged events (`events`) | Clicks and submits on elements with `data-misomoon-event`, with props and revenue ([custom events](#send-custom-events)) | 0.4 KB |
| Payments (`payments`) | Tags payment links and hands out `misomoon.ref()`, so a checkout finds its visit ([Connect payments](revenue.md)). Connecting a provider ticks it | 0.5 KB |
| Web Vitals (`vitals`) | LCP, INP, CLS, FCP, and TTFB from real visits | 0.6 KB |
| Clicks (`clicks`) | Each clicked element, with rage and dead clicks | 1.0 KB |
| JavaScript errors (`errors`) | Uncaught errors and rejected promises. A script from another origin reports only `Script error.` unless its tag has `crossorigin`, and those are left out | 0.4 KB |
| Form fields (`fields`) | The fields a visit used and the one it left a form at | 0.3 KB, plus 0.3 KB shared |
| Video and audio (`media`) | Plays of `<video>` and `<audio>`, and how far they got | 0.3 KB, plus 0.3 KB shared |
| Content blocks (`content`) | Views and clicks on elements with `data-misomoon-content` | 0.3 KB, plus 0.3 KB shared |
| Site search (`search`) | The search term in the page URL | nothing: the server reads it |

Sizes were measured on 2026-10-25 as the growth of the gzipped file. Form fields, media,
and content share 0.3 KB of code, so ticking all three costs it once. `m.js` with every
feature is 4.8 KB.

The script tag loads `m.js?s=<site id>`. The server answers with the core tracker and the
code for the ticked features in one file, so a feature costs no extra request. A change
in the settings reaches visitors within about six minutes: the server caches site settings
for a minute, and browsers cache `m.js` for five.

`data-disable` on the script tag turns a ticked feature off on the pages that carry it,
for example `data-disable="clicks,errors"` on a checkout page.

The server does some work so the tracker doesn't have to:

- **Site search.** The server reads the term from the page URL it already receives, from
  the first of `q`, `s`, `search`, `query` and `keyword` that has a value. If your search
  uses another parameter, list it under **Search parameters**.
- **Path rules.** **Only count these paths** and **Never count these paths** take
  comma-separated paths, where `*` matches within one part of the path and `**` across
  parts. A page they leave out counts neither its view nor its time; custom events on it
  still count.
- **Checkout ids.** With Payments ticked, the server reads the checkout id that Stripe,
  Polar or Dodo Payments puts on the success page's URL.
- **Language.** The server reads the visitor's language from the request.

The API takes all of these settings: see [`PATCH /api/v1/sites/{id}`](api.md).

## See what people do on a page

The dashboard's **Behavior** view reports what people did on a page, from counts the
engagement beacon carries. Each report needs its feature ticked, except scroll depth,
which is always on. It never records a session or what anyone types.

| Report | What it counts |
| --- | --- |
| Clicks | Clicks per element, rage clicks (the third click on one element within a second), and dead clicks (nothing on the page changed for a second after a click on something that looks clickable) |
| Scroll | The share of visits that scrolled past each tenth of the page |
| Forms | Starts, submissions, and the field where people stopped |
| Search | Site search terms, read from the page URL |
| Errors | JavaScript errors, grouped by message and file, without the query string |
| Media | Plays of `<video>` and `<audio>`, and the share that reached 25, 50, 75% and the end |
| Content | How often tagged content was on screen and clicked |

**Show on your site** opens the page in a new tab with `#misomoon-overlay` on its URL. The
tracker then sends nothing for that tab and loads `overlay.js` from next to itself, which
draws the clicks and the scroll depth over the page. The dashboard tab answers only that
tab, and only when it is on the site's domain. A site that sends a
`Cross-Origin-Opener-Policy` header cuts the link between the two tabs, and the overlay
says so.

Attributes on your page's elements shape the reports:

| Attribute | Example | What it does |
| --- | --- | --- |
| `data-misomoon-content` | `<section data-misomoon-content="Hero banner">` | Counts the element in the Content report: seen once half of it is on screen, and clicked |
| `data-misomoon-media` | `<video data-misomoon-media="Product tour">` | Names a video or audio element. Without it the report uses its `title` or file name |
| `data-misomoon-id` | `<button data-misomoon-id="buy">` | A stable name for a clicked element, so a redesign doesn't split its clicks |
| `data-misomoon-mask` | `<div data-misomoon-mask>` | Sends no text for clicks inside, such as a name in a menu |
| `data-misomoon-ignore` | `<form data-misomoon-ignore>` | Leaves a form out of the Forms report and the `Form sent` event |

The tracker never sends a field's value. A clicked field's label is its `name` or type, and
the server replaces email addresses and runs of six or more digits in a search term
before it stores it.

These reports keep counts per page and element, never the path of one visit through the
site. Whether you need consent still depends on your setup and your country. This guide is
not legal advice.

## Stop ad blockers from dropping events

Some blockers drop requests to analytics hosts. Serve the tracker from your own domain
instead. [Serve the tracker from your own domain](PROXY.md) shows a managed subdomain, one-click proxy deploys, and snippets for
Cloudflare Workers, Next.js, Vercel, Netlify, Nginx, Caddy, and SvelteKit.

## Exclude yourself

To leave out a whole office or your own servers, add their IP addresses under
**Settings** > **Install** > **Privacy** > **Never count these IP addresses**
([privacy settings](compliance.md#privacy-settings)). To leave out one browser, run this
once in the browser console on your site:

```js
localStorage.setItem('misomoon_ignore', 'true')
```

To count your visits again, remove the key. The
[opt-out button](compliance.md#let-visitors-opt-out) lets your visitors do the same.
