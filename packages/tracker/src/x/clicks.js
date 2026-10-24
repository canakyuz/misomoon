// Clicks per element, with rage clicks (the third on one element within a second) and dead
// clicks (nothing on the page changed for a second after a click on something clickable).
window.misomoon.x(function (api) {
	var w = window
	var d = document
	if ((api.data.disable || '').includes('clicks')) return
	var clicks = {}
	var n = 0
	var recent = []
	var INTERACTIVE = 'a[href],button,input,select,textarea,label,summary,[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[role=switch],[onclick],[data-misomoon-id]'
	var FIELD = /^(INPUT|SELECT|TEXTAREA)$/

	// Finds the element again on the page: tags and positions up to an id or the body.
	function selector(el) {
		var parts = []
		for (var i = 0; el && el.nodeType === 1 && i < 12; i++, el = el.parentElement) {
			var tag = el.localName
			var mid = el.getAttribute('data-misomoon-id')
			var part = tag === 'body' || tag === 'html' ? 'body' : mid && /^[\w-]{1,60}$/.test(mid) ? '[data-misomoon-id="' + mid + '"]' : ''
			// generated ids (radix-:r1:, ember123) change between visits
			if (!part && /^[A-Za-z][\w-]{0,60}$/.test(el.id) && !/\d{3}/.test(el.id)) part = '#' + el.id
			if (part) {
				parts.unshift(part)
				break
			}
			var k = 1
			for (var sib = el.previousElementSibling; sib; sib = sib.previousElementSibling) if (sib.localName === tag) k++
			parts.unshift(tag + (k > 1 ? ':nth-of-type(' + k + ')' : ''))
		}
		return parts.join('>')
	}

	// What a person sees on a link, button or field, or what the site wrote for any other
	// element (aria-label, alt, title). Never a field's value, nor other text on the page,
	// which can be someone's name; data-misomoon-mask sends none.
	function label(el) {
		var t = el.closest('[data-misomoon-mask]') ? '' : el.getAttribute('aria-label') || el.getAttribute('alt') || el.getAttribute('title')
		if (t == null) t = FIELD.test(el.tagName) ? (/^(submit|button|reset)$/.test(el.type) ? el.value : el.name || el.type) : el.matches(INTERACTIVE) ? el.textContent : ''
		return String(t || '').replace(/\s+/g, ' ').trim().slice(0, 60)
	}

	d.addEventListener(
		'click',
		function (ev) {
			var t = ev.target
			if (!t || !t.closest) return
			var el = t.closest(INTERACTIVE) || t.closest('svg') || t
			var key = selector(el)
			var rec = clicks[key]
			if (!rec) {
				if (!key || n >= 30) return
				n++
				rec = clicks[key] = [key, label(el), 0, 0, 0]
			}
			rec[2]++
			var now = Date.now()
			recent = recent.filter(function (c) {
				return now - c[0] < 1000 && c[3] === key && Math.abs(c[1] - ev.clientX) < 30 && Math.abs(c[2] - ev.clientY) < 30
			})
			if (recent.push([now, ev.clientX, ev.clientY, key]) === 3) rec[3]++
			if (!w.MutationObserver || el.closest('a[href]') || FIELD.test(el.tagName) || el.localName === 'label') return
			if (!el.matches(INTERACTIVE) && w.getComputedStyle(el).cursor !== 'pointer') return
			var url = location.href
			var changed = 0
			var mo = new MutationObserver(function () {
				changed = 1
			})
			mo.observe(d.documentElement, { childList: true, subtree: true, attributes: true, characterData: true })
			setTimeout(function () {
				mo.disconnect()
				if (!changed && location.href === url && d.visibilityState === 'visible' && clicks[key] === rec) rec[4]++
			}, 1000)
		},
		true,
	)

	api.push(function (p) {
		if (!p) return
		var out = []
		for (var k in clicks) out.push(clicks[k])
		clicks = {}
		n = 0
		if (out.length) return (p.c = out)
	})
})
