// Elements tagged data-misomoon-content: seen once half of one is on screen, and clicked.
window.misomoon.x(function (api) {
	var d = document
	if ((api.data.disable || '').includes('content')) return
	function seen(el, clicked) {
		var name = el.getAttribute('data-misomoon-content')
		var it = name && api.item('o', name, [name], 2)
		if (it) it.v = [1, it.v[1] | clicked]
	}
	var observer
	function watch() {
		if (!window.IntersectionObserver) return
		if (observer) observer.disconnect()
		observer = new IntersectionObserver(
			function (entries) {
				entries.forEach(function (e) {
					if (!e.isIntersecting) return
					observer.unobserve(e.target)
					seen(e.target, 0)
				})
			},
			{ threshold: 0.5 },
		)
		d.querySelectorAll('[data-misomoon-content]').forEach(function (el) {
			observer.observe(el)
		})
	}
	d.addEventListener(
		'click',
		function (e) {
			var el = e.target && e.target.closest && e.target.closest('[data-misomoon-content]')
			if (el) seen(el, 1)
		},
		true,
	)
	watch()
	// a single-page app renders the new page after the route changes
	api.view(function () {
		setTimeout(watch, 1000)
	})
})
