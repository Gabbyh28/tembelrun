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
    this.show(0);
  }

  show(i) {
    if (i === this.frame || !this.tex) return;
    this.frame = i;
    const info = FRAMES[ATLAS], [x, y, w, h, cx] = info.frames[i];
    this.tex.matrix.setUvTransform(x / info.w, 1 - (y + h) / info.h, w / info.w, h / info.h, 0, 0, 0);
    const W = w * this.mpp, H = h * this.mpp;
    this.card.scale.set(W, H, 1);
    this.card.position.x = -((cx - x) / w - .5) * W;
  }

  // Visible while the first aisle exists; returns the screen position of his head for the speech bubble.
  update(run, t, camera) {
    const first = [run.seg, run.oldSeg].find(s => s && s.first);
    this.group.visible = !!first && !!this.tex;
    if (!this.group.visible) return null;
    first.toWorld(SPOT.u, SPOT.x, 0, this.group.position);
    this.group.rotation.y = Math.atan2(camera.position.x - this.group.position.x, camera.position.z - this.group.position.z);
    const running = run.mode === 'running' || run.mode === 'over';
    // waves you off when you pass him, otherwise keeps talking
    this.show(running && run.u > SPOT.u - 3 ? 2 : IDLE[Math.floor(t * 2) % IDLE.length]);
    this.head.copy(this.group.position).setY(HEIGHT + .25).project(camera);
    if (this.head.z > 1) return null;
    return { x: (this.head.x * .5 + .5) * innerWidth, y: (-this.head.y * .5 + .5) * innerHeight };
  }
}
