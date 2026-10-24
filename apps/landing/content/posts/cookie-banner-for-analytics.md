---
title: Do I need a cookie banner for analytics? What regulators say
description: A banner turns on whether your analytics stores or reads data on the visitor's device. What EU, French, German, and UK rules say, and what cookieless changes.
tags: privacy, guides
status: draft
---

You need a banner for analytics when your tool stores or reads information on the visitor's device and no exemption covers that use where your visitors are. Dropping cookies doesn't settle the question by itself, because the EU rule covers any information on the device, and the European Data Protection Board reads "reading" to include a script that makes the browser send data. France and the UK let some audience measurement run without consent under conditions, and Germany's law has no such exemption. This is not legal advice.

## Two laws ask two different questions

Two European laws apply to analytics. They ask different questions, and an answer to one is not an answer to the other.

### The ePrivacy rule is about the device

Article 5(3) of the [ePrivacy Directive](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:02002L0058-20091219), as amended in 2009, is the rule behind cookie banners. It says that "the storing of information, or the gaining of access to information already stored, in the terminal equipment of a subscriber or user is only allowed on condition that the subscriber or user concerned has given his or her consent, having been provided with clear and comprehensive information."

The same paragraph has two exemptions. Consent isn't needed for storage or access "for the sole purpose of carrying out the transmission of a communication," or that is "strictly necessary in order for the provider of an information society service explicitly requested by the subscriber or user to provide the service." The directive itself has no exemption for statistics. Analytics rarely counts as strictly necessary for the service the visitor asked for.

The rule speaks of "information," not personal data. The European Data Protection Board (EDPB) says the choice is deliberate. In its [Guidelines 2/2023](https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-22023-technical-scope-art-53-eprivacy-directive_en), the notion "includes both non-personal data and personal data, regardless of how this data was stored and by whom" (paragraph 12). An analytics tool that never touches personal data can still fall under Article 5(3).

### The GDPR is about personal data

The [GDPR](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32016R0679) applies to "any information relating to an identified or identifiable natural person," and its definition names "an online identifier" as one way to identify someone (Article 4(1)). Processing personal data needs a lawful basis from Article 6(1). Consent is one basis. Another is point (f), processing "necessary for the purposes of the legitimate interests pursued by the controller," unless the visitor's interests override them.

Recital 26 adds that the regulation "does not therefore concern the processing of such anonymous information, including for statistical or research purposes." It also says that pseudonymised data, which could be attributed to a person "by the use of additional information," is still personal data.

The two laws stack. The ePrivacy question decides whether you need consent to touch the device. The GDPR question decides which lawful basis covers the personal data you then process. Legitimate interest under the GDPR doesn't replace consent under Article 5(3).

## Cookieless doesn't mean outside Article 5(3)

The EDPB adopted version 2.0 of Guidelines 2/2023 on 7 October 2024. The [guidelines](https://www.edpb.europa.eu/system/files/documents/2024-10/edpb_guidelines_202302_technical_scope_art_53_eprivacydirective_v2_en_0.pdf) describe which technical operations Article 5(3) covers, and they read the rule broadly.

- **Scripts that send data.** Paragraph 33 names "JavaScript code, where the accessing entity instructs the browser of the user to send asynchronous requests with the targeted information," and says such access "clearly falls within the scope of Article 5(3)."
- **Headers and addresses.** Paragraph 43 says relying on HTTP headers such as the user agent to collect information "can lead to the application of Article 5(3)." Paragraph 55 says IP addresses trigger it when they originate from the visitor's equipment. It adds that an entity must take the Article 5(3) steps unless it can ensure that the address doesn't.
- **Local processing.** Paragraph 44 says information a browser uses only inside the device isn't "gaining of access" as long as it doesn't leave the device. Once it, "or any derivation of this information," is sent, the rule applies.

Under this reading, an analytics script that sends the page address, the screen size, or scroll depth to a server is likely inside Article 5(3), cookie or no cookie.

The guidelines stop there. Paragraph 4 says they "do not address the circumstances under which a processing operation may fall within the exemptions from the consent requirement," which should be analysed "on a case-by-case basis accounting for the relevant member state transposition(s), and guidance issued by national Competent Authorities." Paragraph 56 repeats that "the applicability of this article does not systematically mean that consent needs to be collected." Whether an analytics script needs a banner is therefore a national question.

## What regulators say, country by country

The sources differ, and a site with visitors in several countries meets several of them at once.

### France allows audience measurement without consent, under conditions

The CNIL's page on [audience measurement tools](https://www.cnil.fr/fr/cookies-et-autres-traceurs/regles/cookies-solutions-pour-les-outils-de-mesure-daudience), dated 4 July 2025, says trackers limited to what is strictly necessary can be "exemptés de consentement conformément à l'article 82 de la loi Informatique et Libertés" (exempt from consent under article 82 of the French data protection act).

The page lists what the trackers must do:

- Serve "une finalité strictement limitée à la seule mesure de l'audience du site ou de l'application" (a purpose strictly limited to measuring the site's or app's audience), "pour le compte exclusif de l'éditeur" (for the publisher alone).
- Produce anonymous statistical data only.

It lists what they must not do:

- Lead to the data being cross-matched with other processing.
- Pass non-anonymous data to third parties.
- Allow "le suivi global de la navigation de la personne" (tracking of the person's browsing as a whole), which rules out an identifier shared across several sites.

The CNIL then recommends that users be informed, for example in the privacy policy. It gives thirteen months as an example of a tracker lifetime that new visits don't extend, and a maximum of twenty-five months for keeping the data. It also warns that some tools fall outside the exemption because their providers reuse the data for their own purposes.

### Germany has no statistics exemption in its law

Germany transposes Article 5(3) in [Section 25 of the TDDDG](https://www.gesetze-im-internet.de/ttdsg/__25.html). Paragraph 1 requires consent based on clear and comprehensive information for storage on, or access to, the end user's device. Paragraph 2 waives consent only for transmitting a message over a public network, or where the storage or access is "unbedingt erforderlich" (strictly necessary) to provide a digital service the user expressly asked for. The text has no exemption for statistics or audience measurement.

### The UK added a statistics exception in 2026

The Data (Use and Access) Act 2025 added Schedule A1 to the UK's PECR. [legislation.gov.uk](https://www.legislation.gov.uk/uksi/2003/2426/schedule/A1) records the schedule as inserted on 5 February 2026, by section 142(1) and Schedule 12 of the Act, commenced by S.I. 2026/82. Paragraph 5 allows storage or access without consent when all of these hold:

- You provide an information society service.
- The sole purpose is to collect statistics about how the service or website is used, to improve it.
- The information isn't shared with anyone except to help you make those improvements.
- The visitor gets clear and comprehensive information about the purpose.
- The visitor gets "a simple means of objecting, free of charge," and doesn't object.

Paragraph 5(2) excludes collecting or monitoring information that the device emits automatically.

The ICO finalised its [guidance on storage and access technologies](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/) on 29 April 2026. Its page on [the exceptions](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/what-are-the-exceptions/) gives automatically emitted information as "wifi probe requests," and lists uses it expects to qualify:

- Total visits to the website, page by page.
- Interactions with pages, such as scroll depth.
- Device types, browsers, and operating system versions.
- How visitors arrived, such as from search results or a referrer URL.
- A/B tests.
- "Coarse geolocation information" at city or region level, where people can't be identified.
- Load speeds, bounce rates, and exit pages.

It lists uses that need consent instead. Among them are logs or recordings of individual visitors, advert measurement, connecting a visitor ID to purchases shared with advertising partners, tracking or profiling individuals or groups, and monitoring visitors across services.

A third-party provider is allowed only as "a processor, not a joint controller," and only if it doesn't link the data with other information. On retention, the ICO says you "must only store individual-level information for as long as you need it," and that daily aggregation could be appropriate. This is not legal advice.

## Decide for your own site

These checks apply whichever tool you use.

1. List what your analytics stores on the device. Look for cookies, localStorage keys, and anything a script writes.
2. List what it makes the browser send, and where it goes. Include headers the server reads, such as the IP address and the user agent.
3. Find out whether the provider reuses the data for its own purposes. The CNIL excludes such tools from its exemption, and the ICO requires a processor.
4. For each country your visitors come from, match the purpose to an exemption. If none fits, ask for consent before the script runs.
5. Tell visitors what you measure, and give them a way to object. The UK makes both conditions of the exception, and the CNIL recommends informing visitors.
6. Set a retention period. The CNIL recommends at most 25 months.
7. Record your GDPR lawful basis for the personal data you process, and review it when you add features.

## Common mistakes

**Treating "no cookies" as the end of the question.** The EDPB says Article 5(3) covers scripts that make the browser send information, and headers such as the user agent. A cookieless tool narrows what you store, not necessarily what you access.

**Using legitimate interest to answer the ePrivacy question.** Article 6(1)(f) of the GDPR is a lawful basis for processing personal data. It isn't one of the two exemptions in Article 5(3).

**Assuming one country's exemption covers every visitor.** The CNIL's exemption is French guidance, and the UK exception is UK law. Germany's Section 25 has neither.

**Calling any analytics "audience measurement".** Features that follow one visitor, record their session, or tie their visit to an advert go beyond what the CNIL and the ICO describe. The ICO names recordings of individual visitors and advert measurement as uses that need consent.

**Skipping the objection route in the UK.** Paragraph 5 of Schedule A1 requires a free, simple way to object. A privacy policy that only describes the analytics doesn't meet that condition.

## How misomoon fits these rules

misomoon avoids the usual reasons for a banner. It sets no cookies, stores nothing on the visitor's device, and never stores IP addresses. To count unique visitors, it hashes a random salt that changes every day, the site, the IP address, and the user agent, and keeps 16 characters of the hash. The salt is deleted after two days, so nobody can link a visitor from one day to the next or work back to the address ([compliance guide](https://docs.misomoon.com/compliance)).

misomoon doesn't claim to sit outside Article 5(3). The tracker, `m.js`, runs in the browser and sends a beacon with the page path, the referrer without its query, the screen size class, the language, the time on page, and scroll depth. Under the EDPB's reading, that sending can be access to the device. Whether an exemption covers it depends on your country, as the sections above show. misomoon never records sessions or what anyone types.

To set a site up for the audience-measurement exemptions:

1. Open **Settings** > **Install** > **What to track**, and choose the **Light** or **Pageviews only** preset. **Light** keeps outbound links, downloads, form submits, and tagged events. **Pageviews only** keeps none of them. Clicks, JavaScript errors, site search, form fields, and payments collect the most, and the compliance guide says payments are harder to fit into audience measurement.
2. Open **Settings** > **Install** > **Privacy**, and set **Keep stats for**. For the CNIL's recommendation, pick 25 months or less.
3. On the same card, tick **Respect Global Privacy Control and Do Not Track**. misomoon then drops every beacon from a browser that sends `Sec-GPC: 1` or `DNT: 1`.
4. Select **Save**.
5. Copy **Text for your privacy policy** into your privacy policy. It lists only the features you ticked, your retention, whether browser signals are respected, and where the data is kept. Copy it again after you change a setting.
6. Copy the **Opt-out button** snippet onto your privacy page. It sets `misomoon_ignore` in the visitor's browser only when they press it, and while it is set, `m.js` sends nothing. localStorage isn't shared between hosts, so put the button on each host your visitors use.

To turn a feature off on one page, such as checkout, add `data-disable` to the script tag:

```html
<script defer src="https://analytics.example.com/m.js?s=your-site" data-disable="clicks,errors"></script>
```

On misomoon Cloud, misomoon processes your visitors' data as your processor under a [data processing agreement](https://docs.misomoon.com/dpa), and each site keeps its stats in the region you pick when you add it. EU and US data stays in its region, and Asia-Pacific is a placement Cloudflare aims for but doesn't guarantee. The [compliance guide](https://docs.misomoon.com/compliance#legitimate-interest-assessment) has a legitimate interest assessment and a record-of-processing entry to fill in. To see the reports a **Light** setup still gives you, open the [sample dashboard](/demo).

One point is yours to weigh against the ICO's text. misomoon keeps visit rows with the daily visitor id until **Keep stats for** deletes them, and the ICO expects individual-level information to be kept only as long as you need it. This is not legal advice.

## Questions people ask

### Does a cookieless analytics tool need a cookie banner?

It depends on the country. The EDPB says a script that makes the browser send information falls under Article 5(3), cookie or not, and leaves exemptions to national authorities. France and the UK allow audience statistics without consent under conditions. Germany's law has no statistics exemption.

### Is legitimate interest enough for analytics?

Legitimate interest is a GDPR basis for processing personal data. It doesn't answer the ePrivacy question of whether you may store or read information on the device. You need an answer to both.

### Can I use a third-party analytics provider under the UK exception?

Yes, if the provider acts as your processor and doesn't link the data with other information it holds, according to the ICO. You must also tell visitors that you use one. Using the data to link a visit to an advert needs consent.

### Does the CNIL exemption apply outside France?

The CNIL page is guidance from the French regulator on French law. Other regulators issue their own guidance, and the EDPB says exemptions depend on each member state's transposition. Check the rules for each country your visitors come from.

### Does choosing the Light preset make my site compliant?

No tool setting decides that alone. The **Light** preset collects less, so there is less to explain and to fit to an exemption. You still need the privacy policy text, a way to object, and a check of the law where your visitors are.

[Start a free trial of misomoon Cloud](https://app.misomoon.com/?signup), or [see the plans](/pricing). Every feature is on every plan, and the privacy settings above work the same on each. If you'd rather keep the data in your own Cloudflare account, you can also [self-host misomoon](https://docs.misomoon.com/self-hosting).
