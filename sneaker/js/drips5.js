// drips5.js — капли с края подошвы в плане drip (15–17 с): висят, набухают и срываются
// с настоящим g. Общие для картинки (export5.js) и звука (audio5.js): каждый «плюх»
// в луже звучит ровно тогда, когда на воде появляется кольцо.
import * as THREE from 'three';
import { shoeTransform, last, soleBottom } from './shoe.js';
import { rng } from './textures.js';

const G = 98;
export const DRIPS = (() => {
  const r = rng(77), out = [];
  for (let i = 0; i < 22; i++) {
    const u = 0.45 + 0.5 * r(), L = last(u, 0.03);
    out.push({ local: [L.x, soleBottom(u) + 0.03 + r() * 0.1, L.lat + 0.005], t0: 15 + r() * 2, grow: 0.6 + r() * 0.8, rad: 0.008 + 0.008 * r() });
  }
  return out;
})();

// капли и кольца в момент t (S — состояние кадра из evaluate5)
export function dripsAt(t, S) {
  if (!S.drip) return { drops: [], rings: [] };
  const { pos, quat } = shoeTransform(S.shoe);
  const drops = [], rings = [];
  for (const d of DRIPS) {
    let tt = t - d.t0; if (tt < 0) tt += 2;          // каждая капля повторяется раз в 2 с
    const p0 = new THREE.Vector3(...d.local).applyQuaternion(quat).add(pos);
    if (tt < d.grow) { const k = tt / d.grow; drops.push([p0.x, p0.y - d.rad * k, p0.z, d.rad * (0.35 + 0.65 * k), 0, -1, 0]); continue; }
    const s = tt - d.grow, y = p0.y - 0.5 * G * s * s;
    if (y > 0) drops.push([p0.x, y, p0.z, d.rad * 0.9, 0, -G * s, 0]);
    else { const tl = d.grow + Math.sqrt(2 * p0.y / G); rings.push([p0.x, p0.z, tt - tl]); }
  }
  return { drops, rings };
}

// моменты падения капель в лужу на отрезке [a, b] (кроссовок неподвижен — поза shoe)
export function dripLandings(shoe, a = 15, b = 17) {
  const { pos, quat } = shoeTransform(shoe), out = [];
  for (const d of DRIPS) {
    const p0 = new THREE.Vector3(...d.local).applyQuaternion(quat).add(pos);
    const land = d.t0 + d.grow + Math.sqrt(2 * p0.y / G);
    for (const t of [land - 2, land]) if (t >= a && t < b) out.push({ t, x: p0.x, z: p0.z, rad: d.rad });
  }
  return out.sort((p, q) => p.t - q.t);
}
