/* =========================================================================
   pencil.js — движок «карандаш на бумаге»
   -------------------------------------------------------------------------
   Модули: случайность с зерном, палитры-роли, бумага, линия-лента с нажимом,
   штриховка, рукописный текст, камера.
   Правила стиля (из методички):
     • рисунок меняется 12 раз в секунду («на двойках»), без моушн-блюра;
     • линии «кипят»: каждый рисунок перерисовывается чуть-чуть иначе;
     • случайность только из генератора с зерном — ролик всегда одинаковый;
     • у линии есть нажим, сужение на концах, разрывы и второй тонкий проход;
     • штриховка вместо заливки; на светлой бумаге штрихуем тень.
   ========================================================================= */
(function (global) {
  'use strict';

  const W = 1920, H = 1080;
  const DRAW_FPS = 12;   // сколько разных рисунков в секунду
  const CS = 0.5;        // слой мелка рисуем в половинном разрешении: он мягкий, а так вчетверо быстрее
  const VIDEO_FPS = 24;  // кадров в секунду в видео

  // ---------------------------------------------------------------------
  // Случайность с зерном. Никакого Math.random.
  // ---------------------------------------------------------------------
  function hashStr(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mix(a, b) {
    let h = (a ^ Math.imul((b + 0x9e3779b9) | 0, 0x85ebca6b)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
    return (h ^ (h >>> 16)) >>> 0;
  }
  function rng(seed) { // mulberry32
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // генератор «статичный» (одинаковый на всех рисунках) и «кипящий» (меняется 12 раз/с)
  const staticRng = (key) => rng(hashStr(key));
  const boilRng = (key, salt = 0) => rng(mix(hashStr(key) ^ salt, PEN.frame));

  // ---------------------------------------------------------------------
  // Время и плавности
  // ---------------------------------------------------------------------
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const seg = (t, a, b) => clamp((t - a) / (b - a));           // 0..1 на отрезке [a,b]
  const ease = (x) => x * x * (3 - 2 * x);                        // smoothstep
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);
  const easeIn = (x) => x * x * x;
  const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const back = (x) => { const c = 1.6; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };

  // ---------------------------------------------------------------------
  // Палитры: бумага + роли цветов. Сцены рисуют ролями, не цветами.
  // ---------------------------------------------------------------------
  // общие роли для мелков: кожа, волосы, стены по эпохам, пол, тень
  const CRAYON = {
    skin: '#efbd96', cream: '#f4e2bd', shadow: '#3e3f6c',
    hairDark: '#4b3428', hairBrown: '#86532e', hairGinger: '#d27a33', hairFair: '#e3b257', hairGray: '#bdb7b0',
    wallA: '#9db3c6', wallB: '#dcb468', wallC: '#a8c69a', wallD: '#f1c49b', floor: '#a9733d', cardboard: '#c99b5f',
  };
  const THEMES = {
    paper: Object.assign({}, CRAYON, {
      title: 'Старая бумага',
      paper: '#e6dac1', stain: '#c2aa83', fiber: '#a48d69', grid: null, margin: null,
      line: '#29262e', soft: '#5f5960', guide: '#6c9bd6',
      fur: '#c8853c', a1: '#3d6fc2', a2: '#4f9b59', warm: '#e6473a', light: '#fffaf0',
      night: '#2c3346',
    }),
    notebook: Object.assign({}, CRAYON, {
      title: 'Тетрадь',
      paper: '#f3f2ea', stain: '#d6d1c0', fiber: '#c4bfae', grid: '#a8c4e2', margin: '#e48b84',
      line: '#2f3036', soft: '#62626a', guide: '#7aa4d8',
      fur: '#c98d47', a1: '#2f62bb', a2: '#2f914f', warm: '#ef7d2a', light: '#ffffff',
      night: '#2a3550',
    }),
    kraft: Object.assign({}, CRAYON, {
      title: 'Крафт',
      paper: '#c19d71', stain: '#8c6942', fiber: '#775737', grid: null, margin: null,
      line: '#2c1b0c', soft: '#57402a', guide: '#f3ecdc',
      fur: '#8f5525', a1: '#2b4f96', a2: '#3f7a43', warm: '#bd2b22', light: '#fff8ea',
      skin: '#f3c9a3', cream: '#f8ecd2', shadow: '#33263a', wallA: '#7f93a6', wallB: '#c99a4d', wallC: '#879f78', wallD: '#e0a77a', floor: '#6f4420',
      night: '#2a2118',
    }),
  };
  // эти роли не выцветают в «прошлом» (до поворота сюжета)
  const NOFADE = { line: 1, soft: 1, guide: 1, paper: 1, stain: 1, fiber: 1, light: 1, night: 1 };

  function hex2rgb(h) {
    h = h.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const lum = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];

  function setTheme(name) {
    const th = THEMES[name] || THEMES.paper;
    PEN.themeName = THEMES[name] ? name : 'paper';
    PEN.theme = th;
    PEN.rgb = {};
    for (const k of Object.keys(th)) if (typeof th[k] === 'string' && th[k][0] === '#') PEN.rgb[k] = hex2rgb(th[k]);
    PEN.paperCanvas = makePaper(th);
    if (!PEN.grainCanvas) PEN.grainCanvas = makeGrain();
    if (!PEN.crayonGrain) PEN.crayonGrain = makeCrayonGrain();
  }

  // цвет роли с учётом «выцветания прошлого»; 'fur:sh' — тень, 'fur:lt' — свет, 'fur:dk' — темнее
  const rgbCache = new Map();
  function rgbOf(role) {
    const ck = role + '|' + PEN.fade.toFixed(3) + '|' + PEN.themeName;
    const hit = rgbCache.get(ck);
    if (hit) return hit;
    let base = role, suffix = null;
    const ix = role.indexOf(':');
    if (ix > 0) { base = role.slice(0, ix); suffix = role.slice(ix + 1); }
    let c = PEN.rgb[base] || (base[0] === '#' ? hex2rgb(base) : PEN.rgb.line);
    if (suffix === 'sh') c = mixc(mixc(c, PEN.rgb.shadow, 0.5), [0, 0, 0], 0.12);
    else if (suffix === 'lt') c = mixc(c, PEN.rgb.light, 0.5);
    else if (suffix === 'dk') c = mixc(c, [0, 0, 0], 0.3);
    if (PEN.fade > 0 && !NOFADE[base]) {
      const g = lum(c);
      const sepia = mixc([g, g, g], PEN.rgb.stain, 0.45);
      c = mixc(c, mixc(sepia, PEN.rgb.paper, 0.15), PEN.fade * 0.78);
    }
    if (rgbCache.size > 4000) rgbCache.clear();
    rgbCache.set(ck, c);
    return c;
  }
  function col(role, a = 1) {
    const c = rgbOf(role);
    return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${clamp(a)})`;
  }

  // ---------------------------------------------------------------------
  // Бумага: зерно, волокна, пятна, следы ластика, призраки старых линий
  // ---------------------------------------------------------------------
  function makeCanvas(w, h) {
    const c = (typeof document !== 'undefined') ? document.createElement('canvas') : null;
    c.width = w; c.height = h;
    return c;
  }

  function makePaper(th) {
    const c = makeCanvas(W, H), g = c.getContext('2d');
    const r = rng(hashStr('paper:' + th.title));
    const P = hex2rgb(th.paper), S = hex2rgb(th.stain), F = hex2rgb(th.fiber);
    const rgba = (cc, a) => `rgba(${cc[0] | 0},${cc[1] | 0},${cc[2] | 0},${a})`;
    g.fillStyle = th.paper; g.fillRect(0, 0, W, H);

    // крупные мягкие пятна и неровный тон
    for (let i = 0; i < 46; i++) {
      const x = r() * W, y = r() * H, rad = 80 + r() * 460;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      const tone = r() < 0.5 ? S : mixc(P, [255, 255, 255], 0.5);
      gr.addColorStop(0, rgba(tone, 0.035 + r() * 0.05));
      gr.addColorStop(1, rgba(tone, 0));
      g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // клетка тетради и поля
    if (th.grid) {
      g.strokeStyle = rgba(hex2rgb(th.grid), 0.5); g.lineWidth = 1.2;
      for (let x = 24; x < W; x += 48) { g.beginPath(); g.moveTo(x + (r() - 0.5), 0); g.lineTo(x + (r() - 0.5), H); g.stroke(); }
      for (let y = 18; y < H; y += 48) { g.beginPath(); g.moveTo(0, y + (r() - 0.5)); g.lineTo(W, y + (r() - 0.5)); g.stroke(); }
      g.strokeStyle = rgba(hex2rgb(th.margin), 0.75); g.lineWidth = 2.4;
      g.beginPath(); g.moveTo(W - 168, 0); g.lineTo(W - 166, H); g.stroke();
    }
    // мелкое зерно
    const gc = makeCanvas(480, 270), gg = gc.getContext('2d');
    const id = gg.createImageData(480, 270);
    for (let i = 0; i < id.data.length; i += 4) {
      const v = r();
      const dark = v < 0.5;
      const cc = dark ? S : [255, 255, 255];
      id.data[i] = cc[0]; id.data[i + 1] = cc[1]; id.data[i + 2] = cc[2];
      id.data[i + 3] = (dark ? (0.5 - v) : (v - 0.5)) * 2 * 60;
    }
    gg.putImageData(id, 0, 0);
    g.imageSmoothingEnabled = true;
    g.globalAlpha = 0.55; g.drawImage(gc, 0, 0, W, H); g.globalAlpha = 1;
    // волокна
    for (let i = 0; i < 900; i++) {
      const x = r() * W, y = r() * H, len = 6 + r() * 34, a = r() * Math.PI * 2;
      g.strokeStyle = rgba(r() < 0.6 ? F : mixc(P, [255, 255, 255], 0.6), 0.05 + r() * 0.12);
      g.lineWidth = 0.5 + r() * 0.9;
      g.beginPath(); g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(a + 0.6) * len * 0.5, y + Math.sin(a + 0.6) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len);
      g.stroke();
    }
    // призраки недотёртых линий (старые рисунки на этом листе)
    for (let i = 0; i < 16; i++) {
      let x = r() * W, y = r() * H, a = r() * 6.28;
      g.strokeStyle = rgba(hex2rgb(th.line), 0.03 + r() * 0.035);
      g.lineWidth = 1 + r() * 2;
      g.beginPath(); g.moveTo(x, y);
      const n = 3 + (r() * 4 | 0);
      for (let k = 0; k < n; k++) { a += (r() - 0.5) * 1.6; x += Math.cos(a) * (30 + r() * 90); y += Math.sin(a) * (30 + r() * 90); g.lineTo(x, y); }
      g.stroke();
    }
    // следы ластика: светлые смазанные пятна
    for (let i = 0; i < 9; i++) {
      const x = r() * W, y = r() * H, rw = 50 + r() * 140, rh = 14 + r() * 30;
      g.save(); g.translate(x, y); g.rotate((r() - 0.5) * 1.2);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, rw);
      gr.addColorStop(0, rgba(mixc(P, [255, 255, 255], 0.35), 0.35));
      gr.addColorStop(1, rgba(P, 0));
      g.scale(1, rh / rw); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rw, 0, 6.28); g.fill();
      g.restore();
    }
    // потемнение к краям листа
    const vg = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.72);
    vg.addColorStop(0, rgba(S, 0));
    vg.addColorStop(1, rgba(S, 0.38));
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    return c;
  }

  // зерно графита: им «выкусываем» крапинки из линий, чтобы был зуб бумаги
  function makeGrain() {
    const N = 384;
    const c = makeCanvas(N, N), g = c.getContext('2d');
    const r = rng(hashStr('grain'));
    const id = g.createImageData(N, N);
    // низкочастотное поле, чтобы зерно было неравномерным
    const lowN = 12, low = [];
    for (let i = 0; i < (lowN + 1) * (lowN + 1); i++) low.push(r());
    const lowAt = (x, y) => {
      const fx = x / N * lowN, fy = y / N * lowN, ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy;
      const k = (a, b) => low[(b % lowN) * (lowN + 1) + (a % lowN)];
      return lerp(lerp(k(ix, iy), k(ix + 1, iy), tx), lerp(k(ix, iy + 1), k(ix + 1, iy + 1), tx), ty);
    };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 4;
      const v = r(), lo = lowAt(x, y);
      // горизонтальная «полоска» волокна усиливает фактуру
      const a = clamp((v - 0.42 + (lo - 0.5) * 0.35) * 1.5) * 0.9;
      id.data[i] = 0; id.data[i + 1] = 0; id.data[i + 2] = 0; id.data[i + 3] = a * 255;
    }
    g.putImageData(id, 0, 0);
    return c;
  }

  // ---------------------------------------------------------------------
  // Геометрия
  // ---------------------------------------------------------------------
  // локальная система (позиция, масштаб, поворот) → мир
  function xf(x, y, s = 1, rot = 0, flip = 1) {
    const c = Math.cos(rot), sn = Math.sin(rot);
    const f = (px, py) => { px *= s * flip; py *= s; return [x + px * c - py * sn, y + px * sn + py * c]; };
    f.s = s; f.x = x; f.y = y; f.rot = rot; f.flip = flip;
    f.pts = (arr) => arr.map((p) => f(p[0], p[1]));
    return f;
  }

  function ellipsePts(cx, cy, rx, ry, rot = 0, key = '', n = 0) {
    const r = staticRng('ell:' + key);
    const a0 = r() * Math.PI * 2;
    const wob = 0.025 + r() * 0.02, ph = r() * 6.28;
    n = n || Math.max(18, Math.min(72, Math.round((rx + ry) * 0.35)));
    const c = Math.cos(rot), s = Math.sin(rot), out = [];
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * Math.PI * 2;
      const k = 1 + wob * Math.sin(2 * a + ph);
      const px = Math.cos(a) * rx * k, py = Math.sin(a) * ry * k;
      out.push([cx + px * c - py * s, cy + px * s + py * c]);
    }
    return out;
  }
  // эллипс без «кривизны руки» — для областей штриховки
  function ellipsePoly(cx, cy, rx, ry, rot = 0, n = 40) {
    const c = Math.cos(rot), s = Math.sin(rot), out = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, px = Math.cos(a) * rx, py = Math.sin(a) * ry;
      out.push([cx + px * c - py * s, cy + px * s + py * c]);
    }
    return out;
  }
  function arcPts(cx, cy, rx, ry, a0, a1, n = 16) {
    const out = [];
    for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n); out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
    return out;
  }
  // сглаживание Катмулла–Рома через опорные точки
  function curve(pts, closed = false, seg = 8) {
    if (pts.length < 3) return pts.slice();
    const out = [], n = pts.length;
    const get = (i) => closed ? pts[(i + n) % n] : pts[clamp(i, 0, n - 1)];
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
      for (let k = 0; k < seg; k++) {
        const t = k / seg, t2 = t * t, t3 = t2 * t;
        out.push([
          0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
        ]);
      }
    }
    if (!closed) out.push(pts[n - 1]);
    return out;
  }
  function polyLen(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; }

  function resample(pts, ds) {
    const out = [pts[0]], cum = [0];
    let acc = 0, need = ds;
    for (let i = 1; i < pts.length; i++) {
      const ax = pts[i - 1][0], ay = pts[i - 1][1], bx = pts[i][0], by = pts[i][1];
      const l = Math.hypot(bx - ax, by - ay);
      if (l < 1e-9) continue;
      let pos = 0;
      while (acc + (l - pos) >= need) {
        const step = need - acc; pos += step; acc = 0; need = ds;
        const t = pos / l;
        out.push([ax + (bx - ax) * t, ay + (by - ay) * t]);
        cum.push(cum[cum.length - 1] + ds);
      }
      acc += l - pos;
    }
    const lp = pts[pts.length - 1], lo = out[out.length - 1];
    const tail = Math.hypot(lp[0] - lo[0], lp[1] - lo[1]);
    if (tail > ds * 0.2) { out.push(lp); cum.push(cum[cum.length - 1] + tail); }
    return { pts: out, cum, L: cum[cum.length - 1] };
  }

  // 2-звенная «рука»: плечо → локоть → кисть (обратная кинематика)
  function ik(sx, sy, tx, ty, a, b, bend = 1) {
    let dx = tx - sx, dy = ty - sy, d = Math.hypot(dx, dy);
    const maxd = (a + b) * 0.995, mind = Math.abs(a - b) + 1;
    const dd = clamp(d, mind, maxd);
    if (d < 1e-6) { dx = 0; dy = 1; d = 1; }
    const ux = dx / d, uy = dy / d;
    const cosA = clamp((a * a + dd * dd - b * b) / (2 * a * dd), -1, 1);
    const ang = Math.acos(cosA) * bend;
    const ex = sx + (ux * Math.cos(ang) - uy * Math.sin(ang)) * a;
    const ey = sy + (ux * Math.sin(ang) + uy * Math.cos(ang)) * a;
    const hx = sx + ux * dd, hy = sy + uy * dd;
    return { e: [ex, ey], h: [hx, hy] };
  }

  // ---------------------------------------------------------------------
  // Линия карандаша: лента с нажимом, сужением, разрывами и кипением
  // ---------------------------------------------------------------------
  // обрезка ломаной по прямоугольнику (Лианг — Барски для каждого отрезка)
  function clipSeg(ax, ay, bx, by, x0, y0, x1, y1) {
    let t0 = 0, t1 = 1;
    const dx = bx - ax, dy = by - ay;
    const pp = [-dx, dx, -dy, dy], qq = [ax - x0, x1 - ax, ay - y0, y1 - ay];
    for (let i = 0; i < 4; i++) {
      if (pp[i] === 0) { if (qq[i] < 0) return null; continue; }
      const r = qq[i] / pp[i];
      if (pp[i] < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
    }
    return [t0, t1];
  }
  function clipPolyline(pts, x0, y0, x1, y1) {
    const parts = [];
    let cur = null;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      const c = clipSeg(a[0], a[1], b[0], b[1], x0, y0, x1, y1);
      if (!c) { if (cur) { parts.push(cur); cur = null; } continue; }
      const pa = c[0] > 0 ? [a[0] + (b[0] - a[0]) * c[0], a[1] + (b[1] - a[1]) * c[0]] : a;
      const pb = c[1] < 1 ? [a[0] + (b[0] - a[0]) * c[1], a[1] + (b[1] - a[1]) * c[1]] : b;
      if (!cur) cur = [pa];
      else if (c[0] > 0) { parts.push(cur); cur = [pa]; }
      cur.push(pb);
      if (c[1] < 1) { parts.push(cur); cur = null; }
    }
    if (cur) parts.push(cur);
    return parts.filter((q) => q.length >= 2);
  }

  function stroke(ctx, pts, o = {}) {
    const alpha = o.alpha === undefined ? 1 : o.alpha;
    const prog = o.p === undefined ? 1 : o.p;
    if (alpha <= 0.004 || prog <= 0.001 || !pts || pts.length < 2) return;
    // линия, уходящая далеко за край кадра, обрезается по краю — иначе карандаш
    // прорисовывает тысячи невидимых точек (пол и стены рядом с камерой)
    if (PEN.view && !o.clipped && !PEN.noClip) {
      const vw = PEN.view, M = 20 / PEN.z;
      const x0 = vw[0] - M, y0 = vw[1] - M, x1 = vw[2] + M, y1 = vw[3] + M;
      let out = false;
      for (const q of pts) if (q[0] < x0 || q[0] > x1 || q[1] < y0 || q[1] > y1) { out = true; break; }
      if (out) {
        const parts = clipPolyline(o.closed ? pts.concat([pts[0]]) : pts, x0, y0, x1, y1);
        if (o.closed && parts.length > 1) { // замкнутый контур: склеить кусок до начальной точки с куском после неё
          const f = parts[0], l = parts[parts.length - 1];
          if (f[0] === pts[0] && l[l.length - 1] === pts[0]) { parts[0] = l.concat(f.slice(1)); parts.pop(); }
        }
        parts.forEach((part, i) => stroke(ctx, part, Object.assign({}, o, { key: (o.key || 'stroke') + '#' + i, closed: false, wAt: null, clipped: true })));
        return;
      }
    }
    const z = PEN.z;
    const key = o.key || 'stroke';
    const w = (o.w === undefined ? 2.6 : o.w) / z;
    const amp = (o.amp === undefined ? 1.5 : o.amp) / z;
    const role = o.color || 'line';

    let path = pts;
    if (o.closed) {
      // замкнутый контур заходит за свою начальную точку
      const L0 = polyLen(pts.concat([pts[0]]));
      const over = Math.min(L0 * 0.08, 30 / z);
      const ext = [];
      let acc = 0;
      for (let i = 1; i < pts.length && acc < over; i++) {
        acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        ext.push(pts[i]);
      }
      path = pts.concat([pts[0]], ext);
    }
    const ds = Math.max(2.2, 4.5) / z;
    const R = resample(path, ds);
    const P = R.pts, L = R.L;
    if (P.length < 2 || L < 0.5 / z) return;

    const rb = boilRng(key);
    // кипение: низкочастотная волна поперёк линии + общий сдвиг
    const lam1 = (150 + rb() * 160) / z, lam2 = (45 + rb() * 50) / z;
    const ph1 = rb() * 6.28, ph2 = rb() * 6.28, phP = rb() * 6.28;
    const a1 = amp * (0.6 + rb() * 0.5), a2 = amp * (0.25 + rb() * 0.3);
    const sx = (rb() - 0.5) * amp * 1.2, sy = (rb() - 0.5) * amp * 1.2;
    const press = (o.press === undefined ? 1 : o.press) * (0.82 + rb() * 0.18);
    const alphaJ = 0.86 + rb() * 0.14;
    // разрывы: карандаш иногда отрывается от бумаги
    const gaps = [];
    const Lpx = L * z;
    if (o.gaps !== false && Lpx > 110) {
      const want = rb() < 0.5 ? 1 : 0;
      const want2 = Lpx > 480 && rb() < 0.55 ? 1 : 0;
      const n = want + want2;
      for (let i = 0; i < n; i++) {
        const c = L * (0.18 + rb() * 0.64), gl = (5 + rb() * 9) / z;
        gaps.push([c - gl / 2, c + gl / 2]);
      }
    } else { rb(); rb(); }
    const taperOn = o.taper !== false;
    const Lvis = L * prog;

    // точки со смещением
    const n = P.length;
    const offP = new Array(n);
    for (let i = 0; i < n; i++) {
      const s = R.cum[i];
      const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
      let tx = P[i1][0] - P[i0][0], ty = P[i1][1] - P[i0][1];
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const nx = -ty, ny = tx;
      const off = a1 * Math.sin((s / lam1) * 6.28 + ph1) + a2 * Math.sin((s / lam2) * 6.28 + ph2);
      offP[i] = [P[i][0] + nx * off + sx, P[i][1] + ny * off + sy, nx, ny, s];
    }
    const widthAt = (s) => {
      const u = s / L;
      let t = 1;
      if (taperOn) {
        const endLen = Math.min(0.16, 34 / Lpx * 1.0 + 0.04);
        t = Math.pow(clamp(u / endLen), 0.65) * Math.pow(clamp((1 - u) / (endLen * 1.2)), 0.65);
        t = 0.22 + 0.78 * t;
      }
      // o.wAt(u): вес линии вдоль контура (толще на теневой стороне)
      return w * press * t * (0.86 + 0.14 * Math.sin(s * z / 70 + phP)) * (o.wAt ? o.wAt(u) : 1);
    };

    ctx.fillStyle = col(role, alpha * alphaJ * (o.dim === undefined ? 1 : o.dim));
    ribbon(ctx, offP, widthAt, Lvis, gaps);

    // второй тонкий набросочный проход
    if (o.sketch !== false) {
      const rb2 = boilRng(key, 0x5bd1e995);
      const ph3 = rb2() * 6.28, lam3 = (90 + rb2() * 120) / z, a3 = amp * (1.1 + rb2() * 0.8);
      const ext0 = (3 + rb2() * 7) / z, ext1 = (3 + rb2() * 9) / z;
      const sx2 = (rb2() - 0.5) * amp * 2, sy2 = (rb2() - 0.5) * amp * 2;
      const P2 = [];
      // небольшой «вылет» концов за линию
      const t0 = [P[1][0] - P[0][0], P[1][1] - P[0][1]], l0 = Math.hypot(t0[0], t0[1]) || 1;
      const t1 = [P[n - 1][0] - P[n - 2][0], P[n - 1][1] - P[n - 2][1]], l1 = Math.hypot(t1[0], t1[1]) || 1;
      const head = [P[0][0] - t0[0] / l0 * ext0, P[0][1] - t0[1] / l0 * ext0];
      P2.push([head[0] + sx2, head[1] + sy2, offP[0][2], offP[0][3], -ext0]);
      for (let i = 0; i < n; i++) {
        const q = offP[i], s = q[4];
        const off = a3 * Math.sin((s / lam3) * 6.28 + ph3);
        P2.push([P[i][0] + q[2] * off + sx2, P[i][1] + q[3] * off + sy2, q[2], q[3], s]);
      }
      if (prog >= 0.999) {
        const tail = [P[n - 1][0] + t1[0] / l1 * ext1, P[n - 1][1] + t1[1] / l1 * ext1];
        P2.push([tail[0] + sx2, tail[1] + sy2, offP[n - 1][2], offP[n - 1][3], L + ext1]);
      }
      const ws = w * 0.42;
      ctx.fillStyle = col(role, alpha * 0.38 * (o.dim === undefined ? 1 : o.dim));
      ribbon(ctx, P2, (s) => ws * (0.6 + 0.4 * Math.sin(clamp((s + ext0) / (L + ext0 + ext1)) * Math.PI)), Lvis + (prog >= 0.999 ? ext1 : 0), []);
    }
  }

  // заливка ленты вдоль точек с шириной w(s), до длины Lvis, с разрывами
  function ribbon(ctx, Q, wAt, Lvis, gaps) {
    let left = [], right = [];
    const flush = () => {
      if (left.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(left[0][0], left[0][1]);
        for (let i = 1; i < left.length; i++) ctx.lineTo(left[i][0], left[i][1]);
        for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
        ctx.closePath();
        ctx.fill();
      }
      left = []; right = [];
    };
    for (let i = 0; i < Q.length; i++) {
      const q = Q[i], s = q[4];
      if (s > Lvis) break;
      let inGap = false;
      for (const g of gaps) if (s >= g[0] && s <= g[1]) { inGap = true; break; }
      if (inGap) { flush(); continue; }
      const hw = wAt(s) * 0.5;
      left.push([q[0] + q[2] * hw, q[1] + q[3] * hw]);
      right.push([q[0] - q[2] * hw, q[1] - q[3] * hw]);
    }
    flush();
  }

  // строительная линия голубым карандашом (как в черновике аниматора)
  function guide(ctx, pts, o = {}) {
    stroke(ctx, pts, Object.assign({ color: 'guide', w: 1.5, amp: 1.2, gaps: true, sketch: false, taper: true }, o, {
      alpha: (o.alpha === undefined ? 1 : o.alpha) * 0.55,
    }));
  }

  // ---------------------------------------------------------------------
  // Штриховка: короткие штрихи с разбросом концов
  // ---------------------------------------------------------------------
  function hatch(ctx, poly, o = {}) {
    const alpha = o.alpha === undefined ? 0.5 : o.alpha;
    const prog = o.p === undefined ? 1 : o.p;
    if (alpha <= 0.004 || prog <= 0.001 || !poly || !poly.length) return;
    const z = PEN.z;
    const key = o.key || 'hatch';
    const ang = o.angle === undefined ? -0.85 : o.angle;
    const gap = (o.gap === undefined ? 8 : o.gap) / z;
    const w = (o.w === undefined ? 1.4 : o.w) / z;
    const jit = (o.jitter === undefined ? 5 : o.jitter) / z;
    const maxLen = (o.maxLen === undefined ? 110 : o.maxLen) / z;
    const rb = boilRng(key);
    const ca = Math.cos(-ang), sa = Math.sin(-ang);
    // можно передать несколько контуров: штриховка по правилу чёт-нечет (с дырками)
    const rings = Array.isArray(poly[0][0]) ? poly : [poly];
    const rrs = rings.map((ring) => ring.map(([x, y]) => [x * ca - y * sa, x * sa + y * ca]));
    let minY = Infinity, maxY = -Infinity;
    for (const rp of rrs) for (const p of rp) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
    const lines = [];
    const off = rb() * gap;
    const slant = gap * 0.35;
    for (let y = minY + off; y < maxY; y += gap * (0.85 + rb() * 0.3)) {
      const xs = [];
      for (const rp of rrs) for (let i = 0; i < rp.length; i++) {
        const a = rp[i], b = rp[(i + 1) % rp.length];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        let x0 = xs[k], x1 = xs[k + 1];
        const segs = Math.max(1, Math.ceil((x1 - x0) / maxLen));
        const sl = (x1 - x0) / segs;
        for (let m = 0; m < segs; m++) {
          let a = x0 + m * sl - (m > 0 ? sl * 0.12 : 0), b = x0 + (m + 1) * sl;
          a += (rb() - (m === 0 ? 0.35 : 0.5)) * jit;
          b += (rb() - (m === segs - 1 ? 0.65 : 0.5)) * jit;
          if (b - a < 2 / z) continue;
          lines.push([a, y + (rb() - 0.5) * slant, b, y + (rb() - 0.5) * slant, rb()]);
        }
      }
    }
    const nv = Math.floor(lines.length * prog);
    if (!nv) return;
    ctx.lineCap = 'round';
    ctx.lineWidth = w;
    const groups = [0.7, 0.88, 1.0];
    for (let gi = 0; gi < 3; gi++) {
      ctx.strokeStyle = col(o.color || 'soft', alpha * groups[gi]);
      ctx.beginPath();
      for (let i = 0; i < nv; i++) {
        const l = lines[i];
        if (Math.floor(l[4] * 3) !== gi) continue;
        // обратный поворот
        const x0 = l[0] * ca + l[1] * sa, y0 = -l[0] * sa + l[1] * ca;
        const x1 = l[2] * ca + l[3] * sa, y1 = -l[2] * sa + l[3] * ca;
        ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
      }
      ctx.stroke();
    }
  }

  // маленькое плотное пятно (зрачок, нос, пуговица): штрихи-каракули + контур
  function blob(ctx, cx, cy, rx, ry, o = {}) {
    const key = o.key || 'blob';
    const poly = ellipsePoly(cx, cy, rx, ry, o.rot || 0, 22);
    hatch(ctx, poly, { key: key + ':h1', color: o.color || 'line', alpha: (o.alpha ?? 1) * 0.85, gap: 2.2, w: 1.6, jitter: 1.2, angle: -0.7 });
    hatch(ctx, poly, { key: key + ':h2', color: o.color || 'line', alpha: (o.alpha ?? 1) * 0.6, gap: 2.8, w: 1.4, jitter: 1.2, angle: 0.6 });
    stroke(ctx, ellipsePts(cx, cy, rx, ry, o.rot || 0, key), { key: key + ':o', closed: true, w: 2, color: o.color || 'line', alpha: o.alpha ?? 1, sketch: false, gaps: false, amp: 0.6 });
  }

  // ---------------------------------------------------------------------
  // Рукописный текст (шрифт Caveat), «пишется» слева направо
  // ---------------------------------------------------------------------
  const FONT = '"Caveat", "Caveat Local", "Segoe Print", "Comic Sans MS", cursive';
  function write(ctx, text, x, y, o = {}) {
    const alpha = o.alpha === undefined ? 1 : o.alpha;
    const prog = o.p === undefined ? 1 : o.p;
    if (alpha <= 0.004 || prog <= 0.001) return;
    const z = PEN.z;
    const size = o.size || 64;
    const weight = o.weight || 600;
    const key = o.key || ('txt:' + text);
    const rb = boilRng(key);
    ctx.save();
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.textBaseline = 'alphabetic';
    const tw = ctx.measureText(text).width;
    const align = o.align || 'left';
    const x0 = align === 'center' ? x - tw / 2 : align === 'right' ? x - tw : x;
    const dx = (rb() - 0.5) * 1.6 / z, dy = (rb() - 0.5) * 1.6 / z, rot = (o.rot || 0) + (rb() - 0.5) * 0.006;
    // проявление слева направо
    if (prog < 1) {
      ctx.beginPath();
      ctx.rect(x0 - size, y - size * 1.4, size + (tw + size * 0.3) * prog, size * 2.2);
      ctx.clip();
    }
    ctx.translate(x0 + dx, y + dy);
    ctx.rotate(rot);
    ctx.fillStyle = col(o.color || 'line', alpha * 0.9);
    ctx.fillText(text, 0, 0);
    ctx.fillStyle = col(o.color || 'line', alpha * 0.28);
    ctx.fillText(text, 0.9 / z, -0.6 / z);
    ctx.restore();
    return tw;
  }
  function textWidth(ctx, text, size, weight = 600) {
    ctx.save(); ctx.font = `${weight} ${size}px ${FONT}`; const w = ctx.measureText(text).width; ctx.restore(); return w;
  }

  // ---------------------------------------------------------------------
  // Кадр: слой графита → зерно → на бумагу
  // ---------------------------------------------------------------------
  // RS — внутреннее разрешение (1 = 1920×1080). Плеер снижает его на медленных устройствах.
  function begin(t) {
    PEN.t = t;
    PEN.frame = Math.floor(t * DRAW_FPS + 1e-6) + 1000;
    const RS = PEN.RS || 1;
    const gw = Math.round(W * RS), gh = Math.round(H * RS);
    if (!PEN.L || PEN.L.graphite.canvas.width !== gw) {
      const graphite = makeCanvas(gw, gh).getContext('2d');
      const color = makeCanvas(Math.round(gw * CS), Math.round(gh * CS)).getContext('2d');
      PEN.L = { color, light: color, graphite };
      PEN.layers = [color, graphite];
    }
    for (const c of PEN.layers) {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;
      c.clearRect(0, 0, c.canvas.width, c.canvas.height);
    }
    screen();
    PEN.ink = PEN.L.graphite;
    return PEN.L.graphite;
  }
  const layerScale = (c) => (PEN.RS || 1) * (c === PEN.L.color ? CS : 1);
  function camera(ctx, cam) {
    PEN.z = cam.z;
    PEN.cam = cam;
    PEN.view = [cam.x - (W / 2 + 40) / cam.z, cam.y - (H / 2 + 40) / cam.z, cam.x + (W / 2 + 40) / cam.z, cam.y + (H / 2 + 40) / cam.z];
    for (const c of PEN.layers) {
      const k = layerScale(c);
      c.setTransform(cam.z * k, 0, 0, cam.z * k, (W / 2 - cam.x * cam.z) * k, (H / 2 - cam.y * cam.z) * k);
    }
  }
  function screen() {
    PEN.z = 1;
    PEN.view = [-40, -40, W + 40, H + 40];
    for (const c of PEN.layers) { const k = layerScale(c); c.setTransform(k, 0, 0, k, 0, 0); }
  }
  // зуб бумаги: выкусываем крапинки из слоя
  function grainOut(ctx, tile, alpha, ox, oy) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'destination-out';
    if (!ctx._pat || ctx._patTile !== tile) { ctx._pat = ctx.createPattern(tile, 'repeat'); ctx._patTile = tile; }
    ctx.globalAlpha = alpha;
    ctx.translate(ox, oy);
    ctx.fillStyle = ctx._pat;
    ctx.fillRect(-ox, -oy, ctx.canvas.width, ctx.canvas.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  function compose(main) {
    const L = PEN.L, ink = L.graphite;
    grainOut(L.color, PEN.crayonGrain, 0.88, 0, 0);
    grainOut(ink, PEN.grainCanvas, 0.75, 0, 0);
    const mw = main.canvas.width, mh = main.canvas.height;
    main.setTransform(1, 0, 0, 1, 0, 0);
    main.globalCompositeOperation = 'source-over';
    main.globalAlpha = 1;
    main.imageSmoothingEnabled = true;
    main.imageSmoothingQuality = 'high';
    main.drawImage(PEN.paperCanvas, 0, 0, mw, mh);
    main.drawImage(L.color.canvas, 0, 0, mw, mh);
    main.drawImage(ink.canvas, 0, 0, mw, mh);
  }

  // =====================================================================
  // МЕЛКИ И ОБЪЁМ
  // ---------------------------------------------------------------------
  // Каждая форма знает свою нормаль. Свет — точка в мире (окно, луна,
  // коробка). Тон считается как скалярное произведение нормали и света:
  // светлая сторона — мелок и блики, полутень — второй слой мелка,
  // тень — холодный тёмный мелок и графитная штриховка, у края — рефлекс.
  // =====================================================================

  // крупное зерно мелка: воск не попадает в ямки бумаги
  function makeCrayonGrain() {
    const N = 512;
    const c = makeCanvas(N, N), g = c.getContext('2d');
    const r = rng(hashStr('crayon-grain'));
    const lat = (cells) => { const a = new Float32Array(cells * cells); for (let i = 0; i < a.length; i++) a[i] = r(); return a; };
    const noise = (lt, cells, x, y) => {
      const fx = x / N * cells, fy = y / N * cells, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      const k = (a, b) => lt[((b % cells) + cells) % cells * cells + ((a % cells) + cells) % cells];
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      return lerp(lerp(k(ix, iy), k(ix + 1, iy), sx), lerp(k(ix, iy + 1), k(ix + 1, iy + 1), sx), sy);
    };
    const l1 = lat(256), l2 = lat(96), l3 = lat(24);
    const id = g.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      // волокна бумаги слегка вытянуты по горизонтали
      const n = 0.5 * noise(l1, 256, x * 0.75, y) + 0.3 * noise(l2, 96, x, y) + 0.12 * noise(l3, 24, x, y) + 0.08 * r();
      const a = clamp((n - 0.5) * 3.4);
      const i = (y * N + x) * 4;
      id.data[i + 3] = a * 255;
    }
    g.putImageData(id, 0, 0);
    return c;
  }

  // свет: точка (x, y) в мире и высота z «к зрителю»
  function lightAt(cx, cy) {
    const L = PEN.light || { x: 300, y: 0, z: 900 };
    let lx = L.x - cx, ly = L.y - cy, lz = L.z;
    const d = Math.hypot(lx, ly, lz) || 1;
    return [lx / d, ly / d, lz / d];
  }

  // ---- формы: test(x, y) → нормаль [nx, ny, nz] или null (вне формы)
  function ellShape(cx, cy, rx, ry, rot = 0, flat = 1) {
    const c = Math.cos(rot), s = Math.sin(rot), R = Math.max(rx, ry);
    return {
      cx, cy, x0: cx - R, y0: cy - R, x1: cx + R, y1: cy + R,
      test(x, y) {
        const dx = x - cx, dy = y - cy;
        const u = (dx * c + dy * s) / rx, v = (-dx * s + dy * c) / ry;
        const r2 = u * u + v * v;
        if (r2 > 1) return null;
        const nz = Math.sqrt(1 - r2) * flat, nx = u * c - v * s, ny = u * s + v * c;
        const l = Math.hypot(nx, ny, nz) || 1;
        return [nx / l, ny / l, nz / l];
      },
    };
  }
  // многоугольник как вертикальный цилиндр (платье, ствол) или плоскость (normal).
  // Вогнутые формы (причёска-подкова вокруг лица) красятся по правилу чёт-нечет.
  function polyShape(poly, o = {}) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of poly) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const h = Math.max(1.5, (y1 - y0) / 160);
    const rows = Math.ceil((y1 - y0) / h) + 1;
    const xsRow = new Array(rows);
    for (let r = 0; r < rows; r++) {
      const y = y0 + r * h, xs = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
      }
      if (xs.length >= 2) { xs.sort((p, q) => p - q); xsRow[r] = xs; }
    }
    const n0 = o.normal ? (() => { const l = Math.hypot(...o.normal); return o.normal.map((v) => v / l); })() : null;
    const round = o.round === undefined ? 0.92 : o.round;
    return {
      cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, x0, y0, x1, y1,
      test(x, y) {
        const r = Math.round((y - y0) / h);
        if (r < 0 || r >= rows) return null;
        const xs = xsRow[r];
        if (!xs) return null;
        let inside = false;
        for (let i = 0; i + 1 < xs.length; i += 2) if (x >= xs[i] && x <= xs[i + 1]) { inside = true; break; }
        if (!inside) return null;
        if (n0) return n0;
        const l = xs[0], rr = xs[xs.length - 1];
        const half = (rr - l) / 2 || 1;
        const u = clamp((x - (l + rr) / 2) / half, -1, 1) * round;
        const vy = o.vy ? o.vy((y - y0) / (y1 - y0)) : 0;
        const nz = Math.sqrt(Math.max(0.02, 1 - u * u - vy * vy));
        const len = Math.hypot(u, vy, nz);
        return [u / len, vy / len, nz / len];
      },
    };
  }
  const rectShape = (x0, y0, x1, y1, normal = [0, 0, 1]) => polyShape([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], { normal });
  // «трубка» вдоль ломаной (руки, ноги, ветки)
  function capsuleShape(pts, w0, w1 = w0) {
    const segs = [];
    let total = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-6;
      segs.push({ a, b, len, at: total });
      total += len;
    }
    const wm = Math.max(w0, w1);
    for (const [x, y] of pts) { x0 = Math.min(x0, x - wm); x1 = Math.max(x1, x + wm); y0 = Math.min(y0, y - wm); y1 = Math.max(y1, y + wm); }
    return {
      cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, x0, y0, x1, y1,
      test(x, y) {
        let best = null;
        for (const sg of segs) {
          const dx = sg.b[0] - sg.a[0], dy = sg.b[1] - sg.a[1];
          const t = clamp(((x - sg.a[0]) * dx + (y - sg.a[1]) * dy) / (sg.len * sg.len));
          const px = sg.a[0] + dx * t, py = sg.a[1] + dy * t;
          const d = Math.hypot(x - px, y - py);
          const w = lerp(w0, w1, (sg.at + t * sg.len) / (total || 1));
          const u = d / w;
          if (u <= 1 && (!best || u < best.u)) best = { u, nx: d ? (x - px) / d : 0, ny: d ? (y - py) / d : 0 };
        }
        if (!best) return null;
        const nz = Math.sqrt(1 - best.u * best.u);
        return [best.nx * best.u, best.ny * best.u, nz];
      },
    };
  }

  // ---- широкие штрихи мелка внутри формы, где выполнено условие cond(n, x, y)
  // Неподвижный фон (still) рисуется в мировых единицах и считается один раз.
  const segCache = new Map();
  function buildSegs(shape, o, z, key) {
    const r = o.still ? staticRng(key) : boilRng(key);
    const ang = (o.angle === undefined ? -0.9 : o.angle) + (r() - 0.5) * 0.1;
    const dk = PEN.detail || 1; // детализация: на медленных устройствах штрихи шире и реже
    const gap = (o.gap || 7) * dk / z, w = (o.w || 8) * Math.sqrt(dk) / z, step = (o.step || 5) * dk / z;
    const maxLen = (o.maxLen || 70) / z, jit = (o.jitter === undefined ? 5 : o.jitter) / z;
    const bow = o.bow === undefined ? 0.07 : o.bow;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    let pmin = Infinity, pmax = -Infinity, dmin = Infinity, dmax = -Infinity;
    const vw = PEN.view || [-1e9, -1e9, 1e9, 1e9];
    const bx0 = Math.max(shape.x0, vw[0]), by0 = Math.max(shape.y0, vw[1]), bx1 = Math.min(shape.x1, vw[2]), by1 = Math.min(shape.y1, vw[3]);
    if (bx0 >= bx1 || by0 >= by1) return { segs: [], ca, sa, w };
    for (const [cx, cy] of [[bx0, by0], [bx1, by0], [bx1, by1], [bx0, by1]]) {
      const pp = -sa * cx + ca * cy, dd = ca * cx + sa * cy;
      if (pp < pmin) pmin = pp; if (pp > pmax) pmax = pp; if (dd < dmin) dmin = dd; if (dd > dmax) dmax = dd;
    }
    const segs = [];
    const emit = (off, s0, s1) => {
      const a = s0 + (r() - 0.35) * jit, b = s1 + (r() - 0.65) * jit;
      if (b - a < w * 0.7) { r(); return; }
      segs.push([ca * a - sa * off, sa * a + ca * off, ca * b - sa * off, sa * b + ca * off, r(), (b - a) * bow * (r() < 0.5 ? 1 : -1)]);
    };
    const cond = o.cond;
    for (let off = pmin + r() * gap; off < pmax; off += gap * (0.8 + r() * 0.4)) {
      let run = null;
      const off2 = off + (r() - 0.5) * gap * 0.3;
      for (let s = dmin; s <= dmax + step; s += step) {
        let ok = false;
        if (s <= dmax) {
          const x = ca * s - sa * off2, y = sa * s + ca * off2;
          const n = shape.test(x, y);
          ok = !!n && (!cond || cond(n, x, y));
        }
        if (ok && run === null) run = s;
        else if (run !== null && (!ok || s - run >= maxLen)) {
          emit(off2, run, ok ? s : s - step);
          run = ok ? s : null;
        }
      }
    }
    return { segs, ca, sa, w };
  }
  function crayon(ctx, shape, o = {}) {
    const alpha = o.alpha === undefined ? 0.5 : o.alpha;
    const prog = o.p === undefined ? 1 : o.p;
    if (alpha <= 0.004 || prog <= 0.001 || !shape) return;
    const world = o.world || o.still;
    const z = world ? 1 : PEN.z;
    const key = o.key || 'crayon';
    let rec = null, ck = null;
    if (world && o.still) {
      const lp = PEN.light || {};
      ck = key + '|' + shape.x0.toFixed(1) + ',' + shape.y0.toFixed(1) + ',' + shape.x1.toFixed(1) + ',' + shape.y1.toFixed(1) +
        '|' + (o.cond ? Math.round(lp.x) + ',' + Math.round(lp.y) + ',' + Math.round(lp.z) : '') + '|' + (o.sig || '') + '|' + (PEN.detail || 1);
      rec = segCache.get(ck);
    }
    if (!rec) {
      rec = buildSegs(shape, Object.assign({}, o, { still: !!o.still }), z, key);
      if (ck) { if (segCache.size > 4000) segCache.clear(); segCache.set(ck, rec); }
    }
    const segs = rec.segs, ca = rec.ca, sa = rec.sa, w = rec.w;
    const nv = Math.floor(segs.length * prog);
    if (!nv) return;
    const role = o.color || 'fur';
    ctx.lineCap = 'round';
    const groups = [[0.82, 0.75], [1, 1], [1.15, 0.85]];
    for (let gi = 0; gi < 3; gi++) {
      ctx.lineWidth = w * groups[gi][0];
      ctx.strokeStyle = col(role, alpha * groups[gi][1]);
      ctx.beginPath();
      for (let i = 0; i < nv; i++) {
        const sg = segs[i];
        if (Math.floor(sg[4] * 3) !== gi) continue;
        ctx.moveTo(sg[0], sg[1]);
        if (sg[5]) {
          const mx = (sg[0] + sg[2]) / 2 - sa * sg[5], my = (sg[1] + sg[3]) / 2 + ca * sg[5];
          ctx.quadraticCurveTo(mx, my, sg[2], sg[3]);
        } else ctx.lineTo(sg[2], sg[3]);
      }
      ctx.stroke();
    }
  }

  // тон формы по сетке: считаем свет один раз, все проходы мелка берут из таблицы
  function toneGrid(shape, l, cell) {
    let nx = 0, I = null, NZ = null;
    const rec = { I: 0, nz: 0 };
    const vw = PEN.view || [-1e9, -1e9, 1e9, 1e9];
    const gx0 = Math.max(shape.x0, vw[0]), gy0 = Math.max(shape.y0, vw[1]);
    const build = () => {
      nx = Math.max(1, Math.ceil((Math.min(shape.x1, vw[2]) - gx0) / cell) + 1);
      const ny = Math.max(1, Math.ceil((Math.min(shape.y1, vw[3]) - gy0) / cell) + 1);
      I = new Float32Array(nx * ny).fill(NaN);
      NZ = new Float32Array(nx * ny);
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const n = shape.test(gx0 + (i + 0.5) * cell, gy0 + (j + 0.5) * cell);
        if (!n) continue;
        const k = j * nx + i;
        I[k] = n[0] * l[0] + n[1] * l[1] + n[2] * l[2];
        NZ[k] = n[2];
      }
    };
    return {
      cx: shape.cx, cy: shape.cy, x0: shape.x0, y0: shape.y0, x1: shape.x1, y1: shape.y1,
      test(x, y) {
        if (!I) build();
        const i = Math.floor((x - gx0) / cell), j = Math.floor((y - gy0) / cell);
        if (i < 0 || j < 0 || i >= nx) return null;
        const k = j * nx + i;
        if (k >= I.length) return null;
        const v = I[k];
        if (v !== v) return null;
        rec.I = v; rec.nz = NZ[k];
        return rec;
      },
    };
  }

  // ---- объём: мелок по тону + блики + графитная штриховка в тени
  function volume(shape, o = {}) {
    const a = o.alpha === undefined ? 1 : o.alpha;
    const p = o.p === undefined ? 1 : o.p;
    if (a <= 0.004 || p <= 0.001 || !shape) return;
    const L = PEN.L, k = o.key || 'vol', role = o.color || 'fur';
    const l = o.light || lightAt(shape.cx, shape.cy);
    const st = !!o.still;
    const grid = toneGrid(shape, l, 4.5 / (st ? 1 : PEN.z));
    const sig = st ? l[0].toFixed(2) + ',' + l[1].toFixed(2) + ',' + l[2].toFixed(2) : '';
    const ang = o.angle === undefined ? -0.85 : o.angle;
    const ws = o.w || 1, dens = o.dense === undefined ? 1 : o.dense;
    const sh = o.shadowAt === undefined ? 0.3 : o.shadowAt;
    const C = { still: st, sig, p };
    // 1. основной цвет
    crayon(L.color, grid, Object.assign({}, C, { key: k + ':b', color: role, alpha: 0.5 * a * dens, w: 9 * ws, gap: 6.2 * ws, angle: ang, maxLen: o.maxLen || 70 }));
    // 2. полутень — второй слой того же мелка
    crayon(L.color, grid, Object.assign({}, C, { key: k + ':m', color: role, alpha: 0.42 * a * dens, w: 8 * ws, gap: 6.8 * ws, angle: ang + 0.65, cond: (n) => n.I < sh + 0.32 }));
    // 3. собственная тень — холодный тёмный мелок, у самого края остаётся рефлекс
    crayon(L.color, grid, Object.assign({}, C, { key: k + ':s', color: role + ':sh', alpha: 0.55 * a * (o.shA === undefined ? 1 : o.shA), w: 7 * ws, gap: 5.6 * ws, angle: ang - 0.55, cond: (n) => n.I < sh && n.nz > 0.16 }));
    // 4. графит в самой глубокой тени
    if (!o.noCore) crayon(L.graphite, grid, Object.assign({}, C, { key: k + ':g', color: 'line', alpha: 0.32 * a, w: 1.5, gap: 4.2, angle: ang + 1.15, maxLen: 42, bow: 0.1, cond: (n) => n.I < sh - 0.16 && n.nz > 0.28 }));
    // 5. блик белым мелком
    if (!o.noLight) crayon(L.light, grid, Object.assign({}, C, { key: k + ':h', color: 'light', alpha: 0.85 * a * (o.shine === undefined ? 1 : o.shine), w: 6 * ws, gap: 6.5 * ws, angle: ang + 0.25, maxLen: 30, cond: (n) => n.I > (o.lightAt || 0.86) }));
  }

  // ---- падающая тень на пол: эллипс, отодвинутый от света
  function castShadow(x, y, rx, ry, o = {}) {
    const a = o.alpha === undefined ? 1 : o.alpha;
    if (a <= 0.004) return;
    const l = lightAt(x, y - (o.h || 150));
    const k = o.key || 'cast';
    const dx = -l[0] / Math.max(0.25, l[2]) * rx * 0.35;
    const shp = ellShape(x + clamp(dx, -rx * 0.9, rx * 0.9), y + ry * 0.1, rx * 1.1, ry, 0, 1);
    crayon(PEN.L.color, shp, { key: k + ':1', color: 'shadow', alpha: 0.3 * a, w: 10, gap: 6, angle: -0.12, cond: (n) => n[2] > 0.3, maxLen: 60, still: o.still });
    crayon(PEN.L.color, shp, { key: k + ':2', color: 'shadow', alpha: 0.32 * a, w: 8, gap: 6, angle: 0.3, cond: (n) => n[2] > 0.72, still: o.still });
    crayon(PEN.L.graphite, shp, { key: k + ':3', color: 'line', alpha: 0.2 * a, w: 1.3, gap: 4, angle: 0.75, cond: (n) => n[2] > 0.8, still: o.still });
  }

  const PEN = {
    W, H, DRAW_FPS, VIDEO_FPS, THEMES,
    frame: 0, z: 1, fade: 0, t: 0,
    hashStr, mix, rng, staticRng, boilRng,
    clamp, lerp, seg, ease, easeOut, easeIn, easeInOut, back,
    setTheme, col, rgbOf, mixc, hex2rgb,
    xf, ellipsePts, ellipsePoly, arcPts, curve, polyLen, resample, ik,
    stroke, guide, hatch, blob, write, textWidth, FONT,
    begin, camera, screen, compose, makeCanvas,
    lightAt, ellShape, polyShape, rectShape, capsuleShape, crayon, volume, castShadow,
  };
  global.PEN = PEN;
})(typeof window !== 'undefined' ? window : globalThis);
