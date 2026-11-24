// Runner simulation: movement along the track, turns, jumping/sliding,
// collisions, pickups, powers and the outage that chases you.
import * as THREE from 'three';
import { LANES, HALF, THEMES } from './world.js';

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
};

export class Run {
  constructor(track) {
    this.track = track;
    this.world = new THREE.Vector3();
    this.events = [];
    this.mode = 'ready';
    this.character = null;
  }

  reset(character) {
    this.character = character;
    this.seg = this.track.reset();
    this.u = 2; this.x = 0; this.lane = 1; this.y = 0; this.vy = 0;
    this.slideT = 0; this.sliding = false;
    this.distance = 0; this.speed = 13; this.chips = 0; this.score = 0;
    this.combo = 0; this.comboT = 0; this.mult = 1;
    this.queuedTurn = null; this.turning = 0;
    this.yaw = this.seg.yaw; this.camYaw = this.seg.yaw;
    this.lateralVel = 0;
    this.chaserDist = 4; this.chaserHeat = .6; this.lastStumble = -99; this.time = 0;
    this.powerRemaining = 0; this.magnet = this.invincible = this.giant = this.rolling = this.elastic = this.prayer = false;
    this.reason = ''; this.failKind = '';
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
    if (action === 'left' || action === 'right') {
      const s = this.seg;
      const inWindow = this.u > s.length - TURN_WINDOW && s.turns[action];
      if (inWindow && !this.queuedTurn) { this.queuedTurn = action; this.emit('turnQueued', { side: action }); return; }
      const nl = Math.max(0, Math.min(2, this.lane + (action === 'left' ? -1 : 1)));
      if (nl !== this.lane) { this.lane = nl; this.emit('lane'); }
    } else if (action === 'jump') {
      if (this.y <= .001 && !this.rolling) { this.vy = JUMP_V; this.sliding = false; this.slideT = 0; this.emit('jump'); }
    } else if (action === 'slide') {
      if (this.rolling) return;
      if (this.y > .001) this.vy = Math.min(this.vy, -11);
      this.sliding = true; this.slideT = SLIDE_TIME; this.emit('slide');
    }
  }

  /* ---------- simulation ---------- */
  update(dt) {
    if (this.mode === 'over') { this.updateDeath(dt); return; }
    if (this.mode !== 'running') return;
    this.time += dt;
    const s = this.seg;
    this.speed = Math.min(30, 13 + this.distance * .0055);
    const v = this.speed * (this.giant ? 1.15 : 1);
    this.u += v * dt; this.distance += v * dt;

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
    this.collide();
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
    this.score = Math.floor(this.distance) + this.chipScore;
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.updateDebris(dt);
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
    this.emit('turn', { side });
    if (child.theme !== this.lastTheme) { this.lastTheme = child.theme; this.emit('room', { theme: child.theme, name: THEMES[child.theme].he }); }
  }

  // office chairs that roll across the aisle once you get close
  moveObstacles(dt) {
    for (const o of this.seg.obstacles) {
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
      const du = this.u - o.u;
      const reach = o.len / 2 + .35;
      if (du < -reach || du > reach) continue;
      const reachX = .95 * (this.giant ? 1.6 : 1);
      const laneHit = o.x !== undefined ? Math.abs(this.x - o.x) < reachX + (o.halfW ? o.halfW - .55 : 0) : o.lanes.length === 3 || o.lanes.some(l => Math.abs(this.x - LANES[l]) < reachX);
      if (!laneHit) continue;
      if (this.invincible) {
        if (o.type === 'pit') continue; // ride over it
        this.smash(o); continue;
      }
      if (o.need === 'jump') {
        if (o.type === 'pit') { if (this.y < .02 && Math.abs(du) < o.len / 2 - .25) return this.fail('pit'); continue; }
        if (this.y >= o.clear) continue;
        o.hit = true;
        if (o.stumble) { this.stumble(); continue; }
        return this.fail(o.type);
      }
      if (o.need === 'slide') { if (this.sliding) continue; o.hit = true; return this.fail('bar'); }
      if (o.need === 'dodge') {
        // clipping the edge of an obstacle while changing lanes is a stumble, a head-on hit ends the run
        const ox = o.x ?? LANES[o.lanes[0]], ol = LANES.reduce((b, v, i) => Math.abs(v - ox) < Math.abs(LANES[b] - ox) ? i : b, 0);
        const edge = Math.abs(this.x - ox) > (o.halfW ?? .4) + .15;
        o.hit = true;
        if (edge) { this.stumble(); this.lane = this.x < ox ? Math.max(0, ol - 1) : Math.min(2, ol + 1); continue; }
        return this.fail(o.type);
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
      if (magnet && du > -1 && du < 18) {
        // pulled toward the runner
        const k = 1 - Math.exp(-dt * (this.elastic ? 14 : 9));
        c.x += (this.x - c.x) * k; c.y += (this.y + 1 - c.y) * k; c.u += (this.u + .3 - c.u) * k * .6;
      }
      if (Math.abs(c.u - this.u) < .9 && Math.abs(c.x - this.x) < .8 * (this.giant ? 1.8 : 1) && c.y > this.y - .3 && c.y < this.y + (this.sliding ? 1.0 : 2.1) * (this.giant ? 1.8 : 1)) {
        c.taken = true; this.chips++; this.combo++; this.comboT = 2.2;
        this.chipScore += 10 * this.mult;
        this.emit('chip', { combo: this.combo });
      }
    }
    for (const p of s.powerups) {
      if (p.taken) continue;
      if (Math.abs(p.u - this.u) < 1.1 && Math.abs(p.x - this.x) < 1.0 && this.y < 2) {
        p.taken = true; p.mesh.visible = false;
        this.activatePower();
      }
    }
  }

  activatePower() {
    const pw = this.character.power;
    if (this.powerRemaining > 0) pw.finish(this);
    pw.activate(this);
    this.powerRemaining = pw.duration;
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
    this.chaserDist = Math.min(16, this.chaserDist + dt * (this.chaserDist < 6 ? .55 : 1.6));
    this.chaserHeat = THREE.MathUtils.clamp(1 - (this.chaserDist - 2) / 7, 0, 1);
  }

  fail(kind) {
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
