/* =========================================================================
   sound.js — звук тоже пишется кодом
   -------------------------------------------------------------------------
   Музыкальная шкатулка (колыбельная), шорох карандаша, тиканье лет, щелчки,
   стук коробки, завод шкатулки на повороте. Время каждого звука берётся из
   STORY.T и STORY.soundEvents() — тех же констант, по которым рисуется кадр.
   Один и тот же код играет в браузере (AudioContext) и рендерит WAV для MP4
   (OfflineAudioContext).
   ========================================================================= */
(function (global) {
  'use strict';
  const P = global.PEN, S = global.STORY;
  const T = S.T;
  const MASTER = 0.9;

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  // ---------------------------------------------------------------------
  // Колыбельная (своя мелодия), 3/4
  // ---------------------------------------------------------------------
  const PHRASE_A = [[76, 1], [79, 1], [76, 1], [74, 2], [72, 1], [74, 1], [76, 1], [79, 1], [76, 3]];
  const PHRASE_B = [[81, 1], [79, 1], [76, 1], [77, 2], [74, 1], [76, 1], [74, 1], [71, 1], [72, 3]];
  const CHORDS = {
    C: [48, [60, 64, 67]], G: [43, [59, 62, 67]], F: [41, [60, 65, 69]], Dm: [50, [62, 65, 69]], Am: [45, [60, 64, 69]],
  };
  const BARS_A = ['C', 'G', 'G', 'C'], BARS_B = ['F', 'Dm', 'G', 'C'];

  // события: { t, fn(ctx, when, out, skip) , end }
  function buildEvents() {
    const ev = [];
    const add = (t, fn, end) => ev.push({ t, fn, end: end === undefined ? t : end });

    // фраза мелодии с аккомпанементом; warp — замедление «заводной» шкатулки
    function phrase(notes, bars, t0, beat, o) {
      let b = 0;
      const warp = o.warp || ((x) => ({ t: x, pitch: 0, vel: 1 }));
      for (const [n, len] of notes) {
        const w = warp(t0 + b * beat);
        if (w.vel > 0.02) add(w.t, (c, when, out) => musicBox(c, when, out, midi(n + w.pitch), o.mel * w.vel));
        if (o.octave) add(w.t, (c, when, out) => musicBox(c, when, out, midi(n - 12 + w.pitch), o.mel * 0.35 * w.vel));
        b += len;
      }
      bars.forEach((name, i) => {
        const [bass, up] = CHORDS[name];
        const tb = t0 + i * 3 * beat;
        for (let k = 1; k <= 2; k++) {
          const w = warp(tb + k * beat);
          if (w.vel > 0.02) for (const u of up.slice(k - 1, k + 1)) add(w.t, (c, when, out) => musicBox(c, when, out, midi(u + w.pitch), o.acc * w.vel));
        }
        if (o.bass) add(tb, (c, when, out) => bassNote(c, when, out, midi(bass), o.bass, beat * 3));
        if (o.pad) add(tb, (c, when, out) => pad(c, when, out, up.map(midi), o.pad, beat * 3), tb + beat * 3);
      });
      return t0 + b * beat;
    }
    const beat = 60 / 84;
    // до поворота: одна тонкая шкатулка
    let t = phrase(PHRASE_A, BARS_A, 0.2, beat, { mel: 0.42, acc: 0.13 });
    t = phrase(PHRASE_B, BARS_B, t, beat, { mel: 0.42, acc: 0.13 });
    // третий раз — шкатулка в коробке замедляется и умолкает
    const slow0 = T.lidClose[1];
    const warp = (x) => {
      if (x < slow0) return { t: x, pitch: 0, vel: 1 };
      const d = x - slow0;
      return { t: slow0 + d * (1 + d * 0.9), pitch: -d * 0.9, vel: Math.max(0, 1 - d / 1.4) };
    };
    phrase(PHRASE_A, BARS_A, t, beat, { mel: 0.4, acc: 0.12, warp });
    // чердак: редкие холодные ноты
    add(T.s3a + 0.7, (c, w, o) => musicBox(c, w, o, midi(81) * 0.995, 0.16));
    add(T.s3a + 1.6, (c, w, o) => musicBox(c, w, o, midi(76) * 0.995, 0.12));
    add(T.s3a + 2.4, (c, w, o) => musicBox(c, w, o, midi(79) * 0.995, 0.1));
    // завод шкатулки: трещотка ускоряется
    for (let i = 0; i < 12; i++) { const u = i / 11; add(T.crack[0] + (T.crack[1] - T.crack[0] - 0.04) * Math.sqrt(u), (c, w, o) => ratchet(c, w, o, 0.32 + u * 0.1)); }
    // ПОВОРОТ
    add(T.TURN, (c, w, o) => turnHit(c, w, o));
    [72, 76, 79, 84, 88, 91].forEach((n, i) => add(T.TURN + i * 0.055, (c, w, o) => musicBox(c, w, o, midi(n), 0.38)));
    // после поворота: полная колыбельная с басом и тёплой подкладкой
    // четыре фразы ровно до медленного хода к финалу (темп считается от раскадровки)
    const FINAL = T.still, slowBeat = 0.95;
    const full = { mel: 0.46, acc: 0.15, bass: 0.16, pad: 0.035, octave: true };
    const beat2 = (FINAL - 3 * slowBeat - (T.TURN + 0.45)) / 48;
    t = phrase(PHRASE_A, BARS_A, T.TURN + 0.45, beat2, full);
    t = phrase(PHRASE_B, BARS_B, t, beat2, Object.assign({}, full, { pad: 0.05 }));
    t = phrase(PHRASE_A, BARS_A, t, beat2, Object.assign({}, full, { mel: 0.42 }));
    t = phrase(PHRASE_B, BARS_B, t, beat2, Object.assign({}, full, { mel: 0.4, pad: 0.05 }));
    // постер: медленный ход к финалу (ми–ре–си), финальный аккорд звенит до конца
    phrase([[76, 1], [74, 1], [71, 1]], ['G'], FINAL - 3 * slowBeat, slowBeat, { mel: 0.4, acc: 0.12, bass: 0.13, pad: 0.04 });
    add(FINAL, (c, w, o) => { [48, 60, 64, 67, 72, 76].forEach((n, i) => musicBox(c, w + i * 0.03, o, midi(n), i ? 0.3 : 0.2, 2.6)); pad(c, w, o, [60, 64, 67].map(midi), 0.05, 3.6); bassNote(c, w, o, midi(36), 0.16, 3.6); }, T.END);

    // ---- шумы и действия из раскадровки
    const E = S.soundEvents();
    E.scratch.forEach(([a, b, lv], i) => add(a, (c, w, o, skip) => scratch(c, w, o, b - a - (skip || 0), lv, i), b));
    E.ticks.forEach((x) => add(x, (c, w, o) => tick(c, w, o)));
    E.marks.forEach((x) => add(x, (c, w, o) => markScratch(c, w, o)));
    E.steps.forEach((x) => add(x, (c, w, o) => step(c, w, o)));
    E.chimes.forEach((x) => add(x, (c, w, o) => { musicBox(c, w, o, midi(96), 0.22); musicBox(c, w + 0.07, o, midi(91), 0.18); }));
    E.hugs.forEach((x) => add(x, (c, w, o) => hug(c, w, o)));
    E.clicks.forEach((x) => add(x, (c, w, o) => click(c, w, o, 0.4)));
    E.stitches.forEach((x) => add(x, (c, w, o) => stitch(c, w, o)));
    E.thuds.forEach((x) => add(x, (c, w, o) => thud(c, w, o)));
    E.puffs.forEach((x) => add(x, (c, w, o) => puff(c, w, o)));
    E.knits.forEach((x) => add(x, (c, w, o) => click(c, w, o, 0.12, 1500)));
    E.whoosh.forEach((x) => add(x, (c, w, o) => whoosh(c, w, o)));
    ev.sort((a, b) => a.t - b.t);
    return ev;
  }

  // ---------------------------------------------------------------------
  // Инструменты
  // ---------------------------------------------------------------------
  let noiseBuf = null;
  function noise(c) {
    if (noiseBuf && noiseBuf.sampleRate === c.sampleRate && noiseBuf._ctx === c) return noiseBuf;
    const r = P.rng(P.hashStr('noise'));
    const len = c.sampleRate * 2;
    const b = c.createBuffer(1, len, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = r() * 2 - 1;
    b._ctx = c;
    noiseBuf = b;
    return b;
  }
  function env(c, when, peak, att, dec) {
    const g = c.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(peak, when + att);
    g.gain.setTargetAtTime(0, when + att, dec);
    return g;
  }
  function musicBox(c, when, out, f, vel, decay = 1.6) {
    const parts = [[1, 1], [2, 0.32], [3, 0.1], [4.07, 0.07], [5.4, 0.035]];
    const tau = decay * Math.pow(440 / f, 0.25) * 0.55;
    for (const [mul, a] of parts) {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(f * mul, when);
      const g = env(c, when, vel * a * 0.5, 0.003, tau / (1 + (mul - 1) * 0.7));
      o.connect(g); g.connect(out);
      o.start(when); o.stop(when + tau * 7);
    }
  }
  function bassNote(c, when, out, f, vel, dur) {
    const o = c.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(f, when);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
    const g = env(c, when, vel * 0.6, 0.02, dur * 0.45);
    o.connect(lp); lp.connect(g); g.connect(out);
    o.start(when); o.stop(when + dur * 3);
  }
  function pad(c, when, out, freqs, vel, dur) {
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100; lp.Q.value = 0.4;
    const g = c.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(vel, when + Math.min(0.6, dur * 0.4));
    g.gain.setValueAtTime(vel, when + dur * 0.8);
    g.gain.linearRampToValueAtTime(0, when + dur + 0.6);
    lp.connect(g); g.connect(out);
    for (const f of freqs) for (const d of [-4, 4]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f, when); o.detune.value = d;
      o.connect(lp); o.start(when); o.stop(when + dur + 0.8);
    }
  }
  function noiseHit(c, when, out, { type = 'bandpass', freq = 2000, q = 1, vel = 0.2, att = 0.002, dec = 0.03, dur = 0.2, sweep = null, offset = 0 }) {
    const s = c.createBufferSource(); s.buffer = noise(c); s.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, when); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, when + dur);
    const g = env(c, when, vel, att, dec);
    s.connect(f); f.connect(g); g.connect(out);
    s.start(when, offset % 1.9); s.stop(when + dur + dec * 6);
  }
  // шорох карандаша: серия штрихов разной длины
  function scratch(c, when, out, dur, lv, seed) {
    if (dur <= 0.02) return;
    const r = P.rng(P.hashStr('scr' + seed));
    const s = c.createBufferSource(); s.buffer = noise(c); s.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.9;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
    const g = c.createGain(); g.gain.setValueAtTime(0, when);
    let x = when;
    while (x < when + dur) {
      const len = 0.08 + r() * 0.22, gap = 0.02 + r() * 0.07, v = (0.05 + r() * 0.05) * lv;
      bp.frequency.setValueAtTime(2200 + r() * 2600, x);
      g.gain.setValueAtTime(0, x);
      g.gain.linearRampToValueAtTime(v, x + 0.02);
      g.gain.linearRampToValueAtTime(v * (0.6 + r() * 0.4), x + len * 0.7);
      g.gain.linearRampToValueAtTime(0, x + len);
      x += len + gap;
    }
    s.connect(hp); hp.connect(bp); bp.connect(g); g.connect(out);
    s.start(when, r() * 1.5); s.stop(x + 0.1);
  }
  function tick(c, w, out) {
    noiseHit(c, w, out, { type: 'highpass', freq: 3500, vel: 0.1, dec: 0.01, dur: 0.03 });
    const o = c.createOscillator(); o.frequency.value = 1900; const g = env(c, w, 0.05, 0.001, 0.012);
    o.connect(g); g.connect(out); o.start(w); o.stop(w + 0.08);
  }
  function markScratch(c, w, out) { noiseHit(c, w, out, { freq: 3200, q: 1.4, vel: 0.22, att: 0.01, dec: 0.05, dur: 0.12, sweep: 4200 }); }
  function step(c, w, out) {
    const o = c.createOscillator(); o.frequency.setValueAtTime(110, w); o.frequency.exponentialRampToValueAtTime(55, w + 0.08);
    const g = env(c, w, 0.12, 0.004, 0.04); o.connect(g); g.connect(out); o.start(w); o.stop(w + 0.25);
    noiseHit(c, w, out, { type: 'lowpass', freq: 500, vel: 0.06, dec: 0.03, dur: 0.06 });
  }
  function hug(c, w, out) {
    const o = c.createOscillator(); o.frequency.setValueAtTime(160, w); o.frequency.exponentialRampToValueAtTime(70, w + 0.3);
    const g = env(c, w, 0.16, 0.05, 0.12); o.connect(g); g.connect(out); o.start(w); o.stop(w + 0.8);
  }
  function click(c, w, out, vel, f = 2600) {
    noiseHit(c, w, out, { type: 'highpass', freq: 3000, vel: vel * 0.6, dec: 0.006, dur: 0.02 });
    const o = c.createOscillator(); o.frequency.value = f; const g = env(c, w, vel * 0.3, 0.001, 0.008);
    o.connect(g); g.connect(out); o.start(w); o.stop(w + 0.05);
  }
  function stitch(c, w, out) { noiseHit(c, w, out, { freq: 1800, q: 2, vel: 0.16, att: 0.02, dec: 0.04, dur: 0.12, sweep: 2600 }); }
  function thud(c, w, out) {
    const o = c.createOscillator(); o.frequency.setValueAtTime(90, w); o.frequency.exponentialRampToValueAtTime(42, w + 0.2);
    const g = env(c, w, 0.4, 0.003, 0.08); o.connect(g); g.connect(out); o.start(w); o.stop(w + 0.6);
    noiseHit(c, w, out, { type: 'lowpass', freq: 380, vel: 0.3, dec: 0.06, dur: 0.15 });
  }
  function puff(c, w, out) { noiseHit(c, w, out, { type: 'lowpass', freq: 2200, vel: 0.14, att: 0.03, dec: 0.12, dur: 0.4, sweep: 400 }); }
  function whoosh(c, w, out) { noiseHit(c, w, out, { freq: 500, q: 0.7, vel: 0.05, att: 0.25, dec: 0.15, dur: 0.6, sweep: 1600 }); }
  function ratchet(c, w, out, vel) {
    noiseHit(c, w, out, { freq: 2300, q: 4, vel: vel * 0.5, dec: 0.008, dur: 0.03 });
    const o = c.createOscillator(); o.frequency.value = 900; const g = env(c, w, vel * 0.2, 0.001, 0.006);
    o.connect(g); g.connect(out); o.start(w); o.stop(w + 0.04);
  }
  function turnHit(c, w, out) {
    noiseHit(c, w, out, { type: 'highpass', freq: 6000, vel: 0.12, att: 0.01, dec: 0.5, dur: 1.4 });
    const o = c.createOscillator(); o.frequency.setValueAtTime(65, w); o.frequency.exponentialRampToValueAtTime(48, w + 0.6);
    const g = env(c, w, 0.3, 0.01, 0.25); o.connect(g); g.connect(out); o.start(w); o.stop(w + 1.6);
    pad(c, w, out, [60, 64, 67, 72].map(midi), 0.05, 2.2);
  }

  // ---------------------------------------------------------------------
  // Вывод: общий канал с компрессором
  // ---------------------------------------------------------------------
  function masterChain(c) {
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.005; comp.release.value = 0.2; comp.knee.value = 8;
    const g = c.createGain(); g.gain.value = MASTER;
    comp.connect(g); g.connect(c.destination);
    return comp;
  }

  let EVENTS = null;
  const events = () => (EVENTS || (EVENTS = buildEvents()));

  // ---- живое воспроизведение с планировщиком «на секунду вперёд»
  const live = { ctx: null, bus: null, timer: null, base: 0, idx: 0, from: 0, muted: false, master: null };
  function ensureCtx() {
    if (!live.ctx) {
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      live.ctx = new AC();
      live.master = masterChain(live.ctx);
    }
    return live.ctx;
  }
  function play(fromT) {
    stop();
    const c = ensureCtx();
    if (!c) return false;
    if (c.state === 'suspended') c.resume();
    const ev = events();
    live.bus = c.createGain();
    live.bus.gain.value = live.muted ? 0 : 1;
    live.bus.connect(live.master);
    live.base = c.currentTime + 0.06 - fromT;
    live.from = fromT;
    live.idx = 0;
    // длинные события, которые уже идут, запускаем с середины
    for (const e of ev) if (e.t < fromT && e.end > fromT + 0.05) e.fn(c, c.currentTime + 0.06, live.bus, fromT - e.t);
    while (live.idx < ev.length && ev[live.idx].t < fromT - 0.01) live.idx++;
    const pump = () => {
      const now = c.currentTime - live.base;
      while (live.idx < ev.length && ev[live.idx].t < now + 1.2) {
        const e = ev[live.idx++];
        e.fn(c, Math.max(c.currentTime + 0.005, live.base + e.t), live.bus, 0);
      }
    };
    pump();
    live.timer = setInterval(pump, 80);
    return true;
  }
  function stop() {
    if (live.timer) clearInterval(live.timer);
    live.timer = null;
    if (live.bus) {
      const b = live.bus, c = live.ctx;
      b.gain.setTargetAtTime(0, c.currentTime, 0.02);
      setTimeout(() => { try { b.disconnect(); } catch (e) { /* уже отключён */ } }, 200);
      live.bus = null;
    }
  }
  function time() { return live.ctx && live.bus ? live.ctx.currentTime - live.base : null; }
  function setMuted(m) {
    live.muted = m;
    if (live.bus && live.ctx) live.bus.gain.setTargetAtTime(m ? 0 : 1, live.ctx.currentTime, 0.03);
  }

  // ---- офлайн-рендер для MP4
  async function renderOffline(sampleRate = 48000, gain = 1) {
    const len = Math.ceil((T.END + 0.2) * sampleRate);
    const c = new OfflineAudioContext(2, len, sampleRate);
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.005; comp.release.value = 0.2; comp.knee.value = 8;
    const g = c.createGain(); g.gain.value = MASTER * gain;
    comp.connect(g); g.connect(c.destination);
    noiseBuf = null;
    for (const e of buildEvents()) e.fn(c, e.t + 0.0001, comp, 0);
    const buf = await c.startRendering();
    noiseBuf = null;
    return buf;
  }
  function toWav(buf) {
    const ch = buf.numberOfChannels, n = buf.length, sr = buf.sampleRate;
    const out = new DataView(new ArrayBuffer(44 + n * ch * 2));
    const ws = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); ws(8, 'WAVE'); ws(12, 'fmt ');
    out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true); out.setUint32(24, sr, true);
    out.setUint32(28, sr * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true); ws(36, 'data'); out.setUint32(40, n * ch * 2, true);
    const data = []; for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
    let o = 44;
    for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const v = Math.max(-1, Math.min(1, data[c][i])); out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
    return out.buffer;
  }

  global.SOUND = { play, stop, time, setMuted, renderOffline, toWav, events };
})(typeof window !== 'undefined' ? window : globalThis);
