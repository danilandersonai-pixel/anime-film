// watermat.js — материал воды для капель: капля — шаровая линза (n = 1,333).
// Луч входит, преломляется, выходит с другой стороны и приносит перевёрнутое
// изображение ночного города (сама панорама HDRI) — как в Cycles. Сверху — отражение
// по Френелю и острые блики от фонаря, витрины, неона и фар.
// surface = true — капля на ткани: сквозь неё видна сама поверхность, поэтому материал
// только добавляет отражение и блики (аддитивно), а не рисует город насквозь.
import * as THREE from 'three';

export function createWaterMaterial({ surface = false, tint = '#e8f2ff' } = {}) {
  const U = {
    tEnv: { value: null }, uRot: { value: new THREE.Matrix3() }, uEnv: { value: 0.06 },
    uRefract: { value: surface ? 0 : 1 }, uSpec: { value: surface ? 0.3 : 1 }, uTint: { value: new THREE.Color(tint) },
    uLP: { value: Array.from({ length: 4 }, () => new THREE.Vector4()) },  // позиция, острота блика
    uLC: { value: Array.from({ length: 4 }, () => new THREE.Color(0, 0, 0)) },
  };
  const m = new THREE.ShaderMaterial({
    uniforms: U,
    ...(surface ? { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false } : {}),
    vertexShader: `
      varying vec3 vW, vN, vC;
      void main(){
        mat4 M = modelMatrix;
        #ifdef USE_INSTANCING
          M = modelMatrix * instanceMatrix;
        #endif
        vec4 w = M * vec4(position, 1.0);
        vW = w.xyz; vC = (M * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vN = normalize(mat3(M) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      uniform sampler2D tEnv; uniform mat3 uRot; uniform float uEnv, uRefract, uSpec; uniform vec3 uTint;
      uniform vec4 uLP[4]; uniform vec3 uLC[4];
      varying vec3 vW, vN, vC;
      vec3 env(vec3 d){
        d = uRot * d;
        vec2 uv = vec2(atan(d.z, d.x) * 0.15915494 + 0.5, asin(clamp(d.y, -1.0, 1.0)) * 0.31830989 + 0.5);
        return texture2D(tEnv, uv).rgb * uEnv;
      }
      void main(){
        vec3 V = normalize(vW - cameraPosition);
        vec3 N = normalize(vN);
        if (dot(N, V) > 0.0) N = -N;
        // вход в каплю
        vec3 T1 = refract(V, N, 1.0 / 1.333);
        // выход: противоположная точка хорды единичной сферы
        vec3 Ne = normalize(N + T1 * (-2.0 * dot(T1, N)));
        vec3 T2 = refract(T1, -Ne, 1.333);
        if (dot(T2, T2) < 1e-4) T2 = reflect(T1, -Ne);
        // снизу у капли — асфальт: всё, что ниже горизонта, темнеет
        vec3 through = env(T2) * mix(0.08, 1.0, smoothstep(-0.06, 0.04, T2.y));
        vec3 R = reflect(V, N);
        vec3 refl = env(R) * mix(0.1, 1.0, smoothstep(-0.06, 0.04, R.y));
        float F = 0.02 + 0.98 * pow(1.0 - clamp(dot(-V, N), 0.0, 1.0), 5.0);
        vec3 col = through * uTint * (1.0 - F) * uRefract + refl * F;
        for (int k = 0; k < 4; k++) {
          vec3 L = normalize(uLP[k].xyz - vW);
          col += uLC[k] * pow(max(dot(R, L), 0.0), uLP[k].w) * (0.25 + F) * uSpec;
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  m.userData.uniforms = U;
  return m;
}

// общие для всех капель: панорама, её поворот, яркость и блики от источников
export function updateWaterMaterials(mats, { envTex, yaw, envIntensity, lights }) {
  const rot = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationY(-yaw));
  for (const m of mats) {
    const U = m.userData.uniforms;
    U.tEnv.value = envTex; U.uRot.value.copy(rot); U.uEnv.value = envIntensity;
    for (let k = 0; k < 4; k++) {
      const l = lights[k];
      if (l) { U.uLP.value[k].set(l[0].x, l[0].y, l[0].z, l[2]); U.uLC.value[k].copy(l[1]); } else U.uLC.value[k].setRGB(0, 0, 0);
    }
  }
}
