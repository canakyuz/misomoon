export interface ParsedUA {
	browser: string
	browser_version: string | null
	os: string
	os_version: string | null
	device: 'Desktop' | 'Mobile' | 'Tablet'
}

// Order matters: Edge and Opera carry "Chrome" in their UA, Chrome carries "Safari".
const BROWSERS: [RegExp, string][] = [
	[/EdgA?\/([\d.]+)/, 'Edge'],
	[/(?:OPR|Opera)\/([\d.]+)/, 'Opera'],
	[/SamsungBrowser\/([\d.]+)/, 'Samsung Internet'],
	[/YaBrowser\/([\d.]+)/, 'Yandex'],
	[/Vivaldi\/([\d.]+)/, 'Vivaldi'],
	[/Brave\/([\d.]+)/, 'Brave'],
	[/DuckDuckGo\/([\d.]+)/, 'DuckDuckGo'],
	[/Arc\/([\d.]+)/, 'Arc'],
	[/FBA[NV]\/([\d.]+)/, 'Facebook'],
	[/Instagram ([\d.]+)/, 'Instagram'],
	[/Line\/([\d.]+)/, 'Line'],
	[/(?:Firefox|FxiOS)\/([\d.]+)/, 'Firefox'],
	[/(?:Chrome|CriOS)\/([\d.]+)/, 'Chrome'],
	[/Version\/([\d.]+).*Safari\//, 'Safari'],
	[/AppleWebKit.*Mobile/, 'Safari'],
]

const OSES: [RegExp, string, (m: RegExpMatchArray) => string | null][] = [
	[/Windows NT ([\d.]+)/, 'Windows', (m) => windowsVersion(m[1])],
	[/(?:iPhone|iPad|iPod).*? OS ([\d_]+)/, 'iOS', (m) => m[1].replace(/_/g, '.')],
	[/Android ([\d.]+)/, 'Android', (m) => m[1]],
	[/CrOS/, 'ChromeOS', () => null],
	[/Mac OS X ([\d_.]+)/, 'macOS', (m) => m[1].replace(/_/g, '.')],
	[/Linux/, 'Linux', () => null],
]

function windowsVersion(nt: string): string {
	return { '10.0': '10/11', '6.3': '8.1', '6.2': '8', '6.1': '7' }[nt] ?? nt
}

function major(v: string | undefined): string | null {
	if (!v) return null
	const parts = v.split('.')
	return parts.length > 1 ? `${parts[0]}.${parts[1]}` : parts[0]
}

/**
 * The user agent `@misomoon/sdk/react-native` sends: a browser-shaped platform part, so
 * the OS and device rules below read it, then the app's own name and version.
 * `MisomoonApp/0.1.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Recipes/2.3.0`
 */
const APP = /^MisomoonApp\/[\d.]+ \([^)]*\) ([\w.-]{1,32})\/([\d.]+)$/

/** An app user agent without its app name, which could hold "Tablet", "Mobile" or "bot". */
function platformPart(ua: string, app: RegExpMatchArray | null): string {
	return app ? ua.slice(0, ua.length - app[1].length - app[2].length - 1) : ua
}

export function parseUA(ua: string): ParsedUA {
	let browser = 'Unknown'
	let browser_version: string | null = null
	const app = ua.match(APP)
	if (app) {
		// an app has no browser; its name and version take that place in reports
		browser = app[1]
		browser_version = app[2].split('.')[0]
	} else {
		for (const [re, name] of BROWSERS) {
			const m = ua.match(re)
			if (m) {
				browser = name
				browser_version = m[1] ? (major(m[1])?.split('.')[0] ?? null) : null
				break
			}
		}
	}
	const platform = platformPart(ua, app)
	let os = 'Unknown'
	let os_version: string | null = null
	for (const [re, name, ver] of OSES) {
		const m = platform.match(re)
		if (m) {
			os = name
			os_version = major(ver(m) ?? undefined)
			break
		}
	}
	let device: ParsedUA['device'] = 'Desktop'
	if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(platform)) device = 'Tablet'
	else if (/Mobi|iPhone|iPod|Android.*Mobile|Windows Phone/i.test(platform)) device = 'Mobile'
	return { browser, browser_version, os, os_version, device }
}

const BOT_UA =
	/bot|crawl|spider|slurp|bingpreview|mediapartners|facebookexternalhit|embedly|quora link|outbrain|pinterest|vkshare|w3c_validator|whatsapp|headless|phantom|puppeteer|playwright|selenium|lighthouse|pagespeed|gtmetrix|python-requests|axios|curl|wget|httpclient|okhttp|go-http|java\/|node-fetch|undici|preview|monitor|uptime|pingdom|datadog|chatgpt-user|gptbot|claudebot|perplexitybot|ccbot|bytespider|amazonbot|applebot/i

export function isBotUA(ua: string): boolean {
	if (!ua || ua.length < 20) return true
	return BOT_UA.test(platformPart(ua, ua.match(APP)))
}

/** Groups screen widths the way designers think about breakpoints. */
export function screenClass(width: number | undefined | null): string | null {
	if (!width || width <= 0) return null
	if (width < 576) return 'Mobile'
	if (width < 992) return 'Tablet'
	if (width < 1440) return 'Laptop'
	return 'Desktop'
}
