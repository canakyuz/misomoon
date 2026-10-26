import { AGENTS, GEO, LANGS, pickW, rng, type DemoHit, type Weighted } from './demo'
import type { EdgeContext } from './ingest'
import { DAY, HOUR, MINUTE } from './time'
import type { TrackerPayload } from './types'

/**
 * Acme, the sample site: a made-up outdoor gear store that the demo dashboard shows. Its
 * traffic is generated one UTC day at a time from a seed, so the same day always yields the
 * same hits with the same event ids. The API tops the site up every few minutes and a hit
 * written twice is stored once.
 */
export const SAMPLE = {
	name: 'Acme',
	domain: 'acme.example',
	timezone: 'America/New_York',
	currency: 'USD',
	/** days of history written when the site is created: two 30-day periods, so the first comparison is a fair one */
	days: 62,
	/** days the site keeps; older ones are deleted by its retention */
	retention: 90,
	perDay: 600,
	/** people Live shows online at the least: quiet hours get visitors who browse a while */
	online: 3,
	seed: 11,
	goals: [
		['Purchase', 'event', 'Purchase'],
		['Add to cart', 'event', 'Add to cart'],
		['Newsletter signup', 'event', 'Newsletter signup'],
		['Viewed a product', 'page', '/shop/*'],
		['Read the journal', 'page', '/journal/*'],
	] as [name: string, kind: 'event' | 'page', match: string][],
	funnels: [
		{
			name: 'Product to purchase',
			steps: [
				{ kind: 'page', match: '/shop/*', label: 'Viewed a product' },
				{ kind: 'event', match: 'Add to cart', label: 'Added to cart' },
				{ kind: 'page', match: '/checkout', label: 'Started checkout' },
				{ kind: 'event', match: 'Purchase', label: 'Paid' },
			],
		},
		{
			name: 'Journal to shop',
			steps: [
				{ kind: 'page', match: '/journal/*', label: 'Read a story' },
				{ kind: 'page', match: '/shop*', label: 'Opened the shop' },
				{ kind: 'event', match: 'Add to cart', label: 'Added to cart' },
			],
		},
	] as { name: string; steps: { kind: 'page' | 'event'; match: string; label: string }[] }[],
}

const PRODUCTS: Record<string, { title: string; price: number }> = {
	'/shop/trail-pack': { title: 'Trail Pack 30L', price: 129 },
	'/shop/camp-stove': { title: 'Camp Stove', price: 79 },
	'/shop/down-jacket': { title: 'Down Jacket', price: 219 },
	'/shop/headlamp': { title: 'Headlamp 400', price: 39 },
	'/shop/water-filter': { title: 'Water Filter', price: 45 },
}

const TITLES: Record<string, string> = {
	'/': 'Acme: gear for the long way round',
	'/shop': 'Shop all gear',
	'/cart': 'Your cart',
	'/checkout': 'Checkout',
	'/checkout/thanks': 'Thank you for your order',
	'/journal': 'Journal',
	'/journal/packing-list': 'The only packing list you need',
	'/journal/first-overnight': 'Your first overnight hike',
	'/journal/stove-guide': 'Choosing a camp stove',
	'/about': 'About Acme',
	'/help/shipping': 'Shipping and returns',
	'/search': 'Search',
	...Object.fromEntries(Object.entries(PRODUCTS).map(([path, p]) => [path, p.title])),
}

const LANDINGS: Weighted<string> = [
	['/', 34],
	['/shop', 10],
	['/shop/trail-pack', 8],
	['/shop/down-jacket', 7],
	['/shop/camp-stove', 5],
	['/shop/headlamp', 4],
	['/shop/water-filter', 3],
	['/journal/packing-list', 9],
	['/journal/first-overnight', 6],
	['/journal/stove-guide', 4],
	['/help/shipping', 3],
	['/about', 2],
]

const REFERRERS: Weighted<{ r?: string; q?: string }> = [
	[{}, 24],
	[{ r: 'https://www.google.com/' }, 28],
	[{ r: 'https://www.instagram.com/' }, 8],
	[{ r: 'https://www.pinterest.com/' }, 5],
	[{ r: 'https://www.facebook.com/' }, 4],
	[{ r: 'https://chatgpt.com/' }, 5],
	[{ r: 'https://www.perplexity.ai/' }, 2],
	[{ r: 'https://www.reddit.com/r/ultralight/' }, 4],
	[{ r: 'https://www.youtube.com/' }, 3],
	[{ r: 'https://duckduckgo.com/' }, 2],
	[{ r: 'https://www.bing.com/' }, 2],
	[{ q: 'utm_source=newsletter&utm_medium=email&utm_campaign=fall-drop' }, 5],
	[{ r: 'https://www.google.com/', q: 'utm_source=google&utm_medium=cpc&utm_campaign=backpacks&gclid=x' }, 4],
	[{ r: 'https://www.instagram.com/', q: 'utm_source=instagram&utm_medium=social&utm_campaign=trail-stories' }, 3],
]

const FLOWS: Record<string, Weighted<string>> = {
	'/': [['/shop', 5], ['/shop/trail-pack', 2], ['/shop/down-jacket', 2], ['/journal', 2], ['/search', 1], ['/about', 1]],
	'/shop': [['/shop/trail-pack', 4], ['/shop/down-jacket', 3], ['/shop/camp-stove', 3], ['/shop/headlamp', 2], ['/shop/water-filter', 2], ['/search', 1]],
	'/cart': [['/checkout', 6], ['/shop', 2], ['/help/shipping', 1]],
	'/checkout': [['/checkout/thanks', 5], ['/cart', 1], ['/help/shipping', 1]],
	'/checkout/thanks': [['/journal', 1], ['/', 1]],
	'/journal': [['/journal/packing-list', 3], ['/journal/first-overnight', 2], ['/journal/stove-guide', 2]],
	'/journal/packing-list': [['/shop/trail-pack', 3], ['/shop/headlamp', 2], ['/shop', 2]],
	'/journal/first-overnight': [['/shop/camp-stove', 2], ['/shop/water-filter', 2], ['/journal', 1]],
	'/journal/stove-guide': [['/shop/camp-stove', 4], ['/shop', 1]],
	'/help/shipping': [['/cart', 2], ['/shop', 2]],
	'/about': [['/shop', 3], ['/journal', 1]],
	'/search': [['/shop/trail-pack', 2], ['/shop/down-jacket', 2], ['/shop/headlamp', 1], ['/shop', 1]],
}
const PRODUCT_FLOW: Weighted<string> = [['/cart', 4], ['/shop', 2], ['/shop/headlamp', 1], ['/shop/water-filter', 1], ['/help/shipping', 1]]

const SEARCHES: Weighted<string> = [
	['rain jacket', 6],
	['tent', 5],
	['backpack', 4],
	['sleeping bag', 4],
	['gift card', 2],
	['returns', 2],
]

/** A UUID drawn from `r`, so a day's events keep their ids when the day is generated again. */
function uuid(r: () => number): string {
	const hex = Array.from({ length: 32 }, () => Math.floor(r() * 16).toString(16))
	hex[12] = '4'
	hex[16] = ((parseInt(hex[16], 16) & 3) | 8).toString(16)
	const s = hex.join('')
	return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`
}

/**
 * The view key m.js would pick (`y`, a number between 0 and 1), drawn from a hit's id, so a
 * day generated again gives its page views the same event ids.
 */
function viewKey(id: string): number {
	return (parseInt(id.replace(/-/g, '').slice(0, 13), 16) + 1) / 2 ** 53
}

/** Every hit of UTC day `day` (days since the epoch), oldest first. The same day always gives the same hits. */
export function sampleDay(site: string, host: string, day: number, opts: { seed?: number; perDay?: number } = {}): DemoHit[] {
	const seed = opts.seed ?? SAMPLE.seed
	const r = rng(seed * 7919 + day)
	// page interactions and ids draw from their own streams, so changing one leaves the visits as they were
	const ri = rng(seed * 7919 + day + 0x9e37)
	const dayStart = day * DAY
	const weekday = new Date(dayStart).getUTCDay()
	// a store sells more at the weekend, and every four weeks there's a two-day sale
	const weekend = weekday === 0 || weekday === 6 ? 1.18 : 1
	const sale = day % 28 === 0 ? 2.4 : day % 28 === 1 ? 1.5 : 1
	const season = 1 + 0.22 * Math.sin((2 * Math.PI * day) / 120)
	const visits = Math.round((opts.perDay ?? SAMPLE.perDay) * weekend * sale * season * (0.88 + r() * 0.24))
	const hits: DemoHit[] = []
	// each engagement beacon and its page view, which hands it the view key once ids are drawn
	const views: [ping: DemoHit, view: DemoHit][] = []
	const seen: { edge: EdgeContext; lang: string; agent: (typeof AGENTS)[number][0] }[] = []
	for (let v = 0; v < visits; v++) {
		// Traffic follows American evenings: it peaks around 01:00 UTC with a long tail.
		const hour = (24 + Math.round(23 + (r() + r() + r() - 1.5) * 10)) % 24
		let t = dayStart + hour * HOUR + Math.floor(r() * HOUR)
		const back = seen.length > 4 && r() < 0.22 ? seen[Math.floor(r() * seen.length)] : null
		const agent = back?.agent ?? pickW(r, AGENTS)
		const ref = pickW(r, sale > 1 ? [...REFERRERS, [{ q: 'utm_source=newsletter&utm_medium=email&utm_campaign=trail-sale' }, 30]] : REFERRERS)
		const edge: EdgeContext = back?.edge ?? { ua: agent.ua, ip: `10.${Math.floor(r() * 255)}.${Math.floor(r() * 255)}.${Math.floor(r() * 255)}`, ...pickW(r, GEO) }
		const lang = back?.lang ?? pickW(r, LANGS)
		if (!back) seen.push({ edge, lang, agent })
		let path = ref.q?.includes('trail-sale') ? '/shop' : ref.r?.includes('reddit') ? '/journal/packing-list' : pickW(r, LANDINGS)
		const depth = r() < 0.38 ? 1 : 1 + Math.floor(r() * 6)
		const mobile = agent.w < 800
		let cart = 0
		for (let i = 0; i < depth && path; i++) {
			const term = path === '/search' ? pickW(ri, SEARCHES) : undefined
			const query = term ? `?q=${encodeURIComponent(term)}` : i === 0 && ref.q ? `?${ref.q}` : ''
			const base = { s: site, u: `https://${host}${path}${query}`, t: TITLES[path] ?? path, w: agent.w, h: agent.h, vw: agent.vw, l: lang }
			const hit = (ts: number, payload: Omit<TrackerPayload, keyof typeof base | 'ts'>) => {
				const h = { ts, edge, payload: { ...base, ...payload, ts } }
				hits.push(h)
				return h
			}
			const view = hit(t, { n: 'pageview', r: i === 0 ? ref.r : `https://${host}/`, ...(term ? { q: term } : {}) })
			const engaged = Math.round((depth === 1 ? 5000 + r() * 45000 : 9000 + r() * 70000) * (path.startsWith('/journal/') ? 2.4 : 1))
			const product = PRODUCTS[path]
			let next: string | undefined
			if (product) {
				if (r() < 0.24) {
					cart += product.price
					hit(t + engaged / 2, { n: 'Add to cart', p: { product: product.title, price: product.price } })
					next = '/cart'
				} else next = pickW(r, PRODUCT_FLOW.filter(([p]) => p !== '/cart'))
			} else if (path === '/cart') {
				if (!cart) cart = PRODUCTS[pickW(r, LANDINGS.filter(([p]) => p in PRODUCTS))].price
			} else if (path === '/checkout') {
				hit(t + 2000, { n: 'Begin checkout', p: { items: 1 + Math.floor(r() * 2.2) } })
			} else if (path === '/checkout/thanks') {
				const amount = cart || 79
				hit(t + 1500, { n: 'Purchase', $: { a: amount, c: 'USD' }, p: { shipping: pickW(r, [['standard', 7], ['express', 2], ['pickup', 1]]) } })
			} else if (path.startsWith('/journal/') && r() < 0.06) {
				hit(t + engaged * 0.8, { n: 'Newsletter signup', p: { form: 'journal-footer' } })
			}
			const slow = mobile ? 1.7 : 1
			const ping = hit(t + engaged, {
				n: 'engagement',
				e: engaged,
				d: Math.min(100, Math.round((path.startsWith('/journal/') ? 40 : 18) + r() * 80)),
				v: {
					lcp: Math.round((1100 + r() * 1900 + (product && r() < 0.14 ? 2600 : 0)) * slow),
					inp: Math.round((50 + r() * 170 + (path === '/checkout' && r() < 0.2 ? 380 : 0)) * slow),
					cls: Math.round((r() * 0.07 + (path === '/shop' && r() < 0.12 ? 0.22 : 0)) * 1000) / 1000,
					fcp: Math.round((600 + r() * 1200) * slow),
					ttfb: Math.round((70 + r() * 320) * slow),
				},
				...interactions(ri, host, path, !!next && next === '/cart'),
			})
			views.push([ping, view])
			t += engaged + Math.floor(r() * 4000)
			path = next ?? (FLOWS[path] ? pickW(r, FLOWS[path]) : PRODUCTS[path] ? pickW(r, PRODUCT_FLOW) : '/shop')
		}
	}
	hits.sort((a, b) => a.ts - b.ts)
	const ids = rng(seed * 7919 + day + 0x51ed)
	for (const h of hits) h.payload.id = uuid(ids)
	// like m.js, a page view and its engagement beacons carry one view key
	for (const [ping, view] of views) ping.payload.y = view.payload.y = viewKey(view.payload.id!)
	return [...hits, ...keepAlive(site, host, day, hits, seed)].sort((a, b) => a.ts - b.ts)
}

/** Where a visitor who only browses goes next: never into the cart, so no funnel step goes without its event. */
const BROWSE = new Set(['/cart', '/checkout', '/checkout/thanks'])

/**
 * Visitors who browse for a while in the quiet hours, so every minute of the day has at
 * least SAMPLE.online people active in the four before it, which Live counts as online.
 * They draw from streams of their own after the day's ids, so the day's other hits keep
 * theirs. Each page holds them 50 to 170 seconds, so they stay online while they browse.
 */
function keepAlive(site: string, host: string, day: number, hits: DemoHit[], seed: number): DemoHit[] {
	const r = rng(seed * 7919 + day + 0x0a11)
	const ids = rng(seed * 7919 + day + 0x5a1e)
	const dayStart = day * DAY
	// who was active in each minute, from the four before midnight, which the first minutes count
	const active: Set<string>[] = Array.from({ length: DAY / MINUTE + 4 }, () => new Set())
	const mark = (h: DemoHit) => {
		const m = Math.floor((h.ts - dayStart) / MINUTE) + 4
		if (m >= 0 && m < active.length) active[m].add(h.edge.ip + h.edge.ua)
	}
	for (const h of hits) mark(h)
	// online at the start of minute m: active in minutes m-4 to m-1
	const online = (m: number) => {
		const people = new Set<string>()
		for (let k = m; k < m + 4; k++) for (const p of active[k]) people.add(p)
		return people.size
	}
	const out: DemoHit[] = []
	for (let m = 0; m < DAY / MINUTE; m++) {
		while (online(m) < SAMPLE.online) {
			const agent = pickW(r, AGENTS)
			const edge: EdgeContext = { ua: agent.ua, ip: `10.${Math.floor(r() * 255)}.${Math.floor(r() * 255)}.${Math.floor(r() * 255)}`, ...pickW(r, GEO) }
			const lang = pickW(r, LANGS)
			const ref = pickW(r, REFERRERS.filter(([x]) => !x.q?.includes('trail-sale')))
			// a third read one journal post and leave, the rest look around the shop
			const reader = r() < 0.35
			let path = reader ? pickW(r, LANDINGS.filter(([p]) => p.startsWith('/journal/'))) : pickW(r, LANDINGS)
			let t = dayStart + (m - 1) * MINUTE + Math.floor(r() * 30_000)
			const visit: DemoHit[] = []
			for (let i = 0, pages = reader ? 1 : 4 + Math.floor(r() * 6); i < pages; i++) {
				const base = { s: site, u: `https://${host}${path}${i === 0 && ref.q ? `?${ref.q}` : ''}`, t: TITLES[path] ?? path, w: agent.w, h: agent.h, vw: agent.vw, l: lang }
				const engaged = 50_000 + Math.floor(r() * 120_000)
				const slow = agent.w < 800 ? 1.7 : 1
				const view: DemoHit = { ts: t, edge, payload: { ...base, ts: t, n: 'pageview', r: i === 0 ? ref.r : `https://${host}/` } }
				const v = {
					lcp: Math.round((1100 + r() * 1900) * slow),
					inp: Math.round((50 + r() * 170) * slow),
					cls: Math.round(r() * 0.07 * 1000) / 1000,
					fcp: Math.round((600 + r() * 1200) * slow),
					ttfb: Math.round((70 + r() * 320) * slow),
				}
				const d = Math.min(100, Math.round((path.startsWith('/journal/') ? 40 : 18) + r() * 80))
				const ping: DemoHit = { ts: t + engaged, edge, payload: { ...base, ts: t + engaged, n: 'engagement', e: engaged, d, v } }
				visit.push(view, ping)
				t += engaged + 1000 + Math.floor(r() * 3000)
				const next = FLOWS[path] ? pickW(r, FLOWS[path]) : PRODUCTS[path] ? pickW(r, PRODUCT_FLOW) : '/shop'
				path = BROWSE.has(next) ? '/shop' : next
			}
			for (let i = 0; i < visit.length; i += 2) {
				visit[i].payload.id = uuid(ids)
				visit[i + 1].payload.id = uuid(ids)
				visit[i].payload.y = visit[i + 1].payload.y = viewKey(visit[i].payload.id!)
			}
			for (const h of visit) mark(h)
			out.push(...visit)
		}
	}
	return out
}

/** The sample site's hits with `from <= ts < to`, oldest first. */
export function sampleTraffic(site: string, host: string, from: number, to: number, opts: { seed?: number; perDay?: number } = {}): DemoHit[] {
	const out: DemoHit[] = []
	// a visit late in a day carries on past midnight, so the day before can hold hits in the window,
	// and the visits that keep a day's first minute alive start in the minute before it
	for (let day = Math.floor(from / DAY) - 1; day * DAY - MINUTE < to; day++) for (const h of sampleDay(site, host, day, opts)) if (h.ts >= from && h.ts < to) out.push(h)
	return out.sort((a, b) => a.ts - b.ts)
}

/** What one page view did on the page, as the engagement beacon carries it. */
function interactions(r: () => number, host: string, path: string, added: boolean): Partial<TrackerPayload> {
	const out: Partial<TrackerPayload> = {}
	const click = (selector: string, label: string, p: number, rage = 0, dead = 0): unknown[] | null =>
		r() < p ? [selector, label, 1 + Math.floor(r() * 1.6), r() < rage ? 1 : 0, r() < dead ? 1 : 0] : null
	const keep = <T,>(xs: (T | null)[]) => xs.filter((x): x is T => x != null)
	if (path === '/') {
		const cta = click('[data-misomoon-id="hero-shop"]', 'Shop the fall drop', 0.3)
		out.c = keep([cta, click('body>header>nav>a:nth-of-type(1)', 'Shop', 0.2), click('body>header>nav>a:nth-of-type(2)', 'Journal', 0.1), click('body>main>section:nth-of-type(2)>img', 'Lookbook photo', 0.08, 0, 0.85)])
		out.o = keep([r() < 0.92 ? ['Banner: fall drop', 1, cta ? 1 : 0] : null, r() < 0.5 ? ['Best sellers row', 1, r() < 0.2 ? 1 : 0] : null])
	} else if (PRODUCTS[path]) {
		out.c = keep([
			added ? ['#add-to-cart', 'Add to cart', 1, 0, 0] : click('#add-to-cart', 'Add to cart', 0.05),
			click('#size-picker>button', 'Size', 0.4, 0.15),
			click('.gallery>img:nth-of-type(1)', 'Product photo', 0.3, 0, 0.7),
			click('#reviews>summary', 'Reviews', 0.12),
		])
		if (path === '/shop/down-jacket' && r() < 0.3) {
			const far = r()
			out.m = [['Down Jacket in the rain', 'video', 1, far > 0.15 ? 1 : 0, far > 0.4 ? 1 : 0, far > 0.6 ? 1 : 0, far > 0.78 ? 1 : 0]]
		}
		out.o = keep([r() < 0.6 ? ['You might also like', 1, r() < 0.12 ? 1 : 0] : null])
	} else if (path === '/shop') {
		out.c = keep([
			click('.product-grid>a', 'Product card', 0.55),
			click('#filters>button', 'Filter', 0.18),
			click('#sort', 'Sort by', 0.1, 0.1),
			click('.product-grid>a>img', 'Product photo', 0.06, 0, 0.9),
		])
	} else if (path === '/cart') {
		out.c = keep([click('#checkout', 'Checkout', 0.7), click('#promo>button', 'Apply code', 0.12, 0.3), click('.line-item>button', 'Remove', 0.08)])
	} else if (path === '/checkout' && r() < 0.9) {
		const fields = ['email', 'address', 'postal_code', 'card']
		const reached = 1 + Math.floor(r() * 4.6)
		const sent = reached > 4 || (reached === 4 && r() < 0.75)
		const last = Math.min(reached, 4) - 1
		out.f = [['checkout', 1, sent ? 1 : 0]]
		out.g = fields.slice(0, last + 1).map((f, i) => ['checkout', f, i, 1, !sent && i === last ? 1 : 0])
		if (r() < 0.04) out.x = [["TypeError: Cannot read properties of undefined (reading 'postalCode')", `https://${host}/assets/checkout.js:1:8812`, 1]]
	} else if (path.startsWith('/journal/')) {
		out.o = keep([r() < 0.7 ? ['Shop the story', 1, r() < 0.18 ? 1 : 0] : null])
		if (r() < 0.08) {
			const sent = r() < 0.7
			out.f = [['newsletter', 1, sent ? 1 : 0]]
			out.g = [['newsletter', 'email', 0, 1, sent ? 0 : 1]]
		}
	}
	if (r() < 0.01) out.x = [...(out.x ?? []), ['Script error.', '', 1]]
	for (const k of ['c', 'o', 'f'] as const) if (!out[k]?.length) delete out[k]
	return out
}
