<script lang="ts">
	import HeroProduct from '#lib/components/HeroProduct.svelte'
	import Moon from '#lib/components/Moon.svelte'
	import Reflection from '#lib/components/Reflection.svelte'
	import { edition, untilPress } from '#lib/edition.ts'
	import { docLink } from '#lib/links.ts'
	import { FEATURES } from '#lib/features.ts'
	import { CTA, DIFFER, TRIAL, TRIAL_DAYS, keepSentence, priceSentence, signupUrl } from '#lib/pricing.ts'
	import Plans from '#lib/components/Plans.svelte'
	import Seo from '#lib/components/Seo.svelte'
	import { faq, organization, software, website } from '#lib/seo.ts'
	import { page } from '$app/state'
	import { reveal } from '#lib/reveal.ts'

	let { data } = $props()
	const origin = $derived(page.url.origin)
	const app = $derived(data.appUrl)
	const signup = $derived(signupUrl(data.appUrl))
	// null on a cold edge cache: the page prints its evergreen edition
	const live = $derived(data.live)
	const DAY = 86_400_000
	// time until the next edition goes to press, at midnight UTC; unknown (placeholders) until the browser runs
	let now = $state<number | null>(null)
	$effect(() => {
		now = Date.now()
		const i = setInterval(() => (now = Date.now()), 1000)
		return () => clearInterval(i)
	})
	const press = $derived(untilPress(now))
	// After midnight UTC the open page turns to the new edition instead of sticking at 00:00:00.
	const ed = $derived(now != null && now >= data.edition.day + DAY ? edition(now) : data.edition)
	const fmt = new Intl.NumberFormat('en')

	const dateline = $derived(
		new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(ed.day),
	)
	const lit = $derived(Math.round(ed.moon.lit * 100))

	// The hero moon starts at tonight's real phase and waxes to full as you scroll.
	let t = $state(0)
	const phase = $derived(ed.moon.phase * (1 - t))
	function onscroll() {
		t = Math.min(1, window.scrollY / (window.innerHeight * 1.1))
	}

	// One line of news, set every night from yesterday's numbers on this site.
	const news = $derived.by(() => {
		if (!live || !live.yesterday)
			return 'Every morning this line is rewritten from yesterday’s numbers on this very site: how many people read it, where they came from, and how many names we kept.'
		const c = live.yesterday_change
		const move = c == null || c === 0 ? '' : `, ${c > 0 ? 'up' : 'down'} ${Math.abs(c)}% on the day before`
		const src = live.top_source ? ` ${live.top_source} sent the most.` : ''
		return `${fmt.format(live.yesterday)} people read this site yesterday${move}.${src} We kept none of their names.`
	})


	const receipt: [string, string][] = [
		['path', '/pricing'],
		['referrer', 'news.ycombinator.com'],
		['channel', 'Organic Social'],
		['utm_campaign', 'launch-week'],
		['country', 'ID · Jakarta'],
		['network', 'AS17451 Biznet'],
		['device', 'Desktop · 1440px'],
		['browser', 'Chrome 141 · macOS 26'],
		['language', 'id-ID · Asia/Jakarta'],
		['engaged time', '48s'],
		['scroll depth', '72%'],
		['LCP / INP / CLS', '1.9s · 96ms · 0.02'],
		['outbound click', 'github.com/…'],
		['goal', 'Signup · $19.00'],
	]

	// What each job adds to m.js, gzipped, from the table in docs/tracking.md (measured 2026-10-24)
	const kit: { name: string; ask: string; kb: string; href: string }[] = [
		{ name: 'Traffic', ask: 'Where did they come from?', kb: 'under 1 KB', href: '#traffic' },
		{ name: 'Revenue', ask: 'Which source pays?', kb: '+0.5 KB', href: '#revenue' },
		{ name: 'Heatmaps', ask: 'What did they click? How far did they read?', kb: '+1.0 KB', href: '#behavior' },
		{ name: 'Form drop-off', ask: 'Which field lost them?', kb: '+0.7 KB', href: '#behavior' },
		{ name: 'Errors', ask: 'What broke for them?', kb: '+0.4 KB', href: '#behavior' },
		{ name: 'Web Vitals', ask: 'How fast did it feel?', kb: '+0.6 KB', href: '#traffic' },
	]

	// sample p75 values; zones are the Core Web Vitals limits on a scale that ends past "poor"
	// (web.dev: LCP 2.5 s / 4 s, INP 200 ms / 500 ms, CLS 0.1 / 0.25)
	const vitals = [
		{ key: 'LCP', name: 'Main content shows', value: '2.1 s', limit: '2.5 s', zones: [2.5, 1.5, 1], at: (2.1 / 5) * 100 },
		{ key: 'INP', name: 'Page answers a tap', value: '142 ms', limit: '200 ms', zones: [200, 300, 200], at: (142 / 700) * 100 },
		{ key: 'CLS', name: 'Layout stays still', value: '0.04', limit: '0.1', zones: [0.1, 0.15, 0.1], at: (0.04 / 0.35) * 100 },
	]

	// sample numbers: the most visitors is not the most money
	const ledger: [string, number, number][] = [
		['Hacker News', 846, 1140],
		['Google', 2310, 960],
		['ChatGPT', 212, 684],
		['Newsletter', 390, 512],
		['X', 1020, 95],
	]
	const usd = new Intl.NumberFormat('en', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

	// share of the visits that left the signup form at each field
	const fields: [string, number][] = [
		['Email', 9],
		['Name', 6],
		['Company', 14],
		['Phone number', 41],
	]
	const errors: [string, string, number][] = [
		['TypeError: cart is undefined', 'checkout.js:214', 186],
		['ReferenceError: Stripe is not defined', 'pay.js:12', 41],
		['Failed to fetch', 'api.js:88', 17],
	]

	const faqs: [string, string][] = [
		[
			'What does it cost?',
			`misomoon Cloud starts with ${TRIAL}. ${priceSentence()} ${keepSentence()} Every plan has every feature. The open-source version is free, and you pay Cloudflare for what it uses.`,
		],
		[
			'Is misomoon Cloud the same as the open-source version?',
			'Yes. Cloud runs the same MIT-licensed code that is on GitHub. The difference is who runs it: on Cloud we deploy, update and watch it, and self-hosted you do that in your own Cloudflare account.',
		],
		[
			'Do I still need a cookie banner?',
			'misomoon sets no cookies, stores nothing on the visitor’s device and never stores IP addresses, which are the usual reasons for one. Whether you need one depends on your country, on the features you turn on, and on what else your site does. This is not legal advice.',
		],
		[
			'Does misomoon have heatmaps and scroll maps?',
			'Yes. The Behavior view shows clicks on each element, with rage clicks and dead clicks marked, and how far down each page people get. Show on your site draws both over your real page. Neither needs a cookie, and both are on every plan.',
		],
		[
			'Does misomoon record sessions?',
			'No. Session replay records what each visitor sees and often what they type, which most guidance treats as needing consent. misomoon keeps counts instead: clicks per element, scroll depth, the form field where a visit stopped, and the errors it hit.',
		],
		['Can I keep my old numbers?', 'Yes. Import a Google property’s history or a CSV file. The imported numbers show next to the ones misomoon collects.'],
		[
			'Can I run it next to my current analytics?',
			'Yes. It is one script tag, so run both for a few weeks and compare. Expect lower numbers: misomoon drops bots and counts only real requests, with no modeled data.',
		],
		[
			'Will ad blockers hide my visitors?',
			'Some blockers drop requests to known analytics hosts. Serve misomoon from your own domain with the first-party proxy, and its requests are first-party.',
		],
		[
			'What if a bot floods my site?',
			'Known bots are dropped before they count. For the rest, set a daily cap per site. Once a day is full, the edge drops the extra events within a minute.',
		],
		['What happens to my data if I stop?', 'Export any period as a ZIP of CSV files from the dashboard, on any plan. Self-hosted, the data also stays in your own D1 databases.'],
	]

	let copied = $state(false)
	const snippet = $derived(`<script defer src="${app}/m.js?s=your-site"><\/script>`)
	async function copy() {
		try {
			await navigator.clipboard.writeText(snippet)
		} catch {
			return
		}
		copied = true
		setTimeout(() => (copied = false), 1600)
	}
</script>

<svelte:window {onscroll} />

<!-- ───────────────────────────── edition strip -->
<div class="strip mono">
	<div class="wrap strip-row">
		<span><b>No. {ed.no}</b> · {dateline}</span>
		<span class="tonight"><i class="mini-moon" style:--lit="{lit}%"></i>Tonight: {ed.moon.name}, {lit}% lit</span>
		<span>{#if live?.now}<i class="live"></i>{fmt.format(live.now)} reading now · {/if}next edition in <b class="num">{press}</b></span>
	</div>
</div>

<Seo
	title="misomoon: cookieless web analytics with heatmaps and revenue"
	description={`Cookieless web analytics with revenue by source, heatmaps, scroll maps, form drop-off, errors, Web Vitals. Try misomoon Cloud free for ${TRIAL_DAYS} days, no card needed.`}
	path="/"
	schema={[organization(origin), website(origin), software(origin), faq(faqs)]}
/>

<!-- ───────────────────────────── hero -->
<section class="hero">
	<div class="wrap hero-grid">
		<div class="moon-wrap">
			<Reflection size={560} {phase} days={live?.days ?? []} />
			<div class="moon-label mono" aria-hidden="true"><b>Fig. 0</b> Tonight’s moon, {ed.moon.name}, {lit}% lit.<br />Its reflection is this site’s last 30 days of readers.</div>
		</div>

		<p class="kicker eyebrow"><b>No.{ed.no}</b> Web analytics, printed fresh daily</p>
		<h1 class="display">
			<span class="l1">Know your</span>
			<span class="l2">visitors.</span>
			<span class="l3">Not their <s class="struck">cookies<svg viewBox="0 0 300 40" preserveAspectRatio="none" aria-hidden="true"><path d="M4 26 C 60 10, 120 34, 180 18 S 270 12, 296 20" /></svg></s>.</span>
		</h1>


		<div class="hero-foot">
			<p class="lede">
				misomoon is web analytics with no cookies. See where visitors come from, what they click, how far they read, where they give up, and
				<em>which ones pay</em>. Traffic, revenue, heatmaps, scroll maps, form drop-off, errors and Web Vitals in one tool. Add one script tag
				and see your first visit in a minute.
			</p>
			<div class="act">
				<p class="news mono"><span>Yesterday</span>{news}</p>
				<div class="ctas">
					<a class="cta primary" href={signup}>{CTA} <span class="arrow">→</span></a>
					<a class="cta ghost" href="/demo">Open the live demo</a>
				</div>
				<p class="assure mono">{TRIAL_DAYS}-day free trial · No card needed · Open source</p>
			</div>
		</div>
	</div>
</section>

<!-- ───────────────────────────── product -->
<section class="stage" id="product">
	<div class="wrap">
		<div class="stage-label mono">
			<span>fig. 1</span>
			{live ? 'The live demo dashboard, drawn from this site’s real numbers' : 'The demo dashboard, with sample numbers: the live ones could not be fetched for this view'}
		</div>
		<HeroProduct {live} />
	</div>
</section>

<!-- ───────────────────────────── the kit -->
<section class="chapter kit-sec" id="kit">
	<div class="wrap">
		<header class="head center" {@attach reveal()}>
			<span class="eyebrow"><b>★</b> The whole kit</span>
			<h2 class="display">Six tools.<br /><em>One script tag.</em></h2>
			<p>
				Most analytics stops at pageviews. Revenue, heatmaps, form analytics, error tracking and speed checks then cost a subscription each.
				misomoon does all six, and you tick only the parts you use.
			</p>
		</header>
		<ol class="kit">
			{#each kit as k, i (k.name)}
				<li {@attach reveal(i * 50)}>
					<a href={k.href}>
						<span class="mono no">{String(i + 1).padStart(2, '0')}</span>
						<b class="display">{k.name}</b>
						<span class="ask">{k.ask}</span>
						<span class="mono kb">{k.kb}</span>
					</a>
				</li>
			{/each}
		</ol>
		<p class="kit-foot mono" {@attach reveal(320)}>Everything ticked: <b>4.8 KB</b> gzipped · every part on every plan · <b>{TRIAL_DAYS} days</b> free to try</p>
	</div>
</section>

<!-- ───────────────────────────── 01 revenue -->
<section class="chapter" id="revenue">
	<div class="wrap split-2">
		<header class="head" {@attach reveal()}>
			<span class="eyebrow"><b>01</b> Revenue</span>
			<h2 class="display">See which<br /><em>visitors pay.</em></h2>
			<p>
				Connect Stripe, Polar, Lemon Squeezy, Dodo Payments or your own server. Each payment counts toward the source, campaign, country and device of
				the visit that brought the buyer. A renewal a year later still counts toward that first visit, and none of it needs a cookie.
			</p>
			<ul class="chips mono">
				{#each ['Stripe', 'Polar', 'Lemon Squeezy', 'Dodo Payments', 'Your server'] as p (p)}<li>{p}</li>{/each}
			</ul>
		</header>
		<div class="ledger-col">
			<div class="ledger" {@attach reveal(80)}>
				<div class="l-head mono"><b>Revenue by source</b><span>last 30 days · sample</span></div>
				<table>
					<thead><tr><th>Source</th><th>Visitors</th><th>Revenue</th></tr></thead>
					<tbody>
						{#each ledger as [src, v, r], i (src)}
							<tr class:top={i === 0}>
								<td>{src}</td>
								<td class="num">{fmt.format(v)}</td>
								<td><span class="rcell"><span class="rbar" style:width="{(r / ledger[0][2]) * 72}%"></span><b class="num">{usd.format(r)}</b></span></td>
							</tr>
						{/each}
					</tbody>
				</table>
				<p class="l-note mono">Google sent the most people. Hacker News sent the most money.</p>
			</div>
			<div class="facts" {@attach reveal(160)}>
				<div class="fact v"><b class="display">5</b><span>ways to connect payments</span></div>
				<div class="fact m"><b class="display">400<small>days</small></b><span>a renewal still finds its first visit</span></div>
				<div class="fact c"><b class="display">0</b><span>cookies to link a buyer</span></div>
			</div>
		</div>
	</div>
</section>

<!-- ───────────────────────────── 02 behavior -->
<section class="chapter" id="behavior">
	<div class="wrap">
		<header class="head wide" {@attach reveal()}>
			<div>
				<span class="eyebrow"><b>02</b> Behavior</span>
				<h2 class="display">Where they click.<br /><em>Where they quit.</em></h2>
			</div>
			<div class="aside">
				<p>
					See a heatmap of clicks and a scroll map drawn over your own page, with rage clicks and dead clicks marked. Find the form field where
					people gave up and the JavaScript errors they hit. misomoon never records a session or what anyone types.
				</p>
				<div class="facts">
					<div class="fact v"><b class="display">1.0<small>KB</small></b><span>for every click, rage and dead</span></div>
					<div class="fact m"><b class="display">0</b><span>sessions recorded</span></div>
					<div class="fact c"><b class="display">0</b><span>keystrokes kept</span></div>
				</div>
			</div>
		</header>
		<div class="bento">
			<article class="tile t-page" {@attach reveal(40)}>
				<span class="label mono">heatmap · scroll map · your page</span>
				<h3 class="display">Clicks and scroll, drawn on your page.</h3>
				<div class="browser" aria-hidden="true">
					<div class="b-top mono"><i></i><i></i><i></i><span>acme.com/pricing</span></div>
					<div class="b-page">
						<div class="w w-nav"><span class="dot" style:left="88%" style:--s="20px"></span></div>
						<div class="w w-h1"><span class="mark dead"><i></i>dead click</span></div>
						<div class="w w-p"></div>
						<div class="w-cards">
							<div class="w w-card"><span class="dot" style:left="50%" style:--s="30px"></span></div>
							<div class="w w-card hot"><span class="w-btn"></span><span class="dot" style:left="50%" style:--s="58px"></span><span class="mark rage">rage click ×3</span></div>
							<div class="w w-card"><span class="dot" style:left="50%" style:--s="24px"></span></div>
						</div>
						<div class="w w-p"></div>
						<div class="w w-p short"></div>
						<div class="w w-band"></div>
						<div class="ruler mono" title="Share of visits that scrolled this far"><span>100%</span><span>72%</span><span>41%</span><span>18%</span></div>
						<span class="ruler-cap mono">reached</span>
					</div>
				</div>
			</article>
			<article class="tile t-form" {@attach reveal(100)}>
				<span class="label mono">forms · signup</span>
				<h3 class="display">The field that lost them.</h3>
				<ul class="drop">
					{#each fields as [f, v] (f)}
						<li class:worst={v === 41}>
							<span>{f}</span>
							<span class="meter"><i style:width="{(v / 41) * 100}%"></i></span>
							<b class="num">{v}%</b>
						</li>
					{/each}
				</ul>
				<p class="mono small">share of visits that left the form at each field</p>
			</article>
			<article class="tile t-errors" {@attach reveal(160)}>
				<span class="label mono">javascript errors</span>
				<h3 class="display">What broke, and how often.</h3>
				<ul class="errs mono">
					{#each errors as [msg, file, n] (msg)}
						<li><b>{msg}</b><span>{file}</span><em class="num">{n} visits</em></li>
					{/each}
				</ul>
			</article>
		</div>
	</div>
</section>

<!-- ───────────────────────────── 03 traffic -->
<section class="chapter" id="traffic">
	<div class="wrap">
		<header class="head wide" {@attach reveal()}>
			<div>
				<span class="eyebrow"><b>03</b> Traffic</span>
				<h2 class="display">Click anything.<br /><em>Everything</em> filters.</h2>
			</div>
			<div class="aside">
				<p>
					Every row is a filter. Click a country, then a page, then a campaign, and every number on the dashboard narrows to those visits. Compare
					with the last period, drag across the chart to zoom, and share the exact view as a link.
				</p>
				<ul class="chips mono">
					{#each ['Channels', 'Referrers', 'UTM campaigns', 'Pages', 'Countries', 'Devices', 'Goals'] as c (c)}<li>{c}</li>{/each}
				</ul>
			</div>
		</header>
		<div class="bento">
			<article class="tile t-ai" {@attach reveal(40)}>
				<span class="label mono">new channel</span>
				<h3 class="display">AI assistants get their own line.</h3>
				<p>ChatGPT, Perplexity, Claude, Gemini and Copilot stop hiding inside “referral”.</p>
				<div class="ai-list">
					{#each [['ChatGPT', 62], ['Perplexity', 24], ['Claude', 18], ['Gemini', 9], ['Copilot', 5]] as [k, v] (k)}
						<div class="ai-row"><span class="bar" style:width="{(Number(v) / 62) * 100}%"></span><span>{k}</span><b class="num">{v}</b></div>
					{/each}
				</div>
			</article>
			<article class="tile t-funnel" {@attach reveal(100)}>
				<span class="label mono">funnels</span>
				<h3 class="display">Steps count in order, inside one visit.</h3>
				<div class="funnel">
					{#each [[100, 'Home'], [30, 'Pricing'], [13, 'Signup'], [6, 'Paid']] as [v, l] (l)}
						<div class="step">
							<div class="col" style:height="{Number(v)}%"><span class="num">{v}%</span></div>
							<span class="lbl mono">{l}</span>
						</div>
					{/each}
				</div>
			</article>
			<article class="tile t-vitals" {@attach reveal(160)}>
				<span class="label mono">web vitals · p75</span>
				<h3 class="display">How fast it felt.</h3>
				<p>Real visits at the 75th percentile, rated with the Core Web Vitals limits.</p>
				<ul class="vitals">
					{#each vitals as v (v.key)}
						<li>
							<div class="v-top"><span>{v.name}</span><b class="num">{v.value}</b></div>
							<div class="zones" aria-hidden="true">
								<i class="good" style:flex={v.zones[0]}></i><i class="fair" style:flex={v.zones[1]}></i><i class="poor" style:flex={v.zones[2]}></i>
								<span class="pin" style:left="{v.at}%"></span>
							</div>
							<div class="v-foot mono"><span>{v.key}</span><span>good under {v.limit}</span></div>
						</li>
					{/each}
				</ul>
			</article>
			<article class="tile t-engage" {@attach reveal(220)}>
				<span class="label mono">engaged time · scroll</span>
				<h3 class="display">A forgotten tab is not a fan.</h3>
				<table class="mini">
					<thead><tr><th>Page</th><th>Engaged</th><th>Scroll</th></tr></thead>
					<tbody>
						{#each [['/blog/sharding-d1', '1m 32s', 63], ['/pricing', '51s', 62], ['/docs/install', '52s', 61]] as [p, t, sc] (p)}
							<tr><td>{p}</td><td class="num">{t}</td><td><span class="meter"><i style:width="{sc}%"></i></span><span class="num">{sc}%</span></td></tr>
						{/each}
					</tbody>
				</table>
			</article>
		</div>
	</div>
</section>

<!-- ───────────────────────────── 04 connect -->
<section class="full ink" id="mcp">
	<div class="wrap split rev">
		<div class="term" {@attach reveal(120)}>
			<div class="term-top mono"><span></span><span></span><span></span>zsh — claude</div>
			<pre class="mono"><span class="c">$</span> claude mcp add --transport http misomoon \
    {app}/mcp \
    --header <span class="s">"Authorization: Bearer mm_…"</span>

<span class="c">›</span> How did last week's launch do?

  <span class="a">⏺ misomoon · get_aggregate</span>  compare=true
  <span class="a">⏺ misomoon · get_breakdown</span>  property=source

  Visitors were up <span class="n">38%</span> week over week, led
  by Hacker News (<span class="n">846</span> visitors on launch day)…</pre>
		</div>
		<header class="head" {@attach reveal()}>
			<span class="eyebrow inv"><b>04</b> Connect</span>
			<h2 class="display">Your numbers,<br /><em>inside every AI tool.</em></h2>
			<p>
				misomoon speaks the Model Context Protocol. Point Claude, Cursor or any MCP client at <code>/mcp</code> with a key for one site, and ask
				your numbers questions in plain words. The tools read stats. The only thing they can write is a note on your timeline.
			</p>
			<div class="tools-list mono">
				{#each ['list_sites', 'get_aggregate', 'get_timeseries', 'get_breakdown', 'get_goal_conversions', 'get_realtime', 'get_web_vitals', 'run_funnel'] as t, i (t)}<span
						style:--r="{((i * 37) % 7) - 3}deg">{t}</span
					>{/each}
			</div>
		</header>
	</div>
</section>

<!-- ───────────────────────────── 05 install -->
<section class="chapter" id="install">
	<div class="wrap">
		<header class="head wide" {@attach reveal()}>
			<div>
				<span class="eyebrow"><b>05</b> Install</span>
				<h2 class="display">One tag.<br /><em>Fourteen</em> signals.</h2>
			</div>
			<div class="aside">
				<p>
					The essentials every analytics tool counts, and the ones that explain them: how long people really read, how far they scroll, how fast the
					page felt, and which AI assistant sent them. Here is everything a single pageview leaves behind.
				</p>
			</div>
		</header>
		<div class="collect">
			<div class="receipt" {@attach reveal(60)}>
				<div class="r-head mono">
					<b>MISOMOON</b>
					<span>receipt for one pageview</span>
					<span>22·10·2026 · 21:04 WIB</span>
				</div>
				<ul class="mono">
					{#each receipt as [k, v] (k)}
						<li><span>{k}</span><i></i><b>{v}</b></li>
					{/each}
				</ul>
				<ul class="r-total mono">
					<li><span>cookies set</span><i></i><b>0</b></li>
					<li><span>IP addresses kept</span><i></i><b>0</b></li>
					<li class="big"><span>bytes sent</span><i></i><b>612</b></li>
				</ul>
				<div class="r-foot mono">*** thank you for not being tracked ***</div>
			</div>

			<div class="code-col">
				<div class="code print" {@attach reveal(120)}>
					<div class="code-top mono"><span>index.html</span><button onclick={copy}>{copied ? 'copied ✓' : 'copy'}</button></div>
					<pre class="mono"><span class="t">&lt;script</span> <span class="a">defer</span>
  <span class="a">src</span>=<span class="s">"{app}/m.js?s=your-site"</span><span class="t">&gt;&lt;/script&gt;</span>

<span class="c">// custom events, with revenue</span>
misomoon(<span class="s">'Purchase'</span>, &#123;
  props: &#123; plan: <span class="s">'pro'</span> &#125;,
  revenue: &#123; amount: <span class="n">19</span>, currency: <span class="s">'USD'</span> &#125;
&#125;)</pre>
				</div>
				<div class="facts" {@attach reveal(180)}>
					<div class="fact v"><b class="display">&lt;1<small>KB</small></b><span>core tracker, gzipped</span></div>
					<div class="fact m"><b class="display">0</b><span>cookies or local storage</span></div>
					<div class="fact c"><b class="display">5</b><span>Web Vitals, from real users</span></div>
				</div>
			</div>
		</div>
	</div>
</section>

<!-- ───────────────────────────── 06 included -->
<section class="chapter" id="features">
	<div class="wrap">
		<header class="head wide" {@attach reveal()}>
			<div>
				<span class="eyebrow"><b>06</b> Included</span>
				<h2 class="display">Every feature.<br /><em>On every plan.</em></h2>
			</div>
			<div class="aside">
				<p>
					Funnels, revenue, and reports usually wait behind the top plan. On misomoon, the smallest plan has the same features as the largest. {DIFFER} The
					open-source version has all of it too.
				</p>
				<p class="more"><a href="/pricing">Compare the plans →</a></p>
			</div>
		</header>
		<div class="index">
			{#each FEATURES as group, i (group.id)}
				<div class="group" {@attach reveal(i * 60)}>
					<h3 class="mono"><b>{String(i + 1).padStart(2, '0')}</b> <a href="/features#{group.id}">{group.name}</a></h3>
					<ul>
						{#each group.items as f (f.name)}
							<li><b>{f.name}.</b> {f.what}</li>
						{/each}
					</ul>
				</div>
			{/each}
		</div>
	</div>
</section>

<!-- ───────────────────────────── 07 privacy -->
<section class="chapter privacy" id="privacy">
	<div class="wrap p-grid">
		<div>
			<span class="eyebrow"><b>07</b> Privacy</span>
			<ul class="crossed display" {@attach reveal()}>
				{#each ['Cookies', 'Fingerprints', 'Stored IPs', 'Cross-site tracking', 'Ad networks'] as w, i (w)}
					<li style:--d="{i * 140}ms">{w}</li>
				{/each}
			</ul>
		</div>
		<div class="p-list" {@attach reveal(120)}>
			<div><b>No IP addresses kept.</b> An IP address is used for one hash and never stored. Search terms, error messages and click labels lose emails, ids and tokens before they are saved.</div>
			<div><b>Forgets daily.</b> Visitor ids use a salt that is replaced every day and deleted after two.</div>
			<div><b>Your region.</b> On misomoon Cloud, each site keeps its numbers in the European Union, the United States or Asia-Pacific, under our <a href="/dpa">data processing agreement</a>. Self-hosted, they stay in your own Cloudflare account.</div>
			<div><b>Nothing on the device.</b> No cookies and no local storage, so there is no cookie to accept.</div>
		</div>
	</div>
</section>

<!-- ───────────────────────────── 08 cloud -->
<section class="chapter" id="cloud">
	<div class="wrap">
		<header class="head wide" {@attach reveal()}>
			<div>
				<span class="eyebrow"><b>08</b> Two ways to run it</span>
				<h2 class="display">Open source.<br /><em>Hosted for you.</em></h2>
			</div>
			<div class="aside">
				<p>
					misomoon is MIT-licensed, and every line is on GitHub, so you can check how each number is made. misomoon Cloud runs that same code for you:
					sign up, add the script tag, and you are counting, with no server to run.
				</p>
			</div>
		</header>
		<div class="runs">
			<article class="run cloud" {@attach reveal(40)}>
				<span class="badge mono">Recommended</span>
				<h3 class="display">misomoon Cloud</h3>
				<p class="run-lede">The fastest way in. We run it, you read the numbers.</p>
				<ul>
					<li>Sign up, paste one script tag, and watch the first visit arrive.</li>
					<li>Try every feature free for {TRIAL_DAYS} days. No card needed.</li>
					<li>We deploy, update and watch it. New features reach you without a redeploy.</li>
					<li>Keep each site's numbers in the EU, the US or Asia-Pacific.</li>
					<li>Covered by our data processing agreement. Export your data any time.</li>
				</ul>
				<div class="run-cta">
					<a class="cta primary" href={signup}>{CTA} <span class="arrow">→</span></a>
					<a class="more" href="#pricing">See the plans</a>
				</div>
			</article>
			<article class="run own" {@attach reveal(120)}>
				<span class="badge mono">Open source · MIT</span>
				<h3 class="display">Self-host</h3>
				<p class="run-lede">The same code, in your own Cloudflare account.</p>
				<ul>
					<li>Read, change and audit every line on GitHub.</li>
					<li>The Deploy to Cloudflare button copies it into a repository you own.</li>
					<li>Workers Free handles about 3,000 events a day. Workers Paid starts at $5 a month.</li>
					<li>You run the updates and look after the databases.</li>
				</ul>
				<div class="run-cta">
					<a class="cta ghost" href={docLink(data.docsUrl, 'self-hosting')}>Read the self-hosting guide</a>
				</div>
			</article>
		</div>
	</div>
</section>

<!-- ───────────────────────────── 09 pricing -->
<section class="chapter" id="pricing">
	<div class="wrap">
		<header class="head wide" {@attach reveal()}>
			<div>
				<span class="eyebrow"><b>09</b> Pricing</span>
				<h2 class="display">Pay for events.<br /><em>Not features.</em></h2>
			</div>
			<div class="aside">
				<p>Every plan has every feature. {DIFFER} Try it free for {TRIAL_DAYS} days with no card, and move up when your traffic does.</p>
				<p class="more"><a href="/pricing">Full pricing and questions →</a></p>
			</div>
		</header>
		<Plans appUrl={data.appUrl} docsUrl={data.docsUrl} />
	</div>
</section>

<!-- ───────────────────────────── 10 questions -->
<section class="chapter" id="faq">
	<div class="wrap faq-grid">
		<header class="head" {@attach reveal()}>
			<span class="eyebrow"><b>10</b> Questions</span>
			<h2 class="display">Before<br /><em>you switch.</em></h2>
			<p>The questions people ask before they move their analytics. The <a href={docLink(data.docsUrl, 'faq')}>full FAQ</a> has more.</p>
		</header>
		<div class="faq" {@attach reveal(100)}>
			{#each faqs as [q, a] (q)}
				<details>
					<summary>{q}</summary>
					<p>{a}</p>
				</details>
			{/each}
		</div>
	</div>
</section>

<!-- ───────────────────────────── final -->
<section class="final">
	<div class="final-moon" aria-hidden="true"><Moon size={760} phase={0} grid={44} rim={false} /></div>
	<div class="wrap final-inner" {@attach reveal()}>
		<h2 class="display">Sleep<br />at night.</h2>
		<p class="mono">Analytics that never keep you, or your visitors, up. Try it free for {TRIAL_DAYS} days, no card needed.</p>
		<div class="ctas">
			<a class="cta primary" href={signup}>{CTA} <span class="arrow">→</span></a>
			<a class="cta ghost" href="/demo">Explore the live demo</a>
		</div>
	</div>
</section>

<style>
	/* ── edition strip */
	.strip {
		border-bottom: 2px solid var(--ink);
		font-size: 11px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.strip-row {
		display: flex;
		justify-content: space-between;
		gap: 18px;
		padding: 9px 0;
	}
	.strip span {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		white-space: nowrap;
	}
	.mini-moon {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		border: 1.5px solid var(--ink);
		background: linear-gradient(90deg, var(--surface-3) calc(100% - var(--lit)), var(--vermilion) 0);
	}
	.live {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--leaf);
		animation: blink 1.6s steps(2) infinite;
	}
	@keyframes blink {
		50% {
			opacity: 0.25;
		}
	}

	/* ── hero */
	.hero {
		position: relative;
		padding: 48px 0 0;
		overflow: hidden;
	}
	.hero-grid {
		position: relative;
	}
	.moon-wrap {
		position: absolute;
		right: -40px;
		top: -10px;
		width: min(560px, 46vw);
	}
	.kicker {
		position: relative;
		margin: 0 0 22px;
	}
	h1 {
		position: relative;
		pointer-events: none;
		margin: 0;
		font-size: clamp(64px, 13.4vw, 200px);
		line-height: 0.84;
		letter-spacing: -0.012em;
	}
	h1 span {
		display: block;
	}
	.l2 {
		padding-left: 0.9em;
	}
	.l3 {
		color: var(--miso);
	}
	.struck {
		position: relative;
		text-decoration: none;
		display: inline-block;
	}
	.struck svg {
		position: absolute;
		left: -3%;
		top: 30%;
		width: 106%;
		height: 0.4em;
		overflow: visible;
	}
	.struck path {
		fill: none;
		stroke: var(--ink);
		stroke-width: 9;
		stroke-linecap: round;
	}
	.moon-label {
		margin-top: 6px;
		font-size: 10.5px;
		line-height: 1.6;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		text-align: right;
		color: var(--text-2);
	}
	.moon-label b {
		padding: 1px 6px;
		margin-right: 6px;
		background: var(--block);
		color: var(--on-block);
		font-weight: 600;
	}
	.act {
		display: grid;
		justify-items: end;
	}
	.news {
		display: flex;
		gap: 12px;
		align-items: baseline;
		max-width: 560px;
		margin: 0 0 22px;
		font-size: 12.5px;
		line-height: 1.6;
	}
	.news span {
		/* stays light in the night edition, so ink stays ink on it */
		--ink: var(--ink-print);
		--text: var(--ink-print);
		--text-2: var(--print-2);
		--text-3: var(--print-3);
		--surface: var(--print-surface);
		color: var(--ink-print);
		flex: none;
		padding: 2px 7px;
		border: 1.5px solid var(--ink);
		background: var(--mustard);
		font-size: 10.5px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.hero-foot {
		position: relative;
		display: grid;
		grid-template-columns: 1.1fr 1fr;
		gap: 40px;
		align-items: end;
		margin-top: 40px;
		padding: 28px 0 56px;
		border-top: 2px solid var(--ink);
	}
	.lede {
		margin: 0;
		max-width: 540px;
		font-size: 19px;
		line-height: 1.5;
		font-weight: 450;
	}
	.lede em {
		/* stays light in the night edition, so ink stays ink on it */
		--ink: var(--ink-print);
		--text: var(--ink-print);
		--text-2: var(--print-2);
		--text-3: var(--print-3);
		--surface: var(--print-surface);
		color: var(--ink-print);
		font-style: normal;
		background: var(--highlight);
		padding: 0 4px;
		box-shadow: 2px 2px 0 var(--ink);
		border: 1.5px solid var(--ink);
	}
	.ctas {
		display: flex;
		gap: 14px;
		flex-wrap: wrap;
		justify-content: flex-end;
	}

	/* ── stage */
	.stage {
		position: relative;
		padding: 56px 0 84px;
		background-color: var(--cobalt);
		background-image: radial-gradient(rgb(255 255 255 / 0.16) 1.3px, transparent 1.7px);
		background-size: 12px 12px;
		border-block: 2px solid var(--ink);
	}
	.stage-label {
		display: flex;
		gap: 14px;
		align-items: center;
		margin-bottom: 22px;
		font-size: 11.5px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--paper);
	}
	.stage-label span {
		/* stays light in the night edition, so ink stays ink on it */
		--ink: var(--ink-print);
		--text: var(--ink-print);
		--text-2: var(--print-2);
		--text-3: var(--print-3);
		--surface: var(--print-surface);
		padding: 3px 9px;
		background: var(--paper);
		color: var(--ink);
		border: 1.5px solid var(--ink);
	}

	/* ── chapters */
	.chapter {
		padding: 120px 0 30px;
	}
	.head {
		max-width: 720px;
	}
	.head.center {
		margin: 0 auto;
		text-align: center;
	}
	h2 {
		margin: 20px 0 0;
		font-size: clamp(52px, 7.6vw, 108px);
		line-height: 0.86;
	}
	.head p {
		margin: 24px 0 0;
		font-size: 18px;
		line-height: 1.6;
		color: var(--text-2);
		max-width: 620px;
	}
	.head.center p {
		margin-inline: auto;
	}
	/* the title on the left, its text and facts on the right, so the row has no empty half */
	.head.wide {
		display: grid;
		grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
		gap: 24px 64px;
		align-items: end;
		max-width: none;
	}
	.head.wide .aside p {
		margin-top: 0;
	}
	.head.wide .facts {
		margin-top: 26px;
	}
	.head.wide .fact b {
		font-size: 52px;
	}
	.head.wide .more {
		margin-top: 18px;
		font-weight: 600;
	}
	.head.wide .more a {
		color: var(--miso);
	}
	code {
		font-family: var(--font-mono);
		font-size: 0.8em;
		padding: 2px 7px;
		border-radius: 5px;
		border: 1.5px solid currentColor;
	}

	/* collect */
	.collect {
		display: grid;
		grid-template-columns: 420px 1fr;
		gap: 56px;
		margin-top: 64px;
		align-items: start;
	}
	.receipt {
		/* stays light in the night edition, so ink stays ink on it */
		--ink: var(--ink-print);
		--text: var(--ink-print);
		--text-2: var(--print-2);
		--text-3: var(--print-3);
		--surface: var(--print-surface);
		position: relative;
		background: #fffdf7;
		color: var(--ink);
		padding: 26px 26px 34px;
		border: 2px solid var(--ink);
		border-bottom: 0;
		filter: drop-shadow(6px 6px 0 var(--ink));
		rotate: -1.4deg;
		mask: conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) 50% / 18px 100%;
		font-size: 12px;
	}
	.r-head {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		padding-bottom: 14px;
		border-bottom: 2px dashed var(--ink);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-size: 10.5px;
	}
	.r-head b {
		font-family: var(--font-display);
		font-stretch: 100%;
		font-weight: 900;
		font-size: 26px;
		letter-spacing: -0.02em;
	}
	.receipt ul {
		list-style: none;
		margin: 0;
		padding: 12px 0;
	}
	.receipt li {
		display: flex;
		align-items: baseline;
		gap: 6px;
		padding: 3px 0;
	}
	.receipt li span {
		color: #6b6253;
	}
	.receipt li i {
		flex: 1;
		border-bottom: 1.5px dotted color-mix(in oklab, var(--ink) 35%, transparent);
	}
	.receipt li b {
		font-weight: 500;
		text-align: right;
	}
	.r-total {
		border-top: 2px dashed var(--ink);
	}
	.r-total li b {
		/* small text: the darker leaf keeps 4.5:1 on paper, in both themes */
		color: #0b7a4b;
		font-weight: 700;
	}
	.r-total li.big {
		font-size: 15px;
		font-weight: 700;
	}
	.r-total li.big span,
	.r-total li.big b {
		color: var(--ink);
	}
	.r-foot {
		text-align: center;
		font-size: 10.5px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.code-col {
		display: flex;
		flex-direction: column;
		gap: 22px;
	}
	.code {
		background: var(--block);
		color: var(--on-block);
	}
	.code-top {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 12px 18px;
		border-bottom: 1.5px solid rgb(242 236 223 / 0.15);
		font-size: 11px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: rgb(242 236 223 / 0.6);
	}
	.code-top button {
		/* stays light in the night edition, so ink stays ink on it */
		--ink: var(--ink-print);
		--text: var(--ink-print);
		--text-2: var(--print-2);
		--text-3: var(--print-3);
		--surface: var(--print-surface);
		padding: 5px 12px;
		border-radius: 999px;
		background: var(--mustard);
		color: var(--ink);
		font-family: var(--font-mono);
		font-size: 11px;
		font-weight: 600;
		border: 1.5px solid var(--ink);
	}
	pre {
		margin: 0;
		padding: 22px 22px 26px;
		font-size: 13px;
		line-height: 1.8;
		overflow-x: auto;
	}
	.t {
		color: #ff8a65;
	}
	.a {
		color: #9fb0ff;
	}
	.s {
		color: var(--mustard);
	}
	.n {
		color: #ff8a65;
	}
	.c {
		color: rgb(242 236 223 / 0.6);
	}
	.facts {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 16px;
	}
	.fact {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 18px;
		border: 2px solid var(--ink);
		border-radius: 12px;
		box-shadow: 4px 4px 0 var(--ink);
		color: var(--ink);
	}
	.fact b {
		font-size: 68px;
		line-height: 0.8;
	}
	.fact small {
		font-size: 0.4em;
		margin-left: 4px;
	}
	.fact span {
		font-size: 13.5px;
		font-weight: 500;
	}
	.fact.v {
		background: var(--vermilion);
		color: var(--on-vermilion);
	}
	.fact.m {
		/* stays light in the night edition, so ink stays ink on it */
		--ink: var(--ink-print);
		--text: var(--ink-print);
		--text-2: var(--print-2);
		--text-3: var(--print-3);
		--surface: var(--print-surface);
		color: var(--ink-print);
		background: var(--mustard);
	}
	.fact.c {
		background: var(--surface);
		color: var(--text);
	}

	/* bento */
	.bento {
		display: grid;
		grid-template-columns: repeat(12, 1fr);
		gap: 22px;
		margin-top: 60px;
	}
	.tile {
		position: relative;
		padding: 26px;
		border: 2px solid var(--ink);
		border-radius: 16px;
		box-shadow: 6px 6px 0 var(--ink);
		color: var(--ink);
		transition:
			translate var(--dur) var(--ease-out),
			rotate var(--dur) var(--ease-out),
			box-shadow var(--dur) var(--ease-out);
	}
	.tile:hover {
		translate: -3px -3px;
		rotate: -0.4deg;
		box-shadow: 10px 10px 0 var(--ink);
	}
	.tile .label {
		display: inline-block;
		padding: 3px 9px;
		border: 1.5px solid var(--ink);
		border-radius: 999px;
		font-size: 10.5px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		background: color-mix(in oklab, var(--surface) 50%, transparent);
	}
	.tile h3 {
		margin: 16px 0 0;
		font-size: 40px;
		line-height: 0.9;
		max-width: 14ch;
	}
	.tile p {
		margin: 12px 0 20px;
		font-size: 15px;
		line-height: 1.5;
		max-width: 44ch;
	}
	.t-ai {
		/* stays light in the night edition, so ink stays ink on it */
		--ink: var(--ink-print);
		--text: var(--ink-print);
		--text-2: var(--print-2);
		--text-3: var(--print-3);
		--surface: var(--print-surface);
		color: var(--ink-print);
		grid-column: span 7;
		background: var(--mustard);
	}
	.t-funnel {
		grid-column: span 5;
		background: var(--cobalt);
		color: var(--paper);
	}
	.t-funnel .label,
	.t-vitals .label {
		/* stays light in the night edition, so ink stays ink on it */
		--ink: var(--ink-print);
		--text: var(--ink-print);
		--text-2: var(--print-2);
		--text-3: var(--print-3);
		--surface: var(--print-surface);
		background: var(--paper);
		color: var(--ink);
	}
	.t-vitals {
		grid-column: span 4;
		background: var(--block);
		color: var(--on-block);
	}
	.t-engage {
		grid-column: span 8;
		background: var(--surface);
		color: var(--text);
	}
	.ai-list {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}
	.ai-row {
		position: relative;
		display: flex;
		justify-content: space-between;
		padding: 8px 12px;
		font-size: 14px;
		font-weight: 500;
		isolation: isolate;
	}
	.ai-row .bar {
		position: absolute;
		inset: 0 auto 0 0;
		border-radius: 6px;
		background: color-mix(in oklab, var(--surface) 55%, transparent);
		border: 1.5px solid var(--ink);
		z-index: -1;
	}
	.t-ai .ai-row:first-child .bar {
		background: var(--vermilion);
	}
	.funnel {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 10px;
		height: 220px;
		margin-top: 34px;
	}
	.step {
		position: relative;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		padding-bottom: 26px;
		background-image: radial-gradient(rgb(255 255 255 / 0.28) 1.2px, transparent 1.6px);
		background-size: 8px 8px;
		border-radius: 8px;
	}
	.col {
		/* stays light in the night edition, so ink stays ink on it */
		--ink: var(--ink-print);
		--text: var(--ink-print);
		--text-2: var(--print-2);
		--text-3: var(--print-3);
		--surface: var(--print-surface);
		color: var(--ink-print);
		position: relative;
		border: 2px solid var(--ink);
		border-radius: 8px 8px 3px 3px;
		background: var(--paper);
		min-height: 24px;
		box-shadow: 3px 3px 0 var(--ink);
	}
	.step:first-child .col {
		background: var(--vermilion);
	}
	.col span {
		position: absolute;
		top: -24px;
		left: 2px;
		font-weight: 700;
		font-size: 14px;
	}
	.step .lbl {
		position: absolute;
		bottom: 2px;
		left: 2px;
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.vitals {
		display: flex;
		flex-direction: column;
		gap: 18px;
		margin: 6px 0 0;
		padding: 0;
		list-style: none;
	}
	.v-top {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 10px;
		font-size: 15px;
		font-weight: 600;
	}
	.v-top b {
		font-size: 18px;
	}
	.zones {
		position: relative;
		display: flex;
		gap: 3px;
		height: 10px;
		margin: 8px 0 6px;
	}
	.zones i {
		border-radius: 3px;
	}
	.zones .good {
		background: var(--leaf);
	}
	.zones .fair {
		background: var(--mustard);
	}
	.zones .poor {
		background: var(--vermilion);
	}
	.pin {
		position: absolute;
		top: -5px;
		width: 4px;
		height: 20px;
		translate: -50% 0;
		border-radius: 2px;
		background: var(--paper);
		box-shadow: 0 0 0 2px var(--ink);
	}
	.v-foot {
		display: flex;
		justify-content: space-between;
		font-size: 10.5px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		opacity: 0.75;
	}
	.mini {
		width: 100%;
		border-collapse: collapse;
		font-size: 14.5px;
		margin-top: 22px;
	}
	.mini th {
		text-align: left;
		font-family: var(--font-mono);
		font-weight: 500;
		font-size: 10.5px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		padding: 0 0 10px;
		border-bottom: 2px solid var(--ink);
	}
	.mini td {
		padding: 12px 0;
		border-bottom: 1.5px dashed var(--line-strong);
		font-weight: 500;
	}
	.mini td:last-child {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.meter {
		flex: 1;
		max-width: 160px;
		height: 12px;
		border: 1.5px solid var(--ink);
		border-radius: 999px;
		overflow: hidden;
	}
	.meter i {
		display: block;
		height: 100%;
		background: var(--vermilion);
	}

	/* the kit */
	.kit {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
		gap: 16px;
		margin: 60px 0 0;
		padding: 0;
		list-style: none;
	}
	.kit a {
		display: flex;
		flex-direction: column;
		gap: 10px;
		height: 100%;
		padding: 18px 16px 16px;
		border: 2px solid var(--ink);
		border-radius: 12px;
		box-shadow: 4px 4px 0 var(--ink);
		background: var(--surface);
		color: var(--text);
		text-decoration: none;
		transition:
			translate var(--dur) var(--ease-out),
			box-shadow var(--dur) var(--ease-out);
	}
	.kit a:hover {
		translate: -2px -2px;
		box-shadow: 6px 6px 0 var(--ink);
	}
	.kit li:nth-child(2) a {
		background: var(--vermilion);
		color: var(--on-vermilion);
	}
	.kit li:nth-child(3) a {
		/* stays light in the night edition, so ink stays ink on it */
		--ink: var(--ink-print);
		--text: var(--ink-print);
		--text-2: var(--print-2);
		--text-3: var(--print-3);
		--surface: var(--print-surface);
		background: var(--mustard);
		color: var(--ink);
	}
	.kit li:nth-child(4) a {
		background: var(--cobalt);
		color: var(--paper);
	}
	.kit li:nth-child(5) a {
		background: var(--plum);
		color: var(--paper);
	}
	.kit li:nth-child(6) a {
		background: var(--leaf);
		color: var(--paper);
	}
	.kit .no {
		font-size: 11px;
		letter-spacing: 0.08em;
		font-weight: 600;
	}
	.kit b {
		font-size: 30px;
		line-height: 0.9;
	}
	.kit .ask {
		flex: 1;
		font-size: 14.5px;
		line-height: 1.4;
		font-weight: 500;
	}
	.kit .kb {
		align-self: flex-start;
		padding: 3px 8px;
		border: 1.5px solid currentColor;
		border-radius: 999px;
		font-size: 10.5px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.kit-foot {
		margin: 28px 0 0;
		text-align: center;
		font-size: 12px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.kit-foot b {
		color: var(--text);
	}

	/* revenue */
	.split-2 {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr);
		gap: 56px;
		align-items: start;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin: 28px 0 0;
		padding: 0;
		list-style: none;
	}
	.chips li {
		padding: 5px 11px;
		border: 1.5px solid var(--ink);
		border-radius: 999px;
		background: var(--surface);
		color: var(--text);
		font-size: 11.5px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.ledger-col {
		display: flex;
		flex-direction: column;
		gap: 22px;
	}
	.ledger {
		padding: 22px 24px 18px;
		border: 2px solid var(--ink);
		border-radius: 16px;
		box-shadow: 6px 6px 0 var(--ink);
		background: var(--surface);
		color: var(--text);
	}
	.l-head {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		flex-wrap: wrap;
		font-size: 11px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.l-head span {
		color: var(--text-2);
	}
	.ledger table {
		width: 100%;
		margin-top: 16px;
		border-collapse: collapse;
		font-size: 15px;
	}
	.ledger th {
		text-align: left;
		font-family: var(--font-mono);
		font-weight: 500;
		font-size: 10.5px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		padding: 0 0 10px;
		border-bottom: 2px solid var(--ink);
	}
	.ledger td {
		padding: 11px 0;
		border-bottom: 1.5px dashed var(--line-strong);
		font-weight: 500;
	}
	.ledger td:last-child {
		width: 46%;
	}
	/* the bar, then the amount after it, so a small amount still reads */
	.rcell {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.rbar {
		flex: none;
		min-width: 4px;
		height: 20px;
		border: 1.5px solid var(--ink);
		border-radius: 6px;
		background: var(--surface-3);
	}
	tr.top .rbar {
		background: var(--vermilion);
	}
	.l-note {
		margin: 14px 0 0;
		font-size: 11.5px;
		letter-spacing: 0.02em;
		color: var(--text-2);
	}

	/* behavior */
	.t-page {
		display: flex;
		flex-direction: column;
		grid-column: span 7;
		grid-row: span 2;
		background: var(--surface);
		color: var(--text);
	}
	.t-page .label {
		align-self: flex-start;
	}
	.t-form {
		/* stays light in the night edition, so ink stays ink on it */
		--ink: var(--ink-print);
		--text: var(--ink-print);
		--text-2: var(--print-2);
		--text-3: var(--print-3);
		--surface: var(--print-surface);
		color: var(--ink-print);
		grid-column: span 5;
		background: var(--mustard);
	}
	.t-errors {
		grid-column: span 5;
		background: var(--plum);
		color: var(--paper);
	}
	.t-errors .label {
		/* stays light in the night edition, so ink stays ink on it */
		--ink: var(--ink-print);
		--text: var(--ink-print);
		--text-2: var(--print-2);
		--text-3: var(--print-3);
		--surface: var(--print-surface);
		background: var(--paper);
		color: var(--ink);
	}
	.browser {
		/* stays light in the night edition, so ink stays ink on it */
		--ink: var(--ink-print);
		--text: var(--ink-print);
		--text-2: var(--print-2);
		--text-3: var(--print-3);
		--surface: var(--print-surface);
		color: var(--ink-print);
		flex: 1;
		display: flex;
		flex-direction: column;
		margin-top: 22px;
		border: 2px solid var(--ink);
		border-radius: 10px;
		overflow: hidden;
		background: var(--paper);
	}
	.b-top {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 12px;
		border-bottom: 2px solid var(--ink);
		background: color-mix(in oklab, var(--ink) 8%, transparent);
		color: var(--ink);
		font-size: 10.5px;
	}
	.b-top i {
		width: 9px;
		height: 9px;
		border: 1.5px solid var(--ink);
		border-radius: 50%;
	}
	.b-top span {
		margin-left: 8px;
	}
	.b-page {
		flex: 1;
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 18px 64px 26px 20px;
		min-height: 300px;
	}
	.w {
		border: 1.5px solid color-mix(in oklab, var(--ink) 35%, transparent);
		border-radius: 6px;
		background: color-mix(in oklab, var(--ink) 6%, transparent);
	}
	.w-nav {
		position: relative;
		height: 16px;
	}
	.w-p.short {
		width: 55%;
	}
	.w-band {
		flex: 1;
		min-height: 60px;
		margin-top: 10px;
	}
	.w-h1 {
		height: 34px;
		width: 62%;
		margin-top: 12px;
	}
	.w-p {
		height: 12px;
		width: 80%;
	}
	.w-cards {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 12px;
		margin-top: 14px;
	}
	.w-card {
		position: relative;
		height: 120px;
	}
	.w-card.hot {
		border-color: var(--ink);
	}
	.w-btn {
		position: absolute;
		left: 12%;
		right: 12%;
		bottom: 12px;
		height: 22px;
		border-radius: 5px;
		background: var(--block);
	}
	.dot {
		position: absolute;
		top: 50%;
		width: var(--s);
		height: var(--s);
		translate: -50% -50%;
		border-radius: 50%;
		background-image: radial-gradient(var(--vermilion) 1.6px, transparent 2px);
		background-size: 6px 6px;
		opacity: 0.9;
	}
	.mark {
		position: absolute;
		font-family: var(--font-mono);
		font-size: 10px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		white-space: nowrap;
		padding: 3px 7px;
		border: 1.5px solid var(--ink);
		border-radius: 999px;
		color: var(--ink);
	}
	.w-card .dot {
		top: auto;
		bottom: 23px;
		translate: -50% 50%;
	}
	.mark.rage {
		left: 50%;
		bottom: 58px;
		translate: -50% 0;
		background: var(--vermilion);
		color: var(--on-vermilion);
	}
	.w-h1 {
		position: relative;
	}
	.mark.dead {
		/* stays light in the night edition, so ink stays ink on it */
		--ink: var(--ink-print);
		--text: var(--ink-print);
		--text-2: var(--print-2);
		--text-3: var(--print-3);
		--surface: var(--print-surface);
		color: var(--ink-print);
		left: 70%;
		top: 50%;
		translate: 0 -50%;
		display: flex;
		align-items: center;
		gap: 6px;
		background: var(--mustard);
	}
	.mark.dead i {
		width: 8px;
		height: 8px;
		border: 1.5px solid var(--ink);
		border-radius: 50%;
	}
	/* the scroll map's caption, above the ruler's first step */
	.ruler-cap {
		position: absolute;
		right: 0;
		top: 8px;
		width: 48px;
		font-size: 9px;
		letter-spacing: 0.02em;
		text-align: center;
		text-transform: uppercase;
		color: var(--text-3);
	}
	.ruler {
		position: absolute;
		top: 0;
		right: 0;
		bottom: 0;
		width: 48px;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		padding: 26px 0 10px;
		border-left: 1.5px dashed color-mix(in oklab, var(--ink) 35%, transparent);
		background: linear-gradient(var(--vermilion), transparent);
		background-size: 4px 100%;
		background-repeat: no-repeat;
		color: var(--ink);
		font-size: 10px;
		text-align: center;
	}
	.drop {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin: 26px 0 0;
		padding: 0;
		list-style: none;
	}
	.drop li {
		display: grid;
		grid-template-columns: 110px 1fr 44px;
		align-items: center;
		gap: 12px;
		font-size: 14.5px;
		font-weight: 500;
	}
	.drop .meter {
		max-width: none;
		background: color-mix(in oklab, var(--surface) 50%, transparent);
	}
	.drop .meter i {
		background: var(--block);
	}
	.drop li.worst .meter i {
		background: var(--vermilion);
	}
	.drop li.worst {
		font-weight: 700;
	}
	.drop b {
		text-align: right;
	}
	.t-form .small {
		margin: 16px 0 0;
		font-size: 11px;
	}
	.errs {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin: 22px 0 0;
		padding: 0;
		list-style: none;
		font-size: 12px;
	}
	.errs li {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 2px 12px;
		padding: 10px 12px;
		border: 1.5px solid var(--paper);
		border-radius: 8px;
	}
	.errs b {
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.errs span {
		grid-column: 1;
		opacity: 0.75;
	}
	.errs em {
		grid-column: 2;
		grid-row: 1 / span 2;
		align-self: center;
		font-style: normal;
		font-weight: 700;
	}

	/* full-bleed sections */
	.full {
		padding: 120px 0;
		margin-top: 110px;
		border-block: 2px solid var(--ink);
	}
	.full.ink {
		margin-top: 0;
		background: var(--block);
		color: var(--on-block);
	}
	.full.ink .head p {
		color: rgb(242 236 223 / 0.75);
	}
	.full.ink h2 em {
		color: var(--mustard);
	}
	.eyebrow.inv b {
		/* stays light in the night edition, so ink stays ink on it */
		--ink: var(--ink-print);
		--text: var(--ink-print);
		--text-2: var(--print-2);
		--text-3: var(--print-3);
		--surface: var(--print-surface);
		background: var(--paper);
		color: var(--ink);
	}
	.split {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 64px;
		align-items: center;
	}
	.rev {
		grid-template-columns: 1.05fr 1fr;
	}

	/* connect */
	.term {
		border: 2px solid var(--paper);
		border-radius: 14px;
		box-shadow: 8px 8px 0 var(--mustard);
		overflow: hidden;
		background: #0b0907;
	}
	.term-top {
		display: flex;
		align-items: center;
		gap: 7px;
		padding: 11px 14px;
		border-bottom: 1.5px solid rgb(242 236 223 / 0.18);
		font-size: 11px;
		color: rgb(242 236 223 / 0.5);
	}
	.term-top span {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: rgb(242 236 223 / 0.25);
	}
	.term-top span:first-child {
		background: var(--vermilion);
	}
	.term pre {
		color: var(--paper);
	}
	.tools-list {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 28px;
	}
	.tools-list span {
		/* stays light in the night edition, so ink stays ink on it */
		--ink: var(--ink-print);
		--text: var(--ink-print);
		--text-2: var(--print-2);
		--text-3: var(--print-3);
		--surface: var(--print-surface);
		font-size: 11.5px;
		padding: 6px 11px;
		border-radius: 6px;
		background: var(--paper);
		color: var(--ink);
		border: 1.5px solid var(--paper);
		rotate: var(--r);
		transition:
			rotate var(--dur) var(--ease-pop),
			scale var(--dur) var(--ease-pop),
			background var(--dur-fast);
	}
	.tools-list span:hover {
		rotate: 0deg;
		scale: 1.08;
		background: var(--mustard);
	}

	/* two ways to run it */
	.runs {
		display: grid;
		grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
		gap: 22px;
		margin-top: 60px;
		align-items: stretch;
	}
	.run {
		position: relative;
		display: flex;
		flex-direction: column;
		padding: 30px;
		border: 2px solid var(--ink);
		border-radius: 16px;
		box-shadow: 6px 6px 0 var(--ink);
		background: var(--surface);
		color: var(--text);
	}
	.run.cloud {
		background: var(--vermilion);
		color: var(--on-vermilion);
	}
	.badge {
		align-self: flex-start;
		padding: 3px 10px;
		border: 1.5px solid currentColor;
		border-radius: 999px;
		font-size: 10.5px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.run h3 {
		margin: 18px 0 0;
		font-size: 48px;
		line-height: 0.9;
	}
	.run-lede {
		margin: 12px 0 0;
		font-size: 17px;
		font-weight: 600;
	}
	.run ul {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin: 22px 0 0;
		padding: 0;
		list-style: none;
		font-size: 15.5px;
		line-height: 1.45;
	}
	.run li {
		position: relative;
		padding-left: 24px;
	}
	.run li::before {
		content: '✓';
		position: absolute;
		left: 0;
		font-weight: 700;
	}
	.run.own li::before {
		color: var(--miso);
	}
	.run-cta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 18px;
		margin-top: 28px;
	}
	.run.cloud .cta.primary {
		/* stays light in the night edition, so ink stays ink on it */
		--ink: var(--ink-print);
		--text: var(--ink-print);
		--text-2: var(--print-2);
		--text-3: var(--print-3);
		--surface: var(--print-surface);
		background: var(--paper);
		color: var(--ink);
	}
	.run-cta .more {
		color: inherit;
		font-weight: 600;
	}

	/* included */
	.index {
		margin-top: 60px;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
		gap: 22px;
		align-items: start;
	}
	.group {
		border: 2px solid var(--ink);
		border-radius: 14px;
		background: var(--surface);
		box-shadow: var(--shadow);
		overflow: hidden;
	}
	.group h3 {
		margin: 0;
		padding: 12px 18px;
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		border-bottom: 2px solid var(--ink);
	}
	.group h3 b {
		color: var(--miso);
	}
	.group ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.group li {
		padding: 12px 18px;
		font-size: 14.5px;
		line-height: 1.5;
		color: var(--text-2);
		border-bottom: 1.5px dashed var(--line-strong);
	}
	.group li:last-child {
		border-bottom: 0;
	}
	.group li b {
		color: var(--text);
		font-weight: 700;
	}

	/* privacy */
	.p-grid {
		display: grid;
		grid-template-columns: 1.2fr 1fr;
		gap: 60px;
		align-items: end;
	}
	.crossed {
		list-style: none;
		padding: 0;
		margin: 22px 0 0;
		font-size: clamp(40px, 6.2vw, 92px);
		line-height: 0.95;
	}
	.crossed li {
		position: relative;
		width: fit-content;
		white-space: nowrap;
	}
	.crossed li::after {
		content: '';
		position: absolute;
		left: -2%;
		right: -2%;
		top: 44%;
		height: 0.13em;
		background: var(--vermilion);
		transform: scaleX(0) rotate(-2deg);
		transform-origin: left;
		animation: strike 0.5s var(--ease-out) forwards;
		animation-delay: calc(0.6s + var(--d));
	}
	@keyframes strike {
		to {
			transform: scaleX(1) rotate(-2deg);
		}
	}
	.p-list {
		display: flex;
		flex-direction: column;
		border: 2px solid var(--ink);
		border-radius: 14px;
		background: var(--surface);
		box-shadow: 6px 6px 0 var(--ink);
		overflow: hidden;
	}
	.p-list div {
		padding: 20px 22px;
		font-size: 15.5px;
		line-height: 1.55;
		border-bottom: 1.5px dashed var(--line-strong);
	}
	.p-list div:last-child {
		border-bottom: 0;
	}
	.p-list b {
		font-weight: 700;
	}

	/* questions */
	.faq-grid {
		display: grid;
		grid-template-columns: 1fr 1.3fr;
		gap: 60px;
		align-items: start;
	}
	.faq-grid .head a {
		color: inherit;
		text-decoration: underline;
		text-decoration-color: var(--vermilion);
		text-decoration-thickness: 2px;
	}
	.faq {
		border: 2px solid var(--ink);
		border-radius: 14px;
		background: var(--surface);
		box-shadow: 6px 6px 0 var(--ink);
		overflow: hidden;
	}
	.faq details {
		border-bottom: 1.5px dashed var(--line-strong);
	}
	.faq details:last-child {
		border-bottom: 0;
	}
	.faq summary {
		display: flex;
		justify-content: space-between;
		gap: 16px;
		padding: 18px 22px;
		font-size: 16px;
		font-weight: 700;
		cursor: pointer;
		list-style: none;
	}
	.faq summary::-webkit-details-marker {
		display: none;
	}
	.faq summary::after {
		content: '+';
		font-family: var(--font-mono, monospace);
		color: var(--miso);
	}
	.faq details[open] summary::after {
		content: '−';
	}
	.faq summary:focus-visible {
		outline: 2px solid var(--vermilion);
		outline-offset: -4px;
	}
	.faq details p {
		margin: 0;
		padding: 0 22px 20px;
		font-size: 15px;
		line-height: 1.6;
		color: var(--text-2);
	}

	/* final */
	.final {
		position: relative;
		padding: 150px 0 160px;
		overflow: hidden;
		border-top: 2px solid var(--ink);
		background: var(--surface-2);
	}
	.final-moon {
		position: absolute;
		left: 50%;
		top: 50%;
		width: min(760px, 120vw);
		transform: translate(-50%, -50%);
	}
	.final-inner {
		position: relative;
		text-align: center;
	}
	.final h2 {
		margin: 0;
		font-size: clamp(90px, 17vw, 250px);
		line-height: 0.8;
		color: var(--ink);
	}
	.final p {
		display: inline-block;
		margin: 26px 0 0;
		padding: 4px 10px;
		background: var(--surface-2);
		border: 1.5px solid var(--ink);
		font-size: 12px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.final .ctas {
		justify-content: center;
		margin-top: 30px;
	}
	.assure {
		margin: 14px 0 0;
		font-size: 11px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2);
	}

	@media (max-width: 1060px) {
		.collect {
			grid-template-columns: minmax(0, 1fr);
		}
		.receipt {
			max-width: 440px;
		}
	}
	@media (max-width: 960px) {
		.split,
		.rev,
		.p-grid,
		.faq-grid,
		.runs,
		.hero-foot {
			grid-template-columns: 1fr;
		}
		.ctas {
			justify-content: flex-start;
		}
		.bento,
		.split-2,
		.head.wide {
			grid-template-columns: 1fr;
		}
		.kit {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}

		.bento > .tile {
			grid-column: auto;
		}
		.chapter {
			padding-top: 90px;
		}
		.full {
			padding: 90px 0;
		}
		}
	@media (max-width: 640px) {
		.moon-label,
		.strip-row > span:last-child {
			display: none;
		}
		.strip-row {
			flex-wrap: wrap;
			gap: 4px 14px;
			font-size: 10px;
		}
		.kit {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 12px;
		}
		.kit b {
			font-size: 26px;
		}
		.b-page {
			padding-right: 54px;
			min-height: 250px;
		}
		.w-card {
			height: 96px;
		}
		.drop li {
			grid-template-columns: 96px 1fr 40px;
		}
		.act {
			justify-items: start;
		}
		.moon-wrap {
			width: 78vw;
			right: -26vw;
			top: 10px;
			opacity: 0.85;
		}
		.l2 {
			padding-left: 0;
		}
		.facts {
			grid-template-columns: 1fr;
		}
		.receipt {
			padding: 22px 16px 30px;
			font-size: 10.5px;
		}
		.fact {
			flex-direction: row;
			align-items: center;
			gap: 16px;
		}
		.fact b {
			font-size: 52px;
		}
		.tile h3 {
			font-size: 34px;
		}
		.final .ctas {
			justify-content: center;
		}
	}
</style>
