<script lang="ts">
	import Crumbs from '#lib/components/Crumbs.svelte'
	import Plans from '#lib/components/Plans.svelte'
	import Seo from '#lib/components/Seo.svelte'
	import { docLink } from '#lib/links.ts'
	import { CTA, DIFFER, EVENT, FROM, LARGEST, PLANS, SUPPORT, TRIAL, TRIAL_DAYS, TRIAL_LIMITS, signupUrl, sites, words, years } from '#lib/pricing.ts'
	import { reveal } from '#lib/reveal.ts'
	import { breadcrumbs, faq, software, webpage } from '#lib/seo.ts'
	import { page } from '$app/state'

	let { data } = $props()
	const origin = $derived(page.url.origin)
	const signup = $derived(signupUrl(data.appUrl))
	const crumbs: [string, string][] = [['Pricing', '/pricing']]
	const starter = PLANS[0]
	const top = PLANS.at(-1)!
	const pick = PLANS.find((p) => p.popular)!

	// [what, misomoon Cloud, self-hosted]
	const compare: [string, string, string][] = [
		['Who runs it', 'We do: deploys, updates and monitoring', 'You do, in your own Cloudflare account'],
		['Time to the first visit', 'A minute: sign up and paste the script tag', 'Deploy the Worker, create the databases, then add the tag'],
		['Price', `${TRIAL_DAYS} days free, then from $${FROM} a month`, 'Free software. Cloudflare bills you for what it uses'],
		['Features', 'Every feature on every plan', 'Every feature'],
		['Where the data lives', 'The EU, the US or Asia-Pacific, per site', 'Your Cloudflare account'],
		['Agreement', 'Our data processing agreement', 'Cloudflare’s agreement with you'],
		['Code', 'MIT, the same code as on GitHub', 'MIT, yours to change'],
	]

	const faqs: [string, string][] = [
		[
			'Which plan should I pick?',
			`${pick.name}, unless you run one small site. For $${pick.price} a month, ${pick.name} counts ${words(pick.events)} events on ${sites(pick.sites)} and keeps stats for ${years(pick.retentionDays)}. ${starter.name}, at $${starter.price}, counts ${words(starter.events)} events on ${sites(starter.sites)} and keeps stats for ${years(starter.retentionDays)}. Move up to ${top.name} when your sites send more than ${words(pick.events)} events a month.`,
		],
		['Do I need a card to start?', `No. Every plan starts with ${TRIAL}. You get every feature, with ${TRIAL_LIMITS.name}’s limits, for ${TRIAL_DAYS} days, then pick a plan to keep counting.`],
		['What happens when the trial ends?', 'Pick a plan to keep counting. Your sites, settings and the numbers from the trial stay, and you can export them as CSV files at any time.'],
		['What counts as an event?', `${EVENT} A pageview is one page that a visitor opens, including a page change in a single-page app.`],
		['Does a cheaper plan leave features out?', `No. Every plan has the same features. ${DIFFER}`],
		[
			'Do I need a cookie banner?',
			'misomoon sets no cookies, stores nothing on the visitor’s device and never stores IP addresses, which are the usual reasons for one. Whether you need one depends on your country and on the rest of your site. This is not legal advice.',
		],
		[
			'Where is my data stored?',
			'You pick the region when you add a site: the European Union, the United States or Asia-Pacific. Account data and settings are stored in the European Union. Our data processing agreement covers all of it.',
		],
		['Can I take my data with me?', 'Yes. Export any period as a ZIP of CSV files from the dashboard, on any plan.'],
		[
			'Can I run it myself instead?',
			'Yes. misomoon is open source under the MIT license. Deploy it to your own Cloudflare account for free, and pay Cloudflare for what it uses. The Workers Free plan handles about 3,000 events a day, and Workers Paid starts at $5 a month.',
		],
		[`I need more than ${words(LARGEST)} events a month.`, `Email ${SUPPORT} with your traffic, and we will set up a plan that fits.`],
	]
</script>

<Seo
	title={`Pricing: misomoon Cloud from $${FROM} a month, every feature in`}
	description={`Try misomoon Cloud free for ${TRIAL_DAYS} days, no card needed. Plans from $${FROM} a month, with heatmaps, revenue, funnels and Web Vitals on every plan.`}
	path="/pricing"
	schema={[
		webpage(origin, '/pricing', 'misomoon pricing', `misomoon Cloud plans, from $${FROM} a month up to ${words(LARGEST)} events.`, 'WebPage', { about: { '@id': `${origin}/#software` } }),
		software(origin),
		breadcrumbs(origin, crumbs),
		faq(faqs),
	]}
/>

<section class="wrap page-head">
	<Crumbs items={crumbs} />
	<span class="eyebrow"><b>$0</b> to start</span>
	<h1 class="display">Pay for events.<br /><em>Not features.</em></h1>
	<p class="lede">
		Every plan has every feature, from revenue by source to click maps and Web Vitals. {starter.name} fits one small site. For anything more, start with {pick.name}:
		{words(pick.events)} events a month on {sites(pick.sites)}. Try it free for {TRIAL_DAYS} days with no card.
	</p>
</section>

<section class="wrap">
	<Plans appUrl={data.appUrl} docsUrl={data.docsUrl} />
</section>

<section class="wrap block">
	<header class="sub" {@attach reveal()}>
		<span class="eyebrow"><b>OR</b> Run it yourself</span>
		<h2 class="display">Cloud, or <em>open source.</em></h2>
		<p>Both run the same MIT-licensed code. Cloud is the quick way in. Self-hosting gives you the servers to look after, and every line to change.</p>
	</header>
	<div class="table" {@attach reveal(80)}>
		<table>
			<thead>
				<tr><th></th><th>misomoon Cloud</th><th>Self-hosted</th></tr>
			</thead>
			<tbody>
				{#each compare as [what, cloud, own] (what)}
					<tr><th scope="row">{what}</th><td>{cloud}</td><td>{own}</td></tr>
				{/each}
			</tbody>
		</table>
	</div>
	<div class="pair">
		<a class="cta primary" href={signup}>{CTA} <span class="arrow">→</span></a>
		<a class="cta ghost" href={docLink(data.docsUrl, 'self-hosting')}>Read the self-hosting guide</a>
	</div>
</section>

<section class="wrap block faq-grid">
	<header class="sub" {@attach reveal()}>
		<span class="eyebrow"><b>?</b> Questions</span>
		<h2 class="display">Before<br /><em>you pick.</em></h2>
		<p>Something else? Email <a href="mailto:support@misomoon.com">support@misomoon.com</a>, or read the <a href={docLink(data.docsUrl, 'faq')}>full FAQ</a>.</p>
	</header>
	<div class="faq" {@attach reveal(100)}>
		{#each faqs as [q, a] (q)}
			<details>
				<summary>{q}</summary>
				<p>{a}</p>
			</details>
		{/each}
	</div>
</section>

<section class="wrap closing">
	<h2 class="display">Start counting<br /><em>in a minute.</em></h2>
	<div class="pair">
		<a class="cta primary" href={signup}>{CTA} <span class="arrow">→</span></a>
		<a class="cta ghost" href="/demo">Open the live demo</a>
	</div>
</section>

<style>
	.block {
		padding-top: 120px;
	}
	.sub {
		max-width: 720px;
	}
	.sub h2 {
		margin: 18px 0 0;
		font-size: clamp(44px, 6vw, 84px);
		line-height: 0.9;
	}
	.sub p {
		margin: 20px 0 0;
		font-size: 17px;
		line-height: 1.6;
		color: var(--text-2);
	}
	.sub a {
		color: var(--miso);
	}
	.table {
		margin-top: 48px;
		overflow-x: auto;
		border: 2px solid var(--ink);
		border-radius: 14px;
		box-shadow: 6px 6px 0 var(--ink);
		background: var(--surface);
	}
	table {
		width: 100%;
		min-width: 620px;
		border-collapse: collapse;
		font-size: 15px;
	}
	th,
	td {
		padding: 14px 18px;
		text-align: left;
		vertical-align: top;
		border-bottom: 1.5px dashed var(--line-strong);
	}
	thead th {
		font-family: var(--font-mono);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		border-bottom: 2px solid var(--ink);
	}
	thead th:nth-child(2) {
		color: var(--miso);
	}
	tbody th {
		width: 24%;
		font-weight: 600;
	}
	tbody tr:last-child > * {
		border-bottom: 0;
	}
	.pair {
		display: flex;
		flex-wrap: wrap;
		gap: 14px;
		margin-top: 32px;
	}
	.faq-grid {
		display: grid;
		grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
		gap: 40px 64px;
		align-items: start;
	}
	.faq details {
		border-bottom: 2px solid var(--ink);
		padding: 18px 0;
	}
	.faq summary {
		cursor: pointer;
		font-size: 18px;
		font-weight: 600;
	}
	.faq p {
		margin: 12px 0 0;
		font-size: 16px;
		line-height: 1.6;
		color: var(--text-2);
	}
	.closing {
		padding: 140px 0 150px;
		text-align: center;
	}
	.closing h2 {
		font-size: clamp(48px, 7vw, 100px);
		line-height: 0.9;
		margin: 0;
	}
	.closing .pair {
		justify-content: center;
	}
	@media (max-width: 960px) {
		.faq-grid {
			grid-template-columns: 1fr;
		}
		.block {
			padding-top: 90px;
		}
		.closing {
			padding: 100px 0 110px;
		}
	}
</style>
