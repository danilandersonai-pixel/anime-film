// hdri.js — студийное освещение из настоящей панорамы (HDRI, Poly Haven, CC0).
// Панорама упакована в обычный PNG (tools/pack-hdr.py): верхняя половина —
// мантиссы RGB, нижняя — общий показатель степени. Здесь она распаковывается
// обратно в яркости до сотен единиц и становится текстурой окружения.
import * as THREE from 'three';

// файл как blob; если страница запрещает fetch — через обычную картинку
async function source(url) {
  try { const r = await fetch(url); if (!r.ok) throw new Error(r.status); return await r.blob(); }
  catch (e) { const img = new Image(); img.src = url; await img.decode(); return img; }
}

export async function loadHDRI(url) {
  const bmp = await createImageBitmap(await source(url), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const W = bmp.width, H = bmp.height / 2;
  const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  const px = ctx.getImageData(0, 0, W, H * 2).data;
  const data = new Uint16Array(W * H * 4), toHalf = THREE.DataUtils.toHalfFloat;
  const pow2 = new Float32Array(256).map((_, e) => (e > 0 ? Math.pow(2, e - 136) : 0));
  const one = toHalf(1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, f = pow2[px[((y + H) * W + x) * 4]];
    data[i] = toHalf(px[i] * f); data[i + 1] = toHalf(px[i + 1] * f); data[i + 2] = toHalf(px[i + 2] * f); data[i + 3] = one;
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.flipY = true; // строки идут сверху вниз, как у RGBELoader
  tex.needsUpdate = true;
  return tex;
}
