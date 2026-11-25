// Scene, camera, lighting and post-processing.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CEILING, THEMES, HALF } from './world.js';

const FilmShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uDanger: { value: 0 }, uVignette: { value: .9 }, uAberration: { value: .0012 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uDanger, uVignette, uAberration; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uTime) * 43758.5453); }
    void main(){
      vec2 c = vUv - .5; float r = dot(c, c);
      vec2 off = c * (uAberration + uDanger * .004) * (1. + r * 4.);
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      col *= mix(1., smoothstep(.85, .1, r * uVignette * 2.2), .75);
      float pulse = .5 + .5 * sin(uTime * 9.);
      col += vec3(.9, .05, .02) * uDanger * smoothstep(.08, .5, r) * (.35 + .25 * pulse);
      col += (h(vUv * 800.) - .5) * .025;
      gl_FragColor = vec4(col, 1.);
    }`,
};

export class View {
  constructor(canvas, quality) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = .95;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05080c);
    this.scene.fog = new THREE.FogExp2(0x0a0f15, .02);
    this.camera = new THREE.PerspectiveCamera(62, 1, .1, 220);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
    this.scene.environmentIntensity = .32;

    this.hemi = new THREE.HemisphereLight(0xbcd2ff, 0x2a2622, .22);
    this.scene.add(this.hemi);
    // overhead key light that follows the runner (gives contact shadows)
    this.key = new THREE.DirectionalLight(0xffffff, .55);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    const sc = this.key.shadow.camera; sc.left = -9; sc.right = 9; sc.top = 14; sc.bottom = -14; sc.near = 1; sc.far = 30;
    this.key.shadow.bias = -.0004; this.key.shadow.normalBias = .03; this.key.shadow.radius = 4;
    this.scene.add(this.key, this.key.target);
    // pooled point lights placed under the nearest ceiling fixtures
    this.pool = [];
    for (let i = 0; i < 10; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 13, 2);
      this.scene.add(l); this.pool.push(l);
    }
    // the outage: red rolling light behind the runner
    this.outage = new THREE.PointLight(0xff2a14, 0, 14, 2);
    this.scene.add(this.outage);
    // events: head torch for the blackout, rotating red beacon for alarms
    this.torch = new THREE.SpotLight(0xfff2dd, 0, 34, .5, .45, 1.4);
    this.scene.add(this.torch, this.torch.target);
    this.beacon = new THREE.PointLight(0xff2010, 0, 18, 2);
    this.scene.add(this.beacon);
    // FM-200 discharge: soft white clouds pouring out of the ceiling
    {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const x = c.getContext('2d'), grd = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      grd.addColorStop(0, 'rgba(255,255,255,.9)'); grd.addColorStop(.5, 'rgba(255,255,255,.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = grd; x.fillRect(0, 0, 64, 64);
      const map = new THREE.CanvasTexture(c);
      this.gas = [];
      for (let i = 0; i < 26; i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: 0xe6ebf0, transparent: true, opacity: 0, depthWrite: false }));
        sp.visible = false; sp.userData = { life: 0 }; this.scene.add(sp); this.gas.push(sp);
      }
    }

    // airborne dust catching the light: world-anchored, wrapped in a box around the runner
    {
      const N = 700, pos = new Float32Array(N * 3);
      this.dustSeed = Array.from({ length: N }, () => [Math.random() * 14, Math.random() * 3.8 + .2, Math.random() * 40, Math.random() * 6.28]);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const c = document.createElement('canvas'); c.width = c.height = 32;
      const x = c.getContext('2d'), grd = x.createRadialGradient(16, 16, 0, 16, 16, 16);
      grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = grd; x.fillRect(0, 0, 32, 32);
      this.dust = new THREE.Points(g, new THREE.PointsMaterial({ size: .028, map: new THREE.CanvasTexture(c), transparent: true, opacity: .5, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xcfe0ff }));
      this.dust.frustumCulled = false;
      this.scene.add(this.dust);
    }

    this.composer = new EffectComposer(this.renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), .42, .5, .9);
    this.composer.addPass(this.bloom);
    this.film = new ShaderPass(FilmShader);
    this.composer.addPass(this.film);
    this.composer.addPass(new OutputPass());

    this.fogColor = new THREE.Color(0x0a0f15);
    this.tmp = new THREE.Vector3();
    this.camPos = new THREE.Vector3(0, 3, 6);
    this.lookAt = new THREE.Vector3();
    this.setQuality(quality);
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  setQuality(q) {
    if (q === 'auto') {
      const mobile = matchMedia('(pointer:coarse)').matches || Math.min(screen.width, screen.height) < 700;
      q = mobile ? 'phone' : 'high';
    }
    this.quality = q;
    const high = q === 'high', phone = q === 'phone';
    // resolution range the adaptive scaler may move within
    this.prMax = Math.min(devicePixelRatio, high ? 2 : phone ? 2 : 1.25);
    this.prMin = high ? 1 : phone ? .7 : .75;
    this.pixelRatio = Math.min(this.prMax, high ? 2 : phone ? 1.5 : 1.25);
    const sm = high ? 2048 : 1024;
    this.key.shadow.mapSize.set(sm, sm);
    if (this.key.shadow.map) { this.key.shadow.map.dispose(); this.key.shadow.map = null; }
    this.activeLights = high ? 10 : phone ? 4 : 6;
    this.pool.forEach((l, i) => { l.visible = i < this.activeLights; });
    this.composer.renderTarget1.samples = this.composer.renderTarget2.samples = high ? 4 : 0;
    this.dust && (this.dust.visible = !phone, this.dust.geometry.drawRange.count = high ? Infinity : 350);
    this.adaptT = 0; this.adaptN = 0; this.goodWindows = 0;
    this.resize();
  }

  // Adaptive resolution: keep ~60 fps by nudging the render scale every 1.5 s.
  adapt(dt) {
    if (dt > .25) return;                       // tab switch / hitch
    this.adaptT += dt; this.adaptN++;
    if (this.adaptT < 1.5) return;
    const avg = this.adaptT / this.adaptN;
    this.adaptT = 0; this.adaptN = 0;
    let pr = this.pixelRatio;
    if (avg > 1 / 50) { pr = Math.max(this.prMin, pr - (avg > 1 / 35 ? .25 : .12)); this.goodWindows = 0; }
    else if (avg < 1 / 58) { if (++this.goodWindows >= 3) { pr = Math.min(this.prMax, pr + .1); this.goodWindows = 0; } }
    if (Math.abs(pr - this.pixelRatio) > .01) { this.pixelRatio = pr; this.resize(); }
  }
  setShadows(on) { this.renderer.shadowMap.enabled = on; this.key.castShadow = on; this.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; }); }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setPixelRatio(this.pixelRatio || 1);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.pixelRatio || 1);
    this.composer.setSize(w, h);
    // glow at half resolution on phones: big saving, almost invisible difference
    if (this.quality === 'phone') { const pr = this.pixelRatio || 1; this.bloom.setSize(Math.round(w * pr / 2), Math.round(h * pr / 2)); }
    this.camera.aspect = w / h;
    // keep the aisle readable in portrait
    this.camera.fov = w < h ? 74 : 62;
    this.camera.updateProjectionMatrix();
  }

  // Place pooled lights under the nearest fixtures ahead of the runner.
  placeLights(run) {
    const cand = [];
    const add = (seg, uMin, uMax, offset) => {
      for (const f of seg.fixtures) if (f.u > uMin && f.u < uMax) cand.push({ seg, f, d: Math.abs(f.u - run.u - offset - 5) });
    };
    const s = run.seg;
    add(s, run.u - 8, run.u + 45, 0);
    if (s.length - run.u < 45) for (const c of Object.values(s.children)) add(c, -1, 30, 0);
    if (run.oldSeg) add(run.oldSeg, run.oldSeg.length - 12, run.oldSeg.length + 6, 0);
    cand.sort((a, b) => a.d - b.d);
    const prayer = run.prayer ? 1.8 : 1;
    this.pool.forEach((l, i) => {
      const c = cand[i];
      if (!c || i >= this.activeLights) { l.intensity = 0; return; }
      c.seg.toWorld(c.f.u, 0, c.f.y ?? CEILING - .7, l.position);
      l.color.setHex(c.f.color);
      l.intensity = 9 * c.f.intensity * prayer;
    });
  }

  // Keep the camera inside walkable space: the current aisle (incl. its junction
  // square) or the aisle just left. Otherwise it swings through corner walls on turns.
  constrain(v, run) {
    const m = .45;
    const inside = (s, minU, maxU) => { const l = s.toLocal(v); return Math.abs(l.x) <= HALF - m && l.u >= minU && l.u <= maxU ? l : null; };
    const s = run.seg;
    if (inside(s, s.first ? -1e9 : -HALF + m, s.length + HALF - m)) return;
    if (run.oldSeg && inside(run.oldSeg, -1e9, run.oldSeg.length + HALF - m)) return;
    const l = s.toLocal(v);
    const u = THREE.MathUtils.clamp(l.u, s.first ? -1e9 : -HALF + m, s.length + HALF - m), x = THREE.MathUtils.clamp(l.x, -HALF + m, HALF - m);
    const y = v.y; s.toWorld(u, x, y, v);
  }

  // stay under the lowest ceiling around (the gallery slab is only 3.7 m)
  ceilingClamp(v, run) {
    // camMax keeps the camera under the services that run along the aisle centre
    const lim = th => (th.camMax ?? (th.height ?? 4.6) - .35);
    const hs = [lim(THEMES[run.seg.theme])]; if (run.oldSeg) hs.push(lim(THEMES[run.oldSeg.theme]));
    v.y = Math.min(v.y, Math.min(...hs));
  }

  update(run, dt, t) {
    const yaw = run.camYaw;
    const fwd = this.tmp.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    const p = run.world;
    const sliding = run.sliding ? 1 : 0;
    const back = run.giant ? 8.2 : 5.4, up = run.giant ? 3.3 : 2.85 - sliding * .35;
    // rise with the jump so the runner never hides the aisle ahead (and with the zip line)
    this.zipMix = THREE.MathUtils.damp(this.zipMix || 0, run.riding === 'zip' ? 1 : 0, 3, dt);
    const desired = new THREE.Vector3(p.x - fwd.x * back, up + run.y * (.4 - .1 * this.zipMix), p.z - fwd.z * back);
    if (run.mode === 'over') {
      // pull back and look down at the scene
      desired.set(p.x - fwd.x * (back + 2.2), up + 1.4, p.z - fwd.z * (back + 2.2));
    }
    this.constrain(desired, run);
    this.camPos.lerp(desired, 1 - Math.exp(-dt * (run.mode === 'over' ? 2 : 14)));
    this.constrain(this.camPos, run);
    this.ceilingClamp(this.camPos, run);
    this.camera.position.copy(this.camPos);
    if (run.shake > 0) {
      const s = run.shake * .12;
      this.camera.position.x += (Math.random() - .5) * s; this.camera.position.y += (Math.random() - .5) * s;
    }
    const ahead = run.giant ? 13 : 8;
    this.lookAt.set(p.x + fwd.x * ahead, (run.giant ? 1.6 : 1.1) + run.y * (.15 + .4 * this.zipMix), p.z + fwd.z * ahead);
    this.camera.lookAt(this.lookAt);
    // lean slightly into lane changes / turns
    this.camera.rotateZ(THREE.MathUtils.clamp(-run.lateralVel * .006, -.05, .05));

    // daylight through the gallery fins: low warm sun from the open side
    const Tk = THEMES[run.seg.theme];
    const sun = Tk.sun ? 1 : 0;
    this.sunMix = THREE.MathUtils.lerp(this.sunMix ?? 0, sun, 1 - Math.exp(-dt * 2));
    const rgt = run.seg.right;
    this.key.position.set(p.x + 1.5 + rgt.x * 9 * this.sunMix, 10 - 3 * this.sunMix, p.z + 2 + rgt.z * 9 * this.sunMix);
    this.key.intensity = THREE.MathUtils.lerp(.55, 1.6, this.sunMix);
    this.key.color.setRGB(1, 1 - .06 * this.sunMix, 1 - .16 * this.sunMix);
    this.hemi.intensity = THREE.MathUtils.lerp(.22, .55, this.sunMix);
    this.hemi.color.setHex(this.sunMix > .5 ? 0xe4efff : 0xbcd2ff);
    this.scene.environmentIntensity = THREE.MathUtils.lerp(this.scene.environmentIntensity, (Tk.env ?? .32) * (run.eventKind === 'blackout' ? 1 - (run.eventK || 0) * .75 : 1), .05);
    this.key.target.position.set(p.x - fwd.x * -2, 0, p.z - fwd.z * -2);
    this.placeLights(run);
    this.updateEvent(run, dt, t, p, fwd);

    // outage glow behind the runner
    const heat = run.chaserHeat || 0;
    this.outage.position.set(p.x - fwd.x * run.chaserDist, 1.4, p.z - fwd.z * run.chaserDist);
    this.outage.intensity = heat * heat * (14 + Math.sin(t * 18) * 5);

    // theme fog
    const T = THEMES[run.seg.theme];
    const ek = run.eventK || 0, gas = run.eventKind === 'fm200' ? ek : 0, dark = run.eventKind === 'blackout' ? ek : 0;
    this.fogColor.setHex(run.prayer ? 0x9aa6b2 : T.fog);
    if (gas) this.fogColor.lerp(this.gasColor ||= new THREE.Color(0x8d959c), gas);
    if (dark) this.fogColor.multiplyScalar(1 - dark * .85);
    this.scene.fog.color.lerp(this.fogColor, 1 - Math.exp(-dt * 1.5));
    this.scene.background.copy(this.scene.fog.color);
    this.scene.fog.density = THREE.MathUtils.lerp(this.scene.fog.density, (run.prayer ? .012 : (T.fogDensity ?? .022)) + gas * .022, .05);
    this.renderer.toneMappingExposure = THREE.MathUtils.lerp(this.renderer.toneMappingExposure, run.prayer ? 1.5 : (Tk.exposure ?? .95), .05);

    // drift dust (strong airflow in the plenum)
    if (this.dust.visible) {
      const ws = (T.wind || 0) * dt;
      this.wind ||= { x: 0, z: 0 };
      this.wind.x -= run.seg.fwd.x * ws; this.wind.z -= run.seg.fwd.z * ws;
      const a = this.dust.geometry.attributes.position, S = this.dustSeed;
      for (let i = 0; i < S.length; i++) {
        const s = S[i];
        const wx = s[0] + Math.sin(t * .2 + s[3]) * .4 + this.wind.x, wz = s[2] + t * .15 + this.wind.z, wy = s[1] + Math.sin(t * .3 + s[3] * 2) * .15;
        const lx = ((wx - p.x) % 14 + 14) % 14 - 7, lz = ((wz - p.z) % 40 + 40) % 40 - 20;
        a.setXYZ(i, p.x + lx, wy, p.z + lz);
      }
      a.needsUpdate = true;
    }
    this.film.uniforms.uTime.value = t;
    const danger = THREE.MathUtils.smoothstep(heat, .45, 1);
    this.film.uniforms.uDanger.value = THREE.MathUtils.lerp(this.film.uniforms.uDanger.value, danger * (run.mode === 'running' || run.mode === 'over' ? 1 : 0), .1);
  }

  // blackout: lights die, the runner's head torch comes on, red beacons spin;
  // FM-200: sirens, strobes and gas pouring from the ceiling
  updateEvent(run, dt, t, p, fwd) {
    const k = run.eventK || 0, kind = run.eventKind;
    const dark = kind === 'blackout' ? k : 0, gas = kind === 'fm200' ? k : 0;
    if (dark > 0) {
      for (const l of this.pool) l.intensity *= 1 - dark * .93;
      this.hemi.intensity *= 1 - dark * .8;
      this.key.intensity *= 1 - dark * .85;
    }
    this.darkness = dark;
    // head torch from just above the runner's head, aimed down the aisle
    this.torch.intensity = dark * 140;
    this.torch.position.set(p.x - fwd.x * .6, 2.1 + run.y, p.z - fwd.z * .6);
    this.torch.target.position.set(p.x + fwd.x * 14, .3 + run.y * .5, p.z + fwd.z * 14);
    // beacon rides ahead of the runner and flashes
    const alarm = Math.max(dark, gas);
    this.beacon.position.set(p.x + fwd.x * 9 + Math.cos(t * 6) * 1.5, 3.3, p.z + fwd.z * 9 + Math.sin(t * 6) * 1.5);
    this.beacon.intensity = alarm * (Math.sin(t * 9) > 0 ? 14 : 2);
    // gas clouds
    for (const sp of this.gas) {
      const d = sp.userData;
      if (d.life <= 0) {
        if (gas > .2 && Math.random() < dt * 14) {
          const side = (Math.random() - .5) * 6;
          d.life = d.total = 2.2 + Math.random();
          const ah = 11 + Math.random() * 16;
          sp.position.set(p.x + fwd.x * ah + fwd.z * side, 4.2, p.z + fwd.z * ah - fwd.x * side);
          d.vy = -1.2 - Math.random(); sp.visible = true;
        } else { sp.visible = false; continue; }
      }
      d.life -= dt;
      const a = 1 - d.life / d.total;
      sp.position.y = Math.max(.6, sp.position.y + d.vy * dt);
      sp.scale.setScalar(1.2 + a * 4.5);
      sp.material.opacity = .32 * Math.sin(Math.PI * Math.min(1, a)) * Math.max(gas, .3);
    }
  }

  render() {
    // phones refresh the shadow map every other frame
    if (this.quality === 'phone') { this.renderer.shadowMap.autoUpdate = false; this.renderer.shadowMap.needsUpdate = (this.frameN = (this.frameN || 0) + 1) % 2 === 0; }
    else this.renderer.shadowMap.autoUpdate = true;
    this.composer.render();
  }
}
