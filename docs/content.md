# Publish posts and pages on misomoon.com

The marketing site (`apps/landing`) reads its blog posts, extra pages, and authors from
a D1 database. You write them in Markdown and send them to the site's content API. The
comparison pages under `/alternatives`, the features page, and the pricing page are
code, in `apps/landing/src/lib/alternatives.ts`, `apps/landing/src/lib/features.ts`, and
`apps/landing/src/lib/pricing.ts`. The plans' prices and limits come from
`packages/core/src/plans.ts`, the list the API enforces, so change them there. The legal
pages, `/privacy`, `/terms`, `/dpa`, and `/security`, render [the privacy
policy](privacy.md), [the terms](terms.md), [the data processing agreement](dpa.md), and
[the security page](security.md) from `docs/` when the site is built. A legal page that still contains a `**Draft.**` note is marked `noindex`
and left out of the sitemap. None of these pages use this API.

A post appears at `/blog/<slug>`. A page appears at `/<slug>`, and a page slug can have
up to three segments, such as `/guides/setup`. Each author has a page at
`/authors/<id>`.

## Set up the database and the token

The site needs two things on Cloudflare: the `CONTENT` D1 database and the
`CONTENT_TOKEN` secret. [Configuration](configuration.md#marketing-site) lists them.

1. Deploy the site from `apps/landing`:

	```sh
	pnpm run deploy
	```

	Write `pnpm run deploy`, because `pnpm deploy` is a different pnpm command. The script
	builds the site, runs `wrangler deploy`, and applies the migrations in
	`apps/landing/migrations` to the remote database. On the first deploy, `wrangler deploy`
	creates the `misomoon-content` database, because `wrangler.jsonc` gives no
	`database_id`. Until the migrations finish, content pages answer `503`.

2. Make a token, and keep a copy of it. Wrangler doesn't show a secret again.

	```sh
	openssl rand -base64 32
	```

3. Set the token as the secret that allows writes, and paste it when Wrangler asks:

	```sh
	wrangler secret put CONTENT_TOKEN
	```

To work locally, run `pnpm db:migrate` once in `apps/landing`. It creates the tables in
the local database that `vp dev` uses. Then put a token in `apps/landing/.dev.vars`,
which git ignores:

```sh
CONTENT_TOKEN=local-dev-token
```

## Write a post

A post is a Markdown file with a front matter block. The file name is the slug, so
`count-without-cookies.md` becomes `/blog/count-without-cookies`.

```md
---
title: How misomoon counts a visitor without a cookie
description: misomoon hashes the address, the user agent, and a salt that changes every day. Here is what it keeps and what it deletes.
author: jane-doe
tags: privacy, how-to
status: published
image: https://misomoon.com/blog/salt.png
imageAlt: A diagram of the daily salt, the hash, and the visit it counts
---

## The daily salt

misomoon hashes the address...
```

An author is a file with `kind: author`. The file name is the author id, and the text
below the block is the bio:

```md
---
kind: author
name: Jane Doe
avatar: https://misomoon.com/authors/jane.jpg
sameAs: https://github.com/jane, https://bsky.app/profile/jane.dev
---

Jane builds misomoon's ingest and query planner.
```

A page is a file with `kind: page`. Set `slug` when the page has more than one segment:

```md
---
kind: page
slug: guides/setup
title: Set up misomoon in ten minutes
description: Deploy misomoon to your Cloudflare account, add your first site, and see your first visit in the dashboard.
status: published
---

Deploy the Worker, add a site, and paste the snippet into your page's `<head>`.
```

## Publish the files

Run the `content` script from the repo root. File paths are relative to the folder you
run it in. Set `CONTENT_URL` to the site and
`CONTENT_TOKEN` to its token:

```sh
CONTENT_URL=https://misomoon.com CONTENT_TOKEN=... \
	pnpm --filter @misomoon/landing content publish posts/*.md authors/*.md
```

The script sends authors first, so a post can name an author from the same run. It
prints `created` or `updated` for each file, and the warnings the API returns. A file
that fails prints `failed` with the reason, and the script exits with code 1. Without
`CONTENT_URL`, it writes to `http://localhost:5174`.

To delete an entry or an author:

```sh
pnpm --filter @misomoon/landing content delete post count-without-cookies
```

Publishing the same file again replaces the entry. The publish date stays the date of
the first publish. For a typo fix that shouldn't move the "Updated" date, add
`minor: true` to the block.

## Front matter keys

The keys are the fields of the API's JSON body. A list is comma-separated in front
matter and an array in JSON.

| Key | Entries | Required | Rules |
| --- | --- | --- | --- |
| `kind` | All | No | `post`, `page`, or `author`. Front matter only. Defaults to `post`. |
| `slug` | Posts, pages | No | Front matter only. Defaults to the file name. Lowercase letters, digits, and dashes, at most 120 characters. A post slug has no `/`. A page slug has up to three segments, and its first segment can't be one of the site's own routes: `api`, `blog`, `authors`, `alternatives`, `features`, `pricing`, `privacy`, `terms`, `dpa`, `security`, `demo`, `sitemap.xml`, `sitemap-docs.xml`, `robots.txt`, `llms.txt`, `llms-full.txt`, `feed.xml`, `.well-known`, or `_app`. |
| `title` | Posts, pages | Yes | 1 to 140 characters. Over 60 gives a warning, because search results cut long titles. |
| `description` | Posts, pages | Yes | 1 to 320 characters. Outside 70 to 160 gives a warning. It is the meta description and the lede under the title. |
| `status` | Posts, pages | No | `draft` or `published`. Defaults to `draft`. Only a client with the token reads drafts. |
| `author` | Posts, pages | For a published post | An author id. The author must exist. |
| `tags` | Posts, pages | No | Up to 10. Lowercase letters, digits, and dashes, at most 40 characters each. |
| `image` | Posts, pages | No | An `https` URL or a path on the site. Use at least 1200 pixels wide. A post without one gives a warning. |
| `imageAlt` | Posts, pages | With `image` | Text that describes the image. |
| `canonical` | Posts, pages | No | An `https` URL, for a post first published somewhere else. The sitemap then leaves the entry out. |
| `noindex` | Posts, pages | No | `true` keeps the entry out of search results and the sitemap. |
| `publishedAt` | Posts, pages | No | An ISO 8601 date, such as `2026-10-25T09:00:00Z`. Defaults to the time of the first publish. |
| `minor` | Posts, pages | No | `true` keeps the "Updated" date. Not stored. |
| `name` | Authors | Yes | 1 to 80 characters. |
| `bio` | Authors | No | Up to 600 characters. In a file, the text below the block. |
| `avatar` | Authors | No | An `https` URL or a path on the site. |
| `sameAs` | Authors | No | Up to 10 `https` URLs of the author's profiles. Search engines read them to tell who the author is. |

A post or page needs a body: Markdown, 1 to 200,000 characters, with tables and fenced
code. A post or page file with nothing after its front matter fails with
`400 {"error":"body: Markdown, 1 to 200,000 characters"}`. The site renders the body
when you publish:

- Raw HTML prints as text.
- A link keeps its `href` only for `https:`, `http:`, `mailto:`, a path on the site, or
  a `#heading`. An image takes the same URLs, except `mailto:`.
- A `#` heading becomes an `h2`, because the title is the page's only `h1`. Every
  heading gets an id, and three or more `##` and `###` headings add an "On this page"
  list beside the text.

## Content API

The API runs on the marketing site, not on the API Worker. Reads are public and allow
any origin. Writes need `Authorization: Bearer <CONTENT_TOKEN>`. A request body is JSON
with `Content-Type: application/json`.

| Method and path | What it does |
| --- | --- |
| `GET /api/entries` | Lists entries, newest first: `{ items, next }`. Query parameters: `kind` (`post` or `page`, default `post`), `tag`, `author`, `limit` (1 to 100, default 20), `cursor` (the `next` of the previous page), and `drafts=1` (needs the token). |
| `GET /api/entries/:kind/:slug` | One entry with its rendered `html`, `body`, and `toc`: `{ entry }`. With the token, it also returns a draft. |
| `PUT /api/entries/:kind/:slug` | Creates or replaces an entry. Answers `201` for a new entry and `200` for a replaced one, with `{ entry, warnings }`. |
| `DELETE /api/entries/:kind/:slug` | Deletes the entry and its tags. Answers `204`. |
| `GET /api/authors` | Lists authors: `{ items }`. |
| `GET /api/authors/:id` | One author: `{ author }`. |
| `PUT /api/authors/:id` | Creates or replaces an author. Answers `201` or `200`, with `{ author }`. |
| `DELETE /api/authors/:id` | Deletes an author that no entry names. Answers `204`. |
| `GET /api/tags` | Tags of published posts, most used first: `{ items: [{ tag, count }] }`. |

```sh
curl -X PUT https://misomoon.com/api/entries/post/count-without-cookies \
	-H "Authorization: Bearer $CONTENT_TOKEN" \
	-H 'Content-Type: application/json' \
	-d '{"title":"How misomoon counts a visitor without a cookie","description":"...","body":"## The daily salt\n\n...","author":"jane-doe","status":"published"}'
```

The site moves `updatedAt` only when the title, the description, the body, or the image
changes, and not when `minor` is `true`. A change of tags alone keeps the date. The
sitemap prints `updatedAt` as `lastmod`, and the post page prints it as "Updated".

## Errors

An error answers `{ "error": "<field>: <what is wrong>" }` with one of these statuses:

| Status | When |
| --- | --- |
| `400` | A field breaks a rule in [Front matter keys](#front-matter-keys), the body isn't valid JSON, or the post names an author that doesn't exist. |
| `401` | The token is missing or wrong, or `drafts=1` was sent without it. |
| `404` | No entry or author has that slug or id, or `kind` isn't `post` or `page`. |
| `409` | `DELETE /api/authors/:id` for an author that an entry still names. Move or delete those entries first. |
| `415` | A write without `Content-Type: application/json`. |
| `503` | The Worker has no `CONTENT` binding, the token secret isn't set (for writes), or D1 didn't answer. |

When D1 doesn't answer, blog and author pages show an error page with status `503`.
Pages built from code, such as the home page and the comparisons, keep working. The
sitemap lists only the pages built from code, and `/feed.xml` answers `503` with
`Retry-After: 60`, so feed readers try again instead of dropping the posts.

## Caching

Pages read the database through the cache of the Cloudflare data center that serves the
request. A read stays in that cache for 60 seconds (`CONTENT_TTL` in
`apps/landing/src/lib/server/api.ts`). A write clears the keys it changes in the data
center that took the write. Other data centers show the old version for up to 60
seconds. An author change clears the author page at once, and the posts that print the
author's name within the same 60 seconds.

Browsers and shared caches keep a content page for 60 seconds, and can serve it for 10
minutes more while they fetch a new copy. API reads are public for 60 seconds. A read
that can return drafts isn't cached.
