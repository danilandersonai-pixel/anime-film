// timeline.js — режиссура ролика: что происходит в момент t.
// evaluate(t) возвращает состояние кадра; одно и то же t всегда даёт один и тот же кадр.
export const DURATION = 22;
// границы планов (секунды); музыка — 120 ударов в минуту, такт = 2 с
export const SHOTS = { reveal: 0, hero: 4, explode: 8, run: 12, colors: 15, pack: 17 };
export const COLOR_SWITCH = [[0, 'ember'], [15, 'glacier'], [16, 'volt'], [17, 'ember']];
export const FLASHES = [[4, 0.55], [11.75, 0.45], [15, 0.5], [16, 0.5], [17, 0.6]];
export const IMPACT = 13.0;

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (t, a, b) => clamp((t - a) / (b - a));
const smooth = (x) => x * x * (3 - 2 * x);
const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const easeIn = (x) => x * x * x;
const backOut = (x) => { const c = 1.4; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const mix3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const orbit = (c, ang, r, y) => [c[0] + Math.sin(ang) * r, y, c[2] + Math.cos(ang) * r];

export const GLOWS = { ember: ['#ff5a1f', '#2f6bff'], glacier: ['#36b8ff', '#9fe7ff'], volt: ['#c6f23a', '#2f6bff'] };

function colorwayAt(t) { let c = 'ember'; for (const [t0, n] of COLOR_SWITCH) if (t >= t0) c = n; return c; }
function flashAt(t) { let f = 0; for (const [t0, a] of FLASHES) if (t >= t0) f = Math.max(f, a * Math.exp(-(t - t0) * 10)); return f; }

export function evaluate(t) {
  const S = {
    t, shot: 'reveal', colorway: colorwayAt(t), flash: flashAt(t), fade: 0,
    cam: { pos: [3, 1.2, 3.5], target: [0, 0.55, 0], fov: 28, roll: 0 },
    shoe: { pos: [0, 0, 0], yaw: 0, pitch: 0, roll: 0, pivot: null, explode: 0, squash: 0, partYaw: 0 },
    light: { key: 5, rimL: 14, rimR: 16, sweep: 0, sweepX: 0, sun: 0.9, env: 0.3 },
    bg: { glowAmt: 0.5, glow2Amt: 0.15, glowDir: [0.3, 0.15, -1], bars: 1 },
    bigText: { opacity: 0, x: 0 }, streaks: 0, ring: { amt: 0, r: 0 },
    bokeh: { on: false, aperture: 0.002, maxblur: 0.006 }, bloom: 0.5, spot: 0.05,
  };
  if (t < SHOTS.hero) reveal(t, S);
  else if (t < SHOTS.explode) hero(t, S);
  else if (t < SHOTS.run) explode(t, S);
  else if (t < SHOTS.colors) run(t, S);
  else if (t < SHOTS.pack) colors(t, S);
  else pack(t, S);
  return S;
}

// ---- 1. Из темноты: полоса света пробегает вдоль бока, камера вплотную
function reveal(t, S) {
  S.shot = 'reveal';
  const k = easeInOut(seg(t, 0, 4));
  S.cam = { pos: mix3([-1.75, 0.42, 1.6], [0.95, 0.66, 1.8], k), target: mix3([-0.95, 0.56, 0], [0.55, 0.52, 0], k), fov: 24, roll: lerp(0.04, -0.02, k) };
  S.fade = 1 - smooth(seg(t, 0, 0.9));
  const sw = seg(t, 0.3, 3.4);
  S.light = { key: 1.2 * smooth(seg(t, 2.2, 3.8)), rimL: 10 * smooth(seg(t, 0.6, 2.4)), rimR: 16 * smooth(seg(t, 1.2, 3.2)), sweep: 30 * Math.sin(Math.PI * sw), sweepX: lerp(-2.6, 2.6, sw), sun: 0.2 * smooth(seg(t, 2.5, 4)), env: lerp(0.05, 0.18, seg(t, 1, 4)) };
  S.bg = { glowAmt: 0.25 * seg(t, 1, 4), glow2Amt: 0.08, glowDir: [0.6, 0.1, -1], bars: seg(t, 1.5, 3.5) };
  const d = Math.hypot(S.cam.pos[0] - S.cam.target[0], S.cam.pos[1] - S.cam.target[1], S.cam.pos[2] - S.cam.target[2]);
  S.bokeh = { on: true, focus: d, aperture: 0.004, maxblur: 0.01 };
  S.bloom = 0.65;
  S.spot = 0.02;
}

// ---- 2. Герой: кроссовок парит и поворачивается, камера облетает навстречу
function hero(t, S) {
  S.shot = 'hero';
  const k = easeInOut(seg(t, 4, 8));
  S.shoe.pos = [0, 0.34 + 0.035 * Math.sin((t - 4) * 1.7), 0];
  S.shoe.yaw = lerp(0.5, -0.7, easeOut(seg(t, 4, 8)));
  S.shoe.pitch = -0.07 + 0.03 * Math.sin((t - 4) * 1.3);
  S.shoe.roll = 0.05 * Math.sin((t - 4) * 1.1);
  const c = [0, 0.78, 0];
  S.cam = { pos: orbit(c, lerp(0.75, 0.2, k), lerp(5.4, 4.7, k), lerp(1.05, 1.25, k)), target: c, fov: 30, roll: lerp(-0.035, 0.02, k) };
  S.bigText = { opacity: 0.13 * smooth(seg(t, 4.1, 4.8)) * (1 - smooth(seg(t, 7.5, 8))), x: lerp(1.0, -1.0, k) };
  S.bg = { glowAmt: 0.42, glow2Amt: 0.07, glowDir: [0.25, 0.25, -1], bars: 0 };
  S.bloom = 0.55;
  S.spot = 0.08;
}

// ---- 3. Взрыв-схема: слои расходятся, подписи, затем щелчок обратно
function explode(t, S) {
  S.shot = 'explode';
  const k = easeInOut(seg(t, 8, 12));
  const e = backOut(seg(t, 8.15, 9.2)) * (1 - easeIn(seg(t, 11.15, 11.75)));
  S.shoe.explode = e;
  S.shoe.pos = [0, 0.18 + 0.62 * e, 0];
  S.shoe.yaw = lerp(-0.42, -0.3, k);
  S.shoe.partYaw = e;
  const c = [0.05, 0.95, 0];
  S.cam = { pos: orbit(c, lerp(0.92, 0.78, k), lerp(6.2, 5.8, k), lerp(2.3, 2.1, k)), target: [c[0], lerp(1.3, 1.2, k), 0], fov: 31, roll: 0 };
  S.bg = { glowAmt: 0.22, glow2Amt: 0.2, glowDir: [-0.2, 0.3, -1], bars: 0 };
  S.light.key = 6;
  S.bloom = 0.45;
  S.spot = 0.1;
}

// ---- 4. Бег: камера у пола, удар пяткой, сжатие пены, волна, отталкивание
function run(t, S) {
  S.shot = 'run';
  const k = easeInOut(seg(t, 12, 15));
  const L = 1.32; // от центра до пятки и до носка
  let y = 0, pitch = 0, pivot = null;
  if (t < IMPACT) { // полёт перед приземлением
    const f = seg(t, 12, IMPACT);
    y = lerp(0.75, 0.0, easeIn(f));
    pitch = lerp(0.12, 0.3, f);
    pivot = [-L, 0];
  } else if (t < 13.25) { // перекат с пятки на всю стопу
    pitch = lerp(0.3, 0, easeOut(seg(t, IMPACT, 13.25)));
    pivot = [-L, 0];
  } else if (t < 13.6) { // опора
    pitch = 0;
  } else { // перекат на носок и взлёт
    const f = seg(t, 13.6, 14.3);
    pitch = -0.42 * easeOut(f);
    pivot = [0.95, 0];
    y = 0.38 * easeOut(seg(t, 14.1, 15));
  }
  S.shoe.pos = [0, y, 0];
  S.shoe.pitch = pitch;
  S.shoe.pivot = pivot;
  S.shoe.yaw = 0;
  S.shoe.squash = 0.13 * Math.sin(Math.PI * seg(t, IMPACT + 0.05, 13.62));
  S.cam = { pos: mix3([1.0, 0.34 + y * 0.5, 4.0], [-0.3, 0.3 + y * 0.5, 3.3], k), target: mix3([0.2, 0.55 + y * 0.75, 0], [-0.1, 0.5 + y * 0.75, 0], k), fov: 36, roll: -0.06 };
  S.streaks = (1 - 0.75 * Math.sin(Math.PI * seg(t, 12.85, 13.7))) * smooth(seg(t, 12, 12.25)) * (1 - smooth(seg(t, 14.6, 15)));
  const rf = seg(t, IMPACT, IMPACT + 1.1);
  S.ring = { amt: (1 - rf) * (rf > 0 ? 1 : 0), r: 0.2 + rf * 4.2 };
  S.bg = { glowAmt: 0.32, glow2Amt: 0.08, glowDir: [0, 0.2, -1], bars: 1 };
  S.light.rimR = 20;
  S.bloom = 0.5;
  S.spot = 0.1;
}

// ---- 5. Расцветки: смена по ударам музыки
function colors(t, S) {
  S.shot = 'colors';
  const k = easeInOut(seg(t, 15, 17));
  S.shoe.yaw = lerp(-0.45, -0.15, k);
  S.shoe.pos = [0, 0, 0];
  S.cam = { pos: mix3([4.5, 1.5, 4.7], [4.1, 1.38, 4.3], k), target: [0.05, 0.55, 0], fov: 28, roll: 0 };
  S.bg = { glowAmt: 0.5, glow2Amt: 0.08, glowDir: [0.35, 0.25, -1], bars: 0 };
  S.light.key = 6;
  S.bloom = 0.5;
  S.spot = 0.12;
}

// ---- 6. Пэкшот: герой-ракурс, медленный наезд, финальные надписи
function pack(t, S) {
  S.shot = 'pack';
  const k = easeOut(seg(t, 17, 21.5));
  S.shoe.yaw = lerp(-0.12, -0.24, k);
  S.shoe.pos = [0, 0, 0];
  S.cam = { pos: mix3([4.3, 1.2, 4.6], [3.8, 1.08, 4.1], k), target: mix3([-0.65, 0.48, 0.1], [-0.82, 0.46, 0.15], k), fov: 27, roll: 0 };
  S.bigText = { opacity: 0, x: 0 };
  S.bg = { glowAmt: 0.48, glow2Amt: 0.06, glowDir: [0.45, 0.25, -1], bars: 0 };
  S.light.key = 5.5;
  S.bloom = 0.5;
  S.spot = 0.14;
}
