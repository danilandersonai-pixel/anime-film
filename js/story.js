/* =========================================================================
   story.js — «Мишка»: персонажи, реквизит и сцены по раскадровке
   -------------------------------------------------------------------------
   Всё считается от времени t: renderFrame(t) всегда даёт один и тот же кадр.
   Время каждого события — константа в объекте T, звук берёт те же константы.
   ========================================================================= */
(function (global) {
  'use strict';
  const P = global.PEN;
  const { W, H, clamp, lerp, seg, ease, easeOut, easeInOut, back, stroke, guide, hatch, blob, write,
    ellipsePts, ellipsePoly, arcPts, curve, ik, xf } = P;

  // ===== ПАЛИТРА ОДНОЙ СТРОКОЙ: 'paper' | 'notebook' | 'kraft' =====
  const THEME = 'paper';

  const GROUND = 930;   // линия пола
  const PXCM = 3.0;     // пикселей на сантиметр роста
  const BS = 0.62;      // масштаб мишки в комнате
  const CUT = 1.6;      // размер мишки на экране в момент склейки сцен
  const DOOR_X = 1565;  // где стоят у косяка, когда меряют рост

  // ---------------------------------------------------------------------
  // РАСКАДРОВКА: время каждого события (секунды)
  // ---------------------------------------------------------------------
  const T = {
    END: 58,
    // 0. Титул
    bearDraw: [-0.9, 1.9], fur0: [1.4, 2.6], title: [1.9, 2.9], sub: [2.7, 3.6], titleOut: [3.6, 4.2],
    // 1. 1956 — Аня
    pull1: [3.8, 5.6], floor1: [4.0, 5.2], tree: [4.2, 5.8], window1: [4.6, 5.9], door1: [5.0, 5.9],
    year1: 5.4, anyaIn: [5.8, 6.6], anyaWalk: [6.6, 7.3], reach1: [7.1, 7.4], hug1: [7.4, 8.0], name1: 7.8,
    treeOut: [8.2, 8.7], walkDoor1: [8.2, 8.8], grow1: [8.8, 12.0], button: [10.0, 10.4], exit1: [12.0, 13.4],
    // 2. 1979 — Лена
    s2: 13.4, pull2: [13.4, 14.8], room2: [13.6, 14.9], lenaIn: [13.8, 14.8], year2: 14.2, label2: 14.6,
    give2: [15.0, 15.8], name2: 15.6, zoomIn2: [15.9, 16.3], patch: [16.2, 16.9], zoomOut2: [16.9, 17.3],
    anyaOut2: [17.0, 17.5], walkDoor2: [17.2, 17.7], grow2: [17.7, 19.3], box2: [19.3, 19.7],
    intoBox: [19.7, 20.2], lidClose: [20.2, 20.45], exit2: [20.3, 21.0],
    // 3. Чердак, поворот
    s3: 21.0, pull3: [21.0, 22.0], attic: [21.0, 22.2], years3: [21.6, 23.6], crack: [23.4, 24.0],
    TURN: 24.0, rise: [24.0, 24.6],
    // 4. 2003 — Катя
    s4: 24.6, pull4: [24.6, 26.0], room4: [24.8, 26.0], year4: 25.0, puff: [24.8, 25.8], hug4: [26.0, 26.6],
    name4: 26.4, granIn: [26.6, 27.4], label4: 27.2, scarf: [27.6, 29.0], granOut: [29.4, 29.9],
    walkDoor4: [29.4, 30.2], grow4: [30.2, 33.6], exit4: [34.4, 36.0],
    // 5. 2026 — Соня
    s5: 36.0, pull5: [36.0, 37.6], room5: [36.2, 37.4], soniaIn: [36.4, 37.4], family5: [36.6, 38.0],
    year5: 37.0, labels5: 37.8, give5: [38.2, 39.0], name5: 39.0, warm: [39.0, 41.0], clip: [41.4, 42.4],
    push5: [42.4, 45.4], erase5: [45.0, 46.4], toPoster: [46.4, 48.4],
    // 6. Постер
    s6: 48.4, notes: [48.8, 49.8, 50.8, 51.8], title6: [52.0, 53.0], years6: [52.7, 53.5],
    names6: [53.3, 54.1], moral: [54.0, 55.0], still: 55.0,
  };

  // ---------------------------------------------------------------------
  // Семья
  // ---------------------------------------------------------------------
  const SPEC = {
    anya: { hairKid: 'pigtails', hairAdult: 'bun', hairColor: 'line', hairAlpha: 0.55, dress: 'a1', pattern: 'dots', hk: 1.0 },
    anya52: { hairKid: 'bun', hairAdult: 'bun', hairColor: 'soft', hairAlpha: 0.42, dress: 'a1', pattern: 'cardigan', glasses: true, long: true, hk: 1.0 },
    anya75: { hairKid: 'bun', hairAdult: 'bun', hairColor: 'soft', hairAlpha: 0.16, dress: 'a1', pattern: 'cardigan', glasses: true, long: true, old: true },
    lena: { hairKid: 'bob', hairAdult: 'bob', hairColor: 'soft', hairAlpha: 0.6, dress: 'a2', pattern: 'stripes', hk: 1.035 },
    lena51: { hairKid: 'bob', hairAdult: 'bob', hairColor: 'soft', hairAlpha: 0.35, dress: 'a2', pattern: 'cardigan', long: true, hk: 1.035 },
    katya: { hairKid: 'ponytail', hairAdult: 'ponytail', hairColor: 'fur', hairAlpha: 0.7, dress: 'fur', pattern: 'zigzag', hk: 0.975 },
    sonia: { hairKid: 'sprout', hairAdult: 'sprout', hairColor: 'fur', hairAlpha: 0.5, dress: 'warm', pattern: 'collar' },
  };
  // отметки роста на косяке: у каждого поколения свой карандаш
  const GENS = {
    anya: { name: 'Аня', born: 1951, color: 'line', ages: [5, 8, 11, 13, 20], from: 5, to: 20, grow: T.grow1, spec: SPEC.anya, nameX: 1336 },
    lena: { name: 'Лена', born: 1975, color: 'a1', ages: [4, 7, 10, 13, 17], from: 4, to: 17, grow: T.grow2, spec: SPEC.lena, nameX: 1246 },
    katya: { name: 'Катя', born: 1996, color: 'a2', ages: [7, 9, 11, 13, 25], from: 7, to: 25, grow: T.grow4, spec: SPEC.katya, nameX: 1156 },
  };

  // ---------------------------------------------------------------------
  // Помощники
  // ---------------------------------------------------------------------
  function tab(arr, x) {
    if (x <= arr[0][0]) return arr[0][1];
    for (let i = 1; i < arr.length; i++) if (x <= arr[i][0]) {
      const [x0, y0] = arr[i - 1], [x1, y1] = arr[i];
      return lerp(y0, y1, (x - x0) / (x1 - x0));
    }
    return arr[arr.length - 1][1];
  }
  function plural(n, one, few, many) {
    const n10 = n % 10, n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return one;
    if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
    return many;
  }
  const ageText = (n) => `${n} ${plural(n, 'год', 'года', 'лет')}`;

  const GHOST = 0.08;
  // ластик: 1 → бледный призрак линий → 0
  function erase(t, a, b) {
    if (t <= a) return 1;
    if (t <= b) return lerp(1, GHOST, ease(seg(t, a, b)));
    return GHOST * (1 - seg(t, b, b + 1.2));
  }
  function signedArea(p) { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
  // «стираем» то, что нарисовано позади объекта (объект не прозрачный)
  function knock(ctx, polys, a) {
    if (a <= 0.004) return;
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
  // контур «рукава»/«ноги» вокруг ломаной
  function limbPoly(pts, w0, w1) {
    const n = pts.length, L = [], Rr = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1];
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const w = lerp(w0, w1, i / (n - 1));
      L.push([pts[i][0] - ty * w, pts[i][1] + tx * w]);
      Rr.push([pts[i][0] + ty * w, pts[i][1] - tx * w]);
    }
    return L.concat(Rr.reverse());
  }
  const CAM0 = { x: W / 2, y: H / 2, z: 1 };
  function camLerp(a, b, k) {
    return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), z: Math.exp(lerp(Math.log(a.z), Math.log(b.z), k)) };
  }
  const focus = (c, s, scr = CUT) => ({ x: c[0], y: c[1], z: scr / s });
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const lerp2 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
  // перелёт по дуге
  const arc2 = (a, b, k, hgt) => { const p = lerp2(a, b, k); p[1] -= Math.sin(k * Math.PI) * hgt; return p; };

  // время, когда при росте исполнится age (для отметок и звука)
  function growAge(g, t) { return lerp(g.from, g.to, easeInOut(seg(t, g.grow[0], g.grow[1]))); }
  function ageCrossTime(g, age) {
    let a = g.grow[0], b = g.grow[1];
    if (age <= g.from) return a;
    for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (growAge(g, m) < age) a = m; else b = m; }
    return (a + b) / 2;
  }

  // =====================================================================
  // МИШКА
  // =====================================================================
  const BG = {
    legL: [-37, -24, 30, 23, 0.3], legR: [37, -24, 30, 23, -0.3],
    padL: [-45, -20, 13, 10, 0.3], padR: [45, -20, 13, 10, -0.3],
    body: [0, -80, 57, 63, 0], belly: [0, -72, 32, 37, 0],
    armL: [-53, -95, 17, 37, 0.5], armR: [53, -95, 17, 37, -0.5],
    head: [0, -163, 55, 48, 0],
    earL: [-41, -201, 19, 18, -0.2], earR: [41, -201, 19, 18, 0.2],
    earInL: [-41, -199, 9, 8, -0.2], earInR: [41, -199, 9, 8, 0.2],
    muzzle: [0, -146, 24, 17, 0], nose: [0, -153, 8, 5.5, 0],
    eyeL: [-21, -172], eyeR: [21, -172], ear: [44, -214],
  };
  const BEAR_CY = -110;
  const PATCH = [36, -30]; // заплатка на правой лапке
  const bearCenter = (x, y, s) => [x, y + BEAR_CY * s];

  function bearM(o) { return xf(o.x, o.y, o.s, o.rot || 0); }
  function bearPart(M, e) {
    const c = M(e[0], e[1]);
    return { c, rx: e[2] * M.s, ry: e[3] * M.s, rot: e[4] + M.rot };
  }
  function bearSilhouette(M) {
    return ['legL', 'legR', 'body', 'armL', 'armR', 'head', 'earL', 'earR'].map((k) => {
      const p = bearPart(M, BG[k]); return ellipsePoly(p.c[0], p.c[1], p.rx * 1.04, p.ry * 1.04, p.rot, 28);
    });
  }
  function scarfGeo(M) {
    const band = [[-54, -122], [-36, -110], [-14, -103], [0, -102], [14, -103], [36, -110], [54, -122],
      [52, -136], [34, -125], [14, -119], [0, -118], [-14, -119], [-34, -125], [-52, -136]];
    const tail = [[12, -112], [30, -116], [40, -64], [20, -60]];
    return { band: M.pts(curve(band, true, 4)), tail: M.pts(tail), fr: [[21, -60], [27, -61], [33, -62], [39, -63]].map((p) => [M(p[0], p[1]), M(p[0] - 1, p[1] + 10)]) };
  }
  function heartPts(cx, cy, size, rot = 0) {
    const out = [];
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const x = 16 * Math.pow(Math.sin(a), 3);
      const y = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a));
      const c = Math.cos(rot), s = Math.sin(rot);
      const px = x / 16 * size, py = y / 16 * size;
      out.push([cx + px * c - py * s, cy + px * s + py * c]);
    }
    return out;
  }
  function drawHeart(ctx, cx, cy, size, key, al, p = 1, rot = 0.3) {
    const pts = heartPts(cx, cy, size, rot);
    hatch(ctx, pts, { key: key + ':h', color: 'warm', alpha: 0.75 * al * p, gap: 2.8, w: 1.6, jitter: 1.5, angle: -0.6 });
    stroke(ctx, pts, { key: key + ':o', closed: true, color: 'warm', w: 2.2, alpha: al, p, amp: 0.6, gaps: false });
  }

  function drawBear(ctx, o) {
    const al = o.alpha === undefined ? 1 : o.alpha;
    if (al <= 0.004) return;
    const M = bearM(o), k = o.key || 'bear', d = o.draw === undefined ? 1 : o.draw;
    const fur = o.fur === undefined ? 1 : o.fur;
    const m = o.marks || {};
    const w = o.w || 2.8;
    const pp = (a, b) => seg(d, a, b);
    // строительные линии
    const build = o.build === undefined ? (1 - seg(d, 0.6, 1)) * clamp(d * 6) : o.build;
    if (build > 0.01) {
      const hd = bearPart(M, BG.head), bd = bearPart(M, BG.body);
      guide(ctx, ellipsePts(hd.c[0], hd.c[1], hd.rx * 1.02, hd.rx * 1.02, 0, k + 'g1'), { key: k + ':g1', closed: true, alpha: build * al });
      guide(ctx, ellipsePts(bd.c[0], bd.c[1], bd.rx * 1.05, bd.ry * 1.02, 0, k + 'g2'), { key: k + ':g2', closed: true, alpha: build * al });
      guide(ctx, [M(0, -222), M(0, 6)], { key: k + ':g3', alpha: build * al * 0.8 });
      guide(ctx, [M(-70, -172), M(70, -172)], { key: k + ':g4', alpha: build * al * 0.7 });
      guide(ctx, [M(-90, 0), M(90, 0)], { key: k + ':g5', alpha: build * al * 0.7 });
    }
    const outline = (name, p, extra = {}) => {
      const e = bearPart(M, BG[name]);
      stroke(ctx, ellipsePts(e.c[0], e.c[1], e.rx, e.ry, e.rot, k + name), Object.assign({ key: k + ':' + name, closed: true, w, p, alpha: al }, extra));
      return e;
    };
    const polyOf = (name, sc = 1) => { const e = bearPart(M, BG[name]); return ellipsePoly(e.c[0], e.c[1], e.rx * sc, e.ry * sc, e.rot, 30); };
    const furH = (name, holes, p, ang = -0.9, salt = '') => {
      if (p <= 0) return;
      const rings = [polyOf(name, 0.97)].concat(holes.map((h) => polyOf(h, 1)));
      hatch(ctx, rings, { key: k + ':fur:' + name + salt, color: 'fur', alpha: 0.5 * al, p, gap: 6.5, w: 1.5, angle: ang, jitter: 4 });
    };
    const shade = (name, p, dx = -0.18, dy = -0.12) => {
      if (p <= 0) return;
      const e = bearPart(M, BG[name]);
      const inner = ellipsePoly(e.c[0] + dx * e.rx, e.c[1] + dy * e.ry, e.rx * 0.8, e.ry * 0.8, e.rot, 30);
      hatch(ctx, [ellipsePoly(e.c[0], e.c[1], e.rx * 0.98, e.ry * 0.98, e.rot, 30), inner],
        { key: k + ':sh:' + name, color: 'soft', alpha: 0.42 * al, p, gap: 5, w: 1.3, angle: 0.75, jitter: 3 });
    };
    const kn = (name, p) => knock(ctx, [polyOf(name, 1.03)], al * clamp(p * 4));

    // уши (за головой)
    const pE = pp(0.12, 0.3);
    for (const s of ['L', 'R']) {
      outline('ear' + s, pE);
      outline('earIn' + s, pE, { w: w * 0.7 });
      furH('ear' + s, ['earIn' + s], fur * pE);
    }
    // туловище
    const pB = pp(0.38, 0.6);
    kn('body', pB);
    outline('body', pB);
    outline('belly', pp(0.52, 0.64), { w: w * 0.7 });
    furH('body', ['belly'], fur * pB);
    shade('body', fur * pB);
    // лапы (ноги)
    const pL = pp(0.72, 0.92);
    for (const s of ['L', 'R']) {
      kn('leg' + s, pL);
      outline('leg' + s, pL);
      outline('pad' + s, pp(0.86, 1), { w: w * 0.7 });
      furH('leg' + s, ['pad' + s], fur * pL, -0.9, s);
    }
    shade('legR', fur * pL, -0.1, -0.3);
    // заплатка (Лена, 1979)
    if (m.patch > 0) {
      const pc = M(PATCH[0], PATCH[1]), r = M.rot - 0.25, hw = 15 * M.s, hh = 13 * M.s;
      const c = Math.cos(r), s = Math.sin(r);
      const q = [[-hw, -hh], [hw, -hh * 0.9], [hw * 1.05, hh], [-hw * 0.95, hh * 1.05]].map(([x, y]) => [pc[0] + x * c - y * s, pc[1] + x * s + y * c]);
      const pO = seg(m.patch, 0, 0.45), pH = seg(m.patch, 0.3, 0.7), pS = seg(m.patch, 0.6, 1);
      knock(ctx, [q], al * clamp(pO * 3));
      hatch(ctx, q, { key: k + ':patchH', color: 'a2', alpha: 0.65 * al, p: pH, gap: 3.5, w: 1.4, angle: 0.2, jitter: 1.5 });
      hatch(ctx, q, { key: k + ':patchH2', color: 'a2', alpha: 0.45 * al, p: pH, gap: 4.5, w: 1.3, angle: -1.3, jitter: 1.5 });
      stroke(ctx, q, { key: k + ':patch', closed: true, color: 'a2', w: 2.4, alpha: al, p: pO, amp: 0.8 });
      // стежки
      const ns = 12;
      for (let i = 0; i < ns; i++) {
        if (i / ns > pS) break;
        const e0 = q[Math.floor(i / 3)], e1 = q[(Math.floor(i / 3) + 1) % 4], u = ((i % 3) + 0.5) / 3;
        const px = lerp(e0[0], e1[0], u), py = lerp(e0[1], e1[1], u);
        const ex = e1[0] - e0[0], ey = e1[1] - e0[1], el = Math.hypot(ex, ey) || 1;
        const nx = -ey / el * 5 * M.s, ny = ex / el * 5 * M.s;
        stroke(ctx, [[px - nx, py - ny], [px + nx, py + ny]], { key: k + ':st' + i, w: 1.8, alpha: al, sketch: false, gaps: false, amp: 0.4 });
      }
    }
    // руки (передние лапы)
    const pA = pp(0.58, 0.78);
    for (const s of ['L', 'R']) {
      kn('arm' + s, pA);
      outline('arm' + s, pA);
      furH('arm' + s, [], fur * pA, -0.9, s);
    }
    shade('armR', fur * pA, -0.3, -0.1);
    // голова
    const pHd = pp(0, 0.22);
    kn('head', pHd);
    outline('head', pHd);
    furH('head', ['muzzle'], fur * pHd);
    shade('head', fur * pHd, -0.2, -0.2);
    // мордочка
    const pM = pp(0.22, 0.36);
    outline('muzzle', pM, { w: w * 0.8 });
    const pF = pp(0.3, 0.42);
    if (pF > 0) {
      const n = bearPart(M, BG.nose);
      blob(ctx, n.c[0], n.c[1], n.rx, n.ry, { key: k + ':nose', alpha: al * clamp(pF * 2) });
      stroke(ctx, curve([M(0, -147), M(0, -141), M(-8, -135)], false, 5), { key: k + ':m1', w: w * 0.75, alpha: al, p: pF, sketch: false });
      stroke(ctx, curve([M(0, -141), M(8, -135)], false, 4), { key: k + ':m2', w: w * 0.75, alpha: al, p: pF, sketch: false });
      // шов на голове
      for (let i = 0; i < 3; i++) stroke(ctx, [M(-3, -206 + i * 7), M(3, -204 + i * 7)], { key: k + ':seam' + i, w: 1.3, alpha: al * 0.6 * pF, sketch: false, gaps: false });
    }
    // глаза-пуговицы
    const pEy = pp(0.34, 0.46);
    const btn = m.button || 0;
    const eyeAt = (side) => M(BG['eye' + side][0], BG['eye' + side][1]);
    const holes = (c, r, n, role = 'paper') => {
      ctx.fillStyle = P.col(role, 0.85 * al);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + 0.6;
        ctx.beginPath(); ctx.arc(c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r, Math.max(0.9 / P.z, r * 0.42), 0, 6.283); ctx.fill();
      }
    };
    if (pEy > 0) {
      const er = 6.5 * M.s;
      const eR = eyeAt('R');
      blob(ctx, eR[0], eR[1], er, er * 1.05, { key: k + ':eyeR', alpha: al * pEy });
      holes(eR, er * 0.38, 2);
      const eL = eyeAt('L');
      const oldA = 1 - seg(btn, 0, 0.4);
      if (oldA > 0) { blob(ctx, eL[0], eL[1], er, er * 1.05, { key: k + ':eyeL', alpha: al * pEy * oldA }); holes(eL, er * 0.38, 2); }
      const nb = seg(btn, 0.3, 1);
      if (nb > 0) { // синяя пуговица (Аня, 1962)
        const br = 9.5 * M.s, poly = ellipsePoly(eL[0], eL[1], br, br, 0, 24);
        knock(ctx, [poly], al * nb);
        hatch(ctx, poly, { key: k + ':btnH', color: 'a1', alpha: 0.8 * al * nb, gap: 2.4, w: 1.5, angle: -0.7, jitter: 1.2 });
        stroke(ctx, ellipsePts(eL[0], eL[1], br, br, 0, k + 'btn'), { key: k + ':btn', closed: true, color: 'a1', w: 2.2, alpha: al, p: nb, amp: 0.5 });
        if (nb > 0.7) {
          holes(eL, br * 0.36, 4);
          stroke(ctx, [[eL[0] - br * 0.36, eL[1] - br * 0.36], [eL[0] + br * 0.36, eL[1] + br * 0.36]], { key: k + ':thr1', w: 1.2, alpha: al * 0.8, sketch: false, gaps: false });
          stroke(ctx, [[eL[0] + br * 0.36, eL[1] - br * 0.36], [eL[0] - br * 0.36, eL[1] + br * 0.36]], { key: k + ':thr2', w: 1.2, alpha: al * 0.8, sketch: false, gaps: false });
        }
      }
    }
    // шарф (бабушка Аня, 2003)
    if (m.scarf > 0) {
      const g = scarfGeo(M);
      const pBand = seg(m.scarf, 0, 0.45), pTail = seg(m.scarf, 0.35, 0.7), pFill = seg(m.scarf, 0.5, 1);
      knock(ctx, [g.band], al * clamp(pBand * 3));
      if (pTail > 0) knock(ctx, [g.tail], al * clamp(pTail * 3));
      hatch(ctx, g.band, { key: k + ':scH', color: 'a2', alpha: 0.6 * al, p: pFill, gap: 4, w: 1.5, angle: 1.2, jitter: 2 });
      hatch(ctx, g.tail, { key: k + ':scT', color: 'a2', alpha: 0.6 * al, p: pFill, gap: 4, w: 1.5, angle: 0.3, jitter: 2 });
      stroke(ctx, g.band, { key: k + ':scB', closed: true, color: 'line', w: 2.4, alpha: al, p: pBand });
      stroke(ctx, g.tail, { key: k + ':scTl', closed: true, color: 'line', w: 2.4, alpha: al, p: pTail });
      // полоски
      const stripes = [[-40, -112, -38, -128], [-18, -105, -17, -121], [6, -103, 6, -119], [28, -108, 27, -123], [48, -118, 46, -133], [16, -96, 33, -98], [19, -80, 37, -82]];
      stripes.forEach((s, i) => {
        if (pFill <= i / stripes.length) return;
        stroke(ctx, [M(s[0], s[1]), M(s[2], s[3])], { key: k + ':scS' + i, color: 'a1', w: 4.2, alpha: al * 0.85, sketch: false, amp: 0.6 });
      });
      g.fr.forEach((f, i) => stroke(ctx, f, { key: k + ':fr' + i, w: 1.6, alpha: al * pFill, sketch: false, gaps: false }));
    }
    // заколка-сердечко (Соня, 2026)
    if (m.clip > 0) {
      const c = M(BG.ear[0], BG.ear[1]);
      knock(ctx, [heartPts(c[0], c[1], 13 * M.s, 0.3)], al * m.clip);
      drawHeart(ctx, c[0], c[1], 13 * M.s, k + ':clip', al, m.clip);
    }
    // пыль на мишке (чердак) и её облачко
    if (o.dust > 0 || o.puff > 0) {
      const r = P.staticRng(k + ':dust');
      ctx.fillStyle = P.col('soft', 0.55 * al * (o.dust || 0) * (1 - (o.puff || 0)));
      const pf = o.puff || 0;
      for (let i = 0; i < 26; i++) {
        const lx = (r() - 0.5) * 120, ly = -20 - r() * 190, sz = 1.2 + r() * 2.2;
        const dir = Math.atan2(ly + 110, lx);
        const pp2 = M(lx + Math.cos(dir) * pf * 110, ly + Math.sin(dir) * pf * 110 - pf * 30);
        ctx.beginPath(); ctx.arc(pp2[0], pp2[1], sz * M.s, 0, 6.283); ctx.fill();
      }
      if (pf > 0 && pf < 1) {
        for (let i = 0; i < 6; i++) {
          const a = -Math.PI / 2 + (i - 2.5) * 0.55, rr = (60 + pf * 120) * M.s;
          const c = add(bearCenter(o.x, o.y, o.s), [Math.cos(a) * rr, Math.sin(a) * rr]);
          stroke(ctx, arcPts(c[0], c[1], 14 * M.s, 10 * M.s, 3.4, 6.0, 8), { key: k + ':puff' + i, color: 'soft', w: 1.6, alpha: al * (1 - pf) * 0.8, sketch: false });
        }
      }
    }
  }

  // =====================================================================
  // ЛЮДИ: один параметрический человек, возраст — непрерывный параметр
  // =====================================================================
  const HEIGHT_TAB = [[1, 75], [2, 86], [3, 95], [4, 102], [5, 109], [6, 115], [7, 121], [8, 127], [10, 138], [12, 150], [14, 159], [16, 163], [18, 165], [60, 165], [80, 160]];
  const HEADS_TAB = [[1, 3.9], [3, 4.4], [5, 4.9], [7, 5.25], [10, 5.7], [13, 6.1], [16, 6.4], [18, 6.5], [80, 6.5]];
  const heightPx = (age, spec) => tab(HEIGHT_TAB, age) * PXCM * (spec && spec.old ? 0.95 : 1) * ((spec && spec.hk) || 1);

  function personGeo(spec, st) {
    const age = st.age, a = clamp((age - 4) / 14);
    const Hp = heightPx(age, spec);
    const R = Hp / tab(HEADS_TAB, age) / 2;
    const f = st.face || 1;
    const X = st.x, G = GROUND;
    const headCY = -Hp + R * 1.02;
    const neckY = headCY + R * 0.92;
    const shY = neckY + R * lerp(0.08, 0.26, a);
    const sw = R * lerp(1.0, 1.25, a);
    const hemY = spec.long ? -Hp * 0.09 : -Hp * lerp(0.30, 0.29, a);
    const waistY = shY + (hemY - shY) * lerp(0.5, 0.4, a);
    const wh = sw * lerp(0.92, 0.72, a), hh = sw * lerp(1.2, 1.16, a) * (spec.long ? 1.12 : 1);
    const hipY = waistY + (hemY - waistY) * 0.3;
    const lean = (st.lean || 0) * f;
    // походка: подпрыгивание
    const ph = st.walk;
    const bob = ph === undefined || ph === null ? 0 : -Math.abs(Math.sin(ph)) * R * 0.18;
    const cl = Math.cos(lean), sl = Math.sin(lean);
    const up = (px, py) => { const dy = py - hipY; return [X + px * cl - dy * sl, G + bob + hipY + px * sl + dy * cl]; };
    const low = (px, py) => [X + px, G + bob + py];
    const g = { age, a, Hp, R, f, X, G, headCY, neckY, shY, sw, hemY, waistY, hipY, lean, up, low, bob };
    g.head = up(0, headCY);
    g.headTop = up(0, -Hp - R * 0.15);
    // платье
    const dressL = [
      up(-R * 0.34, neckY + R * 0.04), up(-sw, shY + R * 0.16), up(-sw * 0.93, shY + R * 0.75),
      up(-wh, waistY), low(-hh, hemY), low(-hh * 0.5, hemY + R * 0.05), low(0, hemY + R * 0.07),
      low(hh * 0.5, hemY + R * 0.05), low(hh, hemY), up(wh, waistY), up(sw * 0.93, shY + R * 0.75),
      up(sw, shY + R * 0.16), up(R * 0.34, neckY + R * 0.04), up(0, neckY + R * 0.26),
    ];
    g.dress = curve(dressL, true, 5);
    // ноги
    const legX = sw * lerp(0.36, 0.3, a), lw = R * lerp(0.17, 0.13, a);
    g.legs = [-1, 1].map((s) => {
      const sw2 = ph === undefined || ph === null ? 0 : Math.sin(ph) * s * R * 0.42;
      const lift = ph === undefined || ph === null ? 0 : Math.max(0, Math.sin(ph) * s) * R * 0.22;
      const top = low(s * legX, hemY - R * 0.1);
      const foot = [X + s * legX + sw2, G - lift];
      return { top, foot, poly: limbPoly([top, foot], lw, lw * 0.9), shoe: [foot[0] + f * R * 0.1, foot[1] - R * 0.08], sr: [R * 0.3, R * 0.16] };
    });
    // руки (обратная кинематика к целям-кистям)
    const ua = Hp * lerp(0.15, 0.172, a), fa = Hp * lerp(0.135, 0.158, a);
    g.ua = ua; g.fa = fa;
    g.shoulderL = up(-sw * 0.86, shY + R * 0.22);
    g.shoulderR = up(sw * 0.86, shY + R * 0.22);
    const restL = up(-sw - R * 0.12, shY + R * 0.22 + (ua + fa) * 0.985);
    const restR = up(sw + R * 0.12, shY + R * 0.22 + (ua + fa) * 0.985);
    g.rest = { l: restL, r: restR };
    const hands = st.hands || {};
    const aw = R * lerp(0.27, 0.2, a);
    g.arms = [['l', g.shoulderL, hands.l || restL], ['r', g.shoulderR, hands.r || restR]].map(([side, S, T2]) => {
      const k1 = ik(S[0], S[1], T2[0], T2[1], ua, fa, 1), k2 = ik(S[0], S[1], T2[0], T2[1], ua, fa, -1);
      const mode = st.hands ? (st.elbow || 'down') : 'out';
      const sd = side === 'l' ? -1 : 1;
      const k = mode === 'out' ? ((k1.e[0] - X) * sd > (k2.e[0] - X) * sd ? k1 : k2) : (k1.e[1] > k2.e[1] ? k1 : k2);
      const pts = curve([S, k.e, k.h], false, 6);
      return { side, S, E: k.e, Hn: k.h, pts, poly: limbPoly(pts, aw, aw * 0.85), hr: R * 0.2 };
    });
    // куда кладём мишку: обнимает / протягивает / держит над головой
    g.hugC = up(f * R * 0.08, shY + R * lerp(1.95, 2.35, a));
    g.giveC = up(f * (sw * 0.6 + (ua + fa) * 0.55), shY + R * 2.0);
    g.upC = up(f * R * 0.3, shY - (ua + fa) * 0.85 - 18);
    return g;
  }
  // кисти вокруг мишки с центром c
  function hugHands(c, s) { return { l: [c[0] + 12 * s / BS, c[1] + 26 * s / BS], r: [c[0] - 14 * s / BS, c[1] + 34 * s / BS] }; }
  function sideHands(c, s, dy = 4) { return { l: [c[0] - 44 * s / BS, c[1] + dy], r: [c[0] + 44 * s / BS, c[1] + dy] }; }
  // ребёнок тянет руки вперёд-вверх
  function reachHands(g) { const R = g.R; return { l: g.up(g.f * R * 1.3 - R * 0.3, g.shY - R * 0.3), r: g.up(g.f * R * 1.3 + R * 0.3, g.shY - R * 0.1) }; }
  // камера по ключам: [начало, длительность, цель]
  function camTrack(t, start, keys) {
    let cam = start;
    for (const [t0, d, target] of keys) {
      if (t <= t0) break;
      cam = camLerp(cam, target, easeInOut(seg(t, t0, t0 + d)));
    }
    return cam;
  }
  const DOORC = { x: 1390, y: 650, z: 1.5 };

  // причёски (координаты в радиусах головы, центр головы = 0,0)
  const HAIR = {
    cap: [[-1.02, 0.15], [-1.06, -0.35], [-0.86, -0.82], [-0.45, -1.1], [0, -1.16], [0.45, -1.1], [0.86, -0.82], [1.06, -0.35], [1.02, 0.15],
      [0.9, 0.1], [0.87, -0.3], [0.62, -0.55], [0.26, -0.6], [0, -0.5], [-0.26, -0.6], [-0.62, -0.55], [-0.87, -0.3], [-0.9, 0.1]],
    capHigh: [[-1.0, 0.0], [-1.05, -0.4], [-0.86, -0.84], [-0.45, -1.1], [0, -1.16], [0.45, -1.1], [0.86, -0.84], [1.05, -0.4], [1.0, 0.0],
      [0.9, -0.05], [0.84, -0.42], [0.55, -0.68], [0.1, -0.72], [-0.3, -0.62], [-0.65, -0.6], [-0.86, -0.4], [-0.9, -0.05]],
    bob: [[-1.04, 0.76], [-1.13, 0.1], [-1.02, -0.6], [-0.6, -1.06], [0, -1.17], [0.6, -1.06], [1.02, -0.6], [1.13, 0.1], [1.04, 0.76],
      [0.84, 0.8], [0.88, 0.0], [0.76, -0.33], [0.4, -0.36], [0, -0.34], [-0.4, -0.36], [-0.76, -0.33], [-0.88, 0.0], [-0.84, 0.8]],
  };

  function drawHair(ctx, style, g, k, al, p, role, hA, extraAlpha = 1) {
    if (al * extraAlpha <= 0.004) return;
    const R = g.R, hc = g.head;
    const c = Math.cos(g.lean), s = Math.sin(g.lean);
    const H2 = (x, y) => [hc[0] + (x * c - y * s) * R, hc[1] + (x * s + y * c) * R];
    const A = al * extraAlpha;
    const mainPts = (style === 'bob' ? HAIR.bob : style === 'bun' ? HAIR.capHigh : HAIR.cap).map(([x, y]) => H2(x, y));
    const poly = curve(mainPts, true, 4);
    const extras = [];
    if (style === 'pigtails') {
      for (const sd of [-1, 1]) extras.push({ e: [sd * 1.3, 0.78, 0.24, 0.5, sd * -0.35], tie: [sd * 1.06, 0.2] });
    } else if (style === 'ponytail') {
      extras.push({ e: [1.22 * g.f, 0.05, 0.25, 0.58, -0.32 * g.f], tie: [0.98 * g.f, -0.5] });
    } else if (style === 'bun') {
      extras.push({ e: [0, -1.24, 0.42, 0.33, 0], tie: null });
    }
    const exPolys = extras.map((ex) => { const cc = H2(ex.e[0], ex.e[1]); return ellipsePoly(cc[0], cc[1], ex.e[2] * R, ex.e[3] * R, ex.e[4] + g.lean, 24); });
    knock(ctx, [poly].concat(exPolys), A * clamp(p * 3));
    hatch(ctx, poly, { key: k + ':hairH:' + style, color: role, alpha: hA * A, p, gap: 4.2, w: 1.5, angle: -1.15, jitter: 3 });
    stroke(ctx, poly, { key: k + ':hair:' + style, closed: true, w: 2.4, alpha: A, p });
    extras.forEach((ex, i) => {
      const cc = H2(ex.e[0], ex.e[1]);
      hatch(ctx, exPolys[i], { key: k + ':hxH' + i + style, color: role, alpha: hA * A, p, gap: 4, w: 1.5, angle: -0.6, jitter: 3 });
      stroke(ctx, ellipsePts(cc[0], cc[1], ex.e[2] * R, ex.e[3] * R, ex.e[4] + g.lean, k + 'hx' + i), { key: k + ':hx' + i + style, closed: true, w: 2.2, alpha: A, p });
      if (ex.tie) {
        const t2 = H2(ex.tie[0], ex.tie[1]);
        blob(ctx, t2[0], t2[1], R * 0.1, R * 0.1, { key: k + ':tie' + i, color: style === 'pigtails' ? 'a1' : 'line', alpha: A * p });
        if (style === 'pigtails') { // бантики
          for (const d of [-1, 1]) stroke(ctx, [t2, [t2[0] + d * R * 0.28, t2[1] - R * 0.18], [t2[0] + d * R * 0.26, t2[1] + R * 0.16], t2], { key: k + ':bow' + i + d, color: 'a1', w: 2, alpha: A * p, sketch: false });
        }
      }
    });
    if (style === 'sprout') { // «пальма» на макушке и заколка
      const base = H2(0, -1.1);
      [[-0.32, -1.5], [0, -1.62], [0.3, -1.5]].forEach(([x, y], i) => stroke(ctx, curve([base, H2(x * 0.5, y + 0.12), H2(x, y)], false, 6), { key: k + ':spr' + i, w: 2.2, alpha: A * p }));
      blob(ctx, base[0], base[1], R * 0.09, R * 0.08, { key: k + ':sprT', alpha: A * p });
    }
  }

  function drawPerson(ctx, spec, st, layer = 'all') {
    const al = st.alpha === undefined ? 1 : st.alpha;
    if (al <= 0.004) return null;
    const g = personGeo(spec, st);
    const d = st.draw === undefined ? 1 : st.draw;
    const k = st.key || 'p';
    const pp = (a, b) => seg(d, a, b);
    const R = g.R;
    const kAl = al * clamp(d * 2.5);
    if (layer === 'all' || layer === 'body') {
      // строительные линии
      const build = (1 - seg(d, 0.55, 1)) * clamp(d * 6);
      if (build > 0.01) {
        guide(ctx, ellipsePts(g.head[0], g.head[1], R * 1.05, R * 1.05, 0, k + 'gh'), { key: k + ':gh', closed: true, alpha: build * al });
        guide(ctx, [g.headTop, [g.X, g.G + 4]], { key: k + ':ga', alpha: build * al });
        guide(ctx, [g.up(-g.sw * 1.2, g.shY), g.up(g.sw * 1.2, g.shY)], { key: k + ':gs', alpha: build * al * 0.8 });
        guide(ctx, [g.low(-g.sw * 1.3, g.hemY), g.low(g.sw * 1.3, g.hemY)], { key: k + ':gm', alpha: build * al * 0.6 });
      }
      // ноги и туфли
      const pLeg = pp(0.6, 0.8);
      g.legs.forEach((lg, i) => {
        knock(ctx, [lg.poly], kAl * clamp(pLeg * 3));
        stroke(ctx, lg.poly, { key: k + ':leg' + i, closed: true, w: 2.2, alpha: al, p: pLeg });
        const sp = ellipsePoly(lg.shoe[0], lg.shoe[1], lg.sr[0], lg.sr[1], 0, 18);
        knock(ctx, [sp], kAl * pLeg);
        hatch(ctx, sp, { key: k + ':shoeH' + i, color: 'line', alpha: 0.7 * al * pLeg, gap: 3, w: 1.5, angle: -0.5, jitter: 2 });
        stroke(ctx, ellipsePts(lg.shoe[0], lg.shoe[1], lg.sr[0], lg.sr[1], 0, k + 'sh' + i), { key: k + ':shoe' + i, closed: true, w: 2.2, alpha: al, p: pLeg });
      });
      // платье
      const pDr = pp(0.35, 0.7);
      knock(ctx, [g.dress], kAl * clamp(pDr * 3));
      hatch(ctx, g.dress, { key: k + ':dressH', color: spec.dress, alpha: 0.42 * al, p: pp(0.6, 0.95), gap: 6.5, w: 1.6, angle: -0.95, jitter: 5 });
      // тень складок
      const sh = [g.up(g.sw * 0.25, g.shY + R * 0.4), g.up(g.sw * 0.9, g.shY + R * 0.4), g.low(g.sw * 1.1, g.hemY), g.low(g.sw * 0.45, g.hemY)];
      hatch(ctx, sh, { key: k + ':dressS', color: 'soft', alpha: 0.25 * al, p: pp(0.7, 1), gap: 5, w: 1.2, angle: 0.8, jitter: 3 });
      stroke(ctx, g.dress, { key: k + ':dress', closed: true, w: 2.6, alpha: al, p: pDr });
      drawPattern(ctx, spec, g, k, al, pp(0.65, 1));
      // шея и голова
      const pHd = pp(0, 0.25);
      stroke(ctx, [g.up(-R * 0.2, g.headCY + R * 0.85), g.up(-R * 0.22, g.neckY + R * 0.1)], { key: k + ':nk1', w: 2, alpha: al, p: pHd, sketch: false });
      stroke(ctx, [g.up(R * 0.2, g.headCY + R * 0.85), g.up(R * 0.22, g.neckY + R * 0.1)], { key: k + ':nk2', w: 2, alpha: al, p: pHd, sketch: false });
      const headPoly = ellipsePoly(g.head[0], g.head[1], R * 0.96, R * 1.04, g.lean, 30);
      knock(ctx, [headPoly], kAl * clamp(pHd * 3));
      stroke(ctx, ellipsePts(g.head[0], g.head[1], R * 0.96, R * 1.04, g.lean, k + 'hd'), { key: k + ':head', closed: true, w: 2.6, alpha: al, p: pHd });
      // уши
      for (const sd of [-1, 1]) {
        const ec = g.up(sd * R * 0.98, g.headCY + R * 0.12);
        stroke(ctx, arcPts(ec[0], ec[1], R * 0.14, R * 0.2, sd < 0 ? Math.PI * 0.5 : -Math.PI * 0.5, sd < 0 ? Math.PI * 1.5 : Math.PI * 0.5, 8), { key: k + ':ear' + sd, w: 2, alpha: al, p: pHd, sketch: false });
      }
      // лицо
      drawFace(ctx, spec, st, g, k, al, pp(0.3, 0.5));
      // причёска (у Ани в детстве — косички, потом пучок)
      const hm = spec.hairKid === spec.hairAdult ? 0 : seg(g.age, 11, 15);
      const pH = pp(0.15, 0.45);
      const gray = spec.old ? 1 : 0;
      if (hm < 1) drawHair(ctx, spec.hairKid, g, k, al, pH, spec.hairColor, spec.hairAlpha, 1 - hm);
      if (hm > 0) drawHair(ctx, spec.hairAdult, g, k + 'a', al, pH, spec.hairColor, spec.hairAlpha, hm);
      if (spec.glasses) drawGlasses(ctx, g, k, al, pp(0.4, 0.55));
      if (st.clip !== undefined && st.clip > 0) { // заколка в волосах Сони
        const c = clipPos(g);
        knock(ctx, [heartPts(c[0], c[1], R * 0.2, 0.3)], al * st.clip);
        drawHeart(ctx, c[0], c[1], R * 0.2, k + ':clip', al * st.clip, pp(0.4, 0.6));
      }
      void gray;
    }
    if (layer === 'all' || layer === 'arms') {
      const pAr = pp(0.7, 0.95);
      g.arms.forEach((ar, i) => {
        knock(ctx, [ar.poly], kAl * clamp(pAr * 3));
        stroke(ctx, ar.poly, { key: k + ':arm' + i, closed: true, w: 2.4, alpha: al, p: pAr });
        hatch(ctx, ar.poly, { key: k + ':armH' + i, color: spec.dress, alpha: 0.35 * al, p: pAr, gap: 6, w: 1.4, angle: -0.95, jitter: 3 });
        const hp = ellipsePoly(ar.Hn[0], ar.Hn[1], ar.hr, ar.hr * 1.05, 0, 18);
        knock(ctx, [hp], kAl * clamp(pAr * 3));
        stroke(ctx, ellipsePts(ar.Hn[0], ar.Hn[1], ar.hr, ar.hr * 1.05, 0, k + 'hn' + i), { key: k + ':hand' + i, closed: true, w: 2.2, alpha: al, p: pAr });
      });
    }
    return g;
  }
  const clipPos = (g) => { const c = Math.cos(g.lean), s = Math.sin(g.lean); return [g.head[0] + (0.62 * c + 0.78 * s) * g.R, g.head[1] + (0.62 * s - 0.78 * c) * g.R]; };

  function drawFace(ctx, spec, st, g, k, al, p) {
    if (p <= 0) return;
    const R = g.R, hc = g.head, c = Math.cos(g.lean), s = Math.sin(g.lean);
    const F = (x, y) => [hc[0] + (x * c - y * s) * R, hc[1] + (x * s + y * c) * R];
    const lk = (st.look === undefined ? g.f * 0.6 : st.look) * 0.08;
    const ey = lerp(0.2, 0.06, g.a), ex = lerp(0.36, 0.33, g.a);
    const face = st.mood || 'smile';
    for (const sd of [-1, 1]) {
      const e = F(sd * ex + lk, ey);
      if (face === 'happy') {
        stroke(ctx, arcPts(e[0], e[1] + R * 0.04, R * 0.1, R * 0.08, Math.PI * 1.1, Math.PI * 1.9, 6), { key: k + ':eh' + sd, w: 2.2, alpha: al * p, sketch: false, gaps: false });
      } else {
        blob(ctx, e[0], e[1], R * 0.075, R * 0.1, { key: k + ':eye' + sd, alpha: al * p });
      }
      // румянец
      const ch = F(sd * 0.56 + lk * 0.5, ey + 0.32);
      hatch(ctx, ellipsePoly(ch[0], ch[1], R * 0.15, R * 0.09, 0, 14), { key: k + ':ch' + sd, color: 'warm', alpha: 0.28 * al * p, gap: 2.6, w: 1.2, angle: -0.5, jitter: 1 });
      if (spec.old) stroke(ctx, arcPts(...F(sd * (ex + 0.17) + lk, ey + 0.02), R * 0.08, R * 0.1, sd < 0 ? 2.4 : -0.6, sd < 0 ? 3.6 : 0.6, 5), { key: k + ':wr' + sd, w: 1.2, alpha: al * p * 0.6, sketch: false, gaps: false });
    }
    // нос и рот
    const n = F(lk * 1.4 + g.f * 0.04, ey + 0.22);
    stroke(ctx, [[n[0] - R * 0.03, n[1] - R * 0.04], [n[0] + R * 0.02 * g.f, n[1] + R * 0.03]], { key: k + ':nose', w: 1.8, alpha: al * p, sketch: false, gaps: false });
    const my = lerp(0.52, 0.47, g.a);
    if (face === 'open') {
      const m = F(lk, my);
      stroke(ctx, curve([[m[0] - R * 0.14, m[1] - R * 0.03], [m[0], m[1] + R * 0.12], [m[0] + R * 0.14, m[1] - R * 0.03]], false, 5).concat([[m[0] - R * 0.14, m[1] - R * 0.03]]), { key: k + ':mo', w: 2, alpha: al * p, sketch: false });
    } else {
      stroke(ctx, curve([F(-0.19 + lk, my - 0.03), F(lk, my + 0.08), F(0.19 + lk, my - 0.03)], false, 5), { key: k + ':mouth', w: 2.1, alpha: al * p, sketch: false });
    }
  }
  function drawGlasses(ctx, g, k, al, p) {
    if (p <= 0) return;
    const R = g.R, hc = g.head, c = Math.cos(g.lean), s = Math.sin(g.lean);
    const F = (x, y) => [hc[0] + (x * c - y * s) * R, hc[1] + (x * s + y * c) * R];
    const lk = g.f * 0.6 * 0.08, ey = lerp(0.2, 0.06, g.a), ex = lerp(0.36, 0.33, g.a);
    for (const sd of [-1, 1]) {
      const e = F(sd * ex + lk, ey);
      stroke(ctx, ellipsePts(e[0], e[1], R * 0.21, R * 0.18, 0, k + 'gl' + sd), { key: k + ':gl' + sd, closed: true, w: 1.8, alpha: al, p });
    }
    stroke(ctx, [F(-ex + 0.21 + lk, ey - 0.02), F(ex - 0.21 + lk, ey - 0.02)], { key: k + ':glb', w: 1.6, alpha: al, p, sketch: false, gaps: false });
  }
  function drawPattern(ctx, spec, g, k, al, p) {
    if (p <= 0) return;
    const R = g.R;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(g.dress[0][0], g.dress[0][1]);
    for (let i = 1; i < g.dress.length; i++) ctx.lineTo(g.dress[i][0], g.dress[i][1]);
    ctx.closePath();
    ctx.clip();
    const r = P.staticRng(k + ':pat');
    if (spec.pattern === 'dots') {
      for (let iy = 0; iy < 9; iy++) for (let ix = -4; ix <= 4; ix++) {
        const lx = ix * R * 0.42 + (iy % 2) * R * 0.21, ly = g.shY + R * 0.35 + iy * R * 0.46;
        if (ly > g.hemY) continue;
        const pt = ly < g.hipY ? g.up(lx, ly) : g.low(lx, ly);
        if ((ix + iy * 9) / 81 + 0.5 > p * 1.5) continue;
        stroke(ctx, ellipsePts(pt[0], pt[1], R * 0.07, R * 0.07, 0, k + 'dt' + ix + '_' + iy), { key: k + ':dt' + ix + '_' + iy, closed: true, w: 1.6, alpha: al * 0.75, sketch: false, gaps: false, amp: 0.5 });
      }
      // белый воротничок
      for (const sd of [-1, 1]) stroke(ctx, curve([g.up(0, g.neckY + R * 0.26), g.up(sd * R * 0.3, g.neckY + R * 0.5), g.up(sd * R * 0.42, g.neckY + R * 0.06)], false, 6), { key: k + ':col' + sd, w: 2, alpha: al * p });
    } else if (spec.pattern === 'stripes') {
      for (let i = 0; i < 9; i++) {
        const ly = g.shY + R * (0.6 + i * 0.52);
        if (ly > g.hemY || i / 9 > p) continue;
        const L = ly < g.hipY ? [g.up(-g.sw * 1.4, ly), g.up(g.sw * 1.4, ly)] : [g.low(-g.sw * 1.4, ly), g.low(g.sw * 1.4, ly)];
        stroke(ctx, L, { key: k + ':str' + i, color: spec.dress, w: 4, alpha: al * 0.8, sketch: false });
      }
    } else if (spec.pattern === 'zigzag') {
      const zy = g.shY + R * 1.05, pts = [];
      for (let i = -6; i <= 6; i++) pts.push(g.up(i * R * 0.24, zy + (i % 2 ? R * 0.2 : 0)));
      stroke(ctx, pts, { key: k + ':zz', color: 'a1', w: 2.6, alpha: al, p });
      const pts2 = pts.map(([x, y]) => [x, y + R * 0.35]);
      stroke(ctx, pts2, { key: k + ':zz2', color: 'a1', w: 2.2, alpha: al * 0.8, p });
    } else if (spec.pattern === 'cardigan') {
      stroke(ctx, [g.up(0, g.neckY + R * 0.3), g.up(0, g.waistY + R * 0.3)], { key: k + ':cd', w: 2, alpha: al, p });
      for (let i = 0; i < 3; i++) { const b = g.up(R * 0.1, g.neckY + R * (0.65 + i * 0.5)); blob(ctx, b[0], b[1], R * 0.06, R * 0.06, { key: k + ':cb' + i, alpha: al * p }); }
      // шаль / кофта
      for (const sd of [-1, 1]) stroke(ctx, curve([g.up(sd * R * 0.35, g.neckY), g.up(sd * R * 0.12, g.neckY + R * 0.6), g.up(sd * R * 0.05, g.waistY)], false, 5), { key: k + ':lap' + sd, w: 1.8, alpha: al * 0.8, p });
    } else if (spec.pattern === 'collar') {
      for (const sd of [-1, 1]) stroke(ctx, curve([g.up(0, g.neckY + R * 0.26), g.up(sd * R * 0.32, g.neckY + R * 0.52), g.up(sd * R * 0.44, g.neckY + R * 0.06)], false, 6), { key: k + ':col' + sd, w: 2, alpha: al * p });
      const pc = g.up(-R * 0.35, g.waistY + R * 0.4);
      drawHeart(ctx, pc[0], pc[1], R * 0.14, k + ':pocket', al * p, p, 0);
    }
    void r;
    ctx.restore();
  }

  // =====================================================================
  // РЕКВИЗИТ
  // =====================================================================
  function drawFloor(ctx, key, p, al) {
    if (al <= 0.004 || p <= 0) return;
    stroke(ctx, [[-240, GROUND], [2160, GROUND + 2]], { key: key + ':fl', w: 2.6, alpha: al, p });
    stroke(ctx, [[-240, GROUND - 24], [2160, GROUND - 22]], { key: key + ':bb', w: 1.8, alpha: al * 0.6, p });
    for (let i = 0; i < 17; i++) {
      const x = -240 + i * 150;
      stroke(ctx, [[x, GROUND + 4], [x + (x - 960) * 0.42, 1120]], { key: key + ':bd' + i, w: 1.4, alpha: al * 0.35, p: seg(p, i / 20, 1), sketch: false });
    }
    hatch(ctx, [[-240, GROUND + 4], [2160, GROUND + 4], [2160, 1120], [-240, 1120]], { key: key + ':flH', color: 'soft', alpha: 0.12 * al, p, gap: 9, angle: -0.15, maxLen: 140 });
  }

  const DOOR = { l0: 1426, l1: 1468, r0: 1662, r1: 1704, top: 150, lint: 194 };
  function drawDoor(ctx, key, p, al) {
    if (al <= 0.004 || p <= 0) return;
    const D = DOOR, G = GROUND;
    hatch(ctx, [[D.l1, D.lint], [D.r0, D.lint], [D.r0, G], [D.l1, G]], { key: key + ':in', color: 'soft', alpha: 0.2 * al, p, gap: 8, angle: -1.25, maxLen: 160 });
    stroke(ctx, [[D.l0, G], [D.l0, D.top], [D.r1, D.top], [D.r1, G]], { key: key + ':out', w: 2.8, alpha: al, p });
    stroke(ctx, [[D.l1, G], [D.l1, D.lint], [D.r0, D.lint], [D.r0, G]], { key: key + ':inn', w: 2.6, alpha: al, p: seg(p, 0.15, 1) });
    for (let i = 0; i < 3; i++) {
      stroke(ctx, [[D.l0 + 10 + i * 10, G - 30 - i * 70], [D.l0 + 12 + i * 9, D.lint + 40 + i * 60]], { key: key + ':gr' + i, w: 1.1, alpha: al * 0.35, p: seg(p, 0.3, 1), sketch: false });
      stroke(ctx, [[D.r0 + 10 + i * 10, G - 60 - i * 50], [D.r0 + 12 + i * 9, D.lint + 30 + i * 70]], { key: key + ':grr' + i, w: 1.1, alpha: al * 0.35, p: seg(p, 0.3, 1), sketch: false });
    }
  }
  // отметки роста
  function genMarks(g, t, done) {
    const out = [];
    g.ages.forEach((age, i) => {
      const tc = ageCrossTime(g, age);
      const p = done ? 1 : seg(t, tc, tc + 0.22);
      if (p <= 0) return;
      const y = GROUND - heightPx(age, g.spec) - 4;
      const last = i === g.ages.length - 1;
      const yrA = done ? 0 : 1 - seg(t, g.grow[1] + 0.5, g.grow[1] + 1.1);
      out.push({ key: g.name + age, y, color: g.color, p, year: String(g.born + age), yrA: yrA * p, name: last ? g.name : null, nameX: g.nameX, nameP: done ? 1 : seg(t, g.grow[1] + 0.6, g.grow[1] + 1.1) });
    });
    return out;
  }
  function drawMarks(ctx, marks, al, o = {}) {
    if (al <= 0.004) return;
    for (const m of marks) {
      if (o.noNames) m.name = null;
      stroke(ctx, [[DOOR.l0 - 6, m.y], [DOOR.l1 + 9, m.y + 1]], { key: 'mk:' + m.key, color: m.color, w: 3, alpha: al, p: m.p, sketch: false, gaps: false });
      if (m.yrA > 0.004) write(ctx, m.year, DOOR.l0 - 14, m.y + 10, { key: 'mky:' + m.key, size: 30, color: m.color, align: 'right', alpha: al * m.yrA, weight: 500 });
      if (m.name && m.nameP > 0) {
        write(ctx, m.name, m.nameX, m.y + 11, { key: 'mkn:' + m.key, size: 38, color: m.color, align: 'right', p: m.nameP, alpha: al });
        stroke(ctx, [[m.nameX + 8, m.y], [DOOR.l0 - 8, m.y]], { key: 'mkl:' + m.key, color: m.color, w: 1.4, alpha: al * 0.6, p: m.nameP, sketch: false });
      }
    }
  }

  function drawTree(ctx, key, x, p, al) {
    if (al <= 0.004 || p <= 0) return;
    const G = GROUND, top = G - 500;
    const tiers = [[top + 10, top + 150, 74], [top + 95, top + 255, 125], [top + 190, top + 360, 172], [top + 290, G - 62, 215]];
    const allPolys = [];
    tiers.forEach(([ty, by, hw], i) => {
      const pts = [[x - hw, by], [x - hw * 0.18, ty + 14], [x, ty], [x + hw * 0.18, ty + 14], [x + hw, by]];
      const n = 3 + i;
      const sc = [];
      for (let j = 0; j <= n * 6; j++) { const u = j / (n * 6); sc.push([x + hw - u * hw * 2, by + Math.abs(Math.sin(u * n * Math.PI)) * 16]); }
      const poly = pts.concat(sc.slice(1));
      allPolys.push(poly);
      const pt = seg(p, i * 0.12, 0.45 + i * 0.12);
      knock(ctx, [poly], al * clamp(pt * 3));
      hatch(ctx, poly, { key: key + ':tH' + i, color: 'a2', alpha: 0.5 * al, p: pt, gap: 5.5, w: 1.5, angle: -1.05, jitter: 5 });
      stroke(ctx, pts, { key: key + ':t' + i, w: 2.6, alpha: al, p: pt });
      stroke(ctx, sc, { key: key + ':ts' + i, w: 2.2, alpha: al, p: pt });
      // гирлянда
      const gw = []; for (let j = 0; j <= 10; j++) { const u = j / 10; gw.push([x - hw * 0.75 + u * hw * 1.5, lerp(ty + (by - ty) * 0.45, ty + (by - ty) * 0.8, u) + Math.sin(u * 6) * 6]); }
      stroke(ctx, gw, { key: key + ':gl' + i, color: 'fur', w: 1.8, alpha: al * 0.8, p: seg(p, 0.5, 1) });
    });
    // ствол
    stroke(ctx, [[x - 22, G - 62], [x - 22, G], [x + 22, G], [x + 22, G - 62]], { key: key + ':trunk', w: 2.4, alpha: al, p: seg(p, 0.4, 0.7) });
    // звезда
    const st = [];
    for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 11 : 27; st.push([x + Math.cos(a) * r, top - 12 + Math.sin(a) * r]); }
    hatch(ctx, st, { key: key + ':starH', color: 'fur', alpha: 0.7 * al, p: seg(p, 0.6, 0.9), gap: 3, w: 1.4 });
    stroke(ctx, st, { key: key + ':star', w: 2.2, alpha: al, p: seg(p, 0.55, 0.85) });
    // шары
    [[-40, 120, 'a1'], [55, 175, 'fur'], [-85, 270, 'fur'], [70, 300, 'a1'], [-20, 330, 'a2'], [-140, 400, 'a1'], [120, 410, 'fur'], [10, 220, 'a1']].forEach(([dx, dy, c], i) => {
      const bp = seg(p, 0.6 + i * 0.04, 0.8 + i * 0.03);
      if (bp <= 0) return;
      const poly = ellipsePoly(x + dx, top + dy, 13, 13, 0, 16);
      knock(ctx, [poly], al * bp);
      hatch(ctx, poly, { key: key + ':bH' + i, color: c, alpha: 0.8 * al, p: bp, gap: 3, w: 1.4, jitter: 1.5 });
      stroke(ctx, ellipsePts(x + dx, top + dy, 13, 13, 0, key + 'b' + i), { key: key + ':b' + i, closed: true, w: 2, alpha: al, p: bp });
    });
  }
  function drawGift(ctx, key, x, p, al) {
    if (al <= 0.004 || p <= 0) return;
    const G = GROUND, w = 92, h = 70;
    const box = [[x - w / 2, G], [x - w / 2, G - h], [x + w / 2, G - h], [x + w / 2, G]];
    knock(ctx, [box], al * p);
    hatch(ctx, box, { key: key + ':gH', color: 'a1', alpha: 0.4 * al, p, gap: 5, angle: -0.9 });
    stroke(ctx, box, { key: key + ':g', closed: true, w: 2.4, alpha: al, p });
    stroke(ctx, [[x - 6, G], [x - 6, G - h]], { key: key + ':r1', color: 'fur', w: 5, alpha: al, p: seg(p, 0.4, 1), sketch: false });
    stroke(ctx, [[x - w / 2, G - h * 0.55], [x + w / 2, G - h * 0.55]], { key: key + ':r2', color: 'fur', w: 5, alpha: al, p: seg(p, 0.5, 1), sketch: false });
    for (const d of [-1, 1]) stroke(ctx, curve([[x - 6, G - h], [x - 6 + d * 30, G - h - 26], [x - 6 + d * 8, G - h - 6]], false, 6), { key: key + ':bow' + d, color: 'fur', w: 3, alpha: al, p: seg(p, 0.6, 1) });
  }
  function drawWindow(ctx, key, x0, y0, x1, y1, p, al, o = {}) {
    if (al <= 0.004 || p <= 0) return;
    const pf = seg(p, 0, 0.6), pd = seg(p, 0.4, 1);
    const in0 = 16;
    if (o.sun) {
      const sx = x1 - 70, sy = y0 + 72;
      hatch(ctx, [[x0 + in0, y0 + in0], [x1 - in0, y0 + in0], [x1 - in0, y1 - in0], [x0 + in0, y1 - in0]], { key: key + ':sky', color: 'a1', alpha: 0.16 * al, p: pd, gap: 9, angle: -0.3, maxLen: 70 });
      const sp = ellipsePoly(sx, sy, 34, 34, 0, 20);
      knock(ctx, [sp], al * pd);
      hatch(ctx, sp, { key: key + ':sunH', color: 'fur', alpha: 0.7 * al, p: pd, gap: 3.2, w: 1.5 });
      stroke(ctx, ellipsePts(sx, sy, 34, 34, 0, key + 'sun'), { key: key + ':sun', closed: true, color: 'fur', w: 2.4, alpha: al, p: pd });
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + 0.2; stroke(ctx, [[sx + Math.cos(a) * 46, sy + Math.sin(a) * 46], [sx + Math.cos(a) * 64, sy + Math.sin(a) * 64]], { key: key + ':ray' + i, color: 'fur', w: 2.2, alpha: al * pd, sketch: false }); }
    }
    stroke(ctx, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], { key: key + ':fo', closed: true, w: 2.8, alpha: al, p: pf });
    stroke(ctx, [[x0 + in0, y0 + in0], [x1 - in0, y0 + in0], [x1 - in0, y1 - in0], [x0 + in0, y1 - in0]], { key: key + ':fi', closed: true, w: 2, alpha: al, p: pf });
    const mx = (x0 + x1) / 2, my = y0 + (y1 - y0) * 0.38;
    stroke(ctx, [[mx, y0 + in0], [mx, y1 - in0]], { key: key + ':mv', w: 2.2, alpha: al, p: pd });
    stroke(ctx, [[x0 + in0, my], [x1 - in0, my]], { key: key + ':mh', w: 2.2, alpha: al, p: pd });
    // подоконник
    stroke(ctx, [[x0 - 24, y1 + 4], [x1 + 24, y1 + 4], [x1 + 24, y1 + 22], [x0 - 24, y1 + 22]], { key: key + ':sill', closed: true, w: 2.2, alpha: al, p: pd });
    if (o.frost) {
      const r = P.staticRng(key + ':fr');
      for (let i = 0; i < 9; i++) {
        const cx = x0 + 40 + r() * (x1 - x0 - 80), cy = y0 + 40 + r() * (y1 - y0 - 80), s = 7 + r() * 9;
        for (let j = 0; j < 3; j++) { const a = j * Math.PI / 3 + r(); stroke(ctx, [[cx - Math.cos(a) * s, cy - Math.sin(a) * s], [cx + Math.cos(a) * s, cy + Math.sin(a) * s]], { key: key + ':sf' + i + j, color: 'guide', w: 1.6, alpha: al * pd * 0.9, sketch: false, gaps: false }); }
      }
      hatch(ctx, [[x0 + in0, y1 - in0], [x0 + in0, y1 - 90], [x0 + 110, y1 - in0]], { key: key + ':frH', color: 'guide', alpha: 0.35 * al, p: pd, gap: 4, angle: 0.8 });
      hatch(ctx, [[x1 - in0, y1 - in0], [x1 - in0, y1 - 80], [x1 - 100, y1 - in0]], { key: key + ':frH2', color: 'guide', alpha: 0.35 * al, p: pd, gap: 4, angle: -0.8 });
    }
    if (o.curtains) {
      for (const sd of [-1, 1]) {
        const cx = sd < 0 ? x0 - 30 : x1 + 30;
        const pts = []; for (let i = 0; i <= 12; i++) pts.push([cx + Math.sin(i * 1.3) * 10 * sd, y0 - 30 + i * (y1 - y0 + 50) / 12]);
        stroke(ctx, pts, { key: key + ':cu' + sd, color: 'a1', w: 2.2, alpha: al, p: pd });
        stroke(ctx, pts.map(([x, y]) => [x - sd * 38, y]), { key: key + ':cu2' + sd, color: 'a1', w: 2, alpha: al * 0.8, p: pd });
        hatch(ctx, pts.concat(pts.map(([x, y]) => [x - sd * 38, y]).reverse()), { key: key + ':cuH' + sd, color: 'a1', alpha: 0.3 * al, p: pd, gap: 6, angle: -1.3 });
      }
      stroke(ctx, [[x0 - 90, y0 - 34], [x1 + 90, y0 - 34]], { key: key + ':rod', w: 2.6, alpha: al, p: pd });
    }
    if (o.plant) {
      const px = x0 + 70, py = y1 + 4;
      const pot = [[px - 30, py - 50], [px + 30, py - 50], [px + 22, py], [px - 22, py]];
      knock(ctx, [pot], al * pd);
      hatch(ctx, pot, { key: key + ':potH', color: 'fur', alpha: 0.55 * al, p: pd, gap: 4 });
      stroke(ctx, pot, { key: key + ':pot', closed: true, w: 2.2, alpha: al, p: pd });
      [[-26, -110], [-6, -140], [18, -118], [30, -86], [-36, -78]].forEach(([dx, dy], i) => {
        const tip = [px + dx, py - 50 + dy * 0.9];
        const leaf = curve([[px, py - 50], [lerp(px, tip[0], 0.5) - 10, lerp(py - 50, tip[1], 0.5)], tip, [lerp(px, tip[0], 0.5) + 10, lerp(py - 50, tip[1], 0.5) + 6], [px, py - 50]], false, 4);
        hatch(ctx, leaf, { key: key + ':lfH' + i, color: 'a2', alpha: 0.6 * al, p: pd, gap: 3.5, angle: 0.6 });
        stroke(ctx, leaf, { key: key + ':lf' + i, color: 'line', w: 1.8, alpha: al, p: pd });
      });
    }
  }
  function drawCarpet(ctx, key, x0, y0, x1, y1, p, al) {
    if (al <= 0.004 || p <= 0) return;
    const rect = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    knock(ctx, [rect], al * clamp(p * 3));
    const pa = seg(p, 0, 0.5), pb = seg(p, 0.3, 1);
    const b = 30;
    hatch(ctx, [rect, [[x0 + b, y0 + b], [x1 - b, y0 + b], [x1 - b, y1 - b], [x0 + b, y1 - b]]], { key: key + ':bh', color: 'fur', alpha: 0.5 * al, p: pb, gap: 4, angle: -0.8 });
    stroke(ctx, rect, { key: key + ':o', closed: true, w: 2.6, alpha: al, p: pa });
    stroke(ctx, [[x0 + b, y0 + b], [x1 - b, y0 + b], [x1 - b, y1 - b], [x0 + b, y1 - b]], { key: key + ':i', closed: true, w: 2, alpha: al, p: pa });
    // ромбы
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    [[1, 'a1', 0.5], [0.62, 'a2', 0.55], [0.3, 'fur', 0.7]].forEach(([sc, c, a], i) => {
      const rw = (x1 - x0 - b * 2) / 2 * sc * 0.92, rh = (y1 - y0 - b * 2) / 2 * sc * 0.92;
      const dm = [[cx, cy - rh], [cx + rw, cy], [cx, cy + rh], [cx - rw, cy]];
      hatch(ctx, dm, { key: key + ':dh' + i, color: c, alpha: a * 0.6 * al, p: pb, gap: 5, angle: i % 2 ? 0.8 : -0.8 });
      stroke(ctx, dm, { key: key + ':d' + i, closed: true, w: 2, alpha: al, p: pb });
    });
    // бахрома
    for (let x = x0 + 8; x < x1; x += 14) {
      stroke(ctx, [[x, y1], [x + 1, y1 + 16]], { key: key + ':fb' + x, w: 1.3, alpha: al * 0.7 * pb, sketch: false, gaps: false });
      stroke(ctx, [[x, y0], [x - 1, y0 - 14]], { key: key + ':ft' + x, w: 1.3, alpha: al * 0.7 * pb, sketch: false, gaps: false });
    }
  }
  function drawWallpaper(ctx, key, p, al, skip) {
    if (al <= 0.004 || p <= 0) return;
    for (let x = 70, i = 0; x < 1880; x += 76, i++) {
      if (skip && x > skip[0] && x < skip[1]) continue;
      stroke(ctx, [[x, 60], [x + 2, GROUND - 26]], { key: key + ':wp' + i, color: 'soft', w: 1.2, alpha: al * 0.18, p: seg(p, i / 40, 1), sketch: false });
      for (let y = 120; y < GROUND - 60; y += 130) {
        const yy = y + (i % 2) * 65;
        stroke(ctx, ellipsePts(x + 38, yy, 5, 5, 0, key + i + 'f' + y), { key: key + ':wf' + i + '_' + y, closed: true, color: 'soft', w: 1.2, alpha: al * 0.22 * p, sketch: false, gaps: false });
      }
    }
  }
  function drawYarn(ctx, key, c, r, p, al) {
    if (al <= 0.004 || p <= 0) return;
    const poly = ellipsePoly(c[0], c[1], r, r, 0, 20);
    knock(ctx, [poly], al * p);
    hatch(ctx, poly, { key: key + ':yH', color: 'a2', alpha: 0.55 * al, p, gap: 3.5, angle: 0.4 });
    stroke(ctx, ellipsePts(c[0], c[1], r, r, 0, key + 'y'), { key: key + ':y', closed: true, w: 2.2, alpha: al, p });
    for (let i = 0; i < 3; i++) stroke(ctx, arcPts(c[0] + (i - 1) * r * 0.3, c[1], r * 0.7, r * 0.95, -1.2 + i * 0.2, 1.4 + i * 0.2, 8), { key: key + ':ya' + i, color: 'a2', w: 1.6, alpha: al * p, sketch: false });
    // спицы
    stroke(ctx, [[c[0] - r * 1.4, c[1] - r * 1.5], [c[0] + r * 0.4, c[1] + r * 0.2]], { key: key + ':n1', w: 2, alpha: al * p, sketch: false });
    stroke(ctx, [[c[0] + r * 1.3, c[1] - r * 1.6], [c[0] - r * 0.2, c[1] + r * 0.1]], { key: key + ':n2', w: 2, alpha: al * p, sketch: false });
  }

  // ---- картонная коробка «игрушки»
  const BOXD = { w: 240, h: 170, dx: 38, dy: -44 };
  function boxGeo(bx, lid, open) {
    const G = GROUND, w = BOXD.w, h = BOXD.h, dx = BOXD.dx, dy = BOXD.dy;
    const fl = [bx - w / 2, G - h], fr = [bx + w / 2, G - h], bl = [bx - w / 2 + dx, G - h + dy], br = [bx + w / 2 + dx, G - h + dy];
    // клапаны: lid = 1 закрыт, 0 открыт; open > 1 — распахнуты сильнее
    const L = (a, b, k) => lerp(a, b, k);
    const ff = [L(-22, 19, lid) - open * 20, L(-82, -22, lid) + open * 10];
    const bf = [L(10, -19, lid), L(-86, 22, lid) - open * 10];
    const lf = [L(-70, 112, lid) - open * 20, L(-40, 0, lid)];
    const rf = [L(70, -112, lid) + open * 20, L(-40, 0, lid)];
    const quad = (a, b, v) => [a, b, [b[0] + v[0], b[1] + v[1]], [a[0] + v[0], a[1] + v[1]]];
    return {
      front: [[bx - w / 2, G], fl, fr, [bx + w / 2, G]],
      side: [fr, br, [br[0], G + dy], [bx + w / 2, G]],
      top: [fl, fr, br, bl],
      flapF: quad(fl, fr, ff), flapB: quad(bl, br, bf), flapL: quad(fl, bl, lf), flapR: quad(fr, br, rf),
      center: [bx + dx / 2, G - h + dy / 2], mid: [bx + dx / 2, G - h / 2],
    };
  }
  function drawBoxBack(ctx, key, g, p, al, lid) {
    if (al <= 0.004 || p <= 0) return;
    if (lid < 0.5) {
      hatch(ctx, g.top, { key: key + ':inH', color: 'line', alpha: 0.45 * al, p, gap: 4, angle: -0.6 });
      for (const f of ['flapB', 'flapL']) {
        hatch(ctx, g[f], { key: key + ':' + f + 'H', color: 'fur', alpha: 0.35 * al, p, gap: 5 });
        stroke(ctx, g[f], { key: key + ':' + f, closed: true, w: 2.2, alpha: al, p });
      }
    }
  }
  function drawBoxFront(ctx, key, g, p, al, lid, label) {
    if (al <= 0.004 || p <= 0) return;
    const parts = [g.front, g.side];
    knock(ctx, parts, al * clamp(p * 3));
    hatch(ctx, g.front, { key: key + ':fH', color: 'fur', alpha: 0.38 * al, p, gap: 6, angle: -0.95 });
    hatch(ctx, g.side, { key: key + ':sH', color: 'soft', alpha: 0.45 * al, p, gap: 4.5, angle: 0.7 });
    stroke(ctx, g.front, { key: key + ':f', closed: true, w: 2.6, alpha: al, p });
    stroke(ctx, g.side, { key: key + ':s', closed: true, w: 2.4, alpha: al, p });
    const flaps = lid < 0.5 ? ['flapR', 'flapF'] : ['flapL', 'flapR', 'flapB', 'flapF'];
    for (const f of flaps) {
      knock(ctx, [g[f]], al * clamp(p * 3));
      hatch(ctx, g[f], { key: key + ':' + f + 'H2', color: 'fur', alpha: 0.4 * al, p, gap: 5, angle: 0.4 });
      stroke(ctx, g[f], { key: key + ':' + f + '2', closed: true, w: 2.2, alpha: al, p });
    }
    if (label) write(ctx, 'игрушки', g.front[0][0] + 34, g.front[0][1] - 62, { key: key + ':lbl', size: 46, alpha: al * label, p: label, rot: -0.04 });
  }

  // ---- чердак
  function drawAttic(ctx, key, p, al) {
    if (al <= 0.004 || p <= 0) return;
    const pa = seg(p, 0, 0.6), pb = seg(p, 0.3, 1);
    stroke(ctx, [[-160, 1040], [960, 36], [2080, 1040]], { key: key + ':roof', w: 3, alpha: al, p: pa });
    stroke(ctx, [[-60, 1040], [960, 120], [1980, 1040]], { key: key + ':roof2', w: 2.4, alpha: al, p: pa });
    stroke(ctx, [[420, 520], [1500, 520]], { key: key + ':beam', w: 2.6, alpha: al, p: pb });
    stroke(ctx, [[410, 552], [1510, 552]], { key: key + ':beam2', w: 2.2, alpha: al, p: pb });
    hatch(ctx, [[420, 520], [1500, 520], [1510, 552], [410, 552]], { key: key + ':beamH', color: 'soft', alpha: 0.5 * al, p: pb, gap: 4, angle: 0.2 });
    stroke(ctx, [[960, 120], [960, GROUND]], { key: key + ':post', w: 2.4, alpha: al, p: pb });
    stroke(ctx, [[990, 140], [990, GROUND]], { key: key + ':post2', w: 2, alpha: al, p: pb });
    stroke(ctx, [[100, GROUND], [1820, GROUND + 2]], { key: key + ':fl', w: 2.6, alpha: al, p: pa });
    for (let i = 0; i < 10; i++) { const x = 160 + i * 180; stroke(ctx, [[x, GROUND + 4], [x + (x - 960) * 0.5, 1110]], { key: key + ':fb' + i, w: 1.4, alpha: al * 0.4, p: pb, sketch: false }); }
    // круглое окно
    const wc = [1300, 330];
    stroke(ctx, ellipsePts(wc[0], wc[1], 80, 80, 0, key + 'w'), { key: key + ':w', closed: true, w: 2.8, alpha: al, p: pa });
    stroke(ctx, ellipsePts(wc[0], wc[1], 66, 66, 0, key + 'w2'), { key: key + ':w2', closed: true, w: 2, alpha: al, p: pa });
    stroke(ctx, [[wc[0] - 66, wc[1]], [wc[0] + 66, wc[1]]], { key: key + ':wx', w: 2, alpha: al, p: pb });
    stroke(ctx, [[wc[0], wc[1] - 66], [wc[0], wc[1] + 66]], { key: key + ':wy', w: 2, alpha: al, p: pb });
    // луна
    stroke(ctx, arcPts(wc[0] + 22, wc[1] - 24, 20, 20, 1.2, 5.1, 12), { key: key + ':moon', color: 'line', w: 2, alpha: al * pb });
    // паутина в углу у балки
    const cw = [560, 552];
    for (let i = 0; i < 5; i++) { const a = 0.15 + i * 0.32; stroke(ctx, [cw, [cw[0] + Math.cos(a) * 120, cw[1] + Math.sin(a) * 120]], { key: key + ':cw' + i, w: 1.2, alpha: al * 0.7 * pb, sketch: false }); }
    for (let j = 1; j <= 3; j++) stroke(ctx, arcPts(cw[0], cw[1], j * 36, j * 36, 0.15, 1.45, 10), { key: key + ':cwa' + j, w: 1.1, alpha: al * 0.6 * pb, sketch: false });
    // старый чемодан
    const sx = 330, sy = GROUND;
    const suit = [[sx - 110, sy], [sx - 110, sy - 120], [sx + 110, sy - 120], [sx + 110, sy]];
    knock(ctx, [suit], al * pb);
    hatch(ctx, suit, { key: key + ':suH', color: 'soft', alpha: 0.4 * al, p: pb, gap: 5 });
    stroke(ctx, suit, { key: key + ':su', closed: true, w: 2.6, alpha: al, p: pb });
    stroke(ctx, curve([[sx - 30, sy - 120], [sx - 26, sy - 146], [sx + 26, sy - 146], [sx + 30, sy - 120]], false, 5), { key: key + ':suh', w: 2.4, alpha: al, p: pb });
    stroke(ctx, [[sx - 110, sy - 60], [sx + 110, sy - 58]], { key: key + ':sub', w: 1.8, alpha: al * 0.7, p: pb });
  }

  // ---- подписи (экран)
  const CAP = { year: [110, 178, 120], name: [114, 258, 62], sub: [116, 318, 46] };
  function cap(ctx, t, kind, text, t0, al = 1, keySuffix = '') {
    const [x, y, size] = CAP[kind];
    const p = seg(t, t0, t0 + Math.max(0.3, text.length * 0.045));
    if (p <= 0 || al <= 0.004) return;
    // бумага под подписью: стираем то, что под ней (чтобы читалось)
    const tw = P.textWidth(ctx, text, size);
    knock(ctx, [[[x - 18, y - size * 0.82], [x + tw * p + 20, y - size * 0.82], [x + tw * p + 20, y + size * 0.28], [x - 18, y + size * 0.28]]], 0.75 * al * p);
    write(ctx, text, x, y, { key: 'cap:' + kind + keySuffix, size, p, alpha: al });
  }
  // подпись над головой (мир)
  function headLabel(ctx, g, text, t, t0, al, key) {
    if (!g) return;
    const p = seg(t, t0, t0 + 0.5);
    write(ctx, text, g.headTop[0], g.headTop[1] - 22, { key: 'hl:' + key, size: 40, align: 'center', p, alpha: al, weight: 600 });
  }

  // =====================================================================
  // СЦЕНЫ
  // =====================================================================
  const POST = { night: 0, flash: 0, warm: 0, warmC: [960, 600] };

  // ---------- 0–1. Титул и 1956: Аня
  function scene1(ctx, t) {
    const A = GENS.anya;
    const age = growAge(A, t);
    const wIn = seg(t, T.anyaWalk[0], T.anyaWalk[1]), wD = seg(t, T.walkDoor1[0], T.walkDoor1[1]);
    let ax = 1230, face = -1, walk = null;
    if (t >= T.anyaWalk[0]) ax = lerp(1230, 700, easeInOut(wIn));
    if (t >= T.walkDoor1[0]) { ax = lerp(700, DOOR_X, easeInOut(wD)); face = 1; }
    if (wIn > 0 && wIn < 1) walk = wIn * Math.PI * 4;
    if (wD > 0 && wD < 1) walk = wD * Math.PI * 5;
    if (t >= T.walkDoor1[1]) face = 1;
    const reach = seg(t, T.reach1[0], T.reach1[1]), h = easeInOut(seg(t, T.hug1[0], T.hug1[1]));
    const lean = (reach * (1 - h)) * 0.3;
    const stA = { x: ax, age, face, walk, lean, key: 'anya', draw: seg(t, T.anyaIn[0], T.anyaIn[1]), mood: h > 0.5 && t < T.walkDoor1[0] + 0.3 ? 'happy' : 'smile', look: t >= T.walkDoor1[1] ? 0 : undefined };
    const g = personGeo(SPEC.anya, stA);
    // мишка: под ёлкой → на руках
    const floorC = bearCenter(560, GROUND, BS);
    const bc = h > 0 ? arc2(floorC, g.hugC, h, 50) : floorC;
    const bear = { x: bc[0], y: bc[1] - BEAR_CY * BS, s: BS, rot: h * 0.06, key: 'bear', draw: seg(t, T.bearDraw[0], T.bearDraw[1]), fur: seg(t, T.fur0[0], T.fur0[1]), marks: { button: seg(t, T.button[0], T.button[1]) } };
    const restHands = g.rest;
    const reachHands = { l: [floorC[0] + 60, floorC[1] - 10], r: [floorC[0] + 20, floorC[1] + 20] };
    const hh = hugHands(bc, BS);
    stA.hands = { l: lerp2(lerp2(restHands.l, reachHands.l, reach), hh.l, h), r: lerp2(lerp2(restHands.r, reachHands.r, reach), hh.r, h) };
    // камера
    const cam = camTrack(t, focus(floorC, BS, 1.9), [
      [T.pull1[0], T.pull1[1] - T.pull1[0], { x: 860, y: 600, z: 1.18 }],
      [6.9, 0.8, { x: 700, y: 700, z: 1.75 }],
      [8.3, 0.7, DOORC],
      [T.exit1[0] + 0.2, T.exit1[1] - T.exit1[0] - 0.2, focus(bc, BS, CUT)]]);
    P.camera(ctx, cam);
    const oth = erase(t, T.exit1[0], T.exit1[0] + 0.6);
    const treeA = oth * erase(t, T.treeOut[0], T.treeOut[1]);
    drawFloor(ctx, 's1', seg(t, T.floor1[0], T.floor1[1]), oth);
    drawWindow(ctx, 's1w', 860, 250, 1130, 590, seg(t, T.window1[0], T.window1[1]), oth, { frost: true });
    drawDoor(ctx, 's1d', seg(t, T.door1[0], T.door1[1]), oth);
    drawMarks(ctx, genMarks(A, t, false), oth);
    drawTree(ctx, 's1t', 560, seg(t, T.tree[0], T.tree[1]), treeA);
    drawGift(ctx, 's1g', 420, seg(t, T.tree[0] + 0.8, T.tree[1] + 0.3), treeA);
    stA.alpha = oth;
    drawPerson(ctx, SPEC.anya, stA, 'body');
    drawBear(ctx, bear);
    drawPerson(ctx, SPEC.anya, stA, 'arms');
    // подписи
    P.screen(ctx);
    const tAl = erase(t, T.titleOut[0], T.titleOut[1]);
    if (t < T.titleOut[1] + 1.3) {
      write(ctx, 'Мишка', W / 2, 215, { key: 'title', size: 150, align: 'center', p: seg(t, T.title[0], T.title[1]), alpha: tAl, weight: 700 });
      write(ctx, 'одна игрушка — четыре поколения', W / 2, 950, { key: 'subtitle', size: 58, align: 'center', p: seg(t, T.sub[0], T.sub[1]), alpha: tAl });
    }
    const cAl = erase(t, T.exit1[0], T.exit1[0] + 0.6);
    const yr = A.born + Math.floor(age + 1e-6);
    cap(ctx, t, 'year', String(yr), T.year1, cAl);
    cap(ctx, t, 'name', 'Аня, ' + ageText(Math.floor(age + 1e-6)), T.name1, cAl);
  }

  // ---------- 2. 1979: Лена
  function scene2(ctx, t) {
    const Lg = GENS.lena;
    const ageL = growAge(Lg, t);
    const wD = seg(t, T.walkDoor2[0], T.walkDoor2[1]);
    let lx = 1040, lface = -1, walk = null;
    if (t >= T.walkDoor2[0]) { lx = lerp(1040, DOOR_X, easeInOut(wD)); lface = 1; walk = wD < 1 ? wD * Math.PI * 4 : null; }
    const stA = { x: 780, age: 28, face: 1, lean: 0.07, key: 'anya2', mood: 'smile' };
    const gA = personGeo(SPEC.anya, stA);
    const hg = easeInOut(seg(t, T.give2[0], T.give2[1]));
    const stL = { x: lx, age: ageL, face: lface, walk, key: 'lena', draw: seg(t, T.lenaIn[0], T.lenaIn[1]), mood: hg > 0.6 && t < T.walkDoor2[0] ? 'happy' : 'smile', look: t > T.walkDoor2[1] ? 0 : undefined };
    const gL = personGeo(SPEC.lena, stL);
    // в коробку
    const lid2 = easeInOut(seg(t, T.lidClose[0], T.lidClose[1]));
    const box = boxGeo(1230, lid2, 0);
    const ib = easeInOut(seg(t, T.intoBox[0], T.intoBox[1]));
    const inBoxC = bearCenter(box.mid[0] + 6, GROUND - 14, BS);
    let bc = arc2(gA.giveC, gL.hugC, hg, 40);
    if (ib > 0) bc = arc2(gL.hugC, inBoxC, ib, 70);
    const bear = { x: bc[0], y: bc[1] - BEAR_CY * BS, s: BS, rot: ib > 0 ? 0 : 0.05, key: 'bear', marks: { button: 1, patch: seg(t, T.patch[0], T.patch[1]) } };
    // руки
    const sh = sideHands(gA.giveC, BS, 6);
    const aHold = 1 - seg(t, T.give2[0] + 0.45, T.give2[1] + 0.1);
    const followA = sideHands(bc, BS, 6);
    stA.hands = { l: lerp2(gA.rest.l, hg > 0 ? followA.l : sh.l, aHold), r: lerp2(gA.rest.r, hg > 0 ? followA.r : sh.r, aHold) };
    const reachL = reachHands(gL);
    const lh = hugHands(bc, BS);
    const lHold = 1 - seg(t, T.intoBox[0] + 0.25, T.intoBox[1]);
    stL.hands = hg <= 0 ? { l: lerp2(gL.rest.l, reachL.l, seg(t, 14.3, 14.9)), r: lerp2(gL.rest.r, reachL.r, seg(t, 14.3, 14.9)) }
      : { l: lerp2(gL.rest.l, lerp2(reachL.l, lh.l, hg), lHold), r: lerp2(gL.rest.r, lerp2(reachL.r, lh.r, hg), lHold) };
    // камера
    const ROOM2 = { x: 900, y: 640, z: 1.3 };
    const cam = camTrack(t, focus(gA.giveC, BS, CUT), [
      [T.pull2[0], T.pull2[1] - T.pull2[0], ROOM2],
      [T.zoomIn2[0], 0.4, focus(add(bc, [0, -20]), BS, 2.25)],
      [T.zoomOut2[0], 0.5, ROOM2],
      [17.3, 0.6, DOORC],
      [19.2, 0.6, { x: 1390, y: 700, z: 1.45 }],
      [T.exit2[0] + 0.1, T.exit2[1] - T.exit2[0] - 0.1, focus(box.mid, 1, 2.2)]]);
    P.camera(ctx, cam);
    const oth = erase(t, T.exit2[0], T.exit2[0] + 0.45);
    const rp = seg(t, T.room2[0], T.room2[1]);
    drawWallpaper(ctx, 's2wp', rp, oth, [130, 740]);
    drawFloor(ctx, 's2', rp, oth);
    drawCarpet(ctx, 's2c', 150, 330, 720, 700, rp, oth);
    drawDoor(ctx, 's2d', rp, oth);
    drawMarks(ctx, genMarks(GENS.anya, t, true).concat(genMarks(Lg, t, false)), oth * seg(rp, 0.5, 1));
    // Аня отдаёт и уходит
    stA.alpha = oth * erase(t, T.anyaOut2[0], T.anyaOut2[1]);
    stA.draw = seg(t, T.pull2[0], T.pull2[0] + 0.7);
    drawPerson(ctx, SPEC.anya, stA, 'body');
    stL.alpha = oth;
    drawPerson(ctx, SPEC.lena, stL, 'body');
    // коробка
    const bp = seg(t, T.box2[0], T.box2[1]);
    drawBoxBack(ctx, 'box', box, bp, 1, lid2);
    drawBear(ctx, bear);
    drawBoxFront(ctx, 'box', box, bp, 1, lid2, seg(t, T.box2[1], T.box2[1] + 0.4));
    drawPerson(ctx, SPEC.anya, stA, 'arms');
    drawPerson(ctx, SPEC.lena, stL, 'arms');
    headLabel(ctx, gA, 'Аня, 28', t, T.label2, stA.alpha * stA.draw, 'a2');
    // иголка с ниткой у заплатки
    const pn = seg(t, T.patch[0], T.patch[1]);
    if (pn > 0 && pn < 1) {
      const M = bearM(bear), c = M(PATCH[0] + Math.cos(pn * 18) * 17, PATCH[1] + Math.sin(pn * 18) * 14);
      stroke(ctx, [c, [c[0] + 34, c[1] - 30]], { key: 'needle', w: 1.8, alpha: 1, sketch: false, gaps: false });
      stroke(ctx, curve([c, [c[0] + 50, c[1] + 10], [c[0] + 90, c[1] - 20]], false, 6), { key: 'thread', color: 'a2', w: 1.3, alpha: 0.8, sketch: false });
    }
    P.screen(ctx);
    const cAl = erase(t, T.exit2[0], T.exit2[0] + 0.45);
    cap(ctx, t, 'year', String(Lg.born + Math.floor(ageL + 1e-6)), T.year2, cAl);
    cap(ctx, t, 'name', 'Лена, ' + ageText(Math.floor(ageL + 1e-6)), T.name2, cAl);
    cap(ctx, t, 'sub', 'дочка Ани', T.name2 + 0.35, cAl);
  }

  // ---------- 3. Чердак и поворот
  function scene3(ctx, t) {
    const bx = 900;
    const crack = seg(t, T.crack[0], T.crack[1]);
    const turn = t >= T.TURN ? 1 : 0;
    const op = turn ? back(seg(t, T.TURN, T.TURN + 0.3)) : 0;
    const lid = turn ? 1 - op : 1 - crack * 0.12 * (0.6 + 0.4 * Math.sin(t * 40));
    const box = boxGeo(bx, clamp(lid, 0, 1.2), turn ? Math.max(0, op - 1) * 2 + op * 0.3 : 0);
    const rise = easeOut(seg(t, T.rise[0], T.rise[1]));
    const inC = bearCenter(box.mid[0] + 6, GROUND - 14, BS);
    const upC = [inC[0], inC[1] - 250];
    const bc = lerp2(inC, upC, rise);
    const cam = camTrack(t, focus(boxGeo(bx, 1, 0).mid, 1, 2.2), [
      [T.pull3[0], T.pull3[1] - T.pull3[0], { x: 960, y: 560, z: 1.0 }],
      [T.pull3[1], T.TURN - T.pull3[1], { x: 930, y: 610, z: 1.1 }],
      [T.TURN + 0.05, T.rise[1] - T.TURN - 0.05, focus(bc, BS, CUT)]]);
    P.camera(ctx, cam);
    const dark = seg(t, T.s3, T.s3 + 0.8) * (1 - seg(t, T.TURN, T.TURN + 0.35));
    POST.night = dark;
    drawAttic(ctx, 'att', seg(t, T.attic[0], T.attic[1]), 1);
    // темнота штриховкой, с лучом лунного света
    const view = [[cam.x - W / cam.z, cam.y - H / cam.z], [cam.x + W / cam.z, cam.y - H / cam.z], [cam.x + W / cam.z, cam.y + H / cam.z], [cam.x - W / cam.z, cam.y + H / cam.z]];
    const beam = [[1250, 280], [1360, 380], [1090, GROUND + 10], [700, GROUND + 10]];
    const wnd = ellipsePoly(1300, 330, 66, 66, 0, 24);
    if (dark > 0.01) {
      hatch(ctx, [view, beam, wnd], { key: 'dark1', color: 'line', alpha: 0.4 * dark, gap: 6, w: 1.5, angle: -0.8, maxLen: 140 });
      hatch(ctx, [view, wnd], { key: 'dark2', color: 'line', alpha: 0.28 * dark, gap: 8, w: 1.4, angle: 0.75, maxLen: 140 });
      hatch(ctx, beam, { key: 'beam', color: 'guide', alpha: 0.18 * dark, gap: 9, w: 1.2, angle: -1.15 });
    }
    // пыль в луче
    const r = P.staticRng('dust');
    ctx.fillStyle = P.col('soft', 0.6 * dark);
    for (let i = 0; i < 40; i++) {
      const u = r(), v = r(), sp = 10 + r() * 20;
      const y = 300 + ((v * 640 + (t - T.s3) * sp) % 640);
      const x = lerp(1300, 900, (y - 300) / 640) + (u - 0.5) * 260;
      ctx.beginPath(); ctx.arc(x, y, 1.6 + r() * 1.6, 0, 6.283); ctx.fill();
    }
    drawBoxBack(ctx, 'box3', box, 1, 1, lid);
    const bear = { x: bc[0], y: bc[1] - BEAR_CY * BS, s: BS, key: 'bear', marks: { button: 1, patch: 1 }, dust: 1 };
    drawBear(ctx, bear);
    drawBoxFront(ctx, 'box3', box, 1, 1, lid, 1);
    // щель света и лучи
    if (crack > 0 && !turn) {
      stroke(ctx, [box.flapF[2], box.flapF[3]], { key: 'crackL', color: 'fur', w: 3, alpha: crack, sketch: false });
      knock(ctx, [[box.flapF[3], box.flapF[2], [box.flapF[2][0] + 6, box.flapF[2][1] - 4], [box.flapF[3][0] + 6, box.flapF[3][1] - 4]]], crack);
    }
    if (turn) {
      const ray = 1 - seg(t, T.TURN + 0.35, T.rise[1] + 0.3);
      const o = [box.center[0], box.center[1]];
      const rays = [];
      for (let i = 0; i < 9; i++) {
        const a = -Math.PI / 2 + (i - 4) * 0.22, wd = 0.045;
        rays.push([o, [o[0] + Math.cos(a - wd) * 1400, o[1] + Math.sin(a - wd) * 1400], [o[0] + Math.cos(a + wd) * 1400, o[1] + Math.sin(a + wd) * 1400]]);
      }
      knock(ctx, rays, 0.85 * ray);
      rays.forEach((rr, i) => stroke(ctx, [rr[0], rr[1]], { key: 'rayL' + i, color: 'fur', w: 2, alpha: 0.5 * ray, sketch: false }));
      POST.flash = (1 - seg(t, T.TURN, T.TURN + 0.5)) * 0.85;
    }
    P.screen(ctx);
    const yr = 1993 + Math.floor(10 * seg(t, T.years3[0], T.years3[1]) + 1e-6);
    cap(ctx, t, 'year', String(yr), T.years3[0] - 0.3, 1 - seg(t, T.TURN, T.TURN + 0.3));
    cap(ctx, t, 'name', 'чердак', T.years3[0], 1 - seg(t, T.TURN, T.TURN + 0.3));
  }

  // ---------- 4. 2003: Катя
  function scene4(ctx, t) {
    const K = GENS.katya;
    const ageK = growAge(K, t);
    const wD = seg(t, T.walkDoor4[0], T.walkDoor4[1]);
    let kx = 1010, kface = -1, walk = null;
    if (t >= T.walkDoor4[0]) { kx = lerp(1010, DOOR_X, easeInOut(wD)); kface = 1; walk = wD < 1 ? wD * Math.PI * 4 : null; }
    const hgK = easeInOut(seg(t, T.hug4[0], T.hug4[1]));
    const stK = { x: kx, age: ageK, face: kface, walk, key: 'katya', mood: t < T.hug4[1] + 0.8 ? 'happy' : 'smile', look: t > T.walkDoor4[1] ? 0 : undefined };
    const gK = personGeo(SPEC.katya, stK);
    const bc = arc2(gK.upC, gK.hugC, hgK, 0);
    const scarfP = seg(t, T.scarf[0], T.scarf[1]);
    const bear = { x: bc[0], y: bc[1] - BEAR_CY * BS, s: BS, rot: (1 - hgK) * Math.sin(t * 9) * 0.05, key: 'bear', marks: { button: 1, patch: 1, scarf: scarfP }, dust: 1 - seg(t, T.puff[0], T.puff[1]), puff: seg(t, T.puff[0], T.puff[1]) };
    const upH = sideHands(bc, BS, 18), hh = hugHands(bc, BS);
    stK.hands = { l: lerp2(upH.l, hh.l, hgK), r: lerp2(upH.r, hh.r, hgK) };
    stK.elbow = hgK < 0.5 ? 'out' : 'down';
    // бабушка Аня с клубком
    const stG = { x: 600, age: 52, face: 1, key: 'gran', lean: 0.05, draw: seg(t, T.granIn[0], T.granIn[1]), mood: 'smile' };
    const gG = personGeo(SPEC.anya52, stG);
    const yarnC = add(gG.up(gG.sw * 0.4, gG.shY + gG.R * 2.6), [0, 0]);
    stG.hands = { l: [yarnC[0] - 22, yarnC[1] + 6], r: [yarnC[0] + 24, yarnC[1] - 4] };
    const cam = camTrack(t, focus(bc, BS, CUT), [
      [T.pull4[0], T.pull4[1] - T.pull4[0], { x: 1000, y: 600, z: 1.6 }],
      [26.4, 0.9, { x: 820, y: 650, z: 1.45 }],
      [29.5, 0.7, DOORC],
      [T.exit4[0] + 0.2, T.exit4[1] - T.exit4[0] - 0.2, focus(bc, BS, CUT)]]);
    P.camera(ctx, cam);
    const oth = erase(t, T.exit4[0], T.exit4[0] + 0.6);
    const rp = seg(t, T.room4[0], T.room4[1]);
    drawFloor(ctx, 's4', rp, oth);
    drawWindow(ctx, 's4w', 760, 240, 1040, 570, rp, oth, { sun: true, curtains: true, plant: true });
    drawDoor(ctx, 's4d', rp, oth);
    drawMarks(ctx, genMarks(GENS.anya, t, true).concat(genMarks(GENS.lena, t, true), genMarks(K, t, false)), oth * seg(rp, 0.5, 1));
    stG.alpha = oth * erase(t, T.granOut[0], T.granOut[1]);
    drawPerson(ctx, SPEC.anya52, stG, 'body');
    drawYarn(ctx, 'yarn', yarnC, 22, stG.draw, stG.alpha);
    stK.alpha = oth;
    stK.draw = seg(t, T.pull4[0] + 0.1, T.pull4[0] + 0.9);
    drawPerson(ctx, SPEC.katya, stK, 'body');
    // нитка от клубка к шарфу
    if (scarfP > 0 && t < T.granOut[1]) {
      const M = bearM(bear), nk = M(-30, -112);
      const mid = [(yarnC[0] + nk[0]) / 2, Math.max(yarnC[1], nk[1]) + 60];
      stroke(ctx, curve([yarnC, mid, nk], false, 10), { key: 'yarnT', color: 'a2', w: 1.6, alpha: stG.alpha * (1 - seg(t, T.scarf[1], T.granOut[0])), p: seg(t, T.scarf[0], T.scarf[0] + 0.4), sketch: false });
    }
    drawBear(ctx, bear);
    drawPerson(ctx, SPEC.anya52, stG, 'arms');
    drawPerson(ctx, SPEC.katya, stK, 'arms');
    headLabel(ctx, gG, 'бабушка Аня', t, T.label4, stG.alpha * stG.draw, 'g4');
    P.screen(ctx);
    const cAl = erase(t, T.exit4[0], T.exit4[0] + 0.6);
    cap(ctx, t, 'year', String(K.born + Math.floor(ageK + 1e-6)), T.year4, cAl);
    cap(ctx, t, 'name', 'Катя, ' + ageText(Math.floor(ageK + 1e-6)), T.name4, cAl);
    cap(ctx, t, 'sub', 'внучка Ани', T.name4 + 0.35, cAl);
  }

  // ---------- 5–6. 2026: Соня и постер
  const POSTER = { x: 840, y: 925, s: 2.5 };
  function scene5(ctx, t) {
    const stP = { x: 790, age: 75, face: 1, lean: 0.12, key: 'prab', mood: 'smile' };
    const gP = personGeo(SPEC.anya75, stP);
    const hg = easeInOut(seg(t, T.give5[0], T.give5[1]));
    const stS = { x: 990, age: 3, face: -1, key: 'sonia', draw: seg(t, T.soniaIn[0], T.soniaIn[1]), mood: hg > 0.5 ? 'happy' : 'open', clip: 1 - seg(t, T.clip[0], T.clip[0] + 0.05) };
    const gS = personGeo(SPEC.sonia, stS);
    const tp = easeInOut(seg(t, T.toPoster[0], T.toPoster[1]));
    let bc = arc2(gP.giveC, gS.hugC, hg, 40);
    const posterC = bearCenter(POSTER.x, POSTER.y, POSTER.s);
    const bs = lerp(BS, POSTER.s, tp);
    if (tp > 0) bc = lerp2(bc, posterC, tp);
    const clipP = seg(t, T.clip[0], T.clip[1]);
    const bear = { x: bc[0], y: bc[1] - BEAR_CY * bs, s: bs, rot: hg * 0.05 * (1 - tp), key: 'bear', marks: { button: 1, patch: 1, scarf: 1, clip: clipP >= 1 ? 1 : 0 } };
    // руки
    const pHold = 1 - seg(t, T.give5[0] + 0.45, T.give5[1] + 0.1);
    const fol = sideHands(bc, BS, 6);
    stP.hands = { l: lerp2(gP.rest.l, fol.l, pHold), r: lerp2(gP.rest.r, fol.r, pHold) };
    const reachS = reachHands(gS);
    const hs = hugHands(bc, BS);
    const sHold = 1 - seg(t, T.toPoster[0], T.toPoster[0] + 0.3);
    stS.hands = hg <= 0 ? { l: lerp2(gS.rest.l, reachS.l, seg(t, 37.4, 38.0)), r: lerp2(gS.rest.r, reachS.r, seg(t, 37.4, 38.0)) }
      : { l: lerp2(gS.rest.l, lerp2(reachS.l, hs.l, hg), sHold), r: lerp2(gS.rest.r, lerp2(reachS.r, hs.r, hg), sHold) };
    // Лена и Катя рядом
    const stL = { x: 380, age: 51, face: 1, key: 'lena51', draw: seg(t, T.family5[0], T.family5[1]), mood: 'smile' };
    const stK = { x: 1320, age: 30, face: -1, key: 'katya30', draw: seg(t, T.family5[0] + 0.2, T.family5[1]), mood: 'smile' };
    const gL = personGeo(SPEC.lena51, stL), gK = personGeo(SPEC.katya, stK);
    void gL; void gK;
    // камера
    const cam = camTrack(t, focus(gP.giveC, BS, CUT), [
      [T.pull5[0], T.pull5[1] - T.pull5[0], { x: 850, y: 640, z: 1.22 }],
      [39.2, 1.8, { x: (gP.X + gS.X) / 2 + 10, y: 690, z: 1.85 }],
      [T.push5[0], T.push5[1] - T.push5[0], { x: (gP.X + gS.X) / 2 + 30, y: 700, z: 2.1 }],
      [T.toPoster[0], T.toPoster[1] - T.toPoster[0], CAM0]]);
    P.camera(ctx, cam);
    // тепло
    const warm = seg(t, T.warm[0], T.warm[1]);
    POST.warm = warm;
    POST.warmC = [(gS.X + bc[0]) / 2, gS.hugC[1]];
    const oth = erase(t, T.erase5[0], T.erase5[0] + 0.9);
    const rp = seg(t, T.room5[0], T.room5[1]);
    drawFloor(ctx, 's5', rp, oth);
    drawWindow(ctx, 's5w', 560, 230, 860, 560, rp, oth, { sun: true, curtains: true, plant: true });
    drawDoor(ctx, 's5d', rp, oth);
    drawMarks(ctx, genMarks(GENS.anya, t, true).concat(genMarks(GENS.lena, t, true), genMarks(GENS.katya, t, true)), oth * seg(rp, 0.5, 1), { noNames: true });
    // тёплый ореол штриховкой
    if (warm > 0) {
      const wc = [gS.X - 20, gS.hugC[1] - 20];
      hatch(ctx, [ellipsePoly(wc[0], wc[1], 260, 230, 0, 36), ellipsePoly(wc[0], wc[1], 150, 140, 0, 30)], { key: 'halo', color: 'warm', alpha: 0.22 * warm * oth, p: warm, gap: 7, w: 1.4, angle: -0.6, jitter: 8, maxLen: 40 });
    }
    stL.alpha = 0.85 * oth; stK.alpha = 0.85 * oth; stP.alpha = oth;
    stS.alpha = erase(t, T.erase5[0] + 0.5, T.erase5[1]);
    drawPerson(ctx, SPEC.lena51, stL);
    drawPerson(ctx, SPEC.katya, stK);
    stP.draw = seg(t, T.pull5[0], T.pull5[0] + 0.8);
    drawPerson(ctx, SPEC.anya75, stP, 'body');
    drawPerson(ctx, SPEC.sonia, stS, 'body');
    drawBear(ctx, bear);
    // заколка летит с головы Сони на ухо мишке
    if (clipP > 0 && clipP < 1) {
      const from = clipPos(gS), to = bearM(bear)(BG.ear[0], BG.ear[1]);
      const c = arc2(from, to, easeInOut(clipP), 70);
      drawHeart(ctx, c[0], c[1], lerp(gS.R * 0.2, 13 * BS, clipP), 'flyclip', 1, 1, 0.3 + clipP * 6.3);
    }
    drawPerson(ctx, SPEC.anya75, stP, 'arms');
    drawPerson(ctx, SPEC.sonia, stS, 'arms');
    const lbA = oth * erase(t, 39.1, 39.6);
    headLabel(ctx, gP, 'прабабушка Аня', t, T.labels5, lbA * stP.draw, 'p5');
    headLabel(ctx, gL, 'Лена', t, T.labels5 + 0.15, lbA * stL.draw * 0.9, 'l5');
    headLabel(ctx, gK, 'Катя', t, T.labels5 + 0.3, lbA * stK.draw * 0.9, 'k5');
    if (t >= T.s6) poster(ctx, t, bear);
    P.screen(ctx);
    const cAl = erase(t, T.erase5[0], T.erase5[0] + 0.9);
    cap(ctx, t, 'year', '2026', T.year5, cAl);
    cap(ctx, t, 'name', 'Соня, 3 года', T.name5, cAl);
    cap(ctx, t, 'sub', 'правнучка Ани', T.name5 + 0.35, cAl);
    if (t >= T.s6) posterText(ctx, t);
  }

  // стрелки-сноски к меткам на мишке
  function poster(ctx, t, bear) {
    const M = bearM(bear);
    const notes = [
      { to: M(-24, -174), from: [600, 520], text: 'пуговица — Аня, 1962', tx: 588, ty: 530, align: 'right', color: 'line' },
      { to: M(48, -217), from: [1060, 404], text: 'заколка — Соня, 2026', tx: 1074, ty: 414, align: 'left', color: 'warm' },
      { to: M(36, -96), from: [1060, 640], text: 'шарф — бабушка Аня, 2003', tx: 1074, ty: 650, align: 'left', color: 'a2' },
      { to: M(PATCH[0] + 14, PATCH[1] + 2), from: [1060, 880], text: 'заплатка — Лена, 1979', tx: 1074, ty: 890, align: 'left', color: 'a1' },
    ];
    notes.forEach((n, i) => {
      const t0 = T.notes[i];
      const pa = seg(t, t0, t0 + 0.35), pt = seg(t, t0 + 0.3, t0 + 0.9);
      const mid = [lerp(n.from[0], n.to[0], 0.5), lerp(n.from[1], n.to[1], 0.5) - 40];
      const pts = curve([n.from, mid, n.to], false, 10);
      stroke(ctx, pts, { key: 'arrow' + i, color: n.color, w: 2.4, p: pa });
      if (pa >= 1) {
        const e = pts[pts.length - 1], b2 = pts[pts.length - 4];
        const a = Math.atan2(e[1] - b2[1], e[0] - b2[0]);
        for (const d of [-0.5, 0.5]) stroke(ctx, [e, [e[0] - Math.cos(a + d) * 18, e[1] - Math.sin(a + d) * 18]], { key: 'ah' + i + d, color: n.color, w: 2.4, sketch: false, gaps: false });
      }
      write(ctx, n.text, n.tx, n.ty, { key: 'note' + i, size: 46, p: pt, align: n.align });
    });
  }
  function posterText(ctx, t) {
    write(ctx, 'Мишка', 110, 190, { key: 'p:title', size: 140, p: seg(t, T.title6[0], T.title6[1]), weight: 700 });
    write(ctx, '1956 – 2026', 116, 270, { key: 'p:years', size: 62, p: seg(t, T.years6[0], T.years6[1]) });
    write(ctx, 'Аня · Лена · Катя · Соня', 118, 336, { key: 'p:names', size: 44, p: seg(t, T.names6[0], T.names6[1]), color: 'soft' });
    write(ctx, 'Он помнит всех, кого обнимал.', W / 2, 1040, { key: 'p:moral', size: 56, align: 'center', p: seg(t, T.moral[0], T.moral[1]) });
  }

  // =====================================================================
  // КАДР
  // =====================================================================
  let ink = null, inkCtx = null;
  function renderFrame(main, tRaw) {
    // «на двойках»: рисунок меняется 12 раз в секунду
    const t = Math.floor(tRaw * P.DRAW_FPS + 1e-6) / P.DRAW_FPS;
    if (!ink) { ink = P.makeCanvas(W, H); inkCtx = ink.getContext('2d'); }
    P.begin(t, inkCtx);
    P.fade = t < T.TURN ? 1 : 1 - seg(t, T.TURN, T.TURN + 0.6);
    POST.night = 0; POST.flash = 0; POST.warm = t >= T.warm[0] ? 1 : 0;
    if (t < T.s2) scene1(inkCtx, t);
    else if (t < T.s3) scene2(inkCtx, t);
    else if (t < T.s4) scene3(inkCtx, t);
    else if (t < T.s5) scene4(inkCtx, t);
    else scene5(inkCtx, Math.min(t, T.END));
    P.compose(main, inkCtx);
    post(main, t);
  }
  function post(main, t) {
    main.setTransform(1, 0, 0, 1, 0, 0);
    if (POST.night > 0.01) {
      main.globalCompositeOperation = 'multiply';
      const gr = main.createRadialGradient(1300, 330, 60, 1100, 600, 1300);
      gr.addColorStop(0, P.col('night', 0.15 * POST.night));
      gr.addColorStop(1, P.col('night', 0.55 * POST.night));
      main.fillStyle = gr; main.fillRect(0, 0, W, H);
    }
    if (POST.warm > 0.01) {
      main.globalCompositeOperation = 'multiply';
      main.fillStyle = `rgba(255,226,190,${0.35 * POST.warm})`;
      main.fillRect(0, 0, W, H);
      main.globalCompositeOperation = 'screen';
      const gr = main.createRadialGradient(W / 2, H * 0.55, 40, W / 2, H * 0.55, 900);
      gr.addColorStop(0, `rgba(255,214,150,${0.22 * POST.warm})`);
      gr.addColorStop(1, 'rgba(255,214,150,0)');
      main.fillStyle = gr; main.fillRect(0, 0, W, H);
    }
    if (POST.flash > 0.01) {
      main.globalCompositeOperation = 'screen';
      main.fillStyle = P.col('light', POST.flash);
      main.fillRect(0, 0, W, H);
    }
    main.globalCompositeOperation = 'source-over';
  }

  // =====================================================================
  // ЗВУКОВЫЕ СОБЫТИЯ — из тех же констант, что и картинка
  // =====================================================================
  function soundEvents() {
    const ev = { scratch: [], ticks: [], marks: [], steps: [], chimes: [], hugs: [], clicks: [], stitches: [], thuds: [], puffs: [], knits: [], whoosh: [], ratchet: T.crack, turn: T.TURN, notes: [] };
    // карандаш шуршит, когда рисует
    ev.scratch.push([0.0, T.bearDraw[1], 0.9], [T.title[0], T.sub[1], 0.6], [T.tree[0], T.door1[1], 0.7], [T.anyaIn[0], T.anyaIn[1], 0.6],
      [T.room2[0], T.room2[1], 0.7], [T.patch[0], T.patch[1], 0.5], [T.box2[0], T.box2[1], 0.5], [T.attic[0], T.attic[1], 0.45],
      [T.room4[0], T.room4[1], 0.7], [T.granIn[0], T.granIn[1], 0.5], [T.scarf[0], T.scarf[1], 0.4], [T.room5[0], T.family5[1], 0.7],
      [T.title6[0], T.moral[1], 0.6]);
    T.notes.forEach((n) => ev.scratch.push([n, n + 0.9, 0.55]));
    for (const g of [GENS.anya, GENS.lena, GENS.katya]) {
      for (let a = Math.floor(g.from) + 1; a <= g.to; a++) ev.ticks.push(ageCrossTime(g, a));
      for (const a of g.ages) ev.marks.push(ageCrossTime(g, a) + 0.02);
    }
    for (let y = 1; y <= 10; y++) ev.ticks.push(lerp(T.years3[0], T.years3[1], y / 10));
    const walk = (w, n) => { for (let i = 0; i < n; i++) ev.steps.push(lerp(w[0], w[1], (i + 0.5) / n)); };
    walk(T.anyaWalk, 4); walk(T.walkDoor1, 5); walk(T.walkDoor2, 4); walk(T.walkDoor4, 4);
    ev.chimes.push(T.hug1[0] + 0.35, T.give2[1] - 0.1, T.hug4[0] + 0.3, T.give5[1] - 0.1, T.clip[1]);
    ev.hugs.push(T.hug1[1] - 0.1, T.give2[1], T.hug4[1] - 0.1, T.give5[1] + 0.05);
    ev.clicks.push(T.button[0] + 0.25);
    for (let i = 0; i < 5; i++) ev.stitches.push(lerp(T.patch[0] + 0.2, T.patch[1], i / 4));
    ev.thuds.push(T.lidClose[1]);
    ev.puffs.push(T.puff[0] + 0.1);
    for (let i = 0; i < 8; i++) ev.knits.push(lerp(T.scarf[0], T.scarf[1], i / 7));
    ev.whoosh.push(T.pull1[0], T.exit1[1] - 0.3, T.exit2[1] - 0.3, T.rise[0] + 0.1, T.exit4[1] - 0.3, T.toPoster[0]);
    ev.notes = T.notes.slice();
    return ev;
  }

  P.setTheme(THEME);
  global.STORY = { T, THEME, renderFrame, soundEvents, setTheme: P.setTheme, chapters: [
    { t: 0, label: 'Мишка' }, { t: 4.4, label: '1956' }, { t: T.s2, label: '1979' }, { t: T.s3, label: 'чердак' },
    { t: T.s4, label: '2003' }, { t: T.s5, label: '2026' }, { t: T.s6, label: 'постер' }] };
})(typeof window !== 'undefined' ? window : globalThis);
