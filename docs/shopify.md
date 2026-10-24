# Install misomoon on Shopify

Add the misomoon script tag to your Shopify site. It takes about two minutes.

Copy your script tag from **Settings** > **Install** in the dashboard. It looks like this:

```html
<script defer src="https://analytics.example.com/m.js?s=your-site"></script>
```

## Add the script

1. Open **Online Store** > **Themes**.
2. On your current theme, select **...** > **Edit code**.
3. Open `layout/theme.liquid` and paste the tag before `</head>`.
4. Select **Save**.

Shopify's checkout doesn't load your theme's code, so the tracker doesn't count checkout
pages. To count orders, post them to the custom webhook from your own code
([Send payments from your own server](revenue.md#send-payments-from-your-own-server)).

## Check it works

Open your site in a browser. You appear in **Live** within a few seconds. If you
don't, the browser console says why, for example `misomoon skipped: bot`, and
[Troubleshooting](troubleshooting.md) lists the other causes.

## Next steps

- Send custom events such as a signup: [Track your site](tracking.md#send-custom-events).
- Turn events into conversions: [Goals, funnels, and paths](conversions.md).
- Count visitors with ad blockers: [Serve the tracker from your own domain](PROXY.md).
