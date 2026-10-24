import { browserParts, buildEvent, can, DAY, demoTraffic, monthStart, parseFilters, PLAN_RETENTION_LIMIT, planInfo, QueryError, utcMonth, serializeFilters, siteFeatures, storeFeatures, storeIpRules, storePathRules, storePlanRetention, storeSearchParams, retentionDays, serverRegions, teamPlan, utcDay, visitorId, type EventRow } from '@misomoon/core'
import tracker from '@misomoon/tracker/m.min.js'
import { Hono, type Context } from 'hono'
import { cors } from 'hono/cors'
import { accounts, createTeam, signupsOpen } from './accounts'
import { authenticate, authorize, getSharedLink, hashPassword, requireUser, siteRole, teamRole, unlockShare, visibleSites, type Principal } from './auth'
import { moveTargets, retireShards } from './moves'
import { checkCurrency, checkTimezone, conflict, createSite, getRanges, getShards, getSite, HttpError, invalidate, listSites, purge, shardDb, shardLimit, SITE_ID } from './control'
import { acceptBeacon, writeEvents } from './ingest'
import { fillSample } from './sample'
import { deleteSite } from './sites'
import { googleCallback, googleConnect } from './google'
import { deleteImport, googleProperties, importCsv, listImports, startGoogleImport } from './imports'
import { connectSearch, disconnectSearch, searchProperties, searchStatus } from './searchconsole'
import { expireAttribution, handleWebhook, listSources, removeSource, saveSource } from './revenue'
import { checkout, polarWebhook, portal, teamBilling, withBilling } from './billing'
import { handleMcp } from './mcp'
import { buildReport, emailConfigured, reportPdf, runAlerts, runReports, sendEmail, withPdf } from './reports'
import { dailyCap } from './usage'
import { checkInstall } from './install'
import { v2Query } from './v2'
import { getProxy, isProxyHost, removeProxy, setProxy } from './proxy'
import { monthEvents, plansEnforced, serverRetention, setPlans, siteRetention, teamPlanOf, teamPlans, teamTermsOf } from './plans'
import { aggregateStats, behaviorStats, breakdownStats, cleanSteps, dimensions, exportStats, funnelStats, journeyStats, listGoals, realtimeStats, timeseriesStats, vitalsStats, type StatsInput } from './stats'

type App = { Bindings: Env; Variables: { who: Principal } }
const app = new Hono<App>()
const MAX_GOALS = 50

// ---------------------------------------------------------------- tracking

// A customer's managed proxy hostname (stats.example.com) only serves the tracker. The
// Worker runs first for every path (wrangler.jsonc), so this also covers the dashboard.
app.use('*', async (c, next) => {
	if (c.req.path === '/m.js' || c.req.path === '/overlay.js' || c.req.path === '/api/event' || !(await isProxyHost(c.env, new URL(c.req.url).hostname))) return next()
	return c.text('Not found', 404)
})

// m.js?s=<site> is the core tracker plus the code for the features the site ticked in its
// settings (packages/core/src/features.ts), in one file. A change in the settings reaches
// visitors within six minutes: the isolate's one-minute site cache, then the five-minute
// browser cache. Without a known site it is the core alone, which counts nothing.
let parts: Record<string, string> | null = null
app.get('/m.js', async (c) => {
	const id = c.req.query('s') ?? ''
	const site = SITE_ID.test(id) ? await getSite(c.env, id) : null
	const names = site ? browserParts(siteFeatures(site.features)) : []
	if (names.length && !parts) parts = JSON.parse((await import('@misomoon/tracker/parts.min.js')).default) as Record<string, string>
	// m.js stops early when it can't find its own script tag, and the parts then have no
	// misomoon.x to call; the guard keeps them from throwing on the customer's page
	const body = names.length ? [tracker, 'if (window.misomoon && misomoon.x) {', ...names.map((n) => parts![n]), '}'] : [tracker]
	return new Response(body.join('\n'), {
		headers: {
			'Content-Type': 'application/javascript; charset=utf-8',
			// a site id that isn't known yet may be created a minute later, so only no id caches long
			'Cache-Control': id ? 'public, max-age=300' : 'public, max-age=3600, stale-while-revalidate=86400',
			'Access-Control-Allow-Origin': '*',
		},
	})
})

// Draws clicks and scroll on a customer's page; m.js loads it only for #misomoon-overlay.
// Imported on demand so the Worker doesn't parse it for every beacon.
app.get('/overlay.js', async () => {
	const { default: overlay } = await import('@misomoon/tracker/overlay.min.js')
	return new Response(overlay, {
		headers: {
			'Content-Type': 'application/javascript; charset=utf-8',
			'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
			'Access-Control-Allow-Origin': '*',
		},
	})
})

const ingest = async (c: Context<App>) => {
	const row = await acceptBeacon(c.env, c.req.raw)
	if (row) {
		const direct = () => c.executionCtx.waitUntil(writeEvents(c.env, [row]))
		if (!c.env.EVENTS) direct()
		else {
			try {
				await c.env.EVENTS.send(row, { contentType: 'json' })
			} catch (e) {
				// the queue is down: write this one event directly rather than lose it
				console.error(JSON.stringify({ msg: 'queue send failed', error: String(e) }))
				direct()
			}
		}
	}
	return new Response(null, { status: 202, headers: { 'Access-Control-Allow-Origin': '*' } })
}
app.post('/api/event', ingest)
app.options('/api/event', () => new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' } }))

// ---------------------------------------------------------------- authenticated API

app.use('/api/v1/*', cors({ origin: '*', allowHeaders: ['Authorization', 'Content-Type'], maxAge: 86400 }))
app.use('/api/v1/*', async (c, next) => {
	c.set('who', await authenticate(c.env, c.req.raw))
	await next()
})
// Stats API rate limit per key (or per IP without one).
// Signed-in dashboards and shared links aren't limited.
async function overLimit(c: Context<App>, who: Principal) {
	if ((who.kind !== 'key' && who.kind !== 'anonymous') || !c.env.STATS_LIMIT) return false
	const key = who.keyId ?? `ip:${c.req.header('cf-connecting-ip') ?? 'unknown'}`
	return !(await c.env.STATS_LIMIT.limit({ key })).success
}
app.use('/api/v1/stats/*', async (c, next) => {
	if (await overLimit(c, c.get('who'))) return c.json({ error: 'rate limit exceeded, try again in a minute' }, 429)
	await next()
})
app.use('/mcp', cors({ origin: '*', allowHeaders: ['Authorization', 'Content-Type', 'Mcp-Session-Id', 'Mcp-Protocol-Version'], exposeHeaders: ['Mcp-Session-Id'] }))

app.get('/api/health', (c) => c.json({ ok: true }))

// `site_id` is accepted too, as an alias
const q = (c: Context<App>): StatsInput => {
	const query = c.req.query() as StatsInput & { site_id?: string }
	return { ...query, site: query.site ?? query.site_id }
}

app.route('/api/v1', accounts)

app.get('/api/v1/me', async (c) => {
	const who = c.get('who')
	const sites = await visibleSites(c.env, who)
	const [{ results: imported }, { results: search }] = await Promise.all([
		c.env.CONTROL.prepare("SELECT DISTINCT site_id FROM imports WHERE status = 'done'").all<{ site_id: string }>(),
		c.env.CONTROL.prepare('SELECT site_id FROM search_console').all<{ site_id: string }>(),
	])
	const user = who.userId ? await c.env.CONTROL.prepare('SELECT id, email, name FROM users WHERE id = ?').bind(who.userId).first() : null
	const enforced = plansEnforced(c.env)
	const server = serverRetention(c.env)
	// with plans on, also each team's trial and its events this UTC month
	const now = Date.now()
	const month = enforced ? `, t.trial_ends_at, t.created_at, (${monthEvents('t.id')}) AS events_used` : ''
	const rows =
		who.kind === 'user'
			? (
					await c.env.CONTROL.prepare(
						`SELECT t.id, t.name, m.role, t.plan, (SELECT COUNT(*) FROM sites WHERE team_id = t.id) AS site_count${month} FROM teams t JOIN team_members m ON m.team_id = t.id WHERE m.user_id = ? ORDER BY t.created_at`,
					)
						.bind(...(enforced ? [utcDay(monthStart(utcMonth(now)))] : []), who.userId)
						.all<{ id: string; name: string; role: string; plan: string | null; site_count: number; trial_ends_at?: number | null; created_at?: number; events_used?: number }>()
				).results
			: []
	// with plans on, each team's plan, its limits, its trial and its month; null on a server that enforces none
	const teams = rows.map(({ plan, site_count, trial_ends_at, created_at, events_used, ...t }) => ({
		...t,
		plan: enforced ? planInfo({ plan, trial_ends_at: trial_ends_at ?? null, created_at: created_at ?? 0, sites_used: site_count, events_used: events_used ?? 0 }, server, now) : null,
	}))
	const plans = await teamPlans(c.env, sites.map((s) => s.team_id))
	// with billing set up, each team's plan_status, plan_period_end and billing_portal
	const billing = await teamBilling(c.env, who.kind === 'user' ? who.userId : null)
	return c.json({
		kind: who.kind,
		user,
		teams: withBilling(teams, billing),
		/** each site with its own retention limits: the server's, within its team's plan */
		sites: sites.map((s) => ({ ...s, retention: siteRetention(c.env, plans?.get(s.team_id) ?? null) })),
		/** whether this server enforces misomoon Cloud plans (PLANS=on) */
		plans: enforced,
		/** whether teams can pay for a plan here: PLANS=on and Polar set up (docs/billing.md) */
		billing: billing !== null,
		demo: c.env.DEMO_SITE || null,
		/** the sample site the demo dashboard (/demo) shows */
		sample: c.env.SAMPLE_SITE || null,
		signups: await signupsOpen(c.env),
		/** where a new site's events can be stored (core REGIONS); empty on a server without regional shards */
		regions: serverRegions(await getShards(c.env)),
		/** days of data a site keeps: the server's longest, and what a site that sets none keeps; 0 is no limit */
		retention: server,
		imported: imported.map((r) => r.site_id).filter((id) => sites.some((s) => s.id === id)),
		/** sites with Google Search Console connected */
		search: search.map((r) => r.site_id).filter((id) => sites.some((s) => s.id === id)),
		share: who.share ? { slug: who.share.slug, segment: who.share.filters } : null,
	})
})

app.get('/api/v1/sites', async (c) => c.json(await visibleSites(c.env, c.get('who'))))

// Owners, admins and editors add sites to their team; a first site makes a team if needed.
app.post('/api/v1/sites', async (c) => {
	const who = c.get('who')
	const userId = requireUser(who)
	const body = await c.req.json<{ id?: string; domain: string; name?: string; timezone?: string; currency?: string; public?: boolean; team?: string; region?: unknown }>()
	if (!body?.domain || typeof body.domain !== 'string') throw new HttpError(400, 'domain is required')
	let team = body.team
	if (team) {
		const role = await teamRole(c.env, userId, team)
		if (!role || !['owner', 'admin', 'editor'].includes(role)) throw new HttpError(403, 'only owners, admins and editors add sites to a team')
	} else {
		const own = await c.env.CONTROL.prepare("SELECT team_id FROM team_members WHERE user_id = ? AND role IN ('owner', 'admin', 'editor') ORDER BY created_at LIMIT 1").bind(userId).first<{ team_id: string }>()
		team = own?.team_id ?? (await createTeam(c.env, userId, 'My sites')).id
	}
	// with plans on, a lapsed team gets a 403 (PLAN_REQUIRED), and one at its plan's site limit another (PLAN_SITE_LIMIT)
	return c.json(await createSite(c.env, team, body, await teamTermsOf(c.env, team)), 201)
})

app.get('/api/v1/sites/:id', async (c) => c.json(await authorize(c.env, c.get('who'), c.req.param('id'))))

app.patch('/api/v1/sites/:id', async (c) => {
	const site = await authorize(c.env, c.get('who'), c.req.param('id'), 'edit')
	const body = await c.req.json<{ name?: string; timezone?: string; currency?: string; public?: boolean; features?: unknown; search_params?: unknown; include_paths?: unknown; exclude_paths?: unknown; exclude_ips?: unknown; privacy_signals?: unknown; retention_days?: unknown; region?: unknown }>()
	// moving stored data between jurisdictions is not something a settings change should do
	if (body.region !== undefined && body.region !== site.region) throw new HttpError(400, "a site's region is set when it is added; add a new site to use another region")
	const name = (typeof body.name === 'string' && body.name.trim().slice(0, 80)) || site.name
	const timezone = body.timezone == null ? site.timezone : checkTimezone(body.timezone)
	const currency = body.currency == null ? site.currency : checkCurrency(body.currency)
	const features = body.features === undefined ? site.features : storeFeatures(body.features)
	const search = body.search_params === undefined ? site.search_params : storeSearchParams(body.search_params)
	const include = body.include_paths === undefined ? site.include_paths : storePathRules(body.include_paths, 'include_paths')
	const exclude = body.exclude_paths === undefined ? site.exclude_paths : storePathRules(body.exclude_paths, 'exclude_paths')
	const ips = body.exclude_ips === undefined ? site.exclude_ips : storeIpRules(body.exclude_ips)
	// with plans on, no longer than the team's plan keeps (a 403, PLAN_RETENTION_LIMIT)
	const retention = body.retention_days === undefined ? site.retention_days : storePlanRetention(body.retention_days, site.retention_days, serverRetention(c.env), await teamPlanOf(c.env, site.team_id))
	if (retention && typeof retention === 'object' && retention.plan) throw new HttpError(403, retention.error, PLAN_RETENTION_LIMIT)
	if (body.privacy_signals !== undefined && typeof body.privacy_signals !== 'boolean') throw new HttpError(400, 'privacy_signals must be true or false')
	const signals = body.privacy_signals === undefined ? site.privacy_signals : body.privacy_signals ? 1 : 0
	for (const v of [features, search, include, exclude, ips, retention]) if (v && typeof v === 'object') throw new HttpError(400, v.error)
	await c.env.CONTROL.prepare(
		'UPDATE sites SET name = ?, timezone = ?, currency = ?, public = ?, features = ?, search_params = ?, include_paths = ?, exclude_paths = ?, exclude_ips = ?, privacy_signals = ?, retention_days = ? WHERE id = ?',
	)
		.bind(name, timezone, currency, body.public == null ? site.public : body.public ? 1 : 0, features, search, include, exclude, ips, signals, retention, site.id)
		.run()
	invalidate(`site:${site.id}`)
	return c.json(await authorize(c.env, c.get('who'), site.id))
})

// Deletes a site and all of its data, in every shard that holds it.
app.delete('/api/v1/sites/:id', async (c) => {
	await deleteSite(c.env, await authorize(c.env, c.get('who'), c.req.param('id'), 'manage'))
	return c.body(null, 204)
})

// Managed first-party proxy: the site's own subdomain, CNAMEd to misomoon.
// What the site stored per UTC day over the last 31 days, and the cap it runs under.
app.get('/api/v1/sites/:id/usage', async (c) => {
	const who = c.get('who')
	const site = await authorize(c.env, who, c.req.param('id'))
	// a public dashboard or a shared link opens the stats, not the team's usage
	if (who.kind !== 'system' && !can(await siteRole(c.env, who, site), 'read')) {
		throw who.kind === 'anonymous' ? new HttpError(401, 'sign in to see this site') : new HttpError(403, 'you do not have access to this site')
	}
	const cap = dailyCap(c.env, site)
	const { results } = await c.env.CONTROL.prepare('SELECT day, events, stored, dropped, capped_at FROM usage_daily WHERE site_id = ? AND day > ? ORDER BY day')
		.bind(site.id, utcDay(Date.now()) - 31)
		.all<{ day: number; events: number; stored: number; dropped: number; capped_at: number | null }>()
	const days = results.map((r) => ({ day: new Date(r.day * DAY).toISOString().slice(0, 10), events: r.events, stored: r.stored, dropped: r.dropped, capped: r.capped_at != null }))
	return c.json({ cap, blocked: cap === 0, days })
})

// Opens the site's home page and looks for its script tag, for the setup guide.
app.get('/api/v1/sites/:id/check', async (c) => c.json(await checkInstall(await authorize(c.env, c.get('who'), c.req.param('id'), 'edit'))))

app.get('/api/v1/sites/:id/proxy', async (c) => {
	return c.json(await getProxy(c.env, await authorize(c.env, c.get('who'), c.req.param('id'), 'edit')))
})
app.put('/api/v1/sites/:id/proxy', async (c) => {
	const body = await c.req.json<{ hostname?: string }>()
	if (!body?.hostname) throw new HttpError(400, 'hostname is required')
	return c.json(await setProxy(c.env, await authorize(c.env, c.get('who'), c.req.param('id'), 'edit'), body.hostname))
})
app.delete('/api/v1/sites/:id/proxy', async (c) => {
	return c.json(await removeProxy(c.env, await authorize(c.env, c.get('who'), c.req.param('id'), 'edit')))
})

app.get('/api/v1/sites/:id/goals', async (c) => {
	const site = await authorize(c.env, c.get('who'), c.req.param('id'))
	return c.json(await listGoals(c.env, site.id))
})

app.post('/api/v1/sites/:id/goals', async (c) => {
	const site = await authorize(c.env, c.get('who'), c.req.param('id'), 'edit')
	const body = await c.req.json<{ name?: string; kind: 'event' | 'page'; match: string }>()
	if (!['event', 'page'].includes(body.kind) || typeof body.match !== 'string' || !body.match) throw new HttpError(400, 'kind (event|page) and match are required')
	if (body.name != null && typeof body.name !== 'string') throw new HttpError(400, 'name must be text')
	const count = await c.env.CONTROL.prepare('SELECT COUNT(*) AS n FROM goals WHERE site_id = ?').bind(site.id).first<number>('n')
	// every goal is one more aggregate in the conversions query
	if ((count ?? 0) >= MAX_GOALS) throw new HttpError(400, `a site has at most ${MAX_GOALS} goals`)
	const goal = { id: crypto.randomUUID(), site_id: site.id, name: (body.name || body.match).slice(0, 80), kind: body.kind, match: body.match.slice(0, 200) }
	await c.env.CONTROL.prepare('INSERT INTO goals (id, site_id, name, kind, match, created_at) VALUES (?, ?, ?, ?, ?, ?)')
		.bind(goal.id, goal.site_id, goal.name, goal.kind, goal.match, Date.now())
		.run()
		.catch((e) => conflict(e, 409, 'a goal with this name already exists'))
	return c.json(goal, 201)
})

app.delete('/api/v1/sites/:id/goals/:goal', async (c) => {
	await authorize(c.env, c.get('who'), c.req.param('id'), 'edit')
	await c.env.CONTROL.prepare('DELETE FROM goals WHERE id = ? AND site_id = ?').bind(c.req.param('goal'), c.req.param('id')).run()
	return c.body(null, 204)
})

app.get('/api/v1/sites/:id/funnels', async (c) => {
	const site = await authorize(c.env, c.get('who'), c.req.param('id'))
	const { results } = await c.env.CONTROL.prepare('SELECT id, name, steps, mode FROM funnels WHERE site_id = ? ORDER BY created_at').bind(site.id).all<{ id: string; name: string; steps: string; mode: string }>()
	return c.json(results.map((f) => ({ ...f, steps: JSON.parse(f.steps) })))
})

/** A saved funnel's name, steps and mode, checked the same way the funnel query checks them. */
async function funnelBody(c: { req: { json: <T>() => Promise<T> } }) {
	const body = await c.req.json<{ name?: unknown; steps?: unknown; mode?: unknown }>()
	if (typeof body.name !== 'string' || !body.name.trim() || !Array.isArray(body.steps) || body.steps.length < 2) {
		throw new HttpError(400, 'name and at least two steps are required')
	}
	const mode = body.mode === 'strict' || body.mode === 'flexible' ? body.mode : 'sequential'
	return { name: body.name.trim().slice(0, 80), steps: cleanSteps(body.steps.slice(0, 8)), mode }
}

app.post('/api/v1/sites/:id/funnels', async (c) => {
	const site = await authorize(c.env, c.get('who'), c.req.param('id'), 'edit')
	const f = await funnelBody(c)
	const id = crypto.randomUUID()
	await c.env.CONTROL.prepare('INSERT INTO funnels (id, site_id, name, steps, mode, created_at) VALUES (?, ?, ?, ?, ?, ?)')
		.bind(id, site.id, f.name, JSON.stringify(f.steps), f.mode, Date.now())
		.run()
	return c.json({ id, ...f }, 201)
})

app.put('/api/v1/sites/:id/funnels/:funnel', async (c) => {
	const site = await authorize(c.env, c.get('who'), c.req.param('id'), 'edit')
	const f = await funnelBody(c)
	const id = c.req.param('funnel')
	const res = await c.env.CONTROL.prepare('UPDATE funnels SET name = ?, steps = ?, mode = ? WHERE id = ? AND site_id = ?').bind(f.name, JSON.stringify(f.steps), f.mode, id, site.id).run()
	if (!res.meta.changes) throw new HttpError(404, 'funnel not found')
	return c.json({ id, ...f })
})

app.delete('/api/v1/sites/:id/funnels/:funnel', async (c) => {
	const site = await authorize(c.env, c.get('who'), c.req.param('id'), 'edit')
	const res = await c.env.CONTROL.prepare('DELETE FROM funnels WHERE id = ? AND site_id = ?').bind(c.req.param('funnel'), site.id).run()
	if (!res.meta.changes) throw new HttpError(404, 'funnel not found')
	return c.body(null, 204)
})

// Segments are saved filter strings. Applying one is just using its filters.
// Site segments are shared with everyone who can read the site; personal ones
// only with their author, so viewers can save their own.
app.get('/api/v1/sites/:id/segments', async (c) => {
	const who = c.get('who')
	const site = await authorize(c.env, who, c.req.param('id'))
	const { results } = await c.env.CONTROL.prepare('SELECT id, name, filters, user_id IS NOT NULL AS personal FROM segments WHERE site_id = ? AND (user_id IS NULL OR user_id = ?) ORDER BY name')
		.bind(site.id, who.userId)
		.all()
	return c.json(results)
})
app.post('/api/v1/sites/:id/segments', async (c) => {
	const who = c.get('who')
	const body = await c.req.json<{ name?: string; filters?: string; personal?: boolean }>()
	const site = await authorize(c.env, who, c.req.param('id'), body.personal ? 'read' : 'edit')
	const owner = body.personal ? requireUser(who) : null
	const name = body?.name?.trim().slice(0, 80)
	if (!name || !body.filters) throw new HttpError(400, 'name and filters are required')
	const filters = serializeFilters(parseFilters(body.filters))
	const existing = await c.env.CONTROL.prepare('SELECT id FROM segments WHERE site_id = ? AND user_id IS ? AND name = ?').bind(site.id, owner, name).first<{ id: string }>()
	const id = existing?.id ?? crypto.randomUUID()
	await c.env.CONTROL.prepare('INSERT INTO segments (id, site_id, user_id, name, filters, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET filters = excluded.filters')
		.bind(id, site.id, owner, name, filters, Date.now())
		.run()
	return c.json({ id, name, filters, personal: owner ? 1 : 0 }, 201)
})
app.delete('/api/v1/sites/:id/segments/:segment', async (c) => {
	const who = c.get('who')
	const seg = await c.env.CONTROL.prepare('SELECT user_id FROM segments WHERE id = ? AND site_id = ?').bind(c.req.param('segment'), c.req.param('id')).first<{ user_id: string | null }>()
	if (!seg) return c.body(null, 204)
	if (seg.user_id) {
		await authorize(c.env, who, c.req.param('id'))
		if (seg.user_id !== who.userId) throw new HttpError(403, 'this is someone else’s segment')
	} else await authorize(c.env, who, c.req.param('id'), 'edit')
	await c.env.CONTROL.prepare('DELETE FROM segments WHERE id = ?').bind(c.req.param('segment')).run()
	return c.body(null, 204)
})

// ---------------------------------------------------------------- imports

app.get('/api/v1/sites/:id/imports', async (c) => {
	return c.json(await listImports(c.env, (await authorize(c.env, c.get('who'), c.req.param('id'), 'edit')).id))
})
app.post('/api/v1/sites/:id/imports', async (c) => {
	const site = await authorize(c.env, c.get('who'), c.req.param('id'), 'edit')
	const form = await c.req.formData()
	const files = form.getAll('file').filter((f): f is File => typeof f !== 'string')
	return c.json(await importCsv(c.env, site, files), 201)
})
app.delete('/api/v1/sites/:id/imports/:import', async (c) => {
	await deleteImport(c.env, await authorize(c.env, c.get('who'), c.req.param('id'), 'edit'), c.req.param('import'))
	return c.body(null, 204)
})
app.post('/api/v1/sites/:id/imports/google/connect', async (c) => {
	return c.json(await googleConnect(c.env, await authorize(c.env, c.get('who'), c.req.param('id'), 'edit'), new URL(c.req.url).origin, 'import'))
})
app.get('/api/v1/google/callback', (c) => googleCallback(c.env, new URL(c.req.url)))
app.get('/api/v1/sites/:id/imports/google/properties', async (c) => {
	return c.json(await googleProperties(c.env, await authorize(c.env, c.get('who'), c.req.param('id'), 'edit'), c.req.query('grant') ?? ''))
})
app.post('/api/v1/sites/:id/imports/google', async (c) => {
	const site = await authorize(c.env, c.get('who'), c.req.param('id'), 'edit')
	return c.json(await startGoogleImport(c.env, c.executionCtx as ExecutionContext, site, await c.req.json()), 202)
})

// ---------------------------------------------------------------- Google Search Console

app.get('/api/v1/sites/:id/search-console', async (c) => c.json(await searchStatus(c.env, await authorize(c.env, c.get('who'), c.req.param('id'), 'edit'))))
app.post('/api/v1/sites/:id/search-console/connect', async (c) => {
	return c.json(await googleConnect(c.env, await authorize(c.env, c.get('who'), c.req.param('id'), 'edit'), new URL(c.req.url).origin, 'search'))
})
app.get('/api/v1/sites/:id/search-console/properties', async (c) => {
	return c.json(await searchProperties(c.env, await authorize(c.env, c.get('who'), c.req.param('id'), 'edit'), c.req.query('grant') ?? ''))
})
app.put('/api/v1/sites/:id/search-console', async (c) => {
	const who = c.get('who')
	const site = await authorize(c.env, who, c.req.param('id'), 'edit')
	const body = await c.req.json<{ grant?: string; property?: string }>()
	if (!body.grant || !body.property) throw new HttpError(400, 'grant and property are required')
	return c.json(await connectSearch(c.env, site, who.userId, body.grant, body.property))
})
app.delete('/api/v1/sites/:id/search-console', async (c) => {
	await disconnectSearch(c.env, await authorize(c.env, c.get('who'), c.req.param('id'), 'edit'))
	return c.body(null, 204)
})

// ---------------------------------------------------------------- revenue from payment providers

app.get('/api/v1/sites/:id/revenue', async (c) => {
	const site = await authorize(c.env, c.get('who'), c.req.param('id'), 'edit')
	return c.json(await listSources(c.env, site.id, new URL(c.req.url).origin))
})
app.put('/api/v1/sites/:id/revenue/:provider', async (c) => {
	const who = c.get('who')
	const site = await authorize(c.env, who, c.req.param('id'), 'edit')
	const body = await c.req.json<{ secret?: string }>().catch(() => ({}) as { secret?: string })
	return c.json(await saveSource(c.env, site.id, c.req.param('provider'), body.secret, who.userId, new URL(c.req.url).origin))
})
app.delete('/api/v1/sites/:id/revenue/:provider', async (c) => {
	await removeSource(c.env, (await authorize(c.env, c.get('who'), c.req.param('id'), 'edit')).id, c.req.param('provider'))
	return c.body(null, 204)
})
// Signed by the provider, so it needs no API key.
app.post('/api/webhooks/:provider/:site', (c) => handleWebhook(c.env, c.req.param('provider'), c.req.param('site'), c.req.raw))

// ---------------------------------------------------------------- paying for misomoon Cloud (Polar)

// An owner or billing member picks or switches the team's plan, or opens Polar's portal.
const dashboardOrigin = (c: Context<App>) => c.env.PUBLIC_URL || new URL(c.req.url).origin
app.post('/api/v1/teams/:team/checkout', async (c) => {
	const body = await c.req.json().catch(() => null)
	return c.json(await checkout(c.env, c.get('who'), c.req.param('team'), body, dashboardOrigin(c)))
})
app.post('/api/v1/teams/:team/portal', async (c) => c.json(await portal(c.env, c.get('who'), c.req.param('team'), dashboardOrigin(c))))
// Signed by Polar. misomoon's own billing, apart from the customers' payment webhooks above.
app.post('/api/billing/polar/webhook', (c) => polarWebhook(c.env, c.req.raw))

// ---------------------------------------------------------------- shared links

app.get('/api/v1/sites/:id/shared', async (c) => {
	const site = await authorize(c.env, c.get('who'), c.req.param('id'), 'edit')
	const { results } = await c.env.CONTROL.prepare('SELECT slug, name, password_hash IS NOT NULL AS protected, segment_id, expires_at, created_at FROM shared_links WHERE site_id = ? ORDER BY created_at').bind(site.id).all()
	return c.json(results)
})
app.post('/api/v1/sites/:id/shared', async (c) => {
	const site = await authorize(c.env, c.get('who'), c.req.param('id'), 'edit')
	const body = await c.req.json<{ name?: string; password?: string; segment_id?: string | null; expires_days?: number }>()
	const slug = [...crypto.getRandomValues(new Uint8Array(9))].map((b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('')
	const expires = body.expires_days ? Date.now() + Math.min(body.expires_days, 3650) * 86_400_000 : null
	await c.env.CONTROL.prepare('INSERT INTO shared_links (slug, site_id, name, password_hash, segment_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
		.bind(slug, site.id, (body.name || 'Shared link').slice(0, 80), body.password ? await hashPassword(body.password) : null, body.segment_id || null, expires, Date.now())
		.run()
	return c.json({ slug, name: body.name || 'Shared link', protected: !!body.password, segment_id: body.segment_id || null, expires_at: expires }, 201)
})
app.delete('/api/v1/sites/:id/shared/:slug', async (c) => {
	await authorize(c.env, c.get('who'), c.req.param('id'), 'edit')
	await c.env.CONTROL.prepare('DELETE FROM shared_links WHERE slug = ? AND site_id = ?').bind(c.req.param('slug'), c.req.param('id')).run()
	return c.body(null, 204)
})
// Public: what a link is, and the read-only token for it.
app.get('/api/v1/share/:slug', async (c) => {
	const link = await getSharedLink(c.env, c.req.param('slug'))
	if (!link) throw new HttpError(404, 'this link has expired or was removed')
	return c.json({ name: link.name, protected: !!link.password_hash })
})
app.post('/api/v1/share/:slug', async (c) => {
	const ip = c.req.header('cf-connecting-ip') ?? 'unknown'
	if (c.env.STATS_LIMIT && !(await c.env.STATS_LIMIT.limit({ key: `share:${ip}` })).success) throw new HttpError(429, 'too many attempts, wait a minute')
	const body = await c.req.json<{ password?: string }>().catch(() => ({}) as { password?: string })
	return c.json(await unlockShare(c.env, c.req.param('slug'), body.password))
})

// ---------------------------------------------------------------- email reports and alerts

app.get('/api/v1/sites/:id/reports', async (c) => {
	const site = await authorize(c.env, c.get('who'), c.req.param('id'), 'edit')
	const { results } = await c.env.CONTROL.prepare('SELECT id, email, kind, threshold, last_sent_at FROM email_reports WHERE site_id = ? ORDER BY kind, email').bind(site.id).all()
	return c.json({ subscriptions: results, sending: emailConfigured(c.env) })
})
app.post('/api/v1/sites/:id/reports', async (c) => {
	const site = await authorize(c.env, c.get('who'), c.req.param('id'), 'edit')
	const body = await c.req.json<{ email?: string; kind?: string; threshold?: unknown }>()
	if (!body.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email)) throw new HttpError(400, 'a valid email is required')
	if (!['weekly', 'monthly', 'spike', 'drop'].includes(body.kind ?? '')) throw new HttpError(400, 'kind is weekly, monthly, spike or drop')
	const t = body.threshold
	const whole = typeof t === 'number' && Number.isInteger(t)
	if (body.kind === 'drop' && t != null && !(whole && t >= 1 && t <= 168)) throw new HttpError(400, 'threshold for drop is a whole number of hours from 1 to 168')
	if (body.kind === 'spike' && t != null && !(whole && t >= 1)) throw new HttpError(400, 'threshold for spike is a whole number of visitors, 1 or more')
	// reports have no threshold
	const threshold = body.kind === 'drop' || body.kind === 'spike' ? (t ?? null) : null
	const id = crypto.randomUUID()
	await c.env.CONTROL.prepare('INSERT INTO email_reports (id, site_id, email, kind, threshold, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (site_id, email, kind) DO UPDATE SET threshold = excluded.threshold')
		.bind(id, site.id, body.email.trim().toLowerCase(), body.kind, threshold, Date.now())
		.run()
	return c.json({ ok: true }, 201)
})
app.delete('/api/v1/sites/:id/reports/:report', async (c) => {
	await authorize(c.env, c.get('who'), c.req.param('id'), 'edit')
	await c.env.CONTROL.prepare('DELETE FROM email_reports WHERE id = ? AND site_id = ?').bind(c.req.param('report'), c.req.param('id')).run()
	return c.body(null, 204)
})
// The report as it would be sent now, to preview in the browser (?format=pdf for the attachment) or send to yourself.
app.get('/api/v1/sites/:id/reports/preview', async (c) => {
	const site = await authorize(c.env, c.get('who'), c.req.param('id'), 'edit')
	const r = await buildReport(c.env, site, c.req.query('kind') === 'monthly' ? 'monthly' : 'weekly')
	if (c.req.query('format') !== 'pdf') return c.html(r.html)
	if (!c.env.BROWSER) throw new HttpError(501, 'PDF reports need the BROWSER binding (docs/configuration.md)')
	const pdf = await reportPdf(c.env, r.html)
	if (!pdf) throw new HttpError(503, 'Browser Run could not print the report; try again later')
	return c.body(pdf, 200, { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="${r.filename}"` })
})
app.post('/api/v1/sites/:id/reports/test', async (c) => {
	const site = await authorize(c.env, c.get('who'), c.req.param('id'), 'edit')
	const body = await c.req.json<{ email?: string; kind?: string }>()
	if (!body.email) throw new HttpError(400, 'email is required')
	const ok = await sendEmail(c.env, body.email, await withPdf(c.env, await buildReport(c.env, site, body.kind === 'monthly' ? 'monthly' : 'weekly')))
	if (!ok) throw new HttpError(503, emailConfigured(c.env) ? 'the email provider refused the message' : 'set up an email provider to send email (docs/configuration.md)')
	return c.json({ ok })
})

// ---------------------------------------------------------------- annotations

app.get('/api/v1/sites/:id/annotations', async (c) => {
	const site = await authorize(c.env, c.get('who'), c.req.param('id'))
	const from = Number(c.req.query('from') ?? 0)
	const to = Number(c.req.query('to') ?? Date.now() + 86_400_000)
	const { results } = await c.env.CONTROL.prepare('SELECT id, ts, text, source FROM annotations WHERE site_id = ? AND ts >= ? AND ts < ? ORDER BY ts LIMIT 500').bind(site.id, from, to).all()
	return c.json(results)
})
// Editors (and their API keys) may annotate, so CI can mark deploys.
app.post('/api/v1/sites/:id/annotations', async (c) => {
	const who = c.get('who')
	const site = await authorize(c.env, who, c.req.param('id'), 'edit')
	const body = await c.req.json<{ text?: string; ts?: number | string; source?: string }>()
	if (!body.text?.trim()) throw new HttpError(400, 'text is required')
	const ts = body.ts == null ? Date.now() : typeof body.ts === 'number' ? body.ts : Date.parse(body.ts)
	if (!Number.isFinite(ts)) throw new HttpError(400, 'ts must be ms or an ISO date')
	const row = { id: crypto.randomUUID(), ts, text: body.text.trim().slice(0, 200), source: (body.source || 'manual').slice(0, 40) }
	await c.env.CONTROL.prepare('INSERT INTO annotations (id, site_id, ts, text, source, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(row.id, site.id, row.ts, row.text, row.source, Date.now()).run()
	return c.json(row, 201)
})
app.delete('/api/v1/sites/:id/annotations/:annotation', async (c) => {
	await authorize(c.env, c.get('who'), c.req.param('id'), 'edit')
	await c.env.CONTROL.prepare('DELETE FROM annotations WHERE id = ? AND site_id = ?').bind(c.req.param('annotation'), c.req.param('id')).run()
	return c.body(null, 204)
})

// Generates a realistic history for a site through the real write path, for
// `pnpm db:seed` locally. Off unless DEMO_SEED=1: the landing counts its real
// readers into the demo site and prints them as people, so a production demo
// must never also hold invented visits.
app.post('/api/v1/sites/:id/demo', async (c) => {
	if (c.env.DEMO_SEED !== '1') throw new HttpError(403, 'synthetic traffic is turned off here; set DEMO_SEED=1 to allow it')
	const site = await authorize(c.env, c.get('who'), c.req.param('id'), 'manage')
	const { days = 35, perDay = 140, seed = 7 } = await c.req.json<{ days?: number; perDay?: number; seed?: number }>().catch(() => ({}) as { days?: number; perDay?: number; seed?: number })
	const hits = demoTraffic(site.id, site.domain, { days: Math.min(days, 120), perDay: Math.min(perDay, 2000), seed })
	const rows: EventRow[] = []
	for (const h of hits) {
		const row = buildEvent(h.payload, h.edge, h.ts)
		if (typeof row === 'string') continue
		row.visitor_id = await visitorId(`demo-${seed}-${Math.floor(row.ts / 86400000)}`, site.id, h.edge.ip, h.edge.ua)
		rows.push(row)
	}
	const written = await writeEvents(c.env, rows)
	return c.json({ site: site.id, events: written })
})

app.get('/api/v1/stats/aggregate', async (c) => c.json(await aggregateStats(c.env, c.get('who'), q(c))))
app.get('/api/v1/stats/timeseries', async (c) => c.json(await timeseriesStats(c.env, c.get('who'), q(c))))
app.get('/api/v1/stats/breakdown', async (c) => c.json(await breakdownStats(c.env, c.get('who'), q(c))))
app.get('/api/v1/stats/realtime', async (c) => c.json(await realtimeStats(c.env, c.get('who'), q(c))))
app.get('/api/v1/stats/vitals', async (c) => c.json(await vitalsStats(c.env, c.get('who'), q(c))))
app.post('/api/v1/stats/funnel', async (c) => c.json(await funnelStats(c.env, c.get('who'), await c.req.json())))
app.get('/api/v1/stats/journeys', async (c) => c.json(await journeyStats(c.env, c.get('who'), q(c))))
app.get('/api/v1/stats/behavior', async (c) => c.json(await behaviorStats(c.env, c.get('who'), c.req.query('report') ?? '', { ...q(c), page: c.req.query('page') })))
app.get('/api/v1/stats/export', async (c) => {
	const { name, zip } = await exportStats(c.env, c.get('who'), q(c))
	return new Response(zip, { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' } })
})
app.get('/api/v1/meta/dimensions', (c) => c.json(dimensions()))

// Stats API v2.
app.use('/api/v2/*', cors({ origin: '*', allowHeaders: ['Authorization', 'Content-Type'], maxAge: 86400 }))
app.post('/api/v2/query', async (c) => {
	const who = await authenticate(c.env, c.req.raw)
	if (await overLimit(c, who)) return c.json({ error: 'rate limit exceeded, try again in a minute' }, 429)
	return c.json(await v2Query(c.env, who, await c.req.json()))
})

app.all('/mcp', async (c) => {
	const who = await authenticate(c.env, c.req.raw)
	// tools run the same queries as the Stats API, under the same limit
	if (c.req.method === 'POST' && (await overLimit(c, who))) return c.json({ error: 'rate limit exceeded, try again in a minute' }, 429)
	return handleMcp(c.env, who, c.req.raw)
})

// Everything else is the dashboard (a single-page app in ASSETS).
app.all('/api/*', (c) => c.json({ error: 'not found' }, 404))
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw))

app.onError((err, c) => {
	if (err instanceof HttpError) return c.json(err.code ? { error: err.message, code: err.code } : { error: err.message }, err.status as 400)
	if (err instanceof QueryError) return c.json({ error: err.message }, 400)
	if (err instanceof SyntaxError) return c.json({ error: 'request body is not valid JSON' }, 400)
	console.error(JSON.stringify({ msg: 'unhandled error', path: c.req.path, error: String(err), stack: (err as Error).stack }))
	return c.json({ error: 'internal error' }, 500)
})

// ---------------------------------------------------------------- background work

// rows deleted per site and table in one daily cleanup; a backlog past it goes the next day
const RETENTION_MAX = 1_000_000
// usage_daily rows kept, in days
const USAGE_DAYS = 400
// the UTC hour of the daily cleanup, at minute 15 like the hourly run
const CLEANUP_HOUR = 3

/**
 * Hourly: expires old salts, records each shard's size (placement weighs by free space)
 * and drains shards past their soft limit. With `cleanup`, once a day, it first deletes
 * what retention no longer keeps. Retention counts in days, so a daily run is enough.
 */
async function maintenance(env: Env, cleanup: boolean) {
	await env.CONTROL.prepare('DELETE FROM salts WHERE day < ?').bind(Math.floor(Date.now() / 86400000) - 2).run()
	await env.CONTROL.prepare('DELETE FROM usage_refs WHERE at < ?').bind(Date.now() - 2 * 86400000).run()
	await expireAttribution(env)
	// with plans on, the monthly event emails of the last 3 months are kept (plan_notices)
	if (cleanup && plansEnforced(env)) await env.CONTROL.prepare('DELETE FROM plan_notices WHERE month < ?').bind(utcMonth(Date.now()) - 2).run()
	const limit = shardLimit(env)
	const all = cleanup ? await listSites(env) : []
	// with plans on, each team's plan; a team that has none set, on the trial or lapsed, keeps the trial plan's
	const plans = all.length ? await setPlans(env) : null
	// a year of daily usage, and a month to spare for a yearly plan's last period. Per site,
	// so the primary key finds the rows instead of the whole table being read.
	const oldest = Math.floor(Date.now() / 86400000) - USAGE_DAYS
	if (all.length) await env.CONTROL.batch(all.map((s) => env.CONTROL.prepare('DELETE FROM usage_daily WHERE site_id = ? AND day < ?').bind(s.id, oldest)))
	// Each site keeps its data for its own retention or the default, never past the longest:
	// the server's, or with plans on the smaller of the server's and the team's plan's, so a
	// move to a smaller plan applies here without changing the site's setting.
	const sites = all.map((s) => ({ id: s.id, days: retentionDays(s.retention_days, siteRetention(env, plans ? (plans.get(s.team_id) ?? teamPlan(null)) : null)) })).filter((s) => s.days > 0)
	// payments hold provider customer ids and the visit, so they follow the same retention;
	// the keys a payment waits for go with it (ON DELETE CASCADE)
	if (sites.length) await env.CONTROL.batch(sites.map((s) => env.CONTROL.prepare('DELETE FROM payments WHERE site_id = ? AND ts < ?').bind(s.id, Date.now() - s.days * 86400000)))
	for (const shard of await getShards(env)) {
		// one failing shard must not stop the others
		try {
			const db = await shardDb(env, shard.name)
			// Per site, so the (site_id, ts) and (site_id, started_at) indexes find the rows;
			// what is left over goes the next day. A visit ends on the UTC day it started.
			for (const site of sites) {
				const cutoff = Date.now() - site.days * 86400000
				const events = await purge(db, 'events', 'rowid', 'site_id = ? AND ts < ?', [site.id, cutoff], RETENTION_MAX)
				const visits = await purge(db, 'sessions', 'site_id, session_id', 'site_id = ? AND started_at < ?', [site.id, cutoff], RETENTION_MAX)
				if (!events.done || !visits.done) console.log(JSON.stringify({ msg: 'retention behind', shard: shard.name, site: site.id }))
			}
			const size = (await db.prepare('SELECT 1').run()).meta.size_after ?? 0
			const drain = shard.status === 'active' && size > limit
			await env.CONTROL.prepare(`UPDATE shards SET size_bytes = ?${drain ? ", status = 'draining'" : ''} WHERE name = ?`).bind(size, shard.name).run()
			if (drain) console.log(JSON.stringify({ msg: 'shard draining', shard: shard.name, size }))
		} catch (e) {
			console.error(JSON.stringify({ msg: 'shard maintenance failed', shard: shard.name, error: String(e) }))
		}
	}
	invalidate('shards')
}

export default {
	fetch: app.fetch,
	async queue(batch: MessageBatch<EventRow>, env: Env) {
		try {
			await writeEvents(env, batch.messages.map((m) => m.body))
			batch.ackAll()
		} catch (e) {
			console.error(JSON.stringify({ msg: 'event batch failed', size: batch.messages.length, error: String(e) }))
			batch.retryAll({ delaySeconds: 10 })
		}
	},
	async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
		// every 5 minutes: spike alerts, moving data off retiring shards, the sample site's
		// traffic; hourly: maintenance, email reports, quiet alerts; daily: retention cleanup
		ctx.waitUntil(runAlerts(env))
		ctx.waitUntil(retireShards(env))
		ctx.waitUntil(fillSample(env).catch((e) => console.error(JSON.stringify({ msg: 'sample traffic failed', error: String(e) }))))
		// a cron other than the five-minute one (a test, or a manual trigger) runs everything
		const other = controller.cron !== '*/5 * * * *'
		const at = new Date(controller.scheduledTime)
		if (other || at.getUTCMinutes() === 15) {
			ctx.waitUntil(maintenance(env, other || at.getUTCHours() === CLEANUP_HOUR))
			ctx.waitUntil(runReports(env))
		}
	},
} satisfies ExportedHandler<Env, EventRow>
