// Photographed character rendered as a camera-facing card with per-frame
// cropping (so feet always sit on the floor), scene lighting and a soft
// contact shadow.
import * as THREE from 'three';
import FRAMES from './frames.json';

const loader = new THREE.TextureLoader();
const cache = {};
export function loadAtlas(name) {
  if (!cache[name]) {
    cache[name] = new Promise((resolve, reject) => loader.load(`${import.meta.env.BASE_URL}assets/characters/${name}.webp`, t => {
      t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
      resolve(t);
    }, undefined, reject));
  }
  return cache[name];
}

export class PlayerView {
  constructor(scene, assets) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.geo = new THREE.PlaneGeometry(1, 1);
    this.geo.translate(0, .5, 0);
    this.mat = new THREE.MeshStandardMaterial({
      transparent: true, alphaTest: .35, roughness: .8, metalness: 0, side: THREE.DoubleSide,
      emissive: 0xffffff, emissiveIntensity: 0, depthWrite: true,
    });
    // lit by the scene from a soft "facing" normal so the photo keeps its own shading
    this.mat.onBeforeCompile = s => {
      s.uniforms.uTint = this.tint;
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uTint;')
        .replace('#include <opaque_fragment>', 'outgoingLight = mix(outgoingLight, diffuseColor.rgb * uTint, .55);\n#include <opaque_fragment>');
    };
    this.tint = { value: new THREE.Color(1, 1, 1) };
    this.card = new THREE.Mesh(this.geo, this.mat);
    this.card.castShadow = true;
    this.card.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaTest: .35 });
    this.group.add(this.card);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: assets.shadowTex, transparent: true, depthWrite: false, opacity: .85 }));
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = .012; this.shadow.renderOrder = 1;
    this.group.add(this.shadow);
    // rim glow used by power-ups
    this.aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: assets.glow, color: 0x66ccff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    this.aura.scale.set(3, 3.6, 1); this.aura.position.y = 1;
    this.group.add(this.aura);
    scene.add(this.group);
    this.atlases = {};
    // Avichai's gas: soft green clouds puffing out behind the giant (world space)
    {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d');
      for (let i = 0; i < 7; i++) {
        const x = 40 + Math.random() * 48, y = 40 + Math.random() * 48, r = 22 + Math.random() * 20;
        const grd = g.createRadialGradient(x, y, 0, x, y, r); grd.addColorStop(0, 'rgba(255,255,255,.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
      }
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      this.gas = Array.from({ length: 70 }, () => {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }));
        s.visible = false; s.userData = { life: 0 }; scene.add(s); return s;
      });
      this.gasClock = 0; this.gasNext = 0;
    }
    this.current = null;
  }

  async setCharacter(ch) {
    this.character = ch;
    const names = [ch.atlas, ch.atlas + '-run', ch.rollAtlas, ch.powerAtlas].filter(Boolean);
    await Promise.all(names.map(async n => { this.atlases[n] = await loadAtlas(n); }));
    const info = FRAMES[ch.atlas];
    const idle = info.frames[11];
    this.metersPerPx = ch.height / idle[3];
    this.showFrame(ch.atlas, 11);
  }

  // 24-frame interpolated run cycle: fixed-size cells aligned at the feet
  showRun(index, scale = 1) {
    const info = FRAMES[this.character.atlas].run, name = this.character.atlas + '-run';
    const tex = this.atlases[name];
    if (this.mat.map !== tex) { this.mat.map = tex; this.mat.needsUpdate = true; this.card.customDepthMaterial.map = tex; this.card.customDepthMaterial.needsUpdate = true; }
    const c = index % info.count, col = c % info.cols, row = Math.floor(c / info.cols);
    tex.matrixAutoUpdate = false;
    tex.matrix.setUvTransform(col * info.cellW / info.w, 1 - (row + 1) * info.cellH / info.h, info.cellW / info.w, info.cellH / info.h, 0, 0, 0);
    const mpp = this.character.height / info.bodyPx;
    this.card.scale.set(info.cellW * mpp * scale, info.cellH * mpp * scale, 1);
    this.card.position.x = 0;
    this.footOffset = info.footPx * mpp * scale;
  }

  showFrame(atlas, index, scale = 1) {
    this.footOffset = 0;
    const info = FRAMES[atlas];
    const [x, y, w, h, cx] = info.frames[index];
    const tex = this.atlases[atlas];
    if (this.mat.map !== tex) { this.mat.map = tex; this.mat.needsUpdate = true; this.card.customDepthMaterial.map = tex; this.card.customDepthMaterial.needsUpdate = true; }
    // crop via UV transform on a per-frame basis
    tex.matrixAutoUpdate = false;
    tex.matrix.setUvTransform(x / info.w, 1 - (y + h) / info.h, w / info.w, h / info.h, 0, 0, 0);
    let mpp = this.metersPerPx;
    if (atlas !== this.character.atlas) {
      // power atlases are drawn at a different scale: normalise their height
      mpp = atlas.includes('roll') ? 1.25 / h : (this.character.height * 1.02) / (FRAMES[atlas].frames[0][3] * .98);
    }
    const W = w * mpp * scale, H = h * mpp * scale;
    this.card.scale.set(W, H, 1);
    // keep the body's centre of mass on the lane centre
    this.card.position.x = -((cx - x) / w - .5) * W;
    this.frameH = H;
  }

  updateGas(run, dt, camera) {
    const active = run.giant && run.mode === 'running';
    const fwd = new THREE.Vector3(-Math.sin(run.camYaw), 0, -Math.cos(run.camYaw));
    if (active) {
      this.gasClock += dt;
      while (this.gasClock >= .1) {
        this.gasClock -= .1;
        const s = this.gas[this.gasNext++ % this.gas.length], d = s.userData;
        const side = new THREE.Vector3(-fwd.z, 0, fwd.x);
        s.position.copy(run.world).addScaledVector(side, (Math.random() - .5) * .5).setY(1.05 * (this.scaleNow || 1) + run.y);
        d.vel = fwd.clone().multiplyScalar(-3.2 - Math.random()).addScaledVector(side, (Math.random() - .5) * 1.7).setY(.55);
        d.life = d.total = 1.55; d.size = .85 + Math.random() * .3; d.tone = Math.random();
        s.visible = true;
      }
    }
    for (const s of this.gas) {
      const d = s.userData; if (!s.visible) continue;
      d.life -= dt; if (d.life <= 0) { s.visible = false; continue; }
      const age = 1 - d.life / d.total;
      s.position.addScaledVector(d.vel, dt);
      s.scale.setScalar(d.size * (1 + age * 1.6) * 2.1);
      s.material.color.setRGB(.44 + d.tone * .1, .64, .21);
      s.material.opacity = .85 * (1 - age) * Math.min(1, age * 8);
      s.material.rotation += dt * (d.tone - .5);
    }
  }

  update(run, t, camera, dt) {
    const ch = this.character;
    if (!ch) return;
    this.updateGas(run, dt, camera);
    // grow/shrink smoothly into the giant power
    this.scaleNow = THREE.MathUtils.damp(this.scaleNow ?? 1, run.giant ? 1.55 : 1, 6, dt);
    const scale = this.scaleNow;
    // squash & stretch on take-off and landing
    const air = run.y > .02 && !run.sliding;
    if (air && !this.wasAir) this.squash = -1;          // stretch
    if (!air && this.wasAir) this.squash = 1;           // squash
    if (run.sliding && !this.wasSliding) this.squash = .8;
    this.wasAir = air; this.wasSliding = run.sliding;
    this.squash = THREE.MathUtils.damp(this.squash || 0, 0, 9, dt);
    if (run.rolling && ch.rollAtlas) {
      const f = Math.floor(run.distance * .9) % 8;
      this.showFrame(ch.rollAtlas, f, scale);
    } else if (run.mode === 'over' || run.mode === 'ready' || run.mode === 'countdown') {
      this.showFrame(ch.atlas, run.mode === 'over' ? 9 : 11, scale);
    } else if (run.y > .05 && !run.sliding) {
      this.showFrame(ch.atlas, 8, scale);
    } else if (run.sliding) {
      this.showFrame(ch.atlas, 9, scale);
    } else if (run.elastic && ch.powerAtlas) {
      this.showFrame(ch.powerAtlas, Math.floor(run.distance / 1.4) % 4, scale);
    } else if (FRAMES[ch.atlas].run && this.atlases[ch.atlas + '-run']) {
      // one full stride cycle every ~5.6 m, 24 frames
      this.showRun(Math.floor(run.distance / 5.6 * 24), scale);
    } else {
      this.showFrame(ch.atlas, Math.floor(run.distance / .72) % 8, scale);
    }
    const sq = this.squash, idle = run.mode === 'ready' || run.mode === 'countdown';
    this.card.scale.x *= 1 + sq * .07;
    this.card.scale.y *= (1 - sq * .09) * (idle ? 1 + Math.sin(t * 2.2) * .006 : 1);
    this.group.position.copy(run.world);
    this.card.position.y = run.y + (run.rolling ? .05 : 0) - (this.footOffset || 0);
    // face the camera around the vertical axis only
    this.group.rotation.y = Math.atan2(camera.position.x - run.world.x, camera.position.z - run.world.z);
    // lean into lane changes
    this.card.rotation.z = THREE.MathUtils.damp(this.card.rotation.z, -run.lateralVel * .03 + (air ? -run.vy * .004 : 0), 12, dt);
    const sh = 1.1 * scale * (1 - Math.min(.6, run.y * .25));
    this.shadow.scale.set(sh * (run.rolling ? 1.2 : .9), sh * .7, 1);
    this.shadow.material.opacity = .8 - Math.min(.5, run.y * .2);
    // aura when a power is active / prayer glow
    const target = run.powerRemaining > 0 ? .55 + Math.sin(t * 8) * .1 : 0;
    this.aura.material.opacity = THREE.MathUtils.lerp(this.aura.material.opacity, target, .1);
    this.aura.visible = this.aura.material.opacity > .01;
    this.aura.material.color.set(run.prayer ? 0xffffff : run.giant ? 0x9be15d : 0x66ccff);
    this.aura.scale.set(3 * scale, 3.6 * scale, 1);
    this.mat.emissiveIntensity = run.prayer ? .25 : 0;
    // the giant goes a little see-through so the aisle ahead stays readable
    this.mat.opacity = THREE.MathUtils.lerp(1, .62, THREE.MathUtils.clamp((scale - 1) / .55, 0, 1));
    // tint the photo to the local light, red when the outage is close
    const danger = run.chaserHeat || 0;
    this.tint.value.setRGB(1 + danger * .5, 1 - danger * .35, 1 - danger * .4);
  }
}
