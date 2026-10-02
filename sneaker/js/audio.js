// audio.js — музыка и звуковые акценты ролика, синтезированные WebAudio.
// Дорожка рендерится один раз в OfflineAudioContext: тот же буфер играет
// в браузере и уходит в MP4. Время каждого удара — из таймлайна.
import { SHOTS, FLASHES, IMPACT } from './timeline.js';

export const LENGTH = 22.5;
const BEAT = 0.5;          // 120 ударов в минуту
const N = (m) => 440 * Math.pow(2, (m - 69) / 12);
// ми минор: Em — C — G — D, такт = 2 с
const BARS = [[40, [52, 55, 59, 64]], [36, [48, 52, 55, 60]], [43, [55, 59, 62, 67]], [38, [50, 54, 57, 62]]];

function rng(seed) { let t = seed >>> 0; return () => { t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), t | 1); r ^= r + Math.imul(r ^ (r >>> 7), r | 61); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }

export async function renderTrack(sampleRate = 48000) {
  const ctx = new OfflineAudioContext(2, Math.ceil(LENGTH * sampleRate), sampleRate);
  build(ctx);
  return ctx.startRendering();
}

function build(ctx) {
  const r = rng(2026);
  const out = ctx.createGain(); out.gain.value = 0.8;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.ratio.value = 3.5; comp.attack.value = 0.004; comp.release.value = 0.18; comp.knee.value = 8;
  out.connect(comp).connect(ctx.destination);
  // реверберация: сгенерированный отклик
  const verb = ctx.createConvolver();
  const ir = ctx.createBuffer(2, Math.floor(ctx.sampleRate * 2.8), ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] = (r() * 2 - 1) * Math.pow(1 - i / d.length, 2.6); }
  verb.buffer = ir;
  const verbOut = ctx.createGain(); verbOut.gain.value = 0.32;
  verb.connect(verbOut).connect(out);
  // «насос»: музыка проседает под каждой бочкой
  const duck = ctx.createGain(); duck.connect(out);
  const music = ctx.createGain(); music.gain.value = 1; music.connect(duck);
  const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  { const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1; }

  const env = (g, t, a, peak, d, end = 0.0001) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(end, t + a + d); };
  const send = (node, amt) => { const g = ctx.createGain(); g.gain.value = amt; node.connect(g).connect(verb); };
  const noiseSrc = (t, dur) => { const s = ctx.createBufferSource(); s.buffer = nb; s.loop = true; s.start(t, r() * 1.5); s.stop(t + dur + 0.05); return s; };

  function kick(t, v = 1) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(155, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.11);
    env(g, t, 0.003, 0.95 * v, 0.38);
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.45);
    const c = noiseSrc(t, 0.02), f = ctx.createBiquadFilter(), cg = ctx.createGain();
    f.type = 'highpass'; f.frequency.value = 3500; env(cg, t, 0.001, 0.25 * v, 0.015);
    c.connect(f).connect(cg).connect(out);
    duck.gain.setValueAtTime(0.42, t); duck.gain.linearRampToValueAtTime(1, t + 0.22);
  }
  function hat(t, v = 0.2, open = false) {
    const s = noiseSrc(t, open ? 0.3 : 0.06), f = ctx.createBiquadFilter(), g = ctx.createGain(), p = ctx.createStereoPanner();
    f.type = 'highpass'; f.frequency.value = 7500; p.pan.value = 0.25;
    env(g, t, 0.001, v, open ? 0.22 : 0.045);
    s.connect(f).connect(g).connect(p).connect(out);
  }
  function clap(t, v = 0.45) {
    for (let i = 0; i < 3; i++) {
      const s = noiseSrc(t + i * 0.011, 0.2), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = 'bandpass'; f.frequency.value = 1600; f.Q.value = 0.9;
      env(g, t + i * 0.011, 0.001, v * (i === 2 ? 1 : 0.6), i === 2 ? 0.16 : 0.02);
      s.connect(f).connect(g).connect(out); send(g, 0.35);
    }
  }
  function boom(t, v = 1) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(26, t + 1.3);
    env(g, t, 0.005, 0.9 * v, 1.7);
    o.connect(g).connect(out); o.start(t); o.stop(t + 1.9);
    const s = noiseSrc(t, 0.9), f = ctx.createBiquadFilter(), ng = ctx.createGain();
    f.type = 'lowpass'; f.frequency.setValueAtTime(2400, t); f.frequency.exponentialRampToValueAtTime(200, t + 0.7);
    env(ng, t, 0.002, 0.5 * v, 0.8);
    s.connect(f).connect(ng).connect(out); send(ng, 0.6);
  }
  function crash(t, v = 0.25, dur = 1.8) {
    const s = noiseSrc(t, dur), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'highpass'; f.frequency.value = 5000;
    env(g, t, 0.002, v, dur);
    s.connect(f).connect(g).connect(out); send(g, 0.5);
  }
  function whoosh(t, dur, f0, f1, p0, p1, v = 0.35) {
    const s = noiseSrc(t, dur), f = ctx.createBiquadFilter(), g = ctx.createGain(), p = ctx.createStereoPanner();
    f.type = 'bandpass'; f.Q.value = 1.4;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    p.pan.setValueAtTime(p0, t); p.pan.linearRampToValueAtTime(p1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(p).connect(out); send(g, 0.3);
  }
  function riser(t, dur, v = 0.22) {
    whoosh(t, dur, 300, 6000, -0.3, 0.3, v);
    for (const det of [-9, 9]) {
      const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      o.type = 'sawtooth'; o.detune.value = det;
      o.frequency.setValueAtTime(N(40), t); o.frequency.exponentialRampToValueAtTime(N(64), t + dur);
      f.type = 'lowpass'; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(4000, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v * 0.25, t + dur * 0.95); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.02);
      o.connect(f).connect(g).connect(music); send(g, 0.3); o.start(t); o.stop(t + dur + 0.05);
    }
  }
  function bass(t, m, dur, v = 0.28) {
    const o = ctx.createOscillator(), sub = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = N(m); sub.frequency.value = N(m - 12);
    f.type = 'lowpass'; f.Q.value = 4; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(160, t + dur);
    env(g, t, 0.004, v, dur);
    o.connect(f); sub.connect(f); f.connect(g).connect(music);
    o.start(t); sub.start(t); o.stop(t + dur + 0.05); sub.stop(t + dur + 0.05);
  }
  function pad(t, dur, notes, v = 0.06, a = 0.4) {
    for (const m of notes) for (const det of [-7, 6]) {
      const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = N(m); o.detune.value = det;
      f.type = 'lowpass'; f.frequency.value = 1400;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + a); g.gain.setValueAtTime(v, t + dur - 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f).connect(g).connect(music); send(g, 0.5);
      o.start(t); o.stop(t + dur + 0.05);
    }
  }
  function stab(t, notes, v = 0.12) {
    for (const m of notes) {
      const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'square'; o.frequency.value = N(m);
      f.type = 'lowpass'; f.frequency.setValueAtTime(5000, t); f.frequency.exponentialRampToValueAtTime(400, t + 0.35);
      env(g, t, 0.003, v, 0.45);
      o.connect(f).connect(g).connect(music); send(g, 0.6); o.start(t); o.stop(t + 0.6);
    }
  }
  function blip(t, f, v = 0.12) {
    for (const [k, a] of [[1, 1], [2.01, 0.3]]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f * k; env(g, t, 0.002, v * a, 0.12);
      o.connect(g).connect(out); send(g, 0.4); o.start(t); o.stop(t + 0.2);
    }
  }
  function bell(t, m, v = 0.18, dur = 3) {
    const c = ctx.createOscillator(), mo = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
    c.frequency.value = N(m); mo.frequency.value = N(m) * 3.5;
    mg.gain.setValueAtTime(N(m) * 2.2, t); mg.gain.exponentialRampToValueAtTime(1, t + dur * 0.6);
    mo.connect(mg).connect(c.frequency);
    env(g, t, 0.002, v, dur);
    c.connect(g).connect(out); send(g, 0.6);
    c.start(t); mo.start(t); c.stop(t + dur + 0.1); mo.stop(t + dur + 0.1);
  }

  // ---- 0–4: тьма, сердцебиение, полоса света
  pad(0.2, 4.0, [52, 59], 0.035, 2.5);
  for (const b of [0.6, 1.6, 2.6]) { kick(b, 0.45); kick(b + 0.24, 0.3); }
  whoosh(0.3, 3.1, 500, 5000, -0.85, 0.85, 0.3);
  bell(2.55, 76, 0.07, 2.5);
  riser(2.0, 2.0, 0.25);
  // ---- 4–17: ритм
  const beatEnd = SHOTS.pack;
  for (let t = SHOTS.hero; t < beatEnd - 0.01; t += BEAT) {
    const quiet = (t > 12.74 && t < 13.5) || (t > 11.2 && t < 11.75);
    if (!quiet) kick(t, 1);
    hat(t + BEAT / 2, 0.16, (Math.round((t - 4) / BEAT) % 4) === 3);
    if (t >= SHOTS.run && !quiet) { hat(t + BEAT / 4, 0.08); hat(t + 3 * BEAT / 4, 0.08); }
    const beatN = Math.round((t - SHOTS.hero) / BEAT);
    if (beatN % 2 === 1 && !quiet) clap(t, 0.32);
    const bar = BARS[Math.floor((t - SHOTS.hero) / 2) % 4];
    if (!quiet) { bass(t, bar[0], 0.22); bass(t + BEAT / 2, bar[0] + (beatN % 4 === 3 ? 7 : 0), 0.2, 0.22); }
  }
  for (let b = 0; b < 6; b++) { const t = SHOTS.hero + b * 2; pad(t, 2.05, BARS[b % 4][1], 0.03, 0.15); }
  // ---- удары на вспышках
  for (const [t, a] of FLASHES) { boom(t, a + 0.35); crash(t, 0.22 * (a + 0.5)); }
  // ---- 8–12: взрыв-схема
  whoosh(8.05, 0.9, 400, 3500, -0.4, 0.4, 0.4);
  [9.0, 9.35, 9.7, 10.05, 10.4].forEach((t, i) => blip(t, N(76 + [0, 3, 7, 10, 12][i]), 0.11));
  whoosh(11.05, 0.7, 3000, 300, 0.4, -0.4, 0.35);
  clap(11.75, 0.6);
  // ---- 12–15: бег
  whoosh(12.0, 0.9, 800, 3000, 0.9, -0.9, 0.28);
  whoosh(12.55, 0.45, 1500, 600, 0.5, 0, 0.3);
  boom(IMPACT, 1.2);
  crash(IMPACT, 0.3, 2.2);
  whoosh(13.6, 0.7, 500, 5000, 0, 0.6, 0.4);
  blip(14.2, N(83), 0.1);
  // ---- 15–17: расцветки
  stab(15, [64, 67, 71, 76]); stab(16, [62, 66, 69, 74]);
  whoosh(14.75, 0.25, 800, 4000, -0.3, 0.3, 0.3); whoosh(15.75, 0.25, 800, 4000, 0.3, -0.3, 0.3);
  // ---- 17–22: финал
  pad(17, 5.2, [40, 52, 55, 59, 66], 0.05, 0.05);
  bass(17, 28, 2.5, 0.35);
  bell(17.35, 88, 0.16, 3.5); bell(17.6, 95, 0.1, 3.5);
  whoosh(18.4, 0.8, 600, 2400, -0.2, 0.2, 0.18);
  blip(19.0, N(88), 0.07);
}

// AudioBuffer → WAV (16 бит)
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
