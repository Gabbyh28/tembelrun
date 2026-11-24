// Track generation and the data-center geometry around it.
// The run is a chain of straight aisles joined at 90° junctions. Each
// segment is built in its own local frame: forward = -Z, right = +X.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as TX from './textures.js';

export const AISLE = 7.2;            // floor width between rack fronts
export const HALF = AISLE / 2;
export const LANES = [-1.8, 0, 1.8];
export const RACK = { w: 0.6, h: 2.2, d: 1.2 };
export const CEILING = 4.6;
const FIXTURE_STEP = 3.6;

const DIRS = [new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0)];

export const THEMES = {
  hall: { name: 'SERVER HALL B', he: 'אולם שרתים B', light: 0xe8f1ff, intensity: 1, fog: 0x0a0f15, duct: 0xf2c200 },
  core: { name: 'NETWORK CORE', he: 'ליבת הרשת', light: 0xfff1dc, intensity: .95, fog: 0x0e0d0b, duct: 0xf2c200 },
  cold: { name: 'COLD AISLE C', he: 'מעבר קר C', light: 0xd6ecff, intensity: 1.05, fog: 0x08111a, duct: 0x2aa8e0 },
  power: { name: 'POWER / UPS', he: 'חדר חשמל ו־UPS', light: 0xffe2c0, intensity: .9, fog: 0x120c08, duct: 0xff7a1a },
};
const THEME_ORDER = ['hall', 'core', 'cold', 'power'];

const rng = seed => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

/* ------------------------------------------------------------------ */
/* Shared assets                                                       */
/* ------------------------------------------------------------------ */
export class Assets {
  constructor(renderer) {
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    this.aniso = aniso;
    const floor = TX.floorTextures(aniso);
    this.floorMat = new THREE.MeshStandardMaterial({ ...floor, color: 0xbfc3c8, roughness: .5, metalness: .05, normalScale: new THREE.Vector2(.6, .6), envMapIntensity: .9 });
    const metal = TX.metalTexture(aniso);
    this.rackBody = new THREE.MeshStandardMaterial({ ...metal, color: 0xffffff, metalness: .55, roughness: .55 });
    const cont = TX.containmentTexture(aniso);
    this.containment = new THREE.MeshStandardMaterial({ map: cont.map, color: 0xffffff, metalness: .3, roughness: .18, envMapIntensity: 1.4 });
    const ceil = TX.ceilingTexture(aniso);
    this.ceiling = new THREE.MeshStandardMaterial({ map: ceil, roughness: .9, metalness: .1 });
    this.ladder = new THREE.MeshStandardMaterial({ map: TX.ladderTexture(aniso), transparent: false, alphaTest: .5, metalness: .8, roughness: .35, side: THREE.DoubleSide });
    this.cableBlack = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: .5, metalness: .1 });
    this.hazard = new THREE.MeshStandardMaterial({ map: TX.hazardTexture(aniso), roughness: .6 });
    this.ducts = {};
    this.fixtureMats = {};
    this.rackFronts = {};
    this.time = { value: 0 };
    this.prayer = { value: 0 };
    for (const t of THEME_ORDER) for (let v = 0; v < 4; v++) this.rackFront(t, v);

    // geometry
    this.rackGeo = new THREE.BoxGeometry(RACK.w, RACK.h, RACK.d);
    this.fixtureGeo = new THREE.BoxGeometry(.14, .05, 2.4);
    const housing = new THREE.BoxGeometry(.2, .07, 2.5); housing.translate(0, .045, 0);
    this.fixtureHousing = housing;
    this.housingMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: .8, roughness: .35 });
    this.qsfp = buildQSFP();
    this.shadowTex = TX.blobShadowTexture();
    this.glow = TX.glowTexture('120,200,255');
    this.redGlow = TX.glowTexture('255,60,40');
    this.signs = {};
    this.obstacleKit = buildObstacleKit(this);
  }
  rackFront(theme, v) {
    const key = theme + v;
    if (!this.rackFronts[key]) {
      const t = TX.rackFrontTextures(theme, v, this.aniso);
      const m = new THREE.MeshStandardMaterial({ ...t, color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 2.6, metalness: .45, roughness: .55, normalScale: new THREE.Vector2(.8, .8) });
      const time = this.time, prayer = this.prayer;
      m.onBeforeCompile = s => {
        s.uniforms.uTime = time; s.uniforms.uPrayer = prayer;
        s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying float vSeed;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\n#ifdef USE_INSTANCING\nvSeed = float(gl_InstanceID);\n#else\nvSeed = 0.;\n#endif');
        s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vSeed;\nuniform float uTime;\nuniform float uPrayer;')
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          {
            vec2 cell = floor(vEmissiveMapUv * vec2(48., 176.));
            float h = fract(sin(dot(cell + vSeed * 7.13, vec2(12.9898, 78.233))) * 43758.5453);
            float rate = 1.5 + h * 9.;
            float blink = step(.22 + h * .25, fract(h * 13.7 + uTime * rate * (h > .6 ? 1. : .15)));
            totalEmissiveRadiance *= mix(1., blink, step(.35, h));
          }
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.), uPrayer * .55);
          totalEmissiveRadiance += uPrayer * vec3(.25);`);
      };
      m.customProgramCacheKey = () => 'rackfront';
      this.rackFronts[key] = [this.rackBody, this.rackBody, this.rackBody, this.rackBody, m, this.rackBody];
    }
    return this.rackFronts[key];
  }
  duct(color) {
    return this.ducts[color] ||= new THREE.MeshStandardMaterial({ color, roughness: .45, metalness: .05 });
  }
  fixtureMat(color) {
    return this.fixtureMats[color] ||= new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: 7, roughness: .4 });
  }
  sign(theme) {
    if (!this.signs[theme]) {
      const T = THEMES[theme];
      this.signs[theme] = new THREE.MeshStandardMaterial({ map: TX.signTexture(T.name, T.he), emissive: 0xffffff, emissiveMap: TX.signTexture(T.name, T.he), emissiveIntensity: .8, roughness: .4 });
    }
    return this.signs[theme];
  }
}

function buildQSFP() {
  // ~2.2x real size so it reads at running speed
  const body = new THREE.BoxGeometry(.2, .1, .5);
  const cage = new THREE.BoxGeometry(.21, .02, .3); cage.translate(0, .06, -.08);
  const tab = new THREE.BoxGeometry(.16, .035, .22); tab.translate(0, .01, .34);
  const ring = new THREE.BoxGeometry(.04, .04, .06); ring.translate(0, .01, .47);
  const label = new THREE.PlaneGeometry(.18, .045); label.rotateY(Math.PI / 2); label.rotateZ(0); label.translate(.101, 0, -.05);
  const geo = mergeGeometries([mergeGeometries([body, cage]), mergeGeometries([tab, ring]), label], true);
  geo.translate(0, 0, -.05);
  const mats = [
    new THREE.MeshStandardMaterial({ color: 0xd8dde3, metalness: 1, roughness: .22, envMapIntensity: 1.6 }),
    new THREE.MeshStandardMaterial({ color: 0x1d7bff, emissive: 0x1d7bff, emissiveIntensity: 2.2, roughness: .35 }),
    new THREE.MeshStandardMaterial({ map: TX.qsfpLabelTexture(), roughness: .6 }),
  ];
  return { geo, mats };
}

/* ------------------------------------------------------------------ */
/* Obstacles                                                            */
/* ------------------------------------------------------------------ */
function buildObstacleKit(A) {
  const kit = {};
  // cable protector ramp with loose fibre bundles on top (jump / stumble)
  {
    const shape = new THREE.Shape();
    shape.moveTo(-.32, 0); shape.lineTo(-.12, .16); shape.lineTo(.12, .16); shape.lineTo(.32, 0); shape.lineTo(-.32, 0);
    const ramp = new THREE.ExtrudeGeometry(shape, { depth: AISLE - .1, bevelEnabled: false });
    ramp.rotateY(Math.PI / 2); ramp.translate(-(AISLE - .1) / 2, 0, 0);
    const g = new THREE.Group();
    const rampMesh = new THREE.Mesh(ramp, [A.hazard, new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: .8 })]);
    g.add(rampMesh);
    const cols = [0xf2c200, 0xff7a1a, 0x1fb5c9, 0x2b2b2b, 0xf2c200];
    cols.forEach((c, i) => {
      const pts = [];
      for (let k = 0; k <= 16; k++) { const x = -HALF + .05 + k / 16 * (AISLE - .1); pts.push(new THREE.Vector3(x, .19 + Math.sin(k * .9 + i) * .03 + i * .035, Math.sin(k * .7 + i * 2) * .1)); }
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, .035 + (i % 2) * .015, 8);
      g.add(new THREE.Mesh(tube, A.duct(c)));
    });
    kit.cable = g;
  }
  // dropped ladder tray hanging across the aisle (slide)
  {
    const g = new THREE.Group();
    const railGeo = new THREE.BoxGeometry(AISLE + .4, .1, .06);
    const railMat = new THREE.MeshStandardMaterial({ color: 0x9aa1aa, metalness: .85, roughness: .3 });
    const y = 1.25;
    const r1 = new THREE.Mesh(railGeo, railMat); r1.position.set(0, y, -.25);
    const r2 = r1.clone(); r2.position.z = .25;
    g.add(r1, r2);
    const rung = new THREE.BoxGeometry(.04, .03, .5);
    for (let x = -HALF; x <= HALF; x += .3) { const m = new THREE.Mesh(rung, railMat); m.position.set(x, y - .03, 0); g.add(m); }
    const bundle = new THREE.CylinderGeometry(.14, .14, AISLE + .3, 14); bundle.rotateZ(Math.PI / 2);
    const b = new THREE.Mesh(bundle, A.cableBlack); b.position.set(0, y + .14, 0); g.add(b);
    const fibre = new THREE.CylinderGeometry(.06, .06, AISLE + .3, 10); fibre.rotateZ(Math.PI / 2);
    const f = new THREE.Mesh(fibre, A.duct(0xf2c200)); f.position.set(0, y + .12, .17); g.add(f);
    const tape = new THREE.Mesh(new THREE.BoxGeometry(AISLE + .2, .08, .01), A.hazard); tape.position.set(0, y - .1, .27); g.add(tape);
    const chain = new THREE.CylinderGeometry(.012, .012, CEILING - y, 6);
    for (const x of [-HALF + .4, HALF - .4]) { const c = new THREE.Mesh(chain, railMat); c.position.set(x, (CEILING + y) / 2, 0); g.add(c); }
    // drooping loose cables
    for (let i = 0; i < 6; i++) {
      const x0 = -HALF + .6 + i * 1.2;
      const pts = [new THREE.Vector3(x0, y + .1, .1), new THREE.Vector3(x0 + .3, y - .35 - (i % 3) * .08, .15), new THREE.Vector3(x0 + .7, y + .05, .1)];
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, .022, 6), A.duct([0xf2c200, 0x1fb5c9, 0xff7a1a][i % 3])));
    }
    kit.bar = g;
  }
  // open floor: missing tiles revealing the plenum (jump)
  {
    const g = new THREE.Group();
    const len = 1.8, depth = .65;
    const plenum = new THREE.Mesh(new THREE.BoxGeometry(AISLE, depth, len), new THREE.MeshStandardMaterial({ color: 0x101114, roughness: .9, side: THREE.BackSide }));
    plenum.position.y = -depth / 2; g.add(plenum);
    const pedestalMat = new THREE.MeshStandardMaterial({ color: 0x8b9097, metalness: .8, roughness: .4 });
    for (let x = -HALF + .6; x < HALF; x += .6) for (const z of [-len / 2 + .3, .3]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(.025, .04, depth, 8), pedestalMat); p.position.set(x, -depth / 2, z); g.add(p);
    }
    [0x2b2b2b, 0x1fb5c9, 0x2b2b2b, 0xf2c200, 0xd23a2a].forEach((c, i) => {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(.05 + (i % 2) * .03, .05 + (i % 2) * .03, AISLE, 10), A.duct(c));
      t.rotation.z = Math.PI / 2; t.position.set(0, -depth + .08 + (i % 2) * .05, -.6 + i * .3); g.add(t);
    });
    // yellow safety stanchions + chain at both edges
    const postMat = new THREE.MeshStandardMaterial({ color: 0xf2c200, roughness: .5 });
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: .6 });
    for (const x of [-HALF + .15, HALF - .15]) for (const z of [-len / 2 - .2, len / 2 + .2]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .95, 10), postMat); p.position.set(x, .48, z); g.add(p);
      const b = new THREE.Mesh(new THREE.CylinderGeometry(.16, .18, .05, 16), baseMat); b.position.set(x, .025, z); g.add(b);
    }
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(AISLE, .18), A.hazard); strip.rotation.x = -Math.PI / 2; strip.position.set(0, .006, -len / 2 - .2); g.add(strip);
    const strip2 = strip.clone(); strip2.position.z = len / 2 + .2; g.add(strip2);
    kit.pit = g; kit.pitLen = len;
  }
  // crash cart (dodge)
  {
    const g = new THREE.Group();
    const frame = new THREE.MeshStandardMaterial({ color: 0x2b2f35, metalness: .6, roughness: .45 });
    const steel = new THREE.MeshStandardMaterial({ color: 0xb8bec6, metalness: .9, roughness: .25 });
    for (const y of [.25, .7, 1.05]) { const s = new THREE.Mesh(new THREE.BoxGeometry(1.1, .04, .7), steel); s.position.y = y; g.add(s); }
    for (const x of [-.53, .53]) for (const z of [-.33, .33]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(.04, 1.0, .04), frame); p.position.set(x, .6, z); g.add(p);
      const w = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, .04, 12), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: .7 })); w.rotation.z = Math.PI / 2; w.position.set(x, .06, z); g.add(w);
    }
    const mon = new THREE.Mesh(new THREE.BoxGeometry(.6, .38, .05), new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: .3 })); mon.position.set(0, 1.35, -.1); g.add(mon);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(.55, .32), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x3aa0ff, emissiveIntensity: 1.6 })); scr.position.set(0, 1.35, -.07); g.add(scr);
    const kb = new THREE.Mesh(new THREE.BoxGeometry(.45, .03, .16), new THREE.MeshStandardMaterial({ color: 0x1a1a1a })); kb.position.set(0, 1.09, .12); g.add(kb);
    const box = new THREE.Mesh(new THREE.BoxGeometry(.8, .35, .5), new THREE.MeshStandardMaterial({ color: 0x9c7a4f, roughness: .9 })); box.position.set(0, .45, 0); g.add(box);
    kit.cart = g;
  }
  // pallet jack with boxed servers (dodge)
  {
    const g = new THREE.Group();
    const card = new THREE.MeshStandardMaterial({ color: 0xa47d52, roughness: .95 });
    const tapeM = new THREE.MeshStandardMaterial({ color: 0xc9b089, roughness: .6 });
    const pal = new THREE.Mesh(new THREE.BoxGeometry(1.2, .14, 1.0), new THREE.MeshStandardMaterial({ color: 0x2650a8, metalness: .4, roughness: .5 })); pal.position.y = .1; g.add(pal);
    const sizes = [[1.1, .45, .9, .4], [1.0, .4, .85, .83], [.9, .35, .8, 1.2]];
    sizes.forEach(([w, h, d, y], i) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), card); b.position.set((i - 1) * .03, y, 0); b.rotation.y = (i - 1) * .04; g.add(b);
      const t = new THREE.Mesh(new THREE.BoxGeometry(w + .005, .06, d + .005), tapeM); t.position.copy(b.position); t.rotation.y = b.rotation.y; g.add(t);
    });
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, 1.1, 8), new THREE.MeshStandardMaterial({ color: 0x1a1a1a })); handle.position.set(0, .6, .6); handle.rotation.x = -.35; g.add(handle);
    kit.boxes = g;
  }
  // A-frame ladder (dodge)
  {
    const g = new THREE.Group();
    const al = new THREE.MeshStandardMaterial({ color: 0xc6ccd3, metalness: .9, roughness: .3 });
    const orange = new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: .5 });
    for (const s of [-1, 1]) for (const x of [-.28, .28]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(.05, 2.0, .08), al);
      leg.position.set(x, .97, s * .28); leg.rotation.x = s * .27; g.add(leg);
    }
    for (let y = .3; y < 1.8; y += .3) { const st = new THREE.Mesh(new THREE.BoxGeometry(.56, .03, .1), al); st.position.set(0, y, .28 - y * .14); g.add(st); }
    const top = new THREE.Mesh(new THREE.BoxGeometry(.62, .08, .3), orange); top.position.y = 1.95; g.add(top);
    kit.ladder = g;
  }
  // power-up orb
  {
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(.32, 2), new THREE.MeshStandardMaterial({ color: 0x0a2540, emissive: 0x3ab8ff, emissiveIntensity: 3.2, roughness: .2, metalness: .3 }));
    const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(.46, 1), new THREE.MeshStandardMaterial({ color: 0x9fdcff, wireframe: true, emissive: 0x6fd0ff, emissiveIntensity: 2 }));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.glow, color: 0x66ccff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(2.4);
    shell.name = 'spin'; g.add(core, shell, halo);
    kit.power = g;
  }
  g_shadowify(kit);
  return kit;
}

function g_shadowify(kit) {
  for (const k of Object.values(kit)) if (k.isObject3D) k.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
}

/* ------------------------------------------------------------------ */
/* Segment                                                              */
/* ------------------------------------------------------------------ */
let segSerial = 0;

export class Segment {
  constructor({ origin, dir, length, turns, theme, first = false, distanceAtStart = 0, seed }) {
    this.id = segSerial++;
    this.origin = origin.clone();
    this.dir = dir;
    this.fwd = DIRS[dir].clone();
    this.right = DIRS[(dir + 1) % 4].clone();
    this.yaw = -dir * Math.PI / 2;
    this.length = length;
    this.turns = turns;                 // { left: bool, right: bool }
    this.theme = theme;
    this.first = first;
    this.startU = first ? -40 : HALF;
    this.distanceAtStart = distanceAtStart;
    this.seed = seed;
    this.children = {};
    this.obstacles = [];
    this.chips = [];
    this.powerups = [];
    this.fixtures = [];
    this.group = new THREE.Group();
    this.group.position.copy(this.origin);
    this.group.rotation.y = this.yaw;
  }
  end() { return this.origin.clone().addScaledVector(this.fwd, this.length); }
  toWorld(u, x, y = 0, out = new THREE.Vector3()) {
    return out.copy(this.origin).addScaledVector(this.fwd, u).addScaledVector(this.right, x).setY(y);
  }
  // inverse: world position -> (u, x)
  toLocal(p) {
    const dx = p.x - this.origin.x, dz = p.z - this.origin.z;
    return { u: dx * this.fwd.x + dz * this.fwd.z, x: dx * this.right.x + dz * this.right.z };
  }
}

/* ------------------------------------------------------------------ */
/* Track                                                                */
/* ------------------------------------------------------------------ */
export class Track {
  constructor(scene, assets) {
    this.scene = scene;
    this.A = assets;
    this.random = Math.random;
    this.segments = new Set();
  }

  reset(random = Math.random) {
    for (const s of this.segments) this.disposeSegment(s);
    this.segments.clear();
    this.random = random;
    this.themeIndex = 0;
    this.turnCount = 0;
    const first = new Segment({ origin: new THREE.Vector3(), dir: 0, length: 150, turns: this.pickTurns(), theme: 'hall', first: true, distanceAtStart: 0, seed: 1 });
    this.populate(first, 0);
    this.build(first);
    this.ensureChildren(first);
    return first;
  }

  pickTurns() {
    const r = this.random();
    return r < .4 ? { left: true, right: true } : r < .7 ? { left: true, right: false } : { left: false, right: true };
  }

  ensureChildren(seg) {
    for (const side of ['left', 'right']) {
      if (!seg.turns[side] || seg.children[side]) continue;
      const dir = (seg.dir + (side === 'right' ? 1 : 3)) % 4;
      this.turnCount++;
      // new room every other junction
      const theme = THEME_ORDER[(THEME_ORDER.indexOf(seg.theme) + (this.random() < .55 ? 1 : 0)) % THEME_ORDER.length];
      const dist = seg.distanceAtStart + seg.length;
      const length = 90 + this.random() * 70 + Math.min(60, dist * .01);
      const child = new Segment({ origin: seg.end(), dir, length, turns: this.pickTurns(), theme, distanceAtStart: dist, seed: (seg.seed * 31 + (side === 'right' ? 7 : 3)) % 100000 });
      child.parent = seg; child.side = side;
      this.populate(child, dist);
      this.build(child);
      seg.children[side] = child;
    }
  }

  // Player committed to `chosen`: drop the sibling branch and the old parent later.
  commit(seg, chosenSide) {
    for (const side of ['left', 'right']) {
      const c = seg.children[side];
      if (c && side !== chosenSide) this.disposeTree(c);
    }
    const chosen = seg.children[chosenSide];
    this.ensureChildren(chosen);
    return chosen;
  }

  retire(seg) { if (seg && this.segments.has(seg)) this.disposeSegment(seg); }

  disposeTree(seg) {
    for (const c of Object.values(seg.children)) this.disposeTree(c);
    this.disposeSegment(seg);
  }

  disposeSegment(seg) {
    this.scene.remove(seg.group);
    seg.group.traverse(o => { if (o.userData.ownGeo && o.geometry) o.geometry.dispose(); });
    this.segments.delete(seg);
  }

  /* ---------- gameplay content ---------- */
  populate(seg, distance) {
    const r = rng(1 + Math.floor(this.random() * 1e6));
    const diff = Math.min(1, distance / 2600);
    let u = seg.first ? 40 : HALF + 22;
    const endU = seg.length - 26;
    let chipLane = 1;
    const push = o => { seg.obstacles.push(o); return o; };
    while (u < endU) {
      const roll = r();
      let kind;
      if (roll < .2) kind = 'cable';
      else if (roll < .42) kind = 'bar';
      else if (roll < .58) kind = 'pit';
      else kind = 'dodge';
      let free = [0, 1, 2];
      if (kind === 'cable') push({ type: 'cable', u, len: .7, lanes: [0, 1, 2], need: 'jump', clear: .42, stumble: true });
      else if (kind === 'bar') push({ type: 'bar', u, len: .7, lanes: [0, 1, 2], need: 'slide' });
      else if (kind === 'pit') push({ type: 'pit', u, len: 1.8, lanes: [0, 1, 2], need: 'jump', clear: .01 });
      else {
        const count = r() < .35 + diff * .35 ? 2 : 1;
        const lanes = [0, 1, 2].sort(() => r() - .5).slice(0, count);
        free = [0, 1, 2].filter(l => !lanes.includes(l));
        for (const l of lanes) {
          const t = ['cart', 'boxes', 'ladder'][r() * 3 | 0];
          push({ type: t, u: u + (r() - .5) * .6, len: t === 'boxes' ? 1.0 : .8, lanes: [l], need: 'dodge' });
        }
      }
      // QSFP run leading into the obstacle
      if (!free.includes(chipLane)) chipLane = free[r() * free.length | 0];
      const n = 5 + (r() * 5 | 0);
      for (let i = 0; i < n; i++) {
        const cu = u - 3 - (n - i) * 1.6;
        if (cu < seg.startU + 4) continue;
        seg.chips.push({ u: cu, x: LANES[chipLane], y: .7, taken: false });
      }
      if (kind === 'cable' || kind === 'pit') {
        // arc of chips over the jump
        for (let i = -2; i <= 2; i++) seg.chips.push({ u: u + i * 1.5, x: LANES[chipLane], y: .9 + (1 - (i * i) / 4) * 1.2, taken: false });
      }
      if (r() < .3) chipLane = Math.max(0, Math.min(2, chipLane + (r() < .5 ? -1 : 1)));
      u += 24 - diff * 9 + r() * 10;
    }
    // power-up roughly every other segment
    if (!seg.first && r() < .6) {
      const pu = HALF + 14 + r() * (seg.length * .5);
      const clearSpot = !seg.obstacles.some(o => Math.abs(o.u - pu) < 6);
      if (clearSpot) seg.powerups.push({ u: pu, x: LANES[r() * 3 | 0], y: 1.0, taken: false });
    }
    // chips that lead into the junction hint at the turn
    for (let i = 0; i < 6; i++) seg.chips.push({ u: seg.length - 20 + i * 2, x: 0, y: .7, taken: false });
  }

  /* ---------- visuals ---------- */
  build(seg) {
    const A = this.A, g = seg.group, T = THEMES[seg.theme];
    const L = seg.length, u0 = seg.startU, uEnd = L + HALF;
    const own = m => { m.userData.ownGeo = true; return m; };

    // Floor (split around pits)
    const pits = seg.obstacles.filter(o => o.type === 'pit').map(o => [o.u - o.len / 2, o.u + o.len / 2]).sort((a, b) => a[0] - b[0]);
    let from = u0;
    const floorPieces = [];
    for (const [a, b] of pits) { floorPieces.push([from, a]); from = b; }
    floorPieces.push([from, uEnd]);
    for (const [a, b] of floorPieces) {
      if (b - a < .01) continue;
      const geo = new THREE.PlaneGeometry(AISLE, b - a);
      geo.rotateX(-Math.PI / 2);
      // world-aligned UVs so tiles line up across pieces
      const uv = geo.attributes.uv, pos = geo.attributes.position;
      for (let i = 0; i < uv.count; i++) { uv.setXY(i, (pos.getX(i) + HALF) / 1.2, (-(pos.getZ(i)) + (a + b) / 2) / 1.2); }
      const m = own(new THREE.Mesh(geo, A.floorMat));
      m.position.set(0, 0, -(a + b) / 2); m.receiveShadow = true; g.add(m);
    }

    // Racks
    const left = seg.turns.left, right = seg.turns.right;
    const rows = [];
    const sideEnd = open => open ? L - HALF : uEnd + RACK.d;
    rows.push({ side: -1, from: u0, to: sideEnd(left) });
    rows.push({ side: 1, from: u0, to: sideEnd(right) });
    const variantMats = [0, 1, 2, 3].map(v => A.rackFront(seg.theme, v));
    const buckets = [[], [], [], []];
    const r = rng(seg.seed * 7 + 11);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s1 = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const pickVariant = () => {
      const x = r();
      if (seg.theme === 'cold') return x < .14 ? 0 : 1 + (x * 3 | 0) % 3;
      return x * 4 | 0;
    };
    for (const row of rows) {
      const n = Math.floor((row.to - row.from) / RACK.w);
      q.setFromAxisAngle(up, row.side < 0 ? Math.PI / 2 : -Math.PI / 2);
      let v = pickVariant(), run = 0;
      for (let i = 0; i < n; i++) {
        if (run-- <= 0) { v = pickVariant(); run = 1 + (r() * 4 | 0); }
        p.set(row.side * (HALF + RACK.d / 2), RACK.h / 2 + .02, -(row.from + RACK.w / 2 + i * RACK.w));
        buckets[v].push(m4.compose(p, q, s1).clone());
      }
    }
    // end wall facing the runner
    const wallFrom = left ? -HALF : -HALF - RACK.d, wallTo = right ? HALF : HALF + RACK.d;
    const nWall = Math.round((wallTo - wallFrom) / RACK.w);
    q.identity();
    for (let i = 0; i < nWall; i++) {
      p.set(wallFrom + RACK.w / 2 + i * RACK.w, RACK.h / 2 + .02, -(uEnd + RACK.d / 2));
      buckets[pickVariant()].push(m4.compose(p, q, s1).clone());
    }
    buckets.forEach((mats, v) => {
      if (!mats.length) return;
      const im = new THREE.InstancedMesh(A.rackGeo, variantMats[v], mats.length);
      mats.forEach((m, i) => im.setMatrixAt(i, m));
      im.castShadow = true; im.receiveShadow = true;
      im.computeBoundingSphere();
      g.add(im);
    });

    // Containment panels above racks + fibre duct along each row
    const panelH = CEILING - RACK.h - .02;
    const duct = A.duct(T.duct);
    for (const row of rows) {
      const len = row.to - row.from;
      const geo = new THREE.PlaneGeometry(len, panelH);
      const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / 1.2, uv.getY(i));
      const m = own(new THREE.Mesh(geo, A.containment));
      m.rotation.y = row.side < 0 ? Math.PI / 2 : -Math.PI / 2;
      m.position.set(row.side * (HALF + .04), RACK.h + panelH / 2 + .02, -(row.from + len / 2));
      g.add(m);
      const d = own(new THREE.Mesh(new THREE.BoxGeometry(.28, .12, len), duct));
      d.position.set(row.side * (HALF - .2), 2.62, -(row.from + len / 2)); d.castShadow = true; g.add(d);
      const lip = own(new THREE.Mesh(new THREE.BoxGeometry(.03, .1, len), duct));
      lip.position.set(row.side * (HALF - .33), 2.68, -(row.from + len / 2)); g.add(lip);
    }
    {
      const w = wallTo - wallFrom;
      const geo = new THREE.PlaneGeometry(w, panelH);
      const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 1.2, uv.getY(i));
      const m = own(new THREE.Mesh(geo, A.containment));
      m.position.set((wallFrom + wallTo) / 2, RACK.h + panelH / 2 + .02, -(uEnd + .04)); g.add(m);
    }

    // Ceiling
    {
      const len = uEnd - u0 + RACK.d;
      const geo = new THREE.PlaneGeometry(AISLE + RACK.d * 2, len); geo.rotateX(Math.PI / 2);
      const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (AISLE + 2.4) / 2.4, uv.getY(i) * len / 2.4);
      const m = own(new THREE.Mesh(geo, A.ceiling)); m.position.set(0, CEILING, -(u0 + len / 2)); g.add(m);
    }

    // Centre ladder tray with a fibre bundle
    {
      const len = uEnd - u0;
      const geo = new THREE.PlaneGeometry(.6, len); geo.rotateX(-Math.PI / 2);
      const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i) * len / 2);
      const m = own(new THREE.Mesh(geo, A.ladder)); m.position.set(0, 3.25, -(u0 + len / 2)); g.add(m);
      const c = own(new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, len, 10, 1, true), A.cableBlack));
      c.rotation.x = Math.PI / 2; c.position.set(.08, 3.38, -(u0 + len / 2)); g.add(c);
      const f = own(new THREE.Mesh(new THREE.BoxGeometry(.22, .1, len), duct)); f.position.set(-.16, 3.32, -(u0 + len / 2)); g.add(f);
    }

    // Linear LED fixtures (emissive + real lights pooled in game)
    {
      const xs = [-1.7, 1.7];
      const count = Math.floor((uEnd - u0) / FIXTURE_STEP) * xs.length;
      const im = new THREE.InstancedMesh(A.fixtureGeo, A.fixtureMat(T.light), count);
      const hm = new THREE.InstancedMesh(A.fixtureHousing, A.housingMat, count);
      let i = 0;
      for (let u = u0 + FIXTURE_STEP / 2; u < uEnd && i < count; u += FIXTURE_STEP) {
        for (const x of xs) {
          if (i >= count) break;
          p.set(x, CEILING - .55, -u); m4.makeTranslation(p.x, p.y, p.z);
          im.setMatrixAt(i, m4); hm.setMatrixAt(i, m4); i++;
        }
        seg.fixtures.push({ u, color: T.light, intensity: T.intensity });
      }
      im.count = hm.count = i;
      im.computeBoundingSphere(); hm.computeBoundingSphere();
      g.add(im, hm);
      // suspension rods
    }

    // Row sign hanging at the start of the aisle
    if (!seg.first || true) {
      const sm = own(new THREE.Mesh(new THREE.PlaneGeometry(2.4, .45), A.sign(seg.theme)));
      sm.position.set(0, 2.95, -(u0 + 6)); sm.rotation.y = 0;
      const back = own(new THREE.Mesh(new THREE.BoxGeometry(2.5, .52, .04), A.housingMat)); back.position.set(0, 2.95, -(u0 + 6) - .03);
      g.add(back, sm);
      const sm2 = sm.clone(); sm2.position.z = -(u0 + 6) - .061; sm2.rotation.y = Math.PI; g.add(sm2);
    }

    // Obstacles
    for (const o of seg.obstacles) {
      let mesh;
      if (o.type === 'cable') mesh = A.obstacleKit.cable.clone();
      else if (o.type === 'bar') mesh = A.obstacleKit.bar.clone();
      else if (o.type === 'pit') mesh = A.obstacleKit.pit.clone();
      else mesh = A.obstacleKit[o.type].clone();
      const x = o.lanes.length === 3 ? 0 : LANES[o.lanes[0]];
      mesh.position.set(x, 0, -o.u);
      if (o.lanes.length === 1) mesh.rotation.y = (r() - .5) * .5;
      o.mesh = mesh; g.add(mesh);
    }

    // QSFP modules (instanced so a segment is ~2 draw calls)
    if (seg.chips.length) {
      const im = new THREE.InstancedMesh(A.qsfp.geo, A.qsfp.mats, seg.chips.length);
      im.castShadow = true;
      seg.chipMesh = im;
      seg.chips.forEach((c, i) => { c.index = i; });
      g.add(im);
      this.updateChips(seg, 0);
      im.computeBoundingSphere();
      im.boundingSphere.radius = 1e4;
    }
    for (const pu of seg.powerups) {
      const m = A.obstacleKit.power.clone();
      m.position.set(pu.x, pu.y, -pu.u); pu.mesh = m; g.add(m);
    }
    this.scene.add(g);
    this.segments.add(seg);
  }

  updateChips(seg, t, magnetTarget) {
    const im = seg.chipMesh; if (!im) return;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    const e = new THREE.Euler();
    for (const c of seg.chips) {
      if (c.taken && !c.flying) { s.setScalar(0); }
      else s.setScalar(1);
      const bob = Math.sin(t * 3 + c.u * .7) * .06;
      p.set(c.x, c.y + bob, -c.u);
      e.set(.35, t * 2.6 + c.u * .3, 0); q.setFromEuler(e);
      im.setMatrixAt(c.index, m4.compose(p, q, s));
    }
    im.instanceMatrix.needsUpdate = true;
  }
}
