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
 *   star   — Revelation: a many-pointed star, rays and a twinkling ring
 *
 * The card's seed (`uSeed`) varies each design, in its parts as well as its
 * proportions — spoke counts and styles, pupils, hearts, links, rings of
 * marks, crescents, line weight — so no two cards of a level are drawn alike.
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

// One draw from the card's seed per key, so every choice below is independent.
float rnd(float k) {
  return hash(vec2(uSeed * 37.0 + 11.0, k));
}

// A ring of n small marks at radius r, drifting round: dots, diamonds or
// short radial strokes, each one twinkling in its own time.
float marks(vec2 uv, float t, float n, float r, float kind, float size) {
  float sector = 2.0 * PI / n;
  float ang = atan(uv.y, uv.x) + t * 0.03;
  float idx = floor((ang + PI + 0.5 * sector) / sector);
  vec2 mp = rot(idx * sector - PI - t * 0.03) * uv - vec2(r, 0.0);
  float tw = 0.5 + 0.5 * sin(t * 1.6 + hash(vec2(idx, 3.0)) * 6.283);
  float sz = size * (0.5 + 0.8 * tw);
  if (kind < 1.0) return length(mp) - sz;
  if (kind < 2.0) return sdStar(mp, sz * 1.6, 4.0, 2.3);
  return sdLine(mp, vec2(-sz, 0.0), vec2(sz, 0.0), 0.002 * LINE);
}

// A crescent of radius r, open towards +x, drawn in outline.
float crescent(vec2 p, float r) {
  float moon = max(length(p) - r, -(length(p - vec2(r * 0.55, 0.0)) - r * 0.85));
  return abs(moon) - 0.003 * LINE;
}

// A straight spoke along +x from r0 to r1, tapering, with a bead at its tip.
float ray(vec2 fp, float r0, float r1) {
  float d = sdTaper(fp, vec2(r0, 0.0), vec2(r1, 0.0), 0.003 * LINE, 0.0008 * LINE);
  return smin(d, length(fp - vec2(r1, 0.0)) - 0.004, K);
}

// ---- The Fool: Perception ----
// Six to eight vines (with or without side branches), an eye at its own tilt
// and size with a round, slit or starry pupil, full or sparse lashes, a brow
// sometimes, a ring of marks or none.
float fool(vec2 uv, float t, float br) {
  float n = 6.0 + floor(rnd(10.0) * 3.0);
  float size = mix(0.88, 1.12, rnd(11.0));
  float reach = mix(0.31, 0.37, rnd(12.0));
  float pupil = floor(rnd(13.0) * 3.0);
  float r = length(uv), ang = atan(uv.y, uv.x);
  vec2 ev = rot((rnd(14.0) - 0.5) * 0.6) * uv;

  // An eye that glances around and blinks now and then.
  float blink = 1.0 - 0.9 * pow(max(0.0, sin(t * 0.45)), 80.0);
  vec2 ep = vec2(ev.x, ev.y / blink);
  float eye = sdLens(ep, 0.14 * br * size, 0.105 * br * size) * blink;
  float d = abs(eye) - 0.004 * LINE;
  vec2 look = vec2(0.024 * sin(t * 0.37) * sin(t * 0.11), 0.008 * sin(t * 0.23));
  vec2 ip = ev - look;
  float iris = abs(length(ip) - 0.024 * size) - 0.003 * LINE;
  if (pupil < 1.0) iris = min(iris, length(ip) - 0.011 * size);
  else if (pupil < 2.0) iris = min(iris, sdLens(ip.yx, 0.02 * size, 0.014 * size));
  else iris = min(iris, sdStar(ip, 0.015 * size, 4.0, 2.4));
  d = min(d, max(iris, eye));

  // Lashes fanning above and below the eye: a full fan, or just a few long ones.
  float sparse = step(0.7, rnd(15.0));
  vec2 lp = fold(ev, mix(12.0 + 2.0 * floor(rnd(16.0) * 3.0), 6.0, sparse));
  float lash = mix(0.15, 0.175, sparse) * size;
  d = min(d, sdTaper(lp, vec2(0.11, 0.0) * size, vec2(lash, 0.0), 0.0025 * LINE, 0.0));
  // Some eyes have a brow arched over them.
  if (rnd(19.0) < 0.4) d = min(d, sdArc(rot(PI * 0.5) * ev, 0.062 * size, 1.0, 0.003 * LINE));

  vec2 fp = fold(warped(uv, t), n);
  d = smin(d, vine(fp, t, 0.165, reach), K);
  if (rnd(17.0) < 0.65) d = smin(d, branches(fp, t, 0.165, reach), K);
  d = min(d, rings(r, ang, t, br, mix(0.19, 0.215, rnd(11.0))));
  float mk = floor(rnd(18.0) * 4.0);
  if (mk < 3.0) d = min(d, marks(uv, t, n * 3.0, 0.255 * br, mk, 0.003));
  d = smin(d, arcs(uv, t, n, 0.17 * br, 0.07, mix(0.6, 0.8, rnd(14.0))), K * 0.6);
  d = smin(d, arcs(uv, -t, n, 0.30 * br, 0.05, mix(0.45, 0.65, rnd(10.0))), K * 0.6);
  return d;
}

// ---- The Lovers: Connection ----
// The pair leans at its own angle and distance; each has a dot, ring or star
// at heart and vines or rays for spokes; a helix or a beaded chain joins them.
float lovers(vec2 uv, float t, float br) {
  uv = rot((rnd(20.0) - 0.5) * 1.0) * uv;
  float gap = 0.085 * mix(0.86, 1.1, rnd(21.0)) * br;
  float n = 5.0 + 2.0 * floor(rnd(22.0) * 2.0);
  float twist = mix(30.0, 46.0, rnd(23.0));
  float core = floor(rnd(24.0) * 3.0);
  float spokes = step(0.4, rnd(25.0));
  float link = step(0.35, rnd(26.0));
  float sway = 0.012 * sin(t * 0.3);
  vec2 c1 = vec2(sway, gap), c2 = vec2(-sway, -gap);

  // Two interlocking rings, each with a core and a flower of short spokes.
  vec2 p1 = uv - c1, p2 = uv - c2;
  float d = rings(length(p1), atan(p1.y, p1.x), t, br, 0.12);
  d = min(d, rings(length(p2), atan(p2.y, p2.x), t + 3.0, br, 0.12));
  if (core < 1.0) d = min(d, min(length(p1), length(p2)) - 0.016);
  else if (core < 2.0) d = min(d, abs(min(length(p1), length(p2)) - 0.013) - 0.003 * LINE);
  else d = min(d, min(sdStar(p1, 0.018, 5.0, 2.6), sdStar(p2, 0.018, 5.0, 2.6)));
  // An odd number of spokes each, one pointing away from the partner, so the link stays clear.
  float rock = 0.12 * sin(t * 0.25);
  vec2 s1 = fold(rot(PI * 0.5 + rock) * p1, n), s2 = fold(rot(-PI * 0.5 + rock) * p2, n);
  if (spokes < 0.5) {
    d = smin(d, vine(s1, t, 0.024, 0.075), K);
    d = smin(d, vine(s2, t + 2.0, 0.024, 0.075), K);
  } else {
    d = smin(d, min(ray(s1, 0.026, 0.07), ray(s2, 0.026, 0.07)), K);
  }

  // Between the two cores: a double helix twisting, or a chain of beads turning.
  float y = uv.y - mix(c2.y, c1.y, 0.5);
  float span = 0.5 * (c1.y - c2.y);
  float x = uv.x - mix(c2.x, c1.x, clamp(y / span * 0.5 + 0.5, 0.0, 1.0));
  float join;
  if (link < 0.5) {
    float amp = 0.035 * cos(clamp(y / span, -1.0, 1.0) * PI * 0.5);
    float ph = y * twist - t * 1.2;
    float slope = sqrt(1.0 + pow(amp * twist, 2.0));
    join = min(abs(x - amp * sin(ph)), abs(x + amp * sin(ph))) / slope - 0.004 * LINE;
  } else {
    // Each bead is a lens that swells and slims in its own time (by its fatness, keeping the field true).
    float per = span / (2.0 + floor(rnd(23.0) * 2.0));
    vec2 bp = vec2(x, mod(y + per * 0.5, per) - per * 0.5);
    float R = per * 0.46;
    float fat = mix(0.6, 0.9, 0.5 + 0.5 * cos(t * 0.8 + floor((y + per * 0.5) / per) * 1.3));
    join = abs(sdLens(bp.yx, R, R * fat)) - 0.003 * LINE;
    join = min(join, length(bp - vec2(0.0, per * 0.5)) - 0.004);
  }
  d = min(d, max(join, abs(y) - span));

  float mk = floor(rnd(27.0) * 4.0);
  if (mk < 3.0) d = min(d, marks(uv, t, 24.0, 0.225 * br, mk, 0.003));
  d = smin(d, arcs(uv, t, 6.0 + floor(rnd(21.0) * 3.0), mix(0.26, 0.285, rnd(22.0)) * br, 0.05, 0.55), K * 0.6);
  return d;
}

// ---- The Star: Revelation ----
// Five to nine points turning either way, a solid, hollow or empty heart,
// rays of different reach, dots or diamonds ringing it, a crescent sometimes
// and a scatter of sparkles of its own.
float star(vec2 uv, float t, float br) {
  float n = 5.0 + floor(rnd(30.0) * 5.0);
  float spin = (rnd(31.0) < 0.5 ? -1.0 : 1.0) * mix(0.03, 0.06, rnd(32.0));
  float reach = mix(0.30, 0.37, rnd(33.0));
  float heart = floor(rnd(34.0) * 3.0);
  float r = length(uv), ang = atan(uv.y, uv.x);
  vec2 p = rot(t * spin) * uv;

  // A many-pointed star. Its points start from +y, so the rays are folded
  // from a quarter turn round to line up with them.
  float d = abs(sdStar(p, 0.075 * br, n, 3.0)) - 0.003 * LINE;
  if (heart < 1.0) d = min(d, sdStar(p, 0.028 * br, n, 3.0));
  else if (heart < 2.0) d = min(d, abs(sdStar(rot(PI / n) * p, 0.034 * br, n, 3.0)) - 0.0025 * LINE);
  else d = min(d, length(p) - 0.009);

  // Long rays from the points, short ones between, tapering to nothing.
  vec2 fp = fold(warped(rot(PI * 0.5) * p, t), n);
  d = smin(d, sdTaper(fp, vec2(0.085, 0.0), vec2(reach, 0.0), 0.004 * LINE, 0.0), K);
  vec2 hp = fold(rot(PI * 0.5 + PI / n) * p, n);
  if (rnd(35.0) < 0.5) d = smin(d, sdTaper(hp, vec2(0.06, 0.0), vec2(0.15, 0.0), 0.003 * LINE, 0.0), K);
  else d = smin(d, ray(hp, 0.1, mix(0.17, 0.2, rnd(33.0))), K);

  // A ring of twinkling marks, and a fine ring outside it.
  float mk = floor(rnd(36.0) * 3.0);
  d = min(d, marks(uv, t, n * (4.0 + floor(rnd(32.0) * 2.0)), 0.19 * br, mk, 0.0035));
  d = min(d, abs(r - (0.215 * br + 0.003 * sin(ang * 6.0 - t * 0.35))) - 0.002 * LINE);

  // Drifting arcs between the rays.
  d = smin(d, arcs(uv, t, n, 0.125 * br, 0.06, 0.6), K * 0.6);

  // Now and then a crescent hangs in a corner, above or below, open outwards.
  if (rnd(37.0) < 0.45) {
    float side = rnd(38.0) < 0.5 ? -1.0 : 1.0;
    vec2 mp = rot(-side * 0.9) * (uv - vec2(0.105, side * 0.255 + 0.006 * sin(t * 0.3)));
    d = min(d, crescent(mp, 0.028));
  }

  // Four-pointed sparkles scattered above and below, in this card's own number and places.
  float count = 4.0 + floor(rnd(39.0) * 7.0);
  for (int i = 0; i < 10; i++) {
    if (float(i) >= count) break;
    float fi = float(i) + 9.0 * uSeed;
    vec2 pos = vec2(hash(vec2(fi, 1.0)) * 0.3 - 0.15, (0.225 + 0.08 * hash(vec2(fi, 2.0))) * (mod(float(i), 2.0) * 2.0 - 1.0));
    float size = 0.004 + 0.012 * pow(0.5 + 0.5 * sin(t * 0.9 + fi * 2.3), 3.0);
    d = min(d, sdStar(uv - pos, size, 4.0, 2.3));
  }
  return d;
}

// ---- Revelation concepts (iteration) ----

// The lit part of a moon of radius r, at phase k: 0 new, 0.5 full, 1 new
// again; it waxes from the right.
float moonLit(vec2 p, float r, float k) {
  float disc = length(p) - r;
  if (k > 0.5) { p.x = -p.x; k = 1.0 - k; }
  float e = r * cos(2.0 * PI * k);
  float xt = e * sqrt(max(0.0, 1.0 - p.y * p.y / (r * r)));
  return max(disc, xt - p.x);
}

// An ellipse with semi-axes ab, approximately (good enough near the line).
float sdEllipse(vec2 p, vec2 ab) {
  return (length(p / ab) - 1.0) * min(ab.x, ab.y);
}

// Still Water: a crescent moon over a horizon, its reflection broken into
// streaks on the water and a glade of glints running down towards you. Now
// and then a drop falls and rings spread out across the surface.
float water(vec2 uv, float t, float br) {
  float horizon = mix(-0.035, 0.015, rnd(40.0));
  float mr = mix(0.032, 0.04, rnd(42.0)) * br;
  vec2 mc = vec2(mix(-0.035, 0.035, rnd(43.0)), horizon + mix(0.115, 0.15, rnd(44.0)));
  float tilt = (rnd(45.0) - 0.5) * 1.2;
  float k = mix(0.1, 0.2, rnd(41.0));
  float y = uv.y - horizon;

  // The horizon, fading out to either side.
  float d = sdTaper(vec2(abs(uv.x), y), vec2(0.0), vec2(0.2, 0.0), 0.0025 * LINE, 0.0);

  // The moon: its lit crescent and the faint ring of its dark side.
  vec2 q = rot(tilt) * (uv - mc);
  d = min(d, abs(moonLit(q, mr, k)) - 0.003 * LINE);
  d = min(d, abs(length(q) - mr) - 0.0012 * LINE + 0.0012);

  // Its reflection: the sky flipped and swayed, cut into streaks.
  if (y < 0.0) {
    float depth = -y;
    vec2 m = vec2(uv.x + 0.004 * sin(depth * 70.0 - t * 1.6) * (0.5 + depth * 3.0), horizon + depth);
    float refl = moonLit(rot(tilt) * (m - mc), mr * 1.05, k);
    float band = (abs(fract(depth * 90.0 - t * 0.15) - 0.5) - 0.22) / 90.0;
    d = min(d, max(refl, band) + 0.0015);

    // The glade: glints under the moon, wider and sparser towards you.
    float sp = 0.014 + depth * 0.05;
    float row = floor(depth / 0.016);
    float ly = mod(depth, 0.016) - 0.008;
    float hl = (0.004 + depth * 0.12) * pow(0.5 + 0.5 * sin(t * 1.3 + row * 2.7 + uSeed * 20.0), 2.0);
    float gx = uv.x - mc.x - 0.012 * sin(row * 1.9 + t * 0.4);
    float glint = sdLine(vec2(gx, ly), vec2(-hl, 0.0), vec2(hl, 0.0), 0.0012 * LINE);
    d = min(d, max(glint, 0.04 + mr - depth) + 0.0008);
  }

  // A drop falls from the top of the card, and rings spread where it lands.
  float period = 7.0;
  float c = fract(t / period + rnd(46.0));
  vec2 land = vec2(mix(-0.07, 0.07, rnd(47.0)), horizon - mix(0.09, 0.15, rnd(48.0)));
  if (c < 0.22) {
    float fy = mix(0.3, land.y, pow(c / 0.22, 2.0));
    d = min(d, sdLens(vec2(uv.y - fy, uv.x - land.x), 0.008, 0.005));
  }
  for (int i = 0; i < 3; i++) {
    float age = c - 0.22 - float(i) * 0.07;
    if (age > 0.0) {
      float R = age * 0.3;
      vec2 rp = vec2(uv.x - land.x, (uv.y - land.y) * 3.2);
      float ring = abs(length(rp) - R) - 0.0018 * LINE;
      d = min(d, ring + age * 0.012);
    }
  }

  // A few stars above, each with a glint in the water below.
  for (int i = 0; i < 9; i++) {
    float fi = float(i) + 7.0 * uSeed;
    vec2 sp = vec2(hash(vec2(fi, 4.0)) * 0.28 - 0.14, horizon + 0.05 + 0.2 * hash(vec2(fi, 5.0)));
    if (length(sp - mc) < mr * 2.2) continue;
    float tw = 0.5 + 0.5 * sin(t * 1.1 + fi * 2.3);
    d = min(d, length(uv - sp) - 0.0015 - 0.0025 * tw);
    vec2 gp = vec2(sp.x, 2.0 * horizon - sp.y);
    d = min(d, sdLine(uv - gp, vec2(-0.004 * tw, 0.0), vec2(0.004 * tw, 0.0), 0.0008) + 0.001);
  }
  return d;
}

// Lunar Wheel: a ring of moons whose phases turn as the wheel does, around a
// moon that slowly fills and empties, inside a fine ring of ticks.
float moons(vec2 uv, float t, float br) {
  float n = 6.0 + 2.0 * floor(rnd(50.0) * 2.0);
  float spin = (rnd(51.0) < 0.5 ? -1.0 : 1.0) * 0.025;
  float R = mix(0.118, 0.13, rnd(52.0)) * br;
  float mr = mix(0.016, 0.021, rnd(53.0));
  float r = length(uv), ang = atan(uv.y, uv.x);
  float d = 1e9, near = 1e9;

  for (int i = 0; i < 8; i++) {
    if (float(i) >= n) break;
    float a = float(i) / n * 2.0 * PI + t * spin;
    vec2 c = R * vec2(cos(a), sin(a));
    near = min(near, length(uv - c));
    float k = fract(float(i) / n + rnd(54.0));
    vec2 p = uv - c;
    d = min(d, moonLit(p, mr, k));
    d = min(d, abs(length(p) - mr) - 0.0012 * LINE + 0.001);
  }

  // The moon at the heart.
  float big = mix(0.05, 0.06, rnd(55.0)) * br;
  float hk = mix(0.08, 0.92, fract(t * 0.008 + rnd(56.0)));
  d = min(d, abs(moonLit(rot(0.3) * uv, big, hk)) - 0.003 * LINE);
  d = min(d, abs(r - big) - 0.0012 * LINE + 0.001);
  d = min(d, abs(r - big * 1.4 - 0.0015 * sin(ang * 5.0 + t * 0.4)) - 0.0015 * LINE);

  // An orbit line threading the moons, and ticks outside it.
  d = min(d, max(abs(r - R) - 0.0012 * LINE, mr * 1.6 - near));
  float ticks = 4.0 * n;
  vec2 tp = fold(rot(t * spin * 0.5) * uv, ticks);
  d = min(d, sdLine(tp, vec2(R + mr * 2.2, 0.0), vec2(R + mr * 2.2 + 0.012, 0.0), 0.0015 * LINE));
  d = smin(d, arcs(uv, -t, n, (R + mr * 2.2 + 0.03), 0.04, 0.6), K * 0.6);

  // Above and below: a falling line of tiny phases, like a sky clock.
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float yy = 0.205 + fi * 0.03;
    for (int s = 0; s < 2; s++) {
      float sg = float(s) * 2.0 - 1.0;
      vec2 p = uv - vec2(0.0, sg * yy);
      float k = fract(0.5 + sg * (fi + 1.0) * 0.1 + t * 0.01);
      d = min(d, moonLit(p, 0.0075 - fi * 0.0012, k));
    }
  }
  return d;
}

// Scrying Mirror: an oval glass in a beaded frame, two crescents back to back
// in it like a face and its reflection, ripples drawing inward and a sheen
// passing across the glass.
float mirror(vec2 uv, float t, float br) {
  vec2 ab = vec2(mix(0.105, 0.12, rnd(60.0)), mix(0.17, 0.195, rnd(61.0))) * br;
  float e = sdEllipse(uv, ab);
  float d = abs(e) - 0.004 * LINE;
  d = min(d, abs(sdEllipse(uv, ab + 0.014)) - 0.002 * LINE);

  // Beads round the frame, by angle on the ellipse.
  float beads = 2.0 * floor(mix(10.0, 14.0, rnd(62.0)));
  float th = atan(uv.y / ab.y, uv.x / ab.x);
  float sector = 2.0 * PI / beads;
  float bi = floor(th / sector + 0.5);
  float ba = bi * sector;
  vec2 bp = (ab + 0.007) * vec2(cos(ba), sin(ba));
  float tw = 0.5 + 0.5 * sin(t * 1.4 + hash(vec2(bi, 9.0)) * 6.283);
  d = min(d, length(uv - bp) - 0.0018 - 0.0014 * tw);

  // A finial above and a stem below.
  vec2 top = vec2(0.0, ab.y + 0.03);
  d = min(d, crescent(rot(-PI * 0.5) * (uv - top), 0.016));
  d = min(d, length(uv - top + vec2(0.0, 0.004)) - 0.004);
  d = smin(d, sdTaper(vec2(abs(uv.x), -uv.y), vec2(0.0, ab.y + 0.014), vec2(0.0, 0.3), 0.006 * LINE, 0.002 * LINE), K);
  d = min(d, length(uv - vec2(0.0, -ab.y - 0.05)) - 0.006);

  // Inside the glass.
  float inside = e + 0.012;
  float g = 1e9;
  float gap = mix(0.012, 0.02, rnd(63.0)) + 0.004 * sin(t * 0.5);
  float cr = mix(0.034, 0.042, rnd(64.0));
  g = min(g, crescent(rot(PI) * (uv - vec2(-gap - cr * 0.2, 0.0)), cr));
  g = min(g, crescent(uv - vec2(gap + cr * 0.2, 0.0), cr));
  g = min(g, length(uv) - 0.004);
  // Ripples drawing inward to the middle.
  for (int i = 0; i < 2; i++) {
    float f = fract(-t * 0.04 + float(i) / 2.0);
    float ri = sdEllipse(uv, ab * mix(0.45, 0.85, f));
    g = min(g, abs(ri) - 0.001 * LINE + 0.002 + 0.003 * (1.0 - sin(f * PI)));
  }
  // The sheen: two slanted strokes that sweep across now and then.
  float s = mix(-0.35, 0.35, fract(t * 0.06 + rnd(65.0)));
  vec2 sp = rot(0.7) * uv;
  g = min(g, abs(sp.x - s) - 0.002 * LINE);
  g = min(g, abs(sp.x - s - 0.018) - 0.001 * LINE);
  d = min(d, max(g, inside));
  return d;
}

// Constellation: one point for each of us, drifting, joined by threads that
// draw in from one to another and fade, each point with a halo of its own.
vec2 node(float i, float n, float t) {
  float a = i / n * 2.0 * PI + (hash(vec2(i, uSeed * 13.0)) - 0.5) * 0.7 + 0.4;
  vec2 rad = vec2(0.105, 0.19) * mix(0.55, 1.0, hash(vec2(i, uSeed * 7.0 + 1.0)));
  vec2 p = rad * vec2(cos(a), sin(a));
  return p + 0.006 * vec2(sin(t * 0.3 + i * 2.1), cos(t * 0.27 + i * 1.3));
}

float threads(vec2 uv, float t, float br) {
  float n = 5.0 + floor(rnd(70.0) * 4.0);
  float density = mix(0.25, 0.5, rnd(71.0));
  float d = 1e9;
  for (int i = 0; i < 8; i++) {
    if (float(i) >= n) break;
    float fi = float(i);
    vec2 a = node(fi, n, t);
    float tw = 0.5 + 0.5 * sin(t * 0.9 + fi * 2.3);
    d = min(d, length(uv - a) - 0.004 - 0.002 * tw);
    d = min(d, abs(length(uv - a) - 0.011 - 0.004 * tw) - 0.0012 * LINE + 0.001 * (1.0 - tw));
    for (int j = 0; j < 8; j++) {
      if (j <= i || float(j) >= n) continue;
      float fj = float(j);
      float h = hash(vec2(fi * 8.0 + fj, uSeed * 31.0));
      bool ring = (j == i + 1) || (i == 0 && fj == n - 1.0);
      if (!ring && h > density) continue;
      vec2 b = node(fj, n, t);
      // Each thread draws from one end, holds, and withdraws to the other.
      float ph = fract(t * 0.04 + h);
      float s0 = smoothstep(0.8, 0.95, ph);
      float s1 = smoothstep(0.0, 0.15, ph);
      if (h < 0.5) { vec2 tmp = a; a = b; b = tmp; }
      vec2 a2 = mix(a, b, s0), b2 = mix(a, b, s1);
      float w = ring ? 0.0016 : 0.0011;
      d = min(d, max(sdLine(uv, a2, b2, w * LINE), 0.016 - min(length(uv - a), length(uv - b))));
      a = node(fi, n, t);
    }
  }
  // A faint ring that holds them all.
  d = min(d, abs(sdEllipse(uv, vec2(0.135, 0.235) * br)) - 0.0012 * LINE + 0.0008);
  // Dust between the points.
  for (int i = 0; i < 10; i++) {
    float fi = float(i) + 5.0 * uSeed;
    vec2 p = vec2(hash(vec2(fi, 11.0)) * 0.3 - 0.15, hash(vec2(fi, 12.0)) * 0.5 - 0.25);
    d = min(d, length(uv - p) - 0.0008 - 0.0012 * (0.5 + 0.5 * sin(t * 1.5 + fi * 3.1)));
  }
  return d;
}

// Deep Water: the surface high on the card under a thin moon. Now and then a
// drop falls through it, rings spreading, and sinks slowly through shafts of
// light to a shell far below that opens on a glowing pearl.
float deep(vec2 uv, float t, float br) {
  float s = mix(0.14, 0.17, rnd(80.0));
  float y = uv.y - s - 0.003 * sin(uv.x * 40.0 + t * 0.8);
  float d = sdTaper(vec2(abs(uv.x), y), vec2(0.0), vec2(0.2, 0.0), 0.0025 * LINE, 0.0005);

  // A thin moon above.
  vec2 mc = vec2(mix(-0.06, 0.06, rnd(81.0)), s + mix(0.06, 0.08, rnd(82.0)));
  float mr = 0.022;
  float k = mix(0.1, 0.18, rnd(83.0));
  d = min(d, abs(moonLit(uv - mc, mr, k)) - 0.0025 * LINE);
  d = min(d, abs(length(uv - mc) - mr) - 0.001 * LINE + 0.0012);

  // Shafts of light slanting down from the surface, swaying, fading with depth.
  vec2 c = vec2(0.0, -mix(0.15, 0.18, rnd(84.0)));
  for (int i = 0; i < 5; i++) {
    float fi = float(i) - 2.0;
    vec2 a = vec2(fi * 0.045 + 0.01 * sin(t * 0.2 + fi), s - 0.01);
    vec2 b = vec2(c.x + fi * 0.012, c.y + 0.07);
    float shaft = sdTaper(uv, a, b, 0.0022 * LINE, 0.0);
    d = min(d, shaft + 0.0015 + 0.0015 * (0.5 + 0.5 * sin(t * 0.5 + fi * 1.7)));
  }

  // The drop: falls, rings spread, and it sinks with a trail of bubbles.
  float period = 9.0;
  float cyc = fract(t / period + rnd(85.0));
  float lx = mix(-0.04, 0.04, rnd(86.0));
  if (cyc < 0.12) {
    float fy = mix(0.3, s, pow(cyc / 0.12, 2.0));
    d = min(d, sdLens(vec2(uv.y - fy, uv.x - lx), 0.007, 0.0045));
  } else {
    float sink = (cyc - 0.12) / 0.88;
    float dy = mix(s - 0.012, c.y + 0.05, 1.0 - pow(1.0 - sink, 2.0));
    vec2 dp = vec2(mix(lx, c.x, sink) + 0.004 * sin(t * 1.3), dy);
    d = min(d, length(uv - dp) - 0.0035 + 0.003 * smoothstep(0.85, 1.0, sink));
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      float rise = fract(t * 0.25 + fi * 0.25);
      vec2 bp = dp + vec2(0.006 * sin(t * 2.0 + fi * 2.0), rise * 0.06);
      d = min(d, abs(length(uv - bp) - 0.0025 * (1.0 - rise)) - 0.0008 + rise * 0.002);
    }
    for (int i = 0; i < 3; i++) {
      float age = cyc - 0.12 - float(i) * 0.06;
      if (age > 0.0 && age < 0.5) {
        vec2 rp = vec2(uv.x - lx, (uv.y - s) * 3.5);
        d = min(d, abs(length(rp) - age * 0.35) - 0.0016 * LINE + age * 0.014);
      }
    }
  }

  // The shell: a deep fluted bowl, and a lid hinged on the left that lifts
  // and settles again.
  float sr = mix(0.04, 0.048, rnd(87.0));
  float open = 0.7 * smoothstep(-0.3, 0.6, sin(t * 0.22 + rnd(88.0) * 6.283));
  vec2 p = uv - c;
  float pa = atan(p.x, -p.y);
  float flute = 0.0025 * cos(pa * 11.0);
  float bowl = max(abs(length(p) - sr - flute) - 0.0025 * LINE, p.y);
  bowl = min(bowl, sdLine(p, vec2(-sr, 0.0), vec2(sr, 0.0), 0.0015 * LINE));
  vec2 h = vec2(-sr, 0.0);
  vec2 q = rot(open) * (p - h) + h;
  float lid = max(abs(length(q * vec2(1.0, 2.2)) - sr) / 2.2 - 0.0022 * LINE, -q.y);
  d = min(d, min(bowl, lid));
  // Ribs on the bowl, running in to the hinge of its curve.
  float rib = max(abs(fold(rot(-PI * 0.5) * p, 11.0).y) - 0.0007, max(length(p) - sr, sr * 0.55 - length(p)));
  d = min(d, max(rib, p.y) + 0.001);
  // The pearl lifts a little as the lid opens, glowing brighter, its light
  // spreading in rings.
  vec2 pp = p - vec2(0.0, 0.006 + 0.012 * open);
  d = min(d, length(pp) - 0.008 - 0.004 * open);
  for (int i = 0; i < 3; i++) {
    float f = fract(t * 0.12 + float(i) / 3.0);
    d = min(d, abs(length(pp) - 0.014 - 0.06 * f) - 0.001 * LINE + 0.003 * f + 0.005 * (1.0 - open));
  }
  return d;
}

// Veil: stage curtains, joined at the top and swept aside to tie-backs, that
// draw open and fall closed again slowly on a small candle flame.
float veil(vec2 uv, float t, float br) {
  float yt = -mix(0.06, 0.1, rnd(90.0));
  float open = mix(0.035, 0.1, 0.5 + 0.5 * sin(t * 0.18 + rnd(91.0) * 6.283));
  float folds = 3.0 + floor(rnd(92.0) * 2.0);
  float sp = mix(0.022, 0.03, rnd(93.0));
  float side = sign(uv.x + 1e-5);
  float x = abs(uv.x), y = uv.y;
  // The parting widens from the top down to the tie-backs, then hangs straight.
  float top = 0.255;
  float u = clamp((top - y) / (top - yt), 0.0, 1.0);
  float gap = open * (y > yt ? pow(u, 1.4) : 1.0 + 0.4 * (yt - y));
  // Folds gather at the tie-backs and spread above and below.
  float gather = 0.35 + 0.65 * smoothstep(0.0, 0.12, abs(y - yt));
  float d = 1e9;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    if (fi >= folds) break;
    float fx = 0.003 + gap + fi * sp * gather * (1.0 + 0.2 * cos(y * 9.0 + fi)) + 0.003 * sin(y * 22.0 + t * 0.7 + fi * 1.3 + side) * u;
    d = min(d, abs(x - fx) * 0.9 - (fi < 0.5 ? 0.0025 : 0.0015) * LINE);
  }
  // A tie-back knot on each side.
  vec2 kp = vec2(x - 0.003 - open - (folds - 1.0) * sp * 0.35 * 0.5, y - yt);
  d = min(d, length(kp) - 0.005);
  d = min(d, sdLine(kp, vec2(0.0), vec2(0.006, -0.03), 0.0015 * LINE));
  // A scalloped valance along the top.
  vec2 vp = vec2(mod(uv.x + 0.02, 0.04) - 0.02, uv.y - 0.262);
  d = min(d, sdArc(rot(-PI * 0.5) * vp, 0.02, 1.2, 0.0018 * LINE));

  // The flame: a teardrop that leans and flickers, its wick and a soft halo,
  // shown more as the curtains part.
  vec2 f = (uv - vec2(0.0, yt + 0.03)) / 1.5;
  float flick = 0.003 * sin(t * 3.1) + 0.002 * sin(t * 4.7 + 1.0);
  float body = smin(length(f) - 0.011, sdTaper(f, vec2(0.0), vec2(flick, 0.04 + 0.004 * sin(t * 2.3)), 0.009, 0.0), 0.01);
  float g = abs(body) - 0.002 * LINE;
  g = min(g, length(f - vec2(0.0, 0.004)) - 0.004);
  g = min(g, sdLine(f, vec2(0.0, -0.02), vec2(0.0, -0.011), 0.0012 * LINE));
  float halo = abs(length(f - vec2(0.0, 0.01)) - 0.035 - 0.004 * sin(t * 0.8)) - 0.001 * LINE;
  g = min(g, halo + 0.002);
  float shown = smoothstep(0.035, 0.08, open);
  d = min(d, g * 1.5 + 0.003 * (1.0 - shown));
  return d;
}

// ---- Lunar Wheel variants ----

// A ring of n moons of radius mr on an orbit of radius R, turning at spin,
// their phases running round the ring from k0. Returns the field, and the
// distance to the nearest moon's centre in near.
float moonRing(vec2 uv, float t, float n, float R, float mr, float spin, float k0, out float near) {
  float d = 1e9;
  near = 1e9;
  for (int i = 0; i < 12; i++) {
    if (float(i) >= n) break;
    float a = float(i) / n * 2.0 * PI + t * spin;
    vec2 p = uv - R * vec2(cos(a), sin(a));
    near = min(near, length(p));
    float k = fract(float(i) / n + k0);
    d = min(d, moonLit(p, mr, k));
    d = min(d, abs(length(p) - mr) - 0.0012 * LINE + 0.001);
  }
  return d;
}

// The orbit line under a ring of moons, broken where it would cross them.
float orbit(float r, float R, float near, float mr) {
  return max(abs(r - R) - 0.0012 * LINE, mr * 1.6 - near);
}

// Orrery: two rings of moons on nested orbits turning opposite ways, the
// inner one tilted into an ellipse, around a heart moon on a fine axis.
float orrery(vec2 uv, float t, float br) {
  float n1 = 8.0 + 2.0 * floor(rnd(100.0) * 2.0);
  float n2 = 4.0 + floor(rnd(101.0) * 2.0);
  float dir = rnd(102.0) < 0.5 ? -1.0 : 1.0;
  float R1 = mix(0.15, 0.16, rnd(103.0)) * br;
  float R2 = mix(0.085, 0.095, rnd(104.0)) * br;
  float r = length(uv);
  float near;
  float d = moonRing(uv, t, n1, R1, 0.013, dir * 0.02, rnd(105.0), near);
  d = min(d, orbit(r, R1, near, 0.013));

  // The inner orbit is an ellipse seen at a tilt, carrying bigger moons.
  float tilt = (rnd(106.0) - 0.5) * 0.8;
  vec2 e = rot(tilt) * uv;
  vec2 q = vec2(e.x, e.y / 0.62);
  float near2 = 1e9;
  for (int i = 0; i < 5; i++) {
    if (float(i) >= n2) break;
    float a = float(i) / n2 * 2.0 * PI - t * dir * 0.045;
    vec2 p = uv - rot(-tilt) * (R2 * vec2(cos(a), 0.62 * sin(a)));
    near2 = min(near2, length(p));
    d = min(d, moonLit(p, 0.02, fract(float(i) / n2 + rnd(107.0) + 0.25)));
    d = min(d, abs(length(p) - 0.02) - 0.0012 * LINE + 0.001);
  }
  d = min(d, max(abs(length(q) - R2) * 0.62 - 0.0012 * LINE, 0.032 - near2));

  // The heart: a moon with a hairline axis through it and a hub.
  float big = mix(0.03, 0.036, rnd(108.0)) * br;
  float hk = mix(0.08, 0.92, fract(t * 0.008 + rnd(109.0)));
  d = min(d, abs(moonLit(rot(tilt) * uv, big, hk)) - 0.0028 * LINE);
  d = min(d, abs(r - big) - 0.0012 * LINE + 0.001);
  d = min(d, max(abs(e.x) - 0.0008 * LINE, abs(e.y) - R2 * 0.62 - 0.012));
  d = min(d, length(e - vec2(0.0, R2 * 0.62 + 0.012)) - 0.003);
  d = min(d, length(e + vec2(0.0, R2 * 0.62 + 0.012)) - 0.003);

  // Ticks round the rim and arcs beyond.
  vec2 tp = fold(rot(t * dir * 0.01) * uv, 2.0 * n1);
  d = min(d, sdLine(tp, vec2(R1 + 0.028, 0.0), vec2(R1 + 0.038, 0.0), 0.0015 * LINE));
  d = smin(d, arcs(uv, -t, n2, R1 + 0.065, 0.04, 0.6), K * 0.6);
  return d;
}

// Eclipse: a sun of rays at the heart that a moon crosses slowly, the wheel
// of phases around it and a thin corona that swells as the disc is covered.
float eclipse(vec2 uv, float t, float br) {
  float n = 6.0 + 2.0 * floor(rnd(110.0) * 2.0);
  float spin = (rnd(111.0) < 0.5 ? -1.0 : 1.0) * 0.025;
  float R = mix(0.125, 0.135, rnd(112.0)) * br;
  float mr = mix(0.015, 0.019, rnd(113.0));
  float r = length(uv), ang = atan(uv.y, uv.x);
  float near;
  float d = moonRing(uv, t, n, R, mr, spin, rnd(114.0), near);
  d = min(d, orbit(r, R, near, mr));

  // The sun: a disc and a fan of short and long rays.
  float sr = mix(0.04, 0.046, rnd(115.0)) * br;
  float sun = r - sr;
  float rays = 12.0 + 4.0 * floor(rnd(116.0) * 2.0);
  vec2 fp = fold(rot(t * 0.02) * uv, rays);
  sun = min(sun, sdTaper(fp, vec2(sr + 0.008, 0.0), vec2(sr + 0.03, 0.0), 0.002 * LINE, 0.0));
  vec2 hp = fold(rot(t * 0.02 + PI / rays) * uv, rays);
  sun = min(sun, sdTaper(hp, vec2(sr + 0.008, 0.0), vec2(sr + 0.018, 0.0), 0.0015 * LINE, 0.0));

  // The moon crosses the disc and back on a long slow swing.
  float cross = sin(t * 0.08 + rnd(117.0) * 6.283);
  vec2 mp = uv - rot((rnd(118.0) - 0.5) * 1.2) * vec2(cross * sr * 1.6, 0.0);
  float moon = length(mp) - sr * 0.94;
  // The dark disc hides what it covers; its own rim stays fine.
  // The corona: a soft ring that brightens as the cover nears total.
  float total = 1.0 - smoothstep(0.0, 0.5, abs(cross));
  sun = min(sun, abs(r - sr * 1.3 - 0.004 * sin(ang * 7.0 + t * 0.6)) - 0.001 * LINE + 0.006 * (1.0 - total));
  d = min(d, max(sun, -moon));
  d = min(d, abs(moon) - 0.0015 * LINE);

  float ticks = 4.0 * n;
  vec2 tp = fold(rot(t * spin * 0.5) * uv, ticks);
  d = min(d, sdLine(tp, vec2(R + mr * 2.2, 0.0), vec2(R + mr * 2.2 + 0.012, 0.0), 0.0015 * LINE));
  d = smin(d, arcs(uv, -t, n, R + mr * 2.2 + 0.03, 0.04, 0.6), K * 0.6);
  return d;
}

// Spiral: moons winding in from a full one at the rim to a dark one at the
// heart, waning as they go, the whole spiral turning slowly.
float spiral(vec2 uv, float t, float br) {
  float n = 10.0 + 2.0 * floor(rnd(120.0) * 2.0);
  float turns = mix(1.5, 1.9, rnd(121.0));
  float dir = rnd(122.0) < 0.5 ? -1.0 : 1.0;
  float R0 = mix(0.17, 0.185, rnd(123.0)) * br, R1 = 0.03;
  float r = length(uv);
  vec2 p = rot(t * dir * 0.015) * uv;
  float d = 1e9;
  for (int i = 0; i < 12; i++) {
    if (float(i) >= n) break;
    float f = float(i) / (n - 1.0);
    float a = f * turns * 2.0 * PI;
    float rad = mix(R0, R1, pow(f, 0.85));
    vec2 c = rad * vec2(cos(a), sin(a));
    float mr = mix(0.017, 0.007, f);
    // Full at the rim, new at the heart, with a nudge from the card's seed.
    float k = mix(0.5, 0.98, f);
    d = min(d, moonLit(p - c, mr, k));
    d = min(d, abs(length(p - c) - mr) - 0.0012 * LINE + 0.001);
  }
  // The spiral line itself, hairline, drawn under the moons.
  float sa = atan(p.y, p.x);
  float line = 1e9;
  for (int j = -1; j <= 2; j++) {
    float aa = sa + float(j) * 2.0 * PI;
    float f = aa / (turns * 2.0 * PI);
    if (f < 0.0 || f > 1.0) continue;
    float rad = mix(R0, R1, pow(f, 0.85));
    line = min(line, abs(r - rad));
  }
  d = min(d, line - 0.001 * LINE + 0.0008);
  // The dark heart: a fine ring, and a drifting ring of dust round the whole.
  d = min(d, abs(r - 0.012) - 0.0012 * LINE);
  d = min(d, length(uv) - 0.003);
  d = min(d, abs(r - R0 - 0.03 - 0.002 * sin(sa * 6.0 - t * 0.35)) - 0.0012 * LINE + 0.0008);
  d = min(d, marks(uv, t, 24.0, R0 + 0.048, 0.0, 0.0025));
  return d;
}

// Tide: the lunar wheel hanging over water, its moons reflected in broken
// streaks, the tide rising and falling with the heart moon's phase.
float tide(vec2 uv, float t, float br) {
  float n = 6.0 + 2.0 * floor(rnd(130.0) * 2.0);
  float spin = (rnd(131.0) < 0.5 ? -1.0 : 1.0) * 0.025;
  float R = mix(0.1, 0.11, rnd(132.0)) * br;
  float mr = mix(0.014, 0.017, rnd(133.0));
  float hk = mix(0.08, 0.92, fract(t * 0.008 + rnd(134.0)));
  // The water rises as the moon fills.
  float lift = 0.5 - abs(hk - 0.5);
  float s = -mix(0.14, 0.18, rnd(135.0)) + 0.025 * lift * 2.0;
  vec2 w = uv - vec2(0.0, 0.085);
  float r = length(w), ang = atan(w.y, w.x);
  float near;
  float d = moonRing(w, t, n, R, mr, spin, rnd(136.0), near);
  d = min(d, orbit(r, R, near, mr));
  float big = mix(0.04, 0.048, rnd(137.0)) * br;
  d = min(d, abs(moonLit(rot(0.3) * w, big, hk)) - 0.003 * LINE);
  d = min(d, abs(r - big) - 0.0012 * LINE + 0.001);
  vec2 tp = fold(rot(t * spin * 0.5) * w, 4.0 * n);
  d = min(d, sdLine(tp, vec2(R + mr * 2.2, 0.0), vec2(R + mr * 2.2 + 0.01, 0.0), 0.0015 * LINE));
  // Clip the sky to above the waterline.
  float y = uv.y - s - 0.003 * sin(uv.x * 40.0 + t * 0.8);
  d = max(d, 0.004 - y);

  // The waterline, and the wheel's reflection cut into drifting streaks.
  d = min(d, sdTaper(vec2(abs(uv.x), y), vec2(0.0), vec2(0.2, 0.0), 0.0025 * LINE, 0.0005));
  if (y < 0.0) {
    float depth = -y;
    // Foreshortened: the sky is squeezed into the strip of water below it.
    vec2 m = vec2(uv.x + 0.004 * sin(depth * 70.0 - t * 1.6) * (0.5 + depth * 3.0), s + depth / 0.36) - vec2(0.0, 0.085);
    float rn;
    float refl = moonRing(m, t, n, R, mr, spin, rnd(136.0), rn);
    refl = min(refl, abs(moonLit(rot(0.3) * m, big, hk)) - 0.003 * LINE);
    refl = min(refl, abs(length(m) - big) - 0.0012 * LINE + 0.001);
    float band = (abs(fract(depth * 90.0 - t * 0.15) - 0.5) - 0.2) / 90.0;
    d = min(d, max(refl * 0.36, band) + 0.0012 + depth * 0.02);
  }
  return d;
}

void main() {
  // Centred coordinates scaled to the frame's width: SIZE > 1 lets the sigil
  // run off the edges so it fills the frame rather than fits it.
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / (uRes.x * SIZE);
  // A time offset so each card is caught mid-motion at its own moment, and
  // a coin toss that mirrors the whole thing.
  float t = uTime * 1.4 + uSeed * 90.0;
  float br = 1.0 + 0.04 * sin(t * 0.5);
  if (rnd(1.0) < 0.5) uv.x = -uv.x;

  float d;
  vec3 tint;
  if (uVariant < 0.5) {
    d = fool(uv, t, br);
    tint = vec3(0.83, 0.69, 0.37); // gold
  } else if (uVariant < 1.5) {
    d = lovers(uv, t, br);
    tint = vec3(0.88, 0.58, 0.52); // rose gold
  } else if (uVariant < 2.5) {
    d = star(uv, t, br);
    tint = vec3(0.68, 0.76, 0.92); // starlight
  } else if (uVariant < 3.5) {
    d = water(uv, t, br);
    tint = vec3(0.68, 0.76, 0.92); // moonlight on water
  } else if (uVariant < 4.5) {
    d = moons(uv, t, br);
    tint = vec3(0.8, 0.8, 0.86); // silver
  } else if (uVariant < 5.5) {
    d = mirror(uv, t, br);
    tint = vec3(0.76, 0.72, 0.92); // glass violet
  } else if (uVariant < 6.5) {
    d = threads(uv, t, br);
    tint = vec3(0.68, 0.76, 0.92); // starlight
  } else if (uVariant < 7.5) {
    d = deep(uv, t, br);
    tint = vec3(0.6, 0.78, 0.9); // deep water
  } else if (uVariant < 8.5) {
    d = veil(uv, t, br);
    tint = vec3(0.9, 0.72, 0.6); // candlelight
  } else if (uVariant < 9.5) {
    d = orrery(uv, t, br);
    tint = vec3(0.8, 0.8, 0.86); // silver
  } else if (uVariant < 10.5) {
    d = eclipse(uv, t, br);
    tint = vec3(0.78, 0.72, 0.64); // pale gold
  } else if (uVariant < 11.5) {
    d = spiral(uv, t, br);
    tint = vec3(0.8, 0.8, 0.86); // silver
  } else {
    d = tide(uv, t, br);
    tint = vec3(0.7, 0.78, 0.9); // moonlit water
  }
  // A whisper of warmth or coolness, so the metal reads slightly differently
  // each card; some are engraved finer or heavier, some glow more softly.
  tint *= 1.0 + 0.06 * (vec3(rnd(2.0), rnd(3.0), rnd(4.0)) - 0.5);
  d -= 0.0006 * (rnd(5.0) - 0.5);
  float glow = mix(0.3, 0.7, rnd(6.0));

  // Crisp core plus layered glow.
  float edge = smoothstep(0.0015, 0.0, d);
  float g1 = 0.0025 / (abs(d) + 0.0025);
  float g2 = 0.025 / (abs(d) + 0.025) * 0.22;
  vec3 col = tint * (edge * 1.2 + g1 * 0.8 + g2 * glow);
  col += vec3(0.08, 0.02, -0.04) * sin(atan(uv.y, uv.x) * 3.0 + t * 0.2) * g1 * 0.4;
  col = 1.0 - exp(-col * 1.5);

  // Luminance drives alpha so only the sigil and its glow cover the card.
  float mask = 1.0 - smoothstep(0.44, 0.5, length(uv));
  float a = clamp(dot(col, vec3(0.299, 0.587, 0.114)) * 2.5, 0.0, 1.0) * mask * uFade;
  gl_FragColor = vec4(col * a, a);
}
`

/** The levels' sigils, then Revelation concepts under trial in the sigil lab. */
export type SigilDesign = Sigil | 'water' | 'moons' | 'mirror' | 'threads' | 'deep' | 'veil' | 'orrery' | 'eclipse' | 'spiral' | 'tide'
const VARIANTS: SigilDesign[] = ['fool', 'lovers', 'star', 'water', 'moons', 'mirror', 'threads', 'deep', 'veil', 'orrery', 'eclipse', 'spiral', 'tide']

export class CardSigil extends ShaderCanvas {
  static properties = { ...ShaderCanvas.properties, sigil: { type: String } }
  declare sigil: SigilDesign

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
