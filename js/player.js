/* =========================================================================
   player.js — плеер: воспроизведение, перемотка-ростомер, палитры, звук
   ========================================================================= */
(function () {
  'use strict';
  const P = window.PEN, S = window.STORY, SND = window.SOUND;
  const END = S.T.END;
  const COVER_T = 3.59; // обложка до нажатия «Смотреть»: мишка и название уже нарисованы

  const canvas = document.getElementById('film');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const seek = $('seek'), clock = $('clock'), done = $('done'), bigplay = $('bigplay');
  const ICON_PLAY = 'M7 4.5v15l12.5-7.5z';
  const ICON_PAUSE = 'M6.5 4.5h4v15h-4z M13.5 4.5h4v15h-4z';
  const ICON_REPLAY = 'M12 5a7 7 0 1 1-6.6 4.7l1.9.6A5 5 0 1 0 12 7v3L7.5 6 12 2z';
  const SPEAKER_ON = '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>';
  const SPEAKER_OFF = '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>';

  let t = COVER_T, playing = false, started = false;
  let startT = 0, startPerf = 0, usingAudio = false, muted = false, lastFrame = -1;

  const fmt = (x) => { const s = Math.max(0, Math.floor(x + 1e-6)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  // главы на ростомере
  const chapters = S.chapters;
  const ol = $('chapters');
  chapters.forEach((c, i) => {
    const li = document.createElement('li');
    li.textContent = c.label;
    li.style.left = (c.t / END * 100) + '%';
    if (i === 0 || i === chapters.length - 1 || c.label === 'чердак') li.classList.add('minor');
    li.addEventListener('click', () => jump(c.t + 0.01));
    ol.appendChild(li);
  });
  const lis = Array.from(ol.children);

  function ui() {
    const shown = started ? t : 0;
    seek.value = String(shown);
    done.style.width = (shown / END * 100) + '%';
    clock.textContent = `${fmt(shown)} / ${fmt(END)}`;
    let cur = 0;
    chapters.forEach((c, i) => { if (shown >= c.t - 0.001) cur = i; });
    lis.forEach((li, i) => li.classList.toggle('on', started && i === cur));
    const ended = started && !playing && t >= END - 0.01;
    $('playIcon').setAttribute('d', playing ? ICON_PAUSE : ended ? ICON_REPLAY : ICON_PLAY);
    $('play').setAttribute('aria-label', playing ? 'Пауза' : ended ? 'Смотреть заново' : 'Смотреть');
  }
  // внутреннее разрешение: по размеру сцены на экране, а если кадр не успевает за 1/12 с — ниже
  // [разрешение, детализация мелка]: первые три ступени — по размеру экрана, дальше — если не успеваем
  const QUALITY = [1, 0.8, 0.667, 0.667, 0.5];
  const DETAIL = [1, 1, 1, 1.35, 1.7];
  let qi = 0, slow = 0, timed = 0;
  function setQuality(i) {
    qi = Math.max(0, Math.min(QUALITY.length - 1, i));
    P.detail = DETAIL[qi];
    canvas.width = Math.round(1920 * QUALITY[qi]);
    canvas.height = Math.round(1080 * QUALITY[qi]);
    lastFrame = -1;
  }
  function fitQuality() {
    const px = canvas.getBoundingClientRect().width * (window.devicePixelRatio || 1);
    let i = 0;
    while (i < 2 && 1920 * QUALITY[i + 1] >= px) i++;
    setQuality(i);
  }
  function draw(force) {
    const f = Math.floor(t * P.DRAW_FPS + 1e-6);
    if (!force && f === lastFrame) return;
    lastFrame = f;
    const t0 = performance.now();
    S.renderFrame(ctx, t);
    if (playing) {
      const ms = performance.now() - t0;
      timed++;
      if (ms > 78) slow++;
      if (timed >= 8) {
        if (slow >= 4 && qi < QUALITY.length - 1) setQuality(qi + 1);
        timed = 0; slow = 0;
      }
    }
  }
  function now() {
    if (usingAudio) { const a = SND.time(); if (a !== null) return a; }
    return startT + (performance.now() - startPerf) / 1000;
  }
  function startClock() {
    startT = t; startPerf = performance.now();
    usingAudio = SND.play(t);
    SND.setMuted(muted);
  }
  function play() {
    if (!started || t >= END - 0.05) t = 0;
    started = true;
    playing = true;
    bigplay.hidden = true;
    startClock();
    ui();
    requestAnimationFrame(loop);
  }
  function pause() {
    playing = false;
    SND.stop();
    usingAudio = false;
    ui();
  }
  function toggle() { if (playing) pause(); else play(); }
  function loop() {
    if (!playing) return;
    t = now();
    if (t >= END) { t = END; draw(true); pause(); return; }
    draw(false);
    ui();
    requestAnimationFrame(loop);
  }
  function jump(x) {
    started = true;
    bigplay.hidden = true;
    t = Math.max(0, Math.min(END, x));
    if (playing) { SND.stop(); startClock(); }
    draw(true);
    ui();
  }

  $('play').addEventListener('click', toggle);
  bigplay.addEventListener('click', play);
  canvas.addEventListener('click', toggle);
  seek.addEventListener('input', () => jump(parseFloat(seek.value)));
  $('mute').addEventListener('click', () => {
    muted = !muted;
    SND.setMuted(muted);
    $('mute').setAttribute('aria-pressed', String(muted));
    $('mute').querySelector('svg').innerHTML = muted ? SPEAKER_OFF : SPEAKER_ON;
    $('muteText').textContent = muted ? 'Звук выключен' : 'Звук включён';
  });
  $('mute').querySelector('svg').innerHTML = SPEAKER_ON;
  document.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) || '';
    if (e.code === 'Space' && tag !== 'BUTTON' && tag !== 'INPUT') { e.preventDefault(); toggle(); }
    if ((e.code === 'ArrowRight' || e.code === 'ArrowLeft') && tag !== 'INPUT') { e.preventDefault(); jump((started ? t : 0) + (e.code === 'ArrowRight' ? 1 : -1)); }
  });

  // палитры
  const pal = $('palette');
  const names = Object.keys(P.THEMES);
  function setTheme(name) {
    P.setTheme(name);
    Array.from(pal.querySelectorAll('button')).forEach((b) => b.setAttribute('aria-checked', String(b.dataset.theme === P.themeName)));
    Array.from(pal.querySelectorAll('button')).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.theme === P.themeName)));
    document.querySelector('.stage').style.background = P.THEMES[P.themeName].paper;
    try { localStorage.setItem('mishka-theme', P.themeName); } catch (e) { /* хранилище недоступно */ }
    draw(true);
  }
  names.forEach((n) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn'; b.dataset.theme = n; b.setAttribute('role', 'radio');
    b.innerHTML = `<span class="swatch" style="background:${P.THEMES[n].paper}"></span>${P.THEMES[n].title}`;
    b.addEventListener('click', () => setTheme(n));
    pal.appendChild(b);
  });

  // для покадровой проверки и рендера MP4
  window.__film = {
    END,
    render(x) { t = x; started = true; lastFrame = -1; S.renderFrame(ctx, x); return true; },
    quality(rs) { const i = QUALITY.indexOf(rs); setQuality(i < 0 ? 0 : i); return canvas.width; },
    setTheme,
  };

  // ждём шрифт, иначе первый кадр нарисуется запасным
  const fontsReady = Promise.race([
    Promise.allSettled([document.fonts.load('700 64px "Caveat"', 'Мишка'), document.fonts.load('700 64px "Caveat Local"', 'Мишка')]),
    new Promise((r) => setTimeout(r, 3000)),
  ]);
  fontsReady.then(() => {
    let saved = null;
    try { saved = localStorage.getItem('mishka-theme'); } catch (e) { /* хранилище недоступно */ }
    const fromHash = (location.hash || '').slice(1);
    fitQuality();
    setTheme(P.THEMES[fromHash] ? fromHash : (saved && P.THEMES[saved] ? saved : S.THEME));
    draw(true);
    ui();
    window.__filmReady = true;
  });
})();
