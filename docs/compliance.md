# Use misomoon within privacy law

This guide is for site owners who use misomoon. It covers what misomoon collects, the
privacy settings, the text for your privacy policy, an opt-out button, when a consent
banner may still be needed, and templates for the records the GDPR asks you to keep.

This isn't legal advice. The law depends on your country, your visitors' countries, and
the features you turn on. Ask someone who knows the law where you operate.

## What misomoon collects

misomoon sets no cookies, stores nothing on the visitor's device, and never stores IP
addresses. To count unique visitors, it hashes a random salt that changes every day, the
site, the IP address, and the user agent, and keeps 16 characters of the hash. The salt is
deleted after two days, so nobody can work back to the address or link a visitor from one
day to the next. The one link is a visit still open at 00:00 UTC: it stays one visit, and
its record keeps both days' ids ([Architecture](ARCHITECTURE.md#ingest)).

Every pageview carries the page path, the referrer without its query, campaign tags, the
country, region and city, the network operator, the browser, operating system, device
type, screen size class, and language, and the time on page and scroll depth. What more
it collects depends on the features you tick under **Settings** > **Install** > **What to
track**. Annex 1 of the [data processing agreement](dpa.md#annex-1-details-of-the-processing)
lists each feature's data.

Before anything is stored, misomoon removes what tends to identify someone:

- In page paths, segments that look like an email address or a long token become `:email`
  and `:token`.
- In free text, such as error messages and search terms, email addresses, ids, tokens,
  query strings, and runs of six or more digits are replaced.
- Outbound links, downloads, and error sources lose their query string.
- Form fields send which field was used, never what was typed.
- Clicks keep the visible text of the link or button. Put `data-misomoon-mask` on an
  element that shows a name, such as an account menu, and its clicks carry no text
  ([tracking](tracking.md)).

You still decide what your own custom events and properties carry. Don't put names, email
addresses, or other details that identify a person in them.

## Privacy settings

**Settings** > **Install** > **Privacy** holds three settings for each site. The API sets
them on [`PATCH /api/v1/sites/:id`](api.md#sites).

| Setting | What it does | API field |
| --- | --- | --- |
| **Keep stats for** | Deletes the site's visits, events, and payments once they are older than this. A cleanup at 03:15 UTC each day deletes them, so they go within a day of the limit. A site with more than a million old events on one shard loses the rest over the next days, and the Worker logs `retention behind` until it catches up. **Default** follows the server. On misomoon Cloud it is 25 months, or 2 years on Starter, and the longest is your plan's: 2 years on Starter, and 3 years on Growth and Scale ([Plans](cloud.md#plans)). A server without limits shows **Keep everything** instead, which keeps them until you delete the site ([Configuration](configuration.md)). Imported history is not deleted. | `retention_days`: 30 days to the server's longest, or the plan's on misomoon Cloud (at most 3650), or `null` for the default |
| **Never count these IP addresses** | Drops every beacon from these addresses or ranges before it is stored or counted, for example your office or your own servers. Up to 50 IPv4 or IPv6 addresses or CIDR ranges. Behind a proxy, misomoon matches the visitor's address that the proxy passes on ([proxy](PROXY.md)). | `exclude_ips` |
| **Respect Global Privacy Control and Do Not Track** | Drops every beacon from a browser that sends `Sec-GPC: 1` or `DNT: 1`. Those visitors don't appear in any report, and a payment they make isn't linked to their visit. The tracker carries no code for it: browsers send both headers with the beacon. A proxy must pass the headers on. | `privacy_signals` |

Older settings help too:

- Fewer features collect less. The **Light** preset collects what most privacy-focused
  tools do ([Choose what to track](tracking.md#choose-what-to-track)).
- **Never count these paths** leaves out pages such as an account area.
- `data-disable` on the script tag turns a feature off on one page, such as checkout.

Deleting a site deletes all of its data at once ([Sites](settings.md#sites)), and
deleting your account deletes the teams only you are in
([Delete your account](teams.md#delete-your-account)).

## Add misomoon to your privacy policy

Your privacy policy should say that you use misomoon, what it records, why, for how long,
and how to object. **Settings** > **Install** > **Privacy** > **Text for your privacy
policy** writes that section from the site's saved settings: it lists only the features
you ticked, your retention, whether browser signals are respected, and where the data is
kept. Copy it again after you change a setting.

For a site on app.misomoon.com in the EU region, with the **Light** preset, 13 months of
retention, and browser signals respected, the text reads:

```md
## Analytics

To see how example.com is used, we use misomoon, a privacy-friendly analytics tool. It sets no cookies, and stores nothing on your device unless you opt out of being counted, which it remembers in your browser.

To count unique visitors, misomoon makes an identifier from your IP address and browser with a random value that changes every day, and keeps only that identifier. Your IP address is never stored. The identifier can’t be followed across sites, or from one day to the next, except that a visit still going at midnight UTC keeps both days’ identifiers.

It records:

- the page address, the site that sent you, and campaign tags
- your country, region and city, read from your IP address, and your network operator
- your browser, operating system, device type, screen size and language
- how long a page was open and how far you scrolled
- actions we count, such as a sign-up or a purchase, with the details we attach to them
- links you follow to other sites, without their query string
- files you download, without their query string
- forms you send, by the form’s name, never what you typed
- buttons and links we marked as events

These statistics are counted together; we don’t use them to identify you or to show you ads. misomoon processes these statistics for us under a data processing agreement, on Cloudflare’s network, and stores them in the European Union.

We keep these statistics for 395 days.

We rely on our legitimate interest in understanding and improving our site (Article 6(1)(f) of the GDPR).

If your browser sends Global Privacy Control or Do Not Track, misomoon records nothing. To stop being counted in this browser, use the opt-out button on this page.
```

On your own server, the text says the statistics stay in your Cloudflare account instead.

## Let visitors opt out

Most guidance asks that visitors can object to analytics. **Settings** > **Install** >
**Privacy** > **Opt-out button** gives a snippet for your privacy page:

```html
<button type="button" id="misomoon-opt-out"></button>
<script>
  (function (button) {
    function out() { try { return !!localStorage.misomoon_ignore } catch (e) { return false } }
    function show() { button.textContent = out() ? 'Count my visits again' : 'Stop counting my visits' }
    button.onclick = function () {
      try { out() ? localStorage.removeItem('misomoon_ignore') : localStorage.setItem('misomoon_ignore', 'true') } catch (e) {}
      show()
    }
    show()
  })(document.getElementById('misomoon-opt-out'))
</script>
```

The button sets `misomoon_ignore` in the visitor's browser, the same key you use to
[exclude yourself](tracking.md#exclude-yourself). While it is set, `m.js` sends nothing
and the console says `misomoon skipped: ignored`. A second press removes it. The choice
holds for one browser and one domain: localStorage isn't shared between `example.com` and
`www.example.com`, so put the button on each host the visitor uses. The key is written
only when the visitor asks for it.

## Do you need a consent banner?

misomoon avoids the usual reasons for a banner: cookies, identifiers stored on the device,
and IP addresses kept with the data. Whether that's enough depends on where you are.

- **European Union.** Article 5(3) of the ePrivacy Directive needs consent to store or
  read information on a visitor's device, unless it is strictly necessary. The EDPB's
  [Guidelines 2/2023](https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-22023-technical-scope-art-53-eprivacy-directive_en)
  (version 2.0, published 16 October 2024) read this broadly, so a script that makes the
  browser send information can fall under it even without cookies. National regulators
  apply it differently.
- **France.** The CNIL lets audience measurement run without consent when it only
  produces anonymous statistics for the site's own use, isn't combined with other data,
  doesn't follow visitors across sites, keeps data for at most 25 months, and visitors are
  told about it ([CNIL, audience measurement](https://www.cnil.fr/fr/cookies-et-autres-traceurs/regles/cookies-solutions-pour-les-outils-de-mesure-daudience),
  dated 4 July 2025). On misomoon Cloud, **Keep stats for** is 25 months by default, or 2
  years on Starter. A longer setting, up to 3 years on Growth and Scale, goes past the
  CNIL's limit. On your own server, set it to 25 months or less. Mention it in your privacy policy, and add the opt-out button. Features beyond audience
  measurement, such as payments, are harder to fit.
- **Germany.** Section 25 of the TDDDG follows Article 5(3) and has no exception for
  analytics. Many German sites ask for consent for any analytics.
- **United Kingdom.** The Data (Use and Access) Act 2025 added an exception to PECR for
  storage and access used only to collect statistics that improve a service, as long as
  visitors get clear information and an easy way to object
  ([ICO, the exceptions](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/what-are-the-exceptions/)).
  The privacy policy text and the opt-out button cover both.
- **United States.** Laws such as California's CCPA give visitors the right to opt out of
  the sale or sharing of their data, and Global Privacy Control is a valid opt-out. misomoon
  neither sells nor shares data for advertising. To honour the signal anyway, tick
  **Respect Global Privacy Control and Do Not Track**.

Every feature beyond pageviews adds to what you need to explain. Clicks, JavaScript
errors, site search, form fields, and payments collect the most. The **Light** preset is
the easiest to justify.

Payments stores nothing until you connect a payment provider under **Settings** >
**Revenue**. Once connected, it links each purchase to the visit it came from, and your
payment provider knows who the buyer is. That link is the use most likely to need consent
or a legitimate interest assessment of its own, so connect a provider only when you need
revenue per source.

## Answer a visitor's request

Under the GDPR, a visitor can ask to see or delete their data. misomoon keeps nothing
that finds one person: no IP address, no cookie, and a visitor id that changes every day.
In most cases you can answer that analytics data can't be linked to them (GDPR
Article 11). If the visitor gives you something that identifies their visits, such as a
payment's id from your payment provider, contact us (on app.misomoon.com) or search the
data yourself (on your own server), and delete what you find.

## Legitimate interest assessment

If you rely on legitimate interest, the GDPR expects you to weigh it against your
visitors' interests and keep a record. Copy this, fill in the brackets, and keep it with
your records.

```md
# Legitimate interest assessment: website analytics

Date: [date]. Reviewed by: [name, role].

## Purpose
We measure how [site] is used (visits, pages, sources, and [features]) to improve its
content and performance.

## Necessity
Aggregate statistics are the least intrusive way to know which pages work. We use
misomoon, which sets no cookies, stores nothing on the device, keeps no IP addresses, and
uses a visitor id that changes daily. We collect only [features].

## Balancing
- Visitors expect a site to count its visits; the data is aggregate and not used to
  identify anyone, for advertising, or combined with other data.
- Risks: [none identified / list].
- Safeguards: no cookies or IP addresses stored; emails, ids, and long numbers removed
  from free text; data kept for [retention]; excluded IP addresses [list or none];
  Global Privacy Control and Do Not Track [respected / not respected]; an opt-out
  button on our privacy page; processed by misomoon under a data processing agreement
  [or: in our own Cloudflare account].

## Outcome
Our interest is not overridden by visitors' interests or rights. We review this when we
change features or every [12] months.
```

## Record of processing

The GDPR asks most organizations to keep a record of processing (Article 30). This is the
entry for misomoon.

| Field | Entry |
| --- | --- |
| Name of the processing | Website analytics on [site] |
| Controller | [your organization and contact] |
| Purpose | Measure and improve how the site is used |
| Legal basis | Legitimate interest, Article 6(1)(f) GDPR [or consent] |
| Data subjects | Visitors to [site] |
| Data | See [What misomoon collects](#what-misomoon-collects), for the features [list] |
| Recipients | misomoon and Cloudflare as processors ([sub-processors](dpa.md#annex-3-sub-processors)) [or: Cloudflare, in our own account] |
| Transfers outside the EEA | [none / standard contractual clauses, per the DPA] |
| Retention | [retention_days] days |
| Security measures | [Annex 2 of the DPA](dpa.md#annex-2-technical-and-organizational-measures) |

## Legal documents for app.misomoon.com

- [Data processing agreement](dpa.md)
- [Privacy policy](privacy.md), for your account and our own sites
- [Terms of service](terms.md)
- [Security](security.md), including how to report a vulnerability

A self-hosted misomoon runs in your own Cloudflare account, so these documents don't
apply. Cloudflare's own terms and data processing agreement do.
