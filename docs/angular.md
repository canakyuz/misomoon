# Install misomoon on Angular

Add the misomoon script tag to an Angular app.

## Add the script

Paste the tag into the `<head>` of `src/index.html`:

```html
<script defer src="https://analytics.example.com/m.js?s=your-site"></script>
```

Route changes count as pageviews by themselves.

## Check it works

Open your site in a browser. You appear in **Live** within a few seconds. If you
don't, the browser console says why, for example `misomoon skipped: bot`, and
[Troubleshooting](troubleshooting.md) lists the other causes.

## Next steps

- Send custom events such as a signup: [Track your site](tracking.md#send-custom-events).
- Turn events into conversions: [Goals, funnels, and paths](conversions.md).
- Count visitors with ad blockers: [Serve the tracker from your own domain](PROXY.md).
