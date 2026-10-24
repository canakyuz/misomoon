// misomoon analytics, cookieless. https://misomoon.com/docs
// The core: pageviews, engaged time and scroll depth. Loaded as m.js?s=<site>, the Worker
// appends the code for the features the site ticks in its settings (src/x/), so each site
// downloads only what it uses. The server does the rest: site search, checkout ids on
// success pages, path rules, the visitor's language, and rounding the scroll depth.
;(() => {
	var w = window
	var d = document
	var loc = w.location
	var nav = w.navigator
	var script = d.currentScript
	if (!script) return
	// the script tag's data- attributes: data-download-ext is data.downloadExt
	var data = script.dataset
	var at = (path) => new URL(path, script.src)
	var listen = (target, type, fn) => target.addEventListener(type, fn)
	// m.js?s=<site>: the Worker needs the id in the URL to add the site's features anyway
	var site = at('').searchParams.get('s')
	// next to the script, so a first-party proxy under any path prefix just works
	var endpoint = data.api || at('api/event')
	// props for every event: data-prop-plan="pro" on the script tag
	var props = {}
	for (var a of script.attributes) a.name.indexOf('data-prop-') || (props[a.name.slice(10)] = a.value)
	var queued = (w.misomoon || {}).q || []
	// The dashboard opens a page with #misomoon-overlay to draw clicks and scroll on it.
	// Nothing is tracked then, and the drawing code loads from next to this script only.
	var overlay = /misomoon-overlay/.test(loc.hash)
	// Localhost and file: pages need no check here: the server drops any hostname that
	// isn't the site's domain.
	var skip = !site ? 'site' : overlay ? 'overlay' : nav.webdriver ? 'bot' : ''
	try {
		skip = skip || (w.localStorage.misomoon_ignore && 'ignored')
	} catch (e) {}
	// says once why this browser isn't counted, so no debug switch is needed
	if (skip) console.info('misomoon skipped:', skip)

	var send = (p) => {
		if (skip) return
		p.s = site
		p.u = url || loc.href
		// the page view's key: the server stores the pageview under it, and adds each
		// engagement beacon with the same key to that row instead of storing it
		p.y = key
		// the server ignores props on an engagement beacon
		p.p = { ...props, ...p.p }
		nav.sendBeacon(endpoint, JSON.stringify(p))
	}

	// ---- engagement: visible time and scroll depth for the current page view. A beacon
	// without a name is an engagement when it has `e`, otherwise a pageview.
	var url, key, since, engaged, maxScroll
	var parts = []
	// a feature part adds to the engagement beacon f(p), and hears of a new page view f()
	var hook = (p) => parts.filter((f) => f(p))[0]
	// the lowest point seen, in pixels; flush divides by the page's height then, so a page
	// that grows later isn't over-counted
	var bottom = () => (maxScroll = Math.max(maxScroll, w.scrollY + w.innerHeight))
	// adds the time since the clock last started, and restarts it while the page has focus,
	// which a hidden tab never has
	var tick = () => {
		if (since) engaged += Date.now() - since
		since = d.hasFocus() && Date.now()
	}
	var flush = () => {
		if (!url) return
		tick()
		var p = { e: engaged, d: (bottom() / d.documentElement.scrollHeight) * 100 }
		// ignore sub-second blips such as a tab flashing during a redirect
		if (hook(p) || engaged > 999) send(p), (engaged = 0)
	}

	// ---- page views, with SPA support. Automatic views (load, history, hash) skip a repeat
	// of the same URL; a manual misomoon('pageview') always counts and may name its url.
	var pageview = (manual, o = {}) => {
		// without data-hash, the URL up to the #; a URL never holds a raw space
		var u = o.u || loc.href.split('hash' in data ? ' ' : '#')[0]
		if (!manual && u == url) return
		if (url) flush(), hook()
		url = u
		key = Math.random()
		// a router scrolls to the top after the URL changes, so the old page's position doesn't carry over
		maxScroll = since = engaged = 0
		tick()
		send({ r: d.referrer, w: w.screen.width, p: o.props })
	}
	var auto = () => pageview(0)
	var history = w.history
	var push = history.pushState
	history.pushState = (...a) => (push.apply(history, a), auto())
	// popstate also fires when the hash changes, which is how a hash router navigates
	listen(w, 'popstate', auto)
	// hidden, which includes leaving the page: count the time and send it; shown again: flush
	// adds nothing and restarts the clock.
	// Another window taking focus only stops the clock, so switching apps sends nothing.
	listen(d, 'visibilitychange', flush)
	listen(w, 'blur', tick)
	listen(w, 'focus', tick)
	listen(w, 'scroll', bottom)
	// the back button can show a page from the browser's cache without loading it again
	listen(w, 'pageshow', (e) => e.persisted && pageview(1))

	// ---- public API: misomoon('Signup', { props: { plan: 'pro' }, revenue: { amount: 19, currency: 'USD' }, interactive: false })
	// The server reads the revenue as it comes; interactive: false keeps an event from ending a bounce.
	var track = (w.misomoon = (name, o) => {
		o = o || {}
		name == 'pageview' ? pageview(1, o) : send({ n: name, p: o.props, $: o.revenue, i: o.interactive })
		o.callback && o.callback()
	})
	// Each feature part calls misomoon.x(fn) with the list of hooks as its api: it pushes its
	// hook there, and the parts share what they add to it (see x/items.js). A browser that
	// isn't counted runs none of them.
	parts.data = data
	parts.send = send
	track.x = (fn) => skip || fn(parts)
	// the payments part replaces this; until then a checkout gets no ref rather than an error
	track.ref = () => {}

	if (overlay) d.head.appendChild(d.createElement('script')).src = at('overlay.js')
	// Calls made before load go after the first pageview: an event that opened the visit
	// would give it no referrer, and the pageview would join it as Direct.
	var start = () => {
		'manual' in data || auto()
		queued.forEach((a) => track(...a))
	}
	// a page prerendered for a link the visitor may never follow counts once it is shown
	d.prerendering ? listen(d, 'prerenderingchange', start) : start()
})()
