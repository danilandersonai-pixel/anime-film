// audio5.js — звук v5: улица под ливнем и сдержанная музыка.
// Всё синтезирует WebAudio в OfflineAudioContext. Время каждого звука берётся из той же
// режиссуры и физики, что и картинка: гром — по вспышкам молнии, шлепки — по касаниям
// подошвы из physics.js (с учётом рапида), «плюхи» — по каплям с края подошвы,
// треск неона — по его провалам.
import { DURATION5, IMPACT5, SHOTS5, SIM, actionTime5, simTime, evaluate5, LIGHTNING, NEON_FLICKER } from './timeline5.js';
import { dripLandings } from './drips5.js';

export const LENGTH5 = DURATION5;
const N = (m) => 440 * Math.pow(2, (m - 69) / 12);

function rng(seed) { let t = seed >>> 0; return () => { t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), t | 1); r ^= r + Math.imul(r ^ (r >>> 7), r | 61); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }

// время ролика по секундам физики (обратная функция к simTime: рапид растягивает удар)
function realTime(s) {
  let a = IMPACT5 - 2, b = IMPACT5 + 4;
  for (let i = 0; i < 50; i++) { const m = (a + b) / 2; if (simTime(m) < s) a = m; else b = m; }
  return (a + b) / 2;
}
// во сколько раз замедлено действие в момент t (1 — реальное время, 5 — рапид ×0,2)
const slowAt = (t) => 0.01 / Math.max(1e-4, actionTime5(t + 0.005) - actionTime5(t - 0.005));

// касания подошвы: точки, ударившие в пределах 8 мс, — один удар с наибольшей скоростью
function contacts() {
  const ev = [];
  for (const h of SIM.hits) {
    const p = ev[ev.length - 1];
    if (p && h.t - p.s < 0.008) { p.speed = Math.max(p.speed, h.speed); continue; }
    ev.push({ s: h.t, speed: h.speed });
  }
  return ev.map((e) => ({ ...e, t: realTime(e.s) }));
}

export async function renderTrack5(sampleRate = 48000) {
  const ctx = new OfflineAudioContext(2, Math.ceil(LENGTH5 * sampleRate), sampleRate);
  build(ctx);
  return ctx.startRendering();
}

function build(ctx) {
  const r = rng(2605), sr = ctx.sampleRate, L = LENGTH5;

  // ---------------------------------------------------------------- шины
  const master = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 3; comp.attack.value = 0.005; comp.release.value = 0.2; comp.knee.value = 6;
  const rumbleCut = ctx.createBiquadFilter(); rumbleCut.type = 'highpass'; rumbleCut.frequency.value = 30; rumbleCut.Q.value = 0.7; // ниже 30 Гц — только гул, съедающий запас
  master.connect(rumbleCut).connect(comp).connect(ctx.destination);
  master.gain.setValueAtTime(0.0001, 0); master.gain.exponentialRampToValueAtTime(1, 0.3);
  master.gain.setValueAtTime(1, 25.35); master.gain.linearRampToValueAtTime(0, L);
  // улица (дождь, гром, машины): в рапиде её «заглушает» фильтр
  const amb = ctx.createGain(), ambLP = ctx.createBiquadFilter();
  ambLP.type = 'lowpass'; ambLP.frequency.value = 18000; ambLP.Q.value = 0.5;
  amb.connect(ambLP).connect(master);
  // звуки у самой камеры: шлепки, капли, неон
  const fx = ctx.createGain(); fx.connect(master);
  // музыка: ударные + тональная часть (проседает под бочкой), общий фильтр и «затвор» для неона
  const musBus = ctx.createGain(), musLP = ctx.createBiquadFilter(), musGate = ctx.createGain();
  musBus.gain.value = 0.8; musLP.type = 'lowpass'; musLP.frequency.value = 20000; musLP.Q.value = 0.6;
  musBus.connect(musLP).connect(musGate).connect(master);
  const tonal = ctx.createGain(), duck = ctx.createGain(); tonal.connect(duck).connect(musBus);

  // реверберация: короткая уличная (стены домов) и длинная для музыки
  const mkIR = (dur, decay, pre) => {
    const b = ctx.createBuffer(2, Math.floor(sr * dur), sr), p = Math.floor(pre * sr);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = p; i < d.length; i++) d[i] = (r() * 2 - 1) * Math.pow(1 - (i - p) / (d.length - p), decay); }
    return b;
  };
  const street = ctx.createConvolver(); street.buffer = mkIR(1.5, 3.2, 0.014);
  const streetOut = ctx.createGain(); streetOut.gain.value = 0.3; street.connect(streetOut).connect(ambLP);
  const hall = ctx.createConvolver(); hall.buffer = mkIR(3.8, 2.3, 0.025);
  const hallOut = ctx.createGain(); hallOut.gain.value = 0.32; hall.connect(hallOut).connect(musLP);
  const send = (node, bus, amt) => { const g = ctx.createGain(); g.gain.value = amt; node.connect(g).connect(bus); };

  // шумы: белый, розовый (две независимые полосы — широкое стерео), бурый (гул)
  function noiseBuf(kind, sec = 4) {
    const b = ctx.createBuffer(1, sr * sec, sr), d = b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, br = 0;
    for (let i = 0; i < d.length; i++) {
      const w = r() * 2 - 1;
      if (kind === 'white') d[i] = w;
      else if (kind === 'pink') {
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      } else { br = (br + 0.02 * w) / 1.02; d[i] = br * 3.5; }
    }
    return b;
  }
  const white = noiseBuf('white', 2), pinkL = noiseBuf('pink'), pinkR = noiseBuf('pink'), brown = noiseBuf('brown');
  const src = (buf, t, dur) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(t, r() * 1.5); s.stop(t + dur + 0.05); return s; };
  const env = (g, t, a, peak, d) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(1e-4, peak), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
  const biq = (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const pan = (v) => { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, v)); return p; };

  // ---------------------------------------------------------------- элементы улицы
  // удар капли о твёрдое: щелчок шума в узкой полосе
  function tick(t, f, v, pn, dest, dur = 0.012, q = 1.2) {
    const s = src(white, t, dur + 0.02), g = ctx.createGain();
    env(g, t, 0.0008, v, dur);
    s.connect(biq('bandpass', f, q)).connect(g).connect(pan(pn)).connect(dest);
  }
  // капля в воду: резонанс пузырька, тон уходит вверх
  function plip(t, f, v, pn, dest, dur = 0.05) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 1.7, t + dur);
    env(g, t, 0.0015, v, dur);
    o.connect(g).connect(pan(pn)).connect(dest); o.start(t); o.stop(t + dur + 0.03);
    tick(t, 3200, v * 0.45, pn, dest, 0.004);
  }
  // капля по трикотажу: глухое «тып»
  function tap(t, v, pn) {
    const s = src(white, t, 0.06), g = ctx.createGain();
    env(g, t, 0.001, v, 0.03);
    s.connect(biq('lowpass', 1100)).connect(g).connect(pan(pn)).connect(fx);
    const o = ctx.createOscillator(), og = ctx.createGain(), f = 340 + r() * 220;
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.03);
    env(og, t, 0.001, v * 0.5, 0.035);
    o.connect(og).connect(pan(pn)).connect(fx); o.start(t); o.stop(t + 0.06);
  }
  // раскаты грома: низкий шум с медленно гуляющей громкостью
  function rumble(t, dur, v) {
    const s = src(brown, t, dur), lp = biq('lowpass', 380), g = ctx.createGain();
    lp.frequency.setValueAtTime(380, t); lp.frequency.exponentialRampToValueAtTime(90, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    for (let tk = t; tk < t + dur - 0.7;) { tk += 0.22 + r() * 0.5; g.gain.exponentialRampToValueAtTime(v * (0.35 + 0.65 * r()) * (1 - 0.75 * (tk - t) / dur), tk); }
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(lp).connect(g).connect(amb); send(g, street, 0.5);
  }
  // близкий разряд: рвущийся треск, хлопок и раскаты
  function strike(t, v) {
    let tk = t;
    for (let i = 0; i < 44; i++) {
      tk += 0.002 + r() * 0.011 * (1 + i / 12);
      const s = src(white, tk, 0.04), g = ctx.createGain();
      env(g, tk, 0.0005, v * (0.2 + 0.5 * r()) * (1 - i / 55), 0.01 + r() * 0.025);
      s.connect(biq('highpass', 500 + r() * 1800)).connect(g).connect(pan((r() - 0.5) * 0.7)).connect(amb); send(g, street, 0.7);
    }
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.frequency.setValueAtTime(72, t + 0.03); o.frequency.exponentialRampToValueAtTime(27, t + 1.0);
    env(og, t + 0.03, 0.004, v * 0.85, 1.5); o.connect(og).connect(amb); o.start(t); o.stop(t + 1.7);
    const s = src(brown, t + 0.02, 1.4), lp = biq('lowpass', 1200), g = ctx.createGain();
    lp.frequency.setValueAtTime(1200, t); lp.frequency.exponentialRampToValueAtTime(120, t + 1.1);
    env(g, t + 0.02, 0.003, v * 0.9, 1.2); s.connect(lp).connect(g).connect(amb); send(g, street, 0.8);
    rumble(t + 0.45, 5.5, v * 0.75);
  }
  // машина: шины по мокрому (Доплер — тон выше на подходе), брызги из-под колёс, мотор
  function carPass(t0, dur, dir, v) {
    const n = 96, tm = t0 + dur * 0.5, w = dur * 0.16;
    const bell = (k) => Float32Array.from({ length: n }, (_, i) => { const x = ((i / (n - 1)) - 0.5) * dur / w; return Math.max(1e-4, k / (1 + x * x)); });
    const panC = Float32Array.from({ length: n }, (_, i) => 0.9 * dir * Math.tanh(((i / (n - 1)) - 0.5) * dur / w * 0.9));
    for (const [type, f0, f1, f2, k] of [['bandpass', 1300, 2700, 950, 1], ['highpass', 4200, 4600, 3600, 0.45]]) {
      const s = src(white, t0, dur), f = biq(type, f0, 0.75), g = ctx.createGain(), p = ctx.createStereoPanner();
      f.frequency.setValueAtTime(f0, t0); f.frequency.linearRampToValueAtTime(f1, tm - 0.05); f.frequency.linearRampToValueAtTime(f2, tm + 0.4);
      g.gain.setValueCurveAtTime(bell(v * k), t0, dur); p.pan.setValueCurveAtTime(panC, t0, dur);
      s.connect(f).connect(g).connect(p).connect(amb); send(g, street, 0.35);
    }
    // брызги: проезд по луже
    const s = src(white, tm - 0.05, 0.6), g = ctx.createGain(), bp = biq('bandpass', 1800, 0.5);
    bp.frequency.setValueAtTime(900, tm - 0.05); bp.frequency.exponentialRampToValueAtTime(2600, tm + 0.25);
    env(g, tm - 0.05, 0.04, v * 0.8, 0.5); s.connect(bp).connect(g).connect(pan(0.2 * dir)).connect(amb); send(g, street, 0.5);
    // мотор: низкий гул, высота падает при проезде
    const o = ctx.createOscillator(), og = ctx.createGain(), op = ctx.createStereoPanner();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(88, t0); o.frequency.linearRampToValueAtTime(84, tm - 0.1); o.frequency.linearRampToValueAtTime(66, tm + 0.2); o.frequency.linearRampToValueAtTime(63, t0 + dur);
    og.gain.setValueCurveAtTime(bell(v * 0.3), t0, dur); op.pan.setValueCurveAtTime(panC, t0, dur);
    o.connect(biq('lowpass', 240)).connect(og).connect(op).connect(amb); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  // шлепок подошвы по луже; k — замедление (1 — реальное время, 5 — рапид): в рапиде звук ниже и длиннее
  function splash(t, v, k) {
    const q = Math.sqrt(k);
    // резина по асфальту: низкий толчок
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.frequency.setValueAtTime(130 / q, t); o.frequency.exponentialRampToValueAtTime(42 / q, t + 0.07 * k);
    env(og, t, 0.002, v, 0.1 * k); o.connect(og).connect(fx); o.start(t); o.stop(t + 0.15 * k + 0.05);
    // хлопок воды: шум в полосе, тон вверх
    const s = src(white, t, 0.5 * k), bp = biq('bandpass', 500, 0.8), g = ctx.createGain();
    bp.frequency.setValueAtTime(450 / q, t); bp.frequency.exponentialRampToValueAtTime(2300 / q, t + 0.22 * k);
    env(g, t, 0.003, v * 0.9, 0.32 * k); s.connect(bp).connect(g).connect(fx); send(g, street, 0.5);
    // бурление: вода рвётся на струи и капли
    for (let i = 0; i < 26 * v + 4; i++) tick(t + 0.008 * k + r() * 0.28 * k, (1100 + r() * 3200) / q, v * 0.28 * r(), (r() - 0.5) * 0.9, fx, 0.012 * k, 1.6);
  }

  // ---------------------------------------------------------------- дождь
  // уровень по планам: на общих ливень вокруг, на макро тише (слышно капли рядом)
  const RAIN = { storm: 1, drops: 0.45, laces: 0.5, heel: 0.7, car: 0.85, drop: 0.85, drip: 0.45, top: 0.85, neon: 0.65, lineup: 0.8, pack: 0.7 };
  const rainBus = ctx.createGain(); rainBus.connect(amb);
  rainBus.gain.setValueAtTime(RAIN.storm, 0);
  for (const [n, t0] of Object.entries(SHOTS5)) if (t0 > 0) rainBus.gain.setTargetAtTime(RAIN[n], t0, 0.02);
  {
    const m = ctx.createChannelMerger(2);
    for (const [buf, ch] of [[pinkL, 0], [pinkR, 1]]) {
      const s = src(buf, 0, L), sh = biq('highshelf', 5000), g = ctx.createGain();
      sh.gain.value = -3; g.gain.value = 0.26;
      s.connect(biq('highpass', 320)).connect(sh).connect(g).connect(m, 0, ch);
    }
    m.connect(rainBus);
    const s = src(brown, 0, L), g = ctx.createGain(); g.gain.value = 0.05;  // гул ливня по крышам и машинам
    s.connect(biq('lowpass', 220)).connect(g).connect(rainBus);
  }
  for (let i = 0, n = Math.floor(L * 46); i < n; i++) tick(r() * L, 2400 + r() * 6200, 0.025 + 0.12 * r() ** 3, r() * 1.8 - 0.9, rainBus, 0.006 + 0.018 * r());
  for (let i = 0, n = Math.floor(L * 7); i < n; i++) plip(r() * L, 900 + r() * 2300, 0.012 + 0.05 * r() ** 2, r() * 1.6 - 0.8, rainBus, 0.03 + 0.04 * r());
  // гул города: далёкий низкий фон
  { const s = src(brown, 0, L), g = ctx.createGain(); g.gain.value = 0.025; s.connect(biq('bandpass', 110, 0.6)).connect(g).connect(amb); }

  // ---------------------------------------------------------------- 0–3: молния и гром
  // первые две вспышки — близкий разряд (звук почти сразу), третья — дальше: гром через ~1,8 с
  strike(LIGHTNING[0][0] + 0.02, 1);
  rumble(LIGHTNING[2][0] + 1.8, 5.5, 0.38);

  // ---------------------------------------------------------------- 3–9: макро
  for (let t = SHOTS5.drops + 0.08; t < SHOTS5.heel; t += 0.07 + r() * 0.32) tap(t, 0.05 + 0.12 * r(), (r() - 0.5) * 0.7);
  for (let t = SHOTS5.heel + 0.1; t < SHOTS5.car; t += 0.12 + r() * 0.4) tick(t, 3600 + r() * 2400, 0.04 + 0.06 * r(), (r() - 0.5) * 0.6, fx, 0.008, 2.5);

  // ---------------------------------------------------------------- 9–11: машина за кроссовком
  carPass(8.9, 2.3, 1, 0.42);

  // ---------------------------------------------------------------- 11–15: падение в лужу
  // воздух: кроссовок входит в кадр сверху
  { const t = realTime(0) + 0.02, s = src(white, t, 0.3), g = ctx.createGain(), bp = biq('bandpass', 600, 1.2);
    bp.frequency.setValueAtTime(500, t); bp.frequency.exponentialRampToValueAtTime(1400, IMPACT5);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, IMPACT5 - 0.01); g.gain.exponentialRampToValueAtTime(0.0001, IMPACT5 + 0.03);
    s.connect(bp).connect(g).connect(fx); }
  // касания из физики: пятка, хлопок передом, качание на носок и обратно
  const HITS = contacts();
  for (const h of HITS) splash(h.t, Math.min(1, Math.pow(h.speed / 24.5, 0.7)), slowAt(h.t));
  // капли короны падают обратно в лужу (баллистика, в рапиде — медленно и ниже)
  for (let i = 0; i < 70; i++) {
    const t = realTime(HITS[0].s + 0.05 + 0.33 * Math.pow(r(), 0.8)), k = Math.sqrt(slowAt(t));
    plip(t, (900 + r() * 2200) / k, 0.02 + 0.07 * r() ** 2, (r() - 0.5) * 1.2, fx, 0.05 * k);
  }
  // рапид: улица «проваливается» — фильтр закрывается, потом звук разгоняется обратно
  ambLP.frequency.setValueAtTime(18000, IMPACT5 - 0.05);
  ambLP.frequency.exponentialRampToValueAtTime(650, IMPACT5 + 0.06);
  ambLP.frequency.setValueAtTime(650, IMPACT5 + 0.85);
  ambLP.frequency.exponentialRampToValueAtTime(18000, IMPACT5 + 1.3);
  { // свист «вниз» на ударе и «вверх» на разгоне
    for (const [t, d, f0, f1, v] of [[IMPACT5 + 0.02, 0.9, 1600, 140, 0.12], [IMPACT5 + 0.85, 0.42, 260, 4200, 0.1]]) {
      const s = src(white, t, d), bp = biq('bandpass', f0, 1.3), g = ctx.createGain();
      bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f1, t + d);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + d * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      s.connect(bp).connect(g).connect(fx); send(g, street, 0.4);
    }
  }

  // ---------------------------------------------------------------- 15–17: капли с края подошвы
  for (const d of dripLandings(evaluate5(16).shoe)) plip(d.t, 3300 - d.rad * 110000 + r() * 300, 0.1 + 0.1 * r(), (r() - 0.5) * 0.5, fx, 0.045 + 0.02 * r());
  for (let t = SHOTS5.drip + 0.05; t < SHOTS5.top; t += 0.03 + r() * 0.07) plip(t, 500 + r() * 900, 0.006 + 0.02 * r(), (r() - 0.5) * 0.4, fx, 0.03); // вода стекает с подмётки

  // ---------------------------------------------------------------- 19–21: неон гудит и трещит на провалах
  {
    const t0 = SHOTS5.neon, t1 = SHOTS5.lineup, g = ctx.createGain(), p = pan(0.35);
    const o = ctx.createOscillator(), h = ctx.createOscillator(), hg = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = 100; h.frequency.value = 100; hg.gain.value = 0.35;
    o.connect(biq('bandpass', 2400, 0.8)).connect(g); h.connect(hg).connect(g);
    g.connect(p).connect(fx); send(g, street, 0.3);
    g.gain.setValueAtTime(0, 0); g.gain.setValueAtTime(0.08, t0);
    for (const [a, d] of NEON_FLICKER) {
      g.gain.setValueAtTime(0.004, a); g.gain.setValueAtTime(0.08, a + d);
      for (const c of [a, a + d]) for (let i = 0; i < 4; i++) tick(c + r() * 0.012, 2500 + r() * 4000, 0.06 + 0.08 * r(), 0.35, fx, 0.006, 0.9);
      musGate.gain.setValueAtTime(0.25, a); musGate.gain.setValueAtTime(1, a + d);
    }
    g.gain.setValueAtTime(0, t1);
    o.start(t0); h.start(t0); o.stop(t1 + 0.05); h.stop(t1 + 0.05);
  }

  // ---------------------------------------------------------------- 23–26: вторая машина на пэкшоте
  carPass(23.2, 2.7, -1, 0.22);

  // ================================================================ музыка (120 уд/мин, ми минор)
  function kick(t, v = 1) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(44, t + 0.1);
    env(g, t, 0.003, 0.6 * v, 0.32); o.connect(g).connect(musBus); o.start(t); o.stop(t + 0.45);
    const c = src(white, t, 0.02), cg = ctx.createGain(); env(cg, t, 0.001, 0.18 * v, 0.012);
    c.connect(biq('highpass', 3500)).connect(cg).connect(musBus);
    duck.gain.setValueAtTime(0.4, t); duck.gain.linearRampToValueAtTime(1, t + 0.24);
  }
  // саб-бас 808: длинная низкая нота, можно с глиссандо в конце
  const shaper = ctx.createWaveShaper();
  shaper.curve = Float32Array.from({ length: 1024 }, (_, i) => Math.tanh(2.2 * (i / 511.5 - 1)));
  const subOut = ctx.createGain(); subOut.gain.value = 0.2; shaper.connect(subOut).connect(musBus);
  function sub(t, m, dur, v = 0.5, glide = null) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(N(m), t);
    if (glide !== null) { o.frequency.setValueAtTime(N(m), t + dur * 0.6); o.frequency.exponentialRampToValueAtTime(N(glide), t + dur * 0.85); }
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.006);
    g.gain.setValueAtTime(v, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(shaper); o.start(t); o.stop(t + dur + 0.05);
  }
  function clap(t, v = 0.4) {
    for (let i = 0; i < 3; i++) {
      const s = src(white, t + i * 0.011, 0.2), g = ctx.createGain();
      env(g, t + i * 0.011, 0.001, v * (i === 2 ? 1 : 0.55), i === 2 ? 0.17 : 0.02);
      s.connect(biq('bandpass', 1500, 0.9)).connect(g).connect(musBus); send(g, hall, 0.4);
    }
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    env(og, t, 0.001, v * 0.5, 0.09); o.connect(og).connect(musBus); o.start(t); o.stop(t + 0.15);
  }
  function hat(t, v = 0.06, open = false, pn = 0.2) {
    const s = src(white, t, open ? 0.3 : 0.06), g = ctx.createGain();
    env(g, t, 0.001, v, open ? 0.2 : 0.04);
    s.connect(biq('highpass', 7800)).connect(g).connect(pan(pn)).connect(musBus);
  }
  function pad(t, dur, notes, v = 0.02, a = 0.5, cut = 1300) {
    for (const m of notes) for (const det of [-8, 7]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = N(m); o.detune.value = det;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + a);
      g.gain.setValueAtTime(v, Math.max(t + a, t + dur - 0.4)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(biq('lowpass', cut)).connect(g).connect(tonal); send(g, hall, 0.5);
      o.start(t); o.stop(t + dur + 0.05);
    }
  }
  function pluck(t, m, v = 0.05, cut = 2500) {
    const o = ctx.createOscillator(), f = biq('lowpass', cut, 2), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = N(m);
    f.frequency.setValueAtTime(cut, t); f.frequency.exponentialRampToValueAtTime(300, t + 0.25);
    env(g, t, 0.002, v, 0.32); o.connect(f).connect(g).connect(tonal); send(g, hall, 0.55);
    o.start(t); o.stop(t + 0.4);
  }
  function bell(t, m, v = 0.1, dur = 3) {
    const c = ctx.createOscillator(), mo = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
    c.frequency.value = N(m); mo.frequency.value = N(m) * 3.5;
    mg.gain.setValueAtTime(N(m) * 2, t); mg.gain.exponentialRampToValueAtTime(1, t + dur * 0.6);
    mo.connect(mg).connect(c.frequency); env(g, t, 0.002, v, dur);
    c.connect(g).connect(tonal); send(g, hall, 0.7);
    c.start(t); mo.start(t); c.stop(t + dur + 0.1); mo.stop(t + dur + 0.1);
  }
  function swell(t1, dur, v = 0.12) { // обратная тарелка: нарастает и обрывается в t1
    const t = t1 - dur, s = src(white, t, dur), g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t1 - 0.01); g.gain.linearRampToValueAtTime(0, t1);
    s.connect(biq('highpass', 3000)).connect(g).connect(musBus); send(g, hall, 0.3);
  }
  function crash(t, v = 0.2, dur = 2.4) {
    const s = src(white, t, dur), g = ctx.createGain();
    env(g, t, 0.002, v, dur); s.connect(biq('highpass', 4500)).connect(g).connect(musBus); send(g, hall, 0.5);
  }

  // гармония по планам (склейки — на нечётных секундах, на сильную долю хлопка)
  const CH = { em: [40, [52, 55, 59, 66]], c: [36, [48, 55, 59, 64]], g: [43, [50, 55, 59, 62]], d: [42, [50, 54, 57, 62]] };
  // 2–3: низкий гул вползает под гром
  pad(2.0, 1.4, [40, 47], 0.016, 1.0, 600);
  // 3–11: пульс макропланов — тихое арпеджио, мягкая бочка раз в секунду, фильтр постепенно открывается
  const ARP = [0, 2, 1, 3, 2, 1, 3, 2];
  [[3, CH.em], [5, CH.c], [7, CH.g], [9, CH.d]].forEach(([t0, [b, notes]], s) => {
    pad(t0, 2.05, notes, 0.014 + s * 0.002, 0.25, 900 + s * 300);
    sub(t0, b - 12, 1.7, 0.14);
    for (let i = 0; i < 8; i++) pluck(t0 + i * 0.25, notes[ARP[i]] + 12, 0.028 + 0.004 * s, 900 + s * 500 + i * 60);
    for (const k of [0, 1]) kick(t0 + k, k ? 0.3 : 0.42);
    if (t0 >= 7) for (let i = 0; i < 8; i++) hat(t0 + 0.25 + i * 0.25, i % 2 ? 0.03 : 0.045);
  });
  bell(3.02, 83, 0.045, 2.2);
  // 11–11,75: разгон перед падением, затем тишина — слышно только дождь
  pad(11, 0.8, CH.em[1], 0.02, 0.2, 1800);
  for (let i = 0; i < 6; i++) hat(11 + i * 0.125, 0.03 + i * 0.008);
  swell(11.75, 1.4, 0.12);
  { const s = src(white, 9.6, 2.15), bp = biq('bandpass', 300, 1.2), g = ctx.createGain(); // подъём
    bp.frequency.setValueAtTime(300, 9.6); bp.frequency.exponentialRampToValueAtTime(5000, 11.75);
    g.gain.setValueAtTime(0.0001, 9.6); g.gain.exponentialRampToValueAtTime(0.07, 11.7); g.gain.linearRampToValueAtTime(0, 11.75);
    s.connect(bp).connect(g).connect(musBus); }
  // 12: удар — бочка, длинный саб, тарелка и глухой «брэм» на весь рапид
  kick(IMPACT5, 1.3); sub(IMPACT5, 28, 2.3, 0.8); crash(IMPACT5, 0.16, 3);
  pad(IMPACT5, 1.6, [40, 47, 52], 0.022, 0.02, 520);
  // 13–14: дробь хэтов ускоряется, обратная тарелка в сильную долю 14
  for (let t = 13.25, d = 0.25; t < 14; t += d, d = Math.max(0.0625, d * 0.8)) hat(t, 0.025 + (t - 13.25) * 0.06);
  swell(14, 0.75, 0.1);
  // 14–23: ровный грув в половинном темпе — хлопок на склейках (15, 17, 19, 21)
  const BARS = [[14, 'em', 28], [16, 'c', 24], [18, 'g', 31], [20, 'd', 26], [22, 'em', 28]];
  for (const [T, ch, b] of BARS) {
    const [, notes] = CH[ch];
    if (T === 22) { // последний такт — половина: грув обрывается на финальном ударе в 23
      kick(T, 1); kick(T + 0.75, 0.8); sub(T, b, 0.7, 0.55); sub(T + 0.75, b, 0.25, 0.45);
      for (let i = 0; i < 4; i++) hat(T + i * 0.25, i % 2 ? 0.04 : 0.065, false, (i % 2 ? 0.25 : -0.15));
      for (let i = 0; i < 4; i++) hat(T + 0.5 + i * 0.125, 0.03 + i * 0.01, false, -0.3);
      pad(T, 1.0, notes, 0.016, 0.1, 1500);
      continue;
    }
    kick(T, 1); kick(T + 0.75, 0.8); if (T % 4 === 0) kick(T + 1.25, 0.65);
    sub(T, b, 0.7, 0.55); sub(T + 0.75, b, 0.45, 0.45); sub(T + 1.25, b, 0.7, 0.45, T % 4 === 2 ? b + 7 : null);
    clap(T + 1, 0.42);
    for (let i = 0; i < 8; i++) hat(T + i * 0.25, i % 2 ? 0.04 : 0.065, i === 7, (i % 2 ? 0.25 : -0.15));
    if (T % 4 === 2) for (let i = 0; i < 4; i++) hat(T + 1.5 + i * 0.0625, 0.03 + i * 0.008, false, 0.3); // трель
    pad(T, 2.05, notes, 0.016, 0.1, 1500);
    if (T === 16 || T === 20) [[0.5, 83], [0.75, 76], [1.5, 78]].forEach(([d, m]) => pluck(T + d, m, 0.04, 3200));
    if (T >= 20) for (let i = 0; i < 16; i++) if (i % 4 === 3) hat(T + i * 0.125, 0.025, false, -0.3);
  }
  // 15–17: капли — музыка уходит «под воду»
  musLP.frequency.setValueAtTime(20000, 14.99);
  musLP.frequency.exponentialRampToValueAtTime(480, 15.04);
  musLP.frequency.setValueAtTime(480, 16.8);
  musLP.frequency.exponentialRampToValueAtTime(20000, 17.0);
  musBus.gain.setValueAtTime(0.8, 14.99); musBus.gain.linearRampToValueAtTime(0.55, 15.05);
  musBus.gain.setValueAtTime(0.55, 16.9); musBus.gain.linearRampToValueAtTime(0.8, 17.0);
  // 23: финал — последний удар, долгий аккорд, на карточке — два колокольчика
  kick(23, 1.2); sub(23, 28, 2.6, 0.7); crash(23, 0.12, 2.8); clap(23, 0.3);
  pad(23, 3.05, [40, 52, 55, 59, 62, 66], 0.02, 0.05, 1600);
  bell(23.7, 83, 0.09, 3); bell(23.92, 88, 0.07, 3);
}

// AudioBuffer → WAV (16 бит) — для MP4 и для проверки
export function toWav(buf) {
  const ch = buf.numberOfChannels, len = buf.length, sr = buf.sampleRate;
  const out = new DataView(new ArrayBuffer(44 + len * ch * 2));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); out.setUint32(4, 36 + len * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true); out.setUint32(24, sr, true);
  out.setUint32(28, sr * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, len * ch * 2, true);
  const data = []; for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) { const v = Math.max(-1, Math.min(1, data[c][i])); out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
  return out.buffer;
}
