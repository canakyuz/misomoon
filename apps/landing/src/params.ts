import { defineParams } from '@sveltejs/kit/params'
import { isLegal } from '#lib/legal.ts'

export const params = defineParams({
	// /privacy, /terms, /dpa and /security; any other path falls through to the content pages
	legal: (param) => (isLegal(param) ? param : undefined),
})
