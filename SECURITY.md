# Security policy

## Report a vulnerability

Report security issues privately through
[GitHub's private vulnerability reporting](https://github.com/jackzard/misomoon/security/advisories/new).
Do not open a public issue.

Include the steps to reproduce the issue, what an attacker can do with it, and the
version or commit you tested. We reply within 3 working days, and we tell you when a
fix is released. If you want credit in the advisory, tell us the name to use.

## Supported versions

Security fixes go into the latest release only. To get them, upgrade as
[docs/upgrading.md](docs/upgrading.md) describes.

## What is in scope

- The API Worker in `apps/api`: authentication, team roles, API keys, shared links,
  the MCP server, and event ingestion.
- The tracker `m.js`.
- The dashboard in `apps/dashboard`.
- The proxy templates in `templates/`.

Problems in your own Cloudflare account settings, and in Cloudflare itself, are out of
scope. Report Cloudflare issues to
[Cloudflare's disclosure program](https://www.cloudflare.com/disclosure/).
