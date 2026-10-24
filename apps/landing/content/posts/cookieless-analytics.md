---
title: Cookieless analytics: how it counts visitors and what you lose
description: Cookieless analytics counts unique visitors by hashing the IP address and user agent with a salt that changes daily. Here is what you gain and what you lose.
tags: privacy, guides
status: draft
---

Cookieless analytics counts unique visitors without putting anything on the visitor's device. Instead of reading an id back from a cookie or local storage, the server computes one from each request: it hashes the IP address and the user agent together with a random salt that it replaces every day, and it never stores the address. You lose the ability to recognize a visitor from one day to the next, and in return you have nothing on the device to ask about and far less personal data to keep.

## A computed id replaces a stored one

Most analytics tools count people with a stored id. On the first visit, the script makes a random id and writes it to a cookie or to local storage. On every later visit, it reads the id back and sends it with each event. Two pageviews with the same id belong to the same person, whether they are a minute or a year apart.

A cookieless tool has nothing on the device to read back, so it builds the id from what every request already carries:

- The IP address, which the server sees because it has to answer the request.
- The user agent, the string in which the browser names itself and its operating system.

Neither one is a person, but together, over a short period, they separate visitors well enough to count them. The hard part is to use them without keeping them, and without making an id that follows someone forever. The daily salt solves that.

### The daily-salted hash, step by step

Here is how misomoon computes a visitor id, as the [architecture docs](https://docs.misomoon.com/architecture#ingest) describe it:

1. A pageview or event reaches the Worker with the visitor's IP address and user agent.
2. The Worker looks up the salt for the current UTC day. The salt is a random value. If the day has no salt yet, the Worker makes one and keeps it in the `salts` table.
3. The Worker hashes the salt, the site id, the IP address, and the user agent with SHA-256.
4. It keeps the first 16 hex characters of the hash as `visitor_id`, and it stores the event with that id. The IP address is never stored.
5. At 00:00 UTC a new day starts with a new salt, so the same person gets a new id.
6. The hourly maintenance job deletes salts that are more than two days old.

In code, the formula is one line:

```ts
visitor_id = sha256(daily_salt + site + ip + user_agent).slice(0, 16)
```

### Each input in the hash has a job

**The salt stops anyone from recomputing the id.** Without a salt, a hash of the address and the user agent stays the same forever. That is a permanent id, built from the request instead of a cookie, and anyone can reverse it. IPv4 addresses are 32 bits long ([RFC 791](https://www.rfc-editor.org/rfc/rfc791)), few enough to hash every possible address with each common user agent and match the results. A random salt blocks that. Once misomoon deletes the salt after two days, nobody can work back from an id to an address, or link one day's id to the next, including the people who run the server.

**The site id keeps sites apart.** Because the site is part of the input, one person on two sites gets two unrelated ids on the same day. The id can't follow anyone across sites.

## What you gain without cookies

### Nothing on the device to store or lose

The tracker writes no cookie and no local storage key, so there is no stored id to expire, clear, or block. Cookie-based counts drift for reasons unrelated to your traffic. Safari, for example, deletes all of a site's script-writable storage, local storage included, after seven days of Safari use without interaction on the site ([WebKit](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)). A returning visitor whose id was wiped looks new. A cookieless count doesn't depend on that storage, so it doesn't drift with it.

### A simpler consent picture

Cookies and identifiers stored on the device are the most common reason for a consent banner. Removing them takes away that reason, but not every reason. In the EU, the rule is Article 5(3) of the ePrivacy Directive. The European Data Protection Board's [Guidelines 2/2023](https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-22023-technical-scope-art-53-eprivacy-directive_en) (version 2.0, adopted 7 October 2024) say that JavaScript that tells the browser to send information "clearly falls within the scope" of that article, with or without cookies. The same guidelines also say that the article applying "does not systematically mean that consent needs to be collected", because exemptions exist. In the UK, the ICO describes an exception for storage and access whose sole purpose is to collect statistics about how a service is used, as long as you give clear information about it and a free, simple way to object ([ICO](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/what-are-the-exceptions/)).

So cookieless analytics shrinks the question. It doesn't always remove it. misomoon's guide to [using it within privacy law](https://docs.misomoon.com/compliance#do-you-need-a-consent-banner) goes through the EU, France, Germany, the UK, and the US. This is not legal advice.

### Less personal data to keep

The database holds no IP address and no id that lasts longer than a day. Anyone who gets a copy finds daily ids that can't be joined across days.

## What you give up

### Returning visitors become new visitors

The daily salt is both the privacy guarantee and the main cost. Today's visitor and yesterday's visitor have unrelated ids, so the tool can't tell that they are the same person. You lose the reports that depend on that link: new versus returning visitors, retention cohorts over weeks, and days to conversion, such as "first visit on Monday, signup on Thursday".

In misomoon, this also shapes funnels. A visitor's funnel steps must happen on one UTC day ([metrics](https://docs.misomoon.com/metrics#funnels-and-paths)), because a step on the next day belongs to a different id.

### Multi-day unique counts are sums of daily uniques

Because an id lasts one day, a tool with a daily salt can't deduplicate one person across a week or a month. misomoon counts the unique visitors of each UTC day and adds the days together ([a visitor id lasts one UTC day](https://docs.misomoon.com/metrics#a-visitor-id-lasts-one-utc-day)).

An example with made-up numbers: one reader visits your blog on Monday, Wednesday, and Friday. Three other people visit once each, on Tuesday. A cookie-based tool, with all four ids intact, reports 4 users for the week. misomoon reports 6 visitors: 1 on Monday, 3 on Tuesday, 1 on Wednesday, and 1 on Friday. The reader who came three times counts three times.

That number measures person-days, not people. It grows with loyalty as well as with reach, so a site with a loyal daily audience shows a monthly count well above its real headcount. Read it as a trend against earlier periods of the same length, not as the number of individuals who know your site.

### Some people merge, and some split, within a day

The hash sees only an address and a browser string, so it makes mistakes in both directions.

Two people merge into one id when they share an IP address and send the same user agent. Offices, schools, and carrier-grade NAT on mobile networks put many people behind one address. User agents are also less distinct than they used to be. Chrome's [user-agent reduction](https://www.chromium.org/updates/ua-reduction/) freezes the minor version and the desktop operating system version, and replaces the Android device model with "K". Two colleagues on the same Chrome version, on the same office network, share an id that day.

One person splits into several ids when the address or the browser changes. A phone that moves from home Wi-Fi to a mobile network gets a new address. On IPv6, many devices use temporary addresses that change over time, with a default preferred lifetime of one day ([RFC 8981](https://www.rfc-editor.org/rfc/rfc8981.html)). The same person on a laptop and a phone is always two people, as they would be with cookies.

The two errors push the count in opposite directions. Read unique visitors as a close estimate, which every analytics number is.

### The day ends at midnight UTC

The salt changes at 00:00 UTC, not at your local midnight. A person active on both sides of 00:00 UTC has two ids, so a local day or a `24h` period that spans that moment can count one person twice. misomoon keeps a visit that is open at midnight as one visit. In the first 30 minutes of the new UTC day, the Worker also computes the visitor's id under yesterday's salt and joins the event to the open visit. Each event still keeps its own day's id.

## How to adopt cookieless analytics

These steps apply to any tool that claims to be cookieless:

1. Find out what goes into the hash, how often the salt changes, and when the old salt is deleted. A hash without a salt, or with a salt that never changes, is a permanent id.
2. Confirm that the IP address is never stored, in raw form or as an unsalted hash.
3. Open your site with the browser's developer tools, and check cookies and local storage for your domain after a few pageviews.
4. List what the tracker collects beyond pageviews. Click maps, form tracking, and error reports all add to what you have to explain.
5. Write the analytics section of your privacy policy: what you collect, why, where, for how long, and how to object.
6. Give visitors a way to object, and decide whether to honour Global Privacy Control and Do Not Track.
7. Set a retention period.

## Common mistakes

- **Comparing monthly uniques with a cookie-based tool's monthly users.** One counts person-days and the other counts stored ids. They answer different questions, and the gap between them is not an error in either.
- **Adding your own id to get returning visitors back.** A first-party cookie or a local storage key that holds a visitor id brings back the device storage you removed, along with the consent question.
- **Putting personal data in event properties.** A cookieless id doesn't help if a custom event carries an email address. Keep names, emails, and account numbers out of event names and properties.
- **Turning on every feature without updating your policy.** Each extra feature collects more than pageviews do, and the policy should list what you collect.

## Set up cookieless analytics in misomoon

misomoon has no cookieless mode to turn on, because the tracker never sets cookies. The steps below set it up and tighten the privacy settings.

### Add your site and the script

1. [Sign up on misomoon Cloud](https://app.misomoon.com/?signup) and add your site's domain. Later sites go in **Settings** > **Sites**.
2. Copy the install snippet that the dashboard opens. It carries your site id.
3. Paste the snippet into the `<head>` of every page. It looks like this, with your own host and site id:

	```html
	<script defer src="https://analytics.example.com/m.js?s=your-site"></script>
	```

4. Open your site in a browser. Within a few seconds, you appear in **Live** in the dashboard.

[Track your site](https://docs.misomoon.com/tracking) covers custom events, revenue, and platform installs.

### Check that nothing is stored

In the developer tools on your site, check cookies and local storage for your domain. `m.js` writes neither. The only key misomoon uses on your site is `misomoon_ignore`, and the tracker never writes it by itself. You set it to leave your own browser out, or a visitor sets it with the opt-out button:

```js
localStorage.setItem('misomoon_ignore', 'true')
```

While the key is set, `m.js` sends nothing, and the console says `misomoon skipped: ignored`.

### Choose what to collect

Open **Settings** > **Install** > **What to track**. A new site has every feature on. If you want to collect less, pick a preset:

- **Light** collects outbound links, downloads, form submits, and tagged events.
- **Pageviews only** collects pageviews, engaged time, and scroll depth.

To turn a feature off on one page, such as checkout, add `data-disable` to the script tag on that page, for example `data-disable="clicks,errors"`.

### Set the privacy settings

Open **Settings** > **Install** > **Privacy**:

1. Set **Keep stats for** to the retention you need. A daily cleanup deletes older visits and events. On misomoon Cloud, a site keeps what its plan allows until you set less: 2 years on Starter, 3 years on Growth and Scale.
2. Add your office or your servers to **Never count these IP addresses**. misomoon drops their beacons before it stores or counts them.
3. Tick **Respect Global Privacy Control and Do Not Track** to drop every beacon from a browser that sends `Sec-GPC: 1` or `DNT: 1`.
4. Copy **Text for your privacy policy** into your policy. It lists the features you ticked, your retention, and where the data is kept, so copy it again after a change.
5. Put the **Opt-out button** snippet on your privacy page. The choice holds for one browser and one host, so put it on each host your visitors use, such as `example.com` and `www.example.com`.

### Read the People number

The **People** tile counts distinct visitor ids. For one UTC day, that is unique visitors. For a week or a month, it is the sum of each day's unique visitors, so compare it with earlier periods of the same length. **Pageviews** doesn't use the id at all, so it is a useful check next to **People**. The [sample dashboard](/demo) shows both tiles.

## Questions people ask

### Is cookieless analytics GDPR compliant?

No technique makes a tool compliant on its own. Removing cookies and stored ids takes away the most common reason for consent, but the EDPB reads the ePrivacy rules to cover scripts that make the browser send data. Whether you need consent depends on your country, your setup, and the features you turn on. This is not legal advice.

### Can a cookieless tool tell new visitors from returning ones?

Not with a daily salt. The same person gets an unrelated id each day, and the old salt is deleted, so nothing links the two. misomoon has no new versus returning report for that reason.

### Is a salted hash of an IP address anonymous?

misomoon keeps 16 characters of a SHA-256 hash, never stores the address, and deletes each salt after two days. After that, nobody can work back to the address or link a visitor across days. Whether a given law treats that id as anonymous or as personal data is a legal question, so ask someone who knows the law where you operate.

### Why is my monthly visitor count higher than my audience?

A monthly count is the sum of daily unique visitors, so a person who visits on five days counts five times. The more often your readers come back, the further the monthly count rises above the number of people in your audience.

### Do ad blockers stop cookieless analytics?

Some blockers drop requests to analytics hosts, with or without cookies. Serving the tracker from your own domain loses fewer events to them. [Serve the tracker from your own domain](https://docs.misomoon.com/proxy) shows how.

[Start a free trial of misomoon Cloud](https://app.misomoon.com/?signup) to count your visitors without cookies. Plans start at $5 a month for 100,000 events, and every plan has every feature, so [see the plans](/pricing) to pick the one that fits. If you would rather run it in your own Cloudflare account, misomoon is MIT-licensed and you can [host it yourself](https://docs.misomoon.com/self-hosting).
