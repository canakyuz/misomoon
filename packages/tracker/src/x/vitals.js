// Core Web Vitals, measured with the native APIs. The observers are buffered, so entries
// from before this part loaded still arrive.
window.misomoon.x(function (api) {
	var w = window
	if ((api.data.disable || '').includes('vitals') || !w.PerformanceObserver) return
	var vitals = {}
	var interactions = {}
	var sent = 0
	function observe(type, cb, opts) {
		try {
			var po = new PerformanceObserver(function (l) {
				l.getEntries().forEach(cb)
			})
			po.observe(Object.assign({ type: type, buffered: true }, opts || {}))
		} catch (e) {}
	}
	observe('largest-contentful-paint', function (e) {
		vitals.lcp = e.startTime
	})
	observe('paint', function (e) {
		if (e.name === 'first-contentful-paint') vitals.fcp = e.startTime
	})
	observe(
		'event',
		function (e) {
			if (!e.interactionId) return
			var prev = interactions[e.interactionId] || 0
			if (e.duration > prev) interactions[e.interactionId] = e.duration
		},
		{ durationThreshold: 16 },
	)
	// CLS: the largest burst of shifts within 1 s of each other, capped at 5 s.
	var cls = 0
	var win = 0
	var first = 0
	var last = 0
	observe('layout-shift', function (e) {
		if (e.hadRecentInput) return
		if (win && e.startTime - last < 1000 && e.startTime - first < 5000) win += e.value
		else {
			win = e.value
			first = e.startTime
		}
		last = e.startTime
		if (win > cls) cls = win
		vitals.cls = cls
	})

	api.push(function (p) {
		// soft navigations have no meaningful LCP or TTFB
		if (!p) sent = 1
		if (sent) return
		sent = 1
		var v = {}
		var nav = w.performance.getEntriesByType && performance.getEntriesByType('navigation')[0]
		if (nav && nav.responseStart > 0) v.ttfb = Math.round(nav.responseStart)
		if (vitals.lcp) v.lcp = Math.round(vitals.lcp)
		if (vitals.fcp) v.fcp = Math.round(vitals.fcp)
		if (vitals.cls != null) v.cls = Math.round(vitals.cls * 1000) / 1000
		// INP approximated as the 98th percentile interaction, the worst for most pages.
		var ds = Object.keys(interactions).map(function (k) {
			return interactions[k]
		})
		if (ds.length) {
			ds.sort(function (a, b) {
				return b - a
			})
			v.inp = Math.round(ds[Math.min(ds.length - 1, Math.floor(ds.length / 50))])
		}
		p.v = v
		return 1
	})
})
