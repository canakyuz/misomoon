---
title: Core Web Vitals monitoring with real user data, read at p75
description: Core Web Vitals monitoring means measuring LCP, INP, and CLS in your visitors' browsers and checking the 75th percentile of each page against Google's limits.
tags: performance, guides
status: draft
---

Core Web Vitals monitoring means measuring Largest Contentful Paint (LCP), Interaction to Next Paint (INP), and Cumulative Layout Shift (CLS) in your visitors' browsers, then checking the 75th percentile of each page against Google's limits. A page passes when its 75th percentile is 2.5 seconds or less for LCP, 200 milliseconds or less for INP, and 0.1 or less for CLS. Real user monitoring collects those values from real visits, so you see what visitors get on their own phones and networks, not what one test machine got.

## What the five Web Vitals measure

Google's [Web Vitals overview](https://web.dev/articles/vitals) names three Core Web Vitals: LCP for loading, INP for responsiveness, and CLS for visual stability. It lists First Contentful Paint (FCP) and Time to First Byte (TTFB) as supporting metrics that help you find the cause of a slow LCP. Collect all five, because the two supporting metrics tell you where the time goes.

### Largest Contentful Paint is when the main content shows

[LCP](https://web.dev/articles/lcp) reports the render time of the largest image, text block, or video in the viewport, counted from the moment the visitor started to open the page. On most pages, that element is a hero image, a product photo, or the first block of article text. A slow LCP is what people mean by "the page took forever to load", even when the header appeared early.

### Interaction to Next Paint is how fast the page answers a tap

[INP](https://web.dev/articles/inp) measures how fast a page responds to clicks, taps, and key presses over the whole visit. It is the successor to First Input Delay. A page that loads fast but freezes for half a second each time someone opens a menu has a poor INP. A visit where the user never clicked, tapped, or pressed a key reports no INP at all.

### Cumulative Layout Shift is how much the page moves

[CLS](https://web.dev/articles/cls) scores unexpected layout shifts. It takes the largest burst of shifts, where each shift comes less than one second after the last one and the burst lasts at most five seconds. Shifts within 500 milliseconds of a tap, click, or key press don't count. A late banner that pushes the article down while someone reads it is the usual cause.

### First Contentful Paint and Time to First Byte point to the cause

[FCP](https://web.dev/articles/fcp) is the time until any part of the page's content appears on screen. [TTFB](https://web.dev/articles/ttfb) is the time until the first byte of the server's response arrives. If TTFB is high, look at the server, the cache, or a redirect chain, because every later metric inherits that delay. If TTFB is fine and FCP is high, look at render-blocking CSS, fonts, and scripts. If both are fine and LCP is still high, the largest element itself is slow: an image that is too big, starts loading late, or waits for JavaScript.

### The limits for good and poor

web.dev publishes these limits. A value between the two limits needs improvement.

| Metric | Good | Poor | Source |
| --- | --- | --- | --- |
| LCP | 2.5 s or less | Over 4.0 s | [web.dev on LCP](https://web.dev/articles/lcp) |
| INP | 200 ms or less | Over 500 ms | [web.dev on INP](https://web.dev/articles/inp) |
| CLS | 0.1 or less | Over 0.25 | [web.dev on CLS](https://web.dev/articles/cls) |
| FCP | 1.8 s or less | Over 3.0 s | [web.dev on FCP](https://web.dev/articles/fcp) |
| TTFB | 0.8 s or less | Over 1.8 s | [web.dev on TTFB](https://web.dev/articles/ttfb) |

web.dev calls the TTFB limits "a rough guide". TTFB isn't a Core Web Vital, so missing its good limit is acceptable when it doesn't stop LCP from passing.

## Google rates a page by its 75th percentile

Every visit produces a different number. One visitor on fiber gets an LCP of 1.1 seconds, and another on a crowded train gets 6 seconds. To rate the page, web.dev tells you to take [the 75th percentile of page loads, segmented across mobile and desktop devices](https://web.dev/articles/vitals). If the 75th percentile is under the good limit, at least three out of four visits had a good experience.

The article on [how Google chose the thresholds](https://web.dev/articles/defining-core-web-vitals-thresholds) gives the reason. The percentile has to cover most visits to a page, and a few outliers shouldn't move it. Google picked the 75th percentile as the balance between the two.

Two rules follow for reading your own numbers:

- Ignore the average. A few very slow visits pull it up, and many fast repeat visits pull it down. An average of 2 seconds can sit next to a p75 of 3.5 seconds.
- Read p75 with its sample count. Ten visits give a p75 that can move by a second from one day to the next.

## Lab data and field data answer different questions

Google's article [on why lab and field data can be different](https://web.dev/articles/lab-and-field-data-differences) defines the two. Lab data comes from loading a page in a controlled environment, with one set of device and network conditions. Field data comes from monitoring the people who visit the page.

A lab test, such as a performance recording in Chrome DevTools, is the right tool while you build: change one thing, run the test again, and see the effect. It can't tell you what your visitors get, for reasons the same article lists:

- A lab test uses one device, one network, and one location, and loads the page with a cold cache. Returning visitors often have your CSS, fonts, and images cached.
- A lab test doesn't scroll or tap, so it misses layout shifts that happen after a scroll. It also can't predict when a person will interact, so INP can be measured only from real users.
- Pages restored from the back/forward cache appear in field data and never in a lab test.
- Personalized content and A/B tests change what real visitors see, so the LCP element in the lab may not be the one your visitors get.

Use the lab to fix a problem and field data to find one.

## Why field data from your own visitors matters

Chrome publishes a public field data set, the Chrome User Experience Report. Its [methodology page](https://developer.chrome.com/docs/crux/methodology) sets limits that leave many sites with partial data or none:

- It includes only Chrome users who opted in to usage statistics and history sync, on desktop Chrome and Chrome for Android. Chrome on iOS, Android WebView apps, and other Chromium browsers are left out.
- A page must be publicly discoverable. A page with a `noindex` tag, or one that doesn't answer with status `200`, isn't eligible.
- A page must be "sufficiently popular". Chrome doesn't publish the threshold, so a new page or a small site can show no data.

Your own real user monitoring avoids those limits. It measures every browser that supports each metric, on every page that loads your script, including the checkout, pages behind a login, and the landing page you launched yesterday.

## How to set up real user monitoring

Any tool follows the same steps:

1. Add a script that reads the metrics from the browser's performance APIs and sends one set of values per page load.
2. Send the values when the page is hidden, not on load. INP and CLS keep changing while the visitor uses the page.
3. Store each value with the page, the device, the country, and the browser, so you can split the numbers later.
4. Compute the 75th percentile of each metric over a period, rate it against the limits above, and check it again after each release.

## Read p75 per page, device, and country

A site-wide p75 tells you whether there is a problem. It doesn't tell you where. Split the numbers in this order:

1. **By page.** A slow template slows every page built on it, such as a blog template with a large hero image or a product page with a slow review widget. Fix the template behind the busiest failing page first.
2. **By device.** web.dev rates mobile and desktop on their own because a page can pass on one and fail on the other.
3. **By country.** A high TTFB in one region and a normal one everywhere else points to distance from your server or a cache that misses there.
4. **By browser.** A browser with no samples for a vital may not measure it. That doesn't make it fast.

Here is an example, with made-up numbers. A site's LCP p75 is 2.4 seconds, which passes. Split by device, desktop is 1.6 seconds and mobile is 3.3 seconds. Split by page, the mobile failures come from `/blog/*`, where the hero image is 1.8 MB. The passing site-wide number hid a failing page group.

## Common mistakes

- **Mixing mobile and desktop.** A site with mostly desktop traffic can pass overall while mobile visitors wait. Split by device before you decide.
- **Judging INP on pages people only read.** An article page collects few INP samples, because many readers never tap anything. A low count there is normal.
- **Fixing the lab score instead of the field number.** A perfect run on a fast laptop says little about a mid-range phone. Confirm each fix in field data after the release.
- **Forgetting single-page apps.** A script that measures only full page loads, as misomoon's does, sends nothing for the route changes after them. A slow client-side route needs its own timing.

## Monitor Core Web Vitals in misomoon

misomoon measures the five Web Vitals in your visitors' browsers with its `m.js` tracker, which sets no cookies and stores nothing on the visitor's device. The [demo dashboard](/demo) shows the view on sample data.

### Turn on the Web Vitals feature

A new site has every feature on, Web Vitals included. To check it, or to turn it on for an older site:

1. Open **Settings** > **Install**.
2. Under **What to track**, tick **Web Vitals**.
3. Select **Save**.

The change reaches visitors within about six minutes. The **Light** and **Pageviews only** presets leave Web Vitals off. The feature adds 0.6 KB, gzipped, to `m.js`, and the server sends it in the same file as the core tracker, so it costs no extra request. [Choose what to track](https://docs.misomoon.com/tracking#choose-what-to-track) lists every feature and its size.

To turn Web Vitals off on some pages and keep it everywhere else, add `data-disable` to the script tag on those pages:

```html
<script defer src="https://analytics.example.com/m.js?s=your-site" data-disable="vitals"></script>
```

### Read the Speed view

Open **Speed** from the sidebar, or press `6`. On **Overview**, the **How fast it feels** card shows the vitals too, and **Open Speed** opens the full view.

**Speed** has one tile for each of LCP, INP, CLS, FCP, and TTFB. Each tile shows the 75th percentile, the number of samples, a rating of **Good**, **Needs work**, or **Poor**, and a bar of how the samples split between the three ratings. The rating also has a shape: a circle for **Good**, a square for **Needs work**, and a triangle for **Poor**.

The tiles use the limits in the table above. Read the bar as well as the p75. A p75 that passes with a large poor share on the bar means a group of visitors still waits, and slicing finds who they are.

### Slice by page, device, country, and browser

**Slice by** lists the top **Pages**, **Devices**, **Countries**, and **Browsers**. Select a row to filter by it, and the tiles show the vitals for that slice. Start under **Pages** with the busiest page that has a poor tile, then compare its devices and countries.

The dashboard keeps the view, the period, and the filters in the URL. A link with `?view=vitals&f=page~/blog` opens **Speed** filtered to the blog, so a teammate sees the same slice. [Check page speed](https://docs.misomoon.com/dashboard#check-page-speed) covers the view.

### Pull the numbers from the API or an AI assistant

`GET /api/v1/stats/vitals` returns, for each of `lcp`, `inp`, `cls`, `fcp`, and `ttfb`, the 75th percentile, the number of samples, and the counts rated good, needs improvement, and poor. It takes the same `period` and `filters` parameters as the other stats routes. This request reads mobile visits to the blog over the last 7 days:

```sh
curl -H "Authorization: Bearer mm_..." \
	"https://analytics.example.com/api/v1/stats/vitals?site=shop&period=7d&filters=device==Mobile;page~/blog"
```

Create the `mm_` key under **Settings** > **Integrations**. The [API reference](https://docs.misomoon.com/api) lists the parameters.

With Claude, Cursor, or another MCP client connected, the `get_web_vitals` tool returns the same p75 values and rating counts. You can ask which pages had a poor LCP on mobile last week. [Ask AI tools about your traffic](https://docs.misomoon.com/mcp) explains the setup.

### What misomoon counts

[What the numbers mean](https://docs.misomoon.com/metrics#web-vitals) has the full rules. These change how you read the tiles:

- The tracker sends one set of values per page load, with the page's first engagement ping. Route changes in a single-page app send none.
- A vital the browser didn't measure is left out, so each tile can have its own sample count.
- p75 comes from a histogram that every shard fills. misomoon adds the bins and reports the middle of the bin where three quarters of the values are reached.
- History imported from Google Analytics or a CSV file has no Web Vitals.

## Questions people ask

### Do Core Web Vitals affect search rankings?

Google's page on [Core Web Vitals and search results](https://developers.google.com/search/docs/appearance/core-web-vitals) says good Core Web Vitals, with other page experience aspects, align with what its core ranking systems seek to reward. It recommends that site owners achieve good scores. Start with the pages where p75 is poor, because there more than a quarter of visits went badly.

### What is the difference between real user monitoring and synthetic monitoring?

Synthetic monitoring loads your page from a test machine on a schedule, which gives lab data. Real user monitoring measures the visits people make, which gives field data. Synthetic tests catch a regression on a fixed setup, and real user monitoring tells you what your visitors get. Only real user monitoring measures INP.

### How many samples do I need before p75 is reliable?

Google doesn't publish a minimum for your own data. Compare the same page across a few days. If its p75 moves by more than the width of the "needs improvement" band, widen the period until it settles.

### Does the Web Vitals feature slow down my site?

It adds 0.6 KB, gzipped, to `m.js`, and it needs no extra request. The values go out with the tracker's first engagement ping, which `m.js` sends when the page is hidden or the route changes.

### Can I track Web Vitals in a single-page app?

misomoon measures each full page load. Route changes after it send no vitals. To time a slow client-side route, measure it in your code and send the result as a [custom event](https://docs.misomoon.com/tracking#send-custom-events).

## Start measuring your visitors' Web Vitals

The **Speed** view, the vitals API, and the MCP tool are on every misomoon Cloud plan. [Start a free trial of misomoon Cloud](https://app.misomoon.com/?signup), paste the script tag, and the tiles fill as visitors arrive. Plans start at $5 a month for 100,000 events, and you can [see the plans](/pricing). To run misomoon in your own Cloudflare account instead, follow [the self-hosting guide](https://docs.misomoon.com/self-hosting).
