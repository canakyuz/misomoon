# Switch from Microsoft Clarity

Moving from Clarity means moving features, not data. misomoon's **Behavior** view has
click maps with rage and dead clicks, scroll depth, form drop-off, and JavaScript errors.
Goals take the place of smart events, and **Funnels** take the place of Clarity's funnels.
misomoon has no session recordings. If you need to watch recordings, keep Clarity for
them. Clarity's history stays behind, because its export reaches back only 3 days.

## Add misomoon next to Microsoft Clarity

1. Add your site in misomoon and paste its script tag into the `<head>` of every page, next
   to Clarity's tracking code ([Track your site](tracking.md#add-the-script)).
2. Keep the **Everything** preset under **Settings** > **Install** > **What to track**,
   which a new site has. It turns on **Clicks**, **Form fields**, **JavaScript errors**, and
   the other Behavior reports ([Choose what to track](tracking.md#choose-what-to-track)).
3. Leave both on for two to four weeks, and compare the click and scroll reports of your
   key pages.

## Replace Clarity's reports

| Clarity | misomoon |
| --- | --- |
| Click maps, rage clicks, and dead clicks | **Behavior** > **Clicks**: clicks per element, with rage and dead clicks. **Show on your site** draws them over the page. |
| Scroll maps | **Behavior** > **Scroll**: the share of visits that scrolled past each tenth of the page. It is always on. |
| Area, attention, and conversion maps | Nothing |
| Smart events on page visits | A page goal, such as `/thanks` ([Count a page as a goal](conversions.md#count-a-page-as-a-goal)) |
| Smart events on button clicks | `data-misomoon-event="Sign up"` on the button, and an event goal on `Sign up` ([Create a goal](conversions.md#create-a-goal)) |
| The **Submit Form** and **Download** auto events | misomoon's `Form sent` and `Download` events, from the **Form submits** and **Downloads** features |
| Funnels | **Funnels**, in sequential, strict, or flexible mode ([Build a funnel](conversions.md#build-a-funnel)) |
| Script errors and error clicks | **Behavior** > **Errors**: JavaScript errors grouped by message and file |
| Session recordings and their playback | Nothing. **Live** shows who is on the site now, not what they did. |

misomoon's reports count per page and element and never follow one visit through the
site ([See what people do on a page](tracking.md#see-what-people-do-on-a-page)). To keep an
element's clicks together through a redesign, give it a stable name with
`data-misomoon-id="buy"`.

## Replace Clarity's calls

| Clarity | misomoon |
| --- | --- |
| Clarity's tracking code from its project settings | `<script defer src="https://analytics.example.com/m.js?s=your-site"></script>` |
| `Clarity.init(projectId)` from `@microsoft/clarity` | `init({ site: 'your-site', host: 'https://analytics.example.com' })` from `@misomoon/sdk/web` |
| `window.clarity("event", "newsletterSignup")` | `misomoon('newsletterSignup')` |
| `window.clarity("set", "experiment", "experiment1")` | `data-prop-experiment="experiment1"` on the script tag, which adds the prop to every event on the page, or `props: { experiment: 'experiment1' }` on each event |
| `window.clarity("identify", "custom-id")` | Nothing. misomoon has no user ids, so delete the call. |
| `window.clarity("upgrade", "button click")` | Nothing. misomoon has no recordings to keep. |
| `window.clarity("consent")` | Nothing for misomoon. It sets no cookies. |
| `data-clarity-mask="true"` | `data-misomoon-mask`, which sends no text for clicks inside the element |
| `data-clarity-unmask="true"` | Nothing. misomoon never sends what anyone types. |

The events you send with `misomoon()` show up in the **What they did** panel. Mark the ones
that matter as goals in **Settings** > **Goals**. A goal counts the events misomoon already collected, so you
can add it at any time.

## Bring your history

There is nothing worth importing. Clarity's Data Export API returns only the last 1, 2, or
3 days, at 10 requests per project a day, and misomoon has collected those days by the time
you remove Clarity. Heatmaps and recordings don't fit misomoon's
[CSV format](import.md#csv-format):

- Before you remove Clarity, download the heatmaps you want to keep as PNG or CSV, from the
  top right of each heatmap. Clarity keeps heatmaps for 9 months. Keep the files as an
  archive, because misomoon can't import them.
- Recordings can't be downloaded. Clarity plays them for 30 days, and favorite and labeled
  ones for 9 months.

## Remove Clarity

1. Remove Clarity's tracking code, or the `@microsoft/clarity` package and its `init` call.
2. Remove the `window.clarity` calls and the `data-clarity-mask` attributes.
3. If Clarity was the reason for your cookie banner, take its cookies out of the banner:
   the first-party `_clck` and `_clsk`, and the third-party `CLID`, `ANONCHK`, `MR`,
   `MUID`, and `SM`. Remove the `window.clarity("consent")` code.

Clarity has needed a consent signal for visits from the EEA, the UK, and Switzerland since
31 October 2025. misomoon sets no cookies, but whether your site still needs a banner
depends on your country and the rest of the site
([Do you need a consent banner?](compliance.md#do-you-need-a-consent-banner)).

## What stays behind

- Session recordings and live playback. misomoon has none.
- Area, attention, and conversion maps.
- Heatmap and dashboard history. misomoon's reports start on the day you add its script.
- Session tags and custom identifiers. misomoon has props per event and no user ids.

## Sources

Checked on 2026-10-25.

- Microsoft Clarity: [client API](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-api),
  [smart events](https://learn.microsoft.com/en-us/clarity/setup-and-installation/smart-events),
  [funnels](https://learn.microsoft.com/en-us/clarity/setup-and-installation/funnels),
  [heatmaps](https://learn.microsoft.com/en-us/clarity/heatmaps/heatmaps-overview),
  [download heatmaps](https://learn.microsoft.com/en-us/clarity/heatmaps/download-heatmaps),
  [Data Export API](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-data-export-api),
  [data retention](https://learn.microsoft.com/en-us/clarity/setup-and-installation/data-retention),
  [FAQ](https://learn.microsoft.com/en-us/clarity/faq),
  [cookies](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-cookies),
  [consent mode](https://learn.microsoft.com/en-us/clarity/setup-and-installation/consent-mode),
  [npm package](https://registry.npmjs.org/@microsoft/clarity)
