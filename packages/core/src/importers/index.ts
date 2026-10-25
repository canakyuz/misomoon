import { matomo } from './matomo'
import type { Importer } from './types'
import { umami } from './umami'

export * from './info'
export * from './types'
export { dayBounds, nextDay, prevDay, publicBase } from './util'

/** Every API importer, by id. Their names and form fields are in info.ts. */
export const IMPORTERS: Record<string, Importer<any>> = { umami, matomo }
