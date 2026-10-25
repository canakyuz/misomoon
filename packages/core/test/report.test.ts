import { describe, expect, it } from 'vite-plus/test'
import { headline, lede, percentChange, printReport, renderReport, reportDue, type ReportData } from '../src'

const agg = { visitors: 1200, visits: 1500, pageviews: 4000, views_per_visit: 2.67, bounce_rate: 41, visit_duration: 95, events: 50, revenue: 0, average_revenue: 0 }

const week = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']

function data(over: Partial<ReportData> = {}): ReportData {
	return {
		site: { name: 'shop <b>', domain: 'shop.com' },
		kind: 'Weekly',
		label: 'Oct 12 – Oct 18',
		edition: 'Week 42, 2026',
		issued: '2026-10-19',
		next: '2026-10-26',
		currency: 'USD',
		current: agg,
		previous: { ...agg, visitors: 1000, bounce_rate: 45 },
		days: week.map((date, i) => ({ date, visitors: [100, 120, 300, 150, 90, 60, 40][i], previous: 80 })),
		pages: [{ key: '/pricing', visitors: 300 }],
		sources: [
			{ key: 'Google', visitors: 500, revenue: 120, change: 25 },
			{ key: 'Direct', visitors: 300, revenue: 0, change: -10 },
		],
		countries: [{ key: 'US', visitors: 400 }],
		devices: [{ key: 'Mobile', visitors: 700 }],
		goals: [{ key: 'Signup', visitors: 40, conversion_rate: 3.3 }],
		link: 'https://misomoon.com/?site=shop',
		...over,
	}
}

describe('email reports', () => {
	it('names the site and the visitors in the subject, and the revenue when there is some', () => {
		expect(renderReport(data()).subject).toBe('Weekly report for shop <b>: 1,200 visitors')
		expect(renderReport(data({ current: { ...agg, revenue: 4210.5, average_revenue: 42.1 } })).subject).toBe('Weekly report for shop <b>: 1,200 visitors, $4,210.50')
	})

	it('escapes names in the html', () => {
		const r = renderReport(data({ pages: [{ key: '/a?<script>', visitors: 3 }] }))
		expect(r.html).toContain('shop &lt;b&gt;')
		expect(r.html).not.toContain('<script>')
		expect(r.html).toContain('/a?&lt;script&gt;')
	})

	it('prints changes against the period before, bounce rate in points', () => {
		const r = renderReport(data())
		expect(r.html).toContain('▲&nbsp;20%') // visitors 1000 → 1200, in the markets table
		expect(r.html).toContain('>1,000<') // the period before, beside it
		expect(r.html).toContain('▼&nbsp;4 pts') // bounce 45 → 41, printed as good
		expect(r.text).toContain('Visitors: 1,200 (+20%)')
		expect(r.text).toContain('Bounce rate: 41% (-4 pts)')
	})

	it('leaves the change out when there is no period before', () => {
		const r = renderReport(data({ previous: null }))
		expect(r.text).toContain('Visitors: 1,200\n')
		expect(r.html).not.toContain('▲&nbsp;20%')
		expect(r.html).not.toContain('Dashed: the week before')
	})

	it('writes the lede from the numbers', () => {
		expect(lede(data())).toEqual(['1,200 people visited shop.com, 20% more than the week before.', 'Most came from Google, and Wednesday was the busiest day.'])
		expect(lede(data({ kind: 'Monthly', previous: { ...agg, visitors: 1500 } }))[0]).toBe('1,200 people visited shop.com, 20% fewer than the month before.')
		expect(lede(data({ previous: agg }))[0]).toBe('1,200 people visited shop.com, the same as the week before.')
		expect(lede(data({ current: { ...agg, visitors: 1 }, previous: null }))[0]).toBe('1 person visited shop.com.')
		expect(lede(data({ sources: [{ key: 'Direct', visitors: 9 }] }))[1]).toBe('Most came in directly, and Wednesday was the busiest day.')
		expect(lede(data({ current: { ...agg, revenue: 99, average_revenue: 33 } }))[2]).toBe('Together they paid $99.00.')
		expect(lede(data({ current: { ...agg, visitors: 0 } }))[0]).toBe('Nobody visited shop.com this week.')
	})

	it('names the busiest day by date in a monthly report', () => {
		expect(lede(data({ kind: 'Monthly' }))[1]).toBe('Most came from Google, and Oct 14 was the busiest day.')
	})

	it('draws one bar per day with the busiest one labelled', () => {
		const r = renderReport(data())
		expect(r.html.match(/valign="bottom"/g)).toHaveLength(7)
		expect(r.html).toMatch(/>300<\/div>/) // the busiest bar's count
		expect(r.html).toContain('Fig. 1. Visitors per day, Oct 12 – Oct 18. Dashed: the week before. Busiest: Wednesday.')
		expect(r.text).toContain('Busiest day: Wednesday (300 visitors)')
	})

	it('skips the chart without days', () => {
		expect(renderReport(data({ days: [] })).html).not.toContain('Fig. 1')
	})

	it('prints a revenue receipt only when there was revenue', () => {
		expect(renderReport(data()).html).not.toContain('Average payment')
		const r = renderReport(data({ current: { ...agg, revenue: 4210.5, average_revenue: 42.1 }, previous: { ...agg, revenue: 2105.25 } }))
		expect(r.html).toContain('$4,210.50')
		expect(r.html).toContain('Average payment')
		expect(r.html).toContain('+100%')
		expect(r.html).toContain('$3.51') // revenue per visitor
		expect(r.html).toContain('Top paying sources')
		expect(r.html).toContain('$120.00') // Google paid; Direct didn't and isn't listed
		expect(r.text).toContain('Total: $4,210.50 (+100%)')
	})

	it('prints the receipt in the site currency', () => {
		const r = renderReport(data({ currency: 'EUR', current: { ...agg, revenue: 10, average_revenue: 10 } }))
		expect(r.html).toContain('€10.00')
		expect(r.html).toContain('Counted in EUR')
	})

	it('lists sources with their change, and names countries', () => {
		const r = renderReport(data())
		expect(r.html).toContain('+25%')
		expect(r.html).toContain('-10%')
		expect(r.html).toContain('United States')
		expect(r.text).toContain('  United States  400')
		expect(r.text).toContain('  /pricing  300')
		expect(r.text).toContain('  Signup  40 (3.3%)')
	})

	it('prints a front page, inside pages and a back page, and indexes them', () => {
		const r = renderReport(data({ current: { ...agg, revenue: 50, average_revenue: 25 } }))
		// masthead, dateline and ears
		expect(r.html).toContain('the misomoon weekly')
		expect(r.html).toContain('Week 42, 2026 &nbsp;·&nbsp; Monday, October 19, 2026')
		expect(r.html).toContain('Next edition <b style="color:#17140f">Mon, Oct 26</b>')
		// one running head per inside page and the back page
		expect([...r.html.matchAll(/>(Business|Arrivals|World|Back page)<\/td>/g)].map((m) => m[1])).toEqual(['Business', 'Arrivals', 'World', 'Back page'])
		expect(r.html).toContain('Page 5</td>')
		expect(r.text).toMatch(/PAGE 2: BUSINESS[\s\S]*PAGE 3: ARRIVALS[\s\S]*PAGE 4: WORLD[\s\S]*PAGE 5: BACK PAGE/)
		// the index points at the pages that exist
		const index = (k: string) => new RegExp(`>${k}</td>[\\s\\S]*?>(\\d)</td>`).exec(r.html)?.[1]
		expect([index('Revenue'), index('Top sources'), index('Most read'), index('Countries'), index('Scoreboard'), index('Almanac')]).toEqual(['2', '3', '3', '4', '5', '5'])
	})

	it('drops the business page without revenue and renumbers the rest', () => {
		const r = renderReport(data())
		expect(r.html).not.toContain('>Business</td>')
		expect(r.html).toContain('Page 4</td>') // the back page
		expect(r.html).not.toContain('Page 5</td>')
		expect(r.text).toContain('PAGE 2: ARRIVALS')
	})

	it('drops the world page without countries or devices', () => {
		const r = renderReport(data({ countries: [], devices: [] }))
		expect(r.html).not.toContain('>World</td>')
		expect(r.html).toContain('Page 3</td>')
	})

	it('writes each inside page its own headline', () => {
		const r = renderReport(data({ current: { ...agg, revenue: 4210.5, average_revenue: 42.1 }, previous: { ...agg, revenue: 2105.25 } }))
		expect(r.html).toContain('$4,211 in revenue')
		expect(r.html).toContain('Up 100% on the week before. Google paid the most: $120.00.')
		expect(r.html).toContain('Google sent the most')
		expect(r.html).toContain('500 visitors, 42% of the week. The most read page was /pricing.')
		expect(r.html).toContain('United States leads')
		expect(r.html).toContain('400 visitors, 33% of the week. 58% were on mobile.')
	})

	it('calls / the home page in sentences and records', () => {
		const r = renderReport(data({ pages: [{ key: '/', visitors: 300 }] }))
		expect(r.html).toContain('The most read page was the home page.')
		expect(r.text).toContain('Most read: Home page, 300 visitors')
	})

	it('leads the back page with the best goal, then the almanac and the colophon', () => {
		const r = renderReport(data())
		expect(r.html).toContain('Signup leads the table')
		expect(r.html).toContain('40 visitors reached it, 3.3% of everyone who came.')
		expect(r.text).toContain('Busiest day: Wednesday, 300 visitors')
		expect(r.text).toContain('Quietest day: Sunday, 40 visitors')
		expect(r.text).toContain('Top source: Google, 42% of visitors')
		expect(r.text).toContain('The next edition comes out Monday, October 26, 2026.')
		expect(r.html).toContain('Open the dashboard')
		expect(r.html.indexOf('Signup leads the table')).toBeLessThan(r.html.indexOf('Open the dashboard'))
	})

	it('names the almanac on the back page when no goal is set up', () => {
		const r = renderReport(data({ goals: [] }))
		expect(r.html).toContain('The week in records')
		expect(r.html).not.toContain('Scoreboard')
	})

	it('prints the misomoon logo under the masthead and on the back page', () => {
		const logo = { light: 'https://app.test/email/misomoon-light.png', dark: 'https://app.test/email/misomoon-dark.png' }
		const r = renderReport(data({ logo }))
		expect(r.html).toContain('<img src="https://app.test/email/misomoon-light.png" width="140" height="26" alt="misomoon"')
		expect(r.html).toContain('<img src="https://app.test/email/misomoon-dark.png" width="194" height="36" alt="misomoon"')
		expect(r.html).not.toContain('the misomoon weekly')
		// the paper one on the front page, the ink one last
		expect(r.html.indexOf('misomoon-light.png')).toBeLessThan(r.html.indexOf('misomoon-dark.png'))
	})

	it('names misomoon in words when there is no logo', () => {
		const r = renderReport(data())
		expect(r.html).toContain('the misomoon weekly')
		expect(r.html).not.toContain('<img')
	})

	it('stacks columns and shrinks type on phones', () => {
		const r = renderReport(data())
		const phone = /@media \(max-width:480px\)\{([\s\S]*?)\n\}/.exec(r.html)?.[1] ?? ''
		expect(phone).toContain('.mm-stack{display:block!important;width:100%!important')
		expect(phone).toContain('.mm-h1{font-size:32px!important}')
		// the columns are table cells that phones turn into rows, under a 44px headline that shrinks
		expect(r.html.match(/<td class="mm-stack"/g)!.length).toBeGreaterThanOrEqual(2)
		expect(r.html).toMatch(/<h1 class="mm-h1" style="font:800 44px/)
	})
})

describe('headline', () => {
	it('leads with the biggest move, else revenue, else the count', () => {
		expect(headline(data())).toBe('Visitors up 20%')
		expect(headline(data({ previous: { ...agg, visitors: 2000 } }))).toBe('Visitors down 40%')
		expect(headline(data({ previous: { ...agg, visitors: 1150 }, current: { ...agg, revenue: 980.5 } }))).toBe('$980.50 in revenue')
		expect(headline(data({ previous: { ...agg, visitors: 1150 }, current: { ...agg, revenue: 12_400 } }))).toBe('$12,400 in revenue')
		expect(headline(data({ previous: agg }))).toBe('1,200 visitors this week')
		expect(headline(data({ kind: 'Monthly', current: { ...agg, visitors: 0 } }))).toBe('A quiet month')
	})
})

describe('percentChange', () => {
	it('is a whole percent, or null with nothing to compare', () => {
		expect([percentChange(120, 100), percentChange(50, 200), percentChange(5, 0), percentChange(5, undefined)]).toEqual([20, -75, null, null])
	})
})

describe('reportDue', () => {
	it('is due on Monday morning local time, once', () => {
		const mon9 = Date.UTC(2026, 9, 19, 2) // 09:00 in UTC+7
		expect(reportDue('weekly', null, mon9, 420)).toBe(true)
		expect(reportDue('weekly', mon9 - 3600_000, mon9, 420)).toBe(false)
		expect(reportDue('weekly', null, mon9, 0)).toBe(false) // 02:00 UTC
		expect(reportDue('monthly', null, Date.UTC(2026, 10, 1, 9), 0)).toBe(true)
	})
})

describe('printReport', () => {
	const { html } = renderReport(data())
	const print = printReport(html)

	it('keeps the email as it is and adds the print layout to its head', () => {
		const [head, body] = print.split('</head>')
		expect(body).toBe(html.split('</head>')[1])
		expect(head.startsWith(html.split('</head>')[0])).toBe(true)
		expect(print.match(/<\/head>/g)).toHaveLength(1)
	})

	it('loads the brand fonts at the brand widths, over the inline font shorthand', () => {
		expect(print).toContain('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=Martian+Mono:wdth,wght@75..112.5,300..700&display=block">')
		expect(print).toContain('[style*="Arial Narrow"]{font-stretch:68%!important;word-spacing:.08em}')
		expect(print).toContain('[style*="Martian Mono"]{font-stretch:87.5%!important}')
		// the selectors find what the email writes
		expect(html).toContain("Arial Narrow")
		expect(html).toContain("Martian Mono")
	})

	it('prints every sheet on its own page with the backgrounds, then marks the body', () => {
		expect(print).toContain('print-color-adjust:exact')
		expect(print).toContain("document.querySelectorAll('table[width=\"560\"]')")
		expect(print).toContain("'@page{size:' + W + 'px ' + H + 'px;margin:0}'")
		expect(print).toContain('break-after:page')
		expect(print).toContain('await document.fonts.ready')
		expect(print).toContain('document.body.dataset.printed')
		// only sheets match: the front, Arrivals, World and the back page (no revenue, no Business)
		expect(html.match(/<table width="560"/g)).toHaveLength(4)
	})
})
