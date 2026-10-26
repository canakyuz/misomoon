// Optional settings that `wrangler types` can't see because they have no default.
interface Env {
	/** Managed proxy (Cloudflare for SaaS): API token with SSL and Certificates edit on the zone. Secret. */
	CF_API_TOKEN?: string
	/** Managed proxy: the zone that owns PROXY_CNAME_TARGET and has Cloudflare for SaaS enabled. */
	CF_ZONE_ID?: string
	/** Managed proxy: the fallback origin customers CNAME to, e.g. proxy.misomoon.com. */
	PROXY_CNAME_TARGET?: string
	/** Google import, Search Console and sign-in with Google: an OAuth web client. */
	GOOGLE_CLIENT_ID?: string
	GOOGLE_CLIENT_SECRET?: string
	/** Email (invitations, password resets, reports, alerts) goes through Cloudflare Email Service when this send_email binding is set. */
	EMAIL?: SendEmail
	/** Amazon SES: all three send email through SES v2. The keys are secrets. */
	AWS_SES_REGION?: string
	AWS_SES_ACCESS_KEY_ID?: string
	AWS_SES_SECRET_ACCESS_KEY?: string
	/** "cloudflare" or "ses"; unset picks the EMAIL binding when it is bound, then SES. */
	EMAIL_PROVIDER?: string
	/** Sender of every email, e.g. "misomoon <reports@misomoon.com>", on a domain the provider has verified. */
	EMAIL_FROM?: string
	/** Most events a site may store per UTC day, when the site has no ingest_cap of its own. Unset: no cap. */
	INGEST_DAILY_CAP?: string
	/** "invite" turns off open sign-up: new people join through an invitation only. */
	SIGNUPS?: 'open' | 'invite' | 'closed'
	/** Public origin of the dashboard, for links in emails (reports, invitations, password resets). Defaults to https://misomoon.com. */
	PUBLIC_URL?: string
	/** "on" enforces the misomoon Cloud plans (packages/core/src/plans.ts): the free trial, sites per team, retention, and events a month. Anything else, unset included, enforces none. */
	PLANS?: string
	/** misomoon Cloud billing through Polar (docs/billing.md), with PLANS=on: an organization access token. Secret. */
	POLAR_ACCESS_TOKEN?: string
	/** Billing: the secret of the Polar webhook endpoint that points at /api/billing/polar/webhook. Secret. */
	POLAR_WEBHOOK_SECRET?: string
	/** Billing: "production" (unset) or "sandbox", the Polar the token and the products belong to. */
	POLAR_SERVER?: string
	/** Billing: the Polar product id of each plan. */
	POLAR_PRODUCT_STARTER?: string
	POLAR_PRODUCT_GROWTH?: string
	POLAR_PRODUCT_SCALE?: string
}
