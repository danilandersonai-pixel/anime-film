// main.js — плеер роликов ORBITA Pulse One:
//   «Улица» (v5, film5.js) — ночной город под ливнем, падение в лужу по законам физики;
//   «Анатомия» (v6, film6.js) — тёмная студия, разбор на детали, шнуровка, игра света;
//   «Кристаллы» (v7, film7.js) — полёт сквозь туманный мир кристаллов к тёплому гнезду.
// Здесь общее: модель, камера и объектив (автофокус, глубина резкости), смаз движения
// для рендера MP4 и сам плеер. Все монтажи рендерятся ещё и в Blender Cycles.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildShoe } from './shoe.js';
import { createStage } from './stage.js';
import { scans } from './textures.js';
import { loadAsphalt } from './street.js';
import { toWav } from './audio5.js';

const Q = new URLSearchParams(location.search);
const CAPTURE = Q.has('capture');
// ролик: ?film=anatomy|crystals или #anatomy|#crystals; по умолчанию — «Улица»
const FILMS = { street: 'street', anatomy: 'studio', crystals: 'cave' }; // ролик → сцена
const FILM = FILMS[Q.get('film') || location.hash.slice(1)] ? (Q.get('film') || location.hash.slice(1)) : 'street';
const $ = (id) => document.getElementById(id);
if (CAPTURE) document.body.classList.add('capture');

// шрифты нужны до первого кадра: ими набраны карточка и подписи
try { await Promise.race([Promise.all(['800 104px Unbounded', '600 36px Unbounded', '600 42px Manrope', '600 27px Manrope'].map((f) => document.fonts.load(f))), new Promise((r) => setTimeout(r, 4000))]); } catch (e) { /* запасной шрифт */ }

const canvas = $('gl');
const stageEl = $('stage');
const W0 = 1920, H0 = 1080;
const stage = createStage(canvas, { width: W0, height: H0, pixelRatio: 1, mode: FILMS[FILM], asphalt: FILM === 'street' ? await loadAsphalt() : null });
let jersey = null;
try { jersey = await scans(); } catch (e) { console.warn('скан ткани не загрузился', e); }
const hero = buildShoe({ jersey });
stage.adopt(hero.root);
const cam = stage.camera;

// два слоя поверх кадра: карточка и подписи деталей
const NS = 'http://www.w3.org/2000/svg';
const layer = () => { const s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '0 0 1920 1080'); s.setAttribute('width', '100%'); s.setAttribute('height', '100%'); s.style.position = 'absolute'; s.style.inset = '0'; $('ov').appendChild(s); return s; };
const layers = { labels: layer(), card: layer() };
const film = FILM === 'street' ? await (await import('./film5.js')).createFilm5({ stage, hero, jersey, layers })
  : FILM === 'anatomy' ? await (await import('./film6.js')).createFilm6({ stage, hero, layers, camera: cam })
    : await (await import('./film7.js')).createFilm7({ stage, hero, layers, camera: cam });
const COLORWAY = film.colorway || 'ember'; // расцветка героя ролика
const DURATION = film.duration;

// автофокус, как у фокус-пуллера: луч из центра кадра до кроссовка
const ray = new THREE.Raycaster(), afTargets = [];
hero.root.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) afTargets.push(o); });
function focusOf(S) {
  if (!S.cam.af) return S.cam.focus;
  ray.setFromCamera(new THREE.Vector2(0, 0), cam);
  const hit = ray.intersectObjects(afTargets, false)[0];
  return hit ? hit.distance * S.cam.af : S.cam.focus;
}

// состояние кадра → сцена: сначала ролик (кроссовок, детали, свет), потом камера и объектив
function apply(S) {
  film.apply(S);
  cam.position.set(...S.cam.pos);
  cam.up.set(0, 1, 0);
  cam.lookAt(...S.cam.target);
  cam.rotateZ(S.cam.roll);
  if (cam.fov !== S.cam.fov) { cam.fov = S.cam.fov; cam.updateProjectionMatrix(); }
  cam.updateMatrixWorld(true);
  stage.dof.fstop = S.cam.fstop;
  stage.dof.focus = focusOf(S);
  stage.final.uniforms.flash.value = 0;
  stage.final.uniforms.fade.value = S.fade;
  stage.final.uniforms.time.value = S.t;
}

// ---------------------------------------------------------------------
// Смаз движения (только для рендера MP4): затвор открыт половину кадра,
// кадр рисуется несколько раз и усредняется — столько раз, насколько далеко
// на экране сдвигается кроссовок (или летящая деталь) и поворачивается камера.
// ---------------------------------------------------------------------
const MB = CAPTURE && !Q.has('nomb');
const SHUTTER = 0.5 / 24, MB_STEP = 6, MB_MAX = 10;
function screenProbe(t) {
  apply(film.evaluate(t));
  return film.probes().map((p) => p.project(cam).toArray());
}
function camTurnPixels(t) {
  const A = film.evaluate(t).cam, B = film.evaluate(t + SHUTTER).cam;
  const dir = (c) => new THREE.Vector3(c.target[0] - c.pos[0], c.target[1] - c.pos[1], c.target[2] - c.pos[2]).normalize();
  return dir(A).angleTo(dir(B)) / THREE.MathUtils.degToRad(A.fov) * H0 + Math.abs(B.roll - A.roll) * H0 * 0.5;
}
function motionPixels(t) {
  // окно затвора начинается в момент кадра — смаз не перетекает через склейку
  if (film.evaluate(t).shot !== film.evaluate(t + SHUTTER).shot) return 0;
  const a = screenProbe(t), b = screenProbe(t + SHUTTER);
  let d = 0;
  const vis = (p) => Math.abs(p[2]) < 1 && Math.abs(p[0]) < 1.2 && Math.abs(p[1]) < 1.2;
  a.forEach((p, i) => { const q = b[i]; if (vis(p) && vis(q)) d = Math.max(d, Math.hypot((p[0] - q[0]) * W0 / 2, (p[1] - q[1]) * H0 / 2)); });
  return Math.max(d, camTurnPixels(t));
}

function renderAt(t) {
  const n = MB ? Math.max(1, Math.min(MB_MAX, Math.ceil(motionPixels(t) / MB_STEP))) : 1;
  const S = film.evaluate(t);
  apply(S);
  film.overlay(t, S);
  if (n === 1) stage.render(t);
  else stage.render(t, n, (i) => apply(film.evaluate(t + SHUTTER * (i + 0.5) / n)));
  return S;
}

// ---------------------------------------------------------------------
// Звук: дорожка рендерится один раз и играет как буфер
// ---------------------------------------------------------------------
let trackPromise = null;
const getTrack = () => (trackPromise ||= film.track());

// для рендера MP4 и проверки кадров
window.__ad = {
  film: FILM,
  duration: DURATION,
  render: (t) => { renderAt(t); return true; },
  // проверка ракурсов: кадр t с другой камерой ({ pos, target, fov, fstop, focus })
  view: (t, c0) => { const S = film.evaluate(t), { light, orbs, ...c } = c0; if (light) Object.assign(S.light, light); if (orbs) S.orbs = orbs; Object.assign(S.cam, c); if (c.focus === undefined) S.cam.focus = Math.hypot(S.cam.pos[0] - S.cam.target[0], S.cam.pos[1] - S.cam.target[1], S.cam.pos[2] - S.cam.target[2]); S.cam.af = 0; apply(S); film.overlay(t, S); stage.render(t); return true; },
  motion: (t) => motionPixels(t),
  wav: async () => {
    const bytes = new Uint8Array(toWav(await getTrack()));
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  },
  ready: false,
};

if (CAPTURE) {
  // ?half — быстрые проверочные кадры 960×540 (растягиваются до 1920×1080 при снимке)
  if (Q.has('half')) stage.setSize(960, 540, 1);
  film.prepare();
  renderAt(0);
  window.__ad.ready = true;
} else {
  initPlayer();
}

// ---------------------------------------------------------------------
// Плеер
// ---------------------------------------------------------------------
function initPlayer() {
  const playBtn = $('play'), bigPlay = $('bigplay'), seek = $('seek'), clock = $('clock'), soundBtn = $('sound'), exploreBtn = $('explore');
  let mode = 'cover', t = film.cover, startPerf = 0, startAudio = 0, actx = null, src = null, soundOn = true, cwPick = null;
  let controls = null, raf = 0;
  const fmt = (x) => `0:${String(Math.floor(x)).padStart(2, '0')}`;
  seek.max = String(DURATION);

  // переключатель роликов: другой ролик — другая сцена, поэтому страница перезагружается
  document.querySelectorAll('[data-film]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.film === FILM));
    b.addEventListener('click', () => { if (b.dataset.film === FILM) return; location.hash = b.dataset.film; location.reload(); });
  });
  document.querySelectorAll('[data-for]').forEach((n) => { n.hidden = n.dataset.for !== FILM; });

  // разрешение: по размеру сцены на экране, с понижением, если кадр не успевает
  const SCALES = [1, 0.8, 0.66, 0.5];
  let si = 0, slow = 0;
  function resize() {
    const w = stageEl.clientWidth, dpr = Math.min(window.devicePixelRatio || 1, 2);
    const px = Math.min(1920, Math.round(w * dpr));
    const s = SCALES[si];
    stage.setSize(Math.round(px * s), Math.round(px * s * 9 / 16), 1);
  }
  resize();
  window.addEventListener('resize', resize);

  function draw() {
    const t0 = performance.now();
    if (mode === 'explore') {
      const S = film.explore();
      if (hero.root.userData.colorway !== (cwPick || COLORWAY)) hero.setColorway(cwPick || COLORWAY);
      apply(S);
      cam.position.copy(controls.object.position);
      cam.quaternion.copy(controls.object.quaternion);
      cam.updateMatrixWorld(true);
      stage.dof.fstop = 5.6;
      stage.dof.focus = cam.position.distanceTo(controls.target);
      film.overlay(-1, S);
      stage.render(S.t);
    } else {
      renderAt(t);
    }
    const ms = performance.now() - t0;
    if (mode === 'playing') {
      slow = ms > 45 ? slow + 1 : Math.max(0, slow - 1);
      if (slow > 6 && si < SCALES.length - 1) { si++; slow = 0; resize(); }
    }
    seek.value = String(mode === 'cover' ? 0 : t);
    clock.textContent = `${fmt(mode === 'cover' ? 0 : t)} / ${fmt(DURATION)}`;
    stageEl.style.setProperty('--progress', `${(t / DURATION) * 100}%`);
  }

  function now() {
    if (actx && soundOn && src) return actx.currentTime - startAudio;
    return (performance.now() - startPerf) / 1000;
  }
  async function startAudioAt(from) {
    stopAudio();
    if (!soundOn) return;
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    await actx.resume();
    const buf = await getTrack();
    src = actx.createBufferSource(); src.buffer = buf; src.connect(actx.destination);
    startAudio = actx.currentTime + 0.05 - from;
    src.start(actx.currentTime + 0.05, from);
  }
  function stopAudio() { if (src) { try { src.stop(); } catch (e) { /* уже остановлен */ } src = null; } }

  async function play(from = t) {
    if (mode === 'cover' || from >= DURATION - 0.05) from = 0;
    leaveExplore();
    film.prepare();
    mode = 'playing'; t = from;
    bigPlay.hidden = true;
    playBtn.setAttribute('aria-label', 'Пауза'); playBtn.dataset.state = 'playing';
    startPerf = performance.now() - from * 1000;
    await startAudioAt(from);
    startPerf = performance.now() - from * 1000;
    loop();
  }
  function pause() {
    mode = 'paused'; stopAudio();
    playBtn.setAttribute('aria-label', 'Смотреть'); playBtn.dataset.state = 'paused';
    cancelAnimationFrame(raf);
  }
  function loop() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      if (mode !== 'playing') return;
      t = Math.min(DURATION, now());
      draw();
      if (t >= DURATION) { pause(); mode = 'cover'; t = film.cover; draw(); bigPlay.hidden = false; bigPlay.querySelector('span').textContent = 'Посмотреть ещё раз'; return; }
      loop();
    });
  }
  function enterExplore() {
    pause();
    mode = 'explore';
    stageEl.classList.add('exploring');
    exploreBtn.setAttribute('aria-pressed', 'true');
    bigPlay.hidden = true;
    if (!controls) {
      const proxy = new THREE.PerspectiveCamera(28, 16 / 9, 0.05, 150);
      proxy.position.set(...(film.explorePos || [3.4, 1.3, 3.8]));
      controls = new OrbitControls(proxy, stageEl);
      controls.target.set(...film.exploreTarget);
      controls.enableDamping = true; controls.minDistance = 2.2; controls.maxDistance = 9;
      controls.maxPolarAngle = Math.PI * 0.49; controls.enablePan = false;
    }
    controls.enabled = true;
    controls.update();
    // перерисовка только когда камера движется (вращение или затухание инерции)
    const spin = () => { if (mode !== 'explore') return; if (controls.update()) draw(); raf = requestAnimationFrame(spin); };
    draw();
    spin();
  }
  function leaveExplore() {
    if (mode !== 'explore') return;
    controls.enabled = false;
    stageEl.classList.remove('exploring');
    exploreBtn.setAttribute('aria-pressed', 'false');
    cwPick = null;
    document.querySelectorAll('[data-cw]').forEach((x) => x.setAttribute('aria-pressed', 'false'));
    if (hero.root.userData.colorway !== COLORWAY) hero.setColorway(COLORWAY);
    cancelAnimationFrame(raf);
  }

  bigPlay.addEventListener('click', () => play(0));
  playBtn.addEventListener('click', () => (mode === 'playing' ? pause() : play()));
  canvas.addEventListener('click', () => { if (mode === 'playing') pause(); else if (mode !== 'explore') play(); });
  seek.addEventListener('input', () => { leaveExplore(); film.prepare(); if (mode === 'playing') pause(); mode = 'paused'; bigPlay.hidden = true; t = Number(seek.value); draw(); });
  soundBtn.addEventListener('click', async () => {
    soundOn = !soundOn;
    soundBtn.setAttribute('aria-pressed', String(soundOn));
    soundBtn.querySelector('span').textContent = soundOn ? 'Звук включён' : 'Без звука';
    if (mode === 'playing') { const at = now(); startPerf = performance.now() - at * 1000; if (soundOn) await startAudioAt(at); else stopAudio(); }
  });
  exploreBtn.addEventListener('click', () => (mode === 'explore' ? (leaveExplore(), (mode = 'paused'), draw()) : enterExplore()));
  document.querySelectorAll('[data-cw]').forEach((b) => b.addEventListener('click', () => {
    cwPick = b.dataset.cw;
    document.querySelectorAll('[data-cw]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    if (mode !== 'explore') enterExplore(); else draw();
  }));
  window.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input')) return;
    if (e.code === 'Space') { e.preventDefault(); mode === 'playing' ? pause() : play(); }
  });
  draw();
  // заранее: дорожка и то, что ролику понадобится позже, пока зритель смотрит на обложку
  setTimeout(() => { film.prepare(); getTrack(); }, 400);
  window.__ad.ready = true;
}
