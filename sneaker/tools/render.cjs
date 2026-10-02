// Рендер ролика в MP4 со звуком: node tools/render.cjs [out.mp4] [--fps 24] [--audio-only]
// Каждый кадр рисует невидимый Chromium (WebGL), ffmpeg собирает видео,
// звук синтезирует тот же audio.js (OfflineAudioContext) и выравнивается до −14 LUFS.
const fs = require('fs'), path = require('path'), os = require('os');
const { spawn, spawnSync, execFileSync } = require('child_process');
const { openPage } = require('./serve.cjs');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const TARGET_LUFS = -14, PEAK_DB = -1.5;

function loudness(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' });
  const I = parseFloat((r.stderr.match(/I:\s+(-?[\d.]+) LUFS/g) || []).pop().match(/-?[\d.]+/)[0]);
  const pk = (r.stderr.match(/Peak:\s+(-?[\d.]+|-inf) dBFS/g) || []).pop();
  return { I, peak: pk ? parseFloat(pk.match(/(-?[\d.]+|-inf)/)[0]) : NaN };
}

(async () => {
  const out = path.resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'out/orbita-pulse-one.mp4');
  const fps = Number(arg('--fps', 24));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orbita-'));
  const { browser, page, srv, errors } = await openPage('index.html', { width: 1920, height: 1080, query: '?capture' });
  await page.waitForFunction(() => window.__ad && window.__ad.ready === true, null, { timeout: 180000 });
  const dur = await page.evaluate(() => window.__ad.duration);

  console.log('синтезирую звук…');
  const b64 = await page.evaluate(() => window.__ad.wav());
  const raw = path.join(tmp, 'raw.wav'), wav = path.join(tmp, 'audio.wav');
  fs.writeFileSync(raw, Buffer.from(b64, 'base64'));
  const m0 = loudness(raw);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-af', `volume=${(TARGET_LUFS - m0.I).toFixed(2)}dB,alimiter=limit=${Math.pow(10, (PEAK_DB - 0.3) / 20).toFixed(4)}:level=disabled`, '-ar', '48000', wav]);
  const m1 = loudness(wav);
  console.log(`громкость: ${m0.I} → ${m1.I} LUFS, пик ${m1.peak} dBFS`);
  if (process.argv.includes('--audio-only')) { fs.copyFileSync(wav, out.replace(/\.mp4$/, '.wav')); await browser.close(); srv.close(); return; }

  const n = Math.round(dur * fps);
  console.log(`рисую ${n} кадров (${fps} к/с)…`);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-', '-i', wav,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const stage = await page.$('#stage');
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    await page.evaluate((x) => window.__ad.render(x), i / fps);
    const buf = await stage.screenshot({ type: 'png' });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 24 === 0) console.log(`  ${i}/${n}  ${((Date.now() - t0) / 1000).toFixed(0)} с`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  if (errors.filter((e) => !/ERR_FAILED/.test(e)).length) console.log('ОШИБКИ:\n' + errors.join('\n'));
  await browser.close(); srv.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('готово: ' + out);
})().catch((e) => { console.error(e); process.exit(1); });
