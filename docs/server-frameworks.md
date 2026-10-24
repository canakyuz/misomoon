# Install misomoon on Laravel, Django, and Rails

Add misomoon to an app that renders its pages on the server, such as Laravel, Django, Rails, or Phoenix.

## Add the script

Paste the tag into the `<head>` of the layout that every page extends:

```html
<script defer src="https://analytics.example.com/m.js?s=your-site"></script>
```

| Framework | Usual layout file |
| --- | --- |
| Laravel | `resources/views/layouts/app.blade.php` |
| Django | `templates/base.html` |
| Rails | `app/views/layouts/application.html.erb` |
| Phoenix | `lib/your_app_web/components/layouts/root.html.heex` |

## Send events from your server

To count something that happens on the server, such as a signup or a payment, use the
Node SDK or post to `/api/event`
([Send events from your server](sdk.md#send-events-from-your-server)).

## Check it works

Open your site in a browser. You appear in **Live** within a few seconds. If you
don't, the browser console says why, for example `misomoon skipped: bot`, and
[Troubleshooting](troubleshooting.md) lists the other causes.

## Next steps

- Turn events into conversions: [Goals, funnels, and paths](conversions.md).
- Credit sales to the visit that brought the buyer: [Connect payments](revenue.md).
- Count visitors with ad blockers: [Serve the tracker from your own domain](PROXY.md).
