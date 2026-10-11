import { css } from 'lit'
import { ShaderCanvas } from './shader-canvas'

/**
 * A breathing gold sigil for the centre of the card back, drawn as a signed
 * distance field.
 *
 * A simplified port of the psionic storm sigil from Risk of Cease and Desist:
 * one spoke is drawn in a single mirrored sector, then folded around the
 * centre so it repeats. Wobbling rings frame it, counter-rotating arcs drift
 * between the spokes, and a soft multi-falloff glow is laid over the shape.
 */

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uFade;

const float PI = 3.14159265;
const float FOLDS = 7.0;
const float SIZE = 2.0;
// Stroke weight, scaled down so lines stay fine at a large SIZE.
const float LINE = 0.5;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

mat2 rot(float a) {
  float s = sin(a), c = cos(a);
  return mat2(c, -s, s, c);
}

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float sdLine(vec2 p, vec2 a, vec2 b, float w) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - w;
}

// An arc of radius r centred on the +x axis, spanning +/- span radians.
float sdArc(vec2 p, float r, float span, float w) {
  if (abs(atan(p.y, p.x)) < span) return abs(length(p) - r) - w;
  vec2 e = r * vec2(cos(span), sin(span));
  return min(length(p - e), length(p - vec2(e.x, -e.y))) - w;
}

// Fold the plane into one mirrored sector so a single spoke repeats.
vec2 fold(vec2 p) {
  float sector = 2.0 * PI / FOLDS;
  float a = mod(atan(p.y, p.x) + 0.5 * sector, sector) - 0.5 * sector;
  return length(p) * vec2(cos(abs(a)), sin(abs(a)));
}

float sigil(vec2 uv, float t) {
  float k = 0.007;
  float breathe = 1.0 + 0.04 * sin(t * 0.5);
  float r = length(uv);
  float ang = atan(uv.y, uv.x);

  // Wobbling centre and a pair of framing rings.
  float d = r - (0.035 * breathe + 0.004 * sin(ang * 3.0 + t * 0.8));
  float ring1 = 0.40 * breathe + 0.010 * sin(ang * 5.0 + t * 0.4) + 0.006 * sin(ang * 8.0 - t * 0.6);
  float ring2 = 0.43 * breathe + 0.008 * sin(ang * 6.0 - t * 0.35);
  d = min(d, abs(r - ring1) - 0.005 * LINE);
  d = min(d, abs(r - ring2) - 0.002 * LINE);

  // A lightly warped, folded domain for the spokes.
  vec2 warp = vec2(noise(uv * 6.0 + t * 0.15), noise(uv * 6.0 + vec2(5.2, 1.3) - t * 0.12)) - 0.5;
  vec2 fp = fold(uv + 0.02 * warp);

  // The spoke: a vine that tapers and sways towards its tip.
  vec2 prev = vec2(0.065, 0.0);
  float spoke = 1e9;
  for (int j = 1; j <= 4; j++) {
    float tj = float(j) / 4.0;
    vec2 cur = vec2(mix(0.065, 0.34, tj), tj * tj * 0.018 * sin(t * 0.6 + float(j) * 1.7));
    spoke = smin(spoke, sdLine(fp, prev, cur, mix(0.0035, 0.0015, tj) * LINE), k * 0.5);
    prev = cur;
  }
  d = smin(d, spoke, k);
  d = smin(d, length(fp - prev) - 0.0055, k);

  // Two side branches, each ending in a node.
  vec2 b1 = vec2(0.185, 0.024 + 0.008 * sin(t * 0.5));
  d = smin(d, sdLine(fp, vec2(0.15, 0.0), b1, 0.002 * LINE), k);
  d = smin(d, length(fp - b1) - 0.0035, k);
  vec2 b2 = vec2(0.27, 0.02 + 0.006 * sin(t * 0.4 + 2.0));
  d = smin(d, sdLine(fp, vec2(0.25, 0.0), b2, 0.0018 * LINE), k);
  d = smin(d, length(fp - b2) - 0.003, k);

  // Arcs between the spokes, drifting in opposite directions.
  float sector = PI / FOLDS;
  d = smin(d, sdArc(fold(rot(t * 0.07) * uv), 0.17 * breathe, sector * (0.7 + 0.12 * sin(t * 0.4)), 0.003 * LINE), k * 0.6);
  d = smin(d, sdArc(fold(rot(-t * 0.05) * uv), 0.30 * breathe, sector * (0.55 + 0.1 * sin(t * 0.3)), 0.0025 * LINE), k * 0.6);

  return d;
}

void main() {
  // Centred coordinates scaled to the frame's width: SIZE > 1 lets the outer
  // rings run off the edges so the sigil fills the frame rather than fits it.
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / (uRes.x * SIZE);
  float t = uTime * 1.4;
  float d = sigil(uv, t);

  // Crisp core plus layered glow, in the card's gold.
  vec3 gold = vec3(0.83, 0.69, 0.37);
  float edge = smoothstep(0.0015, 0.0, d);
  float g1 = 0.0025 / (abs(d) + 0.0025);
  float g2 = 0.025 / (abs(d) + 0.025) * 0.22;
  vec3 col = gold * (edge * 1.2 + g1 * 0.8 + g2 * 0.5);
  col += vec3(0.08, 0.02, -0.04) * sin(atan(uv.y, uv.x) * 3.0 + t * 0.2) * g1 * 0.4;
  col = 1.0 - exp(-col * 1.5);

  // Luminance drives alpha so only the sigil and its glow cover the card.
  float mask = 1.0 - smoothstep(0.44, 0.5, length(uv));
  float a = clamp(dot(col, vec3(0.299, 0.587, 0.114)) * 2.5, 0.0, 1.0) * mask * uFade;
  gl_FragColor = vec4(col * a, a);
}
`

export class CardSigil extends ShaderCanvas {
  protected readonly frag = FRAG

  // Clip to the inner gold rule of the card back (x/y 5.5, rx 2 in its 70×120 viewBox).
  static styles = [
    ShaderCanvas.styles,
    css`
      :host {
        inset: calc(5.5 / 120 * 100%) calc(5.5 / 70 * 100%);
        border-radius: calc(2 / 70 * 100%) / calc(2 / 120 * 100%);
      }
    `,
  ]
}

customElements.define('card-sigil', CardSigil)
