// street.js — ночная улица после ливня: мокрый асфальт со сканом (Poly Haven, asphalt_02)
// и лужами, рябь от капель, отражения с вытянутыми бликами, разметка, радужная
// масляная плёнка, дождь в контровом свете, брызги, огни города в боке,
// проезжающая машина, молния, низкий туман, камешки и листья.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { CITY_LIGHTS } from './citylights.js';
import { rng } from './textures.js';

const TILE = 15;          // скан 3 × 3 м уложен плиткой 1,5 м: зерно асфальта мельче и чётче вблизи
export const PUDDLE = { x: 0.2, z: 0.15, r2: 7.5 }; // лужа вокруг кроссовка
export const BG_YAW = 2.45; // поворот панорамы: неоновый берег — за кроссовком

export async function loadAsphalt(base = 'assets/') {
  const L = new THREE.TextureLoader();
  const load = (f, srgb) => L.loadAsync(base + f).then((t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 16;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
  const [color, normal, rd] = await Promise.all([load('asphalt_color.jpg', true), load('asphalt_normal.jpg'), load('asphalt_rd.jpg')]);
  return { color, normal, rd };
}

// ---------------------------------------------------------------------
// Асфальт: физический материал three.js (свет, тени, туман) + свои вставки
// ---------------------------------------------------------------------
function asphaltMaterial(A, reflector, texMatrix, shadow) {
  const U = {
    tCol: { value: A.color }, tNor: { value: A.normal }, tRD: { value: A.rd },
    tReflect: { value: reflector.getRenderTarget().texture }, uTexMatrix: { value: texMatrix },
    tShadow: { value: shadow.texture }, shadowSize: { value: shadow.size }, shadowOpacity: { value: 0.9 },
    uTile: { value: 1 / TILE }, uRainT: { value: 0 }, uRain: { value: 1 }, uReflect: { value: 1 },
    uPuddle: { value: new THREE.Vector3(PUDDLE.x, PUDDLE.z, PUDDLE.r2) },
    uRing: { value: 0 }, uRingR: { value: 0 }, uRingC: { value: new THREE.Vector2(-1.3, 0) },
  };
  const m = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.6, metalness: 0, envMapIntensity: 0.18 });
  m.userData.uniforms = U;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'uniform mat4 uTexMatrix; varying vec4 vReflUv; varying vec3 vWPos;\n' + sh.vertexShader.replace('#include <fog_vertex>',
      '#include <fog_vertex>\n  vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n  vReflUv = uTexMatrix * vec4(transformed, 1.0);');
    sh.fragmentShader = `
      uniform sampler2D tCol, tNor, tRD, tReflect, tShadow;
      uniform float uTile, uRainT, uRain, uReflect, shadowSize, shadowOpacity, uRing, uRingR;
      uniform vec3 uPuddle; uniform vec2 uRingC;
      varying vec4 vReflUv; varying vec3 vWPos;
      float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      // круги от капель: три слоя ячеек, в каждой капля падает в своё время
      vec2 ripples(vec2 p, float t){
        vec2 g = vec2(0.0);
        for (int L = 0; L < 3; L++) {
          float sc = 3.2 + float(L) * 1.9;
          vec2 q = p * sc + float(L) * 17.31;
          vec2 b = floor(q - 0.5);
          for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++) {
            vec2 c = b + vec2(float(i), float(j));
            float r1 = hash12(c), r2 = hash12(c + 7.13), r3 = hash12(c + 3.71);
            float per = 0.9 + 0.5 * hash12(c + 1.9);
            float age = fract(t / per + r3);
            vec2 d = q - (c + 0.2 + 0.6 * vec2(r1, r2));
            float len = length(d) + 1e-4;
            float x = (len - age * 0.55) * 14.0;
            float env = exp(-x * x * 0.35) * (1.0 - age) * (1.0 - age);
            g += d / len * sin(x * 2.2) * env * 0.5;
          }
        }
        return g;
      }
      float wWater, wWet, wPaint, wH;
      vec3 wNT;
      ` + sh.fragmentShader
      .replace('#include <map_fragment>', `
        vec2 wuv = vWPos.xz;
        vec2 auv = wuv * uTile;
        vec3 aCol = texture2D(tCol, auv).rgb;
        vec4 rd = texture2D(tRD, auv);
        wH = rd.g;
        // уровень воды: крупные пятна + лужа вокруг кроссовка
        float big = texture2D(tRD, wuv * 0.0123 + 0.37).g;
        vec2 pc = wuv - uPuddle.xy;
        float nearP = exp(-dot(pc, pc) / uPuddle.z);
        float level = 0.33 + 0.5 * (big - 0.62) + 0.38 * nearP;
        wWater = smoothstep(0.0, 0.04, level - wH);
        wWet = 1.0;
        // разметка: стёртая белая полоса, краска осталась на выступах
        float band = 1.0 - smoothstep(0.55, 0.62, abs(vWPos.z + 2.9));
        wPaint = band * smoothstep(0.5, 0.62, wH) * (1.0 - wWater) * step(-40.0, vWPos.x);
        vec3 base = aCol * mix(0.36, 0.2, wWater);
        base = mix(base, vec3(0.5, 0.5, 0.48) * (0.75 + 0.5 * aCol.r), wPaint);
        diffuseColor.rgb = base;`)
      .replace('#include <roughnessmap_fragment>', `
        float roughnessFactor = mix(0.42 * (0.65 + 0.7 * rd.r), 0.035, wWater);
        roughnessFactor = mix(roughnessFactor, 0.3, wPaint);`)
      .replace('#include <normal_fragment_maps>', `
        vec3 nA = texture2D(tNor, auv).xyz * 2.0 - 1.0;
        vec3 nD = texture2D(tNor, auv * 4.0 + 0.5).xyz * 2.0 - 1.0;
        wNT = vec3((nA.xy * 1.2 + nD.xy * 0.5) * (1.0 - 0.92 * wWater), 1.0);
        vec2 rip = ripples(wuv, uRainT) * uRain * (0.25 + 0.75 * wWater);
        vec2 rd2 = wuv - uRingC; float rl = length(rd2) + 1e-4; float rx = (rl - uRingR) / 0.07;
        rip += rd2 / rl * sin(rx * 2.6) * exp(-rx * rx * 0.5) * uRing * 0.9 * (0.3 + 0.7 * wWater);
        wNT = normalize(wNT + vec3(rip, 0.0));
        mat3 wTBN = mat3(normalize((viewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz), normalize((viewMatrix * vec4(0.0, 0.0, -1.0, 0.0)).xyz), normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz));
        normal = normalize(wTBN * wNT);`)
      .replace('#include <opaque_fragment>', `
        // контактная тень под кроссовком
        vec2 suv = vWPos.xz / shadowSize + 0.5;
        float sa = 0.0;
        if (suv.x > 0.0 && suv.x < 1.0 && suv.y > 0.0 && suv.y < 1.0) sa = texture2D(tShadow, suv).a;
        outgoingLight *= 1.0 - clamp(sa, 0.0, 1.0) * shadowOpacity * (1.0 - 0.5 * wWater);
        // отражение: вода — почти зеркало, мокрый асфальт — мутное и вытянутое по вертикали
        vec2 ruv = vReflUv.xy / vReflUv.w + wNT.xy * mix(0.02, 0.012, wWater);
        float bl = mix(0.0007, 0.011, clamp(roughnessFactor * 1.6, 0.0, 1.0));
        vec3 refl = vec3(0.0);
        for (int j = -3; j <= 3; j++) for (int i = -1; i <= 1; i++) refl += texture2D(tReflect, ruv + vec2(float(i) * bl * 0.45, float(j) * bl * 1.3)).rgb;
        refl /= 21.0;
        float NoV = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
        float F = 0.02 + 0.98 * pow(1.0 - NoV, 5.0);
        // радужная плёнка бензина на краю лужи
        float oil = smoothstep(0.58, 0.74, texture2D(tRD, wuv * 0.041 + 0.71).g) * wWater * smoothstep(0.15, 0.6, nearP);
        vec3 film = 0.62 + 0.38 * cos(6.2832 * (NoV * 2.3 + wH * 4.0 + vec3(0.0, 0.33, 0.67)));
        refl *= mix(vec3(1.0), film * 1.35, oil * 0.75);
        outgoingLight += refl * F * mix(0.35, 1.0, wWater) * uReflect;
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'wet-asphalt';
  return m;
}

// ---------------------------------------------------------------------
// Дождь: тонкие струи, повёрнутые к камере; ярче на фоне источников света
// ---------------------------------------------------------------------
function makeRain(N = 5200) {
  const base = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index; g.attributes.position = base.attributes.position; g.attributes.uv = base.attributes.uv;
  const r = rng(404), seed = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) seed.set([r(), r(), r() * 12, r()], i * 4);
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  g.instanceCount = N;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uT: { value: 0 }, uAmt: { value: 1 }, uFall: { value: 26 }, uLen: { value: 0.34 }, uW: { value: 0.0026 },
      uBox: { value: new THREE.Vector3(7, 6, 7) }, uCenter: { value: new THREE.Vector3(0, 0, 0) },
      uL: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
      uC: { value: [new THREE.Color(), new THREE.Color(), new THREE.Color()] },
    },
    vertexShader: `
      uniform float uT, uFall, uLen, uW; uniform vec3 uBox, uCenter, uL[3], uC[3];
      attribute vec4 aSeed; varying vec2 vUv; varying vec3 vLit; varying float vFade;
      void main(){
        float H = uBox.y * 2.0;
        float y = mod(aSeed.z - uT * uFall * (0.85 + 0.3 * aSeed.w), H);
        vec3 c = vec3(uCenter.x + (aSeed.x * 2.0 - 1.0) * uBox.x, y, uCenter.z + (aSeed.y * 2.0 - 1.0) * uBox.z);
        vec3 dir = normalize(vec3(0.07, -1.0, 0.025));
        vec3 toCam = cameraPosition - c; float dc = length(toCam); toCam /= dc;
        vec3 side = normalize(cross(dir, toCam));
        float len = uLen * (0.7 + 0.6 * aSeed.w);
        vec3 p = c + side * position.x * uW * (1.0 + dc * 0.05) + dir * position.y * len;
        vUv = uv;
        vLit = vec3(0.012);
        for (int k = 0; k < 3; k++) {
          vec3 tl = normalize(uL[k] - c);
          vLit += uC[k] * pow(max(dot(-toCam, tl), 0.0), 14.0) * 1.0;
        }
        vFade = smoothstep(0.0, 0.25, y) * (1.0 - smoothstep(H - 1.0, H, y)) * smoothstep(0.9, 2.2, dc) * (1.0 - smoothstep(9.0, 15.0, dc));
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform float uAmt; varying vec2 vUv; varying vec3 vLit; varying float vFade;
      void main(){
        float a = (1.0 - abs(vUv.x * 2.0 - 1.0)) * smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.75, vUv.y);
        gl_FragColor = vec4(vLit * a * vFade * uAmt, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 5;
  return mesh;
}

// брызги от капель на асфальте: крошечные «коронки», которые вспыхивают и гаснут
function makeSplashes(N = 700) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#fff';
  const r = rng(77);
  for (let k = 0; k < 9; k++) { // капельки короны
    const a = Math.PI * (0.12 + 0.76 * k / 8), d = 34 + r() * 18;
    x.beginPath(); x.arc(64 + Math.cos(a) * d, 120 - Math.sin(a) * d * 1.3, 3 + r() * 3, 0, Math.PI * 2); x.fill();
  }
  x.globalAlpha = 0.6; x.beginPath(); x.ellipse(64, 118, 30, 6, 0, 0, Math.PI * 2); x.fill();
  const tex = new THREE.CanvasTexture(c);
  const base = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index; g.attributes.position = base.attributes.position; g.attributes.uv = base.attributes.uv;
  const seed = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) seed.set([r(), r(), r()], i * 3);
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 3));
  g.instanceCount = N;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { map: { value: tex }, uT: { value: 0 }, uAmt: { value: 1 }, uTint: { value: new THREE.Color('#9fb4cc') } },
    vertexShader: `
      uniform float uT; attribute vec3 aSeed; varying vec2 vUv; varying float vA;
      float h(float n){ return fract(sin(n) * 43758.5453); }
      void main(){
        float rate = 2.2 + aSeed.z;
        float k = uT * rate + aSeed.x * 17.0;
        float cyc = floor(k), age = fract(k);
        float sx = h(cyc * 12.9898 + aSeed.y * 78.233), sz = h(cyc * 39.346 + aSeed.x * 11.135);
        vec3 c = vec3((sx * 2.0 - 1.0) * 5.0, 0.0, (sz * 2.0 - 1.0) * 4.0 - 0.5);
        float inShoe = step(abs(c.x), 1.65) * step(abs(c.z), 0.55);
        float s = (0.025 + 0.025 * aSeed.z) * (0.4 + age) * (1.0 - inShoe);
        vec3 toCam = normalize(vec3(cameraPosition.x - c.x, 0.0, cameraPosition.z - c.z));
        vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
        vec3 p = c + side * position.x * s + vec3(0.0, position.y * s * 0.8, 0.0);
        vUv = uv; vA = (1.0 - age) * smoothstep(0.0, 0.1, age) * step(age, 0.35) * 2.0;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D map; uniform float uAmt; uniform vec3 uTint; varying vec2 vUv; varying float vA;
      void main(){ float a = texture2D(map, vUv).r; gl_FragColor = vec4(uTint * a * vA * uAmt * 0.16, 1.0); }`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 4;
  return mesh;
}

// круглое боке: диск с чуть более ярким краем, как у настоящего объектива
function bokehTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), img = x.createImageData(128, 128), d = img.data;
  for (let j = 0; j < 128; j++) for (let i = 0; i < 128; i++) {
    const r = Math.hypot(i - 63.5, j - 63.5) / 60;
    const disc = Math.max(0, Math.min(1, (1 - r) * 14));
    const rim = Math.exp(-((r - 0.9) ** 2) / 0.004) * 0.35;
    const v = Math.min(1, disc * (0.62 + 0.25 * r * r) + rim * disc);
    const k = (j * 128 + i) * 4; d[k] = d[k + 1] = d[k + 2] = v * 255; d[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}

// анаморфный блик фары: тонкая горизонтальная полоса
function flareTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 32;
  const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 256, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 256, 32);
  const v = x.createLinearGradient(0, 0, 0, 32);
  v.addColorStop(0, 'rgba(0,0,0,1)'); v.addColorStop(0.5, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,1)');
  x.globalCompositeOperation = 'destination-out'; x.fillStyle = v; x.fillRect(0, 0, 256, 32);
  return new THREE.CanvasTexture(c);
}

function glowSprite(tex, color, scale) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
  s.scale.set(scale, scale, 1);
  return s;
}

// низкий туман: полупрозрачные полосы на разной глубине, шум медленно плывёт
function makeMist() {
  const group = new THREE.Group();
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uT: { value: 0 }, uColor: { value: new THREE.Color('#6d7c99') }, uAmt: { value: 0.05 } },
    vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `
      uniform float uT, uAmt; uniform vec3 uColor; varying vec2 vUv; varying vec3 vW;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main(){
        vec2 p = vec2(vW.x * 0.35 + uT * 0.05, vW.y * 1.2 + vW.z * 0.2);
        float f = n(p) * 0.55 + n(p * 2.3 + 4.1) * 0.3 + n(p * 5.1 - uT * 0.04) * 0.15;
        float a = smoothstep(0.35, 0.85, f) * (1.0 - smoothstep(0.0, 1.0, vUv.y)) * smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x);
        gl_FragColor = vec4(uColor * a * uAmt, 1.0);
      }`,
  });
  for (const [z, w, h] of [[-3.5, 22, 1.4], [-6.5, 30, 2.2], [-11, 44, 3.4], [-17, 60, 5]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0), mat);
    m.position.set(0, 0, z); m.renderOrder = 3;
    group.add(m);
  }
  group.userData.mat = mat;
  return group;
}

// камешки и мокрые листья на асфальте
function makeDebris() {
  const group = new THREE.Group(), r = rng(808);
  const rockGeo = new THREE.IcosahedronGeometry(1, 2);
  const P = rockGeo.attributes.position;
  for (let i = 0; i < P.count; i++) { const k = 0.75 + 0.5 * Math.abs(Math.sin(P.getX(i) * 5.1 + P.getY(i) * 3.3) * Math.cos(P.getZ(i) * 4.7)); P.setXYZ(i, P.getX(i) * k, P.getY(i) * k * 0.7, P.getZ(i) * k); }
  rockGeo.computeVertexNormals();
  const rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshPhysicalMaterial({ color: '#4a4844', roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.15 }), 140);
  const dm = new THREE.Object3D();
  for (let i = 0; i < 140; i++) {
    let x, z;
    do { const a = r() * Math.PI * 2, d = 0.9 + Math.pow(r(), 0.7) * 6; x = Math.cos(a) * d * 1.3; z = Math.sin(a) * d - 0.4; } while (Math.abs(x) < 1.75 && Math.abs(z) < 0.6);
    const s = 0.006 + Math.pow(r(), 3) * 0.035;
    dm.position.set(x, s * 0.25, z); dm.rotation.set(r() * 0.4, r() * 6.3, r() * 0.4); dm.scale.setScalar(s); dm.updateMatrix();
    rocks.setMatrixAt(i, dm.matrix);
    const c = 0.55 + r() * 0.6; rocks.setColorAt(i, new THREE.Color(c * 0.32, c * 0.31, c * 0.29));
  }
  rocks.castShadow = true; rocks.receiveShadow = true;
  group.add(rocks);
  // листья: силуэт, прожилки, осенний цвет; лист чуть выгнут и блестит от воды
  const leafTex = (hue, seed) => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 384;
    const x = c.getContext('2d'), rr = rng(seed);
    x.translate(128, 360);
    const g = x.createLinearGradient(0, -340, 0, 0);
    g.addColorStop(0, `hsl(${hue + 8},70%,38%)`); g.addColorStop(1, `hsl(${hue - 6},75%,26%)`);
    x.fillStyle = g;
    x.beginPath(); x.moveTo(0, 0);
    x.bezierCurveTo(-120, -60, -130, -250, 0, -345); x.bezierCurveTo(130, -250, 120, -60, 0, 0); x.fill();
    for (let k = 0; k < 220; k++) { x.fillStyle = `rgba(${rr() < 0.5 ? '60,30,10' : '200,140,60'},${0.08 + rr() * 0.12})`; x.beginPath(); x.arc((rr() - 0.5) * 180, -rr() * 330, 2 + rr() * 9, 0, 7); x.fill(); }
    x.globalCompositeOperation = 'destination-in';
    x.beginPath(); x.moveTo(0, 0); x.bezierCurveTo(-120, -60, -130, -250, 0, -345); x.bezierCurveTo(130, -250, 120, -60, 0, 0); x.fill();
    x.globalCompositeOperation = 'source-over';
    x.strokeStyle = 'rgba(255,220,150,0.45)'; x.lineWidth = 3;
    x.beginPath(); x.moveTo(0, 20); x.lineTo(0, -335); x.stroke();
    x.lineWidth = 1.6;
    for (let k = 1; k < 8; k++) { const y = -k * 40; for (const s of [-1, 1]) { x.beginPath(); x.moveTo(0, y); x.quadraticCurveTo(s * 40, y - 25, s * (90 - k * 6), y - 55); x.stroke(); } }
    x.lineWidth = 4; x.beginPath(); x.moveTo(0, 0); x.lineTo(0, 24); x.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return t;
  };
  for (const [x, z, rot, s, hue, seed] of [[2.5, 1.25, 0.7, 0.85, 34, 1], [-3.1, -1.5, 2.4, 0.75, 22, 2], [1.5, -2.1, -0.6, 0.66, 40, 3], [-1.2, 2.1, 1.9, 0.8, 28, 4], [4.4, -0.5, 3.0, 0.9, 18, 5]]) {
    const geo = new THREE.PlaneGeometry(0.68, 1, 6, 8);
    const pp = geo.attributes.position;
    for (let i = 0; i < pp.count; i++) { const u = pp.getX(i), v = pp.getY(i); pp.setZ(i, 0.06 * u * u * 4 + 0.03 * Math.sin(v * 3 + seed)); }
    geo.computeVertexNormals();
    const leaf = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ map: leafTex(hue, seed), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.45, clearcoat: 1, clearcoatRoughness: 0.08 }));
    leaf.rotation.set(-Math.PI / 2, 0, rot); leaf.position.set(x, 0.004, z); leaf.scale.setScalar(s);
    leaf.receiveShadow = true;
    group.add(leaf);
  }
  return group;
}

// ---------------------------------------------------------------------
export function createStreet({ scene, width, height, pixelRatio, shadow, asphalt }) {
  const reflector = new Reflector(new THREE.PlaneGeometry(260, 260), { textureWidth: Math.round(width * pixelRatio * 0.5), textureHeight: Math.round(height * pixelRatio * 0.5), clipBias: 0.002 });
  const texMatrix = reflector.material.uniforms.textureMatrix.value;
  reflector.material.dispose();
  const mat = asphaltMaterial(asphalt, reflector, texMatrix, shadow);
  reflector.material = mat;
  reflector.rotation.x = -Math.PI / 2;
  reflector.receiveShadow = true;
  scene.add(reflector);
  const U = mat.userData.uniforms;

  const rain = makeRain(); scene.add(rain);
  const splashes = makeSplashes(); scene.add(splashes);
  const mist = makeMist(); scene.add(mist);
  const debris = makeDebris(); scene.add(debris);

  // огни города: диски боке там же, где огни на панораме
  const bok = bokehTexture(), city = new THREE.Group();
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), BG_YAW);
  const r = rng(515);
  for (const [dx, dy, dz, cr, cg, cb, L] of CITY_LIGHTS.slice(0, 110)) {
    const d = new THREE.Vector3(dx, dy, dz).applyQuaternion(q);
    const k = Math.min(1, 0.25 + 0.2 * Math.log10(L)), s = 0.7 + r() * 0.9 + 0.3 * Math.log10(L);
    const sp = glowSprite(bok, new THREE.Color(cr, cg, cb).multiplyScalar(0.2 * k), s);
    sp.position.copy(d.multiplyScalar(95)); sp.position.y = Math.max(sp.position.y, 0.5 + r() * 2);
    city.add(sp);
  }
  scene.add(city);

  // машина: пара фар, блики-полосы, задние огни; свет фар — прожектор с тенью
  const flare = flareTexture(), car = new THREE.Group();
  const heads = [-0.8, 0.8].map((o) => { const s = glowSprite(bok, new THREE.Color('#fff4e2').multiplyScalar(1.6), 1.5); s.userData.o = o; car.add(s); return s; });
  const streaks = [-0.8, 0.8].map((o) => { const s = glowSprite(flare, new THREE.Color('#bcd8ff').multiplyScalar(0.9), 1); s.scale.set(18, 0.55, 1); s.userData.o = o; car.add(s); return s; });
  const tails = [-0.8, 0.8].map((o) => { const s = glowSprite(bok, new THREE.Color('#ff2a1a').multiplyScalar(1.4), 1.6); s.userData.o = o; car.add(s); return s; });
  scene.add(car);
  const carLight = new THREE.SpotLight('#fff1dc', 0, 0, 0.35, 0.6, 2);
  carLight.castShadow = true; carLight.shadow.mapSize.set(1024, 1024); carLight.shadow.bias = -0.0004;
  carLight.shadow.camera.near = 5; carLight.shadow.camera.far = 80;
  carLight.target.position.set(0, 0.4, 0);
  scene.add(carLight, carLight.target);

  // молния: холодный свет сверху
  const sky = new THREE.DirectionalLight('#c9d8ff', 0);
  sky.position.set(-4, 12, -6);
  scene.add(sky);

  const haze = new THREE.Mesh(new THREE.CylinderGeometry(160, 160, 40, 64, 1, true), new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, depthWrite: false, fog: false,
    uniforms: { uColor: { value: new THREE.Color('#0e1019') } },
    vertexShader: 'varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uColor; varying float vY; void main(){ float a = 1.0 - smoothstep(-2.0, 9.0, vY); gl_FragColor = vec4(uColor, a * 0.92); }',
  }));
  haze.position.y = 0; haze.renderOrder = -1;
  scene.add(haze);

  const hideInReflection = [splashes, mist];

  function update(S, rimL, rimR) {
    const st = S.street;
    U.uRainT.value = st.rainT; U.uRain.value = st.rain; U.uReflect.value = st.reflect;
    U.uRing.value = S.ring.amt; U.uRingR.value = S.ring.r; if (S.ring.c) U.uRingC.value.set(S.ring.c[0], S.ring.c[1]);
    const rm = rain.material.uniforms;
    rm.uT.value = st.rainT; rm.uAmt.value = st.rain;
    rm.uCenter.value.set(S.cam.target[0] * 0.6, 0, S.cam.target[2] * 0.6);
    rm.uL.value[0].copy(rimL.position); rm.uC.value[0].copy(rimL.color).multiplyScalar(Math.min(1, rimL.intensity / 14));
    rm.uL.value[1].copy(rimR.position); rm.uC.value[1].copy(rimR.color).multiplyScalar(Math.min(1, rimR.intensity / 16));
    splashes.material.uniforms.uT.value = st.rainT; splashes.material.uniforms.uAmt.value = st.rain;
    mist.userData.mat.uniforms.uT.value = S.t; mist.userData.mat.uniforms.uAmt.value = st.mist;
    mist.children.forEach((m) => { m.rotation.y = Math.atan2(S.cam.pos[0] - m.position.x, S.cam.pos[2] - m.position.z) * 0.6; });
    city.children.forEach((s) => { s.material.opacity = st.bokeh; });
    // машина
    const c = st.car;
    car.visible = c.on > 0;
    if (car.visible) {
      const x = c.dir * (c.p * 130 - 65), z = -36, y = 6.4;
      const toCam = new THREE.Vector3(S.cam.pos[0] - x, 0, S.cam.pos[2] - z).normalize();
      const side = new THREE.Vector3(-toCam.z, 0, toCam.x);
      heads.forEach((s, i) => { s.position.set(x + side.x * s.userData.o * 7, y, z + side.z * s.userData.o * 7); s.material.opacity = c.on * c.head; });
      streaks.forEach((s, i) => { s.position.copy(heads[i].position); s.material.opacity = c.on * c.head * 0.45; });
      tails.forEach((s) => { s.position.set(x - c.dir * 40 + side.x * s.userData.o * 7, 6, z - 2 + side.z * s.userData.o * 7); s.material.opacity = c.on * c.tail; });
      carLight.position.set(x, y, z);
      carLight.intensity = c.on * c.head * 4200;
      carLight.shadow.autoUpdate = true;
      rm.uL.value[2].copy(heads[0].position); rm.uC.value[2].set('#fff1dc').multiplyScalar(c.on * c.head * 1.4);
    } else { carLight.intensity = 0; carLight.shadow.autoUpdate = false; rm.uC.value[2].setRGB(0, 0, 0); }
    sky.intensity = st.lightning * 3.5;
    scene.backgroundIntensity = st.bg * (1 + st.lightning * 5);
  }

  function setSize(w, h, pr) { reflector.getRenderTarget().setSize(Math.round(w * pr * 0.5), Math.round(h * pr * 0.5)); }

  return { reflector, floor: mat, uniforms: U, rain, splashes, mist, city, car, carLight, sky, debris, hideInReflection, update, setSize };
}
