// Payments without cookies. A payment finds this visit through a key the visit handed out:
// a ref passed to the checkout, or the checkout id the provider puts on the success page,
// which the server reads from the page URL. misomoon.ref() hands out one ref per page view;
// payment links get it in the parameter their provider keeps for you.
;(function (m) {
	var ref
	// replaced once the part runs; a browser that isn't counted gets a ref and sends nothing
	var send = function () {}
	m.ref = function () {
		if (ref) return ref
		var b = new Uint8Array(12)
		try {
			crypto.getRandomValues(b)
		} catch (e) {
			for (var i = 0; i < 12; i++) b[i] = Math.floor(Math.random() * 256)
		}
		ref = 'mm_' + Array.prototype.map.call(b, function (x) {
			return (x < 16 ? '0' : '') + x.toString(16)
		}).join('')
		send({ e: 0, k: ref })
		return ref
	}
	function refParam(url) {
		var h = url.hostname
		if (h === 'buy.stripe.com') return 'client_reference_id'
		if (h === 'buy.polar.sh' || (h === 'polar.sh' && /\/checkout/.test(url.pathname))) return 'reference_id'
		if (/(^|\.)lemonsqueezy\.com$/.test(h) && /\/(checkout|buy)\//.test(url.pathname)) return 'checkout[custom][misomoon_ref]'
		if (h === 'checkout.dodopayments.com') return 'metadata_misomoon_ref'
		return null
	}
	function tag(ev) {
		var a = ev.target && ev.target.closest && ev.target.closest('a[href]')
		if (!a) return
		try {
			var url = new URL(a.href, location.href)
			var param = refParam(url)
			if (!param || url.searchParams.has(param)) return
			url.searchParams.set(param, m.ref())
			a.href = url.href
		} catch (e) {}
	}
	m.x(function (api) {
		send = api.send
		// a new page view gets a new ref
		api.push(function (p) {
			if (!p) ref = 0
		})
		// data-disable="payments" stops the link tagging; misomoon.ref() keeps working
		if ((api.data.disable || '').includes('payments')) return
		document.addEventListener('click', tag, true)
		document.addEventListener('auxclick', tag, true)
	})
})(window.misomoon)
