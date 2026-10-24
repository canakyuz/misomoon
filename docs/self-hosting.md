# Run misomoon in your Cloudflare account

This guide deploys misomoon to your own Cloudflare account. Then it walks you through
claiming your instance and tracking your first site. misomoon runs as one Worker with
D1 databases and a queue. You have no server or container to manage.

There are two ways to deploy:

- [With the Deploy to Cloudflare button](#deploy-with-the-button). This takes about
  5 minutes and needs only a browser.
- [From the command line](#deploy-from-the-command-line). Use this to change the code,
  to run more shards, or to deploy from your own CI.

## Before you start

You need a Cloudflare account. The Workers Free plan works for small sites. The Free
plan's queue allows 10,000 operations a day, and each event uses about 3, so it
handles about 3,000 events a day. For more traffic, use the Workers Paid plan. See
[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/),
[D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), and
[Queues pricing](https://developers.cloudflare.com/queues/platform/pricing/).

misomoon creates these resources in your account:

| Resource | Name | What it is for |
| --- | --- | --- |
| Worker | `misomoon` or `misomoon-api` | The API, the tracker, and the dashboard |
| D1 database | `misomoon-control` | Accounts, sites, goals, and keys |
| D1 databases | `misomoon-shard-0`, `misomoon-shard-1` | Events and visits |
| Queues | `misomoon-events`, `misomoon-events-dlq` | Event buffering, and failed batches |
| Cron trigger | Every 5 minutes | Reports, alerts, and retention |

## Deploy with the button

1. Select the button:

   [![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/jackzard/misomoon/tree/deploy/misomoon)

2. Sign in to Cloudflare, and connect your GitHub or GitLab account. Cloudflare copies
   the deploy bundle into a new repository that you own.
3. Keep the default names for the databases and the queues, or change them. The
   migrations use binding names, so any names work.
4. Select **Create and deploy**. The build creates the databases and the queues, applies
   the migrations, and deploys the Worker.
5. When the deploy is done, open the Worker's URL. It looks like
   `https://misomoon.<your-subdomain>.workers.dev`.

Continue with [claim your instance](#claim-your-instance).

The button deploys the bundle that CI builds from `main` and publishes to the `deploy`
branch. It sets `SIGNUPS` to `invite`, so only the first person can sign up.

## Deploy from the command line

You need Node.js 22.5 or later, pnpm 10, and git.

1. Clone the repository and install the dependencies:

   ```sh
   git clone https://github.com/jackzard/misomoon.git
   cd misomoon
   pnpm install
   ```

2. Sign in to Cloudflare:

   ```sh
   pnpm --filter @misomoon/api exec wrangler login
   ```

3. Close open sign-up. In `apps/api/wrangler.jsonc`, set `SIGNUPS` in `vars` to
   `invite`. Change the line if `vars` already has one, so the key appears once:

   ```jsonc
   "SIGNUPS": "invite"
   ```

   The first account can still sign up. Everyone after that needs an invitation.

4. Deploy:

   ```sh
   pnpm --filter @misomoon/api run deploy
   ```

   The command builds the tracker and the dashboard. On the first run, it also creates
   the three D1 databases and the two queues, and writes the database ids into
   `apps/api/wrangler.jsonc`. Then it applies the migrations and deploys the Worker.
   Commit the changed `wrangler.jsonc`, so that the next deploy uses the same databases.

5. Open the URL that the deploy prints.

To keep the data in the EU, set `D1_JURISDICTION=eu` on the first deploy. D1 then runs
and stores the databases only in the EU. Cloudflare sets a database's jurisdiction when
it is created and never changes it, so set it before the first deploy, and on every run
that adds shards. [D1 data location](https://developers.cloudflare.com/d1/configuration/data-location/)
has the details.

To start with more shards, set `SHARD_COUNT`, for example
`SHARD_COUNT=4 pnpm --filter @misomoon/api run deploy`. [Scale the shards](upgrading.md#scale-the-shards)
explains when you need more.

To let each site keep its data in the EU, the US, or Asia-Pacific, set `SHARD_REGIONS`,
for example `SHARD_REGIONS=eu:1,us:1,apac:1`. [Add data regions](upgrading.md#add-data-regions)
explains what each region guarantees.

## Claim your instance

1. Open your misomoon URL, and select **Create an account**.
2. Enter your email, name, and password. This account owns the instance.

After this, the sign-up link is gone. To add people, open **Settings**, and invite them
to your team.

Claim the instance right after the deploy. Until the first account exists, anyone who
knows the URL can sign up.

## Track your first site

1. In **Settings**, add your site's domain.
2. Copy the snippet, and paste it into the `<head>` of every page:

   ```html
   <script defer src="https://misomoon.example.workers.dev/m.js?s=your-site"></script>
   ```

3. Open your site. You appear in **Live** within a few seconds.

The [tracking guide](tracking.md) covers custom events, revenue, and goals.

## Use your own domain

To use a domain such as `analytics.example.com`:

1. Add the domain to Cloudflare as a zone, if it isn't one already.
2. In the Cloudflare dashboard, open **Workers & Pages**, and select the misomoon
   Worker.
3. Open **Settings** > **Domains & Routes**, and select **Add** > **Custom domain**.
4. Enter `analytics.example.com`, and save.
5. Set the `PUBLIC_URL` variable to `https://analytics.example.com`. Then the links in
   email reports point to the right place.

Update the snippet on your sites to use the new domain.

## Turn on optional features

Each feature needs a secret or a variable. In the Cloudflare dashboard, open the Worker,
then **Settings** > **Variables and Secrets**. From the command line, run
`wrangler secret put <NAME>` in `apps/api`.

| Feature | What to set |
| --- | --- |
| Emails: invitations, password resets, reports, and alerts | One provider, and the variable `EMAIL_FROM` with an address on a domain that the provider verified. For [Cloudflare Email Service](https://developers.cloudflare.com/email-service/), add `"send_email": [{ "name": "EMAIL" }]` to `wrangler.jsonc`. For Amazon SES, set the variable `AWS_SES_REGION` and the secrets `AWS_SES_ACCESS_KEY_ID` and `AWS_SES_SECRET_ACCESS_KEY`. |
| Email reports with the right links | The variable `PUBLIC_URL` |
| Google Analytics import and Search Console | The secrets `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` |
| A managed proxy subdomain for each site | The secret `CF_API_TOKEN`, and the variables `CF_ZONE_ID` and `PROXY_CNAME_TARGET` |
| Deleting old data | The variables `RETENTION_DAYS` (the longest any site keeps) and `RETENTION_DEFAULT_DAYS` (for sites that set none) |
| A limit on events per site per day | The variable `INGEST_DAILY_CAP` |

The [configuration reference](configuration.md) explains each one.

Without an email provider, invitations still work. The dashboard shows the invitation
link, and you send it yourself.

A variable that you set in the Cloudflare dashboard is replaced by the next deploy from
the repository. To keep a variable, put it in `vars` in `wrangler.jsonc`. Secrets are
not affected.

## Next steps

- [Connect Claude, Cursor, or another MCP client](mcp.md).
- [Serve the tracker from your own domain](PROXY.md) so that ad blockers don't drop
  events.
- [Upgrade to a new version](upgrading.md).
- [Fix common problems](troubleshooting.md).
