import { LitElement, css, html } from 'lit'

/**
 * Flow-field iridescence, drawn with WebGL over a face-down card.
 *
 * Each pixel is advected along a noise-driven flow field; the distance it
 * travels and the streak texture it lands on set a thin-film "thickness",
 * which maps to an oil-slick spectrum. A slow diagonal glint sweeps across.
 *
 * Purely presentational: `active` comes from the store; when it turns off
 * the effect fades out and the render loop stops.
 */

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uFade;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = r * p * 2.03; a *= 0.5; }
  return v;
}

// The flow field: a unit vector whose angle is slowly evolving noise.
vec2 flow(vec2 p, float t) {
  float a = fbm(p * 0.9 + vec2(t * 0.03, -t * 0.02)) * 12.566;
  return vec2(cos(a), sin(a));
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y * 3.0;
  float t = uTime;

  // Integrate a short streamline through the field.
  vec2 q = p;
  for (int i = 0; i < 10; i++) { q += 0.06 * flow(q, t); }
  vec2 dir = flow(q, t);

  // Fine filaments: contour bands of a field carried along the streamlines.
  float field = fbm(q * 1.6 + t * 0.05);
  float filaments = pow(0.5 + 0.5 * sin(48.0 * field + t * 0.6), 6.0);

  // Thin-film interference: thickness → hue.
  float thickness = 0.5 * length(q - p) + 1.6 * field
                  + 0.15 * dot(dir, vec2(0.857, 0.514)) + 0.04 * t;
  vec3 film = 0.5 + 0.5 * cos(6.2831 * (1.3 * thickness + vec3(0.0, 0.33, 0.67)));

  // A slow glint sweeping corner to corner, which also lifts the filaments.
  float d = (0.8 * uv.x + uv.y) - (mod(t * 0.18, 2.6) - 0.4);
  float glint = exp(-d * d * 14.0);

  float a = (0.05 + 0.32 * filaments * (0.5 + glint) + 0.30 * glint) * uFade;
  gl_FragColor = vec4(film * a, a);
}
`

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

export class IridescentShimmer extends LitElement {
  static properties = { active: { type: Boolean } }
  declare active: boolean

  static styles = css`
    :host {
      position: absolute;
      inset: 0;
      pointer-events: none;
      border-radius: inherit;
      overflow: hidden;
    }
    canvas {
      display: block;
      width: 100%;
      height: 100%;
      mix-blend-mode: screen;
    }
  `

  private gl: WebGLRenderingContext | null = null
  private uniforms: Record<'res' | 'time' | 'fade', WebGLUniformLocation | null> | null = null
  private raf = 0
  private fade = 0
  private start = performance.now()
  private resize?: ResizeObserver

  constructor() {
    super()
    this.active = false
  }

  render() {
    return html`<canvas></canvas>`
  }

  firstUpdated() {
    const canvas = this.renderRoot.querySelector('canvas')!
    this.gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false })
    if (!this.gl || !this.setup(this.gl)) {
      this.gl = null
      return
    }
    this.resize = new ResizeObserver(() => this.sizeCanvas())
    this.resize.observe(this)
    this.sizeCanvas()
    this.kick()
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has('active')) this.kick()
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    cancelAnimationFrame(this.raf)
    this.raf = 0
    this.resize?.disconnect()
    // Free the context eagerly — browsers cap how many can be alive.
    this.gl?.getExtension('WEBGL_lose_context')?.loseContext()
    this.gl = null
  }

  private setup(gl: WebGLRenderingContext) {
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null
    }
    const vs = compile(gl.VERTEX_SHADER, VERT)
    const fs = compile(gl.FRAGMENT_SHADER, FRAG)
    if (!vs || !fs) return false
    const prog = gl.createProgram()!
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false
    gl.useProgram(prog)

    // One triangle that covers the viewport.
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'aPos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    this.uniforms = {
      res: gl.getUniformLocation(prog, 'uRes'),
      time: gl.getUniformLocation(prog, 'uTime'),
      fade: gl.getUniformLocation(prog, 'uFade'),
    }
    gl.clearColor(0, 0, 0, 0)
    return true
  }

  private sizeCanvas() {
    const gl = this.gl
    if (!gl) return
    const dpr = Math.min(devicePixelRatio || 1, 1.5)
    const w = Math.max(1, Math.round(this.clientWidth * dpr))
    const h = Math.max(1, Math.round(this.clientHeight * dpr))
    if (gl.canvas.width !== w || gl.canvas.height !== h) {
      gl.canvas.width = w
      gl.canvas.height = h
      gl.viewport(0, 0, w, h)
      if (!this.raf) this.draw()
    }
  }

  private kick() {
    if (this.gl && !this.raf) this.raf = requestAnimationFrame(this.frame)
  }

  private frame = () => {
    this.raf = 0
    const target = this.active ? 1 : 0
    const still = reducedMotion()
    this.fade = still ? target : this.fade + (target - this.fade) * 0.08
    if (Math.abs(this.fade - target) < 0.005) this.fade = target
    this.draw()
    // Keep animating while visible; a reduced-motion user gets one still frame.
    if ((this.fade > 0 || target > 0) && !still) this.raf = requestAnimationFrame(this.frame)
  }

  private draw() {
    const gl = this.gl
    const u = this.uniforms
    if (!gl || !u) return
    gl.clear(gl.COLOR_BUFFER_BIT)
    if (this.fade <= 0) return
    gl.uniform2f(u.res, gl.canvas.width, gl.canvas.height)
    gl.uniform1f(u.time, (performance.now() - this.start) / 1000)
    gl.uniform1f(u.fade, this.fade)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }
}

customElements.define('iridescent-shimmer', IridescentShimmer)
