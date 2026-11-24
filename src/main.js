import * as THREE from 'three';
import { View } from './renderer.js';
import { Assets, Track, HALF, THEMES } from './world.js';
import { Run } from './game.js';
import { PlayerView, loadAtlas } from './player.js';
import { HananView } from './host.js';
import { GameAudio } from './audio.js';
import { CHARACTERS, getCharacter, HOST_LINES } from './characters.js';
import FRAMES from './frames.json';

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
  loadingText.textContent = 'מרכיבים ארונות שרתים…';
  await tick();
  const assets = new Assets(view.renderer, view.quality);
  const track = new Track(view.scene, assets);
  const run = new Run(track);
  const themeParam = new URLSearchParams(location.search).get('room');
  if (themeParam) track.firstTheme = themeParam;
  const player = new PlayerView(view.scene, assets);
  const audio = new GameAudio();
  const hanan = new HananView(view.scene, assets);
  let character = getCharacter(store.get('character', 'technician'));
  loadingText.textContent = 'מעירים את הצוות…';
  await Promise.all(CHARACTERS.map(c => loadAtlas(c.atlas)));
  await player.setCharacter(character);
  await hanan.load();
  run.reset(character); run.mode = 'ready';
  // warm up shaders so the first frames don't hitch
  view.update(run, .016, 0);
  view.renderer.compile(view.scene, view.camera);
  $('loading').classList.add('done');
  if (location.search.includes('debug')) window.__tembel = { run, track, view, player, assets };

  /* ---------------- UI helpers ---------------- */
  const imgCache = {};
  const atlasImage = name => imgCache[name] ||= new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = `${import.meta.env.BASE_URL}assets/characters/${name}.webp`; });
  async function drawPortrait(canvas, ch) {
    const img = await atlasImage(ch.atlas);
    const [x, y, w, h] = FRAMES[ch.atlas].frames[ch.portraitFrame ?? 10];
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, canvas.width, canvas.height);
    // head-and-shoulders crop
    const cw = w * 1.1, ch2 = cw;
    g.drawImage(img, x + w / 2 - cw / 2, y - 4, cw, ch2, 0, 0, canvas.width, canvas.height);
  }
  (async () => {
    // Hanan's face for the compact start card on phones
    const img = await atlasImage('hanan-retro');
    const [x, y, w] = FRAMES['hanan-retro'].frames[0];
    const c = $('hananFace'), g = c.getContext('2d');
    g.drawImage(img, x + w * .3, y, w * .45, w * .45, 0, 0, c.width, c.height);
  })();
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
    card.insertAdjacentHTML('beforeend', `<strong>${ch.name}</strong><small>${ch.description}</small><em>⚡ ${ch.power.name}</em><small>${ch.power.description}</small>`);
    drawPortrait(cv, ch);
    card.onclick = async () => {
      character = ch; store.set('character', ch.id);
      grid.querySelectorAll('.char-card').forEach(c => c.classList.toggle('selected', c.dataset.id === ch.id));
      await player.setCharacter(ch); run.character = ch;
      refreshCharacterButton();
      $('characterDialog').close();
    };
    grid.append(card);
  }
  grid.querySelector(`[data-id="${character.id}"]`).classList.add('selected');
  $('chooseCharacter').onclick = () => $('characterDialog').showModal();
  document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => b.closest('dialog').close());

  // settings
  $('quality').value = settings.quality;
  $('quality').onchange = e => { settings.quality = e.target.value; store.set('quality', settings.quality); view.setQuality(settings.quality); };
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
  function syncTouch() { $('touchControls').hidden = !(settings.touch && (run.mode === 'running' || run.mode === 'countdown')); }

  /* ---------------- flow ---------------- */
  let countdownTimer = null, overTimer = null;
  function startRun() {
    clearTimeout(overTimer);
    audio.unlock(); audio.playMusic(true); audio.voice('hanan-start.mp3');
    ['start', 'over', 'paused'].forEach(id => $(id).hidden = true);
    $('hud').hidden = false; $('pauseBtn').hidden = false;
    run.reset(character);
    player.setCharacter(character);
    let n = 3;
    $('countdown').hidden = false; $('countNum').textContent = n; audio.play({ type: 'tick' });
    clearInterval(countdownTimer);
    countdownTimer = setInterval(() => {
      n--;
      if (n <= 0) {
        clearInterval(countdownTimer); $('countdown').hidden = true; run.mode = 'running'; audio.play({ type: 'go' });
        radio('start'); showRoom(THEMES[run.seg.theme].he);
      } else { const c = $('countNum'); c.textContent = n; c.style.animation = 'none'; void c.offsetWidth; c.style.animation = ''; audio.play({ type: 'tick' }); }
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
    ['over', 'paused', 'hud', 'countdown', 'powerBar', 'danger', 'turnCue'].forEach(id => $(id).hidden = true);
    $('pauseBtn').hidden = true; $('start').hidden = false;
    run.reset(character); run.mode = 'ready'; refreshBest(); syncTouch();
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
    $('over').hidden = false; $('pauseBtn').hidden = true;
    ['powerBar', 'danger', 'turnCue'].forEach(id => $(id).hidden = true);
    syncTouch();
  }
  $('play').onclick = startRun;
  $('again').onclick = startRun;
  $('restart').onclick = startRun;
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
  refreshCharacterButton(); refreshBest();
  if (isTouch && store.get('touch', null) === null) { /* swipe by default on phones */ }
  const clock = new THREE.Clock();
  let t = 0, idleYaw = 0;
  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(.05, clock.getDelta());
    t += dt;
    run.update(dt);
    for (const ev of run.events) {
      audio.play(ev);
      if (ev.type === 'power') { toast(ev.name, 1800); $('powerName').textContent = character.power.name; $('powerBar').hidden = false; }
      else if (ev.type === 'powerEnd') $('powerBar').hidden = true;
      else if (ev.type === 'stumble') { toast('מעידה!', 700); radio('stumble'); if (navigator.vibrate) navigator.vibrate(40); }
      else if (ev.type === 'room') showRoom(ev.name);
      else if (ev.type === 'crash') { clearTimeout(overTimer); overTimer = setTimeout(gameOver, 1300); if (navigator.vibrate) navigator.vibrate([60, 40, 120]); }
      else if (ev.type === 'chip' && ev.combo && ev.combo % 10 === 0) toast(`רצף ×${1 + Math.min(4, ev.combo / 10)}`, 900);
    }
    run.events.length = 0;

    // HUD
    if (run.mode === 'running' || run.mode === 'over') {
      $('hudDistance').textContent = Math.floor(run.distance);
      $('hudChips').textContent = run.chips;
      $('hudScore').textContent = run.score.toLocaleString('he-IL');
      $('hudMult').textContent = run.mult > 1 ? '×' + run.mult : '';
      if (run.powerRemaining > 0) $('powerFill').style.width = (run.powerRemaining / character.power.duration * 100) + '%';
      $('danger').hidden = !(run.mode === 'running' && run.chaserHeat > .45 && run.time > 3);
      const hint = run.mode === 'running' && run.turnHint();
      $('turnCue').hidden = !hint;
      if (hint) {
        const L = $('cueLeft'), R = $('cueRight');
        L.className = 'arrow left ' + (!hint.left ? 'off' : hint.queued === 'left' ? 'chosen' : hint.inWindow ? 'on' : '');
        R.className = 'arrow right ' + (!hint.right ? 'off' : hint.queued === 'right' ? 'chosen' : hint.inWindow ? 'on' : '');
        $('cueText').textContent = hint.queued ? 'פונים!' : hint.inWindow ? 'החליקו עכשיו' : `צומת בעוד ${Math.ceil(hint.distance)} מ׳`;
      }
    }
    audio.setDanger(run.mode === 'running' ? run.chaserHeat : 0);

    // world animation
    assets.time.value = t;
    assets.prayer.value = THREE.MathUtils.lerp(assets.prayer.value, run.prayer ? 1 : 0, .08);
    for (const seg of track.segments) {
      if (seg === run.seg || seg.parent === run.seg) track.updateChips(seg, t);
      const rel = seg === run.seg ? run.u : seg.parent === run.seg ? run.u - run.seg.length : seg === run.oldSeg ? seg.length + HALF : -1e9;
      track.updateCords(seg, rel - 6, rel + 34);
      for (const p of seg.powerups) if (p.mesh) { p.mesh.rotation.y = t * 1.5; p.mesh.position.y = p.y + Math.sin(t * 3) * .12; p.mesh.getObjectByName('spin')?.rotation.set(t, t * .7, 0); }
    }
    if (run.mode === 'ready') {
      // attract mode: slow orbit around the idle runner
      idleYaw += dt * .12;
      run.camYaw = run.seg.yaw + Math.sin(idleYaw) * .35;
    }
    player.update(run, t, view.camera, dt);
    const bubble = $('hananSpeech');
    const head = hanan.update(run, t, view.camera);
    const talk = head && (run.mode === 'ready' || run.mode === 'countdown');
    bubble.hidden = !talk || (innerWidth <= 820 && !$('start').hidden);
    if (talk) bubble.style.transform = `translate(${head.x}px, ${head.y}px) translate(-50%, -100%)`;
    view.update(run, dt, t);
    view.render();
  }
  frame();
}

boot().catch(err => {
  console.error(err);
  loadingText.textContent = 'שגיאה בטעינת המשחק: ' + err.message;
});
