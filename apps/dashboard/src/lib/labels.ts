import { countryName, flag } from './countries'

const SOURCE_DOMAINS: Record<string, string> = {
	Google: 'google.com',
	Bing: 'bing.com',
	DuckDuckGo: 'duckduckgo.com',
	Yahoo: 'yahoo.com',
	Yandex: 'yandex.com',
	Baidu: 'baidu.com',
	Ecosia: 'ecosia.org',
	'Brave Search': 'search.brave.com',
	Kagi: 'kagi.com',
	ChatGPT: 'chatgpt.com',
	Perplexity: 'perplexity.ai',
	Claude: 'claude.ai',
	Gemini: 'gemini.google.com',
	Copilot: 'copilot.microsoft.com',
	DeepSeek: 'deepseek.com',
	X: 'x.com',
	Facebook: 'facebook.com',
	Instagram: 'instagram.com',
	LinkedIn: 'linkedin.com',
	Reddit: 'reddit.com',
	Threads: 'threads.net',
	Bluesky: 'bsky.app',
	'Hacker News': 'news.ycombinator.com',
	Pinterest: 'pinterest.com',
	TikTok: 'tiktok.com',
	'Product Hunt': 'producthunt.com',
	YouTube: 'youtube.com',
	GitHub: 'github.com',
	Producthunt: 'producthunt.com',
	Newsletter: '',
}

/** A domain to fetch a favicon for, when the value names a website. */
export function iconDomain(dim: string, key: string): string | null {
	if (dim === 'referrer') return key === '(none)' ? null : key
	if (dim === 'source' || dim === 'utm_source') {
		if (key in SOURCE_DOMAINS) return SOURCE_DOMAINS[key] || null
		if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(key)) return key
	}
	return null
}

export function favicon(domain: string) {
	return `https://icons.duckduckgo.com/ip3/${domain}.ico`
}

export function displayKey(dim: string, key: string): string {
	if (key === '(none)') {
		if (dim === 'referrer' || dim === 'source') return 'Direct / none'
		return dim.startsWith('utm_') ? '(not set)' : 'Unknown'
	}
	if (dim === 'country') return countryName(key)
	return key
}

export function prefix(dim: string, key: string): string | null {
	if (dim === 'country') return flag(key)
	return null
}

export const DIM_LABELS: Record<string, string> = {
	page: 'Page',
	prop: 'Custom property',
	entry_page: 'Entry page',
	exit_page: 'Exit page',
	hostname: 'Hostname',
	event: 'Event',
	goal: 'Goal',
	source: 'Source',
	referrer: 'Referrer',
	channel: 'Channel',
	utm_source: 'UTM source',
	utm_medium: 'UTM medium',
	utm_campaign: 'UTM campaign',
	utm_term: 'UTM term',
	utm_content: 'UTM content',
	country: 'Country',
	region: 'Region',
	city: 'City',
	continent: 'Continent',
	timezone: 'Timezone',
	network: 'Network',
	browser: 'Browser',
	browser_version: 'Browser version',
	os: 'OS',
	os_version: 'OS version',
	device: 'Device',
	screen: 'Screen',
	language: 'Language',
}

export function dimLabel(dim: string) {
	return DIM_LABELS[dim] ?? (dim.startsWith('prop:') ? dim.slice(5) : dim)
}

export const OP_LABELS: Record<string, string> = { '==': 'is', '!=': 'is not', '~': 'contains', '!~': 'does not contain' }
