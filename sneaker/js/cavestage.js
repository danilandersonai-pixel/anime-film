// cavestage.js — сцена v7 «Кристаллы» вокруг мира cave.js: тёмная вода-зеркало с рябью
// и кругами, светлое туманное небо (дальние плиты тонут в дымке), полосы тумана над водой,
// свет — холодный ключ сверху-спереди, «луна» сзади-сверху, контровая полоса, свечение
// тёплых друз — и светящиеся шары-«спутники», которые поднимаются из воды.
// Яркости — в тех же единицах, что в Cycles (площадной — яркость L, точечный и прожектор —
// сила света I).
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { createCave } from './cave.js';
import { KEY_OFF } from './timeline7.js';

export const SKY = { top: '#1b2532', horizon: '#5d6f84', below: '#0c1016', fog: '#4b5b6e' };
export const ORB_COUNT = 9;
export const ORB_L = 2.5;          // яркость поверхности шара (как Emission Strength в Cycles)
export const WARM_EMIT = 0.32;   // свечение тёплых кристаллов изнутри (доля — S.light.crystal)
export const WARM_GLOW = [[-1.6, 1.5, -1.6], [1.5, 1.3, -1.5]];   // откуда светят тёплые друзы

function waterMaterial(reflector, texMatrix, shadow) {
  const U = {
    tReflect: { value: reflector.getRenderTarget().texture }, uTexMatrix: { value: texMatrix },
    tShadow: { value: shadow.texture }, shadowSize: { value: shadow.size },
    uT: { value: 0 }, uRings: { value: Array.from({ length: 10 }, () => new THREE.Vector4()) },
  };
  // вода: почти чёрная, отражение по Френелю, мелкая рябь и круги (от шаров и кроссовка)
  const m = new THREE.MeshPhysicalMaterial({ color: '#020406', roughness: 0.08, metalness: 0, envMapIntensity: 0.6, specularIntensity: 0 }); // отражает только зеркало (без бликов ламп-полос)
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'uniform mat4 uTexMatrix; varying vec4 vReflUv; varying vec3 vWPos;\n' + sh.vertexShader.replace('#include <fog_vertex>',
      '#include <fog_vertex>\n  vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n  vReflUv = uTexMatrix * vec4(transformed, 1.0);');
    sh.fragmentShader = `uniform sampler2D tReflect, tShadow; uniform float shadowSize, uT; uniform vec4 uRings[10];
      varying vec4 vReflUv; varying vec3 vWPos; vec2 wRip;
      ` + sh.fragmentShader
      .replace('#include <normal_fragment_maps>', `
        vec2 p = vWPos.xz;
        wRip = vec2(sin(p.x * 1.3 + uT * 0.7) + sin(p.x * 2.7 - p.y * 2.1 + uT * 1.1) * 0.5, cos(p.y * 1.5 - uT * 0.6) + cos(p.y * 2.6 + p.x * 1.5 - uT * 0.9) * 0.5) * 0.0045;
        for (int k = 0; k < 10; k++) {
          vec4 R = uRings[k]; if (R.w <= 0.0) continue;
          vec2 d = p - R.xy; float l = length(d) + 1e-4, x = (l - R.z) / 0.09;
          wRip += d / l * sin(x * 2.4) * exp(-x * x * 0.4) * R.w * 0.6;
        }
        normal = normalize(normal + (viewMatrix * vec4(wRip.x, 0.0, wRip.y, 0.0)).xyz);`)
      // площадные лампы (контровая, «луна», полоса) не бликуют в воде: на ряби их блик —
      // светящийся столб до самой камеры (в Cycles — то же через привязку света)
      .replace('#include <lights_fragment_begin>', '#undef RE_Direct_RectArea\n#include <lights_fragment_begin>')
      .replace('#include <opaque_fragment>', `
        vec2 suv = vWPos.xz / shadowSize + 0.5; float sa = 0.0;
        if (suv.x > 0.0 && suv.x < 1.0 && suv.y > 0.0 && suv.y < 1.0) sa = texture2D(tShadow, suv).a;
        vec2 ruv = vReflUv.xy / vReflUv.w + wRip * 0.8;
        vec3 refl = vec3(0.0);
        for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) refl += texture2D(tReflect, ruv + vec2(float(i), float(j)) * 0.0012).rgb;
        refl /= 9.0;
        float NoV = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
        float F = 0.02 + 0.98 * pow(1.0 - NoV, 5.0);
        outgoingLight = outgoingLight * (1.0 - 0.5 * clamp(sa, 0.0, 1.0)) + refl * mix(0.35, 1.0, F);
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'cave-water';
  m.userData.uniforms = U;
  return m;
}

// небо: тёмный верх, светлая дымка над горизонтом, тёмный низ; пятно «луны» в тумане
function skyDome() {
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { cTop: { value: new THREE.Color(SKY.top) }, cHor: { value: new THREE.Color(SKY.horizon) }, cBelow: { value: new THREE.Color(SKY.below) }, k: { value: 1 } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 cTop, cHor, cBelow; uniform float k; varying vec3 vD;
      void main(){ float y = vD.y; vec3 c = mix(cHor, cTop, smoothstep(0.0, 0.5, y)); c = mix(cBelow, c, smoothstep(-0.1, 0.0, y));
        c += vec3(0.09, 0.11, 0.15) * exp(-pow((vD.x + 0.3) * 2.2, 2.0) - pow((y - 0.42) * 2.6, 2.0)) * step(vD.z, 0.2); // «луна» в тумане
        gl_FragColor = vec4(c * k, 1.0); }`,
  });
  const s = new THREE.Mesh(new THREE.SphereGeometry(300, 48, 24), m);
  s.renderOrder = -2; s.frustumCulled = false;
  return s;
}

// полосы тумана над водой: шумные полупрозрачные полосы на разной глубине
function mistCards() {
  const group = new THREE.Group();
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uT: { value: 0 }, uColor: { value: new THREE.Color('#8fa3bd') }, uAmt: { value: 0.1 } },
    vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform float uT, uAmt; uniform vec3 uColor; varying vec2 vUv; varying vec3 vW;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main(){
        vec2 p = vec2(vW.x * 0.08 + uT * 0.03, vW.y * 0.35 + vW.z * 0.02);
        float f = n(p) * 0.55 + n(p * 2.3 + 4.1) * 0.3 + n(p * 5.1 - uT * 0.05) * 0.15;
        float a = smoothstep(0.3, 0.85, f) * (1.0 - smoothstep(0.0, 1.0, vUv.y)) * smoothstep(0.0, 0.2, vUv.x) * smoothstep(1.0, 0.8, vUv.x);
        gl_FragColor = vec4(uColor * a * uAmt, 1.0);
      }`,
  });
  for (const [x, z, w, h] of [[0, -12, 60, 2.5], [-10, -24, 90, 5], [8, -40, 120, 9], [0, -58, 200, 14], [12, 12, 40, 1.4], [-20, 2, 50, 3]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0), mat);
    m.position.set(x, 0, z); m.renderOrder = 3;
    group.add(m);
  }
  group.userData.mat = mat;
  return group;
}

export function createCaveStage({ scene, width, height, pixelRatio, shadow, shoeLayer }) {
  scene.fog = new THREE.FogExp2(SKY.fog, 0.016);
  scene.background = null;
  const sky = skyDome(); scene.add(sky);
  const cave = createCave(scene);
  const reflector = new Reflector(new THREE.PlaneGeometry(500, 500), { textureWidth: Math.round(width * pixelRatio * 0.5), textureHeight: Math.round(height * pixelRatio * 0.5), clipBias: 0.003 });
  const texMatrix = reflector.material.uniforms.textureMatrix.value;
  reflector.material.dispose();
  const wmat = waterMaterial(reflector, texMatrix, shadow);
  reflector.material = wmat; reflector.rotation.x = -Math.PI / 2; reflector.receiveShadow = true;
  scene.add(reflector);
  const mist = mistCards(); scene.add(mist);
  mist.traverse((x) => { x.userData.soft = true; });
  // в отражении туман не нужен (он и так над водой)
  const before = reflector.onBeforeRender;
  reflector.onBeforeRender = function (r, s, c) { mist.visible = false; before.call(this, r, s, c); mist.visible = true; };

  // ---- свет
  const T = new THREE.Vector3(0, 0.9, 0);
  const moon = new THREE.RectAreaLight('#c4d4ff', 0, 14, 7); moon.position.set(-14, 26, -30); moon.lookAt(T);   // «луна»: сзади-сверху, сквозь туман
  const rim = new THREE.RectAreaLight('#d2e2ff', 0, 0.5, 5); rim.position.set(2.5, 3.4, -6.5); rim.lookAt(T);    // контровая полоса за островом
  const key = new THREE.SpotLight('#eef2ff', 0, 0, THREE.MathUtils.degToRad(20), 0.7, 2); key.position.set(6, 11, 9); key.target.position.copy(T); // холодный ключ сверху-спереди
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0003; key.shadow.normalBias = 0.01; key.shadow.camera.near = 8; key.shadow.camera.far = 24;
  if (shoeLayer !== undefined) key.shadow.camera.layers.enableAll();
  // свет из тёплых друз
  const glows = WARM_GLOW.map((p) => { const l = new THREE.PointLight('#ff6a20', 0, 0, 2); l.position.set(...p); return l; });
  // бегущая полоса света (всегда в сцене, иначе шейдеры пересобираются; без полосы — гаснет)
  const sweep = new THREE.RectAreaLight('#ffffff', 0, 0.15, 2.4); sweep.position.set(0, 1.5, 2); sweep.lookAt(T);
  scene.add(moon, rim, key, key.target, sweep, ...glows);
  // капля в первом плане
  const drop = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 10).scale(1, 1.6, 1), new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.02, transmission: 1, ior: 1.33, thickness: 0.05, envMapIntensity: 2 }));
  drop.name = 'drop'; drop.visible = false; scene.add(drop);
  // шары-«спутники»: светятся сами (яркость — доля o[4]) и подсвечивают всё вокруг тремя огнями
  const orbMat = new THREE.MeshPhysicalMaterial({ color: '#ff6a1a', roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, emissive: new THREE.Color('#ff5a14'), emissiveIntensity: ORB_L });
  orbMat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\n  totalEmissiveRadiance *= vColor;\n#endif'); };
  const orbs = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 28, 16), orbMat, ORB_COUNT);
  orbs.setColorAt(0, new THREE.Color(1, 1, 1));
  orbs.count = 0; orbs.frustumCulled = false; orbs.name = 'orbs'; scene.add(orbs);
  const orbLights = [0, 1, 2].map(() => { const l = new THREE.PointLight('#ff6a20', 0, 0, 2); scene.add(l); return l; });
  const lights = { moon, rim, key, glows, sweep, orbLights };

  const dm = new THREE.Object3D(), oc = new THREE.Color();
  // L — S.light (moon, rim, key, glow, env, sky, mist, fog); orbs — [x, y, z, радиус, яркость]; rings — круги на воде
  function update(S) {
    const L = S.light;
    moon.intensity = L.moon; rim.intensity = L.rim; key.intensity = L.key;
    // ключ ведёт кроссовок: стоит над и перед точкой keyAt, конус keyCone°
    const ka = L.keyAt || [0, 0.9, 0];
    key.target.position.set(...ka); key.position.set(ka[0] + KEY_OFF[0], ka[1] + KEY_OFF[1], ka[2] + KEY_OFF[2]);
    key.angle = THREE.MathUtils.degToRad(L.keyCone || 20); key.target.updateMatrixWorld();
    const sw = L.sweep;
    if (sw) { sweep.position.set(...sw.pos); sweep.width = sw.w; sweep.height = sw.h; sweep.lookAt(...sw.look); sweep.intensity = sw.L; } else sweep.intensity = 0;
    drop.visible = !!S.drop; if (S.drop) drop.position.set(...S.drop);
    glows.forEach((g) => (g.intensity = L.glow));
    cave.warm.material.emissiveIntensity = WARM_EMIT * (L.crystal ?? 1);
    scene.environmentIntensity = L.env;
    scene.fog.density = L.fog ?? 0.016;
    sky.material.uniforms.k.value = L.sky;
    mist.userData.mat.uniforms.uT.value = S.t; mist.userData.mat.uniforms.uAmt.value = L.mist;
    wmat.userData.uniforms.uT.value = S.t;
    const R = (S.rings || []).slice(0, 10);
    wmat.userData.uniforms.uRings.value.forEach((v, i) => { const q = R[i]; if (q) v.set(q[0], q[1], q[2], q[3]); else v.set(0, 0, 0, 0); });
    const O = S.orbs || [];
    O.forEach((o, i) => { dm.position.set(o[0], o[1], o[2]); dm.scale.setScalar(o[3]); dm.updateMatrix(); orbs.setMatrixAt(i, dm.matrix); orbs.setColorAt(i, oc.setScalar(o[4])); });
    orbs.count = O.length; orbs.instanceMatrix.needsUpdate = true; if (orbs.instanceColor) orbs.instanceColor.needsUpdate = true;
    // три самых ярких шара светят по-настоящему: сила света светящегося шара I = L·π·r²
    const top = O.map((o, i) => [o[4] * o[3] * o[3], i]).sort((a, b) => b[0] - a[0]).slice(0, 3);
    orbLights.forEach((l, k) => { const e = top[k]; if (e) { const o = O[e[1]]; l.position.set(o[0], o[1], o[2]); l.intensity = ORB_L * Math.PI * o[3] * o[3] * o[4]; } else l.intensity = 0; });
  }
  function setSize(w, h, pr) { reflector.getRenderTarget().setSize(Math.round(w * pr * 0.5), Math.round(h * pr * 0.5)); }
  return { reflector, cave, sky, mist, orbs, lights, update, setLights: () => {}, setSize };
}

// карта окружения для отражений: туманное небо, «луна» и светлые просветы в облаках
export function caveEnv(pmrem) {
  const env = new THREE.Scene();
  env.add(skyDome());
  const panel = (w, h, pos, color, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(0, 0, 0); env.add(m);
  };
  panel(40, 20, [-60, 110, -130], '#c8d8ff', 2.5);   // «луна»
  panel(90, 12, [60, 40, 160], '#b4c4dc', 0.9);      // просвет спереди-справа (блики на кроссовке)
  panel(70, 10, [-150, 30, 40], '#aab8cc', 0.7);     // просвет слева
  panel(120, 8, [0, 18, -200], '#9fb0c6', 0.8);      // светлая дымка у горизонта сзади
  return pmrem.fromScene(env, 0.0).texture;
}
