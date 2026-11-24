// Scene, camera, lighting and post-processing.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CEILING, THEMES } from './world.js';

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
      q = mobile ? 'smooth' : 'high';
    }
    this.quality = q;
    const high = q === 'high';
    this.pixelRatio = Math.min(devicePixelRatio, high ? 2 : 1.25);
    this.key.shadow.mapSize.set(high ? 2048 : 1024, high ? 2048 : 1024);
    if (this.key.shadow.map) { this.key.shadow.map.dispose(); this.key.shadow.map = null; }
    this.activeLights = high ? 10 : 6;
    this.pool.forEach((l, i) => { l.visible = i < this.activeLights; });
    this.composer.renderTarget1.samples = this.composer.renderTarget2.samples = high ? 4 : 0;
    this.resize();
  }
  setShadows(on) { this.renderer.shadowMap.enabled = on; this.key.castShadow = on; this.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; }); }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setPixelRatio(this.pixelRatio || 1);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.pixelRatio || 1);
    this.composer.setSize(w, h);
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

  update(run, dt, t) {
    const yaw = run.camYaw;
    const fwd = this.tmp.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    const p = run.world;
    const sliding = run.sliding ? 1 : 0;
    const back = run.giant ? 7.5 : 5.4, up = run.giant ? 4.2 : 2.85 - sliding * .35;
    const desired = new THREE.Vector3(p.x - fwd.x * back, up + run.y * .35, p.z - fwd.z * back);
    if (run.mode === 'over') {
      // pull back and look down at the scene
      desired.set(p.x - fwd.x * (back + 2.2), up + 1.4, p.z - fwd.z * (back + 2.2));
    }
    this.camPos.lerp(desired, 1 - Math.exp(-dt * (run.mode === 'over' ? 2 : 14)));
    this.camera.position.copy(this.camPos);
    if (run.shake > 0) {
      const s = run.shake * .12;
      this.camera.position.x += (Math.random() - .5) * s; this.camera.position.y += (Math.random() - .5) * s;
    }
    this.lookAt.set(p.x + fwd.x * 7, 1.1 + run.y * .5, p.z + fwd.z * 7);
    this.camera.lookAt(this.lookAt);
    // lean slightly into lane changes / turns
    this.camera.rotateZ(THREE.MathUtils.clamp(-run.lateralVel * .006, -.05, .05));

    // daylight through the gallery fins: low warm sun from the open side
    const Tk = THEMES[run.seg.theme];
    const sun = Tk.sun ? 1 : 0;
    this.sunMix = THREE.MathUtils.lerp(this.sunMix ?? 0, sun, 1 - Math.exp(-dt * 2));
    const rgt = run.seg.right;
    this.key.position.set(p.x + 1.5 + rgt.x * 9 * this.sunMix, 10 - 3 * this.sunMix, p.z + 2 + rgt.z * 9 * this.sunMix);
    this.key.intensity = THREE.MathUtils.lerp(.55, 2.2, this.sunMix);
    this.key.color.setRGB(1, 1 - .06 * this.sunMix, 1 - .16 * this.sunMix);
    this.hemi.intensity = THREE.MathUtils.lerp(.22, .4, this.sunMix);
    this.scene.environmentIntensity = THREE.MathUtils.lerp(this.scene.environmentIntensity, Tk.env ?? .32, .05);
    this.key.target.position.set(p.x - fwd.x * -2, 0, p.z - fwd.z * -2);
    this.placeLights(run);

    // outage glow behind the runner
    const heat = run.chaserHeat || 0;
    this.outage.position.set(p.x - fwd.x * run.chaserDist, 1.4, p.z - fwd.z * run.chaserDist);
    this.outage.intensity = heat * heat * (14 + Math.sin(t * 18) * 5);

    // theme fog
    const T = THEMES[run.seg.theme];
    this.fogColor.setHex(run.prayer ? 0x9aa6b2 : T.fog);
    this.scene.fog.color.lerp(this.fogColor, 1 - Math.exp(-dt * 1.5));
    this.scene.background.copy(this.scene.fog.color);
    this.scene.fog.density = THREE.MathUtils.lerp(this.scene.fog.density, run.prayer ? .012 : (T.fogDensity ?? .022), .05);
    this.renderer.toneMappingExposure = THREE.MathUtils.lerp(this.renderer.toneMappingExposure, run.prayer ? 1.5 : .95, .05);

    // drift dust (strong airflow in the plenum)
    {
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

  render() { this.composer.render(); }
}
