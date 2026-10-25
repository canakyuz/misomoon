# Privacy policy

This policy covers the personal data that [legal name] ("we") keeps as the controller:
your account on app.misomoon.com, and visits to misomoon.com and its docs. It doesn't
cover the visitors of the sites our customers measure. For that data, each customer is
the controller and we are its processor, under the
[data processing agreement](dpa.md).

A self-hosted misomoon sends nothing to us. This policy doesn't apply to it.

**Draft.** Items in square brackets need filling in, and a lawyer should review the
policy before it is published.

## Who we are

[Legal name], [registered address], [registration number]. For anything about your data,
email [privacy@misomoon.com](mailto:privacy@misomoon.com).

## What we keep, and why

| Data | Why | Legal basis | How long |
| --- | --- | --- | --- |
| Your email address, name, and a PBKDF2 hash of your password | To run your account | Contract (GDPR Article 6(1)(b)) | Until you delete your account |
| Your teams, roles, guest access, sites, and settings | To run the service | Contract | Until you delete them or your account |
| Sign-in sessions and API keys, stored only as hashes, with when a key was last used | To keep you signed in and let your tools read your stats | Contract | Sessions 30 days; keys until you revoke them |
| Invitations: the invited email address, the role, and who invited | To add someone to a team | Legitimate interest of the team that invites (6(1)(f)) | Until accepted or withdrawn; the link works for 7 days |
| Password reset links, stored as hashes | To let you back in | Contract | One hour |
| Email addresses that receive reports and alerts | To send them | Contract | Until the report is removed |
| Tokens for Google Search Console, and payment provider webhook secrets, when you connect them | To show and import your own data | Contract | Until you disconnect, or delete the site. A Google Analytics token for an import is deleted when the import ends, and within a day if it never starts |
| Your IP address, when you sign in, sign up, or reset a password | To slow down password guessing | Legitimate interest in security | Not stored: it is a key for a one-minute rate limit |
| Emails you send us | To answer you | Legitimate interest | [retention] |
| Your team's plan, its status and paid period, Polar's customer and subscription ids, and when your free trial started | To run the plan you pay for, and to give each person one trial | Contract | Until you delete the team; the trial date until you delete your account |

Polar sells the plans as merchant of record and collects your payment and tax details
itself, under its own privacy policy.

We don't sell your data, use it for advertising, or use it to train AI models.

## Our own sites

misomoon.com and docs.misomoon.com run no analytics, set no cookies, and load nothing
from other companies. If we start counting visits to them, we will do it with misomoon,
without cookies or stored IP addresses
([how misomoon counts](compliance.md#what-misomoon-collects)), and update this section
first.

The dashboard keeps your session token, your theme, and the tabs and views you last
picked in your browser's local storage, and the docs keep your theme. The token is needed
to keep you signed in, and signing out removes it; the rest are choices you made. We set
no cookies. The dashboard's fonts are served by misomoon itself, so opening it sends
nothing to a font service.

## Who receives it

| Who | What for | Where |
| --- | --- | --- |
| Cloudflare, Inc. | Hosting, databases, and email | Your account data in the EU; each site's stats in the region you pick for it; requests at the data center nearest you |
| [Amazon Web Services EMEA SARL] | [Email, if we send it through Amazon SES] | [EU region] |
| Google | Only when you connect Search Console or Google Analytics, to fetch your own data | Google's servers |
| Polar Software, Inc., merchant of record | Sells and bills misomoon Cloud plans. At checkout it gets your email address and your team's id | United States |

Where data leaves the European Economic Area, the transfer relies on the European
Commission's standard contractual clauses or an adequacy decision.

## Your rights

You can see, correct, export, and delete your data, object to processing based on
legitimate interest, and complain to your data protection authority.

- Change your name or password in **Settings** > **Account**.
- Export your stats from the dashboard or the [API](api.md#get-apiv1statsexport).
- Delete your account in **Settings** > **Account** > **Delete account…**. It deletes
  your account at once, with the teams only you are in and their data
  ([Delete your account](teams.md#delete-your-account)). Backups that could still hold
  it expire within [30] days.
- For anything else, email [privacy@misomoon.com](mailto:privacy@misomoon.com). We answer within one month.

## Security

[Security](security.md) describes how we protect data and how to report a vulnerability.

## Changes

We date every change here, and email account owners [30] days before a change that
affects their rights.

- [date]: first version.
