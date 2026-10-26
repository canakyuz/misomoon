# Install guides

Every install adds the same script tag to the `<head>` of each page. Copy yours from
**Settings** > **Install** in the dashboard. It carries your site id:

```html
<script defer src="https://analytics.example.com/m.js?s=your-site"></script>
```

Pick your platform for the exact steps:

| Website builders | Frameworks | Apps and other tools |
| --- | --- | --- |
| [WordPress](wordpress.md) | [Next.js and React](nextjs.md) | [React Native and Expo](react-native.md) |
| [Shopify](shopify.md) | [Vue and Nuxt](vue.md) | [Lovable, Bolt, v0, and Replit](ai-app-builders.md) |
| [Webflow](webflow.md) | [SvelteKit](sveltekit.md) | [Google Tag Manager](google-tag-manager.md) |
| [Framer](framer.md) | [Astro](astro.md) | [Your own server](sdk.md#send-events-from-your-server) |
| [Wix](wix.md) | [Angular](angular.md) | |
| [Squarespace](squarespace.md) | [Laravel, Django, and Rails](server-frameworks.md) | |
| [Ghost](ghost.md) | [Hugo, Jekyll, and Eleventy](static-sites.md) | |
| [Carrd](carrd.md) | [Gatsby](gatsby.md) | |

## Any other site

Paste the tag into the `<head>` of every page, or of the layout that every page shares.

Single-page apps need nothing extra: the tracker counts each `pushState` route change as
a pageview. For a router that uses `#/routes`, add `data-hash` to the tag.

## Check it works

Open your site in a browser. You appear in **Live** within a few seconds. If you don't,
the browser console says why, for example `misomoon skipped: bot`, and
[Troubleshooting](troubleshooting.md) lists the other causes.

Ad blockers drop some analytics requests. To count those visitors too, serve the tracker
from your own domain ([Serve the tracker from your own domain](PROXY.md)).
