# Share a dashboard

You can let someone read a site's numbers without adding them to your team. A shared
link opens a read-only dashboard for one site, with an optional password, a fixed
saved filter, and an expiry date. A public site is readable by anyone who is signed out. Scripts
and AI tools read through the API with a key.

## Pick a way to share

| Option | Who can open it | What they can read | When access ends |
| --- | --- | --- | --- |
| Shared link | Anyone with the URL | One site, read-only | You delete the link, or it expires |
| Password link | Anyone with the URL and the password | One site, read-only | You delete the link, or it expires |
| Saved-filter link | Anyone with the URL, and the password if it has one | Only the traffic that matches one saved filter | You delete the link, or it expires |
| Public site | Anyone who is signed out, in the dashboard, the API, and MCP | One site, read-only | You set `public` back to `false` |
| Team guest | A person with a misomoon account | One site, as a guest editor or guest viewer. See [Work with your team](teams.md). | You remove the guest |
| API key | A script that holds the key | Every site its owner can read, or one site, with the owner's role. See [API](api.md#authentication). | You revoke or rotate the key |
| MCP | An AI client that holds an API key | The same as the key. See [Ask AI tools about your traffic](mcp.md). | You revoke or rotate the key |

To create a shared link or make a site public, you need the editor role or above on the
site: owner, admin, editor, or guest editor. The **Sharing** tab in **Settings** shows
only for those roles.

## Create a shared link

1. Open **Settings** for the site.
2. Select the **Sharing** tab.
3. In the **Shared links** card, type a name in the **Name** field, such as the client's
   name.
4. To require a password, type one in **Password (optional)**. Leave it empty for a link
   that opens straight away.
5. In **Saved filter**, keep **All traffic**, or pick a saved filter to limit the link to
   it.
6. In **Expires**, pick **Never expires**, **7 days**, **30 days**, **90 days**, or
   **1 year**.
7. Select **Create link**.

The link appears in the list above the form. It shows a **password** label if it has a
password, the saved filter's name if it has one, and "until" with the end date if it
expires. Select the **Copy link** button next to it to copy the URL. The URL has this form:

```text
<your misomoon URL>/share/<slug>
```

For example, `https://analytics.example.com/share/k3m9x2abq`. The slug is 9 random
lowercase letters and digits. Anyone who has the URL can open the link, so send it only to
the people who should see the numbers.

A link without a name is called "Shared link". A name can be 80 characters at most.

### Create a link with the API

To create a link from a script, send `POST /api/v1/sites/:id/shared` with an API key that
has the editor role or above:

```sh
curl -X POST "https://analytics.example.com/api/v1/sites/shop/shared" \
	-H "Authorization: Bearer mm_..." -H "Content-Type: application/json" \
	-d '{"name": "Acme", "password": "a long passphrase", "expires_days": 30}'
```

Every field is optional:

- `name` is the label for the link.
- `password` locks the link. misomoon stores only a salted hash of it.
- `segment_id` is the `id` of a saved filter from `GET /api/v1/sites/:id/segments` that
  everyone on the site sees (`personal` is `0`). The API calls saved filters segments.
  Every query through the link applies it, the page interaction reports too. While a link
  uses it, the saved filter can't be deleted.
- `expires_days` is the number of days until the link stops working, at most 3650. Leave
  it out for a link that never expires.

The response holds the `slug`. `GET /api/v1/sites/:id/shared` lists the site's links, and
`DELETE /api/v1/sites/:id/shared/:slug` deletes one.

## Protect a link with a password

To protect a link, type a password in **Password (optional)** when you create it. Send the
password to the viewer separately from the URL.

When a viewer opens a password link, the dashboard shows the link's name and the text
"This dashboard is shared with a password." The viewer types the password and selects
**Open**. A wrong password shows "wrong password". With the `STATS_LIMIT` rate limit
bound, each IP address gets 100 attempts per minute. After that, the dashboard shows "too
many attempts, wait a minute".

The link's name appears on the password page before the viewer unlocks it, so don't put
anything in the name that the viewer shouldn't see.

You can't add, change, or remove the password of an existing link. Create a new link with
the password you want, send the new URL, and delete the old link.

## Share only part of the data

A saved-filter link shows only the traffic that matches a saved filter, such as one
country, one campaign, or one section of the site.

1. On the dashboard, add the filters you want with **Filter**.
2. Select **Saved filters**.
3. Type a name.
4. Select **Everyone on the site sees it**, so the saved filter belongs to the site and
   not to you.
5. Select **Save current filters**.
6. Create a shared link and pick the saved filter in **Saved filter**.

The **Saved filter** list in **Settings** also offers your personal saved filters. Pick
one that belongs to the site instead. A personal saved filter is deleted with your
account, and the link then shows all traffic.

### What the saved filter fixes

misomoon applies the saved filter to every query the link makes, on the server. That
covers each report, the live view, funnels, paths, and the CSV export.

A viewer can still add filters with **Filter**. A filter on a dimension that the saved
filter doesn't use narrows the data further. A filter on a dimension that the saved filter
already uses is dropped, and the saved filter applies instead. A viewer can therefore see
less than the saved filter, but never more.

The dashboard doesn't show the saved filter to the viewer as filter chips. The numbers
are smaller than the site's totals, and nothing on the page says why.

### Change a saved filter that a link uses

The link reads the saved filter on every request. If you save filters again under the
same name, the new filters replace the old ones, and every link that uses that saved
filter shows the new filters at once.

If you delete a saved filter, every link that used it shows all of the site's traffic.
Delete those links first, or create new links with another saved filter.

## Set an expiry

To make a link stop working on its own, pick a time in **Expires** when you create it. The
dashboard offers 7, 30, 90, or 365 days. The API takes any number of days up to 3650.

When a link expires, misomoon refuses every request made with it, including from viewers
who already unlocked it. Those requests fail with a `401` error that says the shared
link has expired. Opening the URL again shows an error that says "this link has expired or was
removed".

An expired link stays in the **Shared links** list until you delete it. You can't extend
an expiry. Create a new link instead.

## Stop sharing

To stop sharing a link, select the **Delete link** button next to it in the **Shared
links** list. The dashboard deletes the link without asking first.

Deleting a link ends every session opened from it. A viewer who has the dashboard open
loses access on the next request. The URL then shows an error that says "this link has
expired or was removed".

To stop sharing a public site, send `PATCH /api/v1/sites/:id` with `{"public": false}`, as
in [Make a site public](#make-a-site-public).

## Make a site public

A public site is readable by anyone who is signed out, with no link and no password. The
dashboard has no control for it, so you set it with the API.

1. Create an API key for the site in **Settings** > **Integrations**, or use one you
   have. The key acts with your role, so you need the editor role or above on the site.
2. Send `PATCH /api/v1/sites/:id` with `{"public": true}`:

```sh
curl -X PATCH "https://analytics.example.com/api/v1/sites/shop" \
	-H "Authorization: Bearer mm_..." -H "Content-Type: application/json" \
	-d '{"public": true}'
```

The response is the updated site. To make the site private again, send
`{"public": false}`. You can also pass `"public": true` when you create a site with
`POST /api/v1/sites`.

### What public means

A public site is open to everyone who reaches your misomoon URL signed out:

- The dashboard opens the site at `<your misomoon URL>/?site=<id>`. A visitor who is
  signed out sees every public site in the site menu, so they can find the site without
  the `id`.
- `GET /api/v1/sites` without a token lists every public site.
- The Stats API answers requests without a token for the site. Those requests share a
  limit of 100 per minute per IP address.
- The MCP server answers clients without a key. Its `list_sites` tool lists the public
  sites, and its read tools return their stats.

Anyone signed out can also read the site's goals, funnels, shared saved filters, and
annotations. They can't change anything, because every change needs the editor role or
above. The site's daily usage and its Google search terms from
[Search Console](import.md#connect-search-console) stay hidden: the Stats API and MCP
answer `403` with `search terms are shown to the site's team only`.

A person who is signed in to an account with no role on the site doesn't see a public
site in their dashboard. They can open it signed out, for example in a private window.

## Give a script or an AI tool read access

A script or an AI tool reads with an API key in the `Authorization: Bearer` header.
**Settings** > **Integrations** creates a key that reads only the current site. For a key
that reads every site you can see, use `POST /api/v1/keys` without a `site`.

A key acts with its owner's role. A key from an editor can also change the site, for
example its goals and shared links. For a key that can only read, have a person with the
viewer role create it. Viewers see the **Integrations** tab too.

- To connect Claude, Cursor, or another MCP client, follow [Ask AI tools about your traffic](mcp.md).
- To call the Stats API from a script, see [API](api.md), which lists the endpoints,
  parameters, and filters.

A script can also read through a shared link. `POST /api/v1/share/:slug` with
`{"password": "..."}` returns an `sh_` token. The token is read-only, reads one site, and
applies the link's saved filter to every query. It lasts 7 days at most, so the script trades
the link for a new token when the old one expires.

## What a viewer sees

A shared link opens the dashboard for one site, with **Read-only** in the navigation
bar. The viewer can:

- open **Overview**, **Live**, **Funnels**, **Paths**, **Behavior**, and **Speed**
- pick a period and a comparison
- add filters, which the link's saved filter limits as described in
  [What the saved filter fixes](#what-the-saved-filter-fixes)
- apply the site's shared saved filters from **Saved filters**
- run the site's saved funnels, and try steps without saving them
- download the CSV export with **More** > **Export CSV**

The viewer can't open **Settings**, save filters or funnels, sign in from the navigation bar,
see the site's daily usage, or see the Google search terms from
[Search Console](import.md#connect-search-console), which only the site's team sees. The keys `1` to `6` switch views, and `7` does nothing.

A viewer who is signed in to misomoon in the same browser still sees only the shared
link's site. The dashboard doesn't send their own session with requests from the link.

## How long a viewer stays unlocked

When a viewer opens a link, misomoon trades it, and the password if it has one, for a
read-only `sh_` token. The token lasts 7 days, or until the link expires if that comes
first.

The dashboard keeps the token for that browser tab. A new tab, or a reload after the token
expires, opens the link again. A link without a password unlocks itself with no prompt. A
link with a password asks for it again.

## Limits

- A link reads one site. To share two sites, create a link on each.
- You can't edit a link. To change its name, password, saved filter, or expiry, create a new
  link and delete the old one.
- A saved-filter link limits the data, not the menus. A viewer sees the names and filters
  of the site's shared saved filters, and the site's goals, funnels, and annotations.
- The per-page reports in **Behavior**, such as the click and scroll reports for one page,
  replace every page filter with the page you pick, the saved filter's page filter too. If
  a saved filter filters by page, a viewer can open those reports for other pages.
- misomoon has no embed code or embed widget. Another site can show a shared link in an
  iframe. The rest of the dashboard, a public site included, refuses to load in a frame on
  another site.
