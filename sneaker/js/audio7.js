// audio7.js — звук v7 «Кристаллы»: холодный туманный мир, полёт и тёплое гнездо из кристаллов.
// Всё синтезирует WebAudio в OfflineAudioContext; время каждого звука — из режиссуры
// (timeline7.js). До касания (9 с) — эмбиент без доли: ветер, плеск, гул, капля, пролёт мимо
// камеры с эффектом Доплера, «бочка», вдох перед ударом. Касание — удар и звон кристаллов,
// дальше пульс 90 уд/мин (PULSE): монтаж идёт по долям, шары всплывают с «бульком»,
// финальный аккорд и колокольчики на надписи.
import { DURATION7, LAND_T, BEAT, SHOTS7, LOGO_T, DROP_T, ORBS7 } from './timeline7.js';

export const LENGTH7 = DURATION7;
const N = (m) => 440 * Math.pow(2, (m - 69) / 12);
function rng(seed) { let t = seed >>> 0; return () => { t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), t | 1); r ^= r + Math.imul(r ^ (r >>> 7), r | 61); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }

export async function renderTrack7(sampleRate = 48000) {
  const ctx = new OfflineAudioContext(2, Math.ceil(LENGTH7 * sampleRate), sampleRate);
  build(ctx);
  return ctx.startRendering();
}

function build(ctx) {
  const r = rng(7007), sr = ctx.sampleRate, L = LENGTH7;

  // ---------------------------------------------------------------- шины
  const master = ctx.createGain(), cut = ctx.createBiquadFilter(), comp = ctx.createDynamicsCompressor();
  cut.type = 'highpass'; cut.frequency.value = 34; cut.Q.value = 0.7;
  const shelf = ctx.createBiquadFilter(); shelf.type = 'lowshelf'; shelf.frequency.value = 100; shelf.gain.value = -5;   // низ не гудит
  const air = ctx.createBiquadFilter(); air.type = 'highshelf'; air.frequency.value = 5000; air.gain.value = 3;          // воздух и стекло
  comp.threshold.value = -15; comp.ratio.value = 3; comp.attack.value = 0.005; comp.release.value = 0.2; comp.knee.value = 6;
  master.connect(cut).connect(shelf).connect(air).connect(comp).connect(ctx.destination);
  master.gain.setValueAtTime(1, 0); master.gain.setValueAtTime(1, 19.35); master.gain.linearRampToValueAtTime(0, L);
  const fx = ctx.createGain(); fx.gain.value = 0.9; fx.connect(master);          // звуки мира и движения
  const musBus = ctx.createGain(); musBus.gain.value = 0.8; musBus.connect(master);
  const tonal = ctx.createGain(), duck = ctx.createGain(); tonal.connect(duck).connect(musBus);
  const mkIR = (dur, decay, pre, damp = 0) => {
    const b = ctx.createBuffer(2, Math.floor(sr * dur), sr), p = Math.floor(pre * sr);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c); let lp = 0;
      for (let i = p; i < d.length; i++) { const w = r() * 2 - 1; lp += (w - lp) * (1 - damp * (i - p) / (d.length - p)); d[i] = lp * Math.pow(1 - (i - p) / (d.length - p), decay); }
    }
    return b;
  };
  const cave = ctx.createConvolver(); cave.buffer = mkIR(4.8, 2.0, 0.035, 0.85);  // пещера: длинное тёмное эхо
  const caveOut = ctx.createGain(); caveOut.gain.value = 0.42; cave.connect(caveOut).connect(master);
  const hall = ctx.createConvolver(); hall.buffer = mkIR(3.4, 2.4, 0.02, 0.5);     // музыка
  const hallOut = ctx.createGain(); hallOut.gain.value = 0.32; hall.connect(hallOut).connect(musBus);
  const send = (node, bus, amt) => { const g = ctx.createGain(); g.gain.value = amt; node.connect(g).connect(bus); };

  function noiseBuf(kind, sec = 3) {
    const b = ctx.createBuffer(1, sr * sec, sr), d = b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, br = 0;
    for (let i = 0; i < d.length; i++) {
      const w = r() * 2 - 1;
      if (kind === 'white') { d[i] = w; continue; }
      if (kind === 'brown') { br = (br + 0.02 * w) / 1.02; d[i] = br * 3.5; continue; }
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    }
    return b;
  }
  const white = noiseBuf('white', 2), pink = noiseBuf('pink'), brown = noiseBuf('brown', 4);
  const src = (buf, t, dur) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(Math.max(0, t), r() * 1.2); s.stop(t + dur + 0.05); return s; };
  const env = (g, t, a, peak, d) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(1e-4, peak), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
  const biq = (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const pan = (v) => { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, v)); return p; };
  const osc = (type, f, t, dur) => { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.start(t); o.stop(t + dur + 0.05); return o; };

  // ---------------------------------------------------------------- мир
  // ветер в пещере: розовый шум в широкой полосе, полоса и громкость медленно гуляют
  function wind(t, dur, v = 0.05) {
    for (const [f, pn, ph] of [[420, -0.6, 0.0], [650, 0.6, 1.7]]) {
      const s = src(pink, t, dur), bp = biq('bandpass', f, 0.6), g = ctx.createGain();
      for (let k = 0; k <= dur; k += 0.5) {
        const w = 0.6 + 0.4 * Math.sin(k * 0.9 + ph) * Math.sin(k * 0.37 + ph * 2);
        bp.frequency.linearRampToValueAtTime(f * (0.75 + 0.5 * w), t + k);
        g.gain.linearRampToValueAtTime(v * (0.5 + 0.5 * w) * (k < 1 ? k : 1), t + k);
      }
      s.connect(bp).connect(g).connect(pan(pn)).connect(fx); send(g, cave, 0.2);
    }
  }
  // плеск у камней: бурый шум под фильтром, громкость — редкие мягкие «накаты»
  function lapping(t, dur, v = 0.12) {
    const s = src(brown, t, dur), lp = biq('lowpass', 1100, 0.7), hp = biq('highpass', 160, 0.7), g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    for (let k = 0; k < dur; k += 0.9 + r() * 0.8) {
      g.gain.linearRampToValueAtTime(v * (0.4 + 0.6 * r()), t + k + 0.35); g.gain.linearRampToValueAtTime(v * 0.15, t + k + 0.9);
    }
    s.connect(hp).connect(lp).connect(g).connect(pan((r() - 0.5) * 0.6)).connect(fx); send(g, cave, 0.25);
  }
  // капля в воду: короткий тон, падающий по высоте (пузырёк), и всплеск
  function plink(t, f = 1800, v = 0.12, pn = 0) {
    const o = osc('sine', f, t, 0.18), g = ctx.createGain();
    o.frequency.exponentialRampToValueAtTime(f * 1.9, t + 0.06);   // пузырёк уходит вверх
    env(g, t, 0.002, v, 0.12); o.connect(g).connect(pan(pn)).connect(fx); send(g, cave, 0.9);
    const s = src(white, t, 0.05), sg = ctx.createGain(); env(sg, t, 0.001, v * 0.35, 0.03);
    s.connect(biq('bandpass', 3800, 1.2)).connect(sg).connect(pan(pn)).connect(fx); send(sg, cave, 0.6);
  }
  // гул пещеры: квинта в басу с медленными биениями
  function drone(t, dur, v = 0.05) {
    for (const [m, det] of [[42, -4], [42, 5], [49, 0], [54, -3]]) {
      const o = osc('sine', N(m), t, dur), g = ctx.createGain(); o.detune.value = det;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v * (m === 42 ? 1 : 0.5), t + 2.5);
      g.gain.setValueAtTime(v * (m === 42 ? 1 : 0.5), t + dur - 1.2); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(musBus); send(g, hall, 0.3);
    }
  }
  // проход воздуха: шум в полосе, тон и стерео идут за движением
  function whoosh(t, dur, f0, f1, p0, p1, v = 0.3, q = 1.3, peak = 0.62) {
    const s = src(pink, t, dur), bp = biq('bandpass', f0, q), g = ctx.createGain(), p = ctx.createStereoPanner();
    bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
    p.pan.setValueAtTime(p0, t); p.pan.linearRampToValueAtTime(p1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v * 2.6, t + dur * peak); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bp).connect(g).connect(p).connect(fx); send(g, cave, 0.3);
    return g;
  }
  // мерцание кристаллов: высокий «воздух» и чистые обертоны
  function shimmer(t, dur, p0, p1, v = 0.1) {
    const s = src(white, t, dur), bp = biq('bandpass', 6000, 2.5), g = ctx.createGain(), p = ctx.createStereoPanner();
    bp.frequency.setValueAtTime(5200, t); bp.frequency.exponentialRampToValueAtTime(10500, t + dur * 0.5); bp.frequency.exponentialRampToValueAtTime(6200, t + dur);
    p.pan.setValueAtTime(p0, t); p.pan.linearRampToValueAtTime(p1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + dur * 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bp).connect(g).connect(p).connect(fx); send(g, hall, 0.5);
    for (const [m, k] of [[90, 1], [97, 0.6], [102, 0.35]]) {
      const o = osc('sine', N(m), t, dur), og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(v * 0.1 * k, t + dur * 0.5); og.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(og).connect(p); send(og, hall, 0.7);
    }
  }
  // звон кристалла: неровные (как у стекла) обертоны, долгий хвост
  function glass(t, f, v = 0.06, dur = 2.6, pn = 0) {
    for (const [k, a] of [[1, 1], [2.76, 0.42], [5.4, 0.2], [8.93, 0.09]]) {
      const o = osc('sine', f * k, t, dur), g = ctx.createGain();
      env(g, t, 0.002, v * a, dur / (1 + k * 0.35));
      o.connect(g).connect(pan(pn)).connect(tonal); send(g, hall, 0.6); send(g, cave, 0.25);
    }
  }
  // шар всплывает: «бульк» вверх по нотам аккорда и тихий хлопок пузыря
  function bloop(t, m, v = 0.07, pn = 0) {
    const o = osc('sine', N(m - 12), t, 0.4), g = ctx.createGain();
    o.frequency.exponentialRampToValueAtTime(N(m), t + 0.16);
    env(g, t, 0.01, v, 0.32); o.connect(g).connect(pan(pn)).connect(tonal); send(g, hall, 0.55); send(g, cave, 0.3);
    plink(t + 0.02, 2400 + 300 * r(), v * 0.5, pn);
  }

  // ---------------------------------------------------------------- музыка (90 уд/мин, фа-диез минор)
  function kick(t, v = 1) {   // мягкий глубокий «пульс»
    const o = osc('sine', 120, t, 0.5), g = ctx.createGain();
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    env(g, t, 0.004, 0.42 * v, 0.34); o.connect(g).connect(musBus);
    const c = src(white, t, 0.02), cg = ctx.createGain(); env(cg, t, 0.001, 0.07 * v, 0.01);
    c.connect(biq('highpass', 3000)).connect(cg).connect(musBus);
    duck.gain.setValueAtTime(0.5, t); duck.gain.linearRampToValueAtTime(1, t + 0.3);
  }
  const shaper = ctx.createWaveShaper();
  shaper.curve = Float32Array.from({ length: 1024 }, (_, i) => Math.tanh(2.0 * (i / 511.5 - 1)));
  const subOut = ctx.createGain(); subOut.gain.value = 0.15; shaper.connect(subOut).connect(musBus);
  function sub(t, m, dur, v = 0.5) {
    const o = osc('sine', N(m), t, dur), g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.01);
    g.gain.setValueAtTime(v, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(shaper);
  }
  function hat(t, v = 0.04, pn = 0.2) {
    const s = src(white, t, 0.06), g = ctx.createGain();
    env(g, t, 0.001, v, 0.03);
    s.connect(biq('highpass', 8500)).connect(g).connect(pan(pn)).connect(musBus); send(g, hall, 0.2);
  }
  function pad(t, dur, notes, v = 0.014, a = 0.6, cutoff = 1200) {
    for (const m of notes) for (const det of [-7, 6]) {
      const o = osc('sawtooth', N(m), t, dur), g = ctx.createGain(); o.detune.value = det;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + a);
      g.gain.setValueAtTime(v, Math.max(t + a, t + dur - 0.5)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(biq('lowpass', cutoff)).connect(g).connect(tonal); send(g, hall, 0.55);
    }
  }
  function pluck(t, m, v = 0.035, cutoff = 3000, pn = 0) {   // стеклянный щипок
    const o = osc('triangle', N(m), t, 0.5), o2 = osc('sine', N(m) * 2.76, t, 0.3), f = biq('lowpass', cutoff, 2), g = ctx.createGain(), g2 = ctx.createGain();
    f.frequency.setValueAtTime(cutoff, t); f.frequency.exponentialRampToValueAtTime(400, t + 0.3);
    env(g, t, 0.002, v, 0.4); env(g2, t, 0.001, v * 0.25, 0.12);
    o.connect(f).connect(g).connect(pan(pn)).connect(tonal); o2.connect(g2).connect(pan(pn)).connect(tonal);
    send(g, hall, 0.6);
  }
  function bell(t, m, v = 0.08, dur = 3) {
    const c = osc('sine', N(m), t, dur), mo = osc('sine', N(m) * 3.5, t, dur), mg = ctx.createGain(), g = ctx.createGain();
    mg.gain.setValueAtTime(N(m) * 2, t); mg.gain.exponentialRampToValueAtTime(1, t + dur * 0.6);
    mo.connect(mg).connect(c.frequency); env(g, t, 0.002, v, dur);
    c.connect(g).connect(tonal); send(g, hall, 0.7);
  }
  function boom(t, v = 1) {   // удар: глубокий «бум», мягкий хлопок воздуха
    const o = osc('sine', 90, t, 2.2), g = ctx.createGain();
    o.frequency.exponentialRampToValueAtTime(34, t + 0.6);
    env(g, t, 0.005, 0.7 * v, 1.8); o.connect(g).connect(musBus);
    const s = src(pink, t, 1.2), lp = biq('lowpass', 1600, 0.8), sg = ctx.createGain();
    lp.frequency.setValueAtTime(2400, t); lp.frequency.exponentialRampToValueAtTime(200, t + 0.9);
    env(sg, t, 0.003, 0.35 * v, 0.9); s.connect(lp).connect(sg).connect(fx); send(sg, cave, 0.6);
  }
  // обратный «вдох» к удару: нарастающий шум и тон, обрывается в момент удара
  function suck(t1, dur, v = 0.12) {
    const t = t1 - dur, s = src(pink, t, dur), bp = biq('bandpass', 300, 1.0), g = ctx.createGain();
    bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(5500, t1);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t1 - 0.03); g.gain.linearRampToValueAtTime(0, t1);
    s.connect(bp).connect(g).connect(musBus); send(g, hall, 0.3);
    for (const m of [54, 61, 66]) {
      const o = osc('sawtooth', N(m), t, dur), lp = biq('lowpass', 200, 1), og = ctx.createGain();
      lp.frequency.setValueAtTime(200, t); lp.frequency.exponentialRampToValueAtTime(3000, t1);
      og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(v * 0.18, t1 - 0.03); og.gain.linearRampToValueAtTime(0, t1);
      o.connect(lp).connect(og).connect(musBus);
    }
  }

  // аккорды по два удара (= один макроплан): f#m — D — A — E
  const CH = { fm: [54, 57, 61, 64], d: [50, 57, 62, 66], a: [52, 57, 61, 64], e: [52, 56, 59, 64] };
  const BASS = { fm: 30, d: 26, a: 33, e: 28 };
  const PROG = ['fm', 'd', 'a', 'e'];
  const ARP = [0, 2, 1, 3, 2, 1];

  // ---- 0–3: холодный мир — ветер, плеск, гул; капля в первом плане
  wind(0, L, 0.05);
  lapping(0, 9.2, 0.08);
  drone(0, 9.3, 0.03);
  plink(DROP_T, 1500, 0.16, 0.15);
  for (const [t, f, pn] of [[0.6, 2100, -0.7], [2.3, 2600, 0.6], [3.6, 1900, -0.4], [6.1, 2400, 0.7], [11.2, 2200, -0.6], [15.8, 2000, 0.5]]) plink(t, f, 0.05, pn);  // далёкие капли
  pad(0.4, 3.0, [42, 49, 54], 0.01, 2.0, 600);
  // ---- 3–5,4: кроссовок выходит из тумана — воздух нарастает; пролёт мимо камеры (Доплер)
  pad(3.0, 2.8, CH.fm, 0.011, 1.4, 900);
  whoosh(3.2, 1.6, 300, 1400, -0.8, -0.3, 0.05, 0.9, 0.9);         // приближается
  {
    const tp = 4.3, g = whoosh(tp - 0.55, 1.3, 2600, 500, -0.9, 0.9, 0.34, 1.1, 0.42);   // мимо — высота падает
    const lo = src(brown, tp - 0.4, 1.0), lg = ctx.createGain(); env(lg, tp - 0.4, 0.35, 0.18, 0.6);
    lo.connect(biq('lowpass', 180)).connect(lg).connect(fx);
    void g;
  }
  shimmer(4.5, 1.2, 0.3, 0.9, 0.06);
  // ---- 5,4–7,8: полёт над водой — стеклянное арпеджио, «бочка» шелестит вокруг
  pad(5.4, 2.4, CH.d, 0.012, 0.6, 1300);
  for (let i = 0; i < 14; i++) { const t = 5.45 + i * BEAT / 4 * 1.0; pluck(t, CH.d[ARP[i % 6]] + 12, 0.03 + 0.015 * (i / 14), 2400 + i * 120, Math.sin(i * 0.9) * 0.5); }
  {
    const g = whoosh(5.95, 1.6, 500, 1800, -0.8, 0.8, 0.2, 0.9, 0.5);   // оборот: воздух «трепещет»
    const lfo = osc('sine', 7, 5.95, 1.6), lg = ctx.createGain(); lg.gain.value = 0.35; lfo.connect(lg).connect(g.gain);
  }
  // ---- 7,8–9: заход на посадку и вдох перед ударом
  whoosh(7.8, 1.15, 1500, 300, -0.7, 0.1, 0.16, 1.0, 0.45);
  suck(LAND_T, 1.4, 0.13);
  // ---- 9: касание — удар, звон друз, вспышка
  boom(LAND_T, 1.0); kick(LAND_T, 1.1); sub(LAND_T, 42, 1.6, 0.45);
  for (const [f, d, pn] of [[N(78), 0, -0.3], [N(85), 0.03, 0.35], [N(90), 0.07, -0.1], [N(73), 0.1, 0.2], [N(97), 0.16, 0.5]]) glass(LAND_T + d, f, 0.07, 3.2, pn);
  shimmer(LAND_T + 0.05, 2.2, -0.6, 0.6, 0.1);
  // ---- 9–17: пульс 90 уд/мин; аккорд меняется с каждым макропланом
  for (let k = 0; k < 12; k++) {
    const t = LAND_T + k * BEAT, ch = PROG[Math.floor(k / 2) % 4];
    if (k > 0) kick(t, k < 2 ? 0.6 : 0.8);
    if (k % 2 === 0) { sub(t, BASS[ch] + 12, BEAT * 1.9, 0.36); pad(t, BEAT * 2.05, CH[ch], 0.015, 0.12, 1600); }
    if (k >= 2) for (let j = 0; j < 4; j++) pluck(t + j * BEAT / 4, CH[ch][ARP[(k * 4 + j) % 6]] + 12, 0.034, 3000, (j % 2 ? 0.35 : -0.35));
    if (k >= 8) { hat(t + BEAT / 2, 0.04, 0.25); hat(t + BEAT * 3 / 4, 0.025, -0.2); }
  }
  // переходы между макропланами — короткий воздух
  for (const t of [SHOTS7.toe, SHOTS7.heel, SHOTS7.side]) whoosh(t - 0.18, 0.5, 900, 3200, -0.4, 0.4, 0.07, 1.2, 0.4);
  shimmer(SHOTS7.side + 0.05, SHOTS7.orbs - SHOTS7.side - 0.1, -0.9, 0.9, 0.1);   // полоса света по логотипу
  // ---- 14,33–17: шары всплывают — по «бульку» на каждый, ноты аккорда
  ORBS7.forEach(([ex, , , , , rad, te], i) => bloop(te + rad / 1.2, [66, 69, 73, 76, 78, 81, 85, 88, 90][i], 0.06, Math.max(-0.8, Math.min(0.8, ex / 8))));
  shimmer(SHOTS7.orbs + 0.8, 2.0, -0.5, 0.5, 0.07);
  // ---- 17: финал — удар, полный аккорд, колокольчики на надписи, затухание
  boom(SHOTS7.hero, 0.75); kick(SHOTS7.hero, 0.9); sub(SHOTS7.hero, 42, 3.0, 0.4);
  pad(SHOTS7.hero, 3.0, [42, 54, 57, 61, 64, 68], 0.016, 0.08, 1500);
  for (const [f, d, pn] of [[N(85), 0, -0.3], [N(90), 0.05, 0.3], [N(78), 0.1, 0]]) glass(SHOTS7.hero + d, f, 0.035, 2.8, pn);
  bell(LOGO_T, 81, 0.08, 2.4); bell(LOGO_T + 0.22, 88, 0.06, 2.4);
  shimmer(LOGO_T + 0.1, 1.6, -0.4, 0.4, 0.06);
}
