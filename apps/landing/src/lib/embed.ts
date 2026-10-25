export type Theme = 'light' | 'dark'

/** The demo as fig. 1 shows it: without the dashboard's top bar and view tabs, in the page's theme. */
export const embedUrl = (demo: string, theme: Theme) => `${demo}?embed&theme=${theme}`

/** What fig. 1 posts into the demo when the page flips between day and night. */
export const themeMessage = (theme: Theme) => ({ type: 'misomoon:theme', theme })
