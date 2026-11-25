// Real 3D fibre optics: patch cords with LC connectors on the switch ports,
// round fibres lying in U-shaped trays, spill-outs dropping into the racks,
// and light pulses travelling along the cores.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const rng = seed => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const FRONT = .6; // rack front face (rack-local z)

// Jacket colours by fibre type: OS2 single-mode yellow, OM3/OM4 aqua, OM4 violet, Cat6 blue/grey.
const PALETTES = {
  core: [0xf2c200, 0xf2c200, 0xf2c200, 0x19b8c9, 0x19b8c9, 0x8f5bd8, 0xe8e8e8],
  hall: [0x19b8c9, 0x19b8c9, 0x2b6fd6, 0xe8e8e8, 0xf2c200],
  cold: [0x19b8c9, 0x2b6fd6, 0xe8e8e8],
  power: [0xf2c200, 0x2b6fd6, 0x333333],
};
const BOOT = { 0xf2c200: 0x2c66d8, 0x19b8c9: 0xd9c9a3, 0x8f5bd8: 0xd9c9a3, 0xe8e8e8: 0x2c66d8, 0x2b6fd6: 0x2a2a2a, 0x333333: 0x2a2a2a };

function paint(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

// One rack's worth of patch cords, in rack-local space (front face at +z).
export function buildHarness(ports, theme, seed, detail = 1) {
  if (!ports || !ports.length) return null;
  const r = rng(seed), pal = PALETTES[theme] || PALETTES.hall;
  const geos = [];
  // a rack shows ~40 cords at most; sample the ports evenly so the bundle stays readable and cheap
  const max = Math.round(40 * detail);
  const step = Math.max(1, ports.length / max);
  // bundles share a colour for a run of ports, like a real patching job
  let col = pal[0], run = 0;
  for (let k = 0; k < ports.length; k += step) {
    const i = Math.floor(k);
    if (run-- <= 0) { col = pal[r() * pal.length | 0]; run = 2 + (r() * 6 | 0); }
    const p = ports[i];
    const side = p.x < 0 ? -1 : 1;
    const mx = side * (.262 + (r() - .5) * .022), mz = FRONT + .03 + r() * .035;
    const sag = .05 + r() * .06;
    const bottom = -1.06 + r() * .05;
    const pts = [
      new THREE.Vector3(p.x, p.y, FRONT + .028),
      new THREE.Vector3(p.x, p.y - .004, FRONT + .06),
      new THREE.Vector3(THREE.MathUtils.lerp(p.x, mx, .45), p.y - sag, FRONT + .075 + r() * .02),
      new THREE.Vector3(mx, p.y - sag - .05 - r() * .04, mz + .01),
      new THREE.Vector3(mx, (p.y + bottom) / 2, mz),
      new THREE.Vector3(mx + side * .01, bottom, mz - .01),
    ];
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const len = THREE.MathUtils.clamp(Math.round(curve.getLength() * 14 * detail), 8, 24);
    geos.push(paint(new THREE.TubeGeometry(curve, len, .0038 + r() * .0012, detail < 1 ? 4 : 5), col));
    // duplex LC connector: boot + latch body
    const boot = new THREE.BoxGeometry(.011, .009, .03); boot.translate(p.x, p.y, FRONT + .016);
    const body = new THREE.BoxGeometry(.0125, .0095, .012); body.translate(p.x, p.y + .0005, FRONT + .004);
    geos.push(paint(boot, BOOT[col] ?? 0x2c66d8), paint(body, 0xf0f0ea));
  }
  // velcro straps on the vertical managers
  for (const side of [-1, 1]) for (let y = -.9; y < .9; y += .32) {
    const strap = new THREE.BoxGeometry(.045, .016, .085); strap.translate(side * .262, y, FRONT + .045);
    geos.push(paint(strap, 0x111111));
  }
  for (const x of geos) x.deleteAttribute('uv');
  const g = mergeGeometries(geos);
  g.computeBoundingSphere();
  return g;
}

export function cordMaterial() {
  return new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: .38, metalness: 0, clearcoat: .7, clearcoatRoughness: .25, sheen: .3, sheenRoughness: .5, sheenColor: 0xffffff });
}

// Emissive pulses running along a fibre's length (axis = local Y of a cylinder).
export function pulseMaterial(color, time, speed = 16, spacing = 9) {
  const m = new THREE.MeshPhysicalMaterial({ color, roughness: .32, clearcoat: .6, clearcoatRoughness: .2, emissive: color, emissiveIntensity: 0 });
  m.onBeforeCompile = s => {
    s.uniforms.uTime = time;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying float vAlong;\nattribute float phase;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlong = position.z + phase * 37.;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vAlong;\nuniform float uTime;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float w = fract((vAlong + uTime * ${speed.toFixed(1)}) / ${spacing.toFixed(1)});
        float pulse = smoothstep(.0, .02, w) * (1. - smoothstep(.02, .09, w));
        totalEmissiveRadiance = diffuseColor.rgb * (.08 + pulse * 5.);`);
  };
  m.customProgramCacheKey = () => 'fibrepulse' + speed + spacing;
  return m;
}

// U-shaped fibre runner (open top) with round fibres lying inside.
export function buildTrough(len, color, time, opts = {}) {
  const w = opts.width ?? .3, h = opts.height ?? .11, t = .01;
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, h); shape.lineTo(-w / 2, 0); shape.lineTo(w / 2, 0); shape.lineTo(w / 2, h);
  shape.lineTo(w / 2 - t, h); shape.lineTo(w / 2 - t, t); shape.lineTo(-w / 2 + t, t); shape.lineTo(-w / 2 + t, h);
  // rolled lips
  const geo = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false, steps: 1 });
  geo.translate(0, 0, -len);
  const group = new THREE.Group();
  const trough = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color, roughness: .35, clearcoat: .5, clearcoatRoughness: .3 }));
  trough.castShadow = true; trough.receiveShadow = true;
  group.add(trough);
  // round fibres, packed loosely in two layers
  const r = rng(Math.round(len * 100) + (opts.seed || 1));
  const fibres = [];
  const n = opts.fibres ?? 9;
  for (let i = 0; i < n; i++) {
    const layer = i < n * .6 ? 0 : 1;
    const rad = .009 + r() * .006;
    const c = new THREE.CylinderGeometry(rad, rad, len, 7, 1, true);
    const ph = new Float32Array(c.attributes.position.count).fill(r());
    c.setAttribute('phase', new THREE.BufferAttribute(ph, 1));
    c.rotateX(Math.PI / 2);
    c.translate(-w / 2 + .03 + r() * (w - .06), t + rad + layer * .022 + r() * .006, -len / 2);
    fibres.push(c);
  }
  const fm = new THREE.Mesh(mergeGeometries(fibres), pulseMaterial(opts.fibreColor ?? 0xf2c200, time));
  fm.receiveShadow = true;
  group.add(fm);
  group.userData.dispose = () => { geo.dispose(); fm.geometry.dispose(); };
  return group;
}

// Spill-out: corrugated drop from the trough down to the rack top (local +x = toward rack).
export function spillGeometry() {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, .1, 0), new THREE.Vector3(.07, .16, 0), new THREE.Vector3(.145, .1, 0),
    new THREE.Vector3(.17, -.1, 0), new THREE.Vector3(.172, -.38, 0),
  ]);
  const g = new THREE.TubeGeometry(curve, 14, .02, 6);
  // corrugation: ripple the radius along the tube
  const pos = g.attributes.position, nrm = g.attributes.normal;
  const seg = 7; // radialSegments + 1
  for (let i = 0; i < pos.count; i++) {
    const ring = Math.floor(i / seg);
    const k = .0025 * Math.sin(ring * 2.2);
    pos.setXYZ(i, pos.getX(i) + nrm.getX(i) * k, pos.getY(i) + nrm.getY(i) * k, pos.getZ(i) + nrm.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}
