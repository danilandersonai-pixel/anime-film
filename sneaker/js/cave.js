// cave.js — мир v7 «Кристаллы»: тёмная вода, наклонные плиты сланца со сколотыми краями
// и слоями породы, мелкие обломки у воды, друзы кристаллов — холодные прозрачные вокруг
// и тёплые оранжевые (в цвет подошвы) на камне-острове, где встаёт кроссовок.
// Всё строится кодом и детерминированно (одинаково в three.js и в Blender Cycles: геометрия
// уходит в GLB). Единицы: 1 = 10 см, вода — y = 0, кроссовок носком к +x, наружным боком к +z.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from './textures.js';

export const ISLAND_TOP = 0.62;           // верх камня-острова, на котором стоит кроссовок
const TAU = Math.PI * 2;

// куда кристаллам расти нельзя: место кроссовка на острове (с запасом)
const KEEP_OUT = [{ min: [-1.8, ISLAND_TOP - 0.2, -0.7], max: [1.85, ISLAND_TOP + 1.7, 0.72] }];
const blocked = (p) => KEEP_OUT.some((b) => p.x > b.min[0] && p.x < b.max[0] && p.y > b.min[1] && p.y < b.max[1] && p.z > b.min[2] && p.z < b.max[2]);

// ---------------------------------------------------------------------
// Кристалл: неровная шестигранная призма с пирамидальной вершиной, основание в начале
// координат, ось +Y. Грани плоские — так ловят свет настоящие кристаллы кварца.
// ---------------------------------------------------------------------
function crystalGeo(r, rad, L, tip, skew) {
  const P = [], K = [], body = L * (1 - tip);
  const k6 = Array.from({ length: 6 }, () => 0.82 + 0.36 * r());        // грани разной ширины
  const ring = (y, s) => k6.map((k, i) => { const a = i / 6 * TAU + skew; return [Math.cos(a) * rad * k * s, y, Math.sin(a) * rad * k * s]; });
  const b0 = ring(-0.2 * L, 0.94), b1 = ring(body, 1);
  const apex = [rad * (r() - 0.5) * 0.5, L, rad * (r() - 0.5) * 0.5];
  // tipk — доля высоты (0 у основания, 1 на острие): кристалл светится к вершине
  const kb = 1 - tip, tri = (a, b, c, ka, kbb, kc) => { P.push(...a, ...b, ...c); K.push(ka, kbb, kc); };
  for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6;
    tri(b0[i], b1[j], b1[i], 0, kb, kb); tri(b0[i], b0[j], b1[j], 0, 0, kb);   // бок призмы
    tri(b1[i], b1[j], apex, kb, kb, 1);                                         // грань вершины
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('tipk', new THREE.Float32BufferAttribute(K, 1));
  g.computeVertexNormals();
  return g;
}

// друза: кристаллы расходятся веером из точки на камне вокруг нормали; mul — толщина
function cluster(r, out, base, normal, count, size, spread, mul = 1) {
  const N = new THREE.Vector3(...normal).normalize(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
  const T = new THREE.Vector3(1, 0, 0).cross(N).lengthSq() > 0.01 ? new THREE.Vector3(1, 0, 0).cross(N).normalize() : new THREE.Vector3(0, 0, 1);
  const B = new THREE.Vector3().crossVectors(N, T);
  for (let i = 0, tries = 0; i < count && tries < count * 8; tries++) {
    const a = r() * TAU, s = spread * Math.sqrt(r());
    const dir = N.clone().multiplyScalar(Math.cos(s)).addScaledVector(T, Math.sin(s) * Math.cos(a)).addScaledVector(B, Math.sin(s) * Math.sin(a)).normalize();
    const L = size * (0.22 + 0.78 * Math.pow(r(), 1.7)) * (i === 0 ? 1.25 : 1);
    const rad = L * (0.1 + 0.07 * r()) * mul;
    const off = new THREE.Vector3((r() - 0.5), (r() - 0.5) * 0.2, (r() - 0.5)).multiplyScalar(size * 0.38);
    const o = new THREE.Vector3(base[0] + off.x, base[1] + off.y, base[2] + off.z);
    const tip = 0.2 + 0.18 * r(), skew = r() * TAU;
    // не прорастать туда, где стоит кроссовок
    let bad = false;
    for (let k = 0; k <= 6 && !bad; k++) bad = blocked(o.clone().addScaledVector(dir, L * k / 6));
    if (bad) continue;
    const g = crystalGeo(r, rad, L, tip, skew);
    q.setFromUnitVectors(Y, dir);
    g.applyQuaternion(q);
    g.translate(o.x, o.y, o.z);
    out.push(g);
    i++;
  }
}

// ---------------------------------------------------------------------
// Плита сланца (в своих координатах: верх около y = 0): неровный контур со сколами;
// верх чуть бугристый, край скруглён, бока сколоты и расширяются книзу. Грани плоские —
// камень выглядит отколотым. layers — ступени породы: верхний слой меньше и сдвинут.
// ---------------------------------------------------------------------
function outline(r, w, d, n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU + (r() - 0.5) * 0.4, k = 0.76 + 0.24 * r();
    pts.push([Math.cos(a) * w * 0.5 * k, Math.sin(a) * d * 0.5 * k]);
    // скол: точка между вершинами, вдавленная внутрь
    if (r() < 0.3) { const a2 = (i + 0.5) / n * TAU, k2 = k * (0.72 + 0.12 * r()); pts.push([Math.cos(a2) * w * 0.5 * k2, Math.sin(a2) * d * 0.5 * k2]); }
  }
  return pts;
}
function rockPlate(r, pts, y0, h, S) {
  const N = pts.length, b = Math.min(0.12, 0.025 * S + 0.02);
  const cx = pts.reduce((a, p) => a + p[0], 0) / N, cz = pts.reduce((a, p) => a + p[1], 0) / N;
  const ring = (s, y, jr = 0, jy = 0) => pts.map(([x, z]) => { const k = s + (r() - 0.5) * jr; return [cx + (x - cx) * k, y + (r() - 0.5) * jy, cz + (z - cz) * k]; });
  const bump = 0.012 * S;
  const R = [
    ring(0.38, y0 + bump * 0.6, 0.06, bump), ring(0.72, y0 + bump * 0.3, 0.05, bump),
    ring(0.96, y0 - b * 0.35, 0.01, b * 0.2), ring(1.0, y0 - b),
    ring(1.04, y0 - b - h * 0.3, 0.07, h * 0.06), ring(1.09, y0 - h * 0.65, 0.08, h * 0.08), ring(1.15, y0 - h, 0.06, 0),
  ];
  const c = [cx, y0 + bump, cz], P = [];
  const tri = (a, bb, cc) => P.push(...a, ...bb, ...cc);
  // направление обхода: верхний веер должен смотреть вверх
  const e1 = [R[0][0][0] - c[0], R[0][0][2] - c[2]], e2 = [R[0][1][0] - c[0], R[0][1][2] - c[2]];
  const up = e1[1] * e2[0] - e1[0] * e2[1] > 0;   // y-компонента (p0 − c) × (p1 − c)
  const T = (a, bb, cc) => (up ? tri(a, bb, cc) : tri(a, cc, bb));
  for (let i = 0; i < N; i++) T(c, R[0][i], R[0][(i + 1) % N]);
  for (let k = 0; k + 1 < R.length; k++) for (let i = 0; i < N; i++) {
    const j = (i + 1) % N, A = R[k], B = R[k + 1];
    T(A[i], B[i], B[j]); T(A[i], B[j], A[j]);
  }
  // дно (под водой — но пусть будет закрыто)
  const L = R[R.length - 1], cb = [cx, y0 - h, cz];
  for (let i = 0; i < N; i++) T(cb, L[(i + 1) % N], L[i]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  return g;
}
function slabGeo(r, { w, d, h = 2.5, layers = 1 }) {
  const n = 9 + Math.floor(r() * 5), S = Math.min(w, d);
  const parts = [rockPlate(r, outline(r, w, d, n), 0, h, S)];
  // ступени: верхний слой отслоился и чуть сдвинут — видна слоистость сланца
  let top = 0;
  for (let k = 1; k < layers; k++) {
    const s = 0.6 + 0.2 * r(), dx = (r() - 0.5) * w * 0.18, dz = (r() - 0.5) * d * 0.18, th = 0.14 + 0.2 * r();
    const sub = outline(r, w * s, d * s, n).map(([x, y]) => [x + dx, y + dz]);
    top += th;
    parts.push(rockPlate(r, sub, top, th + 0.15, S * s));
  }
  const g = parts.length > 1 ? mergeGeometries(parts) : parts[0];
  g.computeVertexNormals();
  g.userData.top = top;
  return g;
}

// обломок: неровный многогранник (как отколотый кусок породы)
function rubbleGeo(r, s) {
  const g = new THREE.IcosahedronGeometry(1, 0);   // уже без индексов: грани отдельные
  const P = g.attributes.position, seen = new Map();
  for (let i = 0; i < P.count; i++) {
    const key = `${P.getX(i).toFixed(3)},${P.getY(i).toFixed(3)},${P.getZ(i).toFixed(3)}`;
    if (!seen.has(key)) seen.set(key, 0.7 + 0.5 * r());
    const k = seen.get(key);
    P.setXYZ(i, P.getX(i) * k * s * 1.3, P.getY(i) * k * s * 0.55, P.getZ(i) * k * s);
  }
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

// раскладка мира. Остров в центре; кроссовок прилетает слева издалека (−x), сквозь «коридор»
// из двух наклонных плит с кристаллами, проходит над водой перед островом и садится на него.
export const SLABS = [
  { x: 0, z: 0, w: 9.5, d: 6.2, top: ISLAND_TOP, h: 2.6, rot: 0.15, layers: 1, island: true },
  { x: 0.4, z: 0.3, w: 12.5, d: 8.6, top: ISLAND_TOP - 0.38, h: 2.2, rot: -0.2, island: true },   // нижняя ступень острова
  { x: 6.2, z: 4.4, w: 5.5, d: 3.2, top: 0.24, rot: 0.5, tilt: 0.06, layers: 2 },
  { x: -7.4, z: 3.4, w: 6.5, d: 3.6, top: 0.36, rot: -0.35, tilt: 0.07, layers: 2 },
  { x: -5.0, z: -7.8, w: 9, d: 5, top: 1.6, rot: 0.25, tilt: 0.12, layers: 2 },
  { x: 7.0, z: -8.5, w: 10, d: 6, top: 2.3, rot: -0.45, tilt: -0.1, layers: 2 },
  { x: 2.5, z: -15, w: 8, d: 4, top: 3.4, h: 4.5, rot: 0.1, tilt: 0.38 },                          // наклонная плита за островом
  { x: -14, z: -17, w: 14, d: 7, top: 3.6, h: 4, rot: 0.5, tilt: 0.14, layers: 2 },
  { x: 15, z: -19, w: 16, d: 8, top: 4.6, h: 5, rot: -0.6, tilt: -0.12, layers: 2 },
  { x: -2, z: -28, w: 18, d: 8, top: 2.6, h: 4, rot: 0.1, tilt: 0.08, layers: 2 },
  // коридор пролёта: две наклонные плиты по сторонам траектории
  { x: -28.0, z: -11.4, w: 15, d: 5, top: 5.6, h: 8, rot: -0.53, tilt: 0.42, layers: 2 },
  { x: -20.5, z: 6.5, w: 13, d: 4.5, top: 3.6, h: 6, rot: -0.53, tilt: -0.36, layers: 2 },
  { x: -36, z: -24, w: 12, d: 6, top: 7.0, h: 9, rot: 0.4, tilt: 0.3 },
  { x: -12.5, z: -5.5, w: 6, d: 3, top: 3.4, h: 5, rot: 1.2, tilt: 0.5 },
  { x: -37.5, z: -3.0, w: 11, d: 4.5, top: 6.4, h: 9, rot: -0.7, tilt: -0.4, layers: 2 },          // коридор: левая стена
  // дальний план: стены в тумане
  { x: 0, z: -66, w: 70, d: 14, top: 11, h: 13, rot: 0, tilt: 0.1 },
  { x: -50, z: -52, w: 32, d: 12, top: 13, h: 15, rot: 0.6, tilt: 0.2 },
  { x: 48, z: -58, w: 38, d: 12, top: 10.5, h: 13, rot: -0.5, tilt: -0.16 },
  { x: 26, z: 1, w: 12, d: 6, top: 3.0, h: 5, rot: -1.0, tilt: 0.22, layers: 2 },
  { x: 30, z: -32, w: 16, d: 7, top: 6.0, h: 8, rot: -0.2, tilt: -0.25 },
];
// друзы: [x, y, z, нормаль, сколько, размер, раствор, толщина]; тёплые — на острове
export const WARM = [
  [-1.6, ISLAND_TOP - 0.06, -1.5, [-0.3, 1, -0.55], 26, 2.5, 0.8, 1.1],   // большая — за пяткой
  [1.5, ISLAND_TOP - 0.06, -1.45, [0.3, 1, -0.5], 16, 1.7, 0.75, 1.1],    // за носком
  [-1.2, ISLAND_TOP - 0.06, 1.45, [-0.35, 1, 0.55], 8, 0.85, 0.7],        // мелкие спереди
  [2.6, ISLAND_TOP - 0.06, 0.55, [0.55, 1, 0.25], 7, 0.75, 0.6],
  [-3.3, ISLAND_TOP - 0.06, 0.3, [-0.6, 1, 0.05], 10, 1.2, 0.7],
  [3.6, ISLAND_TOP - 0.06, -0.7, [0.6, 1, -0.1], 6, 0.9, 0.6],
];
export const COLD = [
  [-5.0, 1.55, -7.2, [0.2, 1, 0.35], 14, 2.6, 0.6], [7.0, 2.25, -7.6, [-0.3, 1, 0.25], 16, 3.0, 0.65], [-14, 3.55, -15.5, [0.2, 1, 0.3], 18, 3.6, 0.7],
  [14.5, 4.5, -17, [-0.2, 1, 0.3], 18, 4.0, 0.7], [2.0, 3.2, -14.0, [0.0, 1, 0.5], 12, 2.6, 0.6], [-2, 2.55, -26, [0.1, 1, 0.3], 16, 3.2, 0.6],
  // коридор: друзы растут с плит навстречу траектории
  [-25.5, 5.2, -8.7, [0.45, 0.8, 0.5], 18, 3.4, 0.6], [-30.0, 6.3, -13.1, [0.4, 0.8, 0.45], 14, 3.0, 0.55], [-22.5, 3.3, 4.6, [-0.3, 0.85, -0.6], 16, 3.0, 0.6],
  [-18.0, 3.3, 7.4, [-0.2, 0.9, -0.5], 10, 2.4, 0.55], [-12.5, 3.3, -4.6, [0.6, 0.8, 0.3], 10, 2.2, 0.55], [-35, 6.8, -22, [0.5, 0.9, 0.4], 14, 3.8, 0.6], [-35.5, 5.6, -5.0, [-0.3, 0.8, -0.6], 14, 3.0, 0.6],
  // у воды вокруг острова
  [6.4, 0.22, 4.6, [0.1, 1, 0.25], 7, 1.2, 0.55], [-7.8, 0.34, 3.4, [-0.1, 1, 0.25], 8, 1.3, 0.55], [26, 2.9, 1.5, [-0.4, 1, 0.1], 12, 2.8, 0.6],
  [9.5, 0.0, 1.0, [0.2, 1, 0.1], 6, 1.4, 0.5], [-10.5, 0.0, -1.5, [-0.2, 1, 0.1], 7, 1.6, 0.5],
];
// обломки у кромки воды: [x, z, размер]
const RUBBLE = [[4.7, 2.9, 0.35], [5.3, -1.9, 0.28], [-5.3, 1.4, 0.4], [-4.6, -2.3, 0.3], [3.0, 3.9, 0.22], [-2.2, 3.7, 0.26], [8.8, 5.6, 0.3], [-9.6, 4.6, 0.36],
  [1.4, -4.2, 0.3], [-1.8, -4.0, 0.25], [6.8, 0.6, 0.2], [-6.9, -0.6, 0.24], [10.6, -3.2, 0.5], [-11.4, 1.8, 0.45], [12.5, 6.0, 0.4], [-13.5, 8.8, 0.5]];

// мир: плиты (каждая — свой меш со своим положением: слои породы идут вдоль плиты),
// обломки, холодные и тёплые кристаллы
export function buildCaveGeometry() {
  const r = rng(707);
  const slabs = SLABS.map((s) => {
    const geo = slabGeo(r, s);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(s.x, s.top - geo.userData.top, s.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, s.rot || 0, s.tilt || 0, 'YZX')), new THREE.Vector3(1, 1, 1));
    return { geo, matrix: m, island: !!s.island };
  });
  const rubble = mergeGeometries(RUBBLE.map(([x, z, s]) => { const g = rubbleGeo(r, s); g.rotateY(r() * TAU); g.translate(x, s * 0.12, z); return g; }));
  const cold = [], warm = [];
  for (const c of COLD) cluster(r, cold, c.slice(0, 3), c[3], c[4], c[5], c[6], c[7] ?? 1);
  for (const c of WARM) cluster(r, warm, c.slice(0, 3), c[3], c[4], c[5], c[6], c[7] ?? 1);
  return { slabs, rubble, cold: mergeGeometries(cold), warm: mergeGeometries(warm) };
}

// ---------------------------------------------------------------------
// Материалы three.js: сланец — шум по трём осям, слои породы вдоль плиты (координаты
// объекта), мокрый у воды; на острове — ржавые и золотые прожилки. Кристаллы — стекло.
// ---------------------------------------------------------------------
export function rockMaterial(island) {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = 'varying vec3 vW, vL, vUpW;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n  vW = (modelMatrix * vec4(transformed, 1.0)).xyz; vL = transformed; vUpW = normalize(mat3(modelMatrix) * vec3(0.0, 1.0, 0.0));');
    sh.fragmentShader = `varying vec3 vW, vL, vUpW;
      float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
      float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * n3(p); p *= 2.03; a *= 0.5; } return s; }
      // слои породы: полосы вдоль плиты (по высоте в координатах объекта), слегка волнистые
      float layerF(vec3 l){ return l.y * 6.5 + fbm(l * vec3(0.35, 0.1, 0.35)) * 2.5; }
      float rk, rkWet, rkGold, rkRust, rkBand;
      ` + sh.fragmentShader
      .replace('#include <map_fragment>', `
        float lf = layerF(vL);
        rkBand = smoothstep(0.75, 1.0, abs(sin(lf * 3.14159)));
        rk = fbm(vW * 1.1) * 0.6 + fbm(vL * vec3(1.5, 9.0, 1.5)) * 0.4;
        rkWet = 1.0 - smoothstep(0.02, 0.32, vW.y);
        vec3 base = mix(vec3(0.07, 0.075, 0.085), vec3(0.24, 0.25, 0.27), rk);
        base *= 1.0 + 0.45 * rkBand;
        rkGold = ${island ? 'smoothstep(0.76, 0.82, n3(vW * 16.0)) * smoothstep(0.42, 0.6, fbm(vW * 1.7 + 2.0))' : '0.0'};
        rkRust = ${island ? 'smoothstep(0.5, 0.72, fbm(vW * 0.9 + vec3(3.1, 0.0, 1.7)))' : '0.0'};
        base = mix(base, vec3(0.2, 0.075, 0.03) * (0.6 + 0.8 * rk), rkRust * 0.55);
        diffuseColor.rgb = mix(base * mix(1.0, 0.5, rkWet), vec3(0.95, 0.6, 0.22), rkGold);`)
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = mix(mix(0.62, 0.2, rkWet), 0.28, rkGold) - 0.12 * rk;`)
      .replace('#include <metalnessmap_fragment>', `float metalnessFactor = rkGold;`)
      .replace('#include <normal_fragment_maps>', `
        { float e = 0.02;
          vec3 g = vec3(fbm(vW * 3.0 + vec3(e, 0, 0)) - fbm(vW * 3.0 - vec3(e, 0, 0)), fbm(vW * 3.0 + vec3(0, e, 0)) - fbm(vW * 3.0 - vec3(0, e, 0)), fbm(vW * 3.0 + vec3(0, 0, e)) - fbm(vW * 3.0 - vec3(0, 0, e)));
          // рёбра слоёв: мелкие уступы поперёк плиты
          float l0 = layerF(vL), dl = (layerF(vL + vec3(0.0, e, 0.0)) - l0) / e;
          vec3 gLay = vUpW * sin(l0 * 6.2832) * dl * 0.025;
          normal = normalize(normal - (viewMatrix * vec4(g * 5.0 + gLay, 0.0)).xyz * (1.0 - rkWet * 0.7)); }`);
  };
  m.customProgramCacheKey = () => 'rock2-' + island;
  return m;
}

export function crystalMaterials() {
  // прозрачный кварц: чуть молочный и голубоватый в толще, грани с радужным отливом
  const cold = new THREE.MeshPhysicalMaterial({ name: 'crystal_cold', color: '#eef4ff', metalness: 0, roughness: 0.08, transmission: 0.9, ior: 1.55, thickness: 0.5, attenuationColor: new THREE.Color('#cfe2ff'), attenuationDistance: 2.5, dispersion: 0.4, iridescence: 0.25, iridescenceIOR: 1.6, specularIntensity: 1, envMapIntensity: 2.2, emissive: new THREE.Color('#cddcf0'), emissiveIntensity: 0.05 });
  // тёплый: оранжевое стекло, густеет в толще, светится изнутри
  const warm = new THREE.MeshPhysicalMaterial({ name: 'crystal_warm', color: '#ffffff', metalness: 0, roughness: 0.05, transmission: 1, ior: 1.55, thickness: 0.45, attenuationColor: new THREE.Color('#ff3c08'), attenuationDistance: 0.3, emissive: new THREE.Color('#ff4a10'), emissiveIntensity: 0.32, dispersion: 0.3, specularIntensity: 1, envMapIntensity: 2.2 });
  // свет «бежит» внутри кристалла: ярче к острию и на гранях под скользящим углом
  for (const m of [cold, warm]) {
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = 'attribute float tipk; varying float vTip;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vTip = tipk;');
      sh.fragmentShader = 'varying float vTip;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  { float fr = 1.0 - abs(dot(normalize(vViewPosition), normal)); totalEmissiveRadiance *= (0.2 + 2.4 * fr * fr) * (0.25 + 1.75 * vTip * vTip); }');
    };
    m.customProgramCacheKey = () => 'crystal-' + m.name;
  }
  return { cold, warm };
}

export function createCave(scene) {
  const G = buildCaveGeometry();
  const group = new THREE.Group(); group.name = 'cave';
  const rockM = rockMaterial(false), islandM = rockMaterial(true);
  const slabs = G.slabs.map((s, i) => {
    const m = new THREE.Mesh(s.geo, s.island ? islandM : rockM);
    m.name = s.island ? `island${i}` : `rock${i}`;
    m.matrixAutoUpdate = false; m.matrix.copy(s.matrix);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    return m;
  });
  const rubble = new THREE.Mesh(G.rubble, rockM); rubble.name = 'rubble'; rubble.castShadow = rubble.receiveShadow = true;
  const mats = crystalMaterials();
  const cold = new THREE.Mesh(G.cold, mats.cold); cold.name = 'crystals_cold';
  const warm = new THREE.Mesh(G.warm, mats.warm); warm.name = 'crystals_warm';
  cold.castShadow = warm.castShadow = false; cold.receiveShadow = warm.receiveShadow = true;
  group.add(rubble, cold, warm);
  scene.add(group);
  group.updateMatrixWorld(true);
  return { group, slabs, rubble, cold, warm, materials: { rock: rockM, island: islandM, ...mats } };
}
