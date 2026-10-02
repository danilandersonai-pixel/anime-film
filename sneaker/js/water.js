// water.js — вода в движении: всплеск при ударе пяткой в лужу и капли,
// которые срываются с подошвы, когда кроссовок взлетает. Всё — по честной
// баллистике (g = 9,8 м/с²) во «времени действия», которое в рапиде идёт медленнее.
import * as THREE from 'three';
import { rng } from './textures.js';
import { shoeTransform, last, soleBottom, top } from './shoe.js';

const G = 98; // 9,8 м/с² в единицах сцены (1 = 10 см)

export function createWater(scene, dropMat, evaluate) {
  const geo = new THREE.SphereGeometry(1, 12, 8);
  // летящая вода видна по бликам: блестящая, полупрозрачная, ярко отражает огни
  void dropMat;
  dropMat = new THREE.MeshPhysicalMaterial({ color: '#45557a', emissive: '#1a2232', metalness: 0, roughness: 0.03, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, envMapIntensity: 3, clearcoat: 1, clearcoatRoughness: 0.02, specularIntensity: 1 });
  const r = rng(321);

  // всплеск: капли разлетаются от пятки, больше — назад и в стороны
  const NS = 260, splash = new THREE.InstancedMesh(geo, dropMat, NS);
  const SP = [];
  for (let i = 0; i < NS; i++) {
    const a = Math.PI + (r() - 0.5) * Math.PI * 1.7;          // в основном назад от носка
    const crown = r() < 0.6;                                    // «корона» — низко, широко, по кругу вокруг пятки
    SP.push({ a, vh: crown ? 6 + r() * 7 : 2 + r() * 6, vv: crown ? 3 + r() * 5 : 6 + r() * 11, rad: 0.005 + 0.02 * Math.pow(r(), 2.4), d0: r() * 0.015, off: crown ? 0.18 + r() * 0.2 : 0.04 + r() * 0.12 });
  }
  splash.frustumCulled = false; splash.castShadow = false;
  scene.add(splash);

  // капли с подошвы: висят на кромке, растут и срываются
  const ND = 34, drips = new THREE.InstancedMesh(geo, dropMat, ND);
  const DP = [];
  for (let i = 0; i < ND; i++) {
    const u = 0.05 + 0.9 * r(), L = last(u, 0.03), side = r() < 0.5 ? 1 : -1;
    DP.push({ local: new THREE.Vector3(L.x, soleBottom(u) - 0.01 + r() * 0.04, side > 0 ? L.lat : L.med), tRel: 14.25 + r() * 1.5, rad: 0.006 + 0.01 * r() });
  }
  drips.frustumCulled = false;
  scene.add(drips);

  const dm = new THREE.Object3D(), Y = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), P = new THREE.Vector3(), Q = new THREE.Quaternion();
  const hide = (mesh, i) => { dm.position.set(0, -10, 0); dm.scale.setScalar(0); dm.updateMatrix(); mesh.setMatrixAt(i, dm.matrix); };
  let impactAt = null; // точка удара пятки — одна на весь ролик

  function update(S) {
    // ---- всплеск
    const sg = S.splash;
    if (sg >= 0) {
      if (!impactAt) {
        const S0 = evaluate(S.impactT);
        const { pos, quat } = shoeTransform(S0.shoe, P, Q);
        impactAt = new THREE.Vector3(-1.25, 0.02, 0).applyQuaternion(quat).add(pos); impactAt.y = 0.01;
      }
      SP.forEach((p, i) => {
        const s = sg - p.d0;
        if (s <= 0) return hide(splash, i);
        const ca = Math.cos(p.a), sa = Math.sin(p.a);
        const y = p.vv * s - 0.5 * G * s * s;
        if (y < -0.005) return hide(splash, i);
        dm.position.set(impactAt.x + ca * (p.off + p.vh * s), 0.01 + y, impactAt.z + sa * (p.off + p.vh * s) * 1.2);
        v.set(ca * p.vh, p.vv - G * s, sa * p.vh);
        const sp = v.length();
        dm.quaternion.setFromUnitVectors(Y, v.normalize());
        dm.scale.set(p.rad, p.rad * (1 + sp * 0.012), p.rad);
        dm.updateMatrix(); splash.setMatrixAt(i, dm.matrix);
      });
      splash.visible = true;
    } else splash.visible = false;
    splash.instanceMatrix.needsUpdate = true;

    // ---- капли с подошвы (только в плане «переворот»)
    if (S.drip) {
      const { pos, quat } = shoeTransform(S.shoe, P.clone(), Q.clone());
      DP.forEach((d, i) => {
        if (S.t < d.tRel) { // висит и набухает
          const grow = Math.min(1, (S.t - 14.0) / Math.max(0.05, d.tRel - 14.0));
          dm.position.copy(d.local).applyQuaternion(quat).add(pos);
          dm.quaternion.identity(); const rr = d.rad * (0.3 + 0.7 * grow);
          dm.scale.set(rr, rr * 1.2, rr);
        } else {           // падает (рапид: время действия ×0,35)
          const S1 = evaluate(d.tRel), T1 = shoeTransform(S1.shoe);
          const p0 = d.local.clone().applyQuaternion(T1.quat).add(T1.pos);
          const s = (S.t - d.tRel) * 0.35;
          const y = p0.y - 0.5 * G * s * s;
          if (y < 0) return hide(drips, i);
          dm.position.set(p0.x, y, p0.z);
          dm.quaternion.identity(); dm.scale.set(d.rad * 0.9, d.rad * (1.1 + G * s * 0.05), d.rad * 0.9);
        }
        dm.updateMatrix(); drips.setMatrixAt(i, dm.matrix);
      });
      drips.visible = true;
    } else drips.visible = false;
    drips.instanceMatrix.needsUpdate = true;
  }
  void top;
  return { splash, drips, update };
}
