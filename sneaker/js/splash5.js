// splash5.js — корона брызг от ударов подошвы о лужу (v5). Капли летят по баллистике
// (g = 9,8 м/с²) во «времени физики» — в рапиде медленно. Общие для плеера three.js
// (water5.js) и Blender Cycles (export5.js): в обоих рендерах — одни и те же капли.
import { rng } from './textures.js';
import { IMPACTS } from './timeline5.js';

const G = 98;
const SPL = (() => {
  const r = rng(321), out = [];
  for (const [n, imp] of [[380, IMPACTS[0]], [200, IMPACTS[1]]]) {
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, crown = r() < 0.6;
      out.push({ imp, a, vh: (crown ? 6 + r() * 7 : 2 + r() * 6) * imp.power, vv: (crown ? 3 + r() * 5 : 6 + r() * 11) * imp.power, rad: 0.009 + 0.032 * Math.pow(r(), 2.2), d0: r() * 0.015, off: crown ? 0.18 + r() * 0.25 : 0.04 + r() * 0.15 });
    }
  }
  return out;
})();
export const SPLASH_MAX = SPL.length;

// капли в момент s (секунды физики): [x, y, z, радиус, vx, vy, vz]
export function splashAt(s) {
  const P = [];
  for (const p of SPL) {
    const sg = s - p.imp.s - p.d0;
    if (sg <= 0) continue;
    const y = p.vv * sg - 0.5 * G * sg * sg;
    if (y < -0.005) continue;
    const ca = Math.cos(p.a), sa = Math.sin(p.a);
    const v = [ca * p.vh, p.vv - G * sg, sa * p.vh];
    P.push([p.imp.x + ca * (p.off + p.vh * sg), 0.01 + y, p.imp.z + sa * (p.off + p.vh * sg) * 1.2, p.rad, ...v]);
  }
  return P;
}
