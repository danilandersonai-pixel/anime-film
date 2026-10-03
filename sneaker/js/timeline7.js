// timeline7.js — режиссура v7 «Кристаллы» (20 с, кинорамка 2.39:1). Туманный мир плит
// и прозрачных кристаллов над тёмной водой; белый кроссовок прилетает издалека сквозь
// коридор из плит, пролетает над водой, делает «бочку» и садится на камень-остров среди
// тёплых оранжевых друз — они вспыхивают. Три макроплана, из воды поднимаются светящиеся
// шары-«спутники», финальный общий план с надписью. evaluate7(t) → состояние кадра.
// Свет — в тех же единицах, что в Cycles: площадной — яркость L, прожектор и точечный — сила I.
import { ISLAND_TOP } from './cave.js';

export const DURATION7 = 20;
// после касания (9,0 с) монтаж идёт по долям музыки: 90 уд/мин, доля — 2/3 с
export const BEAT = 2 / 3;
export const LAND_T = 9.0;           // касание камня — вспышка друз, удар в музыке
export const SHOTS7 = { open: 0, pass: 3.0, track: 5.4, land: 7.8, toe: LAND_T + 2 * BEAT, heel: LAND_T + 4 * BEAT, side: LAND_T + 6 * BEAT, orbs: LAND_T + 8 * BEAT, hero: LAND_T + 12 * BEAT };
export const LOGO_T = LAND_T + 13 * BEAT;   // надпись PULSE ONE — на долю после финального удара
export const DROP_T = 1.55;          // капля падает в воду в первом плане
export const KEY_OFF = [6, 10.1, 9]; // ключевой прожектор — над и перед тем, что освещает
export const UPPER_GAIN = 2.3;       // белый трикотаж ярче: карта пряжи темнит цвет (то же — в Cycles)

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (t, a, b) => clamp((t - a) / (b - a));
const smooth = (x) => x * x * (3 - 2 * x);
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const mix3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const add3 = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const norm3 = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const ORDER = Object.entries(SHOTS7).sort((a, b) => a[1] - b[1]);
export function shotAt7(t) { let s = ORDER[0][0]; for (const [n, t0] of ORDER) if (t >= t0) s = n; return s; }

// ---------------------------------------------------------------------
// Полёт: опорные точки по времени, между ними — кубический сплайн Эрмита (скорость
// непрерывна). Издалека слева, сквозь коридор плит, над водой перед островом — на камень.
// ---------------------------------------------------------------------
const FLY = [
  [2.2, [-48, 4.4, -18.6]],
  [3.0, [-40, 4.1, -13.6]],
  [4.3, [-24, 3.5, -4.0]],
  [5.6, [-14.5, 2.9, 2.0]],
  [7.0, [-7.6, 2.5, 3.4]],
  [8.2, [-3.2, 2.3, 1.3]],
  [LAND_T, [0, ISLAND_TOP, 0]],
];
const VEL = FLY.map((k, i) => {
  if (i === FLY.length - 1) return [0.4, -0.5, 0];          // касание: почти без скорости, чуть вниз
  const a = FLY[Math.max(0, i - 1)], b = FLY[Math.min(FLY.length - 1, i + 1)];
  return sub3(b[1], a[1]).map((v) => v / (b[0] - a[0]));
});
function flyPos(t) {
  if (t >= LAND_T) return [0, ISLAND_TOP, 0];
  if (t <= FLY[0][0]) return add3(FLY[0][1], VEL[0], t - FLY[0][0]);
  let i = 0; while (FLY[i + 1][0] <= t) i++;
  const [t0, p0] = FLY[i], [t1, p1] = FLY[i + 1], h = t1 - t0, s = (t - t0) / h;
  const h00 = 2 * s ** 3 - 3 * s * s + 1, h10 = s ** 3 - 2 * s * s + s, h01 = -2 * s ** 3 + 3 * s * s, h11 = s ** 3 - s * s;
  return [0, 1, 2].map((k) => h00 * p0[k] + h10 * h * VEL[i][k] + h01 * p1[k] + h11 * h * VEL[i + 1][k]);
}
const flyVel = (t) => { const a = flyPos(t - 0.01), b = flyPos(Math.min(t + 0.01, LAND_T - 1e-4)); return sub3(b, a).map((v) => v / (Math.min(t + 0.01, LAND_T - 1e-4) - t + 0.01)); };
const heading = (t) => { const v = flyVel(t); return Math.atan2(-v[2], v[0]); };

// поза в полёте: нос по курсу, крен в повороте, «бочка» над водой, перед касанием — выравнивание
export function shoePose(t) {
  if (t >= LAND_T) return { pos: [0, ISLAND_TOP, 0], yaw: 0, pitch: 0, roll: 0, pivot: null, squash: 0 };
  const v = flyVel(t), sp = Math.hypot(v[0], v[2]);
  let yaw = heading(t);
  let pitch = Math.atan2(v[1], sp) * 0.7;
  const om = wrap(heading(t + 0.05) - heading(t - 0.05)) / 0.1;          // скорость поворота курса
  let roll = clamp(om * sp * 0.035, -0.5, 0.5);                         // крен в сторону поворота
  roll -= 2 * Math.PI * ease(seg(t, 6.0, 7.45));                        // «бочка»
  const k = smooth(seg(t, 7.9, LAND_T));                                 // выравнивание перед касанием
  yaw = wrap(yaw) * (1 - k); pitch *= 1 - k; roll = wrap(roll) * (1 - k);   // полный оборот «бочки» = 0
  const pos = flyPos(t);
  pos[1] += 0.07 * Math.sin(t * 2.3) * (1 - k);                          // парит, а не едет по рельсам
  return { pos, yaw, pitch, roll, pivot: null, squash: 0 };
}

// ---------------------------------------------------------------------
// Шары-«спутники»: всплывают из воды вокруг острова и зависают вокруг кроссовка
// [где всплывает x, z; где зависает x, y, z; радиус; когда всплывает]
// ---------------------------------------------------------------------
const O8 = (k) => LAND_T + 8 * BEAT + k * BEAT / 2;   // восьмые доли после начала плана
export const ORBS7 = [
  [2.6, 5.6, 2.3, 1.55, 2.1, 0.16, O8(0.25)],
  [-2.9, 5.4, -2.6, 2.05, 1.7, 0.12, O8(1)],
  [7.6, -0.8, 3.5, 2.5, -0.9, 0.19, O8(1.5)],
  [-7.8, 0.6, -3.6, 1.6, -0.4, 0.14, O8(2)],
  [0.4, 6.4, 0.8, 2.9, 1.3, 0.1, O8(2.5)],
  [-1.2, -5.4, -0.6, 2.8, -2.4, 0.21, O8(3)],
  [2.0, -5.6, 1.9, 1.5, -2.7, 0.13, O8(3.5)],
  [4.0, 7.2, 4.4, 1.25, 3.0, 0.22, O8(4)],
  [-4.6, 6.6, -4.6, 2.6, 2.4, 0.15, O8(4.5)],
];
function orbsAt(t) {
  const out = [];
  ORBS7.forEach(([ex, ez, hx, hy, hz, r, te], i) => {
    if (t < te) return;
    const u = seg(t, te, te + 1.9), ph = i * 1.7;
    const y = lerp(-r, hy, easeOut(u)) + 0.06 * Math.sin(1.4 * (t - te) + ph) * smooth(u);
    const k = smooth(u);
    const x = lerp(ex, hx, k) + 0.05 * Math.sin(0.9 * t + ph) * k, z = lerp(ez, hz, k) + 0.05 * Math.cos(0.8 * t + ph) * k;
    out.push([x, y, z, r, 0.45 + 0.55 * smooth(seg(t, te, te + 0.7))]);
  });
  return out;
}

// круги на воде: [x, z, радиус, сила] — капля, касание острова, всплывающие шары
function ringsAt(t) {
  const R = [];
  const ring = (x, z, t0, r0, v, a, tau) => { if (t >= t0 && t < t0 + 4 * tau) R.push([x, z, r0 + v * (t - t0), a * Math.exp(-(t - t0) / tau) * smooth(seg(t, t0, t0 + 0.08))]); };
  ring(0.9, 15.5, DROP_T, 0.04, 1.0, 0.55, 0.9);
  ring(0.9, 15.5, DROP_T + 0.12, 0.02, 0.7, 0.3, 0.7);
  ring(0, 0, LAND_T, 6.4, 2.4, 0.3, 1.1);
  for (const [ex, ez, , , , r, te] of ORBS7) ring(ex, ez, te + r / 1.2, r * 0.9, 0.9, 0.5, 1.0);
  return R.sort((a, b) => b[3] - a[3]).slice(0, 10);
}

// капля в первом плане: падает с высоты и уходит в воду
function dropAt(t) {
  const t0 = DROP_T - Math.sqrt(2 * 6 / 98.1);   // свободное падение с 60 см (g = 98,1 ед/с²)
  if (t < t0 || t >= DROP_T) return null;
  return [0.9, 6 - 0.5 * 98.1 * (t - t0) ** 2, 15.5];
}

// ---------------------------------------------------------------------
export function evaluate7(t) {
  const shoe = shoePose(t);
  const S = {
    t, shot: shotAt7(t), fade: 0, logo: 0, shoe,
    cam: { pos: [0, 1, 12], target: [0, 1, 0], fov: 26, roll: 0, fstop: 4, focus: null },
    light: { moon: 1.6, rim: 5, key: 250, keyAt: [0, 0.9, 0], keyCone: 20, glow: 0.85, crystal: 1, env: 1, sky: 1, mist: 0.15, fog: 0.016, sweep: null },
    orbs: orbsAt(t), rings: ringsAt(t), drop: dropAt(t),
  };
  SHOT_FN[S.shot](t, S);
  // ключевой прожектор ведёт кроссовок в полёте и замирает над островом после посадки
  if (t < LAND_T) {
    const k = smooth(seg(t, 8.4, LAND_T));
    S.light.keyAt = mix3(add3(shoe.pos, [0, 0.45, 0]), [0, 0.9, 0], k);
    S.light.keyCone = lerp(9, 20, k);
  }
  handheld(t, S);
  if (S.cam.focus === null) S.cam.focus = dist3(S.cam.pos, S.cam.target);
  S.fade = Math.max(S.fade, 1 - smooth(seg(t, 0, 0.8)), smooth(seg(t, 19.4, 20)));
  S.logo = smooth(seg(t, LOGO_T, LOGO_T + 0.8));
  return S;
}

// лёгкая «живая» камера: медленный дрейф, как с крана
function handheld(t, S) {
  if (S.shot === 'pass') return;
  const w = (f, p) => Math.sin(t * f + p), k = 0.0012 * dist3(S.cam.pos, S.cam.target);
  S.cam.target = add3(S.cam.target, [(0.6 * w(0.9, 0.3) + 0.4 * w(2.1, 1.7)) * k, (0.6 * w(0.7, 2.2) + 0.4 * w(1.9, 0.4)) * k, 0.5 * w(0.6, 5.1) * k]);
  S.cam.roll += 0.0015 * w(0.8, 1.1);
}

// полоса света, которая проходит по боку кроссовка: позиция, куда смотрит, размер, яркость
const bar = (pos, look, w, h, L) => ({ pos, look, w, h, L });
const SHOE_C = [0, ISLAND_TOP + 0.45, 0];   // середина стоящего кроссовка

const SHOT_FN = {
  // ---- 0–3: низко над тёмной водой к далёкому острову; в первом плане падает капля
  open(t, S) {
    const x = seg(t, 0, 3.0), k = 0.4 * smooth(x) + 0.6 * x;
    S.cam = { pos: mix3([3.2, 0.55, 26.5], [1.6, 0.5, 19.8], k), target: mix3([-0.6, 1.7, -8], [-1.2, 1.5, -8], k), fov: 26, roll: 0, fstop: 4, focus: null };
    S.cam.focus = dist3(S.cam.pos, SHOE_C);
    Object.assign(S.light, { key: 120, glow: 0.25, crystal: 0.6, mist: 0.22, fog: 0.02 });
  },
  // ---- 3–5,4: кроссовок выходит из тумана в коридоре плит и проносится мимо камеры;
  // камера разворачивается за ним — вдали тёплый огонёк острова
  pass(t, S) {
    const k = seg(t, 3.0, 5.4);
    const pos = mix3([-25.0, 2.9, -1.2], [-21.8, 2.7, 0.6], k);
    const P = add3(shoePose(t - 0.05).pos, [0, 0.45, 0]);
    S.cam = { pos, target: P, fov: 32, roll: 0.02 * Math.sin(Math.PI * k), fstop: 2.8, focus: dist3(pos, P) };
    Object.assign(S.light, { key: 200, glow: 0.3, crystal: 0.6, mist: 0.2, fog: 0.022 });
  },
  // ---- 5,4–7,8: рядом с кроссовком над водой, он делает «бочку»; под ним проплывают кристаллы
  track(t, S) {
    const P = add3(S.shoe.pos, [0, 0.45, 0]), F = norm3(sub3(flyPos(t + 0.4), flyPos(t - 0.4)));
    const R = norm3(cross3(F, [0, 1, 0])), k = ease(seg(t, 5.4, 7.8));
    const d = lerp(7.4, 6.0, k);
    // камера чуть впереди: перед носом остаётся место — кроссовок летит в кадр
    const pos = add3(add3(add3(P, R, d), F, lerp(0.6, 1.2, k)), [0, 0.55, 0]);
    S.cam = { pos, target: add3(P, F, 1.2), fov: 30, roll: -0.02, fstop: 3.2, focus: dist3(pos, P) };
    Object.assign(S.light, { key: 160, glow: 0.35, crystal: 0.6, fog: 0.02 });
  },
  // ---- 7,8–10,33: низко перед островом; кроссовок входит слева и садится — друзы вспыхивают
  land(t, S) {
    const k = ease(seg(t, 7.8, SHOTS7.toe));
    const pos = mix3([5.2, 0.95, 8.4], [4.3, 0.92, 7.0], k), P = add3(S.shoe.pos, [0, 0.45, 0]);
    S.cam = { pos, target: mix3([-1.2, 1.35, 0.6], [-0.15, 1.0, 0], ease(seg(t, 7.8, 9.2))), fov: 27, roll: 0, fstop: 4, focus: dist3(pos, P) };
    const flash = t < LAND_T ? 0 : Math.exp(-(t - LAND_T) / 0.35);
    Object.assign(S.light, { key: lerp(160, 250, smooth(seg(t, 8.6, LAND_T))), glow: lerp(0.35, 0.85, smooth(seg(t, LAND_T, 10))) + 2.2 * flash, crystal: lerp(0.6, 1, smooth(seg(t, LAND_T, 10))) + 3 * flash });
  },
  // ---- 10,33–11,67: макро: носок сквозь размытые тёплые кристаллы
  toe(t, S) {
    const k = ease(seg(t, SHOTS7.toe, SHOTS7.heel));
    const pos = mix3([3.3, 0.95, 1.6], [3.0, 0.9, 1.4], k);
    S.cam = { pos, target: [1.0, 0.98, 0.2], fov: 26, roll: 0.02, fstop: 5.6, focus: null, af: 1 };
    Object.assign(S.light, { rim: 6 });
  },
  // ---- 11,67–13: пятка и кант горловины, за ними светится большая друза
  heel(t, S) {
    const k = ease(seg(t, SHOTS7.heel, SHOTS7.side));
    const pos = mix3([-3.0, 1.55, 1.75], [-2.75, 1.45, 1.95], k);
    S.cam = { pos, target: [-1.15, 1.2, 0.05], fov: 26, roll: -0.02, fstop: 5.6, focus: null, af: 1 };
    // мягкая заливка со стороны камеры: пятка отвёрнута от ключа
    Object.assign(S.light, { rim: 7, sweep: bar([-3.4, 1.9, 2.6], [-1.2, 1.1, 0], 1.4, 1.0, 5) });
  },
  // ---- 13–14,33: вдоль наружного бока — по логотипу бежит полоса света
  side(t, S) {
    const k = ease(seg(t, SHOTS7.side, SHOTS7.orbs));
    const pos = mix3([0.65, 0.98, 2.35], [-0.35, 0.98, 2.3], k);
    S.cam = { pos, target: mix3([0.35, 0.92, 0.3], [-0.6, 0.92, 0.3], k), fov: 28, roll: 0, fstop: 2.8, focus: dist3(pos, [-0.1, 0.9, 0.45]) };
    const x = lerp(-3.2, 3.2, ease(seg(t, SHOTS7.side + 0.03, SHOTS7.orbs - 0.05)));
    Object.assign(S.light, { key: 170, sweep: bar([x, 1.5, 2.1], [x * 0.5, 0.95, 0.3], 0.15, 2.4, 40) });
  },
  // ---- 14,33–17: из воды всплывают светящиеся шары; камера поднимается от самой воды
  orbs(t, S) {
    const k = ease(seg(t, SHOTS7.orbs, SHOTS7.hero));
    const pos = mix3([6.6, 0.6, 6.4], [7.4, 1.7, 8.4], k);
    S.cam = { pos, target: mix3([0, 1.05, 0], [0, 1.35, 0], k), fov: 30, roll: 0, fstop: 3.2, focus: dist3(pos, SHOE_C) };
  },
  // ---- 17–20: общий план: кроссовок на острове, шары вокруг, надпись; затемнение
  hero(t, S) {
    const k = ease(seg(t, 17.0, 20.0));
    const pos = mix3([1.4, 1.65, 17.2], [1.0, 1.5, 15.4], k);
    S.cam = { pos, target: [0, 1.25, 0], fov: 22, roll: 0, fstop: 4, focus: dist3(pos, SHOE_C) };
  },
};
