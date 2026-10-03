// film7.js — ролик v7 «Кристаллы»: белый кроссовок с оранжевой подошвой пролетает сквозь
// туманный мир прозрачных кристаллов и встаёт на камень-остров среди тёплых оранжевых друз;
// из тёмной воды поднимаются светящиеся шары-«спутники». Кинорамка 2.39:1.
// Здесь — всё, что относится только к этому ролику; плеер, камера и оптика — в main.js.
import * as THREE from 'three';
import { shoeTransform } from './shoe.js';
import { evaluate7, DURATION7, UPPER_GAIN } from './timeline7.js';
import { ISLAND_TOP } from './cave.js';
import { LETTERBOX } from './stage.js';
import { createLogo } from './logo7.js';
import { renderTrack7 } from './audio7.js';

const PROBE = [[-1.4, 0.85, 0], [1.45, 0.3, 0], [0.3, 0.75, 0], [0, 0.5, 0.45], [0, 0.5, -0.45], [-1.2, 0.02, 0.35], [1.2, 0.02, -0.3]];

export async function createFilm7({ stage, hero, layers }) {
  hero.setColorway('lunar');
  // белый трикотаж: карта пряжи темнит цвет, поэтому верх ярче (то же — в Cycles)
  hero.materials.upper.color.setScalar(UPPER_GAIN);
  // сухой кроссовок: капли дождя (они есть в модели для «Улицы») спрятаны
  hero.root.traverse((o) => { if (o.name === 'drops' || o.name === 'foamDrops') o.visible = false; });
  stage.final.uniforms.bars.value = LETTERBOX;
  const logo = createLogo(layers.card);
  let last = null;

  function apply(S) {
    // яркость белого трикотажа — только для Lunar (в режиме «Покрутить» можно выбрать другую расцветку)
    hero.materials.upper.color.setScalar(hero.root.userData.colorway === 'lunar' ? UPPER_GAIN : 1);
    shoeTransform(S.shoe, hero.root.position, hero.root.quaternion);
    hero.root.updateMatrixWorld(true);
    stage.cave.update(S);
    last = S;
  }

  return {
    key: 'crystals', duration: DURATION7, cover: 18.6, colorway: 'lunar',
    evaluate: evaluate7, apply, prepare: () => {},
    overlay: (t, S) => logo.update(t, S),
    track: () => renderTrack7(48000),
    // смаз: кроссовок и шары
    probes: () => [...PROBE.map((p) => new THREE.Vector3(...p).applyMatrix4(hero.root.matrixWorld)),
      ...(last?.orbs || []).map((o) => new THREE.Vector3(o[0], o[1], o[2]))],
    explore() {
      const S = evaluate7(18.6);
      S.fade = 0; S.logo = 0;
      S.shoe = { pos: [0, ISLAND_TOP, 0], yaw: 0, pitch: 0, roll: 0, pivot: null, squash: 0 };
      return S;
    },
    exploreTarget: [0, ISLAND_TOP + 0.5, 0], explorePos: [3.4, ISLAND_TOP + 1.2, 4.6],
  };
}
