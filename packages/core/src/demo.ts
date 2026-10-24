import type { EdgeContext } from './ingest'
import { DAY, HOUR, MINUTE } from './time'
import type { TrackerPayload } from './types'

/** mulberry32: small seeded PRNG so demo data is identical on every run. */
export function rng(seed: number) {
	let a = seed >>> 0
	return () => {
		a = (a + 0x6d2b79f5) >>> 0
		let t = a
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

export type Weighted<T> = [T, number][]

export function pickW<T>(r: () => number, items: Weighted<T>): T {
	const total = items.reduce((s, [, w]) => s + w, 0)
	let x = r() * total
	for (const [v, w] of items) if ((x -= w) <= 0) return v
	return items[items.length - 1][0]
}

const PAGES: Weighted<{ path: string; title: string }> = [
	[{ path: '/', title: 'misomoon — calm analytics' }, 40],
	[{ path: '/pricing', title: 'Pricing' }, 14],
	[{ path: '/docs', title: 'Docs' }, 10],
	[{ path: '/docs/install', title: 'Install the script' }, 8],
	[{ path: '/docs/api', title: 'Stats API' }, 5],
	[{ path: '/docs/mcp', title: 'MCP server' }, 4],
	[{ path: '/blog', title: 'Journal' }, 6],
	[{ path: '/blog/sharding-d1', title: 'Sharding D1 by site and day' }, 7],
	[{ path: '/blog/cookieless', title: 'Counting people without cookies' }, 5],
	[{ path: '/blog/ai-referrals', title: 'AI assistants are a channel now' }, 4],
	[{ path: '/changelog', title: 'Changelog' }, 3],
	[{ path: '/signup', title: 'Create your account' }, 5],
	[{ path: '/login', title: 'Sign in' }, 4],
]

const REFERRERS: Weighted<{ r?: string; q?: string }> = [
	[{}, 30],
	[{ r: 'https://www.google.com/' }, 26],
	[{ r: 'https://chatgpt.com/' }, 7],
	[{ r: 'https://www.perplexity.ai/' }, 3],
	[{ r: 'https://claude.ai/' }, 2],
	[{ r: 'https://news.ycombinator.com/' }, 6],
	[{ r: 'https://t.co/abc' }, 5],
	[{ r: 'https://www.reddit.com/r/webdev/' }, 4],
	[{ r: 'https://www.linkedin.com/feed/' }, 3],
	[{ r: 'https://duckduckgo.com/' }, 3],
	[{ r: 'https://www.bing.com/' }, 2],
	[{ r: 'https://github.com/misomoon/misomoon' }, 4],
	[{ r: 'https://www.youtube.com/' }, 1],
	[{ r: 'https://dev.to/some-post' }, 2],
	[{ q: 'utm_source=newsletter&utm_medium=email&utm_campaign=october-moon' }, 4],
	[{ r: 'https://www.google.com/', q: 'utm_source=google&utm_medium=cpc&utm_campaign=brand&gclid=x' }, 3],
	[{ q: 'utm_source=producthunt&utm_medium=social&utm_campaign=launch' }, 2],
]

export const GEO: Weighted<Omit<EdgeContext, 'ua' | 'ip'>> = [
	[{ country: 'US', region: 'California', city: 'San Francisco', continent: 'NA', timezone: 'America/Los_Angeles', asOrganization: 'Comcast' }, 14],
	[{ country: 'US', region: 'New York', city: 'New York', continent: 'NA', timezone: 'America/New_York', asOrganization: 'Verizon' }, 10],
	[{ country: 'ID', region: 'Jakarta', city: 'Jakarta', continent: 'AS', timezone: 'Asia/Jakarta', asOrganization: 'Telkom Indonesia' }, 12],
	[{ country: 'ID', region: 'Bali', city: 'Denpasar', continent: 'AS', timezone: 'Asia/Makassar', asOrganization: 'Biznet' }, 4],
	[{ country: 'GB', region: 'England', city: 'London', continent: 'EU', timezone: 'Europe/London', asOrganization: 'BT' }, 8],
	[{ country: 'DE', region: 'Berlin', city: 'Berlin', continent: 'EU', timezone: 'Europe/Berlin', asOrganization: 'Deutsche Telekom' }, 7],
	[{ country: 'FR', region: 'Île-de-France', city: 'Paris', continent: 'EU', timezone: 'Europe/Paris', asOrganization: 'Orange' }, 4],
	[{ country: 'NL', region: 'North Holland', city: 'Amsterdam', continent: 'EU', timezone: 'Europe/Amsterdam', asOrganization: 'KPN' }, 3],
	[{ country: 'JP', region: 'Tokyo', city: 'Tokyo', continent: 'AS', timezone: 'Asia/Tokyo', asOrganization: 'NTT' }, 6],
	[{ country: 'SG', region: 'Singapore', city: 'Singapore', continent: 'AS', timezone: 'Asia/Singapore', asOrganization: 'Singtel' }, 4],
	[{ country: 'IN', region: 'Karnataka', city: 'Bengaluru', continent: 'AS', timezone: 'Asia/Kolkata', asOrganization: 'Airtel' }, 6],
	[{ country: 'BR', region: 'São Paulo', city: 'São Paulo', continent: 'SA', timezone: 'America/Sao_Paulo', asOrganization: 'Vivo' }, 4],
	[{ country: 'CA', region: 'Ontario', city: 'Toronto', continent: 'NA', timezone: 'America/Toronto', asOrganization: 'Rogers' }, 4],
	[{ country: 'AU', region: 'New South Wales', city: 'Sydney', continent: 'OC', timezone: 'Australia/Sydney', asOrganization: 'Telstra' }, 3],
	[{ country: 'KR', region: 'Seoul', city: 'Seoul', continent: 'AS', timezone: 'Asia/Seoul', asOrganization: 'KT' }, 2],
]

export const AGENTS: Weighted<{ ua: string; w: number; h: number; vw: number }> = [
	[{ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36', w: 1512, h: 982, vw: 1512 }, 26],
	[{ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15', w: 1728, h: 1117, vw: 1600 }, 12],
	[{ ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36', w: 1920, h: 1080, vw: 1903 }, 18],
	[{ ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0', w: 1920, h: 1080, vw: 1903 }, 6],
	[{ ua: 'Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0', w: 2560, h: 1440, vw: 2544 }, 5],
	[{ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1', w: 393, h: 852, vw: 393 }, 20],
	[{ ua: 'Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36', w: 412, h: 915, vw: 412 }, 10],
	[{ ua: 'Mozilla/5.0 (Linux; Android 15; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36', w: 384, h: 832, vw: 384 }, 4],
	[{ ua: 'Mozilla/5.0 (iPad; CPU OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1', w: 1024, h: 1366, vw: 1024 }, 4],
]

export const LANGS: Weighted<string> = [['en-US', 40], ['en-GB', 8], ['id-ID', 14], ['de-DE', 7], ['ja-JP', 6], ['fr-FR', 4], ['pt-BR', 4], ['ko-KR', 2]]

export interface DemoHit {
	payload: TrackerPayload
	edge: EdgeContext
	ts: number
}

/**
 * A realistic month of traffic for `site`: weekly and daily rhythms, a launch spike,
 * multi-page visits, engagement pings with web vitals, and a signup funnel.
 */
export function demoTraffic(site: string, host: string, opts: { days?: number; now?: number; seed?: number; perDay?: number } = {}): DemoHit[] {
	const r = rng(opts.seed ?? 7)
	// page interactions draw from their own stream, so the rest of the traffic stays as it was
	const ri = rng((opts.seed ?? 7) + 1)
	const days = opts.days ?? 35
	const now = opts.now ?? Date.now()
	const perDay = opts.perDay ?? 140
	const hits: DemoHit[] = []
	for (let d = days - 1; d >= 0; d--) {
		const dayStart = Math.floor((now - d * DAY) / DAY) * DAY
		const weekday = new Date(dayStart).getUTCDay()
		const weekend = weekday === 0 || weekday === 6 ? 0.62 : 1
		const growth = 0.7 + 0.3 * ((days - d) / days)
		const launch = d === 9 ? 3.2 : d === 8 ? 1.8 : 1
		const visits = Math.round(perDay * weekend * growth * launch * (0.85 + r() * 0.3))
		// About a quarter of visits are people coming back later the same day.
		const seen: { edge: EdgeContext; lang: string; agent: (typeof AGENTS)[number][0] }[] = []
		for (let v = 0; v < visits; v++) {
			// Traffic peaks in the afternoon UTC with a long tail overnight.
			const hour = Math.min(23, Math.max(0, Math.round(14 + (r() + r() + r() - 1.5) * 9)))
			let t = dayStart + hour * HOUR + Math.floor(r() * HOUR)
			if (t > now) continue
			const back = seen.length > 4 && r() < 0.25 ? seen[Math.floor(r() * seen.length)] : null
			const agent = back?.agent ?? pickW(r, AGENTS)
			const ref = pickW(r, launch > 1 ? [...REFERRERS, [{ r: 'https://news.ycombinator.com/item?id=1' }, 40]] : REFERRERS)
			const edge: EdgeContext = back?.edge ?? { ua: agent.ua, ip: `10.${Math.floor(r() * 255)}.${Math.floor(r() * 255)}.${Math.floor(r() * 255)}`, ...pickW(r, GEO) }
			const lang = back?.lang ?? pickW(r, LANGS)
			if (!back) seen.push({ edge, lang, agent })
			let page = ref.r?.includes('ycombinator') ? { path: '/blog/sharding-d1', title: 'Sharding D1 by site and day' } : pickW(r, PAGES)
			const depth = r() < 0.42 ? 1 : 1 + Math.floor(r() * 5)
			const mobile = agent.w < 800
			for (let i = 0; i < depth && t <= now; i++) {
				const query = i === 0 && ref.q ? `?${ref.q}` : ''
				const base = { s: site, u: `https://${host}${page.path}${query}`, t: page.title, w: agent.w, h: agent.h, vw: agent.vw, l: lang }
				const q = page.path.startsWith('/docs') && ri() < 0.12 ? pickW(ri, SEARCHES) : undefined
				// the view key m.js picks for each page view, sent again on its engagement beacon
				const y = `demo-${opts.seed ?? 7}-${t}-${v}-${i}`
				hits.push({ ts: t, edge, payload: { ...base, n: 'pageview', r: i === 0 ? ref.r : `https://${host}/`, ts: t, y, ...(q ? { q } : {}) } })
				const engaged = Math.round((depth === 1 ? 4000 + r() * 40000 : 12000 + r() * 90000) * (page.path.startsWith('/blog/') ? 2.2 : 1))
				if (page.path === '/signup' && r() < 0.45) {
					hits.push({ ts: t + engaged / 2, edge, payload: { ...base, n: 'Signup', p: { plan: pickW(r, [['free', 6], ['pro', 3], ['team', 1]]) }, ts: t + engaged / 2 } })
				}
				if (page.path === '/pricing' && r() < 0.08) {
					const amount = pickW(r, [[19, 6], [49, 3], [199, 1]])
					hits.push({ ts: t + engaged / 2, edge, payload: { ...base, n: 'Purchase', $: { a: amount, c: 'USD' }, p: { plan: amount === 19 ? 'pro' : amount === 49 ? 'team' : 'scale' }, ts: t + engaged / 2 } })
				}
				if (page.path.startsWith('/docs') && r() < 0.15) {
					hits.push({ ts: t + 3000, edge, payload: { ...base, n: 'Outbound link', p: { url: 'https://github.com/misomoon/misomoon' }, ts: t + 3000 } })
				}
				if (page.path.startsWith('/docs/install') && r() < 0.3) {
					hits.push({ ts: t + 5000, edge, payload: { ...base, n: 'Copy Snippet', p: { snippet: pickW(r, [['script', 5], ['npm', 2]]) }, ts: t + 5000 } })
				}
				const slow = mobile ? 1.6 : 1
				hits.push({
					ts: t + engaged,
					edge,
					payload: {
						...base,
						n: 'engagement',
						y,
						e: engaged,
						d: Math.min(100, Math.round(20 + r() * 85)),
						v: {
							lcp: Math.round((900 + r() * 1800 + (r() < 0.1 ? 2500 : 0)) * slow),
							inp: Math.round((40 + r() * 160 + (r() < 0.08 ? 350 : 0)) * slow),
							cls: Math.round((r() * 0.08 + (r() < 0.07 ? 0.2 : 0)) * 1000) / 1000,
							fcp: Math.round((500 + r() * 1100) * slow),
							ttfb: Math.round((60 + r() * 300) * slow),
						},
						ts: t + engaged,
						...interactions(ri, host, page.path),
					},
				})
				t += engaged + Math.floor(r() * 4000)
				page = nextPage(r, page.path)
			}
		}
	}
	return hits.sort((a, b) => a.ts - b.ts)
}

const SEARCHES: Weighted<string> = [
	['proxy', 6],
	['mcp', 4],
	['revenue', 3],
	['import google analytics', 3],
	['custom events', 2],
	['self host', 2],
	['gdpr', 1],
]

/** What one page view did on the page, as the engagement beacon carries it. */
function interactions(r: () => number, host: string, path: string): Partial<TrackerPayload> {
	const out: Partial<TrackerPayload> = {}
	const click = (selector: string, label: string, p: number, rage = 0, dead = 0): unknown[] | null =>
		r() < p ? [selector, label, 1 + Math.floor(r() * 1.6), r() < rage ? 1 : 0, r() < dead ? 1 : 0] : null
	const keep = <T,>(xs: (T | null)[]) => xs.filter((x): x is T => x != null)
	if (path === '/') {
		const hero = r() < 0.9
		const cta = click('[data-misomoon-id="hero-cta"]', 'Start free', 0.22)
		out.c = keep([cta, click('body>header>nav>a:nth-of-type(2)', 'Pricing', 0.18), click('body>header>nav>a:nth-of-type(3)', 'Docs', 0.12), click('body>main>section:nth-of-type(2)>figure>img', 'Dashboard screenshot', 0.06, 0, 0.8)])
		out.o = keep([hero ? ['Hero: calm analytics', 1, cta ? 1 : 0] : null, r() < 0.45 ? ['Pricing teaser', 1, r() < 0.15 ? 1 : 0] : null])
		if (r() < 0.14) {
			const far = r()
			out.m = [['Product tour', 'video', 1, far > 0.2 ? 1 : 0, far > 0.45 ? 1 : 0, far > 0.65 ? 1 : 0, far > 0.8 ? 1 : 0]]
		}
	} else if (path === '/pricing') {
		out.c = keep([
			click('#plans>div:nth-of-type(2)>button', 'Choose Pro', 0.2),
			click('#plans>div:nth-of-type(1)>button', 'Start free', 0.14),
			click('#billing-toggle', 'Yearly', 0.25, 0.12),
			click('body>main>section:nth-of-type(3)>details>summary', 'Do you use cookies?', 0.1),
			click('#plans>div:nth-of-type(3)>p', 'Scale: talk to us', 0.06, 0, 0.9),
		])
	} else if (path === '/signup' && r() < 0.8) {
		const fields = ['email', 'password', 'team']
		const reached = 1 + Math.floor(r() * 3.4)
		const sent = reached > 3 || (reached === 3 && r() < 0.7)
		const last = Math.min(reached, 3) - 1
		out.f = [['signup', 1, sent ? 1 : 0]]
		out.g = fields.slice(0, last + 1).map((f, i) => ['signup', f, i, 1, !sent && i === last ? 1 : 0])
	} else if (path === '/docs/install') {
		out.c = keep([click('body>main>pre:nth-of-type(1)>button', 'Copy', 0.35), click('body>main>pre:nth-of-type(2)>button', 'Copy', 0.15)])
	} else if (path === '/docs/api' && r() < 0.05) {
		out.x = [["TypeError: Cannot read properties of null (reading 'focus')", `https://${host}/assets/docs.js:1:2412`, 1]]
	}
	if (r() < 0.012) out.x = [...(out.x ?? []), ['Script error.', '', 1]]
	for (const k of ['c', 'o'] as const) if (!out[k]?.length) delete out[k]
	return out
}

function nextPage(r: () => number, from: string) {
	const flows: Record<string, Weighted<string>> = {
		'/': [['/pricing', 5], ['/docs', 3], ['/blog', 2], ['/signup', 2]],
		'/pricing': [['/signup', 5], ['/docs', 2], ['/', 1]],
		'/docs': [['/docs/install', 5], ['/docs/api', 2], ['/docs/mcp', 2]],
		'/docs/install': [['/signup', 3], ['/docs/api', 2], ['/pricing', 1]],
		'/blog': [['/blog/sharding-d1', 3], ['/blog/cookieless', 2], ['/blog/ai-referrals', 2]],
		'/signup': [['/docs/install', 4], ['/', 1]],
	}
	const path = pickW(r, flows[from] ?? [['/', 2], ['/pricing', 2], ['/docs', 1]])
	return PAGES.find(([p]) => p.path === path)?.[0] ?? { path, title: path }
}

