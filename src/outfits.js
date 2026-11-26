// Outfits: recolour one garment of each runner's photo, consistently across every
// frame and animation, with a small shader (and the same maths on the portraits).
//   mode 0 (hue): pixels near `hue` (±range) with saturation >= sat get a new hue,
//                 their saturation/brightness scaled by `to` = [hue, satMul, valMul]
//   mode 1 (neutral): light, unsaturated pixels (white/grey cloth) become `rgb`,
//                 keeping their shading relative to `ref` brightness
// `band` limits the effect to a slice of the body height (0 = feet, 1 = top of head).

const shirt = { mode: 0, hue: .045, range: .045, sat: .5, band: [.42, .86] };
const denim = { mode: 0, hue: .6, range: .045, sat: .28, band: [0, .58] };
const greyPants = { mode: 1, sat: .12, val: [.42, 1.01], ref: .73, band: [.04, .56] };
const whiteShirt = { mode: 1, sat: .1, val: [.6, 1.01], ref: .87, band: [.4, .88] };

export const OUTFITS = {
  technician: [
    { id: 'navy', name: 'משמרת לילה', color: '#2c4a8a', cost: 300, rule: { ...shirt, to: [.62, 1, .8] } },
    { id: 'army', name: 'ירוק שטח', color: '#4f6b2a', cost: 500, rule: { ...shirt, to: [.27, .75, .8] } },
    { id: 'royal', name: 'סגול מלכותי', color: '#6a2f9a', cost: 800, rule: { ...shirt, to: [.78, .95, .85] } },
  ],
  avichai: [
    { id: 'black', name: 'ג׳ינס שחור', color: '#1c1d22', cost: 300, rule: { ...denim, to: [.6, .08, .45] } },
    { id: 'khaki', name: 'חאקי', color: '#a38d5f', cost: 500, rule: { ...denim, to: [.11, .45, 1.25] } },
    { id: 'red', name: 'אדום', color: '#9a2424', cost: 800, rule: { ...denim, to: [.99, 1, .9] } },
  ],
  liad: [
    { id: 'black', name: 'מכנס שחור', color: '#1c1d22', cost: 300, rule: { ...denim, to: [.6, .08, .5] } },
    { id: 'khaki', name: 'חאקי קיצי', color: '#b39a68', cost: 500, rule: { ...denim, to: [.11, .45, 1.3] } },
    { id: 'green', name: 'ירוק זית', color: '#5a6b2e', cost: 800, rule: { ...denim, to: [.24, .7, .9] } },
  ],
  ariel: [
    { id: 'navy', name: 'טרנינג כחול', color: '#2c3a5c', cost: 300, rule: { ...greyPants, rgb: [.17, .23, .38] } },
    { id: 'olive', name: 'זית', color: '#5a5f3a', cost: 500, rule: { ...greyPants, rgb: [.36, .38, .24] } },
    { id: 'red', name: 'בורדו', color: '#7a2230', cost: 800, rule: { ...greyPants, rgb: [.5, .14, .19] } },
  ],
  gabi: [
    { id: 'sky', name: 'תכלת', color: '#a9c8ea', cost: 300, rule: { ...whiteShirt, rgb: [.66, .79, .93] } },
    { id: 'cream', name: 'שמנת', color: '#efe2c2', cost: 500, rule: { ...whiteShirt, rgb: [.94, .88, .74] } },
    { id: 'mint', name: 'מנטה', color: '#b9e3c6', cost: 800, rule: { ...whiteShirt, rgb: [.72, .89, .77] } },
  ],
};

export function outfitRule(charId, outfitId) {
  return OUTFITS[charId]?.find(o => o.id === outfitId)?.rule || null;
}

// shader uniforms for a rule (or "off")
export function outfitUniforms(rule, u) {
  if (!rule) { u.uOutfitMode.value = -1; return; }
  u.uOutfitMode.value = rule.mode;
  u.uOutfitA.value.set(rule.hue ?? 0, rule.range ?? 0, rule.sat, rule.ref ?? 1);
  u.uOutfitVal.value.set(rule.val?.[0] ?? .12, rule.val?.[1] ?? 1.01);
  u.uOutfitBand.value.set(rule.band[0], rule.band[1]);
  const t = rule.mode === 0 ? rule.to : rule.rgb;
  u.uOutfitTo.value.set(t[0], t[1], t[2]);
}

// GLSL injected into the runner's material (sRGB-space HSV maths)
export const OUTFIT_GLSL = /* glsl */`
uniform float uOutfitMode; uniform vec4 uOutfitA; uniform vec2 uOutfitVal; uniform vec2 uOutfitBand; uniform vec3 uOutfitTo; uniform vec2 uBody;
varying vec2 vCardUv;
vec3 o_rgb2hsv(vec3 c) { vec4 K = vec4(0., -1./3., 2./3., -1.); vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g)); vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r)); float d = q.x - min(q.w, q.y); float e = 1.0e-10; return vec3(abs(q.z + (q.w - q.y) / (6. * d + e)), d / (q.x + e), q.x); }
vec3 o_hsv2rgb(vec3 c) { vec3 p = abs(fract(c.xxx + vec3(1., 2./3., 1./3.)) * 6. - 3.); return c.z * mix(vec3(1.), clamp(p - 1., 0., 1.), c.y); }
vec3 applyOutfit(vec3 lin) {
  if (uOutfitMode < -.5) return lin;
  vec3 s = pow(max(lin, 0.), vec3(1. / 2.2));
  vec3 hsv = o_rgb2hsv(s);
  float f = (vCardUv.y - uBody.x) * uBody.y;
  float band = smoothstep(uOutfitBand.x - .03, uOutfitBand.x + .03, f) * (1. - smoothstep(uOutfitBand.y - .03, uOutfitBand.y + .03, f));
  float m; vec3 o;
  if (uOutfitMode < .5) {
    float dh = abs(fract(hsv.x - uOutfitA.x + .5) - .5);
    m = (1. - smoothstep(uOutfitA.y, uOutfitA.y + .035, dh)) * smoothstep(uOutfitA.z - .06, uOutfitA.z + .04, hsv.y) * smoothstep(.06, .14, hsv.z);
    o = o_hsv2rgb(vec3(uOutfitTo.x, clamp(hsv.y * uOutfitTo.y, 0., 1.), clamp(hsv.z * uOutfitTo.z, 0., 1.)));
  } else {
    m = (1. - smoothstep(uOutfitA.z - .03, uOutfitA.z + .04, hsv.y)) * smoothstep(uOutfitVal.x - .05, uOutfitVal.x + .05, hsv.z) * (1. - smoothstep(uOutfitVal.y - .02, uOutfitVal.y + .02, hsv.z));
    o = clamp(uOutfitTo * (hsv.z / uOutfitA.w), 0., 1.);
  }
  return pow(mix(s, o, m * band), vec3(2.2));
}`;

// same recolour on a 2D canvas region (portraits); f measured from the bottom of the region
export function recolorCanvas(g, x, y, w, h, rule) {
  if (!rule) return;
  const img = g.getImageData(x, y, w, h), d = img.data;
  const sm = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 10) continue;
    const r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255;
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), dl = mx - mn;
    let hue = 0;
    if (dl > 1e-6) hue = mx === r ? ((gg - b) / dl) % 6 : mx === gg ? (b - r) / dl + 2 : (r - gg) / dl + 4;
    hue = ((hue / 6) % 1 + 1) % 1;
    const sat = mx ? dl / mx : 0, val = mx;
    const row = Math.floor(i / 4 / w), f = 1 - row / h;
    const band = sm(rule.band[0] - .03, rule.band[0] + .03, f) * (1 - sm(rule.band[1] - .03, rule.band[1] + .03, f));
    let m, o;
    if (rule.mode === 0) {
      const dh = Math.abs(((hue - rule.hue + .5) % 1 + 1) % 1 - .5);
      m = (1 - sm(rule.range, rule.range + .035, dh)) * sm(rule.sat - .06, rule.sat + .04, sat) * sm(.06, .14, val);
      const H = rule.to[0], S = Math.min(1, sat * rule.to[1]), V = Math.min(1, val * rule.to[2]);
      const k = n => { const kk = (n + H * 6) % 6; return V - V * S * Math.max(0, Math.min(kk, 4 - kk, 1)); };
      o = [k(5), k(3), k(1)];
    } else {
      m = (1 - sm(rule.sat - .03, rule.sat + .04, sat)) * sm(rule.val[0] - .05, rule.val[0] + .05, val) * (1 - sm(rule.val[1] - .02, rule.val[1] + .02, val));
      o = rule.rgb.map(c => Math.min(1, c * val / rule.ref));
    }
    m *= band;
    d[i] = (r + (o[0] - r) * m) * 255; d[i + 1] = (gg + (o[1] - gg) * m) * 255; d[i + 2] = (b + (o[2] - b) * m) * 255;
  }
  g.putImageData(img, x, y);
}
