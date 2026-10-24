---
title: How to track ChatGPT traffic and other AI referral traffic
description: Track ChatGPT traffic by reading each visit's referrer host and utm_source tag, then count AI assistants as their own channel, not as referral or direct.
tags: ai, how-to
status: draft
---

To track ChatGPT traffic, read the referrer host and the `utm_source` tag of each visit, and count the visits that come from an AI assistant, such as `chatgpt.com`, `perplexity.ai`, `claude.ai`, `gemini.google.com`, or `copilot.microsoft.com`, as one channel. Most analytics tools put those visits under "Referral", and the ones that arrive without a referrer under "Direct", so the numbers exist but sit in the wrong buckets. misomoon gives them a channel of their own, **AI Assistants**, next to search, social, and email.

This guide explains how a visit from an assistant reaches your site, why it gets misfiled, how to measure it in any tool, and how to read it in misomoon.

## How a visit from an AI assistant reaches your site

A person asks an assistant a question. The answer cites your page, and the person clicks the link. What your analytics sees next depends on two things the browser can pass along: the referrer and the URL itself.

### The referrer names the assistant, not the conversation

When a click in a browser opens your page, the browser sends the address of the page the person left in the `Referer` request header. A script on your page reads the same value as `document.referrer`. How much of that address it sends depends on the referrer policy. The [W3C Referrer Policy draft](https://w3c.github.io/webappsec-referrer-policy/) sets the default to `strict-origin-when-cross-origin`. For a link to another site, that policy sends only the origin, such as `https://chatgpt.com/`, and never the path of the chat.

The origin is enough to know which assistant sent the visit. It is not enough to know what the person asked, which conversation they were in, or where in the answer your link appeared.

### Some visits arrive with no referrer at all

The [HTML standard](https://html.spec.whatwg.org/multipage/dom.html#dom-document-referrer) says `document.referrer` returns the empty string when the referrer "was blocked or there was no such document". Several things lead there:

- A link marked `rel="noreferrer"`. The [HTML standard's link types](https://html.spec.whatwg.org/multipage/links.html#link-type-noreferrer) say that with this keyword, no `Referer` header is included.
- A stricter policy on the assistant's page. Under `no-referrer`, the W3C draft says no referrer information is sent with any request.
- A person who copies the link from an answer and pastes it into the address bar. No page started that navigation, so there is no referring document.
- A link that a desktop or mobile app hands to the browser. Whether a referrer comes along depends on the app, so test the apps your audience uses before you assume either way.

Each of these visits looks the same as someone typing your address from memory.

### A tag in the URL survives where the referrer doesn't

A link can carry its own label in the query string, most often `utm_source`. The tag is part of the URL, so it reaches your site even when the browser sends no referrer. Look at the landing URLs your own visits arrive on to see which assistants tag their links, and with what value. Nothing obliges an assistant to keep a tag the same, so match on the assistant's name rather than on one exact string.

### Crawler requests are not visits

Assistants also fetch pages themselves. OpenAI's [overview of its crawlers](https://developers.openai.com/api/docs/bots) lists `OAI-SearchBot` for search results, `GPTBot` for training, and `ChatGPT-User`, which "may visit a web page" when a user asks ChatGPT a question. Those requests show up in your server logs, but no person read the page. A JavaScript tracker counts only browsers that run its script, and misomoon also drops bots by Cloudflare's bot signals and by user-agent patterns before it counts anything.

## Why AI visits hide inside referral and direct

Most analytics tools sort visits into channels with a fixed list of rules: a list of search engines, a list of social sites, and checks on `utm_medium`. A referrer host that isn't on any list, with no medium, falls through to Referral. A visit with no referrer and no tag falls through to Direct.

That splits AI traffic in two. The visits with a referrer sit in Referral, mixed in with blogs, forums, and partner sites that link to you. The visits without one sit in Direct, mixed in with bookmarks and typed addresses. Neither bucket tells you whether assistants send you more people this quarter than last.

Answers shown inside a search engine's own results page add a third case. Those clicks send the search engine's host as the referrer, such as `google.com` or `bing.com`. Because the referrer is only the origin, no analytics tool can tell from it whether the click came from an AI answer or from an ordinary result. A tool that classifies by referrer counts those visits as organic search, and misomoon does too.

## How to measure AI referral traffic in any analytics tool

The method is the same whatever tool you use. You need a channel rule for AI assistants that runs before the rules that would otherwise claim those visits.

1. Write down the hosts you want to count. Start with `chatgpt.com`, `chat.openai.com`, `perplexity.ai`, `claude.ai`, `gemini.google.com`, and `copilot.microsoft.com`.
2. Match each referrer host exactly, or as a subdomain of a listed host. Strip a leading `www.` first.
3. Add a second check on `utm_source` for the assistant names, compared in lower case, for visits that carry a tag but no referrer.
4. Put the AI rule first in the channel order. `gemini.google.com` would otherwise match a rule for Google search, and the visit would count as organic search.
5. Report landing pages, conversions, and revenue for the channel, not only visits.
6. Compare each period with the one before it, and review the host list every few months.

A rule like this one does steps 2 to 4 for a single visit:

```js
const AI_HOSTS = ['chatgpt.com', 'chat.openai.com', 'perplexity.ai', 'claude.ai', 'gemini.google.com', 'copilot.microsoft.com']
const AI_NAMES = /chatgpt|openai|perplexity|claude|gemini|copilot/i

function isAIAssistant(referrer, landingUrl) {
	let host = ''
	try {
		host = new URL(referrer).hostname.replace(/^www\./, '')
	} catch {}
	if (AI_HOSTS.some((h) => host === h || host.endsWith('.' + h))) return true
	const tag = new URL(landingUrl).searchParams.get('utm_source') ?? ''
	return AI_NAMES.test(tag)
}
```

Run the check once per visit, on its first page, and keep the result for the rest of the visit. A visit that starts from Perplexity and then opens three more pages is one AI visit, not one AI visit and three internal ones.

## Common mistakes when counting AI traffic

**Matching a word anywhere in the host.** A check for "claude" or "gemini" anywhere in the hostname also matches unrelated sites that use the word in their name. Match the full host or a subdomain of it.

**Checking search engines before assistants.** A rule that claims every `google.` host for search takes `gemini.google.com` with it. Order matters as much as the list.

**Counting crawler hits from server logs.** A spike of `ChatGPT-User` requests in your access log means an assistant fetched your page. It doesn't mean anyone visited. Count visits from a tracker that runs in the browser, or filter crawler user agents out before you count.

**Assuming Direct holds no AI visits.** Pasted links and some app links arrive with no referrer. Your AI channel undercounts, and the missing visits sit in Direct. A rise in Direct visits to deep pages that nobody would type, such as a long blog URL, is worth a look.

**Reusing an assistant's name in your own tags.** If your newsletter links use `utm_source=chatgpt-guide`, a rule that matches "chatgpt" in `utm_source` counts your newsletter readers as AI traffic. Keep assistant names out of your own campaign tags.

**Averaging conversion rates across assistants.** If ChatGPT converts at one rate and Perplexity at another, the channel's rate is not the average of the two. Add up the conversions, add up the visitors, then divide. A small source with a high rate otherwise pulls the average far from the truth.

## How misomoon shows AI assistants as their own channel

misomoon gives each visit one of 11 channels. The rules run in order, the first one that matches wins, and **AI Assistants** is rule 1. [What the numbers mean](https://docs.misomoon.com/metrics#channels) lists every rule. A visit goes into **AI Assistants** when either of these is true:

- Its referrer is a known AI assistant: ChatGPT (`chatgpt.com`, `chat.openai.com`), Perplexity (`perplexity.ai`), Claude (`claude.ai`), Gemini (`gemini.google.com`), Copilot (`copilot.microsoft.com`), DeepSeek (`chat.deepseek.com`), You.com (`you.com`), Phind (`phind.com`), Meta AI (`meta.ai`), or Grok (`grok.com`).
- Its `utm_source` contains `chatgpt`, `openai`, `perplexity`, `claude`, `gemini`, or `copilot`, in any case.

A few details decide the edge cases:

- misomoon compares the referrer host without a leading `www.` and then without a leading `m.`. A listed host also matches its subdomains.
- Exact hosts are checked before brand patterns, so `gemini.google.com` is Gemini, not Google search.
- `utm_source` reads the `utm_source` parameter of the landing URL, then `ref`, then `source`. A link that ends in `?ref=perplexity` counts as AI traffic too.
- A visit takes its channel from its first event and keeps it. A later page with a new tag doesn't move the visit to another channel.
- A referrer from your own host is no referrer, so moving between your own pages is never a referral.
- Answers on `google.com` count as Organic Search with the source Google, and answers on `bing.com` count as Organic Search with the source Bing. The referrer carries nothing that says otherwise.

The **source** name follows the [source rules](https://docs.misomoon.com/metrics#sources-and-referrers). A known referrer wins, so a click from `chatgpt.com` shows as ChatGPT whatever its tag says. A visit with only a tag gets a tidied version of the tag. `utm_source=chatgpt` becomes ChatGPT, and `utm_source=chatgpt.com` becomes `Chatgpt.com`. Both are in the **AI Assistants** channel.

### Read AI traffic on the dashboard

To see which assistants send people and what those people do:

1. Open **Overview** and pick a period.
2. In the **Where they come from** card, select **AI Assistants** in the left column.
3. On the right, select **Sites** to see each assistant with its visitors. **Links** shows the referrer hosts, and **Campaigns** shows any `utm_campaign` values.
4. To filter the whole dashboard to AI visits, select the filter icon on the **AI Assistants** row.
5. Open **What they read** and select **First page** to see the pages people from assistants landed on.
6. Open **What they did** and select **Goals** to see each goal's **Rate** for those visitors.

To compare with an earlier period, open the period menu and pick **Previous period** or **Last year** under **Compare with**. Each KPI tile then shows its change. If you connected payments, the revenue each source brought shows next to it. [Use the dashboard](https://docs.misomoon.com/dashboard#read-the-panels) covers each card.

To keep the view, save the filter. With the filter set, select **Saved filters**, type a name such as "AI assistants", and select **Save current filters**. The filter also goes into the dashboard URL, so a link carries it. Encode the space when you build the link by hand:

```text
f=channel==AI%20Assistants
```

Imported history stays out of this view. misomoon adds imported days only to reports without filters, so a filtered report counts only the visits misomoon collected.

### Pull the numbers with the API or an MCP client

The Stats API takes the same filter. This call lists AI visits by source for the last 30 days:

```sh
curl -H "Authorization: Bearer $MISOMOON_KEY" \
	"https://app.misomoon.com/api/v1/stats/breakdown?site=shop&period=30d&property=source&filters=channel==AI%20Assistants"
```

Each row has the source as `key`, with `visitors`, `visits`, `pageviews`, `bounce_rate`, and `visit_duration`. Add `compare=previous` to the aggregate endpoint to get the change from the period before. The [API reference](https://docs.misomoon.com/api) lists every endpoint.

If you connected Claude or Cursor through the [MCP server](https://docs.misomoon.com/mcp), ask in plain words: "Which AI assistants sent visitors last month, and which pages did they land on?" The client can answer it with the `get_breakdown` tool and the filter `channel==AI Assistants`. **Export CSV** on the dashboard downloads the same data, with the channels in `channels.csv`.

The [sample dashboard](/demo) shows the channel list with sample data, so you can see where **AI Assistants** sits before you add a site.

## Questions people ask

### Can I see what someone asked ChatGPT before they clicked?

No. Under the default referrer policy, a browser sends only the assistant's origin to another site, such as `https://chatgpt.com/`, and no part of the conversation. misomoon stores the referrer URL without its query string, and no report breaks it down.

### Why does some ChatGPT traffic still show up as Direct?

Some visits arrive with no referrer and no tag. A pasted link, a link marked `noreferrer`, or a link opened from an app can all reach your page that way. misomoon can't tell those visits from a typed address, so it counts them as Direct, and so does every tool that reads the referrer.

### Does misomoon count AI crawlers such as GPTBot as visitors?

No. The tracker is a script, so it counts only browsers that run it, and misomoon drops bots by Cloudflare's bot signals and by user-agent patterns. A crawler that fetches your page for an assistant doesn't appear in your visitor numbers.

### Are Google's AI answers counted as AI Assistants?

Clicks from answers on `google.com` count as Organic Search, because the referrer is `google.com` and nothing in it marks the click as coming from an AI answer. Visits from `gemini.google.com` are a different case. misomoon checks exact hosts first, so those count as Gemini in **AI Assistants**.

### What about an assistant that misomoon doesn't list?

Its visits land in **Referral**, and its host shows under **Links**. Filter the dashboard by that referrer, for example `referrer==example-assistant.com`, and save the filter under **Saved filters**. If you self-host, the host list is in `packages/core/src/channel.ts`.

## Count your AI traffic in a separate channel

misomoon Cloud sorts visits from ChatGPT, Perplexity, Claude, Gemini, and Copilot into **AI Assistants** on every plan. [Start a free trial of misomoon Cloud](https://app.misomoon.com/?signup), add the script tag, and the channel fills in as visits arrive. When your traffic grows, [see the plans](/pricing). If you'd rather run it in your own Cloudflare account, [self-hosting](https://docs.misomoon.com/self-hosting) gives you the same channels.
