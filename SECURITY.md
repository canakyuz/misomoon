# Security policy

## Report a vulnerability

Report security issues privately, by email to
[security@misomoon.com](mailto:security@misomoon.com) or through
[GitHub's private vulnerability reporting](https://github.com/jackzard/misomoon/security/advisories/new).
Do not open a public issue.

Include the steps to reproduce the issue, what an attacker can do with it, and the
version or commit you tested. We reply within 3 working days, and we tell you when a
fix is released. If you want credit, tell us the name to use.

## Supported versions

Security fixes go into the latest release only. To get them, upgrade as
[docs/upgrading.md](docs/upgrading.md) describes.

## What is in scope

The code in this repository, which includes the API Worker, the dashboard, the tracker,
the SDK, the WordPress plugin, and the proxy templates, and the hosted service at
app.misomoon.com.

Denial of service, spam, social engineering, problems in your own Cloudflare account
settings, and findings in Cloudflare itself are out of scope. Report Cloudflare issues to
[Cloudflare's disclosure program](https://www.cloudflare.com/disclosure/).

[docs/security.md](docs/security.md#report-a-vulnerability) has the full policy, including
safe harbor for research that follows it.
