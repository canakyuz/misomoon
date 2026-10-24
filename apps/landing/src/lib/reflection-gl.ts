// The hero's Reflection mark, drawn live in a single fragment shader. Raw WebGL, no
// library, loaded after the page is idle; the SVG version underneath is the first paint
// and the fallback (no WebGL, reduced motion).
//
// The cursor is the sun. Its position lights the halftone moon, so the phase follows you
// (near the middle: full; off to the side: a crescent) and eases back to tonight's real
// phase when you leave. Below the horizon the reflection is the last 30 days of traffic,
// one column per day; the cursor touches the water there and rings spread through it.

const VERT = `attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}`

const FRAG = `precision mediump float;
uniform vec2 uSize;      // css px
uniform float uDpr, uT, uHy, uN, uHover, uRipple, uRows;
uniform vec3 uL;         // light direction
uniform vec2 uM;         // pointer, css px
uniform float uDepth[32];
uniform vec3 uRed, uInk;

float depthAt(float i){
  float d=0.;
  for(int k=0;k<32;k++){ if(float(k)==i) d=uDepth[k]; }
  return d;
}

void main(){
  vec2 p=vec2(gl_FragCoord.x,uSize.y*uDpr-gl_FragCoord.y)/uDpr;
  float W=uSize.x;
  float R=W*.5*100./102.;
  vec2 c=vec2(W*.5);
  float aa=.9/uDpr+.35;
  vec3 L=normalize(uL);
  vec4 col=vec4(0.);

  if(p.y<uHy-1.){
    // halftone moon: 38 rows, alternate rows offset a quarter step, like the print
    float st=2.*R/38.;
    float j0=floor((p.y-(c.y-R))/st);
    float best=0.;
    for(int dj=-1;dj<=1;dj++){
      float j=j0+float(dj);
      float ox=(mod(j,2.)>.5?.25:-.25)*st;
      float i0=floor((p.x-(c.x-R)-ox)/st);
      for(int di=-1;di<=1;di++){
        float i=i0+float(di);
        vec2 q=vec2(c.x-R+st*(i+.5)+ox,c.y-R+st*(j+.5));
        vec2 v=q-c;
        float rr=dot(v,v);
        if(rr>R*R*.985||q.y>uHy-2.) continue;
        float z=sqrt(R*R-rr);
        float b=max(0.,dot(vec3(v.x,v.y,z),L)/R);
        float r=st*.56*pow(b,.7);
        if(r<.35) continue;
        best=max(best,1.-smoothstep(r-aa,r+aa,length(p-q)));
      }
    }
    col=vec4(uRed,1.)*best;
    // dotted rim
    float d=length(p-c), rim=R*1.0;
    float ang=atan(p.y-c.y,p.x-c.x);
    float dash=step(fract(ang*rim/(4.4*W/204.)),.34);
    float ring=(1.-smoothstep(.5,.5+aa,abs(d-rim)/(.8*W/204.)))*dash;
    col=mix(col,vec4(uInk,1.),ring*(1.-best));
  } else if(p.y>uHy+4.){
    // reflection: one column per day, rows fade with depth
    float pad=W*.04, cw=(W-2.*pad)/uN;
    float ci=floor((p.x-pad)/cw);
    if(ci>=0.&&ci<uN){
      float pr=cw*.62+5.;
      float k=floor((p.y-uHy-8.)/pr);
      float dep=depthAt(ci);
      if(k>=0.&&k<dep){
        vec2 q=vec2(pad+cw*(ci+.5),uHy+8.+pr*(k+.5));
        // water moves a little with depth
        q.x+=sin(uT*1.1+k*.9+ci*.35)*1.3*(k/uRows+.15);
        // the cursor touches the water: rings travel out from it
        float dm=length(q-uM);
        float wave=sin(dm*.11-uT*7.)*exp(-dm*.011)*uRipple;
        q.x+=wave*5.*sign(q.x-uM.x+.001);
        // the reflection takes its light from the moon above it
        float u=(q.x-c.x)/R;
        float lb=max(0.,dot(vec3(u,0.,sqrt(max(0.,1.-u*u))),L));
        float r=cw*(.33-k*.016)*mix(.45,1.,pow(lb,.6))*(1.+.4*wave);
        float a=(1.-k/uRows*.7);
        float m=1.-smoothstep(r-aa,r+aa,length(p-q));
        vec3 tint=ci==uHover?uInk:uRed;
        col=vec4(tint,1.)*m*(ci==uHover?1.:a);
      }
    }
  }
  gl_FragColor=col;
}`

export interface ReflectionGL {
	setDepths(d: number[]): void
	setHover(i: number | null): void
	setPhase(phase: number): void
	destroy(): void
}

function css(el: Element, v: string): [number, number, number] {
	const probe = document.createElement('i')
	probe.style.color = `var(${v})`
	el.appendChild(probe)
	const m = getComputedStyle(probe).color.match(/\d+(\.\d+)?/g) ?? ['0', '0', '0']
	probe.remove()
	return [+m[0] / 255, +m[1] / 255, +m[2] / 255]
}

export function startReflection(
	stage: HTMLElement,
	canvas: HTMLCanvasElement,
	opts: { phase: number; depths: number[]; rows: number; horizon: () => number },
): ReflectionGL | null {
	const gl = canvas.getContext('webgl', { premultipliedAlpha: true, antialias: false, alpha: true })
	if (!gl) return null
	const sh = (type: number, src: string) => {
		const s = gl.createShader(type)!
		gl.shaderSource(s, src)
		gl.compileShader(s)
		return s
	}
	const prog = gl.createProgram()!
	gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT))
	gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG))
	gl.linkProgram(prog)
	if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null
	gl.useProgram(prog)
	gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
	const aLoc = gl.getAttribLocation(prog, 'a')
	gl.enableVertexAttribArray(aLoc)
	gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0)
	const U = (n: string) => gl.getUniformLocation(prog, n)

	gl.uniform3fv(U('uRed'), css(stage, '--vermilion'))
	gl.uniform3fv(U('uInk'), css(stage, '--text'))
	gl.uniform1f(U('uRows'), opts.rows)

	// tonight's light, the resting state
	const lightFor = (phase: number): [number, number, number] => {
		const a = phase * Math.PI * 0.95
		return [Math.sin(a), -0.18, Math.cos(a)]
	}
	let rest = lightFor(opts.phase)
	const light = [...rest]
	let target = rest
	const pointer = { x: -1e4, y: -1e4, inside: false }
	let ripple = 0
	let hover = -1
	let depths = opts.depths

	let w = 0
	let h = 0
	let dpr = 1
	const resize = () => {
		dpr = Math.min(2, window.devicePixelRatio || 1)
		w = stage.clientWidth
		h = stage.clientHeight
		canvas.width = Math.round(w * dpr)
		canvas.height = Math.round(h * dpr)
		gl.viewport(0, 0, canvas.width, canvas.height)
	}
	resize()
	// Setting the canvas size clears it, so a resize (a phone turning) must draw
	// again even when the loop has gone to sleep.
	const ro = new ResizeObserver(() => {
		resize()
		kick()
	})
	ro.observe(stage)

	const onMove = (e: PointerEvent) => {
		const r = stage.getBoundingClientRect()
		const x = e.clientX - r.left
		const y = e.clientY - r.top
		const dx = x - pointer.x
		const dy = y - pointer.y
		pointer.x = x
		pointer.y = y
		pointer.inside = true
		kick()
		const R = (w / 2) * (100 / 102)
		if (y < opts.horizon()) {
			// the cursor is the sun: overhead = full, off to the side = crescent
			const ux = (x - w / 2) / R
			const uy = (y - w / 2) / R
			target = [ux, uy, 1.5 - Math.hypot(ux, uy)]
		} else {
			ripple = Math.min(1, ripple + Math.hypot(dx, dy) / 60)
		}
	}
	const onLeave = () => {
		pointer.inside = false
		target = rest
		kick()
	}
	stage.addEventListener('pointermove', onMove)
	stage.addEventListener('pointerleave', onLeave)

	let visible = true
	// frames only run while something moves; the scene settles, then the loop sleeps
	let awakeUntil = 0
	const kick = () => {
		awakeUntil = performance.now() + 2500
		if (!raf && visible) raf = requestAnimationFrame(frame)
	}
	const io = new IntersectionObserver(([e]) => {
		visible = e.isIntersecting
		if (visible) kick()
	})
	io.observe(stage)

	const t0 = performance.now()
	let raf = 0
	function frame(now: number) {
		raf = 0
		if (!visible || document.hidden) return
		const ease = pointer.inside ? 0.12 : 0.04
		for (let i = 0; i < 3; i++) light[i] += (target[i] - light[i]) * ease
		ripple *= 0.965
		gl!.uniform2f(U('uSize'), w, h)
		gl!.uniform1f(U('uDpr'), dpr)
		gl!.uniform1f(U('uT'), (now - t0) / 1000)
		gl!.uniform1f(U('uHy'), opts.horizon())
		gl!.uniform1f(U('uN'), depths.length)
		gl!.uniform1fv(
			U('uDepth'),
			new Float32Array(32).map((_, i) => depths[i] ?? 0),
		)
		gl!.uniform1f(U('uHover'), hover)
		gl!.uniform1f(U('uRipple'), ripple)
		gl!.uniform3f(U('uL'), light[0], light[1], light[2])
		gl!.uniform2f(U('uM'), pointer.x, pointer.y)
		gl!.clearColor(0, 0, 0, 0)
		gl!.clear(gl!.COLOR_BUFFER_BIT)
		gl!.drawArrays(gl!.TRIANGLES, 0, 3)
		if (now < awakeUntil) raf = requestAnimationFrame(frame)
	}
	const onVis = () => {
		if (!document.hidden) kick()
	}
	document.addEventListener('visibilitychange', onVis)
	kick()

	return {
		setDepths(d) {
			depths = d
			kick()
		},
		setHover(i) {
			hover = i ?? -1
			kick()
		},
		setPhase(phase) {
			rest = lightFor(phase)
			if (!pointer.inside) target = rest
			kick()
		},
		destroy() {
			cancelAnimationFrame(raf)
			ro.disconnect()
			io.disconnect()
			stage.removeEventListener('pointermove', onMove)
			stage.removeEventListener('pointerleave', onLeave)
			document.removeEventListener('visibilitychange', onVis)
			if (!gl.isContextLost()) gl.getExtension('WEBGL_lose_context')?.loseContext()
		},
	}
}
