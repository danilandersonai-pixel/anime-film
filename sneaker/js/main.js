// main.js — связывает модель, студию, режиссуру, надписи, звук и плеер.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildShoe, COLORWAYS, shoeTransform } from './shoe.js';
import { createStage } from './stage.js';
import { evaluate, DURATION, GLOWS, setRig } from './timeline.js';
import { createOverlay, CALLOUTS } from './overlay.js';
import { renderTrack, toWav } from './audio.js';
import { loadHDRI } from './hdri.js';
import { scans } from './textures.js';
import { loadAsphalt, BG_YAW } from './street.js';
import { createWater } from './water.js';

const CAPTURE = new URLSearchParams(location.search).has('capture');
const COVER_T = 30.2;   // обложка до нажатия: готовый пэкшот
const EXPLORE_T = 30.2; // свет и фон для свободного осмотра
const $ = (id) => document.getElementById(id);
if (CAPTURE) document.body.classList.add('capture');

// шрифты нужны до первого кадра: ими рисуются надписи на холсте и в SVG
try { await Promise.race([Promise.all(['800 100px Unbounded', '600 30px Unbounded', '500 30px Manrope', '700 30px Manrope'].map((f) => document.fonts.load(f))), new Promise((r) => setTimeout(r, 4000))]); } catch (e) { /* запасной шрифт */ }

const canvas = $('gl');
const stageEl = $('stage');
const W0 = 1920, H0 = 1080;
// скан асфальта нужен до сборки улицы
const asphalt = await loadAsphalt();
const stage = createStage(canvas, { width: W0, height: H0, pixelRatio: 1, asphalt });
// ночной город (HDRI Shanghai Bund): фон и отражения; если не загрузился — остаётся нарисованная студия
try { stage.setEnvironment(await loadHDRI('assets/city.png')); } catch (e) { console.warn('HDRI не загрузилась', e); }
// скан ткани для канта и языка; без него кроссовок соберётся с нарисованной тканью
let jersey = null;
try { jersey = await scans(); } catch (e) { console.warn('скан ткани не загрузился', e); }
const shoe = buildShoe({ jersey });
stage.adopt(shoe.root);
setRig(shoe.macro);
const overlay = createOverlay($('ov'));
const cam = stage.camera;
const tmp = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
const water = createWater(stage.scene, shoe.materials.drop, evaluate);

// ---------------------------------------------------------------------
// Состояние кадра → сцена
// ---------------------------------------------------------------------
function apply(S, cwOverride) {
  const cwName = cwOverride || S.colorway;
  if (shoe.root.userData.colorway !== cwName) shoe.setColorway(cwName);
  const [g1, g2] = GLOWS[cwName];
  const c1 = new THREE.Color(g1), c2 = new THREE.Color(g2);

  // кроссовок: поворот вокруг вертикали, наклон носка, крен; опора — пятка или носок
  const r = shoe.root, sh = S.shoe;
  shoeTransform(sh, r.position, r.quaternion);
  const e = sh.explode, G = shoe.groups;
  G.upper.position.set(0, 0.5 * e - sh.squash * 0.4, 0);
  G.foamTop.position.set(0, 0.06 * e, 0);
  G.plate.position.set(0, -0.12 * e, 0);
  G.foamBottom.position.set(0, -0.3 * e, 0);
  G.outsole.position.set(0, -0.52 * e, 0);
  G.upper.rotation.y = 0.07 * sh.partYaw; G.foamBottom.rotation.y = -0.05 * sh.partYaw; G.outsole.rotation.y = 0.08 * sh.partYaw; G.plate.rotation.y = -0.03 * sh.partYaw;
  for (const k of ['foamTop', 'foamBottom', 'plate']) G[k].scale.y = 1 - sh.squash;

  // камера
  cam.position.set(...S.cam.pos);
  cam.up.set(0, 1, 0);
  cam.lookAt(...S.cam.target);
  cam.rotateZ(S.cam.roll);
  if (cam.fov !== S.cam.fov) { cam.fov = S.cam.fov; cam.updateProjectionMatrix(); }
  cam.updateMatrixWorld(true);

  // свет
  const L = stage.lights;
  L.key.intensity = S.light.key;
  L.rimL.intensity = S.light.rimL; L.rimL.color.copy(c2).lerp(new THREE.Color('#ffffff'), 0.25);
  L.rimR.intensity = S.light.rimR; L.rimR.color.copy(c1).lerp(new THREE.Color('#ffffff'), 0.15);
  L.sweep.intensity = S.light.sweep;
  L.sweep.position.set(...(S.light.sweepPos || [0, 1.5, 2.4])); L.sweep.lookAt(...(S.light.sweepLook || [0, 0.5, 0]));
  stage.scene.environmentRotation.set(0, BG_YAW + 0.3 * (S.light.envRot || 0), 0);
  L.sun.intensity = S.light.sun;
  stage.scene.environmentIntensity = S.light.env;
  // пена светится изнутри сильнее, когда в студии светлее
  shoe.materials.foamTop.userData.sssAmt.value = shoe.materials.foamBottom.userData.sssAmt.value = 0.1 * S.light.env;

  // улица: дождь, лужи, огни, машина, молния; вода в движении
  stage.street.update(S, L.rimL, L.rimR);
  water.update(S);
  stage.bokeh.enabled = S.bokeh.on;
  if (S.bokeh.on) { stage.bokeh.uniforms.focus.value = S.bokeh.focus; stage.bokeh.uniforms.aperture.value = S.bokeh.aperture; stage.bokeh.uniforms.maxblur.value = S.bokeh.maxblur; }
  stage.bloom.strength = S.bloom * 0.7; // ночью ярких точек много — свечение мягче
  stage.final.uniforms.flash.value = S.flash;
  stage.final.uniforms.fade.value = S.fade;
  stage.final.uniforms.time.value = S.t;
  return g1;
}

// точка детали на экране (в координатах кадра 1920×1080)
const ANCH = Object.fromEntries(CALLOUTS.map((c) => [c.part, c.part]));
function project(part) {
  const grp = shoe.groups[ANCH[part]];
  grp.updateMatrixWorld(true);
  tmp.set(...shoe.anchors[part]).applyMatrix4(grp.matrixWorld).project(cam);
  return [(tmp.x + 1) / 2 * W0, (1 - tmp.y) / 2 * H0];
}

// ---------------------------------------------------------------------
// Смаз движения (только для рендера MP4): затвор открыт половину кадра,
// за это время кадр рисуется несколько раз и усредняется. Сколько раз —
// зависит от того, насколько далеко на экране сдвигается кроссовок.
// ---------------------------------------------------------------------
const MB = CAPTURE && !new URLSearchParams(location.search).has('nomb');
const SHUTTER = 0.5 / 24, MB_STEP = 6, MB_MAX = 10;
const PROBE = [[-1.4, 0.85, 0], [1.45, 0.3, 0], [-1.2, 0.02, 0.35], [1.2, 0.02, -0.3], [0.3, 0.75, 0], [0, 0.5, 0.45], [0, 0.5, -0.45]];
function screenProbe(t) {
  apply(evaluate(t));
  shoe.root.updateMatrixWorld(true);
  const out = PROBE.map((p) => tmp.set(...p).applyMatrix4(shoe.root.matrixWorld).project(cam).toArray());
  for (const part of CALLOUTS.map((c) => c.part)) out.push(tmp.set(...shoe.anchors[part]).applyMatrix4(shoe.groups[part].matrixWorld).project(cam).toArray());
  return out;
}
function camTurnPixels(t) {
  const A = evaluate(t).cam, B = evaluate(t + SHUTTER).cam;
  const dir = (c) => new THREE.Vector3(c.target[0] - c.pos[0], c.target[1] - c.pos[1], c.target[2] - c.pos[2]).normalize();
  return dir(A).angleTo(dir(B)) / THREE.MathUtils.degToRad(A.fov) * H0 + Math.abs(B.roll - A.roll) * H0 * 0.5;
}
function motionPixels(t) {
  // окно затвора начинается в момент кадра — так смаз не перетекает через монтажную склейку
  const a = screenProbe(t), b = screenProbe(t + SHUTTER);
  let d = 0;
  const vis = (p) => Math.abs(p[2]) < 1 && Math.abs(p[0]) < 1.2 && Math.abs(p[1]) < 1.2; // только точки в кадре
  a.forEach((p, i) => { const q = b[i]; if (vis(p) && vis(q)) d = Math.max(d, Math.hypot((p[0] - q[0]) * W0 / 2, (p[1] - q[1]) * H0 / 2)); });
  return Math.max(d, camTurnPixels(t));
}

function renderAt(t) {
  const n = MB ? Math.max(1, Math.min(MB_MAX, Math.ceil(motionPixels(t) / MB_STEP))) : 1;
  const S = evaluate(t);
  const accent = apply(S);
  shoe.root.updateMatrixWorld(true);
  overlay.update(t, S, project, accent);
  if (n === 1) stage.render(t);
  else {
    // на сильном смазе затенение в щелях не разглядеть — экономим его
    const ao = stage.gtao.enabled; if (n >= 6) stage.gtao.enabled = false;
    stage.render(t, n, (i) => { apply(evaluate(t + SHUTTER * (i + 0.5) / n)); shoe.root.updateMatrixWorld(true); });
    stage.gtao.enabled = ao;
  }
  return S;
}

// ---------------------------------------------------------------------
// Звук: дорожка рендерится один раз и играет как буфер
// ---------------------------------------------------------------------
let trackPromise = null;
const getTrack = () => (trackPromise ||= renderTrack(48000));

// для рендера MP4
window.__ad = {
  duration: DURATION,
  render: (t) => { renderAt(t); return true; },
  motion: (t) => motionPixels(t),
  wav: async () => {
    const buf = await getTrack();
    const bytes = new Uint8Array(toWav(buf));
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  },
  ready: false,
};

if (CAPTURE) {
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
  let mode = 'cover', t = COVER_T, startPerf = 0, startAudio = 0, actx = null, src = null, soundOn = true, cwPick = null;
  let controls = null, raf = 0;
  const fmt = (x) => `0:${String(Math.floor(x)).padStart(2, '0')}`;

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
      const S = evaluate(EXPLORE_T);
      S.shoe = { pos: [0, 0, 0], yaw: 0, pitch: 0, roll: 0, pivot: null, explode: 0, squash: 0, partYaw: 0 };
      S.flash = 0; S.fade = 0;
      const accent = apply(S, cwPick || 'ember');
      cam.position.copy(controls.object.position);
      cam.quaternion.copy(controls.object.quaternion);
      overlay.update(-1, { shot: 'none' }, project, accent);
      stage.render(EXPLORE_T);
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
      if (t >= DURATION) { pause(); mode = 'cover'; t = COVER_T; draw(); bigPlay.hidden = false; bigPlay.querySelector('span').textContent = 'Посмотреть ещё раз'; return; }
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
      proxy.position.set(3.4, 1.3, 3.8);
      controls = new OrbitControls(proxy, stageEl);
      controls.target.set(0, 0.55, 0);
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
    cancelAnimationFrame(raf);
  }

  bigPlay.addEventListener('click', () => play(0));
  playBtn.addEventListener('click', () => (mode === 'playing' ? pause() : play()));
  canvas.addEventListener('click', () => { if (mode === 'playing') pause(); else if (mode !== 'explore') play(); });
  seek.addEventListener('input', () => { leaveExplore(); if (mode === 'playing') pause(); mode = 'paused'; bigPlay.hidden = true; t = Number(seek.value); draw(); });
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
  getTrack(); // заранее готовим дорожку
  window.__ad.ready = true;
}
