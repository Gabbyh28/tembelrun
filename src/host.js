// Hanan, the shift manager: stands at the start of the run holding a tray of
// SFP modules, asks you to bring more, and cheers you off.
import * as THREE from 'three';
import FRAMES from './frames.json';
import { loadAtlas } from './player.js';

const ATLAS = 'hanan-retro';
const HEIGHT = 1.74;
const SPOT = { u: 5.2, x: -2.0 };            // on the first aisle, left of the start line
const IDLE = [0, 0, 1, 0, 2, 2, 0, 3];        // talking gesture loop from the original game

export class HananView {
  constructor(scene, assets) {
    this.group = new THREE.Group();
    this.mat = new THREE.MeshStandardMaterial({ transparent: true, alphaTest: .4, roughness: .8, side: THREE.DoubleSide });
    this.mat.onBeforeCompile = s => {
      s.fragmentShader = s.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight = mix(outgoingLight, diffuseColor.rgb, .6);\n#include <opaque_fragment>');
    };
    const geo = new THREE.PlaneGeometry(1, 1); geo.translate(0, .5, 0);
    this.card = new THREE.Mesh(geo, this.mat);
    this.card.castShadow = true;
    this.card.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaTest: .4 });
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.1, .7), new THREE.MeshBasicMaterial({ map: assets.shadowTex, transparent: true, depthWrite: false, opacity: .8 }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = .012;
    this.group.add(this.card, shadow);
    scene.add(this.group);
    this.head = new THREE.Vector3();
    this.frame = -1;
  }

  async load() {
    this.tex = await loadAtlas(ATLAS);
    this.tex.matrixAutoUpdate = false;
    this.mat.map = this.tex; this.card.customDepthMaterial.map = this.tex;
    this.mat.needsUpdate = this.card.customDepthMaterial.needsUpdate = true;
    this.mpp = HEIGHT / FRAMES[ATLAS].frames[0][3];
    // video-made animations (chase run, offering a hand), if present
    this.anims = {};
    for (const k of Object.keys(FRAMES.hanan?.anims || {})) this.anims[k] = await loadAtlas(`hanan-${k}-anim`).catch(() => null);
    this.show(0);
  }

  showAnim(kind, index) {
    const info = FRAMES.hanan.anims[kind], tex = this.anims[kind];
    if (this.mat.map !== tex) { this.mat.map = tex; this.card.customDepthMaterial.map = tex; this.mat.needsUpdate = this.card.customDepthMaterial.needsUpdate = true; }
    const c = THREE.MathUtils.clamp(Math.floor(index), 0, info.count - 1), col = c % info.cols, row = Math.floor(c / info.cols);
    tex.matrixAutoUpdate = false;
    tex.matrix.setUvTransform(col * info.cellW / info.w, 1 - (row + 1) * info.cellH / info.h, info.cellW / info.w, info.cellH / info.h, 0, 0, 0);
    const mpp = HEIGHT / info.bodyPx;
    // the help clip reaches to his left side of the screen, where the fallen runner is
    this.card.scale.set(info.cellW * mpp * (kind === 'help' ? -1 : 1), info.cellH * mpp, 1);
    this.card.position.x = 0;
    this.card.position.y = -info.footPx * mpp;
    this.frame = -1;
  }

  show(i) {
    if (this.mat.map !== this.tex) { this.mat.map = this.tex; this.card.customDepthMaterial.map = this.tex; this.mat.needsUpdate = this.card.customDepthMaterial.needsUpdate = true; this.frame = -1; }
    this.card.position.y = 0;
    if (i === this.frame || !this.tex) return;
    this.frame = i;
    const info = FRAMES[ATLAS], [x, y, w, h, cx] = info.frames[i];
    this.tex.matrix.setUvTransform(x / info.w, 1 - (y + h) / info.h, w / info.w, h / info.h, 0, 0, 0);
    const W = w * this.mpp, H = h * this.mpp;
    this.card.scale.set(W, H, 1);
    this.card.position.x = -((cx - x) / w - .5) * W;
  }

  // Modes: 'help' after a crash (walks over and offers a hand), 'chase' after a
  // stumble (runs after you shouting), otherwise stands at the start line.
  // Returns where to draw his speech bubble, and what he says.
  update(run, t, camera, dt = .016) {
    if (!this.tex) { this.group.visible = false; return null; }
    const fwd = new THREE.Vector3(-Math.sin(run.camYaw), 0, -Math.cos(run.camYaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    let text = null, mode = 'start';
    if (run.mode === 'over' && (run.deathT || 0) > .35) mode = 'help';
    else if (run.mode === 'running' && run.time - run.lastStumble < 6.5) mode = 'chase';
    const P = this.group.position;
    this.card.rotation.z = 0;
    if (mode === 'help') {
      const k = THREE.MathUtils.clamp((run.deathT - .35) / 1.2, 0, 1), e = THREE.MathUtils.smootherstep(k, 0, 1);
      const from = run.world.clone().addScaledVector(fwd, -6).addScaledVector(right, 1.4);
      const to = run.world.clone().addScaledVector(fwd, -.2).addScaledVector(right, 1.05);
      P.lerpVectors(from, to, e).setY(k < 1 ? Math.abs(Math.sin(t * 9)) * .06 : 0);
      if (k < 1 && this.anims.chase) this.showAnim('chase', (t * 24) % FRAMES.hanan.anims.chase.count);
      else if (k >= 1 && this.anims.help) { this.helpT = (this.helpT || 0) + dt; this.showAnim('help', this.helpT * 24); }
      else this.show(k < 1 ? (Math.floor(t * 6) % 2 ? 1 : 0) : 2);              // hand held out
      if (k < 1) this.helpT = 0;
      if (k >= 1) text = 'בוא, אני אעזור לך לקום!';
      this.helpReady = k >= 1;
    } else if (mode === 'chase') {
      const since = run.time - run.lastStumble;
      const back = THREE.MathUtils.clamp(run.chaserDist * .75 + 1.3, 2, 7) + Math.max(0, since - 4.5) * 5;
      P.copy(run.world).addScaledVector(fwd, -back).addScaledVector(right, .95);
      P.y = this.anims.chase ? 0 : Math.abs(Math.sin(t * 11)) * .14;        // running bob (the video run has its own)
      this.card.rotation.z = Math.sin(t * 11) * .05;
      if (this.anims.chase) this.showAnim('chase', (t * 24) % FRAMES.hanan.anims.chase.count);
      else this.show(since < 1.4 ? 2 : (Math.floor(t * 8) % 2 ? 1 : 0));         // reaching out while shouting
      if (since < 2) text = 'תיזהר!';
      this.helpReady = false;
    } else {
      const first = [run.seg, run.oldSeg].find(s => s && s.first);
      if (!first) { this.group.visible = false; return null; }
      first.toWorld(SPOT.u, SPOT.x, 0, P);
      const running = run.mode === 'running' || run.mode === 'over';
      this.show(running && run.u > SPOT.u - 3 ? 2 : IDLE[Math.floor(t * 2) % IDLE.length]);
      if (run.mode === 'ready' || run.mode === 'countdown') text = 'תאסוף לי את ה־SFP בדרך!';
      this.helpReady = false;
    }
    this.mode = mode;
    this.group.visible = true;
    this.group.rotation.y = Math.atan2(camera.position.x - P.x, camera.position.z - P.z);
    this.head.copy(P).setY(P.y + HEIGHT + .25).project(camera);
    if (!text || this.head.z > 1) return null;
    return { x: (this.head.x * .5 + .5) * innerWidth, y: (-this.head.y * .5 + .5) * innerHeight, text };
  }
}
