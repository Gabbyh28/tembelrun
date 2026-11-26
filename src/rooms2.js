// Four more worlds: the NOC control room, the rooftop chiller yard at night in
// the rain, the UPS battery room and the loading dock. Same conventions as
// rooms.js: segment-local frame, forward = -Z, aisle x in [-HALF, HALF].
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { canvas, tex, noise, rand } from './textures.js';
import { STEP, planeAlong, sideWall, endWall, ceiling, runAlong, instanced, tubeZ, boxZ, sideRange } from './rooms.js';

const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S1 = new THREE.Vector3(1, 1, 1), UP = new THREE.Vector3(0, 1, 0);
const shadow = g => { g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return g; };
const mat4 = (x, y, z, ry = 0, s = S1) => { P.set(x, y, z); Q.setFromAxisAngle(UP, ry); return M4.compose(P, Q, s).clone(); };

/* ------------------------------------------------------------------ */
/* Textures                                                             */
/* ------------------------------------------------------------------ */
function carpet(a) {
  const [c, g] = canvas(512, 512), r = rand(31);
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
    g.fillStyle = (x + y) % 2 ? '#262c36' : '#2c333e'; g.fillRect(x * 256, y * 256, 256, 256);
    // tufted grain, alternating direction per tile
    for (let i = 0; i < 2600; i++) { const v = 30 + r() * 40 | 0; g.fillStyle = `rgba(${v},${v + 6},${v + 14},.5)`; const px = x * 256 + r() * 256, py = y * 256 + r() * 256; (x + y) % 2 ? g.fillRect(px, py, 6, 1) : g.fillRect(px, py, 1, 6); }
  }
  g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2; g.strokeRect(0, 0, 256, 256); g.strokeRect(256, 256, 256, 256);
  const t = tex(c, { repeat: true, aniso: a }); return t;
}

// big dashboards for the video wall: graphs, a world map of sites, alarm tiles
function dashboard(variant) {
  const W = 1024, H = 512, [c, g] = canvas(W, H), r = rand(100 + variant * 17);
  g.fillStyle = '#04070d'; g.fillRect(0, 0, W, H);
  const panel = (x, y, w, h, title) => {
    g.fillStyle = '#0a1422'; g.fillRect(x + 4, y + 4, w - 8, h - 8);
    g.strokeStyle = '#1d3b5c'; g.lineWidth = 2; g.strokeRect(x + 4, y + 4, w - 8, h - 8);
    g.fillStyle = '#6fb6ff'; g.font = 'bold 18px monospace'; g.fillText(title, x + 14, y + 26);
  };
  const graph = (x, y, w, h, col, n = 60) => {
    g.strokeStyle = 'rgba(80,130,180,.25)'; g.lineWidth = 1;
    for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(x, y + h * i / 4); g.lineTo(x + w, y + h * i / 4); g.stroke(); }
    g.strokeStyle = col; g.lineWidth = 2.5; g.beginPath();
    let v = .5; for (let i = 0; i <= n; i++) { v = Math.min(.95, Math.max(.05, v + (r() - .5) * .25)); const px = x + i / n * w, py = y + h - v * h; i ? g.lineTo(px, py) : g.moveTo(px, py); }
    g.stroke();
  };
  if (variant === 0) {
    panel(0, 0, 512, 256, 'CORE TRAFFIC  Tb/s'); graph(20, 40, 472, 196, '#36e0a0');
    panel(512, 0, 512, 256, 'POWER  kW'); graph(532, 40, 472, 196, '#ffc23a');
    panel(0, 256, 1024, 256, 'SITES');
    // world map of dots
    for (let i = 0; i < 260; i++) { const x = 40 + r() * 940, y = 300 + r() * 190; const lat = (y - 300) / 190, lon = (x - 40) / 940; if (Math.sin(lon * 9 + lat * 4) + Math.cos(lat * 7) > .3) { g.fillStyle = 'rgba(70,140,220,.6)'; g.fillRect(x, y, 4, 4); } }
    for (let i = 0; i < 14; i++) { const x = 60 + r() * 900, y = 310 + r() * 170; g.fillStyle = r() < .15 ? '#ff4040' : '#36e0a0'; g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); }
  } else if (variant === 1) {
    panel(0, 0, 340, 512, 'RACK HEALTH');
    for (let y = 0; y < 14; y++) for (let x = 0; x < 8; x++) { const q = r(); g.fillStyle = q < .06 ? '#ff3b30' : q < .14 ? '#ffb020' : '#1fbf6a'; g.fillRect(24 + x * 38, 44 + y * 32, 32, 26); }
    panel(340, 0, 684, 256, 'LATENCY  ms'); graph(360, 40, 644, 196, '#6fb6ff', 90);
    panel(340, 256, 684, 256, 'TICKETS');
    g.font = '18px monospace';
    for (let i = 0; i < 8; i++) { g.fillStyle = i === 0 ? '#ff6b5e' : i < 3 ? '#ffc23a' : '#8fb3d6'; g.fillText(`INC-${4100 + (r() * 800 | 0)}  ${['UPS-B on battery', 'CRAH-3 high temp', 'Core-SW2 port flap', 'Gen-2 test run', 'Fibre tray C full', 'Door 4 held open', 'PDU-7 load 82%', 'Chiller-1 alarm'][i]}`, 360, 300 + i * 26); }
  } else {
    panel(0, 0, 512, 512, 'TEMP  °C');
    for (let i = 0; i < 6; i++) { const v = .3 + r() * .6; g.fillStyle = v > .8 ? '#ff5a3a' : '#2aa8e0'; g.fillRect(40 + i * 75, 470 - v * 380, 50, v * 380); }
    panel(512, 0, 512, 256, 'UPTIME'); g.fillStyle = '#36e0a0'; g.font = 'bold 84px monospace'; g.fillText('99.999%', 545, 180);
    panel(512, 256, 512, 256, 'QSFP STOCK'); graph(532, 296, 472, 196, '#b44dff');
  }
  return tex(c);
}

function screenTex(seed) {
  const [c, g] = canvas(256, 160), r = rand(seed);
  g.fillStyle = '#061018'; g.fillRect(0, 0, 256, 160);
  for (let i = 0; i < 12; i++) { g.fillStyle = r() < .5 ? '#2c7fb8' : '#36e0a0'; g.fillRect(10, 10 + i * 12, 30 + r() * 200, 5); }
  return tex(c);
}

function membrane(a) {
  const [c, g] = canvas(512, 512), r = rand(5);
  g.fillStyle = '#5b6066'; g.fillRect(0, 0, 512, 512); noise(g, 512, 512, r, 9000, .08);
  g.strokeStyle = 'rgba(30,32,36,.7)'; g.lineWidth = 3; for (let x = 0; x <= 512; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 512); g.stroke(); }
  for (let i = 0; i < 6; i++) { const grd = g.createRadialGradient(r() * 512, r() * 512, 0, 256, 256, 120); grd.addColorStop(0, 'rgba(20,24,30,.35)'); grd.addColorStop(1, 'rgba(20,24,30,0)'); g.fillStyle = grd; g.fillRect(0, 0, 512, 512); }
  return tex(c, { repeat: true, aniso: a });
}

function skyline() {
  const [c, g] = canvas(1024, 256), r = rand(9);
  g.fillStyle = '#000'; g.fillRect(0, 0, 1024, 256);
  let x = 0;
  while (x < 1024) {
    const w = 30 + r() * 70, h = 60 + r() * 180;
    g.fillStyle = '#0a0d14'; g.fillRect(x, 256 - h, w, h);
    for (let wy = 256 - h + 8; wy < 250; wy += 9) for (let wx = x + 5; wx < x + w - 5; wx += 8) if (r() < .32) { g.fillStyle = r() < .8 ? 'rgba(255,214,150,.9)' : 'rgba(170,210,255,.9)'; g.fillRect(wx, wy, 4, 5); }
    if (r() < .2) { g.fillStyle = '#ff3020'; g.fillRect(x + w / 2, 256 - h - 6, 3, 3); }
    x += w + 2 + r() * 10;
  }
  return tex(c);
}

function batteryFace() {
  const [c, g] = canvas(256, 128), r = rand(3);
  g.fillStyle = '#16181c'; g.fillRect(0, 0, 256, 128);
  for (let x = 0; x < 2; x++) {
    const ox = x * 128;
    g.fillStyle = '#202328'; g.fillRect(ox + 6, 8, 116, 112);
    g.fillStyle = '#d4d8dc'; g.fillRect(ox + 16, 30, 96, 30);
    g.fillStyle = '#16181c'; g.font = 'bold 15px sans-serif'; g.fillText('12V 200Ah', ox + 22, 51);
    g.fillStyle = '#c81e1e'; g.fillRect(ox + 16, 70, 20, 10); g.fillStyle = '#111'; g.fillRect(ox + 92, 70, 20, 10);
    g.fillStyle = r() < .9 ? '#36e06a' : '#ffb020'; g.fillRect(ox + 56, 92, 14, 8);
  }
  return tex(c);
}

function warnSign(text, sub) {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#f2c200'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#111'; g.beginPath(); g.moveTo(128, 20); g.lineTo(232, 190); g.lineTo(24, 190); g.closePath(); g.fill();
  g.fillStyle = '#f2c200'; g.beginPath(); g.moveTo(128, 48); g.lineTo(208, 176); g.lineTo(48, 176); g.closePath(); g.fill();
  g.fillStyle = '#111'; g.font = 'bold 90px sans-serif'; g.textAlign = 'center'; g.fillText('!', 128, 166);
  g.font = 'bold 26px sans-serif'; g.fillText(text, 128, 222); g.font = '18px sans-serif'; g.fillText(sub, 128, 246);
  return tex(c);
}

function rollDoor(a) {
  const [c, g] = canvas(256, 512);
  g.fillStyle = '#9aa1a8'; g.fillRect(0, 0, 256, 512);
  for (let y = 0; y < 512; y += 16) { g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(0, y + 12, 256, 4); g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(0, y, 256, 2); }
  g.fillStyle = '#f2c200'; for (let x = -40; x < 300; x += 40) { g.save(); g.beginPath(); g.rect(0, 480, 256, 32); g.clip(); g.fillRect(x, 480, 20, 32); g.restore(); }
  return tex(c, { aniso: a });
}

function trailerRear() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#e8eaec'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#c9cdd1'; g.fillRect(126, 0, 4, 256);
  for (const x of [60, 196]) { g.fillStyle = '#7d848b'; g.fillRect(x - 3, 20, 6, 210); }
  for (let x = 0; x < 256; x += 24) { g.fillStyle = (x / 24) % 2 ? '#d11f1f' : '#ffffff'; g.fillRect(x, 232, 24, 14); }
  g.fillStyle = '#f2c200'; g.fillRect(100, 200, 56, 20); g.fillStyle = '#111'; g.font = 'bold 14px monospace'; g.textAlign = 'center'; g.fillText('12-345-67', 128, 215);
  return tex(c);
}

/* ------------------------------------------------------------------ */
/* Materials + obstacles                                                */
/* ------------------------------------------------------------------ */
export function moreRoomAssets(A, R) {
  const a = A.aniso;
  R.floor.noc = new THREE.MeshStandardMaterial({ map: carpet(a), roughness: .95 });
  R.floor.noc.map.repeat.set(1, 1);
  const mem = membrane(a);
  R.floor.roof = new THREE.MeshStandardMaterial({ map: mem, color: 0x8a9098, roughness: .12, metalness: .1, envMapIntensity: 1.6 });   // wet
  R.floor.battery = new THREE.MeshStandardMaterial({ map: R.floor.generator.map, normalMap: R.floor.generator.normalMap, color: 0x9aa3a6, roughness: .35 });
  R.floor.dock = R.floor.warehouse;
  R.wallDark = new THREE.MeshStandardMaterial({ color: 0x1a1f28, roughness: .8 });
  R.dash = [0, 1, 2].map(v => { const t = dashboard(v); return new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 1.6, roughness: .3 }); });
  R.bezel = new THREE.MeshStandardMaterial({ color: 0x0d0f12, roughness: .4 });
  R.desk = new THREE.MeshStandardMaterial({ color: 0xd8d4ca, roughness: .55 });
  R.monitor = [0, 1, 2].map(s => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: screenTex(50 + s), emissiveIntensity: 1.3 }));
  R.skyline = new THREE.MeshBasicMaterial({ map: skyline(), fog: true });
  R.parapet = new THREE.MeshStandardMaterial({ color: 0x6b7078, roughness: .8 });
  R.chillerBody = new THREE.MeshStandardMaterial({ color: 0xd9dde0, roughness: .45, metalness: .3 });
  R.batFace = new THREE.MeshStandardMaterial({ map: batteryFace(), roughness: .5 });
  R.batBody = new THREE.MeshStandardMaterial({ color: 0x16181c, roughness: .55 });
  R.batRack = new THREE.MeshStandardMaterial({ color: 0x5c6a7a, metalness: .6, roughness: .4 });
  R.cableRed = new THREE.MeshStandardMaterial({ color: 0xb31b1b, roughness: .45 });
  R.cableBlack = new THREE.MeshStandardMaterial({ color: 0x121316, roughness: .5 });
  R.warnBat = new THREE.MeshStandardMaterial({ map: warnSign('DANGER', 'BATTERIES / ACID'), roughness: .5 });
  R.eyewash = new THREE.MeshStandardMaterial({ color: 0x18a34a, emissive: 0x0b5a26, emissiveIntensity: .6, roughness: .5 });
  R.rollDoor = new THREE.MeshStandardMaterial({ map: rollDoor(a), metalness: .5, roughness: .45 });
  R.trailer = new THREE.MeshStandardMaterial({ map: trailerRear(), roughness: .5 });
  R.trailerSide = new THREE.MeshStandardMaterial({ color: 0xe8eaec, roughness: .5 });
  R.bumper = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: .8 });
  R.dockLight = new THREE.MeshStandardMaterial({ color: 0x222, emissive: 0xffd28a, emissiveIntensity: 2.5 });
  R.copperBar = new THREE.MeshStandardMaterial({ color: 0xc27a3a, metalness: 1, roughness: .3 });
}

export function moreRoomObstacles(A, R) {
  const kit = {};
  // NOC: operator desk with three monitors (dodge)
  {
    const g = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.4, .05, .75), R.desk); top.position.y = .74; g.add(top);
    for (const x of [-.65, .65]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(.05, .72, .65), R.darkSteel || R.bezel); leg.position.set(x, .37, 0); g.add(leg); }
    [-.44, 0, .44].forEach((x, i) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(.42, .27, .03), [R.bezel, R.bezel, R.bezel, R.bezel, R.monitor[i], R.bezel]); m.position.set(x, 1.05, -.18); m.rotation.y = -x * .4; g.add(m);
      const st = new THREE.Mesh(new THREE.BoxGeometry(.04, .2, .04), R.bezel); st.position.set(x, .86, -.2); g.add(st);
    });
    kit.desk = shadow(g);
  }
  // NOC: rolling video kiosk (dodge)
  {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(.8, .08, .6), R.bezel); base.position.y = .1; g.add(base);
    const pole = new THREE.Mesh(new THREE.BoxGeometry(.1, 1.3, .1), R.bezel); pole.position.y = .8; g.add(pole);
    const scr = new THREE.Mesh(new THREE.BoxGeometry(1.2, .72, .06), [R.bezel, R.bezel, R.bezel, R.bezel, R.dash[1], R.bezel]); scr.position.y = 1.55; g.add(scr);
    kit.kiosk = shadow(g);
  }
  // NOC: a row of hanging monitors across the aisle (slide)
  {
    const g = new THREE.Group(), y = 1.35;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(7.4, .08, .08), R.bezel); bar.position.y = y + .45; g.add(bar);
    for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(1.05, .55, .05), [R.bezel, R.bezel, R.bezel, R.bezel, R.dash[i % 3], R.bezel]); m.position.set(-3.05 + i * 1.22, y + .12, 0); g.add(m); }
    for (const x of [-3.2, 3.2]) { const rod = new THREE.Mesh(new THREE.CylinderGeometry(.015, .015, 3, 6), R.steel); rod.position.set(x, y + 2, 0); g.add(rod); }
    kit.screens = shadow(g);
  }
  // roof: condensing unit with a fan on top (dodge)
  {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 1.0), [R.coil, R.coil, R.chillerBody, R.chillerBody, R.coil, R.coil]); body.position.y = .58; g.add(body);
    const fan = new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, .02, 24), R.fanPlate); fan.position.y = 1.09; g.add(fan);
    const rotor = new THREE.Mesh(R.fanRotor, R.rotor); rotor.rotation.x = -Math.PI / 2; rotor.scale.setScalar(.65); rotor.position.y = 1.06; g.add(rotor);
    for (const x of [-.5, .5]) { const r = new THREE.Mesh(new THREE.BoxGeometry(.1, .08, 1.0), R.darkSteel); r.position.set(x, .04, 0); g.add(r); }
    kit.condenser = shadow(g);
  }
  // roof: chilled-water pipe bridge across the aisle (slide)
  {
    const g = new THREE.Group(), y = 1.3;
    for (const [z, rr, m] of [[-.22, .16, R.bluePipe], [.22, .16, R.insulated]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, 9, 20), m); p.rotation.z = Math.PI / 2; p.position.set(0, y, z); g.add(p); }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(9, .12, .7), R.darkSteel); beam.position.y = y - .22; g.add(beam);
    for (const x of [-4, 4]) { const post = new THREE.Mesh(new THREE.BoxGeometry(.18, y, .18), R.darkSteel); post.position.set(x, y / 2, 0); g.add(post); }
    const tape = new THREE.Mesh(new THREE.BoxGeometry(8, .07, .01), A.hazard); tape.position.set(0, y - .28, .36); g.add(tape);
    kit.pipebridge = shadow(g);
  }
  // battery room: heavy DC cables across the floor (jump, stumble)
  {
    const g = new THREE.Group();
    [[R.cableRed, -.1], [R.cableBlack, .1], [R.cableRed, .26]].forEach(([m, z], i) => {
      const pts = []; for (let k = 0; k <= 12; k++) pts.push(new THREE.Vector3(-3.6 + k * .6, .06 + Math.abs(Math.sin(k * 1.1 + i)) * .07, z + Math.sin(k * .8 + i) * .08));
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 36, .05, 8), m));
    });
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(7.2, .05, .6), A.hazard); ramp.position.y = .025; g.add(ramp);
    kit.batcables = shadow(g);
  }
  // battery room: copper busbar run across the aisle (slide)
  {
    const g = new THREE.Group(), y = 1.3;
    for (const z of [-.12, 0, .12]) { const b = new THREE.Mesh(new THREE.BoxGeometry(7.6, .12, .04), R.copperBar); b.position.set(0, y + .1, z); g.add(b); }
    const tray = new THREE.Mesh(new THREE.BoxGeometry(7.6, .04, .45), R.batRack); tray.position.y = y - .02; g.add(tray);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(.5, .5), R.warnBat); sign.position.set(0, y - .3, .24); g.add(sign);
    for (const x of [-3, 3]) { const rod = new THREE.Mesh(new THREE.CylinderGeometry(.015, .015, 3, 6), R.steel); rod.position.set(x, y + 1.6, 0); g.add(rod); }
    kit.busbar = shadow(g);
  }
  // battery room: cart with replacement batteries (dodge)
  {
    const g = new THREE.Group();
    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.0, .06, .7), R.batRack); deck.position.y = .22; g.add(deck);
    for (const x of [-.42, .42]) for (const z of [-.28, .28]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, .05, 12), R.bumper); w.rotation.z = Math.PI / 2; w.position.set(x, .08, z); g.add(w); }
    for (let i = 0; i < 2; i++) for (let k = 0; k < 2; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(.44, .3, .32), [R.batBody, R.batBody, R.batBody, R.batBody, R.batFace, R.batBody]); b.position.set(-.23 + i * .46, .4 + k * .31, 0); g.add(b); }
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, .7, 8), R.steel); handle.rotation.x = Math.PI / 2; handle.position.set(0, .95, .45); handle.rotation.z = Math.PI / 2; g.add(handle);
    kit.batcart = shadow(g);
  }
  // battery room: yellow acid spill kit bin (dodge)
  {
    const g = new THREE.Group();
    const bin = new THREE.Mesh(new THREE.CylinderGeometry(.38, .33, 1.0, 20), R.yellowPaint); bin.position.y = .5; g.add(bin);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(.41, .41, .08, 20), R.yellowPaint); lid.position.y = 1.03; g.add(lid);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(.4, .4), R.warnBat); sign.position.set(0, .55, .37); g.add(sign);
    kit.spillkit = shadow(g);
  }
  // dock: dock-leveller lip sticking up (jump, stumble)
  {
    const g = new THREE.Group();
    const plate = new THREE.Mesh(new THREE.BoxGeometry(7.2, .12, .8), R.darkSteel || R.bezel); plate.position.y = .06; plate.rotation.x = .12; g.add(plate);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(7.2, .05, .2), A.hazard); lip.position.set(0, .14, -.38); g.add(lip);
    kit.dockplate = shadow(g);
  }
  // dock: overhead roller conveyor crossing the aisle (slide)
  {
    const g = new THREE.Group(), y = 1.35;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(9, .14, .8), R.darkSteel || R.bezel); frame.position.y = y; g.add(frame);
    const rollers = []; for (let x = -4.3; x <= 4.3; x += .25) rollers.push(new THREE.CylinderGeometry(.04, .04, .74, 8).rotateX(Math.PI / 2).translate(x, y + .1, 0));
    g.add(new THREE.Mesh(mergeGeometries(rollers), R.steel));
    for (let i = 0; i < 3; i++) { const box = new THREE.Mesh(new THREE.BoxGeometry(.55, .4, .5), new THREE.MeshStandardMaterial({ color: 0xa47d52, roughness: .9 })); box.position.set(-2.5 + i * 2.3, y + .34, 0); g.add(box); }
    for (const x of [-4.3, 4.3]) { const post = new THREE.Mesh(new THREE.BoxGeometry(.15, y, .15), R.yellowPaint); post.position.set(x, y / 2, 0); g.add(post); }
    const tape = new THREE.Mesh(new THREE.BoxGeometry(8.6, .07, .01), A.hazard); tape.position.set(0, y - .1, .41); g.add(tape);
    kit.conveyor = shadow(g);
  }
  return kit;
}

/* ------------------------------------------------------------------ */
/* Builders                                                             */
/* ------------------------------------------------------------------ */
export function buildMoreRoom(kind, ctx) {
  if (kind === 'noc') return buildNoc(ctx);
  if (kind === 'roof') return buildRoof(ctx);
  if (kind === 'battery') return buildBattery(ctx);
  if (kind === 'dock') return buildDock(ctx);
}

// lights: emissive fixtures + entries for the pooled real lights
function lights(ctx, y, color, intensity, xs = [-1.6, 1.6], step = STEP * 1.5, geo) {
  const list = [];
  for (let u = ctx.u0 + 3; u < ctx.uEnd; u += step) {
    for (const x of xs) list.push(mat4(x, y, -u));
    ctx.seg.fixtures.push({ u, color, intensity, y: y - .3 });
  }
  instanced(ctx, geo || new THREE.BoxGeometry(.18, .04, 1.4), ctx.A.fixtureMat(color), list);
}

/* ---------- NOC control room: video wall on one side, operator tiers on the other ---------- */
function buildNoc(ctx) {
  const { R, HALF, u0, uEnd } = ctx;
  const H = 4.2;
  const [la, lb] = sideRange(ctx, ctx.left, .6), [ra, rb] = sideRange(ctx, ctx.right, 3.2);
  // left: the video wall, 2 rows of LCD tiles in three dashboard variants
  sideWall(ctx, R.wallDark, -1, la, lb, -(HALF + .35), H);
  const tiles = [[], [], []];
  const tileGeo = new THREE.BoxGeometry(.06, 1.08, 1.9);
  let k = 0;
  for (let u = la + 1.2; u + 1 < lb; u += 1.95) for (const y of [1.45, 2.56]) tiles[(k++ + (y > 2 ? 1 : 0)) % 3].push(mat4(-(HALF + .28), y, -u));
  tiles.forEach((list, v) => instanced(ctx, tileGeo, [R.dash[v], R.bezel, R.bezel, R.bezel, R.bezel, R.bezel], list));   // +x face looks into the aisle
  runAlong(ctx, boxZ(.3, .12), R.bezel, -(HALF + .2), .95, la, lb);
  runAlong(ctx, boxZ(.3, .12), R.bezel, -(HALF + .2), 3.15, la, lb);
  // right: three stepped tiers of operator desks with monitors
  const desks = [], screens = [[], [], []], bezels = [], risers = [];
  for (let tier = 0; tier < 3; tier++) {
    const x = HALF + .6 + tier * 1.0, y = tier * .25;
    risers.push(mat4(x, y / 2, -(ra + rb) / 2, 0, new THREE.Vector3(1, Math.max(.001, y), rb - ra)));
    for (let u = ra + 1; u + 1 < rb; u += 1.6) {
      desks.push(mat4(x, y + .74, -u));
      for (let i = 0; i < 2; i++) { const m = mat4(x + .12, y + 1.05, -u + (i - .5) * .5, -Math.PI / 2); screens[((tier + i + Math.round(u)) % 3 + 3) % 3].push(m); bezels.push(m); }
    }
  }
  instanced(ctx, new THREE.BoxGeometry(.8, .05, 1.5), R.desk, desks);
  instanced(ctx, new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0), R.wallDark, risers);
  screens.forEach((list, v) => instanced(ctx, new THREE.PlaneGeometry(.46, .27), R.monitor[v], list));
  instanced(ctx, new THREE.BoxGeometry(.5, .31, .03).translate(0, 0, -.02), R.bezel, bezels);
  sideWall(ctx, R.wallDark, 1, ra, rb, HALF + 3.4, H);
  endWall(ctx, R.wallDark, ctx.left ? -HALF : -HALF - .8, ctx.right ? HALF : HALF + 3.6, uEnd + .01, H);
  ceiling(ctx, R.wallDark, H, u0, uEnd + 1, ctx.AISLE + 8, 4);
  lights(ctx, H - .05, 0x9fc4ff, .8, [-1.2, 1.2], STEP * 2, new THREE.CylinderGeometry(.16, .16, .03, 16));
  // blue glow strip under the video wall
  runAlong(ctx, boxZ(.04, .02), new THREE.MeshStandardMaterial({ color: 0, emissive: 0x2a8cff, emissiveIntensity: 3 }), -(HALF - .05), .01, la, lb);
}

/* ---------- Rooftop chiller yard at night ---------- */
function buildRoof(ctx) {
  const { R, HALF, u0, uEnd, seg } = ctx;
  const sides = [[-1, ...sideRange(ctx, ctx.left, 6)], [1, ...sideRange(ctx, ctx.right, 6)]];
  const units = [], fans = [], rotors = [];
  const body = new THREE.BoxGeometry(2.4, 2.3, 4.6); body.translate(0, 1.35, 0);
  for (const [side, a, b] of sides) {
    for (let u = a + 3; u + 2.4 < b; u += 5.2) {
      units.push(mat4(side * (HALF + 1.7), 0, -u));
      for (const dz of [-1.15, 0, 1.15]) { fans.push(mat4(side * (HALF + 1.7), 2.52, -u + dz)); P.set(side * (HALF + 1.7), 2.48, -u + dz); Q.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)); rotors.push(M4.compose(P, Q, new THREE.Vector3(.8, .8, .8)).clone()); }
    }
    // low parapet + rails + the city behind
    sideWall(ctx, R.parapet, side, a, b, side * (HALF + 3.6), 1.1, 2.4, 1.1);
    runAlong(ctx, tubeZ(.03), R.steel, side * (HALF + 3.55), 1.25, a, b);
    const sky = planeAlong(ctx.own, R.skyline, b - a + 40, 26, Math.max(1, (b - a + 40) / 60), 1);
    sky.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2; sky.position.set(side * (HALF + 45), 7, -(a + b) / 2); ctx.g.add(sky);
    // chilled-water pipes on sleepers along the edge
    runAlong(ctx, tubeZ(.2), R.bluePipe, side * (HALF + .25), .35, a, b);
    runAlong(ctx, tubeZ(.2), R.insulated, side * (HALF + .7), .35, a, b);
  }
  instanced(ctx, body, [R.coil, R.coil, R.chillerBody, R.chillerBody, R.chillerBody, R.chillerBody], units);
  instanced(ctx, new THREE.CylinderGeometry(.5, .5, .04, 24), R.fanPlate, fans);
  const rm = instanced(ctx, R.fanRotor, R.rotor, rotors); if (rm) rm.castShadow = false;
  // cooling towers looming beyond the yard
  const towers = [];
  for (let u = u0 + 10; u < uEnd; u += 26) for (const side of [-1, 1]) towers.push(mat4(side * (HALF + 12 + (u % 7)), 0, -u, 0, new THREE.Vector3(1, .8 + (u % 5) * .1, 1)));
  instanced(ctx, new THREE.CylinderGeometry(3, 4, 9, 20, 1, true).translate(0, 4.5, 0), R.parapet, towers);
  // floodlights on poles
  const poles = [], heads = [];
  for (let u = u0 + 4; u < uEnd; u += 14) {
    for (const x of [-(HALF + .4), HALF + .4]) { poles.push(mat4(x, 3.2, -u)); heads.push(mat4(x * .92, 6.3, -u)); }
    seg.fixtures.push({ u, color: 0xdfe8ff, intensity: 1.6, y: 5.6 });
  }
  instanced(ctx, new THREE.CylinderGeometry(.08, .1, 6.4, 8), R.darkSteel, poles);
  instanced(ctx, new THREE.BoxGeometry(.5, .2, .35), ctx.A.fixtureMat(0xdfe8ff), heads);
  endWall(ctx, R.parapet, ctx.left ? -HALF : -HALF - 6, ctx.right ? HALF : HALF + 6, uEnd + .01, 1.1, 2.4, 1.1);
  // puddles catching the floodlights
  const puddles = [];
  const r = ctx.r;
  for (let u = u0 + 6; u < uEnd; u += 7 + r() * 6) puddles.push(mat4((r() - .5) * 5, .006, -u, r() * 3, new THREE.Vector3(1 + r(), 1, .6 + r() * .6)));
  instanced(ctx, new THREE.CircleGeometry(.7, 20).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a4656, roughness: .04, metalness: .35, envMapIntensity: 2.5, transparent: true, opacity: .55, depthWrite: false }), puddles);
}

/* ---------- UPS battery room ---------- */
function buildBattery(ctx) {
  const { R, HALF, u0, uEnd } = ctx;
  const H = 3.8;
  const sides = [[-1, ...sideRange(ctx, ctx.left, 2)], [1, ...sideRange(ctx, ctx.right, 2)]];
  const blocks = [], frames = [], shelves = [], leds = [];
  for (const [side, a, b] of sides) {
    const x = side * (HALF + .45);
    for (let u = a + .5; u + .5 < b; u += .5) for (let tier = 0; tier < 4; tier++) blocks.push(mat4(x, .32 + tier * .52, -u, side < 0 ? Math.PI / 2 : -Math.PI / 2));
    for (let u = a; u < b; u += 2) frames.push(mat4(x, 1.1, -u));
    for (let tier = 0; tier < 4; tier++) runAlong(ctx, boxZ(.62, .03), R.batRack, x, .15 + tier * .52, a, b);
    // red / black DC cable runs along the top and a status LED bar
    runAlong(ctx, tubeZ(.045), R.cableRed, x - side * .18, 2.32, a, b);
    runAlong(ctx, tubeZ(.045), R.cableBlack, x - side * .05, 2.32, a, b);
    for (let u = a + 3; u < b; u += 6) leds.push(mat4(x - side * .32, 2.12, -u));
    sideWall(ctx, R.plaster, side, a, b, side * (HALF + 1.1), H);
    // warning signs and eyewash stations on the end of each run
    for (let u = a + 8; u < b; u += 16) {
      const s = ctx.own(new THREE.Mesh(new THREE.PlaneGeometry(.5, .5), R.warnBat)); s.position.set(side * (HALF + 1.08), 2.7, -u); s.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2; ctx.g.add(s);
      const e = ctx.own(new THREE.Mesh(new THREE.BoxGeometry(.06, .5, .4), R.eyewash)); e.position.set(side * (HALF + 1.06), 1.6, -u - 1.2); ctx.g.add(e);
    }
  }
  instanced(ctx, new THREE.BoxGeometry(.48, .4, .52), [R.batBody, R.batBody, R.batBody, R.batBody, R.batFace, R.batBody], blocks);
  instanced(ctx, new THREE.BoxGeometry(.66, 2.2, .06), R.batRack, frames);
  instanced(ctx, new THREE.BoxGeometry(.03, .08, .6), new THREE.MeshStandardMaterial({ color: 0, emissive: 0x36e06a, emissiveIntensity: 3 }), leds);
  endWall(ctx, R.plaster, ctx.left ? -HALF : -HALF - 2, ctx.right ? HALF : HALF + 2, uEnd + .01, H);
  ceiling(ctx, R.board, H, u0, uEnd + 2, ctx.AISLE + 4, 1.2);
  lights(ctx, H - .05, 0xeaf6ff, 1.1);
  // yellow walkway lines
  for (const x of [-HALF + .15, HALF - .15]) runAlong(ctx, boxZ(.1, .006), R.yellowPaint, x, .003, u0, uEnd);
}

/* ---------- Loading dock ---------- */
function buildDock(ctx) {
  const { R, HALF, u0, uEnd, seg } = ctx;
  const H = 7.5;
  const [la, lb] = sideRange(ctx, ctx.left, 1), [ra, rb] = sideRange(ctx, ctx.right, 6);
  // left: dock doors, alternate ones with a trailer backed in
  const doors = [], rolled = [], trailers = [], bumpers = [], lamps = [];
  let i = 0, wallFrom = la;
  for (let u = la + 3; u + 2 < lb; u += 5, i++) {
    // wall up to the doorway, a header over it
    sideWall(ctx, R.concrete, -1, wallFrom, u - 1.4, -(HALF + .6), H, 3, 3);
    const hd = ctx.own(new THREE.Mesh(new THREE.PlaneGeometry(2.8, H - 3.2), R.concrete)); hd.rotation.y = Math.PI / 2; hd.position.set(-(HALF + .6), 3.2 + (H - 3.2) / 2, -u); ctx.g.add(hd);
    wallFrom = u + 1.4;
    if (i % 3 !== 2) { trailers.push(mat4(-(HALF + .6 + 6.25), 1.45, -u)); rolled.push(mat4(-(HALF + .5), 3.05, -u)); }
    else doors.push(mat4(-(HALF + .55), 1.6, -u));
    for (const dz of [-1.4, 1.4]) bumpers.push(mat4(-(HALF + .45), .7, -u + dz));
    lamps.push(mat4(-(HALF + .35), 2.9, -u - 1.6));
  }
  sideWall(ctx, R.concrete, -1, wallFrom, lb, -(HALF + .6), H, 3, 3);
  instanced(ctx, new THREE.BoxGeometry(.06, 3.2, 2.6), R.rollDoor, doors);
  instanced(ctx, new THREE.CylinderGeometry(.22, .22, 2.7, 14).rotateX(Math.PI / 2), R.rollDoor, rolled);
  // the dark inside of the dock pit / trailer floor edge
  const pit = []; for (const m of trailers) pit.push(m);
  // the visible rear of the trailer fills the open doorway
  instanced(ctx, new THREE.BoxGeometry(12, 2.7, 2.5), [R.trailer, R.trailerSide, R.trailerSide, R.trailerSide, R.trailerSide, R.trailerSide], trailers);
  instanced(ctx, new THREE.BoxGeometry(.2, .5, .25), R.bumper, bumpers);
  instanced(ctx, new THREE.CylinderGeometry(.12, .12, .2, 12).rotateZ(Math.PI / 2), R.dockLight, lamps);
  // right: staging lanes with wrapped pallets
  const pallets = [], loads = [], cols = [];
  const r = ctx.r;
  for (let u = ra + 1.5; u + 1 < rb; u += 1.6) for (const x of [HALF + 1.2, HALF + 2.6, HALF + 4]) {
    if (r() < .2) continue;
    pallets.push(mat4(x, 0, -u));
    const h = .6 + r() * .9; loads.push(mat4(x, .14 + h / 2, -u, (r() - .5) * .1, new THREE.Vector3(1.1, h, .95)));
    cols.push(new THREE.Color().setHSL(.08 + r() * .05, .35, .45 + r() * .2));
  }
  instanced(ctx, R.palletLowGeo || R.palletGeo, R.wood, pallets);
  const li = instanced(ctx, new THREE.BoxGeometry(1, 1, 1), R.load, loads);
  if (li) { cols.forEach((c, k) => li.setColorAt(k, c)); li.instanceColor.needsUpdate = true; }
  sideWall(ctx, R.concrete, 1, ra, rb, HALF + 5.8, H, 3, 3);
  endWall(ctx, R.concrete, ctx.left ? -HALF : -HALF - 1, ctx.right ? HALF : HALF + 6, uEnd + .01, H, 3, 3);
  ceiling(ctx, R.darkSteel, H, u0, uEnd + 2, ctx.AISLE + 14, 4);
  // yellow lane lines + high-bay lights
  for (const x of [-HALF + .15, HALF - .15]) runAlong(ctx, boxZ(.12, .006), R.yellowPaint, x, .003, u0, uEnd);
  const bays = [];
  for (let u = u0 + 4; u < uEnd; u += 7) { for (const x of [-1.8, 1.8]) bays.push(mat4(x, H - .6, -u)); seg.fixtures.push({ u, color: 0xffe6c4, intensity: 3, y: H - 1 }); }
  instanced(ctx, new THREE.CylinderGeometry(.35, .22, .4, 18), R.darkSteel, bays);
  instanced(ctx, new THREE.CylinderGeometry(.22, .22, .02, 18).translate(0, -.21, 0), ctx.A.fixtureMat(0xffe6c4), bays);
}
