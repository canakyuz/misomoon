# Troubleshooting

To see what the Worker does, stream its logs:

```sh
npx wrangler tail misomoon
```

Use the name of your Worker. Command-line installs are called `misomoon-api`.

## No visits appear in Live

1. In **Settings** > **Install**, select **Check my site**. It opens your home page and
   says whether the tag is missing, belongs to another site, or is there
   ([Check the install](api.md#check-the-install)). If the tag is there, go on.
2. Reload your site and open the browser console. A browser the tracker doesn't count
   says why, once, as `misomoon skipped: <reason>`.
3. Check the reason:

   | Reason | What to do |
   | --- | --- |
   | `site` | The script URL has no site id. Load `m.js?s=<site id>`, and if a proxy serves it, pass the query string through. |
   | `bot` | The browser is driven by automation (`navigator.webdriver`). |
   | `ignored` | This browser has `misomoon_ignore` set. Run `localStorage.removeItem('misomoon_ignore')`. |
   | `overlay` | The page was opened from the dashboard to draw clicks on it. |

4. If the console shows nothing, open the **Network** tab, and look for the request to
   `api/event`:
   - If there is no request, or it shows `blocked`, an ad blocker dropped it.
     [Serve the tracker from your own domain](PROXY.md).
   - If the browser reports a Content Security Policy error, add your misomoon host to
     `script-src` and `connect-src`.
   - If the response is `202`, the request arrived. Check that `?s=` on the script URL
     is the site id shown in **Settings**, not the domain. Check that the page is on the
     site's domain or one of its subdomains: `localhost` is not, so a local copy of the
     site counts nothing. Check the site's path rules under **Settings** > **Install**.

The endpoint always answers `202`, even for an event it drops. It drops events from
bots, events for a site id that doesn't exist, and events from a page on another
domain.

## The deploy fails

- **`Queue misomoon-events does not exist`**: An older deploy script didn't create the
  queues. Create them, and deploy again:

  ```sh
  npx wrangler queues create misomoon-events
  npx wrangler queues create misomoon-events-dlq
  ```

- **A D1 database is not found**: A `database_id` in `wrangler.jsonc` doesn't exist in
  this account, for example after you copied the file from another account. On a
  command-line install, set the id back to its placeholder, such as
  `00000000-0000-0000-0000-000000000001`, and the deploy creates the database.
- **`pnpm deploy` copies files into a folder instead of deploying**: `deploy` is a
  built-in pnpm command. Use `pnpm --filter @misomoon/api run deploy`.

## Sign-up says "sign-up is by invitation on this server"

Either `SIGNUPS` is `invite` and the instance already has an account, or `SIGNUPS` is
`closed`. Ask a team owner or admin to invite you from **Settings** > **Team**. An
invitation works whatever `SIGNUPS` says. [Work with your team](teams.md) covers
invitations.

## Emails don't arrive

1. Check that one email provider is set up: the `EMAIL` binding or the three `AWS_SES_*`
   settings. If you set `EMAIL_PROVIDER`, check that it names that provider.
2. Check that `EMAIL_FROM` uses an address on a domain that the provider verified.
   The default address is on `misomoon.com`, and your provider refuses it.
3. Look for `email failed` lines in `wrangler tail`. They name the provider and its error
   code, for example `E_SENDER_DOMAIN_NOT_AVAILABLE` from Cloudflare Email Service.

## A site stops recording events during the day

The site reached its daily ingest cap. Its owners and admins got an email named
"Tracking for ... is paused until 00:00 UTC". `GET /api/v1/sites/:id/usage` shows
`"capped": true` for that day. To give the site a higher cap, see
[Daily ingest cap](configuration.md#daily-ingest-cap).

## Links in email reports point to misomoon.com

Set the `PUBLIC_URL` variable to the address of your dashboard, for example
`https://analytics.example.com`.

## The API returns 429

The Stats API allows 100 requests a minute for each API key, or for each IP address
when the caller has no key. Signed-in dashboards and shared links aren't limited.
Sign-up, sign-in, password resets, account deletion, invitation accepts, and shared-link
passwords each allow 100 attempts a minute for each IP address, counted separately for
each one. Wait a minute, or spread the requests out.

## Google import fails with `redirect_uri_mismatch`

In your Google Cloud OAuth client, add `<your misomoon URL>/api/v1/google/callback` as an
authorized redirect URI. misomoon builds the redirect from the address you open the
dashboard on, not from `PUBLIC_URL`, so add one URI for each address you use, such as
the `workers.dev` URL and a custom domain.

## Events reach the dead-letter queue

The queue retries a batch 5 times, and then moves it to `misomoon-events-dlq`. This
happens when the shard databases fail for a long time. Look for errors in
`wrangler tail`. If the queue itself can't take an event, for example because the Free
plan's daily limit is used up, the Worker writes the event straight to the database, so
it isn't lost.

## Still stuck

Open a [discussion](https://github.com/jackzard/misomoon/discussions), or
[report a bug](https://github.com/jackzard/misomoon/issues/new/choose). Include the
version, how you deployed, and the error. Remove API keys and other secrets first.
