/* =========================================================================
   space.js — 3D-пространство для карандаша и мелка
   -------------------------------------------------------------------------
   Сцена живёт в 3D (сантиметры; x — вправо, y — вверх, z — к зрителю),
   камера с перспективой проецирует объёмы на бумагу, а рисует их движок
   pencil.js: контур карандашом, объём мелком. Порядок — от дальнего к
   ближнему (алгоритм художника), ближний объект «стирает» то, что за ним.
   ========================================================================= */
(function (global) {
  'use strict';
  const P = global.PEN;
  const { W, H, clamp, lerp } = P;

  // ---------------------------------------------------------------------
  // Векторы и ориентация
  // ---------------------------------------------------------------------
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const madd = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  // поворот вектора v вокруг оси k (единичной) на угол a
  function rot(v, k, a) {
    const c = Math.cos(a), s = Math.sin(a);
    return add(add(mul(v, c), mul(cross(k, v), s)), mul(k, dot(k, v) * (1 - c)));
  }
  // ориентация: yaw — поворот вокруг вертикали (0 — лицом к +z), pitch — наклон вперёд, roll — набок
  function frame(yaw = 0, pitch = 0, roll = 0) {
    let f = [Math.sin(yaw), 0, Math.cos(yaw)], r = [Math.cos(yaw), 0, -Math.sin(yaw)], u = [0, 1, 0];
    if (pitch) { const c = Math.cos(pitch), s = Math.sin(pitch); const u2 = add(mul(u, c), mul(f, s)); f = sub(mul(f, c), mul(u, s)); u = u2; }
    if (roll) { const c = Math.cos(roll), s = Math.sin(roll); const u2 = add(mul(u, c), mul(r, -s)); r = add(mul(r, c), mul(u, s)); u = u2; }
    return { r, u, f };
  }
  // точка в локальной системе: o + r·x + u·y + f·z
  const at = (o, fr, x, y, z) => [o[0] + fr.r[0] * x + fr.u[0] * y + fr.f[0] * z, o[1] + fr.r[1] * x + fr.u[1] * y + fr.f[1] * z, o[2] + fr.r[2] * x + fr.u[2] * y + fr.f[2] * z];
  const dirIn = (fr, x, y, z) => [fr.r[0] * x + fr.u[0] * y + fr.f[0] * z, fr.r[1] * x + fr.u[1] * y + fr.f[1] * z, fr.r[2] * x + fr.u[2] * y + fr.f[2] * z];

  // ---------------------------------------------------------------------
  // Камера
  // ---------------------------------------------------------------------
  const CAM = { pos: [0, 120, 400], r: [1, 0, 0], u: [0, 1, 0], f: [0, 0, -1], fl: 1000, near: 3 };
  function setCamera(c) {
    const f = norm(sub(c.target, c.pos));
    let r = norm(cross(f, [0, 1, 0]));
    if (!isFinite(r[0]) || len(cross(f, [0, 1, 0])) < 1e-4) r = [1, 0, 0];
    let u = cross(r, f);
    if (c.roll) { r = rot(r, f, c.roll); u = rot(u, f, c.roll); }
    CAM.pos = c.pos; CAM.r = r; CAM.u = u; CAM.f = f;
    CAM.fl = (H / 2) / Math.tan(((c.fov || 40) * Math.PI / 180) / 2);
    CAM.near = c.near || 3;
  }
  function toCam(p) { const d = sub(p, CAM.pos); return [dot(d, CAM.r), dot(d, CAM.u), dot(d, CAM.f)]; }
  function projC(c) { const k = CAM.fl / c[2]; return [W / 2 + c[0] * k, H / 2 - c[1] * k, c[2], k]; }
  function proj(p) { const c = toCam(p); return c[2] < CAM.near ? null : projC(c); }
  const depth = (p) => toCam(p)[2];
  // нормаль в экранных координатах (x — вправо, y — вниз, z — к зрителю)
  const nS = (n) => [dot(n, CAM.r), -dot(n, CAM.u), -dot(n, CAM.f)];
  const toViewer = (p) => norm(sub(CAM.pos, p));

  // свет: точка в мире; освещённость считается в экранных координатах
  const LIGHT = { pos: [0, 300, 300] };
  function lightS(pt) { return nS(norm(LIGHT.dir ? LIGHT.dir : sub(LIGHT.pos, pt))); }

  // отсечение многоугольника ближней плоскостью камеры
  function clipNear(cs, closed = true) {
    const out = [], n = cs.length, near = CAM.near;
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const a = cs[i], b = cs[(i + 1) % n];
      const ina = a[2] >= near, inb = b[2] >= near;
      if (ina) out.push(a);
      if (ina !== inb) { const t = (near - a[2]) / (b[2] - a[2]); out.push(lerp3(a, b, t)); }
    }
    if (!closed && cs[n - 1][2] >= near) out.push(cs[n - 1]);
    return out;
  }
  function projPoly(pts) { return clipNear(pts.map(toCam)).map((c) => projC(c)); }
  // ломаная → видимые куски
  function projLine(pts) {
    const cs = pts.map(toCam), parts = [];
    let cur = [];
    for (let i = 0; i < cs.length; i++) {
      const a = cs[i];
      if (a[2] >= CAM.near) cur.push(projC(a));
      if (i + 1 < cs.length) {
        const b = cs[i + 1];
        const ina = a[2] >= CAM.near, inb = b[2] >= CAM.near;
        if (ina !== inb) {
          const t = (CAM.near - a[2]) / (b[2] - a[2]);
          const m = projC(lerp3(a, b, t));
          cur.push(m);
          if (!inb) { if (cur.length > 1) parts.push(cur); cur = []; } else cur = [m];
        }
      }
    }
    if (cur.length > 1) parts.push(cur);
    return parts;
  }

  // якобиан проекции в точке c: как смещение в мире переходит в смещение на экране
  function jac(c) {
    const cc = toCam(c), Z = cc[2], k = CAM.fl / Z;
    const jx = mul(sub(CAM.r, mul(CAM.f, cc[0] / Z)), k);
    const jy = mul(sub(CAM.u, mul(CAM.f, cc[1] / Z)), -k);
    return { jx, jy, Z, k };
  }
  // проекция эллипсоида (центр и три оси-вектора с длинами) → экранный эллипс
  function projEll(c, ax) {
    const pc = proj(c);
    if (!pc) return null;
    const J = jac(c);
    let sxx = 0, sxy = 0, syy = 0;
    for (const a of ax) { const x = dot(J.jx, a), y = dot(J.jy, a); sxx += x * x; sxy += x * y; syy += y * y; }
    const tr = sxx + syy, det = sxx * syy - sxy * sxy, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
    const l1 = tr / 2 + disc, l2 = Math.max(1e-6, tr / 2 - disc);
    return { cx: pc[0], cy: pc[1], rx: Math.sqrt(l1), ry: Math.sqrt(l2), rot: 0.5 * Math.atan2(2 * sxy, sxx - syy), depth: pc[2], k: pc[3] };
  }
  // полуширина сечения (эллипс с осями aR и bF) поперёк направления t на экране
  function sectionHalf(c, aR, bF, t) {
    const J = jac(c), n = [-t[1], t[0]];
    const ra = [dot(J.jx, aR), dot(J.jy, aR)], rb = [dot(J.jx, bF), dot(J.jy, bF)];
    return Math.hypot(n[0] * ra[0] + n[1] * ra[1], n[0] * rb[0] + n[1] * rb[1]);
  }

  // ---------------------------------------------------------------------
  // Порядок рисования: от дальнего к ближнему
  // ---------------------------------------------------------------------
  const LIST = [];
  const push = (d, fn) => LIST.push([d, fn]);
  function flush() { LIST.sort((a, b) => b[0] - a[0]); for (const it of LIST) it[1](); LIST.length = 0; }

  // стирание позади объекта на всех слоях
  function signedArea(p) { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
  function knock(polys, a) {
    if (a <= 0.004) return;
    for (const ctx of P.layers) {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = `rgba(0,0,0,${clamp(a)})`;
      ctx.beginPath();
      for (let p of polys) {
        if (!p || p.length < 3) continue;
        if (signedArea(p) < 0) p = p.slice().reverse();
        ctx.moveTo(p[0][0], p[0][1]);
        for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
        ctx.closePath();
      }
      ctx.fill('nonzero');
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------------
  // 2D-формы для рисования
  // ---------------------------------------------------------------------
  function ellPts(e, n = 0, key = '') {
    return P.ellipsePts(e.cx, e.cy, e.rx, e.ry, e.rot, key, n);
  }
  function ellPoly(e, n = 32) { return P.ellipsePoly(e.cx, e.cy, e.rx, e.ry, e.rot, n); }
  // трубка с разной толщиной в каждой точке (руки, ноги, туловище)
  function tubeShape(pts, ws) {
    const segs = [];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      const [x, y] = pts[i], w = ws[i];
      x0 = Math.min(x0, x - w); x1 = Math.max(x1, x + w); y0 = Math.min(y0, y - w); y1 = Math.max(y1, y + w);
      if (i + 1 < pts.length) {
        const b = pts[i + 1];
        segs.push({ a: pts[i], b, len: Math.hypot(b[0] - x, b[1] - y) || 1e-6, w0: w, w1: ws[i + 1] });
      }
    }
    return {
      cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, x0, y0, x1, y1,
      test(x, y) {
        let best = null;
        for (const sg of segs) {
          const dx = sg.b[0] - sg.a[0], dy = sg.b[1] - sg.a[1];
          const t = clamp(((x - sg.a[0]) * dx + (y - sg.a[1]) * dy) / (sg.len * sg.len));
          const px = sg.a[0] + dx * t, py = sg.a[1] + dy * t;
          const d = Math.hypot(x - px, y - py);
          const u = d / Math.max(0.5, lerp(sg.w0, sg.w1, t));
          if (u <= 1 && (!best || u < best.u)) best = { u, nx: d ? (x - px) / d : 0, ny: d ? (y - py) / d : 0 };
        }
        if (!best) return null;
        return [best.nx * best.u, best.ny * best.u, Math.sqrt(1 - best.u * best.u)];
      },
    };
  }
  // контур трубки: левая и правая стороны и закруглённые концы
  function tubeOutline(pts, ws, capA = true, capB = true) {
    const n = pts.length, L = [], R = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1];
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      L.push([pts[i][0] - ty * ws[i], pts[i][1] + tx * ws[i]]);
      R.push([pts[i][0] + ty * ws[i], pts[i][1] - tx * ws[i]]);
    }
    const cap = (c, w, from, to) => { const out = []; for (let k = 1; k < 8; k++) { const a = lerp(from, to, k / 8); out.push([c[0] + Math.cos(a) * w, c[1] + Math.sin(a) * w]); } return out; };
    const t0 = Math.atan2(pts[Math.min(1, n - 1)][1] - pts[0][1], pts[Math.min(1, n - 1)][0] - pts[0][0]);
    const t1 = Math.atan2(pts[n - 1][1] - pts[Math.max(0, n - 2)][1], pts[n - 1][0] - pts[Math.max(0, n - 2)][0]);
    const endCap = capB ? cap(pts[n - 1], ws[n - 1], t1 + Math.PI / 2, t1 - Math.PI / 2) : [];
    const startCap = capA ? cap(pts[0], ws[0], t0 - Math.PI / 2, t0 - Math.PI * 1.5) : [];
    const poly = L.concat(endCap, R.slice().reverse(), startCap);
    return { L, R, endCap, startCap, poly };
  }
  // объединение нескольких эллипсов в один контур (голова = череп + челюсть)
  function unionOutline(es, n = 40) {
    const pts = [];
    let cx = 0, cy = 0;
    es.forEach((e) => { cx += e.cx; cy += e.cy; });
    cx /= es.length; cy /= es.length;
    const inside = (e, x, y) => { const c = Math.cos(e.rot), s = Math.sin(e.rot), dx = x - e.cx, dy = y - e.cy; const u = (dx * c + dy * s) / e.rx, v = (-dx * s + dy * c) / e.ry; return u * u + v * v < 0.985; };
    es.forEach((e, i) => {
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2, c = Math.cos(e.rot), s = Math.sin(e.rot);
        const x = e.cx + Math.cos(a) * e.rx * c - Math.sin(a) * e.ry * s, y = e.cy + Math.cos(a) * e.rx * s + Math.sin(a) * e.ry * c;
        if (es.every((o, j) => j === i || !inside(o, x, y))) pts.push([x, y, Math.atan2(y - cy, x - cx)]);
      }
    });
    pts.sort((p, q) => p[2] - q[2]);
    return pts.map((p) => [p[0], p[1]]);
  }

  // вес линии по свету: теневая сторона толще, освещённая тоньше.
  // Наружная нормаль смотрит от центра формы (cen) или от оси трубки (axis).
  function weightFn(pts, l, closed = true, cen = null, axis = null) {
    const n = pts.length;
    if (n < 2) return () => 1;
    if (!cen) { cen = [0, 0]; pts.forEach((p) => { cen[0] += p[0] / n; cen[1] += p[1] / n; }); }
    const lx = l[0], ly = l[1], ll = Math.hypot(lx, ly) || 1;
    const w = pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let nx = b[1] - a[1], ny = -(b[0] - a[0]);
      const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
      let ref = cen;
      if (axis) { // ближайшая точка оси
        let bd = Infinity;
        for (const q of axis) { const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2; if (d < bd) { bd = d; ref = q; } }
      }
      if (nx * (p[0] - ref[0]) + ny * (p[1] - ref[1]) < 0) { nx = -nx; ny = -ny; }
      return 1 + 0.75 * clamp(-(nx * lx + ny * ly) / ll, -0.45, 1);
    });
    return (u) => { const f = clamp(u) * (closed ? n : n - 1); const i = Math.min(n - 1, Math.floor(f)); return lerp(w[i], w[(i + 1) % n], f - Math.floor(f)); };
  }

  // ---------------------------------------------------------------------
  // Объекты в 3D
  // ---------------------------------------------------------------------
  // эллипсоид: c — центр, fr — ориентация, r — радиусы [x, y, z]
  function ellAxes(fr, r) { return [mul(fr.r, r[0]), mul(fr.u, r[1]), mul(fr.f, r[2])]; }
  function drawEll(key, c, fr, r, o = {}) {
    const e = projEll(c, ellAxes(fr, r));
    if (!e || e.rx < 0.4) return null;
    const al = o.alpha === undefined ? 1 : o.alpha, p = o.p === undefined ? 1 : o.p;
    if (al <= 0.004) return e;
    const l = o.light || lightS(c);
    if (o.knock !== false) knock([ellPoly(e)], al * clamp(p * 3));
    if (o.color) P.volume(P.ellShape(e.cx, e.cy, e.rx, e.ry, e.rot, o.flat || 1), Object.assign({ key: key + ':v', color: o.color, alpha: al, p: p * (o.fill === undefined ? 1 : o.fill), light: l, w: o.ws || 0.8 }, o.shade || {}));
    if (o.line !== false) {
      const pts = ellPts(e, 0, key);
      P.stroke(P.L.graphite, pts, { key: key + ':o', closed: true, w: (o.lw || 2.2), alpha: al * (o.la === undefined ? 1 : o.la), p, wAt: weightFn(pts, l, true, [e.cx, e.cy]), color: o.lc || 'line' });
    }
    return e;
  }
  // трубка вдоль 3D-точек с радиусами
  function projTube(pts3, radii) {
    const pts = [], ws = [];
    for (let i = 0; i < pts3.length; i++) { const q = proj(pts3[i]); if (q) { pts.push([q[0], q[1]]); ws.push(Math.max(0.6, radii[i] * q[3])); } }
    return pts.length >= 2 ? { pts, ws } : null;
  }
  function drawTube(key, pts3, radii, o = {}) {
    const t = o.proj || projTube(pts3, radii);
    if (!t) return null;
    const al = o.alpha === undefined ? 1 : o.alpha, p = o.p === undefined ? 1 : o.p;
    if (al <= 0.004) return t;
    const l = o.light || lightS(pts3[Math.floor(pts3.length / 2)]);
    const ol = tubeOutline(t.pts, t.ws, o.capA !== false, o.capB !== false);
    if (o.knock !== false) knock([ol.poly], al * clamp(p * 3));
    if (o.color) P.volume(tubeShape(t.pts, t.ws), Object.assign({ key: key + ':v', color: o.color, alpha: al, p: p * (o.fill === undefined ? 1 : o.fill), light: l, w: o.ws || 0.7 }, o.shade || {}));
    if (o.line !== false) {
      const lw = o.lw || 2.2;
      const side = (pts, k) => P.stroke(P.L.graphite, pts, { key: key + k, w: lw, alpha: al, p, wAt: weightFn(pts, l, false, null, t.pts), color: o.lc || 'line' });
      side(ol.L.concat(ol.endCap), ':l');
      side(ol.R, ':r');
      if (ol.startCap.length && o.capLineA !== false) side(ol.startCap, ':c');
    }
    t.outline = ol;
    return t;
  }
  // плоский многоугольник в 3D (стены, пол, коробка, рамы)
  function drawPoly(key, pts3, o = {}) {
    const pp = projPoly(pts3);
    if (pp.length < 3) return null;
    const poly = pp.map((q) => [q[0], q[1]]);
    const al = o.alpha === undefined ? 1 : o.alpha, p = o.p === undefined ? 1 : o.p;
    if (al <= 0.004) return poly;
    const n = o.normal || norm(cross(sub(pts3[1], pts3[0]), sub(pts3[2], pts3[0])));
    const cen = pts3.reduce((a, b) => add(a, b), [0, 0, 0]).map((v) => v / pts3.length);
    const ns = nS(n);
    const l = o.light || lightS(cen);
    if (o.knock !== false) knock([poly], al * clamp(p * 3));
    if (o.color) {
      if (o.crayon) P.crayon(P.L.color, P.polyShape(poly), Object.assign({ key: key + ':c', color: o.color, alpha: al * 0.5, p, still: true }, o.crayon));
      else P.volume(P.polyShape(poly, { normal: ns[2] < 0 ? ns.map((v) => -v) : ns }), Object.assign({ key: key + ':v', color: o.color, alpha: al, p, light: l, still: o.still !== false, w: o.ws || 0.9 }, o.shade || {}));
    }
    if (o.line) P.stroke(P.L.graphite, poly, { key: key + ':o', closed: true, w: o.lw || 2, alpha: al * (o.la || 1), p, color: o.lc || 'line' });
    return poly;
  }
  function line(key, pts3, o = {}) {
    const parts = projLine(pts3);
    parts.forEach((pts, i) => P.stroke(o.ctx || P.L.graphite, pts.map((q) => [q[0], q[1]]), Object.assign({ key: key + ':' + i, w: 2 }, o)));
    return parts;
  }
  // окружность/эллипс в 3D: центр, оси aR и bF
  function ring(c, aR, bF, n = 36) {
    const out = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; out.push(add(add(c, mul(aR, Math.cos(a))), mul(bF, Math.sin(a)))); }
    return out;
  }

  // ---------------------------------------------------------------------
  // Тень на полу: эллипс, отодвинутый от света
  // ---------------------------------------------------------------------
  function floorShadow(key, c, rx, rz, hgt, o = {}) {
    const al = o.alpha === undefined ? 1 : o.alpha;
    if (al <= 0.004) return;
    const L = LIGHT.dir ? mul(LIGHT.dir, -1) : sub(c, LIGHT.pos);
    const horiz = norm([L[0], 0, L[2]]);
    const slope = Math.min(1.6, Math.hypot(L[0], L[2]) / Math.max(30, Math.abs(L[1])));
    const off = hgt * 0.45 * slope;
    const cc = [c[0] + horiz[0] * off, (o.y || 0) + 0.4, c[2] + horiz[2] * off];
    const ext = 1 + slope * hgt / Math.max(rx, rz) * 0.25;
    const a = mul(horiz, Math.max(rx, rz) * ext), b = mul(norm(cross([0, 1, 0], horiz)), Math.min(rx, rz) * 1.1);
    const pp = projPoly(ring(cc, a, b, 28));
    if (pp.length < 3) return;
    const poly = pp.map((q) => [q[0], q[1]]);
    const sh = P.polyShape(poly, { round: 1 });
    P.crayon(P.L.color, sh, { key: key + ':1', color: 'shadow', alpha: 0.28 * al, w: 10, gap: 6, angle: -0.1, maxLen: 60, cond: (n) => n[2] > 0.25 });
    P.crayon(P.L.color, sh, { key: key + ':2', color: 'shadow', alpha: 0.3 * al, w: 8, gap: 6, angle: 0.35, cond: (n) => n[2] > 0.7 });
    P.crayon(P.L.graphite, sh, { key: key + ':3', color: 'line', alpha: 0.18 * al, w: 1.2, gap: 4, angle: 0.8, cond: (n) => n[2] > 0.8 });
  }

  // луч из камеры через точку экрана (в мировых координатах)
  function ray(x, y) {
    const dx = (x - W / 2) / CAM.fl, dy = -(y - H / 2) / CAM.fl;
    return [CAM.r[0] * dx + CAM.u[0] * dy + CAM.f[0], CAM.r[1] * dx + CAM.u[1] * dy + CAM.f[1], CAM.r[2] * dx + CAM.u[2] * dy + CAM.f[2]];
  }
  // пересечение луча с эллипсоидом E = {c, fr, r}: ближняя точка на единичной сфере в локальных координатах
  function hitEll(E, d) {
    const oc = sub(CAM.pos, E.c);
    const o = [dot(oc, E.fr.r) / E.r[0], dot(oc, E.fr.u) / E.r[1], dot(oc, E.fr.f) / E.r[2]];
    const v = [dot(d, E.fr.r) / E.r[0], dot(d, E.fr.u) / E.r[1], dot(d, E.fr.f) / E.r[2]];
    const A = dot(v, v), Bq = 2 * dot(o, v), Cq = dot(o, o) - 1;
    const disc = Bq * Bq - 4 * A * Cq;
    if (disc < 0) return null;
    const t = (-Bq - Math.sqrt(disc)) / (2 * A);
    if (t <= 0) return null;
    return [o[0] + v[0] * t, o[1] + v[1] * t, o[2] + v[2] * t];
  }
  // стирание по форме (заливка ячейками сетки) — для форм без готового контура
  function knockShape(shape, a, cell = 4) {
    if (a <= 0.004) return;
    const vw = P.view || [-1e9, -1e9, 1e9, 1e9];
    const x0 = Math.max(shape.x0, vw[0]), y0 = Math.max(shape.y0, vw[1]), x1 = Math.min(shape.x1, vw[2]), y1 = Math.min(shape.y1, vw[3]);
    if (x0 >= x1 || y0 >= y1) return;
    for (const ctx of P.layers) {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = `rgba(0,0,0,${clamp(a)})`;
      ctx.beginPath();
      for (let y = y0; y < y1; y += cell) {
        let run = null;
        for (let x = x0; x <= x1 + cell; x += cell) {
          const ok = x <= x1 && shape.test(x + cell / 2, y + cell / 2);
          if (ok && run === null) run = x;
          if (!ok && run !== null) { ctx.rect(run - 0.6, y - 0.6, x - run + 1.2, cell + 1.2); run = null; }
        }
      }
      ctx.fill();
      ctx.restore();
    }
  }

  // выпуклая оболочка точек (монотонная цепочка)
  function hull(pts) {
    const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (p.length < 3) return p;
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    up.pop(); lo.pop();
    return lo.concat(up);
  }
  // точки кольца-сечения на экране
  function ringScreen(c, aR, bF, n = 20) { return ring(c, aR, bF, n).map((q) => proj(q)).filter(Boolean).map((q) => [q[0], q[1]]); }

  // угол, под которым на экране идёт 3D-направление d из точки p (для штрихов по доскам пола)
  function screenAngle(p, d) {
    const a = proj(p), b = proj(madd(p, d, 20));
    return a && b ? Math.atan2(b[1] - a[1], b[0] - a[0]) : 0;
  }

  global.SPACE = {
    screenAngle, hull, ringScreen, ray, hitEll, knockShape,
    add, sub, mul, madd, dot, cross, len, norm, lerp3, rot, frame, at, dirIn,
    CAM, setCamera, toCam, proj, projC, depth, nS, toViewer, LIGHT, lightS,
    clipNear, projPoly, projLine, jac, projEll, sectionHalf,
    push, flush, knock, ellPts, ellPoly, tubeShape, tubeOutline, unionOutline, weightFn,
    ellAxes, drawEll, projTube, drawTube, drawPoly, line, ring, floorShadow,
  };
})(typeof window !== 'undefined' ? window : globalThis);
