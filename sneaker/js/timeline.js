// timeline.js — режиссура ролика: что происходит в момент t.
// evaluate(t) возвращает состояние кадра; одно и то же t всегда даёт один и тот же кадр.
// Музыка — 120 ударов в минуту, такт = 2 с; монтаж стоит на сильных долях.
export const DURATION = 32;
export const SHOTS = {
  dark: 0,       // свет облетает силуэт в темноте
  knit: 4,       // макро: трикотаж
  laces: 6,      // макро: шнуровка, перевод фокуса
  heel: 8,       // макро: пятка, дуга вокруг
  pull: 10,      // отъезд от логотипа к профилю
  top: 12,       // сверху, вращение
  flip: 14,      // снизу: переворот на подошву
  explode: 16,   // взрыв-схема
  run: 20,       // бег и приземление
  front: 23,     // фронтальный наезд со стробами
  colors: 25,    // расцветки
  pack: 27,      // пэкшот
};
export const COLOR_SWITCH = [[0, 'ember'], [25, 'glacier'], [26, 'volt'], [27, 'ember']];
export const FLASHES = [[4, 0.4], [10, 0.18], [16, 0.35], [19.75, 0.4], [25, 0.5], [26, 0.5], [27, 0.55]];
export const IMPACT = 21.0;
export const STROBES = [23.0, 23.5, 24.0, 24.5];

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (t, a, b) => clamp((t - a) / (b - a));
const smooth = (x) => x * x * (3 - 2 * x);
const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const easeIn = (x) => x * x * x;
const backOut = (x) => { const c = 1.4; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const mix3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const add3 = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const orbit = (c, ang, r, y) => [c[0] + Math.sin(ang) * r, y, c[2] + Math.cos(ang) * r];

export const GLOWS = { ember: ['#ff5a1f', '#2f6bff'], glacier: ['#36b8ff', '#9fe7ff'], volt: ['#c6f23a', '#2f6bff'] };

// точки на кроссовке для макропланов (задаёт main.js после сборки модели)
let RIG = null;
const BASE_Y = 0.024;
export function setRig(macro) {
  const lift = (p) => [p[0], p[1] + BASE_Y, p[2]];
  RIG = { knit: { p: lift(macro.knit.p), n: macro.knit.n }, planet: { p: lift(macro.planet.p), n: macro.planet.n }, laces: macro.laces.map(lift), heel: lift(macro.heel), toe: lift(macro.toe) };
}

function colorwayAt(t) { let c = 'ember'; for (const [t0, n] of COLOR_SWITCH) if (t >= t0) c = n; return c; }
function flashAt(t) { let f = 0; for (const [t0, a] of FLASHES) if (t >= t0) f = Math.max(f, a * Math.exp(-(t - t0) * 10)); return f; }

// ---------------------------------------------------------------------
// Время действия: в момент удара пятки в лужу действие замедляется (рапид ×0,22),
// потом разгоняется (×1,6) и догоняет реальное время. Дождь, рябь и всплеск
// живут во времени действия, поэтому в рапиде замедляются вместе с кроссовком.
// ---------------------------------------------------------------------
const WARP_DT = 1 / 480, WARP = new Float32Array(Math.ceil(33 / WARP_DT) + 2);
(() => {
  let w = 0;
  for (let i = 1; i < WARP.length; i++) {
    const t = i * WARP_DT;
    let sp = 1;
    if (t > IMPACT && t < IMPACT + 0.95) sp = 1 - 0.78 * smooth(seg(t, IMPACT, IMPACT + 0.07)) * (1 - smooth(seg(t, IMPACT + 0.72, IMPACT + 0.95)));
    else if (t >= IMPACT + 0.95) sp = 1 + 0.6 * smooth(clamp((t - w) / 0.06));
    w += sp * WARP_DT; WARP[i] = w;
  }
})();
export function actionTime(t) { const k = clamp(t / WARP_DT, 0, WARP.length - 1.001), i = Math.floor(k); return WARP[i] + (WARP[i + 1] - WARP[i]) * (k - i); }

const ORDER = Object.entries(SHOTS).sort((a, b) => a[1] - b[1]);
export function shotAt(t) { let s = ORDER[0][0]; for (const [n, t0] of ORDER) if (t >= t0) s = n; return s; }

export function evaluate(t) {
  const S = {
    t, shot: shotAt(t), colorway: colorwayAt(t), flash: flashAt(t), fade: 0,
    cam: { pos: [3, 1.2, 3.5], target: [0, 0.55, 0], fov: 28, roll: 0 },
    shoe: { pos: [0, 0, 0], yaw: 0, pitch: 0, roll: 0, pivot: null, explode: 0, squash: 0, partYaw: 0 },
    light: { key: 5, rimL: 14, rimR: 16, sweep: 0, sweepPos: [0, 1.5, 2.4], sweepLook: [0, 0.5, 0], sun: 0.9, env: 0.5, envRot: 0 },
    bg: { glowAmt: 0.4, glow2Amt: 0.08, glowDir: [0.3, 0.25, -1], bars: 0, base: 1 },
    bigText: { opacity: 0, x: 0 }, streaks: 0, ring: { amt: 0, r: 0 },
    bokeh: { on: false, focus: 3, aperture: 0.002, maxblur: 0.006 }, bloom: 0.45, spot: 0.08,
    // улица: дождь (время дождя — замедленное ×0,3, как съёмка рапидом), отражения, туман, огни, машина, молния
    street: { rainT: actionTime(t) * 0.3, rain: 1, reflect: 1, mist: 0.05, bokeh: 1, bg: 0.15, lightning: 0, car: { on: 0, p: 0, dir: 1, head: 1, tail: 1 } },
    splash: -1, drip: 0, impactT: IMPACT,
  };
  SHOT_FN[S.shot](t, S);
  handheld(t, S);
  whip(t, S);
  return S;
}

// хлёсткая панорама на склейке: камера резко уводится в сторону в конце плана
// и «прилетает» в следующий; смаз движения превращает это в рывок
const WHIPS = [[12, 1], [20, -1], [25, 1]];
function whip(t, S) {
  for (const [T, dir] of WHIPS) {
    let a = 0;
    if (t >= T - 0.14 && t < T) a = dir * 0.6 * easeIn(seg(t, T - 0.14, T));
    else if (t >= T && t < T + 0.18) a = -dir * 0.6 * Math.pow(1 - seg(t, T, T + 0.18), 3);
    if (!a) continue;
    const p = S.cam.pos, d = [S.cam.target[0] - p[0], S.cam.target[1] - p[1], S.cam.target[2] - p[2]];
    const c = Math.cos(a), sn = Math.sin(a);
    S.cam.target = [p[0] + d[0] * c + d[2] * sn, S.cam.target[1], p[2] - d[0] * sn + d[2] * c];
  }
}

// «живая» камера: медленный дрейф и лёгкая дрожь, как у оператора со стабилизатором.
// Амплитуда — доли градуса; на макро сильнее, на пэкшоте почти нет.
const SHAKE = { dark: 0.5, knit: 1, laces: 1, heel: 0.8, pull: 0.6, top: 0.5, flip: 0.7, explode: 0.4, run: 1, front: 0.5, colors: 0.35, pack: 0.3 };
function handheld(t, S) {
  const a = SHAKE[S.shot] ?? 0.5, w = (f, p) => Math.sin(t * f + p);
  const n1 = 0.6 * w(1.13, 0.3) + 0.3 * w(2.71, 1.7) + 0.1 * w(6.3, 4.1);
  const n2 = 0.6 * w(0.97, 2.2) + 0.3 * w(2.33, 0.4) + 0.1 * w(5.7, 3.3);
  const n3 = 0.6 * w(0.71, 5.1) + 0.4 * w(1.91, 2.6);
  const k = 0.0032 * dist3(S.cam.pos, S.cam.target) * a;
  S.cam.target = add3(S.cam.target, [n1 * k, n2 * k, n3 * k]);
  S.cam.pos = add3(S.cam.pos, [n2 * 0.003 * a, n3 * 0.003 * a, n1 * 0.003 * a]);
  S.cam.roll += 0.0025 * a * (0.7 * w(0.83, 1.1) + 0.3 * w(2.1, 0.2));
}
const focusOn = (S, p, aperture, maxblur = 0.012) => { S.bokeh = { on: true, focus: dist3(S.cam.pos, p), aperture, maxblur }; };

const SHOT_FN = {
  // ---- 1. Темнота: полоса света облетает кроссовок, силуэт проступает
  dark(t, S) {
    const k = easeInOut(seg(t, 0, 4));
    const c = [0, 0.62, 0];
    S.cam = { pos: mix3([3.6, 0.5, 3.0], [2.7, 0.62, 2.35], k), target: mix3([-0.1, 0.55, 0], [0, 0.6, 0], k), fov: 30, roll: 0.02 };
    S.fade = 1 - smooth(seg(t, 0, 0.7));
    const a = lerp(-2.6, 1.1, easeInOut(seg(t, 0.2, 3.9)));
    void a;
    // молния: три вспышки подряд — на мгновение видно всю улицу, дождь и силуэт
    const L = (t0, d, amp) => amp * Math.exp(-Math.max(0, t - t0) / d) * (t >= t0 ? 1 : 0);
    const lightning = L(0.55, 0.05, 1) + L(0.66, 0.04, 0.6) + L(0.82, 0.12, 0.9);
    S.light = { key: 1.6 * smooth(seg(t, 2.8, 4)), rimL: 9 * smooth(seg(t, 1.0, 3.0)), rimR: 13 * smooth(seg(t, 0.4, 2.2)), sweep: 0, sun: 0.15 + 2.4 * lightning, env: lerp(0.06, 0.4, seg(t, 1, 4)) + 0.8 * lightning, envRot: lerp(-0.3, 0.2, k) };
    // за кроссовком проезжает машина: фары скользят по нему, длинные отражения бегут по асфальту
    S.street = { ...S.street, lightning, bg: lerp(0.05, 0.15, smooth(seg(t, 0.3, 3.5))), car: { on: 1, p: seg(t, 1.25, 3.85), dir: 1, head: 1, tail: 1 } };
    S.bloom = 0.6; S.spot = 0.02;
  },
  // ---- 2. Макро: трикотаж, скользящий свет выявляет петли
  knit(t, S) {
    const k = easeInOut(seg(t, 4, 6)), R = RIG.knit;
    const p = add3(R.p, [1, 0, 0], lerp(-0.07, 0.07, k));
    S.cam = { pos: add3(add3(p, R.n, 0.3), [-0.3, 0.1, 0]), target: add3(p, [0.05, 0, 0]), fov: 30, roll: lerp(-0.05, 0.03, k) };
    focusOn(S, p, 0.016, 0.02);
    S.street.rain = 0.12; S.street.bokeh = 0.7; // у самого объектива струи похожи на царапины
    S.light = { key: 1.2, rimL: 4, rimR: 22, sweep: 30, sweepPos: add3(p, [lerp(-1.4, 1.4, k), 0.25, 0.45]), sweepLook: p, sun: 0.35, env: 0.35, envRot: lerp(0, 0.6, k) };
    S.bg = { glowAmt: 0.25, glow2Amt: 0.05, glowDir: [0.3, 0.2, -1], bars: 0, base: 1 };
    S.bloom = 0.45; S.spot = 0.05;
  },
  // ---- 3. Макро: шнуровка, фокус переводится с ближних блочек на дальние
  laces(t, S) {
    const k = easeInOut(seg(t, 6, 8)), L = RIG.laces;
    S.cam = { pos: add3(L[0], [lerp(0.55, 0.42, k), lerp(0.2, 0.16, k), lerp(0.18, 0.1, k)]), target: mix3(L[2], L[3], 0.5), fov: 34, roll: -0.04 };
    focusOn(S, mix3(L[1], L[5], easeInOut(seg(t, 6.4, 7.4))), 0.012, 0.016);
    S.street.rain = 0.6; S.street.bokeh = 0.7;
    S.light = { key: 2.2, rimL: 10, rimR: 14, sweep: 8, sweepPos: [0.6, 1.8, lerp(-1.2, 1.2, k)], sweepLook: L[3], sun: 0.45, env: 0.32, envRot: lerp(0.4, 1.0, k) };
    S.bg = { glowAmt: 0.3, glow2Amt: 0.06, glowDir: [0.6, 0.2, -1], bars: 0, base: 1 };
    S.bloom = 0.45; S.spot = 0.06;
  },
  // ---- 4. Макро: пятка, камера по дуге от бока к задней трети, блик скользит по заднику
  heel(t, S) {
    const k = easeInOut(seg(t, 8, 10)), H = RIG.heel, c = [H[0] + 0.3, 0.6, 0];
    const ang = lerp(-0.45, -1.3, k);
    S.cam = { pos: orbit(c, ang, lerp(2.25, 2.05, k), 0.68), target: c, fov: 30, roll: lerp(0.03, -0.02, k) };
    focusOn(S, [H[0], 0.6, 0.12 * Math.cos(ang)], 0.005, 0.009);
    const la = ang + lerp(1.1, 0.5, k);
    S.light = { key: 4, rimL: 18, rimR: 22, sweep: 22, sweepPos: orbit(c, la, 1.9, c[1] + 0.7), sweepLook: c, sun: 0.7, env: 0.55, envRot: lerp(1.2, -0.4, k) };
    S.bg = { glowAmt: 0.42, glow2Amt: 0.12, glowDir: [-0.4, 0.25, 1], bars: 0, base: 1 };
    S.bloom = 0.45; S.spot = 0.08;
  },
  // ---- 5. Отъезд: от «планеты» логотипа к полному профилю
  pull(t, S) {
    const k = easeInOut(seg(t, 10, 12)), P = RIG.planet;
    const kk = Math.pow(k, 0.7), aim = mix3(P.p, [0.05, 0.56, 0], kk);
    S.cam = { pos: mix3(add3(P.p, P.n, 0.32), [0.15, 0.72, 5.6], kk), target: aim, fov: lerp(30, 24, k), roll: 0 };
    if (k < 0.6) focusOn(S, aim, lerp(0.012, 0.0, seg(k, 0, 0.6)), 0.014);
    S.light = { key: 4.5, rimL: 12, rimR: 16, sweep: 0, sun: 0.8, env: 0.5, envRot: lerp(-0.3, 0.3, k) };
    S.bigText = { opacity: 0.12 * smooth(seg(t, 10.8, 11.6)), x: lerp(0.6, 0.1, k) };
    S.bg = { glowAmt: 0.42, glow2Amt: 0.07, glowDir: [0.25, 0.25, -1], bars: 0, base: 1 };
    S.bloom = 0.5; S.spot = 0.08;
  },
  // ---- 6. Сверху: кроссовок вращается под камерой, по нему бежит блик
  top(t, S) {
    const k = easeInOut(seg(t, 12, 14));
    S.shoe.yaw = lerp(-0.6, 0.9, k);
    S.cam = { pos: [0.05, lerp(6.2, 5.2, k), 0.25], target: [0, 0.4, 0], fov: 30, roll: lerp(0.2, -0.15, k) };
    S.light = { key: 5, rimL: 10, rimR: 14, sweep: 26, sweepPos: [lerp(-3, 3, k), 2.5, 0.8], sweepLook: [0, 0.4, 0], sun: 0.9, env: 0.45, envRot: lerp(0, 1.5, k) };
    S.bg = { glowAmt: 0.2, glow2Amt: 0.05, glowDir: [0, 1, 0], bars: 0, base: 1 };
    S.bloom = 0.45; S.spot = 0.18;
  },
  // ---- 7. Снизу: кроссовок взлетает и переворачивается подошвой к камере
  flip(t, S) {
    const k = easeInOut(seg(t, 14, 16)), up = easeOut(seg(t, 14, 15));
    S.shoe.pos = [0, 0.9 * up, 0];
    S.shoe.roll = -2.5 * easeInOut(seg(t, 14.2, 15.4));
    S.drip = 1;
    S.shoe.yaw = lerp(-0.25, -0.05, k);
    S.cam = { pos: mix3([2.5, 0.28, 2.9], [2.1, 0.22, 2.4], k), target: mix3([0, 0.55, 0], [0, 0.95, 0], k), fov: 32, roll: 0.04 };
    S.light = { key: 5, rimL: 14, rimR: 18, sweep: 18, sweepPos: [0, 0.15, 2.6], sweepLook: [0, 1, 0], sun: 0.9, env: 0.5, envRot: lerp(-0.5, 0.5, k) };
    S.bg = { glowAmt: 0.45, glow2Amt: 0.1, glowDir: [0.2, 0.45, -1], bars: 0, base: 1 };
    S.bloom = 0.5; S.spot = 0.1;
  },
  // ---- 8. Взрыв-схема: слои расходятся, подписи, затем щелчок обратно
  explode(t, S) {
    const k = easeInOut(seg(t, 16, 20));
    const e = backOut(seg(t, 16.15, 17.2)) * (1 - easeIn(seg(t, 19.15, 19.75)));
    S.shoe.explode = e;
    S.shoe.pos = [0, 0.18 + 0.62 * e, 0];
    S.shoe.yaw = lerp(-0.42, -0.3, k);
    S.shoe.partYaw = e;
    const c = [0.05, 0.95, 0];
    S.cam = { pos: orbit(c, lerp(0.92, 0.78, k), lerp(6.2, 5.8, k), lerp(2.3, 2.1, k)), target: [c[0], lerp(1.3, 1.2, k), 0], fov: 31, roll: 0 };
    S.light.key = 6;
    S.bg = { glowAmt: 0.22, glow2Amt: 0.2, glowDir: [-0.2, 0.3, -1], bars: 0, base: 1 };
    S.bloom = 0.45; S.spot = 0.1;
  },
  // ---- 9. Бег: камера у пола, удар пяткой, сжатие пены, волна, отталкивание
  run(t0, S) {
    // всё действие плана идёт во «времени действия»: на ударе — рапид, потом разгон
    const t = actionTime(t0);
    const k = easeInOut(seg(t, 20, 23));
    const L = 1.32;
    let y = 0, pitch = 0, pivot = null;
    if (t < IMPACT) { const f = seg(t, 20, IMPACT); y = lerp(0.75, 0, easeIn(f)); pitch = lerp(0.12, 0.3, f); pivot = [-L, 0]; }
    else if (t < IMPACT + 0.25) { pitch = lerp(0.3, 0, easeOut(seg(t, IMPACT, IMPACT + 0.25))); pivot = [-L, 0]; }
    else if (t < IMPACT + 0.6) { pitch = 0; }
    else { pitch = -0.42 * easeOut(seg(t, IMPACT + 0.6, IMPACT + 1.3)); pivot = [0.95, 0]; y = 0.38 * easeOut(seg(t, IMPACT + 1.1, 23)); }
    S.shoe.pos = [0, y, 0]; S.shoe.pitch = pitch; S.shoe.pivot = pivot;
    S.shoe.squash = 0.13 * Math.sin(Math.PI * seg(t, IMPACT + 0.05, IMPACT + 0.62));
    S.cam = { pos: mix3([1.2, 0.36 + y * 0.5, 5.0], [-0.35, 0.32 + y * 0.5, 4.3], k), target: mix3([0.2, 0.52 + y * 0.6, 0], [-0.1, 0.48 + y * 0.6, 0], k), fov: 36, roll: -0.06 };
    // удар пятки: всплеск и волна по луже (время всплеска — секунды «настоящего» действия)
    const sg = t - IMPACT;
    S.splash = sg >= 0 ? sg : -1;
    S.ring = { amt: sg >= 0 ? Math.exp(-sg * 1.4) : 0, r: 0.12 + Math.max(0, sg) * 2.4, c: [-1.25, 0.02] };
    S.light.rimR = 20; S.light.envRot = lerp(0, 0.8, k);
    S.bloom = 0.5; S.spot = 0.1;
  },
  // ---- 10. Анфас: наезд на носок, контровые вспыхивают по ударам
  front(t, S) {
    const k = easeInOut(seg(t, 23, 25));
    S.cam = { pos: mix3([7.4, 0.82, 0.0], [4.4, 0.7, 0.05], k), target: [0, lerp(0.52, 0.47, k), 0], fov: 26, roll: 0 };
    let beat = 0, side = 0;
    STROBES.forEach((b, i) => { if (t >= b) { beat = Math.exp(-(t - b) * 6); side = i % 2; } });
    S.light = { key: 1.2 + 2 * beat, rimL: side === 0 ? 4 + 34 * beat : 4, rimR: side === 1 ? 4 + 38 * beat : 4, sweep: 0, sun: 0.4, env: 0.25 + 0.3 * beat, envRot: side ? 0.6 : -0.6 };
    S.bg = { glowAmt: 0.15 + 0.45 * beat, glow2Amt: 0.05 + 0.2 * beat, glowDir: [-1, 0.25, side ? 0.6 : -0.6], bars: beat, base: 1 };
    S.bloom = 0.55; S.spot = 0.05 + 0.1 * beat;
  },
  // ---- 11. Расцветки: смена по ударам музыки
  colors(t, S) {
    const k = easeInOut(seg(t, 25, 27));
    S.shoe.yaw = lerp(-0.45, -0.15, k);
    S.cam = { pos: mix3([4.5, 1.5, 4.7], [4.1, 1.38, 4.3], k), target: [0.05, 0.55, 0], fov: 28, roll: 0 };
    S.light.key = 6; S.light.envRot = lerp(-0.3, 0.3, k);
    S.bg = { glowAmt: 0.5, glow2Amt: 0.08, glowDir: [0.35, 0.25, -1], bars: 0, base: 1 };
    S.bloom = 0.5; S.spot = 0.12;
  },
  // ---- 12. Пэкшот: медленный наезд, по кроссовку проходит полоса света
  pack(t, S) {
    const k = easeOut(seg(t, 27, 31.5));
    S.shoe.yaw = lerp(-0.12, -0.24, k);
    S.cam = { pos: mix3([4.3, 1.2, 4.6], [3.8, 1.08, 4.1], k), target: mix3([-0.65, 0.48, 0.1], [-0.82, 0.46, 0.15], k), fov: 27, roll: 0 };
    S.light = { key: 5.5, rimL: 14, rimR: 16, sweep: 0, sun: 0.9, env: 0.5, envRot: lerp(-0.2, 0.25, k) };
    // по кроссовку снова проходят фары — машина едет в другую сторону
    S.street.car = { on: 1, p: seg(t, 27.9, 30.7), dir: -1, head: 1, tail: 1 };
    S.bg = { glowAmt: 0.48, glow2Amt: 0.06, glowDir: [0.45, 0.25, -1], bars: 0, base: 1 };
    S.bloom = 0.5; S.spot = 0.14;
    S.fade = smooth(seg(t, 31.35, 32));
  },
};
