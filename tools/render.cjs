// Рендер MP4: невидимый браузер снимает каждый рисунок (12 в секунду),
// ffmpeg удваивает кадры до 24 к/с («на двойках») и добавляет звук,
// который синтезирует тот же sound.js через OfflineAudioContext.
// Запуск: NODE_PATH=$(npm root -g) node tools/render.cjs [out.mp4] [тема]
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync, execFileSync } = require('child_process');
const { openFilm } = require('./serve.cjs');

const TARGET_LUFS = -15;   // методичка: −16…−14 LUFS
const PEAK_DB = -1.0;      // пик не выше −1 dBFS

function measure(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' });
  const txt = r.stderr;
  const I = parseFloat((txt.match(/I:\s+(-?[\d.]+) LUFS/g) || []).pop().match(/-?[\d.]+/)[0]);
  const peakM = txt.match(/Peak:\s+(-?[\d.]+|-inf) dBFS/g);
  const peak = peakM ? parseFloat(peakM.pop().match(/(-?[\d.]+|-inf)/)[0]) : NaN;
  return { I, peak };
}

(async () => {
  const outFile = path.resolve(process.argv[2] || 'mishka.mp4');
  const theme = (process.argv[3] && !process.argv[3].startsWith('--')) ? process.argv[3] : '';
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'mishka-'));
  const { browser, page, srv, errors } = await openFilm(theme);
  const END = await page.evaluate(() => window.__film.END);

  // 1. звук
  console.log('синтезирую звук…');
  const wavB64 = await page.evaluate(async () => {
    const buf = await window.SOUND.renderOffline(48000);
    const wav = new Uint8Array(window.SOUND.toWav(buf));
    let s = '';
    for (let i = 0; i < wav.length; i += 0x8000) s += String.fromCharCode.apply(null, wav.subarray(i, i + 0x8000));
    return btoa(s);
  });
  const raw = path.join(tmp, 'raw.wav');
  fs.writeFileSync(raw, Buffer.from(wavB64, 'base64'));
  const m0 = measure(raw);
  const gain = TARGET_LUFS - m0.I;
  const wav = path.join(tmp, 'audio.wav');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-af', `volume=${gain.toFixed(2)}dB,alimiter=limit=${Math.pow(10, (PEAK_DB - 0.3) / 20).toFixed(4)}:level=disabled`, '-ar', '48000', wav]);
  const m1 = measure(wav);
  console.log(`громкость: было ${m0.I} LUFS → стало ${m1.I} LUFS, пик ${m1.peak} dBFS`);

  // только пересобрать звук у готового видео
  if (process.argv.includes('--audio-only') && fs.existsSync(outFile)) {
    const tmpOut = path.join(tmp, 'remux.mp4');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', outFile, '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', tmpOut]);
    fs.copyFileSync(tmpOut, outFile);
    await browser.close(); srv.close();
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log('звук пересобран: ' + outFile);
    return;
  }

  // 2. картинка
  const n = Math.round(END * 12);
  console.log(`рисую ${n} рисунков…`);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '12', '-i', '-', '-i', wav,
    '-vf', 'fps=24,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-c:a', 'aac', '-b:a', '192k',
    '-shortest', '-movflags', '+faststart', outFile], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const data = await page.evaluate((x) => { window.__film.render(x); return document.getElementById('film').toDataURL('image/png'); }, i / 12);
    const buf = Buffer.from(data.split(',')[1], 'base64');
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 60 === 0) console.log(`  ${i}/${n}  ${((Date.now() - t0) / 1000).toFixed(0)} с`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  if (errors.filter((e) => !/ERR_FAILED/.test(e)).length) console.log('ОШИБКИ НА СТРАНИЦЕ:\n' + errors.join('\n'));
  await browser.close();
  srv.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('готово: ' + outFile);
})().catch((e) => { console.error(e); process.exit(1); });
