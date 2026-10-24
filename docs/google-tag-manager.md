# Install misomoon with Google Tag Manager

Add the misomoon script tag to every page through a Google Tag Manager container.

Copy your script tag from **Settings** > **Install** in the dashboard. It looks like this:

```html
<script defer src="https://analytics.example.com/m.js?s=your-site"></script>
```

## Add the tag

1. Create a tag of type **Custom HTML** and paste the script tag.
2. Set its trigger to **All Pages**.
3. Submit and publish the container.

A blocker that stops Google Tag Manager also stops every tag inside it. To count those
visitors, add the script tag to your pages directly, and serve it from your own domain.

## Check it works

Open your site in a browser. You appear in **Live** within a few seconds. If you
don't, the browser console says why, for example `misomoon skipped: bot`, and
[Troubleshooting](troubleshooting.md) lists the other causes.

## Next steps

- Send custom events such as a signup: [Track your site](tracking.md#send-custom-events).
- Turn events into conversions: [Goals, funnels, and paths](conversions.md).
- Count visitors with ad blockers: [Serve the tracker from your own domain](PROXY.md).
