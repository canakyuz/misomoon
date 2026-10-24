---
title: Rage clicks and dead clicks: what they mean and how to fix them
description: A rage click is fast repeated clicking on one element. A dead click is a click that changes nothing. Learn the causes, the fixes, and how to find both.
tags: behavior, how-to
status: draft
---

A rage click is a burst of clicks on one element in a short time, from someone who clicked, saw nothing happen, and clicked again. A dead click is a click on something that looks clickable that changes nothing on the page. In misomoon, a rage click is the third click on one element within a second, and a dead click is a click on something that looks clickable after which nothing on the page changed for a second.

This guide covers what each signal means, what usually causes it, how to fix it, and how to find both on your own pages without recording anyone's session.

## A rage click is repeated clicking where the page didn't answer

People click again when the first click seemed to do nothing. Three or more fast clicks on one spot usually mean the person expected a result and didn't see one, so they tried harder.

There is no standard definition of a rage click, so tools count them in different ways. Before you compare a number from one tool with a number from another, check how each one counts. In misomoon, the third click on one element within one second counts as one rage click. A double click is two clicks, so it never counts.

A rage click doesn't always mean the element is broken. A button that works but takes two seconds to show a result collects rage clicks too.

## A dead click is a click that changes nothing

A dead click is quieter. The person clicks once, nothing happens, and they often give up without a second try. That is why dead clicks are worth counting apart from rage clicks. A visitor who gives up after one click never reaches three.

Two parts make up the definition:

- **The element looks clickable.** Native controls such as links and buttons look clickable. So does any element that shows the pointing-hand cursor. The CSS `cursor` property sets the cursor shown over an element, and [MDN describes the `pointer` value](https://developer.mozilla.org/en-US/docs/Web/CSS/cursor) as "a pointer that indicates a link". A click on plain body text is not a dead click, because nobody expected it to do anything.
- **Nothing on the page changed.** No new content, no class change, no navigation, within a set time. A script can watch for this with a [`MutationObserver`](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver), which, in MDN's words, "provides the ability to watch for changes being made to the DOM tree".

misomoon waits one second. If nothing on the page changed in that second, the click counts as dead.

## The two signals point at different problems

Read rage clicks and dead clicks side by side, because they tell you different things about one element.

| What you see | What it usually means |
| --- | --- |
| Many dead clicks, few rage clicks | People think the element does something, and it doesn't. They try once and leave. |
| Many rage clicks, few dead clicks | The element works, but the answer is slow or hard to see. |
| Many of both | The element is broken, or it looks like a control and isn't one. |
| Neither, but low conversions | The problem is somewhere else. Check scroll depth, forms, and errors. |

A slow answer to a click also shows up in Interaction to Next Paint (INP), a Web Vital that measures the time "from the time the user begins the interaction to the moment the browser is next able to paint a frame". [web.dev rates an INP](https://web.dev/articles/inp) of 200 milliseconds or less as good and over 500 milliseconds as poor, at the 75th percentile of page loads. A page with poor INP and a lot of rage clicks on one button points at the click handler on that button as the first thing to check.

## Usual causes and how to fix them

These are common causes, with the fix for each. The list isn't complete.

### Something looks like a control and isn't one

Underlined text that isn't a link, a product image with no link, a card where only the title is clickable, an icon next to a heading. People click them because they look like the links around them.

Fix it one of two ways. Make the element do what people expect, for example link the whole card, or change its style so it stops looking clickable. Choose by asking what the visitors who clicked were trying to reach.

### The click works but gives no feedback

A form button that sends a request and shows nothing until the response arrives. An "Add to cart" button that updates a counter far away from where the person is looking. A filter that reloads results below the fold.

Show a response at the spot of the click, right away. Change the button's text or state while the request runs, disable it so a second click doesn't send a second request, and show the result close to the button.

### An invisible layer covers the target

A transparent overlay, a cookie notice that has faded out but still sits on top, or a wrapper with a high `z-index` can catch clicks meant for the button under it. The button looks fine and does nothing.

Open the browser's developer tools, inspect the spot where the clicks land, and see which element is really on top. If a layer must stay but shouldn't catch clicks, `pointer-events: none` lets them through. [MDN says](https://developer.mozilla.org/en-US/docs/Web/CSS/pointer-events) the value makes the pointer event "go 'through' the element and target whatever is 'underneath' that element instead". Removing the layer when it isn't visible is usually the cleaner fix.

### The target is too small

Small icon buttons and links packed close together collect repeated clicks, mostly on touch screens, because the first tap lands next to the target. WCAG 2.2 success criterion 2.5.8, at level AA, asks for a target size of [at least 24 by 24 CSS pixels](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), with some exceptions. Grow the hit area with padding even when the icon stays small.

### JavaScript failed or hasn't loaded yet

On pages that render on the server and attach their scripts later, buttons are visible before they work. A script error has the same effect for longer. Both produce dead clicks on controls that work fine on a fast machine.

Check the page's JavaScript errors for the same period, and test the page on a throttled connection. Ship less JavaScript before the first interaction, or render controls that work without it, such as a real `<form>` or a real link.

## Find the problem elements in a few steps

The process is the same in any tool that counts clicks per element:

1. Pick a page that matters, such as a pricing page, a sign-up page, or a checkout step.
2. Sort its elements by rage clicks and by dead clicks.
3. Divide by the element's total clicks. For example, ten dead clicks out of 12 is a broken element. Ten out of 4,000 is noise.
4. Open the page, find the element, and click it the way a visitor would, on a slow phone if you can.
5. Fix it, write down the date of the fix, and compare the same numbers for the weeks after.

## Common mistakes when you read the numbers

**Reading raw counts.** The most clicked element on a page tends to collect more rage clicks by chance. Compare the share of rage and dead clicks per element, not the totals.

**Calling every fast click rage.** Some controls are built for repeated clicks: a quantity stepper, a carousel arrow, a "load more" button. A high rage count on them is normal. Judge them by dead clicks and by whether people reach the next step.

**Losing history in a redesign.** If a tool names an element by where it sits in the page, moving a button into a new wrapper starts its clicks again under a new name, and the before and after never line up. Give the elements you care about a stable name.

**Fixing without a date.** If you don't record when a fix shipped, you can't tell whether the drop in dead clicks came from the fix or from a quiet week.

## Find rage clicks and dead clicks in misomoon

misomoon counts clicks per element, with rage clicks and dead clicks, when the **Clicks** feature is on. To check that it is on and open the report:

1. Open **Settings** > **Install** > **What to track**.
2. Make sure **Clicks** is ticked. A new site has every feature on, and the **Everything** preset includes it. The **Light** and **Pageviews only** presets leave it out.
3. Select **Save**. A change reaches visitors within about six minutes, because the server caches site settings for a minute and browsers cache `m.js` for five.
4. Open **Behavior** (key `5`) and select **Clicks**.
5. Pick the page from the **Page** menu, which lists the 50 most visited pages. If you already filtered by one page with **is**, the report uses that page.

The report lists each clicked element with its clicks, rage clicks, and dead clicks. When the feature is off, the report says so, and **Open settings** takes you to **What to track**. The feature adds 1.0 KB, gzipped, to `m.js`, and no extra request. You can look at the report on sample data in [the demo dashboard](/demo), and [the tracking guide](https://docs.misomoon.com/tracking#see-what-people-do-on-a-page) describes each report.

### Shape the report with attributes

Three attributes change what the report holds:

| Attribute | Example | What it does |
| --- | --- | --- |
| `data-misomoon-id` | `<button data-misomoon-id="buy">` | Gives a clicked element a stable name, so a redesign doesn't split its clicks |
| `data-misomoon-mask` | `<div data-misomoon-mask>` | Sends no text for clicks inside it, such as a name in an account menu |
| `data-disable` | `data-disable="clicks"` on the script tag | Turns click tracking off on the pages that carry that tag, such as a checkout page |

Here is a buy button that keeps its clicks through a redesign:

```html
<button data-misomoon-id="buy" type="submit">Buy now</button>
```

### Mark the fix on the chart

To compare before and after, add a note on the day you ship the fix. Select **Note** above the chart on **Overview**, type what changed, and select **Add**. The note shows as a flag on the chart. To mark deploys from CI, post the note through the API with a `ts`. [The dashboard guide](https://docs.misomoon.com/dashboard) covers notes and the other views.

### Read the same numbers from the API or an AI assistant

The Stats API returns the same report from `GET /api/v1/stats/behavior` with `report=clicks`, with `rage` and `dead` on each element ([API reference](https://docs.misomoon.com/api)). In Claude, Cursor, or another MCP client, the `get_page_interactions` tool returns the clicks report for the site or for one page ([Ask AI tools about your traffic](https://docs.misomoon.com/mcp)).

## See the click map drawn over your own page

**Show on your site**, in the **Clicks** and **Scroll** reports, opens the page in a new tab and draws the clicks and the scroll depth over it.

This is how it works:

- The dashboard opens your page with `#misomoon-overlay` at the end of its URL.
- On that tab, the tracker sends nothing, so your own look at the page doesn't count as a visit.
- The tracker loads `overlay.js` from next to its own URL, and `overlay.js` draws the clicks and the scroll depth.
- The overlay asks the dashboard tab for the data. The dashboard answers only the tab it opened, and only when that tab is on the site's domain. The overlay never carries a sign-in token.

The page needs the misomoon script on it, because the script is what loads the overlay.

### A Cross-Origin-Opener-Policy header blocks the overlay

The overlay talks to the dashboard tab that opened it. A site that sends a `Cross-Origin-Opener-Policy` header cuts the link between the two tabs, and the overlay says so.

The header is a security header that the browser enforces. [MDN explains](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Opener-Policy) that it controls whether a document opened from another stays in the same browsing context group as its opener. When the document opens in a new group, "any references between the new document and its opener are severed", and the page can't reach its opener through `window.opener`. If your site sends the header, the **Clicks** report in the dashboard still shows the counts. Only the drawing over the page needs the two tabs to talk.

## What misomoon counts, and what it never records

misomoon never records sessions and never records keystrokes. The **Behavior** reports come from counts that the engagement beacon carries, such as how many clicks, rage clicks, and dead clicks each element got on each page. They keep counts per page and element, never the path of one visit through the site.

The tracker never sends a field's value. A clicked field's label is its `name` or its type. Inside an element with `data-misomoon-mask`, clicks send no text. `m.js` sets no cookies, and misomoon never stores the IP address.

Clicks collect more than pageviews do, so the feature adds to what your privacy policy has to explain. **Settings** > **Install** > **Privacy** has **Text for your privacy policy** that lists what your saved settings collect. Whether you need consent depends on your setup and your country. [Use misomoon within privacy law](https://docs.misomoon.com/compliance) goes through the rules by country. This is not legal advice.

## Questions people ask

### How many clicks make a rage click?

There is no standard number, and tools count in different ways. In misomoon, the third click on one element within one second counts as a rage click.

### Is a double click a rage click?

Not in misomoon. A double click is two clicks, and a rage click needs a third click on the same element within a second. Controls that people click many times on purpose, such as a quantity stepper, can still collect rage clicks, so judge those by their dead clicks instead.

### Do I need session recordings to fix these problems?

No. Per-element counts tell you which element fails and how often, and you can reproduce the failure yourself. misomoon never records sessions or keystrokes. It counts clicks per element and draws them over your page with **Show on your site**.

### Can I turn click tracking off on some pages?

Yes. Add `data-disable="clicks"` to the script tag on the pages where you don't want clicks counted, such as a checkout page. To turn clicks off for the whole site, untick **Clicks** under **Settings** > **Install** > **What to track** and select **Save**.

### Why doesn't the overlay draw anything on my site?

Check that the misomoon script is on the page, because it loads the overlay. If your site sends a `Cross-Origin-Opener-Policy` header, the browser cuts the link between the overlay tab and the dashboard, and the overlay says so. The **Clicks** report in the dashboard still shows the counts.

## Start counting the clicks that go nowhere

misomoon counts rage clicks and dead clicks on every plan, without cookies and without recording sessions or keystrokes. [Start a free trial of misomoon Cloud](https://app.misomoon.com/?signup), or [see the plans](/pricing). You can also run misomoon in your own Cloudflare account, as [the self-hosting guide](https://docs.misomoon.com/self-hosting) shows.
