// Карта мира v7 сверху: плиты, друзы, траектория полёта, камеры планов, шары — и проверка
// зазоров (кроссовок и камера не должны проходить сквозь камень и кристаллы).
// node tools/map7.mjs [out/v7/map.png]
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import * as THREE from 'three';
import { buildCaveGeometry, SLABS, COLD, WARM } from '../js/cave.js';
import { evaluate7, shoePose, ORBS7, SHOTS7, DURATION7 } from '../js/timeline7.js';

const out = path.resolve(process.argv[2] || 'out/v7/map.png');
const G = buildCaveGeometry();
const X0 = -56, X1 = 36, Z0 = -46, Z1 = 30, SC = 14, W = (X1 - X0) * SC, H = (Z1 - Z0) * SC;
const px = (x) => ((x - X0) * SC).toFixed(1), pz = (z) => ((z - Z0) * SC).toFixed(1);
const svg = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#0e1a24"/>`];
// сетка через 5 единиц (полметра)
for (let x = Math.ceil(X0 / 5) * 5; x <= X1; x += 5) svg.push(`<line x1="${px(x)}" y1="0" x2="${px(x)}" y2="${H}" stroke="${x === 0 ? '#2d4a5c' : '#16262f'}" stroke-width="1"/>`);
for (let z = Math.ceil(Z0 / 5) * 5; z <= Z1; z += 5) svg.push(`<line x1="0" y1="${pz(z)}" x2="${W}" y2="${pz(z)}" stroke="${z === 0 ? '#2d4a5c' : '#16262f'}" stroke-width="1"/>`);

// выпуклая оболочка точек (монотонная цепочка)
function hull(pts) {
  pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of pts.reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
// все вершины мира (для зазоров): камень и кристаллы
const rockPts = [], crystalPts = [];
const v = new THREE.Vector3();
G.slabs.forEach((s, i) => {
  const P = s.geo.attributes.position, xz = [];
  let ymax = -1e9;
  for (let k = 0; k < P.count; k++) { v.fromBufferAttribute(P, k).applyMatrix4(s.matrix); if (v.y > -0.2) { xz.push([v.x, v.z]); rockPts.push([v.x, v.y, v.z]); } ymax = Math.max(ymax, v.y); }
  const h = hull(xz), shade = Math.round(40 + Math.min(1, ymax / 14) * 90);
  svg.push(`<polygon points="${h.map((p) => `${px(p[0])},${pz(p[1])}`).join(' ')}" fill="rgb(${shade},${shade + 6},${shade + 14})" stroke="#9fb3c4" stroke-width="1" fill-opacity="0.85"/>`);
  const c = h.reduce((a, p) => [a[0] + p[0] / h.length, a[1] + p[1] / h.length], [0, 0]);
  svg.push(`<text x="${px(c[0])}" y="${pz(c[1])}" fill="#fff" font-size="13" font-family="sans-serif" text-anchor="middle">${i}·${ymax.toFixed(1)}</text>`);
});
for (const [geo, out2] of [[G.cold, crystalPts], [G.warm, crystalPts], [G.rubble, rockPts]]) {
  const P = geo.attributes.position;
  for (let k = 0; k < P.count; k += 3) out2.push([P.getX(k), P.getY(k), P.getZ(k)]);
}
for (const c of COLD) svg.push(`<circle cx="${px(c[0])}" cy="${pz(c[2])}" r="${(c[5] * SC * 0.45).toFixed(1)}" fill="#bfe0ff" fill-opacity="0.35" stroke="#dff" stroke-width="1"/>`);
for (const c of WARM) svg.push(`<circle cx="${px(c[0])}" cy="${pz(c[2])}" r="${(c[5] * SC * 0.45).toFixed(1)}" fill="#ff6a2a" fill-opacity="0.5"/>`);
// кроссовок на острове
svg.push(`<rect x="${px(-1.45)}" y="${pz(-0.45)}" width="${(2.92 * SC).toFixed(1)}" height="${(0.9 * SC).toFixed(1)}" fill="#fff" fill-opacity="0.8"/>`);

// траектория полёта
const fly = [];
for (let t = 2.2; t <= 9.0001; t += 0.05) fly.push([t, shoePose(t).pos]);
svg.push(`<polyline points="${fly.map(([, p]) => `${px(p[0])},${pz(p[2])}`).join(' ')}" fill="none" stroke="#ffd34a" stroke-width="3"/>`);
for (const [t, p] of fly) if (Math.abs(t * 2 - Math.round(t * 2)) < 0.01) svg.push(`<circle cx="${px(p[0])}" cy="${pz(p[2])}" r="5" fill="#ffd34a"/><text x="${+px(p[0]) + 7}" y="${+pz(p[2]) - 7}" fill="#ffd34a" font-size="14" font-family="sans-serif">${t.toFixed(1)} y${p[1].toFixed(1)}</text>`);

// камеры: путь каждого плана и куда смотрит (начало, середина, конец)
const names = Object.entries(SHOTS7).sort((a, b) => a[1] - b[1]);
const colors = ['#7cf', '#f7c', '#9f9', '#fc6', '#c9f', '#6fc', '#f96', '#9cf', '#fff'];
names.forEach(([name, a], i) => {
  const b = i + 1 < names.length ? names[i + 1][1] : DURATION7, col = colors[i % colors.length];
  const pts = [];
  for (let t = a; t < b - 1e-6; t += 0.05) pts.push(evaluate7(t).cam);
  svg.push(`<polyline points="${pts.map((c) => `${px(c.pos[0])},${pz(c.pos[2])}`).join(' ')}" fill="none" stroke="${col}" stroke-width="2.5"/>`);
  for (const c of [pts[0], pts[pts.length >> 1], pts[pts.length - 1]]) {
    const d = [c.target[0] - c.pos[0], c.target[2] - c.pos[2]], l = Math.hypot(...d) || 1;
    svg.push(`<line x1="${px(c.pos[0])}" y1="${pz(c.pos[2])}" x2="${px(c.pos[0] + d[0] / l * 3)}" y2="${pz(c.pos[2] + d[1] / l * 3)}" stroke="${col}" stroke-width="1.5" stroke-dasharray="4 3"/>`);
  }
  svg.push(`<text x="${+px(pts[0].pos[0]) + 6}" y="${+pz(pts[0].pos[2]) + 16}" fill="${col}" font-size="14" font-family="sans-serif">${name} y${pts[0].pos[1].toFixed(1)}</text>`);
});
// шары: где всплывают и где зависают
for (const [ex, ez, hx, , hz] of ORBS7) svg.push(`<line x1="${px(ex)}" y1="${pz(ez)}" x2="${px(hx)}" y2="${pz(hz)}" stroke="#ff8a3a" stroke-width="1"/><circle cx="${px(ex)}" cy="${pz(ez)}" r="4" fill="none" stroke="#ff8a3a"/><circle cx="${px(hx)}" cy="${pz(hz)}" r="4" fill="#ff8a3a"/>`);
svg.push('</svg>');
fs.mkdirSync(path.dirname(out), { recursive: true });
const svgPath = out.replace(/\.png$/, '.svg');
fs.writeFileSync(svgPath, svg.join('\n'));
execFileSync('node', ['-e', `const { chromium } = require('playwright'); (async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: ${W}, height: ${H} } }); await p.goto('file://${svgPath}'); await p.screenshot({ path: '${out}' }); await b.close(); })();`], { cwd: path.resolve('.') });
console.log('карта: ' + out);

// ---- зазоры: кроссовок (вписан в шар радиусом ~1,5 вокруг середины) и камера
const near = (p, pts) => { let d = 1e9; for (const q of pts) { const e = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2; if (e < d) d = e; } return Math.sqrt(d); };
const warn = [];
for (let t = 2.2; t < 8.9; t += 0.05) {
  const p = shoePose(t).pos, c = [p[0], p[1] + 0.5, p[2]];
  const dr = near(c, rockPts), dc = near(c, crystalPts);
  if (dr < 1.7 || dc < 1.6) warn.push(`кроссовок t=${t.toFixed(2)}: до камня ${dr.toFixed(2)}, до кристалла ${dc.toFixed(2)}`);
}
for (let t = 0; t < DURATION7; t += 0.1) {
  const c = evaluate7(t).cam.pos, dr = near(c, rockPts), dc = near(c, crystalPts);
  if (c[1] < 0.15 || dr < 0.5 || dc < 0.4) warn.push(`камера t=${t.toFixed(1)} (${evaluate7(t).shot}): y=${c[1].toFixed(2)}, до камня ${dr.toFixed(2)}, до кристалла ${dc.toFixed(2)}`);
}
console.log(warn.length ? warn.join('\n') : 'зазоры в порядке');
