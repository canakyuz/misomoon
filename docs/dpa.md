# Data processing agreement

This data processing agreement (DPA) covers the hosted service at app.misomoon.com. It is
part of the terms of service, and it applies from the day a customer adds a site, without
anything to sign. To get a copy countersigned, email [privacy@misomoon.com](mailto:privacy@misomoon.com).

If you run misomoon in your own Cloudflare account, the misomoon project never sees your
data, and this agreement doesn't apply to you. Cloudflare processes it for you under the
[Cloudflare DPA](https://www.cloudflare.com/cloudflare-customer-dpa/), which is part of
your Cloudflare account. If you host misomoon for clients, you are their processor, and
you can use this agreement as a starting point for your own.

**Draft.** Items in square brackets need filling in, and a lawyer should review the whole
agreement before it is published.

## 1. Parties

- **Customer**: the person or organization that adds a site to app.misomoon.com. The
  Customer is the controller.
- **Provider**: [legal name], [registered address], [registration number]. The Provider
  is the processor.

If the Customer itself processes the data for someone else, such as an agency for its
client, the Customer is the processor and the Provider is its sub-processor, under the
same terms.

For account data (the names and emails of the Customer's users, sign-ins, and the team's
plan), the Provider is the controller, and its privacy policy covers it, not this
agreement. Polar Software, Inc. sells the plans as merchant of record and is the
controller of the payment details it collects.

## 2. Terms

Words such as personal data, processing, controller, processor, data subject, and
personal data breach mean what they mean in the General Data Protection Regulation
(EU) 2016/679 (GDPR). "Data protection law" means the GDPR, the UK GDPR, and any other
data protection law that applies to the processing.

"Customer data" means the personal data that the Provider processes for the Customer
through the service: what the tracker, the SDK, the Customer's payment provider, and the
Customer's imports send about the visitors of the Customer's sites.

## 3. What the Provider processes, and on whose instructions

1. The Provider processes Customer data only to provide the service, and only on the
   Customer's documented instructions. The terms of service, this agreement, and the
   Customer's settings in the dashboard (the features the Customer turns on, path rules,
   retention, and connected providers) are those instructions.
2. If the Provider believes an instruction breaks data protection law, it tells the
   Customer and doesn't have to follow it until the Customer confirms or changes it.
3. If a law requires the Provider to process Customer data in another way, the Provider
   tells the Customer first, unless that law forbids it.
4. The Provider doesn't sell Customer data, doesn't use it for its own purposes or to
   train AI models, and doesn't combine it with data from other customers or other
   sources.
5. If a public authority asks the Provider for Customer data, the Provider refers it to
   the Customer, tells the Customer about the request unless the law forbids it, and
   gives only what the law makes it give.
6. Annex 1 lists the subject matter, nature, purpose, and duration of the processing,
   and the types of data and data subjects.

## 4. The Customer's part

The Customer decides which features to turn on and which properties to send, and is
responsible for having a legal basis for the processing, for telling visitors about it
in its privacy notice, and for getting consent where the law where it operates requires
it. The Customer doesn't send names, email addresses, or other direct identifiers in
event names, properties, or page paths, and doesn't send special categories of personal
data (GDPR Article 9), such as health or religion.

## 5. Confidentiality

Only people who need Customer data to run or support the service can access it, and each
of them is bound by a duty of confidentiality.

## 6. Security

The Provider keeps the technical and organizational measures in Annex 2. It may change
them over time, but never so that they protect Customer data less.

## 7. Sub-processors

1. The Customer authorizes the Provider to use the sub-processors in Annex 3.
2. The Provider tells the Customer about a new or replaced sub-processor at least
   [30] days before it starts processing Customer data, by email to the account owner
   and in the change log under Annex 3. Anyone else can ask for these emails at
   [privacy@misomoon.com](mailto:privacy@misomoon.com). The Customer can object in that time on reasonable data protection
   grounds. If the parties can't resolve the objection, the Customer can close its
   account and the Provider refunds any prepaid fees for the time left.
3. The Provider puts each sub-processor under data protection obligations at least as
   protective as this agreement, and stays responsible to the Customer for how each one
   performs them.

## 8. Where the data is, and transfers

1. The Provider stores each site's statistics in Cloudflare D1 databases in the region
   the Customer picks when it adds the site: the European Union or the United States,
   where the databases are created in that D1 jurisdiction and Cloudflare runs and
   stores them only there, or Asia-Pacific, where Cloudflare places them in that region
   on a best-effort basis without a guarantee. Account data, site settings, and the
   daily salts are stored in the EU jurisdiction. A site's region can't be changed
   after it is added. Tracker requests are answered, and briefly queued, by the
   Cloudflare data center nearest the visitor, which may be outside the site's region.
2. Where Customer data leaves the European Economic Area, the UK, or Switzerland,
   including access by the Provider's staff from [country of the Provider], the transfer
   relies on the European Commission's standard contractual clauses (Decision
   (EU) 2021/914), Module 2 (controller to processor) between the Customer and the
   Provider, and Module 3 (processor to processor) or the EU-US Data Privacy Framework
   between the Provider and its sub-processors. The clauses are part of this agreement by
   reference; for the UK, the UK Addendum applies, and for Switzerland, the clauses with
   the changes the Swiss FDPIC requires. [Choose the governing law and courts for the
   clauses (Clauses 17 and 18).]

## 9. Personal data breaches

The Provider tells the Customer about a personal data breach that affects Customer data
without undue delay, and within [48] hours of becoming aware of it. The notice says what
happened, which data and roughly how many data subjects it affects, the likely effects,
and what the Provider has done and will do about it. The Provider adds what it learns
later as it learns it.

## 10. Helping the Customer

1. **Requests from data subjects.** The service has no personal identifiers to look a
   visitor up by: visitor ids change every day and IP addresses are never stored. The
   exception is a buyer, when the Customer connects a payment provider: the provider's
   customer, subscription, and payment ids find that buyer's payments and the visits they
   came from. When the Customer passes on such an id, the Provider finds and deletes those
   records within [one month]. Where a request can be met, the Provider helps the Customer
   meet it, and passes on any request it receives directly.
2. **Impact assessments and regulators.** The Provider gives the Customer the
   information it reasonably needs for a data protection impact assessment, or to consult
   a supervisory authority.

## 11. Audits

The Provider makes available the information needed to show that it meets this agreement,
including this page, the [security page], and Cloudflare's current SOC 2 report and
ISO 27001 certificate. If that isn't enough, or a regulator asks for it, the Customer may
audit the Provider once a year, with [30] days' notice, during business hours, through an
auditor bound by confidentiality who doesn't work for a competitor, at the Customer's
cost.

## 12. Deletion and return

1. Deleting a site in the dashboard deletes its events, visits, imports, and payment
   records at once, from every database that holds them. Deleting an account deletes
   the teams only that account is in, with their sites, the same way.
2. Before closing its account, the Customer can export its data from the dashboard or the
   Stats API.
3. Within [30] days after the account closes, the Provider deletes all remaining Customer
   data, unless a law requires it to keep some, and confirms the deletion in writing if the
   Customer asks. Backups that Cloudflare keeps to restore D1 databases expire within
   [30] days.

## 13. Liability, term, and order

1. Each party's liability under this agreement is subject to the limits in the terms of
   service, except where data protection law doesn't allow a limit.
2. This agreement lasts as long as the Provider processes Customer data for the Customer.
3. If this agreement and the terms of service conflict, this agreement wins on data
   protection. If the standard contractual clauses conflict with either, the clauses win.
4. This agreement is governed by [governing law], and the courts of [place] decide
   disputes, except where the standard contractual clauses say otherwise.

## Annex 1: Details of the processing

**Subject matter and purpose.** Web and app analytics for the Customer's sites: counting
visits and pageviews, where visitors come from, what they do on the site, and which
visits led to a payment.

**Nature.** Collecting, storing, aggregating, and deleting.

**Duration.** While the Customer has an account, then until deleted under section 12.

**Data subjects.** Visitors of the Customer's sites and apps. Buyers who pay through the
Customer's payment provider, if the Customer connects one.

**Retention.** Events and visits are kept for the period the Customer sets for each site
(**Keep stats for**), from 30 days up to the longest the Customer's plan allows: 2 years on
Starter, 3 years on Growth and Scale. A site that sets no period keeps them for 25 months,
or 2 years on Starter. Payments follow the
same period. The daily salt behind visitor ids is replaced every
day and deleted after two days. A payment ref is kept for 30 days and a customer link for
400 days, so that a later renewal or refund finds its visit.

**Types of data.** The Provider never stores IP addresses, never sets cookies, and stores
nothing on the visitor's device. Free text is scrubbed before it is stored: emails, ids,
tokens, links' query strings, and long numbers are removed.

| Collected | Always, or with which feature | Data |
| --- | --- | --- |
| Pageviews and visits | Always | Page path (emails and tokens in it masked), referrer without its query, UTM tags, country, region, city, continent, timezone, network operator (ASN organization), browser, operating system, device type, screen size class, language, and a visitor id: a hash of a daily salt, the site, the IP address, and the user agent, which can't be followed from one day to the next, except that a visit still open at 00:00 UTC keeps both days' ids |
| Engagement | Always | Time the page was in view and had focus, and how far it was scrolled |
| Custom events | Always | Event names, properties, and revenue amounts that the Customer's site sends |
| Outbound links, downloads, form submits, tagged events | Each its own feature | The link's address without its query string, the form's id or name, and the tagged element's properties |
| Web Vitals | Web Vitals | Loading and responsiveness timings |
| Clicks | Clicks | Where on the page an element was clicked, and the visible text of links and buttons, or the label the site gave an element. Never other text on the page |
| JavaScript errors | JavaScript errors | Error messages, scrubbed, and the script's address without its query |
| Form fields | Form fields | Which fields of a form were used and where a visit stopped. Never what was typed |
| Video and audio | Video and audio | The media's name and how far it played |
| Content blocks | Content blocks | Which elements the site marked were seen and clicked |
| Site search | Site search | The search term from the page address, scrubbed |
| Payments | Payments, and a connected payment provider | A random ref per page view, the provider's checkout, payment, subscription, and customer ids, amounts, currencies, and the visit each payment came from. Never names, emails, or card details |

## Annex 2: Technical and organizational measures

- **Encryption.** All traffic uses HTTPS. Cloudflare encrypts D1 databases at rest with
  AES-256 and protects traffic inside its network with TLS.
- **Less data.** No IP addresses, cookies, or device storage. Visitor ids come from a
  salt that is replaced daily and deleted after two days. Free text is scrubbed of
  emails, ids, tokens, query strings, and long numbers before it is stored. Path rules
  let the Customer leave pages out completely, and the Customer can drop visits from
  chosen IP addresses and from browsers that send Global Privacy Control or Do Not
  Track. Cloudflare's per-request invocation logs and traces are turned off, and the service's own
  logs hold no IP addresses.
- **Access.** Dashboard roles (owner, admin, editor, viewer) and per-site guests decide
  who sees what. Passwords are hashed with PBKDF2-SHA256 and a per-user salt; session
  tokens and API keys are stored only as hashes. Sign-in and the Stats API are
  rate-limited.
- **Separation.** Every row is stored and queried by site id; a request can only read
  the sites its user or key may read.
- **Integrity.** Payment webhooks are accepted only with a valid signature from the
  provider.
- **Staff.** [Who at the Provider can reach production data, how access is granted and
  removed, and how it is logged.]
- **Incidents.** [How the Provider detects and handles incidents, and who is on call.]
- **Resilience.** D1 keeps point-in-time recovery for [30] days; the ingest queue retries
  failed writes.

## Annex 3: Sub-processors

| Sub-processor | What it does | Where |
| --- | --- | --- |
| Cloudflare, Inc. | Runs the service: Workers, D1 databases, Queues, email, and the browser that prints report PDFs | Account data in the EU; each site's statistics in the region the Customer picks (EU, US, or Asia-Pacific); requests served at the data center nearest the visitor |
| [Amazon Web Services EMEA SARL, if email goes through Amazon SES] | Sends report, alert, invitation, and password-reset emails to the Customer's users. Visitor data is never in them beyond the totals in a report | [EU region] |

Google receives nothing from the service unless the Customer connects Search Console or
imports a Google Analytics property, and then only the requests for the Customer's own
Google data. Payment providers send webhooks to the service on the Customer's behalf and
are the Customer's own processors.

Polar Software, Inc. sells misomoon Cloud plans as merchant of record. It receives
account data only (a buyer's email and the team's id), never Customer data, so it is not
a sub-processor.

### Changes to the sub-processors

- [date]: first list.

Last updated [date].
