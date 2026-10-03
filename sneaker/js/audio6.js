// audio6.js — звук v6 «Анатомия»: тёмная студия, механика деталей и музыка 120 уд/мин.
// Всё синтезирует WebAudio в OfflineAudioContext; время каждого звука — из режиссуры
// (timeline6.js) и анатомии (anatomy.js): деталь отщёлкивается, когда начинает лететь,
// и защёлкивается, когда встаёт на место; шнурок «вжикает» через каждую пару блочек;
// бегущий свет звучит мерцанием там, где полоса проходит по кадру.
import { DURATION6, CARD6, LACE_T } from './timeline6.js';
import { PARTS, LACE_STEPS } from './anatomy.js';

export const LENGTH6 = DURATION6;
const N = (m) => 440 * Math.pow(2, (m - 69) / 12);
function rng(seed) { let t = seed >>> 0; return () => { t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), t | 1); r ^= r + Math.imul(r ^ (r >>> 7), r | 61); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }

export async function renderTrack6(sampleRate = 48000) {
  const ctx = new OfflineAudioContext(2, Math.ceil(LENGTH6 * sampleRate), sampleRate);
  build(ctx);
  return ctx.startRendering();
}

// когда детали разлетаются и встают на место (как в timeline6.js)
const EXPLODE_AT = 9.0, ASSEMBLE_AT = 17.0;
const partOut = (i) => (PARTS[i].key === 'laces' ? EXPLODE_AT : EXPLODE_AT + 0.12 * (PARTS.length - 1 - i));
const partIn = (i) => ASSEMBLE_AT + 0.09 * i + 0.34;
// характер звука детали: частота «тела» и материал
const VOICE = {
  outsole: { f: 95, mat: 'rubber' }, foamBottom: { f: 130, mat: 'foam' }, plate: { f: 1850, mat: 'carbon' }, foamTop: { f: 150, mat: 'foam' },
  insole: { f: 210, mat: 'fabric' }, knit: { f: 260, mat: 'fabric' }, heel: { f: 420, mat: 'plastic' }, frame: { f: 620, mat: 'plastic' },
  tongue: { f: 300, mat: 'fabric' }, eyelets: { f: 3150, mat: 'metal' }, laces: { f: 900, mat: 'lace' },
};

function build(ctx) {
  const r = rng(6006), sr = ctx.sampleRate, L = LENGTH6;

  // ---------------------------------------------------------------- шины
  const master = ctx.createGain(), cut = ctx.createBiquadFilter(), comp = ctx.createDynamicsCompressor();
  cut.type = 'highpass'; cut.frequency.value = 28; cut.Q.value = 0.7;
  comp.threshold.value = -14; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.18; comp.knee.value = 6;
  master.connect(cut).connect(comp).connect(ctx.destination);
  master.gain.setValueAtTime(1, 0); master.gain.setValueAtTime(1, 29.35); master.gain.linearRampToValueAtTime(0, L);
  const fx = ctx.createGain(); fx.gain.value = 0.9; fx.connect(master);          // механика и свет
  const musBus = ctx.createGain(); musBus.gain.value = 0.75;
  const musLP = ctx.createBiquadFilter(); musLP.type = 'lowpass'; musLP.frequency.value = 20000; musLP.Q.value = 0.6;
  musBus.connect(musLP).connect(master);
  const tonal = ctx.createGain(), duck = ctx.createGain(); tonal.connect(duck).connect(musBus);
  const mkIR = (dur, decay, pre) => {
    const b = ctx.createBuffer(2, Math.floor(sr * dur), sr), p = Math.floor(pre * sr);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = p; i < d.length; i++) d[i] = (r() * 2 - 1) * Math.pow(1 - (i - p) / (d.length - p), decay); }
    return b;
  };
  const room = ctx.createConvolver(); room.buffer = mkIR(1.1, 3.0, 0.008);   // студия: короткая, сухая
  const roomOut = ctx.createGain(); roomOut.gain.value = 0.28; room.connect(roomOut).connect(master);
  const hall = ctx.createConvolver(); hall.buffer = mkIR(3.6, 2.3, 0.025);  // музыка
  const hallOut = ctx.createGain(); hallOut.gain.value = 0.3; hall.connect(hallOut).connect(musLP);
  const send = (node, bus, amt) => { const g = ctx.createGain(); g.gain.value = amt; node.connect(g).connect(bus); };

  function noiseBuf(kind, sec = 3) {
    const b = ctx.createBuffer(1, sr * sec, sr), d = b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = r() * 2 - 1;
      if (kind === 'white') { d[i] = w; continue; }
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    }
    return b;
  }
  const white = noiseBuf('white', 2), pink = noiseBuf('pink');
  const src = (buf, t, dur) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(Math.max(0, t), r() * 1.2); s.stop(t + dur + 0.05); return s; };
  const env = (g, t, a, peak, d) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(1e-4, peak), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
  const biq = (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const pan = (v) => { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, v)); return p; };
  const osc = (type, f, t, dur) => { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.start(t); o.stop(t + dur + 0.05); return o; };

  // ---------------------------------------------------------------- звуки
  // проход воздуха: шум в полосе, тон и стерео идут за движением камеры
  function whoosh(t, dur, f0, f1, p0, p1, v = 0.3, q = 1.3) {
    const s = src(pink, t, dur), bp = biq('bandpass', f0, q), g = ctx.createGain(), p = ctx.createStereoPanner();
    bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
    p.pan.setValueAtTime(p0, t); p.pan.linearRampToValueAtTime(p1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v * 2.6, t + dur * 0.62); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); // розовый шум в узкой полосе тихий — ×2,6
    s.connect(bp).connect(g).connect(p).connect(fx); send(g, room, 0.4);
  }
  // свет бежит по поверхности: стеклянное мерцание — высокий воздух и чистые обертоны
  function shimmer(t, dur, p0, p1, v = 0.12) {
    const s = src(white, t, dur), bp = biq('bandpass', 6000, 2.5), g = ctx.createGain(), p = ctx.createStereoPanner();
    bp.frequency.setValueAtTime(5200, t); bp.frequency.exponentialRampToValueAtTime(10500, t + dur * 0.5); bp.frequency.exponentialRampToValueAtTime(6200, t + dur);
    p.pan.setValueAtTime(p0, t); p.pan.linearRampToValueAtTime(p1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + dur * 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bp).connect(g).connect(p).connect(fx); send(g, hall, 0.5);
    for (const [m, k] of [[88, 1], [95, 0.6], [100, 0.35]]) {
      const o = osc('sine', N(m), t, dur), og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(v * 0.11 * k, t + dur * 0.5); og.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(og).connect(p); send(og, hall, 0.7);
    }
  }
  // щелчок: короткий удар шума и «тело» детали (резонанс своей частоты)
  function click(t, f, v, pn = 0, mat = 'plastic') {
    const s = src(white, t, 0.04), g = ctx.createGain(), hp = biq('highpass', mat === 'metal' ? 4000 : 1800);
    env(g, t, 0.0006, v * (mat === 'foam' || mat === 'fabric' ? 0.35 : 0.8), mat === 'metal' ? 0.012 : 0.02);
    s.connect(hp).connect(g).connect(pan(pn)).connect(fx); send(g, room, 0.5);
    const dec = { metal: 0.45, carbon: 0.28, plastic: 0.09, rubber: 0.16, foam: 0.12, fabric: 0.08, lace: 0.06 }[mat] || 0.1;
    for (const [k, a] of mat === 'metal' ? [[1, 1], [2.76, 0.5], [5.4, 0.25]] : mat === 'carbon' ? [[1, 1], [2.3, 0.4]] : [[1, 1], [1.5, 0.3]]) {
      const o = osc('sine', f * k, t, dec + 0.05), og = ctx.createGain();
      if (mat === 'rubber' || mat === 'foam') o.frequency.exponentialRampToValueAtTime(f * k * 0.6, t + dec);
      env(og, t, 0.001, v * a * (mat === 'metal' ? 0.18 : 0.5), dec);
      o.connect(og).connect(pan(pn)).connect(fx); send(og, room, 0.35);
    }
  }
  // шнурок продевается: трение по блочке — шум с быстрой «тресклой» модуляцией и тон вверх
  function zip(t, dur, pn, v = 0.18) {
    const s = src(white, t, dur), bp = biq('bandpass', 1400, 1.6), g = ctx.createGain(), am = ctx.createGain();
    bp.frequency.setValueAtTime(1100, t); bp.frequency.exponentialRampToValueAtTime(3400, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + dur * 0.25); g.gain.setValueAtTime(v, t + dur * 0.75); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lfo = osc('square', 38, t, dur), lg = ctx.createGain(); lg.gain.value = 0.45; am.gain.value = 0.55;
    lfo.frequency.linearRampToValueAtTime(70, t + dur); lfo.connect(lg).connect(am.gain);
    s.connect(bp).connect(am).connect(g).connect(pan(pn)).connect(fx); send(g, room, 0.3);
  }

  // ---------------------------------------------------------------- музыка (120 уд/мин, ми минор)
  function kick(t, v = 1) {
    const o = osc('sine', 150, t, 0.4), g = ctx.createGain();
    o.frequency.exponentialRampToValueAtTime(44, t + 0.1);
    env(g, t, 0.003, 0.5 * v, 0.3); o.connect(g).connect(musBus);
    const c = src(white, t, 0.02), cg = ctx.createGain(); env(cg, t, 0.001, 0.15 * v, 0.012);
    c.connect(biq('highpass', 3500)).connect(cg).connect(musBus);
    duck.gain.setValueAtTime(0.42, t); duck.gain.linearRampToValueAtTime(1, t + 0.24);
  }
  const shaper = ctx.createWaveShaper();
  shaper.curve = Float32Array.from({ length: 1024 }, (_, i) => Math.tanh(2.2 * (i / 511.5 - 1)));
  const subOut = ctx.createGain(); subOut.gain.value = 0.16; shaper.connect(subOut).connect(musBus);
  function sub(t, m, dur, v = 0.5) {
    const o = osc('sine', N(m), t, dur), g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.006);
    g.gain.setValueAtTime(v, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(shaper);
  }
  function clap(t, v = 0.35) {
    for (let i = 0; i < 3; i++) {
      const s = src(white, t + i * 0.011, 0.2), g = ctx.createGain();
      env(g, t + i * 0.011, 0.001, v * (i === 2 ? 1 : 0.55), i === 2 ? 0.16 : 0.02);
      s.connect(biq('bandpass', 1500, 0.9)).connect(g).connect(musBus); send(g, hall, 0.35);
    }
  }
  function hat(t, v = 0.05, open = false, pn = 0.2) {
    const s = src(white, t, open ? 0.3 : 0.06), g = ctx.createGain();
    env(g, t, 0.001, v, open ? 0.2 : 0.035);
    s.connect(biq('highpass', 8000)).connect(g).connect(pan(pn)).connect(musBus);
  }
  function pad(t, dur, notes, v = 0.016, a = 0.5, cutoff = 1300) {
    for (const m of notes) for (const det of [-8, 7]) {
      const o = osc('sawtooth', N(m), t, dur), g = ctx.createGain(); o.detune.value = det;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + a);
      g.gain.setValueAtTime(v, Math.max(t + a, t + dur - 0.4)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(biq('lowpass', cutoff)).connect(g).connect(tonal); send(g, hall, 0.5);
    }
  }
  function pluck(t, m, v = 0.04, cutoff = 2600) {
    const o = osc('triangle', N(m), t, 0.4), f = biq('lowpass', cutoff, 2), g = ctx.createGain();
    f.frequency.setValueAtTime(cutoff, t); f.frequency.exponentialRampToValueAtTime(300, t + 0.25);
    env(g, t, 0.002, v, 0.32); o.connect(f).connect(g).connect(tonal); send(g, hall, 0.55);
  }
  function bell(t, m, v = 0.08, dur = 3) {
    const c = osc('sine', N(m), t, dur), mo = osc('sine', N(m) * 3.5, t, dur), mg = ctx.createGain(), g = ctx.createGain();
    mg.gain.setValueAtTime(N(m) * 2, t); mg.gain.exponentialRampToValueAtTime(1, t + dur * 0.6);
    mo.connect(mg).connect(c.frequency); env(g, t, 0.002, v, dur);
    c.connect(g).connect(tonal); send(g, hall, 0.7);
  }
  function crash(t, v = 0.12, dur = 2.4) {
    const s = src(white, t, dur), g = ctx.createGain();
    env(g, t, 0.002, v, dur); s.connect(biq('highpass', 4500)).connect(g).connect(musBus); send(g, hall, 0.5);
  }
  function riser(t1, dur, v = 0.08) {
    const t = t1 - dur, s = src(white, t, dur), bp = biq('bandpass', 400, 1.2), g = ctx.createGain();
    bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(7000, t1);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t1 - 0.02); g.gain.linearRampToValueAtTime(0, t1);
    s.connect(bp).connect(g).connect(musBus); send(g, hall, 0.3);
  }

  const CH = { em: [52, 55, 59, 66], c: [48, 55, 59, 64], g: [50, 55, 59, 62], d: [50, 54, 57, 62] };
  const BASS = { em: 28, c: 24, g: 31, d: 26 };
  const PROG = ['em', 'c', 'g', 'd'];
  // грув в половинном темпе: бочка, хлопок на «три», хэты восьмыми; T — начало такта
  function bar(T, ch, { full = true, hats = true } = {}) {
    kick(T, 1); if (full) { kick(T + 0.75, 0.75); if (T % 4 === 0) kick(T + 1.25, 0.6); }
    sub(T, BASS[ch], 0.7, 0.5); if (full) sub(T + 0.75, BASS[ch], 0.45, 0.42);
    clap(T + 1, full ? 0.36 : 0.26);
    if (hats) for (let i = 0; i < 8; i++) hat(T + i * 0.25, i % 2 ? 0.035 : 0.055, i === 7, i % 2 ? 0.25 : -0.15);
    pad(T, 2.05, CH[ch], 0.014, 0.1, 1500);
  }

  // ---- 0–3: темнота, низкий гул; свет обводит силуэт — мерцание слева направо
  pad(0.1, 3.1, [40, 47, 52], 0.012, 1.6, 700);
  sub(0.2, 28, 2.8, 0.25);
  shimmer(0.4, 2.4, -0.8, 0.8, 0.1);
  // ---- 3–7: макро вдоль кроссовка — тихий пульс, свет дважды проходит по ткани
  for (let T = 3; T < 7; T += 1) { kick(T, 0.4); hat(T + 0.5, 0.03); }
  [[3, 'em'], [5, 'c']].forEach(([T, ch]) => { pad(T, 2.05, CH[ch], 0.012, 0.3, 1000); for (let i = 0; i < 8; i++) pluck(T + i * 0.25, CH[ch][[0, 2, 1, 3, 2, 1, 3, 2][i]] + 12, 0.026, 1200 + i * 80); });
  whoosh(3.0, 4.0, 300, 900, -0.5, 0.5, 0.05, 0.7);           // камера плывёт вдоль ткани
  for (const c of [4.0, 6.0]) shimmer(c - 0.7, 1.4, 0.6, -0.6, 0.11);
  // ---- 7–9: отъезд и оборот — свист вокруг, подъём; разгон перед разбором
  whoosh(7.0, 1.7, 500, 2600, -0.9, 0.9, 0.24);
  whoosh(7.9, 1.1, 200, 1200, 0, 0, 0.12, 0.9);
  riser(9.0, 1.6, 0.13);
  // низкий нарастающий гул под оборот и взлёт: фильтр открывается к удару
  for (const m of [28, 40, 47]) { const o = osc('sawtooth', N(m), 7.0, 2.0), lp = biq('lowpass', 120, 1.2), g = ctx.createGain(); lp.frequency.setValueAtTime(120, 7.0); lp.frequency.exponentialRampToValueAtTime(1800, 8.98); g.gain.setValueAtTime(0.0001, 7.0); g.gain.exponentialRampToValueAtTime(0.035, 8.9); g.gain.linearRampToValueAtTime(0, 9.0); o.connect(lp).connect(g).connect(musBus); send(g, hall, 0.3); }
  for (let t = 8.0, d = 0.25; t < 9; t += d, d = Math.max(0.0625, d * 0.82)) hat(t, 0.025 + (t - 8) * 0.04);
  // ---- 9: удар — детали разлетаются, каждая отщёлкивается своим звуком
  kick(9.0, 1.3); sub(9.0, 28, 2.0, 0.6); crash(9.0, 0.14, 2.6);
  PARTS.forEach((p, i) => {
    const t = partOut(i), v = VOICE[p.key], pn = (i % 2 ? 0.35 : -0.35);
    click(t, v.f, 0.5, pn, v.mat);
    whoosh(t, 0.55, 2400, 500, pn, pn * 0.3, 0.07);
    if (v.mat === 'metal') for (let k = 1; k < 6; k++) click(t + k * 0.035 + r() * 0.02, v.f * (0.9 + 0.25 * r()), 0.2, (r() - 0.5) * 0.8, 'metal');
  });
  // ---- 9–17: грув под разбор и облёт
  for (let T = 10; T < 16; T += 2) bar(T, PROG[((T - 10) / 2) % 4]);
  // подписи появляются по очереди — тихие «точки» по нотам аккорда
  PARTS.forEach((p, i) => pluck(11.0 + 0.14 * i + 0.05, [76, 79, 83, 86][i % 4] + (i > 7 ? 12 : 0), 0.022, 3200));
  shimmer(12.1, 1.8, -0.9, 0.9, 0.09);                         // полоса света проходит по разрезу
  whoosh(14.0, 2.2, 400, 3000, 0.9, -0.9, 0.3, 1.0);           // быстрый облёт вокруг
  whoosh(15.2, 1.0, 3000, 600, -0.6, 0.6, 0.16);
  // ---- 16–17: наезд на карбон — музыка уходит, блик бежит по пластине
  bar(16, 'd', { full: false, hats: false });
  musLP.frequency.setValueAtTime(20000, 16.15); musLP.frequency.exponentialRampToValueAtTime(700, 16.4);
  shimmer(16.3, 0.75, -0.7, 0.7, 0.13);
  // ---- 17–19: сборка: шнурки улетают, детали защёлкиваются каскадом, кроссовок садится
  whoosh(16.95, 0.6, 600, 4000, 0, 0.2, 0.18);
  PARTS.forEach((p, i) => { if (p.key === 'laces') return; const v = VOICE[p.key]; click(partIn(i), v.f * 1.2, 0.7, (i % 2 ? 0.25 : -0.25), v.mat === 'foam' || v.mat === 'fabric' ? 'plastic' : v.mat); });
  musLP.frequency.setValueAtTime(700, 18.2); musLP.frequency.exponentialRampToValueAtTime(20000, 18.9);
  click(18.8, 90, 0.6, 0, 'rubber');                            // приземление на пол
  sub(18.8, 28, 0.6, 0.35);
  // ---- 19–23,5: шнуровка — каждый шаг на долю: «вжик» через блочки и тик металла
  const step = (LACE_T[1] - LACE_T[0]) / LACE_STEPS;
  for (let k = 0; k < LACE_STEPS; k++) {
    const t = LACE_T[0] + k * step;
    if (k === 0) zip(t, step * 0.9, 0, 0.16);
    else if (k < LACE_STEPS - 1) { zip(t, step * 0.85, -0.4, 0.14); zip(t + 0.02, step * 0.85, 0.4, 0.14); }
    else { zip(t, step * 0.6, -0.2, 0.12); zip(t + 0.1, step * 0.6, 0.2, 0.12); }
    click(t + step * 0.92, 3000 + 140 * k, 0.28, k % 2 ? 0.3 : -0.3, 'metal');
    kick(t, 0.55); hat(t + 0.25, 0.035);
    if (k % 2 === 0) sub(t, BASS[PROG[(k / 2) % 4]], 0.9, 0.38);
  }
  pad(LACE_T[0], 2.05, CH.em, 0.012, 0.2, 1100); pad(LACE_T[0] + 2, 2.55, CH.g, 0.012, 0.2, 1300);
  click(LACE_T[1] - 0.05, 700, 0.45, 0, 'plastic');            // бант затянулся
  // ---- 23,5–24: подъём перед финальным оборотом
  riser(24.0, 0.7, 0.08);
  // ---- 24–27,5: оборот на 360° — второй удар, полный грув, свет проходит спереди
  kick(24.0, 1.2); crash(24.0, 0.12, 2.2);
  bar(24, 'em'); bar(26, 'c');
  whoosh(24.0, 3.3, 300, 1400, -0.7, 0.7, 0.12, 0.8);
  shimmer(24.4, 2.8, -0.9, 0.9, 0.1);
  // ---- 27,5–30: финальный аккорд, колокольчики на карточке, затухание
  kick(27.5, 1.0); sub(27.5, 28, 2.4, 0.5);
  pad(27.5, 2.6, [40, 52, 55, 59, 62, 66], 0.018, 0.05, 1600);
  bell(CARD6, 83, 0.085, 3); bell(CARD6 + 0.22, 88, 0.065, 3);
  shimmer(28.1, 1.5, -0.4, 0.4, 0.06);
}
