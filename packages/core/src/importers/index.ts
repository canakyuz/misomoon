import { datafast } from './datafast'
import { fathom } from './fathom'
import { matomo } from './matomo'
import { pirsch } from './pirsch'
import type { Importer } from './types'
import { umami } from './umami'

export { addExportFiles } from './files'
export * from './info'
export * from './types'
export { dayBounds, nextDay, prevDay, publicBase } from './util'

/** Every API importer, by id. Their names and form fields are in info.ts. */
export const IMPORTERS: Record<string, Importer<any>> = { umami, matomo, pirsch, datafast, fathom }
