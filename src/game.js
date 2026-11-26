// Runner simulation: movement along the track, turns, jumping/sliding,
// collisions, pickups, powers and the outage that chases you.
import * as THREE from 'three';
import { LANES, HALF, THEMES, runSpeedAt } from './world.js';

const GRAVITY = -17.5, JUMP_V = 6.15, SLIDE_TIME = .78, TURN_WINDOW = 24;

export const FAIL_REASONS = {
  wall: 'נכנסת בשורת ארונות. לא פנית בזמן!',
  cart: 'התנגשת בעגלת שירות.',
  boxes: 'נתקעת במשטח של שרתים חדשים.',
  ladder: 'התנגשת בסולם של צוות התחזוקה.',
  bar: 'מגש כבלים תלוי. היה צריך לגלוש מתחת!',
  pit: 'נפלת לתוך הרצפה המוגבהת הפתוחה.',
  caught: 'ההשבתה השיגה אותך. כל המערכות נפלו!',
  chair: 'נתקעת בכיסא משרדי. מי השאיר אותו באמצע המעבר?!',
  drums: 'התנגשת בחביות הסולר של הגנרטור.',
  exhaust: 'צינור פליטה של גנרטור. היה צריך לגלוש מתחת!',
  filters: 'נכנסת בערימת פילטרים של מיזוג.',
  duct: 'תעלת אוויר נמוכה. היה צריך לגלוש מתחת!',
  forklift: 'נדרסת כמעט על ידי מלגזה! הנהג הקירח לא ראה אותך.',
  jack: 'מעדת על עגלת משטחים אדומה.',
  crate: 'התנגשת בארגז ציוד ענק.',
  wrapped: 'נכנסת במשטח עטוף בניילון.',
  tunnel: 'קורת מדפים נמוכה. היה צריך לגלוש מתחת!',
  table: 'נכנסת בשולחן העישון. כוסות קפה ריקות וסיגריות בכל מקום!',
  gbics: 'הפלת ערימת קופסאות GBIC. חנן יצטרך לספור מחדש!',
  scrap: 'התנגשת בעגלת שרתים לגריטה.',
  spool: 'נתקעת בתוף סיבים אופטיים.',
  door: 'שרת נשלף מהארון ישר לתוך הדרך. היה צריך לעקוף או לגלוש!',
  desk: 'נכנסת בעמדת מפעיל. שלושה מסכים עפו!',
  kiosk: 'התנגשת בעמדת מסך ניידת בחדר הבקרה.',
  screens: 'שורת מסכים תלויה. היה צריך לגלוש מתחת!',
  condenser: 'התנגשת ביחידת עיבוי על הגג.',
  pipebridge: 'גשר צנרת מים קרים. היה צריך לגלוש מתחת!',
  busbar: 'פסי נחושת תלויים. היה צריך לגלוש מתחת!',
  batcart: 'התנגשת בעגלת מצברים. כבדה!',
  spillkit: 'נכנסת בערכת שפך החומצה.',
  conveyor: 'מסוע עליון. היה צריך לגלוש מתחת!',
};

// first-run lesson: the runner slows to a crawl until the right swipe is made
export const TUTORIAL = [
  { u: 46, lead: 5, need: ['jump'], dir: 'up', text: 'החליקו למעלה כדי לקפוץ' },
  { u: 78, lead: 5, need: ['slide'], dir: 'down', text: 'החליקו למטה כדי לגלוש' },
  { u: 110, lead: 7, need: ['left', 'right'], dir: 'side', text: 'החליקו ימינה או שמאלה כדי לעקוף' },
  { turn: true, need: ['left', 'right'], dir: 'side', text: 'צומת! החליקו לכיוון הפנייה' },
];

export class Run {
  constructor(track) {
    this.track = track;
    this.world = new THREE.Vector3();
    this.events = [];
    this.mode = 'ready';
    this.character = null;
  }

  reset(character, opts = {}) {
    this.bonus = { powerBonus: 0, magnetBonus: 0, valueMult: 1, revives: 1, ...(opts.bonus || {}) };
    this.daily = !!opts.daily;
    this.tut = opts.tutorial ? { i: 0, waiting: null, done: false } : null;
    this.eventNow = null; this.eventK = 0;
    this.riding = null; this.banked = 0; this.paidRevives = 0;
    this.character = character;
    this.seg = this.track.reset(opts.random, !!opts.tutorial);
    this.u = 2; this.x = 0; this.lane = 1; this.y = 0; this.vy = 0;
    this.slideT = 0; this.sliding = false;
    this.distance = 0; this.speed = 13; this.chips = 0; this.score = 0;
    this.combo = 0; this.comboT = 0; this.mult = 1;
    this.shield = false; this.doubleT = 0; this.bonusScore = 0;
    this.boost = 0; this.boostEnd = 0;                     // head start: sprint until this distance
    this.trickChain = 0; this.trickT = 0; this.lastLaneT = -9; this.slideStartT = -9;
    this.queuedTurn = null; this.turning = 0;
    this.yaw = this.seg.yaw; this.camYaw = this.seg.yaw;
    this.lateralVel = 0;
    this.chaserDist = opts.tutorial ? 16 : 4; this.chaserHeat = opts.tutorial ? 0 : .6; this.lastStumble = -99; this.time = 0;
    this.powerRemaining = 0; this.magnet = this.invincible = this.giant = this.rolling = this.elastic = this.prayer = false;
    this.reason = ''; this.failKind = ''; this.revives = this.bonus.revives; this.invulnT = 0;
    this.oldSeg = null; this.oldSegT = 0;
    this.lastTheme = this.seg.theme;
    this.shake = 0; this.debris = [];
    this.fallY = 0;
    this.events.length = 0;
    this.seg.toWorld(this.u, this.x, 0, this.world);
    this.mode = 'countdown';
  }

  emit(type, data = {}) { this.events.push({ type, ...data }); }

  /* ---------- input ---------- */
  input(action) {
    if (this.mode !== 'running') return;
    const w = this.tut?.waiting;
    if (w && w.need.includes(action)) { this.tut.waiting = null; this.tut.i++; this.emit('tutorialStep', { done: this.tut.i >= TUTORIAL.length }); if (this.tut.i >= TUTORIAL.length) this.tut.done = true; }
    if (action === 'left' || action === 'right') {
      const s = this.seg;
      const inWindow = this.u > s.length - TURN_WINDOW && s.turns[action];
      if (inWindow && !this.queuedTurn) {
        this.queuedTurn = action; this.emit('turnQueued', { side: action });
        if (s.length - this.u < 4.5) this.trick('turn');          // turned at the very last moment
        return;
      }
      const nl = Math.max(0, Math.min(2, this.lane + (action === 'left' ? -1 : 1)));
      if (nl !== this.lane) { this.lane = nl; this.lastLaneT = this.time; this.emit('lane'); }
    } else if (action === 'jump') {
      if (this.riding) return;
      if (this.y <= .001 && !this.rolling) { this.vy = JUMP_V; this.sliding = false; this.slideT = 0; this.emit('jump'); }
    } else if (action === 'slide') {
      if (this.rolling || this.riding === 'tray') return;
      if (this.y > .6) this.trick('dive');                       // slam down from a jump into a slide
      if (this.y > .001) this.vy = Math.min(this.vy, -11);
      if (!this.sliding) this.slideStartT = this.time;
      this.sliding = true; this.slideT = SLIDE_TIME; this.emit('slide');
    }
  }

  /* ---------- simulation ---------- */
  update(dt) {
    if (this.mode === 'over') { this.updateDeath(dt); return; }
    if (this.mode !== 'running') return;
    this.tutorialTick();
    if (this.tut?.waiting) dt *= .1;            // slow motion until the lesson's swipe is made
    this.time += dt;
    const s = this.seg;
    this.speed = runSpeedAt(this.distance);
    // special ride sections: hop on a pallet jack or slide in a cable tray
    const R = s.ride;
    if (R && !this.riding && this.u >= R.from && this.u < R.to) { this.riding = R.type; this.sliding = false; this.y = 0; this.vy = 0; if (s.rideMesh) s.rideMesh.visible = false; this.emit('rideStart', { kind: R.type }); }
    if (this.riding && (!R || this.u >= R.to)) { this.riding = null; this.emit('rideEnd'); }
    // special events: blackout, FM-200 gas release, missing floor tiles
    const E = s.event, inEvent = E && this.u >= E.from && this.u < E.to ? E.type : null;
    if (inEvent !== this.eventNow) { if (inEvent) this.emit('event', { kind: inEvent }); else this.emit('eventEnd', { kind: this.eventNow }); this.eventNow = inEvent; }
    this.eventK = THREE.MathUtils.damp(this.eventK, inEvent ? 1 : 0, inEvent ? 3 : 1.5, dt);
    if (inEvent) this.eventKind = inEvent;
    if (this.boost && this.distance >= this.boostEnd) { this.boost = 0; this.invulnT = 1.5; this.emit('boostEnd'); }
    // head start: auto-take the turn at every junction
    if (this.boost && !this.queuedTurn && this.u > s.length - 10) this.queuedTurn = s.turns.left && (!s.turns.right || Math.random() < .5) ? 'left' : 'right';
    const v = this.speed * (this.giant ? 1.15 : 1) * (this.riding ? 1.35 : 1) * (this.boost ? 2.4 : 1);
    this.u += v * dt; this.distance += v * dt;
    if (this.doubleT > 0) { this.doubleT -= dt; this.bonusScore += v * dt; if (this.doubleT <= 0) this.emit('doubleEnd'); }
    if ((this.trickT -= dt) <= 0) this.trickChain = 0;

    // lateral
    const tx = LANES[this.lane];
    const nx = THREE.MathUtils.damp(this.x, tx, 14, dt);
    this.lateralVel = (nx - this.x) / dt; this.x = nx;

    // vertical
    if (this.y > 0 || this.vy > 0) {
      this.vy += GRAVITY * dt; this.y += this.vy * dt;
      if (this.y <= 0) { this.y = 0; this.vy = 0; this.emit('land'); }
    }
    if (this.sliding) { this.slideT -= dt; if (this.slideT <= 0) this.sliding = false; }

    // junction
    if (this.queuedTurn && this.u >= s.length - .2) this.doTurn(this.queuedTurn);
    else if (this.u > s.length + HALF - .7) return this.fail('wall');

    this.moveObstacles(dt);
    if (this.invulnT > 0) this.invulnT -= dt;
    if (this.invulnT <= 0) this.collide();
    this.nearMisses();
    this.pickups(dt);
    this.updatePower(dt);
    this.updateChaser(dt);

    // retire the previous aisle once out of sight
    if (this.oldSeg && (this.oldSegT -= dt) <= 0) { this.track.retire(this.oldSeg); this.oldSeg = null; }

    this.seg.toWorld(this.u, this.x, 0, this.world);
    this.camYaw = dampAngle(this.camYaw, this.seg.yaw, 7, dt);

    // score
    this.comboT -= dt; if (this.comboT <= 0) this.combo = 0;
    this.mult = 1 + Math.min(4, Math.floor(this.combo / 10));
    this.score = Math.floor(this.distance + this.bonusScore) + this.chipScore;
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.updateDebris(dt);
  }

  // first-run lesson: wait at each obstacle (or the junction) for the right swipe
  tutorialTick() {
    const T = this.tut; if (!T || T.done || T.waiting) return;
    const step = TUTORIAL[T.i]; if (!step) { T.done = true; return; }
    const at = step.turn ? this.seg.length - TURN_WINDOW + 6 : step.u - step.lead;
    if (this.seg.first && this.u >= at) { T.waiting = step; this.emit('tutorial', { step }); }
  }

  get chipScore() { return this._chipScore || 0; }
  set chipScore(v) { this._chipScore = v; }

  doTurn(side) {
    const s = this.seg;
    const p = s.toWorld(this.u, this.x);
    const child = this.track.commit(s, side);
    const loc = child.toLocal(p);
    this.u = loc.u; this.x = loc.x; this.lane = 1;
    this.queuedTurn = null;
    if (this.oldSeg) this.track.retire(this.oldSeg);
    this.oldSeg = s; this.oldSegT = 1.6;
    this.seg = child;
    if (this.riding) { this.riding = null; this.emit('rideEnd'); }
    this.emit('turn', { side });
    if (child.theme !== this.lastTheme) { this.lastTheme = child.theme; this.emit('room', { theme: child.theme, name: THEMES[child.theme].he }); }
  }

  // office chairs that roll across the aisle once you get close
  moveObstacles(dt) {
    for (const o of this.seg.obstacles) {
      if (o.swing && !o.broken) {
        if (!o.opening && o.u - this.u < o.swing.trigger) { o.opening = true; this.emit('doorOpen'); }
        if (o.opening && o.open < 1) {
          o.open = Math.min(1, o.open + dt * o.swing.speed);
          const door = o.mesh?.getObjectByName('door'), srv = o.mesh?.getObjectByName('server');
          const e = 1 - Math.pow(1 - o.open, 3);
          if (door) door.rotation.y = -e * Math.PI * .5;
          if (srv) srv.position.x = .55 - THREE.MathUtils.smoothstep(o.open, .2, 1) * 1.9;
        }
        continue;
      }
      if (!o.move || o.broken) continue;
      if (!o.rolling && o.u - this.u < o.move.trigger) { o.rolling = true; this.emit('roll'); }
      if (!o.rolling) continue;
      const d = o.move.to - o.x, step = Math.sign(d) * Math.min(Math.abs(d), o.move.speed * dt);
      o.x += step;
      if (o.mesh) { o.mesh.position.x = o.x; if (o.move.spin) o.mesh.rotation.y += step * 1.6; }
    }
  }

  collide() {
    const s = this.seg;
    for (const o of s.obstacles) {
      if (o.hit || o.broken) continue;
      if (o.swing && o.open < .55) continue;     // the door hasn't swung into the aisle yet
      if (o.slideOk && this.sliding) continue;   // slide under the pulled-out server
      const du = this.u - o.u;
      const reach = o.len / 2 + .35;
      if (du < -reach || du > reach) continue;
      const reachX = .95 * (this.giant ? 1.6 : 1);
      const laneHit = o.x !== undefined ? Math.abs(this.x - o.x) < reachX + (o.halfW ? o.halfW - .55 : 0) : o.lanes.length === 3 || o.lanes.some(l => Math.abs(this.x - LANES[l]) < reachX);
      if (!laneHit) continue;
      if (this.invincible || this.boost) {
        if (o.type === 'pit') continue; // ride over it
        this.smash(o); continue;
      }
      // track how close the runner came, for "near miss" tricks
      o.near = true;
      if (o.need === 'jump' && o.type !== 'pit') o.minClear = Math.min(o.minClear ?? 9, this.y - o.clear);
      if (o.need === 'jump') {
        if (o.type === 'pit') { if (this.y < .02 && Math.abs(du) < o.len / 2 - .25) { if (this.useShield(o, false)) { this.vy = JUMP_V; continue; } return this.fail('pit'); } continue; }
        if (this.y >= o.clear) continue;
        if (this.useShield(o)) continue;
        o.hit = true;
        if (o.stumble) { this.stumble(); continue; }
        return this.fail(o.type);
      }
      if (o.need === 'slide') { if (this.sliding) continue; if (this.useShield(o)) continue; o.hit = true; return this.fail(FAIL_REASONS[o.type] ? o.type : 'bar'); }
      if (o.need === 'dodge') {
        // clipping the edge of an obstacle while changing lanes is a stumble, a head-on hit ends the run
        const ox = o.x ?? LANES[o.lanes[0]], ol = LANES.reduce((b, v, i) => Math.abs(v - ox) < Math.abs(LANES[b] - ox) ? i : b, 0);
        const edge = Math.abs(this.x - ox) > (o.halfW ?? .4) + .15;
        if (this.useShield(o)) continue;
        o.hit = true;
        if (edge) { this.stumble(); this.lane = this.x < ox ? Math.max(0, ol - 1) : Math.min(2, ol + 1); continue; }
        return this.fail(o.type);
      }
    }
  }

  // the shield takes one hit: the obstacle is knocked away instead
  useShield(o, smash = true) {
    if (!this.shield) return false;
    this.shield = false; this.invulnT = 1;
    if (smash) this.smash(o); else this.shake = .4;
    this.emit('shieldBreak');
    return true;
  }

  // style points: perfect turn, dive, near misses. Chaining them within 3 s multiplies the bonus.
  trick(kind) {
    this.trickChain = this.trickT > 0 ? Math.min(5, this.trickChain + 1) : 1;
    this.trickT = 3;
    const base = { turn: 40, dive: 25, jump: 30, dodge: 30, slide: 30 }[kind];
    const pts = base * this.trickChain * this.mult * (this.doubleT > 0 ? 2 : 1);
    this.chipScore += pts;
    this.emit('trick', { kind, pts, chain: this.trickChain });
  }

  // obstacles just passed: was it close?
  nearMisses() {
    for (const o of this.seg.obstacles) {
      if (o.passed || o.hit || o.broken || o.type === 'pit') continue;
      if (this.u - o.u < o.len / 2 + .5) continue;
      o.passed = true;
      if (o.need === 'jump' && o.minClear !== undefined && o.minClear < .22) this.trick('jump');
      else if (o.need === 'slide' && o.near && this.time - this.slideStartT < .32) this.trick('slide');
      else if (o.need === 'dodge') {
        const ox = o.x ?? LANES[o.lanes[0]];
        if (Math.abs(this.x - ox) < 2.4 && this.time - this.lastLaneT < .5) this.trick('dodge');
      }
    }
  }

  smash(o) {
    o.broken = true;
    this.shake = .6;
    const dir = new THREE.Vector3((Math.random() - .5) * 6, 5 + Math.random() * 3, -8 - Math.random() * 4);
    this.debris.push({ mesh: o.mesh, v: dir, spin: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6), t: 1.6 });
    this.emit('smash');
  }

  updateDebris(dt) {
    for (const d of this.debris) {
      d.t -= dt; d.v.y += GRAVITY * .6 * dt;
      d.mesh.position.addScaledVector(d.v, dt);
      d.mesh.rotation.x += d.spin.x * dt; d.mesh.rotation.y += d.spin.y * dt;
      if (d.t <= 0) d.mesh.visible = false;
    }
    this.debris = this.debris.filter(d => d.t > 0);
  }

  stumble() {
    this.shake = .5;
    if (this.chaserDist < 7 && this.time - this.lastStumble < 9) return this.fail('caught');
    this.lastStumble = this.time;
    this.chaserDist = 2;
    this.emit('stumble');
  }

  pickups(dt) {
    const s = this.seg;
    const magnet = this.magnet;
    for (const c of s.chips) {
      if (c.taken) continue;
      const du = c.u - this.u;
      if (magnet && du > -1 && du < 18 + this.bonus.magnetBonus * 6) {
        // pulled toward the runner
        const k = 1 - Math.exp(-dt * (this.elastic ? 14 : 9));
        c.x += (this.x - c.x) * k; c.y += (this.y + 1 - c.y) * k; c.u += (this.u + .3 - c.u) * k * .6;
      }
      if (Math.abs(c.u - this.u) < .9 + this.bonus.magnetBonus * .15 && Math.abs(c.x - this.x) < (.8 + this.bonus.magnetBonus * .12) * (this.giant ? 1.8 : 1) && c.y > this.y - .3 && c.y < this.y + (this.sliding ? 1.0 : 2.1) * (this.giant ? 1.8 : 1)) {
        c.taken = true; this.chips++; this.combo++; this.comboT = 2.2;
        this.chipScore += 10 * this.mult * (this.doubleT > 0 ? 2 : 1);
        this.emit('chip', { combo: this.combo });
      }
    }
    for (const p of s.powerups) {
      if (p.taken) continue;
      if (Math.abs(p.u - this.u) < 1.1 && Math.abs(p.x - this.x) < (this.magnet && p.kind === 'gold' ? 2.2 : 1.0) && this.y < 2) {
        p.taken = true; p.mesh.visible = false;
        this.collect(p.kind || 'power');
      }
    }
  }

  collect(kind) {
    if (kind === 'power') return this.activatePower();
    if (kind === 'gold') { this.chips += 50; this.chipScore += 500 * this.mult * (this.doubleT > 0 ? 2 : 1); return this.emit('gold'); }
    if (kind === 'shield') { this.shield = true; return this.emit('pickup', { kind }); }
    if (kind === 'double') { this.doubleT = 12; return this.emit('pickup', { kind }); }
    if (kind === 'mystery') {
      // a random reward from the box
      const r = Math.random();
      let reward;
      if (r < .4) { const n = [50, 100, 150][Math.random() * 3 | 0]; this.chips += n; reward = { kind: 'modules', n }; }
      else if (r < .62) { this.activatePower(); reward = { kind: 'power' }; }
      else if (r < .8) { this.shield = true; reward = { kind: 'shield' }; }
      else if (r < .9) { this.doubleT = 12; reward = { kind: 'double' }; }
      else { this.revives++; reward = { kind: 'revive' }; }
      return this.emit('mystery', reward);
    }
  }

  // head start: sprint the next 500 m, smashing through everything, turns taken for you
  startBoost(meters = 500) {
    if (this.mode !== 'running' || this.boost) return false;
    this.boost = 1; this.boostEnd = this.distance + meters;
    this.chaserDist = 16; this.emit('boost');
    return true;
  }

  activatePower() {
    const pw = this.character.power;
    if (this.powerRemaining > 0) pw.finish(this);
    pw.activate(this);
    this.powerRemaining = this.powerTotal = pw.duration + this.bonus.powerBonus;
    this.sliding = false;
    this.emit('power', { name: pw.active });
  }

  updatePower(dt) {
    if (this.powerRemaining <= 0) return;
    this.powerRemaining -= dt;
    if (this.powerRemaining <= 0) {
      this.powerRemaining = 0;
      this.character.power.finish(this);
      this.emit('powerEnd');
    }
  }

  updateChaser(dt) {
    if (this.tut && !this.tut.done) { this.chaserDist = 16; this.chaserHeat = 0; return; }
    this.chaserDist = Math.min(16, this.chaserDist + dt * (this.chaserDist < 6 ? .55 : 1.6));
    this.chaserHeat = THREE.MathUtils.clamp(1 - (this.chaserDist - 2) / 7, 0, 1);
  }

  fail(kind) {
    if (this.invulnT > 0 && kind !== 'wall') return;
    if (this.tut && !this.tut.done && kind !== 'wall') { this.shake = .4; this.emit('stumble'); return; }
    this.mode = 'over';
    this.failKind = kind;
    this.reason = FAIL_REASONS[kind] || '';
    this.deathT = 0;
    if (this.powerRemaining > 0) { this.character.power.finish(this); this.powerRemaining = 0; }
    this.sliding = kind === 'bar';
    this.shake = 1;
    this.chaserHeat = kind === 'caught' ? 1 : this.chaserHeat;
    this.emit('crash', { kind });
  }

  // Hanan helps you up: continue from where you fell, with the way ahead cleared
  revive() {
    if (this.revives <= 0) return false;
    this.revives--;
    const s = this.seg;
    if (this.failKind === 'wall') {
      // ran past the junction: put the runner back before it with a turn queued
      this.u = s.length - 2; this.queuedTurn = s.turns.left ? 'left' : 'right';
    }
    for (const o of s.obstacles) if (o.u > this.u - 3 && o.u < this.u + 14 && !o.broken) { o.broken = true; if (o.mesh) o.mesh.visible = false; }
    this.y = 0; this.vy = 0; this.sliding = false; this.fallY = 0;
    this.chaserDist = 16; this.chaserHeat = 0; this.lastStumble = -99;
    this.invulnT = 2.5; this.shake = 0;
    this.mode = 'running';
    this.emit('revive');
    return true;
  }

  updateDeath(dt) {
    this.deathT = (this.deathT || 0) + dt;
    if (this.failKind === 'pit') { this.y = Math.max(-1.6, this.y - dt * 4); }
    else if (this.y > 0) { this.vy += GRAVITY * dt; this.y = Math.max(0, this.y + this.vy * dt); }
    this.shake = Math.max(0, this.shake - dt * 2);
    this.chaserDist = Math.max(.5, this.chaserDist - dt * 6);
    this.chaserHeat = THREE.MathUtils.clamp(1 - (this.chaserDist - 2) / 7, 0, 1);
    this.updateDebris(dt);
    this.seg.toWorld(this.u, this.x, 0, this.world);
  }

  turnHint() {
    const s = this.seg;
    const d = s.length - this.u;
    if (d > TURN_WINDOW + 18 || d < -2) return null;
    return { distance: Math.max(0, d), left: s.turns.left, right: s.turns.right, queued: this.queuedTurn, inWindow: d < TURN_WINDOW };
  }
}

function dampAngle(a, b, lambda, dt) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-lambda * dt));
}
