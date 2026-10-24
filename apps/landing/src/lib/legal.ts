/** The legal pages the landing serves from docs/*.md, by path and file name. */
export const LEGAL = ['privacy', 'terms', 'dpa', 'security'] as const
export type Legal = (typeof LEGAL)[number]

export const isLegal = (s: string): s is Legal => (LEGAL as readonly string[]).includes(s)
