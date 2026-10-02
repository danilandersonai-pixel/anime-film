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
  const THEMES = {
    paper: {
      title: 'Старая бумага',
      paper: '#ebe2cd', stain: '#c7b08a', fiber: '#a8936f', grid: null, margin: null,
      line: '#29282d', soft: '#615c60', guide: '#6c9bd6',
      fur: '#b67f3e', a1: '#3a64ad', a2: '#4a8a55', warm: '#e2483a', light: '#fff4d6',
      night: '#2c3346', inkOnDark: false,
    },
    notebook: {
      title: 'Тетрадь',
      paper: '#f6f5ef', stain: '#d9d4c4', fiber: '#c4bfae', grid: '#a8c4e2', margin: '#e48b84',
      line: '#2f3036', soft: '#62626a', guide: '#7aa4d8',
      fur: '#c08d4a', a1: '#2f5fb3', a2: '#2f8f55', warm: '#ef7f2c', light: '#fff7e2',
      night: '#2a3550', inkOnDark: false,
    },
    kraft: {
      title: 'Крафт',
      paper: '#c39f74', stain: '#8f6c45', fiber: '#7a5a38', grid: null, margin: null,
      line: '#33210f', soft: '#5d4329', guide: '#f2ead9',
      fur: '#7c4e22', a1: '#284a8c', a2: '#f6f0e3', warm: '#b72d24', light: '#fff1d2',
      night: '#2a2118', inkOnDark: false,
    },
  };
  // роли, которые выцветают в «прошлом» (до поворота сюжета)
  const FADEABLE = { fur: 1, a1: 1, a2: 1, warm: 1, guide: 0 };

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
  }

  // цвет роли с учётом «выцветания прошлого»
  function rgbOf(role) {
    let c = PEN.rgb[role] || (role[0] === '#' ? hex2rgb(role) : PEN.rgb.line);
    if (PEN.fade > 0 && FADEABLE[role]) {
      const g = lum(c);
      const sepia = mixc([g, g, g], PEN.rgb.stain, 0.45);
      c = mixc(c, mixc(sepia, PEN.rgb.paper, 0.15), PEN.fade * 0.78);
    }
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
  function stroke(ctx, pts, o = {}) {
    const alpha = o.alpha === undefined ? 1 : o.alpha;
    const prog = o.p === undefined ? 1 : o.p;
    if (alpha <= 0.004 || prog <= 0.001 || !pts || pts.length < 2) return;
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
      return w * press * t * (0.86 + 0.14 * Math.sin(s * z / 70 + phP));
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
  function begin(t, ink) {
    PEN.t = t;
    PEN.frame = Math.floor(t * DRAW_FPS + 1e-6) + 1000;
    PEN.ink = ink;
    ink.setTransform(1, 0, 0, 1, 0, 0);
    ink.globalCompositeOperation = 'source-over';
    ink.globalAlpha = 1;
    ink.clearRect(0, 0, W, H);
  }
  function camera(ctx, cam) {
    PEN.z = cam.z;
    PEN.cam = cam;
    ctx.setTransform(cam.z, 0, 0, cam.z, W / 2 - cam.x * cam.z, H / 2 - cam.y * cam.z);
  }
  function screen(ctx) {
    PEN.z = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  function compose(main, ink) {
    // зуб бумаги: выкусываем крапинки из графита
    ink.setTransform(1, 0, 0, 1, 0, 0);
    ink.globalCompositeOperation = 'destination-out';
    if (!PEN.grainPattern || PEN.grainPatternCtx !== ink) {
      PEN.grainPattern = ink.createPattern(PEN.grainCanvas, 'repeat');
      PEN.grainPatternCtx = ink;
    }
    ink.globalAlpha = 0.75;
    ink.fillStyle = PEN.grainPattern;
    ink.fillRect(0, 0, W, H);
    ink.globalAlpha = 1;
    ink.globalCompositeOperation = 'source-over';
    main.setTransform(1, 0, 0, 1, 0, 0);
    main.globalCompositeOperation = 'source-over';
    main.globalAlpha = 1;
    main.drawImage(PEN.paperCanvas, 0, 0);
    main.drawImage(ink.canvas, 0, 0);
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
  };
  global.PEN = PEN;
})(typeof window !== 'undefined' ? window : globalThis);
