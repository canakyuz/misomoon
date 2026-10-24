# Use misomoon Cloud

misomoon Cloud is misomoon hosted for you at [app.misomoon.com](https://app.misomoon.com).
It runs the same MIT-licensed code as this repository. You sign up, add the script tag
to your site, and read the dashboard. We deploy, update, and monitor the Worker and its
databases. To run misomoon in your own Cloudflare account instead, see
[Run misomoon in your Cloudflare account](self-hosting.md).

## Sign up and track your first site

1. Open [app.misomoon.com/?signup](https://app.misomoon.com/?signup), or select **Start
   free trial** on misomoon.com.
2. Enter your name, email, and a password of 10 characters or more, then select
   **Create account**.
3. Add your site and pick the region for its numbers. You can't change the region later.
4. Copy the script tag that the dashboard shows into the `<head>` of your pages.

The first pageview shows up in **Live** within a few seconds. [Track your
site](tracking.md) covers custom events, revenue, and goals.

## Plans

Every plan has every feature, including revenue by source, click maps, form drop-off,
JavaScript errors, Web Vitals, funnels, email reports, teams, the MCP server, and the
API. Plans differ in how many events they include each month, how long a site can keep
its stats, and how many sites a team can have:

| Plan | Events a month | Keep stats for | Sites |
| --- | --- | --- | --- |
| Starter | 100,000 | Up to 2 years | 1 |
| Growth | 1,000,000 | Up to 3 years | No limit |
| Scale | 5,000,000 | Up to 3 years | No limit |

Prices are on [misomoon.com/pricing](https://misomoon.com/pricing). An event is a
pageview or a custom event. A pageview is one page that a visitor opens, including a page
change in a single-page app. The beacons that add time on page and scroll depth to a
pageview are not events. A plan counts the events of all the team's sites together.

A plan belongs to a team, not to a person ([Work with your team](teams.md)). Each team has
its own plan, and **Settings** > **Team** shows it: the plan, the sites the team has and
the sites it includes, how long its sites keep stats, and this month's events against the
events a month it includes.

### Pick or change a plan

A team's owners and billing members choose, switch, and cancel its plan in **Settings** >
**Team**, and pay by card through Polar ([Pay for misomoon Cloud](billing.md)). For more
events than Scale includes, email [support@misomoon.com](mailto:support@misomoon.com).

### Add a site at the site limit

A team that has all the sites its plan includes can't add another site, or take one in
from another team. The dashboard shows which plan the team is on and how many sites it
includes. The API answers `403` with the code `plan_site_limit` ([Errors](api.md#errors)).
To make room, delete a site, move one to another team, or choose a bigger plan in
**Settings** > **Team** ([Pay for misomoon Cloud](billing.md)). Sites you are a guest on
belong to another team and don't count.

### Move to a smaller plan

A move to a smaller plan deletes no site and changes no setting:

- With more sites than the new plan includes, the team keeps them all. It can't add or
  take in a site until it has fewer than the plan includes.
- With a shorter limit for stats, the next daily cleanup, at 03:15 UTC, deletes the
  visits, events, and payments older than the new limit. Each site's **Keep stats for**
  stays as it was, and applies again if the team moves back up. Export what you want to
  keep first ([Take your data with you](#take-your-data-with-you)).

### Go past your monthly events

A plan counts the events of the team's sites per calendar month in UTC, from the 1st at
00:00 UTC. A team past its plan's events keeps recording for a while, then stops:

- At 80% and at 100% of the plan's events, the team's owners, admins, and billing members
  get an email, once each per month.
- At 125%, misomoon stops recording the team's pageviews and custom events until the next
  month starts, or until the team moves to a plan with room. The same people get one
  email when that happens, and the dashboard shows a banner. On Starter the stop is at
  125,000 events, on Growth at 1,250,000, and on Scale at 6,250,000.
- A move to a bigger plan starts recording again within a minute. The emails start over
  for the new plan.

While recording is stopped, the dashboard and the API still show every number recorded
so far, and payments from your payment provider's webhooks are still recorded. A
payment whose visit came after the stop has no source. A pageview that misomoon didn't
record doesn't come back later.

The count covers the sites the team has now. A site moved to another team mid-month takes
its events for the month with it.

The daily ingest cap is a separate guard against bot floods and broken scripts. When
support sets one on a site, the site stores at most that many events per UTC day, drops
the rest until 00:00 UTC, and the team's owners and admins get one email the first time
a day fills up ([Daily ingest cap](configuration.md#daily-ingest-cap)).

## Try it free for 7 days

Your first team starts with a 7-day trial of every feature, with Growth's limits:
1,000,000 events a month, stats kept for up to 3 years, and any number of sites. The trial
needs no card. **Settings** > **Team** shows the days left, and a banner shows in the
last 2 days.

Each person gets one trial. It starts with the first team you create: the one sign-up
makes, or the one misomoon makes when you add your first site. A team you create after
that starts without a trial, so it needs a plan before it can add a site. A team you
join by invitation runs on its own trial or plan.

When the trial ends, pick a plan for the team ([Billing](billing.md)). Until it has one,
the team has lapsed:

- misomoon stops recording its sites' pageviews and events.
- It can't add a site, or take one in from another team. The API answers `403` with the
  code `plan_required` ([Plan limits](api.md#plan-limits)).
- The dashboard stays readable and its settings stay editable. Its stats are kept for as
  long as each site's **Keep stats for** says, within the trial's 3 years, and you can
  export them at any time.
- Payments from your payment provider's webhooks are still recorded.

To pick a plan, open **Settings** > **Team** and choose one in the **Plan** card
([Pick or change a plan](#pick-or-change-a-plan)). A plan starts recording again within a
minute. Your sites, settings, and the numbers from the trial stay.

## Where your data lives

Each site keeps its statistics in Cloudflare D1 databases in the region you pick when you
add it: the European Union, the United States, or Asia-Pacific. Account data, site
settings, and the daily salts are stored in the European Union. Tracker requests are
answered by the Cloudflare data center nearest the visitor.

Our [data processing agreement](dpa.md) covers the data on misomoon Cloud. Read the
[privacy policy](privacy.md) for the account data we keep about you, and
[Compliance](compliance.md) for what misomoon collects about your visitors.

## How long your numbers are kept

misomoon Cloud keeps a site's visits, events, and payments for 25 months by default, then
deletes them once a day as they pass that age. On Starter, the default is 2 years, which
is the longest Starter keeps. To keep them longer or shorter, change **Keep stats for** in
**Settings** > **Install** > **Privacy**, from 30 days up to your plan's longest: 2 years
on Starter, and 3 years on Growth and Scale. The list offers only what your plan allows,
and the API refuses a longer `retention_days` with the code `plan_retention_limit`.
History you imported from Google Analytics or CSV files is not deleted.
[Privacy settings](compliance.md#privacy-settings) has the details, and
[Take your data with you](#take-your-data-with-you) explains how to export before the
limit.

25 months is the longest the French regulator, the CNIL, allows for audience measurement
without consent. Keeping stats for longer goes past that limit, so a site with visitors
in France may then need consent ([Do you need a consent banner?](compliance.md#do-you-need-a-consent-banner)).
Any site can set a shorter period. On your own server there is no limit until you set one
([Configuration](configuration.md)).

## Take your data with you

Export any period as a ZIP of CSV files from the dashboard, on any plan. To move to your
own instance, deploy misomoon to your Cloudflare account and upload those files with
[Bring your history](import.md#upload-csv-files).

## Choose between Cloud and self-hosting

| | misomoon Cloud | Self-hosted |
| --- | --- | --- |
| Who runs it | We deploy, update, and monitor it | You, in your own Cloudflare account |
| Price | 7 days free, then [a plan](https://misomoon.com/pricing) | Free software. Cloudflare bills you for what the Worker uses |
| Features | Every feature on every plan | Every feature |
| Limits | Events a month, how long stats are kept, and sites, by [plan](#plans) | None from misomoon |
| Data location | The EU, the US, or Asia-Pacific, per site | Your Cloudflare account |
| Agreement | Our data processing agreement | Your agreement with Cloudflare |
