import { LitElement, css, html, type CSSResultGroup } from 'lit'

/**
 * A full-bleed WebGL canvas that runs one fragment shader.
 *
 * Subclasses provide `frag`, which receives `uRes`, `uTime` and `uFade`.
 * Purely presentational: `active` comes from the store; when it turns off
 * the effect fades out and the render loop stops.
 */

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

export abstract class ShaderCanvas extends LitElement {
  static properties = { active: { type: Boolean } }
  declare active: boolean

  protected abstract readonly frag: string

  static styles: CSSResultGroup = css`
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
    const fs = compile(gl.FRAGMENT_SHADER, this.frag)
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
