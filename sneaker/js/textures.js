// textures.js — процедурные текстуры кроссовка.
// Всё рисуется на холсте при загрузке: карта высот → карта нормалей,
// плюс карты цвета и шероховатости. Никаких внешних картинок.
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
// Трикотаж верха: столбики петель «ёлочкой» + волокна
// ---------------------------------------------------------------------
export function knit() {
  const W = 512, H = 512, cols = 16, rows = 22;
  const hgt = new Float32Array(W * H);
  const fib = valueNoise(W, H, 3, 11);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const cx = (x / W) * cols, cy = (y / H) * rows;
    const fx = cx - Math.floor(cx), fy = cy - Math.floor(cy);
    let v = 0;
    for (const [ax, sg] of [[0.27, 1], [0.73, -1]]) {
      // наклонённая петля-эллипс
      const dx = fx - ax, dy = fy - 0.5;
      const a = 0.55 * sg, c = Math.cos(a), s = Math.sin(a);
      const u = (dx * c + dy * s) / 0.2, w = (-dx * s + dy * c) / 0.6;
      const r2 = u * u + w * w;
      if (r2 < 1) v = Math.max(v, Math.sqrt(1 - r2));
    }
    hgt[y * W + x] = v * 0.85 + fib[y * W + x] * 0.15;
  }
  return {
    normal: tex(normalFromHeight(hgt, W, H, 3.2)),
    color: tex(grayFromHeight(hgt, W, H, (v) => 0.62 + 0.38 * v), { srgb: true }),
    rough: tex(grayFromHeight(hgt, W, H, (v) => 0.95 - 0.25 * v)),
  };
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
  const n1 = valueNoise(W, H, 2, 5), n2 = valueNoise(W, H, 9, 7);
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
      hgt[y * W + x] = v + n1[y * W + x] * 0.05 + n2[y * W + x] * 0.05;
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
  };
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
