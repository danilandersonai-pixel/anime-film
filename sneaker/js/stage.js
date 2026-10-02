// stage.js — студия: свет, пол-зеркало с мягкой тенью, фон, эффекты, постобработка.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { HorizontalBlurShader } from 'three/addons/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/addons/shaders/VerticalBlurShader.js';

const SHOE_LAYER = 1;

// финальная обработка в экранном пространстве: виньетка, зерно,
// хроматическая аберрация по краям, вспышка, затемнение
const FinalShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, flash: { value: 0 }, fade: { value: 0 }, vignette: { value: 0.9 }, grain: { value: 0.045 }, aberr: { value: 0.0018 }, aspect: { value: 16 / 9 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time, flash, fade, vignette, grain, aberr, aspect; varying vec2 vUv;
    float hash(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
    void main(){
      vec2 c = vUv - 0.5;
      float r2 = dot(c * vec2(aspect, 1.0), c * vec2(aspect, 1.0));
      vec2 off = c * aberr * (0.5 + r2 * 2.0);
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      col *= mix(1.0, smoothstep(1.35, 0.15, r2 * 1.1), vignette);
      float g = hash(vUv * 1024.0 + fract(time * 7.13) * 91.0) - 0.5;
      col += g * grain * (1.0 - col * 0.6);
      col = mix(col, vec3(1.0), flash);
      col *= 1.0 - fade;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function createStage(canvas, { width = 1920, height = 1080, pixelRatio = 1 } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  RectAreaLightUniformsLib.init();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, width / height, 0.05, 150);
  camera.layers.enable(SHOE_LAYER);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.3;

  // ---- фон: тёмная циклорама со свечением
  const bgMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { base: { value: new THREE.Color('#0b0c10') }, glow: { value: new THREE.Color('#ff5a1f') }, glowDir: { value: new THREE.Vector3(0.3, 0.15, -1).normalize() }, glowAmt: { value: 0.5 }, glowPow: { value: 3.2 }, glow2: { value: new THREE.Color('#2a6dff') }, glow2Dir: { value: new THREE.Vector3(-1, 0.4, -0.4).normalize() }, glow2Amt: { value: 0.15 } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform vec3 base, glow, glow2, glowDir, glow2Dir; uniform float glowAmt, glowPow, glow2Amt; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float g = pow(max(dot(d, glowDir), 0.0), glowPow), g2 = pow(max(dot(d, glow2Dir), 0.0), 5.0);
        float above = smoothstep(-0.03, 0.22, d.y);
        vec3 col = base * (0.55 + 0.45 * smoothstep(-0.2, 0.5, d.y)) + (glow * g * glowAmt + glow2 * g2 * glow2Amt) * above;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const bg = new THREE.Mesh(new THREE.SphereGeometry(60, 48, 24), bgMat);
  scene.add(bg);

  // ---- контактная тень: глубина снизу, размытая (как в примере three.js)
  const SH = { size: 7, height: 1.6 };
  const rtShadow = new THREE.WebGLRenderTarget(512, 512), rtBlur = new THREE.WebGLRenderTarget(512, 512);
  rtShadow.texture.generateMipmaps = rtBlur.texture.generateMipmaps = false;
  const shadowCam = new THREE.OrthographicCamera(-SH.size / 2, SH.size / 2, SH.size / 2, -SH.size / 2, 0, SH.height);
  shadowCam.rotation.x = Math.PI / 2;
  shadowCam.layers.set(SHOE_LAYER);
  const depthMat = new THREE.MeshDepthMaterial();
  depthMat.userData.darkness = { value: 1.6 };
  depthMat.onBeforeCompile = (sh) => {
    sh.uniforms.darkness = depthMat.userData.darkness;
    sh.fragmentShader = 'uniform float darkness;\n' + sh.fragmentShader.replace('gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );', 'gl_FragColor = vec4( vec3( 0.0 ), ( 1.0 - fragCoordZ ) * darkness );');
  };
  depthMat.depthTest = false; depthMat.depthWrite = false;
  const blurPlane = new THREE.Mesh(new THREE.PlaneGeometry(SH.size, SH.size).rotateX(Math.PI / 2));
  const hBlur = new THREE.ShaderMaterial(HorizontalBlurShader), vBlur = new THREE.ShaderMaterial(VerticalBlurShader);
  hBlur.depthTest = vBlur.depthTest = false;
  function renderContactShadow(blur) {
    const bgVis = scene.background, ca = renderer.getClearAlpha();
    scene.background = null;
    scene.overrideMaterial = depthMat;
    renderer.setClearAlpha(0);
    renderer.setRenderTarget(rtShadow); renderer.clear();
    renderer.render(scene, shadowCam);
    scene.overrideMaterial = null;
    for (const amt of [blur, blur * 0.45]) {
      blurPlane.material = hBlur; hBlur.uniforms.tDiffuse.value = rtShadow.texture; hBlur.uniforms.h.value = amt / 256;
      renderer.setRenderTarget(rtBlur); renderer.render(blurPlane, shadowCam);
      blurPlane.material = vBlur; vBlur.uniforms.tDiffuse.value = rtBlur.texture; vBlur.uniforms.v.value = amt / 256;
      renderer.setRenderTarget(rtShadow); renderer.render(blurPlane, shadowCam);
    }
    renderer.setRenderTarget(null);
    renderer.setClearAlpha(ca);
    scene.background = bgVis;
  }

  // ---- пол: чёрный глянец с отражением (Reflector рисует отражение, шейдер — свой)
  const reflector = new Reflector(new THREE.PlaneGeometry(40, 40), { textureWidth: Math.round(width * pixelRatio * 0.5), textureHeight: Math.round(height * pixelRatio * 0.5), clipBias: 0.002 });
  const texMatrix = reflector.material.uniforms.textureMatrix.value;
  const floorMat = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: reflector.getRenderTarget().texture }, textureMatrix: { value: texMatrix }, tShadow: { value: rtShadow.texture },
      shadowSize: { value: SH.size }, shadowOpacity: { value: 0.95 }, floorColor: { value: new THREE.Color('#0a0b0e') }, horizon: { value: new THREE.Color('#0b0c10').multiplyScalar(0.62) },
      spotColor: { value: new THREE.Color('#ffffff') }, spot: { value: 0.05 }, reflect: { value: 0.55 }, blur: { value: 0.0016 },
      ring: { value: 0 }, ringR: { value: 0 }, ringColor: { value: new THREE.Color('#ff6a2a') },
    },
    vertexShader: `
      uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vWorld;
      void main(){ vUv = textureMatrix * vec4(position, 1.0); vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform sampler2D tDiffuse, tShadow; uniform vec3 floorColor, horizon, spotColor, ringColor;
      uniform float shadowSize, shadowOpacity, spot, reflect, blur, ring, ringR;
      varying vec4 vUv; varying vec3 vWorld;
      void main(){
        vec2 uv = vUv.xy / vUv.w;
        vec3 refl = vec3(0.0);
        for (int i = -2; i <= 2; i++) for (int j = -2; j <= 2; j++) refl += texture2D(tDiffuse, uv + vec2(float(i), float(j)) * blur).rgb;
        refl /= 25.0;
        float d = length(vWorld.xz);
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = 0.06 + 0.94 * pow(1.0 - max(V.y, 0.0), 5.0);
        float fade = 1.0 - smoothstep(2.0, 11.0, d);
        vec3 col = floorColor + spotColor * spot * exp(-d * d / 4.0);
        col += refl * reflect * mix(0.35, 1.0, fres) * fade;
        vec2 suv = vWorld.xz / shadowSize + 0.5;
        float sa = 0.0;
        if (suv.x > 0.0 && suv.x < 1.0 && suv.y > 0.0 && suv.y < 1.0) sa = texture2D(tShadow, suv).a;
        col *= 1.0 - clamp(sa, 0.0, 1.0) * shadowOpacity;
        // кольцо-волна от приземления
        float rr = abs(d - ringR);
        col += ringColor * ring * (exp(-rr * rr / 0.004) * 1.5 + exp(-rr * rr / 0.05) * 0.4);
        col = mix(col, horizon, smoothstep(5.0, 16.0, d));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  reflector.material = floorMat;
  reflector.rotation.x = -Math.PI / 2;
  scene.add(reflector);
  // в отражении не нужны вспомогательные плоскости
  const hideInReflection = [];
  const origBefore = reflector.onBeforeRender;
  reflector.onBeforeRender = function (r, s, c) {
    const st = hideInReflection.map((o) => o.visible);
    hideInReflection.forEach((o) => (o.visible = false));
    origBefore.call(this, r, s, c);
    hideInReflection.forEach((o, i) => (o.visible = st[i]));
  };

  // ---- свет
  const key = new THREE.RectAreaLight('#fff4ea', 5, 3.2, 1.6);
  key.position.set(1.2, 4.2, 3.4); key.lookAt(0, 0.4, 0);
  const rimL = new THREE.RectAreaLight('#3d8bff', 14, 0.35, 3.2);
  rimL.position.set(-3.2, 1.6, -2.4); rimL.lookAt(0, 0.6, 0);
  const rimR = new THREE.RectAreaLight('#ff6a2a', 16, 0.35, 3.2);
  rimR.position.set(3.4, 1.5, -2.2); rimR.lookAt(0, 0.6, 0);
  const sweep = new THREE.RectAreaLight('#ffffff', 0, 0.12, 2.6);
  sweep.position.set(0, 1.4, 2.2); sweep.lookAt(0, 0.5, 0);
  const sun = new THREE.DirectionalLight('#ffffff', 0.9);
  sun.position.set(1.5, 5, 2.5); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.01;
  Object.assign(sun.shadow.camera, { left: -2.2, right: 2.2, top: 2.2, bottom: -2.2, near: 0.5, far: 12 });
  sun.shadow.camera.layers.set(SHOE_LAYER);
  scene.add(key, rimL, rimR, sweep, sun, sun.target);

  // светящиеся полосы позади (дают блики в полу и в глянце)
  const barMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff6a2a').multiplyScalar(4) });
  const barMat2 = new THREE.MeshBasicMaterial({ color: new THREE.Color('#3d8bff').multiplyScalar(3) });
  const bars = [new THREE.Mesh(new THREE.PlaneGeometry(0.06, 6), barMat), new THREE.Mesh(new THREE.PlaneGeometry(0.06, 6), barMat2)];
  bars[0].position.set(5.6, 3, -8.5); bars[1].position.set(-5.8, 3, -8.8);
  bars.forEach((b) => scene.add(b));
  // полоса света, которая пробегает в начале ролика
  const sweepBar = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 3.2), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff').multiplyScalar(6), transparent: true }));
  scene.add(sweepBar);
  hideInReflection.push(sweepBar);

  // ---- огромная надпись на фоне
  const bigText = makeBigText();
  bigText.position.set(0, 1.25, -3.6);
  scene.add(bigText);

  // ---- скоростные штрихи (план «бег»)
  const N = 220, streakGeo = new THREE.PlaneGeometry(1, 0.008);
  const streakMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd2b8').multiplyScalar(1.6), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const streaks = new THREE.InstancedMesh(streakGeo, streakMat, N);
  const srng = mulberry(77), seeds = [];
  for (let i = 0; i < N; i++) { const low = srng() < 0.25; seeds.push([srng() * 20 - 10, low ? 0.01 + srng() * 0.05 : 0.15 + srng() * 2.4, low ? -1.5 + srng() * 3.5 : -7 + srng() * 5.6, 0.4 + srng() * 1.4, srng()]); }
  scene.add(streaks);
  hideInReflection.push(streaks);
  const dummy = new THREE.Object3D();
  function setStreaks(t, amt) {
    streakMat.opacity = amt * 0.55;
    streaks.visible = amt > 0.01;
    if (!streaks.visible) return;
    seeds.forEach((s, i) => {
      const x = ((s[0] - t * 14 * (0.6 + s[4]) + 1000) % 20) - 10;
      dummy.position.set(x, s[1], s[2]);
      dummy.scale.set(s[3] * (0.5 + amt), 1 + s[4] * 2, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      streaks.setMatrixAt(i, dummy.matrix);
    });
    streaks.instanceMatrix.needsUpdate = true;
  }

  // ---- постобработка
  const Q = new URLSearchParams(location.search);
  const rt = new THREE.WebGLRenderTarget(width * pixelRatio, height * pixelRatio, { type: THREE.HalfFloatType, samples: Q.has('samples') ? Number(Q.get('samples')) : 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(width, height);
  const renderPass = new RenderPass(scene, camera);
  const bokeh = new BokehPass(scene, camera, { focus: 3, aperture: 0.002, maxblur: 0.006 });
  bokeh.enabled = false;
  const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.5, 0.6, 0.85);
  const output = new OutputPass();
  const final = new ShaderPass(FinalShader);
  composer.addPass(renderPass); composer.addPass(bokeh); composer.addPass(bloom); composer.addPass(output); composer.addPass(final);

  function setSize(w, h, pr = pixelRatio) {
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    reflector.getRenderTarget().setSize(Math.round(w * pr * 0.5), Math.round(h * pr * 0.5));
    final.uniforms.aspect.value = w / h;
  }

  // помечаем меши кроссовка, чтобы их видела камера тени
  function adopt(root) {
    root.traverse((o) => { if (o.isMesh) o.layers.enable(SHOE_LAYER); });
    scene.add(root);
  }

  function render(t) {
    renderContactShadow(3.2);
    composer.render();
  }

  return {
    renderer, scene, camera, composer, adopt, render, setSize, setStreaks,
    lights: { key, rimL, rimR, sweep, sun }, bars, barMats: [barMat, barMat2], sweepBar, bigText, bg: bgMat, floor: floorMat, bloom, bokeh, final, shadowCam,
  };
}

function mulberry(seed) { let t = seed >>> 0; return () => { t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), t | 1); r ^= r + Math.imul(r ^ (r >>> 7), r | 61); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }

// огромная контурная надпись «PULSE ONE» за кроссовком
function makeBigText() {
  const c = document.createElement('canvas'); c.width = 2048; c.height = 512;
  const ctx = c.getContext('2d');
  ctx.font = '800 300px "Unbounded", "Manrope", Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 5; ctx.strokeStyle = '#fff';
  ctx.strokeText('PULSE ONE', 1024, 270);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.25), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, color: new THREE.Color('#ffffff') }));
  m.userData.redraw = () => {
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.font = '800 300px "Unbounded", "Manrope", Arial, sans-serif';
    ctx.strokeText('PULSE ONE', 1024, 270);
    tex.needsUpdate = true;
  };
  return m;
}
