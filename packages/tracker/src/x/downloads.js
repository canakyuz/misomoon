// A click on a link to a file such as .pdf or .zip, or on a link with a download attribute,
// including a middle click. data-download-ext adds extensions.
window.misomoon.x(function (api) {
	if ((api.data.disable || '').includes('downloads')) return
	var DOWNLOAD = /\.(pdf|zip|dmg|exe|msi|pkg|deb|rpm|csv|txt|rtf|xlsx?|docx?|pptx?|pps|mp[34]|mpe?g|mov|avi|wmv|wav|wma|midi?|gz|tar|7z|rar|iso|apk|ipa|epub|key|numbers|pages)$/i
	var extra = (api.data.downloadExt || '').toLowerCase().split(',').filter(Boolean)
	function click(ev) {
		var a = !ev.misomoon && ev.button < 2 && ev.target && ev.target.closest && ev.target.closest('a[href]')
		var url
		try {
			url = a && new URL(a.href, location.href)
		} catch (e) {}
		if (!url || !/^https?:$/.test(url.protocol)) return
		var path = url.pathname
		if (a.hasAttribute('download') || DOWNLOAD.test(path) || (path.indexOf('.') > 0 && extra.indexOf(path.split('.').pop().toLowerCase()) >= 0)) {
			// so the outbound part doesn't count a file on another host twice
			ev.misomoon = 1
			// without the query string, which can carry a signed URL's token
			window.misomoon('Download', { props: { url: url.origin + url.pathname } })
		}
	}
	document.addEventListener('click', click, true)
	document.addEventListener('auxclick', click, true)
})
