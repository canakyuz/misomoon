import { readdirSync, readFileSync } from 'node:fs'
import { Window } from 'happy-dom'
import { afterEach, describe, expect, it } from 'vite-plus/test'

const code = readFileSync(new URL('../src/m.js', import.meta.url), 'utf8')
// m.js?s=… as the Worker serves it to a site that ticked every feature (core BROWSER_PARTS order)
const ORDER = ['vitals', 'clicks', 'errors', 'items', 'fields', 'media', 'content', 'events', 'downloads', 'outbound', 'forms', 'payments']
const parts = readdirSync(new URL('../src/x/', import.meta.url))
	.map((f) => f.replace(/\.js$/, ''))
	.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))
	.map((name) => readFileSync(new URL(`../src/x/${name}.js`, import.meta.url), 'utf8'))

let open: Window[] = []
afterEach(async () => {
	await Promise.all(open.map((w) => w.happyDOM.close()))
	open = []
})

/** Runs m.js in a real DOM with `html` as the body. Timers wait until `tick()`. */
function load(html: string, href = 'https://shop.com/pricing', attrs: Record<string, string> = {}) {
	const win = new Window({ url: href })
	open.push(win)
	const document = win.document
	document.body.innerHTML = html
	const script = document.createElement('script')
	for (const [k, v] of Object.entries({ src: 'https://shop.com/m.js?s=shop', ...attrs })) script.setAttribute(k, v)
	document.head.appendChild(script)
	Object.defineProperty(document, 'currentScript', { value: script })
	const sent: Record<string, any>[] = []
	Object.defineProperty(win.navigator, 'sendBeacon', { value: (_url: string, body: string) => sent.push(JSON.parse(body)) > 0 })
	// happy-dom says it is automated, which m.js would skip
	Object.defineProperty(win.navigator, 'webdriver', { value: false })
	// a click on a link would navigate away; the tracker sees it first, in the capture phase
	document.addEventListener('click', (e) => e.preventDefault())
	document.addEventListener('submit', (e) => e.preventDefault())
	let timers: (() => void)[] = []
	const setTimeout = (fn: () => void) => timers.push(fn)
	const run = (src: string) =>
		new Function('window', 'document', 'location', 'MutationObserver', 'IntersectionObserver', 'setTimeout', src)(win, document, win.location, win.MutationObserver, win.IntersectionObserver, setTimeout)
	run(code)
	for (const part of parts) run(part)
	const $ = (sel: string) => document.querySelector(sel) as unknown as HTMLElement
	return {
		win,
		$,
		sent,
		click(sel: string, at = { clientX: 10, clientY: 10 }) {
			$(sel).dispatchEvent(new win.MouseEvent('click', { bubbles: true, ...at }) as unknown as Event)
		},
		/** a middle (1) or right (2) click, which fires auxclick instead of click */
		aux(sel: string, button: number) {
			$(sel).dispatchEvent(new win.MouseEvent('auxclick', { bubbles: true, button }) as unknown as Event)
		},
		/** runs the timers set so far, after letting mutation observers report */
		async tick() {
			await new Promise((r) => win.setTimeout(r, 0))
			const run = timers
			timers = []
			run.forEach((fn) => fn())
		},
		flush() {
			document.dispatchEvent(new win.Event('visibilitychange') as unknown as Event)
			return sent.filter((s) => s.e != null).at(-1)!
		},
		/** custom events by name, with their props */
		events: () => sent.filter((s) => s.n).map((s) => [s.n, s.p]),
		submit(sel: string) {
			$(sel).dispatchEvent(new win.Event('submit', { bubbles: true }) as unknown as Event)
		},
		misomoon: (win as unknown as { misomoon: { ref: () => string } }).misomoon,
	}
}

describe('m.js page interactions', () => {
	it('counts clicks per element, with a selector and the visible label', () => {
		const t = load('<main><a href="/a">One</a><a href="/b"> Start <b>trial</b> </a></main><div id="plans"><button aria-label="Yearly plan">Y</button></div>')
		t.click('main a:nth-of-type(2) b')
		t.click('#plans button')
		t.click('#plans button')
		expect(t.flush().c).toEqual([
			['body>main>a:nth-of-type(2)', 'Start trial', 1, 0, 0],
			['#plans>button', 'Yearly plan', 2, 0, 0],
		])
	})

	it('takes the text of links and buttons only; other elements give only what the site wrote for them', () => {
		const t = load('<p id="who">Signed in as Jane Doe</p><img id="pic" alt="Team photo" src="/t.png"><div id="card" title="Plan card">Jane Doe, 12 Main St</div>')
		for (const id of ['#who', '#pic', '#card']) t.click(id)
		expect(t.flush().c.map((c: unknown[]) => c[1])).toEqual(['', 'Team photo', 'Plan card'])
	})

	it('sends only what changed since the last beacon', () => {
		const t = load('<button id="go">Go</button>')
		t.click('#go')
		expect(t.flush().c).toEqual([['#go', 'Go', 1, 0, 0]])
		const away = { clientX: 300, clientY: 300 }
		t.click('#go', away)
		t.click('#go', away)
		expect(t.flush().c).toEqual([['#go', 'Go', 2, 0, 0]])
	})

	it('marks the third quick click in one spot as a rage click', () => {
		const t = load('<button id="go">Go</button>')
		for (let i = 0; i < 3; i++) t.click('#go')
		// far away: a new run of clicks
		t.click('#go', { clientX: 300, clientY: 300 })
		expect(t.flush().c).toEqual([['#go', 'Go', 4, 1, 0]])
	})

	it('counts a dead click when nothing on the page changes for a second', async () => {
		const t = load('<button id="dead">Nothing</button><button id="live">Opens</button><p id="out"></p>')
		t.$('#live').addEventListener('click', () => (t.$('#out').textContent = 'opened'))
		t.click('#dead')
		await t.tick()
		t.click('#live')
		await t.tick()
		expect(t.flush().c).toEqual([
			['#dead', 'Nothing', 1, 0, 1],
			['#live', 'Opens', 1, 0, 0],
		])
	})

	it('needs three clicks on the same element for a rage click', () => {
		const t = load('<button id="a">A</button><button id="b">B</button>')
		t.click('#a')
		t.click('#b')
		t.click('#a')
		expect(t.flush().c.map((c: unknown[]) => c[3])).toEqual([0, 0])
	})

	it("never sends a field's value, and skips generated ids", () => {
		const t = load('<form><input id="r123" name="email" value="me@example.com"><input type="submit" value="Join"></form><div data-misomoon-mask><a href="/me" id="acct">Jane Doe</a></div>')
		t.click('input[name=email]')
		t.click('input[type=submit]')
		t.click('#acct')
		expect(t.flush().c).toEqual([
			['body>form>input', 'email', 1, 0, 0],
			['body>form>input:nth-of-type(2)', 'Join', 1, 0, 0],
			['#acct', '', 1, 0, 0],
		])
	})

	it('finds the form field where a visit gave up, and takes it back once the visit moves on', () => {
		const t = load('<form id="signup"><input name="name"><input name="email"><button>Go</button></form>')
		const focus = (sel: string) => t.$(sel).dispatchEvent(new t.win.FocusEvent('focusin', { bubbles: true }) as unknown as Event)
		focus('[name=name]')
		const first = t.flush()
		expect([first.f, first.g]).toEqual([[['signup', 1, 0]], [['signup', 'name', 0, 1, 1]]])
		focus('[name=email]')
		expect(t.flush().g).toEqual([
			['signup', 'name', 0, 0, -1],
			['signup', 'email', 1, 1, 1],
		])
		t.$('form').dispatchEvent(new t.win.Event('submit', { bubbles: true, cancelable: true }) as unknown as Event)
		const sent = t.flush()
		expect([sent.f, sent.g]).toEqual([[['signup', 0, 1]], [['signup', 'email', 1, 0, -1]]])
	})

	it('records media plays and how far they got, once per mark', () => {
		const t = load('<video data-misomoon-media="Tour" controls></video><video muted autoplay></video>')
		const [tour, loop] = [...t.win.document.querySelectorAll('video')]
		const at = (v: typeof tour, time: number, type: string) => {
			Object.defineProperty(v, 'duration', { value: 100, configurable: true })
			Object.defineProperty(v, 'currentTime', { value: time, configurable: true })
			Object.defineProperty(v, 'paused', { value: false, configurable: true })
			v.dispatchEvent(new t.win.Event(type))
		}
		at(tour, 0, 'play')
		at(tour, 30, 'timeupdate')
		at(tour, 55, 'timeupdate')
		// a muted background loop without controls is decoration
		at(loop, 0, 'play')
		expect(t.flush().m).toEqual([['Tour', 'video', 1, 1, 1, 0, 0]])
		at(tour, 100, 'ended')
		expect(t.flush().m).toEqual([['Tour', 'video', 0, 0, 0, 1, 1]])
	})

	it('counts a click on tagged content as seen and clicked', () => {
		const t = load('<section data-misomoon-content="Hero banner"><a href="/start">Start</a></section>')
		t.click('section a')
		expect(t.flush().o).toEqual([['Hero banner', 1, 1]])
	})

	it('reports script errors without repeating them', () => {
		const t = load('')
		const fire = () => t.win.dispatchEvent(new t.win.ErrorEvent('error', { message: 'TypeError: x is undefined', filename: 'https://shop.com/app.js?v=2', lineno: 3, colno: 7 }) as unknown as Event)
		fire()
		fire()
		// a cross-origin script without crossorigin says nothing more than this
		t.win.dispatchEvent(new t.win.ErrorEvent('error', { message: 'Script error.' }) as unknown as Event)
		expect(t.flush().x).toEqual([['TypeError: x is undefined', 'https://shop.com/app.js?v=2:3:7', 2]])
	})

	it("reports an error named like a built-in property without touching the page's objects", () => {
		const t = load('')
		for (const message of ['__proto__', 'constructor']) t.win.dispatchEvent(new t.win.ErrorEvent('error', { message }) as unknown as Event)
		const polluted = Object.hasOwn(Object.prototype, 2)
		delete (Object.prototype as Record<number, unknown>)[2]
		expect(polluted).toBe(false)
		expect(t.flush().x).toEqual([
			['__proto__', '', 1],
			['constructor', '', 1],
		])
	})

	it('sends nothing for clicks or errors that are turned off', () => {
		const t = load('<button id="go">Go</button>', 'https://shop.com/', { 'data-disable': 'clicks,errors' })
		t.click('#go')
		t.win.dispatchEvent(new t.win.ErrorEvent('error', { message: 'Boom' }) as unknown as Event)
		const e = t.flush()
		expect([e.c, e.x]).toEqual([undefined, undefined])
	})

	it('tracks nothing on a page opened for the overlay, and loads the overlay from next to itself', () => {
		const t = load('<button id="go">Go</button>', 'https://shop.com/pricing#misomoon-overlay', { src: 'https://shop.com/relay/m.js?s=shop' })
		t.click('#go')
		t.flush()
		expect(t.sent).toEqual([])
		const scripts = [...t.win.document.querySelectorAll('script')].map((s) => s.getAttribute('src'))
		expect(scripts).toContain('https://shop.com/relay/overlay.js')
	})
})

describe('m.js links, forms and tagged events', () => {
	it('counts a tagged element on click, with its props and link, and nothing else for it', () => {
		const t = load('<a id="a" href="https://github.com/x" data-misomoon-event="Star" data-misomoon-prop-repo="x">Star</a>')
		t.click('#a')
		expect(t.events()).toEqual([['Star', { repo: 'x', url: 'https://github.com/x' }]])
	})

	it("sends a tagged link's url without its query, which can carry a signed URL's token", () => {
		const t = load('<a id="a" href="https://cdn.example.com/x.pdf?X-Amz-Signature=abc#p2" data-misomoon-event="Brochure">Get it</a>')
		t.click('#a')
		expect(t.events()).toEqual([['Brochure', { url: 'https://cdn.example.com/x.pdf' }]])
	})

	it('counts a tagged form on submit, unless it is ignored', () => {
		const t = load('<form id="f" data-misomoon-event="Signup" data-misomoon-prop-plan="pro"></form><form id="g" data-misomoon-event="Quiet" data-misomoon-ignore></form>')
		t.submit('#f')
		t.submit('#g')
		t.click('#f')
		expect(t.events()).toEqual([['Signup', { plan: 'pro' }]])
	})

	it('counts downloads, extra extensions, and a file on another host once, without the query', () => {
		const t = load(
			'<a id="pdf" href="/guide.pdf">PDF</a><a id="sk" href="/a.sketch">Sketch</a><a id="cdn" href="https://cdn.other.com/app.dmg?token=secret">App</a><a id="exp" href="/export?f=all" download>Export</a><a id="txt" href="/notes.TXT">Notes</a>',
			'https://shop.com/',
			{ 'data-download-ext': 'sketch' },
		)
		// happy-dom follows the link to the other host, so it goes last
		for (const id of ['#pdf', '#sk', '#exp', '#txt', '#cdn']) t.click(id)
		expect(t.events()).toEqual([
			['Download', { url: 'https://shop.com/guide.pdf' }],
			['Download', { url: 'https://shop.com/a.sketch' }],
			['Download', { url: 'https://shop.com/export' }],
			['Download', { url: 'https://shop.com/notes.TXT' }],
			['Download', { url: 'https://cdn.other.com/app.dmg' }],
		])
	})

	it('counts a middle click on a link, which opens it in a new tab, but not a right click', () => {
		const t = load('<a id="out" href="https://github.com/">GitHub</a><a id="pdf" href="/a.pdf">PDF</a><a id="tag" href="/pricing" data-misomoon-event="Pricing">Pricing</a><button id="b" data-misomoon-event="Tap">Tap</button>')
		for (const id of ['#out', '#pdf', '#tag', '#b']) t.aux(id, 1)
		for (const id of ['#out', '#pdf', '#tag']) t.aux(id, 2)
		expect(t.events()).toEqual([
			['Outbound link', { url: 'https://github.com/' }],
			['Download', { url: 'https://shop.com/a.pdf' }],
			['Pricing', { url: 'https://shop.com/pricing' }],
		])
	})

	it('reads revenue from a tagged element, and the link around it', () => {
		const t = load('<a href="/buy"><span id="s" data-misomoon-event="Buy" data-misomoon-revenue-amount="19.5" data-misomoon-revenue-currency="EUR">Buy</span></a>')
		t.click('#s')
		expect(t.sent.filter((s) => s.n).map((s) => [s.n, s.p, s.$])).toEqual([['Buy', { url: 'https://shop.com/buy' }, { amount: '19.5', currency: 'EUR' }]])
	})

	it('counts links to other hosts without their query string, and leaves the rest alone', () => {
		const t = load('<a id="out" href="https://github.com/misomoon?ref=nav#top">GitHub</a><a id="in" href="/docs">Docs</a><a id="mail" href="mailto:a@shop.com">Mail</a>')
		for (const id of ['#out', '#in', '#mail']) t.click(id)
		expect(t.events()).toEqual([['Outbound link', { url: 'https://github.com/misomoon' }]])
	})

	it('counts a form submit by its id or name, never a tagged or ignored one', () => {
		const t = load('<form id="contact"></form><form name="news"></form><form id="x" data-misomoon-ignore></form>')
		for (const id of ['#contact', 'form[name=news]', '#x']) t.submit(id)
		expect(t.events()).toEqual([
			['Form sent', { form: 'contact' }],
			['Form sent', { form: 'news' }],
		])
	})

	it('sends none of these when turned off on the page', () => {
		const t = load('<a id="out" href="https://github.com/">GitHub</a><a id="pdf" href="/a.pdf">PDF</a><form id="f"></form><button id="b" data-misomoon-event="Tap">Tap</button>', 'https://shop.com/', {
			'data-disable': 'outbound,downloads,forms,events',
		})
		for (const id of ['#out', '#pdf', '#b']) t.click(id)
		t.submit('#f')
		expect(t.events()).toEqual([])
	})
})

describe('m.js payments, without cookies', () => {
	const refs = (t: ReturnType<typeof load>) => t.sent.filter((s) => s.k)
	const link = (href: string) => `<a id="pay" href="${href}">Pay</a>`
	const opened = (t: ReturnType<typeof load>) => t.$('#pay').getAttribute('href')!

	it('hands out one ref per page view and records it with the visit', () => {
		const t = load('')
		const r = t.misomoon.ref()
		expect(r).toMatch(/^mm_[0-9a-f]{24}$/)
		expect(t.misomoon.ref()).toBe(r)
		expect(refs(t).map((s) => [s.k, s.e, s.u, s.n])).toEqual([[r, 0, 'https://shop.com/pricing', undefined]])
		t.win.history.pushState(null, '', '/checkout')
		expect(t.misomoon.ref()).not.toBe(r)
	})

	it.each([
		['https://buy.stripe.com/test_00g', 'client_reference_id'],
		['https://buy.polar.sh/polar_cl_abc', 'reference_id'],
		['https://shop.lemonsqueezy.com/checkout/buy/9a1', 'checkout[custom][misomoon_ref]'],
		['https://checkout.dodopayments.com/buy/pdt_1?quantity=1', 'metadata_misomoon_ref'],
	])('tags a payment link to %s with the ref', (href, param) => {
		const t = load(link(href))
		t.click('#pay')
		expect(new URL(opened(t)).searchParams.get(param)).toBe(t.misomoon.ref())
		expect(refs(t)).toHaveLength(1)
	})

	it('leaves other links, mail and relative links, and links that carry their own ref alone', () => {
		for (const href of ['https://github.com/misomoon', 'mailto:sales@shop.com', '/checkout', 'https://buy.stripe.com/x?client_reference_id=mine']) {
			const t = load(link(href))
			t.click('#pay')
			expect([opened(t), refs(t)]).toEqual([href, []])
		}
	})

	it('tags a link opened with the middle button too', () => {
		const t = load(link('https://buy.stripe.com/x'))
		t.$('#pay').dispatchEvent(new t.win.MouseEvent('auxclick', { bubbles: true, button: 1 }) as unknown as Event)
		expect(new URL(opened(t)).searchParams.has('client_reference_id')).toBe(true)
	})

	it('stops tagging links when turned off on the page, while misomoon.ref() keeps working', () => {
		const t = load(link('https://buy.stripe.com/x'), 'https://shop.com/', { 'data-disable': 'payments' })
		t.click('#pay')
		expect(opened(t)).toBe('https://buy.stripe.com/x')
		const r = t.misomoon.ref()
		expect(refs(t).map((s) => s.k)).toEqual([r])
	})

	it('hands out a ref before the first manual page view, for the page it is on', () => {
		const t = load('', 'https://shop.com/pricing?plan=pro', { 'data-manual': '' })
		const r = t.misomoon.ref()
		expect(refs(t).map((s) => [s.k, s.u])).toEqual([[r, 'https://shop.com/pricing?plan=pro']])
	})
})
