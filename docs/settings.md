# Settings

**Settings** is the dashboard view, on key `7`, where you change how misomoon tracks a
site and who can see it. Its tabs sit in a sidebar, or in a strip above the page on a
screen 860 pixels wide or narrower. Each tab shows only when it has something for your
role on the open site. With no site open, only **Sites** and **Account** show.

The Owner, Admin, Editor, and Guest editor roles can edit a site. Owner and Admin can
also manage people and sites. [Work with your team](teams.md) lists what each role can do.

| Tab | Shows for | `tab` value |
| --- | --- | --- |
| **Install** | Anyone who can open the site. Only roles that can edit change it. | `install` |
| **Goals** | Anyone who can open the site. Only roles that can edit add or delete goals. | `goals` |
| **Sharing** | Roles that can edit | `sharing` |
| **Integrations** | Anyone who can open the site. Imports and Search Console show only for roles that can edit. | `connect` |
| **Revenue** | Roles that can edit | `revenue` |
| **Team** | The site's team owners and admins. On misomoon Cloud, also its billing members, who see only the plan. | `team` |
| **Sites** | Anyone signed in | `sites` |
| **Account** | Everyone | `account` |

## What each tab holds

### Install

**Install** holds six cards. Select **Save** on a card to apply its changes.

| Card | What it does |
| --- | --- |
| **Install** | Shows the site's script tag with a copy button. Paste it into the `<head>` of every page. Below it, a line says whether visits arrive: **No visits yet**, **No visits in the last 24 hours**, or how many visitors came in the last 24 hours. **Check my site**, for roles that can edit, opens the site's home page and says whether the tag is on it ([Check the install](api.md#check-the-install)). [Track your site](tracking.md) covers custom events and revenue. |
| **Install guides** | Links to the install guide for each platform, such as WordPress, Shopify, Webflow, Next.js, Laravel, and Google Tag Manager, each with the platform's logo. **All guides** opens [Install guides](integrations.md). The links open the public docs at docs.misomoon.com, also on a self-hosted instance. |
| **SDK** | The `npm install @misomoon/sdk` command with a copy button, and a link for each entry point: `@misomoon/sdk/web`, `@misomoon/sdk/react`, `@misomoon/sdk/next`, `@misomoon/sdk/react-native`, and `@misomoon/sdk/node`. Each opens the docs page that shows it in use. **SDK docs** opens [the SDK guide](sdk.md). |
| **What to track** | Sets what the tracker collects beyond pageviews: a preset (**Everything**, **Light**, or **Pageviews only**) or features ticked one by one, plus **Search parameters**, **Only count these paths**, and **Never count these paths**. [Choose what to track](tracking.md#choose-what-to-track) explains each feature. |
| **Privacy** | Sets **Keep stats for**, **Never count these IP addresses**, and **Respect Global Privacy Control and Do Not Track**. Below them, **Text for your privacy policy** and **Opt-out button** give text and a snippet to copy. [Privacy settings](compliance.md#privacy-settings) explains each one. |
| **Proxy** | Serves the tracker from your own domain, so ad blockers don't drop it. [Serve the tracker from your own domain](PROXY.md) walks through each option. |

**Keep stats for** sets how long the site's visits, events, and payments are kept.
**Default** follows the server, and the list stops at the server's longest period. On
misomoon Cloud, the team's plan sets both: **Default** is 25 months, or 2 years on
Starter, and the list stops at the plan's longest ([Plans](cloud.md#plans)). The note under
**Keep stats for** says when a period goes past the CNIL's 25 months
([Do you need a consent banner?](compliance.md#do-you-need-a-consent-banner)). **Text for
your privacy policy** lists what the site's saved settings collect.

**Proxy** offers a **Managed subdomain** when the server has it turned on, one-click
deploy buttons, and snippets for your own stack. **Path on your site** sets the path the
snippets use, `/relay` by default.

### Goals

**Goals** lists the site's goals with their type, name, and match. To add a goal:

1. Pick a **Goal type**: **Event** or **Page**.
2. Type an event name, such as `Signup`, or a path, such as `/thanks` or `/docs/*`.
3. Optionally, type a label.
4. Select **Add**.

To delete a goal, select the delete button next to it. Goals also count data you already
collected. [Goals, funnels, and paths](conversions.md) explains goals and conversion rates.

### Sharing

To create a read-only dashboard at `/share/<slug>`, use **Shared links**:

1. Type a name. Without one, the link is named **Shared link**.
2. Optionally, type a password.
3. Pick a **Saved filter** to limit the link to, or keep **All traffic**.
4. Pick when it **Expires**: **Never expires**, **7 days**, **30 days**, **90 days**, or
   **1 year**.
5. Select **Create link**.

Each link in the list has buttons to copy its URL and to delete it.
[Share a dashboard](sharing.md) covers how shared links work.

To get summaries and alerts by email, use **Email reports**. Type an address, pick a
**Kind**, and select **Subscribe**.

| Kind | Sends | Setting |
| --- | --- | --- |
| **Weekly report** | A summary each week | None |
| **Monthly report** | A summary each month | None |
| **Traffic spike** | An alert when visitors online pass a number, at most every 12 hours | **Visitors**, 10 by default |
| **No traffic** | One alert after a number of hours without a pageview, until traffic returns | **Hours**, 1 to 168, 12 by default |

**Preview report** opens the weekly or monthly report as it would be sent now, and **Send
a test** emails it. Reports need an email provider on the Worker
([Configuration](configuration.md)). [Email reports and alerts](reports.md) covers them in
depth.

### Integrations

Each card links to its guide in the public docs: **MCP docs**, **Import docs**, and
**Search Console docs**.

**Connect AI tools (MCP)** connects Claude, Cursor, or another MCP client:

1. If the site has no key yet, select **Create API key for** and the site's name. The key
   reads only this site, and the dashboard shows it once.
2. Copy the `claude mcp add` command or the JSON config, which already hold the key.

**Rotate** gives an existing key a new secret. Select it twice to confirm. Tools that use
the old secret stop working. See [Ask AI tools about your traffic](mcp.md).

**Import history** brings in data from before misomoon:

- **Upload CSV or zip** takes a CSV export, as a zip or as its CSV files.
- **Connect Google** signs in to Google. Pick a **Google property**, optionally the dates,
  and select **Import**. Without dates, the import runs up to yesterday.

Import only the days before you added misomoon, or they count twice. The list shows each
import with its status, dates, and row count, and a button to delete it.

**Google Search Console** adds the Google searches that bring people to the site. Select
**Connect Search Console**, pick the property, and select **Connect**. The searches show
under **Where they come from** > **Search terms**, about two days late. To disconnect,
select the delete button next to the property. [Bring your history](import.md) covers
imports and Search Console.

### Revenue

**Revenue** connects a payment provider, so each payment shows under the source,
campaign, country, and device that brought the buyer.

1. Pick the provider: **Stripe**, **Polar**, **Lemon Squeezy**, **Dodo Payments**, or
   **Your server**.
2. Copy the webhook URL into the provider.
3. Send the events that the card lists.
4. Add the signing secret. For Stripe, Polar, and Dodo Payments, paste the provider's
   secret and select **Save**. For Lemon Squeezy and your own server, select **Make
   signing secret** and copy the secret, which shows once.

The status then reads **Waiting**, **Live**, or **Problem**, with the last event or error.
When payments came in during the last 30 days, the card shows how many it linked to a
visit. **Disconnect** removes the provider. [Connect payments](revenue.md) covers each
provider and the checkout ref.

### Team

**Team** manages the people on the team that owns the open site. Everyone on a team holds
one role on all of its sites. A guest sees one site only.

On misomoon Cloud, a **Plan** card comes first. Owners, admins, and billing members see
it. It shows:

- The team's plan, or **Free trial** with the trial's limits, or **No plan**.
- On the trial, the days left. The line turns yellow in the last 2 days. After the trial,
  the date it ended, and that the team's sites record nothing until it has a plan. A team
  that never had a trial says why: each person gets one, on their first team.
- Its sites out of the plan's limit, how long its sites keep stats, and the events a month
  the plan includes.
- A meter of this month's events. The bar runs to 125% of the plan's events, where
  recording stops, and a mark shows 100%. It turns yellow at 80%. Past 100%, a line says
  when recording will stop, and at 125% the bar turns red, the card shows **Paused**, and
  a line says that recording starts again on the 1st of next month
  ([Go past your monthly events](cloud.md#go-past-your-monthly-events)).

When the server takes payments, the card lists the three plans with their price, events a
month, sites, and how long they keep stats. Owners and billing members get one button on
each plan:

- **Choose** a plan, when the team pays for none. It opens Polar's checkout. Back in the
  dashboard, the card says **Payment received** until Polar confirms the payment, and the
  buttons stay off meanwhile.
- **Switch to** another plan, when the team pays for one. The card asks you to confirm the
  plan and its price, then changes the subscription. When Polar schedules the switch for
  the next renewal, the card says on which day the new plan starts.
- **Keep** the plan, when it is canceled and still running. It stays, and renews.

**Manage billing** opens Polar's customer portal for the card, invoices, and cancelling. It
shows once the team has paid for a plan. The card also says when the plan renews, when a
canceled plan ends, and when the last payment failed. Admins see the plans without the
buttons. [Pay for misomoon Cloud](billing.md) covers each step. A self-hosted server shows
no **Plan** card.

- To rename the team, edit the name and select **Rename**.
- To change someone's role, pick it from the menu next to their name. Only an owner can
  make someone an owner or change another owner.
- To remove someone, select the delete button next to their name. On your own row, the
  same button leaves the team.
- Guests on the open site and pending invitations show in the same list. You can change a
  guest's role, remove a guest, or withdraw an invitation.

To invite someone:

1. Type their email address.
2. Pick **Access to**: **Whole team**, or **Only** and the site's name for a guest.
3. Pick a **Role**.
4. Select **Invite**.

The dashboard shows the invitation link to copy, and emails it when the Worker can send
email. The link works for 7 days. [Work with your team](teams.md) covers roles and
invitations.

### Sites

**Sites** holds up to three cards.

- The open site's **Name**, **Timezone**, and **Revenue currency**, for roles that can
  edit. Select **Save** to apply them. The timezone sets where each day starts and ends in
  your reports. On a server with data regions, the card also shows the site's **Data
  region**, which can't be changed.
- **Your sites** lists every site you can see, with **Open** to switch to it.
- **Danger zone**, or **Leave** for roles that can't manage, holds actions you can't undo.
  An owner can move the site to another team where they are an owner or an admin. Owners
  and admins can delete the site after they type its domain. Anyone except an owner can
  leave the team, or leave the site when they are a guest.

To add a site:

1. Under **Your sites**, type the domain in **Add a site**.
2. Check the timezone, the currency, and, on a server with more than one data region, the
   region. The dashboard guesses them. Select **Change** to set them, or to pick the team
   when you belong to more than one.
3. Select **Add site**. The dashboard opens **Overview** for the new site, which shows the
   setup guide until the first visit ([The dashboard](dashboard.md)).

On misomoon Cloud, a team on Starter has room for one site. At the limit, the form shows
the plan and its limit, says to choose a bigger plan in **Settings** > **Team**, and adds nothing
([Add a site at the site limit](cloud.md#add-a-site-at-the-site-limit)). A team with no
plan and no trial running can't add a site either. The form says to choose a plan in
**Settings** > **Team** ([Try it free for 7 days](cloud.md#try-it-free-for-7-days)).

A site's region can't be changed after you add it
([Add data regions](upgrading.md#add-data-regions)). The dashboard has no control to make a
site public or to set its daily cap. Set `public` through the [Sites API](api.md#sites),
and the cap as [Daily ingest cap](configuration.md#daily-ingest-cap) describes.

### Account

**Account** shows the email you signed in with and your role on the open site.

- To change your name, edit it and select **Save**.
- To change your password, type the current one and a new one of at least 10 characters,
  and select **Save**.
- **Sign out** ends your session.
- **API keys** lists your keys, with the site each one reads or **all your sites**, and
  when each was last used. Select the delete button to revoke a key. A key acts with your
  role, so it loses access when you do.
- **Delete account…** asks for your password, then deletes your account
  ([Delete your account](teams.md#delete-your-account)).

When you are signed out, **Account** shows **Sign in or create an account**.
[Work with your team](teams.md) covers accounts and API keys.
