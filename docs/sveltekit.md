# Install misomoon on SvelteKit

Add the misomoon script tag to a SvelteKit app.

## Add the script

Paste the tag into the `<head>` of `src/app.html`, before `%sveltekit.head%`:

```html
<script defer src="https://analytics.example.com/m.js?s=your-site"></script>
```

Route changes count as pageviews by themselves.

## Send an event

Install `@misomoon/sdk` and import `track` from `@misomoon/sdk/web`. It does nothing
during server rendering, so you can call it from any component:

```ts
import { track } from '@misomoon/sdk/web'

track('Signup')
```

## Check it works

Open your site in a browser. You appear in **Live** within a few seconds. If you
don't, the browser console says why, for example `misomoon skipped: bot`, and
[Troubleshooting](troubleshooting.md) lists the other causes.

## Next steps

- Turn events into conversions: [Goals, funnels, and paths](conversions.md).
- Credit sales to the visit that brought the buyer: [Connect payments](revenue.md).
- Count visitors with ad blockers: [Serve the tracker from your own domain](PROXY.md).
