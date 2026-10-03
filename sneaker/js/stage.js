// stage.js — сцена v5: ночная улица (street.js), свет только от того, что светит на улице
// (витрина, натриевый фонарь, неон, молния, фары — как в Blender Cycles), контактная тень,
// оптика (глубина резкости dof.js, дисторсия, хроматизм) и цвет AgX, как у Cycles.
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { HorizontalBlurShader } from 'three/addons/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/addons/shaders/VerticalBlurShader.js';
import { createStreet, BG_YAW } from './street.js';
import { DofPass } from './dof.js';

const SHOE_LAYER = 1;

// финальная обработка в экранном пространстве: хроматическая аберрация по краям,
// мягкая плёночная кривая (приподнятый чёрный, тени холоднее, света теплее),
// виньетка, зерно сильнее в средних тонах, вспышка, затемнение
const FinalShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, flash: { value: 0 }, fade: { value: 0 }, vignette: { value: 0.75 }, grain: { value: 0.04 }, aberr: { value: 0.0016 }, distort: { value: -0.012 }, contrast: { value: 0.28 }, aspect: { value: 16 / 9 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time, flash, fade, vignette, grain, aberr, distort, contrast, aspect; varying vec2 vUv;
    float hash(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
    void main(){
      vec2 c = vUv - 0.5;
      float r2 = dot(c * vec2(aspect, 1.0), c * vec2(aspect, 1.0));
      // бочкообразная дисторсия объектива (как Lens Distortion в Cycles), края подрезаются
      vec2 uv = 0.5 + c * (1.0 + distort * r2) / (1.0 + distort * 0.6);
      vec2 off = c * aberr * (0.5 + r2 * 2.0);
      vec3 col = vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
      col = clamp(col, 0.0, 1.0);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(col, col * col * (3.0 - 2.0 * col), contrast);
      col += vec3(-0.006, 0.0, 0.01) * (1.0 - l) + vec3(0.01, 0.003, -0.008) * l;
      col = col * 0.996 + 0.002;
      col *= mix(1.0, smoothstep(1.35, 0.15, r2 * 1.1), vignette);
      float g = hash(floor(vUv * vec2(1371.0, 771.0)) * 0.73 + fract(time * 7.13) * 91.0) - 0.5;
      col += g * grain * (0.55 + 1.8 * l * (1.0 - l));
      col = mix(col, vec3(1.0), flash);
      col *= 1.0 - fade;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function createStage(canvas, { width = 1920, height = 1080, pixelRatio = 1, asphalt } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  renderer.toneMapping = THREE.AgXToneMapping;    // как «AgX» в Blender: светлое не выгорает в белое
  renderer.toneMappingExposure = Math.pow(2, 0.3); // экспозиция +0,3, как в Cycles
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  RectAreaLightUniformsLib.init();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, width / height, 0.05, 420);
  camera.layers.enable(SHOE_LAYER);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = studioEnv(pmrem);
  scene.environmentIntensity = 0.3;

  // ---- ночной воздух: дальний асфальт тонет в дымке
  scene.fog = new THREE.FogExp2('#0b0d14', 0.006);
  scene.backgroundBlurriness = 0; // фон резкий — размывает его объектив (dof.js)
  scene.backgroundRotation.set(0, BG_YAW, 0);
  scene.environmentRotation.set(0, BG_YAW, 0); // отражения — от того же города, что на фоне

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

  // ---- улица: мокрый асфальт с лужами, дождь, огни, машина, туман
  const street = createStreet({ scene, width, height, pixelRatio, shadow: { texture: rtShadow.texture, size: SH.size }, asphalt });
  // в отражении не нужны мелкие брызги и туман у самой земли
  const reflector = street.reflector, hideInReflection = street.hideInReflection;
  const origBefore = reflector.onBeforeRender;
  reflector.onBeforeRender = function (r, s, c) {
    const st = hideInReflection.map((o) => o.visible);
    hideInReflection.forEach((o) => (o.visible = false));
    origBefore.call(this, r, s, c);
    hideInReflection.forEach((o, i) => (o.visible = st[i]));
  };
  // дождь, брызги, туман и спрайты — не твёрдые тела: их не должно быть в буферах глубины
  for (const o of [street.rain, street.splashes, street.mist, street.traffic, street.car]) o.traverse((x) => { x.userData.soft = true; });

  // ---- свет: только то, что светит на ночной улице. Яркости — в тех же единицах, что в Cycles:
  // площадной — яркость поверхности P/(πA), прожектор — сила света P/(4π), солнце — освещённость.
  const TGT = new THREE.Vector3(0, 0.4, 0);
  const area = (color, w, h, pos) => { const l = new THREE.RectAreaLight(color, 0, w, h); l.position.set(...pos); l.lookAt(TGT); return l; };
  const win = area('#ffdbb8', 6, 4, [2.8, 2.6, 6.8]);              // витрина: тёплый мягкий ключ спереди
  const neonPink = area('#ff4096', 8, 0.35, [-6.8, 2.2, 3.4]);     // неоновая вывеска: розовая трубка
  const neonCyan = area('#40d8ff', 6, 0.3, [-6.5, 3.0, 4.2]);      // и голубая
  const lamp = new THREE.SpotLight('#ffad5c', 0, 0, THREE.MathUtils.degToRad(27.5), 0.6, 2); // натриевый фонарь сзади сверху
  lamp.position.set(-4, 30, -15); lamp.target.position.set(0, 0, 0);
  lamp.castShadow = true; lamp.shadow.mapSize.set(2048, 2048); lamp.shadow.bias = -0.0002; lamp.shadow.normalBias = 0.01;
  lamp.shadow.focus = 0.16; lamp.shadow.radius = 4; lamp.shadow.camera.near = 25; lamp.shadow.camera.far = 45;
  lamp.shadow.camera.layers.set(SHOE_LAYER);
  scene.add(win, neonPink, neonCyan, lamp, lamp.target);
  const lights = { win, neonPink, neonCyan, lamp };
  // свет кадра: L — S.light из timeline5 (window, lamp, neon, env, lightning)
  function setLights(L) {
    win.intensity = 2.0 * L.window;
    lamp.intensity = 637 * L.lamp;
    neonPink.intensity = 13.6 * L.neon; neonCyan.intensity = 14.1 * L.neon;
    const w = 0.17 * L.env * (1 + 5 * L.lightning);
    scene.environmentIntensity = w; scene.backgroundIntensity = w;
  }

  // ---- постобработка
  const Q = new URLSearchParams(location.search);
  const rt = new THREE.WebGLRenderTarget(width * pixelRatio, height * pixelRatio, { type: THREE.HalfFloatType, samples: Q.has('samples') ? Number(Q.get('samples')) : 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(width, height);
  const renderPass = new RenderPass(scene, camera);
  // затенение в щелях и под шнурками
  const gtao = new GTAOPass(scene, camera, width * pixelRatio, height * pixelRatio);
  gtao.output = GTAOPass.OUTPUT.Default;
  gtao.blendIntensity = 1;
  gtao.updateGtaoMaterial({ radius: 0.16, distanceExponent: 1.6, thickness: 1.0, scale: 1.1, samples: 12, distanceFallOff: 1 });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 10 });
  gtao.enabled = !Q.has('noao');
  const ovGtao = gtao.overrideVisibility.bind(gtao);
  gtao.overrideVisibility = function () { ovGtao(); scene.traverse((o) => { if (o.userData.soft) o.visible = false; }); };
  // глубина резкости: глубину даёт проход нормалей GTAO (без дождя и спрайтов)
  const dof = new DofPass(camera, width * pixelRatio, height * pixelRatio);
  dof.depthTexture = gtao.depthTexture;
  const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.32, 0.6, 0.92); // как Fog Glow в Cycles — мягкий ореол у ярких огней
  // широкие слои свечения теплее — как ореол (халация) вокруг бликов на плёнке
  [[1, 1, 1], [1, 0.96, 0.92], [1, 0.88, 0.78], [1, 0.8, 0.66], [1, 0.74, 0.58]].forEach((c, i) => bloom.bloomTintColors[i].set(...c));
  const output = new OutputPass();
  const final = new ShaderPass(FinalShader);
  // композитор рисует только сцену (в линейной яркости); свечение, вывод и обработка — один раз
  // после усреднения подкадров, иначе смаз движения пришлось бы считать пять раз
  composer.renderToScreen = false;
  composer.addPass(renderPass); composer.addPass(gtao); composer.addPass(dof);
  const hdrOpts = { type: THREE.HalfFloatType };
  const accA = new THREE.WebGLRenderTarget(width * pixelRatio, height * pixelRatio, hdrOpts), accB = accA.clone(), ldr = accA.clone();
  const avgMat = new THREE.ShaderMaterial({
    uniforms: { tNew: { value: null }, tAcc: { value: null }, k: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'uniform sampler2D tNew, tAcc; uniform float k; varying vec2 vUv; void main(){ gl_FragColor = mix(texture2D(tAcc, vUv), texture2D(tNew, vUv), k); }',
    depthTest: false, depthWrite: false,
  });
  const avgQuad = new FullScreenQuad(avgMat);

  function setSize(w, h, pr = pixelRatio) {
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    street.setSize(w, h, pr);
    for (const t of [accA, accB, ldr]) t.setSize(Math.round(w * pr), Math.round(h * pr));
    bloom.setSize(Math.round(w * pr), Math.round(h * pr));
    dof.setSize(Math.round(w * pr), Math.round(h * pr));
    final.uniforms.aspect.value = w / h;
  }

  // панорама ночного города: она и фон (размытый, как на длинном объективе), и окружение для отражений
  const env = { tex: null };
  function setEnvironment(tex) {
    scene.environment = pmrem.fromEquirectangular(tex).texture;
    scene.background = tex; // сама панорама — резкая: в боке её превращает объектив
    env.tex = tex;           // её же видно сквозь капли (watermat.js)
  }

  // помечаем меши кроссовка, чтобы их видела камера тени
  function adopt(root) {
    root.traverse((o) => { if (o.isMesh) o.layers.enable(SHOE_LAYER); });
    scene.add(root);
  }

  // n подкадров усредняются — так получается смаз движения, как у камеры с открытым
  // затвором; setSub(i) выставляет сцену на момент i-го подкадра
  function render(t, n = 1, setSub = null) {
    let acc = null;
    for (let i = 0; i < n; i++) {
      if (setSub) setSub(i);
      renderContactShadow(3.2);
      // глубине резкости нужна глубина кадра, даже если затенение в щелях выключено
      if (!gtao.enabled && dof.enabled) { gtao.overrideVisibility(); gtao.renderOverride(renderer, gtao.normalMaterial, gtao.normalRenderTarget, 0x7777ff, 1.0); gtao.restoreVisibility(); }
      composer.render();
      const cur = composer.readBuffer;
      if (n === 1) { acc = cur; break; }
      const dst = acc === accA ? accB : accA;
      avgMat.uniforms.tNew.value = cur.texture; avgMat.uniforms.tAcc.value = (acc || cur).texture; avgMat.uniforms.k.value = 1 / (i + 1);
      renderer.setRenderTarget(dst); avgQuad.render(renderer); acc = dst;
    }
    bloom.render(renderer, null, acc, 0, false);
    output.render(renderer, ldr, acc);
    final.renderToScreen = true;
    final.render(renderer, null, ldr);
  }

  return {
    renderer, scene, camera, composer, adopt, render, setSize, setEnvironment, street,
    lights, setLights, gtao, bloom, dof, final, shadowCam, env,
  };
}

// студийная карта окружения: тёмная комната с софтбоксами — блики как на фотосъёмке
function studioEnv(pmrem) {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), new THREE.MeshBasicMaterial({ color: '#07070a', side: THREE.BackSide })));
  const panel = (w, h, pos, color, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(0, 0.6, 0); env.add(m);
  };
  panel(6, 3, [0.5, 7, 1.2], '#ffffff', 7);      // большой верхний софтбокс
  panel(0.9, 7, [-6.5, 2.6, 1.5], '#f2f6ff', 6); // полоса слева
  panel(0.9, 7, [6.5, 2.6, -1.2], '#fff4ea', 6); // полоса справа
  panel(5, 1.6, [0, 1.6, -7.5], '#ffffff', 1.6); // задний свет
  panel(3.5, 2.4, [2.5, 2.2, 7], '#ffffff', 2.4); // фронтальная заливка
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: '#16161a' }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.5; env.add(floor);
  return pmrem.fromScene(env, 0.0).texture;
}

