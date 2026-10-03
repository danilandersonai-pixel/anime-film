// studio.js — тёмная студия для v6 «Анатомия»: чёрный глянцевый пол с отражением
// и мягкой контактной тенью, большой софтбокс сверху-спереди, две контровые полосы,
// верхний прожектор (пятно света на разобранном кроссовке) и бегущая полоса света,
// которая скользит по поверхности. Фон — темнота. Единицы света — как в Cycles.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

function floorMaterial(reflector, texMatrix, shadow) {
  const U = {
    tReflect: { value: reflector.getRenderTarget().texture }, uTexMatrix: { value: texMatrix },
    tShadow: { value: shadow.texture }, shadowSize: { value: shadow.size }, shadowOpacity: { value: 0.9 },
  };
  // чёрный пластик: глянец с едва заметными разводами, отражение мутнеет с шероховатостью
  const m = new THREE.MeshPhysicalMaterial({ color: '#070708', roughness: 0.32, metalness: 0, envMapIntensity: 0.5 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'uniform mat4 uTexMatrix; varying vec4 vReflUv; varying vec3 vWPos;\n' + sh.vertexShader.replace('#include <fog_vertex>',
      '#include <fog_vertex>\n  vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n  vReflUv = uTexMatrix * vec4(transformed, 1.0);');
    sh.fragmentShader = `
      uniform sampler2D tReflect, tShadow; uniform float shadowSize, shadowOpacity;
      varying vec4 vReflUv; varying vec3 vWPos;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
      ` + sh.fragmentShader
      .replace('#include <roughnessmap_fragment>', `
        float smudge = vn(vWPos.xz * 0.9) * 0.6 + vn(vWPos.xz * 3.7) * 0.4;
        float roughnessFactor = 0.2 + 0.18 * smudge;`)
      .replace('#include <opaque_fragment>', `
        vec2 suv = vWPos.xz / shadowSize + 0.5;
        float sa = 0.0;
        if (suv.x > 0.0 && suv.x < 1.0 && suv.y > 0.0 && suv.y < 1.0) sa = texture2D(tShadow, suv).a;
        outgoingLight *= 1.0 - clamp(sa, 0.0, 1.0) * shadowOpacity;
        vec2 ruv = vReflUv.xy / vReflUv.w;
        float bl = 0.0015 + 0.012 * roughnessFactor;
        vec3 refl = vec3(0.0);
        for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) refl += texture2D(tReflect, ruv + vec2(float(i), float(j)) * bl).rgb;
        refl /= 25.0;
        float NoV = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
        float F = 0.04 + 0.96 * pow(1.0 - NoV, 5.0);
        outgoingLight += refl * mix(0.28, 1.0, F) * (1.0 - 0.6 * clamp(sa, 0.0, 1.0));
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'studio-floor';
  return m;
}

export function createStudio({ scene, width, height, pixelRatio, shadow, shoeLayer }) {
  const reflector = new Reflector(new THREE.PlaneGeometry(80, 80), { textureWidth: Math.round(width * pixelRatio * 0.5), textureHeight: Math.round(height * pixelRatio * 0.5), clipBias: 0.002 });
  const texMatrix = reflector.material.uniforms.textureMatrix.value;
  reflector.material.dispose();
  reflector.material = floorMaterial(reflector, texMatrix, shadow);
  reflector.rotation.x = -Math.PI / 2;
  reflector.receiveShadow = true;
  scene.add(reflector);

  const TGT = new THREE.Vector3(0, 0.6, 0);
  const area = (color, w, h, pos, at = TGT) => { const l = new THREE.RectAreaLight(color, 0, w, h); l.position.set(...pos); l.lookAt(at); scene.add(l); return l; };
  const key = area('#fff4e8', 3.6, 2.0, [1.5, 4.6, 3.6]);                                   // большой софтбокс сверху-спереди
  const rimL = area('#cfdcff', 0.35, 3.6, [-3.8, 2.0, -2.8], new THREE.Vector3(0, 0.8, 0)); // холодная контровая слева
  const rimR = area('#ffd8b8', 0.35, 3.6, [3.6, 1.9, -2.6], new THREE.Vector3(0, 0.8, 0));  // тёплая контровая справа
  const sweep = area('#ffffff', 0.2, 3, [0, 1.5, 3]);                                          // бегущая полоса
  const top = new THREE.SpotLight('#fff1e0', 0, 0, THREE.MathUtils.degToRad(24), 0.75, 2);   // пятно сверху
  top.position.set(0.3, 11, 1.2); top.target.position.set(0, 1.6, 0);
  top.castShadow = true; top.shadow.mapSize.set(2048, 2048); top.shadow.bias = -0.0003; top.shadow.normalBias = 0.01; top.shadow.radius = 3;
  top.shadow.camera.near = 6; top.shadow.camera.far = 16;
  if (shoeLayer !== undefined) top.shadow.camera.layers.set(shoeLayer);
  scene.add(top, top.target);
  const lights = { key, rimL, rimR, sweep, top };

  // L — S.light из timeline6: key, rimL, rimR (яркость площадных), top (сила света), env, sweep
  function setLights(L) {
    key.intensity = L.key; rimL.intensity = L.rimL; rimR.intensity = L.rimR; top.intensity = L.top;
    // полоса всегда в сцене (иначе шейдеры пересобираются), без полосы — просто гаснет
    const s = L.sweep;
    if (s) { sweep.position.set(...s.pos); sweep.width = s.w; sweep.height = s.h; sweep.lookAt(...s.look); sweep.intensity = s.L; } else sweep.intensity = 0;
    scene.environmentIntensity = L.env;
  }
  function setSize(w, h, pr) { reflector.getRenderTarget().setSize(Math.round(w * pr * 0.5), Math.round(h * pr * 0.5)); }
  return { reflector, lights, setLights, setSize };
}
