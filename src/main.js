import * as THREE from 'three';
import { View } from './renderer.js';
import { Assets, Track, HALF, THEMES } from './world.js';
import { Run } from './game.js';
import { PlayerView, loadAtlas } from './player.js';
import { HananView } from './host.js';
import { UI3D } from './ui3d.js';
import { GameAudio } from './audio.js';
import { CHARACTERS, getCharacter, HOST_LINES } from './characters.js';
import FRAMES from './frames.json';
import { Wallet, UPGRADES, UNLOCK_COST, dailySeed, mulberry32 } from './economy.js';
import { Music } from './music.js';
import { Haptic } from './haptics.js';
import { Leaderboard } from './leaderboard.js';

const $ = id => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem('tr.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('tr.' + k, JSON.stringify(v)); } catch { /* ignore */ } },
};

const settings = {
  quality: store.get('quality', 'auto'),
  shadows: store.get('shadows', true),
  touch: store.get('touch', false),
};

const loadingText = $('loadingText');
const tick = () => new Promise(r => requestAnimationFrame(() => r()));

async function boot() {
  await tick();
  const view = new View($('world'), settings.quality);
  view.setShadows(settings.shadows);
  loadingText.textContent = 'מרכיבים ארונות שרתים…'; $('loadFill').style.width = '35%';
  await tick();
  const assets = new Assets(view.renderer, view.quality);
  const track = new Track(view.scene, assets);
  const run = new Run(track);
  const themeParam = new URLSearchParams(location.search).get('room');
  if (themeParam) track.firstTheme = themeParam;
  const qs = new URLSearchParams(location.search);
  track.debugRide = qs.get('ride'); track.debugEvent = qs.get('event');
  const player = new PlayerView(view.scene, assets);
  const ui3d = new UI3D(view.scene);
  const audio = new GameAudio();
  const hanan = new HananView(view.scene, assets);
  const wallet = new Wallet(store);
  const music = new Music(audio);
  const haptic = new Haptic(store);
  const board = new Leaderboard(store);
  let daily = false;
  let character = getCharacter(store.get('character', 'technician'));
  loadingText.textContent = 'מעירים את הצוות…'; $('loadFill').style.width = '75%';
  await Promise.all(CHARACTERS.map(c => loadAtlas(c.atlas)));
  await player.setCharacter(character);
  await hanan.load();
  loadingText.textContent = 'מכינים את כל העולמות…'; $('loadFill').style.width = '88%';
  await track.prewarm(view.renderer, view.camera);
  run.reset(character); run.mode = 'ready';
  // warm up shaders so the first frames don't hitch
  view.update(run, .016, 0);
  view.renderer.compile(view.scene, view.camera);
  $('loadFill').style.width = '100%';
  await new Promise(r => setTimeout(r, 350));
  $('loading').classList.add('done');
  if (location.search.includes('debug')) window.__tembel = { run, track, view, player, assets };

  /* ---------------- UI helpers ---------------- */
  const imgCache = {};
  const atlasImage = name => imgCache[name] ||= new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = `${import.meta.env.BASE_URL}assets/characters/${name}.webp?v=${__BUILD__}`; });
  async function drawPortrait(canvas, ch) {
    const img = await atlasImage(ch.atlas);
    const [x, y, w, h] = FRAMES[ch.atlas].frames[ch.portraitFrame ?? 10];
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, canvas.width, canvas.height);
    // head-and-shoulders crop
    const cw = w * 1.1, ch2 = cw;
    g.drawImage(img, x + w / 2 - cw / 2, y - 4, cw, ch2, 0, 0, canvas.width, canvas.height);
  }
  function refreshCharacterButton() {
    $('characterName').textContent = character.name;
    $('characterPower').textContent = '⚡ ' + character.power.name;
    drawPortrait($('characterThumb'), character);
  }
  function refreshBest() {
    $('bestStart').textContent = store.get('bestScore', 0).toLocaleString('he-IL');
    $('bestDist').textContent = store.get('bestDistance', 0).toLocaleString('he-IL');
  }
  let toastTimer;
  function toast(text, ms = 1400) {
    const t = $('toast'); t.textContent = text; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }
  const lastLine = {};
  function hostLine(kind) {
    const opts = HOST_LINES[kind]; let i = Math.floor(Math.random() * opts.length);
    if (i === lastLine[kind]) i = (i + 1) % opts.length; lastLine[kind] = i;
    return opts[i].replaceAll('{name}', character.name).replaceAll('{chips}', run.chips);
  }
  function radio(kind) {
    const r = $('radio'); r.hidden = true; void r.offsetWidth;
    $('radioText').textContent = hostLine(kind); r.hidden = false;
  }
  function showRoom(name) {
    const b = $('roomBadge'); b.hidden = true; void b.offsetWidth; b.textContent = name; b.hidden = false;
  }

  // character dialog
  const grid = $('characterGrid');
  for (const ch of CHARACTERS) {
    const card = document.createElement('button');
    card.className = 'char-card'; card.dataset.id = ch.id;
    const cv = document.createElement('canvas'); cv.width = cv.height = 220;
    card.append(cv);
    card.insertAdjacentHTML('beforeend', `<strong>${ch.name}</strong><small>${ch.description}</small><em>⚡ ${ch.power.name}</em><small>${ch.power.description}</small><span class="lock"></span>`);
    drawPortrait(cv, ch);
    card.onclick = async () => {
      if (!wallet.isUnlocked(ch.id)) {
        if (!wallet.unlock(ch.id)) { toast(`צריך עוד ${(UNLOCK_COST[ch.id] - wallet.balance).toLocaleString('he-IL')} QSFP`, 1400); return; }
        audio.unlock(); audio.play({ type: 'record' }); refreshWallet();
      }
      character = ch; store.set('character', ch.id);
      grid.querySelectorAll('.char-card').forEach(c => c.classList.toggle('selected', c.dataset.id === ch.id));
      await player.setCharacter(ch); run.character = ch;
      refreshCharacterButton();
      $('characterDialog').close();
    };
    grid.append(card);
  }
  grid.querySelector(`[data-id="${character.id}"]`).classList.add('selected');
  function refreshLocks() {
    grid.querySelectorAll('.char-card').forEach(c => {
      const id = c.dataset.id, locked = !wallet.isUnlocked(id);
      c.classList.toggle('locked', locked);
      c.querySelector('.lock').textContent = locked ? `🔒 פתיחה ב־${UNLOCK_COST[id].toLocaleString('he-IL')} QSFP` : '';
    });
  }
  // shop
  function renderShop() {
    const list = $('shopList'); list.innerHTML = '';
    for (const u of UPGRADES) {
      const lvl = wallet.level(u.id), cost = wallet.nextCost(u.id);
      const el = document.createElement('div'); el.className = 'shop-item';
      el.innerHTML = `<span class="ic">${u.icon}</span><span><strong>${u.name}</strong><small>${u.desc}</small><span class="pips">${u.costs.map((_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</span></span>`;
      const b = document.createElement('button'); b.className = 'buy';
      b.innerHTML = cost === null ? 'מקסימום ✓' : `${cost.toLocaleString('he-IL')} <i class="qi"></i>`;
      b.disabled = cost === null || wallet.balance < cost;
      b.onclick = () => { if (wallet.buyUpgrade(u.id)) { audio.unlock(); audio.play({ type: 'power' }); refreshWallet(); renderShop(); } };
      el.append(b); list.append(el);
    }
    const head = document.createElement('div'); head.className = 'shop-head'; head.textContent = 'דמויות לפתיחה'; list.append(head);
    for (const ch of CHARACTERS) {
      if (!UNLOCK_COST[ch.id]) continue;
      const el = document.createElement('div'); el.className = 'shop-item';
      const owned = wallet.isUnlocked(ch.id);
      el.innerHTML = `<span class="ic">${owned ? '✅' : '🔒'}</span><span><strong>${ch.name}</strong><small>⚡ ${ch.power.name}</small></span>`;
      const b = document.createElement('button'); b.className = 'buy';
      b.innerHTML = owned ? 'פתוח ✓' : `${UNLOCK_COST[ch.id].toLocaleString('he-IL')} <i class="qi"></i>`;
      b.disabled = owned || wallet.balance < UNLOCK_COST[ch.id];
      b.onclick = () => { if (wallet.unlock(ch.id)) { audio.unlock(); audio.play({ type: 'record' }); refreshWallet(); renderShop(); } };
      el.append(b); list.append(el);
    }
  }
  function refreshWallet() {
    const v = wallet.balance.toLocaleString('he-IL');
    $('walletStart').textContent = v; $('walletShop').textContent = v; refreshLocks();
  }
  // online leaderboard
  let boardDaily = false;
  async function renderBoard() {
    $('boardAll').classList.toggle('on', !boardDaily); $('boardDaily').classList.toggle('on', boardDaily);
    $('boardName').value = board.name;
    const list = $('boardList'); list.innerHTML = '<li class="muted">טוען…</li>';
    try {
      const rows = await board.top(boardDaily);
      list.innerHTML = '';
      if (!rows.length) list.innerHTML = '<li class="muted">עוד אין תוצאות — תהיו הראשונים!</li>';
      rows.forEach((r, i) => {
        const li = document.createElement('li'); if (r.id === board.id) li.className = 'me';
        const ch = CHARACTERS.find(c => c.id === r.character);
        li.innerHTML = `<b>${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</b><span></span><em>${r.score.toLocaleString('he-IL')}</em>`;
        li.querySelector('span').textContent = r.name + (ch ? ` · ${ch.name}` : '');
        list.append(li);
      });
    } catch { list.innerHTML = '<li class="muted">אין חיבור לטבלה כרגע</li>'; }
    $('boardNote').textContent = board.name ? '' : 'בחרו שם כדי שהתוצאות שלכם יופיעו בטבלה.';
  }
  $('boardBtn').hidden = !board.enabled;
  $('boardBtn').onclick = () => { renderBoard(); $('boardDialog').showModal(); };
  $('boardAll').onclick = () => { boardDaily = false; renderBoard(); };
  $('boardDaily').onclick = () => { boardDaily = true; renderBoard(); };
  $('boardSave').onclick = async () => {
    const n = $('boardName').value.trim(); if (!n) return;
    await board.rename(n, character.id);
    if (!board.store.get('posted.scores', 0)) await board.submit({ score: store.get('bestScore', 0), character: character.id });
    toast('נשמר ✓', 900); renderBoard();
  };
  $('shopBtn').onclick = () => { renderShop(); $('shopDialog').showModal(); };
  const todayKey = 'daily.' + dailySeed();
  function refreshDaily() { const b = store.get(todayKey, 0); $('dailyBest').textContent = b ? `השיא היום: ${b.toLocaleString('he-IL')}` : 'מסלול חדש כל יום · QSFP כפול'; }
  $('dailyBtn').onclick = () => startRun(true);
  // install as an app (Android Chrome)
  let installEvt = null;
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; $('installBtn').hidden = false; });
  $('installBtn').onclick = async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice.catch(() => {}); installEvt = null; $('installBtn').hidden = true; };
  // frame-rate meter
  $('fpsSetting').checked = store.get('fps', false) || location.search.includes('fps'); $('fps').hidden = !$('fpsSetting').checked;
  $('fpsSetting').onchange = e => { store.set('fps', e.target.checked); $('fps').hidden = !e.target.checked; };
  $('chooseCharacter').onclick = () => $('characterDialog').showModal();
  document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => b.closest('dialog').close());

  // settings
  $('quality').value = settings.quality;
  $('quality').onchange = e => { settings.quality = e.target.value; if (e.target.value === 'auto') try { localStorage.removeItem('tr.tier'); } catch { /* ignore */ } store.set('quality', settings.quality); view.setQuality(settings.quality); };
  $('shadows').checked = settings.shadows;
  $('shadows').onchange = e => { settings.shadows = e.target.checked; store.set('shadows', settings.shadows); view.setShadows(settings.shadows); };
  const isTouch = matchMedia('(pointer:coarse)').matches;
  $('touchSetting').checked = settings.touch;
  $('touchSetting').onchange = e => { settings.touch = e.target.checked; store.set('touch', settings.touch); syncTouch(); };
  $('musicVol').value = audio.musicVol * 100; $('musicVol').oninput = e => audio.setMusicVol(e.target.value / 100);
  $('sfxVol').value = audio.sfxVol * 100; $('sfxVol').oninput = e => audio.setSfxVol(e.target.value / 100);
  $('settingsOpen').onclick = () => { if (run.mode === 'running') pause(); $('settingsDialog').showModal(); };
  const syncAudioButtons = () => { $('musicToggle').classList.toggle('off', !audio.musicOn); $('sfxToggle').classList.toggle('off', !audio.sfxOn); };
  $('musicToggle').onclick = () => { audio.unlock(); audio.setMusic(!audio.musicOn); syncAudioButtons(); };
  $('sfxToggle').onclick = () => { audio.unlock(); audio.setSfx(!audio.sfxOn); syncAudioButtons(); };
  syncAudioButtons();
  $('hapticsSetting').checked = haptic.on;
  $('hapticsSetting').onchange = e => haptic.set(e.target.checked);
  $('replayTutorial').onclick = () => { store.set('tutorialDone', false); $('settingsDialog').close(); toast('המדריך יופעל בריצה הבאה', 1400); };
  function syncTouch() { $('touchControls').hidden = !(settings.touch && (run.mode === 'running' || run.mode === 'countdown')); }

  /* ---------------- flow ---------------- */
  let countdownTimer = null, overTimer = null, helpSpoken = false;
  function startRun(isDaily = false) {
    clearTimeout(overTimer);
    daily = isDaily === true;
    const tutorial = !daily && !store.get('tutorialDone', false);
    $('tutorial').hidden = true;
    audio.unlock(); audio.playMusic(true); audio.voice('hanan-start.mp3');
    ['start', 'over', 'paused'].forEach(id => $(id).hidden = true);
    $('hud').hidden = false; $('pauseBtn').hidden = false;
    run.reset(character, { bonus: wallet.runBonuses(), daily, tutorial, random: daily ? mulberry32(dailySeed()) : undefined });
    player.setCharacter(character);
    music.setWorld(run.seg.theme === 'hall' ? null : run.seg.theme);
    if (daily) toast('אתגר יומי — אותו מסלול לכולם היום', 1600);
    let n = 3;
    ui3d.showCount(String(n)); audio.play({ type: 'tick' });
    clearInterval(countdownTimer);
    countdownTimer = setInterval(() => {
      n--;
      if (n <= 0) {
        clearInterval(countdownTimer); ui3d.showCount('GO!'); run.mode = 'running'; audio.play({ type: 'go' });
        radio('start'); showRoom(THEMES[run.seg.theme].he);
      } else { ui3d.showCount(String(n)); audio.play({ type: 'tick' }); }
    }, 650);
    syncTouch();
  }
  function pause() {
    if (run.mode !== 'running') return;
    run.mode = 'paused'; $('paused').hidden = false; audio.playMusic(false); syncTouch();
  }
  function resume() {
    $('paused').hidden = true; run.mode = 'running'; audio.playMusic(true); syncTouch();
  }
  function goHome() {
    clearTimeout(overTimer);
    clearInterval(countdownTimer);
    ['over', 'paused', 'hud', 'countdown', 'powerBar', 'danger', 'turnCue', 'tutorial'].forEach(id => $(id).hidden = true);
    $('pauseBtn').hidden = true; $('start').hidden = false;
    run.reset(character, { bonus: wallet.runBonuses() }); run.mode = 'ready'; refreshBest(); syncTouch(); music.setWorld(null);
  }
  function gameOver() {
    const score = run.score, dist = Math.floor(run.distance);
    const best = store.get('bestScore', 0);
    const record = score > best;
    if (record) { store.set('bestScore', score); audio.play({ type: 'record' }); }
    store.set('bestDistance', Math.max(dist, store.get('bestDistance', 0)));
    $('reason').textContent = run.reason;
    $('finalScore').textContent = score.toLocaleString('he-IL');
    $('finalDistance').textContent = dist.toLocaleString('he-IL');
    $('finalChips').textContent = run.chips;
    $('newRecord').hidden = !record;
    $('hostResult').textContent = 'חנן: ' + hostLine(record ? 'record' : 'failure');
    // bank this run's modules
    const fresh = run.chips - run.banked;
    const earned = Math.round(fresh * run.bonus.valueMult * (run.daily ? 2 : 1));
    run.banked = run.chips;
    if (earned > 0) wallet.add(earned);
    $('earned').innerHTML = earned > 0 ? `+${earned.toLocaleString('he-IL')} <i class="qi"></i> QSFP לארנק${run.daily ? ' (כפול באתגר היומי)' : ''} · בארנק: ${wallet.balance.toLocaleString('he-IL')}` : `בארנק: ${wallet.balance.toLocaleString('he-IL')} QSFP`;
    if (run.daily && score > store.get(todayKey, 0)) store.set(todayKey, score);
    board.submit({ score, character: character.id, daily: run.daily }).then(ok => { if (ok) $('hostResult').textContent += ' · 🏆 עודכן בטבלת השיאים'; });
    refreshWallet(); refreshDaily();
    $('revive').hidden = run.revives <= 0;
    const cost = 75 * Math.pow(2, run.paidRevives);
    $('reviveBuy').hidden = run.revives > 0;
    $('reviveBuy').disabled = wallet.balance < cost;
    $('reviveBuy').innerHTML = `🤝 חנן עוזר שוב — ${cost.toLocaleString('he-IL')} <i class="qi"></i> QSFP`;
    $('over').hidden = false; $('pauseBtn').hidden = true;
    ['powerBar', 'danger', 'turnCue', 'tutorial'].forEach(id => $(id).hidden = true);
    syncTouch();
  }
  $('play').onclick = () => startRun(false);
  $('again').onclick = () => startRun(daily);
  const continueRun = () => {
    $('over').hidden = true; $('pauseBtn').hidden = false; $('hud').hidden = false;
    audio.playMusic(true); syncTouch();
    toast('חנן הרים אותך! ממשיכים', 1400);
  };
  $('reviveBuy').onclick = () => {
    const cost = 75 * Math.pow(2, run.paidRevives);
    if (!wallet.spend(cost)) return;
    run.paidRevives++; run.revives++; run.revive(); refreshWallet(); continueRun();
  };
  $('revive').onclick = () => {
    if (!run.revive()) return;
    $('over').hidden = true; $('pauseBtn').hidden = false; $('hud').hidden = false;
    audio.playMusic(true); syncTouch();
    toast('חנן הרים אותך! ממשיכים', 1400);
  };
  $('restart').onclick = () => startRun(daily);
  $('home').onclick = goHome;
  $('quit').onclick = goHome;
  $('resume').onclick = resume;
  $('pauseBtn').onclick = pause;
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

  /* ---------------- input ---------------- */
  const keyMap = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'jump', KeyW: 'jump', Space: 'jump', ArrowDown: 'slide', KeyS: 'slide' };
  addEventListener('keydown', e => {
    if (e.code === 'KeyP' || e.code === 'Escape') { run.mode === 'running' ? pause() : run.mode === 'paused' && resume(); return; }
    if ((e.code === 'Enter' || e.code === 'Space') && !$('start').hidden && !document.querySelector('dialog[open]')) { e.preventDefault(); startRun(); return; }
    const a = keyMap[e.code];
    if (a) { e.preventDefault(); if (!e.repeat) run.input(a); }
  });
  let touchStart = null;
  const canvas = $('world');
  canvas.addEventListener('pointerdown', e => { touchStart = { x: e.clientX, y: e.clientY, t: performance.now(), used: false }; });
  canvas.addEventListener('pointermove', e => {
    if (!touchStart || touchStart.used) return;
    const dx = e.clientX - touchStart.x, dy = e.clientY - touchStart.y, th = 24;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < th) return;
    touchStart.used = true;
    if (Math.abs(dx) > Math.abs(dy)) run.input(dx < 0 ? 'left' : 'right');
    else run.input(dy < 0 ? 'jump' : 'slide');
  });
  addEventListener('pointerup', () => { touchStart = null; });
  $('touchControls').addEventListener('pointerdown', e => { const a = e.target.closest('button')?.dataset.act; if (a) { e.preventDefault(); run.input(a); } });

  /* ---------------- loop ---------------- */
  refreshCharacterButton(); refreshBest(); refreshWallet(); refreshDaily();
  let fpsAcc = 0, fpsN = 0;
  if (isTouch && store.get('touch', null) === null) { /* swipe by default on phones */ }
  const clock = new THREE.Clock();
  let t = 0, idleYaw = 0;
  function frame() {
    requestAnimationFrame(frame);
    const rawDt = clock.getDelta();
    const dt = Math.min(.05, rawDt);
    t += dt;
    view.adapt(rawDt);
    fpsAcc += rawDt; fpsN++;
    if (fpsAcc > .5) { if (!$('fps').hidden) $('fps').textContent = `${Math.round(fpsN / fpsAcc)} FPS · ${view.pixelRatio.toFixed(2)}x · ${view.quality}${view.tier ? ' · T' + view.tier : ''}`; fpsAcc = 0; fpsN = 0; }
    run.update(dt);
    track.pump(run.mode === 'running' ? 3 : 8);
    for (const ev of run.events) {
      audio.play(ev); haptic.play(ev);
      if (ev.type === 'power') { toast(ev.name, 1800); $('powerName').textContent = character.power.name; $('powerBar').hidden = false; }
      else if (ev.type === 'powerEnd') $('powerBar').hidden = true;
      else if (ev.type === 'stumble') { toast('מעידה!', 700); audio.hananSay('careful', 'תיזהר!'); }
      else if (ev.type === 'room') { showRoom(ev.name); music.setWorld(ev.theme === 'hall' ? null : ev.theme); }
      else if (ev.type === 'rideStart') toast({ jack: 'על העגלה! החליקו לצדדים 🛒', tray: 'גלישה במגש הכבלים! 🟨', zip: 'תופסים את הכבל! החליקו לצדדים 🪢' }[ev.kind], 1600);
      else if (ev.type === 'event') toast({ blackout: '⚡ הפסקת חשמל! רצים עם פנס', fm200: '🚨 שחרור גז FM-200! ראות נמוכה', tiles: '⚠️ אריחים חסרים — קופצים!' }[ev.kind], 1800);
      else if (ev.type === 'tutorial') { const tu = $('tutorial'); tu.dataset.dir = ev.step.dir; $('tutText').textContent = ev.step.text; tu.hidden = false; }
      else if (ev.type === 'tutorialStep') { $('tutorial').hidden = true; if (ev.done) { store.set('tutorialDone', true); toast('מעולה! עכשיו זה רק אתה והדאטה סנטר 💪', 2200); } }
      else if (ev.type === 'rideEnd') toast('קפיצה מהרכב!', 800);
      else if (ev.type === 'crash') { clearTimeout(overTimer); helpSpoken = false; overTimer = setTimeout(gameOver, 4500); $('tutorial').hidden = true; }
      else if (ev.type === 'chip' && ev.combo && ev.combo % 10 === 0) toast(`רצף ×${1 + Math.min(4, ev.combo / 10)}`, 900);
    }
    run.events.length = 0;

    // HUD
    if (run.mode === 'running' || run.mode === 'over') {
      $('hudDistance').textContent = Math.floor(run.distance);
      $('hudChips').textContent = run.chips;
      $('hudScore').textContent = run.score.toLocaleString('he-IL');
      $('hudMult').textContent = run.mult > 1 ? '×' + run.mult : '';
      if (run.powerRemaining > 0) $('powerFill').style.width = (run.powerRemaining / (run.powerTotal || character.power.duration) * 100) + '%';
      $('danger').hidden = !(run.mode === 'running' && run.chaserHeat > .45 && run.time > 3);
      const hint = run.mode === 'running' && run.turnHint();
      $('turnCue').hidden = !hint || !$('tutorial').hidden;
      if (hint) {
        const L = $('cueLeft'), R = $('cueRight');
        L.className = 'arrow left ' + (!hint.left ? 'off' : hint.queued === 'left' ? 'chosen' : hint.inWindow ? 'on' : '');
        R.className = 'arrow right ' + (!hint.right ? 'off' : hint.queued === 'right' ? 'chosen' : hint.inWindow ? 'on' : '');
        $('cueText').textContent = hint.queued ? 'פונים!' : hint.inWindow ? 'החליקו עכשיו' : `צומת בעוד ${Math.ceil(hint.distance)} מ׳`;
      }
    }
    audio.setDanger(run.mode === 'running' ? run.chaserHeat : 0);
    // events: lamps die in a blackout, sirens wail during the gas release
    const dark = run.eventKind === 'blackout' ? run.eventK : 0;
    if (Math.abs(dark - (assets.darkNow ?? 0)) > .005) { assets.darkNow = dark; for (const m of Object.values(assets.fixtureMats)) m.emissiveIntensity = 7 * Math.max(0, 1 - dark * 1.05); }
    audio.setSiren(run.mode === 'running' && run.eventKind === 'fm200' ? run.eventK : 0);
    audio.updatePower(run.giant && run.mode === 'running');

    // world animation
    assets.time.value = t;
    assets.prayer.value = THREE.MathUtils.lerp(assets.prayer.value, run.prayer ? 1 : 0, .08);
    for (const seg of track.segments) {
      if (seg === run.seg || seg.parent === run.seg) track.updateChips(seg, t);
      const rel = seg === run.seg ? run.u : seg.parent === run.seg ? run.u - run.seg.length : seg === run.oldSeg ? seg.length + HALF : -1e9;
      track.updateCords(seg, rel - 6, rel + (view.quality === 'high' ? 34 : 22));
      if (rel > -60) track.updateMovers(seg, t, dt);
      for (const p of seg.powerups) if (p.mesh) { p.mesh.rotation.y = t * 1.5; p.mesh.position.y = p.y + Math.sin(t * 3) * .12; p.mesh.getObjectByName('spin')?.rotation.set(t, t * .7, 0); }
    }
    if (run.mode === 'ready') {
      // attract mode: slow orbit around the idle runner
      idleYaw += dt * .12;
      run.camYaw = run.seg.yaw + Math.sin(idleYaw) * .35;
    }
    player.update(run, t, view.camera, dt);
    ui3d.update(run, t, dt, view.camera);
    const bubble = $('hananSpeech');
    const head = hanan.update(run, t, view.camera, dt);
    const talk = head && $('over').hidden && $('paused').hidden;
    bubble.hidden = !talk || (innerWidth <= 820 && !$('start').hidden);
    if (talk) {
      bubble.style.transform = `translate(${head.x}px, ${head.y}px) translate(-50%, -100%)`;
      const span = bubble.querySelector('span'); if (span.textContent !== head.text) span.textContent = head.text;
    }
    // Hanan offers a hand once he reaches you after a crash
    if (hanan.helpReady && !helpSpoken) {
      helpSpoken = true; audio.hananSay('help', 'בוא, אני אעזור לך לקום');
      clearTimeout(overTimer); overTimer = setTimeout(gameOver, 900);
    }
    view.update(run, dt, t);
    view.render();
  }
  frame();
}

// installable app + offline play (only on the real site, not inside embeds)
const isNativeApp = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
if (!isNativeApp && 'serviceWorker' in navigator && window.top === window && location.protocol === 'https:') {
  addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

boot().catch(err => {
  console.error(err);
  loadingText.textContent = 'שגיאה בטעינת המשחק: ' + err.message;
});
