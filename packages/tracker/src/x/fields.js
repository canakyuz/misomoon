// The form fields a visit used, and the one it would leave the form at. Never a value.
window.misomoon.x(function (api) {
	var d = document
	if ((api.data.disable || '').includes('fields')) return
	function key(f) {
		return f.getAttribute('id') || f.getAttribute('name') || location.pathname
	}
	function focus(el) {
		var f = el && el.form
		if (!f || !/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) || /^(hidden|submit|button|reset|image)$/.test(el.type) || f.hasAttribute('data-misomoon-ignore')) return
		var k = key(f)
		var name = el.name || el.id || el.type
		var form = api.item('f', k, [k], 2)
		var field = form && api.item('g', k + '\u0000' + name, [k, name, [].indexOf.call(f.elements, el)], 2)
		if (!field) return
		form.v[0] = field.v[0] = 1
		form.last = 'g' + k + '\u0000' + name
		field.form = form
	}
	d.addEventListener(
		'focusin',
		function (e) {
			focus(e.target)
		},
		true,
	)
	d.addEventListener(
		'submit',
		function (e) {
			var it = e.target.getAttribute && api.items()['f' + key(e.target)]
			if (it) it.v[1] = 1
		},
		true,
	)
	// an autofocus field took focus before this part loaded
	focus(d.activeElement)
})
