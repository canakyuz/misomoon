# misomoon proxy for Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/jackzard/misomoon/tree/main/templates/proxy-vercel&project-name=misomoon-proxy&repository-name=misomoon-proxy)

Serves misomoon's tracker and forwards its events from your own domain. Vercel passes
the visitor's IP and its location headers through.

1. Click the button and deploy.
2. In the project's **Settings → Domains**, add a subdomain such as `stats.example.com`.
3. Load the tracker from it:

```html
<script defer src="https://stats.example.com/m.js?s=your-site"></script>
```

Self-hosting misomoon? Change both destinations in `vercel.json`. More in
[docs/PROXY.md](../../docs/PROXY.md).
