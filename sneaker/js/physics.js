// physics.js — падение кроссовка в лужу как твёрдого тела (в плоскости x–y):
// масса, момент инерции, точки касания по изогнутой подошве (рокер), удары с
// отскоком и трением, гравитация 9,8 м/с². Считается один раз, дальше — таблица.
import { soleBottom, uOfX, X0, X1 } from './shoe.js';

const G = 98;                 // 9,8 м/с² в единицах сцены (1 = 10 см)
const DT = 1 / 24000;         // шаг интегрирования, с (мелкий: контакт пены жёсткий)
const OUTSOLE = 0.022;        // подмётка ниже линии подошвы
export const COM = [-0.25, 0.4]; // центр масс: ~40 % длины от пятки (там толще пена и задник)

// точки касания: по нижнему контуру подмётки от пятки до носка
const CONTACTS = [];
for (let i = 0; i <= 24; i++) {
  const x = X0 + 0.03 + (X1 - X0 - 0.06) * (i / 24);
  CONTACTS.push([x - COM[0], soleBottom(uOfX(x)) - OUTSOLE - COM[1]]);
}

// Контакт мягкий: пена — пружина с демпфером в каждой точке касания (сжатие — миллиметры,
// собственная частота ~60 Гц). Так пятка и носок упираются одновременно, а удар
// гасится, как у настоящего кроссовка. k — радиус инерции, mu — трение мокрой резины.
export function simulateDrop({ x = -0.15, y = 3.6, th = 0.17, vx = 0.25, vy = -1.5, w = 0, k = 0.85, mu = 0.65, T = 2.6, K = 16000, zeta = 1.5 } = {}) {
  const invI = 1 / (k * k), C = 2 * zeta * Math.sqrt(K);
  const out = [], hits = [];
  let t = 0, X = x, Y = y, A = th, VX = vx, VY = vy, W = w;
  const touching = new Set();
  const N = Math.round(T / DT);
  for (let s = 0; s <= N; s++) {
    const c = Math.cos(A), sn = Math.sin(A);
    let FX = 0, FY = -G, TQ = 0, squashH = 0, squashF = 0;
    for (let i = 0; i < CONTACTS.length; i++) {
      const [px, py] = CONTACTS[i];
      const rx = c * px - sn * py, ry = sn * px + c * py;
      const d = -(Y + ry); // насколько точка ушла «в асфальт» (сжатие пены)
      if (d <= 0) { touching.delete(i); continue; }
      const vny = VY + W * rx, vt = VX - W * ry;
      if (!touching.has(i) && vny < -1.2) hits.push({ t, i, x: X + rx, speed: -vny });
      touching.add(i);
      const fn = Math.max(0, K * d - C * vny);              // пена не тянет вниз
      const ft = Math.max(-mu * fn, Math.min(mu * fn, -vt * 400)); // трение
      FX += ft; FY += fn;
      TQ += rx * fn - ry * ft;
      if (px < -0.6) squashH = Math.max(squashH, d); else if (px > 0.4) squashF = Math.max(squashF, d);
    }
    VX += FX * DT; VY += FY * DT; W += TQ * invI * DT;
    if (touching.size) W *= 1 - 2.5 * DT;
    X += VX * DT; Y += VY * DT; A += W * DT;
    if (s % 100 === 0) out.push([t, X, Y, A, squashH, squashF]);
    t += DT;
  }
  return { samples: out, hits, dt: DT * 100 };
}

// положение в момент s (секунды от начала падения), с интерполяцией
export function sampleDrop(sim, s) {
  const S = sim.samples, k = Math.max(0, Math.min(S.length - 1.001, s / sim.dt)), i = Math.floor(k), f = k - i;
  const a = S[i], b = S[i + 1];
  return { x: a[1] + (b[1] - a[1]) * f, y: a[2] + (b[2] - a[2]) * f, th: a[3] + (b[3] - a[3]) * f, sqH: a[4] + (b[4] - a[4]) * f, sqF: a[5] + (b[5] - a[5]) * f };
}
