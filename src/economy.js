// QSFP wallet: modules collected in runs are banked here and spent on
// upgrades, character unlocks and extra "Hanan helps you up" revives.
export const UPGRADES = [
  { id: 'power', icon: '⚡', name: 'כוח ארוך יותר', desc: '+1.5 שניות לכוח של הדמות בכל רמה', costs: [150, 400, 900, 1800] },
  { id: 'magnet', icon: '🧲', name: 'מגנט חזק', desc: 'מגנט ה־QSFP מושך מרחוק יותר, ונאספים מודולים גם ממרחק', costs: [200, 600, 1400] },
  { id: 'value', icon: '💰', name: 'QSFP שווה יותר', desc: '+25% מודולים לארנק בסוף כל ריצה', costs: [250, 700, 1500, 3000] },
  { id: 'revive', icon: '🤝', name: 'עוד הרמה מחנן', desc: 'עוד "חנן עוזר לך לקום" חינם בכל ריצה', costs: [600, 1600] },
];

export const HEADSTART_COST = 250;
export const UNLOCK_COST = { technician: 0, avichai: 150, ariel: 300, liad: 500, gabi: 800 };

export class Wallet {
  constructor(store) {
    this.store = store;
    this.balance = store.get('wallet', 0);
    this.levels = store.get('upgrades', {});
    this.unlocked = new Set(store.get('unlocked', ['technician']));
    // anyone who already picked a character before the shop existed keeps it
    const current = store.get('character', null);
    if (current) this.unlocked.add(current);
    this.save();
  }
  save() {
    this.store.set('wallet', this.balance);
    this.store.set('upgrades', this.levels);
    this.store.set('unlocked', [...this.unlocked]);
  }
  level(id) { return this.levels[id] || 0; }
  nextCost(id) { const u = UPGRADES.find(x => x.id === id); const l = this.level(id); return l < u.costs.length ? u.costs[l] : null; }
  add(n) { this.balance += n; this.save(); }
  spend(n) { if (this.balance < n) return false; this.balance -= n; this.save(); return true; }
  buyUpgrade(id) { const c = this.nextCost(id); if (c === null || !this.spend(c)) return false; this.levels[id] = this.level(id) + 1; this.save(); return true; }
  get headStarts() { return this.store.get('headStarts', 0); }
  set headStarts(n) { this.store.set('headStarts', Math.max(0, n)); }
  buyHeadStart() { if (!this.spend(HEADSTART_COST)) return false; this.headStarts++; return true; }
  isUnlocked(ch) { return this.unlocked.has(ch); }
  unlock(ch) { if (this.isUnlocked(ch)) return true; if (!this.spend(UNLOCK_COST[ch] ?? 0)) return false; this.unlocked.add(ch); this.save(); return true; }
  runBonuses() {
    return { powerBonus: this.level('power') * 1.5, magnetBonus: this.level('magnet'), valueMult: 1 + this.level('value') * .25, revives: 1 + this.level('revive') };
  }
}

// Deterministic random for the daily challenge: everyone gets the same route each day.
export function dailySeed(date = new Date()) {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}
export function mulberry32(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
