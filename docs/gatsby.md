# Install misomoon on Gatsby

Add the misomoon script tag to a Gatsby site through `gatsby-ssr.js`, so every
page gets it in the document head.

## Add the script

Create or edit `gatsby-ssr.js` at the site root and inject the tag with
`setHeadComponents`:

```js
import React from 'react'

export const onRenderBody = ({ setHeadComponents }) => {
	setHeadComponents([
		React.createElement('script', {
			key: 'misomoon',
			defer: true,
			src: 'https://analytics.example.com/m.js?s=your-site',
		}),
	])
}
```

Set `your-site` and the host to the values in **Settings** > **Install**. Rebuild
or restart `gatsby develop` so SSR picks up the change.

Gatsby is a single-page app in the browser. Route changes count as pageviews by
themselves: the tracker listens to `pushState` and `popstate`
([Track your site](tracking.md#add-the-script)). For a router that uses
`#/routes`, add `data-hash` to the script element:

```js
React.createElement('script', {
	key: 'misomoon',
	defer: true,
	src: 'https://analytics.example.com/m.js?s=your-site',
	'data-hash': true,
})
```

## Check it works

Open your site in a browser. You appear in **Live** within a few seconds. If you
don't, the browser console says why, for example `misomoon skipped: bot`, and
[Troubleshooting](troubleshooting.md) lists the other causes.

## Next steps

- Send custom events such as a signup: [Track your site](tracking.md#send-custom-events).
- Turn events into conversions: [Goals, funnels, and paths](conversions.md).
- Count visitors with ad blockers: [Serve the tracker from your own domain](PROXY.md).
