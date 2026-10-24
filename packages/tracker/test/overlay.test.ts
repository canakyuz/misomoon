import { readFileSync } from 'node:fs'
import { Window } from 'happy-dom'
import { afterEach, describe, expect, it } from 'vite-plus/test'

const code = readFileSync(new URL('../src/overlay.js', import.meta.url), 'utf8')

let open: Window[] = []
afterEach(async () => {
	await Promise.all(open.map((w) => w.happyDOM.close()))
	open = []
})

function load(html: string, opener: unknown, url = 'https://shop.com/pricing#misomoon-overlay') {
	const win = new Window({ url })
	open.push(win)
	win.document.body.innerHTML = html
	Object.defineProperty(win, 'opener', { value: opener })
	// happy-dom lays nothing out
	win.HTMLElement.prototype.getBoundingClientRect = function () {
		return { left: 10, top: 20, width: 100, height: 40, right: 110, bottom: 60, x: 10, y: 20, toJSON() {} } as DOMRect
	}
	new Function('window', 'document', 'setTimeout', 'setInterval', 'clearTimeout', code)(win, win.document, () => 0, () => 0, () => {})
	const reply = (source: unknown, data: unknown) => win.dispatchEvent(new win.MessageEvent('message', { data, source: source as never }) as unknown as Event)
	const marks = () => [...win.document.body.querySelectorAll(':scope > div')].flatMap((d) => [...d.querySelectorAll('span')].map((s) => s.textContent))
	const panel = () => [...win.document.body.children].find((e) => e.shadowRoot)!.shadowRoot!.textContent
	return { win, reply, marks, panel }
}

const data = {
	misomoon: 'overlay-data',
	path: '/pricing',
	clicks: {
		pageviews: 40,
		clicks: 10,
		elements: [
			{ selector: '#buy', label: 'Buy', clicks: 8, rage: 2, dead: 0 },
			{ selector: '#gone', label: 'Gone', clicks: 2, rage: 0, dead: 0 },
			{ selector: 'div{', label: 'Broken', clicks: 1, rage: 0, dead: 0 },
		],
	},
	scroll: { visits: 4, average: 60, reached: [] },
}

describe('overlay.js', () => {
	it('asks the window that opened it for the page, and draws only what it answers', () => {
		const posted: unknown[] = []
		const opener = { closed: false, postMessage: (m: unknown) => posted.push(m) }
		const t = load('<button id="buy">Buy</button>', opener)
		expect(posted).toEqual([{ misomoon: 'overlay', path: '/pricing' }])
		// another window can't draw on the page
		t.reply({}, data)
		expect(t.marks()).toEqual([])
		t.reply(opener, { ...data, path: '/other' })
		expect(t.marks()).toEqual([])
		t.reply(opener, data)
		expect(t.marks()).toEqual(['8 · 80% · 2 rage'])
		expect(t.panel()).toContain('10 clicks on 3 elements, 40 pageviews')
		expect(t.panel()).toContain('2 clicked elements are not on the page right now')
	})

	it('asks for a hash route as the page, the way the server stores it', () => {
		const posted: unknown[] = []
		load('', { closed: false, postMessage: (m: unknown) => posted.push(m) }, 'https://shop.com/#/app/home#misomoon-overlay')
		expect(posted).toEqual([{ misomoon: 'overlay', path: '/#/app/home' }])
	})

	it('writes labels as text, never as markup', () => {
		const opener = { closed: false, postMessage() {} }
		const t = load('<button id="buy">Buy</button>', opener)
		t.reply(opener, { ...data, clicks: { ...data.clicks, elements: [{ selector: '#buy', label: '<img src=x onerror=alert(1)>', clicks: 1, rage: 0, dead: 0 }] } })
		expect(t.win.document.querySelectorAll('img')).toHaveLength(0)
	})

	it('says how to connect when nothing opened it', () => {
		const t = load('', null)
		expect(t.panel()).toContain('Not connected to misomoon.')
		expect(t.marks()).toEqual([])
	})
})
