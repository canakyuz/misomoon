import { describe, expect, it } from 'vite-plus/test'
import { countryName, isCountry } from '../src/lib/countries'

describe('country names (F30, F36)', () => {
	it('tells the two Congos apart', () => {
		expect([countryName('CD'), countryName('CG')]).toEqual(['DR Congo', 'Congo'])
	})

	it('names the placeholder codes instead of showing them raw', () => {
		expect([countryName('XX'), countryName('T1'), countryName('(none)'), countryName(null)]).toEqual(['Unknown', 'Tor network', 'Unknown', 'Unknown'])
	})

	it('knows which codes are real countries on the map', () => {
		expect(['US', 'DE', 'XX', 'T1', '(none)', ''].map(isCountry)).toEqual([true, true, false, false, false, false])
	})
})
