// shoe.js — беговой кроссовок ORBITA PULSE ONE, построенный кодом.
// Единица — 10 см: длина около 2,9 (размер 42–43). x — от пятки к носку,
// y — вверх, z — к латеральной (наружной) стороне правого кроссовка.
// Каждая деталь — параметрическая поверхность: подошва протягивается
// сечениями вдоль длины, верх натягивается «меридианами» от края подошвы
// к краю горловины.
import * as THREE from 'three';
import * as TX from './textures.js';

export const X0 = -1.45, X1 = 1.47;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const TAU = Math.PI * 2;

// интерполяция по таблице: кубический сплайн Эрмита с касательными Катмулла — Рома
function table(pts) {
  const m = (k) => { const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)]; return (b[1] - a[1]) / (b[0] - a[0]); };
  return (x) => {
    if (x <= pts[0][0]) return pts[0][1];
    if (x >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
    let i = 0;
    while (x > pts[i + 1][0]) i++;
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], h = x1 - x0, t = (x - x0) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * m(i) + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * m(i + 1);
  };
}
// скругление конца: четверть окружности
const endR = (u, a) => { const k = clamp(u / a); return Math.sqrt(Math.max(0, 1 - (1 - k) * (1 - k))); };

// ---------------------------------------------------------------------
// Колодка и подошва
// ---------------------------------------------------------------------
const HW = table([[0, 0.285], [0.2, 0.3], [0.38, 0.29], [0.52, 0.345], [0.68, 0.43], [0.8, 0.44], [0.9, 0.4], [1, 0.3]]);
const CZ = (u) => -0.03 * smooth(0.35, 0.9, u) - 0.03 * smooth(0.88, 1, u);
const ARCH = (u) => 0.055 * Math.exp(-(((u - 0.42) / 0.13) ** 2));
export const uOfX = (x) => clamp((x - X0) / (X1 - X0));

// контур стопы на доле длины u (0 — пятка, 1 — носок); expand — запас вокруг
export function last(u, expand = 0) {
  const x = lerp(X0 - expand, X1 + expand, u);
  const e = endR(u, 0.095) * endR(1 - u, 0.12);
  const hw = (HW(u) + expand) * e;
  const c = CZ(u);
  return { x, lat: c + hw, med: c - hw + ARCH(u) * e, hw: hw - ARCH(u) * e / 2, c: c + ARCH(u) * e / 2 };
}
// рокер: пятка скошена, носок поднят
export const soleBottom = (u) => 0.08 * (1 - smooth(0, 0.17, u)) ** 2 + 0.27 * Math.pow(smooth(0.55, 1.0, u), 1.6);
// высота подошвы: 40 мм в пятке, 32 мм под передом — дроп 8 мм
export const stack = (u) => lerp(0.42, 0.34, smooth(0.22, 0.72, u)) * (1 - 0.32 * smooth(0.86, 1, u));
export const top = (u) => soleBottom(u) + stack(u);

// ---------------------------------------------------------------------
// Сетка-поверхность: fn(a, b) → { p, uv, w }. Нормали — по граням,
// с усреднением в точках, которые совпадают (шов, сомкнутые концы).
// ---------------------------------------------------------------------
function grid(nu, nv, fn, { flip = false } = {}) {
  const cu = nu + 1, cv = nv + 1, n = cu * cv;
  const P = new Float32Array(n * 3), UV = new Float32Array(n * 2), Wt = new Float32Array(n);
  for (let j = 0; j < cv; j++) for (let i = 0; i < cu; i++) {
    const r = fn(i / nu, j / nv), k = j * cu + i;
    P[k * 3] = r.p[0]; P[k * 3 + 1] = r.p[1]; P[k * 3 + 2] = r.p[2];
    UV[k * 2] = r.uv[0]; UV[k * 2 + 1] = r.uv[1];
    Wt[k] = r.w || 0;
  }
  const idx = [];
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * cu + i, b = a + 1, c = a + cu, d = c + 1;
    if (flip) idx.push(a, d, b, a, c, d); else idx.push(a, b, d, a, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
  g.setIndex(idx);
  smoothNormals(g);
  g.userData.w = Wt;
  return g;
}
function smoothNormals(g) {
  g.computeVertexNormals();
  const P = g.attributes.position.array, N = g.attributes.normal.array, n = P.length / 3;
  const key = (k) => `${Math.round(P[k * 3] * 2e4)},${Math.round(P[k * 3 + 1] * 2e4)},${Math.round(P[k * 3 + 2] * 2e4)}`;
  const bins = new Map();
  for (let k = 0; k < n; k++) { const s = key(k); let b = bins.get(s); if (!b) bins.set(s, (b = [])); b.push(k); }
  for (const b of bins.values()) {
    if (b.length < 2) continue;
    let x = 0, y = 0, z = 0;
    for (const k of b) { x += N[k * 3]; y += N[k * 3 + 1]; z += N[k * 3 + 2]; }
    const l = Math.hypot(x, y, z) || 1;
    for (const k of b) { N[k * 3] = x / l; N[k * 3 + 1] = y / l; N[k * 3 + 2] = z / l; }
  }
}
const cosSpace = (a) => (1 - Math.cos(Math.PI * a)) / 2;
const se = (c, n) => Math.sign(c) * Math.pow(Math.abs(c), 2 / n);

// ---------------------------------------------------------------------
// Слой подошвы: сечения-«суперэллипсы» вдоль длины.
// h0..h1 — доли высоты подошвы, inset — насколько уже, n — скруглённость
// ---------------------------------------------------------------------
function soleLayer(h0, h1, { inset = 0, n = 4, cup = false, nu = 150, nv = 72, uv = 'foam', u0 = 0, u1 = 1, round0 = 0, round1 = 0, dy0 = 0, dy1 = 0 } = {}) {
  return grid(nu, nv, (a, b) => {
    const k = cosSpace(a), uu = lerp(u0, u1, k);
    const L = last(uu, 0.035);
    let hw = Math.max(0, L.hw - inset);
    if (round0) hw *= endR(k, round0);
    if (round1) hw *= endR(1 - k, round1);
    const yb = soleBottom(uu), st = stack(uu);
    const th = b * TAU, c = Math.cos(th), s = Math.sin(th);
    const ce = se(c, n), sv = se(s, n);
    const hf = (sv + 1) / 2, hg = lerp(h0, h1, hf);
    const flare = (0.07 * (1 - hg) ** 2 + 0.012 * Math.sin(hg * Math.PI)) * Math.min(1, hw / 0.15);
    const z = L.c + ce * (hw + flare);
    let y = yb + st * hg + lerp(dy0, dy1, hf);
    if (cup) y += (0.025 + 0.07 * (1 - smooth(0.05, 0.45, uu))) * Math.pow(Math.abs(ce), 8) * smooth(0.55, 1, hf);
    let t;
    if (uv === 'foam') t = [uu, c >= 0 ? 0.5 + 0.5 * hg : 0.5 * hg];
    else if (uv === 'tread') t = [L.x * 2.6, z * 2.6];
    else t = [uu * 26, hf * 1.5];
    return { p: [L.x, y, z], uv: t };
  });
}

// ---------------------------------------------------------------------
// Верх: меридианы от края подошвы B(s) до края горловины O(s)
// ---------------------------------------------------------------------
const XO0 = -1.4, XO1 = 0.62;
const OHZ = table([[0, 0.17], [0.12, 0.23], [0.28, 0.245], [0.42, 0.19], [0.5, 0.11], [0.6, 0.088], [0.8, 0.08], [0.94, 0.066], [1, 0.05]]);
const OY = table([[0, 0.82], [0.08, 0.74], [0.22, 0.58], [0.34, 0.54], [0.46, 0.68], [0.55, 0.78], [0.7, 0.71], [0.85, 0.61], [1, 0.5]]);
const lamOf = (s) => (1 - Math.cos(TAU * s)) / 2;
const sideOf = (s) => (((s % 1) + 1) % 1 < 0.5 ? 1 : -1);
// край горловины: lam — от задника (0) к началу шнуровки (1)
export function rim(lam, side) {
  const x = lerp(XO0, XO1, lam), u = uOfX(x);
  const hz = OHZ(lam) * endR(lam, 0.06) * endR(1 - lam, 0.07);
  return [x, top(u) + OY(lam), CZ(u) + side * hz];
}
function soleEdge(s) {
  const u = lamOf(s), L = last(u);
  return [L.x, top(u) - 0.012, sideOf(s) > 0 ? L.lat : L.med];
}
function outward(s) {
  const a = soleEdge(s + 1e-3), b = soleEdge(s - 1e-3);
  const tx = a[0] - b[0], tz = a[2] - b[2], l = Math.hypot(tx, tz) || 1;
  return [-tz / l, 0, tx / l];
}
const bez = (P, t) => { const m = 1 - t; return [0, 1, 2].map((i) => m * m * m * P[0][i] + 3 * m * m * t * P[1][i] + 3 * m * t * t * P[2][i] + t * t * t * P[3][i]); };
function meridianCtrl(s) {
  const B = soleEdge(s), O = rim(lamOf(s), sideOf(s)), n = outward(s);
  const dx = O[0] - B[0], dz = O[2] - B[2], dhl = Math.hypot(dx, dz), dy = O[1] - B[1];
  return [B, [B[0] + n[0] * 0.012 + dx * 0.14, B[1] + dy * 0.55, B[2] + n[2] * 0.012 + dz * 0.14], [O[0] - dx * 0.5, O[1] - 0.11 * dhl, O[2] - dz * 0.5], O];
}
// точка верха по доле длины дуги t (а не по параметру Безье — так сетка ровнее)
const merCache = new Map();
function meridian(s) {
  const key = Math.round(s * 1e6);
  let m = merCache.get(key);
  if (m) return m;
  const C = meridianCtrl(s), N = 64, pts = [], cum = [0];
  for (let i = 0; i <= N; i++) pts.push(bez(C, i / N));
  for (let i = 1; i <= N; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
  m = { pts, cum, len: cum[N] };
  if (merCache.size > 20000) merCache.clear();
  merCache.set(key, m);
  return m;
}
function basePoint(s, t) {
  const m = meridian(((s % 1) + 1) % 1), target = clamp(t) * m.len;
  let i = 1;
  while (i < m.cum.length - 1 && m.cum[i] < target) i++;
  const f = (target - m.cum[i - 1]) / Math.max(1e-9, m.cum[i] - m.cum[i - 1]);
  const a = m.pts[i - 1], b = m.pts[i];
  return [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)];
}
function frameNormal(fn, s, t) {
  const e = 2e-3;
  const a = fn(s + e, t), b = fn(s - e, t), c = fn(s, Math.min(1, t + e)), d = fn(s, Math.max(0, t - e));
  const du = [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dv = [c[0] - d[0], c[1] - d[1], c[2] - d[2]];
  const n = [du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]];
  const l = Math.hypot(...n) || 1;
  return n.map((v) => v / l);
}
// трикотаж не идеально гладкий: мягкие волны и два залома на сгибе стопы
function relief(p, t) {
  const top = smooth(0.35, 0.8, t) * (1 - smooth(0.93, 1, t));
  let d = 0.0016 * Math.sin(p[0] * 23 + p[2] * 9) * Math.sin(p[1] * 17 - p[0] * 5) * smooth(0.05, 0.25, t);
  for (const [xc, w, a] of [[0.66, 0.022, 0.0042], [0.79, 0.018, 0.0032]]) {
    const xx = p[0] - xc + 0.18 * p[2] + 0.006 * Math.sin(p[2] * 40);
    d -= a * Math.exp(-((xx / w) ** 2)) * top;
  }
  return d;
}
export function upperPoint(s, t) {
  const p = basePoint(s, t);
  const r = relief(p, t);
  if (Math.abs(r) < 1e-6) return p;
  const n = frameNormal(basePoint, s, t);
  return [p[0] + n[0] * r, p[1] + n[1] * r, p[2] + n[2] * r];
}
export function upperNormal(s, t) {
  const e = 2e-3;
  const a = upperPoint(s + e, t), b = upperPoint(s - e, t), c = upperPoint(s, Math.min(1, t + e)), d = upperPoint(s, Math.max(0, t - e));
  const du = [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dv = [c[0] - d[0], c[1] - d[1], c[2] - d[2]];
  let n = [du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]];
  const l = Math.hypot(...n) || 1;
  n = n.map((v) => v / l);
  return n;
}
// площадка на поверхности верха (накладки, логотип): sOf(σ), tOf(σ, τ)
function patch(nu, nv, sOf, tOf, off, uvOf) {
  return grid(nu, nv, (a, b) => {
    const s = sOf(a), t = tOf(a, b);
    const p = upperPoint(s, t), nn = upperNormal(s, t);
    const q = [p[0] + nn[0] * off, p[1] + nn[1] * off, p[2] + nn[2] * off];
    return { p: q, uv: uvOf ? uvOf(q, a, b) : [a, b] };
  });
}

// пена пропускает немного света: к краям (под скользящим взглядом) и в тенях
// она светится изнутри своим цветом. Сила задаётся из main.js по яркости сцены.
function translucent(m) {
  m.userData.sss = { value: new THREE.Color('#ffffff') };
  m.userData.sssAmt = { value: 0.05 };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.sssColor = m.userData.sss; sh.uniforms.sssAmt = m.userData.sssAmt;
    sh.fragmentShader = 'uniform vec3 sssColor; uniform float sssAmt;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n  { float rim = 1.0 - saturate(dot(normal, normalize(vViewPosition))); totalEmissiveRadiance += sssColor * sssAmt * (0.35 + 1.4 * rim * rim); }');
  };
  m.customProgramCacheKey = () => 'foam-sss';
}

// плоская лента вдоль кривой (шнурки, петля на пятке)
function ribbon(points, width, thick, upHint = [0, 1, 0], { tubular = 120, radial = 10, closed = false, twist = 0 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), closed, 'centripetal');
  const pos = [], nrm = [], uvs = [], idx = [];
  const up0 = new THREE.Vector3(...upHint);
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular, c = curve.getPointAt(t), T = curve.getTangentAt(t);
    const U0 = up0.clone().sub(T.clone().multiplyScalar(up0.dot(T))).normalize();
    const S0 = new THREE.Vector3().crossVectors(T, U0).normalize();
    // перекрут: лента поворачивается вокруг своей оси, к концам снова ложится плоско
    const tw = twist * Math.sin(Math.PI * t), ct = Math.cos(tw), st = Math.sin(tw);
    const U = U0.clone().multiplyScalar(ct).addScaledVector(S0, st), S = S0.clone().multiplyScalar(ct).addScaledVector(U0, -st);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU, ca = Math.cos(a), sa = Math.sin(a);
      const p = c.clone().addScaledVector(S, ca * width).addScaledVector(U, sa * thick);
      const n = S.clone().multiplyScalar(ca / width).addScaledVector(U, sa / thick).normalize();
      pos.push(p.x, p.y, p.z); nrm.push(n.x, n.y, n.z); uvs.push(t * 8, j / radial);
    }
  }
  for (let i = 0; i < tubular; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}

// ---------------------------------------------------------------------
// Положение кроссовка по состоянию кадра: поворот (крен, курс, наклон) и опора —
// пятка или носок. Без сцены: этим же считаются капли с подошвы и всплеск.
// ---------------------------------------------------------------------
export const BASE_Y = 0.024; // подмётка стоит на асфальте
export function shoeTransform(sh, pos = new THREE.Vector3(), quat = new THREE.Quaternion()) {
  quat.setFromEuler(new THREE.Euler(sh.roll, sh.yaw, sh.pitch, 'YZX'));
  pos.set(sh.pos[0], sh.pos[1] + BASE_Y, sh.pos[2]);
  if (sh.pivot) {
    const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), sh.yaw);
    const local = new THREE.Vector3(sh.pivot[0], sh.pivot[1], 0);
    const world = local.clone().applyQuaternion(qy).add(pos);
    pos.copy(world.sub(local.applyQuaternion(quat)));
  }
  return { pos, quat };
}

// ---------------------------------------------------------------------
// Расцветки
// ---------------------------------------------------------------------
export const COLORWAYS = {
  ember: { name: 'Ember', stitch: '#6a6c74', hole: '#030304', aglet: '#ff5a1f', upperA: '#141518', upperB: '#5c2412', lining: '#2b2c31', cage: '#24262c', foamTop: '#f3f1ec', foamBottom: '#ff5a1f', outsole: '#1c1d21', logo: '#ff6326', laces: '#f3f1ec', overlay: '#0d0e11', tab: '#ff5a1f', glow: '#ff6a2a' },
  glacier: { name: 'Glacier', stitch: '#8ea7ba', hole: '#56677a', aglet: '#20aef2', upperA: '#eef1f4', upperB: '#bfdcf0', lining: '#c9d4dc', cage: '#dfe8ef', foamTop: '#ffffff', foamBottom: '#58cff9', outsole: '#2a3946', logo: '#20aef2', laces: '#ffffff', overlay: '#d6e0e7', tab: '#20aef2', glow: '#47c4ff' },
  // белая с оранжевой подошвой — для ролика «Кристаллы» (v7): как белый кроссовок с яркой подушкой
  lunar: { name: 'Lunar', stitch: '#b8bec6', hole: '#5b6067', aglet: '#ff5a1f', upperA: '#e6e9ec', upperB: '#f7f8f9', lining: '#d7dbe0', cage: '#dde1e6', foamTop: '#ffffff', foamBottom: '#ff5a1f', outsole: '#1c1d21', logo: '#ff6326', laces: '#f4f4f2', overlay: '#cfd4da', tab: '#ff5a1f', glow: '#ff6a2a' },
  volt: { name: 'Volt', stitch: '#3c4418', hole: '#1b1f0a', aglet: '#121315', upperA: '#c3ee2e', upperB: '#efff9a', lining: '#22251a', cage: '#141517', foamTop: '#17181b', foamBottom: '#c9f03c', outsole: '#121315', logo: '#121315', laces: '#121315', overlay: '#191b10', tab: '#121315', glow: '#d4ff4a' },
};

// ---------------------------------------------------------------------
// Сборка
// ---------------------------------------------------------------------
export function buildShoe({ jersey = null } = {}) {
  const knit = TX.knit(), smudge = TX.smudge(), tread = TX.tread(), carbon = TX.carbon(), foam = TX.foam(), logoTex = TX.logo(), holesTex = TX.holes(), weave = TX.weave();
  const tabLabel = TX.label('PULSE', 512, 128, 72);
  const M = {
    upper: new THREE.MeshPhysicalMaterial({ vertexColors: true, map: knit.color, normalMap: knit.normal, normalScale: new THREE.Vector2(1.4, 1.4), roughnessMap: knit.rough, roughness: 1, sheen: 0.4, sheenRoughness: 0.75, sheenColor: new THREE.Color('#8f949e') }),
    lining: new THREE.MeshPhysicalMaterial({ color: '#333', map: knit.color, roughness: 0.95, side: THREE.BackSide }),
    collar: new THREE.MeshPhysicalMaterial({ color: '#444', normalMap: knit.normal, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.85, sheen: 0.3, sheenRoughness: 0.6, sheenColor: new THREE.Color('#9aa0aa') }),
    foamTop: new THREE.MeshPhysicalMaterial({ color: '#fff', map: foam.color, normalMap: foam.normal, normalScale: new THREE.Vector2(1, 1), roughnessMap: foam.rough, roughness: 1, clearcoat: 0.12, clearcoatRoughness: 0.5, sheen: 0.25, sheenRoughness: 0.6, sheenColor: new THREE.Color('#ffffff') }),
    foamBottom: null,
    plate: new THREE.MeshPhysicalMaterial({ color: '#fff', map: carbon.color, roughnessMap: carbon.rough, roughness: 1, clearcoat: 1, clearcoatRoughness: 0.12, clearcoatRoughnessMap: smudge, anisotropy: 0.8, anisotropyRotation: 0.5 }),
    stitch: new THREE.MeshPhysicalMaterial({ color: '#666', roughness: 0.8, sheen: 1, sheenColor: new THREE.Color('#ffffff') }),
    holes: new THREE.MeshPhysicalMaterial({ color: '#050506', map: holesTex, transparent: true, alphaTest: 0.45, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 }),
    aglet: new THREE.MeshPhysicalMaterial({ color: '#222', roughness: 0.5, roughnessMap: smudge, clearcoat: 1, clearcoatRoughness: 0.2, clearcoatRoughnessMap: smudge }),
    bite: new THREE.MeshPhysicalMaterial({ color: '#09090b', roughness: 0.6 }),
    outsole: new THREE.MeshPhysicalMaterial({ color: '#222', map: tread.color, normalMap: tread.normal, normalScale: new THREE.Vector2(1.2, 1.2), roughnessMap: tread.rough, roughness: 1 }),
    cage: new THREE.MeshPhysicalMaterial({ color: '#444', roughness: 0.56, roughnessMap: smudge, clearcoat: 1, clearcoatRoughness: 0.24, clearcoatRoughnessMap: smudge }),
    overlay: new THREE.MeshPhysicalMaterial({ color: '#111', normalMap: knit.normal, normalScale: new THREE.Vector2(0.12, 0.12), roughness: 0.6, roughnessMap: smudge, clearcoat: 0.8, clearcoatRoughness: 0.34, clearcoatRoughnessMap: smudge }),
    logo: new THREE.MeshPhysicalMaterial({ color: '#f60', map: logoTex, transparent: true, alphaTest: 0.35, roughness: 0.22, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05, polygonOffset: true, polygonOffsetFactor: -2 }),
    laces: new THREE.MeshPhysicalMaterial({ color: '#eee', normalMap: weave, normalScale: new THREE.Vector2(1.1, 1.1), roughness: 0.7, sheen: 0.45, sheenRoughness: 0.6, sheenColor: new THREE.Color('#9a9a9a') }),
    metal: new THREE.MeshPhysicalMaterial({ color: '#d4d7dc', metalness: 1, roughness: 0.22 }),
    tab: new THREE.MeshPhysicalMaterial({ color: '#f60', roughness: 0.7, roughnessMap: smudge, clearcoat: 0.7, clearcoatRoughness: 0.4, clearcoatRoughnessMap: smudge }),
    tabText: new THREE.MeshPhysicalMaterial({ color: '#fff', map: tabLabel, transparent: true, alphaTest: 0.4, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2 }),
    insole: new THREE.MeshPhysicalMaterial({ color: '#202126', roughness: 0.95, sheen: 0.4, sheenColor: new THREE.Color('#888') }),
  };
  // ткань канта, языка, подкладки и стельки — скан (если загрузился)
  M.tongue = M.collar.clone();
  if (jersey) {
    const fabric = (m, set, ns = 1) => { m.map = set.color; m.normalMap = set.normal; m.normalScale = new THREE.Vector2(ns, ns); m.roughnessMap = set.rough; m.roughness = 1.6; m.needsUpdate = true; };
    fabric(M.tongue, jersey.at(0.25, 0.25), 1.2);
    fabric(M.lining, jersey.at(0.25, 0.25), 0.8);
    fabric(M.insole, jersey.at(2.3, 0.7), 0.8);
    M.insole.color.set('#26272c');
  }
  M.foamBottom = M.foamTop.clone();
  // пена немного пропускает свет: края и тени чуть светятся изнутри
  for (const m of [M.foamTop, M.foamBottom]) translucent(m);
  knit.color.repeat.set(1, 1);

  const root = new THREE.Group();
  const groups = { upper: new THREE.Group(), foamTop: new THREE.Group(), plate: new THREE.Group(), foamBottom: new THREE.Group(), outsole: new THREE.Group() };
  for (const g of Object.values(groups)) root.add(g);
  const add = (grp, geo, mat, name) => { const m = new THREE.Mesh(geo, mat); m.name = name; m.castShadow = true; m.receiveShadow = true; groups[grp].add(m); return m; };

  // ---- подошва
  add('foamBottom', soleLayer(0, 0.5, { n: 4.5 }), M.foamBottom, 'foamBottom');
  add('foamTop', soleLayer(0.5, 1, { n: 4.5, cup: true }), M.foamTop, 'foamTop');
  add('plate', soleLayer(0.485, 0.515, { inset: 0.006, n: 10, nv: 40, uv: 'plate' }), M.plate, 'plate');
  // подмётка: пятка и передний отдел, середина — открытая пена
  add('outsole', soleLayer(0, 0.07, { inset: 0.008, n: 6, nv: 48, uv: 'tread', u0: 0, u1: 0.36, round1: 0.12, dy0: -0.022, dy1: -0.012 }), M.outsole, 'outsoleHeel');
  add('outsole', soleLayer(0, 0.07, { inset: 0.008, n: 6, nv: 48, uv: 'tread', u0: 0.46, u1: 1, round0: 0.1, dy0: -0.022, dy1: -0.012 }), M.outsole, 'outsoleFore');

  // ---- стелька (видна в горловине)
  add('upper', grid(80, 16, (a, b) => {
    const u = lerp(0.03, 0.97, cosSpace(a)), L = last(u, -0.02);
    return { p: [L.x, top(u) + 0.012, lerp(L.med, L.lat, b)], uv: [a, b] };
  }, { flip: true }), M.insole, 'insole');

  // ---- верх
  const NU = 240, NV = 60;
  const perim = 6.6, tile = 0.3;
  const upperGeo = grid(NU, NV, (a, b) => {
    const p = upperPoint(a, b), m = meridian(((a % 1) + 1) % 1);
    // вес градиента: к носку и к подошве светлее
    const w = smooth(-0.5, 1.45, p[0]) * (1 - 0.55 * b);
    return { p, uv: [(a * perim) / tile, (b * m.len) / tile], w };
  });
  const upper = add('upper', upperGeo, M.upper, 'upper');
  upperGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(upperGeo.attributes.position.count * 3), 3));
  add('upper', upperGeo, M.lining, 'lining').castShadow = false;

  // мягкий кант горловины
  const collarPts = [];
  for (let i = 0; i <= 60; i++) {
    const s = lerp(-0.2, 0.2, i / 60), p = rim(lamOf(s), sideOf(s)), n = upperNormal(s, 0.98);
    collarPts.push([p[0] - n[0] * 0.012, p[1] - 0.012, p[2] - n[2] * 0.012]);
  }
  const collarCurve = new THREE.CatmullRomCurve3(collarPts.map((q) => new THREE.Vector3(...q)), false, 'centripetal');
  if (jersey) { const set = jersey.at(collarCurve.getLength() / 1.2, 0.19 / 1.2); M.collar.map = set.color; M.collar.normalMap = set.normal; M.collar.normalScale = new THREE.Vector2(1.2, 1.2); M.collar.roughnessMap = set.rough; M.collar.roughness = 1.6; M.collar.needsUpdate = true; }
  add('upper', new THREE.TubeGeometry(collarCurve, 160, 0.03, 14, false), M.collar, 'collar');

  // задник (жёсткая накладка на пятке)
  add('upper', patch(48, 22, (a) => lerp(-0.085, 0.085, a), (a, b) => b * (0.6 - 0.32 * (2 * a - 1) ** 2), 0.006), M.overlay, 'heelCounter');
  // носок
  add('upper', patch(40, 10, (a) => lerp(0.43, 0.57, a), (a, b) => 0.005 + b * (0.16 - 0.1 * (2 * a - 1) ** 2), 0.005), M.overlay, 'toeCap');
  // полосы под шнуровку
  const sOfLam = (lam, side) => { const s = Math.acos(1 - 2 * lam) / TAU; return side > 0 ? s : 1 - s; };
  for (const side of [1, -1]) {
    add('upper', patch(40, 6, (a) => sOfLam(lerp(0.5, 0.995, a), side), (a, b) => lerp(0.86, 0.995, b), 0.005), M.overlay, 'eyestay' + side);
  }
  // «тросики»: тонкие глянцевые полосы от подошвы к каждой блочке
  for (const side of [1, -1]) for (let i = 1; i < 6; i++) {
    const si = sOfLam(lerp(0.97, 0.56, i / 6), side);
    add('upper', patch(3, 40, (a) => lerp(si - 0.0026, si + 0.0026, a), (a, b) => lerp(0.04, 0.9, b), 0.0042), M.cage, 'cage' + side + i);
  }
  // логотип-орбита на обеих сторонах (проекция сбоку)
  const logoUV = (q) => [(q[0] + 1.2) / 2.1, (q[1] - 0.38) / 0.62];
  add('upper', patch(90, 40, (a) => lerp(0.06, 0.44, a), (a, b) => lerp(0.04, 0.82, b), 0.008, logoUV), M.logo, 'logoLat').castShadow = false;
  add('upper', patch(90, 40, (a) => lerp(0.56, 0.94, a), (a, b) => lerp(0.04, 0.82, b), 0.008, logoUV), M.logo, 'logoMed').castShadow = false;

  // язык
  const tongueC = (b) => {
    const x = lerp(0.58, -0.5, b), lam = clamp((x - XO0) / (XO1 - XO0));
    const r = rim(lam, 0);
    const extra = 0.14 * smooth(-0.28, -0.5, x);
    return [x, r[1] + 0.012 + extra, CZ(uOfX(x))];
  };
  add('upper', grid(60, 28, (a, b) => {
    const C = tongueC(a), C2 = tongueC(Math.min(1, a + 0.01)), C1 = tongueC(Math.max(0, a - 0.01));
    const T = new THREE.Vector3(C2[0] - C1[0], C2[1] - C1[1], C2[2] - C1[2]).normalize();
    const S = new THREE.Vector3(0, 0, 1), U = new THREE.Vector3().crossVectors(S, T).normalize();
    const w = lerp(0.12, 0.165, smooth(0, 0.3, a)) * endR(1 - a, 0.1);
    const th = b * TAU, ce = se(Math.cos(th), 3), sv = se(Math.sin(th), 3);
    const thick = 0.022 * endR(1 - a, 0.08) + 0.004;
    const arch = 0.025 * (1 - ce * ce);
    return { p: [C[0] + S.x * w * ce + U.x * (thick * sv + arch), C[1] + S.y * w * ce + U.y * (thick * sv + arch), C[2] + S.z * w * ce + U.z * (thick * sv + arch)], uv: [a * 4, b * 2] };
  }, { flip: true }), M.tongue, 'tongue');
  // ярлык на языке
  add('upper', grid(10, 6, (a, b) => {
    const C = tongueC(lerp(0.86, 0.97, b));
    return { p: [C[0] - 0.004, C[1] + 0.033, C[2] + lerp(-0.07, 0.07, a)], uv: [1 - a, b] };
  }, { flip: true }), M.tabText, 'tongueLabel').rotation.set(0, 0, 0);

  // шнуровка: 7 пар блочек, крест-накрест
  const eyelets = [];
  for (let i = 0; i < 7; i++) {
    const lam = lerp(0.97, 0.56, i / 6);
    const row = [1, -1].map((side) => { const s = sOfLam(lam, side), p = upperPoint(s, 0.94), n = upperNormal(s, 0.94); return { p: [p[0] + n[0] * 0.006, p[1] + n[1] * 0.006, p[2] + n[2] * 0.006], n }; });
    eyelets.push(row);
  }
  const torus = new THREE.TorusGeometry(0.014, 0.0045, 8, 20);
  for (const row of eyelets) for (const e of row) {
    const m = add('upper', torus, M.metal, 'eyelet');
    m.position.set(...e.p);
    m.lookAt(e.p[0] + e.n[0], e.p[1] + e.n[1], e.p[2] + e.n[2]);
  }
  const lift = (p, h) => [p[0], p[1] + h, p[2]];
  const lr = TX.rng(97);
  const laceSeg = (A, B, h) => {
    // середина ложится на язык, отрезок слегка провисает и перекручивается — у каждого по-своему
    const hh = h * (0.82 + 0.3 * lr()), side = (lr() - 0.5) * 0.008;
    const mid = [(A[0] + B[0]) / 2 + side, (A[1] + B[1]) / 2 + hh, (A[2] + B[2]) / 2];
    const sag = 0.004 + 0.004 * lr();
    return ribbon([lift(A, 0.004), lerp3(A, mid, 0.45, 0.012 - sag), mid, lerp3(B, mid, 0.45, 0.012 - sag * 0.7), lift(B, 0.004)], 0.017, 0.0055, [0, 1, 0], { tubular: 40, radial: 8, twist: (lr() - 0.5) * 1.1 });
  };
  const lerp3 = (a, b, t, up = 0) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t) + up, lerp(a[2], b[2], t)];
  add('upper', laceSeg(eyelets[0][0].p, eyelets[0][1].p, 0.02), M.laces, 'lace0');
  for (let i = 0; i < 6; i++) {
    add('upper', laceSeg(eyelets[i][0].p, eyelets[i + 1][1].p, 0.03 + (i % 2) * 0.006), M.laces, 'laceA' + i);
    add('upper', laceSeg(eyelets[i][1].p, eyelets[i + 1][0].p, 0.036 - (i % 2) * 0.006), M.laces, 'laceB' + i);
  }
  // бант: две плоские петли и хвосты, лежащие на подъёме
  const K = lerp3(eyelets[6][0].p, eyelets[6][1].p, 0.5, 0.045);
  for (const sd of [1, -1]) {
    add('upper', ribbon([K, [K[0] + 0.05, K[1] + 0.028, K[2] + sd * 0.05], [K[0] + 0.045, K[1] + 0.03, K[2] + sd * (0.13 + 0.01 * sd)], [K[0] - 0.02, K[1] + 0.008, K[2] + sd * 0.17], [K[0] - 0.065, K[1] - 0.004, K[2] + sd * 0.1], [K[0] - 0.01, K[1] - 0.004, K[2] + sd * 0.015]], 0.016, 0.005, [0, 1, 0], { tubular: 60, radial: 8, twist: 0.5 * sd }), M.laces, 'bow' + sd);
    const sT = sOfLam(0.5, sd), p1 = upperPoint(sT, 0.9), n1 = upperNormal(sT, 0.9), p2 = upperPoint(sOfLam(0.43, sd), 0.72), n2 = upperNormal(sOfLam(0.43, sd), 0.72);
    add('upper', ribbon([K, [K[0] + 0.02, K[1] + 0.01, K[2] + sd * 0.06], [p1[0] + n1[0] * 0.018, p1[1] + n1[1] * 0.018, p1[2] + n1[2] * 0.018], [p2[0] + n2[0] * 0.014, p2[1] + n2[1] * 0.014, p2[2] + n2[2] * 0.014]], 0.016, 0.005, [0, 1, 0], { tubular: 50, radial: 8 }), M.laces, 'tail' + sd);
    add('upper', laceSeg(eyelets[6][sd > 0 ? 0 : 1].p, K, 0.01), M.laces, 'toKnot' + sd);
    const tip = new THREE.Vector3(p2[0] + n2[0] * 0.014, p2[1] + n2[1] * 0.014, p2[2] + n2[2] * 0.014), prev = new THREE.Vector3(p1[0] + n1[0] * 0.018, p1[1] + n1[1] * 0.018, p1[2] + n1[2] * 0.018);
    const ag = add('upper', new THREE.CylinderGeometry(0.0062, 0.0062, 0.05, 12), M.aglet, 'aglet' + sd);
    ag.position.copy(tip); ag.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tip.clone().sub(prev).normalize());
  }
  // петля на пятке
  const hb = rim(0, 1);
  add('upper', ribbon([[hb[0] + 0.03, hb[1] - 0.05, hb[2] - 0.05], [hb[0] - 0.04, hb[1] + 0.03, hb[2] - 0.045], [hb[0] - 0.07, hb[1] + 0.1, hb[2]], [hb[0] - 0.04, hb[1] + 0.03, hb[2] + 0.045], [hb[0] + 0.03, hb[1] - 0.05, hb[2] + 0.05]], 0.03, 0.007, [-1, 0.3, 0], { tubular: 60, radial: 10 }), M.tab, 'heelTab');

  // ---- шов между верхом и подошвой (там, где трикотаж уходит в пену)
  const bitePts = [];
  for (let i = 0; i < 200; i++) {
    const s = i / 200, u = lamOf(s);
    const rimY = top(u) + 0.025 + 0.07 * (1 - smooth(0.05, 0.45, u)) - 0.004;
    let t = 0;
    while (t < 0.4 && upperPoint(s, t)[1] < rimY) t += 0.005;
    const p = upperPoint(s, t), n = upperNormal(s, t);
    bitePts.push(new THREE.Vector3(p[0] + n[0] * 0.003, p[1], p[2] + n[2] * 0.003));
  }
  add('upper', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(bitePts, true, 'centripetal'), 400, 0.0035, 6, true), M.bite, 'biteLine').castShadow = false;

  // ---- строчка: короткие стежки вдоль края накладок
  const stitchGeo = new THREE.CapsuleGeometry(0.0016, 0.009, 2, 6).rotateZ(Math.PI / 2);
  const stitchRuns = [];
  const runAlong = (sOf, tOf, off, step = 0.019) => {
    const pts = [];
    for (let i = 0; i <= 200; i++) { const a = i / 200, s = sOf(a), t = tOf(a), p = upperPoint(s, t), n = upperNormal(s, t); pts.push({ p: new THREE.Vector3(p[0] + n[0] * off, p[1] + n[1] * off, p[2] + n[2] * off), n: new THREE.Vector3(...n) }); }
    let acc = 0, next = step * 0.5;
    for (let i = 1; i < pts.length; i++) {
      const seg = pts[i].p.distanceTo(pts[i - 1].p);
      if (acc + seg >= next) { stitchRuns.push({ p: pts[i].p, d: pts[i].p.clone().sub(pts[i - 1].p).normalize(), n: pts[i].n }); next += step; }
      acc += seg;
    }
  };
  runAlong((a) => lerp(-0.08, 0.08, a), (a) => (0.6 - 0.32 * (2 * ((a - 0.0) / 1) - 1) ** 2) * 0.9, 0.0075);
  runAlong((a) => lerp(0.435, 0.565, a), (a) => 0.005 + 0.86 * (0.16 - 0.1 * (2 * a - 1) ** 2), 0.0065);
  for (const side of [1, -1]) runAlong((a) => sOfLam(lerp(0.5, 0.99, a), side), () => 0.875, 0.0065);
  const stitches = new THREE.InstancedMesh(stitchGeo, M.stitch, stitchRuns.length);
  const sm = new THREE.Matrix4(), sq = new THREE.Quaternion();
  stitchRuns.forEach((r, i) => {
    const x = r.d, z = r.n.clone().sub(x.clone().multiplyScalar(r.n.dot(x))).normalize(), y = new THREE.Vector3().crossVectors(z, x);
    sm.makeBasis(x, y, z); sq.setFromRotationMatrix(sm);
    sm.compose(r.p, sq, new THREE.Vector3(1, 1, 0.6));
    stitches.setMatrixAt(i, sm);
  });
  stitches.name = 'stitches';
  groups.upper.add(stitches);

  // ---- вентиляционная перфорация на носке (проекция сверху)
  add('upper', patch(60, 40, (a) => lerp(0.4, 0.6, a), (a, b) => lerp(0.2, 0.82, b), 0.0025, (q) => [(q[0] - 0.62) / 0.9, (q[2] + 0.48) / 0.96]), M.holes, 'perforation').castShadow = false;

  // ---- капли воды: полусферы-линзы; на верхних гранях их больше — туда падает дождь
  const wr = TX.rng(2024), dm = new THREE.Object3D(), Yup = new THREE.Vector3(0, 1, 0);
  // без честного преломления (оно требует лишней перерисовки сцены): капля — прозрачный глянец с бликом
  // капля на тёмной ткани видна только бликом: материал прибавляется к картинке, ничего не закрывая
  M.drop = new THREE.MeshPhysicalMaterial({ color: '#05070a', metalness: 0, roughness: 0.03, transparent: true, blending: THREE.AdditiveBlending, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6, specularIntensity: 1, depthWrite: false });
  const dropGeo = new THREE.SphereGeometry(1, 16, 8, 0, TAU, 0, Math.PI / 2);
  const place = (mesh, i, p, n, r, h) => {
    dm.position.set(p[0] + n[0] * 0.003, p[1] + n[1] * 0.003, p[2] + n[2] * 0.003);
    dm.quaternion.setFromUnitVectors(Yup, new THREE.Vector3(...n).normalize());
    dm.rotateY(wr() * TAU);
    dm.scale.set(r * (1 + 0.25 * wr()), r * h, r);
    dm.updateMatrix(); mesh.setMatrixAt(i, dm.matrix);
  };
  const dropR = () => 0.004 + 0.02 * Math.pow(wr(), 3.2);
  const ND = 1100, drops = new THREE.InstancedMesh(dropGeo, M.drop, ND);
  for (let i = 0; i < ND; i++) {
    let sS, tT, n;
    do { sS = wr(); tT = 0.12 + 0.85 * wr(); n = upperNormal(sS, tT); } while (wr() > Math.max(0, n[1]) + 0.12);
    place(drops, i, upperPoint(sS, tT), n, dropR(), 0.45 + 0.3 * wr());
  }
  drops.name = 'drops'; drops.castShadow = false;
  groups.upper.add(drops);
  // на боковине пены капли висят у верхнего края
  const NF = 170, fdrops = new THREE.InstancedMesh(dropGeo, M.drop, NF);
  for (let i = 0; i < NF; i++) {
    const u = 0.04 + 0.92 * wr(), L = last(u, 0.035), side = wr() < 0.5 ? 1 : -1;
    const y = top(u) - 0.015 - 0.16 * Math.pow(wr(), 1.5);
    place(fdrops, i, [L.x, y, (side > 0 ? L.lat + 0.006 : L.med - 0.006)], [0, 0.15, side], dropR() * 0.9, 0.5 + 0.2 * wr());
  }
  fdrops.name = 'foamDrops';
  groups.foamTop.add(fdrops);

  // ---- ворсинки: тысячи коротких изогнутых волокон над трикотажем (видны на макро)
  const fiberGeo = (() => {
    const pos = [], idx = [];
    for (let k = 0; k <= 4; k++) { const t = k / 4; pos.push(-0.5, t, 0.35 * t * t, 0.5, t, 0.35 * t * t); }
    for (let k = 0; k < 4; k++) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  })();
  M.fiber = new THREE.MeshStandardMaterial({ color: '#7d828c', roughness: 0.6, side: THREE.DoubleSide });
  const NFB = 9000, fibers = new THREE.InstancedMesh(fiberGeo, M.fiber, NFB);
  for (let i = 0; i < NFB; i++) {
    const sS = wr(), tT = 0.06 + 0.9 * wr(), p = upperPoint(sS, tT), n = new THREE.Vector3(...upperNormal(sS, tT)).normalize();
    const L = 0.008 + 0.022 * wr();
    dm.position.set(p[0], p[1], p[2]);
    // волокно торчит под углом к поверхности, в случайную сторону
    const tilt = new THREE.Vector3(wr() - 0.5, wr() - 0.5, wr() - 0.5).projectOnPlane(n).normalize();
    const dir = n.clone().multiplyScalar(0.35 + 0.5 * wr()).add(tilt).normalize();
    dm.quaternion.setFromUnitVectors(Yup, dir); dm.rotateY(wr() * TAU);
    dm.scale.set(0.00045, L, L);
    dm.updateMatrix(); fibers.setMatrixAt(i, dm.matrix);
  }
  fibers.name = 'fibers'; fibers.castShadow = false;
  groups.upper.add(fibers);

  // ---- якоря для подписей (локальные координаты)
  const anchors = {
    upper: upperPoint(0.3, 0.55),
    foamTop: [0.2, top(uOfX(0.2)) - 0.08, last(uOfX(0.2), 0.035).lat + 0.04],
    plate: [0.55, soleBottom(uOfX(0.55)) + stack(uOfX(0.55)) * 0.5, last(uOfX(0.55), 0.035).lat + 0.03],
    foamBottom: [-0.6, soleBottom(uOfX(-0.6)) + 0.1, last(uOfX(-0.6), 0.035).lat + 0.06],
    outsole: [0.9, soleBottom(uOfX(0.9)) - 0.02, last(uOfX(0.9), 0.035).lat - 0.05],
    logo: upperPoint(0.24, 0.35),
    heel: rim(0, 1),
  };
  // точки для макропланов: место, нормаль и ракурс
  const near = (x, y, side) => { // ближайшая к (x, y) точка верха на нужной стороне
    let best = null;
    for (let i = 0; i <= 120; i++) for (let j = 0; j <= 40; j++) {
      const ss = side > 0 ? lerp(0.02, 0.48, i / 120) : lerp(0.52, 0.98, i / 120), tt = j / 40, q = upperPoint(ss, tt);
      const d = (q[0] - x) ** 2 + (q[1] - y) ** 2;
      if (!best || d < best.d) best = { d, s: ss, t: tt };
    }
    return { p: upperPoint(best.s, best.t), n: upperNormal(best.s, best.t) };
  };
  const macro = {
    knit: { p: upperPoint(0.36, 0.3), n: upperNormal(0.36, 0.3) }, // бок носка: рыжий трикотаж за логотипом, ниже шнуровки
    planet: near(0.27, top(uOfX(0.27)) + 0.36, 1),
    laces: eyelets.map((row) => lerp3(row[0].p, row[1].p, 0.5, 0.03)),
    heel: rim(0, 1),
    toe: upperPoint(0.5, 0.35),
  };

  function setColorway(name) {
    const cw = COLORWAYS[name] || COLORWAYS.ember;
    const A = new THREE.Color(cw.upperA), B = new THREE.Color(cw.upperB);
    const col = upperGeo.attributes.color, w = upperGeo.userData.w;
    const P = upperGeo.attributes.position;
    for (let k = 0; k < col.count; k++) {
      const x = P.getX(k), y = P.getY(k), z = P.getZ(k);
      // пряжа никогда не окрашена идеально ровно: мягкие пятна в пару сантиметров
      const n = 0.5 * Math.sin(x * 7.1 + z * 3.3) + 0.3 * Math.sin(y * 11.7 - x * 4.9) + 0.2 * Math.sin(z * 17.3 + y * 5.1);
      const c = A.clone().lerp(B, w[k]).multiplyScalar((1 + 0.05 * n) * 0.88); // мокрая пряжа темнее
      col.setXYZ(k, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
    M.lining.color.set(cw.lining);
    M.collar.color.set(cw.lining); M.tongue.color.set(cw.lining);
    M.foamTop.color.set(cw.foamTop);
    M.foamBottom.color.set(cw.foamBottom);
    M.foamTop.userData.sss.value.set(cw.foamTop); M.foamBottom.userData.sss.value.set(cw.foamBottom);
    M.outsole.color.set(cw.outsole);
    M.overlay.color.set(cw.overlay);
    M.cage.color.set(cw.cage);
    M.stitch.color.set(cw.stitch); M.holes.color.set(cw.hole); M.aglet.color.set(cw.aglet);
    M.logo.color.set(cw.logo);
    M.laces.color.set(cw.laces).multiplyScalar(0.8);
    M.fiber.color.set(cw.upperB).lerp(new THREE.Color(cw.upperA), 0.4).multiplyScalar(1.25);
    M.tab.color.set(cw.tab);
    M.tabText.color.set(name === 'volt' ? '#c9f03c' : '#ffffff');
    root.userData.colorway = name;
  }
  setColorway('ember');
  return { root, groups, materials: M, anchors, macro, setColorway };
}
