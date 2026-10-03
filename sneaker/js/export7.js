// export7.js — мост v7 «Кристаллы» в Blender Cycles: кроссовок (GLB, расцветка Lunar, сухой),
// мир (GLB: плиты — каждая своим мешем со своей матрицей, обломки, холодные и тёплые кристаллы
// с атрибутом tipk — доля высоты кристалла, для свечения к острию) и покадровое состояние
// (frames7.json): камера и объектив, кроссовок, свет, шары, круги на воде, капля, затемнение.
import * as THREE from 'three';
import { buildShoe, shoeTransform } from './shoe.js';
import { scans } from './textures.js';
import { evaluate7, DURATION7, UPPER_GAIN } from './timeline7.js';
import { buildCaveGeometry } from './cave.js';
import { bakeInstances, exportGLB, b64 } from './export5.js';

export async function exportCrystals({ glb = true } = {}) {
  let jersey = null; try { jersey = await scans(); } catch (e) { /* без скана */ }
  const shoe = buildShoe({ jersey });
  shoe.setColorway('lunar');
  for (const [k, m] of Object.entries(shoe.materials)) if (m) m.name = k;
  shoe.root.traverse((o) => { if (o.name === 'drops' || o.name === 'foamDrops') o.visible = false; });
  shoe.root.name = 'shoe';
  const out = { glb: {}, frames: [], meta: {} };
  if (glb) {
    bakeInstances(shoe.root);
    shoe.root.updateMatrixWorld(true);
    out.glb.shoe = b64(await exportGLB(shoe.root));   // яркость верха (UPPER_GAIN) — в render7.py
    const G = buildCaveGeometry(), cave = new THREE.Group(); cave.name = 'cave';
    const mat = (name) => new THREE.MeshStandardMaterial({ name });
    const M = { rock: mat('rock'), island: mat('island'), cold: mat('crystal_cold'), warm: mat('crystal_warm') };
    G.slabs.forEach((s, i) => {
      const m = new THREE.Mesh(s.geo, s.island ? M.island : M.rock);
      m.name = (s.island ? 'island' : 'rock') + i;
      s.matrix.decompose(m.position, m.quaternion, m.scale);
      cave.add(m);
    });
    const rub = new THREE.Mesh(G.rubble, M.rock); rub.name = 'rubble'; cave.add(rub);
    const cold = new THREE.Mesh(G.cold, M.cold); cold.name = 'crystals_cold'; cave.add(cold);
    const warm = new THREE.Mesh(G.warm, M.warm); warm.name = 'crystals_warm'; cave.add(warm);
    cave.updateMatrixWorld(true);
    out.glb.cave = b64(await exportGLB(cave));
  }
  // покадровое состояние; фокус «по лучу из центра кадра» (af) — как автофокус плеера
  const fps = 24, n = Math.round(DURATION7 * fps), cam = new THREE.PerspectiveCamera(26, 16 / 9, 0.05, 400);
  const mtx = (o) => { o.updateMatrixWorld(true); return o.matrixWorld.toArray().map((v) => +v.toFixed(6)); };
  const ray = new THREE.Raycaster(), targets = [];
  shoe.root.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && o.visible) targets.push(o); });
  const r4 = (a) => a.map((x) => +(+x).toFixed(4));
  for (let f = 0; f <= n; f++) {
    const t = f / fps, S = evaluate7(t);
    shoeTransform(S.shoe, shoe.root.position, shoe.root.quaternion);
    shoe.root.updateMatrixWorld(true);
    cam.position.set(...S.cam.pos); cam.up.set(0, 1, 0); cam.lookAt(...S.cam.target); cam.rotateZ(S.cam.roll);
    cam.fov = S.cam.fov; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    let focus = S.cam.focus;
    if (S.cam.af) { ray.setFromCamera(new THREE.Vector2(0, 0), cam); const hit = ray.intersectObjects(targets, false)[0]; if (hit) focus = hit.distance * S.cam.af; }
    const L = S.light;
    out.frames.push({
      t: +t.toFixed(4), shot: S.shot,
      cam: { m: mtx(cam), fov: S.cam.fov, focus: +focus.toFixed(4), fstop: S.cam.fstop },
      shoe: mtx(shoe.root),
      light: { ...L, keyAt: r4(L.keyAt), sweep: L.sweep ? { ...L.sweep, pos: r4(L.sweep.pos), look: r4(L.sweep.look) } : null },
      orbs: S.orbs.map(r4), rings: S.rings.map(r4), drop: S.drop ? r4(S.drop) : null,
      logo: +S.logo.toFixed(4), fade: +S.fade.toFixed(4),
    });
  }
  out.meta = { fps, frames: n + 1, duration: DURATION7, upperGain: UPPER_GAIN };
  return out;
}
