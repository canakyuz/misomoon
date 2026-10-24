# Install misomoon on Next.js and React

Add misomoon to a Next.js, React Router, or other React app with the `<Misomoon>` component.

## Install the SDK

```sh
npm install @misomoon/sdk
```

## Add the component

Put `<Misomoon>` once in your root layout:

```tsx
// app/layout.tsx
import { Misomoon } from '@misomoon/sdk/react'

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<body>
				{children}
				<Misomoon site="your-site" host="https://analytics.example.com" />
			</body>
		</html>
	)
}
```

Set `site` to your site id and `host` to your misomoon address. Both are in the script tag
under **Settings** > **Install**. Route changes count as pageviews by themselves.

## Send an event

```tsx
'use client'
import { useMisomoon } from '@misomoon/sdk/react'

export function UpgradeButton() {
	const { track } = useMisomoon()
	return <button onClick={() => track('Upgrade')}>Upgrade</button>
}
```

## Serve the tracker from your domain

In Next.js, `withMisomoon()` routes the tracker through your own domain, so ad blockers
don't drop it:

```js
// next.config.mjs
import { withMisomoon } from '@misomoon/sdk/next'

export default withMisomoon({}, { host: 'https://analytics.example.com' })
```

Then set `host="/relay"` on `<Misomoon>`.

## Check it works

Open your site in a browser. You appear in **Live** within a few seconds. If you
don't, the browser console says why, for example `misomoon skipped: bot`, and
[Troubleshooting](troubleshooting.md) lists the other causes.

## Next steps

- Typed events, development mode, and checkout refs: [the SDK guide](sdk.md#add-the-tracker-to-a-react-or-nextjs-app).
- Turn events into conversions: [Goals, funnels, and paths](conversions.md).
- Credit sales to the visit that brought the buyer: [Connect payments](revenue.md).
