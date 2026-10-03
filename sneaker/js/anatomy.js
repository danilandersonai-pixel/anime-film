// anatomy.js — кроссовок «в разборе» (v6): детали по отдельности, разлёт и сборка,
// шнуровка по кольцам. Общий для плеера three.js и Blender Cycles (export6.js).
// Детали — группы внутри корня кроссовка; положение группы при разлёте:
// T(центр + сдвиг·e) · R(поворот·e) · T(−центр), где e — доля разлёта детали.
import * as THREE from 'three';

// порядок — снизу вверх; off — сдвиг при полном разлёте (единицы сцены, 1 = 10 см)
export const PARTS = [
  { key: 'outsole', label: 'Подмётка', off: [0, -0.98, 0], rot: [0, 0, 0.03], ax: [0.78, 0.2], side: 1 },
  { key: 'foamBottom', label: 'Нижний слой пены', off: [0, -0.66, 0], rot: [0, 0, -0.02], ax: [0.22, 0.55], side: -1 },
  { key: 'plate', label: 'Карбоновая пластина', off: [0, -0.36, 0], rot: [0, 0, 0.02], ax: [0.72, 0.5], side: 1 },
  { key: 'foamTop', label: 'Верхний слой пены', off: [0, -0.04, 0], rot: [0, 0, 0], ax: [0.3, 0.6], side: -1 },
  { key: 'insole', label: 'Стелька', off: [0, 0.28, 0], rot: [0, 0, 0.02], ax: [0.7, 0.6], side: 1 },
  { key: 'knit', label: 'Вязаный верх', off: [0, 0.6, 0], rot: [0, 0, 0], ax: [0.62, 0.45], side: 1 },
  { key: 'heel', label: 'Жёсткий задник', off: [-0.62, 0.74, 0], rot: [0, 0, 0.14], ax: [0.3, 0.45], side: -1 },
  { key: 'frame', label: 'Накладки и тросики', off: [0, 1.0, 0], rot: [0, 0, -0.02], ax: [0.85, 0.35], side: 1 },
  { key: 'tongue', label: 'Язык', off: [0.32, 1.3, 0], rot: [0, 0, -0.2], ax: [0.35, 0.8], side: -1 },
  { key: 'eyelets', label: 'Блочки', off: [0, 1.5, 0], rot: [0, 0, 0], ax: [0.85, 0.5], side: 1 },
  { key: 'laces', label: 'Шнурки', off: [0, 1.76, 0], rot: [0, 0, 0.03], ax: [0.2, 0.7], side: -1 },
];
export const PART_KEYS = PARTS.map((p) => p.key);

// какие меши из группы «верх» к какой детали относятся
const KNIT = ['upper', 'lining', 'collar', 'logoLat', 'logoMed', 'perforation', 'stitches', 'fibers', 'biteLine'];
const OWNER = (name) => {
  if (name === 'insole') return 'insole';
  if (name === 'heelCounter' || name === 'heelTab') return 'heel';
  if (name === 'toeCap' || name.startsWith('eyestay') || name.startsWith('cage')) return 'frame';
  if (name === 'tongue' || name === 'tongueLabel') return 'tongue';
  if (name === 'eyelet') return 'eyelets';
  if (/^(lace|toKnot|bow|tail|aglet)/.test(name)) return 'laces';
  if (KNIT.includes(name)) return 'knit';
  return null;
};

// порядок шнуровки: перекладина внизу, шесть пар отрезков крест-накрест, к узлу, бант и хвосты
const STEPS = [['lace0'], ...Array.from({ length: 6 }, (_, i) => [`laceA${i}`, `laceB${i}`]), ['toKnot1', 'toKnot-1'], ['bow1', 'bow-1', 'tail1', 'tail-1']];
// по каким отрезкам идёт каждый конец шнурка (за ним следует наконечник)
const CHAINS = {
  1: ['laceA0', 'laceB1', 'laceA2', 'laceB3', 'laceA4', 'laceB5', 'toKnot1', 'tail1'],
  '-1': ['lace0', 'laceB0', 'laceA1', 'laceB2', 'laceA3', 'laceB4', 'laceA5', 'toKnot-1', 'tail-1'],
};
export const LACE_STEPS = STEPS.length;

// разобрать кроссовок на детали; капли (сухая студия) прячутся
export function splitParts(shoe) {
  const { root, groups } = shoe;
  const parts = { outsole: groups.outsole, foamBottom: groups.foamBottom, plate: groups.plate, foamTop: groups.foamTop };
  for (const k of ['insole', 'knit', 'heel', 'frame', 'tongue', 'eyelets', 'laces']) { const g = new THREE.Group(); g.name = 'part_' + k; root.add(g); parts[k] = g; }
  for (const o of [...groups.upper.children]) {
    if (o.name === 'drops') { o.visible = false; continue; }
    const k = OWNER(o.name);
    if (k) parts[k].add(o); // группы стоят в начале координат — меш остаётся на месте
  }
  for (const o of groups.foamTop.children) if (o.name === 'foamDrops') o.visible = false;
  root.remove(groups.upper);
  // центр каждой детали — точка, вокруг которой она поворачивается при разлёте
  const box = new THREE.Box3();
  for (const [k, g] of Object.entries(parts)) {
    box.makeEmpty();
    g.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && o.visible) { o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrix)); } });
    g.userData.box = box.clone(); g.userData.center = box.getCenter(new THREE.Vector3()); g.name = 'part_' + k;
  }
  return { parts, lacing: makeLacing(parts.laces) };
}

// положение детали при доле разлёта e (и лёгком покачивании в невесомости, t — время)
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3();
export function placePart(g, def, e, t = 0) {
  const c = g.userData.center, f = Math.min(1, Math.abs(e));
  const bob = 0.018 * f * Math.sin(t * 1.7 + def.off[1] * 3.1);
  _e.set(def.rot[0] * e + 0.025 * f * Math.sin(t * 1.1 + def.off[1]), def.rot[1] * e + 0.04 * f * Math.sin(t * 0.8 + def.off[1] * 2), def.rot[2] * e);
  _q.setFromEuler(_e);
  g.quaternion.copy(_q);
  _v.copy(c).applyQuaternion(_q);
  g.position.set(c.x + def.off[0] * e - _v.x, c.y + def.off[1] * e + bob - _v.y, c.z + def.off[2] * e - _v.z);
}
// то же как матрица (для экспорта в Cycles и подписей)
export function partMatrix(g, def, e, t = 0) { placePart(g, def, e, t); g.updateMatrix(); return g.matrix.clone(); }

// точка подписи детали: доли по длине и высоте её габарита, на наружной стороне
export function partAnchor(g, def) {
  const b = g.userData.box, s = b.getSize(new THREE.Vector3());
  return [b.min.x + def.ax[0] * s.x, b.min.y + def.ax[1] * s.y, b.max.z * 0.9];
}

// ---------------------------------------------------------------------
// Шнуровка: отрезок проявляется по кольцам (ribbon строит кольца вдоль длины),
// наконечник едет на переднем крае своего конца шнурка
// ---------------------------------------------------------------------
function makeLacing(laceGroup) {
  const seg = {}, aglets = {};
  laceGroup.traverse((o) => {
    if (!o.isMesh) return;
    if (o.name.startsWith('aglet')) { aglets[o.name.slice(5)] = { mesh: o, pos: o.position.clone(), quat: o.quaternion.clone() }; return; }
    const g = o.geometry, P = g.attributes.position, idx = g.index.count;
    // кольцо = (radial + 1) вершин; число колец — из индексов: tubular · radial · 6
    const rings = [];
    let radial = 0;
    for (const r of [8, 10]) if (P.count % (r + 1) === 0 && idx % (r * 6) === 0 && P.count / (r + 1) - 1 === idx / (r * 6)) radial = r;
    const n = P.count / (radial + 1);
    for (let i = 0; i < n; i++) {
      const c = new THREE.Vector3();
      for (let j = 0; j < radial; j++) c.add(new THREE.Vector3().fromBufferAttribute(P, i * (radial + 1) + j));
      rings.push(c.multiplyScalar(1 / radial).applyMatrix4(o.matrix));
    }
    seg[o.name] = { mesh: o, rings, radial, tubular: n - 1 };
  });
  return { seg, aglets };
}

// p — шнуровка от 0 (шнурка нет) до 1 (завязан бантом); возвращает доли отрезков
export function laceReveal(p) {
  const out = {}, k = p * STEPS.length;
  STEPS.forEach((names, i) => {
    const x = Math.min(1, Math.max(0, k - i));
    const f = x * x * (3 - 2 * x);
    for (const n of names) out[n] = f;
  });
  return out;
}

// применить шнуровку к мешам (three.js): видимая часть отрезка и наконечники
const _t = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
export function applyLacing(lacing, p) {
  const R = laceReveal(p);
  for (const [name, s] of Object.entries(lacing.seg)) {
    const f = R[name] ?? 1, rings = Math.round(f * s.tubular);
    s.mesh.visible = rings > 0;
    s.mesh.geometry.setDrawRange(0, rings * s.radial * 6);
  }
  const ag = agletPoses(lacing, p, R);
  for (const [sd, a] of Object.entries(lacing.aglets)) {
    const pose = ag[sd];
    a.mesh.visible = !!pose;
    if (pose) { a.mesh.position.copy(pose.pos); a.mesh.quaternion.copy(pose.quat); }
  }
  return R;
}

// где наконечники: на переднем крае последнего проявляющегося отрезка своего конца
export function agletPoses(lacing, p, R = laceReveal(p)) {
  const out = {};
  for (const [sd, chain] of Object.entries(CHAINS)) {
    const a = lacing.aglets[sd];
    if (!a) continue;
    if (p >= 0.999) { out[sd] = { pos: a.pos.clone(), quat: a.quat.clone() }; continue; }
    let pose = null;
    for (const name of chain) {
      const s = lacing.seg[name], f = R[name] ?? 0;
      if (!s || f <= 0) break;
      const i = Math.max(1, Math.round(f * s.tubular));
      _t.copy(s.rings[i]).sub(s.rings[i - 1]).normalize();
      pose = { pos: s.rings[i].clone(), quat: new THREE.Quaternion().setFromUnitVectors(Y, _t) };
      if (f < 1) break;
    }
    out[sd] = pose;
  }
  return out;
}
