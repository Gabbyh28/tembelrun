// Track generation and the data-center geometry around it.
// The run is a chain of straight aisles joined at 90° junctions. Each
// segment is built in its own local frame: forward = -Z, right = +X.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as TX from './textures.js';
import { buildHarness, cordMaterial, buildTrough, spillGeometry } from './fibers.js';
import { roomAssets, roomObstacles, buildRoom, updateMovers } from './rooms.js';

export const AISLE = 7.2;            // floor width between rack fronts
export const HALF = AISLE / 2;
export const LANES = [-1.8, 0, 1.8];
export const RACK = { w: 0.6, h: 2.2, d: 1.2 };
export const CEILING = 4.6;
const FIXTURE_STEP = 3.6;

const DIRS = [new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0)];

export const THEMES = {
  hall: { kind: 'racks', camMax: 3.1, name: 'SERVER HALL B', he: 'אולם שרתים B', light: 0xe8f1ff, intensity: 1, fog: 0x0a0f15, duct: 0xf2c200 },
  core: { kind: 'racks', camMax: 3.1, name: 'NETWORK CORE', he: 'ליבת הרשת', light: 0xfff1dc, intensity: .95, fog: 0x0e0d0b, duct: 0xf2c200 },
  cold: { kind: 'racks', camMax: 3.1, name: 'COLD AISLE C', he: 'מעבר קר C', light: 0xd6ecff, intensity: 1.05, fog: 0x08111a, duct: 0x2aa8e0 },
  power: { kind: 'racks', camMax: 3.1, name: 'POWER / UPS', he: 'חדר חשמל ו־UPS', light: 0xffe2c0, intensity: .9, fog: 0x120c08, duct: 0xff7a1a },
  gallery: { kind: 'gallery', height: 3.7, camMax: 3.2, name: 'SUPPORT WING', he: 'מבנה תמך', light: 0xf4f7ff, intensity: 0, fog: 0xb9c2ca, fogDensity: .0045, duct: 0xf2c200, sun: true, env: .5, exposure: .78 },
  storeroom: { kind: 'storeroom', height: 5.6, name: "HANAN'S STOREROOM", he: 'המחסן של חנן', light: 0xfff0d6, intensity: 1.5, fog: 0x14110c, fogDensity: .016, duct: 0xd11f1f, env: .4 },
  warehouse: { kind: 'warehouse', height: 9, name: 'WAREHOUSE / LOGISTICS', he: 'המחסן', light: 0xfff1d8, intensity: 4.2, fog: 0x15140f, fogDensity: .012, duct: 0xf2c200, env: .45 },
  generator: { kind: 'generator', height: 6.2, name: 'GENERATOR HALL', he: 'חדר גנרטורים', light: 0xffcf6a, intensity: 2.6, fog: 0x1c160a, fogDensity: .016, duct: 0xf2c200, env: .3 },
  plenum: { kind: 'plenum', height: 4.4, name: 'AIR PLENUM', he: 'חדר פלנום', light: 0xcfe6ff, intensity: 1, fog: 0x0b1a24, fogDensity: .02, duct: 0x2aa8e0, wind: 3.5 },
};
const ROOM_OBSTACLES = {
  racks: { jump: 'cable', slide: 'bar', jumpP: .2, slideP: .22, pitP: .16, dodge: ['cart', 'boxes', 'ladder'] },
  gallery: { jump: 'cable', slide: 'bar', jumpP: 0, slideP: 0, dodge: ['chair', 'table', 'chair', 'table'] },
  storeroom: { jump: 'rjmess', slide: 'bar', jumpP: .26, slideP: .14, dodge: ['gbics', 'scrap', 'spool', 'scrap'] },
  generator: { jump: 'hose', slide: 'exhaust', jumpP: .2, slideP: .24, dodge: ['drums', 'drums', 'cart'] },
  plenum: { jump: 'condensate', slide: 'duct', jumpP: .22, slideP: .26, dodge: ['filters', 'filters', 'boxes'] },
  warehouse: { jump: 'pallets', slide: 'tunnel', jumpP: .16, slideP: .16, dodge: ['jack', 'jack', 'crate', 'wrapped'] },
};
// tall rooms get a zip line instead of a ground ride
const ZIP_THEMES = new Set(['warehouse', 'generator', 'storeroom']);
const ZIP_H = 1.55 + 2.2;              // cable height (ZIP_Y in game.js + reach of the arms)
// special events and the rooms they can happen in
const EVENTS = {
  blackout: t => !THEMES[t].sun,
  fm200: t => THEMES[t].kind === 'racks',
  tiles: t => THEMES[t].kind === 'racks',
};
const THEME_ORDER = ['hall', 'core', 'gallery', 'plenum', 'cold', 'warehouse', 'storeroom', 'generator', 'power'];

// Each world lasts a random 12-32 seconds at the speed you'll be running there.
export const runSpeedAt = d => Math.min(30, 13 + d * .0055);
function worldLength(dist, random) {
  const seconds = 12 + random() * 20;
  // integrate the accelerating speed over the stay in this world
  let d = dist, t = 0; const dt = .25;
  while (t < seconds) { d += runSpeedAt(d) * dt; t += dt; }
  return Math.max(70, d - dist);
}

const rng = seed => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

/* ------------------------------------------------------------------ */
/* Shared assets                                                       */
/* ------------------------------------------------------------------ */
export class Assets {
  constructor(renderer, quality = 'high') {
    this.detail = quality === 'high' ? 1 : .5;
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
    this.harness = {};
    this.cordMat = cordMaterial();
    this.spillGeo = spillGeometry();
    this.spillMats = {};
    this.time = { value: 0 };
    this.prayer = { value: 0 };
    for (const t of THEME_ORDER) if (THEMES[t].kind === 'racks') for (let v = 0; v < 4; v++) this.rackFront(t, v);

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
    this.R = roomAssets(this);
    Object.assign(this.obstacleKit, roomObstacles(this, this.R));
    this.obstacleKit.hose = this.obstacleKit.cable;
    // cable-tray sled for the slide ride
    {
      const sh = new THREE.Shape(); const w = .7, h = .16, t = .02;
      sh.moveTo(-w / 2, h); sh.lineTo(-w / 2, 0); sh.lineTo(w / 2, 0); sh.lineTo(w / 2, h); sh.lineTo(w / 2 - t, h); sh.lineTo(w / 2 - t, t); sh.lineTo(-w / 2 + t, t); sh.lineTo(-w / 2 + t, h);
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 1.7, bevelEnabled: false }); geo.translate(0, .03, -.85);
      const sled = new THREE.Group(); const m = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: 0xf2c200, roughness: .35, clearcoat: .6 })); m.castShadow = true; sled.add(m);
      const lip = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, .7, 12), m.material); lip.rotation.z = Math.PI / 2; lip.position.set(0, .12, -.86); sled.add(lip);
      this.obstacleKit.sled = sled;
    }
    buildExtraKit(this);
    this.rideSigns = {};
  }
  rackFront(theme, v) {
    const key = theme + v;
    if (!this.rackFronts[key]) {
      const { ports, ...t } = TX.rackFrontTextures(theme, v, this.aniso);
      this.harness[key] = buildHarness(ports, theme, 977 + v * 31 + theme.length * 7, this.detail);
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
  spillMat(color) {
    return this.spillMats[color] ||= new THREE.MeshPhysicalMaterial({ color, roughness: .4, clearcoat: .5, clearcoatRoughness: .3 });
  }
  rideSign(type) {
    if (!this.rideSigns[type]) {
      const [en, he] = { jack: ['RIDE  ▶  PALLET JACK', 'קופצים על עגלת משטחים!'], tray: ['SLIDE  ▶  CABLE TRAY', 'גולשים במגש כבלים!'], zip: ['ZIP LINE  ▶  GRAB THE CABLE', 'תופסים את הכבל וטסים!'] }[type];
      const t = TX.signTexture(en, he, '#ffbf2e');
      this.rideSigns[type] = new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: .9, side: THREE.DoubleSide });
    }
    return this.rideSigns[type];
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

// rack door + server, zip-line gear, FM-200 nozzle
function buildExtraKit(A) {
  const kit = A.obstacleKit;
  const steel = new THREE.MeshStandardMaterial({ color: 0x9aa1aa, metalness: .85, roughness: .3 });
  // built for the rack on the right of the aisle (face at x = 0, aisle towards -x); mirrored for the left
  {
    const g = new THREE.Group();
    const front = A.rackFront('hall', 1)[4];
    const dark = new THREE.MeshStandardMaterial({ color: 0x1b1d21, metalness: .6, roughness: .45 });
    const pivot = new THREE.Group(); pivot.name = 'door'; pivot.position.set(-.03, 0, -.3);
    const panelGeo = new THREE.BoxGeometry(.035, RACK.h, RACK.w); panelGeo.translate(0, RACK.h / 2 + .02, RACK.w / 2);
    const panel = new THREE.Mesh(panelGeo, [front, front, dark, dark, dark, dark]);
    pivot.add(panel);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(.05, .3, .03), steel); handle.position.set(-.04, 1.1, RACK.w - .06); pivot.add(handle);
    g.add(pivot);
    // 2U server on extended rails
    const srv = new THREE.Group(); srv.name = 'server'; srv.position.set(.55, 1.08, 0);
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.0, .09, .48), new THREE.MeshStandardMaterial({ color: 0x2a2e34, metalness: .7, roughness: .35 }));
    srv.add(chassis);
    const bezel = new THREE.Mesh(new THREE.PlaneGeometry(.48, .085), new THREE.MeshStandardMaterial({ color: 0x0b0b0c, emissive: 0x3aa0ff, emissiveIntensity: .8, roughness: .3 }));
    bezel.rotation.y = -Math.PI / 2; bezel.position.x = -.501; srv.add(bezel);
    for (const z of [-.26, .26]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(2.0, .04, .02), steel); rail.position.set(.5, 0, z); srv.add(rail); }
    const tag = new THREE.Mesh(new THREE.BoxGeometry(.02, .06, .2), A.hazard); tag.position.set(-.51, .07, 0); srv.add(tag);
    // flashing amber service light so it reads at a glance
    const amber = new THREE.Mesh(new THREE.BoxGeometry(.04, .04, .44), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffa31a, emissiveIntensity: 4 })); amber.position.set(-.52, -.03, 0); srv.add(amber);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.glow, color: 0xffa31a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); glow.scale.setScalar(1.1); glow.position.set(-.6, 0, 0); srv.add(glow);
    g.add(srv);
    kit.door = g;
  }
  // hanging gear on the zip line: a fibre spool on a chain
  {
    const g = new THREE.Group();
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(.55, .55, .5, 20), new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: .85 }));
    drum.rotation.z = Math.PI / 2; drum.position.y = ZIP_H - .9; g.add(drum);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(.4, .4, .52, 20), A.duct(0xf2c200)); core.rotation.z = Math.PI / 2; core.position.y = ZIP_H - .9; g.add(core);
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, 6, 6), steel); chain.position.y = ZIP_H - .35 + 3; g.add(chain);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(.52, .12, 1.12), A.hazard); stripe.position.y = ZIP_H - .9; g.add(stripe);
    kit.zipBlock = g;
  }
  // trolley that runs on the cable + T-handle the runner hangs from
  {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(.16, .14, .34), new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: .45, metalness: .3 })); body.position.y = .02; g.add(body);
    for (const z of [-.1, .1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, .05, 14), steel); w.rotation.z = Math.PI / 2; w.position.set(0, .05, z); g.add(w); }
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(.015, .015, .4, 6), steel); rod.position.y = -.2; g.add(rod);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, .5, 8), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: .6 })); bar.rotation.z = Math.PI / 2; bar.position.y = -.4; g.add(bar);
    g.scale.setScalar(1.6);
    kit.trolley = g;
  }
  // start platform with steps
  {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xf2c200, roughness: .55, metalness: .2 });
    for (let i = 0; i < 4; i++) { const st = new THREE.Mesh(new THREE.BoxGeometry(AISLE - .4, .2, 1.2), i === 3 ? A.hazard : mat); st.position.set(0, .1 + i * .2, -i * 1.2); g.add(st); }
    kit.zipPlatform = g;
  }
  // FM-200 discharge nozzle on the ceiling
  {
    const g = new THREE.Group();
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, .5, 8), new THREE.MeshStandardMaterial({ color: 0xc81e1e, roughness: .5 })); pipe.position.y = -.25; g.add(pipe);
    const head = new THREE.Mesh(new THREE.SphereGeometry(.08, 12, 8), steel); head.position.y = -.52; g.add(head);
    kit.nozzle = g;
  }
  A.zipCable = steel;
  A.zipBeam = new THREE.MeshStandardMaterial({ color: 0x3b4048, metalness: .6, roughness: .4 });
  A.eventSigns = {};
  A.eventSign = type => A.eventSigns[type] ||= (() => {
    const [en, he, col] = { blackout: ['POWER FAILURE', 'הפסקת חשמל — רצים עם פנס!', '#ff4a3a'], fm200: ['FM-200 DISCHARGE', 'שחרור גז כיבוי! ראות נמוכה', '#ff4a3a'], tiles: ['FLOOR TILES REMOVED', 'אריחי רצפה חסרים — קופצים!', '#ffbf2e'] }[type];
    const t = TX.signTexture(en, he, col);
    return new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: .9, side: THREE.DoubleSide });
  })();
  for (const k of ['door', 'zipBlock', 'trolley', 'zipPlatform']) kit[k].traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
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
    this.cords = [];
    this.movers = [];
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
    this.queue = [];
  }

  reset(random = Math.random, tutorial = false) {
    for (const s of this.segments) this.disposeSegment(s);
    for (const j of this.queue) j.seg.disposed = true;
    this.queue.length = 0;
    this.segments.clear();
    this.random = random;
    this.themeIndex = 0;
    this.turnCount = 0;
    const firstTheme = this.firstTheme || 'hall';
    this.seen = new Set([firstTheme]);
    const first = new Segment({ origin: new THREE.Vector3(), dir: 0, length: tutorial ? 150 : Math.max(110, worldLength(0, this.random)), turns: tutorial ? { left: true, right: true } : this.pickTurns(), theme: firstTheme, first: true, distanceAtStart: 0, seed: 1 });
    // debug: ?ride=zip / ?event=blackout force one on the first aisle
    if (this.debugRide && !tutorial) first.ride = { type: this.debugRide, from: 50, to: Math.min(first.length - 30, 110) };
    else if (this.debugEvent && !tutorial) first.event = { type: this.debugEvent, from: 50, to: Math.min(first.length - 30, 110) };
    if (tutorial) this.populateTutorial(first); else this.populate(first, 0);
    this.immediate = true;
    this.build(first);
    this.ensureChildren(first);
    this.immediate = false;
    return first;
  }

  // Compile every material and upload every texture once at load, so the first
  // visit to a world doesn't stall while the GPU compiles shaders.
  async prewarm(renderer, camera) {
    const temps = [];
    for (const theme of THEME_ORDER) {
      const seg = new Segment({ origin: new THREE.Vector3(0, -500, 0), dir: 0, length: 70, turns: { left: true, right: false }, theme, distanceAtStart: 600, seed: 7 });
      seg.ride = { type: ZIP_THEMES.has(theme) ? 'zip' : temps.length % 2 ? 'jack' : 'tray', from: HALF + 10, to: HALF + 30 };
      if (THEMES[theme].kind === 'racks') seg.event = { type: 'tiles', from: HALF + 34, to: 66 };
      this.populate(seg, 600); this.build(seg); temps.push(seg);
    }
    const textures = new Set();
    this.scene.traverse(o => { const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; for (const m of ms) for (const k of ['map', 'normalMap', 'roughnessMap', 'emissiveMap', 'alphaMap']) if (m[k]) textures.add(m[k]); });
    for (const t of textures) renderer.initTexture(t);
    try { await renderer.compileAsync(this.scene, camera); } catch { renderer.compile(this.scene, camera); }
    for (const s of temps) this.disposeSegment(s);
  }

  pickTurns() {
    const r = this.random();
    return r < .4 ? { left: true, right: true } : r < .7 ? { left: true, right: false } : { left: false, right: true };
  }

  ensureChildren(seg) {
    // every turn leads to a world you haven't played yet this cycle; once all
    // have been visited the cycle starts over from the first world
    let unseen = THEME_ORDER.filter(t => !this.seen.has(t));
    if (!unseen.length) unseen = THEME_ORDER.filter(t => t !== seg.theme);
    let pick = 0;
    for (const side of ['left', 'right']) {
      if (!seg.turns[side] || seg.children[side]) continue;
      const dir = (seg.dir + (side === 'right' ? 1 : 3)) % 4;
      this.turnCount++;
      const theme = unseen[Math.min(pick++, unseen.length - 1)];
      const dist = seg.distanceAtStart + seg.length;
      const length = worldLength(dist, this.random);
      const child = new Segment({ origin: seg.end(), dir, length, turns: this.pickTurns(), theme, distanceAtStart: dist, seed: (seg.seed * 31 + (side === 'right' ? 7 : 3)) % 100000 });
      child.parent = seg; child.side = side;
      // sometimes a world opens with a ride: a red pallet jack or a cable-tray slide
      if (this.random() < .4) {
        const len = Math.min(child.length - 50, runSpeedAt(dist) * 1.35 * (7 + this.random() * 4));
        const type = ZIP_THEMES.has(theme) && this.random() < .7 ? 'zip' : this.random() < .5 ? 'jack' : 'tray';
        if (len > 45) child.ride = { type, from: HALF + 10, to: HALF + 10 + len };
      }
      // or a special event somewhere along the aisle
      if (!child.ride && dist > 250 && this.random() < .4) {
        const kinds = Object.keys(EVENTS).filter(k => EVENTS[k](theme)).flatMap(k => k === 'blackout' ? [k] : [k, k]);
        if (kinds.length) {
          const type = kinds[this.random() * kinds.length | 0];
          const from = HALF + 18, to = Math.min(child.length - 32, from + 45 + this.random() * 30);
          if (to - from > 30) child.event = { type, from, to };
        }
      }
      this.populate(child, dist);
      if (this.immediate) this.build(child); else this.queueBuild(child);
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
    if (THEME_ORDER.every(t => this.seen.has(t))) this.seen = new Set();
    this.seen.add(chosen.theme);
    this.ensureChildren(chosen);
    return chosen;
  }

  retire(seg) { if (seg && this.segments.has(seg)) this.disposeSegment(seg); }

  disposeTree(seg) {
    for (const c of Object.values(seg.children)) this.disposeTree(c);
    this.disposeSegment(seg);
  }

  disposeSegment(seg) {
    seg.disposed = true;
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
      const room = THEMES[seg.theme].kind;
      const set = ROOM_OBSTACLES[room];
      let kind;
      if (roll < set.jumpP) kind = 'jump';
      else if (roll < set.jumpP + set.slideP) kind = 'slide';
      else if (roll < set.jumpP + set.slideP + (set.pitP || 0)) kind = 'pit';
      else kind = 'dodge';
      const inRide = seg.ride && u > seg.ride.from - 4 && u < seg.ride.to + 6;
      if (inRide) kind = 'dodge';
      const E = seg.event;
      // the missing-tiles gauntlet replaces the normal obstacles (added after the loop)
      if (E && E.type === 'tiles' && u > E.from - 8 && u < E.to + 8) { u = E.to + 10; continue; }
      let free = [0, 1, 2];
      const zip = inRide && seg.ride.type === 'zip';
      if (zip) {
        // gear hanging from the ceiling in one or two lanes of the zip line
        const count = r() < .3 + diff * .3 ? 2 : 1;
        const lanes = [0, 1, 2].sort(() => r() - .5).slice(0, count);
        free = [0, 1, 2].filter(l => !lanes.includes(l));
        if (u > seg.ride.from + 8 && u < seg.ride.to - 4) for (const l of lanes) push({ type: 'zipBlock', u, len: .8, lanes: [l], need: 'dodge', zip: true });
      }
      else if (kind === 'jump') { const jt = room === 'storeroom' && r() < .4 ? 'woodLadder' : set.jump; push({ type: jt, u, len: .7, lanes: [0, 1, 2], need: 'jump', clear: .42, stumble: true }); }
      else if (kind === 'slide') push({ type: set.slide, u, len: set.slide === 'duct' ? 1 : .7, lanes: [0, 1, 2], need: 'slide' });
      else if (kind === 'pit') push({ type: 'pit', u, len: 1.8, lanes: [0, 1, 2], need: 'jump', clear: .01 });
      else if (room === 'racks' && !inRide && r() < .22) {
        // a rack door swings open and a server slides out on its rails as you approach
        const side = r() < .5 ? -1 : 1, l = side < 0 ? 0 : 2;
        push({ type: 'door', u, len: .9, lanes: [l], need: 'dodge', x: side * 2.25, halfW: .95, slideOk: true, side, open: 0, swing: { trigger: 24, speed: 2.4 } });
        free = [0, 1, 2].filter(x => x !== l);
      }
      else if (room === 'warehouse' && !inRide && r() < .35) {
        // a forklift drives across the aisle as you approach
        const fromLeft = r() < .5, sx = fromLeft ? -HALF - 2.2 : HALF + 2.2, tx = fromLeft ? HALF + 2.6 : -HALF - 2.6;
        push({ type: 'forklift', u, len: 1.4, lanes: [0, 1, 2], need: 'dodge', x: sx, halfW: 1.45, rotY: fromLeft ? -Math.PI / 2 : Math.PI / 2, move: { to: tx, trigger: 30, speed: 4.6 } });
      }
      else if (room === 'gallery' && !inRide && r() < .3) {
        // an office chair rolls across the aisle as you approach
        const a = r() * 3 | 0, b = a === 1 ? (r() < .5 ? 0 : 2) : 1;
        push({ type: 'chair', u, len: .7, lanes: [a, b], need: 'dodge', x: LANES[a], move: { to: LANES[b], trigger: 26, speed: 2.4, spin: true } });
        free = [0, 1, 2].filter(l => l !== a && l !== b);
      } else if (room === 'gallery' && r() < .3) {
        // a chair knocked over: jump it or go round
        const l = r() * 3 | 0;
        push({ type: 'chairDown', u, len: .9, lanes: [l], need: 'jump', clear: .55, stumble: true });
        free = [0, 1, 2].filter(x => x !== l);
      } else {
        const count = r() < .35 + diff * .35 ? 2 : 1;
        const lanes = [0, 1, 2].sort(() => r() - .5).slice(0, count);
        free = [0, 1, 2].filter(l => !lanes.includes(l));
        for (const l of lanes) {
          const t = set.dodge[r() * set.dodge.length | 0];
          push({ type: t, u: u + (r() - .5) * .6, len: t === 'boxes' || t === 'drums' || t === 'filters' || t === 'table' || t === 'scrap' ? 1.1 : .8, lanes: [l], need: 'dodge' });
        }
      }
      // QSFP run leading into the obstacle
      if (!free.includes(chipLane)) chipLane = free[r() * free.length | 0];
      const n = 5 + (r() * 5 | 0);
      for (let i = 0; i < n; i++) {
        const cu = u - 3 - (n - i) * 1.6;
        if (cu < seg.startU + 4) continue;
        seg.chips.push({ u: cu, x: LANES[chipLane], y: zip && cu > seg.ride.from + 2 ? 1.55 + .9 : .7, taken: false });
      }
      if (kind === 'cable' || kind === 'pit') {
        // arc of chips over the jump
        for (let i = -2; i <= 2; i++) seg.chips.push({ u: u + i * 1.5, x: LANES[chipLane], y: .8 + (1 - (i * i) / 4) * .75, taken: false });
      }
      if (r() < .3) chipLane = Math.max(0, Math.min(2, chipLane + (r() < .5 ? -1 : 1)));
      u += 24 - diff * 9 + r() * 10 + (E && E.type === 'blackout' && u > E.from && u < E.to ? 7 : 0);
    }
    // missing floor tiles one after another: jump, land, jump again
    if (seg.event?.type === 'tiles') {
      const E = seg.event, speed = runSpeedAt(distance + E.from);
      const gap = speed * .95 + 3.5;
      let lane = r() * 3 | 0;
      for (let pu = E.from + 6; pu < E.to - 4; pu += gap * (1 + r() * .25)) {
        push({ type: 'pit', u: pu, len: 1.8, lanes: [0, 1, 2], need: 'jump', clear: .01 });
        for (let i = -2; i <= 2; i++) seg.chips.push({ u: pu + i * 1.5, x: LANES[lane], y: .8 + (1 - (i * i) / 4) * .75, taken: false });
        if (r() < .4) lane = Math.max(0, Math.min(2, lane + (r() < .5 ? -1 : 1)));
      }
      seg.obstacles.sort((a, b) => a.u - b.u);
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

  // the first-run lesson: one of each move, spaced out, then a junction
  populateTutorial(seg) {
    const lane = l => LANES[l];
    seg.obstacles.push({ type: 'cable', u: 46, len: .7, lanes: [0, 1, 2], need: 'jump', clear: .42, stumble: true });
    seg.obstacles.push({ type: 'bar', u: 78, len: .7, lanes: [0, 1, 2], need: 'slide' });
    seg.obstacles.push({ type: 'boxes', u: 110, len: 1.1, lanes: [1], need: 'dodge' });
    for (let i = 0; i < 8; i++) seg.chips.push({ u: 18 + i * 2.2, x: 0, y: .7, taken: false });
    for (let i = -2; i <= 2; i++) seg.chips.push({ u: 46 + i * 1.5, x: 0, y: .8 + (1 - (i * i) / 4) * .75, taken: false });
    for (let i = 0; i < 6; i++) seg.chips.push({ u: 84 + i * 2, x: 0, y: .7, taken: false });
    for (let i = 0; i < 6; i++) seg.chips.push({ u: 100 + i * 2.2, x: lane(2), y: .7, taken: false });
    for (let i = 0; i < 6; i++) seg.chips.push({ u: seg.length - 20 + i * 2, x: 0, y: .7, taken: false });
  }

  /* ---------- visuals ---------- */
  build(seg) { for (const _ of this.buildSteps(seg)); }

  // Build a segment a little at a time (a few ms per frame) so turning into a
  // new world never causes a long frame on phones.
  queueBuild(seg) { this.queue.push({ seg, it: this.buildSteps(seg) }); }
  pump(budgetMs = 4) {
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < budgetMs) {
      const job = this.queue[0];
      if (job.seg.disposed) { this.queue.shift(); continue; }
      if (job.it.next().done) this.queue.shift();
    }
  }

  *buildSteps(seg) {
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
      const m = own(new THREE.Mesh(geo, T.kind === 'racks' ? A.floorMat : A.R.floor[T.kind]));
      m.position.set(0, 0, -(a + b) / 2); m.receiveShadow = true; g.add(m);
    }

    const r = rng(seg.seed * 7 + 11);
    // doorway header so taller/shorter rooms meet cleanly at the junction
    if (!seg.first) {
      const hd = own(new THREE.Mesh(new THREE.PlaneGeometry(AISLE + 6, 3.4), A.rackBody));
      hd.material = A.rackBody; hd.position.set(0, 3.4 + 1.7, -u0); g.add(hd);
      const hd2 = hd.clone(); hd2.rotation.y = Math.PI; g.add(hd2);
    }
    yield;
    if (T.kind !== 'racks') {
      buildRoom(T.kind, { g, own, seg, A, R: A.R, T, L, u0, uEnd, HALF, AISLE, left: seg.turns.left, right: seg.turns.right, r: rng(seg.seed * 13 + 5) });
    } else {
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
          buckets[v].push({ m: m4.compose(p, q, s1).clone(), u: -p.z });
        }
      }
      // end wall facing the runner
      const wallFrom = left ? -HALF : -HALF - RACK.d, wallTo = right ? HALF : HALF + RACK.d;
      const nWall = Math.round((wallTo - wallFrom) / RACK.w);
      q.identity();
      for (let i = 0; i < nWall; i++) {
        p.set(wallFrom + RACK.w / 2 + i * RACK.w, RACK.h / 2 + .02, -(uEnd + RACK.d / 2));
        buckets[pickVariant()].push({ m: m4.compose(p, q, s1).clone(), u: -p.z });
      }
      buckets.forEach((mats, v) => {
        if (!mats.length) return;
        const im = new THREE.InstancedMesh(A.rackGeo, variantMats[v], mats.length);
        mats.forEach((e, i) => im.setMatrixAt(i, e.m));
        im.castShadow = true; im.receiveShadow = true;
        im.computeBoundingSphere();
        g.add(im);
        // 3D patch cords, drawn only for racks near the runner (see updateCords)
        const hg = A.harness[seg.theme + v];
        if (hg) {
          const sorted = mats.slice().sort((a, b) => a.u - b.u);
          const cm = new THREE.InstancedMesh(hg, A.cordMat, sorted.length);
          cm.count = 0; cm.frustumCulled = false; cm.castShadow = false; cm.receiveShadow = true;
          seg.cords.push({ mesh: cm, list: sorted, start: -1, end: -1 });
          g.add(cm);
        }
      });

      yield;
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
        const tr = buildTrough(len, T.duct, A.time, { seed: seg.seed + row.side, fibreColor: T.duct });
        tr.traverse(o => { if (o.isMesh) o.userData.ownGeo = true; });
        tr.position.set(row.side * (HALF - .2), 2.56, -row.from); g.add(tr);
        // spill-outs dropping fibre into every third rack
        const n = Math.floor(len / 3);
        if (n > 0) {
          const sp = new THREE.InstancedMesh(A.spillGeo, A.spillMat(T.duct), n);
          const sq = new THREE.Quaternion().setFromAxisAngle(up, row.side < 0 ? Math.PI : 0);
          for (let i = 0; i < n; i++) { p.set(row.side * (HALF - .2), 2.56, -(row.from + 1.5 + i * 3)); sp.setMatrixAt(i, m4.compose(p, sq, s1)); }
          sp.castShadow = true; sp.computeBoundingSphere(); g.add(sp);
        }
      }
      {
        const w = wallTo - wallFrom;
        const geo = new THREE.PlaneGeometry(w, panelH);
        const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 1.2, uv.getY(i));
        const m = own(new THREE.Mesh(geo, A.containment));
        m.position.set((wallFrom + wallTo) / 2, RACK.h + panelH / 2 + .02, -(uEnd + .04)); g.add(m);
      }

      yield;
      // Ceiling
      {
        const len = uEnd - u0 + RACK.d;
        const geo = new THREE.PlaneGeometry(AISLE + RACK.d * 2, len); geo.rotateX(Math.PI / 2);
        const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (AISLE + 2.4) / 2.4, uv.getY(i) * len / 2.4);
        const m = own(new THREE.Mesh(geo, A.ceiling)); m.position.set(0, CEILING, -(u0 + len / 2)); g.add(m);
      }

      yield;
      // Centre ladder tray with a fibre bundle
      {
        const len = uEnd - u0;
        const geo = new THREE.PlaneGeometry(.6, len); geo.rotateX(-Math.PI / 2);
        const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i) * len / 2);
        const m = own(new THREE.Mesh(geo, A.ladder)); m.position.set(0, 3.25, -(u0 + len / 2)); g.add(m);
        const c = own(new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, len, 10, 1, true), A.cableBlack));
        c.rotation.x = Math.PI / 2; c.position.set(.08, 3.38, -(u0 + len / 2)); g.add(c);
        const f = buildTrough(len, T.duct, A.time, { width: .24, height: .09, fibres: 7, seed: seg.seed + 5, fibreColor: T.duct });
        f.traverse(o => { if (o.isMesh) o.userData.ownGeo = true; });
        f.position.set(-.18, 3.27, -u0); g.add(f);
      }

      yield;
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
    }

    yield;
    // Row sign hanging at the start of the aisle
    if (!seg.first || true) {
      const sm = own(new THREE.Mesh(new THREE.PlaneGeometry(2.4, .45), A.sign(seg.theme)));
      sm.position.set(0, 2.95, -(u0 + 6)); sm.rotation.y = 0;
      const back = own(new THREE.Mesh(new THREE.BoxGeometry(2.5, .52, .04), A.housingMat)); back.position.set(0, 2.95, -(u0 + 6) - .03);
      g.add(back, sm);
      const sm2 = sm.clone(); sm2.position.z = -(u0 + 6) - .061; sm2.rotation.y = Math.PI; g.add(sm2);
    }

    // parked ride vehicle waiting at the start of the ride section
    if (seg.ride?.type === 'zip') {
      // three steel cables, one over each lane, between two gantry beams
      const R = seg.ride, a = R.from - 3, b = R.to + 3, len = b - a;
      for (const x of LANES) {
        const c = own(new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, len, 8), A.zipCable)); c.rotation.x = Math.PI / 2; c.position.set(x, ZIP_H, -(a + len / 2)); g.add(c);
      }
      for (const u of [a, b]) {
        const beam = own(new THREE.Mesh(new THREE.BoxGeometry(AISLE + .4, .3, .3), A.zipBeam)); beam.position.set(0, ZIP_H + .2, -u); g.add(beam);
        for (const x of [-HALF - .1, HALF + .1]) { const post = own(new THREE.Mesh(new THREE.BoxGeometry(.25, ZIP_H + .35, .25), A.zipBeam)); post.position.set(x, (ZIP_H + .35) / 2, -u); g.add(post); }
      }
      // steps up to the start platform
      const plat = A.obstacleKit.zipPlatform.clone(); plat.position.set(0, 0, -(R.from - 6)); g.add(plat);
      const m = A.obstacleKit.trolley.clone(); m.position.set(0, ZIP_H, -(R.from + .3)); seg.rideMesh = m; g.add(m);
      const sign = own(new THREE.Mesh(new THREE.PlaneGeometry(3.2, .6), A.rideSign('zip'))); sign.position.set(0, ZIP_H + .9, -(R.from - 3.2)); g.add(sign);
    } else if (seg.ride) {
      const m = (seg.ride.type === 'jack' ? A.obstacleKit.jack : A.obstacleKit.sled).clone();
      m.position.set(0, 0, -(seg.ride.from + .6)); seg.rideMesh = m; g.add(m);
      const sign = own(new THREE.Mesh(new THREE.PlaneGeometry(3.2, .6), A.rideSign(seg.ride.type))); sign.position.set(0, 2.6, -(seg.ride.from - 2)); g.add(sign);
    }

    yield;
    // Obstacles
    for (const o of seg.obstacles) {
      let mesh;
      if (o.type === 'cable') mesh = A.obstacleKit.cable.clone();
      else if (o.type === 'bar') mesh = A.obstacleKit.bar.clone();
      else if (o.type === 'pit') mesh = A.obstacleKit.pit.clone();
      else mesh = A.obstacleKit[o.type].clone();
      const x = o.x ?? (o.lanes.length === 3 ? 0 : LANES[o.lanes[0]]);
      mesh.position.set(x, 0, -o.u);
      if (o.type === 'door') { mesh.position.x = o.side * HALF; mesh.scale.x = o.side; }
      if (o.rotY !== undefined) mesh.rotation.y = o.rotY;
      else if (o.lanes.length === 1 && o.type !== 'door' && o.type !== 'zipBlock') mesh.rotation.y = (r() - .5) * .5;
      o.mesh = mesh; g.add(mesh);
    }

    // warning sign before an event
    if (seg.event) {
      const sign = own(new THREE.Mesh(new THREE.PlaneGeometry(3.2, .6), A.eventSign(seg.event.type)));
      sign.position.set(0, 2.75, -(seg.event.from - 4)); g.add(sign);
      // ceiling nozzles that release the FM-200 gas
      if (seg.event.type === 'fm200') for (let u = seg.event.from; u < seg.event.to; u += 9) {
        const n = A.obstacleKit.nozzle.clone(); n.position.set(0, CEILING, -u); g.add(n);
      }
    }

    yield;
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
    yield* this.bakeStatic(seg);
    this.scene.add(g);
    this.segments.add(seg);
  }

  // Merge the aisle's static set dressing into one mesh per material per 24 m
  // chunk: a warehouse aisle drops from ~1000 draw calls to well under 200.
  // Moving / breakable things (obstacles, power-ups, rides, movers) stay separate.
  *bakeStatic(seg) {
    const g = seg.group;
    const dyn = new Set([seg.rideMesh, seg.chipMesh, ...seg.obstacles.map(o => o.mesh), ...seg.powerups.map(p => p.mesh)].filter(Boolean));
    g.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
    const buckets = new Map();
    const visit = o => {
      if (dyn.has(o) || o.userData.dynamic) return;
      if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && !Array.isArray(o.material) && !o.material.transparent && o.visible && !o.customDepthMaterial && !o.geometry.morphAttributes?.position) {
        const geo = o.geometry, attrs = Object.keys(geo.attributes).sort().join(',');
        if (geo.attributes.position && geo.attributes.normal) {
          const c = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld).applyMatrix4(inv);
          const key = `${o.material.uuid}|${attrs}|${!!geo.index}|${o.castShadow}|${o.receiveShadow}|${Math.floor(-c.z / 24)}`;
          if (!buckets.has(key)) buckets.set(key, []);
          buckets.get(key).push(o);
        }
      }
      for (const ch of o.children) visit(ch);
    };
    for (const ch of g.children) visit(ch);
    const m4 = new THREE.Matrix4();
    for (const list of buckets.values()) {
      if (list.length < 2) continue;
      const geos = list.map(o => {
        const gg = o.geometry.clone();
        for (const k of Object.keys(gg.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) gg.deleteAttribute(k);
        gg.clearGroups();
        return gg.applyMatrix4(m4.multiplyMatrices(inv, o.matrixWorld));
      });
      const merged = mergeGeometries(geos);
      geos.forEach(x => x.dispose());
      if (!merged) continue;
      const src = list[0], mesh = new THREE.Mesh(merged, src.material);
      mesh.castShadow = src.castShadow; mesh.receiveShadow = src.receiveShadow; mesh.userData.ownGeo = true;
      for (const o of list) { o.parent.remove(o); if (o.userData.ownGeo) o.geometry.dispose(); }
      g.add(mesh);
      yield;
    }
  }

  updateMovers(seg, t, dt) { if (seg.movers.length) updateMovers(seg, t, dt); }

  // Copy the cord instances for racks within [uFrom, uTo] to the front of the buffer.
  updateCords(seg, uFrom, uTo) {
    for (const c of seg.cords) {
      const L = c.list;
      let a = 0; while (a < L.length && L[a].u < uFrom) a++;
      let b = a; while (b < L.length && L[b].u <= uTo) b++;
      if (a === c.start && b === c.end) continue;
      c.start = a; c.end = b;
      for (let i = a; i < b; i++) c.mesh.setMatrixAt(i - a, L[i].m);
      c.mesh.count = b - a;
      c.mesh.instanceMatrix.needsUpdate = true;
    }
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
