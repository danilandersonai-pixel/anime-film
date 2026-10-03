// film6.js — ролик v6 «Анатомия»: тёмная студия, свет бежит по поверхности, кроссовок
// вращается, раскладывается на одиннадцать деталей с подписями и шнуруется на глазах.
// Здесь — всё, что относится только к этому ролику; плеер, камера и оптика — в main.js.
import * as THREE from 'three';
import { shoeTransform } from './shoe.js';
import { evaluate6, DURATION6, setRig6, CARD6 } from './timeline6.js';
import { splitParts, placePart, applyLacing, partAnchor, PARTS } from './anatomy.js';
import { createCard } from './card5.js';
import { createLabels } from './labels6.js';
import { renderTrack6 } from './audio6.js';

const PROBE = [[-1.4, 0.85, 0], [1.45, 0.3, 0], [0.3, 0.75, 0], [0, 0.5, 0.45], [0, 0.5, -0.45]];

export async function createFilm6({ stage, hero, layers, camera }) {
  setRig6(hero.macro);
  const { parts, lacing } = splitParts(hero);
  const card = createCard(layers.card, '#ff5a1f', { at: CARD6 });
  const labels = createLabels(layers.labels, PARTS);
  const anchors = Object.fromEntries(PARTS.map((d) => [d.key, new THREE.Vector3(...partAnchor(parts[d.key], d))]));
  const centers = Object.fromEntries(PARTS.map((d) => [d.key, parts[d.key].userData.center]));

  function apply(S) {
    shoeTransform(S.shoe, hero.root.position, hero.root.quaternion);
    for (const d of PARTS) placePart(parts[d.key], d, S.parts[d.key], S.t);
    // шнурки улетают вверх при сборке и возвращаются шнуровкой
    parts.laces.position.y += 5 * S.laces.away * S.laces.away;
    parts.laces.visible = S.laces.away < 0.98;
    applyLacing(lacing, S.laces.p);
    hero.root.updateMatrixWorld(true);
    stage.setLights(S.light);
  }

  // подписи: где на экране точка каждой детали и центр «разреза»
  const v = new THREE.Vector3();
  const toScreen = (p) => { v.copy(p).project(camera); return [(v.x + 1) / 2 * 1920, (1 - v.y) / 2 * 1080, v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1]; };
  function overlay(t, S) {
    card.update(t);
    if (S.labels <= 0.001) { labels.update(t, 0, {}); return; }
    const pts = {};
    for (const d of PARTS) pts[d.key] = toScreen(anchors[d.key].clone().applyMatrix4(parts[d.key].matrixWorld));
    const c = toScreen(new THREE.Vector3(0, 1.05, 0).applyMatrix4(hero.root.matrixWorld)); // середина разреза по высоте
    labels.update(t, S.labels, pts, c[0]);
  }

  return {
    key: 'anatomy', duration: DURATION6, cover: 28.6,
    evaluate: evaluate6, apply, overlay,
    prepare: () => {},
    track: () => renderTrack6(48000),
    // смаз: следим и за кроссовком, и за каждой летящей деталью
    probes: () => [...PROBE.map((p) => new THREE.Vector3(...p).applyMatrix4(hero.root.matrixWorld)),
      ...PARTS.map((d) => centers[d.key].clone().applyMatrix4(parts[d.key].matrixWorld))],
    explore() {
      const S = evaluate6(26.0);
      S.shoe.yaw = 0; S.fade = 0; S.card = 0; S.labels = 0;
      S.light = { key: 0.32, rimL: 7, rimR: 7, top: 0, env: 0.08, sweep: null };
      return S;
    },
    exploreTarget: [0, 0.5, 0],
    // для выгрузки в Cycles и подписей пост-продакшна
    parts, lacing, anchors, centers,
  };
}
