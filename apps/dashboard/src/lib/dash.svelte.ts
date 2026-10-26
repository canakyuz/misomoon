import { can } from '@misomoon/core/roles'
import { createContext, untrack } from 'svelte'
import { liveDemo } from './account'
import { demoPath, embedded, emailLink, get, signupLink, type Me, type Site } from './api'
import { themeMessage } from './embed'
import { filterProblem, readUrlState, serializeFilters, VIEWS, type Filter, type FilterOp, type MetricKey, type View } from './url'

export { PERIODS, VIEWS } from './url'
export type { Filter, FilterOp, MetricKey, View } from './url'

/**
 * Everything the dashboard is looking at. It mirrors itself into the URL so any
 * view, with its filters and period, can be shared as a link.
 */
export class Dash {
	me = $state.raw<Me | null>(null)
	site = $state<string | null>(null)
	view = $state<View>('overview')
	period = $state('30d')
	from = $state<string | null>(null)
	to = $state<string | null>(null)
	compare = $state(true)
	/** what the comparison is against: the previous period or the same dates a year earlier */
	compareTo = $state<'previous' | 'year'>('previous')
	/** include imported history (Google, CSV) in unfiltered reports */
	imported = $state(true)
	filters = $state<Filter[]>([])
	metric = $state<MetricKey>('visitors')
	/** the open Settings tab; empty picks the first one the page offers */
	settingsTab = $state(new URLSearchParams(location.search).get('tab') ?? '')
	paletteOpen = $state(false)
	theme = $state<'dark' | 'light'>('light')
	/** bumps to refetch everything (realtime tick, manual refresh) */
	tick = $state(0)
	/** a short message for the user, e.g. a filter the server would refuse */
	notice = $state<string | null>(null)

	/** the `compare` query value for stats requests */
	compareParam = $derived(this.compare ? this.compareTo : '0')

	/** the demo dashboard at /demo: the sample site with made-up data, read-only, no settings */
	readonly isSample = demoPath
	/** inside the landing's fig. 1: no top bar or view tabs, and the landing's theme */
	readonly isEmbed = !!embedded
	sites = $derived(this.isSample ? (this.me?.sites ?? []).filter((s) => s.id === this.me?.sample) : (this.me?.sites ?? []))
	current = $derived<Site | null>(this.sites.find((s) => s.id === this.site) ?? null)
	isDemo = $derived(liveDemo(this.me, this.site))
	/** opened from a shared link: read-only, no settings */
	isShared = $derived(!!this.me?.share)
	/** the views this visitor can open, in menu order; read-only dashboards have no settings */
	views = $derived<View[]>(this.isShared || this.isSample ? VIEWS.filter((v) => v !== 'settings') : VIEWS)
	signedIn = $derived(this.me?.kind === 'user')
	/** your role on the current site, which decides what the dashboard offers */
	role = $derived(this.current?.role ?? null)
	canEdit = $derived(can(this.role, 'edit'))
	canManage = $derived(can(this.role, 'manage'))
	/** shows the sign-in screen over the dashboard */
	authOpen = $state(signupLink)
	/** an invitation or reset link being handled */
	authLink = $state(emailLink)
	/** why a Google sign-in came back without an account, for the sign-in screen */
	loginError = $state<string | null>(null)
	hasSearch = $derived(!!this.site && (this.me?.search ?? []).includes(this.site))
	hasImports = $derived(!!this.site && (this.me?.imported ?? []).includes(this.site))

	/** The query string shared by every stats request. */
	params = $derived.by(() => {
		const p = new URLSearchParams()
		if (this.site) p.set('site', this.site)
		p.set('period', this.period)
		if (this.period === 'custom' && this.from && this.to) {
			p.set('from', this.from)
			p.set('to', this.to)
		}
		if (this.filters.length) p.set('filters', serializeFilters(this.filters))
		if (!this.imported) p.set('imported', '0')
		return p.toString()
	})

	constructor() {
		const u = readUrlState(location.search)
		this.site = u.site
		this.period = u.period
		this.from = u.from
		this.to = u.to
		this.compare = u.compare
		this.compareTo = u.compareTo
		this.imported = u.imported
		this.filters = u.filters
		this.view = u.view
		this.metric = u.metric
		try {
			const t = localStorage.getItem('misomoon.theme')
			this.theme = embedded?.theme ?? (t === 'light' || t === 'dark' ? t : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
		} catch {}
		this.applyTheme()
		// embedded, the page around follows its own day and night switch; this one isn't saved
		if (embedded)
			addEventListener('message', (e) => {
				const t = themeMessage(e.data)
				if (!t) return
				this.theme = t
				this.applyTheme()
			})

		$effect.root(() => {
			$effect(() => {
				const q = new URLSearchParams()
				if (this.site) q.set('site', this.site)
				if (this.view !== 'overview') q.set('view', this.view)
				if (this.view === 'settings' && this.settingsTab) q.set('tab', this.settingsTab)
				if (this.period !== '30d') q.set('period', this.period)
				if (this.period === 'custom' && this.from && this.to) {
					q.set('from', this.from)
					q.set('to', this.to)
				}
				if (this.filters.length) q.set('f', serializeFilters(this.filters))
				if (!this.compare) q.set('compare', '0')
				else if (this.compareTo === 'year') q.set('compare', 'year')
				if (this.metric !== 'visitors') q.set('metric', this.metric)
				if (!this.imported) q.set('imported', '0')
				const s = q.toString()
				const url = s ? `?${s}` : location.pathname
				untrack(() => history.replaceState(null, '', url))
			})
		})
	}

	async load() {
		this.me = await get<Me>('/api/v1/me', undefined, 0)
		const ids = this.sites.map((s) => s.id)
		// signed out at the app's address: the sign-in screen, not a public site. /demo is the demo,
		// and a link with ?site= still opens that public site.
		if (this.me.kind === 'anonymous' && !this.isSample && !this.isEmbed && (!this.site || !ids.includes(this.site))) {
			this.site = null
			this.authOpen = true
			return
		}
		if (!this.site || !ids.includes(this.site)) this.site = (this.me.demo && ids.includes(this.me.demo) ? this.me.demo : ids[0]) ?? null
		if (this.isSample && this.view === 'settings') this.view = 'overview'
	}

	/** Filters belong to one site's data, so switching site clears them. */
	switchSite(id: string) {
		if (id === this.site) return
		this.site = id
		this.filters = []
		this.notice = null
	}

	setPeriod(key: string, from?: string, to?: string) {
		this.period = key
		this.from = from ?? null
		this.to = to ?? null
	}

	hasFilter(dim: string, value: string) {
		return this.filters.some((f) => f.dim === dim && f.op === '==' && f.values.includes(value))
	}

	/** Clicking a row filters by it; clicking it again (or the chip) removes it. */
	toggleFilter(dim: string, value: string, op: FilterOp = '==') {
		const existing = this.filters.find((f) => f.dim === dim)
		if (existing && existing.op === op && existing.values.length === 1 && existing.values[0] === value) {
			this.filters = this.filters.filter((f) => f !== existing)
			this.notice = null
		} else {
			this.setFilter({ dim, op, values: [value] })
		}
	}

	/** Adds or replaces the filter for `f.dim`; returns false (and sets `notice`) when the server would refuse it. */
	setFilter(f: Filter): boolean {
		this.notice = filterProblem(this.filters, f)
		if (this.notice) return false
		this.filters = [...this.filters.filter((x) => x.dim !== f.dim), f]
		return true
	}

	removeFilter(dim: string) {
		this.filters = this.filters.filter((f) => f.dim !== dim)
	}

	toggleTheme() {
		this.theme = this.theme === 'dark' ? 'light' : 'dark'
		try {
			localStorage.setItem('misomoon.theme', this.theme)
		} catch {}
		this.applyTheme()
	}

	private applyTheme() {
		document.documentElement.dataset.theme = this.theme
	}
}

export const [getDash, setDash] = createContext<Dash>()

/**
 * Loads JSON for a URL that depends on reactive state, keeping the previous
 * result on screen while the next one loads so panels never flash empty.
 */
export class Resource<T> {
	data = $state.raw<T | null>(null)
	error = $state<string | null>(null)
	loading = $state(false)

	constructor(url: () => string | null, ttl?: number) {
		let ctrl: AbortController | null = null
		$effect(() => {
			const u = url()
			ctrl?.abort()
			if (!u) {
				this.data = null
				this.error = null
				this.loading = false
				return
			}
			const mine = (ctrl = new AbortController())
			this.loading = true
			get<T>(u, mine.signal, ttl)
				.then((d) => {
					if (mine.signal.aborted) return
					this.data = d
					this.error = null
				})
				.catch((e) => {
					if (mine.signal.aborted) return
					this.error = e.message
				})
				.finally(() => {
					if (!mine.signal.aborted) this.loading = false
				})
		})
	}
}
