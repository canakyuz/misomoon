// Elements tagged data-misomoon-event="Signup", with data-misomoon-prop-plan="pro" for props
// and data-misomoon-revenue-amount="19" with data-misomoon-revenue-currency="USD" for revenue.
// A form fires on submit, anything else on click, or on a middle click for a link. Runs
// before the link parts, which leave a click it counted alone.
window.misomoon.x(function (api) {
	var d = document
	if ((api.data.disable || '').includes('events')) return
	function send(el, link) {
		var o = { props: {} }
		for (var i = 0; i < el.attributes.length; i++) {
			var n = el.attributes[i].name
			var v = el.attributes[i].value
			if (n.indexOf('data-misomoon-prop-') === 0) o.props[n.slice(19)] = v
			if (n.indexOf('data-misomoon-revenue-') === 0) (o.revenue = o.revenue || {})[n.slice(22)] = v
		}
		if (link) o.props.url = link.href
		window.misomoon(el.getAttribute('data-misomoon-event'), o)
	}
	function click(ev) {
		var el = ev.target && ev.target.closest && ev.target.closest('[data-misomoon-event]')
		var link = el && el.closest('a[href]')
		// a middle click only opens a link
		if (!el || el.tagName === 'FORM' || ev.button > 1 || (ev.button && !link)) return
		ev.misomoon = 1
		send(el, link)
	}
	d.addEventListener('click', click, true)
	d.addEventListener('auxclick', click, true)
	d.addEventListener(
		'submit',
		function (ev) {
			var f = ev.target
			if (f && f.hasAttribute && f.hasAttribute('data-misomoon-event') && !f.hasAttribute('data-misomoon-ignore')) send(f)
		},
		true,
	)
})
