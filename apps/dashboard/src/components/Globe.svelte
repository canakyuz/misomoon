<script lang="ts" module>
	import { geoBounds, geoCentroid, geoContains } from 'd3-geo'
	import { feature } from 'topojson-client'
	import type { GeometryCollection, Topology } from 'topojson-specification'
	import world from 'world-atlas/countries-110m.json'
	import { alpha2FromNumeric } from '../lib/countries'

	interface Land {
		code: string
		shape: GeoJSON.Feature
		box: [[number, number], [number, number]]
	}
	/** A halftone dot on land: where it sits on the unit sphere, and whose country it is. */
	interface Dot {
		lon: number
		lat: number
		x: number
		y: number
		z: number
		code: string
	}

	const RAD = Math.PI / 180
	const topo = world as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>
	const lands: Land[] = feature(topo, topo.objects.countries)
		.features.filter((f) => f.id !== '010')
		.flatMap((f) => {
			const code = alpha2FromNumeric(f.id as string)
			return code ? [{ code, shape: f as GeoJSON.Feature, box: geoBounds(f) }] : []
		})
	const centroids = new Map(lands.map((l) => [l.code, geoCentroid(l.shape)]))

	// a box whose west edge is east of its east edge wraps across the antimeridian (Russia, Fiji)
	const inBox = ([[w, s], [e, n]]: Land['box'], lon: number, lat: number) => lat >= s && lat <= n && (w <= e ? lon >= w && lon <= e : lon >= w || lon <= e)

	export function landAt(lon: number, lat: number): string | null {
		for (const l of lands) if (inBox(l.box, lon, lat) && geoContains(l.shape, [lon, lat])) return l.code
		return null
	}

	let dots: Dot[] | null = null
	const STEP = 1.5
	/** Dots every 1.5 degrees, spaced evenly around each circle of latitude, built once on first use. */
	function landDots(): Dot[] {
		if (dots) return dots
		dots = []
		for (let lat = -55.5; lat <= 82; lat += STEP) {
			const n = Math.max(1, Math.round((360 / STEP) * Math.cos(lat * RAD)))
			for (let i = 0; i < n; i++) {
				const lon = -180 + ((i + 0.5) * 360) / n
				const code = landAt(lon, lat)
				if (!code) continue
				const c = Math.cos(lat * RAD)
				dots.push({ lon, lat, code, x: c * Math.cos(lon * RAD), y: c * Math.sin(lon * RAD), z: Math.sin(lat * RAD) })
			}
		}
		return dots
	}
</script>

<script lang="ts">
	import type { Row } from '../lib/api'
	import { countryName, flag, isCountry } from '../lib/countries'
	import { getDash } from '../lib/dash.svelte'
	import { num } from '../lib/format'

	/**
	 * The world as a halftone globe: one dot per patch of land, inked by how many people
	 * came from that country. It turns slowly, turns by drag, and spins to the selected
	 * country. The list beside it carries the same numbers for keyboards and screen readers.
	 */
	interface Props {
		rows: Row[]
		selected: string | null
		onpick: (code: string) => void
	}
	let { rows, selected, onpick }: Props = $props()
	const dash = getDash()

	let box = $state<DOMRectReadOnly>()
	const size = $derived(Math.min(440, Math.floor(box?.width ?? 0)))
	let canvas: HTMLCanvasElement | undefined = $state()

	const byCode = $derived(new Map(rows.filter((r) => isCountry(r.key)).map((r) => [r.key, r.visitors])))
	const max = $derived(Math.max(1, ...byCode.values()))
	const total = $derived(rows.reduce((n, r) => n + r.visitors, 0))

	// [longitude, latitude] at the centre of the view; it starts over the biggest audience
	let view = [0, 20]
	let started = false
	let dragging: { x: number; y: number; lon: number; lat: number; moved: boolean } | null = null
	let flight: { from: number[]; to: number[]; t0: number } | null = null
	let idleUntil = 0
	let hover = $state<{ code: string; x: number; y: number } | null>(null)
	let onScreen = true
	const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

	let ink = { land: '', hot: '', edge: '', sea: '', line: '', text: '' }
	function readInk() {
		if (!canvas) return
		const s = getComputedStyle(canvas)
		const v = (n: string) => s.getPropertyValue(n).trim()
		ink = { land: v('--text-3'), hot: v('--miso'), edge: v('--edge'), sea: v('--surface'), line: v('--line-strong'), text: v('--text') }
	}

	$effect(() => {
		void dash.theme
		// the theme attribute changes before the next frame paints
		requestAnimationFrame(() => {
			readInk()
			dirty = true
		})
	})

	// the first data turns the globe to the biggest audience
	$effect(() => {
		const top = rows.find((r) => centroids.has(r.key))
		if (started || !top) return
		started = true
		const [lon, lat] = centroids.get(top.key)!
		view = [lon, Math.max(-35, Math.min(35, lat))]
		dirty = true
	})

	// a newly selected country flies into view
	$effect(() => {
		const c = selected && centroids.get(selected)
		if (!c) return
		const to = [c[0], Math.max(-50, Math.min(50, c[1]))]
		const from = [...view]
		// take the short way round
		if (to[0] - from[0] > 180) from[0] += 360
		if (from[0] - to[0] > 180) from[0] -= 360
		flight = still ? null : { from, to, t0: performance.now() }
		if (still) view = to
		idleUntil = performance.now() + 8000
		dirty = true
	})

	let dirty = true
	$effect(() => {
		void byCode
		void size
		void selected
		dirty = true
	})

	$effect(() => {
		if (!canvas || !size) return
		readInk()
		const io = new IntersectionObserver(([e]) => (onScreen = e.isIntersecting))
		io.observe(canvas)
		let raf = 0
		let last = performance.now()
		const frame = (now: number) => {
			raf = requestAnimationFrame(frame)
			const dt = Math.min(64, now - last)
			last = now
			if (!onScreen || document.hidden) return
			if (flight) {
				const t = Math.min(1, (now - flight.t0) / 900)
				const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
				view = [flight.from[0] + (flight.to[0] - flight.from[0]) * e, flight.from[1] + (flight.to[1] - flight.from[1]) * e]
				if (t === 1) flight = null
				dirty = true
			} else if (!still && !dragging && !hover && now > idleUntil) {
				// about one turn a minute
				view = [view[0] + dt * 0.006, view[1]]
				dirty = true
			}
			if (dirty) {
				draw()
				dirty = false
			}
		}
		raf = requestAnimationFrame(frame)
		return () => {
			cancelAnimationFrame(raf)
			io.disconnect()
		}
	})

	function draw() {
		const ctx = canvas?.getContext('2d')
		if (!ctx || !size) return
		const dpr = Math.min(2, devicePixelRatio || 1)
		if (canvas!.width !== size * dpr) {
			canvas!.width = size * dpr
			canvas!.height = size * dpr
		}
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
		ctx.clearRect(0, 0, size, size)
		const shadow = Math.round(size / 90)
		const r = size / 2 - shadow - 2
		const cx = size / 2 - shadow / 2
		const cy = size / 2 - shadow / 2

		// a printed disc: a hard ink shadow, the sea, an ink edge
		ctx.fillStyle = ink.edge
		ctx.beginPath()
		ctx.arc(cx + shadow, cy + shadow, r, 0, Math.PI * 2)
		ctx.fill()
		ctx.fillStyle = ink.sea
		ctx.beginPath()
		ctx.arc(cx, cy, r, 0, Math.PI * 2)
		ctx.fill()

		// the view's centre as a unit vector, and the screen axes around it
		const [lon0, lat0] = [view[0] * RAD, view[1] * RAD]
		const c = [Math.cos(lat0) * Math.cos(lon0), Math.cos(lat0) * Math.sin(lon0), Math.sin(lat0)]
		const east = [-Math.sin(lon0), Math.cos(lon0), 0]
		const north = [-Math.sin(lat0) * Math.cos(lon0), -Math.sin(lat0) * Math.sin(lon0), Math.cos(lat0)]
		// every dot the same size, about a third of the gap between them, so a country keeps its outline
		const base = Math.max(0.9, r * STEP * RAD * 0.34)

		for (const d of landDots()) {
			const z = d.x * c[0] + d.y * c[1] + d.z * c[2]
			if (z <= 0.04) continue
			const px = cx + r * (d.x * east[0] + d.y * east[1])
			const py = cy - r * (d.x * north[0] + d.y * north[1] + d.z * north[2])
			const v = byCode.get(d.code)
			const on = selected === d.code
			// more people, deeper ink; the biggest country prints solid
			ctx.globalAlpha = on ? 1 : v ? (selected ? 0.4 : 0.35 + 0.65 * Math.sqrt(v / max)) : 0.42
			ctx.fillStyle = on ? ink.text : v ? ink.hot : ink.land
			ctx.beginPath()
			// dots shrink toward the rim, which reads as a sphere without any shading
			ctx.arc(px, py, base * (0.5 + 0.5 * z), 0, Math.PI * 2)
			ctx.fill()
		}
		ctx.globalAlpha = 1

		ctx.strokeStyle = ink.edge
		ctx.lineWidth = 1.5
		ctx.beginPath()
		ctx.arc(cx, cy, r, 0, Math.PI * 2)
		ctx.stroke()
	}

	/** The country under a point on the canvas, if the point is on the globe. */
	function countryAt(px: number, py: number): string | null {
		const shadow = Math.round(size / 90)
		const r = size / 2 - shadow - 2
		const cx = size / 2 - shadow / 2
		const cy = size / 2 - shadow / 2
		const sx = (px - cx) / r
		const sy = (cy - py) / r
		const rr = sx * sx + sy * sy
		if (rr >= 1) return null
		const sz = Math.sqrt(1 - rr)
		const [lon0, lat0] = [view[0] * RAD, view[1] * RAD]
		// screen axes back to the sphere: the point = sz·centre + sx·east + sy·north
		const x = sz * Math.cos(lat0) * Math.cos(lon0) - sx * Math.sin(lon0) - sy * Math.sin(lat0) * Math.cos(lon0)
		const y = sz * Math.cos(lat0) * Math.sin(lon0) + sx * Math.cos(lon0) - sy * Math.sin(lat0) * Math.sin(lon0)
		const z = sz * Math.sin(lat0) + sy * Math.cos(lat0)
		return landAt(Math.atan2(y, x) / RAD, Math.asin(Math.max(-1, Math.min(1, z))) / RAD)
	}

	function down(e: PointerEvent) {
		canvas?.setPointerCapture(e.pointerId)
		dragging = { x: e.clientX, y: e.clientY, lon: view[0], lat: view[1], moved: false }
		flight = null
	}
	function move(e: PointerEvent) {
		const rect = canvas!.getBoundingClientRect()
		if (dragging) {
			const dx = e.clientX - dragging.x
			const dy = e.clientY - dragging.y
			if (Math.abs(dx) + Math.abs(dy) > 3) dragging.moved = true
			// a drag across the globe turns it about half a turn
			const k = 180 / size
			view = [dragging.lon - dx * k, Math.max(-70, Math.min(70, dragging.lat + dy * k))]
			hover = null
			dirty = true
			return
		}
		const code = countryAt(e.clientX - rect.left, e.clientY - rect.top)
		hover = code ? { code, x: e.clientX - rect.left, y: e.clientY - rect.top } : null
	}
	function up(e: PointerEvent) {
		const was = dragging
		dragging = null
		idleUntil = performance.now() + 4000
		if (was?.moved) return
		const rect = canvas!.getBoundingClientRect()
		const code = countryAt(e.clientX - rect.left, e.clientY - rect.top)
		if (code && byCode.has(code)) onpick(code)
	}

	const label = $derived(
		`Globe of visitors by country. ${rows
			.filter((r) => isCountry(r.key))
			.slice(0, 3)
			.map((r) => `${countryName(r.key)}: ${num(r.visitors)}`)
			.join(', ')}.`,
	)
</script>

<div class="globe" bind:contentRect={box} role="img" aria-label={label}>
	{#if size}
		<canvas
			bind:this={canvas}
			style:width="{size}px"
			style:height="{size}px"
			class:grab={!!hover}
			aria-hidden="true"
			onpointerdown={down}
			onpointermove={move}
			onpointerup={up}
			onpointercancel={() => (dragging = null)}
			onpointerleave={() => (hover = null)}
		></canvas>
		{#if hover}
			<div class="tip" style:left="{hover.x}px" style:top="{hover.y}px">
				<span>{flag(hover.code)} {countryName(hover.code)}</span>
				<span class="num">
					{num(byCode.get(hover.code) ?? 0)} <span class="muted">people</span>
					{#if total && byCode.get(hover.code)}<span class="muted">· {Math.round(((byCode.get(hover.code) ?? 0) / total) * 100)}%</span>{/if}
				</span>
			</div>
		{/if}
	{/if}
</div>

<style>
	.globe {
		position: relative;
		display: grid;
		place-items: center;
		width: 100%;
	}
	canvas {
		display: block;
		/* a sideways drag turns the globe, an up or down swipe still scrolls the page */
		touch-action: pan-y;
		cursor: grab;
	}
	canvas:active {
		cursor: grabbing;
	}
	canvas.grab {
		cursor: pointer;
	}
	.tip {
		position: absolute;
		transform: translate(-50%, calc(-100% - 14px));
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 8px 10px;
		border-radius: var(--radius);
		background: var(--surface);
		border: 1.5px solid var(--edge);
		box-shadow: var(--shadow);
		font-size: 12px;
		white-space: nowrap;
		pointer-events: none;
	}
</style>
