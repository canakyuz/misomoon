# Install misomoon on Vue and Nuxt

Add misomoon to a Vue, Vite, or Nuxt app.

## Vue and Vite

Paste the script tag into the `<head>` of `index.html`:

```html
<script defer src="https://analytics.example.com/m.js?s=your-site"></script>
```

To send events from components, call `init()` from `@misomoon/sdk/web` instead of adding
the tag:

```ts
// main.ts
import { init } from '@misomoon/sdk/web'

init({ site: 'your-site', host: 'https://analytics.example.com' })
```

Then call `track('Signup')` from any component. Use the tag or `init()`, not both, or the
tracker loads twice.

## Nuxt

Add the tag to `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
	app: {
		head: {
			script: [{ src: 'https://analytics.example.com/m.js?s=your-site', defer: true }],
		},
	},
})
```

Route changes count as pageviews by themselves. For a router that uses `#/routes`, add
`data-hash` to the tag.

## Check it works

Open your site in a browser. You appear in **Live** within a few seconds. If you
don't, the browser console says why, for example `misomoon skipped: bot`, and
[Troubleshooting](troubleshooting.md) lists the other causes.

## Next steps

- Send custom events such as a signup: [Track your site](tracking.md#send-custom-events).
- Turn events into conversions: [Goals, funnels, and paths](conversions.md).
- Count visitors with ad blockers: [Serve the tracker from your own domain](PROXY.md).
