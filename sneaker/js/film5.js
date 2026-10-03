// film5.js — ролик v5 «Улица»: ночной город под ливнем, кроссовок падает в лужу
// по законам физики. Всё, что относится только к этому ролику: панорама города,
// вода, ряд из трёх расцветок, свет улицы, карточка и звук. Плеер — в main.js.
import * as THREE from 'three';
import { buildShoe, shoeTransform } from './shoe.js';
import { evaluate5, DURATION5, setRig5, REST } from './timeline5.js';
import { createCard } from './card5.js';
import { renderTrack5 } from './audio5.js';
import { loadHDRI } from './hdri.js';
import { BG_YAW } from './street.js';
import { createWater5 } from './water5.js';
import { createWaterMaterial, updateWaterMaterials } from './watermat.js';

const LINEUP = { glacier: [0.5, 1.85], volt: [-0.5, -1.85] }; // ряд из трёх расцветок — как в Cycles
const PROBE = [[-1.4, 0.85, 0], [1.45, 0.3, 0], [-1.2, 0.02, 0.35], [1.2, 0.02, -0.3], [0.3, 0.75, 0], [0, 0.5, 0.45], [0, 0.5, -0.45]];
const RAIN_LAMP = new THREE.Color('#ffad5c'), RAIN_NEON = new THREE.Color('#ff4096'), RAIN_CAR = new THREE.Color('#fff1dc');

export async function createFilm5({ stage, hero, jersey, layers }) {
  // ночной город (HDRI Shanghai Bund): фон и отражения
  try { stage.setEnvironment(await loadHDRI('assets/city.png')); } catch (e) { console.warn('HDRI не загрузилась', e); }
  setRig5(hero.macro);
  const card = createCard(layers.card);
  const water = createWater5(stage.scene);
  // капли на ткани и пене — тоже вода: отражают город и ловят блики фонаря
  const surfaceWater = createWaterMaterial({ surface: true });
  const waterMats = [water.material, surfaceWater];
  const wetten = (s) => s.root.traverse((o) => { if (o.isMesh && o.material === s.materials.drop) { o.material = surfaceWater; o.castShadow = false; } });
  wetten(hero);

  // ещё две расцветки — для плана «три в ряд»; строятся, когда браузер свободен
  const lineup = {};
  function prepare() {
    for (const cw of Object.keys(LINEUP)) {
      if (lineup[cw]) continue;
      const s = buildShoe({ jersey });
      s.setColorway(cw);
      s.root.visible = false;
      const [dx, dz] = LINEUP[cw];
      shoeTransform({ pos: [REST.pos[0] + dx, REST.pos[1], dz], yaw: 0, pitch: REST.pitch, roll: 0, pivot: null }, s.root.position, s.root.quaternion);
      wetten(s);
      stage.adopt(s.root);
      lineup[cw] = s;
    }
  }

  // кроссовок, вода и свет улицы (камера и объектив — в main.js)
  function apply(S) {
    const r = hero.root, sh = S.shoe, G = hero.groups;
    shoeTransform(sh, r.position, r.quaternion);
    for (const k of Object.keys(G)) { G[k].position.set(0, 0, 0); G[k].rotation.set(0, 0, 0); G[k].scale.set(1, 1, 1); }
    G.upper.position.y = -sh.squash * 0.4;   // пена сжимается при ударе
    for (const k of ['foamTop', 'foamBottom', 'plate']) G[k].scale.y = 1 - sh.squash;
    for (const s of Object.values(lineup)) s.root.visible = S.lineup > 0.5;
    hero.root.updateMatrixWorld(true);
    // свет улицы; струи дождя видны в свете фонаря, неона и фар
    stage.setLights(S.light);
    const L = stage.lights, head = stage.street.carHead();
    const rainLights = [[L.lamp.position, RAIN_LAMP.clone().multiplyScalar(0.9 * S.light.lamp)], [L.neonPink.position, RAIN_NEON.clone().multiplyScalar(0.5 * S.light.neon)]];
    if (head) rainLights.push([head, RAIN_CAR.clone().multiplyScalar(1.4)]);
    const sp = [[L.lamp.position, RAIN_LAMP.clone().multiplyScalar(4 * S.light.lamp), 900], [L.win.position, new THREE.Color('#ffdbb8').multiplyScalar(0.8 * S.light.window), 40], [L.neonPink.position, RAIN_NEON.clone().multiplyScalar(2 * S.light.neon), 150]];
    if (head) sp.push([head, RAIN_CAR.clone().multiplyScalar(8), 1500]);
    updateWaterMaterials(waterMats, { envTex: stage.env.tex, yaw: BG_YAW, envIntensity: stage.scene.backgroundIntensity, lights: sp });
    stage.street.update(S, rainLights, water.update(S));
  }

  return {
    key: 'street', duration: DURATION5, cover: 25.0,
    evaluate: evaluate5, apply, prepare,
    overlay: (t) => card.update(t),
    track: () => renderTrack5(48000),
    probes: () => PROBE.map((p) => new THREE.Vector3(...p).applyMatrix4(hero.root.matrixWorld)),
    // свободный осмотр: кроссовок стоит в луже, машины нет
    explore() {
      const S = evaluate5(25.0);
      S.shoe = { pos: [...REST.pos], yaw: 0, pitch: REST.pitch, roll: 0, pivot: null, squash: 0 };
      S.street.car.on = 0; S.fade = 0; S.lineup = 0;
      return S;
    },
    exploreTarget: [REST.pos[0], 0.45, 0],
  };
}
