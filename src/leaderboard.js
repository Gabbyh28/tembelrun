// Online leaderboard on Firebase Firestore, spoken to over plain REST (no SDK).
// Each player has a random id kept on the device; their document only ever
// moves up (the security rules refuse a lower score). Until the Firebase
// project is filled in below the leaderboard stays hidden.
import { dailySeed } from './economy.js';

export const FIREBASE = {
  apiKey: '',          // e.g. 'AIzaSy…'   (Firebase console → Project settings → Web app)
  projectId: '',       // e.g. 'tembel-run'
};

const base = () => `https://firestore.googleapis.com/v1/projects/${FIREBASE.projectId}/databases/(default)/documents`;

export class Leaderboard {
  constructor(store) {
    this.store = store;
    this.enabled = !!(FIREBASE.apiKey && FIREBASE.projectId);
    this.id = store.get('playerId', null);
    if (!this.id) { this.id = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join(''); store.set('playerId', this.id); }
  }
  get name() { return this.store.get('playerName', ''); }
  set name(v) { this.store.set('playerName', v.trim().slice(0, 16)); }

  dailyCol() { return 'daily_' + dailySeed(); }

  // submit if it beats what this device already posted to that board
  async submit({ score, character, daily }) {
    if (!this.enabled || !this.name || !score) return false;
    const cols = ['scores']; if (daily) cols.push(this.dailyCol());
    let ok = false;
    for (const col of cols) {
      const key = 'posted.' + col;
      if (score <= this.store.get(key, 0)) continue;
      const body = { fields: { name: { stringValue: this.name }, score: { integerValue: String(Math.floor(score)) }, character: { stringValue: character }, at: { timestampValue: new Date().toISOString() } } };
      try {
        const r = await fetch(`${base()}/${col}/${this.id}?key=${FIREBASE.apiKey}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (r.ok) { this.store.set(key, score); ok = true; }
      } catch { /* offline: try again next run */ }
    }
    return ok;
  }

  // a changed name re-posts the current best under the new name
  async rename(name, character) {
    this.name = name;
    for (const col of ['scores', this.dailyCol()]) {
      const best = this.store.get('posted.' + col, 0);
      if (best) { this.store.set('posted.' + col, 0); await this.submit({ score: best, character, daily: col !== 'scores' }); }
    }
  }

  async top(daily = false, limit = 50) {
    if (!this.enabled) return [];
    const q = { structuredQuery: { from: [{ collectionId: daily ? this.dailyCol() : 'scores' }], orderBy: [{ field: { fieldPath: 'score' }, direction: 'DESCENDING' }], limit } };
    const r = await fetch(`${base()}:runQuery?key=${FIREBASE.apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(q) });
    if (!r.ok) throw new Error('leaderboard ' + r.status);
    const rows = await r.json();
    return rows.filter(x => x.document).map(x => {
      const f = x.document.fields;
      return { id: x.document.name.split('/').pop(), name: f.name?.stringValue || '?', score: +(f.score?.integerValue || 0), character: f.character?.stringValue || '' };
    });
  }
}
