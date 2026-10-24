// Plays of <video> and <audio>, and whether they reached 25, 50, 75 and 95%.
window.misomoon.x(function (api) {
	if ((api.data.disable || '').includes('media')) return
	// media events don't bubble, but the capture phase still sees them
	;['play', 'timeupdate', 'ended'].forEach(function (type) {
		document.addEventListener(
			type,
			function (e) {
				var el = e.target
				// muted video without controls is decoration, not something people watch
				if (!/^(video|audio)$/.test(el.localName) || (el.muted && !el.controls) || (el.paused && type === 'timeupdate')) return
				var src = el.currentSrc || ''
				var name = el.getAttribute('data-misomoon-media') || el.title || (/^https?:/.test(src) ? src.split(/[?#]/)[0].split('/').pop() : '') || el.localName
				var it = api.item('m', name, [name, el.localName], 5)
				// played (any event, so a video that started before this part loaded counts), then
				// 25, 50, 75 and 95%; a live stream has no duration and only plays
				var at = type === 'ended' ? 1 : el.currentTime / el.duration
				if (it)
					it.v = it.v.map(function (v, i) {
						return v | (!i || at >= [0, 0.25, 0.5, 0.75, 0.95][i])
					})
			},
			true,
		)
	})
})
