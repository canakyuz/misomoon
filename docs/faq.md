# Frequently asked questions

## Privacy

### What does misomoon store about a visitor?

It stores the page, the referrer, UTM tags, the country, region, and city, the browser,
the operating system, the screen size, the language, the network operator, and the events that the page
sends. It doesn't store the IP address.

To count unique visitors, the Worker makes an id from a hash of a daily random salt,
the site, the IP address, and the user agent. It keeps 16 characters of that hash. The
salt changes every day at 00:00 UTC and is deleted after two days. After that, nobody
can work back to the IP address or link a visitor's id from one day to the next. The one
exception is a visit still open at 00:00 UTC, which stays one visit and keeps both ids.

### Does the tracker use cookies or local storage?

No. `m.js` sets no cookies and stores nothing on the device. The only exception is the
`misomoon_ignore` key, which you set yourself to [exclude your own visits](tracking.md#exclude-yourself),
or a visitor sets with the [opt-out button](compliance.md#let-visitors-opt-out).

### Do I need a cookie banner?

misomoon sets no cookies, stores nothing on the visitor's device, and never stores IP
addresses, which are the usual reasons for a consent banner. Whether you need one depends
on your country, on the features you turn on, and on what else your site does. Clicks,
JavaScript errors, site search, form fields, and payments collect more than pageviews do;
the [data processing agreement](dpa.md) lists what each one keeps.
[Use misomoon within privacy law](compliance.md#do-you-need-a-consent-banner) goes through
the rules in the EU, France, Germany, the UK, and the US. This isn't legal advice. Ask
someone who knows the law where you operate.

### Where is the data?

Self-hosted, in your own Cloudflare account, in D1 databases that you control. Nobody
else, including the misomoon project, can see it. On app.misomoon.com, in our Cloudflare
account, under the [data processing agreement](dpa.md).

Each site keeps its stats in the data region picked when it was added: the EU, the US,
or Asia-Pacific. EU and US data stays in that region. Asia-Pacific is a placement Cloudflare
aims for but doesn't guarantee. [Add data regions](upgrading.md#add-data-regions) shows how to
set regions up on your own server.

## Running it

### Is this self-hosted?

misomoon runs in your own Cloudflare account, not on your own hardware. You own the
data, the code, and the deploy, and Cloudflare runs it. You don't maintain a server.
The trade-off is that it needs Cloudflare. There is no Docker version today.

### What does it cost?

misomoon is free. You pay Cloudflare for what the Worker uses. Small sites fit in the
Workers Free plan. Busier sites need the Workers Paid plan. The
[self-hosting guide](self-hosting.md#before-you-start) links the pricing pages.

### How much traffic can it handle?

Each shard is a D1 database of up to 10 GB, and you can add shards as you grow. Reads
run on every shard in parallel and merge the results.
[Scale the shards](upgrading.md#scale-the-shards) explains how.

### Can I keep data for a limited time?

Yes, and on misomoon Cloud nothing is kept forever. Set **Keep stats for** in
**Settings** > **Install** > **Privacy** for each site. Without a setting, Cloud keeps 25
months, or 2 years on Starter. No site keeps more than its plan allows: 2 years on Starter,
and 3 years on Growth and Scale ([Plans](cloud.md#plans)). Keeping stats for longer than
25 months goes past what the CNIL allows without consent. The daily cleanup deletes older
events, visits, and payments. On your own server, `RETENTION_DAYS` sets the longest for every site and
`RETENTION_DEFAULT_DAYS` the default; by default your server keeps everything
([privacy settings](compliance.md#privacy-settings)).

### Can I export my data?

Yes. The dashboard and the API export a ZIP of CSV files for any period
([API reference](api.md#get-apiv1statsexport)). The raw data is also in your D1
databases, so you can query it with `wrangler d1 execute`.

## Numbers

### Why are my numbers lower than in Google Analytics?

Some reasons:

- Ad blockers block Google Analytics too, but they block different things. To lose
  fewer events to blockers, [serve misomoon from your own domain](PROXY.md).
- misomoon drops bots before it counts them.
- Google Analytics fills gaps with modeled data when visitors decline consent. misomoon
  counts only real requests.

### Why is a visitor unique only for one day?

The visitor id changes every day, so misomoon can't know that today's visitor came
yesterday too. A "visitors" number for a month is the sum of the unique visitors of
each day. This is the price of not storing anything on the device.

### Can I import my history from Google Analytics?

Yes. In **Settings**, connect Google and import a property's history, or upload a CSV
export. Imported numbers show in unfiltered reports, next to the data misomoon
collects. The Google import needs the Google OAuth secrets
([configuration](configuration.md#secrets)).

## Features

### Does it work with single-page apps?

Yes. The tracker counts each `pushState` and `popstate` route change as a pageview. For
`#/route` routers, add `data-hash`.

### Can AI tools read my analytics?

Yes. misomoon has an MCP server for Claude, Cursor, and other clients. See
[Ask AI tools about your traffic](mcp.md).

### Can I share a dashboard?

Yes. Create a shared link in **Settings** > **Sharing**. A shared link can have a
password, an expiry date, and a saved filter. You can also make a site public through the
API, so anyone with its dashboard URL can read it. [Share a dashboard](sharing.md) covers
both.
