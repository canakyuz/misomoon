// A click on a link to another host, including a middle click that opens it in a new tab.
// Sends the link without its query string.
window.misomoon.x(function (api) {
	if ((api.data.disable || '').includes('outbound')) return
	function click(ev) {
		var a = !ev.misomoon && ev.button < 2 && ev.target && ev.target.closest && ev.target.closest('a[href]')
		var url
		try {
			url = a && new URL(a.href, location.href)
		} catch (e) {}
		if (url && /^https?:$/.test(url.protocol) && url.host !== location.host) window.misomoon('Outbound link', { props: { url: url.origin + url.pathname } })
	}
	document.addEventListener('click', click, true)
	document.addEventListener('auxclick', click, true)
})
