// timeline5.js — режиссура v5 «по законам физики»: ничего не парит и не разлетается.
// Кроссовок стоит в луже под ливнем, падает в лужу как твёрдое тело (physics.js),
// свет — только от того, что есть на улице: витрина, фонарь, неоновая вывеска,
// фары, молния. Из надписей — только финальная карточка.
// evaluate5(t) → состояние кадра; одинаковое t даёт одинаковый кадр.
import { simulateDrop, sampleDrop, COM } from './physics.js';
import * as THREE from 'three';
import { shoeTransform, last, soleBottom } from './shoe.js';

export const DURATION5 = 26;
export const SHOTS5 = {
  storm: 0,    // общий план под ливнем, молния
  drops: 3,    // макро: капли на трикотаже, перевод фокуса
  laces: 5,    // макро: шнуровка
  heel: 7,     // макро: задник, дуга
  car: 9,      // профиль у земли, за кроссовком проезжает машина
  drop: 11,    // падение в лужу: удар пятки в рапиде, корона брызг
  drip: 15,    // вода стекает с края подошвы
  top: 17,     // сверху: круги от капель вокруг
  neon: 19,    // анфас, мигает неоновая вывеска
  lineup: 21,  // три расцветки в ряд
  pack: 23,    // пэкшот и карточка
};
export const IMPACT5 = 12.0; // удар пятки — на сильную долю

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (t, a, b) => clamp((t - a) / (b - a));
const smooth = (x) => x * x * (3 - 2 * x);
const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const mix3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const add3 = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const orbit = (c, ang, r, y) => [c[0] + Math.sin(ang) * r, y, c[2] + Math.cos(ang) * r];

// ---------------------------------------------------------------------
// Падение: физика считается один раз
// ---------------------------------------------------------------------
export const SIM = simulateDrop();
const HIT = SIM.hits[0];                         // первый удар — пятка
const SLAP = SIM.hits.find((h) => h.x > -0.2 && h.t > HIT.t + 0.005) || HIT; // хлопок передней частью
const BASE_Y = 0.024;
const DROP_SPOT = [0.1, 0];                      // где лежит кроссовок (x, z)
// корень кроссовка из положения центра масс (X, Y) и наклона th
function rootFromSim(p) {
  const c = Math.cos(p.th), s = Math.sin(p.th);
  return { pos: [DROP_SPOT[0] + p.x - (c * COM[0] - s * COM[1]), p.y - (s * COM[0] + c * COM[1]) - BASE_Y, DROP_SPOT[1]], pitch: p.th };
}
export const REST = rootFromSim(sampleDrop(SIM, 2.5));
// куда наводится резкость в плане drip: середина ряда капель на кромке подошвы (drips5.js)
const DRIP_FOCUS = (() => {
  const u = 0.8, L = last(u, 0.035);
  const { pos, quat } = shoeTransform({ pos: REST.pos, yaw: -0.18, pitch: REST.pitch, roll: 0, pivot: null });
  return new THREE.Vector3(L.x, soleBottom(u) - 0.007, L.c + L.hw + 0.061).applyQuaternion(quat).add(pos).toArray();
})();

// Время действия: рапид ×0,2 на ударе (как съёмка 120 к/с), потом разгон обратно
const WARP_DT = 1 / 480, WARP = new Float32Array(Math.ceil(27 / WARP_DT) + 2);
(() => {
  let w = 0;
  for (let i = 1; i < WARP.length; i++) {
    const t = i * WARP_DT;
    let sp = 1;
    if (t > IMPACT5 - 0.06 && t < IMPACT5 + 1.25) sp = 1 - 0.8 * smooth(seg(t, IMPACT5 - 0.06, IMPACT5)) * (1 - smooth(seg(t, IMPACT5 + 0.9, IMPACT5 + 1.25)));
    w += sp * WARP_DT; WARP[i] = w;
  }
})();
export function actionTime5(t) { const k = clamp(t / WARP_DT, 0, WARP.length - 1.001), i = Math.floor(k); return WARP[i] + (WARP[i + 1] - WARP[i]) * (k - i); }
// секунды физики от начала падения: удар пятки — ровно в IMPACT5
const T_IMPACT_ACTION = actionTime5(IMPACT5);
export const simTime = (t) => actionTime5(t) - T_IMPACT_ACTION + HIT.t;
export const IMPACTS = [{ s: HIT.t, x: DROP_SPOT[0] + HIT.x, z: DROP_SPOT[1], power: 1 }, { s: SLAP.t, x: DROP_SPOT[0] + SLAP.x + 0.6, z: DROP_SPOT[1], power: 0.6 }];

// ---------------------------------------------------------------------
// Свет — только мотивированный (то, что светит на улице)
// window — витрина слева спереди (тёплый мягкий ключ), lamp — фонарь сзади сверху
// (натрий, контровой), neon — розово-голубая вывеска сбоку, car — фары, lightning — молния
// ---------------------------------------------------------------------
const LIGHT0 = () => ({ window: 1, lamp: 1, neon: 0.6, env: 0.35, lightning: 0 });
// вспышки молнии [начало, затухание, яркость] и провалы неона [начало, длительность] — общие для картинки и звука
export const LIGHTNING = [[0.45, 0.05, 1], [0.56, 0.04, 0.6], [1.7, 0.12, 0.85]];
export const NEON_FLICKER = [[19.25, 0.06], [19.4, 0.03], [19.95, 0.12], [20.2, 0.04], [20.27, 0.05], [20.7, 0.08]];
const ORDER = Object.entries(SHOTS5).sort((a, b) => a[1] - b[1]);
export function shotAt5(t) { let s = ORDER[0][0]; for (const [n, t0] of ORDER) if (t >= t0) s = n; return s; }

let RIG = null;
export function setRig5(macro) {
  const lift = (p) => [p[0], p[1] + BASE_Y, p[2]];
  RIG = { knit: { p: lift(macro.knit.p), n: macro.knit.n }, laces: macro.laces.map(lift), heel: lift(macro.heel) };
}

export function evaluate5(t) {
  const S = {
    t, shot: shotAt5(t), fade: 0,
    cam: { pos: [3.6, 0.7, 3.6], target: [0, 0.5, 0], fov: 28, roll: 0, fstop: 2.8, focus: null },
    shoe: { pos: [...REST.pos], yaw: 0, pitch: REST.pitch, roll: 0, pivot: null, explode: 0, squash: 0, partYaw: 0 },
    lineup: 0,
    light: LIGHT0(),
    street: { rainT: actionTime5(t) * 0.3, rain: 1, car: { on: 0, p: 0, dir: 1 } },
    drop: { s: simTime(t), active: false }, drip: 0, card: 0,
  };
  SHOT_FN[S.shot](t, S);
  handheld(t, S);
  if (S.cam.focus === null) S.cam.focus = dist3(S.cam.pos, S.cam.target);
  return S;
}

// дыхание оператора: медленный дрейф и лёгкая дрожь
const SHAKE = { storm: 0.35, drops: 0.8, laces: 0.8, heel: 0.6, car: 0.3, drop: 0.25, drip: 0.6, top: 0.4, neon: 0.4, lineup: 0.3, pack: 0.25 };
function handheld(t, S) {
  const a = SHAKE[S.shot] ?? 0.4, w = (f, p) => Math.sin(t * f + p);
  const n1 = 0.6 * w(1.13, 0.3) + 0.3 * w(2.71, 1.7) + 0.1 * w(6.3, 4.1);
  const n2 = 0.6 * w(0.97, 2.2) + 0.3 * w(2.33, 0.4) + 0.1 * w(5.7, 3.3);
  const n3 = 0.6 * w(0.71, 5.1) + 0.4 * w(1.91, 2.6);
  const k = 0.0032 * dist3(S.cam.pos, S.cam.target) * a;
  S.cam.target = add3(S.cam.target, [n1 * k, n2 * k, n3 * k]);
  S.cam.pos = add3(S.cam.pos, [n2 * 0.003 * a, n3 * 0.003 * a, n1 * 0.003 * a]);
  S.cam.roll += 0.0025 * a * (0.7 * w(0.83, 1.1) + 0.3 * w(2.1, 0.2));
}

const SHOT_FN = {
  // ---- 0–3: ливень в темноте; три вспышки молнии; витрина и фонарь загораются
  storm(t, S) {
    const k = easeInOut(seg(t, 0, 3));
    S.cam = { pos: mix3([4.4, 0.42, 3.9], [3.6, 0.46, 3.2], k), target: [0.05, 0.42, 0], fov: 30, roll: 0.015, fstop: 2.0, focus: null };
    S.fade = 1 - smooth(seg(t, 0, 0.5));
    const L = (t0, d, a) => (t >= t0 ? a * Math.exp(-(t - t0) / d) : 0);
    S.light = { window: smooth(seg(t, 1.9, 3)), lamp: 0.25 + 0.75 * smooth(seg(t, 1.2, 2.6)), neon: 0.35 * smooth(seg(t, 2.2, 3)), env: lerp(0.08, 0.3, seg(t, 0.5, 3)), lightning: LIGHTNING.reduce((a, [t0, d, b]) => a + L(t0, d, b), 0) };
  },
  // ---- 3–5: макро — капли на трикотаже, фокус переводится с ближних на дальние
  drops(t, S) {
    const k = easeInOut(seg(t, 3, 5)), R = RIG.knit;
    const p = add3(R.p, [1, 0, 0], lerp(-0.05, 0.05, k));
    // камера со стороны носка, скользит вдоль трикотажа; фокус «ищет» поверхность и переводится чуть дальше
    S.cam = { pos: add3(add3(p, R.n, 0.28), [0.2, 0.03, 0]), target: add3(p, [-0.04, 0, 0]), fov: 26, roll: lerp(-0.04, 0.02, k), fstop: 11, focus: null, af: lerp(0.94, 1.08, smooth(seg(t, 3.4, 4.7))) };
    S.street.rain = 0.15; S.light.window = 4; S.light.lamp = 1.6;
  },
  // ---- 5–7: макро — шнуровка, перевод фокуса вдоль
  laces(t, S) {
    const k = easeInOut(seg(t, 5, 7)), L = RIG.laces;
    const pos = add3(L[0], [lerp(0.55, 0.42, k), lerp(0.2, 0.16, k), lerp(0.18, 0.1, k)]);
    S.cam = { pos, target: mix3(L[2], L[3], 0.5), fov: 32, roll: -0.04, fstop: 11, focus: null, af: lerp(0.85, 1.25, easeInOut(seg(t, 5.3, 6.6))) };
    S.street.rain = 0.35; S.light.window = 2.2; S.light.lamp = 1.3;
  },
  // ---- 7–9: макро — задник: дуга от бока к задней трети, блик фонаря скользит по глянцу
  heel(t, S) {
    const k = easeInOut(seg(t, 7, 9)), H = RIG.heel, c = [H[0] + 0.3, 0.6, 0];
    const ang = lerp(-0.45, -1.3, k);
    S.light.window = 1.8; S.light.lamp = 1.5;
    S.cam = { pos: orbit(c, ang, lerp(2.25, 2.05, k), 0.68), target: c, fov: 30, roll: lerp(0.03, -0.02, k), fstop: 4, focus: dist3(orbit(c, ang, lerp(2.25, 2.05, k), 0.68), [H[0], 0.6, 0]) };
  },
  // ---- 9–11: профиль у самой земли; за кроссовком проезжает машина, тень скользит по асфальту
  car(t, S) {
    const k = easeInOut(seg(t, 9, 11));
    S.cam = { pos: mix3([0.5, 0.3, 5.4], [0.1, 0.32, 5.0], k), target: [-0.05, 0.42, 0], fov: 30, roll: 0, fstop: 2.2, focus: null };
    S.street.car = { on: 1, p: seg(t, 8.9, 11.2), dir: 1 };
    S.light.window = 0.7;
  },
  // ---- 11–15: кроссовок падает в лужу; рапид на ударе; перекат и покой
  drop(t, S) {
    const s = S.drop.s;
    const p = sampleDrop(SIM, Math.max(0, s));
    const r = rootFromSim(p);
    const before = s < 0; // ещё не появился в кадре: над кадром
    S.shoe = { pos: before ? [DROP_SPOT[0], 6, 0] : r.pos, yaw: -0.18, pitch: r.pitch, roll: 0, pivot: null, explode: 0, squash: Math.min(0.12, (p.sqH + p.sqF) * 3), partYaw: 0 };
    S.drop.active = true;
    const k = easeInOut(seg(t, 11, 15));
    S.cam = { pos: mix3([2.7, 0.28, 3.6], [2.5, 0.27, 3.35], k), target: [-0.1, 0.5, 0.1], fov: 34, roll: -0.02, fstop: 2.4, focus: dist3([2.6, 0.28, 3.5], [0.1, 0.3, 0]) };
    S.light.window = 1; S.light.lamp = 1;
  },
  // ---- 15–17: край подошвы у воды: срываются капли
  drip(t, S) {
    const k = easeInOut(seg(t, 15, 17));
    // камера смотрит вдоль кромки, где рокер поднял носок над водой, и медленно подъезжает
    const c = add3(DRIP_FOCUS, [-0.05, 0.035, 0]);
    const pos = add3(c, mix3([0.55, 0.02, 0.88], [0.46, 0.025, 0.76], k));
    S.cam = { pos, target: c, fov: 28, roll: 0.02, fstop: 4, focus: dist3(pos, DRIP_FOCUS) }; // резкость — на каплях
    S.shoe.yaw = -0.18; S.drip = 1;
  },
  // ---- 17–19: сверху: кроссовок в луже, круги от капель вокруг; камера медленно поворачивается
  top(t, S) {
    const k = easeInOut(seg(t, 17, 19));
    S.cam = { pos: [REST.pos[0] + 0.05, lerp(6.4, 5.6, k), 0.18], target: [REST.pos[0], 0.3, 0], fov: 32, roll: lerp(0.35, -0.1, k), fstop: 4, focus: null };
    S.shoe.yaw = -0.18;
  },
  // ---- 19–21: анфас: неоновая вывеска сбоку мигает, как перегорающая трубка
  neon(t, S) {
    const k = easeInOut(seg(t, 19, 21));
    S.cam = { pos: mix3([6.6, 0.75, 0.4], [4.6, 0.66, 0.25], k), target: [0, 0.48, 0], fov: 26, roll: 0, fstop: 2.8, focus: null };
    S.cam.focus = dist3(S.cam.pos, [1.15, 0.42, 0]); // резкость — на носке
    // мигание: короткие провалы, как у старой трубки
    let on = 1; for (const [a, d] of NEON_FLICKER) if (t >= a && t < a + d) on = 0.08;
    S.light.neon = 1.6 * on; S.light.window = 0.45; S.light.lamp = 0.8;
  },
  // ---- 21–23: три расцветки в ряд; тележка вдоль ряда, фокус бежит по кроссовкам
  lineup(t, S) {
    const k = easeInOut(seg(t, 21, 23));
    S.lineup = 1;
    const z = lerp(-2.6, 2.4, k);
    S.cam = { pos: [5.4, 0.62, z], target: [0, 0.45, z * 0.55], fov: 28, roll: 0, fstop: 2.0, focus: null };
    S.cam.focus = dist3(S.cam.pos, [0, 0.45, lerp(-1.8, 1.8, k)]);
  },
  // ---- 23–26: пэкшот: медленный наезд, фары второй машины, карточка
  pack(t, S) {
    const k = easeOut(seg(t, 23, 26));
    S.cam = { pos: mix3([4.3, 0.95, 4.4], [3.9, 0.9, 4.0], k), target: mix3([-0.55, 0.45, 0.1], [-0.7, 0.44, 0.15], k), fov: 27, roll: 0, fstop: 2.4, focus: null };
    S.cam.focus = dist3(S.cam.pos, [0.1, 0.45, 0]);
    S.street.car = { on: 1, p: seg(t, 23.2, 25.9), dir: -1 };
    S.card = smooth(seg(t, 23.7, 24.4));
    S.fade = smooth(seg(t, 25.35, 26));
  },
};
