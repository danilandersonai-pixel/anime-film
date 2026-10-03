// timeline6.js — режиссура v6 «Анатомия»: тёмная студия, свет бежит по поверхности,
// камера проходит вдоль всего кроссовка, кроссовок вращается, разбирается на детали
// (реверс-инжиниринг) и шнуруется на глазах. evaluate6(t) → состояние кадра.
// Свет — в тех же единицах, что в Cycles: площадной — яркость L (P = L·π·S),
// прожектор — сила света I (P = I·4π).
import { upperPoint, upperNormal } from './shoe.js';
import { PARTS } from './anatomy.js';

export const DURATION6 = 30;
export const SHOTS6 = { reveal: 0, glide: 3, spin: 7, explode: 9, orbit: 14, plate: 16.2, assemble: 17, lace: 19, hero: 24, end: 27.5 };
export const CARD6 = 27.8;           // карточка — на сильную долю после последнего оборота
export const HOVER = 1.15;           // на какую высоту кроссовок поднимается для разбора
export const LACE_T = [19, 23.5];    // шнуровка: девять шагов по полдоли — каждый на долю 120 уд/мин

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (t, a, b) => clamp((t - a) / (b - a));
const smooth = (x) => x * x * (3 - 2 * x);
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const mix3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const add3 = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const orbit = (c, az, R, h) => [c[0] + Math.sin(az) * R, h, c[2] + Math.cos(az) * R];
// пружина: быстро к цели с небольшим перелётом (~10 %) — так разлетаются детали
const spring = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.exp(-7 * x) * Math.cos(10 * x));
const ORDER = Object.entries(SHOTS6).sort((a, b) => a[1] - b[1]);
export function shotAt6(t) { let s = ORDER[0][0]; for (const [n, t0] of ORDER) if (t >= t0) s = n; return s; }

// точки шнуровки (середины рядов блочек) и узел — из модели (setRig6)
let RIG = null;
export function setRig6(macro) {
  const rows = macro.laces.map((p) => [p[0], p[1], p[2]]);
  RIG = { rows, knot: add3(rows[6], [-0.06, 0.05, 0]) };
}

// точка на наружном боку верха (u — от пятки 0 к носку 1, h — доля высоты борта) и нормаль
const sOfU = (u) => Math.acos(1 - 2 * clamp(u, 0.001, 0.999)) / (2 * Math.PI);
const sidePoint = (u, h) => ({ p: upperPoint(sOfU(u), h), n: upperNormal(sOfU(u), h) });

// ---------------------------------------------------------------------
// Разлёт деталей: снаружи внутрь (шнурки первыми), сборка — снизу вверх со щелчком
// ---------------------------------------------------------------------
const EXPLODE_AT = 9.0, ASSEMBLE_AT = 17.0;
function explodeOf(key, t) {
  const i = PARTS.findIndex((p) => p.key === key), n = PARTS.length;
  if (key === 'laces') return spring(seg(t, EXPLODE_AT, EXPLODE_AT + 0.8));
  const out = spring(seg(t, EXPLODE_AT + 0.12 * (n - 1 - i), EXPLODE_AT + 0.12 * (n - 1 - i) + 0.8));
  const x = seg(t, ASSEMBLE_AT + 0.09 * i, ASSEMBLE_AT + 0.09 * i + 0.34);
  return out * (1 - Math.pow(x, 2.4)); // к месту — с ускорением, как защёлкивается
}

// ---------------------------------------------------------------------
export function evaluate6(t) {
  const S = {
    t, shot: shotAt6(t), fade: 0, card: 0, labels: 0,
    cam: { pos: [0, 0.6, 6], target: [0, 0.55, 0], fov: 30, roll: 0, fstop: 4, focus: null },
    shoe: { pos: [0, 0, 0], yaw: 0, pitch: 0, roll: 0, pivot: null, squash: 0 },
    parts: Object.fromEntries(PARTS.map((p) => [p.key, explodeOf(p.key, t)])),
    laces: { p: 1, away: 0 },
    light: { key: 0.3, rimL: 5, rimR: 5, top: 0, env: 0.06, sweep: null },
  };
  // шнурки улетают при сборке и возвращаются шнуровкой
  if (t >= ASSEMBLE_AT - 0.05) {
    S.laces.away = t < LACE_T[0] ? smooth(seg(t, ASSEMBLE_AT - 0.05, ASSEMBLE_AT + 0.5)) : 0;
    S.laces.p = t < LACE_T[0] ? (S.laces.away < 1 ? 1 : 0) : clamp((t - LACE_T[0]) / (LACE_T[1] - LACE_T[0]));
    if (t >= LACE_T[0]) S.parts.laces = 0;
  }
  // кроссовок: два оборота (взлёт перед разбором и финальный), висит во время разбора
  S.shoe.yaw = 2 * Math.PI * (ease(seg(t, 7.0, 8.7)) + ease(seg(t, 24.0, 27.3)));
  S.shoe.pos[1] = HOVER * (ease(seg(t, 7.9, 9.0)) - ease(seg(t, 18.0, 18.8)));
  SHOT_FN[S.shot](t, S);
  handheld(t, S);
  if (S.cam.focus === null) S.cam.focus = dist3(S.cam.pos, S.cam.target);
  return S;
}

// лёгкая «живая» камера: медленный дрейф (студийный кран — меньше, чем с рук)
function handheld(t, S) {
  const w = (f, p) => Math.sin(t * f + p), k = 0.0015 * dist3(S.cam.pos, S.cam.target);
  S.cam.target = add3(S.cam.target, [(0.6 * w(0.9, 0.3) + 0.4 * w(2.1, 1.7)) * k, (0.6 * w(0.7, 2.2) + 0.4 * w(1.9, 0.4)) * k, 0.5 * w(0.6, 5.1) * k]);
  S.cam.roll += 0.0015 * w(0.8, 1.1);
}

// бегущая полоса света: позиция, куда смотрит, размер (ширина × высота), яркость
const bar = (pos, look, w, h, L) => ({ pos, look, w, h, L });

const SHOT_FN = {
  // ---- 0–3: темнота; полоса света идёт за кроссовком от пятки к носку и обводит силуэт
  reveal(t, S) {
    const k = ease(seg(t, 0, 3));
    S.cam = { pos: mix3([0.7, 0.62, 6.6], [0.4, 0.58, 5.7], k), target: [0.02, 0.55, 0], fov: 30, roll: 0, fstop: 4, focus: null };
    const x = lerp(-5.2, 5.2, ease(seg(t, 0.15, 2.9)));
    S.light = { key: 0.3 * smooth(seg(t, 1.7, 3)), rimL: 6 * smooth(seg(t, 0.4, 1.6)), rimR: 6 * smooth(seg(t, 0.9, 2.1)), top: 0, env: 0.02 + 0.04 * seg(t, 1.5, 3), sweep: bar([x, 2.3, -2.3], [x * 0.5, 0.6, 0], 0.22, 3.6, 30) };
    S.fade = 1 - smooth(seg(t, 0, 0.4));
  },
  // ---- 3–7: макро — камера проходит вдоль всего наружного бока от пятки до носка,
  // навстречу ей полоса света скользит по трикотажу; фон тёмный
  glide(t, S) {
    const u = lerp(0.03, 0.97, ease(seg(t, 3, 7)));
    const { p: P, n: N } = sidePoint(u, 0.32);
    // камера чуть позади точки и над ней, смотрит вперёд вдоль ткани
    const pos = [P[0] + N[0] * 0.5 - 0.16, P[1] + N[1] * 0.5 + 0.1, P[2] + N[2] * 0.5];
    const tgt = [P[0] + 0.16, P[1] + 0.02, P[2]];
    S.cam = { pos, target: tgt, fov: 34, roll: 0.035, fstop: 4, focus: dist3(pos, P) };
    // полоса света ходит туда-обратно через кадр: дважды проходит по поверхности
    const ul = clamp(u + 0.22 * Math.cos(Math.PI * (t - 3) / 2), 0.02, 0.98), L = sidePoint(ul, 0.45);
    S.light = { key: 0.45, rimL: 2.5, rimR: 2.5, top: 0, env: 0.05, sweep: bar([L.p[0] + L.n[0] * 1.3, L.p[1] + 0.7, L.p[2] + L.n[2] * 1.3], [L.p[0], L.p[1], L.p[2]], 0.12, 1.6, 60) };
  },
  // ---- 7–9: отъезд от носка; кроссовок делает оборот и поднимается в воздух
  spin(t, S) {
    const A = SHOT_FN_END.glide, k = ease(seg(t, 7, 9));
    S.cam = { pos: mix3(A.pos, [4.6, 2.3, 6.6], k), target: mix3(A.target, [0, 1.45, 0], k), fov: lerp(36, 30, k), roll: lerp(0.035, 0, k), fstop: lerp(2.8, 5.6, k), focus: null };
    S.light = { key: 0.25, rimL: 6, rimR: 6, top: 80 * smooth(seg(t, 8.2, 9.0)), env: 0.05, sweep: null };
  },
  // ---- 9–14: разбор на детали; камера отходит и медленно облетает висящий «разрез»
  explode(t, S) {
    const c = [0, 1.75, 0];
    let az, R, h;
    if (t < 11) { const k = ease(seg(t, 9, 11)); az = lerp(0.608, 0.25, k); R = lerp(8.04, 9.6, k); h = lerp(2.3, 2.2, k); }
    else { const k = ease(seg(t, 11, 14)); az = lerp(0.25, -0.5, k); R = lerp(9.6, 9.2, k); h = lerp(2.2, 2.6, k); }
    const tgt = mix3([0, 1.45, 0], c, ease(seg(t, 9, 10.5)));
    S.cam = { pos: orbit(tgt, az, R, h), target: tgt, fov: 30, roll: 0, fstop: 5.6, focus: null };
    S.labels = smooth(seg(t, 11.0, 11.6)) * (1 - smooth(seg(t, 13.6, 14.0)));
    const xs = lerp(-4.5, 4.5, seg(t, 12.0, 13.9));
    S.light = { key: 0.14, rimL: 5, rimR: 5, top: 80, env: 0.05, sweep: t > 12 && t < 13.9 ? bar([xs, 1.8, 3.4], [xs * 0.4, 1.8, 0], 0.2, 5, 26) : null };
  },
  // ---- 14–16,2: быстрый облёт вокруг — со всех сторон, через спину и внутренний бок
  orbit(t, S) {
    const k = ease(seg(t, 14, 16.2)), c = [0, 1.75, 0];
    const az = lerp(-0.5, 0.38 - 2 * Math.PI, k);
    S.cam = { pos: orbit(c, az, lerp(9.2, 6.2, k), lerp(2.6, 1.7, k)), target: mix3(c, PLATE_AT(), smooth(seg(t, 15.4, 16.2))), fov: 30, roll: 0.02 * Math.sin(Math.PI * k), fstop: 5.6, focus: null };
    S.light = { key: 0.14, rimL: 5, rimR: 5, top: 80, env: 0.05, sweep: null };
  },
  // ---- 16,2–17: наезд на карбоновую пластину между слоями пены; блик бежит по плетению
  plate(t, S) {
    const k = ease(seg(t, 16.2, 17)), P = PLATE_AT();
    const from = orbit([0, 1.75, 0], 0.38, 6.2, 1.7), to = add3(P, [Math.sin(0.38) * 1.25, 0.5, Math.cos(0.38) * 1.25]); // сверху-сбоку: видно плетение карбона
    S.cam = { pos: mix3(from, to, k), target: P, fov: lerp(30, 27, k), roll: 0, fstop: lerp(5.6, 4, k), focus: null };
    const xs = lerp(-2.2, 2.4, seg(t, 16.3, 17.0));
    S.light = { key: 0.1, rimL: 4, rimR: 4, top: 60, env: 0.05, sweep: bar([xs, P[1] + 0.35, 1.7], [xs, P[1], 0], 2.4, 0.12, 60) };
  },
  // ---- 17–19: сборка со щелчком, шнурки улетают; кроссовок опускается на пол
  assemble(t, S) {
    const A = SHOT_FN_END.plate, k1 = easeOut(seg(t, 17, 17.9)), k2 = ease(seg(t, 17.9, 19));
    const mid = { pos: [3.4, 2.6, 4.4], target: [0.1, 1.3, 0] };
    const L0 = laceCam(0, 0);
    const pos = t < 17.9 ? mix3(A.pos, mid.pos, k1) : mix3(mid.pos, L0.pos, k2);
    const tgt = t < 17.9 ? mix3(A.target, mid.target, k1) : mix3(mid.target, L0.target, k2);
    S.cam = { pos, target: tgt, fov: lerp(27, 32, seg(t, 17, 19)), roll: 0, fstop: lerp(4, 5.6, k1), focus: null };
    S.light = { key: 0.3, rimL: 5, rimR: 5, top: 80 * (1 - smooth(seg(t, 18.0, 19))), env: 0.06, sweep: null };
  },
  // ---- 19–24: шнуровка: шнурок проходит крест-накрест от носка к горловине и завязывается
  lace(t, S) {
    const f = clamp(S.laces.p * 9 - 0.5, 0, 7.6), up = ease(seg(t, 23.4, 24.0));
    const C = laceCam(f, up);
    S.cam = { pos: C.pos, target: C.target, fov: 32, roll: -0.03, fstop: 5.6, focus: null };
    // свет идёт вслед за шнурком: узкая полоса над подъёмом
    const x = C.target[0];
    S.light = { key: 0.36, rimL: 4, rimR: 5, top: 0, env: 0.06, sweep: bar([x - 0.2, 2.2, 1.4], [x, 0.8, 0], 1.6, 0.14, 20) };
  },
  // ---- 24–27,5: оборот на 360° у самого пола, полоса света проходит спереди
  hero(t, S) {
    const k = ease(seg(t, 24, 27.5));
    S.cam = { pos: mix3([0.2, 0.62, 6.2], [0.5, 0.74, 5.4], k), target: [0, 0.55, 0], fov: 30, roll: 0, fstop: 4, focus: null };
    const x = lerp(-4.4, 4.4, ease(seg(t, 24.3, 27.2)));
    S.light = { key: 0.3, rimL: 7, rimR: 7, top: 0, env: 0.06, sweep: bar([x, 1.4, 3.0], [x * 0.3, 0.55, 0], 0.2, 3.0, 34) };
  },
  // ---- 27,5–30: финальный ракурс три четверти, карточка, затемнение
  end(t, S) {
    const k = ease(seg(t, 27.5, 29.2));
    S.cam = { pos: mix3([0.5, 0.74, 5.4], [3.9, 1.05, 4.1], k), target: mix3([0, 0.55, 0], [-0.75, 0.48, 0.12], k), fov: 30, roll: 0, fstop: 2.8, focus: null };
    S.cam.focus = dist3(S.cam.pos, [0.1, 0.45, 0]);
    const x = lerp(-3, 3, ease(seg(t, 28.0, 29.6)));
    S.light = { key: 0.32, rimL: 7, rimR: 7, top: 0, env: 0.06, sweep: bar([x, 1.6, 2.6], [x * 0.3, 0.5, 0], 0.18, 2.6, 18) };
    S.card = smooth(seg(t, CARD6, CARD6 + 0.7));
    S.fade = smooth(seg(t, 29.35, 30));
  },
};

// где карбоновая пластина при полном разлёте (центр в мире: кроссовок висит, пластина опущена)
const PLATE_AT = () => [0.35, HOVER + 0.21 + PARTS.find((p) => p.key === 'plate').off[1], 0];

// камера шнуровки: смотрит сверху-сбоку на ряд, до которого дошёл шнурок
function laceCam(f, up) {
  const rows = RIG ? RIG.rows : [[0.55, 0.85, 0], [-0.3, 1.05, 0]];
  const pts = RIG ? [...rows, RIG.knot] : rows;
  const i = Math.min(pts.length - 2, Math.floor(f)), a = pts[i], b = pts[i + 1], k = smooth(clamp(f - i));
  const target = mix3(a, b, k);
  const off = mix3([0.95, 1.0, 1.05], [1.9, 1.7, 2.3], up);
  return { pos: add3(target, off), target: mix3(target, [0, 0.7, 0], up * 0.6) };
}

// конечные положения камеры планов, к которым пристыковываются следующие (без склейки)
const SHOT_FN_END = {};
for (const [name, t1] of [['glide', 7], ['plate', 17]]) {
  const S = { t: t1, cam: {}, light: {}, laces: { p: 1, away: 0 }, parts: {} };
  Object.defineProperty(SHOT_FN_END, name, { get: () => { SHOT_FN[name](t1 - 1e-6, S); return S.cam; } });
}
