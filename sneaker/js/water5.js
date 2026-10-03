// water5.js — вода в движении для плеера v5: корона брызг от ударов подошвы (splash5.js)
// и капли с края подошвы (drips5.js) — те же, что в Blender Cycles. Капля — шаровая линза
// (watermat.js): в каждой видно перевёрнутый ночной город.
// Кольца на воде собираются в список для шейдера асфальта (street.js, до 8 колец).
import * as THREE from 'three';
import { createWaterMaterial } from './watermat.js';
import { splashAt, SPLASH_MAX } from './splash5.js';
import { dripsAt, DRIPS } from './drips5.js';
import { IMPACTS } from './timeline5.js';

export function createWater5(scene) {
  const geo = new THREE.SphereGeometry(1, 16, 10);
  const mat = createWaterMaterial();
  const splash = new THREE.InstancedMesh(geo, mat, SPLASH_MAX);
  const drips = new THREE.InstancedMesh(geo, mat, DRIPS.length);
  for (const m of [splash, drips]) { m.frustumCulled = false; m.castShadow = false; m.count = 0; scene.add(m); }

  const dm = new THREE.Object3D(), Y = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3();
  // капля вытянута вдоль скорости — так её «видит» затвор камеры
  function place(mesh, list) {
    list.forEach((p, i) => {
      dm.position.set(p[0], p[1], p[2]);
      v.set(p[4], p[5], p[6]);
      const sp = v.length();
      if (sp > 1e-3) dm.quaternion.setFromUnitVectors(Y, v.multiplyScalar(1 / sp)); else dm.quaternion.identity();
      dm.scale.set(p[3], p[3] * (1 + Math.min(1.5, sp * 0.012)), p[3]);
      dm.updateMatrix(); mesh.setMatrixAt(i, dm.matrix);
    });
    mesh.count = list.length;
    mesh.instanceMatrix.needsUpdate = true;
  }

  // S — состояние кадра evaluate5(t); возвращает кольца [x, z, возраст, сила]
  function update(S) {
    place(splash, S.drop.active ? splashAt(S.drop.s) : []);
    const d = dripsAt(S.t, S);
    place(drips, d.drops);
    const rings = [];
    if (S.drop.active) for (const i of IMPACTS) if (S.drop.s > i.s) rings.push([i.x, i.z, S.drop.s - i.s, i.power]);
    for (const r of d.rings) rings.push([r[0], r[1], r[2], 0.25]);
    return rings;
  }
  return { splash, drips, material: mat, update };
}
