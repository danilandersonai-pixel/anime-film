// dof.js — глубина резкости по законам оптики тонкой линзы (как у камеры в Cycles).
// Радиус кружка рассеяния в пикселях: r = K · |1/D − 1/d|, где D — дистанция фокусировки,
// d — глубина точки, K = 0,03 / (N · tg²(fov/2)) · высота кадра (сцена в масштабе 1:10,
// N — диафрагменное число). Боке — семиугольник, как от 7 лепестков диафрагмы.
// Размытие собирается на половинном разрешении «золотой спиралью» (по Д. Густафссону):
// резкий передний план не «протекает» в размытый фон, яркие точки разворачиваются в диски.
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const DEPTH = `
  uniform sampler2D tDepth; uniform float uNear, uFar, uFocus, uK;
  // перспективная глубина → расстояние вдоль оси камеры
  float viewDist(vec2 uv){ float z = texture2D(tDepth, uv).x; return (uNear * uFar) / (uFar - z * (uFar - uNear)); }
  // знаковый радиус кружка рассеяния (пиксели полного кадра): < 0 — ближе фокуса, > 0 — дальше
  float coc(vec2 uv){ return uK * (1.0 / uFocus - 1.0 / viewDist(uv)); }`;

export class DofPass extends Pass {
  constructor(camera, width, height) {
    super();
    this.camera = camera;
    this.focus = 5; this.fstop = 2.8;
    this.maxRadius = 64;            // пиксели полного кадра
    this.depthTexture = null;
    const half = { type: THREE.HalfFloatType, depthBuffer: false };
    this.rtPre = new THREE.WebGLRenderTarget(1, 1, half);
    this.rtBlur = new THREE.WebGLRenderTarget(1, 1, half);
    const common = () => ({ tDepth: { value: null }, uNear: { value: 0.05 }, uFar: { value: 420 }, uFocus: { value: 5 }, uK: { value: 100 } });
    // 1) половинное разрешение: цвет (среднее 2×2) и знаковый радиус в альфе
    this.pre = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { ...common(), tColor: { value: null }, uTexel: { value: new THREE.Vector2() } },
      vertexShader: VS, depthTest: false, depthWrite: false,
      fragmentShader: `uniform sampler2D tColor; uniform vec2 uTexel; varying vec2 vUv; ${DEPTH}
        void main(){
          vec3 c = vec3(0.0); float cMin = 1e9, cMax = -1e9;
          for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++) {
            vec2 uv = vUv + (vec2(float(i), float(j)) - 0.5) * uTexel;
            c += texture2D(tColor, uv).rgb;
            float r = coc(uv); cMin = min(cMin, r); cMax = max(cMax, r);
          }
          // передний план важнее: берём самый «ближний» радиус, если он заметен
          float r = (-cMin > cMax) ? cMin : cMax;
          gl_FragColor = vec4(c * 0.25, r * 0.5);
        }`,
    }));
    // 1б) плитки 16×16: самый большой кружок в округе — до какого радиуса собирать
    // плитки читаются с линейной фильтрацией: шаг выборки меняется плавно, без «ступенек» на границах
    this.rtTile = new THREE.WebGLRenderTarget(1, 1, { ...half, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.tile = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tPre: { value: null }, uTexel: { value: new THREE.Vector2() } },
      vertexShader: VS, depthTest: false, depthWrite: false,
      fragmentShader: `uniform sampler2D tPre; uniform vec2 uTexel; varying vec2 vUv;
        void main(){
          float m = 0.0;
          for (int j = 0; j < 16; j++) for (int i = 0; i < 16; i++) m = max(m, abs(texture2D(tPre, vUv + (vec2(float(i), float(j)) - 7.5) * uTexel).a));
          gl_FragColor = vec4(m);
        }`,
    }));
    // 2) сбор боке: золотая спираль, вес — попадает ли пиксель в кружок соседа
    this.gather = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tPre: { value: null }, tTile: { value: null }, uTexel: { value: new THREE.Vector2() }, uTileTexel: { value: new THREE.Vector2() }, uMaxR: { value: 32 }, uRot: { value: 0.3 } },
      vertexShader: VS, depthTest: false, depthWrite: false,
      fragmentShader: `uniform sampler2D tPre, tTile; uniform vec2 uTexel, uTileTexel; uniform float uMaxR, uRot; varying vec2 vUv;
        const float BLADES = 7.0, SEG = 6.2831853 / BLADES;
        float aperture(float a){ float x = mod(a + uRot, SEG) - SEG * 0.5; return cos(SEG * 0.5) / cos(x); }
        void main(){
          vec4 c0 = texture2D(tPre, vUv);
          float cs = abs(c0.a);
          vec3 col = c0.rgb; float tot = 1.0;
          // радиус сбора — самый большой кружок по соседству; шаг — чтобы вышло ~200 выборок
          float lim = 0.0;
          for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) lim = max(lim, texture2D(tTile, vUv + vec2(float(i), float(j)) * uTileTexel).r);
          lim = min(lim, uMaxR);
          if (lim < 0.5) { gl_FragColor = vec4(col, cs); return; }
          float uStep = max(0.5, lim * lim / 400.0);
          float radius = uStep, ang = 0.0;
          for (int k = 0; k < 600; k++) {
            if (radius >= lim + 0.5) break;
            vec4 s = texture2D(tPre, vUv + vec2(cos(ang), sin(ang)) * uTexel * radius);
            float ss = abs(s.a);
            if (s.a > c0.a) ss = min(ss, cs * 2.0);   // фон за резким предметом не наползает на него
            float m = smoothstep(radius - 0.5, radius + 0.5, ss * aperture(ang));
            col += mix(col / tot, s.rgb, m);
            tot += 1.0;
            radius += uStep / radius;
            ang += 2.39996323;
          }
          gl_FragColor = vec4(col / tot, cs);
        }`,
    }));
    // 3) полный кадр: резкое там, где кружок меньше пикселя, размытое — где больше
    this.comp = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { ...common(), tColor: { value: null }, tBlur: { value: null } },
      vertexShader: VS, depthTest: false, depthWrite: false,
      fragmentShader: `uniform sampler2D tColor, tBlur; varying vec2 vUv; ${DEPTH}
        void main(){
          vec3 sharp = texture2D(tColor, vUv).rgb;
          vec4 b = texture2D(tBlur, vUv);
          float k = max(smoothstep(0.6, 1.8, abs(coc(vUv))), smoothstep(0.6, 1.8, b.a * 2.0));
          gl_FragColor = vec4(mix(sharp, b.rgb, k), 1.0);
        }`,
    }));
    this.setSize(width, height);
  }

  setSize(w, h) {
    this.width = w; this.height = h;
    const hw = Math.max(1, Math.round(w / 2)), hh = Math.max(1, Math.round(h / 2));
    const tw = Math.ceil(hw / 16), th = Math.ceil(hh / 16);
    this.rtPre.setSize(hw, hh); this.rtBlur.setSize(hw, hh); this.rtTile.setSize(tw, th);
    this.pre.material.uniforms.uTexel.value.set(1 / w, 1 / h);
    this.tile.material.uniforms.uTexel.value.set(1 / hw, 1 / hh);
    this.gather.material.uniforms.uTexel.value.set(1 / hw, 1 / hh);
    this.gather.material.uniforms.uTileTexel.value.set(1 / tw, 1 / th);
  }

  render(renderer, writeBuffer, readBuffer) {
    const cam = this.camera, h = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    const K = 0.03 / (this.fstop * h * h) * this.height;
    const maxR = Math.min(this.maxRadius * this.height / 1080, 96);
    for (const q of [this.pre, this.comp]) {
      const u = q.material.uniforms;
      u.tDepth.value = this.depthTexture; u.uNear.value = cam.near; u.uFar.value = cam.far;
      u.uFocus.value = Math.max(0.02, this.focus); u.uK.value = K;
    }
    this.pre.material.uniforms.tColor.value = readBuffer.texture;
    renderer.setRenderTarget(this.rtPre); this.pre.render(renderer);
    this.tile.material.uniforms.tPre.value = this.rtPre.texture;
    renderer.setRenderTarget(this.rtTile); this.tile.render(renderer);
    const g = this.gather.material.uniforms;
    g.tPre.value = this.rtPre.texture; g.tTile.value = this.rtTile.texture; g.uMaxR.value = maxR / 2;
    renderer.setRenderTarget(this.rtBlur); this.gather.render(renderer);
    const c = this.comp.material.uniforms;
    c.tColor.value = readBuffer.texture; c.tBlur.value = this.rtBlur.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.comp.render(renderer);
  }

  dispose() { this.rtPre.dispose(); this.rtBlur.dispose(); this.rtTile.dispose(); this.pre.dispose(); this.tile.dispose(); this.gather.dispose(); this.comp.dispose(); }
}
