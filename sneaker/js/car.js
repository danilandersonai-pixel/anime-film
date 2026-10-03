// car.js — машина кодом: седан из сечений-суперэллипсов. Кузов — труба от порога до линии
// капота и багажника с арками колёс, кабина — вторая труба сверху (стёкла и крыша),
// колёса с дисками, фары и фонари в корпусе. Одна модель на плеер three.js и Blender Cycles
// (выгружается в GLB). Единицы сцены: 1 = 10 см; нос — по +x, ширина — по z, корень — на земле.
import * as THREE from 'three';

export const CAR = { length: 46, half: 9.1, nose: 22.4, headY: 6.9, headZ: 5.0, wheelR: 3.3, axles: [14.2, -13.8] };
const { length: LEN, half: HW } = CAR;
const se = (v, n) => Math.sign(v) * Math.pow(Math.abs(v), 2 / n);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// плавная кривая через точки (Катмулл — Ром): без «ступенек» на крыше
function table(pts) {
  const P = [pts[0], ...pts, pts[pts.length - 1]];
  return (x) => {
    if (x <= pts[0][0]) return pts[0][1];
    if (x >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
    let i = 1; while (x > P[i + 1][0]) i++;
    const t = (x - P[i][0]) / (P[i + 1][0] - P[i][0]), [y0, y1, y2, y3] = [P[i - 1][1], P[i][1], P[i + 1][1], P[i + 2][1]];
    return 0.5 * (2 * y1 + (y2 - y0) * t + (2 * y0 - 5 * y1 + 4 * y2 - y3) * t * t + (3 * y1 - y0 - 3 * y2 + y3) * t * t * t);
  };
}
// силуэт сбоку: линия капота и багажника, крыша
const belt = table([[-23, 9.0], [-19.5, 9.8], [-12, 9.65], [0, 9.3], [8, 9.0], [16, 8.2], [23, 7.3]]);
const roof = table([[-17, 9.7], [-12.5, 12.4], [-6, 14.2], [0, 14.4], [4, 12.4], [7.5, 9.0]]);
// ширина в плане: прямоугольник со скруглёнными углами
const halfW = (x) => HW * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * x / LEN), 6)), 1 / 6);
// низ кузова: просвет, свесы приподняты, над колёсами — арки
function sill(x) {
  let y = 1.7 + 0.9 * smooth(0.78, 1, Math.abs(2 * x / LEN));
  for (const a of CAR.axles) { const d = Math.abs(x - a) / 4.2; if (d < 1) y = Math.max(y, 1.4 + 5.4 * Math.sqrt(1 - d * d)); }
  return y;
}

// сетка (nu × nv), шов по v замкнут; mat(u, v) → номер материала грани
function surface(nu, nv, closed, fn, mat) {
  const cv = closed ? nv : nv + 1, P = [];
  for (let i = 0; i <= nu; i++) for (let j = 0; j < cv; j++) P.push(...fn(i / nu, j / nv));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  const groups = [[], []];
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const j1 = closed ? (j + 1) % nv : j + 1;
    const a = i * cv + j, b = (i + 1) * cv + j, c = (i + 1) * cv + j1, d = i * cv + j1;
    groups[mat ? mat((i + 0.5) / nu, (j + 0.5) / nv) : 0].push(a, b, c, a, c, d);
  }
  g.setIndex([...groups[0], ...groups[1]]);
  g.addGroup(0, groups[0].length, 0); g.addGroup(groups[0].length, groups[1].length, 1);
  g.computeVertexNormals();
  return g;
}

export function buildCar({ paint = '#8a929c' } = {}) {
  const M = {
    paint: new THREE.MeshPhysicalMaterial({ name: 'car_paint', color: paint, metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.03 }),
    glass: new THREE.MeshPhysicalMaterial({ name: 'car_glass', color: '#020203', metalness: 0, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.01 }),
    tire: new THREE.MeshStandardMaterial({ name: 'car_tire', color: '#0d0d0e', roughness: 0.85 }),
    rim: new THREE.MeshStandardMaterial({ name: 'car_rim', color: '#8d939b', metalness: 1, roughness: 0.3 }),
    trim: new THREE.MeshStandardMaterial({ name: 'car_trim', color: '#0a0a0b', roughness: 0.5 }),
    head: new THREE.MeshStandardMaterial({ name: 'car_head', color: '#000000', emissive: '#fff3e0', emissiveIntensity: 30 }),
    tail: new THREE.MeshStandardMaterial({ name: 'car_tail', color: '#000000', emissive: '#ff1608', emissiveIntensity: 14 }),
  };
  const root = new THREE.Group(); root.name = 'car';
  const add = (geo, mat, name) => { const m = new THREE.Mesh(geo, mat); m.name = name; root.add(m); return m; };

  // кузов: замкнутое сечение от порога до линии капота
  const xs = (u) => -LEN / 2 + LEN * (0.5 - 0.5 * Math.cos(Math.PI * u));
  add(surface(72, 44, true, (u, v) => {
    const x = xs(u), w = halfW(x), y0 = sill(x), y1 = belt(x), ph = v * Math.PI * 2;
    return [x, (y0 + y1) / 2 + (y1 - y0) / 2 * se(Math.sin(ph), 5), w * se(Math.cos(ph), 5)];
  }), M.paint, 'body');

  // кабина: верхняя половина сечения; сверху — крыша цвета кузова, остальное — стекло
  const X0 = -16.5, X1 = 7.5;
  add(surface(56, 30, false, (u, v) => {
    const x = X0 + (X1 - X0) * u, base = belt(x) - 0.3, h = Math.max(0, roof(x) - base);
    const ph = Math.PI * v, hy = se(Math.sin(ph), 4), wb = halfW(x) - 0.5, wt = 6.4;
    return [x, base + h * hy, se(Math.cos(ph), 4) * (wb + (wt - wb) * hy)];
  }, (u, v) => {
    const x = X0 + (X1 - X0) * u, hy = se(Math.sin(Math.PI * v), 4);
    return x > -9 && x < 2.6 && hy > 0.86 ? 0 : 1;
  }), [M.paint, M.glass], 'cabin');

  // колёса: шина и диск в каждой арке
  const tireGeo = new THREE.CylinderGeometry(CAR.wheelR, CAR.wheelR, 2.3, 32, 1).rotateX(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(2.15, 2.15, 0.3, 28, 1).rotateX(Math.PI / 2);
  for (const a of CAR.axles) for (const s of [1, -1]) {
    add(tireGeo, M.tire, 'tire').position.set(a, CAR.wheelR, s * (HW - 1.45));
    add(rimGeo, M.rim, 'rim').position.set(a, CAR.wheelR, s * (HW - 0.32));
  }
  // фары и фонари в корпусе, решётка
  const heads = [], tails = [];
  for (const s of [1, -1]) {
    const h = add(new THREE.BoxGeometry(1.6, 1.0, 3.4), M.head, 'headlight'); h.position.set(CAR.nose - 0.5, CAR.headY, s * CAR.headZ); h.rotation.y = s * 0.2; heads.push(h);
    const t = add(new THREE.BoxGeometry(1.2, 0.9, 3.4), M.tail, 'taillight'); t.position.set(-22.3, 8.5, s * 4.7); t.rotation.y = -s * 0.15; tails.push(t);
  }
  add(new THREE.BoxGeometry(0.5, 0.3, 6.2), M.tail, 'taillight').position.set(-22.95, 8.75, 0);
  add(new THREE.BoxGeometry(0.9, 1.7, 7.4), M.trim, 'grille').position.set(22.6, 4.9, 0);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
  return { root, materials: M, heads, tails };
}

// точка света фар (чуть впереди носа, чтобы кузов не загораживал прожектор), в координатах машины
export const HEAD_LIGHT = [CAR.nose + 1.2, CAR.headY, 0];
