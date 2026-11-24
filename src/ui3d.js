// In-world 3D UI: extruded countdown numbers and glowing turn arrows that
// float at each junction.
import * as THREE from 'three';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import fontJson from 'three/examples/fonts/helvetiker_bold.typeface.json';
import { HALF } from './world.js';

const font = new FontLoader().parse(fontJson);

function chevronGeometry() {
  // arrow pointing +x
  const s = new THREE.Shape();
  s.moveTo(-.55, .42); s.lineTo(.05, .42); s.lineTo(.62, 0); s.lineTo(.05, -.42); s.lineTo(-.55, -.42); s.lineTo(-.02, 0); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: .16, bevelEnabled: true, bevelThickness: .05, bevelSize: .04, bevelSegments: 4, curveSegments: 4 });
  g.translate(0, 0, -.08);
  return g;
}

export class UI3D {
  constructor(scene) {
    this.scene = scene;
    this.glow = new THREE.MeshPhysicalMaterial({ color: 0xb7ff3c, emissive: 0x7fdc12, emissiveIntensity: 1.6, metalness: .35, roughness: .22, clearcoat: 1, clearcoatRoughness: .1 });
    this.chosen = new THREE.MeshPhysicalMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 2.2, metalness: .2, roughness: .2, clearcoat: 1 });
    this.side = new THREE.MeshStandardMaterial({ color: 0x2f5a07, metalness: .6, roughness: .35 });

    // turn arrows: a pair of triple chevrons
    this.arrows = new THREE.Group();
    const chev = chevronGeometry();
    this.arrowSides = {};
    for (const dir of ['left', 'right']) {
      const g = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(chev, [this.glow, this.side]);
        m.position.x = i * .5; m.userData.i = i;
        g.add(m);
      }
      g.rotation.y = dir === 'left' ? Math.PI : 0;
      this.arrowSides[dir] = g;
      this.arrows.add(g);
    }
    this.arrows.visible = false;
    this.arrows.scale.setScalar(1.45);
    scene.add(this.arrows);

    // countdown text
    this.count = new THREE.Group();
    this.count.visible = false;
    scene.add(this.count);
    this.countMat = new THREE.MeshPhysicalMaterial({ color: 0xb7ff3c, emissive: 0x6fd010, emissiveIntensity: 1.2, metalness: .55, roughness: .18, clearcoat: 1, clearcoatRoughness: .05, transparent: true });
    this.countSide = new THREE.MeshStandardMaterial({ color: 0x1d3a06, metalness: .7, roughness: .3, transparent: true });
    this.countCache = {};
    this.countT = 0;
  }

  textMesh(label) {
    if (!this.countCache[label]) {
      const g = new TextGeometry(label, { font, size: label.length > 1 ? .9 : 1.3, depth: .32, curveSegments: 6, bevelEnabled: true, bevelThickness: .06, bevelSize: .035, bevelSegments: 4 });
      g.computeBoundingBox(); const b = g.boundingBox;
      g.translate(-(b.max.x + b.min.x) / 2, -(b.max.y + b.min.y) / 2, -.16);
      this.countCache[label] = new THREE.Mesh(g, [this.countMat, this.countSide]);
    }
    return this.countCache[label];
  }

  showCount(label) {
    this.count.clear();
    this.count.add(this.textMesh(label));
    this.count.visible = true;
    this.countStart = performance.now();
    this.countLabel = label;
  }

  update(run, t, dt, camera) {
    // countdown floats ahead of the runner, spins in and pops
    if (this.count.visible) {
      const k = (performance.now() - this.countStart) / 1000, go = this.countLabel === 'GO!';
      const fwd = new THREE.Vector3(-Math.sin(run.camYaw), 0, -Math.cos(run.camYaw));
      this.count.position.copy(run.world).addScaledVector(fwd, 4.2).setY(2.05);
      this.count.quaternion.copy(camera.quaternion);
      const pop = k < .18 ? THREE.MathUtils.smootherstep(k / .18, 0, 1) * 1.15 : 1.15 - Math.min(.15, (k - .18) * .6);
      this.count.scale.setScalar(Math.max(.001, pop * (go ? 1.1 : 1)));
      this.count.rotateY((1 - Math.min(1, k / .3)) * Math.PI * .9);
      const fade = THREE.MathUtils.clamp(1 - (k - (go ? .7 : .55)) / .2, 0, 1);
      this.countMat.opacity = this.countSide.opacity = fade;
      if (fade <= 0) this.count.visible = false;
    }

    // turn arrows over the junction
    const hint = run.mode === 'running' && run.turnHint && run.turnHint();
    this.arrows.visible = !!hint;
    if (!hint) return;
    const s = run.seg;
    s.toWorld(s.length, 0, 2.05, this.arrows.position);
    this.arrows.rotation.y = s.yaw;
    const appear = THREE.MathUtils.clamp(1 - (hint.distance - 24) / 16, 0, 1);
    for (const dir of ['left', 'right']) {
      const g = this.arrowSides[dir];
      const open = hint[dir];
      g.visible = open && !(hint.queued && hint.queued !== dir);
      if (!g.visible) continue;
      const chosen = hint.queued === dir;
      g.position.x = (dir === 'left' ? -1 : 1) * (.7 + (chosen ? Math.min(1.4, (this.chosenT = (this.chosenT || 0) + dt) * 4) : 0));
      g.children.forEach(m => {
        // a wave runs along the three chevrons toward the open side
        const w = .5 + .5 * Math.sin(t * 7 - m.userData.i * 1.3);
        m.material = chosen ? [this.chosen, this.side] : [this.glow, this.side];
        m.scale.setScalar(appear * (chosen ? 1.25 : .85 + w * .25));
        m.position.y = Math.sin(t * 3 + m.userData.i * .6) * .06;
      });
    }
    if (!hint.queued) this.chosenT = 0;
    this.glow.emissiveIntensity = 1.2 + Math.sin(t * 7) * .5;
  }
}
