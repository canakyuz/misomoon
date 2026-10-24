# Work with your team

Every site belongs to one team. A team member holds one role on all of the team's sites,
including sites added later. A guest holds a role on one site only and belongs to no team.

When you create an account, misomoon creates a team named after you, such as "Ada's
sites", and makes you its owner. **Settings** > **Team** always shows the team of the open
site, so open one of a team's sites to manage that team.

On misomoon Cloud, the plan belongs to the team, and covers the team's own sites. A site
where you are a guest counts toward its own team's plan, not yours
([Plans](cloud.md#plans)). The free trial belongs to a person: the first team you create
gets it, and later teams start without one
([Try it free for 7 days](cloud.md#try-it-free-for-7-days)).

## What each role can do

The API checks the permissions from `packages/core/src/roles.ts` on every request.

| Role | Permissions | What it can do |
| --- | --- | --- |
| **Owner** | `read`, `edit`, `manage`, `own`, `billing` | Everything an admin can do. Manage other owners, move the team's sites, and delete the team. |
| **Admin** | `read`, `edit`, `manage` | Everything an editor can do. Manage members other than owners, manage guests, delete sites, and rename the team. |
| **Editor** | `read`, `edit` | Everything a viewer can do. Change goals, funnels, saved filters, imports, shared links, email reports, annotations, the proxy, and site details. Add sites to the team. |
| **Viewer** | `read` | See stats and saved reports. Save personal saved filters. |
| **Billing** | `billing` | No stats and no settings. Opening a site shows **Billing access**. On misomoon Cloud, **Settings** > **Team** shows them the team's plan. No API route checks `billing`. |

A guest holds one of two roles on a single site:

| Guest role | Permissions | What it can do |
| --- | --- | --- |
| **Guest editor** | `read`, `edit` | What an editor can do, on that site. A guest can't add sites. |
| **Guest viewer** | `read` | What a viewer can do, on that site. |

Two rules decide who can give which role:

- Only owners and admins manage people, and only they see the **Team** tab. An admin
  can't invite, promote to, change, or remove an owner.
- A team always keeps one owner. misomoon refuses to change the role of the last owner or
  to remove the last owner, and that includes the last owner leaving.

If someone is both a team member and a guest on one of the team's sites, the team role
applies.

## Invite a teammate

You need the **Owner** or **Admin** role.

1. Open a site of the team, and go to **Settings** > **Team**.
2. Enter the person's email address.
3. In **Access to**, keep **Whole team**.
4. In **Role**, pick the role, and select **Invite**.

The invitation link appears below the form with a copy button. If the instance has an
email provider ([Configuration](configuration.md#bindings)), misomoon also emails it.
Otherwise, send the link yourself. The link works for 7 days.

The invitation shows as **pending** in the member list until the person accepts it. To
withdraw it, select the trash icon next to it. Inviting the same email again replaces the
old link. You can't invite someone who is already on the team.

## Give someone one site

To let someone see one site without joining the team, invite them as a guest. You need the
**Owner** or **Admin** role.

1. Open the site, and go to **Settings** > **Team**.
2. Enter the person's email address.
3. In **Access to**, pick **Only** followed by the site name.
4. In **Role**, pick **Guest editor** or **Guest viewer**, and select **Invite**.

The **Team** tab lists the site's guests. Change a guest's role in the menu next to their
name, or remove them with the trash icon.

## Accept an invitation

Open the link, and select **Accept invitation**. Without an account, enter your name and a
password of at least 10 characters first. With an account, sign in as the invited email
address. An expired or withdrawn link shows an error, so ask for a new one.

## Change a role

You need the **Owner** or **Admin** role.

1. Open a site of the team, and go to **Settings** > **Team**.
2. In the menu next to the person's name, pick the new role.

The change applies to every site of the team. To change the last owner's role, make
someone else an owner first.

## Remove someone

You need the **Owner** or **Admin** role. Only an owner can remove an owner.

1. Open a site of the team, and go to **Settings** > **Team**.
2. Select the trash icon next to the person's name.

The person and their API keys lose access to every site of the team at once.

## Leave a team

1. Open a site of the team, and go to **Settings** > **Sites**.
2. Select **Leave team**. A guest sees **Leave site** instead.

An owner has no leave button there. If the team has another owner, select the trash icon
on your own row in **Settings** > **Team**. The last owner can't leave.

## Create, rename, or delete a team

To rename a team, you need the **Owner** or **Admin** role.

1. Open a site of the team, and go to **Settings** > **Team**.
2. Edit the name at the top of the tab, and select **Rename**.

The dashboard has no button to create or delete a team. Use the API with a session token
from `POST /api/v1/auth/login`. API keys can't call team routes.

```sh
curl -X POST "https://analytics.example.com/api/v1/teams" \
	-H "Authorization: Bearer ms_..." -H "Content-Type: application/json" \
	-d '{"name": "Client work"}'
```

You become the new team's owner. To add a site to it, select **Change** under the domain
field in **Settings** > **Sites**, and pick the team. You can also
[move a site](#move-a-site-to-another-team) into it. On misomoon Cloud, a new team starts
on the free trial only when it is the first team you create. Any later team needs a plan
before it can add or take in a site. Until it has one, adding a site answers `403` with
`plan_required`, and **Settings** > **Team** shows **No plan**.

To delete a team, you need the **Owner** role, and the team must have no sites. Send
`DELETE /api/v1/teams/:team`. misomoon answers `409` while the team still has sites.

## Move a site to another team

You need the **Owner** role on the site's team, and the **Owner** or **Admin** role on the
team that receives it.

1. Open the site, and go to **Settings** > **Sites**.
2. Under **Danger zone**, pick the receiving team in **Team**.
3. Select **Move site**.

Members of the old team lose access unless they are on the new team too. Guests keep
their role, and pending invitations to the site are withdrawn. The API call is
`POST /api/v1/sites/:id/transfer` with `{"team": "<team id>"}`.

On misomoon Cloud, the receiving team needs a plan or a running trial, and room for one
more site. A team with neither answers `403` with `plan_required`. A team on Starter that
has its one site answers `403` with `plan_site_limit` and a message that names the plan
and support@misomoon.com. Either way, the site stays where it was
([Plan limits](api.md#plan-limits)). A site keeps its stats when it moves, and this
month's events move with it: they count toward the receiving team's plan from then on
([Go past your monthly events](cloud.md#go-past-your-monthly-events)).

## Manage your account

**Settings** > **Account** shows your email address, which you can't change. **Sign out**
there ends the session in this browser only. A session lasts 30 days.

### Change your name or password

1. Go to **Settings** > **Account**.
2. Edit your name, or enter your **Current password** and a **New password**.
3. Select **Save**.

A password has 10 to 200 characters. Your other sessions stay signed in.

### Reset a forgotten password

The reset link goes out by email. Without an email provider, misomoon can't reset a
password from the dashboard or the API.

1. On the sign-in screen, select **Forgot your password?**.
2. Enter your email address, and select **Send the link**.
3. Open the link in the email within one hour.
4. Enter a new password, and select **Save and sign in**.

The new password signs you out of every other browser and device.

### Delete your account

1. Go to **Settings** > **Account**, and select **Delete account…**.
2. Enter your password, and select **Delete account**.

misomoon deletes the account at once:

- A team where you are the only member is deleted, with its sites and stats. Export what
  you want to keep first ([Refresh and export](dashboard.md#refresh-and-export)).
- You leave every other team and lose guest access. Those sites and stats stay.
- Your sessions, API keys, saved filters, pending invitations, and email reports are
  deleted.

If you are the only owner of a team with other members, deleting fails. Make one of them
an owner ([Change a role](#change-a-role)), or remove them, and try again. On
app.misomoon.com, backups expire within the time the
[data processing agreement](dpa.md#12-deletion-and-return) gives.

## Manage API keys

An API key starts with `mm_` and acts with your role on each site. Send it in the
`Authorization` header ([API](api.md#authentication)). Each key gets 100 Stats API
requests per minute ([Rate limits](api.md#rate-limits)).

### Create an API key

1. Open the site, and go to **Settings** > **Integrations**.
2. In **Connect AI tools (MCP)**, select **Create API key for** followed by the site name.
3. Copy the key. misomoon shows it only once.

That key reads only that site. To [connect an AI tool](mcp.md#connect-a-client), use it
in the command or JSON shown. For a key that covers every site you can see, send
`POST /api/v1/keys` with a session token and leave out `site`.

### Rotate or revoke an API key

- To rotate a site key, select **Rotate** next to it in **Settings** > **Integrations**,
  then **Confirm rotate**. For a key without a site, send
  `POST /api/v1/keys/:key/rotate`.
- To revoke a key, select the trash icon next to it under **API keys** in
  **Settings** > **Account**.

The old secret stops working at once, so update every tool that uses it.

### What a key can't do

A key can do everything your role allows on its sites, including deleting a site. These
actions need a signed-in person, and a key gets `403`:

- Change your name or password.
- List, create, rotate, or revoke API keys.
- Read or change teams, members, roles, and invitations.
- Add a site, or move one to another team.
- Save a personal saved filter.

## Who can sign up

The [`SIGNUPS` variable](configuration.md#variables) decides who can create an account.
With `open`, the default, anyone can. With `invite`, only the first account can, and it
owns the instance ([Claim your instance](self-hosting.md#claim-your-instance)). With
`closed`, nobody can. Invitations create accounts under every value. When the `STATS_LIMIT` binding exists,
sign-up, sign-in, password reset, and invitation accept allow 100 attempts per minute per
IP address, then answer `429`.

[API](api.md#accounts-and-teams) lists every account, team, and key route.
