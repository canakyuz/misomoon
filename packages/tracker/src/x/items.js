// State that the fields, media and content parts share: flags that only turn on, sent as
// deltas since the last beacon. A page view starts them over.
window.misomoon.x(function (api) {
	var items = {}
	var n = 0
	var views = []
	// One tracked thing: `head` goes first in its beacon entry, then `size` flags.
	api.item = function (type, key, head, size) {
		var it = items[type + key]
		if (!it && n < 60) {
			n++
			it = items[type + key] = { t: type, h: head, v: [], s: [] }
			for (var i = 0; i < size; i++) it.v[i] = it.s[i] = 0
		}
		return it
	}
	api.items = function () {
		return items
	}
	// a part that has to look at each new page (content) asks here
	api.view = function (fn) {
		views.push(fn)
	}
	// a new page view, or the engagement beacon p
	api.push(function (p) {
		if (!p) {
			items = {}
			n = 0
			views.forEach(function (fn) {
				fn()
			})
			return
		}
		var any = 0
		for (var k in items) {
			var it = items[k]
			// a field is where the visit gives up while it is the last one and the form isn't sent
			if (it.form) it.v[1] = it.form.last === k && !it.form.v[1] ? 1 : 0
			var delta = it.v.map(function (v, i) {
				return v - it.s[i]
			})
			it.s = it.v.slice()
			if (!delta.some(Boolean)) continue
			;(p[it.t] = p[it.t] || []).push(it.h.concat(delta))
			any = 1
		}
		return any
	})
})
