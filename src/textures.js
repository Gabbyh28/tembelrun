// Procedural, physically-based textures for the data center.
// Everything is drawn on canvases at load time: albedo, emissive (LEDs),
// roughness and a height map that is converted to a normal map.
import * as THREE from 'three';

export const rand = seed => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

// Sobel height -> tangent space normal map.
export function heightToNormal(src, strength = 2) {
  const w = src.width, h = src.height;
  const s = src.getContext('2d').getImageData(0, 0, w, h).data;
  const [c, g] = canvas(w, h);
  const out = g.createImageData(w, h);
  const H = (x, y) => s[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x - 1, y) + H(x - 1, y + 1));
    const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x, y - 1) + H(x + 1, y - 1));
    let nx = -dx * strength, ny = dy * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * w + x) * 4;
    out.data[i] = (nx * .5 + .5) * 255; out.data[i + 1] = (ny * .5 + .5) * 255; out.data[i + 2] = (nz * .5 + .5) * 255; out.data[i + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  return c;
}

export function tex(c, { srgb = true, repeat = false, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

export function noise(g, w, h, r, amount, alpha = .05) {
  for (let i = 0; i < amount; i++) {
    const v = r() * 255 | 0;
    g.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
  }
}

/* ---------------- Raised floor: 2x2 tiles of 60cm ---------------- */
export function floorTextures(aniso) {
  const S = 1024, T = S / 2, r = rand(7);
  const [c, g] = canvas(S, S), [hc, hg] = canvas(S, S), [rc, rg] = canvas(S, S);
  hg.fillStyle = '#808080'; hg.fillRect(0, 0, S, S);
  rg.fillStyle = '#7a7a7a'; rg.fillRect(0, 0, S, S);
  for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
    const x = tx * T, y = ty * T, perforated = (tx + ty) % 2 === 0;
    const base = perforated ? 182 : 196 + r() * 8;
    g.fillStyle = `rgb(${base},${base + 1},${base + 3})`; g.fillRect(x, y, T, T);
    // anti-static speckle
    for (let i = 0; i < 2600; i++) {
      const v = base + (r() - .5) * 46 | 0;
      g.fillStyle = `rgba(${v},${v},${v + 2},.55)`;
      g.fillRect(x + r() * T, y + r() * T, 1.5, 1.5);
    }
    if (perforated) {
      // 25% open-area airflow tile
      const n = 22, step = (T - 60) / n;
      for (let iy = 0; iy < n; iy++) for (let ix = 0; ix < n; ix++) {
        const px = x + 30 + ix * step + step / 2, py = y + 30 + iy * step + step / 2;
        g.fillStyle = '#2a2c30'; g.beginPath(); g.arc(px, py, step * .3, 0, 7); g.fill();
        g.fillStyle = 'rgba(255,255,255,.25)'; g.beginPath(); g.arc(px - .8, py - .8, step * .3, 3.6, 5.4); g.fill();
        hg.fillStyle = '#202020'; hg.beginPath(); hg.arc(px, py, step * .3, 0, 7); hg.fill();
        rg.fillStyle = '#d0d0d0'; rg.beginPath(); rg.arc(px, py, step * .3, 0, 7); rg.fill();
      }
    }
    // worn scuffs in the walking line
    for (let i = 0; i < 26; i++) {
      g.strokeStyle = `rgba(60,60,70,${.03 + r() * .05})`; g.lineWidth = 1 + r() * 3;
      g.beginPath(); const sx = x + r() * T, sy = y + r() * T; g.moveTo(sx, sy); g.lineTo(sx + (r() - .5) * 90, sy + (r() - .5) * 30); g.stroke();
      rg.strokeStyle = 'rgba(90,90,90,.4)'; rg.lineWidth = 4; rg.beginPath(); rg.moveTo(sx, sy); rg.lineTo(sx + 40, sy + 10); rg.stroke();
    }
    // bevelled edge trim
    g.strokeStyle = 'rgba(40,42,46,.95)'; g.lineWidth = 5; g.strokeRect(x + 2.5, y + 2.5, T - 5, T - 5);
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2; g.strokeRect(x + 7, y + 7, T - 14, T - 14);
    hg.strokeStyle = '#000'; hg.lineWidth = 6; hg.strokeRect(x + 3, y + 3, T - 6, T - 6);
    hg.strokeStyle = '#9a9a9a'; hg.lineWidth = 6; hg.strokeRect(x + 10, y + 10, T - 20, T - 20);
    rg.strokeStyle = '#e0e0e0'; rg.lineWidth = 6; rg.strokeRect(x + 3, y + 3, T - 6, T - 6);
  }
  noise(rg, S, S, r, 9000, .12);
  const map = tex(c, { repeat: true, aniso }), normalMap = tex(heightToNormal(hc, 3), { srgb: false, repeat: true, aniso });
  const roughnessMap = tex(rc, { srgb: false, repeat: true, aniso });
  return { map, normalMap, roughnessMap };
}

/* ---------------- Rack fronts ---------------- */
const RW = 384, RH = 1408, U = 28, TOPPAD = 76; // px; 42U ≈ 1176px

function screw(g, x, y) {
  g.fillStyle = '#6b6f76'; g.beginPath(); g.arc(x, y, 3.2, 0, 7); g.fill();
  g.strokeStyle = '#2a2c30'; g.lineWidth = 1; g.beginPath(); g.moveTo(x - 2, y); g.lineTo(x + 2, y); g.stroke();
}

function led(g, e, x, y, color, size = 2.2) {
  g.fillStyle = color; g.beginPath(); g.arc(x, y, size, 0, 7); g.fill();
  e.fillStyle = color; e.beginPath(); e.arc(x, y, size * 1.2, 0, 7); e.fill();
  const grd = e.createRadialGradient(x, y, 0, x, y, size * 5);
  grd.addColorStop(0, color.replace('rgb', 'rgba').replace(')', ',.45)')); grd.addColorStop(1, 'rgba(0,0,0,0)');
  e.fillStyle = grd; e.fillRect(x - size * 5, y - size * 5, size * 10, size * 10);
}

const PALETTES = {
  hall: { ok: ['rgb(60,255,120)', 'rgb(70,170,255)', 'rgb(60,255,120)'], warn: 'rgb(255,170,40)', accent: ['#2b6cb0', '#3a3f47', '#1f2328'] },
  core: { ok: ['rgb(60,255,120)', 'rgb(255,190,60)', 'rgb(60,255,120)'], warn: 'rgb(255,120,40)', accent: ['#3d434b', '#2a2e34', '#1d2025'] },
  cold: { ok: ['rgb(80,200,255)', 'rgb(80,200,255)', 'rgb(60,255,170)'], warn: 'rgb(255,80,80)', accent: ['#cfd5dc', '#3a3f47', '#9aa3ad'] },
  power: { ok: ['rgb(60,255,120)', 'rgb(255,200,60)', 'rgb(60,255,120)'], warn: 'rgb(255,60,40)', accent: ['#c9ccd0', '#33373d', '#8d949c'] },
};

function drawServer(g, e, h, x, y, w, units, r, pal) {
  const H = units * U - 2;
  const shade = 26 + r() * 14 | 0;
  const face = r() < .25 ? pal.accent[0] : `rgb(${shade},${shade + 2},${shade + 6})`;
  g.fillStyle = face; g.fillRect(x, y, w, H);
  h.fillStyle = '#b0b0b0'; h.fillRect(x, y, w, H);
  // top highlight + bottom shadow (bevel)
  g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(x, y, w, 2);
  g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(x, y + H - 2, w, 2);
  // rack ears
  screw(g, x + 8, y + H / 2); screw(g, x + w - 8, y + H / 2);
  const bays = units >= 2 ? (r() < .5 ? 12 : 8) : (r() < .5 ? 8 : 4);
  const rows = units >= 4 ? 3 : units >= 2 ? 2 : 1;
  const bayW = (w * .62) / (bays / rows), bayH = (H - 10) / rows - 3;
  for (let ry = 0; ry < rows; ry++) for (let i = 0; i < bays / rows; i++) {
    const bx = x + 20 + i * bayW, by = y + 5 + ry * (bayH + 3);
    const caddy = r() < .08 ? '#151618' : `rgb(${120 + r() * 20 | 0},${124 + r() * 20 | 0},${130 + r() * 20 | 0})`;
    g.fillStyle = caddy; g.fillRect(bx, by, bayW - 3, bayH);
    g.fillStyle = 'rgba(0,0,0,.45)';
    for (let k = 0; k < bayH - 6; k += 3) g.fillRect(bx + 3, by + 3 + k, bayW * .55, 1);
    g.fillStyle = '#d8dce2'; g.fillRect(bx + bayW - 9, by + 2, 4, bayH - 4);
    h.fillStyle = '#e0e0e0'; h.fillRect(bx, by, bayW - 3, bayH);
    h.fillStyle = '#707070'; for (let k = 0; k < bayH - 6; k += 3) h.fillRect(bx + 3, by + 3 + k, bayW * .55, 1);
    led(g, e, bx + bayW - 7, by + bayH - 4, r() < .06 ? pal.warn : pal.ok[r() * pal.ok.length | 0], 1.4);
  }
  // vent grille
  const vx = x + 20 + w * .64, vw = w - (vx - x) - 34;
  g.fillStyle = '#0c0d0f'; g.fillRect(vx, y + 4, vw, H - 8);
  h.fillStyle = '#404040'; h.fillRect(vx, y + 4, vw, H - 8);
  g.fillStyle = 'rgba(90,96,104,.9)';
  for (let yy = y + 6; yy < y + H - 6; yy += 4) for (let xx = vx + (yy % 8 ? 2 : 0); xx < vx + vw - 2; xx += 4) g.fillRect(xx, yy, 2.4, 2.4);
  // power / health LEDs
  led(g, e, x + w - 22, y + 8, pal.ok[1], 2);
  if (units > 1) led(g, e, x + w - 22, y + 18, r() < .1 ? pal.warn : pal.ok[0], 2);
  if (r() < .3) { g.fillStyle = '#e8e8e2'; g.fillRect(x + 20, y + H - 7, 26, 5); } // asset tag
}

function drawSwitch(g, e, h, x, y, w, r, pal, cables) {
  const H = U - 2;
  g.fillStyle = '#1b1e22'; g.fillRect(x, y, w, H); h.fillStyle = '#a8a8a8'; h.fillRect(x, y, w, H);
  screw(g, x + 8, y + H / 2); screw(g, x + w - 8, y + H / 2);
  const ports = 24, pw = (w - 70) / (ports / 2);
  for (let row = 0; row < 2; row++) for (let i = 0; i < ports / 2; i++) {
    const px = x + 22 + i * pw, py = y + 3 + row * 11;
    g.fillStyle = '#9da3ab'; g.fillRect(px, py, pw - 3, 9);
    g.fillStyle = '#050505'; g.fillRect(px + 1, py + 1, pw - 5, 7);
    h.fillStyle = '#202020'; h.fillRect(px + 1, py + 1, pw - 5, 7);
    if (r() < .75) {
      led(g, e, px + 2, py + (row ? 9 : 0), r() < .85 ? pal.ok[0] : pal.ok[1], 1.1);
      if (cables) cables.push([px + pw / 2 - 1.5, py + 5, row]);
    }
  }
  for (let i = 0; i < 4; i++) { g.fillStyle = '#c2c8cf'; g.fillRect(x + w - 46 + i * 8, y + 5, 6, 16); }
}

function drawPatchCables(g, h, cables, r, palette) {
  for (const [cx, cy, row] of cables) {
    const col = palette[r() * palette.length | 0];
    g.strokeStyle = col; g.lineWidth = 3.2; g.lineCap = 'round';
    const side = cx < RW / 2 ? -1 : 1, drop = 30 + r() * 80;
    g.beginPath(); g.moveTo(cx, cy);
    g.bezierCurveTo(cx, cy + drop * .7, cx + side * (20 + r() * 30), cy + drop, side < 0 ? 18 + r() * 6 : RW - 18 - r() * 6, cy + drop + 30);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 1; g.stroke();
    h.strokeStyle = '#ffffff'; h.lineWidth = 3; h.stroke && (h.beginPath(), h.moveTo(cx, cy), h.bezierCurveTo(cx, cy + drop * .7, cx + side * 25, cy + drop, side < 0 ? 20 : RW - 20, cy + drop + 30), h.stroke());
  }
}

function drawUPS(g, e, h, x, y, w, hh, r, pal) {
  g.fillStyle = pal.accent[0]; g.fillRect(x, y, w, hh);
  h.fillStyle = '#c0c0c0'; h.fillRect(x, y, w, hh);
  for (let i = 0; i < 4000; i++) { const v = 180 + r() * 40 | 0; g.fillStyle = `rgba(${v},${v},${v},.15)`; g.fillRect(x + r() * w, y + r() * hh, 2, 2); }
  // panel seams
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x, y + hh * .32, w, 2); g.fillRect(x, y + hh * .7, w, 2);
  h.fillStyle = '#505050'; h.fillRect(x, y + hh * .32, w, 3); h.fillRect(x, y + hh * .7, w, 3);
  // LCD
  const lx = x + w * .2, ly = y + 70, lw = w * .6, lh = 80;
  g.fillStyle = '#0a1612'; g.fillRect(lx - 4, ly - 4, lw + 8, lh + 8);
  g.fillStyle = 'rgb(40,220,170)'; g.fillRect(lx, ly, lw, lh);
  e.fillStyle = 'rgb(30,170,140)'; e.fillRect(lx, ly, lw, lh);
  g.fillStyle = '#0a3328'; e.fillStyle = '#062019';
  for (let i = 0; i < 5; i++) { const tw = lw * (.3 + r() * .55); g.fillRect(lx + 8, ly + 10 + i * 14, tw, 6); e.fillRect(lx + 8, ly + 10 + i * 14, tw, 6); }
  for (let i = 0; i < 3; i++) led(g, e, x + w * .3 + i * 30, ly + lh + 22, i === 2 && r() < .3 ? pal.warn : pal.ok[i % pal.ok.length], 3);
  // louvres
  for (let yy = y + hh * .74; yy < y + hh - 20; yy += 9) {
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(x + 30, yy, w - 60, 4);
    h.fillStyle = '#404040'; h.fillRect(x + 30, yy, w - 60, 4);
  }
  // hazard label
  g.fillStyle = '#f2c400'; g.beginPath(); g.moveTo(x + w / 2, y + hh * .4); g.lineTo(x + w / 2 + 26, y + hh * .4 + 44); g.lineTo(x + w / 2 - 26, y + hh * .4 + 44); g.fill();
  g.fillStyle = '#111'; g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.fillText('!', x + w / 2, y + hh * .4 + 40);
  g.strokeStyle = '#8a9099'; g.lineWidth = 6; g.beginPath(); g.moveTo(x + w - 30, y + hh * .45); g.lineTo(x + w - 30, y + hh * .62); g.stroke();
}

function drawCRAH(g, e, h, x, y, w, hh, r) {
  g.fillStyle = '#d4d8dc'; g.fillRect(x, y, w, hh); h.fillStyle = '#c0c0c0'; h.fillRect(x, y, w, hh);
  for (let yy = y + 40; yy < y + hh * .55; yy += 8) { g.fillStyle = 'rgba(40,46,54,.8)'; g.fillRect(x + 24, yy, w - 48, 4); h.fillStyle = '#303030'; h.fillRect(x + 24, yy, w - 48, 4); }
  const lx = x + w * .3, ly = y + hh * .62;
  g.fillStyle = '#081218'; g.fillRect(lx, ly, w * .4, 50);
  g.fillStyle = 'rgb(60,170,255)'; g.fillRect(lx + 6, ly + 6, w * .4 - 12, 38); e.fillStyle = 'rgb(40,130,220)'; e.fillRect(lx + 6, ly + 6, w * .4 - 12, 38);
  g.fillStyle = '#04263f'; g.font = 'bold 22px monospace'; g.textAlign = 'center'; g.fillText('18.2°C', lx + w * .2, ly + 33);
  e.fillStyle = '#021220'; e.font = 'bold 22px monospace'; e.textAlign = 'center'; e.fillText('18.2°C', lx + w * .2, ly + 33);
  g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x + w / 2 - 1, y + hh * .75, 2, hh * .25);
}

function perforatedDoor(g, h, w, hh, r) {
  // the classic 80% open hex-perforated door: draw the metal web between holes
  g.save();
  g.fillStyle = 'rgba(14,15,17,.42)';
  const s = 7;
  for (let y = 0; y < hh; y += s * .87) for (let x = ((y / (s * .87)) & 1) * s / 2; x < w; x += s) {
    g.fillRect(x, y, s, 1.6); g.fillRect(x, y, 1.6, s * .87);
  }
  g.restore();
  h.fillStyle = 'rgba(255,255,255,.18)';
  for (let y = 0; y < hh; y += s * .87) for (let x = ((y / (s * .87)) & 1) * s / 2; x < w; x += s) { h.fillRect(x, y, s, 1.6); h.fillRect(x, y, 1.6, s * .87); }
}

export function rackFrontTextures(theme, variant, aniso) {
  const r = rand(1000 + variant * 97 + theme.length * 13);
  const pal = PALETTES[theme];
  const [c, g] = canvas(RW, RH), [ec, e] = canvas(RW, RH), [hc, h] = canvas(RW, RH);
  g.fillStyle = '#0b0c0e'; g.fillRect(0, 0, RW, RH);
  e.fillStyle = '#000'; e.fillRect(0, 0, RW, RH);
  h.fillStyle = '#5a5a5a'; h.fillRect(0, 0, RW, RH);
  const x = 30, w = RW - 60;
  let ports = [];
  // mounting rails
  g.fillStyle = '#2c3036'; g.fillRect(x - 10, 0, 10, RH); g.fillRect(x + w, 0, 10, RH);
  for (let yy = TOPPAD; yy < RH - 40; yy += U / 3) { g.fillStyle = '#0d0e10'; g.fillRect(x - 7, yy, 4, 4); g.fillRect(x + w + 3, yy, 4, 4); }

  if (theme === 'power' && variant % 2 === 0) {
    drawUPS(g, e, h, 8, 8, RW - 16, RH - 16, r, pal);
  } else if (theme === 'cold' && variant === 0) {
    drawCRAH(g, e, h, 8, 8, RW - 16, RH - 16, r);
  } else {
    let y = TOPPAD;
    const cables = [];
    const end = RH - 80;
    while (y < end) {
      const roll = r();
      let units;
      if (theme === 'core' && roll < .55) { drawSwitch(g, e, h, x, y, w, r, pal, cables); units = 1; }
      else if (roll < .12) { // blanking / cable management
        units = 1 + (r() * 2 | 0);
        g.fillStyle = '#121315'; g.fillRect(x, y, w, units * U - 2);
        g.fillStyle = 'rgba(255,255,255,.05)'; for (let k = 0; k < units * U - 6; k += 5) g.fillRect(x + 16, y + 3 + k, w - 32, 1);
      } else if (roll < .2 && theme !== 'core') { drawSwitch(g, e, h, x, y, w, r, pal, cables); units = 1; }
      else {
        units = r() < .45 ? 1 : r() < .75 ? 2 : 4;
        if (y + units * U > end) units = 1;
        drawServer(g, e, h, x, y, w, units, r, pal);
      }
      y += units * U;
      if (theme === 'power' && y > RH * .5) break;
    }
    // patch cords are real 3D geometry now (see world.js); keep the port positions
    ports = cables.map(([px, py]) => ({ x: (px / RW - .5) * .6, y: (.5 - py / RH) * 2.2 }));
    if (theme === 'power') drawUPS(g, e, h, x, RH * .52, w, RH * .45, r, pal);
  }
  // door frame + perforated door (rear-lit gives depth)
  perforatedDoor(g, h, RW, RH, r);
  g.strokeStyle = '#17191c'; g.lineWidth = 16; g.strokeRect(8, 8, RW - 16, RH - 16);
  g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 2; g.strokeRect(14, 14, RW - 28, RH - 28);
  h.strokeStyle = '#ffffff'; h.lineWidth = 16; h.strokeRect(8, 8, RW - 16, RH - 16);
  // handle + lock
  g.fillStyle = '#4a4f57'; g.fillRect(RW - 30, RH * .42, 10, 120); g.fillStyle = '#8d939c'; g.fillRect(RW - 28, RH * .42 + 4, 4, 112);
  h.fillStyle = '#ffffff'; h.fillRect(RW - 30, RH * .42, 10, 120);
  // label strip on top
  g.fillStyle = '#e9e9e4'; g.fillRect(RW / 2 - 60, 26, 120, 26);
  g.fillStyle = '#1a1a1a'; g.font = 'bold 18px monospace'; g.textAlign = 'center';
  g.fillText(`${'ABCDEFGH'[variant % 8]}${String(10 + (r() * 80 | 0)).padStart(2, '0')}-R${variant + 1}`, RW / 2, 45);
  const rough = canvas(RW, RH); rough[1].fillStyle = '#9a9a9a'; rough[1].fillRect(0, 0, RW, RH); noise(rough[1], RW, RH, r, 6000, .1);
  return {
    map: tex(c, { aniso }),
    emissiveMap: tex(ec, { aniso }),
    normalMap: tex(heightToNormal(hc, 2.2), { srgb: false, aniso }),
    roughnessMap: tex(rough[0], { srgb: false, aniso }),
    ports,
  };
}

/* ---------------- Misc surfaces ---------------- */
export function metalTexture(aniso, base = 38) {
  const r = rand(3), [c, g] = canvas(256, 256);
  g.fillStyle = `rgb(${base},${base + 2},${base + 6})`; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4000; i++) { const v = base + (r() - .5) * 18 | 0; g.fillStyle = `rgba(${v},${v},${v + 3},.5)`; g.fillRect(r() * 256, r() * 256, 2, 2); }
  const [rc, rg] = canvas(256, 256); rg.fillStyle = '#8c8c8c'; rg.fillRect(0, 0, 256, 256); noise(rg, 256, 256, r, 5000, .18);
  return { map: tex(c, { repeat: true, aniso }), roughnessMap: tex(rc, { srgb: false, repeat: true, aniso }) };
}

export function containmentTexture(aniso) {
  // smoked polycarbonate panels with aluminium frames (hot-aisle containment)
  const [c, g] = canvas(256, 512), [ec, e] = canvas(256, 512);
  const grd = g.createLinearGradient(0, 0, 0, 512);
  grd.addColorStop(0, '#0f1318'); grd.addColorStop(1, '#1a2028');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 18; i++) { g.strokeStyle = `rgba(160,190,220,${.02 + Math.random() * .05})`; g.lineWidth = 8 + Math.random() * 30; g.beginPath(); const x = Math.random() * 300 - 40; g.moveTo(x, 0); g.lineTo(x + 90, 512); g.stroke(); }
  g.strokeStyle = '#8a929c'; g.lineWidth = 10; g.strokeRect(0, 0, 256, 512);
  g.fillStyle = '#8a929c'; g.fillRect(0, 250, 256, 8);
  e.fillStyle = '#000'; e.fillRect(0, 0, 256, 512);
  return { map: tex(c, { repeat: true, aniso }), emissiveMap: tex(ec, { repeat: true, aniso }) };
}

export function ceilingTexture(aniso) {
  const r = rand(11), [c, g] = canvas(512, 512);
  g.fillStyle = '#1d2026'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 3000; i++) { const v = 25 + r() * 20 | 0; g.fillStyle = `rgba(${v},${v},${v + 4},.6)`; g.fillRect(r() * 512, r() * 512, 3, 3); }
  g.strokeStyle = '#33373e'; g.lineWidth = 6; for (let i = 0; i <= 512; i += 256) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.moveTo(0, i); g.lineTo(512, i); g.stroke(); }
  return tex(c, { repeat: true, aniso });
}

export function ladderTexture(aniso) {
  const [c, g] = canvas(128, 512);
  g.clearRect(0, 0, 128, 512);
  g.fillStyle = '#9aa1aa'; g.fillRect(0, 0, 10, 512); g.fillRect(118, 0, 10, 512);
  for (let y = 10; y < 512; y += 64) { g.fillRect(0, y, 128, 9); }
  const t = tex(c, { repeat: true, aniso });
  return t;
}

export function hazardTexture(aniso) {
  const [c, g] = canvas(256, 64);
  g.fillStyle = '#f2c200'; g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#141414';
  for (let x = -64; x < 300; x += 48) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 24, 0); g.lineTo(x + 24 + 64, 64); g.lineTo(x + 64, 64); g.fill(); }
  return tex(c, { repeat: true, aniso });
}

export function signTexture(text, sub, color = '#7fd1ff') {
  const [c, g] = canvas(1024, 192);
  g.fillStyle = '#0b0f14'; g.fillRect(0, 0, 1024, 192);
  g.strokeStyle = color; g.lineWidth = 6; g.strokeRect(10, 10, 1004, 172);
  g.fillStyle = color; g.font = '700 86px "Segoe UI", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 512, 84);
  g.globalAlpha = .7; g.font = '500 34px "Segoe UI", Arial, sans-serif'; g.fillText(sub, 512, 150);
  return tex(c, { aniso: 4 });
}

export function blobShadowTexture() {
  const [c, g] = canvas(128, 128);
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(0,0,0,.75)'); grd.addColorStop(.5, 'rgba(0,0,0,.35)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  return tex(c, { srgb: false });
}

export function glowTexture(color = '255,255,255') {
  const [c, g] = canvas(128, 128);
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, `rgba(${color},1)`); grd.addColorStop(.25, `rgba(${color},.45)`); grd.addColorStop(1, `rgba(${color},0)`);
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  return tex(c);
}

export function qsfpLabelTexture() {
  const [c, g] = canvas(256, 64);
  g.fillStyle = '#d9dde2'; g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#1a1a1a'; g.font = 'bold 26px monospace'; g.fillText('QSFP28 100G', 14, 30);
  g.font = '16px monospace'; g.fillText('SR4 850nm  MMF', 14, 52);
  return tex(c);
}

// QSFP module top plate: brushed nickel, the raised cover plate, screw holes,
// the heat-sink slot at the back. The bottom-left corner stays plain metal and is
// what the side faces sample.
export function qsfpTopTexture() {
  const W = 256, H = 640;
  const [c, g] = canvas(W, H);
  const r = rand(77);
  g.fillStyle = '#cdd0d3'; g.fillRect(0, 0, W, H);
  // brushed along the length
  for (let i = 0; i < 900; i++) { const x = r() * W, a = .01 + r() * .025; g.fillStyle = r() < .5 ? `rgba(255,255,255,${a})` : `rgba(40,40,40,${a})`; g.fillRect(x, 0, 1 + r() * 1.5, H); }
  // raised cover plate (rear 3/4) with a soft shadowed edge
  const top = 40, bot = 470;
  g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(10, top, W - 20, 5); g.fillRect(10, bot - 2, W - 20, 4);
  g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(10, top, 4, bot - top); g.fillRect(W - 14, top, 4, bot - top);
  g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(14, top + 5, W - 28, 2);
  // heat-sink slot near the back
  g.fillStyle = '#2b2d30'; g.fillRect(W - 70, top + 22, 26, 150);
  g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(W - 70, top + 22, 26, 3);
  // screw holes
  const hole = (x, y) => { g.fillStyle = '#1b1c1e'; g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.arc(x + 1.5, y + 1.5, 6, .2, 1.4); g.lineWidth = 1.5; g.strokeStyle = 'rgba(255,255,255,.4)'; g.stroke(); };
  hole(60, 250); hole(190, 330); hole(34, bot - 20); hole(W - 34, bot - 20);
  // front collar area (under the blue latch) slightly darker
  g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, bot + 20, W, H - bot - 20);
  return tex(c);
}

// Front of the LC duplex receptacle: two square ports with their latch tabs.
export function qsfpPortTexture() {
  const [c, g] = canvas(256, 128);
  g.fillStyle = '#a9adb1'; g.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 200; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * .05})`; g.fillRect(Math.random() * 256, 0, 1, 128); }
  g.fillStyle = '#8d9196'; g.fillRect(14, 10, 228, 108);
  for (const x of [40, 140]) {
    g.fillStyle = '#d4d6d9'; g.fillRect(x - 6, 22, 88, 88);
    g.fillStyle = '#24262a'; g.fillRect(x, 30, 76, 74);
    g.fillStyle = '#3a3d42'; g.fillRect(x + 8, 38, 60, 60);
    g.fillStyle = '#e3e5e7'; g.fillRect(x + 26, 18, 24, 14);    // latch tab
    g.fillStyle = '#0d0e10'; g.beginPath(); g.arc(x + 38, 70, 7, 0, 7); g.fill();   // ferrule bore
  }
  return tex(c);
}
