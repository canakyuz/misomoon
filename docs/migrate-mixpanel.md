# Switch from Mixpanel

misomoon replaces Mixpanel's website analytics: visitors, sources, pages, events, goals,
funnels, and revenue. It doesn't replace per-user product analytics. User profiles,
identity merging, cohorts, retention, experiments, feature flags, and session replay stay
in Mixpanel. misomoon reads Mixpanel's Raw Event Export as you download it and counts its
events into visits. Your events keep their names:
`mixpanel.track('Signup', { plan: 'pro' })` becomes
`misomoon('Signup', { props: { plan: 'pro' } })`.

## Add misomoon next to Mixpanel

1. Decide where misomoon goes. If your team uses Mixpanel for signed-in users, cohorts, or
   experiments, add misomoon to your marketing site and keep Mixpanel in the product.
   Otherwise, replace it on both.
2. Add your site in misomoon and paste its script tag into the `<head>` of every page, next
   to `mixpanel.init()` ([Track your site](tracking.md#add-the-script)).
3. Leave both on for a week or two, until misomoon's numbers look right to you. misomoon
   counts a visitor per browser per day, so it reads higher than a count of Mixpanel's
   `distinct_id`, which joins a signed-in person's devices
   ([A visitor id lasts one UTC day](metrics.md#a-visitor-id-lasts-one-utc-day)).

## Replace Mixpanel's calls

| Mixpanel | misomoon |
| --- | --- |
| `mixpanel.init('YOUR_PROJECT_TOKEN', { track_pageview: true })` from `mixpanel-browser` | The script tag, or `init({ site: 'your-site', host: 'https://analytics.example.com' })` from `@misomoon/sdk/web`. Both count pageviews and route changes by themselves. |
| `track_pageview: 'url-with-path'` for a single-page app | Nothing. Add `data-hash` for a router that uses `#/routes`. |
| `mixpanel.track('Played song', { genre: 'hip-hop' })` | `misomoon('Played song', { props: { genre: 'hip-hop' } })` |
| `mixpanel.register({ plan: 'pro' })` | `data-prop-plan="pro"` on the script tag, or `init({ props: { plan: 'pro' } })` |
| `mixpanel.track('Purchase', { amount: 49.9 })` | `misomoon('Purchase', { revenue: { amount: 49.9, currency: 'EUR' } })` |
| `mixpanel.identify('12345')`, `mixpanel.people.set()`, and `mixpanel.reset()` | Nothing. misomoon has no user ids, so delete these calls. |
| `autocapture: true` | The **Clicks**, **Form submits**, **Outbound links**, and **Downloads** features, and scroll depth, which is always on. They count per page and element, not per user. |
| `mixpanel.track()` with a `distinct_id` from your server | `track()` from `@misomoon/sdk/node`, with the visitor's request ([Send events from your server](sdk.md#send-events-from-your-server)) |
| Session Replay | Nothing. misomoon records no sessions. |

Features are checkboxes under **Settings** > **Install** > **What to track**, and a new
site has them all on ([Choose what to track](tracking.md#choose-what-to-track)). If you
sell through a payment provider, [connect it](revenue.md) and drop `revenue` from the
call, or each sale counts twice.

Funnels and goals don't move. Add each goal in **Settings** > **Goals**
([Create a goal](conversions.md#create-a-goal)) and each funnel in **Funnels**
([Build a funnel](conversions.md#build-a-funnel)). Both read the events misomoon already
collected, so you can add them at any time.

## Bring your history

misomoon's event endpoint takes only current events, so Mixpanel's old events can't be
sent again. Upload the Raw Event Export instead, and misomoon counts it as its tracker
would ([Raw event exports](import.md#raw-event-exports)). Mixpanel keeps 2 years of
events by default. misomoon skips the days it already counted ([Days that count once](import.md#days-that-count-once)).

1. In Mixpanel, make a service account with access to the project.
2. Download the events from `GET https://data.mixpanel.com/api/2.0/export`, with
   `project_id`, `from_date`, and `to_date`. Use `data-eu.mixpanel.com` for a project in
   the EU and `data-in.mixpanel.com` for one in India:

   ```sh
   curl --user "$SERVICE_ACCOUNT:$SECRET" \
     "https://data.mixpanel.com/api/2.0/export?project_id=123&from_date=2025-01-01&to_date=2025-03-31" \
     -o mixpanel-2025-q1.jsonl
   ```

3. In misomoon, open **Settings** > **Integrations**, click **Upload CSV or zip**, and
   pick the file. A `.gz` or ZIP file works too.

An upload holds at most 50 MB of events unzipped. For more, download fewer days per file
and upload each file on its own. The export allows 60 requests an hour.

misomoon reads each line as follows:

| Mixpanel property | Goes into |
| --- | --- |
| `time` | The event's time, in seconds, or in milliseconds when you add `time_in_ms=true`. misomoon files each visit on its day in the site's **Timezone** ([Sites](settings.md#sites)). |
| `distinct_id` without `$device:`, or else `$device_id` | The visitor. The export resolves `distinct_id` to the user, so a signed-in user counts once even when each event has a new `$device_id`. Events without either, such as ones your server sent, stay out. |
| `$mp_web_page_view` events | Page views, with the page from `current_url_path` or the path of `$current_url`, and the site's host from `current_domain` |
| Other events | Custom events, under their names. Mixpanel's own events, whose names start with `$` or `mp_`, such as `$identify` and `$mp_click`, stay out. |
| `$referrer`, and `utm_source` to `utm_term` or the tags in `$current_url` | The visit's source, channel, referrer, and UTM tags, from its first page view. `$direct` and a referrer on the site's host count as none. |
| `mp_country_code`, `$region`, `$city` | Countries, regions, and cities |
| `$browser`, `$browser_version`, `$os` | Browsers with their major version, and operating systems, with misomoon's names: `Mobile Safari` becomes `Safari`, and `Mac OS X` becomes `macOS` |
| `$screen_width` | Devices: `Mobile` under 576 px, `Tablet` under 992, and `Desktop` above. Without it, an iPad is a tablet, another `$device` a phone, and Windows, macOS, Linux, and ChromeOS desktops. |

Mixpanel cuts the export's days at midnight UTC for projects created after 1 January 2023,
and at midnight in the project's time zone for older ones. When that isn't midnight in
the misomoon site's time zone, each file's first and last day hold part of a day, and
misomoon keeps a day from the first upload that has it. Upload the whole range at once
when it fits. Otherwise upload the oldest file first if the site's time zone is behind
the export's, such as in the Americas, and the newest first if it is ahead, such as in
Europe or Asia. Each day between two files then misses only the hours between the two
time zones.

Imported days appear only in reports without filters
([What imported data fills](import.md#what-imported-data-fills)). If you uploaded the
wrong file, [delete the import](import.md#delete-an-import) and upload again.

## Remove Mixpanel

Once the import shows in misomoon, remove `mixpanel-browser` and its calls from the pages
misomoon now tracks. Mixpanel's SDK keeps a cookie for 365 days by default, so take it out
of your cookie banner on those pages. If you keep Mixpanel in your product, leave it there.

## What stays behind

- User profiles, identities, cohorts, and retention. misomoon counts visitors per day and
  has no user ids.
- Experiments, feature flags, and session replay.
- Revenue history. misomoon imports no revenue.
- Event properties. Imported events have no property breakdown.
- Funnels and reports. Build the funnels again in misomoon. They count misomoon's own
  events only ([What imports leave out](import.md#what-imports-leave-out)).
- Operating system versions and time on page. The export has neither.

## Sources

Checked on 2026-10-26.

The import was tested on the example lines in Mixpanel's API reference, on a page view
from a real export that the open-source OpenPanel keeps in its tests, and on ten lines of a
web app's real export published on GitHub, with its users' ids and its domain replaced.
It has not yet read a whole real export, because Mixpanel's export needs a project's
service account.

- Mixpanel: [Raw Event Export API](https://docs.mixpanel.com/reference/raw-event-export),
  [export methods](https://docs.mixpanel.com/docs/export-methods),
  [default properties](https://docs.mixpanel.com/docs/data-structure/property-reference/default-properties),
  [JavaScript SDK](https://docs.mixpanel.com/docs/tracking-methods/sdks/javascript),
  [identifying users](https://docs.mixpanel.com/docs/tracking-methods/id-management/identifying-users),
  [pricing and data retention](https://mixpanel.com/pricing)
- A real exported page view: [OpenPanel's Mixpanel importer test](https://github.com/Openpanel-dev/openpanel/blob/main/packages/core/src/modules/import/src/providers/mixpanel.test.ts)
- Ten real exported lines: [a web app's export in GWolf10/bi](https://github.com/GWolf10/bi/blob/main/bi_projects/third_party_project/workspace/temp/bi/third_party_project/json_files/mp_api_raw_20241007.json)
