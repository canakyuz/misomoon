// Uncaught errors and rejected promises, by message and file. It arrives in the same file
// as m.js, so it listens from the moment the tracker runs.
window.misomoon.x(function (api) {
	var w = window
	// no prototype: a message such as __proto__ is a key like any other
	var errors = Object.create(null)
	var n = 0
	if ((api.data.disable || '').includes('errors')) return
	function onError(e) {
		var msg
		var src = ''
		if (e.type === 'error') {
			msg = e.message
			if (e.filename) src = e.filename + ':' + e.lineno + ':' + e.colno
		} else {
			var r = e.reason || {}
			var where = /(https?:\/\/[^\s)]+:\d+:\d+)/.exec(r.stack)
			msg = r.message ? (r.name ? r.name + ': ' : '') + r.message : String(e.reason)
			if (where) src = where[1]
		}
		msg = String(msg || '').slice(0, 300)
		var key = msg + src
		// a script from another origin without crossorigin reports only "Script error."
		if (!msg || /^Script error\.?$/.test(msg)) return
		if (errors[key]) errors[key][2]++
		else if (n++ < 5) errors[key] = [msg, src, 1]
	}
	w.addEventListener('error', onError)
	w.addEventListener('unhandledrejection', onError)

	api.push(function (p) {
		if (!p) return
		var out = []
		for (var k in errors) out.push(errors[k])
		errors = Object.create(null)
		n = 0
		if (out.length) return (p.x = out)
	})
})
