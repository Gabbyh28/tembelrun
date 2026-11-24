// Music (the original track) + synthesized effects + data-center ambience.
export class GameAudio {
  constructor() {
    this.ctx = null;
    this.musicOn = this.load('music', true);
    this.sfxOn = this.load('sfx', true);
    this.musicVol = this.load('musicVol', .55);
    this.sfxVol = this.load('sfxVol', .8);
  }
  load(k, d) { try { const v = localStorage.getItem('tr.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } }
  save(k, v) { try { localStorage.setItem('tr.' + k, JSON.stringify(v)); } catch { /* storage may be blocked */ } }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.gain.value = this.sfxOn ? this.sfxVol : 0; this.sfx.connect(this.master);
    this.musicGain = ctx.createGain(); this.musicGain.gain.value = this.musicOn ? this.musicVol * .6 : 0; this.musicGain.connect(this.master);
    this.music = new Audio(`${import.meta.env.BASE_URL}assets/audio/hypnotic-chill.mp3`);
    this.music.loop = true; this.music.crossOrigin = 'anonymous';
    ctx.createMediaElementSource(this.music).connect(this.musicGain);
    // white noise buffer reused by effects and ambience
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    this.startAmbience();
  }

  startAmbience() {
    const ctx = this.ctx;
    // server fans: band-passed noise + mains hum
    const n = ctx.createBufferSource(); n.buffer = this.noise; n.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.value = 900;
    const g = ctx.createGain(); g.gain.value = .05;
    n.connect(bp).connect(g).connect(this.sfx); n.start();
    const hum = ctx.createOscillator(); hum.frequency.value = 100; hum.type = 'sine';
    const hg = ctx.createGain(); hg.gain.value = .012; hum.connect(hg).connect(this.sfx); hum.start();
    // alarm drone for the chasing outage
    const al = ctx.createOscillator(); al.type = 'sawtooth'; al.frequency.value = 55;
    const alf = ctx.createBiquadFilter(); alf.type = 'lowpass'; alf.frequency.value = 400;
    this.alarm = ctx.createGain(); this.alarm.gain.value = 0;
    al.connect(alf).connect(this.alarm).connect(this.sfx); al.start();
  }

  playMusic(on = true) {
    if (!this.music) return;
    if (on && this.musicOn) this.music.play().catch(() => {});
    else this.music.pause();
  }
  setMusic(on) { this.musicOn = on; this.save('music', on); if (this.musicGain) this.musicGain.gain.value = on ? this.musicVol * .6 : 0; this.playMusic(on); }
  setSfx(on) { this.sfxOn = on; this.save('sfx', on); if (this.sfx) this.sfx.gain.value = on ? this.sfxVol : 0; }
  setMusicVol(v) { this.musicVol = v; this.save('musicVol', v); if (this.musicGain && this.musicOn) this.musicGain.gain.value = v * .6; }
  setSfxVol(v) { this.sfxVol = v; this.save('sfxVol', v); if (this.sfx && this.sfxOn) this.sfx.gain.value = v; }

  voice(file) {
    if (!this.sfxOn) return;
    const a = new Audio(`${import.meta.env.BASE_URL}assets/audio/${file}`);
    a.volume = Math.min(1, this.sfxVol * 1.2);
    a.play().catch(() => {});
  }

  setDanger(x) { if (this.alarm) this.alarm.gain.setTargetAtTime(x * .07, this.ctx.currentTime, .1); }

  tone(freq, dur, type = 'sine', vol = .2, slide = 0, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g).connect(this.sfx); o.start(t); o.stop(t + dur + .05);
  }
  burst(dur, freq, q = 1, vol = .3, type = 'bandpass', sweep = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    s.buffer = this.noise; f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq + sweep), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(f).connect(g).connect(this.sfx); s.start(t, Math.random()); s.stop(t + dur + .05);
  }

  play(ev) {
    switch (ev.type) {
      case 'chip': { const p = Math.min(12, ev.combo % 13); this.tone(1320 * Math.pow(2, p / 24), .12, 'triangle', .13); this.tone(2640 * Math.pow(2, p / 24), .08, 'sine', .05, 0, .03); break; }
      case 'jump': this.burst(.25, 700, 1.4, .14, 'bandpass', 1400); this.tone(220, .16, 'sine', .08, 160); break;
      case 'slide': this.burst(.45, 1800, .7, .14, 'lowpass', -1500); break;
      case 'land': this.burst(.08, 180, 1, .12, 'lowpass'); break;
      case 'lane': this.burst(.12, 1200, 2, .05, 'bandpass', 600); break;
      case 'turn': this.burst(.3, 500, 1, .14, 'bandpass', 1500); break;
      case 'turnQueued': this.tone(880, .07, 'square', .04); break;
      case 'stumble': this.burst(.3, 160, 1, .4, 'lowpass'); this.tone(90, .35, 'sawtooth', .12, -40); break;
      case 'smash': this.burst(.5, 400, .5, .45, 'lowpass', -300); this.tone(70, .4, 'square', .1, -30); break;
      case 'power': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, .3, 'triangle', .12, 0, i * .07)); break;
      case 'powerEnd': this.tone(660, .3, 'sine', .08, -300); break;
      case 'crash': this.burst(.9, 300, .4, .6, 'lowpass', -250); this.tone(60, .8, 'sawtooth', .18, -30); break;
      case 'room': this.tone(392, .5, 'sine', .07); this.tone(587, .6, 'sine', .06, 0, .12); break;
      case 'tick': this.tone(660, .12, 'square', .06); break;
      case 'go': this.tone(990, .3, 'square', .07); break;
      case 'record': [659, 784, 988, 1318].forEach((f, i) => this.tone(f, .35, 'triangle', .1, 0, i * .1)); break;
    }
  }
}
