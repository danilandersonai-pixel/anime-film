// main.js — связывает модель, студию, режиссуру, надписи, звук и плеер.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildShoe, COLORWAYS } from './shoe.js';
import { createStage } from './stage.js';
import { evaluate, DURATION, GLOWS } from './timeline.js';
import { createOverlay, CALLOUTS } from './overlay.js';
import { renderTrack, toWav } from './audio.js';

const CAPTURE = new URLSearchParams(location.search).has('capture');
const COVER_T = 19.6;   // обложка до нажатия: готовый пэкшот
const EXPLORE_T = 19.6; // свет и фон для свободного осмотра
const $ = (id) => document.getElementById(id);
if (CAPTURE) document.body.classList.add('capture');

// шрифты нужны до первого кадра: ими рисуются надписи на холсте и в SVG
try { await Promise.race([Promise.all(['800 100px Unbounded', '600 30px Unbounded', '500 30px Manrope', '700 30px Manrope'].map((f) => document.fonts.load(f))), new Promise((r) => setTimeout(r, 4000))]); } catch (e) { /* запасной шрифт */ }

const canvas = $('gl');
const stageEl = $('stage');
const W0 = 1920, H0 = 1080;
const stage = createStage(canvas, { width: W0, height: H0, pixelRatio: 1 });
const shoe = buildShoe();
stage.adopt(shoe.root);
stage.bigText.userData.redraw();
const overlay = createOverlay($('ov'));
const cam = stage.camera;
const tmp = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
const BASE_Y = 0.024; // подмётка стоит на полу

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
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(sh.roll, sh.yaw, sh.pitch, 'YZX'));
  r.quaternion.copy(q);
  const base = new THREE.Vector3(sh.pos[0], sh.pos[1] + BASE_Y, sh.pos[2]);
  if (sh.pivot) {
    const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), sh.yaw);
    const local = new THREE.Vector3(sh.pivot[0], sh.pivot[1], 0);
    const world = local.clone().applyQuaternion(qy).add(base);
    base.copy(world.sub(local.applyQuaternion(q)));
  }
  r.position.copy(base);
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
  L.sweep.position.set(S.light.sweepX, 1.5, 2.4); L.sweep.lookAt(S.light.sweepX * 0.6, 0.5, 0);
  stage.sweepBar.position.set(S.light.sweepX, 1.2, -2.2);
  stage.sweepBar.material.opacity = Math.min(1, S.light.sweep / 20);
  L.sun.intensity = S.light.sun;
  stage.scene.environmentIntensity = S.light.env;

  // фон, полосы, надпись, эффекты
  stage.bg.uniforms.glow.value.copy(c1); stage.bg.uniforms.glow2.value.copy(c2);
  stage.bg.uniforms.glowAmt.value = S.bg.glowAmt; stage.bg.uniforms.glow2Amt.value = S.bg.glow2Amt;
  stage.bg.uniforms.glowDir.value.set(...S.bg.glowDir).normalize();
  stage.barMats[0].color.copy(c1).multiplyScalar(4 * S.bg.bars); stage.barMats[1].color.copy(c2).multiplyScalar(3 * S.bg.bars);
  stage.bigText.material.opacity = S.bigText.opacity;
  stage.bigText.position.x = S.bigText.x;
  stage.bigText.material.color.copy(c1).lerp(new THREE.Color('#ffffff'), 0.5);
  stage.setStreaks(S.t, S.streaks);
  stage.floor.uniforms.ring.value = S.ring.amt; stage.floor.uniforms.ringR.value = S.ring.r; stage.floor.uniforms.ringColor.value.copy(c1);
  stage.floor.uniforms.spot.value = S.spot;
  stage.bokeh.enabled = S.bokeh.on;
  if (S.bokeh.on) { stage.bokeh.uniforms.focus.value = S.bokeh.focus; stage.bokeh.uniforms.aperture.value = S.bokeh.aperture; stage.bokeh.uniforms.maxblur.value = S.bokeh.maxblur; }
  stage.bloom.strength = S.bloom;
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

function renderAt(t) {
  const S = evaluate(t);
  const accent = apply(S);
  shoe.root.updateMatrixWorld(true);
  overlay.update(t, S, project, accent);
  stage.render(t);
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
      S.bigText.opacity = 0.08;
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
    if (from >= DURATION - 0.05) from = 0;
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
      if (t >= DURATION) { pause(); t = DURATION; bigPlay.hidden = false; bigPlay.querySelector('span').textContent = 'Посмотреть ещё раз'; return; }
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
