# Install misomoon on Webflow

Add the misomoon script tag to your Webflow site. It takes about two minutes.

Copy your script tag from **Settings** > **Install** in the dashboard. It looks like this:

```html
<script defer src="https://analytics.example.com/m.js?s=your-site"></script>
```

## Add the script

1. Open **Site settings** > **Custom code**.
2. Paste the tag into **Head code**.
3. Save, then publish the site. Custom code runs only on the published site.

## Check it works

Open your site in a browser. You appear in **Live** within a few seconds. If you
don't, the browser console says why, for example `misomoon skipped: bot`, and
[Troubleshooting](troubleshooting.md) lists the other causes.

## Next steps

- Send custom events such as a signup: [Track your site](tracking.md#send-custom-events).
- Turn events into conversions: [Goals, funnels, and paths](conversions.md).
- Count visitors with ad blockers: [Serve the tracker from your own domain](PROXY.md).
