# Email reports and alerts

misomoon emails a site's numbers to the addresses you subscribe. It sends a weekly or
monthly report, an alert when traffic spikes, and an alert when the site stops sending
pageviews. It also sends account emails: invitations, password resets, and a notice when
a site reaches its daily ingest cap. This page shows how to set up each email, then lists
when each one goes out and what it contains.

## Set up an email provider first

misomoon sends no email until the API Worker has an email provider. Use Cloudflare Email
Service through the `EMAIL` binding, or Amazon SES through the `AWS_SES_REGION` variable
and the two `AWS_SES_*` secrets. Every email comes from `EMAIL_FROM`, which must be an
address on a domain that your provider verified. Set `PUBLIC_URL` to the address of your
dashboard too. The cron job sends reports and alerts without a request to take an address
from, so without `PUBLIC_URL` their links point to `https://misomoon.com`. To attach a PDF
to reports, add the `BROWSER` binding. [Bindings](configuration.md#bindings) lists each
binding, and [Variables](configuration.md#variables) lists each variable. Until a provider
is set up, the **Email reports** card says so and nothing goes out.

## Who can manage reports

The **Email reports** card is on the **Sharing** tab of **Settings**. The card and every
`/api/v1/sites/:id/reports` endpoint need the edit permission on the site. The owner,
admin, and editor team roles have it, and so does a guest editor of that site. Viewers and
billing members don't see the **Sharing** tab.

## Get a weekly report

1. Open **Settings** > **Sharing** and find the **Email reports** card.
2. Type the address in the email field.
3. In **Kind**, select **Weekly report**.
4. Click **Subscribe**.

The address appears in the list with a `weekly` label. The first report goes out on the
next Monday after 08:00 in the site's timezone and covers the Monday to Sunday before it.

For a monthly report, select **Monthly report** in **Kind** instead. It goes out on the 1st
of each month and covers the month before.

The address doesn't need a misomoon account. The server accepts any address of the form
`name@domain.tld` and stores it in lowercase. misomoon sends no confirmation email, and the
emails carry no unsubscribe link. To stop them, someone with the edit permission removes
the subscription, as described in [Unsubscribe an address](#unsubscribe-an-address).

## Get an alert when traffic spikes

1. In the **Email reports** card, type the address.
2. In **Kind**, select **Traffic spike**.
3. In **Visitors**, type how many visitors at once trigger the alert. Leave it empty to use
   10.
4. Click **Subscribe**.

Every 5 minutes, misomoon counts the visitors of the last 5 minutes. When the count reaches
your threshold, it emails "Traffic spike on" and the site name. The email gives the count,
the top source, and the most viewed page. Its **See who is here** button opens **Live** in
the dashboard. After an alert, the subscription sends nothing for 12 hours, however high
traffic goes.

## Get an alert when the site stops sending

A no-traffic alert tells you that the snippet was removed or the site is down. A spike alert
can't catch either case.

1. In the **Email reports** card, type the address.
2. In **Kind**, select **No traffic**.
3. In **Hours**, type how many hours without a pageview trigger the alert, from 1 to 168.
   Leave it empty to use 12.
4. Click **Subscribe**.

Every hour, misomoon counts the site's pageviews over the last `threshold` hours. If there
are none, and the site had pageviews in the 7 days before that window, it emails "No traffic
on" and the site name. A site with no pageviews in that week counts as quiet, not down, so a
new site or a site with very few visitors sends no alert.

The alert goes out once for each quiet spell. While the site stays quiet, misomoon sends
nothing more. After a pageview arrives, the next spell of `threshold` hours without one
sends a new alert.

## Change a threshold

Subscribe the same address with the same kind again, with the new number. A site keeps one
subscription for each address and kind, so the new threshold replaces the old one. An empty
field sets the threshold back to its default.

## Unsubscribe an address

Click the **Unsubscribe** button, the trash icon, next to the address in the list. With the
API, call `DELETE /api/v1/sites/:id/reports/:report` with the subscription's `id`.

## Preview a report

Click **Preview report**. A new tab opens the weekly report for the last full week, as
misomoon would send it now. To preview the monthly report, select **Monthly report** in
**Kind** first. With any other kind selected, the preview shows the weekly report.

The button opens the email's HTML. To see the PDF attachment, open
`GET /api/v1/sites/:id/reports/preview?kind=weekly&format=pdf`, or `kind=monthly`. The PDF
preview needs the `BROWSER` binding. Without the binding, it returns `501`. If Browser Run
can't print the report, it returns `503`.

## Send a test

Click **Send a test**. misomoon builds the report now and sends it to the address in the
email field. With the field empty, the test goes to the first address in the list. The test
is the monthly report when **Kind** is **Monthly report**, and the weekly report for every
other kind. It carries the PDF when Browser Run can print one.

Once the provider accepts the email, the button reads **Sent** for a moment. A test doesn't
change when the next scheduled report goes out. If no provider is set up, or the provider
refuses the email, the request fails with `503`.

A site can send 10 tests an hour. The 11th fails with `429` and the message
`a site sends at most 10 test reports an hour; try again later`. A test counts once it
starts, even when the provider then refuses it. Each test stops counting an hour after it
was sent.

## Change the timezone of reports

Report periods, send times, and the days on the report's chart follow the site's timezone.
To change the timezone, open **Settings** > **Sites**, select a **Timezone**, and click
**Save**. The **Name** field on the same card sets the site name that heads each report.

## When each email goes out

| `kind` | **Kind** in the dashboard | When it sends | `threshold` | How often at most |
| --- | --- | --- | --- | --- |
| `weekly` | Weekly report | On Monday, at the first hourly run after 08:00 in the site's timezone. It covers the last full week, Monday to Sunday. | Not used | Once a week |
| `monthly` | Monthly report | On the 1st, at the first hourly run after 08:00 in the site's timezone. It covers the last full month. | Not used | Once a month |
| `spike` | Traffic spike | When the visitors of the last 5 minutes reach `threshold`. misomoon checks every 5 minutes. | Visitors, a whole number of 1 or more. Default 10. | Once every 12 hours |
| `drop` | No traffic | When the site has had no pageview for `threshold` hours, after pageviews in the 7 days before. misomoon checks every hour. | Hours, a whole number from 1 to 168. Default 12. | Once for each quiet spell |

The cron trigger `*/5 * * * *` in `apps/api/wrangler.jsonc` runs every 5 minutes, and each
run checks spike alerts. The run at minute 15 of each UTC hour also sends weekly and
monthly reports and checks no-traffic alerts. In a timezone with a whole-hour offset,
reports therefore go out at 08:15 local time.

misomoon marks a subscription as sent only when the provider accepts the email. The
subscription list shows that date after the word "sent". If a report fails to send, the
next hourly run tries again, until the Monday or the 1st ends. A report that can't go out
on its day is skipped, not sent later. A spike alert that fails to send is tried again at
the next 5-minute run. Amazon SES gets one more try after 250 ms when it answers `429`. A
`5xx` from SES gets no second try, because SES may have sent the email already.

In each run, misomoon builds one edition for each site and kind and sends it to every
subscriber. Browser Run prints the PDF once for that edition, however many people
subscribe.

## What a report contains

The subject reads "Weekly report for", the site name, and the visitor count, for example
`Weekly report for Shop: 1,234 visitors`. When the site took payments, the subject adds the
revenue. Each report compares its period with the same number of days just before it. The
email has an HTML version, laid out as a small newspaper, and a plain-text version with the
same numbers.

- **Front page.** The site name, the edition, such as `Week 42, 2026` or `No. 10, 2026`, and
  the issue date. The headline names the biggest move: visitors up or down by 10% or more,
  else the revenue, else the visitor count. Two or three sentences say how many people came,
  where most came from, and which day was busiest. A chart shows visitors per day, with the
  period before as a dashed line. A table compares visitors, visits, pageviews, views per
  visit, bounce rate, and visit duration with the period before. Revenue joins the table
  when either period had any.
- **Business.** This page appears only when either period had revenue. It shows the total
  revenue, the average payment, the revenue per visitor, the revenue of the period before,
  and up to 4 top paying sources. It counts payments in the site's currency only, and leaves
  out payments in other currencies.
- **Arrivals.** The top 5 sources, each with its change against the period before, and the 5
  most read pages.
- **World.** The top 5 countries and the top 4 devices.
- **Back page.** The scoreboard lists up to 5 goals with their conversions and conversion
  rates, when the site has goals. The almanac lists the busiest day, the quietest day, the
  most read page, the top source, the top country, and the top device. The **Open the
  dashboard** button opens the dashboard on the report's dates. The last line gives the date
  of the next edition.

A page with no data to show is left out. A period with no visitors gets the headline "A quiet
week" or "A quiet month", and a reminder to check that the snippet is still on the site.

## The PDF attachment

Weekly and monthly reports carry a PDF of the same pages, one sheet per page. Browser Run
prints it through the `BROWSER` binding. The file is named after the site's domain and the
period: `<domain>-week-<week>-<year>.pdf` with the ISO week number, or
`<domain>-<YYYY-MM>.pdf`.

The report goes out without the PDF in these cases:

- The `BROWSER` binding is missing.
- The print fails, for example when the browser time is used up or the print times out. The
  log then has a `report pdf failed` line.
- The Worker runs in `wrangler dev`, which can't print.

Alerts and account emails never carry a PDF.

## What an alert contains

| `kind` | Subject | Body | Button |
| --- | --- | --- | --- |
| `spike` | `Traffic spike on <site name>` | How many people are on the site right now, the top source, and the most viewed page | **See who is here** opens **Live** |
| `drop` | `No traffic on <site name>` | How many hours have passed without a pageview, and that the snippet may have been removed or the site may be down | **Check the site** opens the dashboard |

## Other emails misomoon sends

| Email | Subject | Who gets it | When | Link |
| --- | --- | --- | --- | --- |
| Invitation | `Join <team or site name>` | The invited address | An owner or admin invites someone to the team, or to one site as a guest. | `/invite/<token>`, which works for 7 days. A new invitation to the same address replaces the earlier one. |
| Password reset | `Reset your password` | The address of the account | Someone clicks **Forgot your password?** on the sign-in screen and enters an address that has an account. | `/reset/<token>`, which works for 1 hour. A new request replaces earlier links. |
| Daily-cap notice | `Tracking for <domain> is paused until 00:00 UTC` | The team's owners and admins | The daily ingest cap drops an event for the site for the first time on a UTC day. A blocked site, with a cap of `0`, gets no notice. | The dashboard |

Links in invitations and password resets use `PUBLIC_URL`, or the address of the request
when `PUBLIC_URL` is unset. Links in reports, alerts, and the daily-cap notice use
`PUBLIC_URL`, or `https://misomoon.com`. Without an email provider, the dashboard shows
each invitation link for you to send another way. [Teams](teams.md) covers invitations,
roles, and password resets. [Daily ingest cap](configuration.md#daily-ingest-cap) explains
the cap.

## When an email doesn't arrive

Follow the steps in [Emails don't arrive](troubleshooting.md#emails-dont-arrive). To see why
a send failed, run `wrangler tail` in `apps/api` and look for these lines:

| Log line | What it means |
| --- | --- |
| `email skipped: no email provider set up` | No provider is set up, or `EMAIL_PROVIDER` names one that isn't. Nothing went out. |
| `email failed` | The provider refused the email. The line names the provider, the subject, and the provider's error code. |
| `report failed` | Building or sending a weekly or monthly report, or checking a no-traffic alert, threw an error. The line carries the subscription `id`. |
| `alert failed` | Checking or sending a spike alert threw an error. The line carries the subscription `id`. |
| `report pdf failed` | Browser Run couldn't print the PDF. The report went out without it. |
| `cap email failed` | Sending the daily-cap notice threw an error. |

If report links point to `misomoon.com`, see
[Links in email reports point to misomoon.com](troubleshooting.md#links-in-email-reports-point-to-misomooncom).

## Limits

Anyone with the edit permission can send reports to any address, so each site has caps:

| What | Limit | When it's reached |
| --- | --- | --- |
| Report and alert subscriptions | 20 a site, counting every address and kind | **Subscribe** fails with `400` and `a site has at most 20 report and alert subscriptions`. Changing the threshold of a subscription the site has still works. Remove one to add another. |
| Test reports | 10 a site in any hour | **Send a test** fails with `429` until the oldest of the 10 is an hour old. |

## API reference

Each endpoint needs the edit permission on the site. [Sites](api.md#sites) lists the other
site collections.

| Method and path | What it does |
| --- | --- |
| `GET /api/v1/sites/:id/reports` | Returns `subscriptions`, each with `id`, `email`, `kind`, `threshold`, and `last_sent_at` in milliseconds, and `sending`, which is `true` when an email provider is set up. |
| `POST /api/v1/sites/:id/reports` | Subscribes `email` to `kind`, one of `weekly`, `monthly`, `spike`, or `drop`, with an optional `threshold`. Returns `201`. A second call with the same `email` and `kind` replaces the threshold. A missing or malformed `email`, an unknown `kind`, or a `threshold` out of range returns `400`. A `threshold` is a whole number: 1 or more visitors for `spike`, and 1 to 168 hours for `drop`. Reports store no threshold. A 21st subscription on a site returns `400` ([Limits](#limits)). |
| `DELETE /api/v1/sites/:id/reports/:report` | Removes one subscription. Returns `204`. |
| `GET /api/v1/sites/:id/reports/preview` | Returns the report as HTML. `kind=monthly` gives the monthly report, and any other value the weekly one. `format=pdf` returns the PDF, or `501` without the `BROWSER` binding, or `503` when the print fails. |
| `POST /api/v1/sites/:id/reports/test` | Sends the report for `kind` to `email` now, with the PDF when one prints. `kind=monthly` gives the monthly report, and any other value the weekly one. Returns `{"ok": true}`, `400` without `email`, `429` after 10 tests from the site in an hour ([Limits](#limits)), or `503` when no provider is set up or the provider refuses the email. |

To subscribe an address to no-traffic alerts after 6 hours:

```sh
curl -X POST "https://analytics.example.com/api/v1/sites/shop/reports" \
	-H "Authorization: Bearer $MISOMOON_KEY" -H "Content-Type: application/json" \
	-d '{"email": "ops@example.com", "kind": "drop", "threshold": 6}'
```
