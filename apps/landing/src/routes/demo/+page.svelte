<script lang="ts">
	import { docLink } from '#lib/links.ts'
	import { signupUrl } from '#lib/pricing.ts'
	import Seo from '#lib/components/Seo.svelte'
	import { breadcrumbs } from '#lib/seo.ts'
	import { page } from '$app/state'

	let { data } = $props()
	// the real dashboard, opened on Acme: a sample store with made-up visitors
	const demo = $derived(`${data.appUrl}/demo`)
</script>

<Seo
	title="Demo"
	description="The real misomoon dashboard, filled with a sample store's traffic. Click through every report before you add the script to your own site."
	path="/demo"
	schema={[breadcrumbs(page.url.origin, [['Demo', '/demo']])]}
/>

<section class="page-head">
	<div class="wrap">
		<p class="eyebrow"><b>Demo</b> Sample data</p>
		<h1 class="display">The dashboard,<br /><em>filled in.</em></h1>
		<p class="lede">This is the real misomoon dashboard, opened on Acme, a made-up outdoor store with a few hundred visitors a day. It runs on a recording of the store's traffic, so every view opens at once. Change the period, add filters, open Live, Funnels or Paths. Nothing here is a screenshot.</p>
	</div>
</section>

<section class="stage">
	<div class="wrap frame">
		<div class="strip">
			<span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>
			<span class="url">{demo.replace(/^https?:\/\//, '')}</span>
			<a class="full" href={demo} target="_blank" rel="noopener">Open full screen ↗</a>
		</div>
		<iframe src={demo} title="misomoon dashboard showing the Acme sample store"></iframe>
	</div>
</section>

<section class="next">
	<div class="wrap ctas">
		<a class="cta primary" href={signupUrl(data.appUrl)}>Start your free trial <span class="arrow">→</span></a>
		<a class="cta ghost" href={docLink(data.docsUrl, 'self-hosting')}>Or run it in your Cloudflare account</a>
	</div>
</section>

<style>
	.stage {
		padding-top: 20px;
	}
	/* a printed card around the live app: ink edge, hard shadow */
	/* in the page column, so its edges line up with the intro and the buttons */
	.frame {
		border: 2px solid var(--edge);
		border-radius: var(--radius-lg);
		background: var(--surface);
		box-shadow: 6px 6px 0 var(--edge);
		overflow: hidden;
	}
	.strip {
		display: flex;
		align-items: center;
		gap: 14px;
		height: 40px;
		padding: 0 14px;
		border-bottom: 2px solid var(--edge);
		font-family: var(--font-mono);
		font-stretch: 87.5%;
		font-size: 12px;
	}
	.dots {
		display: flex;
		gap: 6px;
	}
	.dots i {
		width: 10px;
		height: 10px;
		border: 1.5px solid var(--edge);
		border-radius: 50%;
	}
	.dots i:first-child {
		background: var(--vermilion);
	}
	.url {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text-3);
	}
	.full {
		flex: none;
		color: var(--text);
		font-weight: 700;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	iframe {
		display: block;
		width: 100%;
		height: min(88vh, 1000px);
		min-height: 620px;
		border: 0;
		background: var(--bg);
	}
	.next {
		padding: 80px 0 120px;
	}
	.ctas {
		display: flex;
		flex-wrap: wrap;
		gap: 16px;
	}
	@media (max-width: 900px) {
		.stage {
			padding-top: 12px;
		}
		.next {
			padding-top: 50px;
		}
	}
</style>
