/* =========================================================================
   figures.js — люди и мишка в 3D, нарисованные карандашом и мелком
   -------------------------------------------------------------------------
   Человек — скелет (таз, позвоночник, плечи, бёдра) с обратной кинематикой
   рук и ног. Пропорции по возрасту: ребёнок ≈ 5 голов, взрослый ≈ 7,5.
   Лицо лежит на поверхности головы и честно поворачивается в 3/4 и профиль.
   ========================================================================= */
(function (global) {
  'use strict';
  const P = global.PEN, S = global.SPACE;
  const { clamp, lerp, seg } = P;
  const { add, sub, mul, madd, dot, cross, len, norm, lerp3, frame, at, dirIn } = S;

  function tab(arr, x) {
    if (x <= arr[0][0]) return arr[0][1];
    for (let i = 1; i < arr.length; i++) if (x <= arr[i][0]) {
      const [x0, y0] = arr[i - 1], [x1, y1] = arr[i];
      return lerp(y0, y1, (x - x0) / (x1 - x0));
    }
    return arr[arr.length - 1][1];
  }
  const HEIGHT_TAB = [[1, 75], [2, 86], [3, 95], [4, 102], [5, 109], [6, 115], [7, 121], [8, 127], [10, 138], [12, 150], [14, 159], [16, 163], [18, 165], [60, 165], [80, 160]];
  const HEADS_TAB = [[1, 4.0], [3, 4.6], [5, 5.3], [7, 5.8], [10, 6.4], [13, 7.0], [16, 7.4], [18, 7.5], [80, 7.4]];
  const LEG_TAB = [[1, 0.38], [3, 0.41], [5, 0.44], [8, 0.47], [12, 0.49], [16, 0.5], [80, 0.49]];
  const heightOf = (spec, age) => tab(HEIGHT_TAB, age) * (spec.hk || 1) * (spec.old ? 0.96 : 1);
  const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

  // двухзвенная обратная кинематика в 3D: A — сустав, T — цель, pole — куда гнуть
  function ik3(A, T, l1, l2, pole) {
    const d = sub(T, A);
    let dist = len(d);
    const dn = dist > 1e-6 ? mul(d, 1 / dist) : [0, -1, 0];
    dist = clamp(dist, Math.abs(l1 - l2) + 0.5, (l1 + l2) * 0.999);
    const cosA = clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1);
    const sinA = Math.sqrt(1 - cosA * cosA);
    let b = sub(pole, mul(dn, dot(pole, dn)));
    if (len(b) < 1e-4) b = Math.abs(dn[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    b = norm(b);
    return { J: add(A, add(mul(dn, l1 * cosA), mul(b, l1 * sinA))), E: madd(A, dn, dist) };
  }
  // точка на поверхности эллипсоида E = {c, fr, r}: долгота (0 — вперёд), широта (вверх +)
  function surf(E, lon, lat, out = 0) {
    const cl = Math.cos(lat);
    const lx = E.r[0] * cl * Math.sin(lon), ly = E.r[1] * Math.sin(lat), lz = E.r[2] * cl * Math.cos(lon);
    const n = norm(dirIn(E.fr, lx / (E.r[0] * E.r[0]), ly / (E.r[1] * E.r[1]), lz / (E.r[2] * E.r[2])));
    return { p: add(at(E.c, E.fr, lx, ly, lz), mul(n, out)), n };
  }
  // насколько точка повёрнута к зрителю: 0 — профиль, 1 — анфас
  const facing = (s) => dot(s.n, S.toViewer(s.p));
  // объединение 2D-форм для штриховки (голова = череп + челюсть)
  function unionShape(shapes) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    shapes.forEach((s) => { x0 = Math.min(x0, s.x0); y0 = Math.min(y0, s.y0); x1 = Math.max(x1, s.x1); y1 = Math.max(y1, s.y1); });
    return { cx: shapes[0].cx, cy: shapes[0].cy, x0, y0, x1, y1, test(x, y) { for (const s of shapes) { const n = s.test(x, y); if (n) return n; } return null; } };
  }
  const shapeOf = (e, flat = 1) => P.ellShape(e.cx, e.cy, e.rx, e.ry, e.rot, flat);

  // =====================================================================
  // СКЕЛЕТ ЧЕЛОВЕКА
  // =====================================================================
  function rig(spec, st) {
    const age = st.age;
    const Hc = heightOf(spec, age);
    const hh = Hc / tab(HEADS_TAB, age);
    const a = clamp((age - 3) / 15);
    const yaw = st.yaw || 0;
    const B = frame(yaw);
    const root = [st.pos[0], 0, st.pos[1]];
    const legLen = Hc * tab(LEG_TAB, age);
    const c = st.crouch || 0;
    const ph = st.walk, walking = ph !== undefined && ph !== null;
    const amp = st.walkAmp === undefined ? 1 : st.walkAmp, run = st.run || 0;
    const bob = walking ? (1 - Math.abs(Math.sin(ph))) * Hc * 0.012 * amp * (1 + run) : 0;
    const pelvis = madd(madd(root, [0, 1, 0], legLen * (1 - c * 0.45) - bob + (st.lift || 0)), B.f, -c * Hc * 0.09);
    const bend = (st.bend || 0) + c * 0.45 + run * 0.18 + (spec.old ? 0.1 : 0);
    const twist = st.twist || 0;
    const T = frame(yaw + twist, bend, st.lean || 0);
    const torsoLen = (Hc - hh * lerp(1.2, 1.35, a)) - legLen;
    const neckBase = madd(pelvis, T.u, torsoLen);
    const chest = madd(pelvis, T.u, torsoLen * 0.72);
    const waist = madd(pelvis, T.u, torsoLen * 0.38);
    const shW = Hc * lerp(0.118, 0.112, a);
    const shoulders = [-1, 1].map((s) => madd(madd(neckBase, T.r, s * shW * 0.93), T.u, -Hc * 0.045));
    // голова смотрит на цель
    const neckLen = hh * lerp(0.28, 0.42, a);
    const neckTop = madd(neckBase, T.u, neckLen);
    let hy = st.headYaw || 0, hp = st.headPitch || 0;
    if (st.look) {
      const hc0 = madd(neckTop, T.u, hh * 0.45);
      const dir = sub(st.look, hc0);
      const yT = Math.atan2(dir[0], dir[2]), pT = -Math.atan2(dir[1], Math.hypot(dir[0], dir[2]));
      hy = clamp(wrap(yT - (yaw + twist)), -1.25, 1.25);
      hp = clamp(pT - bend * 0.5, -0.6, 0.8);
    }
    const HF = frame(yaw + twist + hy, bend * 0.5 + hp, (st.lean || 0) * 0.6 + (st.headTilt || 0));
    const cran = { c: madd(madd(neckTop, HF.u, hh * lerp(0.44, 0.5, a)), HF.f, hh * 0.03), fr: HF, r: [hh * lerp(0.41, 0.36, a), hh * lerp(0.44, 0.42, a), hh * lerp(0.48, 0.47, a)] };
    const jaw = { c: madd(madd(cran.c, HF.u, -hh * lerp(0.25, 0.31, a)), HF.f, hh * lerp(0.06, 0.08, a)), fr: HF, r: [hh * lerp(0.31, 0.27, a), hh * lerp(0.27, 0.31, a), hh * lerp(0.32, 0.33, a)] };
    // ноги
    const hipW = Hc * 0.052;
    const PB = frame(yaw + twist * 0.3);
    const ankleH = Hc * 0.035;
    const thigh = (legLen - ankleH) * 0.52, shin = (legLen - ankleH) * 0.48;
    const legs = [-1, 1].map((s, i) => {
      const hip = madd(pelvis, PB.r, s * hipW);
      let foot = st.feet && st.feet[i];
      if (!foot) {
        const phase = walking ? ph + (i ? Math.PI : 0) : 0;
        const stride = walking ? Math.sin(phase) * Hc * 0.15 * amp * (1 + run * 0.6) : 0;
        const lift = walking ? Math.max(0, Math.cos(phase)) * Hc * 0.05 * amp * (1 + run) : 0;
        foot = madd(madd(madd(root, B.r, s * hipW * (1.05 + c * 0.7)), B.f, stride + c * Hc * 0.03), [0, 1, 0], ankleH + lift);
      }
      const k = ik3(hip, foot, thigh, shin, B.f);
      return { hip, knee: k.J, ankle: k.E, s, dir: B.f };
    });
    // руки
    const ua = Hc * lerp(0.165, 0.185, a), fa = Hc * lerp(0.14, 0.155, a);
    const arms = [-1, 1].map((s, i) => {
      const sh = shoulders[i];
      let tg = st.hands && st.hands[i];
      if (!tg) {
        const swing = walking ? -Math.sin(ph + (i ? Math.PI : 0)) * Hc * 0.08 * amp * (1 + run) : 0;
        tg = madd(madd(madd(sh, [0, 1, 0], -(ua + fa) * (run ? 0.75 : 0.95)), T.f, Hc * 0.035 + swing), T.r, s * Hc * 0.03);
      }
      const pole = norm(add(add(mul(T.f, -0.7), mul(T.r, s * 0.65)), [0, -0.35, 0]));
      const k = ik3(sh, tg, ua, fa, pole);
      return { sh, elbow: k.J, wrist: k.E, s };
    });
    return { spec, st, age, a, Hc, hh, B, T, PB, HF, root, pelvis, chest, waist, neckBase, neckTop, shW, shoulders, cran, jaw, legs, arms, legLen, ua, fa };
  }

  // =====================================================================
  // ЛИЦО
  // =====================================================================
  function drawFace(g, k, al, p) {
    if (p <= 0) return;
    const { hh, a, cran, jaw, spec, st } = g;
    const G = P.L.graphite, C = P.L.color;
    const eyeLat = lerp(-0.32, -0.2, a), eyeLon = lerp(0.43, 0.39, a);
    const ew = hh * lerp(0.085, 0.075, a), eh = hh * lerp(0.042, 0.032, a);
    const mood = st.mood || 'calm';
    const lw = clamp(hh * S.proj(cran.c)[3] * 0.012, 0.9, 2.4); // толщина черт по размеру головы на экране
    const tangents = (lon, lat) => {
      const s0 = surf(cran, lon, lat), sT = surf(cran, lon + 0.02, lat), sB = surf(cran, lon, lat + 0.02);
      return { s: s0, T: norm(sub(sT.p, s0.p)), Bv: norm(sub(sB.p, s0.p)) };
    };
    const P2 = (pt) => { const q = S.proj(pt); return q ? [q[0], q[1]] : null; };
    const curve3 = (pts) => pts.map(P2).filter(Boolean);
    const vis = (s) => clamp((facing(s) - 0.08) / 0.25);
    const lk = clamp((st.eyeLook || 0), -1, 1) * 0.35;
    // глаза
    for (const sd of [-1, 1]) {
      const fr = tangents(sd * eyeLon, eyeLat);
      const v = vis(fr.s);
      if (v <= 0) continue;
      const A = al * v;
      const E = madd(fr.s.p, fr.s.n, hh * 0.006);
      const pt = (cx, cy) => add(E, add(mul(fr.T, cx), mul(fr.Bv, cy)));
      if (mood === 'happy' || st.eyesClosed) {
        const arcPts = []; for (let i = 0; i <= 8; i++) { const t = (i / 8) * Math.PI; arcPts.push(pt(Math.cos(t) * ew * sd, -Math.sin(t) * eh * 0.8 + eh * 0.3)); }
        P.stroke(G, curve3(arcPts), { key: k + ':ec' + sd, w: lw * 1.3, alpha: A, p, sketch: false, gaps: false });
        continue;
      }
      // белок
      const almond = [];
      for (let i = 0; i <= 12; i++) { const t = (i / 12) * Math.PI; almond.push(pt(Math.cos(t) * ew * sd, Math.sin(t) * eh * (1 + 0.25 * Math.cos(t) * sd))); }
      for (let i = 1; i < 12; i++) { const t = Math.PI + (i / 12) * Math.PI; almond.push(pt(Math.cos(t) * ew * sd, Math.sin(t) * eh * 0.75)); }
      const al2 = curve3(almond);
      if (al2.length > 4) {
        S.knock([al2], A * 0.9);
        P.crayon(C, P.polyShape(al2), { key: k + ':wh' + sd, color: 'light', alpha: 0.85 * A, w: 3, gap: 2.2, angle: 0.2 });
        // радужка и зрачок
        const irisC = pt(lk * ew * 0.5 * sd, -eh * 0.05);
        const ir = S.projEll(irisC, [mul(fr.T, eh * 0.95), mul(fr.Bv, eh * 0.95), mul(fr.s.n, 0.01)]);
        if (ir) {
          const irisPoly = S.ellPoly(ir, 18);
          P.crayon(C, P.ellShape(ir.cx, ir.cy, ir.rx, ir.ry, ir.rot), { key: k + ':ir' + sd, color: spec.eyes || 'hairBrown', alpha: 0.9 * A, w: 2.5, gap: 1.8, angle: -0.6 });
          P.blob(G, ir.cx, ir.cy, ir.rx * 0.48, ir.ry * 0.48, { key: k + ':pu' + sd, alpha: A * 0.9 });
          C.fillStyle = P.col('light', 0.95 * A);
          C.beginPath(); C.arc(ir.cx - ir.rx * 0.3, ir.cy - ir.ry * 0.35, Math.max(0.8, ir.rx * 0.22), 0, 6.283); C.fill();
          void irisPoly;
        }
        // верхнее веко — главная линия глаза, нижнее — тонкая
        P.stroke(G, al2.slice(0, 13), { key: k + ':lu' + sd, w: lw * 1.5, alpha: A, p, sketch: false, gaps: false });
        P.stroke(G, al2.slice(13).concat([al2[0]]), { key: k + ':ll' + sd, w: lw * 0.7, alpha: A * 0.7, p, sketch: false, gaps: false });
        // складка века
        const crease = []; for (let i = 2; i <= 10; i++) { const t = (i / 12) * Math.PI; crease.push(pt(Math.cos(t) * ew * 0.9 * sd, eh * 1.9 + Math.sin(t) * eh * 0.5)); }
        P.stroke(G, curve3(crease), { key: k + ':cr' + sd, w: lw * 0.6, alpha: A * 0.5, p, sketch: false, gaps: false });
      }
      // бровь
      const brow = []; for (let i = 0; i <= 6; i++) { const u = i / 6; brow.push(pt((u - 0.45) * ew * 2.4 * sd, eh * 3.4 + Math.sin(u * Math.PI) * eh * 0.8 - u * eh * 0.4)); }
      P.stroke(G, curve3(brow), { key: k + ':br' + sd, w: lw * 1.4, alpha: A * 0.85, p, sketch: false, color: spec.hairColor + ':dk' });
      if (spec.old) { // морщинки у глаз
        for (let j = 0; j < 2; j++) P.stroke(G, curve3([pt(ew * 1.15 * sd, eh * (0.4 - j * 0.6)), pt(ew * 1.45 * sd, eh * (0.7 - j * 1.1))]), { key: k + ':wr' + sd + j, w: lw * 0.6, alpha: A * 0.5, sketch: false, gaps: false });
      }
      if (spec.glasses) {
        const rim = []; for (let i = 0; i <= 18; i++) { const t = (i / 18) * Math.PI * 2; rim.push(madd(pt(Math.cos(t) * ew * 1.45 * sd, Math.sin(t) * eh * 2.3 - eh * 0.2), fr.s.n, hh * 0.06)); }
        P.stroke(G, curve3(rim), { key: k + ':gl' + sd, w: lw * 1.1, alpha: A, p, sketch: false });
        const gs = curve3(rim.slice(2, 6));
        if (gs.length > 1) P.stroke(C, gs, { key: k + ':gls' + sd, color: 'light', w: 2.4, alpha: 0.8 * A, sketch: false });
      }
    }
    // нос: линия теневой стороны и крылья
    const noseLat = lerp(-0.62, -0.58, a);
    const base = surf(cran, 0, noseLat);
    const vN = vis(base);
    const noseOut = hh * lerp(0.045, 0.085, a);
    // объём носа (без контура): в профиле даёт горбинку силуэта
    const nm = surf(cran, 0, lerp(noseLat, eyeLat, 0.35), noseOut * 0.45);
    const nE = S.projEll(nm.p, [mul(cran.fr.r, hh * lerp(0.05, 0.06, a)), mul(cran.fr.u, hh * lerp(0.08, 0.12, a)), mul(nm.n, noseOut * 0.75)]);
    if (nE && facing(nm) > -0.6) {
      S.knock([S.ellPoly(nE, 20)], al * 0.9);
      P.volume(P.ellShape(nE.cx, nE.cy, nE.rx, nE.ry, nE.rot), { key: k + ':noseV', color: 'skin', alpha: al, p, light: S.lightS(nm.p), w: 0.3, noCore: true, shadowAt: 0.15, shA: 0.6, shine: 0.6 });
    }
    if (vN > 0) {
      const tip = surf(cran, 0, noseLat, noseOut);
      const bridge = surf(cran, 0, eyeLat + 0.05, hh * 0.015);
      const l = S.lightS(tip.p);
      const sdS = dot(S.CAM.r, cran.fr.r) * (l[0] > 0 ? -1 : 1) >= 0 ? 1 : -1;
      const side = surf(cran, 0.07 * sdS, lerp(noseLat + 0.05, eyeLat - 0.05, 0.5), noseOut * 0.4);
      P.stroke(G, curve3([bridge.p, side.p, tip.p]), { key: k + ':ns', w: lw * 1.0, alpha: al * vN * 0.75, p, sketch: false });
      const nost = []; for (let i = 0; i <= 6; i++) { const u = i / 6; nost.push(add(tip.p, add(mul(cran.fr.r, (u - 0.5) * hh * 0.11), mul(cran.fr.u, -hh * 0.03 - Math.sin(u * Math.PI) * hh * 0.012)))); }
      P.stroke(G, curve3(nost), { key: k + ':nb', w: lw * 1.1, alpha: al * vN * 0.85, p, sketch: false });
    }
    // рот
    const mouthLat = lerp(-0.08, 0.02, a);
    const mc = surf(jaw, 0, mouthLat);
    const vM = vis(mc);
    if (vM > 0) {
      const mw = lerp(0.24, 0.27, a), smile = mood === 'calm' ? 0.04 : mood === 'sad' ? -0.06 : 0.12;
      const mpts = [];
      for (let i = 0; i <= 8; i++) { const u = i / 8 * 2 - 1; const s = surf(jaw, u * mw, mouthLat + smile * u * u - 0.015 * (1 - u * u)); mpts.push(s.p); }
      if (mood === 'open') {
        const low = []; for (let i = 8; i >= 0; i--) { const u = i / 8 * 2 - 1; low.push(surf(jaw, u * mw * 0.85, mouthLat - 0.16 * (1 - u * u)).p); }
        const poly = curve3(mpts.concat(low));
        if (poly.length > 4) { S.knock([poly], al * vM); P.crayon(C, P.polyShape(poly), { key: k + ':mo', color: 'warm:dk', alpha: 0.8 * al * vM, w: 3, gap: 2 }); P.stroke(G, poly, { key: k + ':mol', closed: true, w: lw, alpha: al * vM, p, sketch: false }); }
      } else {
        P.stroke(G, curve3(mpts), { key: k + ':m', w: lw * 1.2, alpha: al * vM, p, sketch: false });
        // губы: лёгкий цвет и нижняя губа
        const lip = []; for (let i = 0; i <= 6; i++) { const u = i / 6 * 2 - 1; lip.push(surf(jaw, u * mw * 0.55, mouthLat - 0.07 - 0.03 * (1 - u * u)).p); }
        P.stroke(G, curve3(lip), { key: k + ':lip', w: lw * 0.7, alpha: al * vM * 0.45, p, sketch: false });
        P.stroke(C, curve3(mpts.slice(2, 7)), { key: k + ':lipc', color: 'warm', w: lw * 2.5, alpha: al * vM * 0.25, sketch: false });
      }
      // румянец у детей
      if (g.age < 9) for (const sd of [-1, 1]) {
        const ch = surf(cran, sd * 0.62, eyeLat - 0.32);
        const e2 = S.projEll(ch.p, [mul(cran.fr.r, hh * 0.09), mul(cran.fr.u, hh * 0.05), mul(ch.n, 0.01)]);
        if (e2 && vis(ch) > 0) P.crayon(C, P.ellShape(e2.cx, e2.cy, e2.rx * 0.8, e2.ry * 0.8, e2.rot), { key: k + ':bl' + sd, color: 'warm', alpha: 0.14 * al * vis(ch), w: 5, gap: 4 });
      }
    }
  }
  // уши: завиток, видны только в повороте
  function drawEars(g, k, al, p) {
    const { cran, hh } = g;
    for (const sd of [-1, 1]) {
      const s0 = surf(cran, sd * 1.5, lerp(-0.42, -0.32, g.a));
      const v = facing(s0);
      if (v < 0.25) continue;
      const A = al * clamp((v - 0.25) / 0.3);
      const pts = [];
      for (let i = 0; i <= 10; i++) {
        const t = -0.4 + (i / 10) * Math.PI * 1.25;
        pts.push(add(add(s0.p, mul(cran.fr.u, Math.cos(t) * hh * 0.1)), add(mul(cran.fr.f, Math.sin(t) * hh * 0.055 * -sd * Math.sign(dot(cran.fr.r, s0.n) || 1)), mul(s0.n, hh * 0.015))));
      }
      const q = pts.map((x) => S.proj(x)).filter(Boolean).map((x) => [x[0], x[1]]);
      if (q.length < 4) continue;
      P.crayon(P.L.color, P.polyShape(q), { key: k + ':earC' + sd, color: 'skin:sh', alpha: 0.35 * A, w: 3, gap: 2.5 });
      P.stroke(P.L.graphite, q, { key: k + ':ear' + sd, w: 1.5, alpha: A * 0.9, p, sketch: false });
    }
  }

  // =====================================================================
  // ПРИЧЁСКИ: объёмные пряди-эллипсоиды вокруг черепа
  // =====================================================================
  function hairMasses(style, g) {
    const { hh } = g;
    const m = [];
    const cap = (y = 0.04, z = -0.05, sc = 1.045) => m.push({ id: 'cap', c: [0, y, z], r: [g.cran.r[0] / hh * sc, g.cran.r[1] / hh * (sc - 0.02), g.cran.r[2] / hh * sc] });
    switch (style) {
      case 'pigtails':
        cap();
        for (const sd of [-1, 1]) {
          m.push({ id: 'pt' + sd, c: [sd * 0.5, -0.36, -0.2], r: [0.12, 0.28, 0.13], roll: sd * 0.35 });
          m.push({ id: 'bw' + sd, c: [sd * 0.42, -0.08, -0.22], r: [0.08, 0.06, 0.06], role: 'a1' });
        }
        break;
      case 'bun':
        cap(0.05, -0.05, 1.04);
        m.push({ id: 'bun', c: [0, 0.4, -0.34], r: [0.19, 0.16, 0.17] });
        break;
      case 'bob':
        cap(0.04, -0.05, 1.06);
        for (const sd of [-1, 1]) m.push({ id: 'sd' + sd, c: [sd * 0.32, -0.17, -0.04], r: [0.12, 0.33, 0.36] });
        m.push({ id: 'bk', c: [0, -0.12, -0.3], r: [0.38, 0.32, 0.2] });
        break;
      case 'ponytail':
        cap();
        m.push({ id: 'tie', c: [0, 0.08, -0.5], r: [0.07, 0.07, 0.06], role: 'warm:dk' });
        m.push({ id: 'tail', c: [0, -0.22, -0.58], r: [0.12, 0.33, 0.12], pitch: -0.25 });
        break;
      case 'long':
        cap(0.05, -0.05, 1.06);
        m.push({ id: 'bk', c: [0, -0.35, -0.3], r: [0.42, 0.5, 0.2] });
        break;
      case 'sprout':
        cap(0.04, -0.05, 1.04);
        m.push({ id: 'sp', c: [0, 0.52, -0.02], r: [0.08, 0.1, 0.08] });
        break;
      default: cap();
    }
    return m;
  }
  function pushHair(g, k, al, p) {
    const { hh, cran, spec, st } = g;
    const hm = spec.hairKid === spec.hairAdult ? 0 : seg(g.age, 11, 15);
    const sets = [];
    if (hm < 1) sets.push([spec.hairKid, 1 - hm, 'k']);
    if (hm > 0) sets.push([spec.hairAdult, hm, 'a']);
    const dHead = S.depth(cran.c);
    for (const [style, mix, tag] of sets) {
      const groups = { back: [], front: [] };
      for (const ms of hairMasses(style, g)) {
        let fr = cran.fr;
        if (ms.yaw || ms.pitch || ms.roll) {
          const fr2 = { r: fr.r, u: fr.u, f: fr.f };
          if (ms.roll) { const c = Math.cos(ms.roll), s = Math.sin(ms.roll); fr2.u = add(mul(fr.u, c), mul(fr.r, -s)); fr2.r = add(mul(fr.r, c), mul(fr.u, s)); }
          if (ms.pitch) { const c = Math.cos(ms.pitch), s = Math.sin(ms.pitch); const u = fr2.u; fr2.u = add(mul(u, c), mul(fr2.f, s)); fr2.f = sub(mul(fr2.f, c), mul(u, s)); }
          if (ms.yaw) { const c = Math.cos(ms.yaw), s = Math.sin(ms.yaw); const f0 = fr2.f; fr2.f = add(mul(f0, c), mul(fr2.r, s)); fr2.r = sub(mul(fr2.r, c), mul(f0, s)); }
          fr = fr2;
        }
        const c = at(cran.c, cran.fr, ms.c[0] * hh, ms.c[1] * hh, ms.c[2] * hh);
        const E = { c, fr, r: ms.r.map((v) => v * hh), id: ms.id, role: ms.role };
        if (ms.role) { // бантики и резинки — отдельные мелкие объёмы
          S.push(S.depth(c) - 0.5, () => S.drawEll(k + ':h' + tag + ms.id, c, fr, E.r, { color: ms.role, alpha: al * mix, p, lw: 1.4, ws: 0.3, shade: { noCore: true, shine: 1.2 } }));
          continue;
        }
        if (ms.id === 'cap') { S.push(dHead - hh * 0.35, () => drawCap(g, E, style, k + ':cap' + tag, al * mix, p)); continue; }
        (S.depth(c) > dHead ? groups.back : groups.front).push(E);
      }
      // разбить на группы касающихся прядей (иначе общий контур протянется через лицо)
      const clusters = [];
      for (const gname of ['back', 'front']) {
        const list = groups[gname];
        const used = new Array(list.length).fill(false);
        for (let i = 0; i < list.length; i++) {
          if (used[i]) continue;
          const cl = [list[i]]; used[i] = true;
          for (let changed = true; changed;) {
            changed = false;
            for (let j = 0; j < list.length; j++) {
              if (used[j]) continue;
              if (cl.some((E) => len(sub(E.c, list[j].c)) < (Math.max(...E.r) + Math.max(...list[j].r)) * 0.92)) { cl.push(list[j]); used[j] = true; changed = true; }
            }
          }
          clusters.push([gname, cl, clusters.length]);
        }
      }
      for (const [gname, list, ci] of clusters) {
        const key = k + ':h' + tag + gname + ci;
        S.push(gname === 'back' ? dHead + hh * 0.3 : Math.min(dHead - hh * 0.55, ...list.map((E) => S.depth(E.c))), () => {
          const es = list.map((E) => S.projEll(E.c, S.ellAxes(E.fr, E.r))).filter(Boolean);
          if (!es.length) return;
          const outline = es.length > 1 ? S.unionOutline(es, 36) : S.ellPoly(es[0], 36);
          if (outline.length < 3) return;
          const role = spec.hairColor;
          const l = S.lightS(cran.c);
          S.knock([outline], al * mix * clamp(p * 3));
          P.volume(unionShape(es.map((e) => shapeOf(e))), { key: key + ':v', color: role, alpha: al * mix, p, light: l, w: 0.55, shine: 0.95, lightAt: 0.78, dense: 1.15 });
          // пряди по поверхности каждой массы
          list.forEach((E, mi) => {
            const nStr = E.id === 'cap' || E.id === 'bk' ? 9 : 4;
            for (let i = 0; i < nStr; i++) {
              const lon = -1.25 + (i + 0.5) / nStr * 2.5;
              const pts = [];
              for (let jj = 0; jj <= 6; jj++) { const sf = surf(E, lon + Math.sin(jj * 0.5) * 0.08, 1.2 - jj * 0.32, E.r[2] * 0.01); if (facing(sf) > 0.05) { const q = S.proj(sf.p); if (q) pts.push([q[0], q[1]]); } }
              if (pts.length > 2) P.stroke(P.L.graphite, pts, { key: key + ':s' + mi + '_' + i, w: 1.0, alpha: al * mix * 0.5, p, sketch: false, color: role + ':dk' });
            }
          });
          P.stroke(P.L.graphite, outline, { key: key + ':o', closed: true, w: 1.7, alpha: al * mix * (gname === 'front' ? 0.65 : 0.85), p, color: role + ':dk', wAt: S.weightFn(outline, l) });
        });
      }
    }
    // заколка-сердечко у Сони
    if (st.clip > 0) {
      const s = surf(cran, -0.75, 0.55, hh * 0.04);
      S.push(S.depth(s.p) - hh, () => drawHeart3(k + ':clip', s.p, { r: cran.fr.r, u: cran.fr.u, f: s.n }, hh * 0.09, al * st.clip));
    }
  }
  // линия роста волос: широта границы для долготы (0 — лоб, ±π — затылок)
  const FRONT = { pigtails: 0.24, bob: 0.1, ponytail: 0.46, bun: 0.5, long: 0.42, sprout: 0.3 };
  const BANGS = { pigtails: 1, bob: 1, sprout: 1 };
  function hairLat(style, lon) {
    const u = Math.min(1, Math.abs(lon) / Math.PI);
    const F = FRONT[style] === undefined ? 0.45 : FRONT[style];
    if (style === 'bob' || style === 'long') return u < 0.3 ? F - u * 0.6 : -1.25;
    return F - (F + 0.95) * Math.pow(u, 1.25);
  }
  // шапка волос: каждая точка экрана — луч в голову; выше линии роста — волосы
  function drawCap(g, E, style, key, al, p) {
    if (al <= 0.004) return;
    const e = S.projEll(E.c, S.ellAxes(E.fr, E.r));
    if (!e) return;
    const R = Math.max(e.rx, e.ry);
    const hitAt = (x, y) => {
      const q = S.hitEll(E, S.ray(x, y));
      if (!q) return null;
      const lat = Math.asin(clamp(q[1], -1, 1)), lon = Math.atan2(q[0], q[2]);
      return lat > hairLat(style, lon) ? q : null;
    };
    const shape = {
      cx: e.cx, cy: e.cy, x0: e.cx - R, y0: e.cy - R, x1: e.cx + R, y1: e.cy + R,
      test(x, y) {
        const q = hitAt(x, y);
        if (!q) return null;
        return S.nS(norm(dirIn(E.fr, q[0] / E.r[0], q[1] / E.r[1], q[2] / E.r[2])));
      },
    };
    const l = S.lightS(E.c);
    S.knockShape(shape, al * clamp(p * 3), 3.5);
    P.volume(shape, { key: key + ':v', color: g.spec.hairColor, alpha: al, p, light: l, w: 0.55, shine: 0.95, lightAt: 0.78, dense: 1.15 });
    // контур: силуэт там, где волосы, и линия роста волос
    const G = P.L.graphite, role = g.spec.hairColor;
    const sil = S.ellPts(e, 60, key);
    const runs = []; let cur = [];
    for (const pt of sil) {
      const ins = [lerp(pt[0], e.cx, 0.04), lerp(pt[1], e.cy, 0.04)];
      if (hitAt(ins[0], ins[1])) cur.push(pt); else { if (cur.length > 2) runs.push(cur); cur = []; }
    }
    if (cur.length > 2) runs.push(cur);
    runs.forEach((r, i) => P.stroke(G, r, { key: key + ':o' + i, w: 1.7, alpha: al * 0.85, p, color: role + ':dk', wAt: S.weightFn(r, l, false, [e.cx, e.cy]) }));
    const hl = []; const hlRuns = [];
    for (let i = 0; i <= 48; i++) {
      const lon = -Math.PI + (i / 48) * Math.PI * 2;
      const zig = BANGS[style] && Math.abs(lon) < 1.1 ? (i % 2 ? 0.05 : -0.015) : 0;
      const sf = surf(E, lon, hairLat(style, lon) + 0.03 + zig);
      const vis = facing(sf) > 0.04;
      const q = vis && S.proj(sf.p);
      if (q) hl.push([q[0], q[1]]); else { if (hl.length > 2) hlRuns.push(hl.splice(0)); else hl.length = 0; }
    }
    if (hl.length > 2) hlRuns.push(hl);
    hlRuns.forEach((r, i) => P.stroke(G, r, { key: key + ':hl' + i, w: 1.3, alpha: al * 0.6, p, color: role + ':dk' }));
    // пряди: от макушки вниз по видимой стороне
    for (let i = 0; i < 12; i++) {
      const lon = -Math.PI + (i + 0.5) / 12 * Math.PI * 2;
      const pts = [];
      const lat0 = hairLat(style, lon) + 0.06;
      for (let j = 0; j <= 7; j++) {
        const lat = lerp(1.35, lat0, j / 7);
        const sf = surf(E, lon + Math.sin(j * 0.6 + i) * 0.06, lat, E.r[2] * 0.005);
        if (facing(sf) > 0.05) { const q = S.proj(sf.p); if (q) pts.push([q[0], q[1]]); }
      }
      if (pts.length > 2) P.stroke(G, pts, { key: key + ':s' + i, w: 1.0, alpha: al * 0.45, p, sketch: false, color: role + ':dk' });
    }
  }

  // сердечко в плоскости (заколка)
  function heartPts3(c, fr, size, rot = 0.3) {
    const out = [];
    for (let i = 0; i < 26; i++) {
      const t = (i / 26) * Math.PI * 2;
      let x = 16 * Math.pow(Math.sin(t), 3) / 16 * size, y = (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16 * size;
      const cr = Math.cos(rot), sr = Math.sin(rot);
      [x, y] = [x * cr - y * sr, x * sr + y * cr];
      out.push(add(c, add(mul(fr.r, x), mul(fr.u, y))));
    }
    return out;
  }
  function drawHeart3(key, c, fr, size, al) {
    const poly = S.projPoly(heartPts3(c, fr, size)).map((q) => [q[0], q[1]]);
    if (poly.length < 3) return;
    S.knock([poly], al);
    P.volume(P.polyShape(poly, { round: 0.85 }), { key: key + ':v', color: 'warm', alpha: al, w: 0.35, shine: 1.2, light: S.lightS(c) });
    P.stroke(P.L.graphite, poly, { key: key + ':o', closed: true, w: 1.6, alpha: al, color: 'warm:dk', gaps: false });
  }

  // =====================================================================
  // ЧЕЛОВЕК: собрать детали в общий список рисования
  // =====================================================================
  function human(spec, st) {
    const g = rig(spec, st);
    const al = st.alpha === undefined ? 1 : st.alpha;
    if (al <= 0.004) return g;
    const k = st.key || 'p';
    const d = st.draw === undefined ? 1 : st.draw;
    const pp = (x, y) => seg(d, x, y);
    const { Hc, hh, a, T, PB } = g;
    const dress = spec.dress, sleeve = spec.sleeve || spec.dress;
    // подол: длина юбки задана долей роста
    const hemRatio = spec.long ? 0.075 : lerp(0.34, 0.27, a);
    const skirt = (g.legLen - Hc * hemRatio);
    const hemC = madd(g.pelvis, [0, 1, 0], -skirt * (1 - (st.crouch || 0) * 0.35));
    const flare = spec.long ? 1.55 : lerp(1.5, 1.4, a);
    const hemA = Hc * 0.1 * flare * (st.flare || 1), hemB = Hc * 0.078 * flare * (st.flare || 1);
    const hipC = madd(g.pelvis, T.u, Hc * 0.02);
    const neckRing = { c: madd(g.neckBase, T.u, Hc * 0.01), aR: mul(T.r, g.shW * 0.42), bF: mul(T.f, Hc * 0.035) };
    const sections = [
      { c: madd(g.neckBase, T.u, -Hc * 0.04), aR: mul(T.r, g.shW * 0.98), bF: mul(T.f, Hc * 0.05) },
      { c: g.chest, aR: mul(T.r, Hc * lerp(0.098, 0.092, a)), bF: mul(T.f, Hc * lerp(0.072, 0.072, a)) },
      { c: g.waist, aR: mul(T.r, Hc * lerp(0.094, 0.068, a)), bF: mul(T.f, Hc * lerp(0.068, 0.052, a)) },
      { c: hipC, aR: mul(PB.r, Hc * lerp(0.1, 0.1, a)), bF: mul(PB.f, Hc * 0.07) },
      { c: lerp3(hipC, hemC, 0.5), aR: mul(PB.r, Hc * 0.1 * lerp(1, flare, 0.55)), bF: mul(PB.f, Hc * 0.075 * lerp(1, flare, 0.55)) },
      { c: hemC, aR: mul(PB.r, hemA), bF: mul(PB.f, hemB) },
    ];
    const HEM = sections.length - 1;
    const torsoDepth = S.depth(g.chest);
    // тень на полу — первой, под всем
    S.push(1e6 - S.depth(g.root) * 0.001, () => { if (st.shadow !== false) S.floorShadow(k + ':sh', g.root, Hc * 0.13, Hc * 0.1, Hc * 0.6, { alpha: al * clamp(d * 2) }); });
    // ноги (всегда под платьем)
    g.legs.forEach((lg, i) => {
      S.push(torsoDepth + Hc * 0.05 + (S.depth(lg.ankle) - torsoDepth) * 0.2, () => {
        const pL = pp(0.55, 0.8);
        S.drawTube(k + ':leg' + i, [lg.hip, lg.knee, lg.ankle], [Hc * 0.044, Hc * 0.027, Hc * 0.018], { color: spec.legs || 'skin', alpha: al, p: pL, lw: 1.6, capLineA: false, shade: { noCore: true, shine: 0.5 } });
        const fd = norm([lg.dir[0], 0, lg.dir[2]]);
        const fc = madd(madd(lg.ankle, fd, Hc * 0.04), [0, 1, 0], -Hc * 0.012);
        S.drawEll(k + ':shoe' + i, fc, { r: norm(cross([0, 1, 0], fd)), u: [0, 1, 0], f: fd }, [Hc * 0.03, Hc * 0.024, Hc * 0.075], { color: spec.shoes || 'hairDark', alpha: al, p: pL, lw: 1.8, shade: { shine: 1.1, noCore: true } });
      });
    });
    // платье: юбка и лиф — выпуклые оболочки своих сечений
    S.push(torsoDepth, () => {
      const pD = pp(0.35, 0.75);
      const rs = sections.map((sc) => S.ringScreen(sc.c, sc.aR, sc.bF, 24));
      if (rs.some((r) => r.length < 6)) return;
      const skirt = S.hull(rs[2].concat(rs[3], rs[4], rs[5]));
      const bodice = S.hull(S.ringScreen(neckRing.c, neckRing.aR, neckRing.bF, 16).concat(rs[0], rs[1], rs[2]));
      const lS = S.lightS(lerp3(sections[3].c, sections[5].c, 0.5)), lB = S.lightS(g.chest);
      const vyS = (f) => lerp(-0.35, 0.15, f), vyB = (f) => lerp(-0.55, 0.2, f);
      // юбка
      S.knock([skirt], al * clamp(pD * 3));
      P.volume(P.polyShape(skirt, { vy: vyS }), { key: k + ':skV', color: dress, alpha: al, p: pD, light: lS, w: 0.9, shine: 0.8 });
      // складки юбки: линии от бёдер к подолу
      for (let f = 0; f < 5; f++) {
        const ang = -1.1 + f * 0.55;
        const a2 = S.proj(add(sections[3].c, add(mul(sections[3].aR, Math.sin(ang) * 0.9), mul(sections[3].bF, Math.cos(ang) * 0.9))));
        const b2 = S.proj(add(sections[5].c, add(mul(sections[5].aR, Math.sin(ang) * 0.97), mul(sections[5].bF, Math.cos(ang) * 0.97))));
        const nrm = add(mul(norm(sections[5].aR), Math.sin(ang)), mul(norm(sections[5].bF), Math.cos(ang)));
        if (a2 && b2 && dot(nrm, S.toViewer(sections[5].c)) > 0.2) P.stroke(P.L.graphite, [[lerp(a2[0], b2[0], 0.25), lerp(a2[1], b2[1], 0.25)], [b2[0], b2[1]]], { key: k + ':fold' + f, w: 1.2, alpha: al * 0.4 * pD, sketch: false });
      }
      P.stroke(P.L.graphite, skirt, { key: k + ':sk', closed: true, w: 1.9, alpha: al, p: pD, wAt: S.weightFn(skirt, lS) });
      // подол спереди; снизу видна изнанка юбки
      const hem = S.ring(hemC, sections[HEM].aR, sections[HEM].bF, 32);
      const hp = hem.map((q) => S.proj(q));
      if (hp.every(Boolean)) {
        const hp2 = hp.map((q) => [q[0], q[1]]);
        const dC = S.depth(hemC);
        if (S.CAM.pos[1] < hemC[1]) {
          P.crayon(P.L.color, P.polyShape(hp2), { key: k + ':inn', color: dress + ':sh', alpha: 0.75 * al, w: 7, gap: 5, p: pD });
          P.stroke(P.L.graphite, hp2, { key: k + ':hem', closed: true, w: 1.6, alpha: al, p: pD });
        } else {
          const n = hem.length;
          let start = hem.findIndex((q, i) => S.depth(q) <= dC && S.depth(hem[(i - 1 + n) % n]) > dC);
          if (start < 0) start = 0;
          const arc = [];
          for (let i = 0; i < n; i++) { const jj = (start + i) % n; if (S.depth(hem[jj]) <= dC + 0.5) arc.push(hp2[jj]); else if (arc.length) break; }
          if (arc.length > 2) P.stroke(P.L.graphite, arc, { key: k + ':hem', w: 1.5, alpha: al * 0.8, p: pD });
        }
      }
      // лиф
      S.knock([bodice], al * clamp(pD * 3));
      P.volume(P.polyShape(bodice, { vy: vyB }), { key: k + ':bdV', color: dress, alpha: al, p: pD, light: lB, w: 0.85, shine: 0.8 });
      P.stroke(P.L.graphite, bodice, { key: k + ':bd', closed: true, w: 1.9, alpha: al, p: pD, wAt: S.weightFn(bodice, lB) });
      drawPattern(g, k, al, pp(0.6, 1), sections, [bodice, skirt]);
    });
    // шея
    S.push(S.depth(g.neckTop) + hh * 0.2, () => {
      S.drawTube(k + ':neck', [madd(g.neckBase, T.u, -hh * 0.1), madd(g.neckTop, g.HF.u, hh * 0.12)], [hh * lerp(0.16, 0.15, a), hh * lerp(0.15, 0.14, a)], { color: 'skin', alpha: al, p: pp(0, 0.3), lw: 1.6, capLineA: false, capB: false, shade: { noCore: true, shadowAt: 0.5 } });
    });
    // руки
    g.arms.forEach((ar, i) => {
      const dep = (S.depth(ar.elbow) + S.depth(ar.wrist) * 2) / 3 + (st.armsFront ? -Hc * 0.2 : 0);
      S.push(dep, () => {
        const pA = pp(0.6, 0.9);
        S.drawTube(k + ':arm' + i, [ar.sh, ar.elbow, ar.wrist], [Hc * 0.027, Hc * 0.021, Hc * 0.016], { color: sleeve, alpha: al, p: pA, lw: 1.7, capLineA: false, shade: { shine: 0.7 } });
        drawHand(g, ar, k + ':hand' + i, al, pA, i);
      });
    });
    // голова
    const headDepth = S.depth(g.cran.c);
    S.push(headDepth, () => {
      const pH = pp(0, 0.3);
      const ec = S.projEll(g.cran.c, S.ellAxes(g.cran.fr, g.cran.r)), ej = S.projEll(g.jaw.c, S.ellAxes(g.jaw.fr, g.jaw.r));
      if (!ec || !ej) return;
      const outline = S.unionOutline([ec, ej]);
      S.knock([outline], al * clamp(pH * 3));
      const l = S.lightS(g.cran.c);
      P.volume(unionShape([shapeOf(ec), shapeOf(ej)]), { key: k + ':headV', color: 'skin', alpha: al, p: pH, light: l, w: 0.6, shadowAt: 0.12, shA: 0.6, noCore: true, shine: 0.45, dense: 0.9 });
      // строительные линии головы, пока рисуется
      const build = (1 - seg(d, 0.4, 0.9)) * clamp(d * 6);
      if (build > 0.02) {
        P.guide(P.L.graphite, S.ellPts(ec, 0, k + 'g'), { key: k + ':g1', closed: true, alpha: build * al });
        const ax = [];
        for (let i = 0; i <= 8; i++) { const s = surf(g.cran, 0, 0.9 - i * 0.28); ax.push(s.p); }
        const ax2 = ax.map((q) => S.proj(q)).filter(Boolean).map((q) => [q[0], q[1]]);
        if (ax2.length > 2) P.guide(P.L.graphite, ax2, { key: k + ':g2', alpha: build * al });
        const ey = [];
        for (let i = 0; i <= 10; i++) { const s = surf(g.cran, -1.3 + i * 0.26, lerp(-0.32, -0.2, a)); ey.push(s.p); }
        const ey2 = ey.map((q) => S.proj(q)).filter(Boolean).map((q) => [q[0], q[1]]);
        if (ey2.length > 2) P.guide(P.L.graphite, ey2, { key: k + ':g3', alpha: build * al });
      }
      P.stroke(P.L.graphite, outline, { key: k + ':head', closed: true, w: 2.2, alpha: al, p: pH, wAt: S.weightFn(outline, l, true, [ec.cx, ec.cy]) });
      drawEars(g, k, al, pH);
      drawFace(g, k, al, pp(0.3, 0.55));
    });
    pushHair(g, k, al, pp(0.15, 0.5));
    return g;
  }

  // кисть: ладонь и пальцы (вдали — «варежка»)
  function drawHand(g, ar, key, al, p, i) {
    const { Hc, st } = g;
    const dvec = norm(sub(ar.wrist, ar.elbow));
    let nrm = st.palm && st.palm[i] ? norm(st.palm[i]) : norm(cross(dvec, g.T.u));
    if (!isFinite(nrm[0])) nrm = [0, 0, 1];
    if (dot(nrm, mul(g.T.r, -ar.s)) < 0 && !(st.palm && st.palm[i])) nrm = mul(nrm, -1);
    const side = norm(cross(dvec, nrm));
    const hl = Hc * 0.105, hw = Hc * 0.045;
    const pc = madd(ar.wrist, dvec, hl * 0.28);
    const fr = { r: side, u: dvec, f: nrm };
    const e = S.drawEll(key + ':palm', pc, fr, [hw * 0.5, hl * 0.3, hw * 0.24], { color: 'skin', alpha: al, p, lw: 1.6, shade: { noCore: true, shine: 0.5 } });
    if (!e || Math.max(e.rx, e.ry) < 7) return;
    const curl = st.curl === undefined ? 0.5 : st.curl;
    for (let f = 0; f < 4; f++) {
      const off = (f - 1.5) * hw * 0.24;
      const kn = madd(madd(pc, dvec, hl * 0.25), side, off);
      const fl = hl * (f === 0 || f === 3 ? 0.36 : 0.42);
      const mid = madd(madd(kn, dvec, fl * 0.55 * Math.cos(curl * 0.6)), nrm, -fl * 0.4 * Math.sin(curl * 0.6));
      const tip = madd(madd(mid, dvec, fl * 0.45 * Math.cos(curl * 1.4)), nrm, -fl * 0.45 * Math.sin(curl * 1.4));
      S.drawTube(key + ':f' + f, [kn, mid, tip], [hw * 0.11, hw * 0.1, hw * 0.085], { color: 'skin', alpha: al, p, lw: 1.2, capLineA: false, shade: { noCore: true, noLight: true } });
    }
    const tb = madd(madd(ar.wrist, dvec, hl * 0.15), side, -hw * 0.45);
    const tt = madd(madd(tb, dvec, hl * 0.32), nrm, -hl * 0.12);
    S.drawTube(key + ':th', [tb, tt], [hw * 0.13, hw * 0.1], { color: 'skin', alpha: al, p, lw: 1.2, capLineA: false, shade: { noCore: true, noLight: true } });
  }

  // узоры на платье: горошек, полоски, воротник, пуговицы
  function drawPattern(g, k, al, p, sections, polys) {
    if (p <= 0 || !polys) return;
    const { spec, Hc } = g;
    const C = P.L.color, G = P.L.graphite;
    const pat = spec.pattern;
    const onSec = (i, u, ang) => { // точка на поверхности сечения i (+ доля u до следующего)
      const a = sections[i], b = sections[Math.min(sections.length - 1, i + 1)];
      const c = lerp3(a.c, b.c, u), aR = lerp3(a.aR, b.aR, u), bF = lerp3(a.bF, b.bF, u);
      const pnt = add(c, add(mul(aR, Math.sin(ang)), mul(bF, Math.cos(ang))));
      const n = norm(add(mul(norm(aR), Math.sin(ang)), mul(norm(bF), Math.cos(ang))));
      return { p: pnt, n };
    };
    const clipCtx = (ctx) => { ctx.save(); ctx.beginPath(); for (const pl of polys) { pl.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath(); } ctx.clip('nonzero'); };
    clipCtx(C); clipCtx(G);
    if (pat === 'dots') {
      C.fillStyle = P.col('light', 0.85 * al * p);
      for (let i = 0; i < sections.length - 1; i++) for (let j = 0; j < 3; j++) for (let q = 0; q < 16; q++) {
        const s = onSec(i, (j + (q % 2) * 0.5) / 4, (q / 14) * Math.PI * 2);
        if (dot(s.n, S.toViewer(s.p)) < 0.15) continue;
        const pr = S.proj(s.p); if (!pr) continue;
        C.beginPath(); C.arc(pr[0], pr[1], Math.max(1, Hc * 0.009 * pr[3]), 0, 6.283); C.fill();
      }
    } else if (pat === 'stripes') {
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
        const pts = [];
        for (let q = 0; q <= 16; q++) { const s = onSec(i, j / 3, -Math.PI / 2 + (q / 16) * Math.PI); if (dot(s.n, S.toViewer(s.p)) > 0.05) { const pr = S.proj(s.p); if (pr) pts.push([pr[0], pr[1]]); } }
        if (pts.length > 2) P.stroke(C, pts, { key: k + ':st' + i + j, color: 'light', w: 5, alpha: al * 0.7 * p, sketch: false });
      }
    } else if (pat === 'zigzag') {
      const pts = [];
      for (let q = 0; q <= 16; q++) { const s = onSec(1, 0.15 + (q % 2) * 0.12, -Math.PI / 2 + (q / 16) * Math.PI); if (dot(s.n, S.toViewer(s.p)) > 0.05) { const pr = S.proj(s.p); if (pr) pts.push([pr[0], pr[1]]); } }
      if (pts.length > 2) P.stroke(G, pts, { key: k + ':zz', color: 'a1', w: 3, alpha: al * p });
    } else if (pat === 'cardigan') {
      const line = [];
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { const s = onSec(i, j / 3, 0); const pr = S.proj(s.p); if (pr && dot(s.n, S.toViewer(s.p)) > 0) line.push([pr[0], pr[1]]); }
      if (line.length > 2) P.stroke(G, line, { key: k + ':cd', w: 1.6, alpha: al * p * 0.8 });
      for (let b = 0; b < 3; b++) { const s = onSec(1, b / 3, 0.12); const pr = S.proj(s.p); if (pr && dot(s.n, S.toViewer(s.p)) > 0.1) P.blob(G, pr[0], pr[1], Math.max(1.2, Hc * 0.008 * pr[3]), Math.max(1.2, Hc * 0.008 * pr[3]), { key: k + ':cb' + b, alpha: al * p }); }
    }
    C.restore(); G.restore();
    if (pat === 'dots' || pat === 'collar') { // белый воротничок
      for (const sd of [-1, 1]) {
        const s0 = onSec(0, 0.05, sd * 0.25), s1 = onSec(0, 0.35, sd * 0.55), s2 = onSec(0, 0.1, sd * 0.85);
        const pts = [s0, s1, s2].map((s) => S.proj(s.p)).filter(Boolean).map((q) => [q[0], q[1]]);
        if (pts.length === 3 && dot(s1.n, S.toViewer(s1.p)) > 0) {
          S.knock([pts], al * p);
          P.crayon(C, P.polyShape(pts), { key: k + ':col' + sd, color: 'light', alpha: 0.9 * al * p, w: 3, gap: 2 });
          P.stroke(G, pts, { key: k + ':coll' + sd, closed: true, w: 1.4, alpha: al * p });
        }
      }
    }
  }

  // =====================================================================
  // МИШКА В 3D (сантиметры, сидит; начало — точка опоры)
  // =====================================================================
  const BEAR = {
    body: { c: [0, 15, 0], r: [13, 15, 11] },
    belly: { c: [0, 13, 6.5], r: [8.5, 10, 5.5], color: 'cream' },
    head: { c: [0, 36, 1.5], r: [12.5, 11, 11] },
    muzzle: { c: [0, 32.5, 11], r: [5.6, 4.3, 4.2], color: 'cream' },
    nose: { c: [0, 34.6, 14.8], r: [1.9, 1.3, 1.1], color: 'line' },
    ears: [-1, 1].map((s) => ({ c: [s * 8.8, 45.5, -0.5], r: [4.4, 4.4, 2.3] })),
    earsIn: [-1, 1].map((s) => ({ c: [s * 8.8, 45.5, 1.2], r: [2.3, 2.3, 1.2], color: 'cream' })),
    arms: [-1, 1].map((s) => ({ a: [s * 11, 23, 0.5], b: [s * 14.5, 10, 6.5], r: [4.4, 3.7] })),
    legs: [-1, 1].map((s) => ({ a: [s * 7, 5.5, 2], b: [s * 9, 4, 13.5], r: [5.4, 4.8] })),
    pads: [-1, 1].map((s) => ({ c: [s * 9, 4, 17.5], r: [4.1, 4.1, 1.2], color: 'cream' })),
  };
  function bear(o) {
    const al = o.alpha === undefined ? 1 : o.alpha;
    if (al <= 0.004) return null;
    const fr = o.fr || frame(o.yaw || 0, o.pitch || 0, o.roll || 0);
    const s = o.s || 1, base = o.pos, k = o.key || 'bear';
    const d = o.draw === undefined ? 1 : o.draw, fur = o.fur === undefined ? 1 : o.fur;
    const m = o.marks || {};
    const L = (v) => at(base, fr, v[0] * s, v[1] * s, v[2] * s);
    const R = (r) => r.map((v) => v * s);
    const pp = (x, y) => seg(d, x, y);
    const furShade = { shine: 0.9 };
    const part = (name, def, p0, p1, extra = {}) => {
      const c = L(def.c);
      S.push(S.depth(c) + (extra.bias || 0) * s, () => {
        const e = S.drawEll(k + ':' + name, c, fr, R(def.r), { color: def.color || 'fur', alpha: al, p: pp(p0, p1), fill: fur, lw: extra.lw || 2, ws: extra.ws || 0.7, flat: extra.flat, shade: Object.assign({}, furShade, extra.shade || {}) });
        if (e && !def.color && extra.tufts !== false) tufts(e, k + ':tf:' + name, al * pp(p0, p1) * fur);
      });
    };
    // тень
    if (o.shadow !== false && o.ground !== undefined) S.push(1e6, () => S.floorShadow(k + ':sh', [base[0], o.ground, base[2]], 18 * s, 15 * s, 30 * s, { alpha: al * (o.shadowA === undefined ? 1 : o.shadowA) * clamp(d * 2), y: o.ground }));
    // строительные линии
    const build = (1 - seg(d, 0.6, 1)) * clamp(d * 6);
    if (build > 0.02) S.push(-1e5, () => {
      const eh = S.projEll(L(BEAR.head.c), S.ellAxes(fr, R(BEAR.head.r))), eb = S.projEll(L(BEAR.body.c), S.ellAxes(fr, R(BEAR.body.r)));
      if (eh) P.guide(P.L.graphite, S.ellPts(eh, 0, k + 'gh'), { key: k + ':gh', closed: true, alpha: build * al });
      if (eb) P.guide(P.L.graphite, S.ellPts(eb, 0, k + 'gb'), { key: k + ':gb', closed: true, alpha: build * al });
      const ax = [L([0, 50, 0]), L([0, 0, 0])].map((q) => S.proj(q)).filter(Boolean).map((q) => [q[0], q[1]]);
      if (ax.length === 2) P.guide(P.L.graphite, ax, { key: k + ':ga', alpha: build * al });
    });
    part('body', BEAR.body, 0.35, 0.6);
    part('belly', BEAR.belly, 0.5, 0.65, { bias: -1, flat: 0.6, tufts: false, shade: { noCore: true } });
    part('head', BEAR.head, 0, 0.25, { bias: -0.5 });
    part('muzzle', BEAR.muzzle, 0.2, 0.35, { flat: 0.8, shade: { noCore: true } });
    BEAR.ears.forEach((e, i) => part('ear' + i, e, 0.1, 0.3, { bias: 0.5 }));
    BEAR.earsIn.forEach((e, i) => part('earIn' + i, e, 0.15, 0.3, { shade: { noLight: true, noCore: true } }));
    // лапы
    BEAR.arms.forEach((a, i) => {
      const A = L(a.a), Bp = L(a.b);
      S.push(S.depth(lerp3(A, Bp, 0.6)), () => S.drawTube(k + ':arm' + i, [A, Bp], R(a.r), { color: 'fur', alpha: al, p: pp(0.55, 0.78), fill: fur, lw: 2, capLineA: false, shade: furShade }));
    });
    BEAR.legs.forEach((a, i) => {
      const A = L(a.a), Bp = L(a.b);
      S.push(S.depth(lerp3(A, Bp, 0.6)), () => S.drawTube(k + ':leg' + i, [A, Bp], R(a.r), { color: 'fur', alpha: al, p: pp(0.7, 0.92), fill: fur, lw: 2, capLineA: false, shade: furShade }));
    });
    BEAR.pads.forEach((e, i) => part('pad' + i, e, 0.85, 1, { flat: 0.5, shade: { noCore: true } }));
    // мордочка: нос, рот, глаза-пуговицы на поверхности головы
    const head = { c: L(BEAR.head.c), fr, r: R(BEAR.head.r) };
    const mz = { c: L(BEAR.muzzle.c), fr, r: R(BEAR.muzzle.r) };
    S.push(S.depth(L(BEAR.nose.c)) - 0.5 * s, () => {
      const pF = pp(0.3, 0.45);
      if (pF <= 0) return;
      const nose = S.drawEll(k + ':nose', L(BEAR.nose.c), fr, R(BEAR.nose.r), { color: 'line', alpha: al * pF, lw: 1.4, shade: { noCore: true, shine: 1.4, lightAt: 0.7 } });
      void nose;
      const ms = [surf(mz, 0, 0.1), surf(mz, 0, -0.45), surf(mz, -0.45, -0.55), surf(mz, 0.45, -0.55)];
      if (facing(ms[1]) > 0.05) {
        const q = ms.map((x) => S.proj(x.p)).map((v) => v && [v[0], v[1]]);
        if (q.every(Boolean)) {
          P.stroke(P.L.graphite, [q[0], q[1]], { key: k + ':m0', w: 1.6, alpha: al * pF, sketch: false });
          P.stroke(P.L.graphite, P.curve([q[2], [lerp(q[2][0], q[1][0], 0.5), lerp(q[2][1], q[1][1], 0.5) + 2], q[1], [lerp(q[3][0], q[1][0], 0.5), lerp(q[3][1], q[1][1], 0.5) + 2], q[3]], false, 4), { key: k + ':m1', w: 1.6, alpha: al * pF, sketch: false });
        }
      }
    });
    const btn = m.button || 0;
    [-1, 1].forEach((sd, i) => {
      const sfc = surf(head, sd * 0.42, 0.12, 0.3 * s);
      if (facing(sfc) < 0.05) return;
      const blue = i === 0 && btn > 0.35;
      S.push(S.depth(sfc.p) - 1 * s, () => {
        const pE = pp(0.3, 0.45);
        if (pE <= 0) return;
        const r = blue ? 2.1 * s : 1.6 * s;
        const efr = { r: fr.r, u: fr.u, f: sfc.n };
        const e = S.drawEll(k + ':eye' + i, sfc.p, efr, [r, r, 0.6 * s], { color: blue ? 'a1' : 'line', alpha: al * pE, lw: 1.4, flat: 0.6, shade: { noCore: true, shine: 1.5, lightAt: 0.6 } });
        if (e && e.rx > 3) {
          // дырочки пуговицы
          const C = P.L.color; C.fillStyle = P.col('paper', 0.85 * al * pE);
          const nh = blue ? 4 : 2;
          for (let h = 0; h < nh; h++) { const ang = (h / nh) * Math.PI * 2 + 0.6; C.beginPath(); C.arc(e.cx + Math.cos(ang) * e.rx * 0.35, e.cy + Math.sin(ang) * e.ry * 0.35, Math.max(0.7, e.rx * 0.14), 0, 6.283); C.fill(); }
        }
      });
    });
    // шов на голове
    S.push(S.depth(head.c) - 11 * s, () => {
      const pts = []; for (let j = 0; j < 6; j++) { const sf = surf(head, 0, 1.25 - j * 0.12, 0.2 * s); if (facing(sf) > 0) { const q = S.proj(sf.p); if (q) pts.push([q[0], q[1]]); } }
      for (let j = 0; j + 1 < pts.length; j++) P.stroke(P.L.graphite, [[pts[j][0] - 2, pts[j][1]], [pts[j][0] + 2, pts[j][1] + 1]], { key: k + ':seam' + j, w: 1.1, alpha: al * 0.6 * pp(0.3, 0.5), sketch: false, gaps: false });
    });
    // заплатка на правой лапке (Лена, 1979)
    if (m.patch > 0) {
      const lg = BEAR.legs[1];
      const c = lerp3(L(lg.a), L(lg.b), 0.62);
      const up = norm(sub(L([0, 40, 0]), L([0, 0, 0])));
      const nrm = norm(add(mul(fr.f, 0.6), mul(up, 0.8)));
      const side = norm(cross(nrm, up)), up2 = norm(cross(side, nrm));
      const cc = madd(c, nrm, lg.r[0] * s * 0.95);
      const hw = 3.6 * s, hh2 = 3.2 * s;
      const quad = [madd(madd(cc, side, -hw), up2, -hh2), madd(madd(cc, side, hw), up2, -hh2 * 0.9), madd(madd(cc, side, hw * 1.05), up2, hh2), madd(madd(cc, side, -hw * 0.95), up2, hh2 * 1.05)];
      S.push(S.depth(cc) - 2 * s, () => {
        if (dot(nrm, S.toViewer(cc)) < 0.05) return;
        const pO = seg(m.patch, 0, 0.5), pS = seg(m.patch, 0.5, 1);
        const poly = S.drawPoly(k + ':patch', quad, { color: 'a2', alpha: al * pO, normal: nrm, still: false, line: true, lw: 1.8, lc: 'a2:dk', shade: { noCore: true, w: 0.4 } });
        if (!poly) return;
        for (let i = 1; i < 3; i++) {
          P.stroke(P.L.graphite, [P2(lerp3(quad[0], quad[1], i / 3)), P2(lerp3(quad[3], quad[2], i / 3))].filter(Boolean), { key: k + ':pc' + i, color: 'a2:dk', w: 1.1, alpha: al * pO, sketch: false, gaps: false });
          P.stroke(P.L.graphite, [P2(lerp3(quad[0], quad[3], i / 3)), P2(lerp3(quad[1], quad[2], i / 3))].filter(Boolean), { key: k + ':pr' + i, color: 'a2:dk', w: 1.1, alpha: al * pO, sketch: false, gaps: false });
        }
        for (let i = 0; i < 12; i++) {
          if (i / 12 > pS) break;
          const e0 = quad[Math.floor(i / 3)], e1 = quad[(Math.floor(i / 3) + 1) % 4], u = ((i % 3) + 0.5) / 3;
          const pnt = lerp3(e0, e1, u), out = norm(sub(pnt, cc));
          const a2 = P2(madd(pnt, out, -1 * s)), b2 = P2(madd(pnt, out, 1.1 * s));
          if (a2 && b2) P.stroke(P.L.graphite, [a2, b2], { key: k + ':st' + i, w: 1.3, alpha: al, sketch: false, gaps: false });
        }
      });
    }
    // шарф (бабушка Аня, 2003): кольцо вокруг шеи + хвост
    if (m.scarf > 0) {
      const nc = L([0, 25.5, 1]);
      const up = norm(sub(L([0, 40, 0]), L([0, 0, 0])));
      const ringPts = S.ring(nc, mul(fr.r, 11.8 * s), mul(fr.f, 10.8 * s), 24).map((q, i) => madd(q, up, Math.cos(i / 24 * Math.PI * 2) * 0.8 * s));
      const pB = seg(m.scarf, 0, 0.6), pT = seg(m.scarf, 0.4, 1);
      const dC = S.depth(nc);
      // задняя половина — за головой, передняя — перед телом
      const halves = [[], []];
      ringPts.forEach((q) => halves[S.depth(q) > dC ? 0 : 1].push(q));
      const order = (arr) => arr; void order;
      for (let hIdx = 0; hIdx < 2; hIdx++) {
        // собрать непрерывные дуги
        const arc = [];
        const n = ringPts.length;
        let start = ringPts.findIndex((q, i) => (S.depth(q) > dC) === (hIdx === 0) && (S.depth(ringPts[(i - 1 + n) % n]) > dC) !== (hIdx === 0));
        if (start < 0) start = 0;
        for (let i = 0; i <= n; i++) { const q = ringPts[(start + i) % n]; if ((S.depth(q) > dC) === (hIdx === 0)) arc.push(q); else if (arc.length) break; }
        if (arc.length < 2) continue;
        S.push(dC + (hIdx === 0 ? 12 * s : -11.5 * s), () => {
          const t = S.drawTube(k + ':scarf' + hIdx, arc, arc.map(() => 2.6 * s), { color: 'a2', alpha: al, p: pB, lw: 1.8, capLineA: false, capLineB: false, shade: { shine: 0.6 } });
          if (!t) return;
          // полоски
          for (let i = 1; i < arc.length - 1; i += 2) {
            const a2 = S.proj(madd(arc[i], up, 2.6 * s)), b2 = S.proj(madd(arc[i], up, -2.6 * s));
            if (a2 && b2) P.stroke(P.L.color, [[a2[0], a2[1]], [b2[0], b2[1]]], { key: k + ':scs' + hIdx + i, color: 'a1', w: 4.5, alpha: al * 0.8 * pB, sketch: false });
          }
        });
      }
      const ta = L([5, 25, 9.5]), tb = L([8.5, 13, 12]);
      S.push(S.depth(ta) - 2 * s, () => {
        S.drawTube(k + ':scarfT', [ta, tb], [3.2 * s, 3 * s], { color: 'a2', alpha: al, p: pT, lw: 1.8, shade: { shine: 0.6 } });
        for (let i = 0; i < 4; i++) { const f0 = S.proj(madd(madd(tb, fr.r, (i - 1.5) * 1.4 * s), up, -2.4 * s)), f1 = S.proj(madd(madd(tb, fr.r, (i - 1.5) * 1.5 * s), up, -5 * s)); if (f0 && f1) P.stroke(P.L.graphite, [[f0[0], f0[1]], [f1[0], f1[1]]], { key: k + ':fr' + i, w: 1.2, alpha: al * pT, sketch: false, gaps: false }); }
      });
    }
    // заколка на ухе (Соня, 2026)
    if (m.clip > 0) {
      const ec = L([8.8, 48.5, 2.2]);
      S.push(S.depth(ec) - 3 * s, () => drawHeart3(k + ':clip', ec, { r: fr.r, u: fr.u, f: fr.f }, 3.3 * s, al * m.clip));
    }
    return { head, fr, s, base, L, earPos: L([8.8, 48.5, 2.2]), center: L([0, 22, 0]) };
  }
  const P2 = (pt) => { const q = S.proj(pt); return q ? [q[0], q[1]] : null; };
  // пушистый край меха
  function tufts(e, key, al) {
    if (al <= 0.01 || e.rx < 6) return;
    const C = P.L.color, r = P.boilRng(key);
    const N = Math.max(10, Math.round((e.rx + e.ry) * 1.6 / 9));
    const c = Math.cos(e.rot), s = Math.sin(e.rot);
    C.lineCap = 'round'; C.lineWidth = 2.2; C.strokeStyle = P.col('fur:sh', 0.55 * al);
    C.beginPath();
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + r() * 0.2;
      const ex = Math.cos(a) * e.rx, ey = Math.sin(a) * e.ry;
      const px = e.cx + ex * c - ey * s, py = e.cy + ex * s + ey * c;
      const nx = Math.cos(a) * c - Math.sin(a) * s, ny = Math.cos(a) * s + Math.sin(a) * c;
      const ln = 3 + r() * 5, tw = (r() - 0.5) * 0.9;
      C.moveTo(px - nx * ln * 0.6, py - ny * ln * 0.6);
      C.lineTo(px + (nx * Math.cos(tw) - ny * Math.sin(tw)) * ln, py + (nx * Math.sin(tw) + ny * Math.cos(tw)) * ln);
    }
    C.stroke();
  }

  global.FIG = { rig, human, bear, surf, facing, heightOf, tab, ik3, drawHeart3, BEAR };
})(typeof window !== 'undefined' ? window : globalThis);
