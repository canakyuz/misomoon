# misomoon proxy for Cloudflare

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/jackzard/misomoon-proxy/tree/main/proxy-cloudflare)

Serves misomoon's tracker and forwards its events from your own domain. Keeps the
visitor's IP and full location.

1. Click the button and deploy.
2. In the Worker's **Settings → Domains & Routes**, add a custom domain on your zone,
   e.g. `stats.example.com`. (Or a route like `example.com/relay/*`.)
3. Load the tracker from it:

```html
<script defer src="https://stats.example.com/m.js?s=your-site"></script>
```

Self-hosting misomoon? Set `MISOMOON_URL` to your instance. More in
[the custom domain guide](https://docs.misomoon.com/proxy).
