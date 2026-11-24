// A different soundtrack for every world, synthesised live with Web Audio.
// The first server hall keeps the original track; the others are generated
// loops (tempo, key, groove and instruments chosen to fit the room).
const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);

// step patterns are 16 steps; numbers are scale degrees, null = rest
const STYLES = {
  core: { bpm: 124, root: 45, scale: [0, 3, 5, 7, 10], kick: 'x...x...x...x...', hat: '..x...x...x...x.', bass: [0, null, 0, 7, null, 0, 3, null, 0, null, 0, 7, null, 5, 3, null], arp: [0, 2, 4, 2, 1, 3, 4, 3], arpWave: 'square', pad: [0, 3, 7], lead: .05 },
  gallery: { bpm: 84, root: 50, scale: [0, 2, 4, 7, 9], kick: 'x.....x...x.....', hat: '....x.......x...', bass: [0, null, null, null, 4, null, null, null, 3, null, null, null, 2, null, null, null], arp: [4, null, 2, null, 3, null, 1, null], arpWave: 'triangle', pad: [0, 4, 7, 11], lead: .04, swing: .12 },
  plenum: { bpm: 100, root: 43, scale: [0, 2, 3, 7, 8], kick: 'x.......x.......', hat: 'x.x.x.x.x.x.x.x.', bass: [0, null, null, 0, null, null, 3, null, 0, null, null, 0, null, null, 4, null], arp: [0, 4, 3, 4], arpWave: 'sine', pad: [0, 3, 7, 10], lead: .035, air: .05 },
  cold: { bpm: 110, root: 52, scale: [0, 2, 3, 7, 10], kick: 'x...x...x...x...', hat: '..x...x...x...x.', bass: [0, null, null, null, 0, null, 3, null, 0, null, null, null, 4, null, 3, null], arp: [4, 3, 2, 3, 4, 2, 1, 2], arpWave: 'sine', bell: true, pad: [0, 3, 7], lead: .05 },
  warehouse: { bpm: 118, root: 41, scale: [0, 3, 5, 6, 7, 10], kick: 'x..x..x...x..x..', hat: '..x...x...x...x.', clap: '....x.......x...', bass: [0, null, 0, 3, null, 0, 5, 4, 0, null, 0, 3, null, 5, 4, 3], arp: [0, null, 3, null], arpWave: 'sawtooth', pad: [0, 3, 7], lead: .03 },
  storeroom: { bpm: 128, root: 48, scale: [0, 2, 4, 5, 7, 9], kick: 'x...x...x...x...', hat: 'x.x.x.x.x.x.x.x.', clap: '....x.......x...', bass: [0, null, 4, null, 2, null, 4, null, 3, null, 5, null, 4, null, 2, null], arp: [0, 2, 4, 5, 4, 2], arpWave: 'square', pizz: true, pad: [0, 4, 7], lead: .045 },
  generator: { bpm: 130, root: 38, scale: [0, 1, 3, 5, 7, 8], kick: 'x..xx...x..xx...', hat: '..x...x...x...x.', clap: '....x.......x...', bass: [0, 0, null, 0, 1, null, 0, null, 0, 0, null, 0, 3, null, 1, null], arp: [0, null, null, 1], arpWave: 'sawtooth', dist: true, pad: [0, 1, 7], lead: .04 },
  power: { bpm: 140, root: 44, scale: [0, 1, 4, 5, 7, 8, 11], kick: 'x...x...x...x...', hat: 'xxxxxxxxxxxxxxxx', bass: [0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 4, 4, 3, 3], arp: [0, 4, 6, 4], arpWave: 'square', pad: [0, 4, 7], lead: .04 },
};

export class Music {
  constructor(audio) {
    this.audio = audio;
    this.style = null;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
  }
  ensure() {
    const a = this.audio; if (!a.ctx || this.out) return !!this.out;
    const ctx = a.ctx;
    this.out = ctx.createGain(); this.out.gain.value = 0; this.out.connect(a.musicGain);
    this.comp = ctx.createDynamicsCompressor(); this.comp.connect(this.out);
    this.dist = ctx.createWaveShaper(); const curve = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 3); } this.dist.curve = curve; this.dist.connect(this.comp);
    return true;
  }
  // theme === 'hall' (or null) plays the original mp3
  setWorld(theme) {
    const a = this.audio;
    if (!a.ctx) return;
    const want = STYLES[theme] ? theme : null;
    if (want === this.style) return;
    this.style = want;
    if (!this.ensure()) return;
    const now = a.ctx.currentTime;
    // crossfade between the mp3 and the generated loop
    a.trackGain?.gain.setTargetAtTime(want ? 0 : 1, now, .6);
    this.out.gain.setTargetAtTime(want ? .9 : 0, now, .6);
    if (want && !this.timer) { this.nextTime = now + .1; this.step = 0; this.timer = setInterval(() => this.schedule(), 30); }
  }
  stop() { clearInterval(this.timer); this.timer = null; }
  schedule() {
    const a = this.audio, ctx = a.ctx, S = STYLES[this.style];
    if (!S || !a.musicOn || a.musicPaused) { this.nextTime = ctx.currentTime + .05; return; }
    const spb = 60 / S.bpm / 4;
    while (this.nextTime < ctx.currentTime + .15) {
      const i = this.step % 16, t = this.nextTime + (S.swing && i % 2 ? spb * S.swing : 0);
      const bar = Math.floor(this.step / 16);
      if (S.kick[i] === 'x') this.kick(t, S.dist);
      if (S.hat[i] === 'x') this.hat(t, i % 4 === 2 ? .05 : .025);
      if (S.clap && S.clap[i] === 'x') this.clap(t);
      const b = S.bass[i]; if (b !== null && b !== undefined) this.bass(t, NOTE(S.root - 12 + S.scale[b % S.scale.length] + 12 * Math.floor(b / S.scale.length)), spb * 1.6, S.dist);
      const arp = S.arp[(this.step) % S.arp.length];
      if (arp !== null && arp !== undefined && (i % 2 === 0 || S.arp.length <= 4)) {
        const n = S.root + 12 + S.scale[arp % S.scale.length] + (bar % 4 === 3 ? 2 : 0);
        if (S.bell) this.bell(t, NOTE(n + 12)); else if (S.pizz) this.pluck(t, NOTE(n)); else this.tone(t, NOTE(n), spb * 1.2, S.arpWave, S.lead);
      }
      if (i === 0) this.pad(t, S.pad.map(d => NOTE(S.root + d + (bar % 2 ? -2 : 0))), spb * 16, S.air);
      this.nextTime += spb; this.step++;
    }
  }
  env(t, peak, dur, attack = .005) {
    const g = this.audio.ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    return g;
  }
  kick(t, hard) {
    const ctx = this.audio.ctx, o = ctx.createOscillator(), g = this.env(t, hard ? .9 : .75, .35);
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + .12);
    o.connect(g).connect(hard ? this.dist : this.comp); o.start(t); o.stop(t + .4);
  }
  noise(t, dur, vol, type, f) {
    const ctx = this.audio.ctx, s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = this.env(t, vol, dur, .002);
    s.buffer = this.audio.noise; fl.type = type; fl.frequency.value = f;
    s.connect(fl).connect(g).connect(this.comp); s.start(t, Math.random()); s.stop(t + dur + .02);
  }
  hat(t, v) { this.noise(t, .05, v * 2.2, 'highpass', 7000); }
  clap(t) { this.noise(t, .18, .3, 'bandpass', 1500); }
  bass(t, f, dur, dist) {
    const ctx = this.audio.ctx, o = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = this.env(t, .3, dur);
    o.type = 'sawtooth'; o.frequency.value = f; fl.type = 'lowpass'; fl.frequency.setValueAtTime(dist ? 900 : 600, t); fl.frequency.exponentialRampToValueAtTime(140, t + dur);
    o.connect(fl).connect(g).connect(dist ? this.dist : this.comp); o.start(t); o.stop(t + dur + .02);
  }
  tone(t, f, dur, type, vol) {
    const ctx = this.audio.ctx, o = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = this.env(t, vol, dur);
    o.type = type; o.frequency.value = f; fl.type = 'lowpass'; fl.frequency.value = 2800;
    o.connect(fl).connect(g).connect(this.comp); o.start(t); o.stop(t + dur + .02);
  }
  bell(t, f) {
    const ctx = this.audio.ctx;
    for (const [m, v] of [[1, .06], [2.76, .02], [5.4, .01]]) { const o = ctx.createOscillator(), g = this.env(t, v, 1.2); o.frequency.value = f * m; o.connect(g).connect(this.comp); o.start(t); o.stop(t + 1.3); }
  }
  pluck(t, f) { this.tone(t, f, .16, 'triangle', .07); this.tone(t, f * 2, .08, 'square', .015); }
  pad(t, freqs, dur, air) {
    const ctx = this.audio.ctx;
    for (const f of freqs) {
      const o = ctx.createOscillator(), g = ctx.createGain(), fl = ctx.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = (Math.random() - .5) * 14;
      fl.type = 'lowpass'; fl.frequency.value = 700;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.018, t + dur * .3); g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(fl).connect(g).connect(this.comp); o.start(t); o.stop(t + dur + .05);
    }
    if (air) this.noise(t, dur, air, 'bandpass', 900);
  }
}
