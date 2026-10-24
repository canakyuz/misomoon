# Security

This page describes how misomoon protects data, on app.misomoon.com and in the software you
can run yourself, and how to report a vulnerability.

## How data is protected

- **Less data to lose.** No cookies, no IP addresses, and a visitor id that changes
  every day. Email addresses, ids, tokens, and long numbers are removed from free text
  before it is stored ([what misomoon collects](compliance.md#what-misomoon-collects)).
  Cloudflare's per-request invocation logs and traces are off; the Worker's own logs never hold an IP
  address.
- **Encryption.** Every request uses HTTPS. Cloudflare encrypts D1 databases at rest with
  AES-256 and protects traffic inside its network with TLS
  ([D1 data security](https://developers.cloudflare.com/d1/reference/data-security/)).
- **Accounts.** Passwords are hashed with PBKDF2-SHA256 (100,000 iterations, a random salt
  per user). Session tokens, API keys, invitation links, and reset links are stored only
  as SHA-256 hashes. Sign-in, sign-up, password resets, shared-link passwords, and the
  Stats API are rate-limited.
- **Access.** Team roles and per-site guests decide who sees what
  ([roles](teams.md#what-each-role-can-do)). Every query is scoped to the sites the user or
  key may read. An API key can be limited to one site.
- **Webhooks.** Payment webhooks are accepted only with a valid signature from the
  provider.
- **Deletion.** Deleting a site removes its data from every database at once; deleting an
  account removes the teams only it is in ([Delete your account](teams.md#delete-your-account)).
- **The code is open.** Anyone can read how data is collected and stored, in this
  repository.

## Certifications

misomoon itself holds no SOC 2 report or ISO 27001 certificate. It runs entirely on
Cloudflare, which holds both for the products misomoon uses
([Cloudflare compliance](https://www.cloudflare.com/trust-hub/compliance-resources/)).

Two-factor sign-in, single sign-on, and an audit log aren't available yet.

## Report a vulnerability

Email [security@misomoon.com](mailto:security@misomoon.com). Don't open a public issue.
The same address is in `/.well-known/security.txt` on misomoon.com.

- We confirm we received the report within [3] working days, and keep you posted until
  it is fixed.
- In scope: the misomoon code in this repository, and app.misomoon.com.
- Out of scope: denial of service, spam, social engineering, and findings in Cloudflare
  itself (report those to Cloudflare).
- Test only with accounts and sites you own, and don't read or change other people's
  data. If you follow this policy, we won't take legal action against you for your
  research.
- There is no paid bug bounty. We credit reporters in the release notes, if they want.

## Incidents on app.misomoon.com

If a personal data breach affects a customer's data, we tell the customer within the time
the [data processing agreement](dpa.md#9-personal-data-breaches) gives.
