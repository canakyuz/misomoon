// A form submit, named by the form's id or name. data-misomoon-ignore leaves a form out, and
// a form tagged data-misomoon-event is the events part's.
window.misomoon.x(function (api) {
	if ((api.data.disable || '').includes('forms')) return
	document.addEventListener(
		'submit',
		function (ev) {
			var f = ev.target
			if (!f || !f.hasAttribute || f.hasAttribute('data-misomoon-ignore') || f.hasAttribute('data-misomoon-event')) return
			// attributes, not f.id: a field named "id" would shadow it
			window.misomoon('Form sent', { props: { form: f.getAttribute('id') || f.getAttribute('name') || location.pathname } })
		},
		true,
	)
})
