import type { Sigil } from '../deck'
import { ShaderCanvas } from './shader-canvas'

/**
 * A breathing sigil for the centre of the card back, drawn as a signed
 * distance field, with a variant for each level's arcanum.
 *
 * A simplified port of the psionic storm sigil from Risk of Cease and Desist:
 * a spoke is drawn in a single mirrored sector, then folded around the
 * centre so it repeats. Wobbling rings, counter-rotating arcs and a soft
 * multi-falloff glow tie the variants together:
 *
 *   fool   — Perception: a wandering, blinking eye inside the vine sigil
 *   lovers — Connection: two interlocking rings joined by a twisting helix
 *   star   — Reflection: a many-pointed star, rays and a twinkling ring
 *
 * The card's seed (`uSeed`) varies each design's details — spoke counts,
 * tilts, reaches, spin — so no two cards of a level are drawn quite alike.
 */

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uFade;
uniform float uSeed;
uniform float uVariant;

const float PI = 3.14159265;
const float SIZE = 3.0;
// Stroke weight, scaled down so lines stay fine at a large SIZE.
const float LINE = 0.4;
const float K = 0.007;

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

// A line that tapers from width w0 at a to w1 at b.
float sdTaper(vec2 p, vec2 a, vec2 b, float w0, float w1) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - mix(w0, w1, h);
}

// An arc of radius r centred on the +x axis, spanning +/- span radians.
float sdArc(vec2 p, float r, float span, float w) {
  if (abs(atan(p.y, p.x)) < span) return abs(length(p) - r) - w;
  vec2 e = r * vec2(cos(span), sin(span));
  return min(length(p - e), length(p - vec2(e.x, -e.y))) - w;
}

// A lens: the overlap of two circles of radius r centred at (0, +/-d), pointed along x.
float sdLens(vec2 p, float r, float d) {
  p = abs(p.yx);
  float b = sqrt(r * r - d * d);
  return ((p.y - b) * d > p.x * b) ? length(p - vec2(0.0, b)) : length(p - vec2(-d, 0.0)) - r;
}

// An n-pointed star of radius r; m (2..n) sets how sharp the points are.
float sdStar(vec2 p, float r, float n, float m) {
  float an = PI / n, en = PI / m;
  vec2 acs = vec2(cos(an), sin(an)), ecs = vec2(cos(en), sin(en));
  float bn = mod(atan(p.x, p.y), 2.0 * an) - an;
  p = length(p) * vec2(cos(bn), abs(sin(bn)));
  p -= r * acs;
  p += ecs * clamp(-dot(p, ecs), 0.0, r * acs.y / ecs.y);
  return length(p) * sign(p.x);
}

// Fold the plane into one mirrored sector of n so a single spoke repeats.
vec2 fold(vec2 p, float n) {
  float sector = 2.0 * PI / n;
  float a = mod(atan(p.y, p.x) + 0.5 * sector, sector) - 0.5 * sector;
  return length(p) * vec2(cos(abs(a)), sin(abs(a)));
}

vec2 warped(vec2 uv, float t) {
  vec2 w = vec2(noise(uv * 6.0 + t * 0.15), noise(uv * 6.0 + vec2(5.2, 1.3) - t * 0.12)) - 0.5;
  return uv + 0.02 * w;
}

// A vine spoke along +x from r0 to r1 that tapers and sways, ending in a node.
float vine(vec2 fp, float t, float r0, float r1) {
  vec2 prev = vec2(r0, 0.0);
  float d = 1e9;
  float sway = 0.018 * (r1 - r0) / 0.275;
  for (int j = 1; j <= 4; j++) {
    float tj = float(j) / 4.0;
    vec2 cur = vec2(mix(r0, r1, tj), tj * tj * sway * sin(t * 0.6 + float(j) * 1.7));
    d = smin(d, sdLine(fp, prev, cur, mix(0.0035, 0.0015, tj) * LINE), K * 0.5);
    prev = cur;
  }
  return smin(d, length(fp - prev) - 0.0055, K);
}

// Two side branches off a vine, each ending in a node.
float branches(vec2 fp, float t, float r0, float r1) {
  float s = (r1 - r0) / 0.275;
  vec2 b1 = vec2(r0 + 0.44 * (r1 - r0), (0.024 + 0.008 * sin(t * 0.5)) * s);
  vec2 b2 = vec2(r0 + 0.74 * (r1 - r0), (0.02 + 0.006 * sin(t * 0.4 + 2.0)) * s);
  float d = sdLine(fp, vec2(r0 + 0.31 * (r1 - r0), 0.0), b1, 0.002 * LINE);
  d = smin(d, length(fp - b1) - 0.0035, K);
  d = smin(d, sdLine(fp, vec2(r0 + 0.67 * (r1 - r0), 0.0), b2, 0.0018 * LINE), K);
  return smin(d, length(fp - b2) - 0.003, K);
}

// A wobbling double ring.
float rings(float r, float ang, float t, float br, float radius) {
  float r1 = radius * br + 0.005 * sin(ang * 5.0 + t * 0.4) + 0.003 * sin(ang * 8.0 - t * 0.6);
  float r2 = (radius + 0.015) * br + 0.004 * sin(ang * 6.0 - t * 0.35);
  return min(abs(r - r1) - 0.005 * LINE, abs(r - r2) - 0.002 * LINE);
}

// Arcs between n spokes at radius r, drifting at the given rate.
float arcs(vec2 uv, float t, float n, float r, float rate, float open) {
  float span = PI / n * (open + 0.1 * sin(t * 0.35 + r * 10.0));
  return sdArc(fold(rot(t * rate) * uv, n), r, span, 0.003 * LINE);
}

// ---- The Fool: Perception ----
// v: six to eight vines, the eye's tilt and size, how far the vines reach.
float fool(vec2 uv, float t, float br, vec4 v) {
  float n = 6.0 + floor(v.x * 3.0);
  float size = mix(0.9, 1.1, v.z);
  float reach = mix(0.31, 0.37, v.w);
  float r = length(uv), ang = atan(uv.y, uv.x);
  vec2 ev = rot((v.y - 0.5) * 0.5) * uv;

  // An eye that glances around and blinks now and then.
  float blink = 1.0 - 0.9 * pow(max(0.0, sin(t * 0.45)), 80.0);
  vec2 ep = vec2(ev.x, ev.y / blink);
  float eye = sdLens(ep, 0.14 * br * size, 0.105 * br * size) * blink;
  float d = abs(eye) - 0.004 * LINE;
  vec2 look = vec2(0.024 * sin(t * 0.37) * sin(t * 0.11), 0.008 * sin(t * 0.23));
  float iris = min(abs(length(ev - look) - 0.024 * size) - 0.003 * LINE, length(ev - look) - 0.011 * size);
  d = min(d, max(iris, eye));

  // Lashes fanning above and below the eye.
  vec2 lp = fold(ev, 12.0 + 2.0 * floor(v.w * 3.0));
  d = min(d, sdTaper(lp, vec2(0.11, 0.0) * size, vec2(0.15, 0.0) * size, 0.0025 * LINE, 0.0));

  vec2 fp = fold(warped(uv, t), n);
  d = smin(d, vine(fp, t, 0.165, reach), K);
  d = smin(d, branches(fp, t, 0.165, reach), K);
  d = min(d, rings(r, ang, t, br, mix(0.19, 0.215, v.z)));
  d = smin(d, arcs(uv, t, n, 0.17 * br, 0.07, mix(0.6, 0.8, v.y)), K * 0.6);
  d = smin(d, arcs(uv, -t, n, 0.30 * br, 0.05, mix(0.45, 0.65, v.x)), K * 0.6);
  return d;
}

// ---- The Lovers: Connection ----
// v: the pair's lean, their distance apart, five or seven spokes, the helix's twist.
float lovers(vec2 uv, float t, float br, vec4 v) {
  uv = rot((v.x - 0.5) * 0.9) * uv;
  float gap = 0.085 * mix(0.88, 1.08, v.y) * br;
  float n = 5.0 + 2.0 * floor(v.z * 2.0);
  float twist = mix(30.0, 46.0, v.w);
  float sway = 0.012 * sin(t * 0.3);
  vec2 c1 = vec2(sway, gap), c2 = vec2(-sway, -gap);

  // Two interlocking rings, each with a core and a flower of short vines.
  vec2 p1 = uv - c1, p2 = uv - c2;
  float d = rings(length(p1), atan(p1.y, p1.x), t, br, 0.12);
  d = min(d, rings(length(p2), atan(p2.y, p2.x), t + 3.0, br, 0.12));
  d = min(d, length(p1) - 0.016);
  d = min(d, length(p2) - 0.016);
  // An odd number of spokes each, one pointing away from the partner, so the helix stays clear.
  float rock = 0.12 * sin(t * 0.25);
  d = smin(d, vine(fold(rot(PI * 0.5 + rock) * p1, n), t, 0.024, 0.075), K);
  d = smin(d, vine(fold(rot(-PI * 0.5 + rock) * p2, n), t + 2.0, 0.024, 0.075), K);

  // A double helix twisting between the two cores.
  float y = uv.y - mix(c2.y, c1.y, 0.5);
  float span = 0.5 * (c1.y - c2.y);
  float amp = 0.035 * cos(clamp(y / span, -1.0, 1.0) * PI * 0.5);
  float x = uv.x - mix(c2.x, c1.x, clamp(y / span * 0.5 + 0.5, 0.0, 1.0));
  float ph = y * twist - t * 1.2;
  float slope = sqrt(1.0 + pow(amp * twist, 2.0));
  float helix = min(abs(x - amp * sin(ph)), abs(x + amp * sin(ph))) / slope - 0.004 * LINE;
  d = min(d, max(helix, abs(y) - span));

  d = smin(d, arcs(uv, t, 6.0 + floor(v.y * 3.0), mix(0.26, 0.285, v.z) * br, 0.05, 0.55), K * 0.6);
  return d;
}

// ---- The Star: Reflection ----
// v: six to eight points, which way and how fast it turns, the rays' reach, the dots' count.
float star(vec2 uv, float t, float br, vec4 v) {
  float n = 6.0 + floor(v.x * 3.0);
  float spin = (v.y < 0.5 ? -1.0 : 1.0) * mix(0.03, 0.06, v.z);
  float reach = mix(0.30, 0.37, v.w);
  float r = length(uv), ang = atan(uv.y, uv.x);
  vec2 p = rot(t * spin) * uv;

  // A many-pointed star with a solid heart. Its points start from +y, so the
  // rays are folded from a quarter turn round to line up with them.
  float d = abs(sdStar(p, 0.075 * br, n, 3.0)) - 0.003 * LINE;
  d = min(d, sdStar(p, 0.028 * br, n, 3.0));

  // Long rays from the points, short ones between, tapering to nothing.
  vec2 fp = fold(warped(rot(PI * 0.5) * p, t), n);
  d = smin(d, sdTaper(fp, vec2(0.085, 0.0), vec2(reach, 0.0), 0.004 * LINE, 0.0), K);
  vec2 hp = fold(rot(PI * 0.5 + PI / n) * p, n);
  d = smin(d, sdTaper(hp, vec2(0.06, 0.0), vec2(0.15, 0.0), 0.003 * LINE, 0.0), K);

  // A ring of twinkling dots, and a fine ring outside it.
  float dots = n * (4.0 + floor(v.z * 2.0)), sector = 2.0 * PI / dots;
  float idx = floor((ang + PI + 0.5 * sector) / sector);
  vec2 dp = rot(idx * sector - PI) * uv;
  float tw = 0.5 + 0.5 * sin(t * 1.6 + hash(vec2(idx, 3.0)) * 6.283);
  d = min(d, length(dp - vec2(0.19 * br, 0.0)) - (0.002 + 0.004 * tw));
  d = min(d, abs(r - (0.215 * br + 0.003 * sin(ang * 6.0 - t * 0.35))) - 0.002 * LINE);

  // Drifting arcs between the rays.
  d = smin(d, arcs(uv, t, n, 0.125 * br, 0.06, 0.6), K * 0.6);

  // Four-pointed sparkles scattered above and below, in this card's own places.
  for (int i = 0; i < 8; i++) {
    float fi = float(i) + 9.0 * uSeed;
    vec2 pos = vec2(hash(vec2(fi, 1.0)) * 0.3 - 0.15, (0.23 + 0.07 * hash(vec2(fi, 2.0))) * (mod(float(i), 2.0) * 2.0 - 1.0));
    float size = 0.004 + 0.012 * pow(0.5 + 0.5 * sin(t * 0.9 + fi * 2.3), 3.0);
    d = min(d, sdStar(uv - pos, size, 4.0, 2.3));
  }
  return d;
}

void main() {
  // Centred coordinates scaled to the frame's width: SIZE > 1 lets the sigil
  // run off the edges so it fills the frame rather than fits it.
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / (uRes.x * SIZE);
  // Four independent draws from the card's seed for each design to spend,
  // a time offset so each card is caught mid-motion at its own moment, and
  // a coin toss that mirrors the whole thing.
  vec4 v = vec4(hash(vec2(uSeed * 37.0 + 11.0, 1.0)), hash(vec2(uSeed * 37.0 + 11.0, 2.0)),
                hash(vec2(uSeed * 37.0 + 11.0, 3.0)), hash(vec2(uSeed * 37.0 + 11.0, 4.0)));
  float t = uTime * 1.4 + uSeed * 90.0;
  float br = 1.0 + 0.04 * sin(t * 0.5);
  if (hash(vec2(uSeed * 37.0 + 11.0, 5.0)) < 0.5) uv.x = -uv.x;

  float d;
  vec3 tint;
  if (uVariant < 0.5) {
    d = fool(uv, t, br, v);
    tint = vec3(0.83, 0.69, 0.37); // gold
  } else if (uVariant < 1.5) {
    d = lovers(uv, t, br, v);
    tint = vec3(0.88, 0.58, 0.52); // rose gold
  } else {
    d = star(uv, t, br, v);
    tint = vec3(0.68, 0.76, 0.92); // starlight
  }
  // A whisper of warmth or coolness, so the metal reads slightly differently each card.
  tint *= 1.0 + 0.06 * (v.wzy - 0.5);

  // Crisp core plus layered glow.
  float edge = smoothstep(0.0015, 0.0, d);
  float g1 = 0.0025 / (abs(d) + 0.0025);
  float g2 = 0.025 / (abs(d) + 0.025) * 0.22;
  vec3 col = tint * (edge * 1.2 + g1 * 0.8 + g2 * 0.5);
  col += vec3(0.08, 0.02, -0.04) * sin(atan(uv.y, uv.x) * 3.0 + t * 0.2) * g1 * 0.4;
  col = 1.0 - exp(-col * 1.5);

  // Luminance drives alpha so only the sigil and its glow cover the card.
  float mask = 1.0 - smoothstep(0.44, 0.5, length(uv));
  float a = clamp(dot(col, vec3(0.299, 0.587, 0.114)) * 2.5, 0.0, 1.0) * mask * uFade;
  gl_FragColor = vec4(col * a, a);
}
`

const VARIANTS: Sigil[] = ['fool', 'lovers', 'star']

export class CardSigil extends ShaderCanvas {
  static properties = { ...ShaderCanvas.properties, sigil: { type: String } }
  declare sigil: Sigil

  protected readonly frag = FRAG

  constructor() {
    super()
    this.sigil = 'fool'
  }

  protected variant() {
    return Math.max(0, VARIANTS.indexOf(this.sigil))
  }

}

customElements.define('card-sigil', CardSigil)
