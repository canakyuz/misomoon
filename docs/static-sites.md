# Install misomoon on Hugo, Jekyll, and Eleventy

Add the misomoon script tag to a site built by a static site generator.

## Add the script

Paste the tag into the partial or layout that holds the `<head>`, such as
`layouts/partials/head.html` in Hugo or `_includes/head.html` in Jekyll:

```html
<script defer src="https://analytics.example.com/m.js?s=your-site"></script>
```

Then build and deploy the site.

## Check it works

Open your site in a browser. You appear in **Live** within a few seconds. If you
don't, the browser console says why, for example `misomoon skipped: bot`, and
[Troubleshooting](troubleshooting.md) lists the other causes.

## Next steps

- Send custom events such as a signup: [Track your site](tracking.md#send-custom-events).
- Turn events into conversions: [Goals, funnels, and paths](conversions.md).
- Count visitors with ad blockers: [Serve the tracker from your own domain](PROXY.md).
