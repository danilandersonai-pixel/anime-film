// export5.js — мост в Blender Cycles: геометрия трёх кроссовков (GLB) и покадровое
// состояние монтажа v5 (камера, кроссовок, свет, брызги, капли) в JSON.
// Координаты — как в three.js (Y вверх); перевод в Blender (Z вверх) — в cycles/build_scene.py.
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildShoe, shoeTransform, top } from './shoe.js';
import { scans, rng } from './textures.js';
import { evaluate5, setRig5, DURATION5, IMPACTS, REST, SIM } from './timeline5.js';
import { makeDebris } from './street.js';
import { dripsAt } from './drips5.js';

const G = 98;

// InstancedMesh → обычная геометрия (у Blender своя система экземпляров, проще запечь)
function bakeInstances(root) {
  const list = [];
  root.traverse((o) => { if (o.isInstancedMesh) list.push(o); });
  for (const im of list) {
    const geos = [], m = new THREE.Matrix4();
    const base = im.geometry.index ? im.geometry.toNonIndexed() : im.geometry.clone();
    for (const k of Object.keys(base.attributes)) if (!['position', 'normal', 'uv'].includes(k)) base.deleteAttribute(k);
    if (!base.attributes.uv) base.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(base.attributes.position.count * 2), 2));
    if (!base.attributes.normal) base.computeVertexNormals();
    for (let i = 0; i < im.count; i++) { im.getMatrixAt(i, m); if (Math.abs(m.determinant()) < 1e-14) continue; geos.push(base.clone().applyMatrix4(m)); }
    const mesh = new THREE.Mesh(mergeGeometries(geos), im.material);
    mesh.name = im.name; mesh.position.copy(im.position); mesh.quaternion.copy(im.quaternion); mesh.scale.copy(im.scale);
    im.parent.add(mesh); im.parent.remove(im);
  }
}

function exportGLB(obj) {
  return new Promise((res, rej) => new GLTFExporter().parse(obj, (buf) => res(buf), rej, { binary: true, onlyVisible: true, maxTextureSize: 2048 }));
}
const b64 = (buf) => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };

// ---- брызги: корона капель по баллистике (как в water.js), от каждого удара
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
function splashAt(s) {
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
export async function exportAll() {
  let jersey = null; try { jersey = await scans(); } catch (e) { /* без скана */ }
  const out = { glb: {}, frames: [], meta: {} };
  const shoes = {};
  for (const cw of ['ember', 'glacier', 'volt']) {
    const shoe = buildShoe({ jersey });
    shoe.setColorway(cw);
    for (const [k, m] of Object.entries(shoe.materials)) if (m) m.name = k;
    bakeInstances(shoe.root);
    shoe.root.name = 'shoe_' + cw;
    for (const [k, g] of Object.entries(shoe.groups)) g.name = cw + '_' + k;
    shoe.root.updateMatrixWorld(true);
    out.glb[cw] = b64(await exportGLB(shoe.root));
    shoes[cw] = shoe;
    if (cw === 'ember') setRig5(shoe.macro);
  }
  // камешки и листья на асфальте
  const debris = makeDebris(); debris.name = 'debris';
  bakeInstances(debris); debris.updateMatrixWorld(true);
  out.glb.debris = b64(await exportGLB(debris));
  // покадровое состояние
  const fps = 24, n = Math.round(DURATION5 * fps), cam = new THREE.PerspectiveCamera(28, 16 / 9, 0.05, 400);
  const hero = shoes.ember;
  const mtx = (o) => { o.updateMatrixWorld(true); return o.matrixWorld.toArray().map((v) => +v.toFixed(6)); };
  for (let f = 0; f <= n; f++) {
    const t = f / fps, S = evaluate5(t);
    // кроссовок и его части (сжатие пены при ударе)
    shoeTransform(S.shoe, hero.root.position, hero.root.quaternion);
    const G0 = hero.groups;
    G0.upper.position.set(0, -S.shoe.squash * 0.4, 0);
    for (const k of ['foamTop', 'foamBottom', 'plate']) G0[k].scale.y = 1 - S.shoe.squash;
    // камера
    cam.position.set(...S.cam.pos); cam.up.set(0, 1, 0); cam.lookAt(...S.cam.target); cam.rotateZ(S.cam.roll); cam.fov = S.cam.fov; cam.updateProjectionMatrix();
    const d = dripsAt(t, S);
    out.frames.push({
      t: +t.toFixed(4), shot: S.shot,
      cam: { m: mtx(cam), fov: S.cam.fov, focus: +S.cam.focus.toFixed(4), fstop: S.cam.fstop, af: S.cam.af || 0 },
      shoe: mtx(hero.root), groups: Object.fromEntries(Object.entries(G0).map(([k, g]) => [k, mtx(g)])),
      lineup: S.lineup, light: S.light, car: S.street.car, rainT: +S.street.rainT.toFixed(4), rain: S.street.rain,
      splash: S.drop.active ? splashAt(S.drop.s).map((a) => a.map((v) => +v.toFixed(4))) : [],
      drops: d.drops.map((a) => a.map((v) => +v.toFixed(4))),
      rings: [...(S.drop.active ? IMPACTS.filter((i) => S.drop.s > i.s).map((i) => [i.x, i.z, +(S.drop.s - i.s).toFixed(4), i.power]) : []), ...d.rings.map((r) => [r[0], r[1], +r[2].toFixed(4), 0.25])],
      card: S.card, fade: S.fade,
    });
  }
  out.meta = { fps, frames: n + 1, duration: DURATION5, rest: REST, impacts: IMPACTS, simHits: SIM.hits.slice(0, 4) };
  void top;
  return out;
}
