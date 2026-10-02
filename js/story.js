/* =========================================================================
   story.js — «Мишка»: декорации, планы и камера
   -------------------------------------------------------------------------
   Сцена живёт в 3D (space.js), люди и мишка — в figures.js. Фильм собран
   из коротких планов с разных ракурсов: общий, крупный, «глазами мишки»,
   сверху, снизу, через плечо. Всё считается от времени t: renderFrame(t)
   всегда даёт один и тот же кадр. Время событий — константы в объекте T,
   звук (sound.js) берёт те же константы.
   ========================================================================= */
(function (global) {
  'use strict';
  const P = global.PEN, S = global.SPACE, F = global.FIG;
  const { W, H, clamp, lerp, seg, easeOut, easeIn, easeInOut, write } = P;
  const { add, sub, mul, madd, dot, cross, len, norm, lerp3, frame, at } = S;
  const PI = Math.PI;

  // ===== ПАЛИТРА ОДНОЙ СТРОКОЙ: 'paper' | 'notebook' | 'kraft' =====
  const THEME = 'paper';

  // ---------------------------------------------------------------------
  // РАСКАДРОВКА: время каждого события (секунды). sNN — начало плана.
  // ---------------------------------------------------------------------
  const T = {
    END: 64,
    // 0. Титул: мишка рисуется на пустой бумаге
    bearDraw: [-0.9, 1.8], fur0: [1.2, 2.4], title: [1.8, 2.8], sub: [2.6, 3.5], titleOut: [3.9, 4.6],
    // 1. 1956 — Аня
    s1a: 5.0, room1: [4.4, 6.2], year1: 5.6, anyaIn: [5.6, 6.2], run1: [5.8, 7.6],
    s1b: 7.6, crouch1: [7.7, 8.4], reach1: [8.1, 8.7], lift1: [8.8, 9.6],
    s1c: 9.6, name1: 9.9, spin1: [9.9, 11.0],
    s1d: 11.2, grow1: [11.5, 14.6], button: [12.8, 13.2],
    // 2. 1979 — Лена
    s2a: 15.4, year2: 15.6, give2: [16.0, 16.9], name2: 16.6,
    s2b: 17.2, patch: [17.6, 18.8],
    s2c: 19.0, grow2: [19.2, 21.2],
    s2d: 21.4, place2: [21.5, 22.3], lidClose: [22.5, 23.7],
    // 3. Чердак и поворот
    s3a: 24.0, years3: [24.6, 26.6],
    s3b: 26.8, crack: [27.0, 27.6], TURN: 27.6, open3: [27.6, 27.95], kat3: [27.7, 28.3], reach3: [28.1, 28.6],
    // 4. 2003 — Катя
    s4a: 28.6, year4: 28.9, spin4: [28.8, 31.0], puff: [28.9, 29.9], name4: 29.6,
    s4b: 31.0, granIn: [31.0, 31.7], label4: 31.5, scarf: [31.8, 33.6],
    s4c: 34.2, grow4: [34.4, 37.8],
    s4d: 38.2,
    // 5. 2026 — Соня
    s5a: 39.4, room5: [39.4, 40.4], year5: 40.0, toddle: [40.2, 42.3], labels5: 40.8,
    s5b: 42.4, give5: [43.1, 44.3],
    s5c: 44.6, name5: 44.9, warm: [44.6, 46.6],
    s5d: 47.0, clip: [47.35, 48.2],
    s5e: 49.0, erase5: [50.4, 52.0],
    // 6. Постер
    s6: 53.0, orbit6: [53.0, 56.0], notes: [56.0, 56.9, 57.8, 58.7], title6: [59.0, 59.9], years6: [59.6, 60.3],
    names6: [60.0, 60.7], moral: [60.2, 61.0], still: 61.0,
  };
  // клапаны коробки закрываются по одному: левый, правый, задний, передний
  const FLAPS2 = { l: [22.5, 22.85], r: [22.75, 23.1], b: [23.0, 23.4], f: [23.3, 23.7] };

  // ---------------------------------------------------------------------
  // Семья
  // ---------------------------------------------------------------------
  const SPEC = {
    anya: { hairKid: 'pigtails', hairAdult: 'bun', hairColor: 'hairDark', dress: 'a1', pattern: 'dots', eyes: 'hairBrown' },
    anya52: { hairKid: 'bun', hairAdult: 'bun', hairColor: 'hairBrown', dress: 'a1', pattern: 'cardigan', glasses: true, long: true, eyes: 'hairBrown' },
    anya75: { hairKid: 'bun', hairAdult: 'bun', hairColor: 'hairGray', dress: 'a1', pattern: 'cardigan', glasses: true, long: true, old: true, eyes: 'hairBrown' },
    lena: { hairKid: 'bob', hairAdult: 'bob', hairColor: 'hairBrown', dress: 'a2', pattern: 'stripes', eyes: 'a1', hk: 1.03 },
    lena51: { hairKid: 'bob', hairAdult: 'bob', hairColor: 'hairBrown', dress: 'a2', pattern: 'collar', long: true, eyes: 'a1', hk: 1.03 },
    katya: { hairKid: 'ponytail', hairAdult: 'ponytail', hairColor: 'hairGinger', dress: 'shadow', pattern: 'zigzag', eyes: 'a2', hk: 0.98 },
    sonia: { hairKid: 'sprout', hairAdult: 'sprout', hairColor: 'hairFair', dress: 'warm', pattern: 'collar', eyes: 'a1' },
  };
  // рост у дверного косяка: у каждого поколения свой карандаш
  const GENS = {
    anya: { key: 'anya', name: 'Аня', born: 1951, color: 'line', ages: [5, 8, 11, 14, 20], from: 5, to: 20, grow: T.grow1, spec: SPEC.anya },
    lena: { key: 'lena', name: 'Лена', born: 1975, color: 'a1', ages: [4, 7, 10, 13, 17], from: 4, to: 17, grow: T.grow2, spec: SPEC.lena },
    katya: { key: 'katya', name: 'Катя', born: 1996, color: 'a2', ages: [7, 9, 12, 15, 25], from: 7, to: 25, grow: T.grow4, spec: SPEC.katya },
  };

  // ---------------------------------------------------------------------
  // Место действия (сантиметры): комната, окно, дверь с косяком, ёлка
  // ---------------------------------------------------------------------
  const ROOM = { x0: -320, x1: 320, z0: -380, z1: 280, h: 280 };
  const WIN = { x0: -60, x1: 90, y0: 95, y1: 225 };
  const DOOR = { z0: -230, z1: -140, h: 205, c: 10 };
  const KIDZ = -106;                    // где стоят, когда меряют рост
  const TREE = [-215, 0, -290];
  const BS = 0.72;                      // мишка в масштабе комнаты (≈ 36 см)
  const BEAR0 = [-165, 0, -205], BYAW = 1.0;
  const ANYA1 = [BEAR0[0] + Math.sin(BYAW) * 52, BEAR0[2] + Math.cos(BYAW) * 52];
  const DOORP = [348, -185];
  const A2 = [-60, -170], Y2 = 0.35;    // 1979: Аня отдаёт мишку Лене
  const L2 = [A2[0] + Math.sin(Y2) * 72, A2[1] + Math.cos(Y2) * 72];
  const TABLE = { c: [-185, -262], w: 110, d: 68, h: 72, yaw: 0.25 };
  const BOX2 = [-30, -235];
  const BOXA = [0, -40], BOXA_YAW = 0.15;
  const KAT4 = [10, 75];
  const G4 = [-110, -195], STOOL = [-38, -168];
  const A5 = [-150, -190], Y5 = 0.6;    // 2026: прабабушка Аня и Соня
  const S5 = [A5[0] + Math.sin(Y5) * 62, A5[1] + Math.cos(Y5) * 62];
  const SON0 = [40, -55];
  const BF5 = [S5[0] - Math.sin(Y5) * 30, S5[1] - Math.cos(Y5) * 30];
  const BGD = 1e7;                      // фон рисуется раньше всего

  const ERA = {
    1956: { id: 'A', wall: 'wallA', light: [15, 185, -330], reach: 720, sky: 'a1:lt', frost: true },
    1979: { id: 'B', wall: 'wallB', light: [-245, 168, 25], reach: 640, sky: 'a1:sh', carpet: true, stripes: true, lamp: [-245, 0, 25] },
    2003: { id: 'C', wall: 'wallC', light: [15, 185, -330], reach: 820, sky: 'a1:lt', sun: true, curtain: 'a1' },
    2026: { id: 'D', wall: 'wallD', light: [15, 185, -330], reach: 860, sky: 'a1:lt', sun: true, curtain: 'a2' },
  };
  function useLight(pos) { S.LIGHT.pos = pos; S.LIGHT.dir = null; }

  // ---------------------------------------------------------------------
  // Помощники
  // ---------------------------------------------------------------------
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
    if (t <= b) return lerp(1, GHOST, easeInOut(seg(t, a, b)));
    return GHOST * (1 - seg(t, b, b + 1.0));
  }
  function lerpAng(a, b, k) { let d = b - a; while (d > PI) d -= 2 * PI; while (d < -PI) d += 2 * PI; return a + d * k; }
  const flat = (p, y = 0) => [p[0], y, p[1]];
  function growAge(g, t) { return lerp(g.from, g.to, easeInOut(seg(t, g.grow[0], g.grow[1]))); }
  // когда при росте исполнится age (для отметок и звука)
  function ageCross(g, age) {
    let a = g.grow[0], b = g.grow[1];
    if (age <= g.from) return a;
    for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (growAge(g, m) < age) a = m; else b = m; }
    return (a + b) / 2;
  }
  // следы поколений на мишке
  function marksAt(t) {
    return { button: seg(t, T.button[0], T.button[1]), patch: seg(t, T.patch[0], T.patch[1]), scarf: seg(t, T.scarf[0], T.scarf[1]), clip: seg(t, T.clip[1] - 0.12, T.clip[1]) };
  }
  function bear(t, o) { return F.bear(Object.assign({ key: 'bear', s: BS, marks: marksAt(t), shadow: o.ground !== undefined }, o)); }

  // ---------------------------------------------------------------------
  // Камера
  // ---------------------------------------------------------------------
  function cam(c) { S.setCamera(Object.assign({ near: 2 }, c)); }
  function camMix(a, b, k) {
    return { pos: lerp3(a.pos, b.pos, k), target: lerp3(a.target, b.target, k), fov: lerp(a.fov || 40, b.fov || 40, k), roll: lerp(a.roll || 0, b.roll || 0, k) };
  }
  // облёт: угол a вокруг вертикали через точку c
  function orbit(c, a, r, y, extra) { return Object.assign({ pos: [c[0] + Math.sin(a) * r, y, c[2] + Math.cos(a) * r], target: c }, extra); }
  // камера «с рук»: лёгкое покачивание (меняется вместе с рисунком 12 раз в секунду)
  function sway(c, t, s = 1) {
    return Object.assign({}, c, { pos: add(c.pos, [Math.sin(t * 0.83) * 2.2 * s, Math.sin(t * 1.21 + 1) * 1.4 * s, Math.sin(t * 0.67 + 2) * 1.8 * s]) });
  }

  // ---------------------------------------------------------------------
  // Как держат мишку. hug — спиной к груди, hugIn — лицом к груди,
  // give — протягивают, front — перед лицом, up — над головой, side — под мышкой
  // ---------------------------------------------------------------------
  function hold(g, mode) {
    const Tf = g.T, Hc = g.Hc, bs = BS, up = Tf.u;
    const yaw = (g.st.yaw || 0) + (g.st.twist || 0);
    const pair = (pos, dx, dy, dz) => [madd(madd(madd(pos, Tf.r, -dx * bs), up, dy * bs), Tf.f, dz * bs), madd(madd(madd(pos, Tf.r, dx * bs), up, dy * bs), Tf.f, dz * bs)];
    let pos, fr, hands;
    switch (mode) {
      case 'hugIn':
        pos = madd(madd(g.chest, Tf.f, Hc * 0.13), up, -Hc * 0.2);
        fr = frame(yaw + PI, 0.05);
        hands = pair(pos, 12, 20, 8);
        break;
      case 'give':
        pos = madd(madd(g.chest, Tf.f, Hc * 0.24), up, -Hc * 0.13);
        fr = frame(yaw);
        hands = pair(pos, 13, 21, 0);
        break;
      case 'front':
        pos = madd(madd(g.neckTop, Tf.f, Hc * 0.3), [0, 1, 0], -27 * bs);
        fr = frame(yaw + PI, -0.12);
        hands = pair(pos, 13.5, 21, 0);
        break;
      case 'up':
        pos = madd(madd(g.neckTop, [0, 1, 0], g.hh * 0.95), Tf.f, Hc * 0.06);
        fr = frame(yaw + PI, 0.35);
        hands = pair(pos, 13.5, 19, 0);
        break;
      case 'side':
        pos = madd(madd(madd(g.pelvis, Tf.r, g.shW * 1.2), Tf.f, Hc * 0.05), up, -Hc * 0.03);
        fr = frame(yaw + 0.25);
        hands = [null, madd(madd(pos, up, 15 * bs), Tf.f, 9 * bs)];
        break;
      default: // hug
        pos = madd(madd(g.chest, Tf.f, Hc * 0.11), up, -Hc * 0.2);
        fr = frame(yaw, 0.1);
        hands = pair(pos, 11, 16, 9);
    }
    return { pos, fr, hands };
  }
  // человек с мишкой в руках
  function withBear(t, spec, st, mode, bo = {}) {
    const g0 = F.rig(spec, st);
    const h = hold(g0, mode);
    st.hands = h.hands; st.armsFront = mode !== 'side'; st.curl = 0.8;
    F.human(spec, st);
    const b = bear(t, Object.assign({ pos: h.pos, fr: h.fr, alpha: st.alpha }, bo));
    return { g: g0, h, b };
  }
  // передача мишки: A протягивает, B берёт и прижимает к себе
  function give(tg, t, A, B) {
    const k = easeInOut(seg(t, tg[0], tg[1]));
    const gA0 = F.rig(A.spec, A.st), gB0 = F.rig(B.spec, B.st);
    const hA = hold(gA0, 'give'), hB = hold(gB0, 'hugIn');
    const pos = add(lerp3(hA.pos, hB.pos, k), [0, Math.sin(k * PI) * 7, 0]);
    const fr = frame(A.st.yaw, lerp(0, 0.05, k)); // мишка всё время лицом к ребёнку
    const sidesA = [at(pos, fr, -13 * BS, 21 * BS, 0), at(pos, fr, 13 * BS, 21 * BS, 0)];
    const rel = easeInOut(seg(k, 0.72, 1));
    A.st.hands = [0, 1].map((i) => lerp3(sidesA[i], gA0.arms[i].wrist, rel));
    A.st.armsFront = true; A.st.curl = 0.75;
    const grab = easeInOut(seg(t, tg[0] - 0.25, tg[0] + 0.45));
    const backB = [at(pos, fr, 12 * BS, 20 * BS, -7 * BS), at(pos, fr, -12 * BS, 20 * BS, -7 * BS)];
    B.st.hands = [0, 1].map((i) => lerp3(gB0.arms[i].wrist, backB[i], grab));
    B.st.armsFront = true; B.st.curl = 0.8;
    return { pos, fr, k, gA: gA0, gB: gB0, center: at(pos, fr, 0, 22 * BS, 0) };
  }

  // =====================================================================
  // ДЕКОРАЦИИ
  // =====================================================================
  // большая плоскость (стена, пол, крыша): мелок темнеет с расстоянием от света
  function planeCrayon(key, pts3, role, n, o = {}) {
    const pp = S.projPoly(pts3);
    if (pp.length < 3) return null;
    const poly = pp.map((q) => [q[0], q[1]]);
    const al = o.al === undefined ? 1 : o.al, p = o.p === undefined ? 1 : o.p;
    if (al <= 0.004 || p <= 0) return poly;
    const base = P.polyShape(poly, { normal: [0, 0, 1] });
    const P0 = pts3[0], reach = o.reach || 700, out = [1, 0, 1];
    const shape = {
      cx: base.cx, cy: base.cy, x0: base.x0, y0: base.y0, x1: base.x1, y1: base.y1,
      test(x, y) {
        if (!base.test(x, y)) return null;
        const d = S.ray(x, y), den = dot(d, n);
        let b = 0.6;
        if (Math.abs(den) > 1e-6) {
          const q = madd(S.CAM.pos, d, dot(sub(P0, S.CAM.pos), n) / den);
          b = 1.25 - len(sub(q, S.LIGHT.pos)) / reach - (q[1] < 30 ? (30 - q[1]) / 90 : 0);
        }
        out[0] = b;
        return out;
      },
    };
    const ang = o.angle === undefined ? -0.35 : o.angle, C = P.L.color, ws = o.w || 1;
    P.crayon(C, shape, { key: key + ':a', color: role, alpha: 0.5 * al, w: 15 * ws, gap: 10 * ws, angle: ang, maxLen: 140, still: true, p });
    P.crayon(C, shape, { key: key + ':b', color: role, alpha: 0.38 * al, w: 12 * ws, gap: 9 * ws, angle: ang + 0.7, maxLen: 90, still: true, p, cond: (m) => m[0] < 0.62 });
    P.crayon(C, shape, { key: key + ':c', color: role + ':sh', alpha: 0.42 * al, w: 10 * ws, gap: 8 * ws, angle: ang - 0.5, maxLen: 80, still: true, p, cond: (m) => m[0] < 0.36 });
    P.crayon(P.L.graphite, shape, { key: key + ':g', color: 'line', alpha: 0.2 * al, w: 1.3, gap: 5, angle: ang + 1.2, maxLen: 50, still: true, p, cond: (m) => m[0] < 0.12 });
    return poly;
  }
  // коробка-параллелепипед (видимые грани): стол, табурет, подоконник, чемодан
  function cuboidNow(key, c, fr, sz, role, o = {}) {
    const al = o.al === undefined ? 1 : o.al, p = o.p === undefined ? 1 : o.p;
    if (al <= 0.004) return;
    const hw = sz[0] / 2, hh = sz[1] / 2, hd = sz[2] / 2;
    const L = (x, y, z) => at(c, fr, x, y, z);
    const faces = [
      [[L(-hw, -hh, hd), L(hw, -hh, hd), L(hw, hh, hd), L(-hw, hh, hd)], fr.f],
      [[L(hw, -hh, -hd), L(-hw, -hh, -hd), L(-hw, hh, -hd), L(hw, hh, -hd)], mul(fr.f, -1)],
      [[L(-hw, -hh, -hd), L(-hw, -hh, hd), L(-hw, hh, hd), L(-hw, hh, -hd)], mul(fr.r, -1)],
      [[L(hw, -hh, hd), L(hw, -hh, -hd), L(hw, hh, -hd), L(hw, hh, hd)], fr.r],
      [[L(-hw, hh, hd), L(hw, hh, hd), L(hw, hh, -hd), L(-hw, hh, -hd)], fr.u],
      [[L(-hw, -hh, -hd), L(hw, -hh, -hd), L(hw, -hh, hd), L(-hw, -hh, hd)], mul(fr.u, -1)],
    ];
    faces.forEach(([pts, n], i) => {
      if (dot(n, sub(S.CAM.pos, pts[0])) <= 0) return;
      S.drawPoly(key + i, pts, { color: role, normal: n, alpha: al, p, line: true, lw: o.lw || 1.6, shade: { noCore: true, w: o.ws || 0.6 } });
    });
  }
  function cuboid(key, c, fr, sz, role, o = {}) { S.push(S.depth(c) + (o.bias || 0), () => cuboidNow(key, c, fr, sz, role, o)); }

  // ---- комната
  function room(E, o = {}) {
    const al = o.al === undefined ? 1 : o.al, p = o.p === undefined ? 1 : o.p;
    if (al <= 0.004) return;
    const R = ROOM, k = 'r' + E.id, h = R.h;
    const pW = seg(p, 0.15, 0.85), pF = seg(p, 0, 0.6), pL = seg(p, 0, 0.45);
    S.push(BGD + 10, () => {
      const walls = [
        ['b', [[R.x0, 0, R.z0], [R.x1, 0, R.z0], [R.x1, h, R.z0], [R.x0, h, R.z0]], [0, 0, 1], -0.35],
        ['l', [[R.x0, 0, R.z1], [R.x0, 0, R.z0], [R.x0, h, R.z0], [R.x0, h, R.z1]], [1, 0, 0], -0.6],
        ['r', [[R.x1, 0, R.z0], [R.x1, 0, R.z1], [R.x1, h, R.z1], [R.x1, h, R.z0]], [-1, 0, 0], -0.2],
        ['f', [[R.x1, 0, R.z1], [R.x0, 0, R.z1], [R.x0, h, R.z1], [R.x1, h, R.z1]], [0, 0, -1], -0.45],
      ];
      for (const [id, pts, n, ang] of walls) planeCrayon(k + id, pts, E.wall, n, { al, p: pW, reach: E.reach, angle: ang });
      planeCrayon(k + 'fl', [[R.x0, 0, R.z1], [R.x1, 0, R.z1], [R.x1, 0, R.z0], [R.x0, 0, R.z0]], 'floor', [0, 1, 0],
        { al, p: pF, reach: E.reach * 1.15, angle: S.screenAngle([0, 0, -60], [0, 0, 1]) + 0.12, w: 0.9 });
    });
    S.push(BGD + 9, () => {
      // доски пола
      for (let x = R.x0 + 24; x < R.x1; x += 24) S.line(k + 'bd' + x, [[x, 0, R.z0], [x, 0, R.z1]], { w: 1.1, alpha: 0.3 * al, p: pF, sketch: false, color: 'floor:dk' });
      // обои в полоску (1979)
      if (E.stripes) {
        for (let x = R.x0 + 16; x < R.x1; x += 32) S.line(k + 'sp' + x, [[x, 10, R.z0 + 0.3], [x, h, R.z0 + 0.3]], { w: 1.4, alpha: 0.2 * al, p: pW, sketch: false, color: E.wall + ':dk' });
        for (let z = R.z0 + 16; z < R.z1; z += 32) S.line(k + 'sq' + z, [[R.x0 + 0.3, 10, z], [R.x0 + 0.3, h, z]], { w: 1.4, alpha: 0.2 * al, p: pW, sketch: false, color: E.wall + ':dk' });
      }
      // плинтус
      const BB = 9, e = 1.2;
      const strips = [
        [[R.x0, 0, R.z0 + e], [R.x1, 0, R.z0 + e], [R.x1, BB, R.z0 + e], [R.x0, BB, R.z0 + e]],
        [[R.x0 + e, 0, R.z1], [R.x0 + e, 0, R.z0], [R.x0 + e, BB, R.z0], [R.x0 + e, BB, R.z1]],
        [[R.x1 - e, 0, R.z0], [R.x1 - e, 0, R.z1], [R.x1 - e, BB, R.z1], [R.x1 - e, BB, R.z0]],
        [[R.x1, 0, R.z1 - e], [R.x0, 0, R.z1 - e], [R.x0, BB, R.z1 - e], [R.x1, BB, R.z1 - e]],
      ];
      strips.forEach((q, i) => {
        S.drawPoly(k + 'bb' + i, q, { color: 'floor:dk', crayon: { w: 8, gap: 5, angle: 0.1, alpha: 0.5 * al }, alpha: al, p: pW, knock: false });
        S.line(k + 'bbl' + i, [q[3], q[2]], { w: 1.4, alpha: 0.7 * al, p: pW, sketch: false });
      });
      // рёбра комнаты
      const C = [[R.x0, 0, R.z0], [R.x1, 0, R.z0], [R.x1, 0, R.z1], [R.x0, 0, R.z1]];
      for (let i = 0; i < 4; i++) {
        const a = C[i], b = C[(i + 1) % 4];
        S.line(k + 'ef' + i, [a, b], { w: 2.4, alpha: 0.85 * al, p: pL });
        S.line(k + 'ec' + i, [[a[0], h, a[2]], [b[0], h, b[2]]], { w: 2, alpha: 0.55 * al, p: pL });
        S.line(k + 'ev' + i, [a, [a[0], h, a[2]]], { w: 2, alpha: 0.75 * al, p: pL });
      }
    });
    if (E.sun) S.push(BGD + 8.5, () => sunPatch(k, al, seg(p, 0.5, 1)));
    S.push(BGD + 8, () => {
      windowBack(E, k, al, p);
      if (E.carpet) carpet(k, al, p);
      door(E, k, al, p, o.door || 'closed');
    });
    if (E.curtain) S.push(BGD + 7.5, () => curtains(E, k, al, p));
    if (E.lamp) lamp(k + 'lm', E.lamp, al, seg(p, 0.4, 1));
  }
  // окно на задней стене
  function windowBack(E, k, al, p) {
    const z = ROOM.z0 + 0.6, w = WIN, pq = seg(p, 0.3, 0.9);
    if (pq <= 0) return;
    const glass = [[w.x0, w.y0, z], [w.x1, w.y0, z], [w.x1, w.y1, z], [w.x0, w.y1, z]];
    S.drawPoly(k + 'gl', glass, { color: E.sky, crayon: { w: 12, gap: 8, angle: -0.6, alpha: 0.55 * al }, alpha: al, p: pq });
    S.drawPoly(k + 'gl2', glass, { color: 'light', crayon: { w: 10, gap: 9, angle: 0.5, alpha: 0.6 * al }, alpha: al, p: pq, knock: false });
    if (E.frost) { // морозные узоры
      const r = P.staticRng(k + 'frost');
      for (let i = 0; i < 10; i++) {
        const x0 = lerp(w.x0, w.x1, r()), dir = r() < 0.5 ? 1 : -1, pts = [];
        for (let j = 0; j <= 6; j++) pts.push([x0 + dir * j * 4 + Math.sin(j * 1.3 + i) * 3, w.y0 + 2 + j * (5 + r() * 4), z + 0.3]);
        S.line(k + 'fr' + i, pts, { ctx: P.L.color, color: 'light', w: 3, alpha: 0.9 * al, p: pq, sketch: false });
      }
    }
    const fw = 5, xm = (w.x0 + w.x1) / 2, ym = w.y0 + (w.y1 - w.y0) * 0.66, zf = z + 0.5;
    const bar = (id, x0, y0, x1, y1) => S.drawPoly(k + 'wf' + id, [[x0, y0, zf], [x1, y0, zf], [x1, y1, zf], [x0, y1, zf]], { color: 'cream', crayon: { w: 6, gap: 4, angle: 0.3, alpha: 0.75 * al }, alpha: al, p: pq, line: true, lw: 1.5 });
    bar('t', w.x0 - fw, w.y1, w.x1 + fw, w.y1 + fw); bar('b', w.x0 - fw, w.y0 - fw, w.x1 + fw, w.y0);
    bar('l', w.x0 - fw, w.y0, w.x0, w.y1); bar('r', w.x1, w.y0, w.x1 + fw, w.y1);
    bar('v', xm - 2.5, w.y0, xm + 2.5, w.y1); bar('h', w.x0, ym - 2.5, w.x1, ym + 2.5);
    cuboidNow(k + 'sill', [xm, w.y0 - fw - 2, ROOM.z0 + 9], frame(0), [w.x1 - w.x0 + 34, 4, 18], 'cream', { al, p: pq });
  }
  // солнечное пятно на полу с тенью переплёта
  function sunPatch(k, al, p) {
    if (p <= 0) return;
    const w = WIN, d = [0.25, -0.7, 1];
    const fl = (x, y) => { const t = y / 0.7; return [x + d[0] * t, 0.3, ROOM.z0 + t]; };
    const quad = [fl(w.x0, w.y0), fl(w.x1, w.y0), fl(w.x1, w.y1), fl(w.x0, w.y1)];
    S.drawPoly(k + 'sun', quad, { color: 'light', crayon: { w: 14, gap: 9, angle: 0.2, alpha: 0.55 * al }, alpha: al, p, knock: false });
    S.drawPoly(k + 'sun2', quad, { color: 'wallB:lt', crayon: { w: 12, gap: 10, angle: 0.9, alpha: 0.25 * al }, alpha: al, p, knock: false });
    const xm = (w.x0 + w.x1) / 2, ym = w.y0 + (w.y1 - w.y0) * 0.66;
    S.line(k + 'sb1', [fl(xm, w.y0), fl(xm, w.y1)], { ctx: P.L.color, w: 6, alpha: 0.3 * al, p, color: 'floor:sh', sketch: false });
    S.line(k + 'sb2', [fl(w.x0, ym), fl(w.x1, ym)], { ctx: P.L.color, w: 6, alpha: 0.3 * al, p, color: 'floor:sh', sketch: false });
  }
  function curtains(E, k, al, p) {
    const z = ROOM.z0 + 3, w = WIN, pq = seg(p, 0.4, 1);
    if (pq <= 0) return;
    for (const [id, x0, x1] of [['l', w.x0 - 48, w.x0 + 6], ['r', w.x1 - 6, w.x1 + 48]]) {
      S.drawPoly(k + 'ct' + id, [[x0, 55, z], [x1, 55, z], [x1, 248, z], [x0, 248, z]], { color: E.curtain, crayon: { w: 10, gap: 6, angle: 1.45, alpha: 0.7 * al }, alpha: al, p: pq, line: true, lw: 1.6 });
      for (let i = 1; i < 4; i++) { const xx = lerp(x0, x1, i / 4); S.line(k + 'cf' + id + i, [[xx, 248, z], [xx + 2, 150, z], [xx - 1, 56, z]], { w: 1.4, alpha: 0.5 * al, p: pq, color: E.curtain + ':dk' }); }
    }
    S.line(k + 'rod', [[w.x0 - 60, 252, z + 1], [w.x1 + 60, 252, z + 1]], { w: 3, alpha: al, p: pq });
  }
  // дверь в правой стене: открытый проём (1956) или закрытая дверь, наличник
  function door(E, k, al, p, mode) {
    const x = ROOM.x1 - 0.6, D = DOOR, pq = seg(p, 0.25, 0.9);
    if (pq <= 0) return;
    const opening = [[x, 0, D.z0], [x, 0, D.z1], [x, D.h, D.z1], [x, D.h, D.z0]];
    if (mode === 'open') {
      const poly = S.drawPoly(k + 'hole', opening, { color: E.wall + ':sh', crayon: { w: 12, gap: 6, angle: 0.9, alpha: 0.8 * al }, alpha: al, p: pq });
      if (poly) P.hatch(P.L.graphite, poly, { key: k + 'hh', alpha: 0.3 * al, gap: 8, angle: 1.0, p: pq });
    } else {
      S.drawPoly(k + 'leaf', opening, { color: 'cream', crayon: { w: 12, gap: 8, angle: 1.1, alpha: 0.5 * al }, alpha: al, p: pq });
      [[18, 95], [110, 190]].forEach(([a, b], i) => {
        const q = [[x - 0.3, a, D.z0 + 12], [x - 0.3, a, D.z1 - 12], [x - 0.3, b, D.z1 - 12], [x - 0.3, b, D.z0 + 12]];
        S.line(k + 'pan' + i, q.concat([q[0]]), { w: 1.5, alpha: 0.55 * al, p: pq, sketch: false });
      });
      S.drawEll(k + 'knob', [x - 3, 100, D.z1 - 11], frame(0), [2.6, 2.6, 2.6], { color: 'wallB', alpha: al, p: pq, lw: 1.3, shade: { noCore: true, shine: 1.3 } });
    }
    const xc = ROOM.x1 - 1.4, c = D.c;
    const q = (z0, z1, y0, y1) => [[xc, y0, z0], [xc, y0, z1], [xc, y1, z1], [xc, y1, z0]];
    [q(D.z0 - c, D.z0, 0, D.h + c), q(D.z1, D.z1 + c, 0, D.h + c), q(D.z0, D.z1, D.h, D.h + c)].forEach((pts, i) =>
      S.drawPoly(k + 'cs' + i, pts, { color: 'cream', crayon: { w: 7, gap: 5, angle: 1.2, alpha: 0.7 * al }, alpha: al, p: pq, line: true, lw: 1.7 }));
  }
  // отметки роста на наличнике; подписи — на полотне двери
  function doorMarks(t, list, al = 1) {
    if (al <= 0.004) return;
    S.push(BGD + 6, () => {
      const G = P.L.graphite, x = ROOM.x1 - 2.4, z0 = DOOR.z1 - 1.5, z1 = DOOR.z1 + DOOR.c + 1.5;
      for (const [g, done] of list) {
        if (!done && t < g.grow[0]) continue;
        g.ages.forEach((age, i) => {
          const tc = ageCross(g, age);
          const pr = done ? 1 : seg(t, tc, tc + 0.22);
          if (pr <= 0) return;
          const y = F.heightOf(g.spec, age);
          S.line('mk' + g.key + age, [[x, y, z0], [x, y + 0.4, z1]], { w: 3.2, alpha: al, p: pr, sketch: false, gaps: false, color: g.color });
          const a = S.proj([x, y, DOOR.z1 - 3]), b = S.proj([x, y, DOOR.z1 - 30]);
          if (!a || !b) return;
          const size = clamp(a[3] * 4.4, 13, 38), dir = b[0] < a[0] ? -1 : 1;
          const last = i === g.ages.length - 1 && (done || t > g.grow[1] - 0.2);
          if (done && !last) return;
          const txt = done ? g.name : String(g.born + age) + (last ? ' ' + g.name : '');
          write(G, txt, a[0] + dir * size * 0.15, a[1] + size * 0.32, { key: 'mt' + g.key + age + (last ? 'n' : ''), size, p: pr, alpha: al * 0.95, color: g.color, align: dir < 0 ? 'right' : 'left', weight: 500 });
        });
      }
    });
  }
  // ковёр на стене (1979)
  function carpet(k, al, p) {
    const x = ROOM.x0 + 0.8, z0 = -330, z1 = -90, y0 = 70, y1 = 205, pq = seg(p, 0.3, 0.9);
    if (pq <= 0) return;
    const quad = [[x, y0, z1], [x, y0, z0], [x, y1, z0], [x, y1, z1]];
    S.drawPoly(k + 'cp', quad, { color: 'warm:dk', crayon: { w: 10, gap: 6, angle: 0.8, alpha: 0.75 * al }, alpha: al, p: pq, line: true, lw: 1.8 });
    const xi = x + 0.3, m = 12;
    const inner = [[xi, y0 + m, z1 - m], [xi, y0 + m, z0 + m], [xi, y1 - m, z0 + m], [xi, y1 - m, z1 - m]];
    S.line(k + 'cpb', inner.concat([inner[0]]), { ctx: P.L.color, color: 'wallB', w: 5, alpha: 0.8 * al, p: pq, sketch: false });
    const zc = (z0 + z1) / 2, yc = (y0 + y1) / 2;
    for (const [s, role] of [[1, 'wallB'], [0.5, 'a1']]) {
      const dm = [[xi, yc - 50 * s, zc], [xi, yc, zc - 85 * s], [xi, yc + 50 * s, zc], [xi, yc, zc + 85 * s]];
      S.line(k + 'cpd' + s, dm.concat([dm[0]]), { ctx: P.L.color, color: role, w: 5, alpha: 0.8 * al, p: pq, sketch: false });
    }
    for (let i = 0; i <= 12; i++) {
      const z = lerp(z0 + 4, z1 - 4, i / 12);
      S.line(k + 'fa' + i, [[x, y0, z], [x, y0 - 6, z]], { w: 1, alpha: 0.5 * al, p: pq, sketch: false, gaps: false });
      S.line(k + 'fb' + i, [[x, y1, z], [x, y1 + 6, z]], { w: 1, alpha: 0.5 * al, p: pq, sketch: false, gaps: false });
    }
  }
  // торшер (1979): он же источник света
  function lamp(k, base, al, p) {
    if (p <= 0 || al <= 0.004) return;
    const top = add(base, [0, 150, 0]);
    S.push(S.depth(add(base, [0, 90, 0])), () => {
      S.drawEll(k + 'b', add(base, [0, 2, 0]), frame(0), [15, 2.5, 15], { color: 'hairDark', alpha: al, p, lw: 1.5, shade: { noCore: true } });
      S.drawTube(k + 'p', [add(base, [0, 3, 0]), top], [1.4, 1.2], { color: 'hairDark', alpha: al, p, lw: 1.4, shade: { noCore: true } });
      const lo = S.ringScreen(add(base, [0, 146, 0]), [28, 0, 0], [0, 0, 28], 18), hi = S.ringScreen(add(base, [0, 182, 0]), [16, 0, 0], [0, 0, 16], 18);
      if (lo.length < 6 || hi.length < 6) return;
      const shade = S.hull(lo.concat(hi));
      S.knock([shade], al);
      P.volume(P.polyShape(shade), { key: k + 's', color: 'wallB:lt', alpha: al, p, light: [0, 0, 1], w: 0.6, noCore: true, shine: 1.3, lightAt: 0.5 });
      P.stroke(P.L.graphite, shade, { key: k + 'so', closed: true, w: 1.8, alpha: al, p });
      P.stroke(P.L.graphite, lo, { key: k + 'sr', closed: true, w: 1.3, alpha: al * 0.6, p, sketch: false });
    });
  }
  // ёлка (1956): ярусы-конусы, шары, звезда
  const TIERS = [[26, 102, 64], [70, 140, 52], [110, 176, 40], [148, 214, 27]];
  const ORN = ['a1', 'wallB', 'light', 'a1:dk'];
  function tree(k, base, al, p) {
    if (al <= 0.004 || p <= 0) return;
    const d0 = S.depth(add(base, [0, 100, 0]));
    S.push(d0 + 5, () => {
      S.drawTube(k + 'pot', [base, add(base, [0, 26, 0])], [19, 16], { color: 'a1:sh', alpha: al, p: seg(p, 0, 0.3), lw: 2, shade: { noCore: true } });
      S.drawTube(k + 'tr', [add(base, [0, 24, 0]), add(base, [0, 40, 0])], [5, 4.5], { color: 'fur:dk', alpha: al, p: seg(p, 0, 0.3), lw: 1.6, capB: false });
    });
    TIERS.forEach(([y0, y1, r], i) => {
      const pT = seg(p, 0.15 + i * 0.12, 0.5 + i * 0.12);
      const c = add(base, [0, y0, 0]), apex = add(base, [0, y1, 0]);
      S.push(d0 - i * 0.5, () => {
        if (pT <= 0) return;
        const ring = S.ringScreen(c, [r, 0, 0], [0, 0, r], 20);
        const ap = S.proj(apex);
        if (ring.length < 8 || !ap) return;
        const poly = S.hull(ring.concat([[ap[0], ap[1]]]));
        const l = S.lightS(add(base, [0, (y0 + y1) / 2, 0]));
        S.knock([poly], al * clamp(pT * 3));
        P.volume(P.polyShape(poly, { round: 0.95 }), { key: k + 'v' + i, color: 'a2', alpha: al, p: pT, light: l, w: 0.75, shine: 0.6, angle: -1.2 });
        const edge = [];
        for (let j = 0; j <= 28; j++) {
          const a = (j / 28) * PI * 2, rr = r * (j % 2 ? 1.06 : 0.9);
          const q = [c[0] + Math.sin(a) * rr, c[1] + (j % 2 ? -3 : 3), c[2] + Math.cos(a) * rr];
          if (dot([Math.sin(a), 0, Math.cos(a)], S.toViewer(q)) > -0.05) { const s = S.proj(q); if (s) edge.push([s[0], s[1]]); }
        }
        if (edge.length > 2) P.stroke(P.L.graphite, edge, { key: k + 'e' + i, w: 1.8, alpha: al, p: pT });
        P.stroke(P.L.graphite, poly, { key: k + 'o' + i, closed: true, w: 1.6, alpha: al * 0.55, p: pT, wAt: S.weightFn(poly, l) });
      });
      for (let j = 0; j < 4; j++) {
        const a = j * 1.57 + i * 0.8, hh = lerp(y0, y1, 0.22), rr = r * 0.78 + 3;
        const q = add(base, [Math.sin(a) * rr, hh, Math.cos(a) * rr]);
        const n = norm([Math.sin(a), 0.3, Math.cos(a)]);
        S.push(d0 - i * 0.5 - 0.2, () => {
          if (dot(n, S.toViewer(q)) < 0.15) return;
          S.drawEll(k + 'b' + i + j, q, frame(0), [4.5, 4.5, 4.5], { color: ORN[(i + j) % 4], alpha: al, p: seg(p, 0.7, 1), lw: 1.3, shade: { noCore: true, shine: 1.4, lightAt: 0.7 } });
        });
      }
    });
    S.push(d0 - 3, () => {
      const s = S.proj(add(base, [0, TIERS[3][1] + 7, 0]));
      if (!s) return;
      const R = 9 * s[3], pts = [];
      for (let i = 0; i < 10; i++) { const a = -PI / 2 + i * PI / 5, rr = i % 2 ? R * 0.45 : R; pts.push([s[0] + Math.cos(a) * rr, s[1] + Math.sin(a) * rr]); }
      const ps = seg(p, 0.8, 1);
      S.knock([pts], al * ps);
      P.crayon(P.L.color, P.polyShape(pts), { key: k + 'st', color: 'wallB', alpha: 0.9 * al * ps, w: 4, gap: 3 });
      P.stroke(P.L.graphite, pts, { key: k + 'sto', closed: true, w: 1.6, alpha: al, p: ps });
    });
  }
  // стол и табурет
  function table(k, al = 1) {
    const fr = frame(TABLE.yaw), c = [TABLE.c[0], TABLE.h - 2, TABLE.c[1]];
    cuboid(k + 'top', c, fr, [TABLE.w, 4, TABLE.d], 'floor:dk', { al });
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const a = at(c, fr, sx * (TABLE.w / 2 - 6), -2, sz * (TABLE.d / 2 - 6));
      S.push(S.depth(a) + 1, () => S.drawTube(k + 'leg' + sx + sz, [a, [a[0], 0, a[2]]], [2.6, 2.2], { color: 'floor:dk', alpha: al, lw: 1.5, shade: { noCore: true } }));
    }
  }
  function stool(k, c, al = 1) {
    const seat = [c[0], 63, c[1]];
    cuboid(k + 'seat', seat, frame(0.2), [42, 6, 36], 'floor:dk', { al });
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const a = at(seat, frame(0.2), sx * 16, -3, sz * 13);
      S.push(S.depth(a) + 1, () => S.drawTube(k + 'leg' + sx + sz, [a, [a[0], 0, a[2]]], [2.2, 2], { color: 'floor:dk', alpha: al, lw: 1.4, shade: { noCore: true } }));
    }
  }

  // ---- картонная коробка с клапанами (0 — торчит вверх, π/2 — закрыт, <0 — отогнут)
  const BOX = { w: 56, d: 46, h: 42 };
  function box(k, c, yaw, fl, o = {}) {
    const al = o.al === undefined ? 1 : o.al, p = o.p === undefined ? 1 : o.p;
    if (al <= 0.004) return;
    const fr = frame(yaw), O = flat(c);
    const L = (x, y, z) => at(O, fr, x, y, z);
    const w = BOX.w / 2, d = BOX.d / 2, h = BOX.h;
    const parts = [
      { id: 'f', pts: [L(-w, 0, d), L(w, 0, d), L(w, h, d), L(-w, h, d)], n: fr.f },
      { id: 'b', pts: [L(w, 0, -d), L(-w, 0, -d), L(-w, h, -d), L(w, h, -d)], n: mul(fr.f, -1) },
      { id: 'l', pts: [L(-w, 0, -d), L(-w, 0, d), L(-w, h, d), L(-w, h, -d)], n: mul(fr.r, -1) },
      { id: 'r', pts: [L(w, 0, d), L(w, 0, -d), L(w, h, -d), L(w, h, d)], n: fr.r },
      { id: 'bt', pts: [L(-w, 0.4, d), L(w, 0.4, d), L(w, 0.4, -d), L(-w, 0.4, -d)], n: fr.u, floor: true },
    ];
    const flap = (id, A, B, inward, ang, lift) => {
      const dir = add(mul(fr.u, Math.cos(ang)), mul(inward, Math.sin(ang)));
      const a = madd(A, fr.u, lift), b = madd(B, fr.u, lift);
      return { id: 'fl' + id, pts: [a, b, madd(b, dir, d), madd(a, dir, d)], n: add(mul(inward, -Math.cos(ang)), mul(fr.u, Math.sin(ang))), flap: true };
    };
    parts.push(
      flap('l', L(-w, h, d), L(-w, h, -d), fr.r, fl.l, 0),
      flap('r', L(w, h, -d), L(w, h, d), mul(fr.r, -1), fl.r, 0),
      flap('b', L(-w, h, -d), L(w, h, -d), fr.f, fl.b, 0.5),
      flap('f', L(w, h, d), L(-w, h, d), mul(fr.f, -1), fl.f, 0.9),
    );
    for (const pt of parts) {
      const cen = mul(pt.pts.reduce((s, q) => add(s, q), [0, 0, 0]), 0.25);
      const outer = dot(pt.n, sub(S.CAM.pos, cen)) > 0;
      const role = pt.floor || !outer ? 'cardboard:sh' : 'cardboard';
      S.push(S.depth(cen) - (pt.flap ? 0.3 : 0), () => {
        const poly = S.drawPoly(k + pt.id, pt.pts, { color: role, normal: outer ? pt.n : mul(pt.n, -1), alpha: al, p, line: true, lw: 1.8, shade: { noCore: !pt.floor && outer, w: 0.7 } });
        if (poly && pt.id === 'f' && outer && o.label) { // надпись на боку
          const q = S.proj(L(0, h * 0.5, d + 0.3));
          if (q) write(P.L.graphite, o.label, q[0], q[1] + 8, { key: k + 'lbl', size: clamp(q[3] * 6.5, 14, 60), align: 'center', alpha: al * 0.85, weight: 600, rot: -0.04 });
        }
        if (poly && pt.id === 'flf' && o.dust) { // пыль на крышке
          const r = P.staticRng(k + 'dust'), C = P.L.graphite;
          C.fillStyle = P.col('soft', 0.45 * al);
          for (let i = 0; i < o.dust; i++) {
            const s = S.proj(L(lerp(-w, w, r()), h + 1.4, lerp(-d, d, r())));
            if (s) { C.beginPath(); C.arc(s[0], s[1], Math.max(0.7, s[3] * (0.25 + r() * 0.35)), 0, 6.283); C.fill(); }
          }
        }
      });
    }
  }

  // ---- чердак: двускатная крыша, круглое окно, балки, старые вещи
  const ATT = { x0: -290, x1: 290, z0: -300, z1: 260, eave: 55, ridge: 265 };
  const AWIN = [0, 165, ATT.z0 + 0.6], AWR = 34;
  function attic(k, day, al = 1) {
    const A = ATT, reach = day ? 720 : 560;
    S.push(BGD + 10, () => {
      planeCrayon(k + 'fl', [[A.x0, 0, A.z1], [A.x1, 0, A.z1], [A.x1, 0, A.z0], [A.x0, 0, A.z0]], 'floor', [0, 1, 0], { al, reach, angle: S.screenAngle([0, 0, -40], [0, 0, 1]) + 0.1, w: 0.9 });
      const gable = (z) => [[A.x0, 0, z], [A.x1, 0, z], [A.x1, A.eave, z], [0, A.ridge, z], [A.x0, A.eave, z]];
      planeCrayon(k + 'gb', gable(A.z0), 'cardboard', [0, 0, 1], { al, reach, angle: 1.35 });
      planeCrayon(k + 'gf', gable(A.z1), 'cardboard', [0, 0, -1], { al, reach, angle: 1.35 });
      planeCrayon(k + 'kl', [[A.x0, 0, A.z1], [A.x0, 0, A.z0], [A.x0, A.eave, A.z0], [A.x0, A.eave, A.z1]], 'cardboard', [1, 0, 0], { al, reach, angle: 1.3 });
      planeCrayon(k + 'kr', [[A.x1, 0, A.z0], [A.x1, 0, A.z1], [A.x1, A.eave, A.z1], [A.x1, A.eave, A.z0]], 'cardboard', [-1, 0, 0], { al, reach, angle: 1.3 });
      planeCrayon(k + 'rl', [[A.x0, A.eave, A.z1], [A.x0, A.eave, A.z0], [0, A.ridge, A.z0], [0, A.ridge, A.z1]], 'floor', norm([A.ridge - A.eave, A.x0, 0]), { al, reach, angle: -0.2 });
      planeCrayon(k + 'rr', [[A.x1, A.eave, A.z0], [A.x1, A.eave, A.z1], [0, A.ridge, A.z1], [0, A.ridge, A.z0]], 'floor', norm([-(A.ridge - A.eave), A.x0, 0]), { al, reach, angle: 0.2 });
    });
    S.push(BGD + 9, () => {
      for (let z = A.z0 + 24; z < A.z1; z += 26) S.line(k + 'bd' + z, [[A.x0, 0, z], [A.x1, 0, z]], { w: 1.1, alpha: 0.28 * al, sketch: false, color: 'floor:dk' });
      for (let x = A.x0 + 30; x < A.x1; x += 30) { // доски фронтона
        const top = Math.abs(x) < 1 ? A.ridge : lerp(A.ridge, A.eave, Math.abs(x) / A.x1);
        S.line(k + 'gv' + x, [[x, 0, A.z0 + 0.3], [x, top, A.z0 + 0.3]], { w: 1.1, alpha: 0.3 * al, sketch: false, color: 'cardboard:dk' });
      }
      for (let i = 1; i < 5; i++) for (const s of [-1, 1]) { // доски кровли
        const x = s * A.x1 * (1 - i / 5), y = lerp(A.eave, A.ridge, i / 5);
        S.line(k + 'rb' + s + i, [[x, y, A.z0], [x, y, A.z1]], { w: 1.1, alpha: 0.28 * al, sketch: false, color: 'floor:dk' });
      }
      const edges = [
        [[A.x0, 0, A.z0], [A.x1, 0, A.z0]], [[A.x0, 0, A.z0], [A.x0, A.eave, A.z0]], [[A.x1, 0, A.z0], [A.x1, A.eave, A.z0]],
        [[A.x0, A.eave, A.z0], [0, A.ridge, A.z0]], [[A.x1, A.eave, A.z0], [0, A.ridge, A.z0]],
        [[A.x0, 0, A.z0], [A.x0, 0, A.z1]], [[A.x1, 0, A.z0], [A.x1, 0, A.z1]],
        [[A.x0, A.eave, A.z0], [A.x0, A.eave, A.z1]], [[A.x1, A.eave, A.z0], [A.x1, A.eave, A.z1]],
        [[A.x0, 0, A.z1], [A.x1, 0, A.z1]], [[A.x0, A.eave, A.z1], [0, A.ridge, A.z1]], [[A.x1, A.eave, A.z1], [0, A.ridge, A.z1]],
      ];
      edges.forEach(([a, b], i) => S.line(k + 'e' + i, [a, b], { w: 2.2, alpha: 0.8 * al }));
    });
    // круглое окно
    S.push(BGD + 8, () => {
      const ring = S.ring(AWIN, [AWR, 0, 0], [0, AWR, 0], 28);
      S.drawPoly(k + 'win', ring, { color: day ? 'light' : 'night', crayon: { w: 10, gap: 6, angle: -0.5, alpha: (day ? 0.8 : 0.85) * al }, alpha: al });
      if (day) S.drawPoly(k + 'win2', ring, { color: 'a1:lt', crayon: { w: 9, gap: 9, angle: 0.6, alpha: 0.3 * al }, alpha: al, knock: false });
      else S.drawEll(k + 'moon', add(AWIN, [12, 12, 0.3]), frame(0), [7, 7, 0.5], { color: 'light', alpha: al, lw: 1.2, shade: { noCore: true, noLight: true } });
      S.line(k + 'wr', ring.concat([ring[0]]), { w: 3, alpha: al });
      S.line(k + 'wv', [add(AWIN, [0, -AWR, 0.5]), add(AWIN, [0, AWR, 0.5])], { w: 2.4, alpha: al, sketch: false });
      S.line(k + 'wh', [add(AWIN, [-AWR, 0, 0.5]), add(AWIN, [AWR, 0, 0.5])], { w: 2.4, alpha: al, sketch: false });
    });
    // луч из окна
    S.push(BGD + 7, () => {
      const d = norm([0.12, -0.62, 1]);
      const ring = S.ring(AWIN, [AWR, 0, 0], [0, AWR, 0], 16);
      const foot = ring.map((q) => madd(q, d, q[1] / -d[1]));
      const scr = ring.concat(foot).map((q) => S.proj(q)).filter(Boolean).map((q) => [q[0], q[1]]);
      if (scr.length < 6) return;
      P.crayon(P.L.color, P.polyShape(S.hull(scr)), { key: k + 'beam', color: day ? 'light' : 'a1:lt', alpha: (day ? 0.32 : 0.2) * al, w: 14, gap: 10, angle: -1.25, maxLen: 200, still: true });
      const fp = foot.map((q) => S.proj(q)).filter(Boolean).map((q) => [q[0], q[1]]);
      if (fp.length > 5) P.crayon(P.L.color, P.polyShape(S.hull(fp)), { key: k + 'foot', color: 'light', alpha: (day ? 0.55 : 0.35) * al, w: 12, gap: 8, angle: 0.3, still: true });
    });
    // стропила
    for (const z of [-220, -110, 0, 110, 220]) for (const s of [-1, 1]) {
      const a = [s * (A.x1 - 6), A.eave + 2, z], b = [0, A.ridge - 8, z];
      S.push(S.depth(lerp3(a, b, 0.5)), () => S.drawTube(k + 'raf' + s + z, [a, b], [5, 5], { color: 'floor:dk', alpha: al, lw: 1.7, shade: { noCore: true, w: 0.6 } }));
    }
    S.push(S.depth([0, A.ridge - 8, 0]) - 1, () => S.drawTube(k + 'ridge', [[0, A.ridge - 8, A.z0], [0, A.ridge - 8, A.z1]], [6, 6], { color: 'floor:dk', alpha: al, lw: 1.8, shade: { noCore: true, w: 0.6 } }));
    // старые вещи
    cuboid(k + 'case', [-150, 11, -150], frame(0.4), [64, 22, 40], 'fur:dk', { al });
    cuboid(k + 'box2', [170, 20, -200], frame(-0.3), [50, 40, 40], 'cardboard', { al });
    S.push(S.depth([160, 9, 40]), () => S.drawTube(k + 'roll', [[120, 9, 70], [200, 9, -10]], [9, 9], { color: 'a2:dk', alpha: al, lw: 1.7, shade: { w: 0.6 } }));
  }

  // ---------------------------------------------------------------------
  // Подписи
  // ---------------------------------------------------------------------
  const CAP = { year: [110, 178, 120], name: [114, 258, 62], sub: [116, 318, 46] };
  function cap(t, kind, text, t0, al = 1, ks = '') {
    const ctx = P.L.graphite;
    const [x, y, size] = CAP[kind];
    const p = seg(t, t0, t0 + Math.max(0.3, text.length * 0.045));
    if (p <= 0 || al <= 0.004) return;
    const tw = P.textWidth(ctx, text, size);
    S.knock([[[x - 18, y - size * 0.82], [x + tw * p + 20, y - size * 0.82], [x + tw * p + 20, y + size * 0.28], [x - 18, y + size * 0.28]]], 0.75 * al * p);
    write(ctx, text, x, y, { key: 'cap:' + kind + ks, size, p, alpha: al });
  }
  // подпись над головой
  function tag(t, text, pt, t0, al, key, size = 40) {
    const q = S.proj(pt), p = seg(t, t0, t0 + 0.5);
    if (!q || p <= 0 || al <= 0.004) return;
    const ctx = P.L.graphite, tw = P.textWidth(ctx, text, size);
    S.knock([[[q[0] - tw / 2 - 12, q[1] - size * 0.8], [q[0] + tw / 2 + 12, q[1] - size * 0.8], [q[0] + tw / 2 + 12, q[1] + size * 0.3], [q[0] - tw / 2 - 12, q[1] + size * 0.3]]], 0.6 * al * p);
    write(ctx, text, q[0], q[1], { key: 'tag:' + key, size, align: 'center', p, alpha: al, weight: 600 });
  }

  // =====================================================================
  // ПЛАНЫ
  // =====================================================================
  const POST = { night: 0, flash: 0, warm: 0, dark: 0, leak: null };

  // ---- 0 + 1A. Мишка рисуется на пустом листе, вокруг вырастает комната 1956 года, вбегает Аня
  function shot01(t) {
    const E = ERA[1956];
    useLight(E.light);
    const c = add(BEAR0, [0, 20, 0]);
    const orb = (tt) => { const u = seg(tt, -1, 4.6); return orbit(c, lerp(BYAW - 1.05, BYAW - 0.3, u), lerp(128, 112, u), lerp(34, 46, u), { target: add(c, [0, lerp(4, 2, u), 0]), fov: 34 }); };
    const wide = { pos: [10, 205, 215], target: [20, 55, -190], fov: 50 };
    cam(t <= 4.6 ? orb(t) : camMix(orb(4.6), wide, easeInOut(seg(t, 4.6, 7.6))));
    room(E, { p: seg(t, T.room1[0], T.room1[1]), door: 'open' });
    tree('tr', TREE, 1, seg(t, 4.5, 6.0));
    if (t >= T.anyaIn[0]) {
      const u = seg(t, T.run1[0], T.run1[1]), k = easeOut(u);
      const pos = [lerp(DOORP[0], ANYA1[0], k), lerp(DOORP[1], ANYA1[1], k)];
      const runYaw = Math.atan2(ANYA1[0] - DOORP[0], ANYA1[1] - DOORP[1]);
      const dist = Math.hypot(pos[0] - DOORP[0], pos[1] - DOORP[1]);
      const moving = u > 0 && u < 1;
      F.human(SPEC.anya, { key: 'anya', pos, yaw: lerpAng(runYaw, BYAW + PI, seg(u, 0.75, 1)), age: 5, walk: moving ? dist / 125 * 2 * PI : null, run: moving ? 1 - seg(u, 0.7, 1) : 0, walkAmp: 1.1, mood: 'open', draw: seg(t, T.anyaIn[0], T.anyaIn[1]), look: c });
    }
    bear(t, { pos: BEAR0, yaw: BYAW, ground: 0, draw: seg(t, T.bearDraw[0], T.bearDraw[1]), fur: seg(t, T.fur0[0], T.fur0[1]) });
    S.flush();
    const tAl = erase(t, T.titleOut[0], T.titleOut[1]);
    if (t < T.titleOut[1] + 1.1) {
      const G = P.L.graphite;
      write(G, 'Мишка', W / 2, 205, { key: 'title', size: 150, align: 'center', p: seg(t, T.title[0], T.title[1]), alpha: tAl, weight: 700 });
      write(G, 'одна игрушка — четыре поколения', W / 2, 990, { key: 'subtitle', size: 58, align: 'center', p: seg(t, T.sub[0], T.sub[1]), alpha: tAl });
    }
    cap(t, 'year', '1956', T.year1);
  }

  // ---- 1B. Глазами мишки: Аня наклоняется и поднимает его
  function shot1b(t) {
    const E = ERA[1956];
    useLight(E.light);
    const lk = easeInOut(seg(t, T.lift1[0], T.lift1[1]));
    const cr = easeInOut(seg(t, T.crouch1[0], T.crouch1[1])) * (1 - easeInOut(seg(t, T.lift1[0], T.lift1[1] - 0.15)));
    const st = { key: 'anya', pos: ANYA1, yaw: BYAW + PI, age: 5, crouch: cr * 0.8, bend: cr * 0.25, mood: t > T.lift1[0] + 0.35 ? 'happy' : 'open' };
    const g0 = F.rig(SPEC.anya, st);
    const stand = F.rig(SPEC.anya, Object.assign({}, st, { crouch: 0, bend: 0 }));
    const hf = hold(stand, 'front');
    const bpos = add(lerp3(BEAR0, hf.pos, lk), [0, Math.sin(lk * PI) * 10, 0]);
    const bfr = frame(BYAW, lerp(0, -0.12, lk));
    const sides = [at(bpos, bfr, 13.5 * BS, 21 * BS, 0), at(bpos, bfr, -13.5 * BS, 21 * BS, 0)];
    const rk = easeInOut(seg(t, T.reach1[0], T.reach1[1]));
    st.hands = [0, 1].map((i) => lerp3(g0.arms[i].wrist, sides[i], rk));
    st.armsFront = true; st.curl = lerp(0.4, 0.85, rk);
    const eye = at(bpos, bfr, 0, 37 * BS, 14 * BS);
    st.look = eye;
    const g = F.rig(SPEC.anya, st);
    cam({ pos: eye, target: g.cran.c, fov: 70, roll: 0.12 * Math.sin(lk * PI) - 0.04 });
    room(E, { door: 'open' });
    tree('tr', TREE, 1, 1);
    F.human(SPEC.anya, st);
    S.flush();
    cap(t, 'year', '1956', T.year1);
  }

  // ---- 1C. Аня кружится с мишкой, камера снизу облетает навстречу
  function shot1c(t) {
    const E = ERA[1956];
    useLight(E.light);
    const u = seg(t, T.spin1[0], T.spin1[1]), k = easeInOut(u);
    const st = { key: 'anya', pos: ANYA1, yaw: BYAW + PI + k * 2 * PI, age: 5, mood: 'happy', flare: 1 + 0.55 * Math.sin(u * PI), headPitch: -0.12 };
    const c = [ANYA1[0], 62, ANYA1[1]];
    const a = lerp(BYAW + 0.6, BYAW - 0.5, easeInOut(seg(t, T.s1c, T.s1d)));
    cam(sway(orbit(c, a, 175, 40, { target: add(c, [0, 10, 0]), fov: 46, roll: -0.07 }), t));
    room(E, { door: 'open' });
    tree('tr', TREE, 1, 1);
    withBear(t, SPEC.anya, st, 'hug');
    S.flush();
    cap(t, 'year', '1956', T.year1);
    cap(t, 'name', 'Аня, 5 лет', T.name1);
  }

  // ---- рост у дверного косяка (1D, 2C, 4C)
  function growShot(t, g, E, list, camFn, push) {
    useLight(E.light);
    const age = growAge(g, t), Hc = F.heightOf(g.spec, age);
    const st = { key: g.key, pos: [ROOM.x1 - 1.5 - Hc * 0.075, KIDZ], yaw: -PI / 2, age, mood: 'smile' };
    const g0 = F.rig(g.spec, st);
    const hp = hold(g0, 'side');
    const bc = at(hp.pos, hp.fr, 0, 24 * BS, 0);
    let C = camFn(t, Hc);
    if (push) {
      const kk = easeIn(seg(t, push[0], push[1]));
      if (kk > 0) C = camMix(C, { pos: madd(bc, norm(sub(C.pos, bc)), 62), target: bc, fov: 34 }, kk);
    }
    cam(C);
    room(E, { door: 'closed' });
    doorMarks(t, list);
    st.hands = hp.hands; st.curl = 0.8;
    F.human(g.spec, st);
    bear(t, { pos: hp.pos, fr: hp.fr });
    S.flush();
    const n = Math.floor(age + 1e-6);
    cap(t, 'year', String(g.born + n), g.grow[0] - 0.5);
    cap(t, 'name', g.name + ', ' + ageText(n), g.grow[0] - 0.4);
  }
  function shot1d(t) {
    growShot(t, GENS.anya, ERA[1956], [[GENS.anya, false]], (tt, Hc) => {
      const u = easeInOut(seg(tt, T.s1d, T.grow1[1])), a = lerp(-2.05, -1.2, u), r = lerp(215, 190, u);
      return { pos: [300 + Math.sin(a) * r, Hc * 0.78 + 15, -122 + Math.cos(a) * r], target: [308, Hc * 0.66, -124], fov: 38 };
    }, [14.6, T.s2a]);
  }

  // ---- 2A. 1979. Через плечо Лены: мама Аня отдаёт ей мишку
  function shot2a(t) {
    const E = ERA[1979];
    useLight(E.light);
    const A = { spec: SPEC.anya, st: { key: 'anya28', pos: A2, yaw: Y2, age: 28, crouch: 0.3, bend: 0.2, mood: 'smile' } };
    const B = { spec: SPEC.lena, st: { key: 'lena', pos: L2, yaw: Y2 + PI, age: 4, mood: t > T.give2[0] + 0.6 ? 'happy' : 'open' } };
    const gv = give(T.give2, t, A, B);
    A.st.look = gv.gB.cran.c; B.st.look = gv.gA.cran.c;
    const d = [Math.sin(Y2), 0, Math.cos(Y2)], r = [Math.cos(Y2), 0, -Math.sin(Y2)];
    const u = easeInOut(seg(t, T.s2a, T.s2b));
    const pos = [L2[0] + d[0] * lerp(62, 52, u) + r[0] * 24, 100, L2[1] + d[2] * lerp(62, 52, u) + r[2] * 24];
    cam(sway({ pos, target: lerp3(gv.gA.cran.c, gv.center, 0.4), fov: 42 }, t, 0.7));
    room(E, {});
    F.human(A.spec, A.st);
    F.human(B.spec, B.st);
    bear(t, { pos: gv.pos, fr: gv.fr });
    S.flush();
    cap(t, 'year', '1979', T.year2);
    cap(t, 'name', 'Лена, 4 года', T.name2);
  }

  // ---- 2B. Сверху: мама Аня ставит заплатку на лапу
  function shot2b(t) {
    const E = ERA[1979];
    useLight(E.light);
    const fr = frame(TABLE.yaw + 0.5);
    const bpos = [TABLE.c[0] + 6, TABLE.h, TABLE.c[1] + 4];
    const L = (v) => at(bpos, fr, v[0] * BS, v[1] * BS, v[2] * BS);
    const bc = L([5, 13, 9]);
    const u = easeInOut(seg(t, T.s2b, T.s2c));
    const pos = add(madd(madd(bc, fr.f, lerp(42, 34, u)), fr.r, lerp(26, 16, u)), [0, lerp(62, 52, u), 0]);
    cam({ pos, target: bc, fov: 42, roll: lerp(-0.12, 0.04, u) });
    room(E, {});
    table('tb');
    bear(t, { pos: bpos, fr });
    // игла с ниткой ходит по краю заплатки
    const lg = F.BEAR.legs[1];
    const c = lerp3(L(lg.a), L(lg.b), 0.62);
    const up = norm(sub(L([0, 40, 0]), L([0, 0, 0])));
    const nrm = norm(add(mul(fr.f, 0.6), mul(up, 0.8)));
    const side = norm(cross(nrm, up)), up2 = norm(cross(side, nrm));
    const cc = madd(c, nrm, lg.r[0] * BS * 0.95);
    const pu = seg(t, T.patch[0], T.patch[1]);
    if (t > T.patch[0] - 0.3) {
      const a = pu * PI * 2 - 0.6, dip = Math.sin(pu * PI * 10);
      const tip = madd(madd(madd(cc, side, Math.cos(a) * 3.9 * BS), up2, Math.sin(a) * 3.5 * BS), nrm, 0.6 + dip * 1.2);
      const nd = norm(add(add(mul(side, 0.85), mul(nrm, 0.4 + 0.25 * dip)), mul(up2, 0.2)));
      const eye = madd(tip, nd, 7);
      const far = add(add(madd(eye, side, 60), mul(up2, 12)), [0, 30, 0]);
      S.push(S.depth(tip) - 30, () => {
        S.line('thread', [eye, madd(eye, nd, 9), add(lerp3(madd(eye, nd, 9), far, 0.5), [0, 6 * Math.sin(pu * PI * 10), 0]), far], { color: 'a2:dk', w: 2.4, alpha: 0.95, sketch: false });
        S.line('needle', [tip, eye], { w: 2.8, alpha: 1, sketch: false, gaps: false });
        S.line('needleL', [lerp3(tip, eye, 0.3), lerp3(tip, eye, 0.8)], { ctx: P.L.color, color: 'light', w: 2, alpha: 0.9, sketch: false, gaps: false });
      });
    }
    const sp = at([TABLE.c[0], TABLE.h, TABLE.c[1]], frame(TABLE.yaw), 30, 0, 18);
    S.push(S.depth(sp), () => S.drawTube('spool', [sp, add(sp, [0, 6, 0])], [3.6, 3.6], { color: 'a2', alpha: 1, lw: 1.4, shade: { noCore: true, shine: 0.8 } }));
    S.flush();
    cap(t, 'year', '1979', T.s2b - 1);
  }

  // ---- 2C. Лена растёт; камера у самого пола смотрит вверх вдоль косяка
  function shot2c(t) {
    growShot(t, GENS.lena, ERA[1979], [[GENS.anya, true], [GENS.lena, false]], (tt, Hc) => {
      const u = easeInOut(seg(tt, T.s2c, T.s2d));
      return { pos: [lerp(212, 222, u), 16, lerp(-34, -48, u)], target: [312, Hc * 0.82, -122], fov: 54 };
    });
  }

  // ---- 2D. Из коробки: Лена (17) закрывает клапаны, темнеет
  function shot2d(t) {
    const E = ERA[1979];
    useLight(E.light);
    const fl = {};
    for (const s of ['l', 'r', 'b', 'f']) fl[s] = lerp(-0.3, PI / 2, easeIn(seg(t, FLAPS2[s][0], FLAPS2[s][1])));
    const fw = [0, 1];
    const st = { key: 'lena', pos: [BOX2[0], BOX2[1] + BOX.d / 2 + 28], yaw: PI, age: 17, bend: 0.5, crouch: 0.12, mood: 'calm', look: [BOX2[0], 15, BOX2[1]] };
    const g0 = F.rig(SPEC.lena, st);
    const pl = easeInOut(seg(t, T.place2[0], T.place2[1]));
    const inBox = [[BOX2[0] + 12, 26, BOX2[1] + 4], [BOX2[0] - 12, 26, BOX2[1] + 4]];
    st.hands = fw.map((i) => lerp3(inBox[i], g0.arms[i].wrist, pl));
    const g = F.rig(SPEC.lena, st);
    cam({ pos: [BOX2[0], 11, BOX2[1] - 4], target: lerp3(g.cran.c, [BOX2[0], 150, BOX2[1] + 20], 0.2), fov: 70, roll: 0.05 });
    room(E, {});
    F.human(SPEC.lena, st);
    box('bx2', BOX2, 0, fl);
    S.flush();
    POST.dark = seg(t, 23.45, 23.85) * 0.93;
    cap(t, 'year', '1992', T.s2d + 0.3);
  }

  // ---- 3A. Чердак ночью, годы идут, на коробке копится пыль
  function shot3a(t) {
    useLight([0, 170, -280]);
    const u = easeInOut(seg(t, T.s3a, T.s3b));
    cam({ pos: lerp3([150, 200, 175], [92, 118, 92], u), target: lerp3([0, 28, -55], [0, 24, -42], u), fov: 46 });
    attic('at', false);
    const yrs = seg(t, T.years3[0], T.years3[1]);
    box('bxa', BOXA, BOXA_YAW, { l: PI / 2, r: PI / 2, b: PI / 2, f: PI / 2 }, { label: 'Лена · игрушки', dust: Math.floor(12 + 90 * yrs) });
    S.flush();
    POST.night = 0.62;
    cap(t, 'year', String(1993 + Math.floor(yrs * 10 + 1e-6)), T.s3a + 0.3);
  }

  // ---- 3B. Из коробки: щель света, клапаны распахиваются — ПОВОРОТ
  function boxFront(c, yaw, out) { const fr = frame(yaw); return at(flat(c), fr, 0, 0, BOX.d / 2 + out); }
  function shot3b(t) {
    const day = t >= T.TURN;
    useLight(day ? [0, 170, -280] : [0, 170, -280]);
    const crack = easeOut(seg(t, T.crack[0], T.crack[1])), op = easeOut(seg(t, T.open3[0], T.open3[1]));
    const closed = PI / 2 - crack * 0.16;
    const fl = { l: lerp(PI / 2, -0.5, op), r: lerp(PI / 2, -0.45, op), b: lerp(closed, -0.4, op), f: lerp(closed, -0.45, op) };
    const kp = boxFront(BOXA, BOXA_YAW, 26);
    const st = { key: 'katya', pos: [kp[0], kp[2]], yaw: BOXA_YAW + PI, age: 7, bend: 0.55, crouch: 0.15, mood: 'open', draw: seg(t, T.kat3[0], T.kat3[1]) };
    const g0 = F.rig(SPEC.katya, st);
    const rk = easeInOut(seg(t, T.reach3[0], T.reach3[1]));
    const inBox = [at(flat(BOXA), frame(BOXA_YAW), 11, 30, 6), at(flat(BOXA), frame(BOXA_YAW), -11, 30, 6)];
    st.hands = [0, 1].map((i) => lerp3(g0.arms[i].wrist, inBox[i], rk));
    st.armsFront = true;
    const g = F.rig(SPEC.katya, st);
    st.look = at(flat(BOXA), frame(BOXA_YAW), 0, 10, 0);
    const top = at(flat(BOXA), frame(BOXA_YAW), 0, 80, 12);
    const camPos = at(flat(BOXA), frame(BOXA_YAW), 0, 11, -3);
    cam({ pos: camPos, target: day ? lerp3(top, g.cran.c, easeInOut(seg(t, T.TURN, T.kat3[1]))) : top, fov: day ? lerp(80, 62, easeInOut(seg(t, T.TURN, T.s4a))) : 80, roll: -0.04 });
    attic('at', day);
    if (t >= T.kat3[0]) F.human(SPEC.katya, st);
    box('bxa', BOXA, BOXA_YAW, fl);
    S.flush();
    if (!day) {
      POST.dark = 0.92;
      const q = S.proj(at(flat(BOXA), frame(BOXA_YAW), 0, BOX.h + 1, 0));
      POST.leak = q ? { x: q[0], y: q[1], a: crack } : null;
    }
    POST.flash = day ? 0.85 * (1 - seg(t, T.TURN, T.TURN + 0.55)) : 0;
  }

  // ---- 4A. 2003. Катя кружится с мишкой над головой, облачко пыли
  function shot4a(t) {
    useLight([0, 170, -280]);
    const u = seg(t, T.spin4[0], T.spin4[1]), k = easeInOut(u);
    const st = { key: 'katya', pos: KAT4, yaw: PI + 0.3 + k * PI * 2.2, age: 7, mood: 'happy', flare: 1 + 0.5 * Math.sin(u * PI), headPitch: -0.45 };
    const c = [KAT4[0], 70, KAT4[1]];
    const a = lerp(0.5, -0.8, easeInOut(seg(t, T.s4a, T.s4b)));
    cam(sway(orbit(c, a, 175, 82, { target: add(c, [0, 22, 0]), fov: 46, roll: -0.08 }), t, 1.2));
    attic('at', true);
    box('bxa', BOXA, BOXA_YAW, { l: -0.5, r: -0.45, b: -0.4, f: -0.45 });
    const wb = withBear(t, SPEC.katya, st, 'up');
    // облачко пыли
    const pu = seg(t, T.puff[0], T.puff[1]);
    if (pu > 0 && pu < 1 && wb.b) {
      const bc = wb.b.center;
      S.push(S.depth(bc) - 40, () => {
        const r = P.staticRng('puff'), C = P.L.color;
        for (let i = 0; i < 30; i++) {
          const d = norm([r() - 0.5, r() * 0.8 - 0.2, r() - 0.5]), sp = 20 + r() * 50, v = easeOut(pu);
          const q = S.proj(add(madd(bc, d, 6 + sp * v), [0, 12 * pu, 0]));
          if (!q) continue;
          C.fillStyle = P.col(i % 3 ? 'light' : 'soft', (1 - pu) * 0.7);
          C.beginPath(); C.arc(q[0], q[1], Math.max(1, q[3] * (0.8 + r() * 1.6)), 0, 6.283); C.fill();
        }
      });
    }
    S.flush();
    cap(t, 'year', '2003', T.year4);
    cap(t, 'name', 'Катя, 7 лет', T.name4);
  }

  // ---- 4B. Бабушка Аня (52) вяжет мишке шарф
  function shot4b(t) {
    const E = ERA[2003];
    useLight(E.light);
    const u = easeInOut(seg(t, T.s4b, T.s4c));
    cam(sway({ pos: lerp3([60, 118, 40], [28, 112, 22], u), target: [-72, 102, -185], fov: 33 }, t, 0.8));
    room(E, {});
    stool('st4', STOOL);
    const bpos = [STOOL[0], 66, STOOL[1]], bfr = frame(-0.5);
    const head = at(bpos, bfr, 0, 36 * BS, 0), neck = at(bpos, bfr, 0, 25 * BS, 6 * BS);
    const st = { key: 'gran', pos: G4, yaw: 0.95, age: 52, mood: 'smile', draw: seg(t, T.granIn[0], T.granIn[1]), look: head };
    const g0 = F.rig(SPEC.anya52, st);
    const osc = Math.sin(t * PI * 4.4) * 2;
    const base = madd(madd(g0.chest, g0.T.f, 24), [0, 1, 0], -16);
    st.hands = [madd(base, g0.T.r, -7 + osc), madd(base, g0.T.r, 7 - osc)];
    st.armsFront = true; st.curl = 0.6;
    F.human(SPEC.anya52, st);
    bear(t, { pos: bpos, fr: bfr, shadow: false });
    const h0 = st.hands[0], h1 = st.hands[1];
    const ball = [-62, 7, -128];
    S.push(S.depth(base) - 15, () => {
      const pk = seg(t, T.granIn[1] - 0.3, T.granIn[1] + 0.2);
      S.line('ndl0', [h0, madd(madd(h0, g0.T.r, 15), [0, 1, 0], 7)], { w: 1.8, alpha: pk, sketch: false, gaps: false });
      S.line('ndl1', [h1, madd(madd(h1, g0.T.r, -15), [0, 1, 0], 7)], { w: 1.8, alpha: pk, sketch: false, gaps: false });
      const mid = lerp3(h0, h1, 0.5);
      S.line('yarn1', [mid, lerp3(mid, neck, 0.5), neck], { color: 'a2', w: 2.2, alpha: pk * seg(t, T.scarf[0] - 0.4, T.scarf[0]), sketch: false });
      S.line('yarn0', [ball, add(lerp3(ball, mid, 0.5), [0, -20, 0]), mid], { color: 'a2', w: 1.4, alpha: pk * 0.9, sketch: false });
    });
    S.push(S.depth(ball), () => S.drawEll('ball', ball, frame(0.3), [7, 7, 7], { color: 'a2', alpha: 1, lw: 1.5, shade: { shine: 0.7 } }));
    S.flush();
    cap(t, 'year', '2003', T.s4b - 1);
    cap(t, 'name', 'бабушка Аня, 52 года', T.label4);
  }

  // ---- 4C + 4D. Катя растёт, камера поднимается с ней; наезд на мишку
  function shot4c(t) {
    growShot(t, GENS.katya, ERA[2003], [[GENS.anya, true], [GENS.lena, true], [GENS.katya, false]], (tt, Hc) => {
      const u = easeInOut(seg(tt, T.s4c, T.s4d));
      return { pos: [lerp(170, 185, u), Hc * 0.92 + 8, lerp(-24, -50, u)], target: [312, Hc * 0.8, -120], fov: 40 };
    }, [T.s4d, T.s5a]);
  }

  // ---- 2026: где стоит семья
  function family(t, o) {
    const al = o.al === undefined ? 1 : o.al;
    const d = o.draw === undefined ? 1 : o.draw;
    const look = o.look;
    F.human(SPEC.lena51, { key: 'lena51', pos: o.lena || [-25, -255], yaw: o.lenaYaw === undefined ? 0.1 : o.lenaYaw, age: 51, mood: 'smile', look, alpha: al, draw: d });
    F.human(SPEC.katya, { key: 'katya30', pos: o.katya || [75, -215], yaw: o.katyaYaw === undefined ? -0.4 : o.katyaYaw, age: 30, mood: 'smile', look, alpha: al, draw: d });
  }

  // ---- 5A. Общий план сверху: Соня ковыляет к прабабушке
  function shot5a(t) {
    const E = ERA[2026];
    useLight(E.light);
    const u = easeInOut(seg(t, T.s5a, T.s5b));
    cam({ pos: lerp3([150, 330, 230], [95, 215, 135], u), target: [-50, 55, -165], fov: 46 });
    const dr = seg(t, T.room5[0] + 0.2, T.room5[1] + 0.2);
    room(E, { p: seg(t, T.room5[0], T.room5[1]) });
    // Соня идёт
    const w = seg(t, T.toddle[0], T.toddle[1]);
    const pos = [lerp(SON0[0], S5[0], easeInOut(w)), lerp(SON0[1], S5[1], easeInOut(w))];
    const yawS = Math.atan2(S5[0] - SON0[0], S5[1] - SON0[1]);
    const dist = Math.hypot(pos[0] - SON0[0], pos[1] - SON0[1]);
    const sS = { key: 'sonia', pos, yaw: lerpAng(yawS, Y5 + PI, seg(w, 0.8, 1)), age: 2, mood: 'open', walk: w > 0 && w < 1 ? dist / 40 * 2 * PI : null, walkAmp: 0.75, lean: Math.sin(dist / 40 * PI) * 0.06, clip: 1, draw: dr };
    const gs = F.rig(SPEC.sonia, sS);
    sS.hands = [madd(madd(gs.shoulders[0], gs.T.r, -14), [0, 1, 0], -12), madd(madd(gs.shoulders[1], gs.T.r, 14), [0, 1, 0], -12)].map((q) => madd(q, gs.T.f, 10));
    F.human(SPEC.sonia, sS);
    const sonHead = add(gs.cran.c, [0, 40, 0]);
    const sA = { key: 'gran75', pos: A5, yaw: Y5, age: 75, mood: 'smile', look: gs.cran.c, draw: dr };
    const wb = withBear(t, SPEC.anya75, sA, 'give');
    family(t, { look: gs.cran.c, draw: dr });
    S.flush();
    cap(t, 'year', '2026', T.year5);
    const lb = T.labels5;
    tag(t, 'прабабушка Аня', add(wb.g.cran.c, [0, 42, 0]), lb, 1, 'a75', 38);
    tag(t, 'бабушка Лена', [-25, 205, -255], lb + 0.25, 1, 'l51', 38);
    tag(t, 'мама Катя', [75, 205, -215], lb + 0.5, 1, 'k30', 38);
    tag(t, 'Соня', sonHead, lb + 0.75, 1, 's2', 38);
  }

  // ---- 5B. Через плечо Сони: прабабушка отдаёт мишку
  function shot5b(t) {
    const E = ERA[2026];
    useLight(E.light);
    const A = { spec: SPEC.anya75, st: { key: 'gran75', pos: A5, yaw: Y5, age: 75, crouch: 0.35, bend: 0.2, mood: 'smile' } };
    const B = { spec: SPEC.sonia, st: { key: 'sonia', pos: S5, yaw: Y5 + PI, age: 2, mood: t > T.give5[0] + 0.6 ? 'happy' : 'open', clip: 1 } };
    const gv = give(T.give5, t, A, B);
    A.st.look = gv.gB.cran.c; B.st.look = gv.gA.cran.c;
    const d = [Math.sin(Y5), 0, Math.cos(Y5)], r = [Math.cos(Y5), 0, -Math.sin(Y5)];
    const u = easeInOut(seg(t, T.s5b, T.s5c));
    cam(sway({ pos: [S5[0] + d[0] * lerp(62, 54, u) - r[0] * 42, 96, S5[1] + d[2] * lerp(62, 54, u) - r[2] * 42], target: lerp3(gv.gA.cran.c, gv.center, 0.45), fov: 44 }, t, 0.6));
    room(E, {});
    F.human(A.spec, A.st);
    F.human(B.spec, B.st);
    bear(t, { pos: gv.pos, fr: gv.fr });
    family(t, { look: gv.center });
    S.flush();
    cap(t, 'year', '2026', T.s5b - 1);
  }

  // ---- 5C. Сверху-спереди: Соня обнимает мишку, всё теплеет
  const D5 = [Math.sin(Y5), 0, Math.cos(Y5)], R5 = [-Math.cos(Y5), 0, Math.sin(Y5)]; // от прабабушки к Соне; правая рука Сони
  function shot5c(t) {
    const E = ERA[2026];
    useLight(E.light);
    const u = easeInOut(seg(t, T.s5c, T.s5d));
    const c = [S5[0], 48, S5[1]];
    const pos = add(add(madd(c, D5, -lerp(72, 62, u)), mul(R5, lerp(42, 34, u))), [0, lerp(110, 96, u), 0]);
    cam({ pos, target: add(c, [0, -4, 0]), fov: 40, roll: lerp(0.06, 0, u) });
    room(E, {});
    const sS = { key: 'sonia', pos: S5, yaw: Y5 + PI, age: 2, mood: 'happy', clip: 1, look: pos };
    const wb = withBear(t, SPEC.sonia, sS, 'hug');
    const gp = [S5[0] - D5[0] * 42 - R5[0] * 58, S5[1] - D5[2] * 42 - R5[2] * 58];
    F.human(SPEC.anya75, { key: 'gran75', pos: gp, yaw: Math.atan2(S5[0] - gp[0], S5[1] - gp[1]), age: 75, crouch: 0.2, bend: 0.2, mood: 'smile', look: wb.g.cran.c });
    family(t, { look: wb.g.cran.c });
    S.flush();
    POST.warm = easeInOut(seg(t, T.warm[0], T.warm[1]));
    cap(t, 'year', '2026', T.s5c - 1);
    cap(t, 'name', 'Соня, 2 года', T.name5);
  }

  // ---- 5D. Крупно: Соня отдаёт мишке свою заколку-сердечко
  const BEAR5 = flat(BF5);
  function billboard(p) { const f = norm(sub(S.CAM.pos, p)), r = norm(cross([0, 1, 0], f)); return { r, u: cross(f, r), f }; }
  function shot5d(t) {
    const E = ERA[2026];
    useLight(E.light);
    const bfr = frame(Y5);
    const head = at(BEAR5, bfr, 0, 36 * BS, 1.5 * BS), ear = at(BEAR5, bfr, 8.8 * BS, 48.5 * BS, 2.2 * BS);
    const st = { key: 'sonia', pos: S5, yaw: Y5 + PI, age: 2, crouch: 0.75, bend: 0.2, mood: 'smile', look: head };
    const g0 = F.rig(SPEC.sonia, st);
    const clipPos = F.surf(g0.cran, -0.75, 0.55, g0.hh * 0.04).p;
    const rest = g0.arms[0].wrist;
    const a1 = easeInOut(seg(t, T.s5d, T.clip[0])), a2 = easeInOut(seg(t, T.clip[0], T.clip[1])), a3 = easeInOut(seg(t, T.clip[1] + 0.05, T.clip[1] + 0.55));
    const hand = lerp3(lerp3(lerp3(rest, clipPos, a1), ear, a2), rest, a3);
    st.hands = [hand, null]; st.curl = 0.9;
    st.clip = t < T.clip[0] ? 1 : 0;
    const u = easeInOut(seg(t, T.s5d, T.s5e));
    const tgt = add(lerp3(head, g0.cran.c, 0.55), [0, 2, 0]);
    cam(sway({ pos: add(madd(madd(head, bfr.f, -lerp(50, 42, u)), bfr.r, 24), [0, 6, 0]), target: tgt, fov: 46 }, t, 0.5));
    room(E, {});
    F.human(SPEC.sonia, st);
    bear(t, { pos: BEAR5, fr: bfr, ground: 0 });
    if (t >= T.clip[0] && t < T.clip[1] - 0.1) S.push(S.depth(hand) - 3, () => F.drawHeart3('clipH', madd(hand, [0, 1, 0], 2), billboard(hand), g0.hh * 0.09, 1));
    S.flush();
    POST.warm = 1;
  }

  // ---- 5E. Кран вверх: все стираются, остаётся мишка
  const CRANE5 = add(mul(R5, 60), mul(D5, -40)); // где кончается кран над мишкой
  function shot5e(t) {
    const E = ERA[2026];
    useLight(E.light);
    const u = easeInOut(seg(t, T.s5e, T.s6));
    const bc = add(BEAR5, [0, 18, 0]);
    cam({ pos: lerp3(add(add(mul(R5, 85), mul(D5, -25)), add(bc, [0, 40, 0])), add(CRANE5, add(bc, [0, 330, 0])), u), target: add(bc, [0, lerp(8, 0, u), 0]), fov: lerp(38, 46, u) });
    const ea = erase(t, T.erase5[0], T.erase5[1]);
    room(E, { al: ea });
    const bfr = frame(Y5), head = at(BEAR5, bfr, 0, 36 * BS, 0);
    F.human(SPEC.sonia, { key: 'sonia', pos: S5, yaw: Y5 + PI, age: 2, crouch: lerp(0.75, 0.2, seg(t, T.s5e, T.s5e + 0.8)), mood: 'smile', look: head, clip: 0, alpha: ea });
    F.human(SPEC.anya75, { key: 'gran75', pos: [-195, -235], yaw: 0.75, age: 75, mood: 'smile', look: head, alpha: ea });
    family(t, { look: head, al: ea, lena: [-60, -275], lenaYaw: 0.2, katya: [60, -175], katyaYaw: -1.6 });
    bear(t, { pos: BEAR5, fr: bfr, ground: 0 });
    S.flush();
    POST.warm = 1 - 0.4 * seg(t, T.erase5[0], T.erase5[1]);
  }

  // ---- 6. Постер: камера слетает к мишке, сноски к следам поколений
  function posterCam(t) {
    const bc = add(BEAR5, [0, 18, 0]);
    const a0 = Math.atan2(CRANE5[0], CRANE5[2]), r0 = Math.hypot(CRANE5[0], CRANE5[2]), y0 = 330 + 18;
    const a1 = Y5 - 0.5, r1 = 112, y1 = 30;
    const k = easeInOut(seg(t, T.orbit6[0], T.orbit6[1]));
    const a = lerp(a0, a1, k), r = lerp(r0, r1, k), y = lerp(y0, y1, easeInOut(seg(k, 0, 0.85)));
    const tg = add(bc, [0, lerp(0, 4, k), 0]);
    const pos = [bc[0] + Math.sin(a) * r, y, bc[2] + Math.cos(a) * r];
    // сдвиг: мишка правее центра, слева место для названия
    const right = norm(cross(norm(sub(tg, pos)), [0, 1, 0]));
    return { pos, target: madd(tg, right, -3 * k), fov: lerp(46, 30, k) };
  }
  function shot6(t) {
    const bc = add(BEAR5, [0, 18, 0]);
    useLight(add(bc, [-170, 240, 220]));
    cam(posterCam(t));
    const bfr = frame(Y5);
    const B = bear(t, { pos: BEAR5, fr: bfr, ground: 0 });
    S.flush();
    POST.warm = 0.6;
    if (!B) return;
    // сноски
    const L = B.L, hd = B.head;
    const lg = F.BEAR.legs[1];
    const anchors = [
      F.surf(hd, -0.42, 0.12, 0.3 * BS).p,
      L([8.8, 48.5, 2.2]),
      L([7, 19, 10.8]),
      madd(lerp3(L(lg.a), L(lg.b), 0.62), norm(add(mul(bfr.f, 0.6), [0, 0.8, 0])), lg.r[0] * BS * 0.95),
    ];
    const notes = [
      { text: 'пуговица — Аня, 1962', color: 'line', dx: -1, dy: -40 },
      { text: 'заколка — Соня, 2026', color: 'warm', dx: 1, dy: -70 },
      { text: 'шарф — бабушка Аня, 2003', color: 'a2', dx: 1, dy: 40 },
      { text: 'заплатка — Лена, 1979', color: 'a1', dx: 1, dy: 120 },
    ];
    const G = P.L.graphite;
    notes.forEach((n, i) => {
      const q = S.proj(anchors[i]);
      if (!q) return;
      const t0 = T.notes[i], pa = seg(t, t0, t0 + 0.35), pt = seg(t, t0 + 0.3, t0 + 0.9);
      if (pa <= 0) return;
      const from = [q[0] + n.dx * 230, q[1] + n.dy];
      const mid = [lerp(from[0], q[0], 0.5), lerp(from[1], q[1], 0.5) - 36];
      const pts = P.curve([from, mid, [q[0] - n.dx * 10, q[1]]], false, 10);
      P.stroke(G, pts, { key: 'arrow' + i, color: n.color, w: 2.4, p: pa });
      if (pa >= 1) {
        const e = pts[pts.length - 1], b2 = pts[pts.length - 4];
        const a = Math.atan2(e[1] - b2[1], e[0] - b2[0]);
        for (const d of [-0.5, 0.5]) P.stroke(G, [e, [e[0] - Math.cos(a + d) * 18, e[1] - Math.sin(a + d) * 18]], { key: 'ah' + i + d, color: n.color, w: 2.4, sketch: false, gaps: false });
      }
      const tx = from[0] + n.dx * 14, ty = from[1] + 14;
      const tw = P.textWidth(G, n.text, 44);
      S.knock([[[n.dx > 0 ? tx - 10 : tx - tw - 10, ty - 38], [n.dx > 0 ? tx + tw + 10 : tx + 10, ty - 38], [n.dx > 0 ? tx + tw + 10 : tx + 10, ty + 14], [n.dx > 0 ? tx - 10 : tx - tw - 10, ty + 14]]], 0.6 * pt);
      write(G, n.text, tx, ty, { key: 'note' + i, size: 44, p: pt, align: n.dx > 0 ? 'left' : 'right' });
    });
    write(G, 'Мишка', 110, 190, { key: 'p:title', size: 140, p: seg(t, T.title6[0], T.title6[1]), weight: 700 });
    write(G, '1956 – 2026', 116, 270, { key: 'p:years', size: 62, p: seg(t, T.years6[0], T.years6[1]) });
    write(G, 'Аня · Лена · Катя · Соня', 118, 336, { key: 'p:names', size: 44, p: seg(t, T.names6[0], T.names6[1]), color: 'soft' });
    write(G, 'Он помнит всех, кого обнимал.', W / 2, 1040, { key: 'p:moral', size: 56, align: 'center', p: seg(t, T.moral[0], T.moral[1]) });
  }

  const SHOTS = [
    [-99, shot01], [T.s1b, shot1b], [T.s1c, shot1c], [T.s1d, shot1d],
    [T.s2a, shot2a], [T.s2b, shot2b], [T.s2c, shot2c], [T.s2d, shot2d],
    [T.s3a, shot3a], [T.s3b, shot3b],
    [T.s4a, shot4a], [T.s4b, shot4b], [T.s4c, shot4c],
    [T.s5a, shot5a], [T.s5b, shot5b], [T.s5c, shot5c], [T.s5d, shot5d], [T.s5e, shot5e], [T.s6, shot6],
  ];

  // =====================================================================
  // КАДР
  // =====================================================================
  function renderFrame(main, tRaw) {
    // «на двойках»: рисунок меняется 12 раз в секунду
    const t = Math.min(T.END, Math.floor(tRaw * P.DRAW_FPS + 1e-6) / P.DRAW_FPS);
    P.RS = main.canvas.width / W;
    P.begin(t);
    P.fade = t < T.TURN ? 1 : 1 - seg(t, T.TURN, T.TURN + 0.6);
    POST.night = 0; POST.flash = 0; POST.warm = 0; POST.dark = 0; POST.leak = null;
    let fn = SHOTS[0][1];
    for (const [t0, f] of SHOTS) if (t >= t0) fn = f;
    fn(t);
    P.compose(main);
    post(main);
  }
  function post(main) {
    main.setTransform(P.RS, 0, 0, P.RS, 0, 0);
    if (POST.night > 0.01) {
      main.globalCompositeOperation = 'multiply';
      const gr = main.createRadialGradient(W * 0.5, H * 0.3, 60, W * 0.5, H * 0.5, 1300);
      gr.addColorStop(0, P.col('night', 0.2 * POST.night));
      gr.addColorStop(1, P.col('night', 0.6 * POST.night));
      main.fillStyle = gr; main.fillRect(0, 0, W, H);
    }
    if (POST.dark > 0.01) {
      main.globalCompositeOperation = 'multiply';
      if (POST.leak && POST.leak.a > 0.01) {
        const L = POST.leak, gr = main.createRadialGradient(L.x, L.y, 10, L.x, L.y, 120 + 520 * L.a);
        gr.addColorStop(0, P.col('night', POST.dark * (1 - 0.95 * L.a)));
        gr.addColorStop(1, P.col('night', POST.dark));
        main.fillStyle = gr;
      } else main.fillStyle = P.col('night', POST.dark);
      main.fillRect(0, 0, W, H);
      if (POST.leak && POST.leak.a > 0.01) { // тонкая щель света
        main.globalCompositeOperation = 'screen';
        const L = POST.leak, gr = main.createLinearGradient(L.x - 260, L.y, L.x + 260, L.y);
        gr.addColorStop(0, 'rgba(255,240,200,0)'); gr.addColorStop(0.5, `rgba(255,240,200,${0.8 * L.a})`); gr.addColorStop(1, 'rgba(255,240,200,0)');
        main.fillStyle = gr; main.fillRect(L.x - 260, L.y - 3 - 10 * L.a, 520, 6 + 20 * L.a);
      }
    }
    if (POST.warm > 0.01) {
      main.globalCompositeOperation = 'multiply';
      main.fillStyle = `rgba(255,228,192,${0.3 * POST.warm})`;
      main.fillRect(0, 0, W, H);
      main.globalCompositeOperation = 'screen';
      const gr = main.createRadialGradient(W / 2, H * 0.55, 40, W / 2, H * 0.55, 900);
      gr.addColorStop(0, `rgba(255,214,150,${0.2 * POST.warm})`);
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
    ev.scratch.push([0.0, T.bearDraw[1], 0.9], [T.title[0], T.sub[1], 0.6], [T.room1[0], T.room1[1], 0.7], [T.anyaIn[0], T.anyaIn[1], 0.5],
      [T.patch[0], T.patch[1], 0.35], [T.kat3[0], T.kat3[1], 0.4], [T.granIn[0], T.granIn[1], 0.5], [T.room5[0], T.room5[1] + 0.3, 0.7],
      [T.labels5, T.labels5 + 1.2, 0.45], [T.title6[0], T.moral[1], 0.6]);
    T.notes.forEach((n) => ev.scratch.push([n, n + 0.9, 0.55]));
    for (const g of [GENS.anya, GENS.lena, GENS.katya]) {
      for (let a = Math.floor(g.from) + 1; a <= g.to; a++) ev.ticks.push(ageCross(g, a));
      for (const a of g.ages) ev.marks.push(ageCross(g, a) + 0.02);
    }
    for (let y = 1; y <= 10; y++) ev.ticks.push(lerp(T.years3[0], T.years3[1], y / 10));
    for (let i = 0; i < 8; i++) ev.steps.push(lerp(T.run1[0], T.run1[1] - 0.2, Math.pow(i / 7, 1.25)));
    for (let i = 0; i < 7; i++) ev.steps.push(lerp(T.toddle[0] + 0.1, T.toddle[1] - 0.1, i / 6));
    ev.chimes.push(T.lift1[1] - 0.1, T.give2[1] - 0.1, T.spin4[0] + 0.3, T.give5[1] - 0.1, T.clip[1]);
    ev.hugs.push(T.lift1[1], T.give2[1], T.spin4[0] + 0.15, T.give5[1] + 0.05);
    ev.clicks.push(T.button[0] + 0.25);
    for (let i = 0; i < 6; i++) ev.stitches.push(lerp(T.patch[0] + 0.15, T.patch[1], i / 5));
    for (const s of ['l', 'r', 'b', 'f']) ev.thuds.push(FLAPS2[s][1]);
    ev.puffs.push(T.puff[0] + 0.1);
    for (let i = 0; i < 9; i++) ev.knits.push(lerp(T.scarf[0], T.scarf[1], i / 8));
    ev.whoosh.push(4.7, T.spin1[0], T.s2a, T.s3a, T.open3[0] + 0.05, T.spin4[0], T.s5a, T.s5e + 0.3, T.s6 + 0.2);
    ev.notes = T.notes.slice();
    return ev;
  }

  P.setTheme(THEME);
  global.STORY = {
    T, THEME, renderFrame, soundEvents, setTheme: P.setTheme,
    chapters: [{ t: 0, label: 'Мишка' }, { t: T.s1a, label: '1956' }, { t: T.s2a, label: '1979' }, { t: T.s3a, label: 'чердак' },
      { t: T.s4a, label: '2003' }, { t: T.s5a, label: '2026' }, { t: T.s6, label: 'постер' }],
  };
})(typeof window !== 'undefined' ? window : globalThis);
