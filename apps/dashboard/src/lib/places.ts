/** Timezone and currency choices for a site, with guesses from the browser so adding one asks only for the domain. */

export const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone

const REGION_CURRENCY: Record<string, string> = {
	ID: 'IDR', MY: 'MYR', SG: 'SGD', PH: 'PHP', TH: 'THB', VN: 'VND', IN: 'INR', JP: 'JPY', KR: 'KRW', CN: 'CNY', HK: 'HKD', TW: 'TWD',
	AU: 'AUD', NZ: 'NZD', GB: 'GBP', CA: 'CAD', BR: 'BRL', MX: 'MXN', CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN', TR: 'TRY',
	AE: 'AED', SA: 'SAR', ZA: 'ZAR', NG: 'NGN', DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', IE: 'EUR', PT: 'EUR', AT: 'EUR', BE: 'EUR', FI: 'EUR',
}
// the timezone says where you are more often than the browser language does (en-US is everywhere)
const ZONE_CURRENCY: Record<string, string> = {
	'Asia/Jakarta': 'IDR', 'Asia/Makassar': 'IDR', 'Asia/Jayapura': 'IDR', 'Asia/Pontianak': 'IDR', 'Asia/Singapore': 'SGD',
	'Asia/Kuala_Lumpur': 'MYR', 'Asia/Manila': 'PHP', 'Asia/Bangkok': 'THB', 'Asia/Ho_Chi_Minh': 'VND', 'Asia/Kolkata': 'INR',
	'Asia/Calcutta': 'INR', 'Asia/Tokyo': 'JPY', 'Asia/Seoul': 'KRW', 'Asia/Hong_Kong': 'HKD', 'Asia/Dubai': 'AED', 'Europe/London': 'GBP',
}

export function guessCurrency(): string {
	if (ZONE_CURRENCY[browserZone]) return ZONE_CURRENCY[browserZone]
	for (const l of navigator.languages ?? []) {
		const region = new Intl.Locale(l).maximize().region
		if (region && REGION_CURRENCY[region]) return REGION_CURRENCY[region]
	}
	return 'USD'
}

export const COMMON_CURRENCIES = ['USD', 'EUR', 'GBP', 'IDR', 'SGD', 'AUD', 'CAD', 'JPY', 'INR']
export const currencies = Intl.supportedValuesOf('currency')
const names = new Intl.DisplayNames([navigator.language], { type: 'currency' })
/** "Indonesian Rupiah" for IDR */
export const currencyName = (c: string) => names.of(c) ?? c

/** every zone Intl knows, plus `extra` (a site's saved zone) in case this browser's list lacks it */
export const zonesWith = (...extra: string[]) => [...new Set([...extra, browserZone, 'UTC', ...Intl.supportedValuesOf('timeZone')])].sort()
/** "Asia/Ho_Chi_Minh" reads as "Ho Chi Minh" */
export const zoneCity = (z: string) => (z.split('/').pop() ?? z).replaceAll('_', ' ')

export const regionName = { eu: 'European Union', us: 'United States', apac: 'Asia-Pacific' } as const
