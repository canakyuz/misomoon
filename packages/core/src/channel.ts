export const CHANNELS = [
	'Direct',
	'Organic Search',
	'Paid Search',
	'AI Assistants',
	'Organic Social',
	'Paid Social',
	'Email',
	'Video',
	'Affiliates',
	'Display',
	'Referral',
] as const
export type Channel = (typeof CHANNELS)[number]

/** Hostname suffix → friendly source name. Matched against the referrer host. */
const SOURCES: [string, string, 'search' | 'social' | 'ai' | 'video' | 'email'][] = [
	['google.', 'Google', 'search'],
	['bing.com', 'Bing', 'search'],
	['duckduckgo.com', 'DuckDuckGo', 'search'],
	['search.yahoo.', 'Yahoo', 'search'],
	['yandex.', 'Yandex', 'search'],
	['baidu.com', 'Baidu', 'search'],
	['ecosia.org', 'Ecosia', 'search'],
	['search.brave.com', 'Brave Search', 'search'],
	['naver.com', 'Naver', 'search'],
	['kagi.com', 'Kagi', 'search'],
	['chatgpt.com', 'ChatGPT', 'ai'],
	['chat.openai.com', 'ChatGPT', 'ai'],
	['perplexity.ai', 'Perplexity', 'ai'],
	['claude.ai', 'Claude', 'ai'],
	['gemini.google.com', 'Gemini', 'ai'],
	['copilot.microsoft.com', 'Copilot', 'ai'],
	['chat.deepseek.com', 'DeepSeek', 'ai'],
	['you.com', 'You.com', 'ai'],
	['phind.com', 'Phind', 'ai'],
	['meta.ai', 'Meta AI', 'ai'],
	['grok.com', 'Grok', 'ai'],
	['t.co', 'X', 'social'],
	['x.com', 'X', 'social'],
	['twitter.com', 'X', 'social'],
	['facebook.com', 'Facebook', 'social'],
	['fb.me', 'Facebook', 'social'],
	['instagram.com', 'Instagram', 'social'],
	['linkedin.com', 'LinkedIn', 'social'],
	['lnkd.in', 'LinkedIn', 'social'],
	['reddit.com', 'Reddit', 'social'],
	['threads.net', 'Threads', 'social'],
	['bsky.app', 'Bluesky', 'social'],
	['news.ycombinator.com', 'Hacker News', 'social'],
	['pinterest.', 'Pinterest', 'social'],
	['tiktok.com', 'TikTok', 'social'],
	['producthunt.com', 'Product Hunt', 'social'],
	['mastodon.', 'Mastodon', 'social'],
	['discord.com', 'Discord', 'social'],
	['youtube.com', 'YouTube', 'video'],
	['youtu.be', 'YouTube', 'video'],
	['vimeo.com', 'Vimeo', 'video'],
	['twitch.tv', 'Twitch', 'video'],
	['mail.google.com', 'Gmail', 'email'],
	['outlook.live.com', 'Outlook', 'email'],
	['mail.yahoo.com', 'Yahoo Mail', 'email'],
	['github.com', 'GitHub', 'social'],
]

const AI_UTM = /chatgpt|openai|perplexity|claude|gemini|copilot/i

export interface Acquisition {
	source: string
	channel: Channel
	referrer_host: string | null
}

export interface UTM {
	utm_source: string | null
	utm_medium: string | null
	utm_campaign: string | null
	utm_term: string | null
	utm_content: string | null
}

export function readUTM(url: URL): UTM {
	const q = url.searchParams
	const v = (k: string) => q.get(k)?.trim().slice(0, 200) || null
	return {
		utm_source: v('utm_source') ?? v('ref') ?? v('source'),
		utm_medium: v('utm_medium'),
		utm_campaign: v('utm_campaign'),
		utm_term: v('utm_term'),
		utm_content: v('utm_content'),
	}
}

/** Android app package → the site it belongs to, for `android-app://` referrers. */
const ANDROID_APPS: Record<string, string> = {
	'com.twitter.android': 'x.com',
	'com.facebook.katana': 'facebook.com',
	'com.facebook.lite': 'facebook.com',
	'com.instagram.android': 'instagram.com',
	'com.instagram.barcelona': 'threads.net',
	'com.linkedin.android': 'linkedin.com',
	'com.reddit.frontpage': 'reddit.com',
	'com.pinterest': 'pinterest.com',
	'com.zhiliaoapp.musically': 'tiktok.com',
	'com.ss.android.ugc.trill': 'tiktok.com',
	'com.discord': 'discord.com',
	'xyz.blueskyweb.app': 'bsky.app',
	'com.google.android.youtube': 'youtube.com',
	'com.google.android.gm': 'mail.google.com',
	'com.google.android.googlequicksearchbox': 'google.com',
	'com.microsoft.office.outlook': 'outlook.live.com',
	'com.openai.chatgpt': 'chatgpt.com',
}

export function referrerHost(referrer: string | null | undefined): string | null {
	if (!referrer) return null
	try {
		const url = new URL(referrer)
		if (url.protocol === 'android-app:') return ANDROID_APPS[url.hostname] ?? (url.hostname || null)
		const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '')
		return host || null
	} catch {
		return null
	}
}

/** Ad click IDs in the landing URL. Each marks the visit paid and names the network that added it. */
const CLICK_IDS: [string, string][] = [
	['gclid', 'Google'],
	['msclkid', 'Bing'],
	['twclid', 'X'],
]

/** The network of the first ad click ID in `url`, or null. */
export function adClick(url: URL): string | null {
	return CLICK_IDS.find(([param]) => url.searchParams.has(param))?.[1] ?? null
}

function lookup(host: string) {
	// Exact hosts and domain suffixes first, so gemini.google.com and mail.google.com
	// win over the brand patterns ('google.' matches google.de, google.co.uk).
	for (const [suffix, name, kind] of SOURCES) {
		if (!suffix.endsWith('.') && (host === suffix || host.endsWith('.' + suffix))) return { name, kind }
	}
	for (const [prefix, name, kind] of SOURCES) {
		if (prefix.endsWith('.') && (host.startsWith(prefix) || host.includes('.' + prefix))) return { name, kind }
	}
	return null
}

const bare = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * The known source a `utm_source` names: its name ("x", "hacker-news") or its host's brand,
 * the first label of a two-label host ("twitter", "fb", "bsky") or the last of a pattern
 * ("google", "yahoo"). Longer hosts such as mail.google.com match by name only, so `mail`
 * stays itself, and AI hosts too, so `meta` (Facebook and Instagram ads) isn't Meta AI.
 */
function bySource(s: string) {
	const key = bare(s)
	if (!key) return null
	for (const [host, name, kind] of SOURCES) {
		const labels = host.replace(/\.$/, '').split('.')
		const brand = kind === 'ai' ? null : host.endsWith('.') ? labels[labels.length - 1] : labels.length === 2 ? labels[0] : null
		if (bare(name) === key || brand === key) return { name, kind }
	}
	return null
}

/**
 * Classifies a visit into the standard acquisition channels, with an extra AI
 * Assistants channel since answer engines are now a meaningful source of traffic.
 */
export function classify(refHost: string | null, utm: UTM, selfHost: string, click: string | null = null): Acquisition {
	const host = refHost && refHost !== selfHost.replace(/^www\./, '') ? refHost : null
	const medium = (utm.utm_medium ?? '').toLowerCase()
	const utmSource = utm.utm_source
	const ref = host ? lookup(host) : null
	const ad = click ? bySource(click) : null
	// the kind of site: a known referrer, then a utm_source naming one, then the ad network
	const known = ref ?? (utmSource ? bySource(utmSource) : null) ?? ad
	const source = ref?.name ?? (utmSource ? prettySource(utmSource) : (ad?.name ?? host ?? 'Direct'))
	const paid = !!click || /^(cpc|ppc|paid|paidsearch|paid_search|cpm|cpv|cpa)$/.test(medium) || medium.startsWith('paid')

	let channel: Channel
	if (known?.kind === 'ai' || (utmSource && AI_UTM.test(utmSource))) channel = 'AI Assistants'
	else if (medium === 'email' || medium === 'newsletter' || known?.kind === 'email') channel = 'Email'
	else if (medium === 'affiliate') channel = 'Affiliates'
	else if (/^(display|banner|interstitial)$/.test(medium)) channel = 'Display'
	else if (known?.kind === 'search' || /search/.test(medium)) channel = paid ? 'Paid Search' : 'Organic Search'
	else if (known?.kind === 'social' || /^(paid[-_ ]?)?(social|sm|social[-_ ]?(media|network))$/.test(medium)) channel = paid ? 'Paid Social' : 'Organic Social'
	else if (known?.kind === 'video' || medium === 'video') channel = 'Video'
	else if (paid) channel = 'Paid Search'
	else if (host || utmSource) channel = 'Referral'
	else channel = 'Direct'

	return { source, channel, referrer_host: host }
}

/** The source misomoon names for a referrer host, as the tracker does: `Google` for google.com, else the host. */
export function sourceName(host: string): string {
	const h = host.trim().toLowerCase().replace(/^www\./, '')
	return lookup(h)?.name ?? h
}

/** The channel for a source name as imports give them ("Google", "news.ycombinator.com"). */
export function channelForSource(source: string, medium: string | null, utmSource: string | null): Channel {
	const utm: UTM = { utm_source: utmSource, utm_medium: medium, utm_campaign: null, utm_term: null, utm_content: null }
	if (!source || source === 'Direct') return classify(null, utm, '').channel
	const byName = SOURCES.find(([, name]) => name.toLowerCase() === source.toLowerCase())
	const host = byName ? byName[0].replace(/\.$/, '.com') : source.includes('.') ? source.toLowerCase().replace(/^www\./, '') : null
	return classify(host, host ? utm : { ...utm, utm_source: utmSource ?? source }, '').channel
}

function prettySource(s: string): string {
	const hit = bySource(s)
	if (hit) return hit.name
	return s.length <= 3 ? s.toUpperCase() : s.charAt(0).toUpperCase() + s.slice(1)
}
