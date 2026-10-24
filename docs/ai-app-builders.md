# Install misomoon on Lovable, Bolt, v0, and Replit

In tools that write the app for you, ask the agent to add the script tag.

Copy your script tag from **Settings** > **Install** in the dashboard. It looks like this:

```html
<script defer src="https://analytics.example.com/m.js?s=your-site"></script>
```

## Ask the agent

Paste this prompt with your own tag:

> Add this script tag to the `<head>` of every page, exactly as written:
> `<script defer src="https://analytics.example.com/m.js?s=your-site"></script>`

Then publish the app.

## Count sales

If the app takes payments, ask the agent to pass `misomoon.ref()` to the checkout
([Pass the ref to the checkout](revenue.md#pass-the-ref-to-the-checkout)).

## Check it works

Open your site in a browser. You appear in **Live** within a few seconds. If you
don't, the browser console says why, for example `misomoon skipped: bot`, and
[Troubleshooting](troubleshooting.md) lists the other causes.

## Next steps

- Send custom events such as a signup: [Track your site](tracking.md#send-custom-events).
- Turn events into conversions: [Goals, funnels, and paths](conversions.md).
- Credit sales to the visit that brought the buyer: [Connect payments](revenue.md).
