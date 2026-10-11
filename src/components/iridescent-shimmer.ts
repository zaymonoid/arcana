import { css } from 'lit'
import { ShaderCanvas } from './shader-canvas'

/**
 * Flow-field iridescence, drawn with WebGL over a face-down card.
 *
 * Each pixel is advected along a noise-driven flow field; the distance it
 * travels and the streak texture it lands on set a thin-film "thickness",
 * which maps to an oil-slick spectrum. A slow diagonal glint sweeps across.
 * The seed offsets time, so each card catches the flow at a different moment.
 */

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uFade;
uniform float uSeed;

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
  float t = uTime + uSeed * 120.0;

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

export class IridescentShimmer extends ShaderCanvas {
  protected readonly frag = FRAG

  static styles = [
    ShaderCanvas.styles,
    css`
      canvas {
        mix-blend-mode: screen;
      }
    `,
  ]
}

customElements.define('iridescent-shimmer', IridescentShimmer)
