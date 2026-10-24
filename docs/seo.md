# How misomoon.com is built for search and AI answers

This page explains the search choices in the marketing site (`apps/landing`), so a
change to it keeps them. It covers the site's own pages, not the analytics product. Each
rule cites the Google page it comes from, with the date the page was last updated and
the date we read it.

Google Search, AI Overviews, and AI Mode all rank the same pages from the same index. A
page that is easy to crawl and answers its question in the first paragraph does well in
all three. Most of what follows comes back to that.

## One URL, one question, one answer

Every page targets one question and answers it in the first paragraph under the `h1`.
On a comparison page, that first paragraph is the `answer` field in
`apps/landing/src/lib/alternatives.ts`. An AI answer quotes a passage it can lift whole,
and a reader who arrives from search wants the answer before the detail.

The site has these kinds of pages:

| Path | Built from | Question it answers |
| --- | --- | --- |
| `/` | Code | What misomoon is. |
| `/features` | `apps/landing/src/lib/features.ts` | What misomoon does, with a link to the docs page for each feature. |
| `/features/<slug>` | `apps/landing/src/lib/feature-pages.ts` | One feature people search for by name, such as heatmaps, with what it shows, how to turn it on, and its limits. |
| `/pricing` | `apps/landing/src/lib/pricing.ts` | What misomoon Cloud costs. |
| `/alternatives` | `apps/landing/src/lib/alternatives.ts` | How misomoon compares with the tools a reader knows. |
| `/alternatives/<slug>` | `apps/landing/src/lib/alternatives.ts` | misomoon or one other tool, for a reader deciding between them. |
| `/blog`, `/blog/<slug>`, `/blog/tag/<tag>` | The content database | Posts, and the posts on one topic. |
| `/authors/<id>` | The content database | Who wrote the posts. |
| `/<slug>` | The content database | Any other page, such as a guide. |

[Publish posts and pages](content.md) explains the content database and its API.

## Comparison pages state facts with sources

Google's spam policies call many similar pages made to rank for similar searches
doorway abuse. A page for each competitor turns into that when only the name changes.
Each comparison page here has its own
table, its own reasons to pick the other tool, and its own switching steps. Every fact
about another product carries a source URL and the date someone checked it, and the
page prints both as numbered footnotes.

`apps/landing/src/lib/alternatives.test.ts` keeps it that way. It fails when:

- a claim has no `https` source or no valid checked date,
- a page has no reason to pick the other tool,
- a description is outside 70 to 160 characters,
- a tracker size differs from the one in [How misomoon compares](comparison.md), or
- another product's name appears in any file except `alternatives.ts`,
  `docs/comparison.md`, and the README.

The persuasive parts of a page come from the same facts, through
`apps/landing/src/lib/verdict.ts`, so nothing on them is written by hand:

- The tally counts the table's rows: the ones misomoon does better, the even ones, and
  the ones the other tool does better.
- "Why teams switch" shows up to three rows misomoon does better, each with its source.
  Privacy and price come first, then funnels, revenue, imports and the rest.
- The weight card says how many times lighter misomoon's Light preset is than the other
  tracker. It rounds down, and it doesn't show when the gap is under 1.5 times.

`apps/landing/src/lib/verdict.test.ts` fails when a comparison has fewer than three of
these to lead with. Add a sourced row, not a headline.

A page that says when the other tool is the better choice is one a reader can trust.
Without that section, the page is an ad, and readers and search engines both treat it
like one.

Source: [Spam policies for Google web search](https://developers.google.com/search/docs/essentials/spam-policies),
updated 2026-08-28, read 2026-10-25. The same page describes scaled content abuse: many
pages made to rank, with little value for the reader. Write a post because it answers
a question someone asks, not to fill a topic.

## Posts name a real author

Google reads who wrote a page from the Article structured data and the byline. Each
post carries `BlogPosting` JSON-LD with the author as a `Person`, the author's page as
`url`, and the profiles in `sameAs`. A published post can't be saved without an author,
and each author has a page at `/authors/<id>` with `ProfilePage` structured data.

Dates are in ISO 8601 with a time zone. `datePublished` is the first publish.
`dateModified` moves only when the title, description, body, or image changes, and not
for a change marked `minor`. A date that moves for a typo fix tells readers and search
engines that the post changed when it didn't.

Source: [Article structured data](https://developers.google.com/search/docs/appearance/structured-data/article),
updated 2026-09-08, read 2026-10-25.

Content written with AI tools is allowed when it is accurate and useful. Content made to
rank, at scale, is spam whoever writes it. Read every post before it goes out, and check
every number in it.

Source: [Using generative AI content](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content),
updated 2026-10-01, read 2026-10-25.

## Structured data on every page

`apps/landing/src/lib/seo.ts` builds the JSON-LD, and `Seo.svelte` prints it with the
title, the description, the canonical URL, and the Open Graph tags.

| Page | Types |
| --- | --- |
| `/` | `Organization`, `WebSite`, `SoftwareApplication`, `FAQPage` |
| `/features` | `CollectionPage`, `SoftwareApplication`, `ItemList`, `BreadcrumbList` |
| `/features/<slug>` | `WebPage`, `FAQPage`, `BreadcrumbList` |
| `/pricing` | `WebPage`, `SoftwareApplication` with an `Offer` for each plan, `FAQPage`, `BreadcrumbList` |
| `/alternatives` | `CollectionPage`, `ItemList`, `BreadcrumbList` |
| `/alternatives/<slug>` | `WebPage`, `FAQPage`, `BreadcrumbList` |
| `/blog` and topics | `Blog` or `CollectionPage`, `ItemList`, `BreadcrumbList` |
| `/blog/<slug>` | `BlogPosting`, `BreadcrumbList` |
| `/authors/<id>` | `ProfilePage` with a `Person`, `BreadcrumbList` |
| `/<slug>` | `WebPage`, `BreadcrumbList` |

Structured data describes what the page already shows. A question in `FAQPage` is a
question printed on the page, with the same answer.

## The sitemap prints only true dates

`/sitemap.xml` lists the pages built from code, then every published entry that is
indexable. It leaves out drafts, entries with `noindex`, and entries whose `canonical`
points to another site. Each URL has `loc`, and `lastmod` only when the site knows the
real date:

- A blog post or page uses its `updatedAt`.
- A comparison page uses the newest checked date among its facts.
- `/alternatives` uses the newest checked date of any comparison.

Google uses `lastmod` only when it is consistently accurate, and ignores `priority` and
`changefreq`, so the sitemap leaves those out. One sitemap holds up to 50,000 URLs or
50 MB. The site is far below that, so it needs no sitemap index.

Source: [Build and submit a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap),
updated 2026-07-08, read 2026-10-25.

### The docs site's pages have their own sitemap

misomoon.com also serves `/sitemap-docs.xml`, which lists every page that
docs.misomoon.com builds and nothing else. The docs site has no Worker code, so its
`robots.txt` names that file, and its own `/sitemap.xml` redirects there. A sitemap on
one host may list another host's pages when that host's `robots.txt` points at it, and
such a sitemap holds that host's pages only. That is why misomoon.com keeps two files
instead of one. `/sitemap-docs.xml` answers `404` when `PUBLIC_DOCS_URL` is unset.

Sources: [Build and submit a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap),
updated 2026-07-08, and [Sitemaps & Cross Submits](https://www.sitemaps.org/protocol.html#sitemaps_cross_submits),
both read 2026-10-25.

The site has no news sitemap. A news sitemap is for publishers in Google News, lists
only articles from the last two days, and holds up to 1,000 of them. A product blog
gets nothing from one.

Source: [News sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/news-sitemap),
updated 2025-12-10, read 2026-10-25.

## Images large enough for Discover and link previews

Each page sets `max-image-preview:large` in its robots meta tag. Google Discover shows
a large card only for an image at least 1200 pixels wide, on a page that allows large
previews. The site's default image, `static/og.png`, is 1200 by 630. Give a post its
own image of at least 1200 pixels wide. The content API warns when a post has none.

Source: [Get on Discover](https://developers.google.com/search/docs/appearance/google-discover),
updated 2026-03-09, read 2026-10-25.

## AI answers need nothing extra

AI Overviews and AI Mode use the same crawling, index, and ranking systems as Search. They need no
special markup, no AI text file, and no other setup. A page shown in Search can be
quoted in an AI answer. The controls are the same as for snippets: `nosnippet`,
`data-nosnippet`, and `max-snippet`. `Google-Extended` in `robots.txt` controls the use
of a page for training Gemini models, and doesn't change Search.

Source: [AI features and your website](https://developers.google.com/search/docs/appearance/ai-features),
updated 2025-12-10, read 2026-10-25.

The site allows every crawler in `robots.txt` and blocks only `/api/`. Both hosts add
`Content-Signal: search=yes, ai-input=yes, ai-train=yes`, which says in the
[Content Signals](https://contentsignals.org) format that search, AI answers, and AI
training may all use the pages. A crawler that doesn't read the line ignores it. Pages
set `max-snippet:-1`, so a snippet or an AI answer can quote a passage of any length.

misomoon.com serves the AI text files for both hosts, and docs.misomoon.com redirects
its own to them:

- `/llms.txt` is a Markdown map in the [llms.txt](https://llmstxt.org) format: the
  product pages, every docs page linked to its Markdown, the comparisons, and the newest
  50 posts. The legal pages and `/llms-full.txt` sit under `## Optional`.
- `/llms-full.txt` is that map followed by the plans, the features, every docs page,
  the legal pages, and the posts in full, with every link made absolute.

Google doesn't use either file. Each costs one route and is built from the same data as
the pages, so neither says anything the pages don't.

### The docs pages carry their own structured data

Each docs page prints a `TechArticle` with a `BreadcrumbList` (docs home, the sidebar
section, the page), a canonical URL on docs.misomoon.com, Open Graph tags with the
site's 1200 by 630 image, and a `text/markdown` alternate link to its `.md` version.

## Links that hold the site together

Every page links to the pages a reader wants next:

- The footer lists the first five comparisons, the blog, the docs, and the legal pages,
  so every page links to them.
- Each comparison page links to the other comparisons, and each claim links to its
  source.
- Each post links to its topics, its author, and up to three related posts that share
  its tags.
- The features page links each feature to its docs page.
- Breadcrumbs on every page below the home page link back up the tree.

A topic page with fewer than two posts has `noindex`, because a list of one post is a
thin page. It turns indexable once a second post has the tag.

## Fast pages without the weight

Pages render on the server, so a crawler gets the full text without running
JavaScript. The comparison data stays on the server, which keeps it out of every page's
JavaScript. Content pages come from the data center's cache, and browsers keep them
for 60 seconds ([Caching](content.md#caching)). Before a change that adds a script or a
large image, check the page's weight in the build output.

## Feeds

`/feed.xml` is an RSS 2.0 feed of the 20 newest posts, with the full text of each. The
head of every page links to it, so a feed reader finds it from any URL on the site.
