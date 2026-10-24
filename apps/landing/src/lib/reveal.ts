import type { Attachment } from 'svelte/attachments'

/** Fades an element up the first time it scrolls into view. */
export function reveal(delay = 0): Attachment<HTMLElement> {
	return (el) => {
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
		el.style.opacity = '0'
		el.style.transform = 'translateY(14px)'
		el.style.transition = `opacity 800ms cubic-bezier(.22,1,.36,1) ${delay}ms, transform 800ms cubic-bezier(.22,1,.36,1) ${delay}ms`
		const io = new IntersectionObserver(
			([e]) => {
				if (!e.isIntersecting) return
				el.style.opacity = '1'
				el.style.transform = 'none'
				io.disconnect()
			},
			{ rootMargin: '0px 0px -8% 0px' },
		)
		io.observe(el)
		return () => io.disconnect()
	}
}
