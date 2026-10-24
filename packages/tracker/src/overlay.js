/*! misomoon overlay: draws a page's clicks and scroll depth on the page itself. */
// m.js loads this, from next to itself, only on a page opened with #misomoon-overlay. The
// dashboard that opened the window answers with the counts; nothing here tracks anything.
;(function () {
	'use strict'
	var w = window
	var d = document
	if (w.__misomoonOverlay) return
	w.__misomoonOverlay = 1
	var opener = w.opener
	var INK = '#17140F'
	var PAPER = '#FBF7EE'
	var VERMILION = '#E8461A'
	var data = null
	var mode = 'clicks'
	var path = ''
	var waiting

	// The panel lives in a shadow root so the site's CSS can't reach it, nor its CSS the site.
	var host = d.createElement('div')
	host.style.cssText = 'all:initial;position:fixed;top:12px;right:12px;z-index:2147483647'
	var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host
	var style = d.createElement('style')
	style.textContent =
		':host{all:initial}' +
		'.p{font:13px/1.4 system-ui,sans-serif;color:' + INK + ';background:' + PAPER + ';border:2px solid ' + INK + ';box-shadow:6px 6px 0 ' + INK + ';width:260px;padding:12px}' +
		'.h{display:flex;align-items:center;gap:8px;font-weight:800;text-transform:uppercase;letter-spacing:.02em}' +
		'.h span{flex:1}.h i{width:12px;height:12px;border-radius:50%;background:' + VERMILION + '}' +
		'.t{display:flex;margin:10px 0;border:1.5px solid ' + INK + '}' +
		'button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;padding:4px 8px}' +
		'.t button{flex:1}.t button[aria-pressed=true]{background:' + VERMILION + ';color:#fff;font-weight:700}' +
		'.x{font-size:16px;line-height:1;padding:0 2px}' +
		'.s{margin:0;color:#5c554a;font-size:12px}.n{font-variant-numeric:tabular-nums}'
	var panel = d.createElement('div')
	panel.className = 'p'
	panel.setAttribute('role', 'dialog')
	panel.setAttribute('aria-label', 'misomoon overlay')
	var head = el('div', 'h')
	head.appendChild(el('i'))
	head.appendChild(el('span', '', 'misomoon'))
	var close = el('button', 'x', '×')
	close.setAttribute('aria-label', 'Close overlay')
	close.onclick = function () {
		host.remove()
		layer.remove()
		w.__misomoonOverlay = 0
	}
	head.appendChild(close)
	var tabs = el('div', 't')
	var tabClicks = el('button', '', 'Clicks')
	var tabScroll = el('button', '', 'Scroll')
	tabs.appendChild(tabClicks)
	tabs.appendChild(tabScroll)
	tabClicks.onclick = function () {
		setMode('clicks')
	}
	tabScroll.onclick = function () {
		setMode('scroll')
	}
	var summary = el('p', 's n')
	var note = el('p', 's')
	panel.appendChild(head)
	panel.appendChild(tabs)
	panel.appendChild(summary)
	panel.appendChild(note)
	root.appendChild(style)
	root.appendChild(panel)

	// Marks sit in one layer over the document, in page coordinates, and never take a click.
	var layer = d.createElement('div')
	layer.style.cssText = 'all:initial;position:absolute;left:0;top:0;width:0;height:0;z-index:2147483646;pointer-events:none'

	function el(tag, cls, text) {
		var e = d.createElement(tag)
		if (cls) e.className = cls
		if (text != null) e.textContent = text
		return e
	}

	function mark(css, text) {
		var e = d.createElement('div')
		e.style.cssText = 'all:initial;position:absolute;box-sizing:border-box;pointer-events:none;' + css
		if (text != null) {
			var b = d.createElement('span')
			b.style.cssText =
				'all:initial;position:absolute;left:-2px;top:-22px;white-space:nowrap;font:700 11px/18px system-ui,sans-serif;padding:0 6px;color:#fff;background:' + INK
			b.textContent = text
			e.appendChild(b)
		}
		layer.appendChild(e)
		return e
	}

	function fmt(n) {
		return n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n)
	}

	function setMode(m) {
		mode = m
		tabClicks.setAttribute('aria-pressed', String(m === 'clicks'))
		tabScroll.setAttribute('aria-pressed', String(m === 'scroll'))
		draw()
	}

	function draw() {
		layer.textContent = ''
		if (!data) return
		var sx = w.scrollX || 0
		var sy = w.scrollY || 0
		if (mode === 'clicks') {
			var c = data.clicks || { elements: [], clicks: 0, pageviews: 0 }
			var top = c.elements.length ? c.elements[0].clicks : 0
			var shown = 0
			c.elements.forEach(function (row) {
				var target
				try {
					target = d.querySelector(row.selector)
				} catch (e) {}
				if (!target) return
				var r = target.getBoundingClientRect()
				if (!r.width && !r.height) return
				shown++
				var heat = top ? row.clicks / top : 0
				var text = fmt(row.clicks) + (c.clicks ? ' · ' + Math.round((row.clicks / c.clicks) * 100) + '%' : '')
				if (row.rage) text += ' · ' + fmt(row.rage) + ' rage'
				if (row.dead) text += ' · ' + fmt(row.dead) + ' dead'
				mark(
					'left:' + (r.left + sx) + 'px;top:' + (r.top + sy) + 'px;width:' + r.width + 'px;height:' + r.height + 'px;' +
						'border:2px solid ' + (row.rage || row.dead ? INK : VERMILION) + ';' +
						'background:rgba(232,70,26,' + (0.12 + heat * 0.5).toFixed(2) + ')',
					text,
				)
			})
			summary.textContent = fmt(c.clicks) + ' clicks on ' + fmt(c.elements.length) + ' elements, ' + fmt(c.pageviews) + ' pageviews'
			note.textContent = c.elements.length > shown ? c.elements.length - shown + ' clicked elements are not on the page right now (hidden, or shown only after some action).' : ''
		} else {
			var s = data.scroll || { reached: [], visits: 0, average: 0 }
			var h = Math.max(d.documentElement.scrollHeight, d.body ? d.body.scrollHeight : 0)
			var width = d.documentElement.scrollWidth
			s.reached.forEach(function (row, i) {
				if (!row.depth) return
				var prev = s.reached[i - 1]
				var y0 = (prev.depth / 100) * h
				var y1 = (row.depth / 100) * h
				// the band is how many visits saw down to here; the line labels its bottom edge
				mark('left:0;top:' + y0 + 'px;width:' + width + 'px;height:' + (y1 - y0) + 'px;background:rgba(23,20,15,' + ((1 - row.share / 100) * 0.45).toFixed(2) + ')')
				mark('left:0;top:' + (y1 - 2) + 'px;width:' + width + 'px;height:0;border-top:2px dashed ' + VERMILION, row.share + '% of visits got here')
			})
			summary.textContent = fmt(s.visits) + ' visits, ' + s.average + '% scrolled on average'
			note.textContent = 'The darker the band, the fewer visits saw it.'
		}
	}

	// the page as the server stores it: the path, plus the route of a hash router (#/pricing)
	function here() {
		return w.location.pathname + (/^#!?\/[^?#]+/.exec(w.location.hash) || [''])[0]
	}

	function ask() {
		path = here()
		data = null
		layer.textContent = ''
		if (!opener || opener.closed) {
			summary.textContent = 'Not connected to misomoon.'
			note.textContent = 'Open this page from the dashboard: Behavior, then Clicks, then "Show on your site". If it opened but still says this, the site sends a Cross-Origin-Opener-Policy header that cuts the link.'
			return
		}
		summary.textContent = 'Loading clicks for ' + path + '…'
		note.textContent = ''
		opener.postMessage({ misomoon: 'overlay', path: path }, '*')
		clearTimeout(waiting)
		waiting = setTimeout(function () {
			if (!data) note.textContent = 'No answer from the dashboard. Keep its tab open, then reload this page.'
		}, 6000)
	}

	w.addEventListener('message', function (e) {
		var m = e.data
		if (e.source !== opener || !m || m.misomoon !== 'overlay-data' || m.path !== path) return
		data = m
		draw()
	})

	var queued
	function redraw() {
		if (queued) return
		queued = 1
		setTimeout(function () {
			queued = 0
			draw()
		}, 150)
	}
	w.addEventListener('resize', redraw)
	// a single-page app changes the path without a load: ask again for the new page
	setInterval(function () {
		if (here() !== path) ask()
		else redraw()
	}, 1500)

	function start() {
		d.body.appendChild(layer)
		d.body.appendChild(host)
		setMode('clicks')
		ask()
	}
	if (d.body) start()
	else d.addEventListener('DOMContentLoaded', start)
})()
