// main.js — плеер v5 «по законам физики»: модель, улица, режиссура, физика падения,
// оптика, звук, финальная карточка и сам плеер. Тот же монтаж рендерится в Blender Cycles
// (export5.js → cycles/render.py); здесь он рисуется в реальном времени в браузере.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildShoe, shoeTransform } from './shoe.js';
import { createStage } from './stage.js';
import { evaluate5, DURATION5, setRig5, REST } from './timeline5.js';
import { createCard } from './card5.js';
import { renderTrack5, toWav } from './audio5.js';
import { loadHDRI } from './hdri.js';
import { scans } from './textures.js';
import { loadAsphalt, BG_YAW } from './street.js';
import { createWater5 } from './water5.js';
import { createWaterMaterial, updateWaterMaterials } from './watermat.js';

const CAPTURE = new URLSearchParams(location.search).has('capture');
const DURATION = DURATION5;
const COVER_T = 25.0;   // обложка до нажатия: пэкшот с карточкой
const EXPLORE_T = 25.0; // свет и улица для свободного осмотра
const LINEUP = { glacier: [0.5, 1.85], volt: [-0.5, -1.85] }; // ряд из трёх расцветок — как в Cycles
const $ = (id) => document.getElementById(id);
if (CAPTURE) document.body.classList.add('capture');

// шрифты нужны до первого кадра: ими набрана карточка
try { await Promise.race([Promise.all(['800 104px Unbounded', '600 36px Unbounded', '600 42px Manrope'].map((f) => document.fonts.load(f))), new Promise((r) => setTimeout(r, 4000))]); } catch (e) { /* запасной шрифт */ }

const canvas = $('gl');
const stageEl = $('stage');
const W0 = 1920, H0 = 1080;
const asphalt = await loadAsphalt();
const stage = createStage(canvas, { width: W0, height: H0, pixelRatio: 1, asphalt });
// ночной город (HDRI Shanghai Bund): фон и отражения
try { stage.setEnvironment(await loadHDRI('assets/city.png')); } catch (e) { console.warn('HDRI не загрузилась', e); }
let jersey = null;
try { jersey = await scans(); } catch (e) { console.warn('скан ткани не загрузился', e); }
const hero = buildShoe({ jersey });
stage.adopt(hero.root);
setRig5(hero.macro);
const card = createCard($('ov'));
const cam = stage.camera;
const water = createWater5(stage.scene);
// капли на ткани и пене — тоже вода: отражают город и ловят блики фонаря
const surfaceWater = createWaterMaterial({ surface: true });
const waterMats = [water.material, surfaceWater];
function wetten(s) { s.root.traverse((o) => { if (o.isMesh && o.material === s.materials.drop) { o.material = surfaceWater; o.castShadow = false; } }); }
wetten(hero);

// ещё две расцветки — для плана «три в ряд»; строятся, когда браузер свободен
const lineup = {};
function buildLineup() {
  for (const cw of Object.keys(LINEUP)) {
    if (lineup[cw]) continue;
    const s = buildShoe({ jersey });
    s.setColorway(cw);
    s.root.visible = false;
    const [dx, dz] = LINEUP[cw];
    shoeTransform({ pos: [REST.pos[0] + dx, REST.pos[1], dz], yaw: 0, pitch: REST.pitch, roll: 0, pivot: null }, s.root.position, s.root.quaternion);
    wetten(s);
    stage.adopt(s.root);
    lineup[cw] = s;
  }
}

// автофокус, как у фокус-пуллера: луч из центра кадра до кроссовка
const ray = new THREE.Raycaster(), afTargets = [];
hero.root.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) afTargets.push(o); });
function focusOf(S) {
  if (!S.cam.af) return S.cam.focus;
  ray.setFromCamera(new THREE.Vector2(0, 0), cam);
  const hit = ray.intersectObjects(afTargets, false)[0];
  return hit ? hit.distance * S.cam.af : S.cam.focus;
}

// ---------------------------------------------------------------------
// Состояние кадра → сцена
// ---------------------------------------------------------------------
const RAIN_LAMP = new THREE.Color('#ffad5c'), RAIN_NEON = new THREE.Color('#ff4096'), RAIN_CAR = new THREE.Color('#fff1dc');
function apply(S) {
  // кроссовок: положение и наклон из физики, пена сжимается при ударе
  const r = hero.root, sh = S.shoe, G = hero.groups;
  shoeTransform(sh, r.position, r.quaternion);
  for (const k of Object.keys(G)) { G[k].position.set(0, 0, 0); G[k].rotation.set(0, 0, 0); G[k].scale.set(1, 1, 1); }
  G.upper.position.y = -sh.squash * 0.4;
  for (const k of ['foamTop', 'foamBottom', 'plate']) G[k].scale.y = 1 - sh.squash;
  for (const s of Object.values(lineup)) s.root.visible = S.lineup > 0.5;

  // камера и объектив
  cam.position.set(...S.cam.pos);
  cam.up.set(0, 1, 0);
  cam.lookAt(...S.cam.target);
  cam.rotateZ(S.cam.roll);
  if (cam.fov !== S.cam.fov) { cam.fov = S.cam.fov; cam.updateProjectionMatrix(); }
  cam.updateMatrixWorld(true);
  hero.root.updateMatrixWorld(true);
  stage.dof.fstop = S.cam.fstop;
  stage.dof.focus = focusOf(S);

  // свет улицы; струи дождя видны в свете фонаря, неона и фар
  stage.setLights(S.light);
  const L = stage.lights, head = stage.street.carHead();
  const rainLights = [[L.lamp.position, RAIN_LAMP.clone().multiplyScalar(0.9 * S.light.lamp)], [L.neonPink.position, RAIN_NEON.clone().multiplyScalar(0.5 * S.light.neon)]];
  if (head) rainLights.push([head, RAIN_CAR.clone().multiplyScalar(1.4)]);
  const sp = [[L.lamp.position, RAIN_LAMP.clone().multiplyScalar(4 * S.light.lamp), 900], [L.win.position, new THREE.Color('#ffdbb8').multiplyScalar(0.8 * S.light.window), 40], [L.neonPink.position, RAIN_NEON.clone().multiplyScalar(2 * S.light.neon), 150]];
  if (head) sp.push([head, RAIN_CAR.clone().multiplyScalar(8), 1500]);
  updateWaterMaterials(waterMats, { envTex: stage.env.tex, yaw: BG_YAW, envIntensity: stage.scene.backgroundIntensity, lights: sp });
  const rings = water.update(S);
  stage.street.update(S, rainLights, rings);
  stage.final.uniforms.flash.value = 0;
  stage.final.uniforms.fade.value = S.fade;
  stage.final.uniforms.time.value = S.t;
}

// ---------------------------------------------------------------------
// Смаз движения (только для рендера MP4): затвор открыт половину кадра,
// кадр рисуется несколько раз и усредняется — столько раз, насколько далеко
// на экране сдвигается кроссовок или поворачивается камера.
// ---------------------------------------------------------------------
const MB = CAPTURE && !new URLSearchParams(location.search).has('nomb');
const SHUTTER = 0.5 / 24, MB_STEP = 6, MB_MAX = 10;
const PROBE = [[-1.4, 0.85, 0], [1.45, 0.3, 0], [-1.2, 0.02, 0.35], [1.2, 0.02, -0.3], [0.3, 0.75, 0], [0, 0.5, 0.45], [0, 0.5, -0.45]];
const tmp = new THREE.Vector3();
function screenProbe(t) {
  apply(evaluate5(t));
  return PROBE.map((p) => tmp.set(...p).applyMatrix4(hero.root.matrixWorld).project(cam).toArray());
}
function camTurnPixels(t) {
  const A = evaluate5(t).cam, B = evaluate5(t + SHUTTER).cam;
  const dir = (c) => new THREE.Vector3(c.target[0] - c.pos[0], c.target[1] - c.pos[1], c.target[2] - c.pos[2]).normalize();
  return dir(A).angleTo(dir(B)) / THREE.MathUtils.degToRad(A.fov) * H0 + Math.abs(B.roll - A.roll) * H0 * 0.5;
}
function motionPixels(t) {
  // окно затвора начинается в момент кадра — смаз не перетекает через склейку
  if (evaluate5(t).shot !== evaluate5(t + SHUTTER).shot) return 0;
  const a = screenProbe(t), b = screenProbe(t + SHUTTER);
  let d = 0;
  const vis = (p) => Math.abs(p[2]) < 1 && Math.abs(p[0]) < 1.2 && Math.abs(p[1]) < 1.2;
  a.forEach((p, i) => { const q = b[i]; if (vis(p) && vis(q)) d = Math.max(d, Math.hypot((p[0] - q[0]) * W0 / 2, (p[1] - q[1]) * H0 / 2)); });
  return Math.max(d, camTurnPixels(t));
}

function renderAt(t) {
  const n = MB ? Math.max(1, Math.min(MB_MAX, Math.ceil(motionPixels(t) / MB_STEP))) : 1;
  const S = evaluate5(t);
  apply(S);
  card.update(t);
  if (n === 1) stage.render(t);
  else stage.render(t, n, (i) => apply(evaluate5(t + SHUTTER * (i + 0.5) / n)));
  return S;
}

// ---------------------------------------------------------------------
// Звук: дорожка рендерится один раз и играет как буфер
// ---------------------------------------------------------------------
let trackPromise = null;
const getTrack = () => (trackPromise ||= renderTrack5(48000));

// для рендера MP4 и проверки кадров
window.__ad = {
  duration: DURATION,
  render: (t) => { renderAt(t); return true; },
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
  if (new URLSearchParams(location.search).has('half')) stage.setSize(960, 540, 1);
  buildLineup();
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
  seek.max = String(DURATION);

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
      const S = evaluate5(EXPLORE_T);
      S.shoe = { pos: [...REST.pos], yaw: 0, pitch: REST.pitch, roll: 0, pivot: null, squash: 0 };
      S.street.car.on = 0; S.fade = 0; S.lineup = 0;
      if (hero.root.userData.colorway !== (cwPick || 'ember')) hero.setColorway(cwPick || 'ember');
      apply(S);
      cam.position.copy(controls.object.position);
      cam.quaternion.copy(controls.object.quaternion);
      cam.updateMatrixWorld(true);
      stage.dof.fstop = 5.6;
      stage.dof.focus = cam.position.distanceTo(controls.target);
      card.update(-1);
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
    buildLineup();
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
      controls.target.set(REST.pos[0], 0.45, 0);
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
    if (hero.root.userData.colorway !== 'ember') hero.setColorway('ember');
    cancelAnimationFrame(raf);
  }

  bigPlay.addEventListener('click', () => play(0));
  playBtn.addEventListener('click', () => (mode === 'playing' ? pause() : play()));
  canvas.addEventListener('click', () => { if (mode === 'playing') pause(); else if (mode !== 'explore') play(); });
  seek.addEventListener('input', () => { leaveExplore(); buildLineup(); if (mode === 'playing') pause(); mode = 'paused'; bigPlay.hidden = true; t = Number(seek.value); draw(); });
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
  // заранее: дорожка и две другие расцветки, пока зритель смотрит на обложку
  setTimeout(() => { buildLineup(); getTrack(); }, 400);
  window.__ad.ready = true;
}
