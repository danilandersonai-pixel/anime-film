// export6.js — мост v6 «Анатомия» в Blender Cycles: кроссовок, разобранный на детали
// (GLB: у каждой детали своя группа, у каждого отрезка шнурка — свой меш), и покадровое
// состояние монтажа (frames6.json): камера, кроссовок, детали, шнуровка, наконечники,
// свет студии, точки подписей на экране, карточка и затемнение.
import * as THREE from 'three';
import { buildShoe, shoeTransform } from './shoe.js';
import { scans } from './textures.js';
import { evaluate6, DURATION6, setRig6 } from './timeline6.js';
import { splitParts, placePart, laceReveal, agletPoses, partAnchor, PARTS } from './anatomy.js';
import { bakeInstances, exportGLB, b64 } from './export5.js';

export async function exportAnatomy({ glb = true } = {}) {
  let jersey = null; try { jersey = await scans(); } catch (e) { /* без скана */ }
  const shoe = buildShoe({ jersey });
  for (const [k, m] of Object.entries(shoe.materials)) if (m) m.name = k;
  setRig6(shoe.macro);
  const { parts, lacing } = splitParts(shoe);
  const anchors = Object.fromEntries(PARTS.map((d) => [d.key, new THREE.Vector3(...partAnchor(parts[d.key], d))]));
  shoe.root.name = 'shoe';
  const out = { glb: {}, frames: [], meta: {} };
  if (glb) {
    // капли спрятаны (сухая студия) — onlyVisible их не выгрузит; экземпляры — в обычные меши
    bakeInstances(shoe.root);
    shoe.root.updateMatrixWorld(true);
    out.glb.parts = b64(await exportGLB(shoe.root));
  }
  const fps = 24, n = Math.round(DURATION6 * fps), cam = new THREE.PerspectiveCamera(30, 16 / 9, 0.05, 400);
  const mtx = (o) => { o.updateMatrixWorld(true); return o.matrixWorld.toArray().map((v) => +v.toFixed(6)); };
  const v = new THREE.Vector3();
  const toScreen = (p) => { v.copy(p).project(cam); return [+((v.x + 1) / 2 * 1920).toFixed(1), +((1 - v.y) / 2 * 1080).toFixed(1), v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1]; };
  for (let f = 0; f <= n; f++) {
    const t = f / fps, S = evaluate6(t);
    shoeTransform(S.shoe, shoe.root.position, shoe.root.quaternion);
    for (const d of PARTS) placePart(parts[d.key], d, S.parts[d.key], t);
    parts.laces.position.y += 5 * S.laces.away * S.laces.away;
    shoe.root.updateMatrixWorld(true);
    cam.position.set(...S.cam.pos); cam.up.set(0, 1, 0); cam.lookAt(...S.cam.target); cam.rotateZ(S.cam.roll);
    cam.fov = S.cam.fov; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    // шнуровка: доли отрезков (шнурки улетели — всё прозрачно) и наконечники в мире
    const gone = S.laces.away >= 0.98;
    const R = laceReveal(gone ? 0 : S.laces.p), ag = gone ? {} : agletPoses(lacing, S.laces.p, R);
    const aglets = {};
    for (const sd of Object.keys(lacing.aglets)) {
      const pose = ag[sd];
      if (!pose) { aglets[sd] = null; continue; }
      const m = new THREE.Matrix4().compose(pose.pos, pose.quat, new THREE.Vector3(1, 1, 1)).premultiply(parts.laces.matrixWorld);
      aglets[sd] = m.toArray().map((x) => +x.toFixed(6));
    }
    const reveal = Object.fromEntries(Object.keys(lacing.seg).map((k) => [k, +(gone ? 0 : (R[k] ?? 1)).toFixed(4)]));
    // подписи: точки деталей на экране (та же раскладка, что в плеере)
    let labels = null;
    if (S.labels > 0.001) {
      labels = { amount: +S.labels.toFixed(4), cx: toScreen(new THREE.Vector3(0, 1.05, 0).applyMatrix4(shoe.root.matrixWorld))[0], pts: {} };
      for (const d of PARTS) labels.pts[d.key] = toScreen(anchors[d.key].clone().applyMatrix4(parts[d.key].matrixWorld));
    }
    out.frames.push({
      t: +t.toFixed(4), shot: S.shot,
      cam: { m: mtx(cam), fov: S.cam.fov, focus: +S.cam.focus.toFixed(4), fstop: S.cam.fstop },
      parts: Object.fromEntries(PARTS.map((d) => [d.key, mtx(parts[d.key])])),
      reveal, aglets, light: S.light, labels, card: +S.card.toFixed(4), fade: +S.fade.toFixed(4),
    });
  }
  out.meta = { fps, frames: n + 1, duration: DURATION6, parts: PARTS.map((d) => d.key), segments: Object.keys(lacing.seg) };
  return out;
}
