// Non-rack rooms: the support wing gallery (from the site photos), the yellow
// generator hall and the fan-wall air plenum. Each builder works in the
// segment's local frame (forward = -Z, right = +X, aisle x in [-HALF, HALF]).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { canvas, tex, heightToNormal, noise, rand } from './textures.js';

const STEP = 3.6;

/* ------------------------------------------------------------------ */
/* Textures                                                             */
/* ------------------------------------------------------------------ */
function stoneTiles(aniso) {
  // 60x60 grey porcelain pavers like the gallery floor
  const S = 512, T = 256, r = rand(41), [c, g] = canvas(S, S), [hc, h] = canvas(S, S), [rc, rg] = canvas(S, S);
  h.fillStyle = '#9a9a9a'; h.fillRect(0, 0, S, S); rg.fillStyle = '#b8b8b8'; rg.fillRect(0, 0, S, S);
  for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
    const b = 118 + r() * 14 | 0;
    g.fillStyle = `rgb(${b},${b + 2},${b + 5})`; g.fillRect(tx * T, ty * T, T, T);
    for (let i = 0; i < 2200; i++) { const v = b + (r() - .5) * 34 | 0; g.fillStyle = `rgba(${v},${v},${v + 3},.5)`; g.fillRect(tx * T + r() * T, ty * T + r() * T, 1.4, 1.4); }
    // water marks / scuffs
    for (let i = 0; i < 3; i++) { g.fillStyle = `rgba(70,72,76,${.05 + r() * .06})`; g.beginPath(); g.arc(tx * T + r() * T, ty * T + r() * T, 6 + r() * 14, 0, 7); g.fill(); }
  }
  g.strokeStyle = '#55585c'; g.lineWidth = 3; h.strokeStyle = '#333'; h.lineWidth = 4;
  for (let i = 0; i <= S; i += T) { for (const x of [g, h]) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, S); x.moveTo(0, i); x.lineTo(S, i); x.stroke(); } }
  noise(rg, S, S, r, 5000, .15);
  return { map: tex(c, { repeat: true, aniso }), normalMap: tex(heightToNormal(hc, 1.5), { srgb: false, repeat: true, aniso }), roughnessMap: tex(rc, { srgb: false, repeat: true, aniso }) };
}

function plaster(aniso) {
  const S = 512, r = rand(5), [c, g] = canvas(S, S), [hc, h] = canvas(S, S);
  g.fillStyle = '#e6e5e0'; g.fillRect(0, 0, S, S); h.fillStyle = '#808080'; h.fillRect(0, 0, S, S);
  for (let i = 0; i < 26000; i++) {
    const x = r() * S, y = r() * S, v = r();
    g.fillStyle = `rgba(${v < .5 ? 190 : 250},${v < .5 ? 189 : 250},${v < .5 ? 184 : 246},.35)`; g.fillRect(x, y, 2, 2);
    h.fillStyle = v < .5 ? 'rgba(0,0,0,.35)' : 'rgba(255,255,255,.35)'; h.fillRect(x, y, 2.5, 2.5);
  }
  return { map: tex(c, { repeat: true, aniso }), normalMap: tex(heightToNormal(hc, 1.2), { srgb: false, repeat: true, aniso }) };
}

function concrete(aniso, w = 256, hgt = 1024, holes = true, seed = 9) {
  // fair-faced concrete with formwork tie holes
  const r = rand(seed), [c, g] = canvas(w, hgt), [hc, h] = canvas(w, hgt);
  g.fillStyle = '#b8b5ae'; g.fillRect(0, 0, w, hgt); h.fillStyle = '#808080'; h.fillRect(0, 0, w, hgt);
  for (let i = 0; i < 60; i++) { const v = 150 + r() * 70 | 0; g.fillStyle = `rgba(${v},${v - 2},${v - 6},.12)`; g.beginPath(); g.ellipse(r() * w, r() * hgt, 20 + r() * 70, 20 + r() * 120, r() * 3, 0, 7); g.fill(); }
  for (let i = 0; i < 9000; i++) { const v = 120 + r() * 120 | 0; g.fillStyle = `rgba(${v},${v},${v - 4},.25)`; g.fillRect(r() * w, r() * hgt, 1.5, 1.5); }
  for (let i = 0; i < 260; i++) { const x = r() * w, y = r() * hgt; g.fillStyle = 'rgba(60,60,60,.5)'; g.fillRect(x, y, 2, 2); h.fillStyle = '#202020'; h.fillRect(x, y, 2, 2); }
  // vertical water streaks
  for (let i = 0; i < 6; i++) { const x = r() * w; const grd = g.createLinearGradient(0, 0, 0, hgt); grd.addColorStop(0, 'rgba(90,90,85,0)'); grd.addColorStop(.5, 'rgba(90,90,85,.12)'); grd.addColorStop(1, 'rgba(90,90,85,0)'); g.fillStyle = grd; g.fillRect(x, 0, 3 + r() * 6, hgt); }
  if (holes) for (let y = hgt * .08; y < hgt; y += hgt / 7) {
    const x = w * .5 + (r() - .5) * 8;
    g.fillStyle = '#7a7873'; g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill();
    g.fillStyle = '#3c3b38'; g.beginPath(); g.arc(x, y, 4.5, 0, 7); g.fill();
    h.fillStyle = '#000'; h.beginPath(); h.arc(x, y, 6, 0, 7); h.fill();
  }
  return { map: tex(c, { repeat: true, aniso }), normalMap: tex(heightToNormal(hc, 1.6), { srgb: false, repeat: true, aniso }) };
}

function boardCeiling(aniso) {
  const S = 512, r = rand(77), [c, g] = canvas(S, S);
  g.fillStyle = '#8d8b86'; g.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 64) { const v = 120 + r() * 30 | 0; g.fillStyle = `rgba(${v},${v},${v - 4},.35)`; g.fillRect(0, y, S, 60); g.fillStyle = 'rgba(60,60,58,.35)'; g.fillRect(0, y + 61, S, 3); }
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(70,68,62,${.05 + r() * .08})`; g.beginPath(); g.ellipse(r() * S, r() * S, 20 + r() * 60, 10 + r() * 30, 0, 0, 7); g.fill(); }
  noise(g, S, S, r, 8000, .08);
  return tex(c, { repeat: true, aniso });
}

function grate(aniso) {
  const [c, g] = canvas(64, 256);
  g.fillStyle = '#7f8388'; g.fillRect(0, 0, 64, 256);
  for (let y = 4; y < 256; y += 10) { g.fillStyle = '#1c1d1f'; g.fillRect(8, y, 48, 6); }
  g.fillStyle = '#5b5f64'; g.fillRect(0, 0, 4, 256); g.fillRect(60, 0, 4, 256);
  return tex(c, { repeat: true, aniso });
}

function grass(aniso) {
  const S = 256, r = rand(3), [c, g] = canvas(S, S);
  g.fillStyle = '#2f5b2a'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 9000; i++) { const v = r(); g.strokeStyle = `rgba(${60 + v * 60 | 0},${110 + v * 70 | 0},${50 + v * 30 | 0},.7)`; g.lineWidth = 1; const x = r() * S, y = r() * S; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - .5) * 3, y - 3 - r() * 4); g.stroke(); }
  return tex(c, { repeat: true, aniso });
}

function signNoSmoking() {
  const [c, g] = canvas(256, 512);
  g.fillStyle = '#fbfbf7'; g.fillRect(0, 0, 256, 512);
  g.strokeStyle = '#c0392b'; g.lineWidth = 5; g.strokeRect(6, 6, 244, 500);
  // warning triangle
  g.fillStyle = '#c0392b'; g.font = 'bold 22px Heebo, Arial'; g.textAlign = 'center'; g.fillText('זהירות!', 128, 40); g.font = 'bold 17px Heebo, Arial'; g.fillText('סכנת נפילה מגובה', 128, 62);
  g.fillStyle = '#f5c400'; g.beginPath(); g.moveTo(128, 80); g.lineTo(206, 210); g.lineTo(50, 210); g.closePath(); g.fill();
  g.strokeStyle = '#111'; g.lineWidth = 6; g.stroke();
  g.fillStyle = '#111'; g.beginPath(); g.arc(122, 150, 9, 0, 7); g.fill(); g.fillRect(118, 160, 8, 30); g.fillRect(126, 175, 26, 6);
  g.fillStyle = '#c0392b'; g.font = 'bold 18px Arial'; g.fillText('BEWARE', 128, 236); g.fillText('OF FALLING DOWN', 128, 258);
  g.fillStyle = '#111'; g.fillRect(14, 272, 228, 3);
  g.font = 'bold 36px Heebo, Arial'; g.fillText('אסור לעשן', 128, 316);
  g.strokeStyle = '#c0392b'; g.lineWidth = 12; g.beginPath(); g.arc(128, 395, 58, 0, 7); g.stroke();
  g.fillStyle = '#222'; g.fillRect(84, 388, 80, 14); g.fillStyle = '#e8e0d0'; g.fillRect(164, 388, 10, 14);
  g.beginPath(); g.moveTo(87, 353); g.lineTo(169, 437); g.stroke();
  g.fillStyle = '#c0392b'; g.font = 'bold 20px Arial'; g.fillText('NO SMOKING', 128, 482);
  return tex(c, { aniso: 4 });
}

function gensetFront(aniso) {
  // the long side of a containerised diesel generator: louvred doors, panel, labels
  const W = 1024, H = 576, r = rand(13), [c, g] = canvas(W, H), [ec, e] = canvas(W, H), [hc, h] = canvas(W, H);
  g.fillStyle = '#f0b400'; g.fillRect(0, 0, W, H); e.fillStyle = '#000'; e.fillRect(0, 0, W, H); h.fillStyle = '#909090'; h.fillRect(0, 0, W, H);
  for (let i = 0; i < 8000; i++) { const v = r(); g.fillStyle = `rgba(${v < .5 ? 200 : 255},${v < .5 ? 140 : 200},0,.12)`; g.fillRect(r() * W, r() * H, 2, 2); }
  const doors = 4, dw = W / doors;
  for (let d = 0; d < doors; d++) {
    const x = d * dw;
    g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(x, 0, 3, H); h.fillStyle = '#303030'; h.fillRect(x, 0, 4, H);
    if (d === 1) {
      // control panel window with the genset controller
      g.fillStyle = '#2a2a2a'; g.fillRect(x + 50, 120, dw - 100, 170);
      g.fillStyle = '#0c1a14'; g.fillRect(x + 70, 140, 120, 70);
      e.fillStyle = 'rgb(70,230,150)'; e.fillRect(x + 74, 144, 112, 62);
      g.fillStyle = 'rgb(70,230,150)'; g.fillRect(x + 74, 144, 112, 62);
      g.fillStyle = '#0a3320'; e.fillStyle = '#0a3320'; g.font = e.font = 'bold 17px monospace';
      g.fillText('AUTO  1500rpm', x + 80, 168); e.fillText('AUTO  1500rpm', x + 80, 168); g.fillText('400V  50.0Hz', x + 80, 192); e.fillText('400V  50.0Hz', x + 80, 192);
      for (let i = 0; i < 4; i++) { const col = ['rgb(60,255,120)', 'rgb(255,180,40)', 'rgb(60,255,120)', 'rgb(255,60,40)'][i]; g.fillStyle = e.fillStyle = col; g.beginPath(); g.arc(x + 70 + i * 30, 245, 7, 0, 7); g.fill(); e.beginPath(); e.arc(x + 70 + i * 30, 245, 8, 0, 7); e.fill(); }
      g.fillStyle = '#c0392b'; g.beginPath(); g.arc(x + dw - 90, 235, 22, 0, 7); g.fill(); // emergency stop
      g.fillStyle = '#f5d200'; g.beginPath(); g.arc(x + dw - 90, 235, 30, 0, 7); g.lineWidth = 6; g.strokeStyle = '#f5d200'; g.stroke();
    } else {
      // louvres
      for (let y = 60; y < H - 80; y += 18) {
        g.fillStyle = 'rgba(40,30,0,.55)'; g.fillRect(x + 40, y, dw - 80, 9);
        g.fillStyle = 'rgba(255,230,140,.5)'; g.fillRect(x + 40, y + 9, dw - 80, 2);
        h.fillStyle = '#202020'; h.fillRect(x + 40, y, dw - 80, 9); h.fillStyle = '#e0e0e0'; h.fillRect(x + 40, y + 9, dw - 80, 3);
      }
    }
    // handle + hinges
    g.fillStyle = '#333'; g.fillRect(x + dw - 30, H * .45, 10, 60); h.fillStyle = '#fff'; h.fillRect(x + dw - 30, H * .45, 10, 60);
  }
  // hazard labels
  g.fillStyle = '#111'; g.beginPath(); g.moveTo(W * .66, H - 70); g.lineTo(W * .66 + 34, H - 12); g.lineTo(W * .66 - 34, H - 12); g.fill();
  g.fillStyle = '#f5d200'; g.font = 'bold 34px Arial'; g.textAlign = 'center'; g.fillText('⚡', W * .66, H - 22);
  g.fillStyle = '#111'; g.font = 'bold 26px Arial'; g.fillText('DANGER — HIGH VOLTAGE', W * .84, H - 30);
  g.fillText('GEN-0' + (1 + (r() * 8 | 0)), W * .12, 40);
  return { map: tex(c, { aniso }), emissiveMap: tex(ec, { aniso }), normalMap: tex(heightToNormal(hc, 2), { srgb: false, aniso }) };
}

function blockWall(aniso) {
  const W = 512, H = 512, r = rand(19), [c, g] = canvas(W, H), [hc, h] = canvas(W, H);
  g.fillStyle = '#b7b4aa'; g.fillRect(0, 0, W, H); h.fillStyle = '#a0a0a0'; h.fillRect(0, 0, W, H);
  const bw = 128, bh = 64;
  for (let y = 0; y < H; y += bh) for (let x = (y / bh) % 2 ? -bw / 2 : 0; x < W; x += bw) {
    const v = 170 + r() * 20 | 0; g.fillStyle = `rgb(${v},${v - 2},${v - 8})`; g.fillRect(x + 2, y + 2, bw - 4, bh - 4);
  }
  g.strokeStyle = '#8d8a82'; h.strokeStyle = '#404040'; g.lineWidth = h.lineWidth = 4;
  for (let y = 0; y <= H; y += bh) { for (const x of [g, h]) { x.beginPath(); x.moveTo(0, y); x.lineTo(W, y); x.stroke(); } for (let x = (y / bh) % 2 ? -bw / 2 : 0; x < W; x += bw) for (const k of [g, h]) { k.beginPath(); k.moveTo(x, y); k.lineTo(x, y + bh); k.stroke(); } }
  noise(g, W, H, r, 9000, .1);
  // yellow dado stripe
  return { map: tex(c, { repeat: true, aniso }), normalMap: tex(heightToNormal(hc, 1.4), { srgb: false, repeat: true, aniso }) };
}

function epoxy(aniso) {
  const S = 512, r = rand(23), [c, g] = canvas(S, S), [rc, rg] = canvas(S, S);
  g.fillStyle = '#6f746f'; g.fillRect(0, 0, S, S); rg.fillStyle = '#5a5a5a'; rg.fillRect(0, 0, S, S);
  for (let i = 0; i < 50; i++) { g.fillStyle = `rgba(40,40,36,${.03 + r() * .06})`; g.beginPath(); g.ellipse(r() * S, r() * S, 10 + r() * 50, 6 + r() * 30, r() * 3, 0, 7); g.fill(); rg.fillStyle = 'rgba(200,200,200,.25)'; rg.beginPath(); rg.ellipse(r() * S, r() * S, 20, 10, 0, 0, 7); rg.fill(); }
  noise(g, S, S, r, 7000, .08); noise(rg, S, S, r, 5000, .2);
  return { map: tex(c, { repeat: true, aniso }), roughnessMap: tex(rc, { srgb: false, repeat: true, aniso }) };
}

function fanPlate(aniso) {
  // square shroud with a circular venturi opening (alpha), bolts round the rim
  const S = 256, [c, g] = canvas(S, S);
  g.fillStyle = '#4b5057'; g.fillRect(0, 0, S, S);
  g.strokeStyle = '#2c3035'; g.lineWidth = 6; g.strokeRect(3, 3, S - 6, S - 6);
  const grd = g.createRadialGradient(S / 2, S / 2, S * .36, S / 2, S / 2, S * .46);
  grd.addColorStop(0, '#9aa1aa'); grd.addColorStop(1, '#4b5057'); g.fillStyle = grd; g.beginPath(); g.arc(S / 2, S / 2, S * .46, 0, 7); g.fill();
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; g.fillStyle = '#c8ced6'; g.beginPath(); g.arc(S / 2 + Math.cos(a) * S * .43, S / 2 + Math.sin(a) * S * .43, 4, 0, 7); g.fill(); }
  g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(S / 2, S / 2, S * .38, 0, 7); g.fill();
  // finger guard
  g.globalCompositeOperation = 'source-over'; g.strokeStyle = 'rgba(170,176,184,.9)'; g.lineWidth = 2;
  for (let k = 1; k <= 5; k++) { g.beginPath(); g.arc(S / 2, S / 2, S * .38 * k / 5, 0, 7); g.stroke(); }
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; g.beginPath(); g.moveTo(S / 2, S / 2); g.lineTo(S / 2 + Math.cos(a) * S * .38, S / 2 + Math.sin(a) * S * .38); g.stroke(); }
  return tex(c, { aniso });
}

function coilFins(aniso) {
  const W = 512, H = 512, [c, g] = canvas(W, H), [hc, h] = canvas(W, H);
  g.fillStyle = '#9da6ae'; g.fillRect(0, 0, W, H); h.fillStyle = '#808080'; h.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 4) { g.fillStyle = 'rgba(40,46,54,.55)'; g.fillRect(x, 0, 1.5, H); h.fillStyle = '#ffffff'; h.fillRect(x + 2, 0, 1.5, H); }
  for (let y = 32; y < H; y += 64) for (let x = 16; x < W; x += 32) { g.fillStyle = '#b87333'; g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); }
  g.fillStyle = '#7b848d'; g.fillRect(0, 0, W, 10); g.fillRect(0, H - 10, W, 10);
  return { map: tex(c, { repeat: true, aniso }), normalMap: tex(heightToNormal(hc, 2.5), { srgb: false, repeat: true, aniso }) };
}

function galvanized(aniso) {
  const S = 256, r = rand(31), [c, g] = canvas(S, S);
  g.fillStyle = '#a9afb4'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 300; i++) { const v = 150 + r() * 70 | 0; g.fillStyle = `rgba(${v},${v + 3},${v + 6},.35)`; g.beginPath(); g.moveTo(r() * S, r() * S); for (let k = 0; k < 5; k++) g.lineTo(r() * S, r() * S); g.fill(); }
  g.fillStyle = 'rgba(60,64,70,.5)'; g.fillRect(0, 0, S, 4); g.fillRect(0, S / 2, S, 3);
  return tex(c, { repeat: true, aniso });
}

/* ------------------------------------------------------------------ */
/* Shared room assets                                                   */
/* ------------------------------------------------------------------ */
export function roomAssets(A) {
  const a = A.aniso;
  const R = {};
  const stone = stoneTiles(a), pl = plaster(a), conc = concrete(a), slab = concrete(a, 512, 512, false, 4), blocks = blockWall(a), ep = epoxy(a);
  R.floor = {
    gallery: new THREE.MeshStandardMaterial({ ...stone, roughness: .75, normalScale: new THREE.Vector2(.5, .5) }),
    generator: new THREE.MeshStandardMaterial({ ...ep, roughness: .35, metalness: .05 }),
    plenum: new THREE.MeshStandardMaterial({ map: slab.map, normalMap: slab.normalMap, color: 0x9a9a98, roughness: .6 }),
  };
  R.plaster = new THREE.MeshStandardMaterial({ ...pl, color: 0xd6d6d2, roughness: .95 });
  R.concrete = new THREE.MeshStandardMaterial({ ...conc, roughness: .9 });
  R.concreteSlab = new THREE.MeshStandardMaterial({ map: slab.map, normalMap: slab.normalMap, roughness: .9 });
  R.board = new THREE.MeshStandardMaterial({ map: boardCeiling(a), roughness: .95 });
  R.grate = new THREE.MeshStandardMaterial({ map: grate(a), metalness: .7, roughness: .45 });
  R.grass = new THREE.MeshStandardMaterial({ map: grass(a), roughness: 1 });
  R.sign = new THREE.MeshStandardMaterial({ map: signNoSmoking(), roughness: .5 });
  R.windowFrame = new THREE.MeshStandardMaterial({ color: 0x6d7075, roughness: .7 });
  R.windowGlass = new THREE.MeshStandardMaterial({ color: 0x1b2026, roughness: .08, metalness: .6, envMapIntensity: 1.6 });
  R.steel = new THREE.MeshStandardMaterial({ color: 0xaeb4bb, metalness: .9, roughness: .3 });
  R.redPipe = new THREE.MeshStandardMaterial({ color: 0xc8321f, roughness: .45 });
  R.bluePipe = new THREE.MeshStandardMaterial({ color: 0x2c5aa8, roughness: .45 });
  R.whiteHousing = new THREE.MeshStandardMaterial({ color: 0xe6e8ea, roughness: .5 });
  R.door = new THREE.MeshStandardMaterial({ color: 0x5d6166, roughness: .6, metalness: .3 });
  R.sky = new THREE.MeshBasicMaterial({ color: 0xf6f9fc, fog: false });
  R.tubeDay = new THREE.MeshStandardMaterial({ color: 0xd9dde0, roughness: .35, metalness: .1 }); // lamps off: daylight only
  R.yellow = new THREE.MeshStandardMaterial({ color: 0xf0b400, roughness: .45, metalness: .1 });
  R.yellowPaint = new THREE.MeshStandardMaterial({ color: 0xf2c200, roughness: .5 });
  const gf = gensetFront(a);
  R.gensetFront = new THREE.MeshStandardMaterial({ ...gf, color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.4, roughness: .45, metalness: .1 });
  R.blocks = new THREE.MeshStandardMaterial({ ...blocks, roughness: .9 });
  R.darkSteel = new THREE.MeshStandardMaterial({ color: 0x2b2e33, metalness: .6, roughness: .5 });
  R.insulated = new THREE.MeshStandardMaterial({ color: 0xd4d8dc, metalness: .85, roughness: .35 });
  R.fanPlate = new THREE.MeshStandardMaterial({ map: fanPlate(a), alphaTest: .5, metalness: .6, roughness: .45, side: THREE.DoubleSide });
  R.coil = new THREE.MeshStandardMaterial({ ...coilFins(a), metalness: .7, roughness: .4 });
  R.galv = new THREE.MeshStandardMaterial({ map: galvanized(a), color: 0x8f969d, metalness: .75, roughness: .5 });
  R.copper = new THREE.MeshStandardMaterial({ color: 0xb87333, metalness: 1, roughness: .3 });
  R.black = new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: .9 });
  R.rotor = new THREE.MeshStandardMaterial({ color: 0x8b939c, metalness: .7, roughness: .35, side: THREE.DoubleSide });
  R.rotor.onBeforeCompile = s => {
    s.uniforms.uTime = A.time;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
        float ang = uTime * (14. + mod(float(gl_InstanceID), 5.)) + float(gl_InstanceID);
        #else
        float ang = uTime * 14.;
        #endif
        float cs = cos(ang), sn = sin(ang);
        transformed.xy = mat2(cs, sn, -sn, cs) * transformed.xy;
        objectNormal.xy = mat2(cs, sn, -sn, cs) * objectNormal.xy;`);
  };
  R.rotor.customProgramCacheKey = () => 'rotor';
  // geometry
  R.windowGeo = windowGeometry();
  R.chairGeo = null;
  R.fanRotor = rotorGeometry();
  warehouseAssets(A, R);
  storeroomAssets(A, R);
  R.gensetSteel = gensetSteelGeometry();
  return R;
}

function windowGeometry() {
  // recessed window: grey reveal frame, dark glass, horizontal steel bars (x = depth axis toward aisle)
  const W = 1.2, H = 1.5;
  const frame = [
    new THREE.BoxGeometry(.18, .12, W + .24).translate(.06, H / 2 + .06, 0),
    new THREE.BoxGeometry(.18, .12, W + .24).translate(.06, -H / 2 - .06, 0),
    new THREE.BoxGeometry(.18, H, .12).translate(.06, 0, W / 2 + .06),
    new THREE.BoxGeometry(.18, H, .12).translate(.06, 0, -W / 2 - .06),
  ];
  const glass = new THREE.PlaneGeometry(W, H).rotateY(Math.PI / 2).translate(.012, 0, 0);
  const bars = [];
  for (let y = -H / 2 + .12; y < H / 2; y += .13) bars.push(new THREE.CylinderGeometry(.012, .012, W, 6).rotateX(Math.PI / 2).translate(.08, y, 0));
  const strip = (arr) => arr.map(g => { g.deleteAttribute('uv'); return g; });
  return mergeGeometries([mergeGeometries(strip(frame)), mergeGeometries(strip([glass])), mergeGeometries(strip(bars))], true);
}

function rotorGeometry() {
  const blades = [];
  for (let i = 0; i < 7; i++) {
    const b = new THREE.BoxGeometry(.12, .4, .012);
    b.translate(0, .24, 0); b.rotateY(.35); b.rotateZ(i / 7 * Math.PI * 2);
    blades.push(b);
  }
  blades.push(new THREE.CylinderGeometry(.09, .09, .14, 18).rotateX(Math.PI / 2));
  return mergeGeometries(blades.map(g => { g.deleteAttribute('uv'); return g; }));
}

function gensetSteelGeometry() {
  // in genset-local space (length along x, front at +z, floor at y = 0)
  const parts = [];
  const skid = new THREE.BoxGeometry(4.5, .16, 2.15); skid.translate(0, .08, 0); parts.push(skid);
  const muffler = new THREE.CylinderGeometry(.34, .34, 2.6, 20); muffler.rotateZ(Math.PI / 2); muffler.translate(-.2, 2.95, -.3); parts.push(muffler);
  const stack = new THREE.CylinderGeometry(.17, .17, 3.4, 16); stack.translate(1.25, 4.4, -.3); parts.push(stack);
  const elbow = new THREE.CylinderGeometry(.17, .17, .45, 16); elbow.rotateZ(Math.PI / 2); elbow.translate(1.0, 2.95, -.3); parts.push(elbow);
  for (const x of [-1.2, .8]) { const band = new THREE.CylinderGeometry(.36, .36, .06, 20); band.rotateZ(Math.PI / 2); band.translate(x, 2.95, -.3); parts.push(band); }
  const tank = new THREE.BoxGeometry(.8, .6, .5); tank.translate(-2.55, .45, .5); parts.push(tank);
  return mergeGeometries(parts.map(g => { g.deleteAttribute('uv'); return g; }));
}

/* ------------------------------------------------------------------ */
/* Obstacles for the new rooms                                          */
/* ------------------------------------------------------------------ */
export function roomObstacles(A, R) {
  const kit = {};
  const shadow = g => { g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return g; };
  // office task chair: mesh back, five-star base on casters
  const chair = () => {
    const g = new THREE.Group();
    const black = new THREE.MeshStandardMaterial({ color: 0x141518, roughness: .55 });
    const mesh = new THREE.MeshStandardMaterial({ color: 0x1b1d21, roughness: .8, transparent: true, opacity: .92 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: .9, roughness: .25 });
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2;
      const leg = new THREE.Mesh(new THREE.BoxGeometry(.34, .04, .05), black);
      leg.position.set(Math.cos(a) * .17, .09, Math.sin(a) * .17); leg.rotation.y = -a; g.add(leg);
      const wheel = new THREE.Mesh(new THREE.SphereGeometry(.035, 10, 8), black);
      wheel.position.set(Math.cos(a) * .33, .035, Math.sin(a) * .33); g.add(wheel);
    }
    const gas = new THREE.Mesh(new THREE.CylinderGeometry(.025, .03, .32, 12), chrome); gas.position.y = .26; g.add(gas);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(.5, .08, .48), black); seat.position.y = .46; g.add(seat);
    const cushion = new THREE.Mesh(new THREE.BoxGeometry(.48, .05, .46), mesh); cushion.position.y = .51; g.add(cushion);
    const back = new THREE.Mesh(new THREE.BoxGeometry(.46, .55, .03), mesh); back.position.set(0, .86, -.25); back.rotation.x = -.12; g.add(back);
    const frame = new THREE.Mesh(new THREE.TorusGeometry(.26, .018, 6, 24), black); frame.scale.set(.92, 1.1, 1); frame.position.set(0, .86, -.25); frame.rotation.x = -.12; g.add(frame);
    const spine = new THREE.Mesh(new THREE.BoxGeometry(.06, .4, .03), black); spine.position.set(0, .58, -.27); g.add(spine);
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(.04, .2, .04), black); post.position.set(s * .25, .6, -.02); g.add(post);
      const pad = new THREE.Mesh(new THREE.BoxGeometry(.07, .03, .25), black); pad.position.set(s * .25, .71, 0); g.add(pad);
    }
    return shadow(g);
  };
  kit.chair = chair();
  kit.chairDown = (() => { const g = new THREE.Group(); const c = chair(); c.rotation.x = -Math.PI / 2; c.position.set(0, .26, .45); c.rotation.z = .3; g.add(c); return g; })();
  // two 200 L drums on a spill pallet
  {
    const g = new THREE.Group();
    const pallet = new THREE.Mesh(new THREE.BoxGeometry(1.25, .28, 1.25), R.yellowPaint); pallet.position.y = .14; g.add(pallet);
    const grid = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.15), R.grate); grid.rotation.x = -Math.PI / 2; grid.position.y = .285; g.add(grid);
    const cols = [0x1f4fa8, 0x1f4fa8, 0xf0b400];
    [[-.3, -.3], [.3, -.3], [0, .3]].forEach(([x, z], i) => {
      const d = new THREE.Mesh(new THREE.CylinderGeometry(.29, .29, .88, 24), new THREE.MeshStandardMaterial({ color: cols[i], roughness: .4, metalness: .3 }));
      d.position.set(x, .28 + .44, z); g.add(d);
      for (const y of [.3, .58]) { const rib = new THREE.Mesh(new THREE.TorusGeometry(.29, .012, 6, 24), d.material); rib.rotation.x = Math.PI / 2; rib.position.set(x, .28 + y, z); g.add(rib); }
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, .02, 10), R.steel); cap.position.set(x + .12, 1.17, z); g.add(cap);
    });
    kit.drums = shadow(g);
  }
  // insulated exhaust / fuel pipe across the aisle (slide)
  {
    const g = new THREE.Group(), y = 1.32;
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(.16, .16, 7.6, 20), R.insulated); pipe.rotation.z = Math.PI / 2; pipe.position.y = y; g.add(pipe);
    for (let x = -3; x <= 3; x += 1.5) { const b = new THREE.Mesh(new THREE.CylinderGeometry(.175, .175, .05, 20), R.steel); b.rotation.z = Math.PI / 2; b.position.set(x, y, 0); g.add(b); }
    for (const x of [-2.6, 2.6]) { const rod = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, 5, 8), R.steel); rod.position.set(x, y + 2.5, 0); g.add(rod); }
    const tape = new THREE.Mesh(new THREE.CylinderGeometry(.165, .165, .25, 20), A.hazard); tape.rotation.z = Math.PI / 2; tape.position.set(0, y, 0); g.add(tape);
    kit.exhaust = shadow(g);
  }
  // pleated filter cartons on a pallet (dodge)
  {
    const g = new THREE.Group();
    const pal = new THREE.Mesh(new THREE.BoxGeometry(1.2, .14, 1.0), new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: .9 })); pal.position.y = .07; g.add(pal);
    const card = new THREE.MeshStandardMaterial({ color: 0xe9eef2, roughness: .8 });
    const band = new THREE.MeshStandardMaterial({ color: 0x2a7bd0, roughness: .6 });
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.1, .3, .9), card); b.position.y = .3 + i * .31; b.rotation.y = (i % 2 - .5) * .06; g.add(b);
      const s = new THREE.Mesh(new THREE.BoxGeometry(1.11, .06, .91), band); s.position.copy(b.position); s.rotation.y = b.rotation.y; g.add(s);
    }
    kit.filters = shadow(g);
  }
  // branch duct crossing the aisle (slide)
  {
    const g = new THREE.Group(), y = 1.25;
    const d = new THREE.Mesh(new THREE.BoxGeometry(7.6, .5, .9), R.galv); d.position.y = y + .25; g.add(d);
    for (const x of [-3.4, -1.2, 1.2, 3.4]) { const f = new THREE.Mesh(new THREE.BoxGeometry(.05, .56, .96), R.steel); f.position.set(x, y + .25, 0); g.add(f); }
    for (const x of [-2.6, 2.6]) for (const z of [-.4, .4]) { const rod = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, 3, 6), R.steel); rod.position.set(x, y + 2, z); g.add(rod); }
    const tape = new THREE.Mesh(new THREE.BoxGeometry(7.4, .08, .01), A.hazard); tape.position.set(0, y + .04, .46); g.add(tape);
    kit.duct = shadow(g);
  }
  // condensate pipes on stands (jump, stumble)
  {
    const g = new THREE.Group();
    for (const [z, yy, rr] of [[-.12, .14, .07], [.12, .2, .06]]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, 7.4, 14), new THREE.MeshStandardMaterial({ color: 0xe8e8e2, roughness: .4 })); p.rotation.z = Math.PI / 2; p.position.set(0, yy, z); g.add(p);
    }
    for (let x = -3.2; x <= 3.2; x += 1.6) { const s = new THREE.Mesh(new THREE.BoxGeometry(.08, .2, .4), R.darkSteel); s.position.set(x, .1, 0); g.add(s); }
    kit.condensate = shadow(g);
  }
  Object.assign(kit, warehouseObstacles(A, R), storeroomObstacles(A, R));
  kit.table = coffeeTable(R);
  return kit;
}

/* ------------------------------------------------------------------ */
/* Builders                                                             */
/* ------------------------------------------------------------------ */
// ctx: { g, own, seg, A, R, T, L, u0, uEnd, HALF, AISLE, left, right, r }
export function buildRoom(kind, ctx) {
  if (kind === 'gallery') return buildGallery(ctx);
  if (kind === 'generator') return buildGenerator(ctx);
  if (kind === 'plenum') return buildPlenum(ctx);
  if (kind === 'warehouse') return buildWarehouse(ctx);
  if (kind === 'storeroom') return buildStoreroom(ctx);
}

const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S1 = new THREE.Vector3(1, 1, 1), UP = new THREE.Vector3(0, 1, 0);

function planeAlong(own, mat, len, h, uvW, uvH) {
  const geo = new THREE.PlaneGeometry(len, h);
  const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvW, uv.getY(i) * uvH);
  return own(new THREE.Mesh(geo, mat));
}

// side wall plane from u=a..b at lateral x facing the aisle
function sideWall(ctx, mat, side, a, b, x, h, tile = 2.4, tileH = h) {
  const len = b - a; if (len <= .01) return;
  const m = planeAlong(ctx.own, mat, len, h, len / tile, h / tileH);
  m.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
  m.position.set(x, h / 2, -(a + len / 2)); m.receiveShadow = true;
  ctx.g.add(m);
}
function endWall(ctx, mat, x0, x1, u, h, tile = 2.4, tileH = h) {
  const w = x1 - x0, m = planeAlong(ctx.own, mat, w, h, w / tile, h / tileH);
  m.position.set((x0 + x1) / 2, h / 2, -u); m.receiveShadow = true; ctx.g.add(m);
}
function ceiling(ctx, mat, y, u0, u1, width, tile = 2.4) {
  const len = u1 - u0, geo = new THREE.PlaneGeometry(width, len); geo.rotateX(Math.PI / 2);
  const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * width / tile, uv.getY(i) * len / tile);
  const m = ctx.own(new THREE.Mesh(geo, mat)); m.position.set(0, y, -(u0 + len / 2)); ctx.g.add(m);
}
function runAlong(ctx, geoFn, mat, x, y, u0, u1) {
  const len = u1 - u0; const m = ctx.own(new THREE.Mesh(geoFn(len), mat)); m.position.set(x, y, -(u0 + len / 2)); m.castShadow = true; ctx.g.add(m); return m;
}
const tubeZ = r => len => new THREE.CylinderGeometry(r, r, len, 12).rotateX(Math.PI / 2);
const boxZ = (w, h) => len => new THREE.BoxGeometry(w, h, len);
function instanced(ctx, geo, mat, list) {
  if (!list.length) return null;
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  list.forEach((m, i) => im.setMatrixAt(i, m));
  im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere();
  ctx.g.add(im); return im;
}
// u-range of a side: stop short of an open junction, run into the corner when closed
const sideRange = (ctx, open, depth) => [ctx.u0, open ? ctx.L - ctx.HALF : ctx.uEnd + depth];

/* ---------- Support wing gallery (from the photos) ---------- */
function buildGallery(ctx) {
  const { g, R, HALF, L, u0, uEnd, r, seg } = ctx;
  const H = 3.7;
  const [la, lb] = sideRange(ctx, ctx.left, .2), [ra, rb] = sideRange(ctx, ctx.right, 1);
  // left: white plaster wall with barred windows and doors
  sideWall(ctx, R.plaster, -1, la, lb, -HALF, H, 1.6, 1.6);
  const wins = [], doors = [], cols = [];
  for (let u = la + 1.8; u < lb - 1; u += STEP) {
    if (r() < .12) { cols.push(u); continue; }
    if (r() < .2) doors.push(u); else wins.push(u);
  }
  const winMats = [];
  Q.identity();
  for (const u of wins) { P.set(-HALF + .01, 1.75, -u); winMats.push(M4.compose(P, Q, S1).clone()); }
  instanced(ctx, R.windowGeo, [R.windowFrame, R.windowGlass, R.steel], winMats);
  for (const u of doors) {
    const d = ctx.own(new THREE.Mesh(new THREE.BoxGeometry(.06, 2.15, 1.0), R.door)); d.position.set(-HALF + .03, 1.075, -u); g.add(d);
    const rev = ctx.own(new THREE.Mesh(new THREE.BoxGeometry(.16, 2.3, 1.25), R.windowFrame)); rev.position.set(-HALF + .02, 1.15, -u); g.add(rev); d.position.x += .07;
    const card = ctx.own(new THREE.Mesh(new THREE.PlaneGeometry(.12, .16), R.whiteHousing)); card.rotation.y = Math.PI / 2; card.position.set(-HALF + .02, 1.45, -(u - .75)); g.add(card);
  }
  for (const u of cols) { const c = ctx.own(new THREE.Mesh(new THREE.BoxGeometry(.9, H, .9), R.concrete)); c.position.set(-HALF + .45, H / 2, -u); c.castShadow = c.receiveShadow = true; g.add(c); }

  // right: tall fair-faced concrete fins open to daylight, on a concrete curb
  const finMats = [];
  for (let u = ra + .4; u < rb - .2; u += 1.3) { P.set(HALF + .2, H / 2, -u); finMats.push(M4.compose(P, Q, S1).clone()); }
  instanced(ctx, new THREE.BoxGeometry(.4, H, .32), R.concrete, finMats);
  runAlong(ctx, boxZ(.9, .14), R.concreteSlab, HALF + .45, .07, ra, rb);
  runAlong(ctx, boxZ(.9, .5), R.concrete, HALF + .35, H - .25, ra, rb); // lintel beam
  // bright outdoors beyond the fins
  sideWall(ctx, R.sky, 1, ra - 4, rb + 4, HALF + 7, 14, 50);
  { const ground = ctx.own(new THREE.Mesh(new THREE.PlaneGeometry(7, rb - ra + 8), new THREE.MeshStandardMaterial({ color: 0xc9c3b4, roughness: 1 }))); ground.rotation.x = -Math.PI / 2; ground.position.set(HALF + 4, -.6, -(ra + rb) / 2); g.add(ground); }
  // signs on a few fins
  for (let i = 0; i < finMats.length; i += 9 + (r() * 6 | 0)) {
    const s = ctx.own(new THREE.Mesh(new THREE.PlaneGeometry(.3, .6), R.sign)); s.rotation.y = -Math.PI / 2;
    const p = new THREE.Vector3().setFromMatrixPosition(finMats[i]); s.position.set(HALF - .005, 1.55, p.z); g.add(s);
  }
  // drainage channel grate along the right
  { const len = rb - ra, gm = planeAlong(ctx.own, R.grate, .16, len, 1, len / .5); gm.rotation.x = -Math.PI / 2; gm.position.set(HALF - .55, .004, -(ra + len / 2)); g.add(gm); }
  // artificial grass patch
  if (r() < .8) {
    const at = u0 + 20 + r() * (L - 60), len = 4 + r() * 3;
    if (!seg.obstacles.some(o => Math.abs(o.u - at) < len)) {
      const m = planeAlong(ctx.own, R.grass, ctx.AISLE - 1.2, len, 6, len); m.rotation.x = -Math.PI / 2; m.position.set(-.6, .008, -at); g.add(m);
    }
  }

  // end wall + ceiling slab with downstand beams
  endWall(ctx, R.plaster, ctx.left ? -HALF : -HALF - .2, ctx.right ? HALF : HALF + 1, uEnd + .01, H, 1.6, 1.6);
  ceiling(ctx, R.board, H, u0, uEnd + 1, ctx.AISLE + 2, 2.4);
  for (let u = u0 + 3; u < uEnd; u += 7.2) { const b = ctx.own(new THREE.Mesh(new THREE.BoxGeometry(ctx.AISLE + 1, .45, .45), R.concreteSlab)); b.position.set(.4, H - .22, -u); b.castShadow = true; g.add(b); }
  // services: galvanised ladder tray, red sprinkler main, blue pipe, fluorescent battens
  const len = uEnd - u0;
  { const tray = planeAlong(ctx.own, ctx.A.ladder, .45, len, 1, len / 2); tray.rotation.x = -Math.PI / 2; tray.position.set(-2.3, 3.2, -(u0 + len / 2)); g.add(tray); }
  runAlong(ctx, boxZ(.02, .08), R.steel, -2.52, 3.2, u0, uEnd); runAlong(ctx, boxZ(.02, .08), R.steel, -2.08, 3.2, u0, uEnd);
  runAlong(ctx, tubeZ(.045), R.redPipe, -1.1, 3.38, u0, uEnd);
  runAlong(ctx, tubeZ(.035), R.redPipe, 1.6, 3.32, u0, uEnd);
  runAlong(ctx, tubeZ(.05), R.bluePipe, HALF - .25, 3.4, u0, uEnd);
  const heads = [], fixtures = [];
  for (let u = u0 + 1.8; u < uEnd; u += STEP) {
    P.set(-1.1, 3.2, -u); heads.push(M4.compose(P, Q, S1).clone());
    fixtures.push(M4.compose(P.set(0, H - .3, -u), Q, S1).clone());
  }
  instanced(ctx, new THREE.CylinderGeometry(.02, .02, .35, 6), R.redPipe, heads);
  instanced(ctx, new THREE.BoxGeometry(.16, .1, 1.3), R.whiteHousing, fixtures);
  const tubes = fixtures.map(m => m.clone().multiply(new THREE.Matrix4().makeTranslation(0, -.06, 0)));
  instanced(ctx, new THREE.BoxGeometry(.1, .03, 1.22), R.tubeDay, tubes);
}

/* ---------- Generator hall (yellow) ---------- */
function buildGenerator(ctx) {
  const { g, R, HALF, u0, uEnd, seg } = ctx;
  const H = 6.2, DEPTH = 2.4;
  const sides = [[-1, ...sideRange(ctx, ctx.left, DEPTH + .4)], [1, ...sideRange(ctx, ctx.right, DEPTH + .4)]];
  const bodies = [], steel = [];
  const body = new THREE.BoxGeometry(4.2, 2.3, 2.0); body.translate(0, 1.31, 0);
  const frontMats = [R.yellow, R.yellow, R.yellow, R.yellow, R.gensetFront, R.yellow];
  for (const [side, a, b] of sides) {
    Q.setFromAxisAngle(UP, side < 0 ? Math.PI / 2 : -Math.PI / 2);
    for (let u = a + 3; u + 2.2 < b; u += 5.6) {
      P.set(side * (HALF + 1.25), 0, -u);
      const m = M4.compose(P, Q, S1).clone();
      bodies.push(m); steel.push(m);
    }
    // block wall behind, yellow safety line in front, bollards
    sideWall(ctx, R.blocks, side, a, b, side * (HALF + DEPTH + .2), H, 2.4, 2.4);
    runAlong(ctx, boxZ(.1, .006), R.yellowPaint, side * (HALF - .12), .003, a, b);
    for (let u = a + .2; u < b; u += 5.6) { const bo = ctx.own(new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, 1, 12), R.yellowPaint)); bo.position.set(side * (HALF - .05), .5, -u); bo.castShadow = true; g.add(bo); }
    // floor under the gensets
    const fl = ctx.own(new THREE.Mesh(new THREE.PlaneGeometry(DEPTH + .2, b - a), R.floor.generator)); fl.rotation.x = -Math.PI / 2; fl.position.set(side * (HALF + (DEPTH + .2) / 2), .001, -(a + b) / 2); g.add(fl);
    // overhead exhaust header and cable tray along the wall
    runAlong(ctx, tubeZ(.22), R.insulated, side * (HALF + 1.55), 5.6, a, b);
    runAlong(ctx, boxZ(.5, .1), R.yellowPaint, side * (HALF + .3), 4.6, a, b);
  }
  instanced(ctx, body, frontMats, bodies);
  instanced(ctx, R.gensetSteel, R.insulated, steel);
  endWall(ctx, R.blocks, ctx.left ? -HALF : -HALF - DEPTH - .4, ctx.right ? HALF : HALF + DEPTH + .4, uEnd + .01, H, 2.4, 2.4);
  ceiling(ctx, R.darkSteel, H, u0, uEnd + DEPTH, ctx.AISLE + DEPTH * 2 + .8, 4);
  // steel I-beams and yellow high-bay lights
  const beams = [], lamps = [];
  for (let u = u0 + 2; u < uEnd; u += 6) { P.set(0, H - .3, -u); Q.identity(); beams.push(M4.compose(P, Q, S1).clone()); }
  instanced(ctx, new THREE.BoxGeometry(ctx.AISLE + DEPTH * 2 + .8, .5, .22), R.darkSteel, beams);
  for (let u = u0 + 3.5; u < uEnd; u += STEP * 1.5) {
    for (const x of [-1.6, 1.6]) { P.set(x, H - .9, -u); lamps.push(M4.compose(P, Q, S1).clone()); }
    seg.fixtures.push({ u, color: 0xffcf6a, intensity: 2.6, y: H - 1.1 });
  }
  instanced(ctx, new THREE.CylinderGeometry(.28, .18, .35, 20), R.darkSteel, lamps);
  instanced(ctx, new THREE.CylinderGeometry(.17, .17, .02, 20).translate(0, -.18, 0), ctx.A.fixtureMat(0xffc455), lamps);
  // yellow hatched zone marking near the junction
  const hz = planeAlong(ctx.own, ctx.A.hazard, ctx.AISLE, .3, 6, 1); hz.rotation.x = -Math.PI / 2; hz.position.set(0, .004, -(ctx.L - ctx.HALF - 1)); g.add(hz);
}

/* ---------- Fan-wall air plenum ---------- */
function buildPlenum(ctx) {
  const { g, R, HALF, u0, uEnd, seg } = ctx;
  const H = 4.4;
  const [la, lb] = sideRange(ctx, ctx.left, .8), [ra, rb] = sideRange(ctx, ctx.right, .6);
  // left: EC fan array, 2 rows of 1.2 m cells with spinning rotors behind finger guards
  const plates = [], rotors = [];
  Q.setFromAxisAngle(UP, Math.PI / 2);
  for (let u = la + .6; u < lb - .3; u += 1.2) for (const y of [.75, 1.95]) {
    P.set(-HALF - .02, y, -u); plates.push(M4.compose(P, Q, S1).clone());
    P.set(-HALF - .25, y, -u); rotors.push(M4.compose(P, Q, S1).clone());
  }
  instanced(ctx, new THREE.PlaneGeometry(1.18, 1.18), R.fanPlate, plates);
  const rm = instanced(ctx, R.fanRotor, R.rotor, rotors); if (rm) rm.castShadow = false;
  sideWall(ctx, R.black, -1, la, lb, -HALF - .6, H, 4, H);
  sideWall(ctx, R.galv, -1, la, lb, -HALF - .01, H - 2.6, 1.2, 1.2);
  // reposition the upper panel above the fans
  g.children[g.children.length - 1].position.y = 2.6 + (H - 2.6) / 2;
  // right: cooling coil bank with copper headers and a condensate pan
  sideWall(ctx, R.coil, 1, ra, rb, HALF + .02, H - .4, 1.2, 1.2);
  g.children[g.children.length - 1].position.y = .4 + (H - .4) / 2;
  runAlong(ctx, boxZ(.5, .4), R.steel, HALF + .2, .2, ra, rb);
  const hdr = [];
  Q.identity();
  for (let u = ra + 2.4; u < rb; u += 2.4) { P.set(HALF - .05, H / 2, -u); hdr.push(M4.compose(P, Q, S1).clone()); }
  instanced(ctx, new THREE.CylinderGeometry(.05, .05, H - .4, 12), R.copper, hdr);
  instanced(ctx, new THREE.BoxGeometry(.06, H, .12), R.steel, hdr);
  // big galvanised supply ducts at the ceiling
  runAlong(ctx, boxZ(1.3, .8), R.galv, -HALF + .7, H - .45, la, lb);
  runAlong(ctx, boxZ(1.1, .7), R.galv, HALF - .6, H - .4, ra, rb);
  endWall(ctx, R.galv, ctx.left ? -HALF : -HALF - .8, ctx.right ? HALF : HALF + .6, uEnd + .01, H, 1.2, 1.2);
  ceiling(ctx, R.darkSteel, H, u0, uEnd + 1, ctx.AISLE + 2, 4);
  const lamps = [];
  for (let u = u0 + 1.8; u < uEnd; u += STEP) {
    P.set(0, H - .12, -u); lamps.push(M4.compose(P, Q, S1).clone());
    seg.fixtures.push({ u, color: 0xcfe6ff, intensity: 1, y: H - .45 });
  }
  instanced(ctx, new THREE.BoxGeometry(.18, .1, 1.4), R.whiteHousing, lamps);
  instanced(ctx, new THREE.BoxGeometry(.12, .03, 1.3).translate(0, -.06, 0), ctx.A.fixtureMat(0xcfe6ff), lamps);
}

/* ------------------------------------------------------------------ */
/* Warehouse: pallet racking, huge crates, forklifts, red pallet jacks */
/* ------------------------------------------------------------------ */
function crateTexture(aniso) {
  const W = 512, H = 512, r = rand(61), [c, g] = canvas(W, H), [hc, h] = canvas(W, H);
  h.fillStyle = '#808080'; h.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 64) {
    const v = 150 + r() * 40 | 0; g.fillStyle = `rgb(${v + 30},${v - 5},${v - 55})`; g.fillRect(0, y, W, 64);
    for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(90,55,20,${.1 + r() * .15})`; g.lineWidth = 1 + r() * 2; g.beginPath(); const yy = y + r() * 64; g.moveTo(0, yy); g.bezierCurveTo(W * .3, yy + (r() - .5) * 10, W * .6, yy + (r() - .5) * 10, W, yy + (r() - .5) * 6); g.stroke(); }
    g.fillStyle = 'rgba(40,25,10,.6)'; g.fillRect(0, y + 61, W, 3); h.fillStyle = '#303030'; h.fillRect(0, y + 61, W, 3);
  }
  // battens + diagonal brace
  g.fillStyle = 'rgba(120,80,40,.9)'; h.fillStyle = '#d0d0d0';
  for (const [x, y, w, hh] of [[0, 0, W, 40], [0, H - 40, W, 40], [0, 0, 40, H], [W - 40, 0, 40, H]]) { g.fillRect(x, y, w, hh); h.fillRect(x, y, w, hh); }
  g.save(); g.translate(W / 2, H / 2); g.rotate(-Math.PI / 4); g.fillRect(-W * .7, -18, W * 1.4, 36); h.save(); h.translate(W / 2, H / 2); h.rotate(-Math.PI / 4); h.fillRect(-W * .7, -18, W * 1.4, 36); h.restore(); g.restore();
  for (let i = 0; i < 40; i++) { g.fillStyle = '#3a3a3a'; g.beginPath(); g.arc(20 + (i % 2) * (W - 40), 20 + (i >> 1) * (H / 20), 3, 0, 7); g.fill(); }
  // stencils
  g.fillStyle = 'rgba(20,20,20,.78)'; g.font = 'bold 44px Arial'; g.textAlign = 'center';
  g.fillText('FRAGILE', W / 2, 120); g.font = 'bold 30px Arial'; g.fillText('↑ THIS SIDE UP ↑', W / 2, 400);
  g.font = 'bold 26px monospace'; g.fillText('DC-RACK 42U  1.4t', W / 2, 450);
  return { map: tex(c, { repeat: true, aniso }), normalMap: tex(heightToNormal(hc, 2), { srgb: false, repeat: true, aniso }) };
}
function claddingTexture(aniso) {
  const W = 256, H = 256, [c, g] = canvas(W, H), [hc, h] = canvas(W, H);
  g.fillStyle = '#b9bec3'; g.fillRect(0, 0, W, H); h.fillStyle = '#808080'; h.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 32) { g.fillStyle = 'rgba(70,76,84,.35)'; g.fillRect(x, 0, 6, H); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x + 6, 0, 3, H); h.fillStyle = '#ffffff'; h.fillRect(x, 0, 9, H); }
  return { map: tex(c, { repeat: true, aniso }), normalMap: tex(heightToNormal(hc, 2), { srgb: false, repeat: true, aniso }) };
}
function vestTexture() {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#e5f20a'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#c9ccd0'; g.fillRect(0, 70, 128, 14); g.fillRect(24, 0, 12, 128); g.fillRect(92, 0, 12, 128);
  return tex(c);
}

export function warehouseAssets(A, R) {
  const a = A.aniso;
  const cr = crateTexture(a), cl = claddingTexture(a);
  R.crate = new THREE.MeshStandardMaterial({ ...cr, roughness: .85 });
  R.cladding = new THREE.MeshStandardMaterial({ ...cl, metalness: .5, roughness: .5 });
  R.floor.warehouse = new THREE.MeshStandardMaterial({ map: R.floor.plenum.map, normalMap: R.floor.plenum.normalMap, color: 0xb4b2ac, roughness: .28, metalness: .05 });
  R.wood = new THREE.MeshStandardMaterial({ color: 0xb58a55, roughness: .9 });
  R.rackBlue = new THREE.MeshStandardMaterial({ color: 0x1f5fb0, roughness: .5, metalness: .4 });
  R.rackOrange = new THREE.MeshStandardMaterial({ color: 0xe8661c, roughness: .5, metalness: .3 });
  R.load = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .85 });
  R.wrap = new THREE.MeshPhysicalMaterial({ color: 0xdde5ea, roughness: .15, metalness: 0, clearcoat: 1, transparent: true, opacity: .72 });
  R.jackRed = new THREE.MeshStandardMaterial({ color: 0xc81e1e, roughness: .45, metalness: .3 });
  R.rubber = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: .8 });
  R.forkYellow = new THREE.MeshStandardMaterial({ color: 0xf2a900, roughness: .45, metalness: .2 });
  R.skin = new THREE.MeshStandardMaterial({ color: 0xd6a07a, roughness: .38 }); // bald head catches the light
  R.vest = new THREE.MeshStandardMaterial({ map: vestTexture(), roughness: .6, emissive: 0x222200 });
  R.jeans = new THREE.MeshStandardMaterial({ color: 0x2c3e5c, roughness: .8 });
  R.palletGeo = palletGeometry();
}

function palletGeometry() {
  const parts = [];
  for (let i = 0; i < 7; i++) parts.push(new THREE.BoxGeometry(1.2, .022, .1).translate(0, .133, -.5 + i * (1 / 6)));
  for (const z of [-.45, 0, .45]) for (const x of [-.55, 0, .55]) parts.push(new THREE.BoxGeometry(.1, .09, .1).translate(x, .067, z));
  for (const x of [-.55, 0, .55]) parts.push(new THREE.BoxGeometry(.1, .022, 1).translate(x, .011, 0));
  return mergeGeometries(parts.map(g => { g.deleteAttribute('uv'); return g; }));
}

export function makePalletJack(R) {
  const g = new THREE.Group();
  for (const x of [-.18, .18]) { const f = new THREE.Mesh(new THREE.BoxGeometry(.16, .07, 1.15), R.jackRed); f.position.set(x, .06, .1); g.add(f); const w = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, .1, 10), R.rubber); w.rotation.z = Math.PI / 2; w.position.set(x, .04, .62); g.add(w); }
  const body = new THREE.Mesh(new THREE.BoxGeometry(.52, .2, .2), R.jackRed); body.position.set(0, .14, -.52); g.add(body);
  const pump = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, .32, 14), R.jackRed); pump.position.set(0, .36, -.55); g.add(pump);
  const steer = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, .12, 14), R.rubber); steer.rotation.z = Math.PI / 2; steer.position.set(0, .09, -.6); g.add(steer);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(.022, .022, 1.05, 8), R.jackRed); handle.position.set(0, .9, -.75); handle.rotation.x = -.35; g.add(handle);
  const loop = new THREE.Mesh(new THREE.TorusGeometry(.13, .022, 8, 18), R.jackRed); loop.position.set(0, 1.45, -.94); loop.rotation.x = -.35; g.add(loop);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .2, 8), R.rubber); grip.rotation.z = Math.PI / 2; grip.position.set(0, 1.56, -.98); g.add(grip);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// Counterbalance forklift (front/forks toward local -z) with a bald driver.
export function makeForklift(R, A) {
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m; };
  add(new THREE.BoxGeometry(1.15, .55, 2.0), R.forkYellow, 0, .55, .1);                      // chassis
  add(new THREE.BoxGeometry(1.15, .75, .55), R.darkSteel, 0, .85, 1.05);                      // counterweight
  add(new THREE.BoxGeometry(1.0, .3, .9), R.forkYellow, 0, .95, .55);                         // hood
  for (const [x, z, r] of [[-.5, -.6, .3], [.5, -.6, .3], [-.5, .85, .25], [.5, .85, .25]]) add(new THREE.CylinderGeometry(r, r, .26, 18), R.rubber, x, r, z, 0, 0, Math.PI / 2);
  // overhead guard
  for (const x of [-.52, .52]) { add(new THREE.BoxGeometry(.06, 1.35, .06), R.darkSteel, x, 1.75, -.45, .12); add(new THREE.BoxGeometry(.06, 1.25, .06), R.darkSteel, x, 1.7, .75, -.1); }
  add(new THREE.BoxGeometry(1.12, .05, 1.3), R.darkSteel, 0, 2.42, .15);
  for (let z = -.3; z < .7; z += .2) add(new THREE.BoxGeometry(1.05, .03, .04), R.darkSteel, 0, 2.38, z);
  // mast + carriage + forks (carriage animated)
  for (const x of [-.4, .4]) add(new THREE.BoxGeometry(.1, 2.6, .12), R.darkSteel, x, 1.4, -.95);
  const carriage = new THREE.Group(); carriage.position.set(0, .3, -1.05); g.add(carriage);
  carriage.add(new THREE.Mesh(new THREE.BoxGeometry(1.0, .45, .06), R.darkSteel));
  for (const x of [-.28, .28]) { const f = new THREE.Mesh(new THREE.BoxGeometry(.12, .05, 1.1), R.darkSteel); f.position.set(x, -.2, -.55); carriage.add(f); }
  g.userData.carriage = carriage;
  // seat + steering wheel
  add(new THREE.BoxGeometry(.5, .12, .45), R.rubber, 0, 1.15, .45);
  add(new THREE.BoxGeometry(.5, .5, .1), R.rubber, 0, 1.42, .68, -.15);
  add(new THREE.TorusGeometry(.16, .02, 8, 20), R.rubber, 0, 1.55, -.05, -1.0);
  add(new THREE.CylinderGeometry(.025, .025, .45, 8), R.darkSteel, 0, 1.35, -.15, -.6);
  // the bald driver
  const d = new THREE.Group(); d.position.set(0, 1.21, .42); g.add(d);
  const part = (geo, mat, x, y, z, rx = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx; d.add(m); return m; };
  part(new THREE.BoxGeometry(.44, .55, .26), R.vest, 0, .36, 0);                                  // torso in hi-vis vest
  part(new THREE.CylinderGeometry(.06, .07, .1, 10), R.skin, 0, .68, 0);                         // neck
  const head = part(new THREE.SphereGeometry(.13, 20, 16), R.skin, 0, .82, -.01); head.scale.set(1, 1.12, 1.05);
  for (const x of [-.13, .13]) part(new THREE.SphereGeometry(.03, 8, 6), R.skin, x, .8, .0);   // ears
  part(new THREE.BoxGeometry(.1, .025, .02), R.darkSteel, 0, .85, -.135);                        // sunglasses
  for (const x of [-.24, .24]) { const arm = part(new THREE.CylinderGeometry(.05, .045, .5, 8), R.vest, x, .42, -.2, -1.0); arm.rotation.z = x > 0 ? .25 : -.25; part(new THREE.SphereGeometry(.05, 8, 6), R.skin, x * .55, .36, -.43); }
  for (const x of [-.11, .11]) { part(new THREE.CylinderGeometry(.07, .065, .5, 8), R.jeans, x, .04, -.22, -1.5); part(new THREE.CylinderGeometry(.06, .055, .45, 8), R.jeans, x, -.2, -.48, 0); }
  g.userData.driver = d; g.userData.head = head;
  // amber beacon
  const beacon = add(new THREE.CylinderGeometry(.06, .07, .1, 12), new THREE.MeshStandardMaterial({ color: 0x331a00, emissive: 0xff9a1a, emissiveIntensity: 3 }), .45, 2.5, .7);
  g.userData.beacon = beacon;
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

export function warehouseObstacles(A, R) {
  const kit = {};
  kit.jack = makePalletJack(R);
  kit.forklift = makeForklift(R, A);
  { // huge equipment crate
    const g = new THREE.Group();
    const p = new THREE.Mesh(R.palletGeo, R.wood); g.add(p);
    const c = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6, 1.05), R.crate); c.position.y = .145 + .8; g.add(c);
    g.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
    kit.crate = g;
  }
  { // shrink-wrapped pallet of boxed servers
    const g = new THREE.Group();
    g.add(new THREE.Mesh(R.palletGeo, R.wood));
    const box = new THREE.MeshStandardMaterial({ color: 0xa98055, roughness: .9 });
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { const b = new THREE.Mesh(new THREE.BoxGeometry(.56, .42, .95), box); b.position.set(-.29 + j * .58, .37 + i * .43, 0); g.add(b); }
    const w = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.32, 1.0), R.wrap); w.position.y = .145 + .66; g.add(w);
    g.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
    kit.wrapped = g;
  }
  { // empty pallets lying across the aisle (jump)
    const g = new THREE.Group();
    for (let i = 0; i < 6; i++) for (let k = 0; k < 2; k++) { const p = new THREE.Mesh(R.palletGeo, R.wood); p.position.set(-3 + i * 1.2, k * .145, (k ? .05 : 0)); p.rotation.y = k * .05; g.add(p); }
    g.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
    kit.pallets = g;
  }
  { // racking tunnel bay over the aisle (slide)
    const g = new THREE.Group(), y = 1.3;
    for (const x of [-3.55, 3.55]) for (const z of [-.5, .5]) { const u = new THREE.Mesh(new THREE.BoxGeometry(.1, 4.4, .1), R.rackBlue); u.position.set(x, 2.2, z); g.add(u); }
    for (const yy of [y, y + 2.1]) for (const z of [-.5, .5]) { const b = new THREE.Mesh(new THREE.BoxGeometry(7.2, .14, .06), R.rackOrange); b.position.set(0, yy + .07, z); g.add(b); }
    for (const yy of [y, y + 2.1]) for (let i = 0; i < 5; i++) {
      const p = new THREE.Mesh(R.palletGeo, R.wood); p.position.set(-2.8 + i * 1.4, yy + .14, 0); g.add(p);
      const l = new THREE.Mesh(new THREE.BoxGeometry(1.1, .7 + (i % 3) * .2, .95), i % 2 ? R.wrap : R.crate); l.position.set(-2.8 + i * 1.4, yy + .29 + l.geometry.parameters.height / 2, 0); g.add(l);
    }
    const tape = new THREE.Mesh(new THREE.BoxGeometry(7.0, .1, .01), A.hazard); tape.position.set(0, y + .02, .54); g.add(tape);
    g.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
    kit.tunnel = g;
  }
  return kit;
}

export function buildWarehouse(ctx) {
  const { g, R, HALF, u0, uEnd, seg, r } = ctx;
  const H = 9, ZONE = 2.5, RACKD = 1.1, BACK = HALF + ZONE + RACKD + .2;
  const sides = [[-1, ...sideRange(ctx, ctx.left, BACK - HALF)], [1, ...sideRange(ctx, ctx.right, BACK - HALF)]];
  const uprights = [], beams = [], pallets = [], loads = [], loadCols = [], crates = [], wraps = [];
  const col = new THREE.Color();
  for (const [side, a, b] of sides) {
    // floor of the side zone, aisle markings
    const fl = ctx.own(new THREE.Mesh(new THREE.PlaneGeometry(BACK - HALF, b - a), R.floor.warehouse)); fl.rotation.x = -Math.PI / 2; fl.position.set(side * (HALF + (BACK - HALF) / 2), .001, -(a + b) / 2); fl.receiveShadow = true; g.add(fl);
    runAlong(ctx, boxZ(.12, .006), R.yellowPaint, side * (HALF - .1), .003, a, b);
    runAlong(ctx, boxZ(.12, .006), R.yellowPaint, side * (HALF + ZONE - .1), .003, a, b);
    sideWall(ctx, R.cladding, side, a, b, side * BACK, H, 1.2, 1.2);
    // selective pallet racking
    const rx = side * (HALF + ZONE + RACKD / 2);
    Q.identity();
    for (let u = a + .1; u < b - .1; u += 2.7) {
      for (const dx of [-RACKD / 2, RACKD / 2]) { P.set(rx + dx, 4, -u); uprights.push(M4.compose(P, Q, S1).clone()); }
      if (u + 2.7 > b) break;
      for (const ly of [.15, 2.3, 4.45, 6.6]) {
        for (const dx of [-RACKD / 2, RACKD / 2]) { P.set(rx + dx, ly, -(u + 1.35)); beams.push(M4.compose(P, Q, S1).clone()); }
        for (const k of [0, 1]) {
          if (r() < .12) continue;
          const pu = u + .7 + k * 1.3, py = ly + .08;
          P.set(rx, py, -pu); pallets.push(M4.compose(P, Q.setFromAxisAngle(UP, Math.PI / 2), S1).clone()); Q.identity();
          const kind = r(), h = .7 + r() * 1.2;
          const m = M4.compose(P.set(rx, py + .145 + h / 2, -pu), Q, new THREE.Vector3(1.0, h, 1.1)).clone();
          if (kind < .22) crates.push(m); else if (kind < .45) wraps.push(m); else { loads.push(m); loadCols.push(col.setHSL(.07 + r() * .04, .35 + r() * .2, .32 + r() * .2).clone()); }
        }
      }
    }
    // floor clutter in the side zone: crates, wrapped pallets and red pallet jacks
    for (let u = a + 3; u < b - 3; u += 4 + r() * 5) {
      const x = side * (HALF + .9 + r() * (ZONE - 1.6)), roll = r();
      const obj = roll < .4 ? makePalletJack(R) : roll < .7 ? ctx.A.obstacleKit.crate.clone() : ctx.A.obstacleKit.wrapped.clone();
      obj.position.set(x, 0, -u); obj.rotation.y = (r() - .5) * 1.2 + (roll < .4 ? Math.PI / 2 : 0); g.add(obj);
    }
    // forklifts working the side zone
    for (let i = 0; i < 2; i++) {
      const f = makeForklift(R, ctx.A); f.scale.setScalar(1.05);
      const ua = a + 8 + i * (b - a) / 2, ub = Math.min(b - 6, ua + (b - a) / 2 - 10);
      if (ub - ua < 8) continue;
      f.position.set(side * (HALF + ZONE / 2 + .2), 0, -ua);
      g.add(f);
      seg.movers.push({ mesh: f, axisX: side * (HALF + ZONE / 2 + .2), ua, ub, u: ua + r() * (ub - ua), dir: r() < .5 ? 1 : -1, speed: 2.2 + r() * 1.5, phase: r() * 10 });
    }
  }
  instanced(ctx, new THREE.BoxGeometry(.09, 8, .09), R.rackBlue, uprights);
  instanced(ctx, new THREE.BoxGeometry(.06, .13, 2.7), R.rackOrange, beams);
  instanced(ctx, R.palletGeo, R.wood, pallets);
  const li = instanced(ctx, new THREE.BoxGeometry(1, 1, 1), R.load, loads);
  if (li) { loadCols.forEach((c, i) => li.setColorAt(i, c)); li.instanceColor.needsUpdate = true; }
  instanced(ctx, new THREE.BoxGeometry(1, 1, 1), R.crate, crates);
  instanced(ctx, new THREE.BoxGeometry(1, 1, 1), R.wrap, wraps);
  // end wall with a loading-dock roller door
  endWall(ctx, R.cladding, ctx.left ? -HALF : -BACK, ctx.right ? HALF : BACK, uEnd + .01, H, 1.2, 1.2);
  const door = ctx.own(new THREE.Mesh(new THREE.PlaneGeometry(4, 4.5), R.galv)); door.position.set(0, 2.25, -(uEnd - .005)); g.add(door);
  const dz = planeAlong(ctx.own, ctx.A.hazard, 4.2, .25, 5, 1); dz.position.set(0, 4.6, -(uEnd - .006)); g.add(dz);
  ceiling(ctx, R.darkSteel, H, u0, uEnd + BACK - HALF, BACK * 2 + .4, 4);
  const trusses = [], lamps = [];
  Q.identity();
  for (let u = u0 + 2; u < uEnd; u += 6) { P.set(0, H - .5, -u); trusses.push(M4.compose(P, Q, S1).clone()); }
  instanced(ctx, new THREE.BoxGeometry(BACK * 2, .7, .18), R.darkSteel, trusses);
  for (let u = u0 + 3; u < uEnd; u += 7.2) {
    for (const x of [-2.2, 2.2, -HALF - ZONE - .5, HALF + ZONE + .5]) { P.set(x, H - 1.2, -u); lamps.push(M4.compose(P, Q, S1).clone()); }
    seg.fixtures.push({ u, color: 0xfff1d8, intensity: 4.2, y: H - 1.4 });
  }
  instanced(ctx, new THREE.CylinderGeometry(.32, .2, .35, 20), R.darkSteel, lamps);
  instanced(ctx, new THREE.CylinderGeometry(.2, .2, .02, 20).translate(0, -.18, 0), ctx.A.fixtureMat(0xfff1d8), lamps);
}

// ambient forklifts drive up and down the side zones, mast going up and down
export function updateMovers(seg, t, dt) {
  for (const m of seg.movers) {
    if (m.update) { m.update(t, dt); continue; }
    m.u += m.dir * m.speed * dt;
    if (m.u > m.ub) { m.u = m.ub; m.dir = -1; } else if (m.u < m.ua) { m.u = m.ua; m.dir = 1; }
    const f = m.mesh;
    f.position.z = -m.u;
    const target = m.dir > 0 ? 0 : Math.PI;            // forks lead the way
    f.rotation.y += (target - f.rotation.y) * Math.min(1, dt * 3);
    f.userData.carriage.position.y = .3 + (Math.sin(t * .6 + m.phase) * .5 + .5) * 1.6;
    f.userData.head.rotation.y = Math.sin(t * .8 + m.phase) * .5;
    f.userData.beacon.material.emissiveIntensity = 1.5 + Math.max(0, Math.sin(t * 9 + m.phase)) * 4;
  }
}


/* ------------------------------------------------------------------ */
/* Support-wing break table: empty black-coffee cups and cigarettes     */
/* ------------------------------------------------------------------ */
function coffeeTable(R) {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.25, .04, .75), new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: .5 }));
  top.position.y = .74; g.add(top);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(1.27, .025, .77), R.darkSteel); edge.position.y = .715; g.add(edge);
  for (const x of [-.58, .58]) for (const z of [-.33, .33]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(.022, .022, .72, 8), R.steel); l.position.set(x, .36, z); g.add(l); }
  const cupWhite = new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: .7 });
  const coffee = new THREE.MeshStandardMaterial({ color: 0x1a0d06, roughness: .2 });   // dried black-coffee ring at the bottom
  const sleeve = new THREE.MeshStandardMaterial({ color: 0x5a3b22, roughness: .9 });
  const cups = [[-.45, -.18, 0], [-.2, .2, 0], [.08, -.1, 0], [.36, .22, 1], [.5, -.2, 0]];
  for (const [x, z, fallen] of cups) {
    const c = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(.045, .034, .11, 16, 1, true), cupWhite); body.material.side = THREE.DoubleSide; c.add(body);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(.033, 16), coffee); bottom.rotation.x = -Math.PI / 2; bottom.position.y = -.05; c.add(bottom);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(.043, .039, .04, 16, 1, true), sleeve); band.position.y = -.005; c.add(band);
    c.position.set(x, .76 + .055, z);
    if (fallen) { c.rotation.z = Math.PI / 2; c.position.y = .76 + .045; }
    g.add(c);
  }
  // ashtray full of butts
  const tray = new THREE.Mesh(new THREE.CylinderGeometry(.075, .065, .03, 18), new THREE.MeshStandardMaterial({ color: 0x2c2f33, metalness: .6, roughness: .35 }));
  tray.position.set(-.02, .775, .2); g.add(tray);
  const filter = new THREE.MeshStandardMaterial({ color: 0xd98a3a, roughness: .8 }), paper = new THREE.MeshStandardMaterial({ color: 0xf4f2ee, roughness: .8 });
  const ash = new THREE.MeshStandardMaterial({ color: 0x6b6b6b, roughness: 1 });
  for (let i = 0; i < 7; i++) {
    const b = new THREE.Group(), a = i / 7 * 6.28;
    const f = new THREE.Mesh(new THREE.CylinderGeometry(.006, .006, .02, 6), filter); f.position.y = .01; b.add(f);
    const pp = new THREE.Mesh(new THREE.CylinderGeometry(.006, .006, .018 + (i % 3) * .01, 6), paper); pp.position.y = .03; b.add(pp);
    b.rotation.z = Math.PI / 2 - .4; b.rotation.y = a; b.position.set(-.02 + Math.cos(a) * .035, .79, .2 + Math.sin(a) * .035); g.add(b);
  }
  const ashPile = new THREE.Mesh(new THREE.SphereGeometry(.03, 8, 6), ash); ashPile.scale.y = .3; ashPile.position.set(-.02, .79, .2); g.add(ashPile);
  // pack of cigarettes + lighter
  const [pc, pg] = canvas(64, 96); pg.fillStyle = '#f4f4f0'; pg.fillRect(0, 0, 64, 96); pg.fillStyle = '#c0392b'; pg.fillRect(0, 0, 64, 34); pg.fillStyle = '#111'; pg.fillRect(0, 60, 64, 36); pg.fillStyle = '#fff'; pg.font = 'bold 9px Arial'; pg.fillText('SMOKING KILLS', 2, 80);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(.055, .085, .022), new THREE.MeshStandardMaterial({ map: tex(pc), roughness: .5 }));
  pack.rotation.set(-Math.PI / 2, 0, .5); pack.position.set(.25, .772, -.05); g.add(pack);
  const loose = new THREE.Mesh(new THREE.CylinderGeometry(.005, .005, .08, 6), paper); loose.rotation.set(0, .3, Math.PI / 2); loose.position.set(.32, .768, .04); g.add(loose);
  const lighter = new THREE.Mesh(new THREE.BoxGeometry(.025, .07, .012), new THREE.MeshStandardMaterial({ color: 0x1f6fd0, roughness: .3 })); lighter.rotation.set(-Math.PI / 2, 0, -.4); lighter.position.set(.12, .768, .26); g.add(lighter);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

/* ------------------------------------------------------------------ */
/* Hanan's storeroom: GBIC boxes, scrap servers, fibre, red RJ45,       */
/* tall wooden ladders, and Hanan doing a stock count                  */
/* ------------------------------------------------------------------ */
function gbicBoxTexture() {
  const [c, g] = canvas(256, 128);
  g.fillStyle = '#f4f5f6'; g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#1d5fa8'; g.fillRect(0, 0, 256, 30);
  g.fillStyle = '#fff'; g.font = 'bold 20px Arial'; g.fillText('GBIC  1000BASE-SX', 10, 22);
  g.fillStyle = '#222'; g.font = '16px monospace'; g.fillText('SFP-1G-SX  850nm', 10, 56); g.fillText('QTY: 10', 10, 80);
  for (let x = 140; x < 246; x += 3) { g.fillRect(x, 60, Math.random() < .5 ? 1 : 2, 40); }
  return tex(c);
}
function scrapTagTexture() {
  const [c, g] = canvas(256, 64);
  g.fillStyle = '#d62a1e'; g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#fff'; g.font = 'bold 34px Heebo, Arial'; g.textAlign = 'center'; g.fillText('לגריטה ✕', 128, 44);
  return tex(c);
}
function stockLabel(text) {
  const [c, g] = canvas(512, 128);
  g.fillStyle = 'rgba(242,240,216,.96)'; g.fillRect(4, 4, 504, 120);
  g.strokeStyle = '#213b4b'; g.lineWidth = 6; g.strokeRect(4, 4, 504, 120);
  g.fillStyle = '#3b612a'; g.font = '900 34px Heebo, Arial'; g.textAlign = 'center'; g.fillText('חנן — ספירת מלאי', 256, 50);
  g.fillStyle = '#172a38'; g.font = '500 30px Heebo, Arial'; g.fillText(text, 256, 98);
  return tex(c);
}

function storeroomAssets(A, R) {
  R.floor.storeroom = new THREE.MeshStandardMaterial({ map: R.floor.plenum.map, normalMap: R.floor.plenum.normalMap, color: 0x8f8c86, roughness: .55 });
  R.gbicBox = new THREE.MeshStandardMaterial({ map: gbicBoxTexture(), roughness: .6 });
  R.boxSide = new THREE.MeshStandardMaterial({ color: 0xeef0f2, roughness: .7 });
  R.scrapTag = new THREE.MeshStandardMaterial({ map: scrapTagTexture(), roughness: .6 });
  R.shelfGrey = new THREE.MeshStandardMaterial({ color: 0x8a9097, metalness: .6, roughness: .45 });
  R.shelfDeck = new THREE.MeshStandardMaterial({ color: 0x6d737a, metalness: .5, roughness: .55 });
  R.oldServer = new THREE.MeshStandardMaterial({ color: 0x3a3e44, metalness: .5, roughness: .5 });
  R.rjRed = new THREE.MeshStandardMaterial({ color: 0xd11f1f, roughness: .45 });
  R.fibreYellow = new THREE.MeshPhysicalMaterial({ color: 0xf2c200, roughness: .35, clearcoat: .6 });
  R.fibreAqua = new THREE.MeshPhysicalMaterial({ color: 0x19b8c9, roughness: .35, clearcoat: .6 });
  R.spoolWood = new THREE.MeshStandardMaterial({ color: 0xa77b4a, roughness: .85 });
  R.ladderWood = new THREE.MeshStandardMaterial({ color: 0xc89a5e, roughness: .8 });
  R.gbicGeo = (() => { const b = new THREE.BoxGeometry(.32, .14, .22); return b; })();
  R.coilGeo = new THREE.TorusGeometry(.16, .045, 8, 22).rotateX(Math.PI / 2);
}

function woodenLadder(R, h = 4.2) {
  const g = new THREE.Group();
  for (const x of [-.22, .22]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(.06, h, .09), R.ladderWood); rail.position.set(x, h / 2, 0); g.add(rail); }
  for (let y = .3; y < h - .1; y += .3) { const r = new THREE.Mesh(new THREE.CylinderGeometry(.018, .018, .44, 8), R.ladderWood); r.rotation.z = Math.PI / 2; r.position.y = y; g.add(r); }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

function storeroomObstacles(A, R) {
  const kit = {};
  { // stack of GBIC boxes on a trolley
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(.9, .06, .6), R.shelfGrey); base.position.y = .14; g.add(base);
    for (const x of [-.38, .38]) for (const z of [-.24, .24]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, .04, 10), R.rubber); w.rotation.z = Math.PI / 2; w.position.set(x, .05, z); g.add(w); }
    const mats = [R.boxSide, R.boxSide, R.boxSide, R.boxSide, R.gbicBox, R.boxSide];
    for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) { const b = new THREE.Mesh(R.gbicGeo, mats); b.position.set(-.18 + j * .36, .24 + i * .145, (i % 2) * .04); b.rotation.y = (i * .13) % .2; g.add(b); }
    kit.gbics = g;
  }
  { // scrap servers piled on a cart with a red tag
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.0, .06, .8), R.shelfGrey); base.position.y = .18; g.add(base);
    for (let i = 0; i < 5; i++) {
      const sv = new THREE.Mesh(new THREE.BoxGeometry(.9 - (i % 2) * .1, .09 + (i % 3) * .045, .72), R.oldServer);
      sv.position.set((i % 2 - .5) * .06, .25 + i * .13, 0); sv.rotation.y = (i % 3 - 1) * .08; g.add(sv);
    }
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(.5, .13), R.scrapTag); tag.position.set(0, .55, .37); g.add(tag);
    const tag2 = tag.clone(); tag2.rotation.y = Math.PI; tag2.position.z = -.37; g.add(tag2);
    kit.scrap = g;
  }
  { // red RJ45 spaghetti across the floor (jump, stumble)
    const g = new THREE.Group();
    for (let k = 0; k < 6; k++) {
      const pts = [];
      for (let i = 0; i <= 14; i++) pts.push(new THREE.Vector3(-3.5 + i * .5, .03 + Math.abs(Math.sin(i * 1.3 + k)) * .12, Math.sin(i * .9 + k * 2) * .35));
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, .018, 6), k % 3 ? R.rjRed : R.fibreYellow));
    }
    for (const x of [-2.2, .4, 2.6]) { const coil = new THREE.Mesh(R.coilGeo, R.rjRed); coil.scale.setScalar(1.3); coil.position.set(x, .06, .1); g.add(coil); }
    kit.rjmess = g;
  }
  { // fibre spool (dodge)
    const g = new THREE.Group();
    for (const z of [-.28, .28]) { const f = new THREE.Mesh(new THREE.CylinderGeometry(.55, .55, .05, 26), R.spoolWood); f.rotation.x = Math.PI / 2; f.position.set(0, .55, z); g.add(f); }
    const core = new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, .52, 26), R.fibreYellow); core.rotation.x = Math.PI / 2; core.position.y = .55; g.add(core);
    kit.spool = g;
  }
  kit.woodLadder = (() => { const g = new THREE.Group(); const l = woodenLadder(R, 4.2); l.rotation.set(Math.PI / 2, 0, Math.PI / 2); l.position.set(2.1, .06, 0); const l2 = l.clone(); l2.position.x = -2.1; g.add(l, l2); return g; })();
  for (const k of Object.values(kit)) k.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return kit;
}

function hananStockTaker(ctx, x, u, faceRight, count) {
  // Hanan from the start screen, at the shelves with a stock count label
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ transparent: true, alphaTest: .4, roughness: .8, side: THREE.DoubleSide });
  mat.onBeforeCompile = s => { s.fragmentShader = s.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight = mix(outgoingLight, diffuseColor.rgb, .6);\n#include <opaque_fragment>'); };
  const card = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0, .5, 0), mat);
  g.add(card);
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: stockLabel(count), depthWrite: false }));
  label.scale.set(1.5, .375, 1); label.position.y = 2.25; g.add(label);
  g.position.set(x, 0, -u); g.rotation.y = faceRight ? .5 : -.5;
  ctx.g.add(g);
  let tex = null, frame = -1;
  const FR = [[63, 34, 309, 824, 224.1], [476, 34, 309, 824, 635.4], [919, 41, 413, 817, 1090.5], [1328, 45, 336, 813, 1524.9]];
  import('./player.js').then(m => m.loadAtlas('hanan-retro')).then(t => { tex = t.clone(); tex.needsUpdate = true; tex.matrixAutoUpdate = false; mat.map = tex; mat.needsUpdate = true; });
  const seq = [0, 0, 1, 0, 3, 3, 0, 2];
  const phase = Math.random() * 4;
  ctx.seg.movers.push({ update(t) {
    if (!tex) return;
    const f = seq[Math.floor(t * 1.6 + phase) % seq.length];
    if (f === frame) return; frame = f;
    const [x0, y0, w, h, cx] = FR[f];
    tex.matrix.setUvTransform(x0 / 1774, 1 - (y0 + h) / 887, w / 1774, h / 887, 0, 0, 0);
    const mpp = 1.74 / 824;
    card.scale.set(w * mpp, h * mpp, 1); card.position.x = -((cx - x0) / w - .5) * w * mpp;
  } });
}

function buildStoreroom(ctx) {
  const { g, R, HALF, u0, uEnd, seg, r } = ctx;
  const H = 5.6, ZONE = 1.4, DEPTH = .9, BACK = HALF + ZONE + DEPTH + .15;
  const sides = [[-1, ...sideRange(ctx, ctx.left, BACK - HALF)], [1, ...sideRange(ctx, ctx.right, BACK - HALF)]];
  const posts = [], decks = [], gbics = [], servers = [], coils = [], coilsY = [], spoolsList = [], boxes = [];
  Q.identity();
  for (const [side, a, b] of sides) {
    const fl = ctx.own(new THREE.Mesh(new THREE.PlaneGeometry(BACK - HALF, b - a), R.floor.plenum)); fl.rotation.x = -Math.PI / 2; fl.position.set(side * (HALF + (BACK - HALF) / 2), .001, -(a + b) / 2); fl.receiveShadow = true; g.add(fl);
    sideWall(ctx, R.blocks, side, a, b, side * BACK, H, 2.4, 2.4);
    const sx = side * (HALF + ZONE + DEPTH / 2);
    for (let u = a + .1; u < b - .1; u += 1.8) {
      for (const dx of [-DEPTH / 2, DEPTH / 2]) { P.set(sx + dx, 2.25, -u); posts.push(M4.compose(P, Q, S1).clone()); }
      if (u + 1.8 > b) break;
      for (let lv = 0; lv < 5; lv++) {
        const y = .12 + lv * .95;
        P.set(sx, y, -(u + .9)); decks.push(M4.compose(P, Q, S1).clone());
        // what's on this shelf
        const kind = r();
        if (kind < .4) { // GBIC boxes, stacked
          for (let i = 0; i < 5; i++) for (let k = 0; k < 2 + (r() * 3 | 0); k++) {
            P.set(sx + (r() - .5) * .3, y + .1 + k * .145, -(u + .2 + i * .34)); gbics.push(M4.compose(P, Q.setFromAxisAngle(UP, side < 0 ? Math.PI / 2 : -Math.PI / 2), S1).clone());
          }
          Q.identity();
        } else if (kind < .62) { // old servers waiting for scrap
          for (let k = 0; k < 3; k++) { P.set(sx, y + .09 + k * .13, -(u + .9 + (r() - .5) * .2)); servers.push(M4.compose(P, Q, new THREE.Vector3(.75, .11 + (k % 2) * .05, 1.4)).clone()); }
        } else if (kind < .82) { // cable coils: red RJ45 and fibre
          for (let i = 0; i < 4; i++) { P.set(sx + (r() - .5) * .2, y + .1, -(u + .3 + i * .42)); const m = M4.compose(P, Q, S1).clone(); (r() < .6 ? coils : coilsY).push(m); }
        } else if (kind < .9) { // fibre spool
          P.set(sx, y + .45, -(u + .9)); spoolsList.push(M4.compose(P, Q.setFromAxisAngle(UP, Math.PI / 2), new THREE.Vector3(.7, .7, .7)).clone()); Q.identity();
        } else { // plain cartons
          P.set(sx, y + .3, -(u + .9)); boxes.push(M4.compose(P, Q, new THREE.Vector3(.7, .5, 1.3)).clone());
        }
      }
    }
    // tall wooden ladders leaning on the shelves
    for (let u = a + 4 + r() * 6; u < b - 4; u += 9 + r() * 8) {
      const l = woodenLadder(R, 5); l.position.set(side * (HALF + ZONE + .05), 0, -u); l.rotation.set(0, Math.PI / 2, side * -.2); g.add(l);
    }
    // Hanan doing the stock count by the shelves
    for (let u = a + 10 + r() * 10; u < b - 10; u += 40 + r() * 30) {
      const counted = ['GBIC: 1,204 ✓', 'SFP+: 386 ✓', 'לגריטה: 57', 'RJ45 אדום: 912'][r() * 4 | 0];
      hananStockTaker(ctx, side * (HALF + .75), u, side < 0, counted);
    }
    // red RJ45 bundles hanging from the shelf fronts
    for (let u = a + 2; u < b - 2; u += 2.6 + r() * 3) {
      const pts = [new THREE.Vector3(side * (HALF + ZONE - .05), 3.9, -u), new THREE.Vector3(side * (HALF + ZONE - .12), 3.0, -u - .3), new THREE.Vector3(side * (HALF + ZONE - .05), 2.2, -u - .1)];
      const m = ctx.own(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, .03, 6), r() < .7 ? R.rjRed : R.fibreAqua)); m.castShadow = true; g.add(m);
    }
  }
  instanced(ctx, new THREE.BoxGeometry(.07, 4.5, .07), R.shelfGrey, posts);
  instanced(ctx, new THREE.BoxGeometry(DEPTH, .04, 1.8), R.shelfDeck, decks);
  instanced(ctx, R.gbicGeo, [R.boxSide, R.boxSide, R.boxSide, R.boxSide, R.gbicBox, R.boxSide], gbics);
  instanced(ctx, new THREE.BoxGeometry(1, 1, 1), R.oldServer, servers);
  instanced(ctx, R.coilGeo, R.rjRed, coils);
  instanced(ctx, R.coilGeo, R.fibreYellow, coilsY);
  instanced(ctx, new THREE.CylinderGeometry(.55, .55, .55, 20).rotateX(Math.PI / 2), R.fibreYellow, spoolsList);
  instanced(ctx, new THREE.BoxGeometry(1, 1, 1), ctx.A.R.load, boxes);
  endWall(ctx, R.blocks, ctx.left ? -HALF : -BACK, ctx.right ? HALF : BACK, uEnd + .01, H, 2.4, 2.4);
  ceiling(ctx, R.darkSteel, H, u0, uEnd + BACK - HALF, BACK * 2 + .4, 4);
  const lamps = [];
  for (let u = u0 + 1.8; u < uEnd; u += STEP) {
    P.set(0, H - .15, -u); lamps.push(M4.compose(P, Q, S1).clone());
    seg.fixtures.push({ u, color: 0xfff0d6, intensity: 1.5, y: H - .5 });
  }
  instanced(ctx, new THREE.BoxGeometry(.2, .1, 1.5), R.whiteHousing, lamps);
  instanced(ctx, new THREE.BoxGeometry(.14, .03, 1.4).translate(0, -.06, 0), ctx.A.fixtureMat(0xfff0d6), lamps);
}
