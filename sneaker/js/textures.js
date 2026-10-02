// textures.js — процедурные текстуры кроссовка.
// Всё рисуется на холсте при загрузке: карта высот → карта нормалей,
// плюс карты цвета и шероховатости. Единственный скан — ткань канта и языка (scans).
import * as THREE from 'three';

export function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// плавный шум на решётке (для фактуры пены и резины)
function valueNoise(w, h, cell, seed) {
  const r = rng(seed), gw = Math.ceil(w / cell) + 1, gh = Math.ceil(h / cell) + 1;
  const g = new Float32Array(gw * gh).map(() => r());
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const gy = y / cell, iy = Math.floor(gy), fy = gy - iy, sy = fy * fy * (3 - 2 * fy);
    for (let x = 0; x < w; x++) {
      const gx = x / cell, ix = Math.floor(gx), fx = gx - ix, sx = fx * fx * (3 - 2 * fx);
      const ixw = (ix + 1) % gw, iyw = (iy + 1) % gh;
      const a = g[iy * gw + ix], b = g[iy * gw + ixw], c = g[iyw * gw + ix], d = g[iyw * gw + ixw];
      out[y * w + x] = (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
    }
  }
  return out;
}

// высоты → карта нормалей (соглашение OpenGL, как ждёт three.js)
function normalFromHeight(hgt, w, h, strength, wrap = true) {
  const c = canvas(w, h), ctx = c.getContext('2d'), img = ctx.createImageData(w, h), d = img.data;
  const at = (x, y) => {
    if (wrap) { x = (x + w) % w; y = (y + h) % h; } else { x = Math.min(w - 1, Math.max(0, x)); y = Math.min(h - 1, Math.max(0, y)); }
    return hgt[y * w + x];
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength;
    let nx = -dx, ny = dy, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * w + x) * 4;
    d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
// высоты → оттенки серого (цвет или шероховатость)
function grayFromHeight(hgt, w, h, f) {
  const c = canvas(w, h), ctx = c.getContext('2d'), img = ctx.createImageData(w, h), d = img.data;
  for (let i = 0; i < w * h; i++) { const v = clamp(f(hgt[i], i)) * 255; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
  ctx.putImageData(img, 0, 0);
  return c;
}
function tex(c, { srgb = false, repeat = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------------
// Трикотаж верха: столбики петель «ёлочкой». Каждая петля чуть своя
// (сдвиг, размер, наклон, тон), нить скручена из двух прядей, сверху ворс,
// между петлями — тёмные просветы, сквозь которые видна подкладка.
// ---------------------------------------------------------------------
export function knit() {
  const W = 1024, H = 1024, cols = 16, rows = 22;
  const hgt = new Float32Array(W * H), tone = new Float32Array(W * H), ply = new Float32Array(W * H);
  const fuzz = valueNoise(W, H, 2, 11), fib = valueNoise(W, H, 6, 13);
  const r = rng(31), J = new Float32Array(cols * rows * 2 * 5).map(() => r() * 2 - 1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const cx = (x / W) * cols, cy = (y / H) * rows, ix = Math.floor(cx), iy = Math.floor(cy), fx = cx - ix, fy = cy - iy;
    let v = 0, tn = 0, pl = 0;
    for (let k = 0; k < 2; k++) {
      const o = ((iy * cols + ix) * 2 + k) * 5;
      const ax = (k ? 0.73 : 0.27) + J[o] * 0.025, ay = 0.5 + J[o + 1] * 0.03;
      const ang = (0.55 + J[o + 2] * 0.06) * (k ? -1 : 1), c = Math.cos(ang), sn = Math.sin(ang), sz = 1 + J[o + 3] * 0.06;
      const dx = fx - ax, dy = fy - ay;
      const u = (dx * c + dy * sn) / (0.2 * sz), w = (-dx * sn + dy * c) / (0.6 * sz);
      const r2 = u * u + w * w;
      if (r2 < 1) {
        const tw = Math.sin((w * 3.2 + u * 1.1) * Math.PI * 2); // две пряди, скрученные по косой
        const h = Math.sqrt(1 - r2) * (0.86 + 0.14 * tw);
        if (h > v) { v = h; tn = J[o + 4]; pl = tw; }
      }
    }
    const i = y * W + x;
    hgt[i] = v * 0.82 + fuzz[i] * 0.1 + fib[i] * 0.08;
    tone[i] = tn; ply[i] = pl;
  }
  return {
    normal: tex(normalFromHeight(hgt, W, H, 6)),
    color: tex(grayFromHeight(hgt, W, H, (v, i) => {
      const loop = Math.max(0, (v - 0.1) / 0.82);
      return ((0.55 + 0.45 * loop) * (1 + 0.12 * tone[i]) * (1 + 0.07 * ply[i]) + (fuzz[i] - 0.5) * 0.1) * (0.3 + 0.7 * smooth(0.04, 0.4, loop));
    }), { srgb: true }),
    rough: tex(grayFromHeight(hgt, W, H, (v, i) => 0.97 - 0.22 * v + 0.06 * (fuzz[i] - 0.5))),
  };
}

// ---------------------------------------------------------------------
// Следы на глянце и на полу: мягкие разводы, микроцарапины, отпечатки, пылинки.
// Это карта шероховатости: светлее — матовее. Среднее значение ≈ 0,5.
// ---------------------------------------------------------------------
export function smudge() {
  const W = 1024, H = 1024, c = canvas(W, H), ctx = c.getContext('2d');
  const n1 = valueNoise(W, H, 128, 61), n2 = valueNoise(W, H, 32, 67), n3 = valueNoise(W, H, 4, 69);
  const img = ctx.createImageData(W, H), d = img.data;
  for (let i = 0; i < W * H; i++) { const v = clamp(0.36 + 0.2 * n1[i] + 0.1 * n2[i] + 0.05 * n3[i]) * 255; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
  ctx.putImageData(img, 0, 0);
  const r = rng(71);
  ctx.lineCap = 'round';
  for (let k = 0; k < 520; k++) { // микроцарапины, в основном в одну сторону — как от протирки
    const x = r() * W, y = r() * H, a = (r() < 0.7 ? 0.35 : r() * Math.PI) + (r() - 0.5) * 0.4, L = 8 + r() * 110;
    ctx.strokeStyle = `rgba(255,255,255,${0.05 + r() * 0.13})`; ctx.lineWidth = 0.5 + r() * 0.9;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); ctx.stroke();
  }
  for (let k = 0; k < 7; k++) { // отпечатки: концентрические овалы-разводы
    const x = r() * W, y = r() * H, s = 22 + r() * 30, rot = r() * Math.PI;
    for (let q = 1; q <= 12; q++) {
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(x, y, s * q / 12, s * 1.35 * q / 12, rot, 0, Math.PI * 2); ctx.stroke();
    }
  }
  for (let k = 0; k < 1400; k++) { // пылинки
    ctx.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.6})`;
    const z = 0.8 + r() * 1.6; ctx.fillRect(r() * W, r() * H, z, z);
  }
  return tex(c);
}

// ---------------------------------------------------------------------
// Скан ткани (Poly Haven, «Jersey Melange», CC0) для канта, языка, подкладки
// и стельки. Цвет переведён в серый: оттенок задаёт расцветка.
// ---------------------------------------------------------------------
export async function scans(base = 'assets/') {
  const L = new THREE.TextureLoader();
  const load = (f, srgb) => L.loadAsync(base + f).then((t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
  const [color, normal, rough] = await Promise.all([load('jersey_color.jpg', true), load('jersey_normal.jpg'), load('jersey_rough.jpg')]);
  // копия набора карт со своим масштабом повтора
  const at = (rx, ry) => {
    const o = {};
    for (const [k, t] of Object.entries({ color, normal, rough })) { o[k] = t.clone(); o[k].repeat.set(rx, ry); o[k].needsUpdate = true; }
    return o;
  };
  return { at };
}

// ---------------------------------------------------------------------
// Протектор подмётки: шевроны-грунтозацепы
// ---------------------------------------------------------------------
export function tread() {
  const W = 512, H = 512;
  const hgt = new Float32Array(W * H);
  const n = valueNoise(W, H, 4, 23);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H;
    // шеврон: «галочка» по ширине, повтор по длине
    const cx = (u * 4) % 1, row = v * 6 + Math.abs(cx - 0.5) * 1.1;
    const f = row - Math.floor(row);
    const lug = smooth(0.12, 0.2, f) * (1 - smooth(0.62, 0.7, f));
    const groove = 1 - smooth(0.0, 0.04, Math.abs(cx - 0.5)) * 0; // продольной канавки нет
    hgt[y * W + x] = lug * groove * 0.9 + n[y * W + x] * 0.1;
  }
  return {
    normal: tex(normalFromHeight(hgt, W, H, 4)),
    rough: tex(grayFromHeight(hgt, W, H, (v) => 0.75 + 0.2 * (1 - v))),
    color: tex(grayFromHeight(hgt, W, H, (v) => 0.55 + 0.45 * v), { srgb: true }),
  };
}

// ---------------------------------------------------------------------
// Карбон: саржевое плетение
// ---------------------------------------------------------------------
export function carbon() {
  const W = 256, H = 256, N = 16;
  const hgt = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const cx = Math.floor((x / W) * N), cy = Math.floor((y / H) * N);
    const fx = (x / W) * N - cx, fy = (y / H) * N - cy;
    const warp = ((cx + cy) >> 1) % 2 === 0;
    const k = warp ? Math.sin(fy * Math.PI) : Math.sin(fx * Math.PI);
    hgt[y * W + x] = (warp ? 0.55 : 0.35) + 0.45 * k;
  }
  return {
    color: tex(grayFromHeight(hgt, W, H, (v) => 0.05 + 0.25 * v), { srgb: true }),
    rough: tex(grayFromHeight(hgt, W, H, (v) => 0.45 - 0.25 * v)),
  };
}

// ---------------------------------------------------------------------
// Пена промежуточной подошвы: верхняя половина текстуры — латеральная
// сторона, нижняя — медиальная. По горизонтали — длина от пятки к носку.
// Рельеф: «линии энергии» на нижнем слое, канавка на верхнем, печать модели.
// ---------------------------------------------------------------------
export function foam() {
  const W = 2048, H = 512;
  const hgt = new Float32Array(W * H);
  const n1 = valueNoise(W, H, 2, 5), n2 = valueNoise(W, H, 9, 7), pr = rng(41);
  const pores = new Float32Array(W * H);
  for (let i = 0; i < 26000; i++) { const x = Math.floor(pr() * W), y = Math.floor(pr() * H), rr = 1 + pr() * 1.6; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const d = Math.hypot(dx, dy) / rr; const xx = x + dx, yy = y + dy; if (d < 1 && xx >= 0 && xx < W && yy >= 0 && yy < H) pores[yy * W + xx] = Math.max(pores[yy * W + xx], 1 - d * d); } }
  for (let y = 0; y < H; y++) {
    const half = y < H / 2 ? 0 : 1;              // 0 — латераль, 1 — медиаль
    const hg = 1 - ((y % (H / 2)) / (H / 2));    // доля высоты подошвы: 1 — верх
    for (let x = 0; x < W; x++) {
      const u = x / W;
      let v = 0;
      // нижний слой: наклонные рёбра в средней части
      if (hg < 0.47 && hg > 0.1) {
        const k = (u * 34 + hg * 9 * (half ? -1 : 1)) % 1;
        const zone = smooth(0.16, 0.3, u) * (1 - smooth(0.62, 0.78, u));
        v -= zone * (smooth(0.0, 0.08, k) * (1 - smooth(0.32, 0.42, k))) * 0.9 * smooth(0.1, 0.18, hg) * (1 - smooth(0.4, 0.47, hg));
      }
      // верхний слой: плавная канавка
      const gl = 0.76 + 0.05 * Math.sin(u * 9 + half);
      v -= Math.exp(-(((hg - gl) / 0.018) ** 2)) * 0.7 * smooth(0.04, 0.12, u) * (1 - smooth(0.9, 0.98, u));
      hgt[y * W + x] = v + n1[y * W + x] * 0.06 + n2[y * W + x] * 0.05 - pores[y * W + x] * 0.09;
    }
  }
  // печать на латеральной стороне пятки
  const det = grayFromHeight(hgt, W, H, (v) => 0.86 + 0.2 * v);
  const ctx = det.getContext('2d');
  ctx.fillStyle = 'rgba(30,30,34,0.9)';
  ctx.font = '600 34px "Unbounded", "Manrope", Arial, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText('PULSE ONE · CARBON', W * 0.075, H * 0.5 * (1 - 0.62));
  ctx.font = '500 20px "Manrope", Arial, sans-serif';
  ctx.fillText('AIRCELL FOAM', W * 0.075, H * 0.5 * (1 - 0.53));
  return {
    normal: tex(normalFromHeight(hgt, W, H, 6, false), { repeat: false }),
    color: tex(det, { srgb: true, repeat: false }),
    rough: tex(grayFromHeight(hgt, W, H, (v, i) => 0.58 + 0.12 * n2[i] + 0.25 * pores[i]), { repeat: false }),
  };
}

// вентиляционная перфорация: шестиугольная сетка отверстий в овальной зоне
export function holes() {
  const W = 1024, H = 1024, c = canvas(W, H), ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  const step = 26, rad = 5.2;
  for (let row = 0; row * step * 0.87 < H; row++) for (let col = 0; col * step < W + step; col++) {
    const x = col * step + (row % 2) * step / 2, y = row * step * 0.87;
    const u = x / W - 0.5, v = y / H - 0.5;
    const zone = (u / 0.42) ** 2 + (v / 0.3) ** 2;
    if (zone > 1) continue;
    const r = rad * (1 - 0.45 * zone);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  return tex(c, { srgb: true, repeat: false });
}

// плетение шнурка: косые рёбра
export function weave() {
  const W = 128, H = 64, hgt = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = ((x / W) * 8 + (y / H) * 2) % 1, b = ((x / W) * 8 - (y / H) * 2 + 10) % 1;
    hgt[y * W + x] = 0.5 * Math.sin(a * Math.PI) + 0.5 * Math.sin(b * Math.PI);
  }
  return tex(normalFromHeight(hgt, W, H, 2.2));
}

// ---------------------------------------------------------------------
// Логотип «орбита»: дуга эллипса, сужающаяся к концам, и «планета»
// ---------------------------------------------------------------------
export function logo() {
  // холст сопоставлен боку кроссовка: x от −1,2 до 0,9, высота от 1,0 (верх) до 0,38 (низ).
  // Знак ORBITA: наклонная орбита-эллипс и «планета» на ней.
  const W = 1024, H = 512, c = canvas(W, H), ctx = c.getContext('2d');
  const X = (x) => ((x + 1.2) / 2.1) * W, Y = (y) => (1 - (y - 0.38) / 0.62) * H;
  const cx = X(-0.3), cy = Y(0.6), rx = X(0.42) - X(-0.3), ry = Y(0.5) - Y(0.6), rot = -0.13;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 15;
  ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
  // планета: на орбите впереди и сверху, с тонким зазором-«тенью» вокруг
  const a = -0.62, px = Math.cos(a) * rx, py = Math.sin(a) * ry;
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath(); ctx.arc(px, py, 44, 0, Math.PI * 2); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(px, py, 32, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  return tex(c, { srgb: true, repeat: false });
}

// надпись на пяточной петле и на язычке
export function label(text, w = 512, h = 128, size = 64) {
  const c = canvas(w, h), ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.font = `700 ${size}px "Unbounded", "Manrope", Arial, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2);
  return tex(c, { srgb: true, repeat: false });
}
