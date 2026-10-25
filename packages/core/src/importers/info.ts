/**
 * The tools misomoon imports history from through their APIs, and the fields each asks
 * for. The dashboard reads this file to draw the import form, so it imports nothing.
 *
 * AGENTS.md: this folder may name other products. Code elsewhere prints the names it
 * reads from here and never types one.
 */

export interface ImportField {
	name: string
	label: string
	/** `secret` fields are sent once and kept only while the import runs */
	kind: 'text' | 'url' | 'secret'
	placeholder?: string
	/** shown under the field */
	help?: string
	optional?: boolean
	/** shown only while another field is empty (`set: false`) or filled in (`set: true`) */
	when?: { field: string; set: boolean }
}

export interface ImporterInfo {
	id: string
	/** the product's name, printed on the import form and the import's row */
	name: string
	fields: ImportField[]
	/** the docs page that walks through the switch, without `.md` */
	guide: string
}

export const IMPORTER_INFO: ImporterInfo[] = [
	{
		id: 'umami',
		name: 'Umami',
		guide: 'migrate-umami',
		fields: [
			{ name: 'url', label: 'Server address', kind: 'url', optional: true, placeholder: 'https://umami.example.com', help: 'Leave empty for Umami Cloud.' },
			{ name: 'website', label: 'Website ID', kind: 'text', placeholder: '94db1cb1-74f4-4a40-ad6c-962362670409', help: 'In Umami, under Settings > Websites > Edit.' },
			{ name: 'key', label: 'API key', kind: 'secret', help: 'In Umami Cloud, under Settings > API keys.', when: { field: 'url', set: false } },
			{ name: 'username', label: 'Username', kind: 'text', help: 'A user on your server who can view the website.', when: { field: 'url', set: true } },
			{ name: 'password', label: 'Password', kind: 'secret', when: { field: 'url', set: true } },
		],
	},
	{
		id: 'matomo',
		name: 'Matomo',
		guide: 'migrate-matomo',
		fields: [
			{ name: 'url', label: 'Matomo address', kind: 'url', placeholder: 'https://example.matomo.cloud', help: 'The address you open Matomo at, on Matomo Cloud or your own server.' },
			{ name: 'site', label: 'Site ID', kind: 'text', placeholder: '1', help: 'In Matomo, under Administration > Websites > Manage.' },
			{ name: 'token', label: 'Auth token', kind: 'secret', help: 'In Matomo, under Personal > Security > Auth tokens, for a user who can view the site.' },
		],
	},
	{
		id: 'pirsch',
		name: 'Pirsch',
		guide: 'migrate-pirsch',
		fields: [
			{ name: 'client', label: 'Client ID', kind: 'text', help: 'In Pirsch, under Settings > Developer, add an oAuth client. An access key can only send data.' },
			{ name: 'secret', label: 'Client secret', kind: 'secret' },
			{ name: 'domain', label: 'Domain', kind: 'text', optional: true, placeholder: 'example.com', help: 'Only for a client that reads more than one dashboard.' },
		],
	},
	{
		id: 'datafast',
		name: 'DataFast',
		guide: 'migrate-datafast',
		fields: [{ name: 'key', label: 'API key', kind: 'secret', placeholder: 'df_…', help: 'In DataFast, under Website settings > API. It reads this one website.' }],
	},
	{
		id: 'fathom',
		name: 'Fathom',
		guide: 'migrate-fathom',
		fields: [
			{ name: 'site', label: 'Site ID', kind: 'text', placeholder: 'CDBUGS', help: 'The code in your Fathom embed script, also under Settings > Sites.' },
			{ name: 'token', label: 'API token', kind: 'secret', help: 'In Fathom, under Settings > API. A read-only token for this site is enough.' },
		],
	},
]

export const importerInfo = (id: string) => IMPORTER_INFO.find((i) => i.id === id)
