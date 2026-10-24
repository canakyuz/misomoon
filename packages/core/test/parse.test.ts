import { describe, expect, it } from 'vite-plus/test'
import { adClick, buildEvent, classify, closingDay, dimInfo, isBotUA, isDimension, parseFilters, parseUA, predicate, QueryError, readUTM, referrerHost, resolvePeriod, bucketOf, DAY, pickShard, planWindow } from '../src'

describe('parseUA', () => {
	it('tells Edge from Chrome and reads versions', () => {
		const ua = parseUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0')
		expect(ua).toMatchObject({ browser: 'Edge', browser_version: '141', os: 'Windows', os_version: '10/11', device: 'Desktop' })
	})
	it('detects iPhone Safari as mobile', () => {
		const ua = parseUA('Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1')
		expect(ua).toMatchObject({ browser: 'Safari', os: 'iOS', os_version: '19.0', device: 'Mobile' })
	})
})

describe('app user agents from @misomoon/sdk/react-native', () => {
	it.each([
		['MisomoonApp/0.1.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Recipes/2.3.0', { browser: 'Recipes', browser_version: '2', os: 'iOS', os_version: '17.4', device: 'Mobile' }],
		['MisomoonApp/0.1.0 (iPad; CPU OS 18_0 like Mac OS X) Recipes/2.3.0', { browser: 'Recipes', os: 'iOS', os_version: '18.0', device: 'Tablet' }],
		['MisomoonApp/0.1.0 (Linux; Android 14; Mobile) Recipes/2.3.0', { browser: 'Recipes', os: 'Android', os_version: '14', device: 'Mobile' }],
		['MisomoonApp/0.1.0 (Linux; Android 15) Recipes/2.3.0', { browser: 'Recipes', os: 'Android', os_version: '15', device: 'Tablet' }],
	])('reads %s', (ua, want) => {
		expect(isBotUA(ua)).toBe(false)
		expect(parseUA(ua)).toMatchObject(want)
	})

	it.each([
		['MisomoonApp/0.1.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Silkroad/1.0', 'Mobile'],
		['MisomoonApp/0.1.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) TabletTools/1.0', 'Mobile'],
		['MisomoonApp/0.1.0 (Linux; Android 14) MobileBank/1.0', 'Tablet'],
		['MisomoonApp/0.1.0 (Macintosh; Intel Mac OS X 14_4) Mobilize/1.0', 'Desktop'],
	])('reads the device from the platform, not the app name: %s', (ua, device) => {
		expect(parseUA(ua).device).toBe(device)
	})

	it('reads a macOS app', () => {
		expect(parseUA('MisomoonApp/0.1.0 (Macintosh; Intel Mac OS X 14_4) Notes/1.0')).toMatchObject({ os: 'macOS', os_version: '14.4', device: 'Desktop' })
	})

	it('keeps an app whose name looks like a bot, and still drops bot platforms', () => {
		expect(isBotUA('MisomoonApp/0.1.0 (Linux; Android 14; Mobile) ChatBot/1.0.0')).toBe(false)
		expect(isBotUA('MisomoonApp/0.1.0 (HeadlessChrome; Linux) Recipes/1.0.0')).toBe(true)
	})

	it('reads an ordinary user agent that only mentions MisomoonApp as a browser', () => {
		expect(parseUA('Mozilla/5.0 MisomoonApp/1 (Macintosh) Chrome/141.0.0.0 Safari/537.36').browser).toBe('Chrome')
	})
})

describe('classify', () => {
	const none = readUTM(new URL('https://a.com/'))
	it('puts answer engines in their own channel', () => {
		expect(classify(referrerHost('https://chatgpt.com/'), none, 'a.com')).toMatchObject({ source: 'ChatGPT', channel: 'AI Assistants' })
	})
	it('separates paid from organic search', () => {
		const utm = readUTM(new URL('https://a.com/?utm_source=google&utm_medium=cpc'))
		expect(classify('google.com', utm, 'a.com').channel).toBe('Paid Search')
		expect(classify('google.com', none, 'a.com').channel).toBe('Organic Search')
	})
	it('treats self referrals as direct', () => {
		expect(classify('a.com', none, 'a.com')).toMatchObject({ source: 'Direct', channel: 'Direct' })
	})
	it('reads email campaigns', () => {
		const utm = readUTM(new URL('https://a.com/?utm_source=newsletter&utm_medium=email'))
		expect(classify(null, utm, 'a.com')).toMatchObject({ source: 'Newsletter', channel: 'Email' })
	})
})

describe('parseFilters', () => {
	it('takes the first operator, so values may contain others', () => {
		expect(parseFilters('page~/x?a==1')).toEqual([{ dim: 'page', op: '~', values: ['/x?a==1'] }])
		expect(parseFilters('page!~/a~b')).toEqual([{ dim: 'page', op: '!~', values: ['/a~b'] }])
	})
	it('parses ops and multiple values', () => {
		expect(parseFilters('country==US|CA;page~/blog;browser!=Safari')).toEqual([
			{ dim: 'country', op: '==', values: ['US', 'CA'] },
			{ dim: 'page', op: '~', values: ['/blog'] },
			{ dim: 'browser', op: '!=', values: ['Safari'] },
		])
	})
	it('rejects unknown dimensions', () => {
		expect(() => parseFilters('nope==1')).toThrow()
	})
})

describe('time', () => {
	it('resolves 7d to seven local days', () => {
		const now = Date.UTC(2026, 9, 22, 18, 0)
		const p = resolvePeriod('7d', 420, now)
		expect(p.interval).toBe('day')
		expect(p.from).toBe(Date.UTC(2026, 9, 17) - 420 * 60000) // 18:00 UTC is already the 23rd at +07:00
	})
	it('starts weeks on Monday', () => {
		const wed = Date.UTC(2026, 9, 21, 12)
		expect(new Date(bucketOf(wed, 'week', 0)).getUTCDay()).toBe(1)
	})
})

describe('sharding', () => {
	const GB = 1024 ** 3
	const shards = [
		{ name: 's0', weight: 1, status: 'active' as const, size: 0 },
		{ name: 's1', weight: 1, status: 'active' as const, size: 0 },
		{ name: 's2', weight: 1, status: 'draining' as const, size: 0 },
	]
	it('places sites stably and never on a draining shard', () => {
		const seen = new Set<string>()
		for (let i = 0; i < 200; i++) {
			const a = pickShard(`site${i}`, shards, 8 * GB)
			expect(a).toBe(pickShard(`site${i}`, shards, 8 * GB))
			seen.add(a)
		}
		expect([...seen].sort()).toEqual(['s0', 's1'])
	})
	it('sends most new sites to the shard with the most free space, none to a full one', () => {
		const filled = [
			{ name: 'old', weight: 1, status: 'active' as const, size: 7 * GB },
			{ name: 'new', weight: 1, status: 'active' as const, size: 0 },
			{ name: 'full', weight: 1, status: 'active' as const, size: 9 * GB },
		]
		const counts: Record<string, number> = { old: 0, new: 0, full: 0 }
		for (let i = 0; i < 1000; i++) counts[pickShard(`site${i}`, filled, 8 * GB)]++
		expect(counts.full).toBe(0)
		expect(counts.new).toBeGreaterThan(counts.old * 4)
	})
	it('closes a draining range far enough ahead for cached routes to expire', () => {
		const today = 100
		expect(closingDay(today, today * DAY + 3_600_000, 120_000)).toBe(today)
		expect(closingDay(today, (today + 1) * DAY - 30_000, 120_000)).toBe(today + 1)
		expect(closingDay(today + 1, today * DAY + 3_600_000, 120_000)).toBe(today + 1)
	})
	it('splits a window across ranges on day boundaries', () => {
		const plan = planWindow(
			[
				{ shard: 's0', from_day: 0, to_day: 99 },
				{ shard: 's1', from_day: 100, to_day: null },
			],
			{ from: 98 * DAY, to: 102 * DAY },
		)
		expect(plan).toEqual([
			{ shard: 's0', window: { from: 98 * DAY, to: 100 * DAY } },
			{ shard: 's1', window: { from: 100 * DAY, to: 102 * DAY } },
		])
	})
})

describe('buildEvent with untrusted input', () => {
	it('drops non-string text fields instead of throwing', () => {
		const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
		const row = buildEvent({ s: 'demo', n: 'pageview', u: 'https://misomoon.com/', t: 5, l: ['en'], r: {}, v: 'x' } as never, { ua, ip: '203.0.113.9' })
		expect(row).toMatchObject({ title: null, language: null, referrer: null })
	})

	it('masks an email or a token in the referrer path, as in the page path', () => {
		const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
		const from = (r: string) => (buildEvent({ s: 'demo', n: 'pageview', u: 'https://misomoon.com/', r }, { ua, ip: '203.0.113.9' }) as { referrer: string }).referrer
		expect(from('https://news.example/unsubscribe/jane.doe%40mail.com')).toBe('https://news.example/unsubscribe/:email')
		expect(from('https://app.example/reset/a1b2c3d4e5f6g7h8i9j0k1l2/')).toBe('https://app.example/reset/:token/')
	})

	it('stores an Android app referrer as its address, without the query', () => {
		const ua = 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36'
		const row = buildEvent({ s: 'demo', n: 'pageview', u: 'https://misomoon.com/', r: 'android-app://com.google.android.gm/inbox?x=1' }, { ua, ip: '203.0.113.9' })
		expect(row).toMatchObject({ referrer: 'android-app://com.google.android.gm/inbox', referrer_host: 'mail.google.com' })
	})
})

describe('classify: specific hosts win over brand patterns (F2)', () => {
	const none = readUTM(new URL('https://a.com/'))
	it.each([
		['gemini.google.com', { source: 'Gemini', channel: 'AI Assistants' }],
		['mail.google.com', { source: 'Gmail', channel: 'Email' }],
		['google.co.uk', { source: 'Google', channel: 'Organic Search' }],
		['google.com', { source: 'Google', channel: 'Organic Search' }],
		['yandex.ru', { source: 'Yandex', channel: 'Organic Search' }],
		// a brand pattern only matches at a label boundary
		['mygoogle.example.com', { source: 'mygoogle.example.com', channel: 'Referral' }],
	])('%s', (host, want) => {
		expect(classify(host, none, 'a.com')).toEqual({ ...want, referrer_host: host })
	})
})

describe('classify: visits from X and other known sites', () => {
	const visit = (referrer: string | null, query = '') => {
		const url = new URL(`https://a.com/?${query}`)
		return classify(referrerHost(referrer), readUTM(url), 'a.com', adClick(url))
	}
	it.each([
		['a t.co link', 'https://t.co/abc', '', { source: 'X', channel: 'Organic Social', referrer_host: 't.co' }],
		['utm_source=x with no referrer', null, 'utm_source=x', { source: 'X', channel: 'Organic Social', referrer_host: null }],
		['utm_source=twitter with no referrer', null, 'utm_source=twitter', { source: 'X', channel: 'Organic Social', referrer_host: null }],
		['an X ad click ID', 'https://t.co/abc', 'twclid=abc', { source: 'X', channel: 'Paid Social', referrer_host: 't.co' }],
		['an X ad click ID with no referrer', null, 'twclid=abc', { source: 'X', channel: 'Paid Social', referrer_host: null }],
		['an X ad tagged cpc', 'https://t.co/abc', 'utm_source=x&utm_medium=cpc', { source: 'X', channel: 'Paid Social', referrer_host: 't.co' }],
		['the X Android app', 'android-app://com.twitter.android/', '', { source: 'X', channel: 'Organic Social', referrer_host: 'x.com' }],
		['the Gmail Android app', 'android-app://com.google.android.gm/', '', { source: 'Gmail', channel: 'Email', referrer_host: 'mail.google.com' }],
		['an unknown Android app', 'android-app://org.example.reader/', '', { source: 'org.example.reader', channel: 'Referral', referrer_host: 'org.example.reader' }],
		['utm_source=facebook with no referrer', null, 'utm_source=facebook', { source: 'Facebook', channel: 'Organic Social', referrer_host: null }],
		['utm_source=hacker-news by name', null, 'utm_source=hacker-news', { source: 'Hacker News', channel: 'Organic Social', referrer_host: null }],
		['utm_source=google with no referrer', null, 'utm_source=google', { source: 'Google', channel: 'Organic Search', referrer_host: null }],
		['a Google ad click ID with no referrer', null, 'gclid=abc', { source: 'Google', channel: 'Paid Search', referrer_host: null }],
		['a Bing ad click ID', 'https://www.bing.com/', 'msclkid=abc', { source: 'Bing', channel: 'Paid Search', referrer_host: 'bing.com' }],
		['an X ad with its own utm_source', null, 'utm_source=spring&twclid=abc', { source: 'Spring', channel: 'Paid Social', referrer_host: null }],
		// a subdomain or an AI host's brand is not a source name
		['utm_source=mail', null, 'utm_source=mail', { source: 'Mail', channel: 'Referral', referrer_host: null }],
		['utm_source=news', null, 'utm_source=news', { source: 'News', channel: 'Referral', referrer_host: null }],
		['utm_source=search', null, 'utm_source=search', { source: 'Search', channel: 'Referral', referrer_host: null }],
		['utm_source=meta on a paid ad', null, 'utm_source=meta&utm_medium=paid_social', { source: 'Meta', channel: 'Paid Social', referrer_host: null }],
		['utm_medium=paidsocial', null, 'utm_source=spring&utm_medium=paidsocial', { source: 'Spring', channel: 'Paid Social', referrer_host: null }],
	])('%s', (_, referrer, query, want) => {
		expect(visit(referrer, query)).toEqual(want)
	})
})

describe('parseFilters: operators and dimensions', () => {
	it.each([
		['page~/a==b', { dim: 'page', op: '~', values: ['/a==b'] }],
		['page==/x!=y', { dim: 'page', op: '==', values: ['/x!=y'] }],
		['page!~/a~b', { dim: 'page', op: '!~', values: ['/a~b'] }],
		['browser!=Safari', { dim: 'browser', op: '!=', values: ['Safari'] }],
		['page~a!~b', { dim: 'page', op: '~', values: ['a!~b'] }],
	])('takes the operator that appears first in %s (F7)', (input, want) => {
		expect(parseFilters(input)).toEqual([want])
	})

	it('rejects inherited object keys as dimensions with a 400 error (F18)', () => {
		expect(() => parseFilters('constructor==x')).toThrow(QueryError)
		expect(() => parseFilters('constructor==x')).toThrow('unknown filter dimension: constructor')
		expect(() => dimInfo('toString')).toThrow('unknown dimension: toString')
		expect(isDimension('toString')).toBe(false)
		expect(isDimension('__proto__')).toBe(false)
		expect(isDimension('page')).toBe(true)
	})
})

describe('predicate', () => {
	it.each(['device.type', 'os-name', 'user.country', 'name'])('keeps the property key %s intact (F6)', (key) => {
		const params: unknown[] = []
		expect(predicate({ dim: `prop:${key}`, op: '==', values: ['x'] }, 'e', params)).toBe(`json_extract(e.props, '$."${key}"') = ?`)
		expect(params).toEqual(['x'])
	})

	it('still qualifies plain columns', () => {
		const params: unknown[] = []
		expect(predicate({ dim: 'os_version', op: '==', values: ['iOS 19'] }, 's', params)).toBe("s.os || ' ' || COALESCE(s.os_version, '') = ?")
	})
})
